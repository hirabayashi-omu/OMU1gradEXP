/**
 * drum_simulation.js
 * Single Large Textile Cloth Sheet DEM Simulation for Rotary Laundry Dryer.
 * Simulates true flexible fabric physics:
 * - High tensile stiffness + ZERO compressive stiffness (folds, wrinkles, crumples into a ball)
 * - 38cm x 38cm large bath towel (fits realistically in 58cm drum)
 * - 3 Lifters scooping, lifting, and billowing airborne drop
 * - Dynamic untangling ratio eta(t) & effective drying area A_eff(t)
 */

    // =========================================================================
  // 坂口善行氏 博士論文『布の力学的特性を用いた衣服形状の動的計算法』に基づくKES布力学特性
  // 川端評価システム (KES: Kawabata Evaluation System) の主要測定力学パラメータ:
  // - B: 曲げ剛性 (Bending Rigidity) [gf・cm^2/cm]
  // - 2HB: 曲げヒステリシス幅 (Bending Hysteresis) [gf・cm/cm] - 糸間摩擦による折り目定着
  // - G: せん断剛性 (Shear Rigidity) [gf/(cm・deg)]
  // - 2HG: せん断ヒステリシス幅 (Shear Hysteresis) [gf/cm] - せん断変形の残留
  // - t: 生地厚み [mm], W: 単位面積質量 [mg/cm^2]
  // =========================================================================
  const FABRIC_PRESETS = {
    cotton_towel: {
      id: 'cotton_towel',
      name: '綿バスタオル (厚手パイル)',
      thickness: 2.8, // mm
      mass: 3.0, // kg
      B: 0.12, // gf・cm^2/cm (しなやかで適度なコシ)
      twoHB: 0.09, // gf・cm/cm (濡れるとヒステリシス増大・団子化)
      G: 0.85, // gf/(cm・deg)
      twoHG: 1.60, // gf/cm
      anisotropy: 1.15, // 経糸/緯糸 剛性比
      elasticityMult: 0.90,
      viscosityMult: 1.30,
      yieldEase: 1.20,
      adhesionMult: 1.30,
      color: { r: 245, g: 248, b: 255 }
    },
    cotton_tshirt: {
      id: 'cotton_tshirt',
      name: '綿Tシャツ / 肌着 (薄手ソフト天竺)',
      thickness: 1.2, // mm
      mass: 2.2, // kg
      B: 0.045, // 低曲げ剛性 (非常にドレープ性が高い)
      twoHB: 0.035, //
      G: 0.55,
      twoHG: 1.05,
      anisotropy: 1.08,
      elasticityMult: 0.70,
      viscosityMult: 1.10,
      yieldEase: 1.40,
      adhesionMult: 1.15,
      color: { r: 235, g: 240, b: 250 }
    },
    polyester_sport: {
      id: 'polyester_sport',
      name: '化繊スポーツウェア (ポリエステル速乾)',
      thickness: 0.9, // mm
      mass: 1.8, // kg
      B: 0.14, // 高い弾性復元力 (コシあり、しわになりにくい)
      twoHB: 0.04, // 低ヒステリシス (形状復元大)
      G: 1.25,
      twoHG: 0.85,
      anisotropy: 1.05,
      elasticityMult: 1.25,
      viscosityMult: 0.85,
      yieldEase: 0.70,
      adhesionMult: 0.55,
      color: { r: 195, g: 230, b: 255 }
    },
    denim_jeans: {
      id: 'denim_jeans',
      name: '厚手デニム / ジーンズ (高剛性綾織)',
      thickness: 3.4, // mm
      mass: 3.8, // kg
      B: 0.38, // 高曲げ剛性 (強いコシ)
      twoHB: 0.32, // 極大ヒステリシス (一度折れ曲がると強いしわが定着)
      G: 2.80,
      twoHG: 4.20,
      anisotropy: 1.35, // 綾織特有の強い異方性
      elasticityMult: 1.55,
      viscosityMult: 1.40,
      yieldEase: 1.10,
      adhesionMult: 1.20,
      color: { r: 180, g: 200, b: 235 }
    },
    fleece_blanket: {
      id: 'fleece_blanket',
      name: 'フリース / 毛布 (極厚・バルキー起毛)',
      thickness: 4.5, // mm
      mass: 3.5, // kg
      B: 0.22,
      twoHB: 0.12,
      G: 0.95,
      twoHG: 1.90,
      anisotropy: 1.05,
      elasticityMult: 1.10,
      viscosityMult: 1.45,
      yieldEase: 0.85,
      adhesionMult: 0.80,
      color: { r: 250, g: 245, b: 240 }
    }
  };

  class SingleClothSheet {
  constructor(spec = {}) {
    this.presetKey = spec.presetKey || 'cotton_towel';
    this.fabricConfig = Object.assign({}, FABRIC_PRESETS[this.presetKey] || FABRIC_PRESETS.cotton_towel, spec);
    
    this.name = this.fabricConfig.name;
    this.color = this.fabricConfig.color;
    this.thickness = this.fabricConfig.thickness || 2.8;
    this.B = this.fabricConfig.B || 0.12; // KES曲げ剛性
    this.twoHB = this.fabricConfig.twoHB || 0.09; // KES曲げヒステリシス
    this.G = this.fabricConfig.G || 0.85; // KESせん断剛性
    this.twoHG = this.fabricConfig.twoHG || 1.60; // KESせん断ヒステリシス
    this.anisotropy = this.fabricConfig.anisotropy || 1.15;
    
    this.elasticityMult = this.fabricConfig.elasticityMult || 1.0;
    this.viscosityMult = this.fabricConfig.viscosityMult || 1.0;
    this.yieldEase = this.fabricConfig.yieldEase || 1.0;
    this.adhesionMult = this.fabricConfig.adhesionMult || 1.0;
    
    // High-Resolution Fabric Particle Mesh: 21 x 21 = 441 nodes (400 smooth quad patches)
    this.nx = 21;
    this.ny = 21;
    this.totalWidth = 0.384; // 38.4cm wide
    this.totalHeight = 0.384; // 38.4cm long
    this.restDist = this.totalWidth / (this.nx - 1); // ~19.2mm fine resolution!
    this.flatNominalArea = this.totalWidth * this.totalHeight;
    
    this.totalMass = this.fabricConfig.mass || spec.mass || 3.0;
    this.nodeMass = this.totalMass / (this.nx * this.ny);
    // Node radius scaled for high-density 19.2mm spacing
    this.nodeRadius = 0.0045 + this.thickness * 0.0011;
    
    this.nodes = [];
    this.structuralLinks = [];
    this.shearLinks = [];
    this.bendingLinks = [];
    
    this.initMesh();
    this.untangleRatio = 0.45;
    this.currentStateText = 'ドラム底部・団子もみほぐし中';
  }
  
  initMesh() {
    this.nodes = [];
    this.structuralLinks = [];
    this.shearLinks = [];
    this.bendingLinks = [];
    
    // Start cloth gathered naturally at the lower drum area
    const startCx = 0.0;
    const startCy = 0.14; // lower drum quadrant
    
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        // Initial soft wave draping fold
        const x = startCx + (i - (this.nx - 1) / 2) * this.restDist * 0.72;
        const y = startCy + (j - (this.ny - 1) / 2) * this.restDist * 0.52 + Math.sin(i * 0.7) * 0.012;
        this.nodes.push({
          x: x,
          y: y,
          oldX: x,
          oldY: y,
          vx: 0,
          vy: 0,
          radius: this.nodeRadius,
          mass: this.nodeMass,
          isAirborne: false,
          curvature: 0
        });
      }
    }
    
    const getIdx = (i, j) => j * this.nx + i;
    
    // 1. 1st-neighbor structural constraints (Weft and Warp threads)
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        if (i < this.nx - 1) {
          this.structuralLinks.push({ p1: getIdx(i, j), p2: getIdx(i + 1, j), dist: this.restDist, currentDist: this.restDist });
        }
        if (j < this.ny - 1) {
          this.structuralLinks.push({ p1: getIdx(i, j), p2: getIdx(i, j + 1), dist: this.restDist, currentDist: this.restDist });
        }
      }
    }
    
    // 2. Diagonal shear constraints (Supple bias flex)
    for (let j = 0; j < this.ny - 1; j++) {
      for (let i = 0; i < this.nx - 1; i++) {
        const diag = Math.hypot(this.restDist, this.restDist);
        this.shearLinks.push({ p1: getIdx(i, j), p2: getIdx(i + 1, j + 1), dist: diag });
        this.shearLinks.push({ p1: getIdx(i + 1, j), p2: getIdx(i, j + 1), dist: diag });
      }
    }
    
    // 3. 2nd-neighbor bending links: provides elastic flexural stiffness (保形性)
    // with elasto-plastic yield threshold (重力・圧縮降伏によるまるまり)
    const bendDist = this.restDist * 2.0; // 64mm
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        if (i < this.nx - 2) {
          this.bendingLinks.push({
            p1: getIdx(i, j),
            p2: getIdx(i + 2, j),
            origRest: bendDist,
            currentRest: bendDist
          });
        }
        if (j < this.ny - 2) {
          this.bendingLinks.push({
            p1: getIdx(i, j),
            p2: getIdx(i, j + 2),
            origRest: bendDist,
            currentRest: bendDist
          });
        }
      }
    }
  }

  setFabricPreset(presetKey) {
    if (FABRIC_PRESETS[presetKey]) {
      this.presetKey = presetKey;
      this.setFabricParameters(FABRIC_PRESETS[presetKey]);
    }
  }
  
  setFabricParameters(params = {}) {
    if (params.name) this.name = params.name;
    if (params.color) this.color = params.color;
    if (params.thickness !== undefined) {
      this.thickness = params.thickness;
      this.nodeRadius = 0.0045 + this.thickness * 0.0011;
    }
    if (params.B !== undefined) this.B = params.B;
    if (params.twoHB !== undefined) this.twoHB = params.twoHB;
    if (params.G !== undefined) this.G = params.G;
    if (params.twoHG !== undefined) this.twoHG = params.twoHG;
    if (params.anisotropy !== undefined) this.anisotropy = params.anisotropy;
    if (params.mass !== undefined) {
      this.totalMass = params.mass;
      this.nodeMass = this.totalMass / (this.nx * this.ny);
      for (const p of this.nodes) p.mass = this.nodeMass;
    }
    if (params.elasticityMult !== undefined) this.elasticityMult = params.elasticityMult;
    if (params.viscosityMult !== undefined) this.viscosityMult = params.viscosityMult;
    if (params.yieldEase !== undefined) this.yieldEase = params.yieldEase;
    if (params.adhesionMult !== undefined) this.adhesionMult = params.adhesionMult;
  }
  
  updatePhysics(sdt, g, drumRadius, drumAngle, omega, lifters, simTime, currentMoisture = 0.75) {
    // 1. Chemical Engineering Moisture Phase Coupling (化学工学的水分相連成)
    // - 恒率乾燥期 (X >= Xc, 自由水あり): 表面に自由水膜が存在するため力学的挙動 (濡れ重量・吸着・降伏) は一定不変！
    // - 減率乾燥期 (X < Xc, 結合水脱着期): 表面自由水が消失し、繊維内結合水が減少するにつれて力学挙動が滑らかに変化
    const Xc = 0.25; // 限界含水率 (kg-水/kg-乾布)
    const Xe = 0.035; // 平衡含水率
    
    // 結合水減少率 w_bound: X >= Xc では 1.0 (一定), X < Xc では 1.0 -> 0.0 に減少
    const boundWaterRatio = (currentMoisture >= Xc) 
      ? 1.0 
      : Math.min(1.0, Math.max(0.0, (currentMoisture - Xe) / (Xc - Xe)));
    
    // 自由水有無フラグ
    const hasFreeWater = (currentMoisture >= Xc);
    
    // Effective mass & gravity:
    // 自由水がある間は濡れ布の重量 (~1.55x) をキープ、結合水が減ると乾布質量 (~1.0x) へ
    const effectiveGravityFactor = 1.0 + Math.min(Xc, currentMoisture) * 0.85 + (hasFreeWater ? (currentMoisture - Xc) * 0.45 : 0.0);
    const gEffective = g * effectiveGravityFactor;
    
    // Centrifugal acceleration kinematics (ドラム回転遠心力)
    const omega2 = omega * omega;
    const centrifugalG = (omega2 * drumRadius) / g;
    
    // Natural fabric damping (空気抵抗・粘性):
    // 自由水がある間は一定のしっとりダンピング、乾燥完了時は軽やかに舞う 0.982
    const damping = 0.982 - 0.007 * boundWaterRatio;
    
    // Gradual Yielding Parameters (自由水・結合水連成)
    // 自由水があるうちは降伏しやすさ一定。結合水脱着に伴い、ふんわりとした綿本来のしなやかさに移行
    const yieldStrainThreshold = Math.max(0.11, (0.22 - 0.10 * boundWaterRatio) / this.yieldEase);
    const yieldFlowRate = (0.018 + 0.025 * boundWaterRatio) * this.yieldEase;
    
    // 最後の乾燥状態での最小圧縮クリアランス:
    // パキパキに突っ張らず、ふっくらと自然に曲がれるよう適度な余裕を持たせる
    // 遠心圧縮によるバルク厚みのつぶれ低減
    const crushDef = (omega2 * drumRadius / 9.81) * 0.08 * (1.0 + 0.5 * boundWaterRatio);
    const thicknessBulkFactor = Math.max(0.50, 0.65 + (this.thickness / 3.0) * 0.08 - crushDef);
    const minCompressLimit = this.restDist * Math.max(0.52, thicknessBulkFactor - 0.12 * boundWaterRatio);
    const recoveryRate = (0.020 - 0.012 * boundWaterRatio) * this.elasticityMult;
    
    // 1. Verlet integration + Moisture-Coupled Gravity + Centrifugal Force & Crushing
    // 遠心力による生地の挙動とつぶれ:
    // ドラム回転に伴い外向き遠心力 a_c = omega^2 * r が作用。
    // 濡れている時 (boundWaterRatio ~ 1) は重たい水分のため遠心力圧迫が最大1.6倍に増大し、
    // 槽壁に押し付けられて生地の厚み・粒子間隔がギュッと圧縮つぶれ (Centrifugal Crushing) を起こす。
    
    for (const p of this.nodes) {
      const r = Math.hypot(p.x, p.y) || 1e-6;
      
      // Calculate effective centrifugal acceleration:
      // Nodes moving with drum wall feel full centrifugal acceleration outward
      const wallContactRatio = Math.max(0, (r - drumRadius * 0.70) / (drumRadius * 0.30));
      const effectiveOmega = omega * (p.isAirborne ? 0.35 : (0.75 + 0.25 * wallContactRatio));
      const aCentrifugalX = (effectiveOmega * effectiveOmega) * p.x;
      const aCentrifugalY = (effectiveOmega * effectiveOmega) * p.y;
      
      // Velocity with natural damping
      let vx = (p.x - p.oldX) * damping;
      let vy = (p.y - p.oldY) * damping;
      
      // Gravity + Centrifugal Acceleration
      vy += gEffective * sdt * sdt;
      vx += aCentrifugalX * sdt * sdt;
      vy += aCentrifugalY * sdt * sdt;
      
      // Aerodynamic billowing / flutter only when active tumbling in airflow
      // ドラムが回転中かつ空中に浮いている時のみ気流のフラッター(煽り)を付与。
      // ドラム静止時 (|omega| < 0.2) や布が静止している時はフラッターをゼロにしてプルプル震えを根絶
      const isDrumSpinning = Math.abs(omega) > 0.2;
      if (p.isAirborne && isDrumSpinning) {
        const airCatch = 1.0 - 0.45 * boundWaterRatio;
        vx += Math.sin(simTime * 8.5 + p.y * 22.0) * 0.00022 * airCatch;
        vy *= (0.980 + 0.010 * boundWaterRatio);
      }
      
      // Resting stabilization & Micro-jitter Quenching (静止微小振動の吸収)
      // 底に落ち着いた布が微小な数値誤差でプルプル震え続けるのを防ぐ完全ダンピング
      const vMag2 = (vx * vx + vy * vy) / (sdt * sdt);
      if (vMag2 < 0.00004) { // speed < 0.006 m/s
        vx *= 0.60;
        vy *= 0.60;
        if (vMag2 < 0.000004) { // speed < 0.002 m/s
          vx = 0;
          vy = 0;
        }
      }
      
      p.oldX = p.x;
      p.oldY = p.y;
      p.x += vx;
      p.y += vy;
      p.vx = vx / sdt;
      p.vy = vy / sdt;
      
      // Centrifugal crushing factor (遠心力による厚み・面方向のつぶれ度合い)
      // High RPM + High Moisture + High Radius = Maximum Crushing against drum wall
      p.centrifugalCrush = Math.min(1.0, (effectiveOmega * effectiveOmega * r / 9.81) * (0.65 + 0.45 * boundWaterRatio));
    }
    
    // 2. Gradual Viscoplastic Distance Adaptation (粒子間距離の漸進的降伏と回復)
    // Heavy wet cloth yields gradually under bottom clump gravity pressure
    for (const link of this.structuralLinks) {
      const p1 = this.nodes[link.p1];
      const p2 = this.nodes[link.p2];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1e-6;
      
      const isClumped = (!p1.isAirborne && !p2.isAirborne && (p1.y > drumRadius * 0.05 || p2.y > drumRadius * 0.05));
      const strain = (link.dist - dist) / link.dist;
      
      if (isClumped && strain > yieldStrainThreshold) {
        // Yield gradually (徐々に降伏して自然長が縮まり、しわ・団子が定着)
        const targetDist = Math.max(minCompressLimit, dist);
        link.currentDist = link.currentDist * (1.0 - yieldFlowRate) + targetDist * yieldFlowRate;
      } else if (p1.isAirborne || p2.isAirborne || strain < 0.05) {
        // Elastic recovery when airborne or under tension (ほぐれ・復元)
        link.currentDist = link.currentDist * (1.0 - recoveryRate) + link.dist * recoveryRate;
      }
    }
    
    // 2nd-Neighbor Bending Links Gradual Yielding
    for (const link of this.bendingLinks) {
      const p1 = this.nodes[link.p1];
      const p2 = this.nodes[link.p2];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1e-6;
      
      const isClumped = (!p1.isAirborne && !p2.isAirborne && (p1.y > drumRadius * 0.05 || p2.y > drumRadius * 0.05));
      const bendStrain = (link.origRest - dist) / link.origRest;
      const bendMinLimit = link.origRest * (0.64 - 0.16 * boundWaterRatio);
      
      if (isClumped && bendStrain > (yieldStrainThreshold * 1.1)) {
        const targetBend = Math.max(bendMinLimit, dist);
        link.currentRest = link.currentRest * (1.0 - yieldFlowRate * 0.9) + targetBend * (yieldFlowRate * 0.9);
      } else if (p1.isAirborne || p2.isAirborne || bendStrain < 0.10) {
        link.currentRest = link.currentRest * (1.0 - recoveryRate) + link.origRest * recoveryRate;
      }
    }
    
    // 3. Position-Based Dynamics Solver Iterations
    const numBaffles = 3;
    const baffleMaxH = 0.022; // 22mm gentle elevation
    const baffleHalfWidth = 0.28; // ~16 deg half width
    
    const iterations = 6;
    const minNodeDist = this.nodeRadius * (1.90 - 0.25 * boundWaterRatio); // clearance clamped by moisture
    const minNodeDist2 = minNodeDist * minNodeDist;
    
    // Capillary Wall Adhesion (含水率に応じた壁面吸着 - 自由水連成)
    // - High moisture (wet): thin water film creates strong capillary suction & adhesive friction,
    //   causing the wet cloth to stick tightly to the stainless drum wall and ride up to high angles (100-130 deg)
    // - Low moisture (dry): zero capillary suction, low friction, slides off smoothly at low angles (40-60 deg)
    // 槽壁吸着チューニング: ちょうど半周(約150°〜180°・頂点付近)までしっかり張り付いて持ち上がり、
    // 頂点を越えて自重で美しく弧を描いてカスケード落下する最適バランス
    const adhesionZone = 0.013; // 13mm suction band
    const freeWaterAdhesion = hasFreeWater ? 0.95 : Math.pow(boundWaterRatio, 1.6) * 0.85;
    // しっかり半周持ち上げる同期グリップ摩擦
    const maxStickFriction = Math.min(0.90, (0.46 + 0.42 * freeWaterAdhesion) * this.adhesionMult);
    const capillarySuctionStrength = 0.58 * freeWaterAdhesion; // normal pulling strength toward drum wall
    
    const resolveWallCollision = (p) => {
      const px = p.x;
      const py = p.y;
      const dist = Math.hypot(px, py) || 1e-6;
      const nodeAngle = Math.atan2(py, px);
      
      let bumpH = 0;
      let bumpSlope = 0;
      for (let b = 0; b < numBaffles; b++) {
        const bAngle = drumAngle + (b * 2 * Math.PI) / numBaffles;
        let diff = nodeAngle - bAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        
        if (Math.abs(diff) < baffleHalfWidth) {
          const u = (diff / baffleHalfWidth) * (Math.PI * 0.5);
          const cosU = Math.cos(u);
          const sinU = Math.sin(u);
          const h = baffleMaxH * cosU * cosU;
          if (h > bumpH) {
            bumpH = h;
            bumpSlope = -baffleMaxH * (Math.PI / baffleHalfWidth) * cosU * sinU;
          }
        }
      }
      
      const effectiveWallR = drumRadius - bumpH - this.nodeRadius;
      
      if (dist >= effectiveWallR) {
        // Direct contact with drum wall or gentle wave baffle
        const nx = px / dist;
        const ny = py / dist;
        p.x = nx * effectiveWallR;
        p.y = ny * effectiveWallR;
        
        const vWallX = -omega * p.y;
        const vWallY =  omega * p.x;
        const slopePush = bumpSlope * (omega >= 0 ? 0.0025 : -0.0025);
        
        // Wet fabric sticks tightly with high adhesive traction (ドラム回転に吸着同期)
        p.oldX = p.x - (vWallX + nx * slopePush) * sdt * maxStickFriction;
        p.oldY = p.y - (vWallY + ny * slopePush) * sdt * maxStickFriction;
        p.isAirborne = false;
        // 半周(180度)持ち上げ: 頂点を越えて自重モーメントが遠心力を上回るまでしっかり吸着維持
        p.isStuckToWall = (p.y > -drumRadius * 0.82) || hasFreeWater || (boundWaterRatio > 0.35);
        return (bumpH > baffleMaxH * 0.25);
      } else if (dist > effectiveWallR - adhesionZone && p.isStuckToWall && (hasFreeWater || boundWaterRatio > 0.25)) {
        // Capillary Water Film Suction: pulls near-wall wet nodes back against the wall (毛細管吸着力)
        const suction = capillarySuctionStrength * 0.45;
        const nx = px / dist;
        const ny = py / dist;
        p.x += nx * (effectiveWallR - dist) * suction;
        p.y += ny * (effectiveWallR - dist) * suction;
        
        const vWallX = -omega * p.y;
        const vWallY =  omega * p.x;
        p.oldX = p.x - vWallX * sdt * maxStickFriction;
        p.oldY = p.y - vWallY * sdt * maxStickFriction;
        p.isAirborne = false;
        return false;
      } else {
        p.isStuckToWall = false;
        if (dist < drumRadius * 0.75 || p.y < -0.03) {
          p.isAirborne = true;
        } else {
          p.isAirborne = false;
        }
        return false;
      }
    };
    
    let liftedNodes = 0;
    let airborneNodes = 0;
    
    for (let iter = 0; iter < iterations; iter++) {
      // (1) Structural links with adaptive gradual yielded reference distance
      for (const link of this.structuralLinks) {
        const p1 = this.nodes[link.p1];
        const p2 = this.nodes[link.p2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        
        if (dist > link.dist) {
          // Tensile limit
          const diff = (dist - link.dist) / dist;
          const ox = dx * 0.5 * 0.95 * diff;
          const oy = dy * 0.5 * 0.95 * diff;
          p1.x += ox;
          p1.y += oy;
          p2.x -= ox;
          p2.y -= oy;
        } else if (dist < link.currentDist) {
          // Soft, low-elasticity compliance (変形弾性を弱め、しなやかに受け止める)
          const diff = (link.currentDist - dist) / dist;
          // しなやかで柔らかい圧縮適応 (乾燥時でもパキパキ剛体化せず、ふんわりドレープ)
          const kComp = (0.35 + 0.08 * (1.0 - boundWaterRatio)) * this.elasticityMult;
          const ox = dx * 0.5 * kComp * diff;
          const oy = dy * 0.5 * kComp * diff;
          p1.x -= ox;
          p1.y -= oy;
          p2.x += ox;
          p2.y += oy;
        }
      }
      
      // (2) Diagonal Shear Links with Sakaguchi KES Shear-Hysteresis Model
      // 坂口モデル: せん断力 Fs = G * theta +/- HG による交差糸間摩擦抵抗
      const kesG_effective = (this.G * 0.40) * this.elasticityMult;
      const minShear = this.shearLinks[0] ? this.shearLinks[0].dist * (0.72 - 0.06 * boundWaterRatio) : 0.033;
      
      for (const link of this.shearLinks) {
        const p1 = this.nodes[link.p1];
        const p2 = this.nodes[link.p2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        
        if (dist > link.dist * 1.12) {
          const diff = (dist - link.dist * 1.12) / dist;
          const ox = dx * 0.5 * (0.35 + kesG_effective * 0.2) * diff;
          const oy = dy * 0.5 * (0.35 + kesG_effective * 0.2) * diff;
          p1.x += ox;
          p1.y += oy;
          p2.x -= ox;
          p2.y -= oy;
        } else if (dist < minShear) {
          const diff = (minShear - dist) / dist;
          const ox = dx * 0.5 * 0.42 * diff;
          const oy = dy * 0.5 * 0.42 * diff;
          p1.x -= ox;
          p1.y -= oy;
          p2.x += ox;
          p2.y += oy;
        }
      }
      
      // (3) 2nd-Neighbor Bending Links with Sakaguchi KES Bending-Hysteresis Model
      // 坂口モデル: 曲げモーメント M = B * kappa +/- HB による残留曲率・しわ定着
      // 往路(曲げ)と復路(除荷)でヒステリシス 2HB のエネルギー散逸が生じ、自然な折り目が定着する
      // 坂口モデルKES曲げ剛性 (乾燥時にパキパキにならず、しっとりふんわり曲がる)
      const kesB_effective = (this.B * 1.0) * (0.85 + 0.20 * (1.0 - boundWaterRatio)) * this.elasticityMult;
      const kesHB_effective = (this.twoHB * 0.4) * (1.0 + 0.50 * boundWaterRatio) * this.yieldEase;
      
      for (const link of this.bendingLinks) {
        const p1 = this.nodes[link.p1];
        const p2 = this.nodes[link.p2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        
        // Curvature kappa ~ (link.origRest - dist) / link.origRest
        const curKappa = (link.origRest - dist) / link.origRest;
        const prevKappa = link.prevKappa || 0;
        const dKappa = curKappa - prevKappa;
        link.prevKappa = curKappa;
        
        // Smooth continuous hysteresis transition (静止時の符号チャタリング・プルプル震えを完全根絶)
        // 微小曲率変化 (|dKappa| < 0.001) ではヒステリシスオフセットが滑らかに0へ遷移し、高周波反復加振を防ぐ
        const hystScale = Math.tanh(dKappa / 0.005);
        const hystOffset = hystScale * (kesHB_effective / (kesB_effective + 1e-4)) * 0.22;
        
        // Target distance with hysteresis residual strain (しわ・残留折り目の保持)
        const targetBendDist = Math.max(link.origRest * 0.55, link.currentRest - hystOffset * link.origRest);
        
        if (dist < targetBendDist) {
          const diff = (targetBendDist - dist) / dist;
          const kFlex = Math.min(0.20, Math.max(0.08, kesB_effective * 0.95)); // soft, natural textile bend
          const ox = dx * 0.5 * kFlex * diff;
          const oy = dy * 0.5 * kFlex * diff;
          p1.x -= ox;
          p1.y -= oy;
          p2.x += ox;
          p2.y += oy;
        }
      }
      
      // (4) Ultra-Fast Spatial Hash Self-Collision (441 Nodes 60FPS Optimization)
      // 文字列生成・Set割り当てを完全排除した超高速整数インデックスバケット
      if (iter === 0 || iter === 3) {
        const cellSize = 0.032; // 32mm cell
        const invCell = 1.0 / cellSize;
        const grid = new Map();
        
        for (let a = 0; a < this.nodes.length; a++) {
          const na = this.nodes[a];
          const cx = Math.floor(na.x * invCell) + 30;
          const cy = Math.floor(na.y * invCell) + 30;
          const key = (cx << 8) | cy;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(a);
        }
        
        for (let a = 0; a < this.nodes.length; a++) {
          const na = this.nodes[a];
          const cx = Math.floor(na.x * invCell) + 30;
          const cy = Math.floor(na.y * invCell) + 30;
          
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const key = ((cx + ox) << 8) | (cy + oy);
              const bucket = grid.get(key);
              if (!bucket) continue;
              
              for (let i = 0; i < bucket.length; i++) {
                const b = bucket[i];
                if (b <= a) continue; // guarantees unique pair without Set!
                
                const nb = this.nodes[b];
                const ddx = nb.x - na.x;
                const ddy = nb.y - na.y;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < minNodeDist2 && d2 > 1e-8) {
                  const d = Math.sqrt(d2);
                  const push = (minNodeDist - d) / d * 0.5 * 0.50;
                  const pox = ddx * push;
                  const poy = ddy * push;
                  na.x -= pox;
                  na.y -= poy;
                  nb.x += pox;
                  nb.y += poy;
                }
              }
            }
          }
        }
      }
      
      // (5) Project nodes to drum boundary
      for (const p of this.nodes) {
        resolveWallCollision(p);
      }
    }
    
    // Final check for airborne and lifted counts
    liftedNodes = 0;
    airborneNodes = 0;
    for (const p of this.nodes) {
      if (p.isAirborne) airborneNodes++;
      const isLift = resolveWallCollision(p);
      if (isLift) liftedNodes++;
    }
    
    // 4. Calculate Dynamic Untangling Ratio (ほぐし度) & Effective Surface Area
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of this.nodes) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    
    const spanW = maxX - minX;
    const spanH = maxY - minY;
    const currentSpanArea = spanW * spanH;
    const areaRatio = currentSpanArea / Math.max(1e-4, this.flatNominalArea);
    
    const airFrac = airborneNodes / this.nodes.length;
    const isLifted = (liftedNodes > this.nodes.length * 0.12);
    
    // When crumpled in clump: areaRatio ~ 0.25 - 0.35
    // When airborne / billowing: areaRatio ~ 0.85 - 1.05
    const rawUntangle = Math.min(1.0, Math.max(0.22, areaRatio * 0.70 + airFrac * 0.40));
    this.untangleRatio = this.untangleRatio * 0.88 + rawUntangle * 0.12;
    
    if (airFrac > 0.38 && !isLifted) {
      this.currentStateText = '空中展開・ほぐし落下中 (熱風曝露大)';
    } else if (isLifted) {
      this.currentStateText = '波型バッフル・槽内凹凸リフト中';
    } else {
      this.currentStateText = 'ドラム底部・団子もみほぐし中';
    }
  }
  
  resolveLifterContact() {
    // Deprecated: sharp lifter hooks are replaced by smooth continuous wave baffles & dimples
    return false;
  }
  
  draw(ctx, scale, currentMoisture) {
    // Wet: deeper color & moisture sheen; Dry: fluffy thick cotton white/soft pastel
    const wetDarken = 0.58 + 0.42 * (1.0 - Math.min(1.0, currentMoisture / 0.75));
    const r = Math.floor(this.color.r * wetDarken);
    const g = Math.floor(this.color.g * wetDarken);
    const b = Math.floor(this.color.b * wetDarken);
    
    const getIdx = (i, j) => j * this.nx + i;
    
    // Calculate curvature per node for plush thickness shading
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const node = this.nodes[getIdx(i, j)];
        let foldScore = 0;
        let count = 0;
        if (i > 0 && i < this.nx - 1) {
          const left = this.nodes[getIdx(i - 1, j)];
          const right = this.nodes[getIdx(i + 1, j)];
          const dSpan = Math.hypot(right.x - left.x, right.y - left.y);
          foldScore += (this.restDist * 2.0 - dSpan) / (this.restDist * 2.0);
          count++;
        }
        if (j > 0 && j < this.ny - 1) {
          const up = this.nodes[getIdx(i, j - 1)];
          const down = this.nodes[getIdx(i, j + 1)];
          const dSpan = Math.hypot(down.x - up.x, down.y - up.y);
          foldScore += (this.restDist * 2.0 - dSpan) / (this.restDist * 2.0);
          count++;
        }
        node.curvature = count > 0 ? Math.max(0, foldScore / count) : 0;
      }
    }
    
    // Draw all 12 x 12 quad patches with elasto-plastic thickness depth
    for (let j = 0; j < this.ny - 1; j++) {
      for (let i = 0; i < this.nx - 1; i++) {
        const p00 = this.nodes[getIdx(i, j)];
        const p10 = this.nodes[getIdx(i + 1, j)];
        const p11 = this.nodes[getIdx(i + 1, j + 1)];
        const p01 = this.nodes[getIdx(i, j + 1)];
        
        ctx.beginPath();
        ctx.moveTo(p00.x * scale, p00.y * scale);
        ctx.lineTo(p10.x * scale, p10.y * scale);
        ctx.lineTo(p11.x * scale, p11.y * scale);
        ctx.lineTo(p01.x * scale, p01.y * scale);
        ctx.closePath();
        
        // Realistic towel pile shading based on cell distortion/wrinkle
        const diag1 = Math.hypot(p11.x - p00.x, p11.y - p00.y);
        const avgCurv = (p00.curvature + p10.curvature + p11.curvature + p01.curvature) * 0.25;
        // Deep shadow in plastic folds/creases, bright highlight on curved crests (plush thick towel look)
        const foldShade = Math.max(0.68, Math.min(1.24, 0.90 + (diag1 / (this.restDist * 1.414)) * 0.24 - avgCurv * 0.32));
        
        ctx.fillStyle = `rgb(${Math.floor(r * foldShade)}, ${Math.floor(g * foldShade)}, ${Math.floor(b * foldShade)})`;
        ctx.fill();
        
        // Subtle yarn weave grid line
        ctx.strokeStyle = `rgba(${Math.max(0, r - 35)}, ${Math.max(0, g - 35)}, ${Math.max(0, b - 35)}, 0.35)`;
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
    }
    
    // Draw outer towel hem border
    ctx.beginPath();
    for (let i = 0; i < this.nx; i++) {
      const pt = this.nodes[getIdx(i, 0)];
      if (i === 0) ctx.moveTo(pt.x * scale, pt.y * scale);
      else ctx.lineTo(pt.x * scale, pt.y * scale);
    }
    for (let j = 1; j < this.ny; j++) {
      const pt = this.nodes[getIdx(this.nx - 1, j)];
      ctx.lineTo(pt.x * scale, pt.y * scale);
    }
    for (let i = this.nx - 2; i >= 0; i--) {
      const pt = this.nodes[getIdx(i, this.ny - 1)];
      ctx.lineTo(pt.x * scale, pt.y * scale);
    }
    for (let j = this.ny - 2; j >= 0; j--) {
      const pt = this.nodes[getIdx(0, j)];
      ctx.lineTo(pt.x * scale, pt.y * scale);
    }
    ctx.closePath();
    ctx.strokeStyle = (currentMoisture > 0.25) ? 'rgba(56, 189, 248, 0.75)' : 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Droplet highlights when wet with free water
    if (currentMoisture > 0.25) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
      for (let n = 0; n < this.nodes.length; n += 7) {
        const pt = this.nodes[n];
        ctx.beginPath();
        ctx.arc(pt.x * scale, pt.y * scale, 2.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
}

class LaundryDrumSimulation {
    setRpm(newRpm) {
    this.rpm = Math.max(15, Math.min(90, newRpm));
    this.baseOmega = (this.rpm * 2 * Math.PI) / 60.0;
    if (this.tumbleState === 'CW') this.omega = this.baseOmega;
    else if (this.tumbleState === 'CCW') this.omega = -this.baseOmega;
    else this.omega = 0;
  }

  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Drum Geometry
    this.drumRadius = 0.29; // 580mm diameter
    this.drumDepth = 0.35; // 350mm depth
    this.drumTiltAngle = 10 * (Math.PI / 180);
    this.drumAngle = 0;
    
    // Tumbling Kinematics (50 RPM)
    this.rpm = 50;
    this.baseOmega = (this.rpm * 2 * Math.PI) / 60.0;
    this.omega = this.baseOmega;
    this.tumbleState = 'CW';
    this.stateTimer = 0;
    
    // Domestic Washing Machine Drum: Gentle wave baffles & embossed dimples (爪ではなく槽内凹凸)
    this.numBaffles = 3;
    this.baffleHeight = 0.022; // 22mm gentle wave elevation (no claws/hooks)
    
    // State
    this.time = 0;
    this.isRunning = false;
    this.speedMultiplier = 30.0;
    
    // Drying parameters
    this.dryingMode = 'HeatPump';
    this.T_air_inlet = 338.15; // 65 C
    this.wetBulbTemp = 311.15; // 38 C
    this.humidity_air = 0.15;
    
    this.totalDryMass = 3.0; // kg
    this.nominalDryingArea = 1.20; // m^2
    this.effectiveArea = 0.60;
    this.effectiveAreaRatio = 0.50; // untangling factor
    
    this.criticalMoisture = 0.25;
    this.equilibriumMoisture = 0.035;
    this.currentMoisture = 0.75;
    this.freeWater = 0.50;
    this.boundWater = 0.25;
    this.clothesTemp = 308.15;
    this.dryingRate = 0;
    this.dryingPeriod = 'ConstantRate';
    
    // Single Large Cloth Sheet
    this.clothSheet = new SingleClothSheet({ mass: this.totalDryMass });
    
    this.history = [];
    this.maxHistoryLength = 200;
    
    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
  }
  
  initCanvasSize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, 580);
    this.canvas.width = size * window.devicePixelRatio;
    this.canvas.height = size * window.devicePixelRatio;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    
    this.scale = (this.canvas.width * 0.43) / this.drumRadius;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }
  
  initClothSheets() {
    this.clothSheet = new SingleClothSheet({ mass: this.totalDryMass });
  }
  
  setDryingMode(mode) {
    this.dryingMode = mode;
    if (mode === 'HeatPump') {
      this.T_air_inlet = 338.15;
      this.wetBulbTemp = 311.15;
    } else {
      this.T_air_inlet = 358.15;
      this.wetBulbTemp = 319.15;
    }
  }
  
  step(dt) {
    if (!this.isRunning) return;
    
    const subSteps = 4;
    const sdt = dt / subSteps;
    const g = 9.81;
    
    for (let step = 0; step < subSteps; step++) {
      this.time += sdt;
      this.stateTimer += sdt;
      
      // 1. Manage Tumbling Cycle
      if (this.tumbleState === 'CW') {
        this.omega = this.baseOmega;
        if (this.stateTimer > 11.0) {
          this.tumbleState = 'PAUSE_1';
          this.stateTimer = 0;
        }
      } else if (this.tumbleState === 'PAUSE_1') {
        this.omega = 0;
        if (this.stateTimer > 1.8) {
          this.tumbleState = 'CCW';
          this.stateTimer = 0;
        }
      } else if (this.tumbleState === 'CCW') {
        this.omega = -this.baseOmega;
        if (this.stateTimer > 11.0) {
          this.tumbleState = 'PAUSE_2';
          this.stateTimer = 0;
        }
      } else if (this.tumbleState === 'PAUSE_2') {
        this.omega = 0;
        if (this.stateTimer > 1.8) {
          this.tumbleState = 'CW';
          this.stateTimer = 0;
        }
      }
      
      this.drumAngle += this.omega * sdt;
      
      // 2. Update Single Cloth Sheet Physics with smooth wave baffles & dimpled drum wall
      this.clothSheet.updatePhysics(sdt, g, this.drumRadius, this.drumAngle, this.omega, [], this.time, this.currentMoisture);
      this.effectiveAreaRatio = this.clothSheet.untangleRatio;
      this.effectiveArea = this.nominalDryingArea * this.effectiveAreaRatio;
      
      // 4. Save history
      if (this.history.length >= this.maxHistoryLength) {
        this.history.shift();
      }
      this.history.push({
        time: this.time,
        moisture: this.currentMoisture,
        freeWater: this.freeWater,
        boundWater: this.boundWater,
        dryingRate: this.dryingRate,
        temp: this.clothesTemp,
        untangleRatio: this.effectiveAreaRatio,
        effectiveArea: this.effectiveArea,
        period: this.dryingPeriod
      });
    }
  }
  
  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Outer Bezel
    this.renderWasherHousing(ctx);
    
    ctx.translate(this.centerX, this.centerY);
    const R_pix = this.drumRadius * this.scale;
    
    // Domestic Washing Machine Stainless Drum with Embossed Dimples & Wave Baffles
    ctx.save();
    
    // Drum cavity background
    ctx.beginPath();
    ctx.arc(0, 0, R_pix, 0, 2 * Math.PI);
    const drumGrad = ctx.createRadialGradient(0, 0, R_pix * 0.2, 0, 0, R_pix);
    drumGrad.addColorStop(0, '#0c1322');
    drumGrad.addColorStop(0.75, '#111827');
    drumGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = drumGrad;
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Realistic Washing Machine Drum Wall: Embossed Dimples (槽内の凹凸パターン)
    // Front-load washers use diamond/pillow embossed dimples across the stainless drum wall
    const dimpleRings = [
      { rFrac: 0.94, count: 48, size: 2.8 },
      { rFrac: 0.87, count: 42, size: 3.2 },
      { rFrac: 0.80, count: 36, size: 3.0 },
      { rFrac: 0.73, count: 30, size: 2.6 }
    ];
    
    for (const ring of dimpleRings) {
      const rRing = R_pix * ring.rFrac;
      for (let d = 0; d < ring.count; d++) {
        const dAngle = this.drumAngle + (d * 2 * Math.PI) / ring.count;
        const dx = rRing * Math.cos(dAngle);
        const dy = rRing * Math.sin(dAngle);
        
        // Embossed 3D Dimple: highlight on top, shadow on bottom
        ctx.beginPath();
        ctx.arc(dx, dy, ring.size, 0, 2 * Math.PI);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        
        // Specular highlight on dimple crown (stainless reflection)
        ctx.beginPath();
        ctx.arc(dx - 0.7, dy - 0.7, ring.size * 0.55, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.fill();
        
        // Deeper drain micro-hole at dimple center
        ctx.beginPath();
        ctx.arc(dx, dy, ring.size * 0.35, 0, 2 * Math.PI);
        ctx.fillStyle = '#050811';
        ctx.fill();
      }
    }
    
    // Hot Air Circulation Stream (Airborne heat exchange)
    this.renderAirFlowStream(ctx, R_pix);
    
    // 3 Gentle Wave Baffles (洗濯機のなだらかな波型バッフル・山型突起 - 爪は完全撤廃)
    // Smooth, rounded resin mounds (~22mm height) that lift without catching or snagging
    const numBaffles = 3;
    const baffleH_pix = (0.022 / this.drumRadius) * R_pix; // ~22mm visual height
    const baffleHalfWidth = 0.28; // ~16 deg half width -> 32 deg gentle mound
    
    for (let b = 0; b < numBaffles; b++) {
      const bAngle = this.drumAngle + (b * 2 * Math.PI) / numBaffles;
      
      // Draw smooth continuous wave contour
      ctx.beginPath();
      const steps = 24;
      for (let s = -steps; s <= steps; s++) {
        const frac = s / steps;
        const ang = bAngle + frac * baffleHalfWidth;
        const u = frac * (Math.PI * 0.5);
        const h = baffleH_pix * Math.cos(u) * Math.cos(u);
        const rCurrent = R_pix - h;
        const bx = rCurrent * Math.cos(ang);
        const by = rCurrent * Math.sin(ang);
        
        if (s === -steps) {
          ctx.moveTo(bx, by);
        } else {
          ctx.lineTo(bx, by);
        }
      }
      // Close along drum outer rim
      ctx.arc(0, 0, R_pix, bAngle + baffleHalfWidth, bAngle - baffleHalfWidth, true);
      ctx.closePath();
      
      // Elegant appliance-grade silver/white resin baffle gradient
      const apexX = (R_pix - baffleH_pix) * Math.cos(bAngle);
      const apexY = (R_pix - baffleH_pix) * Math.sin(bAngle);
      const baseMidX = R_pix * Math.cos(bAngle);
      const baseMidY = R_pix * Math.sin(bAngle);
      
      const bGrad = ctx.createLinearGradient(baseMidX, baseMidY, apexX, apexY);
      bGrad.addColorStop(0, 'rgba(71, 85, 105, 0.95)');
      bGrad.addColorStop(0.55, 'rgba(148, 163, 184, 0.98)');
      bGrad.addColorStop(1, 'rgba(241, 245, 249, 1.0)');
      
      ctx.fillStyle = bGrad;
      ctx.fill();
      
      // Soft rounded apex highlight (shows smooth, snag-free curved crest)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      
      // Gentle stream ribs on baffle flanks (water drainage & soft tumbling guides)
      for (let rib = -1; rib <= 1; rib++) {
        const ribAng = bAngle + rib * (baffleHalfWidth * 0.45);
        const ribR1 = R_pix - 2;
        const ribR2 = R_pix - baffleH_pix * 0.75;
        ctx.beginPath();
        ctx.moveTo(ribR1 * Math.cos(ribAng), ribR1 * Math.sin(ribAng));
        ctx.lineTo(ribR2 * Math.cos(ribAng), ribR2 * Math.sin(ribAng));
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    
    ctx.restore();
    
    // Draw Single Large Cloth Sheet (Deformable flexible mesh)
    this.clothSheet.draw(ctx, this.scale, this.currentMoisture);
    
    // Glass Door Reflection Ring
    ctx.beginPath();
    ctx.arc(0, 0, R_pix * 0.98, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, R_pix * 0.82, -Math.PI * 0.7, -Math.PI * 0.2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    ctx.restore();
    
    // On-canvas HUD
    this.renderHud(ctx);
  }
  
  renderHud(ctx) {
    const pad = 12 * window.devicePixelRatio;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad, pad, 280 * window.devicePixelRatio, 72 * window.devicePixelRatio, 6 * window.devicePixelRatio);
    ctx.fill();
    ctx.stroke();
    
    ctx.font = `bold ${11 * window.devicePixelRatio}px Inter, sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('大判綿布ほぐし度 (Untangling)', pad + 10 * window.devicePixelRatio, pad + 18 * window.devicePixelRatio);
    
    const pct = Math.round(this.effectiveAreaRatio * 100);
    ctx.font = `bold ${16 * window.devicePixelRatio}px "JetBrains Mono", monospace`;
    ctx.fillStyle = pct > 65 ? '#34d399' : pct > 40 ? '#f59e0b' : '#ef4444';
    ctx.fillText(`${pct} %`, pad + 10 * window.devicePixelRatio, pad + 38 * window.devicePixelRatio);
    
    ctx.font = `${10 * window.devicePixelRatio}px Inter, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`有効乾燥面積: ${this.effectiveArea.toFixed(2)} m² (全展開: 1.20m²)`, pad + 10 * window.devicePixelRatio, pad + 52 * window.devicePixelRatio);
    
    ctx.font = `italic ${9 * window.devicePixelRatio}px Inter, sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`挙動: ${this.clothSheet.currentStateText}`, pad + 10 * window.devicePixelRatio, pad + 65 * window.devicePixelRatio);
    
    ctx.restore();
  }
  
  renderWasherHousing(ctx) {
    const cx = this.centerX;
    const cy = this.centerY;
    const R_outer = this.drumRadius * this.scale * 1.12;
    
    ctx.beginPath();
    ctx.arc(cx, cy, R_outer, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.lineWidth = 14;
    ctx.stroke();
    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#475569';
    ctx.fillRect(R_outer - 4, -20, 10, 40);
    ctx.restore();
  }
  
  renderAirFlowStream(ctx, R_pix) {
    const isHP = (this.dryingMode === 'HeatPump');
    const airColor = isHP ? 'rgba(6, 182, 212, 0.14)' : 'rgba(249, 115, 22, 0.18)';
    const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, R_pix * 0.85);
    gradient.addColorStop(0, airColor);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, R_pix * 0.85, 0, 2 * Math.PI);
    ctx.fill();
  }
}

window.LaundryDrumSimulation = LaundryDrumSimulation;
window.FABRIC_PRESETS = FABRIC_PRESETS;
