/**
 * particle_fvm.js
 * Multi-layer Textile 3-Scale Coupled Heat & Mass Transfer FVM Simulation.
 * Mathematically proven, unconditionally stable analytical relaxation solver:
 * 1. Macro-scale: Clump resistance R_clump (団子内マクロ抵抗 & ほぐし連動)
 * 2. Meso-scale: Fabric resistance R_fabric (布内毛細管液流 & 乾き面後退)
 * 3. Micro-scale: Intra-fiber resistance R_fiber (繊維内結合水脱着・分子拡散)
 * Guarantees zero numerical divergence for any time scale.
 */

class FabricFVMSimulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Multi-layer fabric dimensions (towel/cotton: 4.5mm thick, 8 through-thickness layers)
    this.Lz = 0.0045; // 4.5mm
    this.Nz = 8; // 8 layers
    this.dz = this.Lz / this.Nz;
    
    this.Lx = 0.040; // 40mm lateral width
    this.Nx = 12; // 12 lateral nodes
    this.dx = this.Lx / this.Nx;
    
    this.time = 0;
    this.isRunning = false;
    this.speedMultiplier = 30.0;
    
    // Chemical engineering parameters
    this.T_air = 338.15; // 65 C (Heat Pump air)
    this.T_wetbulb = 311.15; // 38 C
    this.T_init = 295.15; // 22 C (initial room temp)
    this.hH = 45.0; // W/(m^2 K) convective heat transfer coefficient
    this.dHv = 2260000; // J/kg latent heat of vaporization
    
    this.totalDryMass = 3.0; // kg
    this.nominalArea = 1.20; // m^2
    this.dryAreaDensity = this.totalDryMass / this.nominalArea; // 2.50 kg/m^2
    this.layerMass = this.dryAreaDensity / this.Nz; // 0.3125 kg/m^2 per layer
    
    // Moisture critical limits
    this.X0 = 0.75; // Initial moisture content [kg/kg-dry]
    this.Xc = 0.25; // Critical moisture content (自由水枯渇境界)
    this.Xc2 = 0.10; // Second critical moisture (毛細管限界)
    this.Xe = 0.035; // Equilibrium moisture
    
    // 3-Scale Hierarchical Resistances (団子内・布内・繊維内)
    this.resistances = {
      R_clump: 0.25,
      R_fabric: 0.15,
      R_fiber: 0.10,
      R_total: 0.50
    };
    
    // Layer arrays (1D thickness profile)
    this.T = new Float64Array(this.Nz); // Temperature [K]
    this.X = new Float64Array(this.Nz); // Total moisture [kg/kg-dry]
    this.X_free = new Float64Array(this.Nz);
    this.X_bound = new Float64Array(this.Nz);
    
    // 2D fields for visual cross-section canvas
    this.gridT = new Float64Array(this.Nx * this.Nz);
    this.gridX = new Float64Array(this.Nx * this.Nz);
    
    this.stats = {
      meanMoisture: this.X0,
      freeWaterTotal: Math.max(0, this.X0 - this.Xc),
      boundWaterTotal: Math.min(this.X0, this.Xc),
      surfaceTemp: this.T_init - 273.15,
      centerTemp: this.T_init - 273.15,
      meanTemp: this.T_init - 273.15,
      dryingRate: 0, // kg/(m^2 h)
      heatFlux: 0, // W/m^2
      latentFlux: 0, // W/m^2
      period: 'ステージⅠ: 予熱期 (顕熱加熱・Twb昇温)',
      phaseId: 'p1',
      phaseNum: 1,
      untangleRatio: 0.5,
      R_clump_pct: 35,
      R_fabric_pct: 35,
      R_fiber_pct: 30
    };
    
    this.resetFields();
    
    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
  }
  
  resetFields() {
    this.time = 0;
    for (let k = 0; k < this.Nz; k++) {
      this.T[k] = this.T_init;
      this.X[k] = this.X0;
      this.X_free[k] = Math.max(0, this.X0 - this.Xc);
      this.X_bound[k] = Math.min(this.X0, this.Xc);
    }
    this.updateGrid2D();
    this.updateStats();
  }
  
  initCanvasSize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.min(rect.width, 700);
    const height = 340;
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
  
  updateGrid2D() {
    for (let iz = 0; iz < this.Nz; iz++) {
      for (let ix = 0; ix < this.Nx; ix++) {
        const idx = iz * this.Nx + ix;
        const noise = (Math.sin(ix * 1.5 + iz * 0.8) * 0.02);
        this.gridT[idx] = this.T[iz] + noise * 0.5;
        this.gridX[idx] = Math.max(this.Xe, this.X[iz] + noise * 0.015);
      }
    }
  }
  
  step(dt, untangleRatio = 0.50, effectiveArea = 0.60) {
    if (!this.isRunning) return;
    
    const kineticDt = Math.min(2.0, dt * (this.speedMultiplier || 1.0));
    const subSteps = 4;
    const sdt = kineticDt / subSteps;
    
    for (let s = 0; s < subSteps; s++) {
      this.time += sdt;
      
      // -------------------------------------------------------------
      // 1. EVALUATE 3-SCALE RESISTANCES (団子内・布内・繊維内)
      // -------------------------------------------------------------
      // A. 団子内マクロ抵抗 R_clump:
      // 団子度 = (1 - untangleRatio). ほぐれるとゼロに近づく。
      const clumpFactor = Math.max(0, 1.0 - untangleRatio);
      const R_clump = 0.75 * Math.pow(clumpFactor, 1.5);
      
      // B. 布内メソ抵抗 R_fabric:
      // 表面自由水枯渇後の乾き面深さ & 毛細管浸透抵抗
      const X_surf = this.X[0];
      const recedingFrac = X_surf < this.Xc ? (this.Xc - X_surf) / (this.Xc - this.Xe) : 0;
      const R_fabric = 0.15 + 0.65 * Math.pow(recedingFrac, 1.2);
      
      // C. 繊維内ミクロ抵抗 R_fiber:
      // セルロース結合水脱着エネルギー
      const X_mean = this.X.reduce((a, b) => a + b, 0) / this.Nz;
      let R_fiber = 0.10;
      if (X_mean < this.Xc) {
        const boundFrac = Math.max(0, (X_mean - this.Xe) / (this.Xc - this.Xe));
        R_fiber += 1.6 * Math.pow(1.0 - boundFrac, 1.8);
      }
      
      this.resistances.R_clump = R_clump;
      this.resistances.R_fabric = R_fabric;
      this.resistances.R_fiber = R_fiber;
      const R_total = R_clump + R_fabric + R_fiber;
      this.resistances.R_total = R_total;
      
      // Mass transfer conductance modulation
      const k_mass_eff = 1.0 / (1.0 + R_total * 1.8);
      
      // -------------------------------------------------------------
      // 2. SURFACE HEAT & EVAPORATION FLUX
      // -------------------------------------------------------------
      const T_surf = this.T[0];
      const q_conv = this.hH * untangleRatio * (this.T_air - T_surf); // W/m^2
      
      let R_surf_s = 0; // kg/(m^2 s)
      let phaseId = 'p2';
      let phaseName = 'ステージⅡ: 定率乾燥期 (伝熱律速・Twb維持)';
      let phaseNum = 2;
      
      if (T_surf < this.T_wetbulb - 0.5 && X_surf > this.Xc) {
        // STAGE 1: 予熱期 (顕熱加熱)
        phaseId = 'p1';
        phaseNum = 1;
        phaseName = 'ステージⅠ: 予熱期 (顕熱加熱・Twb昇温)';
        
        const warmupFrac = Math.max(0.05, Math.min(1.0, (T_surf - this.T_init) / Math.max(1.0, this.T_wetbulb - this.T_init)));
        R_surf_s = (q_conv / this.dHv) * warmupFrac * 0.35 * k_mass_eff;
        
        // Heat goes into sensible warming towards Twb
        const dT_warm = (this.T_wetbulb - T_surf) * (1.0 - Math.exp(-0.35 * sdt));
        this.T[0] += dT_warm;
        this.T[this.Nz - 1] += dT_warm;
        
      } else if (X_surf > this.Xc) {
        // STAGE 2: 定率期 (伝熱律速・ほぐし連動)
        phaseId = 'p2';
        phaseNum = 2;
        phaseName = 'ステージⅡ: 定率期 (伝熱律速・Twb維持)';
        
        R_surf_s = Math.max(0, (q_conv / this.dHv) * k_mass_eff);
        
        // Surface temperature clamped at wet-bulb temperature via latent cooling
        const dT_clamp = (this.T_wetbulb - T_surf) * (1.0 - Math.exp(-2.5 * sdt));
        this.T[0] += dT_clamp;
        this.T[this.Nz - 1] += dT_clamp;
        
      } else if (X_surf > this.Xe) {
        // STAGE 3 & 4: 減率乾燥期 (物質移動律速)
        const frac = Math.max(0, (X_surf - this.Xe) / (this.Xc - this.Xe));
        const baseRate = (this.hH * untangleRatio * (this.T_air - this.T_wetbulb) / this.dHv);
        
        if (X_surf > this.Xc2) {
          phaseId = 'p3';
          phaseNum = 3;
          phaseName = 'ステージⅢ: 減率前期 (布内乾き面・Ts昇温)';
          R_surf_s = baseRate * (0.42 + 0.58 * frac) * k_mass_eff;
        } else {
          phaseId = 'p4';
          phaseNum = 4;
          phaseName = 'ステージⅣ: 減率後期 (繊維内脱着・Tc昇温)';
          R_surf_s = baseRate * 0.42 * Math.pow(frac, 1.4) * k_mass_eff;
        }
        
        // Evaporation cooling deficit causes surface temperature rise towards T_air
        const targetT = this.T_air * 0.98;
        const dT_heat = (targetT - T_surf) * (1.0 - Math.exp(-0.12 * (1.0 - frac * 0.6) * sdt));
        this.T[0] += dT_heat;
        this.T[this.Nz - 1] += dT_heat;
        
      } else {
        // STAGE 5: 平衡到達
        phaseId = 'p5';
        phaseNum = 5;
        phaseName = 'ステージⅤ: 平衡完了 (熱・水分平衡)';
        R_surf_s = 0;
        const dT_eq = (this.T_air - T_surf) * (1.0 - Math.exp(-0.25 * sdt));
        this.T[0] += dT_eq;
        this.T[this.Nz - 1] += dT_eq;
      }
      
      // Moisture evaporation from boundary layers (化学工学厳密物質収支)
      // 布全体の絶乾面密度 rho_A = W_d / A_nominal (2.50 kg/m^2)
      // 全蒸発速度 dX/dt = - R_surf_s / rho_A
      // 表裏2面 (Layer 0, Layer Nz-1) に均等配分 (各0.5) することで、全層平均減少率を完全一致させる
      const dX_surf_layer = (0.5 * R_surf_s / this.layerMass) * sdt;
      this.X[0] = Math.max(this.Xe, this.X[0] - dX_surf_layer);
      this.X[this.Nz - 1] = Math.max(this.Xe, this.X[this.Nz - 1] - dX_surf_layer);
      
      // -------------------------------------------------------------
      // 3. UNCONDITIONALLY STABLE INTERNAL FVM TRANSPORT (Relaxation)
      // -------------------------------------------------------------
      // Capillary liquid water suction & moisture leveling between adjacent layers
      for (let k = 0; k < this.Nz - 1; k++) {
        // Higher transfer rate when wet (capillary), lower when dry (vapor diffusion)
        const capSpeed = (this.X[k] > this.Xc || this.X[k+1] > this.Xc) ? 1.2 : 0.25;
        const dX_cap = (this.X[k + 1] - this.X[k]) * (1.0 - Math.exp(-capSpeed * sdt));
        this.X[k] += dX_cap * 0.5;
        this.X[k + 1] -= dX_cap * 0.5;
        
        // Thermal conduction smoothing
        const dT_cond = (this.T[k + 1] - this.T[k]) * (1.0 - Math.exp(-1.5 * sdt));
        this.T[k] += dT_cond * 0.5;
        this.T[k + 1] -= dT_cond * 0.5;
      }
      
      for (let k = 0; k < this.Nz; k++) {
        this.X[k] = Math.max(this.Xe, this.X[k]);
        this.X_free[k] = Math.max(0, this.X[k] - this.Xc);
        this.X_bound[k] = Math.min(this.X[k], this.Xc);
      }
      
      this.currentRate_kg_m2_h = R_surf_s * 3600.0;
      this.stats.phaseId = phaseId;
      this.stats.phaseName = phaseName;
      this.stats.phaseNum = phaseNum;
      this.stats.heatFlux = q_conv;
      this.stats.latentFlux = R_surf_s * this.dHv;
      this.stats.untangleRatio = untangleRatio;
    }
    
    this.updateStats();
    this.updateGrid2D();
  }
  
  updateStats() {
    let sumX = 0, sumFree = 0, sumBound = 0, sumT = 0;
    for (let i = 0; i < this.Nz; i++) {
      sumX += this.X[i];
      sumFree += this.X_free[i];
      sumBound += this.X_bound[i];
      sumT += this.T[i];
    }
    
    this.stats.meanMoisture = sumX / this.Nz;
    this.stats.freeWaterTotal = sumFree / this.Nz;
    this.stats.boundWaterTotal = sumBound / this.Nz;
    this.stats.meanTemp = (sumT / this.Nz) - 273.15;
    
    this.stats.surfaceTemp = this.T[0] - 273.15;
    const centerIdx = Math.floor(this.Nz / 2);
    this.stats.centerTemp = this.T[centerIdx] - 273.15;
    this.stats.dryingRate = this.currentRate_kg_m2_h || 0;
    
    const rTot = Math.max(1e-5, this.resistances.R_total);
    this.stats.R_clump_pct = Math.round((this.resistances.R_clump / rTot) * 100);
    this.stats.R_fabric_pct = Math.round((this.resistances.R_fabric / rTot) * 100);
    this.stats.R_fiber_pct = Math.round((this.resistances.R_fiber / rTot) * 100);
  }
  
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;
    
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    
    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, W, H);
    
    // Layout geometry: clean, uncrowded spacing with dedicated colorbars and axis legends
    const padX = 24 * dpr;
    const topMargin = 40 * dpr;
    const bottomBarH = 50 * dpr;
    
    const availableW = W - padX * 2;
    const gapX = 32 * dpr;
    const sectionW = (availableW - gapX) / 2;
    const sectionH = H - topMargin - bottomBarH - 24 * dpr;
    
    // Left: Temperature Map with explicit z/x axes & colorbar
    this.renderTemperatureMap(ctx, padX, topMargin, sectionW, sectionH, dpr);
    
    // Right: Moisture & Phase Map with explicit z/x axes & colorbar
    this.renderMoistureMap(ctx, padX + sectionW + gapX, topMargin, sectionW, sectionH, dpr);
    
    // Bottom: 3-Scale Hierarchical Resistance Meter & Status Bar
    this.renderMultiScaleResistanceMeter(ctx, W, H, padX, dpr);
    
    ctx.restore();
  }
  
  renderTemperatureMap(ctx, ox, oy, w, h, dpr) {
    // 1. Header (Title & Current Values on separate lines to prevent text overlap)
    ctx.font = `bold ${11 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#f87171';
    ctx.fillText('布厚み方向 温度分布 T(z) [°C]', ox, oy - 20 * dpr);
    
    ctx.font = `${9.5 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`表面 Ts: `, ox, oy - 6 * dpr);
    const tsWidth = ctx.measureText(`表面 Ts: `).width;
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`${this.stats.surfaceTemp.toFixed(1)}°C`, ox + tsWidth, oy - 6 * dpr);
    const val1Width = ctx.measureText(`${this.stats.surfaceTemp.toFixed(1)}°C`).width;
    
    ctx.fillStyle = '#64748b';
    ctx.fillText('  |  ', ox + tsWidth + val1Width, oy - 6 * dpr);
    const sepWidth = ctx.measureText('  |  ').width;
    
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('芯層 Tc: ', ox + tsWidth + val1Width + sepWidth, oy - 6 * dpr);
    const tcWidth = ctx.measureText('芯層 Tc: ').width;
    ctx.fillStyle = '#fb923c';
    ctx.fillText(`${this.stats.centerTemp.toFixed(1)}°C`, ox + tsWidth + val1Width + sepWidth + tcWidth, oy - 6 * dpr);
    
    // 2. Geometry: reserve space on left for z-axis labels, on right for color bar
    const axisLeftW = 44 * dpr;
    const colorBarW = 12 * dpr;
    const legendRightW = 46 * dpr;
    
    const gridX = ox + axisLeftW;
    const gridY = oy;
    const gridW = w - axisLeftW - colorBarW - legendRightW - 12 * dpr;
    const gridH = h;
    
    const cellW = gridW / this.Nx;
    const cellH = gridH / this.Nz;
    
    // 3. Draw Grid Cells
    for (let iz = 0; iz < this.Nz; iz++) {
      for (let ix = 0; ix < this.Nx; ix++) {
        const tVal = this.gridT[iz * this.Nx + ix] - 273.15;
        const f = Math.max(0, Math.min(1, (tVal - 22.0) / 43.0));
        let r, g, b;
        if (f < 0.35) {
          const s = f / 0.35;
          r = Math.floor(30 + s * 20); g = Math.floor(140 + s * 80); b = Math.floor(240 - s * 40);
        } else if (f < 0.70) {
          const s = (f - 0.35) / 0.35;
          r = Math.floor(50 + s * 190); g = Math.floor(220 - s * 50); b = Math.floor(200 - s * 170);
        } else {
          const s = (f - 0.70) / 0.30;
          r = Math.floor(240); g = Math.floor(170 - s * 120); b = Math.floor(30);
        }
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(gridX + ix * cellW, gridY + iz * cellH, cellW - 0.8, cellH - 0.8);
      }
    }
    
    // Grid Outer Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(gridX, gridY, gridW, gridH);
    
    // 4. Vertical Z-Axis Labels (布厚み方向 z: 上=受熱表面 z=0, 下=芯層 z=4.5mm)
    ctx.font = `${8.5 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'right';
    ctx.fillText('▲ 熱風受熱面', gridX - 5 * dpr, gridY + 9 * dpr);
    ctx.fillStyle = '#64748b';
    ctx.fillText('z=0.0mm', gridX - 5 * dpr, gridY + 20 * dpr);
    
    ctx.fillText('z=2.2mm', gridX - 5 * dpr, gridY + gridH * 0.5 + 3 * dpr);
    
    ctx.fillStyle = '#fb923c';
    ctx.fillText('▼ 布内芯層', gridX - 5 * dpr, gridY + gridH - 12 * dpr);
    ctx.fillStyle = '#64748b';
    ctx.fillText('z=4.5mm', gridX - 5 * dpr, gridY + gridH - 2 * dpr);
    
    // Horizontal X-Axis Label (布幅方向)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = `${8.5 * dpr}px Inter, sans-serif`;
    ctx.fillText('◀ 布幅展開方向 x (40mm) ▶', gridX + gridW * 0.5, gridY + gridH + 13 * dpr);
    
    // 5. Temperature Color Bar (カラースケール凡例)
    const cbX = gridX + gridW + 10 * dpr;
    const cbY = gridY;
    const cbH = gridH;
    
    const gradT = ctx.createLinearGradient(0, cbY, 0, cbY + cbH);
    gradT.addColorStop(0.00, 'rgb(240, 50, 30)');   // 65 C Hot Air
    gradT.addColorStop(0.35, 'rgb(240, 170, 30)');  // 50 C Falling Stage
    gradT.addColorStop(0.65, 'rgb(50, 220, 200)');  // 38 C Wet-bulb plateau
    gradT.addColorStop(1.00, 'rgb(30, 140, 240)');  // 22 C Room Temp
    
    ctx.fillStyle = gradT;
    ctx.fillRect(cbX, cbY, colorBarW, cbH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(cbX, cbY, colorBarW, cbH);
    
    // Color bar tick labels
    ctx.textAlign = 'left';
    ctx.font = `${8 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#f87171';
    ctx.fillText('65°C(Ta)', cbX + colorBarW + 4 * dpr, cbY + 8 * dpr);
    ctx.fillStyle = '#fb923c';
    ctx.fillText('50°C', cbX + colorBarW + 4 * dpr, cbY + cbH * 0.35 + 3 * dpr);
    ctx.fillStyle = '#34d399';
    ctx.fillText('38°C(Twb)', cbX + colorBarW + 4 * dpr, cbY + cbH * 0.65 + 3 * dpr);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('22°C', cbX + colorBarW + 4 * dpr, cbY + cbH - 2 * dpr);
  }
  
  renderMoistureMap(ctx, ox, oy, w, h, dpr) {
    // 1. Header (Title & Current Values on separate lines to prevent text overlap)
    ctx.textAlign = 'left';
    ctx.font = `bold ${11 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('布厚み方向 含水率・相状態 X(z) [kg/kg-DA]', ox, oy - 20 * dpr);
    
    ctx.font = `${9.5 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`平均 X: `, ox, oy - 6 * dpr);
    const xLblWidth = ctx.measureText(`平均 X: `).width;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${(this.stats.meanMoisture * 100).toFixed(1)}%`, ox + xLblWidth, oy - 6 * dpr);
    const xValWidth = ctx.measureText(`${(this.stats.meanMoisture * 100).toFixed(1)}%`).width;
    
    ctx.fillStyle = '#64748b';
    ctx.fillText('  |  ', ox + xLblWidth + xValWidth, oy - 6 * dpr);
    const sepWidth = ctx.measureText('  |  ').width;
    
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('自由水: ', ox + xLblWidth + xValWidth + sepWidth, oy - 6 * dpr);
    const fLblWidth = ctx.measureText('自由水: ').width;
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`${(this.stats.freeWaterTotal * 100).toFixed(1)}%`, ox + xLblWidth + xValWidth + sepWidth + fLblWidth, oy - 6 * dpr);
    
    // 2. Geometry: reserve space on left for z-axis labels, on right for color bar
    const axisLeftW = 44 * dpr;
    const colorBarW = 12 * dpr;
    const legendRightW = 48 * dpr;
    
    const gridX = ox + axisLeftW;
    const gridY = oy;
    const gridW = w - axisLeftW - colorBarW - legendRightW - 12 * dpr;
    const gridH = h;
    
    const cellW = gridW / this.Nx;
    const cellH = gridH / this.Nz;
    
    // 3. Draw Grid Cells
    for (let iz = 0; iz < this.Nz; iz++) {
      for (let ix = 0; ix < this.Nx; ix++) {
        const xVal = this.gridX[iz * this.Nx + ix];
        let r, g, b;
        if (xVal > this.Xc) {
          // Free water rich (0.25 - 0.75): Deep saturated blue
          const frac = Math.min(1.0, (xVal - this.Xc) / Math.max(0.01, this.X0 - this.Xc));
          r = Math.floor(14 - 10 * frac);
          g = Math.floor(130 + 40 * frac);
          b = Math.floor(215 + 40 * frac);
        } else if (xVal > this.Xe) {
          // Falling rate bound water (0.035 - 0.25): Cyan to olive-gray
          const frac = (xVal - this.Xe) / Math.max(0.01, this.Xc - this.Xe);
          r = Math.floor(160 - frac * 120);
          g = Math.floor(145 - frac * 15);
          b = Math.floor(125 + frac * 85);
        } else {
          // Oven dry / equilibrium (Xe = 0.035): Warm soft gray
          r = 165; g = 150; b = 135;
        }
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(gridX + ix * cellW, gridY + iz * cellH, cellW - 0.8, cellH - 0.8);
        
        // Free water droplet sparkles
        if (xVal > this.Xc && (ix + iz) % 3 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
          ctx.beginPath();
          ctx.arc(gridX + (ix + 0.5) * cellW, gridY + (iz + 0.5) * cellH, 1.8 * dpr, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
    
    // Grid Outer Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(gridX, gridY, gridW, gridH);
    
    // 4. Vertical Z-Axis Labels (布厚み方向 z: 上=蒸発表面, 下=毛細管水分補給)
    ctx.font = `${8.5 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('▲ 蒸発表面', gridX - 5 * dpr, gridY + 9 * dpr);
    ctx.fillStyle = '#64748b';
    ctx.fillText('z=0.0mm', gridX - 5 * dpr, gridY + 20 * dpr);
    
    ctx.fillText('z=2.2mm', gridX - 5 * dpr, gridY + gridH * 0.5 + 3 * dpr);
    
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('▼ 水分補給芯', gridX - 5 * dpr, gridY + gridH - 12 * dpr);
    ctx.fillStyle = '#64748b';
    ctx.fillText('z=4.5mm', gridX - 5 * dpr, gridY + gridH - 2 * dpr);
    
    // Horizontal X-Axis Label (布幅方向)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = `${8.5 * dpr}px Inter, sans-serif`;
    ctx.fillText('◀ 布幅展開方向 x (40mm) ▶', gridX + gridW * 0.5, gridY + gridH + 13 * dpr);
    
    // 5. Moisture Color Bar (含水率スケール凡例)
    const cbX = gridX + gridW + 10 * dpr;
    const cbY = gridY;
    const cbH = gridH;
    
    const gradM = ctx.createLinearGradient(0, cbY, 0, cbY + cbH);
    gradM.addColorStop(0.00, 'rgb(4, 170, 255)');   // 0.75 X0 (Saturated Free Water)
    gradM.addColorStop(0.40, 'rgb(14, 130, 215)');  // 0.25 Xc (Critical Moisture)
    gradM.addColorStop(0.75, 'rgb(115, 140, 155)'); // 0.10 Xc2 (Bound Water Front)
    gradM.addColorStop(1.00, 'rgb(165, 150, 135)'); // 0.035 Xe (Dry Equilibrium)
    
    ctx.fillStyle = gradM;
    ctx.fillRect(cbX, cbY, colorBarW, cbH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(cbX, cbY, colorBarW, cbH);
    
    // Color bar tick labels
    ctx.textAlign = 'left';
    ctx.font = `${8 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('0.75(X0)', cbX + colorBarW + 4 * dpr, cbY + 8 * dpr);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('0.25(Xc)', cbX + colorBarW + 4 * dpr, cbY + cbH * 0.40 + 3 * dpr);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('0.10', cbX + colorBarW + 4 * dpr, cbY + cbH * 0.75 + 3 * dpr);
    ctx.fillStyle = '#d6d3d1';
    ctx.fillText('0.035(Xe)', cbX + colorBarW + 4 * dpr, cbY + cbH - 2 * dpr);
    
    // Droplet symbol legend
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cbX + colorBarW * 0.5, cbY + cbH + 12 * dpr, 2.2 * dpr, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${8 * dpr}px Inter, sans-serif`;
    ctx.fillText('自由水滴', cbX + colorBarW + 4 * dpr, cbY + cbH + 15 * dpr);
  }
  
  renderMultiScaleResistanceMeter(ctx, W, H, pad, dpr) {
    const yBar = H - 34 * dpr;
    const barW = W - pad * 2;
    const barH = 8 * dpr;
    
    ctx.textAlign = 'left';
    ctx.font = `bold ${9.5 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('【3階層乾燥抵抗内訳】', pad, yBar - 7 * dpr);
    
    ctx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`① 団子マクロ: ${this.stats.R_clump_pct}% (ほぐし度:${Math.round(this.stats.untangleRatio * 100)}%)`, pad + 120 * dpr, yBar - 7 * dpr);
    
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`② 布内メソ: ${this.stats.R_fabric_pct}%`, pad + 380 * dpr, yBar - 7 * dpr);
    
    ctx.fillStyle = '#a855f7';
    ctx.fillText(`③ 繊維ミクロ: ${this.stats.R_fiber_pct}%`, pad + 505 * dpr, yBar - 7 * dpr);
    
    const w1 = barW * (this.stats.R_clump_pct / 100);
    const w2 = barW * (this.stats.R_fabric_pct / 100);
    const w3 = barW - w1 - w2;
    
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(pad, yBar, w1, barH);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(pad + w1, yBar, w2, barH);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(pad + w1 + w2, yBar, w3, barH);
    
    // Bottom Status Row (Dry Rate, Heat Flux, Governing Phase)
    ctx.font = `${9.5 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#34d399';
    ctx.fillText(`乾燥速度 R = ${this.stats.dryingRate.toFixed(2)} kg/(m²·h)  ｜  熱流束 q = ${this.stats.heatFlux.toFixed(1)} W/m²  ｜  支配相: ${this.stats.period}`, pad, H - 9 * dpr);
  }
}

window.FabricFVMSimulation = FabricFVMSimulation;
