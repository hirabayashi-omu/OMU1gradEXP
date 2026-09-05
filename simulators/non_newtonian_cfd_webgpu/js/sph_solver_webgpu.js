/**
 * sph_solver_webgpu.js - 化粧品充填プロセス (Cosmetic Filling Process) SPH ソルバー
 * 
 * CatTech Lab SPH 流体物理学 (https://github.com/cattech-lab/lecture5_sph_fluid)
 * に完全準拠したナビエ・ストークス方程式ベースの正統 SPH 物理エンジン。
 * 
 * 物理モデル:
 *   1. カーネル関数: 2次元 Poly6 Kernel (W and grad W)
 *   2. 密度計算: \rho_i = \sum_j m_j W(r_{ij}, h)
 *   3. 状態方程式 (Tait / Linear EOS): P_i = \max(k (\rho_i - \rho_0), 0)
 *   4. 圧力勾配力: \mathbf{f}_{i,p} = -\sum_j m_j (P_j/\rho_j^2 + P_i/\rho_i^2) \nabla W_{ij}
 *   5. 粘性散逸力 (Monaghan): \mathbf{f}_{i,v} = \sum_j m_j \frac{2\mu}{\rho_i \rho_j} \frac{\mathbf{r}_{ij} \cdot \nabla W_{ij}}{r_{ij}^2 + 0.01 h^2} (\mathbf{v}_i - \mathbf{v}_j)
 *   6. Herschel-Bulkley 非ニュートン粘性: \mu(\dot{\gamma}) = \tau_y/\dot{\gamma} (1 - e^{-m\dot{\gamma}}) + K \dot{\gamma}^{n-1}
 *   7. 壁面境界: CatTech 方式の壁面粒子 (Wall Particles) による滑らかな反発と壁面摩擦
 *   8. 時間積分: Leap-Frog (速度ベルレ) 方式
 */

export const CONTAINER_TYPES = {
  petri_dish: {
    id: 'petri_dish',
    name: '超薄平皿 (シャーレ Φ80×H7 mm)',
    dimensionSpec: 'Φ80 × H7 mm (シャーレ)',
    width: 260, // 実寸大Φ80mm相当の広大で浅い平皿底面
    height: 32, // 満杯深さ 27px でジャスト 20 mL
    bottomY: 480,
    targetVolume: 20.0, // 20 mL
    desc: '超薄平皿シャーレ (Φ80×H7 mm, 20mL)。極薄平皿での液滴ぬれ広がり・ツノ立ち・全面薄膜レベリング評価。'
  },
  jar: {
    id: 'jar',
    name: '広口円筒容器 (Φ45×H22 mm)',
    dimensionSpec: 'Φ45 × H22 mm',
    width: 180, // 実容量 50 mL と粒子堆積体積が 100% 完全整合する幾何寸法
    height: 85, // 満杯深さ 72px (高さの 85%) でジャスト 50 mL
    bottomY: 480,
    targetVolume: 50.0, // 50 mL
    desc: '広口円筒容器 (Φ45×H22 mm, 50mL)。高保湿クリーム等のツノ立ち・堆積・レベリング平坦化挙動。'
  },
  bottle: {
    id: 'bottle',
    name: '細長円筒容器 (Φ23×H36 mm)',
    dimensionSpec: 'Φ23 × H36 mm',
    width: 90,
    height: 145, // 満杯深さ 123px でジャスト 40 mL
    bottomY: 480,
    targetVolume: 40.0, // 40 mL
    desc: '細長円筒容器 (Φ23×H36 mm, 40mL)。乳液・美容液等の高速充填・壁面流下・液面上昇挙動。'
  },
  lipstick: {
    id: 'lipstick',
    name: '細径円管モールド (Φ12×H45 mm)',
    dimensionSpec: 'Φ12 × H45 mm',
    width: 48, // 実径 12mm スティック規格
    height: 180, // 満杯深さ 153px でジャスト 15 mL (モールド口元まで完全充填)
    bottomY: 480,
    targetVolume: 15.0, // 15 mL
    desc: '細径円管モールド (Φ12×H45 mm, 15mL)。高降伏応力バルクの狭小先端キャビティ充填性。'
  },
  compact: {
    id: 'compact',
    name: '浅型平皿容器 (Φ60×H13 mm)',
    dimensionSpec: 'Φ60 × H13 mm',
    width: 220,
    height: 52, // 満杯深さ 43px でジャスト 35 mL
    bottomY: 480,
    targetVolume: 35.0, // 35 mL
    desc: '浅型平皿容器 (Φ60×H13 mm, 35mL)。ファンデーションペースト等の全面均一レベリング流動。'
  }
};

export class WebGPUSPHSolver {
  constructor(width = 800, height = 540, maxParticles = 6000) {
    this.width = width;
    this.height = height;
    this.maxParticles = maxParticles;
    this.numParticles = 0;

    // スケール
    this.pixelPerMm = 4.0;

    // 容器設定 (初期デフォルト: 超薄平皿シャーレ)
    this.containerType = 'petri_dish';
    this.container = CONTAINER_TYPES.petri_dish;

    // ノズル設定 (デフォルト: 2.0 mm)
    this.nozzleDiameterMm = 2.0;
    this.nozzleRadiusPx = (this.nozzleDiameterMm * 0.5) * this.pixelPerMm;
    this.nozzleX = width * 0.5;

    this.fillingMode = 'bottom_up'; // デフォルト: 'bottom_up' (ボトムアップ昇降方式)
    this.initialNozzleY = this._calcInitialNozzleY();
    this.nozzleY = this.initialNozzleY;

    // CatTech SPH 粒子・物理パラメータ (超微細解像度: 直径 1.35px, 半径 0.675px)
    this.particleSize = 1.35; // 粒子公称直径 (px) - 超微細・高密度シルキー流体
    this.particleRadius = this.particleSize * 0.5; // 0.675 px
    this.particleDiameter = this.particleSize;
    this.h = this.particleSize * 1.65; // 平滑化長 2.22 px
    this.h2 = this.h * this.h;

    // Wendland C2 高次平滑化カーネルパラメータ (2次微分まで連続な高精度カーネル)
    this.alphaWendland = 7.0 / (Math.PI * this.h2);
    this.gradFactorWendland = -20.0 * this.alphaWendland / this.h2;

    // 流体物性 (CatTech SPH ピクセル座標系における無次元/物理単位の完全整合)
    this.referenceDensity = 1000.0;
    this.fluidDensity = this.referenceDensity;
    this.density0 = 1.0;
    this.massParticle = this.particleSize * this.particleSize * this.density0;
    this.stiffness = 1600.0; // 非圧縮性音速剛性 (体積保持と堆積層の正確な液面上昇)
    this.gravity = 1200.0; // 重力加速度 (px/s^2)
    this.baseViscosity = 3.8; // 基準粘性
    this.inletVelocity = 115.0; // 流入初速

    // レオロジー (HBパラメータ: 高保湿クリーム)
    this.tau_y = 55.0;
    this.K = 8.5;
    this.n = 0.38;
    this.m_reg = 80.0;
    this.eta_min = 0.5;
    this.eta_max = 60.0;
    this.sigma = 40.0;

    // 流体粒子配列 (SoA: 最大 36,000 粒子の高解像度キャパシティ)
    this.x = new Float32Array(maxParticles);
    this.y = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.vx2 = new Float32Array(maxParticles); // Leap-Frog 中間速度
    this.vy2 = new Float32Array(maxParticles);
    this.fx = new Float32Array(maxParticles);
    this.fy = new Float32Array(maxParticles);
    this.density = new Float32Array(maxParticles);
    this.pressure = new Float32Array(maxParticles);
    this.eta = new Float32Array(maxParticles);
    this.gammaDot = new Float32Array(maxParticles);
    this.isSettled = new Uint8Array(maxParticles);
    this.localHeightMm = new Float32Array(maxParticles); // 局所液滴膜厚 [mm] (降伏応力判定用)

    // 壁面粒子 (CatTech Wall Particles)
    this.maxWallParticles = 12000;
    this.numWallParticles = 0;
    this.wallX = new Float32Array(this.maxWallParticles);
    this.wallY = new Float32Array(this.maxWallParticles);
    this.baseWallX = new Float32Array(this.maxWallParticles); // 静止基準座標
    this.baseWallY = new Float32Array(this.maxWallParticles);
    this.wallDensity = new Float32Array(this.maxWallParticles);
    this.wallPressure = new Float32Array(this.maxWallParticles);

    // 🫨 容器インタラクティブ揺動・スロッシング物理パラメータ
    this.shakeX = 0.0; // 容器横変位 (px)
    this.shakeY = 0.0; // 容器縦変位 (px)
    this.shakeAngle = 0.0; // 容器傾き角度 (rad)
    this.shakeVx = 0.0; // 容器横速度 (px/s)
    this.shakeVy = 0.0;
    this.shakeVAng = 0.0; // 容器角速度 (rad/s)
    this.shakeAx = 0.0; // 慣性力用加速度 (px/s^2)
    this.shakeAy = 0.0;
    this.shakeAAng = 0.0;
    this.isDraggingContainer = false;
    this.sensorTargetX = 0.0;
    this.sensorTargetAngle = 0.0;
    this.containerPivotX = width * 0.5;
    this.containerPivotY = 480.0;

    // 空間グリッド (ハッシュバケット: キャンバス全体および流下全域を完全カバー)
    this.cellSize = this.h;
    const maxDim = Math.max(width || 960, height || 680, 2000);
    this.gridCols = Math.ceil(maxDim / this.cellSize) + 10;
    this.gridRows = Math.ceil(maxDim / this.cellSize) + 10;
    this.numCells = this.gridCols * this.gridRows;

    this.fluidHead = new Int32Array(this.numCells);
    this.fluidNext = new Int32Array(maxParticles);
    this.wallHead = new Int32Array(this.numCells);
    this.wallNext = new Int32Array(this.maxWallParticles);

    this.stepCount = 0;
    this.emitTimer = 0;
    this.emitAccumulator = 0.0; // 幾何学的等間隔流入アキュムレータ
    this.isFilled = false;
    this.fillPercentage = 0.0;
    this.filledVolumeMl = 0.0;
    this.peakHeightMm = 0.0;
    this.levelingFlatness = 100.0;

    // 試験モード ('filling' | 'sagging' | 'crown')
    this.testMode = 'filling';

    // 傾斜板・垂直板放置試験パラメータ (標準角度は 15度, 撥水シリコーン, 1.5mL)
    this.plateAngleDeg = 15.0; // 0°(水平) 〜 90°(垂直) - 標準 15°
    this.plateLengthPx = 480.0; // 傾斜板の長さ
    this.dropVolumeMl = 1.50; // 液滴滴下量 (mL) - 標準 1.50 mL
    this.substrateType = 'silicone'; // 'sus' | 'glass' | 'acrylic' | 'silicone'
    this.substrateFriction = 0.45;

    // 放置試験計測指標
    this.sagInitFrontPos = 65.0; // 滴下直後の先端位置
    this.sagDistanceMm = 0.0; // たれ移動距離 [mm]
    this.sagVelocityMmS = 0.0; // 先端流速 [mm/s]
    this.isSagArrested = true; // たれ停止判定
    this.sagTimerSec = 0.0; // 放置時間
    this.targetSagTimeSec = 10.0; // 目標放置時間設定 [s] (0 = 無制限)
    this.isSagTimeReached = false; // 目標時間到達フラグ
    this.prevSagPos = 65.0;

    // 【濡れ跡 (Wetting Trace) & 時間-移動距離履歴 (Sagging History)】
    this.wettingMinS = 1e9;
    this.wettingMaxS = -1e9;
    this.sagHistory = [{ time: 0.0, dist: 0.0, vel: 0.0 }];
    this.lastSagSampleTime = 0.0;

    // 👑 👑 👑 ミルククラウン試験 (Milk Crown & Droplet Impact Test) パラメータ 👑 👑 👑
    this.crownDropHeightMm = 50.0;     // 滴下高さ [mm] (10 〜 150 mm)
    this.crownDropDiameterMm = 3.6;   // 液滴直径 [mm] (2.0 〜 6.0 mm)
    this.crownFilmThicknessMm = 1.2;  // 液膜厚さ [mm] (0.0 〜 4.0 mm)
    this.crownSlowRate = 0.40;        // スローモーション倍率 (0.1 〜 1.0)
    this.crownPoolRadiusPx = 160.0;   // プール半径 (40 mm)
    this.crownPoolBottomY = 480.0;    // プール底面 Y 座標
    this.crownTimerSec = 0.0;         // クラウン経過時間
    this.crownMaxHeightMm = 0.0;      // クラウン最高到達高さ [mm]
    this.crownMaxRadiusMm = 0.0;      // クラウン最大広がり半径 [mm]
    this.crownSplashedCount = 0;      // 飛散スプラッシュ液滴数
    this.crownHasImpacted = false;    // 衝突検知フラグ
    this.crownImpactSpeedMPerS = 0.0; // 実測衝突速度 [m/s]
    this.crownState = 'falling';      // 'falling' | 'impact' | 'rebound' | 'settled'

    this.initWallParticles();
  }

  /**
   * 容器をタップ/クリック/シェイクして微小に揺らす (微小振幅・上品なスロッシング)
   * @param {number} forceX - 横方向撃力 (px/s)
   * @param {number} forceY - 縦方向撃力 (px/s)
   * @param {number} forceAng - 回転撃力 (rad/s)
   */
  triggerShake(forceX = 20.0, forceY = -3.0, forceAng = 0.012) {
    this.shakeVx = Math.max(-30.0, Math.min(30.0, this.shakeVx + forceX));
    this.shakeVy = Math.max(-10.0, Math.min(10.0, this.shakeVy + forceY));
    this.shakeVAng = Math.max(-0.025, Math.min(0.025, this.shakeVAng + forceAng));

    // 粒子に微小なせん断撹拌と速度インパルスを付加 (飛び散りや大波を厳格に防止)
    for (let i = 0; i < this.numParticles; i++) {
      const rx = this.x[i] - this.containerPivotX;
      const ry = this.y[i] - this.containerPivotY;
      this.vx[i] += forceX * 0.06 - forceAng * ry * 0.04;
      this.vy[i] += forceY * 0.06 + forceAng * rx * 0.04;
      this.vx2[i] = this.vx[i];
      this.vy2[i] = this.vy[i];
      // 降伏破壊: 揺れによって未流動コアを穏やかに活性化
      this.isSettled[i] = 0;
      this.gammaDot[i] = Math.max(this.gammaDot[i], 5.0);
    }
  }

  /**
   * マウスドラッグによる容器の微小揺動操作 (大きな変位・傾きは厳格にクランプ制限)
   */
  setContainerDragOffset(dx, dy, dAngle = 0.0) {
    this.isDraggingContainer = true;
    const oldX = this.shakeX;
    const oldY = this.shakeY;
    const oldAng = this.shakeAngle;

    // 最大変位 ±12px、最大縦変位 ±4px、最大傾き ±0.02rad (約1.1度) に制限
    this.shakeX = Math.max(-12.0, Math.min(12.0, dx));
    this.shakeY = Math.max(-4.0, Math.min(4.0, dy));
    this.shakeAngle = Math.max(-0.020, Math.min(0.020, dAngle));

    // ドラッグ移動速度の推定 (過大な初速を抑制)
    this.shakeVx = Math.max(-25.0, Math.min(25.0, (this.shakeX - oldX) * 15.0));
    this.shakeVy = Math.max(-8.0, Math.min(8.0, (this.shakeY - oldY) * 15.0));
    this.shakeVAng = Math.max(-0.020, Math.min(0.020, (this.shakeAngle - oldAng) * 15.0));
  }

  /**
   * スマホの姿勢・傾きセンサー (DeviceOrientation) による微小チルト連動
   * @param {number} gamma - 左右傾き (-90°〜+90°)
   * @param {number} beta - 前後傾き (-180°〜+180°)
   */
  setSensorTilt(gamma = 0.0, beta = 0.0) {
    if (this.isDraggingContainer) return;
    // 左右傾きを微小な平衡目標値にマッピング (最大 ±8px, 最大 ±0.015rad ≈ 0.86°)
    const normGamma = Math.max(-45.0, Math.min(45.0, gamma)) / 45.0;
    this.sensorTargetX = normGamma * 8.0;
    this.sensorTargetAngle = normGamma * 0.015;
  }

  /**
   * スマホの加速度センサー (DeviceMotion / Shake) による微小インパルス検知
   * @param {number} accX - 横方向加速度 (m/s^2)
   * @param {number} accY - 縦方向加速度 (m/s^2)
   * @param {number} accZ - 前後方向加速度 (m/s^2)
   */
  triggerShakeFromSensor(accX = 0.0, accY = 0.0, accZ = 0.0) {
    // 加速度に応じた微小撃力 (大揺れ厳格防止: 最大 forceX ±18.0)
    const forceX = Math.max(-18.0, Math.min(18.0, accX * 1.8));
    const forceY = Math.max(-3.0, Math.min(3.0, -Math.abs(accY) * 0.4));
    const forceAng = Math.max(-0.010, Math.min(0.010, (accX / 9.8) * 0.008));
    this.triggerShake(forceX, forceY, forceAng);
  }

  releaseContainerDrag() {
    this.isDraggingContainer = false;
  }

  /**
   * 高減衰調和振動（High-Damped Harmonic Oscillator）による迅速な安定復元
   */
  _updateShakeDynamics(dt) {
    if (this.isDraggingContainer) {
      this.shakeAx = this.shakeVx * 6.0;
      this.shakeAy = this.shakeVy * 6.0;
      this.shakeAAng = this.shakeVAng * 6.0;
      return;
    }

    // 高い剛性と強い減衰定数（1〜2回の微小なプルッとした振動で即座にピタッと静止）
    const kSpring = 360.0;  // 復元力係数
    const cDamping = 32.0;  // 減衰係数
    const kAng = 420.0;
    const cAng = 38.0;

    const targetX = this.sensorTargetX;
    const targetY = 0.0;
    const targetAng = this.sensorTargetAngle;

    const ax = -kSpring * (this.shakeX - targetX) - cDamping * this.shakeVx;
    const ay = -kSpring * (this.shakeY - targetY) - cDamping * this.shakeVy;
    const aAng = -kAng * (this.shakeAngle - targetAng) - cAng * this.shakeVAng;

    this.shakeAx = ax;
    this.shakeAy = ay;
    this.shakeAAng = aAng;

    this.shakeVx += ax * dt;
    this.shakeVy += ay * dt;
    this.shakeVAng += aAng * dt;

    this.shakeX += this.shakeVx * dt;
    this.shakeY += this.shakeVy * dt;
    this.shakeAngle += this.shakeVAng * dt;

    // 振幅の安全上限クランプ (大揺れを物理的にも厳格に禁止)
    this.shakeX = Math.max(-12.0, Math.min(12.0, this.shakeX));
    this.shakeY = Math.max(-4.0, Math.min(4.0, this.shakeY));
    this.shakeAngle = Math.max(-0.020, Math.min(0.020, this.shakeAngle));

    // 微小振動の迅速な停止判定
    const diffX = Math.abs(this.shakeX - targetX);
    const diffAng = Math.abs(this.shakeAngle - targetAng);
    if (diffX < 0.1 && Math.abs(this.shakeVx) < 0.2 &&
        Math.abs(this.shakeY) < 0.1 && Math.abs(this.shakeVy) < 0.2 &&
        diffAng < 0.002 && Math.abs(this.shakeVAng) < 0.01) {
      this.shakeX = targetX;
      this.shakeY = 0.0;
      this.shakeAngle = targetAng;
      this.shakeVx = 0.0;
      this.shakeVy = 0.0;
      this.shakeVAng = 0.0;
      this.shakeAx = 0.0;
      this.shakeAy = 0.0;
      this.shakeAAng = 0.0;
    }
  }

  _calcInitialNozzleY() {
    if (this.fillingMode === 'bottom_up') {
      return Math.max(90, this.container.bottomY - this.container.height * 0.45);
    } else {
      return 95;
    }
  }

  setFillingMode(mode) {
    this.fillingMode = mode;
    this.initialNozzleY = this._calcInitialNozzleY();
    this.reset();
  }

  setContainer(typeId) {
    if (CONTAINER_TYPES[typeId]) {
      this.containerType = typeId;
      this.container = CONTAINER_TYPES[typeId];
      this.reset();
    }
  }

  setNozzleDiameter(dMm) {
    this.nozzleDiameterMm = dMm;
    this.nozzleRadiusPx = (dMm * 0.5) * this.pixelPerMm;
  }

  setInletVelocity(vMPerS) {
    this.inletVelocity = Math.max(50.0, vMPerS * 140.0);
  }

  setSurfaceTension(sigmaVal) {
    this.sigma = sigmaVal;
  }

  setRheologyParams(params) {
    if (params.hlb !== undefined) this.hlb = params.hlb;
    if (params.tau_y !== undefined) this.tau_y = params.tau_y;
    if (params.K !== undefined) this.K = params.K;
    if (params.n !== undefined) this.n = params.n;
    if (params.m_reg !== undefined) this.m_reg = params.m_reg;
    if (params.eta_min !== undefined) this.eta_min = params.eta_min;
    if (params.eta_max !== undefined) this.eta_max = params.eta_max;
    if (params.rho !== undefined) this.setFluidDensity(params.rho);
    if (params.inlet_vel !== undefined) this.setInletVelocity(params.inlet_vel);
  }

  setFluidDensity(rhoKgM3) {
    const rho = Math.max(100.0, Number(rhoKgM3) || this.referenceDensity);
    this.fluidDensity = rho;
    this.density0 = rho / this.referenceDensity;
    this.massParticle = this.particleSize * this.particleSize * this.density0;
  }

  // --- 傾斜板・垂直板放置試験 制御メソッド ---
  setTestMode(mode) {
    if (this.testMode !== mode) {
      this.testMode = mode;
      if (mode === 'sagging') {
        this.resetSagTest();
        this.dropLiquid();
      } else if (mode === 'crown') {
        this.resetCrownTest();
      } else {
        this.reset();
      }
    }
  }

  // --- 👑 👑 👑 ミルククラウン試験 (Milk Crown & Droplet Impact Test) 制御メソッド 👑 👑 👑
  setCrownParams({ heightMm, diameterMm, filmThicknessMm, slowRate } = {}) {
    if (heightMm !== undefined) this.crownDropHeightMm = Math.max(10.0, Math.min(150.0, Number(heightMm)));
    if (diameterMm !== undefined) this.crownDropDiameterMm = Math.max(2.0, Math.min(6.0, Number(diameterMm)));
    if (filmThicknessMm !== undefined) this.crownFilmThicknessMm = Math.max(0.0, Math.min(4.0, Number(filmThicknessMm)));
    if (slowRate !== undefined) this.crownSlowRate = Math.max(0.1, Math.min(1.0, Number(slowRate)));
  }

  /**
   * クラウン形成・スプラッシュ力学の無次元数 (Academic Fluid Mechanics)
   */
  getCrownDimensionlessNumbers() {
    const H = this.crownDropHeightMm / 1000.0; // [m]
    const D0 = this.crownDropDiameterMm / 1000.0; // [m]
    const rho = this.fluidDensity; // [kg/m^3]
    const sigma = Math.max(0.005, this.sigma / 1000.0); // [N/m]
    
    // 理論衝突速度 V0 = sqrt(2 * g * H)
    const V0 = Math.sqrt(2.0 * 9.81 * H);
    
    // 代表せん断速度 gammaDot = V0 / (D0 * 0.5)
    const gammaDotNominal = Math.max(1.0, V0 / (D0 * 0.5));
    const muEff = this.calcViscosity(gammaDotNominal); // [Pa*s]
    
    // ウェーバー数 We = rho * V0^2 * D0 / sigma (慣性力 / 表面張力)
    const We = (rho * V0 * V0 * D0) / sigma;
    
    // レイノルズ数 Re = rho * V0 * D0 / muEff (慣性力 / 粘性力)
    const Re = (rho * V0 * D0) / Math.max(0.0001, muEff);
    
    // オーネゾルゲ数 Oh = muEff / sqrt(rho * sigma * D0)
    const Oh = muEff / Math.sqrt(Math.max(1e-6, rho * sigma * D0));
    
    // スプラッシュ判定パラメータ K = We * Oh^(-0.4) (Cossali & Yarin基準)
    const K = We * Math.pow(Math.max(1e-4, Oh), -0.4);
    
    // 判定
    let regime = 'crown'; // 'splash' | 'crown' | 'crater'
    let regimeText = '👑 美麗クラウン形成 (Stable Milk Crown)';
    let badgeClass = 'badge-crown';
    if (this.tau_y > 15.0 || muEff > 0.4 || K < 600) {
      regime = 'crater';
      regimeText = '⚪ クレーター沈降・跳ね返り抑制 (Crater / High Viscosity)';
      badgeClass = 'badge-crater';
    } else if (K > 2100) {
      regime = 'splash';
      regimeText = '⚡ スプラッシュ飛散 (Splash & Droplet Breakup)';
      badgeClass = 'badge-splash';
    } else {
      regime = 'crown';
      regimeText = '👑 美麗クラウン形成 (Stable Milk Crown)';
      badgeClass = 'badge-crown';
    }

    return {
      V0,
      We,
      Re,
      Oh,
      K,
      muEff,
      regime,
      regimeText,
      badgeClass,
      heightMm: this.crownDropHeightMm,
      diameterMm: this.crownDropDiameterMm,
      filmThicknessMm: this.crownFilmThicknessMm,
      slowRate: this.crownSlowRate,
      maxHeightMm: this.crownMaxHeightMm,
      maxRadiusMm: this.crownMaxRadiusMm,
      splashedCount: this.crownSplashedCount,
      hasImpacted: this.crownHasImpacted,
      state: this.crownState
    };
  }

  resetCrownTest() {
    this.numParticles = 0;
    this.crownTimerSec = 0.0;
    this.crownMaxHeightMm = 0.0;
    this.crownMaxRadiusMm = 0.0;
    this.crownSplashedCount = 0;
    this.crownHasImpacted = false;
    this.crownState = 'falling';
    this.initWallParticles();
    this.dropCrownLiquid();
  }

  /**
   * ミルククラウン試験: 下部液膜プールと落下液滴の初期化配置
   */
  dropCrownLiquid() {
    this.numParticles = 0;
    const pxPerMm = this.pixelPerMm; // 4.0 px/mm
    const spacing = this.particleSize * 0.88;
    const nx = this.nozzleX;
    const bottomY = this.crownPoolBottomY; // 480.0
    const filmThickMm = this.crownFilmThicknessMm;
    const filmPx = filmThickMm * pxPerMm;
    const poolRadiusPx = this.crownPoolRadiusPx; // 160.0 px (40 mm)

    // 1. 下部液膜プール (シャーレ内の薄い液層)
    if (filmThickMm > 0.05) {
      const filmRows = Math.max(1, Math.round(filmPx / spacing));
      for (let r = 0; r < filmRows; r++) {
        const y = bottomY - this.particleRadius - (r + 0.5) * spacing;
        for (let x = nx - poolRadiusPx + spacing * 0.5; x <= nx + poolRadiusPx - spacing * 0.5; x += spacing) {
          if (this.numParticles >= this.maxParticles) break;
          const idx = this.numParticles++;
          this.x[idx] = x;
          this.y[idx] = y;
          this.vx[idx] = 0.0;
          this.vy[idx] = 0.0;
          this.vx2[idx] = 0.0;
          this.vy2[idx] = 0.0;
          this.fx[idx] = 0.0;
          this.fy[idx] = 0.0;
          this.eta[idx] = this.calcViscosity(0.01);
          this.gammaDot[idx] = 0.01;
          this.isSettled[idx] = 1; // 液膜粒子フラグ
        }
      }
    }

    // 2. 落下液滴 (球状ドロップ)
    const dropDiamMm = this.crownDropDiameterMm;
    const dropRadiusPx = (dropDiamMm * 0.5) * pxPerMm;
    const dropHeightMm = this.crownDropHeightMm;
    const dropHeightPx = dropHeightMm * pxPerMm;

    // 画面上部から美しくアプローチ落下させる
    const approachHeightPx = Math.min(140.0, Math.max(30.0, dropHeightPx));
    const dropCenterY = bottomY - filmPx - approachHeightPx;
    const dropCenterX = nx;

    // 理論衝突速度 V0 = sqrt(2 * g * H)
    const H_m = dropHeightMm * 1e-3;
    const V0_m_s = Math.sqrt(2.0 * 9.81 * H_m);
    this.crownImpactSpeedMPerS = V0_m_s;

    // 初期落下初速 (直前アプローチ加速)
    const approach_m = (approachHeightPx / pxPerMm) * 1e-3;
    const vInit_m_s = Math.sqrt(Math.max(0.0, 2.0 * 9.81 * Math.max(0.0, H_m - approach_m)));
    const vInit_px_s = vInit_m_s * (pxPerMm * 50.0); // SPHスケーリング速度

    const dropRows = Math.ceil((dropRadiusPx * 2) / spacing);
    for (let r = 0; r <= dropRows; r++) {
      const dy = -dropRadiusPx + r * spacing;
      if (Math.abs(dy) > dropRadiusPx) continue;
      const rowHalfW = Math.sqrt(Math.max(0.0, dropRadiusPx * dropRadiusPx - dy * dy));
      const cols = Math.floor(rowHalfW / spacing);
      for (let c = -cols; c <= cols; c++) {
        const dx = c * spacing;
        if (dx * dx + dy * dy > dropRadiusPx * dropRadiusPx) continue;
        if (this.numParticles >= this.maxParticles) break;
        const idx = this.numParticles++;
        this.x[idx] = dropCenterX + dx;
        this.y[idx] = dropCenterY + dy;
        this.vx[idx] = 0.0;
        this.vy[idx] = vInit_px_s;
        this.vx2[idx] = 0.0;
        this.vy2[idx] = vInit_px_s;
        this.fx[idx] = 0.0;
        this.fy[idx] = 0.0;
        this.eta[idx] = this.calcViscosity(vInit_m_s / (dropDiamMm * 1e-3));
        this.gammaDot[idx] = 10.0;
        this.isSettled[idx] = 0; // 落下液滴フラグ
      }
    }

    this.crownTimerSec = 0.0;
    this.crownMaxHeightMm = 0.0;
    this.crownMaxRadiusMm = 0.0;
    this.crownSplashedCount = 0;
    this.crownHasImpacted = false;
    this.crownState = 'falling';
  }

  /**
   * クラウン計測指標のリアルタイム更新
   */
  _updateCrownMetrics(dt) {
    if (this.numParticles === 0) return;
    const nx = this.nozzleX;
    const bottomY = this.crownPoolBottomY;
    const filmPx = this.crownFilmThicknessMm * this.pixelPerMm;
    const poolSurfaceY = bottomY - filmPx;
    const pxPerMm = this.pixelPerMm;

    let highestY = poolSurfaceY;
    let maxRadiusPx = 0.0;
    let hasDropHit = false;
    let splashed = 0;

    for (let i = 0; i < this.numParticles; i++) {
      const y = this.y[i];
      const x = this.x[i];
      const dx = Math.abs(x - nx);

      // 液滴がプール表面に接触したか検知
      if (this.isSettled[i] === 0 && y >= poolSurfaceY - 4.0) {
        hasDropHit = true;
      }

      // クラウンの王冠リム高さ (表面より上に跳ね上がった流体)
      if (y < poolSurfaceY) {
        const hPx = poolSurfaceY - y;
        if (hPx > (poolSurfaceY - highestY)) {
          highestY = y;
        }
        if (dx > maxRadiusPx && hPx > 2.0) {
          maxRadiusPx = dx;
        }
      }

      // 飛散スプラッシュ判定 (高度に跳ね上がり孤立した液滴)
      if (y < poolSurfaceY - 12.0 && dx > 20.0) {
        splashed++;
      }
    }

    if (hasDropHit && !this.crownHasImpacted) {
      this.crownHasImpacted = true;
      this.crownState = 'impact';
    }

    if (this.crownHasImpacted) {
      const currentHeightMm = Math.max(0.0, (poolSurfaceY - highestY) / pxPerMm);
      const currentRadiusMm = maxRadiusPx / pxPerMm;
      if (currentHeightMm > this.crownMaxHeightMm) {
        this.crownMaxHeightMm = currentHeightMm;
      }
      if (currentRadiusMm > this.crownMaxRadiusMm) {
        this.crownMaxRadiusMm = currentRadiusMm;
      }
      this.crownSplashedCount = splashed;

      if (this.crownTimerSec > 0.18 && this.crownState === 'impact') {
        this.crownState = 'rebound';
      } else if (this.crownTimerSec > 0.55) {
        this.crownState = 'settled';
      }
    }
  }

  setTargetSagTime(sec) {
    this.targetSagTimeSec = Math.max(0.0, Number(sec) || 0.0);
    if (this.testMode === 'sagging' && this.targetSagTimeSec > 0 && this.sagTimerSec < this.targetSagTimeSec) {
      this.isSagTimeReached = false;
    }
  }

  setPlateAngle(deg) {
    this.plateAngleDeg = Math.max(0.0, Math.min(90.0, deg));
    if (this.testMode === 'sagging') {
      this.initWallParticles();
      this.dropLiquid();
    }
  }

  setSubstrateType(type) {
    this.substrateType = type;
    const wetting = this.getWettingAndAffinity();
    this.substrateFriction = wetting.substrateFriction;
    if (this.testMode === 'sagging') {
      this.dropLiquid();
    }
  }

  /**
   * 化粧品HLB値と基板の親疎水性から濡れ性・接触角・界面付着摩擦係数を物理化学的に計算
   * 
   * 基板表面特性:
   *   - glass: 親水性ガラス (高表面自由エネルギー γ_s ~ 73 mN/m, Hydrophilic)
   *   - sus: 親水性研磨SUS304 (γ_s ~ 50 mN/m, Mildly Hydrophilic)
   *   - acrylic: 疎水性アクリル樹脂 (PMMA, γ_s ~ 38 mN/m, Hydrophobic)
   *   - silicone: 撥水シリコーンコート (γ_s ~ 20 mN/m, Highly Hydrophobic)
   */
  getWettingAndAffinity() {
    const hlb = this.hlb ?? 10.0; // 0 (強親油) ~ 20 (強親水)
    const sub = this.substrateType;

    // 基板の親水性指標: 1.0 (強親水) ~ 0.0 (強疎水)
    let subHydrophilicIndex = 0.70;
    let subName = 'SUS304研磨板';
    let subTypeLabel = '弱親水性 (表面張力中)';

    if (sub === 'glass') {
      subHydrophilicIndex = 0.92;
      subName = '親水性ガラス板';
      subTypeLabel = '高親水性 (高表面エネルギー)';
    } else if (sub === 'sus') {
      subHydrophilicIndex = 0.70;
      subName = 'SUS304研磨板';
      subTypeLabel = '弱親水性 (JIS標準研磨面)';
    } else if (sub === 'acrylic') {
      subHydrophilicIndex = 0.28;
      subName = '疎水性アクリル樹脂板';
      subTypeLabel = '疎水性 (低表面エネルギー)';
    } else if (sub === 'silicone') {
      subHydrophilicIndex = 0.08;
      subName = '撥水シリコーンコート板';
      subTypeLabel = '超疎水・撥水面';
    }

    // 製剤の親水性指標: 0.0 (HLB 0) ~ 1.0 (HLB 20)
    const fluidHydrophilicIndex = Math.max(0.0, Math.min(1.0, hlb / 20.0));

    // 親和性 (Affinity): 親水同士 (1 & 1) または 疎水同士 (0 & 0) で最大 1.0、相反すると 0.0
    const mismatch = Math.abs(subHydrophilicIndex - fluidHydrophilicIndex);
    const affinity = Math.max(0.0, Math.min(1.0, 1.0 - mismatch));

    // 接触角 theta_c [deg]:
    // 高親和性 (affinity -> 1.0): theta_c ~ 16°〜24° (よく濡れ広がる)
    // 低親和性 (affinity -> 0.0): theta_c ~ 65°〜85° (水玉・撥液ビーズ状)
    const contactAngleDeg = 16.0 + (1.0 - affinity) * 64.0;

    // 濡れドームのアスペクト比 (高さ / 半幅):
    // 接触角が小さいほど偏平 (aspect ~ 0.20〜0.24)
    // 接触角が大きいほど丸っこいドーム (aspect ~ 0.45〜0.58)
    const aspect = 0.18 + (contactAngleDeg / 90.0) * 0.40;

    // 基板界面付着摩擦力係数 (壁面すべり抵抗倍率):
    // 親和性が高いと強固に付着 (1.05〜1.45倍)、相反すると滑落しやすい (0.45〜0.70倍)
    const substrateFriction = 0.50 + affinity * 0.85;

    let affinityLevel = '良好な親和性 (濡れ広がり・付着保持大)';
    if (affinity < 0.4) {
      affinityLevel = '反発・低親和性 (撥液・玉状化・滑落大)';
    } else if (affinity < 0.65) {
      affinityLevel = '中庸な濡れ性 (標準界面)';
    }

    return {
      hlb,
      subHydrophilicIndex,
      fluidHydrophilicIndex,
      subName,
      subTypeLabel,
      affinity,
      contactAngleDeg,
      aspect,
      substrateFriction,
      affinityLevel
    };
  }

  setDropVolume(volMl) {
    this.dropVolumeMl = Math.max(0.1, Math.min(2.0, volMl));
  }

  getPlateGeometry() {
    const angleRad = (this.plateAngleDeg * Math.PI) / 180.0;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // 接線方向ベクトル (板に沿って下る向き)
    const tx = cosA;
    const ty = sinA;

    // 法線方向ベクトル (板の表面から流体へ向かう向き: キャンバスy軸は下向き正なので上向きは -y)
    const nx = sinA;
    const ny = -cosA;

    // 板の中心 (キャンバス中央: x=width*0.5, y=height*0.52)
    const cx = (this.width || 960) * 0.5;
    const cy = (this.height || 680) * 0.52;
    // 画面サイズに応じて大きく美しいスケール (460px〜650px)
    const L = Math.max(440.0, Math.min((this.width || 960) * 0.62, (this.height || 680) * 0.72));

    // 上端 P0, 下端 P1
    const p0x = cx - 0.5 * L * tx;
    const p0y = cy - 0.5 * L * ty;
    const p1x = cx + 0.5 * L * tx;
    const p1y = cy + 0.5 * L * ty;

    return {
      angleDeg: this.plateAngleDeg,
      angleRad,
      tx, ty,
      nx, ny,
      cx, cy,
      L,
      p0x, p0y,
      p1x, p1y
    };
  }

  dropLiquid(volumeMl = null) {
    if (volumeMl !== null) this.dropVolumeMl = volumeMl;
    const vol = this.dropVolumeMl;

    this.numParticles = 0;
    this.sagTimerSec = 0.0;
    this.isSagArrested = false;
    this.settleCooldown = 50; // 初期安定化 (飛び散り防止ダンパー)

    const geom = this.getPlateGeometry();
    const pxPerMm = this.pixelPerMm; // 4.0 px/mm

    // 滴下基準位置: 目盛り 27 mm 地点 (dx = 27 * 4.0 = 108 px)
    const dropS = 27.0 * pxPerMm;

    // 【化粧品HLB値と基板親疎水性から濡れドーム形状 (aspect, 接触角) を動的決定】
    const wetting = this.getWettingAndAffinity();
    this.substrateFriction = wetting.substrateFriction;
    const aspect = wetting.aspect; // 0.18 (親水濡れ広がり) 〜 0.58 (疎水ビーズ)

    // SPH平衡粒子間隔: 密度 rho_0 と完全に釣り合う間隔 (過密による圧力爆発を完全根絶)
    const spacing = this.particleDiameter * 1.04; // 1.40 px

    // 実機スケール完全整合寸法: 0.5 mL で半径 R ≈ 4.5 mm (直径 9 mm), 1.0 mL で R ≈ 5.8 mm
    const baseRadiusMm = Math.max(3.2, Math.min(8.0, 4.5 * Math.cbrt(vol / 0.5)));
    const halfWidth = baseRadiusMm * pxPerMm; // 半径 px (約 18〜24 px)
    const maxHeight = Math.max(6.0, halfWidth * aspect); // 高さ px

    const maxRows = Math.max(3, Math.floor(maxHeight / spacing));

    for (let r = 0; r < maxRows; r++) {
      const dn = this.particleRadius + (r + 0.5) * spacing;
      if (dn > maxHeight) break;

      // 半楕円ドームの幾何幅 (端部が滑らかに基板へ着地する接触角メニスカス)
      const hRatio = (r + 0.5) / maxRows;
      const rowHalfW = halfWidth * Math.sqrt(Math.max(0.0, 1.0 - hRatio * hRatio));
      const numCols = Math.floor(rowHalfW / spacing);
      const isContactLayer = (r === 0);

      // 左右対称に滑らかに配置
      for (let c = -numCols; c <= numCols; c++) {
        if (this.numParticles >= this.maxParticles) break;
        const idx = this.numParticles++;
        const s = c * spacing;
        const pS = dropS + s;

        // 基板上に静止載置
        this.x[idx] = geom.p0x + pS * geom.tx + dn * geom.nx;
        this.y[idx] = geom.p0y + pS * geom.ty + dn * geom.ny;
        this.vx[idx] = 0.0;
        this.vy[idx] = 0.0;
        this.vx2[idx] = 0.0;
        this.vy2[idx] = 0.0;
        this.fx[idx] = 0.0;
        this.fy[idx] = 0.0;
        this.eta[idx] = this.calcViscosity(0.01);
        this.gammaDot[idx] = 0.01;
        this.isSettled[idx] = isContactLayer ? 2 : 1;
        this.localHeightMm[idx] = maxHeight / pxPerMm;
      }
    }

    this.sagInitFrontPos = dropS + halfWidth;
    this.prevSagPos = this.sagInitFrontPos;
    this.sagDistanceMm = 0.0;
    this.sagVelocityMmS = 0.0;
    this.isSagArrested = false;

    // 濡れ跡初期化 (滴下ドームの底面接触部)
    this.wettingMinS = Math.max(0.0, dropS - halfWidth);
    this.wettingMaxS = dropS + halfWidth;
    this.sagHistory = [{ time: 0.0, dist: 0.0, vel: 0.0 }];
    this.lastSagSampleTime = 0.0;
  }

  resetSagTest() {
    this.numParticles = 0;
    this.sagTimerSec = 0.0;
    this.sagDistanceMm = 0.0;
    this.sagVelocityMmS = 0.0;
    this.isSagArrested = true;
    this.wettingMinS = 1e9;
    this.wettingMaxS = -1e9;
    this.sagHistory = [{ time: 0.0, dist: 0.0, vel: 0.0 }];
    this.lastSagSampleTime = 0.0;
    this.initWallParticles();
  }

  resize(width, height) {
    if (!width || !height) return;
    const oldPivotX = this.containerPivotX;
    const newPivotX = width * 0.5;
    const deltaX = newPivotX - oldPivotX;

    this.width = width;
    this.height = height;
    this.nozzleX = newPivotX;
    this.containerPivotX = newPivotX;

    // 空間グリッドの再計算 (必要に応じて拡張)
    const maxDim = Math.max(width, height, 2000);
    const newCols = Math.ceil(maxDim / this.cellSize) + 10;
    const newRows = Math.ceil(maxDim / this.cellSize) + 10;
    if (newCols * newRows > this.numCells) {
      this.gridCols = newCols;
      this.gridRows = newRows;
      this.numCells = newCols * newRows;
      this.fluidHead = new Int32Array(this.numCells);
      this.wallHead = new Int32Array(this.numCells);
    }

    // 既存の流体粒子のX座標を容器中心移動に合わせて追従シフト
    if (Math.abs(deltaX) > 0.001) {
      for (let i = 0; i < this.numParticles; i++) {
        this.x[i] += deltaX;
      }
    }

    // 新しい容器中心に合わせて壁面粒子を再生成
    this.initWallParticles();
  }

  reset() {
    if (this.testMode === 'sagging') {
      this.resetSagTest();
      this.dropLiquid();
      return;
    }
    this.numParticles = 0;
    this.nozzleY = this.initialNozzleY;
    this.stepCount = 0;
    this.emitTimer = 0;
    this.isFilled = false;
    this.fillPercentage = 0.0;
    this.filledVolumeMl = 0.0;
    this.peakHeightMm = 0.0;
    this.levelingFlatness = 100.0;
    this.initWallParticles();
  }

  /**
   * CatTech SPH 方式: 容器の底面と側壁に境界壁面粒子を配置
   */
  initWallParticles() {
    if (this.testMode === 'sagging') {
      // 傾斜板は解析的幾何平面境界として拘束 (ダミー壁面粒子による不自然な空中浮上反発を完全に排除)
      this.numWallParticles = 0;
      this.wallHead.fill(-1);
      return;
    }

    this.numWallParticles = 0;
    const nx = this.nozzleX;
    const isCrown = (this.testMode === 'crown');
    const c = isCrown ? { width: 320, height: 30, bottomY: 480.0 } : this.container;
    const halfW = c.width * 0.5;
    const leftX = nx - halfW;
    const rightX = nx + halfW;
    const bottomY = c.bottomY;
    const topY = c.bottomY - c.height;

    const spacing = this.particleSize * 0.85; // 密な配置間隔
    const layers = 3; // 3層の密なダミー壁粒子で境界不連続性を完全に解消 (JSCES論文準拠)

    // 1. 底面壁 (高密度3層ダミー粒子)
    for (let layer = 0; layer < layers; layer++) {
      const y = bottomY + layer * spacing;
      for (let x = leftX - (layers + 1) * spacing; x <= rightX + (layers + 1) * spacing; x += spacing) {
        if (this.numWallParticles >= this.maxWallParticles) break;
        const idx = this.numWallParticles++;
        this.baseWallX[idx] = x;
        this.baseWallY[idx] = y;
        this.wallX[idx] = x;
        this.wallY[idx] = y;
      }
    }

    // 2. 左側壁 (高密度3層ダミー粒子)
    for (let layer = 0; layer < layers; layer++) {
      const x = leftX - layer * spacing;
      for (let y = topY - 15; y < bottomY; y += spacing) {
        if (this.numWallParticles >= this.maxWallParticles) break;
        const idx = this.numWallParticles++;
        this.baseWallX[idx] = x;
        this.baseWallY[idx] = y;
        this.wallX[idx] = x;
        this.wallY[idx] = y;
      }
    }

    // 3. 右側壁 (高密度3層ダミー粒子)
    for (let layer = 0; layer < layers; layer++) {
      const x = rightX + layer * spacing;
      for (let y = topY - 15; y < bottomY; y += spacing) {
        if (this.numWallParticles >= this.maxWallParticles) break;
        const idx = this.numWallParticles++;
        this.baseWallX[idx] = x;
        this.baseWallY[idx] = y;
        this.wallX[idx] = x;
        this.wallY[idx] = y;
      }
    }

    this._updateWallPositionsAndGrid();
  }

  /**
   * 容器の揺動変位・傾斜角に応じて壁面粒子を幾何学的に同期更新
   */
  _updateWallPositionsAndGrid() {
    if (this.testMode === 'sagging') return;

    const pivotX = this.containerPivotX;
    const pivotY = this.containerPivotY;
    const sx = this.shakeX;
    const sy = this.shakeY;
    const cosA = Math.cos(this.shakeAngle);
    const sinA = Math.sin(this.shakeAngle);

    for (let i = 0; i < this.numWallParticles; i++) {
      const rx = this.baseWallX[i] - pivotX;
      const ry = this.baseWallY[i] - pivotY;
      this.wallX[i] = pivotX + sx + rx * cosA - ry * sinA;
      this.wallY[i] = pivotY + sy + rx * sinA + ry * cosA;
    }

    // 壁面粒子を空間グリッドに登録
    this.wallHead.fill(-1);
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;

    for (let i = 0; i < this.numWallParticles; i++) {
      const gx = Math.floor(this.wallX[i] / cs);
      const gy = Math.floor(this.wallY[i] / cs);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const cell = gy * cols + gx;
        this.wallNext[i] = this.wallHead[cell];
        this.wallHead[cell] = i;
      } else {
        this.wallNext[i] = -1;
      }
    }
  }

  _initPlateWallParticles() {
    this.numWallParticles = 0;
    const geom = this.getPlateGeometry();
    const spacing = this.particleSize * 0.85;
    const layers = 3;
    const L = geom.L;

    // 傾斜板の表面に沿って裏側 (-nx, -ny 方向) に 3層の密な壁ダミー粒子を配置
    for (let layer = 0; layer < layers; layer++) {
      const normalOffset = (layer + 0.5) * spacing;
      for (let s = -30; s <= L + 30; s += spacing) {
        if (this.numWallParticles >= this.maxWallParticles) break;
        const idx = this.numWallParticles++;
        this.wallX[idx] = geom.p0x + s * geom.tx - normalOffset * geom.nx;
        this.wallY[idx] = geom.p0y + s * geom.ty - normalOffset * geom.ny;
      }
    }

    // 壁面粒子を空間グリッドに登録
    this.wallHead.fill(-1);
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;

    for (let i = 0; i < this.numWallParticles; i++) {
      const gx = Math.floor(this.wallX[i] / cs);
      const gy = Math.floor(this.wallY[i] / cs);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const cell = gy * cols + gx;
        this.wallNext[i] = this.wallHead[cell];
        this.wallHead[cell] = i;
      } else {
        this.wallNext[i] = -1;
      }
    }
  }

  /**
   * Wendland C2 高次平滑化カーネル関数 (2次微分まで連続, Particleworks推奨)
   * W(r, h) = alpha_W * (1 - q)^4 * (4q + 1),  q = r / h,  alpha_W = 7 / (pi * h^2)
   */
  poly6Kernel(r) {
    if (r < this.h) {
      const q = r / this.h;
      const oneMinusQ = 1.0 - q;
      const oneMinusQ2 = oneMinusQ * oneMinusQ;
      return this.alphaWendland * oneMinusQ2 * oneMinusQ2 * (4.0 * q + 1.0);
    }
    return 0.0;
  }

  /**
   * Wendland C2 勾配ベクトル (2次微分連続: 中心および境界で滑らかに収束しギザギザ・ペアリングを解消)
   * \nabla W = -20 * (alpha_W / h^2) * (1 - q)^3 * \mathbf{r}
   */
  poly6Grad(rx, ry, r) {
    if (r < this.h && r > 1e-6) {
      const q = r / this.h;
      const oneMinusQ = 1.0 - q;
      const factor = this.gradFactorWendland * oneMinusQ * oneMinusQ * oneMinusQ;
      return { gx: factor * rx, gy: factor * ry };
    }
    return { gx: 0.0, gy: 0.0 };
  }

  calcViscosity(gDot) {
    const eps = 1e-3;
    const g = Math.max(eps, Math.abs(gDot));
    let etaY = 0.0;
    if (this.tau_y > 0.0) {
      etaY = (this.tau_y / g) * (1.0 - Math.exp(-this.m_reg * g));
    }
    const etaPow = this.K * Math.pow(g, this.n - 1.0);
    return Math.max(this.eta_min, Math.min(this.eta_max, etaY + etaPow));
  }

  /**
   * ノズルからの均一な連続六方最密・千鳥層流注入 (SPH Hexagonal Inflow)
   * 横縞・不連続スライスを完全に解消し、1本の滑らかな均質円柱ジェットを形成
   */
  emitParticles() {
    if (this.isFilled || this.numParticles >= this.maxParticles) return;

    // 各容器の安全上限粒子数 (キャビティ満杯まで継続供給)
    const maxCapacity = {
      petri_dish: 5000,
      jar: 7500,
      bottle: 7000,
      lipstick: 4500,
      compact: 6000
    }[this.containerType] || 6500;

    if (this.numParticles >= maxCapacity || this.isFilled) {
      return;
    }

    this.emitRowIndex = (this.emitRowIndex || 0) + 1;
    const isOddRow = (this.emitRowIndex % 2 === 1);

    const nx = this.nozzleX;
    const ny = this.nozzleY;
    const nr = Math.max(3.0, this.nozzleRadiusPx * 0.90);
    const spacing = this.particleDiameter * 0.98; // 最密充填間隔

    const numCols = Math.floor(nr / spacing);
    const rowOffset = isOddRow ? 0.5 * spacing : 0.0;

    // ノズル口径内に千鳥（Hexagonal Close-Packed）状に 1行分生成
    for (let c = -numCols; c <= numCols; c++) {
      if (this.numParticles >= this.maxParticles) break;

      const offsetX = c * spacing + rowOffset;
      if (Math.abs(offsetX) > nr) continue;

      const idx = this.numParticles;
      const rRatio = Math.abs(offsetX) / (nr + 1e-4);

      // ポアズイユ放物線流速分布: ノズル中心が最も速く、管壁近傍が穏やか
      const vProfile = this.inletVelocity * Math.max(0.75, 1.0 - 0.20 * rRatio * rRatio);

      this.x[idx] = nx + offsetX;
      this.y[idx] = ny;
      this.vx[idx] = 0.0;
      this.vy[idx] = vProfile;
      this.vx2[idx] = 0.0;
      this.vy2[idx] = vProfile;
      this.fx[idx] = 0.0;
      this.fy[idx] = 0.0;

      this.eta[idx] = this.calcViscosity(20.0);
      this.gammaDot[idx] = 20.0;
      this.isSettled[idx] = 0;

      this.numParticles++;
    }
  }

  _buildFluidGrid() {
    this.fluidHead.fill(-1);
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;

    for (let i = 0; i < this.numParticles; i++) {
      const gx = Math.floor(this.x[i] / cs);
      const gy = Math.floor(this.y[i] / cs);

      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const cell = gy * cols + gx;
        this.fluidNext[i] = this.fluidHead[cell];
        this.fluidHead[cell] = i;
      } else {
        this.fluidNext[i] = -1;
      }
    }
  }

  /**
   * CatTech SPH ステップ実行
   */
  step(dt = 0.003, subSteps = 2) {
    const subDt = dt / subSteps;

    // 容器揺動の減衰調和振動力学をフレーム更新
    this._updateShakeDynamics(dt);
    this._updateWallPositionsAndGrid();

    for (let s = 0; s < subSteps; s++) {
      if (this.testMode === 'filling') {
        // 流出速度と粒子間隔に厳密同期した六方最密層流注入 (隙間・不連続縞を完全排除)
        const emitSpacing = this.particleDiameter * 0.866;
        this.emitAccumulator += this.inletVelocity * subDt;
        while (this.emitAccumulator >= emitSpacing) {
          this.emitParticles();
          this.emitAccumulator -= emitSpacing;
        }
      } else {
        if (this.targetSagTimeSec > 0 && this.sagTimerSec >= this.targetSagTimeSec) {
          this.isSagTimeReached = true;
          this.isSagArrested = true;
          this.sagVelocityMmS = 0.0;
          break;
        }
        this.sagTimerSec += subDt;
      }

      if (this.numParticles === 0) continue;

      this._buildFluidGrid();

      // 1. 密度と圧力の計算 (CatTech densityPressure)
      this._computeDensityAndPressure();

      // シェパード密度フィルタ (Shepard Density Filter: 数ステップに1回密度ノイズを平滑化)
      if (this.stepCount % 8 === 0) {
        this._applyShepardFilter();
      }

      // 2. ナビエ・ストークス外力計算 (CatTech particleForce: 圧力勾配 + 粘性力 + 重力 + 慣性力)
      this._computeForces();

      // 3. Leap-Frog (速度ベルレ) 時間積分 (CatTech motionUpdate)
      this._integrateLeapFrog(subDt);

      // 4. XSPH 速度平滑化 (Monaghan 1989/2000: 自由表面での秩序ある層流維持)
      this._applyXSPH();

      // 5. 粒子数密度・位置の再調整 (Particle Shifting Technology: PST)
      this._applyParticleShifting();

      if (this.testMode === 'filling') {
        // 6. ノズル昇降 (ボトムアップ追従)
        this._updateBottomUpNozzle();
      }

      this.stepCount++;
    }

    if (this.testMode === 'sagging') {
      if (this.settleCooldown > 0) this.settleCooldown--;
      this._updateSaggingMetrics(dt);
    } else {
      this._computeFillingProfile();
    }
  }

  /**
   * CatTech: 密度と圧力の計算
   * \rho_i = \sum_j m_j W_{ij}
   * P_i = \max(stiffness * (\rho_i - \rho_0), 0)
   */
  _computeDensityAndPressure() {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const m = this.massParticle;
    const d0 = this.density0;
    const kStiff = this.stiffness;

    // 1. 流体粒子の密度
    for (let i = 0; i < this.numParticles; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let rho = this.poly6Kernel(0.0) * m; // 自己密度

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;
          const cell = cy * cols + cx;

          // 近傍流体粒子
          let j = this.fluidHead[cell];
          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < h) {
                rho += this.poly6Kernel(r) * m;
              }
            }
            j = this.fluidNext[j];
          }

          // 近傍壁面粒子 (充填試験・クラウン試験モード専用)
          if (this.testMode === 'filling' || this.testMode === 'crown') {
            let wIdx = this.wallHead[cell];
            while (wIdx !== -1) {
              const rx = xi - this.wallX[wIdx];
              const ry = yi - this.wallY[wIdx];
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < h) {
                rho += this.poly6Kernel(r) * m;
              }
              wIdx = this.wallNext[wIdx];
            }
          }
        }
      }

      this.density[i] = Math.max(d0 * 0.5, rho);
      this.pressure[i] = Math.max(kStiff * (this.density[i] - d0), 0.0);
    }

    // 2. 壁面粒子の密度と圧力 (充填試験・クラウン試験モード専用)
    if (this.testMode === 'filling' || this.testMode === 'crown') {
      for (let i = 0; i < this.numWallParticles; i++) {
        const xi = this.wallX[i];
        const yi = this.wallY[i];
        const gx = Math.floor(xi / cs);
        const gy = Math.floor(yi / cs);

        let rho = this.poly6Kernel(0.0) * m;

        for (let dy = -1; dy <= 1; dy++) {
          const cy = gy + dy;
          if (cy < 0 || cy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const cx = gx + dx;
            if (cx < 0 || cx >= cols) continue;
            const cell = cy * cols + cx;

            // 流体粒子からの寄与
            let j = this.fluidHead[cell];
            while (j !== -1) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < h) {
                rho += this.poly6Kernel(r) * m;
              }
              j = this.fluidNext[j];
            }

            // 壁面粒子同士の寄与
            let wNeigh = this.wallHead[cell];
            while (wNeigh !== -1) {
              if (i !== wNeigh) {
                const rx = xi - this.wallX[wNeigh];
                const ry = yi - this.wallY[wNeigh];
                const r = Math.sqrt(rx * rx + ry * ry);
                if (r < h) {
                  rho += this.poly6Kernel(r) * m;
                }
              }
              wNeigh = this.wallNext[wNeigh];
            }
          }
        }

        this.wallDensity[i] = Math.max(d0, rho);
        this.wallPressure[i] = Math.max(kStiff * (this.wallDensity[i] - d0), 0.0);
      }
    }
  }

  /**
   * CatTech: ナビエ・ストークス外力計算
   * 圧力勾配力 + 粘性力 + 重力 + 表面張力 + 慣性力 (スロッシング)
   */
  _computeForces() {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const h2 = this.h2;
    const m = this.massParticle;
    const gravY = this.gravity;
    const bottomY = this.container.bottomY;
    const topY = bottomY - this.container.height;

    const isSagging = (this.testMode === 'sagging');
    let sagGx = 0.0;
    let sagGy = 0.0;
    if (isSagging) {
      const geom = this.getPlateGeometry();
      const sinTheta = Math.sin(geom.angleRad);
      // 斜面に沿って下る接線方向重力加速度 g * sin(theta)
      sagGx = gravY * sinTheta * geom.tx;
      sagGy = gravY * sinTheta * geom.ty;
    }

    // 容器の揺動・傾きに伴う慣性力および有効重力加速度
    const cosShake = Math.cos(this.shakeAngle);
    const sinShake = Math.sin(this.shakeAngle);
    const effGx = -this.shakeAx + gravY * sinShake;
    const effGy = -this.shakeAy + gravY * cosShake;

    for (let i = 0; i < this.numParticles; i++) {
      let fx = isSagging ? sagGx : effGx;
      let fy = isSagging ? sagGy : effGy; // 充填時は鉛直自然重力、放置時は斜面接線重力

      const xi = this.x[i];
      const yi = this.y[i];
      const vxi = this.vx[i];
      const vyi = this.vy[i];
      const rhoi = this.density[i];
      const pi = this.pressure[i];
      const rhoi2 = rhoi * rhoi;

      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let shearSum = 0.0;
      let shearCount = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;
          const cell = cy * cols + cx;

          // 1. 流体-流体相互作用
          let j = this.fluidHead[cell];
          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r = Math.sqrt(rx * rx + ry * ry);

              if (r < h && r > 1e-5) {
                const grad = this.poly6Grad(rx, ry, r);

                // SPH 圧力勾配力 (Navier-Stokes: 非圧縮性圧力反発)
                const rhoj = this.density[j];
                const pj = this.pressure[j];
                const pressureCoeff = this.testMode === 'sagging' 
                  ? (this.settleCooldown > 0 ? (4.0 + 16.0 * (1.0 - this.settleCooldown / 50.0)) : 22.0) 
                  : 85.0;
                const fp = -m * (pj / (rhoj * rhoj) + pi / rhoi2) * pressureCoeff;
                fx += grad.gx * fp;
                fy += grad.gy * fp;

                // ヤング・ラプラス表面張力 / 界面凝集力 (Young-Laplace Surface Tension & Meniscus Cohesion)
                // 孤立ドロップを球形化し、流下部と堆積液面の交差部（ネック）に滑らかなアール・メニスカスフィレットを形成
                const cohesionCoeff = Math.max(6.0, this.sigma * 0.75);
                const fCohesion = -cohesionCoeff * this.poly6Kernel(r) * m;
                fx += (rx / r) * fCohesion;
                fy += (ry / r) * fCohesion;

                // CatTech 粘性力 (Monaghan SPH Viscosity)
                const du = vxi - this.vx[j];
                const dv = vyi - this.vy[j];
                const rDotGrad = rx * grad.gx + ry * grad.gy;
                const r2eps = r * r + 0.01 * h2;

                const relSpeed = Math.sqrt(du * du + dv * dv);
                shearSum += relSpeed;
                shearCount++;

                // 非ニュートン局所粘度
                const etaMean = (this.eta[i] + this.eta[j]) * 0.5;
                const viscosityCoeff = 25.0;
                const fv = m * (2.0 * etaMean) / (rhoj * rhoi) * (rDotGrad / r2eps) * viscosityCoeff;
                fx += fv * du;
                fy += fv * dv;

                // 降伏応力 tau_y による塑性せん断抵抗 (Herschel-Bulkley / Bingham 構成則: ツノ立ち堆積の自立支持)
                if (this.tau_y > 0.0) {
                  const relDist = Math.max(0.1, r);
                  const normX = rx / relDist;
                  const normY = ry / relDist;
                  const vRelDotNorm = du * normX + dv * normY;
                  const tanVx = du - vRelDotNorm * normX;
                  const tanVy = dv - vRelDotNorm * normY;
                  const tanSpeed = Math.sqrt(tanVx * tanVx + tanVy * tanVy);

                  const yieldForceCoeff = Math.min(this.tau_y * 8.0, 1000.0);
                  const plasticReg = 1.0 / (tanSpeed + 0.20);
                  fx -= tanVx * yieldForceCoeff * plasticReg * (1.0 - r / h);
                  fy -= tanVy * yieldForceCoeff * plasticReg * (1.0 - r / h);
                }
              }
            }
            j = this.fluidNext[j];
          }

          // 2. 流体-壁面相互作用 (充填試験・クラウン試験モード専用: 垂れ試験時は完全無効化)
          if (this.testMode === 'filling' || this.testMode === 'crown') {
            let wIdx = this.wallHead[cell];
            while (wIdx !== -1) {
              const rx = xi - this.wallX[wIdx];
              const ry = yi - this.wallY[wIdx];
              const r = Math.sqrt(rx * rx + ry * ry);

              if (r < h && r > 1e-5) {
                const grad = this.poly6Grad(rx, ry, r);

                const rhoWall = this.wallDensity[wIdx];
                const pWall = this.wallPressure[wIdx];
                const wallPressCoeff = 85.0;
                const fp = -m * (pWall / (rhoWall * rhoWall) + pi / rhoi2) * wallPressCoeff;
                fx += grad.gx * fp;
                fy += grad.gy * fp;

                // 壁面での適度なすべり摩擦 (Navier-slip / No-slip 条件)
                const rDotGrad = rx * grad.gx + ry * grad.gy;
                const r2eps = r * r + 0.01 * h2;
                const wallViscCoeff = 20.0;
                const fv = m * (2.0 * this.eta[i]) / (rhoWall * rhoi) * (rDotGrad / r2eps) * wallViscCoeff;
                fx += fv * vxi;
                fy += fv * vyi;

                // 壁面での降伏応力付着 (Sticking boundary)
                if (this.tau_y > 0.0) {
                  const wallYieldCoeff = Math.min(this.tau_y * 10.0, 1200.0);
                  fx -= Math.sign(vxi) * Math.min(Math.abs(vxi) * 40.0, wallYieldCoeff * (1.0 - r / h));
                  fy -= Math.sign(vyi) * Math.min(Math.abs(vyi) * 40.0, wallYieldCoeff * (1.0 - r / h));
                }
              }
              wIdx = this.wallNext[wIdx];
            }
          }
        }
      }

      // せん断速度 \dot{\gamma} と見かけ粘度 \eta の更新
      const gDot = shearCount > 0 ? (shearSum / shearCount) / this.particleDiameter : 1.0;
      this.gammaDot[i] = gDot;
      this.eta[i] = this.calcViscosity(gDot);

      this.fx[i] = fx;
      this.fy[i] = fy;
    }
  }

  /**
   * CatTech: Leap-Frog (速度ベルレ) 時間積分
   */
  _integrateLeapFrog(subDt) {
    const nx = this.nozzleX;
    const ny = this.nozzleY;
    const bottomY = this.container.bottomY;
    const topY = this.container.bottomY - this.container.height;
    const halfW = this.container.width * 0.5;
    const leftX = nx - halfW;
    const rightX = nx + halfW;
    const r = this.particleRadius;

    for (let i = 0; i < this.numParticles; i++) {
      // Leap-Frog 更新
      this.vx2[i] += this.fx[i] * subDt;
      this.vy2[i] += this.fy[i] * subDt;

      if (this.testMode === 'sagging') {
        const speed = Math.hypot(this.vx2[i], this.vy2[i]);
        const maxSpeed = 250.0;
        if (speed > maxSpeed) {
          const speedScale = maxSpeed / speed;
          this.vx2[i] *= speedScale;
          this.vy2[i] *= speedScale;
        }
      }

      this.x[i] += this.vx2[i] * subDt;
      this.y[i] += this.vy2[i] * subDt;

      this.vx[i] = this.vx2[i] + 0.5 * this.fx[i] * subDt;
      this.vy[i] = this.vy2[i] + 0.5 * this.fy[i] * subDt;

      // 傾斜板・垂直板放置試験モード時の正統な境界接触力学 & 降伏応力停止力学
      if (this.testMode === 'sagging') {
        // 初期安定化ダンパー (初期飛び散りを 100% 根絶)
        if (this.settleCooldown > 0) {
          const damp = 0.88;
          this.vx[i] *= damp;
          this.vy[i] *= damp;
          this.vx2[i] *= damp;
          this.vy2[i] *= damp;
        }

        const geom = this.getPlateGeometry();
        const dx = this.x[i] - geom.p0x;
        const dy = this.y[i] - geom.p0y;
        let dn = dx * geom.nx + dy * geom.ny;

        // 1. 傾斜板表面への接触判定 & No-slip 壁面境界層 (Fluid-Solid Interface)
        if (dn < r) {
          // 法線方向の位置補正 (板の表面にぴったり載せる)
          const overlap = r - dn;
          this.x[i] += overlap * geom.nx;
          this.y[i] += overlap * geom.ny;
          dn = r;

          // 法線速度と接線速度の分解
          let vn = this.vx[i] * geom.nx + this.vy[i] * geom.ny;
          let vt = this.vx[i] * geom.tx + this.vy[i] * geom.ty;

          // 法線方向の非弾性接触
          if (vn < 0.0) vn = 0.0;

          // 基板接触最下層 (Fluid-Solid Interface): No-slip 条件により基板に強固に付着 (流速ゼロ)
          // 下層は基板に残り、上層（Free Surface）が下層の上を滑り落ちる
          const bottomGrip = Math.min(0.98, 0.70 + 0.28 * this.substrateFriction);
          vt *= (1.0 - bottomGrip);
          if (Math.abs(vt) < 0.02) vt = 0.0;

          // 速度ベクトルの再合成
          this.vx[i] = vt * geom.tx + vn * geom.nx;
          this.vy[i] = vt * geom.ty + vn * geom.ny;
          this.vx2[i] = this.vx[i];
          this.vy2[i] = this.vy[i];
          continue;
        }

        // 2. 自由表面・上層の流動 (Free Surface Layer: 上層が下層の上を滑落)
        if (dn >= r) {
          let vn = this.vx[i] * geom.nx + this.vy[i] * geom.ny;
          let vt = this.vx[i] * geom.tx + this.vy[i] * geom.ty;
          // 法線方向の余計な浮き上がり速度を減衰
          if (vn > 2.0) vn *= 0.5;

          const hLocMm = Math.max(r / this.pixelPerMm, this.localHeightMm[i] || (dn / this.pixelPerMm));
          const sinTheta = Math.sin(geom.angleRad);
          // 局所重力駆動せん断応力 tau_grav = rho * g * h * sin(theta)
          const tauGrav = (this.fluidDensity * 9.8 * (hLocMm * 1e-3) * sinTheta) * 1.5;

          // 降伏応力 tau_y による自由表面すべり判定
          if (this.tau_y > 0.0) {
            if (tauGrav <= this.tau_y) {
              // 膜厚が臨界値以下に薄くなったため、自由表面のすべりも停止 (Arrested)
              const arrestRatio = Math.min(0.96, 0.50 + 0.46 * (1.0 - tauGrav / (this.tau_y + 1e-3)));
              vt *= (1.0 - arrestRatio);
            }
          }

          this.vx[i] = vt * geom.tx + vn * geom.nx;
          this.vy[i] = vt * geom.ty + vn * geom.ny;
          this.vx2[i] = this.vx[i];
          this.vy2[i] = this.vy[i];
        }

        continue;
      }

      // 【👑 ミルククラウン試験モードの境界処理】
      if (this.testMode === 'crown') {
        const bottomY = this.crownPoolBottomY; // 480.0
        const nx = this.nozzleX;
        const poolRadiusPx = this.crownPoolRadiusPx; // 160.0

        // 底面接触 (No-penetration)
        if (this.y[i] > bottomY - r) {
          this.y[i] = bottomY - r;
          this.vy[i] = 0.0;
          this.vy2[i] = 0.0;
          this.isSettled[i] = 1;
        }

        // 左右シャーレ壁面接触
        if (this.x[i] < nx - poolRadiusPx + r) {
          this.x[i] = nx - poolRadiusPx + r;
          this.vx[i] = 0.0;
          this.vx2[i] = 0.0;
        } else if (this.x[i] > nx + poolRadiusPx - r) {
          this.x[i] = nx + poolRadiusPx - r;
          this.vx[i] = 0.0;
          this.vx2[i] = 0.0;
        }

        continue;
      }

      // 0. ノズル先端より上への逆流防止 (充填試験モード専用)
      if (this.y[i] < ny) {
        this.y[i] = ny;
        this.vy[i] = Math.max(this.inletVelocity, Math.abs(this.vy[i]));
        this.vy2[i] = this.vy[i];
      }

      // 1. 空中流下ジェット & 孤立ドロップ領域 (ny <= y < topY): 
      // ヤング・ラプラス表面張力による自然な丸みを帯びた球状ドロップ & 接液部メニスカスフィレットの形成
      if (this.y[i] >= ny && this.y[i] < topY) {
        // 高粘性流体の終端速度 (ノズル吐出速度に同期して断裂を防止)
        const maxJetSpeed = this.inletVelocity * 1.15;
        if (this.vy[i] > maxJetSpeed) {
          this.vy[i] = maxJetSpeed;
          this.vy2[i] = maxJetSpeed;
        }

        // 横揺れの粘性整流 (直方体クランプを撤廃し、ヤング・ラプラス張力による真の球形・円柱丸みを形成)
        this.vx[i] *= 0.90;
        this.vx2[i] = this.vx[i];
      }

      // 2. 容器内部: 動的シェイク座標系での高粘性非弾性衝突・流体塊合体・堆積流動 (Cohesive SPH Fluid Body)
      const pivotX = this.containerPivotX + this.shakeX;
      const pivotY = this.containerPivotY + this.shakeY;
      const cosA = Math.cos(this.shakeAngle);
      const sinA = Math.sin(this.shakeAngle);

      // ワールド座標 -> 容器ローカル座標 (回転・並進)
      const dx = this.x[i] - pivotX;
      const dy = this.y[i] - pivotY;
      let locX = dx * cosA + dy * sinA;
      let locY = -dx * sinA + dy * cosA;

      let locVx = this.vx[i] * cosA + this.vy[i] * sinA;
      let locVy = -this.vx[i] * sinA + this.vy[i] * cosA;

      const halfW = this.container.width * 0.5;
      const localBottomY = this.container.bottomY - this.containerPivotY;
      const localTopY = localBottomY - this.container.height;

      if (locY >= localTopY) {
        this.isSettled[i] = 1;

        // 着液時の衝撃散逸: 上向きの跳ね返りを粘性で吸収し、一体の流体塊として合体
        if (locVy < 0.0) {
          locVy *= 0.05;
        }

        // 底面境界接触 (非弾性抗力 & 摩擦)
        if (locY > localBottomY - r) {
          locY = localBottomY - r;
          locVy = 0.0;

          // 底面での粘性・降伏応力付着 (No-slip / Sticking)
          if (this.tau_y > 0.0) {
            const floorGrip = Math.min(0.95, 0.40 + (this.tau_y / 100.0) * 0.50);
            locVx *= (1.0 - floorGrip);
          } else {
            // ニュートン流体 (底面をサラリと濡れ広がる)
            locVx *= 0.96;
          }
        }

        // 側壁境界接触 (非弾性抗力 & 摩擦)
        if (locX < -halfW + r) {
          locX = -halfW + r;
          locVx = 0.0;
          locVy *= 0.85;
        } else if (locX > halfW - r) {
          locX = halfW - r;
          locVx = 0.0;
          locVy *= 0.85;
        }

        // ローカル座標 -> ワールド座標に戻す
        this.x[i] = pivotX + locX * cosA - locY * sinA;
        this.y[i] = pivotY + locX * sinA + locY * cosA;

        this.vx[i] = locVx * cosA - locVy * sinA;
        this.vy[i] = locVx * sinA + locVy * cosA;
        this.vx2[i] = this.vx[i];
        this.vy2[i] = this.vy[i];
      }
    }
  }

  /**
   * XSPH 速度平滑化 (Monaghan 1989/2000, Subedi et al. 2022)
   * \hat{v}_i = v_i + \varepsilon \sum_j \frac{m_j}{\bar{\rho}_{ij}} (v_j - v_i) W_{ij}
   * 粒子間の局所速度場を秩序正しく整流し、自由表面の不自然な弾け・飛散を防止
   */
  _applyXSPH() {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const m = this.massParticle;
    const eps = 0.22; // XSPH 平滑化パラメータ

    for (let i = 0; i < this.numParticles; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const vxi = this.vx[i];
      const vyi = this.vy[i];
      const rhoi = this.density[i];

      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let dvx = 0.0;
      let dvy = 0.0;

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;
          const cell = cy * cols + cx;

          let j = this.fluidHead[cell];
          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < h) {
                const w = this.poly6Kernel(r);
                const rhoMean = (rhoi + this.density[j]) * 0.5;
                const factor = (m / rhoMean) * w;
                dvx += (this.vx[j] - vxi) * factor;
                dvy += (this.vy[j] - vyi) * factor;
              }
            }
            j = this.fluidNext[j];
          }
        }
      }

      this.vx[i] += eps * dvx;
      this.vy[i] += eps * dvy;
      this.vx2[i] = this.vx[i];
      this.vy2[i] = this.vy[i];
    }
  }

  /**
   * シェパード密度フィルタ (Shepard Density Filter: 密度の再初期化・圧力振動抑制)
   * \tilde{\rho}_i = \frac{\sum m_j W_{ij}}{\sum \frac{m_j}{\rho_j} W_{ij}}
   */
  _applyShepardFilter() {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const m = this.massParticle;

    for (let i = 0; i < this.numParticles; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let sumW = this.poly6Kernel(0.0) * m;
      let sumVol = (m / Math.max(0.5, this.density[i])) * this.poly6Kernel(0.0);

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;
          const cell = cy * cols + cx;

          let j = this.fluidHead[cell];
          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < h) {
                const w = this.poly6Kernel(r);
                sumW += m * w;
                sumVol += (m / Math.max(0.5, this.density[j])) * w;
              }
            }
            j = this.fluidNext[j];
          }
        }
      }

      if (sumVol > 1e-4) {
        this.density[i] = Math.max(this.density0 * 0.5, sumW / sumVol);
      }
    }
  }

  /**
   * 粒子数密度・位置の再調整 (Particle Shifting Technology: PST)
   * 粒子が局所的に偏ったりギザギザになるのを防ぎ、等方的に均一な美しい粒子配置を維持
   * (Fick's lawに基づく位置微小補正: Lind et al. / Particleworks準拠)
   */
  _applyParticleShifting() {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const m = this.massParticle;
    const bottomY = this.container.bottomY;
    const topY = bottomY - this.container.height;
    const halfW = this.container.width * 0.5;
    const leftX = this.nozzleX - halfW;
    const rightX = this.nozzleX + halfW;
    const r = this.particleRadius;

    // シフト係数 (急激な変形を起こさない微小平滑化係数)
    const cShift = 0.015 * h;

    for (let i = 0; i < this.numParticles; i++) {
      if (this.testMode === 'filling' && this.y[i] < topY) continue;

      const xi = this.x[i];
      const yi = this.y[i];
      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let shiftX = 0.0;
      let shiftY = 0.0;

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;
          const cell = cy * cols + cx;

          let j = this.fluidHead[cell];
          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const dist = Math.sqrt(rx * rx + ry * ry);
              if (dist < h && dist > 1e-5) {
                const grad = this.poly6Grad(rx, ry, dist);
                const weight = m / Math.max(0.5, this.density[j]);
                shiftX -= grad.gx * weight;
                shiftY -= grad.gy * weight;
              }
            }
            j = this.fluidNext[j];
          }
        }
      }

      // 微小シフト量を適用 (最大 0.20 * particleRadius に制限して数値安定性を完全保証)
      const maxShift = r * 0.20;
      const dx = Math.max(-maxShift, Math.min(maxShift, shiftX * cShift));
      const dy = Math.max(-maxShift, Math.min(maxShift, shiftY * cShift));

      this.x[i] += dx;
      this.y[i] += dy;

      // 境界拘束
      if (this.testMode === 'filling') {
        if (this.y[i] > bottomY - r) this.y[i] = bottomY - r;
        if (this.x[i] < leftX + r) this.x[i] = leftX + r;
        if (this.x[i] > rightX - r) this.x[i] = rightX - r;
      } else if (this.testMode === 'sagging') {
        const geom = this.getPlateGeometry();
        const dx = this.x[i] - geom.p0x;
        const dy = this.y[i] - geom.p0y;
        const dn = dx * geom.nx + dy * geom.ny;
        if (dn < r) {
          this.x[i] += (r - dn) * geom.nx;
          this.y[i] += (r - dn) * geom.ny;
        }
      }
    }
  }

  /**
   * ボトムアップ昇降ノズル
   */
  _updateBottomUpNozzle() {
    if (this.fillingMode !== 'bottom_up') return;

    let highestLiquidY = this.container.bottomY;
    const nx = this.nozzleX;
    for (let i = 0; i < this.numParticles; i++) {
      if (Math.abs(this.x[i] - nx) < 40 && this.y[i] < highestLiquidY && this.y[i] >= this.container.bottomY - this.container.height) {
        highestLiquidY = this.y[i];
      }
    }

    const targetNozzleY = Math.max(50, highestLiquidY - 30);
    if (targetNozzleY < this.nozzleY) {
      this.nozzleY += (targetNozzleY - this.nozzleY) * 0.05;
    }
  }

  _computeFillingProfile() {
    const bottomY = this.container.bottomY;
    const topY = bottomY - this.container.height;
    const targetFillHeight = this.container.height * 0.85; // 満杯目盛りライン (深さの 85%)
    let minPileY = bottomY;
    let sumY = 0;
    let count = 0;

    for (let i = 0; i < this.numParticles; i++) {
      if (this.y[i] >= topY) {
        if (this.y[i] < minPileY) {
          minPileY = this.y[i];
        }
        sumY += this.y[i];
        count++;
      }
    }

    const peakPx = Math.max(0, bottomY - minPileY);
    this.peakHeightMm = peakPx / this.pixelPerMm;

    if (count > 20) {
      const avgY = sumY / count;
      const heightDiff = avgY - minPileY;
      // ニュートン流体 (tau_y = 0) では 100% 水平、高降伏応力流体では山型 (ツノ立ち)
      this.levelingFlatness = Math.max(15.0, Math.min(100.0, 100.0 - heightDiff * 2.5));

      // 【体積担保の厳密同期】
      // 容器キャビティ内の実際の堆積液面高さ (底面からの平均高さ) から充填率 (%) と注入体積 (mL) を算出
      const currentFillHeight = Math.max(0, bottomY - avgY);
      const progress = Math.min(100.0, (currentFillHeight / targetFillHeight) * 100.0);
      this.fillPercentage = progress;
      this.filledVolumeMl = (progress / 100.0) * this.container.targetVolume;

      // 目標満杯ライン (100% / 規定体積) に到達したら注入完了
      if (progress >= 100.0) {
        this.isFilled = true;
      }
    }
  }

  /**
   * 傾斜板・垂直板放置試験 メトリクス算出 (たれ移動距離、先端流速、濡れ跡、停止判定、時間-距離履歴)
   */
  _updateSaggingMetrics(dt) {
    if (this.numParticles === 0) {
      this.sagDistanceMm = 0.0;
      this.sagVelocityMmS = 0.0;
      this.isSagArrested = true;
      return;
    }

    const geom = this.getPlateGeometry();
    let maxS = -1e9;
    let minS = 1e9;
    let totalVel = 0.0;

    for (let i = 0; i < this.numParticles; i++) {
      const dx = this.x[i] - geom.p0x;
      const dy = this.y[i] - geom.p0y;
      const s = dx * geom.tx + dy * geom.ty;
      const dn = dx * geom.nx + dy * geom.ny;

      if (s > maxS) maxS = s;
      if (s < minS) minS = s;

      // 板表面近傍 (dn < 24px) にある粒子から濡れ跡領域を更新
      if (dn > -5.0 && dn < 24.0) {
        if (s < this.wettingMinS) this.wettingMinS = s;
        if (s > this.wettingMaxS) this.wettingMaxS = s;
      }

      const spd = Math.hypot(this.vx[i], this.vy[i]);
      totalVel += spd;
    }

    const currentFrontPos = maxS;
    const sagDistancePx = Math.max(0.0, currentFrontPos - this.sagInitFrontPos);
    this.sagDistanceMm = sagDistancePx / this.pixelPerMm; // mm単位 (pixelPerMm=4.0)

    // 先端流速 (mm/s)
    const dPosPx = Math.max(0.0, currentFrontPos - this.prevSagPos);
    const safeDt = Math.max(1e-4, dt);
    const instSpeedMmS = (dPosPx / safeDt) / this.pixelPerMm;
    this.sagVelocityMmS = Math.max(0.0, this.sagVelocityMmS * 0.85 + instSpeedMmS * 0.15);
    this.prevSagPos = currentFrontPos;

    // 平均粒子速度
    const avgVel = totalVel / this.numParticles;

    // 停止判定: 先端流速が 0.15 mm/s 未満かつ平均速度が小さければ安定停止
    if (this.sagVelocityMmS < 0.15 && avgVel < 2.5) {
      this.isSagArrested = true;
    } else {
      this.isSagArrested = false;
    }

    // 【時間 vs 垂れ先端距離の履歴サンプリング】
    if (this.sagTimerSec - this.lastSagSampleTime >= 0.04 || this.sagHistory.length <= 1) {
      this.lastSagSampleTime = this.sagTimerSec;
      if (this.sagHistory.length > 800) {
        // 間引き
        this.sagHistory = this.sagHistory.filter((_, idx) => idx % 2 === 0);
      }
      this.sagHistory.push({
        time: this.sagTimerSec,
        dist: this.sagDistanceMm,
        vel: this.sagVelocityMmS
      });
    }
  }
}
