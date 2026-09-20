/**
 * pod_rom.js
 * Chemical Engineering Drying Kinetics & Thermodynamic Characteristic Curves Engine
 * Based on classic Drying Theory (Constant Rate Period & Falling Rate Period Phases I-V).
 */

class ChemicalEngineeringDryingModel {
  constructor() {
    // Chemical Engineering Default Parameters
    this.params = {
      Ta: 65.0,          // Hot air dry-bulb temperature [°C]
      RHa: 15.0,         // Hot air relative humidity [%]
      hH: 45.0,          // Convective heat transfer coefficient [W/(m^2 K)]
      A: 1.20,           // Effective drying surface area [m^2]
      Wd: 3.0,           // Oven-dry mass of material [kg]
      X0: 0.75,          // Initial moisture content [kg/kg-dry]
      Xc: 0.25,          // Critical moisture content (限界含水率) [kg/kg-dry]
      Xc2: 0.10,         // Second critical moisture content (第2限界含水率) [kg/kg-dry]
      Xe: 0.035,         // Equilibrium moisture content (平衡含水率) [kg/kg-dry]
      dHv: 2260.0        // Latent heat of vaporization [kJ/kg]
    };
    
    // Preset material profiles
    this.presets = {
      'cotton_towel': {
        name: '標準綿タオル・コットン (推奨)',
        Ta: 65.0, RHa: 15.0, hH: 45.0, A: 1.20, Wd: 3.0,
        X0: 0.75, Xc: 0.25, Xc2: 0.10, Xe: 0.035
      },
      'heavy_denim': {
        name: '厚手デニム・ジーンズ (内部拡散律速大)',
        Ta: 65.0, RHa: 15.0, hH: 38.0, A: 0.95, Wd: 3.5,
        X0: 0.80, Xc: 0.32, Xc2: 0.14, Xe: 0.040
      },
      'synthetic_quick': {
        name: '化繊・スポーツウェア (速乾・自由水主体)',
        Ta: 60.0, RHa: 15.0, hH: 52.0, A: 1.40, Wd: 2.0,
        X0: 0.45, Xc: 0.12, Xc2: 0.06, Xe: 0.015
      },
      'high_temp_heater': {
        name: 'ヒーター高温急速乾燥 (85℃排気式)',
        Ta: 85.0, RHa: 10.0, hH: 55.0, A: 1.20, Wd: 3.0,
        X0: 0.75, Xc: 0.28, Xc2: 0.11, Xe: 0.025
      }
    };
  }
  
  setParameters(newParams) {
    Object.assign(this.params, newParams);
  }
  
  applyPreset(presetKey) {
    if (this.presets[presetKey]) {
      this.setParameters(this.presets[presetKey]);
    }
  }
  
  calculateWetBulbTemp(Ta = this.params.Ta, RH = this.params.RHa) {
    const twb = Ta * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
                Math.atan(Ta + RH) - Math.atan(RH - 1.676331) +
                0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
    return Math.max(20.0, Math.min(Ta - 5.0, twb));
  }
  
  calculateConstantRate(Ta = this.params.Ta, Twb = this.calculateWetBulbTemp()) {
    const dHv_J = this.params.dHv * 1000; // J/kg
    const Rc_kg_m2_s = (this.params.hH * (Ta - Twb)) / dHv_J;
    return Rc_kg_m2_s * 3600.0; // kg/(m^2 h)
  }
  
  generateAllCharacteristics() {
    const p = this.params;
    const Twb = this.calculateWetBulbTemp(p.Ta, p.RHa);
    const Rc = this.calculateConstantRate(p.Ta, Twb); // kg/(m^2 h)
    
    const dW_dt_const = Rc * p.A;
    
    // Duration of Phase I (Preheating)
    const t_preheat = 4.0;
    const T_init = 22.0;
    
    // Duration of Phase II (Constant Rate)
    const waterConstantPeriod = Math.max(0, (p.X0 - p.Xc) * p.Wd);
    const t_constant = (waterConstantPeriod / dW_dt_const) * 60.0;
    const t_crit = t_preheat + t_constant;
    
    // Duration of Phase III (Falling Rate 1: Xc to Xc2)
    const waterFall1 = (p.Xc - p.Xc2) * p.Wd;
    const t_fall1 = (waterFall1 / (dW_dt_const * 0.65)) * 60.0;
    const t_crit2 = t_crit + t_fall1;
    
    // Duration of Phase IV (Falling Rate 2: Xc2 to Xe)
    const waterFall2 = (p.Xc2 - p.Xe) * p.Wd;
    const t_fall2 = (waterFall2 / (dW_dt_const * 0.22)) * 60.0;
    const t_equil = t_crit2 + t_fall2;
    
    const t_max = Math.ceil(t_equil * 1.15);
    
    // FORMAT 1: Time Characteristics
    const timePoints = [];
    const moistureData = [];
    const surfTempData = [];
    const centerTempData = [];
    
    const dt = 0.5;
    for (let t = 0; t <= t_max; t += dt) {
      timePoints.push(t.toFixed(1));
      let curX, curTs, curTc;
      
      if (t < t_preheat) {
        const f = t / t_preheat;
        curX = p.X0 - 0.005 * f;
        curTs = T_init + (Twb - T_init) * Math.sin(f * Math.PI * 0.5);
        curTc = T_init + (Twb - T_init) * Math.pow(f, 1.8);
      } else if (t <= t_crit) {
        const t_in_const = t - t_preheat;
        curX = p.X0 - (t_in_const / t_constant) * (p.X0 - p.Xc);
        curTs = Twb;
        curTc = Twb - 0.4;
      } else if (t <= t_crit2) {
        const f3 = (t - t_crit) / t_fall1;
        curX = p.Xc - f3 * (p.Xc - p.Xc2);
        const T_mid = Twb + (p.Ta - Twb) * 0.65;
        curTs = Twb + (T_mid - Twb) * (1.0 - Math.exp(-3.2 * f3));
        curTc = Twb + (T_mid - Twb) * 0.15 * Math.pow(f3, 2.5);
      } else if (t <= t_equil) {
        const f4 = (t - t_crit2) / t_fall2;
        curX = p.Xc2 - (1.0 - Math.exp(-2.5 * f4)) * (p.Xc2 - p.Xe);
        const T_mid = Twb + (p.Ta - Twb) * 0.65;
        curTs = T_mid + (p.Ta - T_mid) * (1.0 - Math.exp(-2.2 * f4));
        curTc = Twb + 0.15 * (p.Ta - Twb) + (p.Ta - Twb) * 0.85 * (1.0 - Math.exp(-2.8 * f4));
      } else {
        curX = p.Xe;
        curTs = p.Ta;
        curTc = p.Ta - 0.1;
      }
      
      moistureData.push(Math.max(p.Xe, curX));
      surfTempData.push(curTs);
      centerTempData.push(curTc);
    }
    
    // FORMAT 2: Drying Rate vs Moisture Content
    const rateXPoints = [];
    const rateYPoints = [];
    const numPoints = 80;
    const dX_step = (p.X0 - p.Xe) / numPoints;
    
    for (let i = 0; i <= numPoints; i++) {
      const xVal = p.Xe + i * dX_step;
      rateXPoints.push(xVal.toFixed(3));
      
      let rate;
      if (xVal >= p.Xc) {
        rate = Rc;
      } else if (xVal >= p.Xc2) {
        const frac = (xVal - p.Xc2) / (p.Xc - p.Xc2);
        const Rc2 = Rc * 0.42;
        rate = Rc2 + frac * (Rc - Rc2);
      } else if (xVal > p.Xe) {
        const frac = (xVal - p.Xe) / (p.Xc2 - p.Xe);
        const Rc2 = Rc * 0.42;
        rate = Rc2 * Math.pow(frac, 1.45);
      } else {
        rate = 0;
      }
      rateYPoints.push(Math.max(0, rate));
    }
    
    return {
      params: p,
      Twb,
      Rc,
      periods: {
        t_preheat,
        t_crit,
        t_crit2,
        t_equil
      },
      format1: {
        labels: timePoints,
        moisture: moistureData,
        surfTemp: surfTempData,
        centerTemp: centerTempData
      },
      format2: {
        moisture: rateXPoints,
        rate: rateYPoints
      }
    };
  }

  evaluateCurrentState(currentX, optionalTimeMinutes = null) {
    const p = this.params;
    const Twb = this.calculateWetBulbTemp(p.Ta, p.RHa);
    const Rc = this.calculateConstantRate(p.Ta, Twb);
    const dW_dt_const = Rc * p.A;
    
    // Period Durations [minutes]
    const t_preheat = 4.0;
    const T_init = 22.0;
    const waterConstantPeriod = Math.max(0, (p.X0 - p.Xc) * p.Wd);
    const t_constant = (waterConstantPeriod / dW_dt_const) * 60.0;
    const t_crit = t_preheat + t_constant;
    
    const waterFall1 = Math.max(0, (p.Xc - p.Xc2) * p.Wd);
    const t_fall1 = (waterFall1 / (dW_dt_const * 0.65)) * 60.0;
    const t_crit2 = t_crit + t_fall1;
    
    const waterFall2 = Math.max(0, (p.Xc2 - p.Xe) * p.Wd);
    const t_fall2 = (waterFall2 / (dW_dt_const * 0.22)) * 60.0;
    const t_equil = t_crit2 + t_fall2;
    
    // Calculate Equivalent Time from currentX if not explicitly passed
    let equivTime = 0;
    let Ts = Twb;
    let Tc = Twb - 0.4;
    
    if (currentX >= p.X0) {
      equivTime = 0.0;
      Ts = T_init;
      Tc = T_init;
    } else if (currentX > p.Xc) {
      // Phase II (or transition from Phase I)
      const frac = (p.X0 - currentX) / (p.X0 - p.Xc);
      equivTime = t_preheat + frac * t_constant;
      Ts = Twb;
      Tc = Twb - 0.4;
    } else if (currentX > p.Xc2) {
      // Phase III (Falling Rate 1)
      const f3 = (p.Xc - currentX) / (p.Xc - p.Xc2);
      equivTime = t_crit + f3 * t_fall1;
      const T_mid = Twb + (p.Ta - Twb) * 0.65;
      Ts = Twb + (T_mid - Twb) * (1.0 - Math.exp(-3.2 * f3));
      Tc = Twb + (T_mid - Twb) * 0.15 * Math.pow(f3, 2.5);
    } else if (currentX > p.Xe) {
      // Phase IV (Falling Rate 2)
      const f4 = (p.Xc2 - currentX) / (p.Xc2 - p.Xe);
      equivTime = t_crit2 + f4 * t_fall2;
      const T_mid = Twb + (p.Ta - Twb) * 0.65;
      Ts = T_mid + (p.Ta - T_mid) * (1.0 - Math.exp(-2.2 * f4));
      Tc = Twb + 0.15 * (p.Ta - Twb) + (p.Ta - Twb) * 0.85 * (1.0 - Math.exp(-2.8 * f4));
    } else {
      // Phase V (Equilibrium)
      equivTime = t_equil;
      Ts = p.Ta;
      Tc = p.Ta - 0.1;
    }
    
    if (optionalTimeMinutes !== null && optionalTimeMinutes < t_preheat && currentX >= p.X0 - 0.015) {
      equivTime = optionalTimeMinutes;
      const f = optionalTimeMinutes / t_preheat;
      Ts = T_init + (Twb - T_init) * Math.sin(f * Math.PI * 0.5);
      Tc = T_init + (Twb - T_init) * Math.pow(f, 1.8);
    }
    
    let phaseId = 'p2';
    let phaseNum = 2;
    let phaseName = 'フェーズⅡ: 定率乾燥期間';
    let heatTransferPrinciple = '';
    let massTransferPrinciple = '';
    let currentRate = 0;
    
    if (equivTime < t_preheat && currentX >= p.X0 - 0.015) {
      phaseId = 'p1';
      phaseNum = 1;
      phaseName = 'フェーズⅠ: 予熱期間';
      currentRate = Rc * Math.max(0.1, equivTime / t_preheat);
      heatTransferPrinciple = '熱風からの対流受熱 Q = hH·A·(Ta - T) が主として材料温度の上昇に使われる期間。';
      massTransferPrinciple = '表面水分温度が低いため飽和水蒸気圧が小さく、蒸発速度は立ち上がり過渡状態。';
    } else if (currentX > p.Xc) {
      phaseId = 'p2';
      phaseNum = 2;
      phaseName = 'フェーズⅡ: 定率乾燥期間 (恒率期)';
      currentRate = Rc;
      heatTransferPrinciple = '受熱の全量が水の気化潜熱 (Q = dW/dt · ΔHv) として消費され、材料温度は湿球温度 Twb に完全固定。';
      massTransferPrinciple = '表面に十分な自由水が存在し、純水と同等の一定蒸散速度 Rc = hH(Ta - Twb)/ΔHv を維持。';
    } else if (currentX > p.Xc2) {
      phaseId = 'p3';
      phaseNum = 3;
      phaseName = 'フェーズⅢ: 減率乾燥期間前期';
      const frac = (currentX - p.Xc2) / (p.Xc - p.Xc2);
      currentRate = Rc * (0.42 + 0.58 * frac);
      heatTransferPrinciple = '表面自由水が枯渇し乾き面が出現。気化冷却が失われ、材料表面温度 Ts が急激に上昇開始。';
      massTransferPrinciple = '内部からの毛細管水分補給速度が蒸散速度に追いつかず、有効蒸発表面積が減少して速度が直線低下。';
    } else if (currentX > p.Xe + 0.003) {
      phaseId = 'p4';
      phaseNum = 4;
      phaseName = 'フェーズⅣ: 減率乾燥期間後期';
      const frac = Math.max(0, (currentX - p.Xe) / (p.Xc2 - p.Xe));
      currentRate = Rc * 0.42 * Math.pow(frac, 1.45);
      heatTransferPrinciple = '蒸発面が材料深部へ後退。材料中心温度 Tc も本格的に上昇し、全体が熱風温度 Ta に接近。';
      massTransferPrinciple = '繊維内部の固相吸着水（結合水）の脱着および水蒸気分子拡散が律速となり、乾燥速度が緩慢に低下。';
    } else {
      phaseId = 'p5';
      phaseNum = 5;
      phaseName = 'フェーズⅤ: 平衡乾燥期 (乾燥完了)';
      currentRate = 0;
      heatTransferPrinciple = '材料表面・中心ともに熱源温度 Ta に等しくなり熱平衡に達する。';
      massTransferPrinciple = '乾量含水率が周囲空気の平衡含水率 Xe に達し、正味の水分移動が停止。';
    }
    
    return {
      phaseId,
      phaseNum,
      phaseName,
      currentX,
      currentRate,
      equivTime,
      Ts,
      Tc,
      Twb,
      Rc,
      periods: { t_preheat, t_crit, t_crit2, t_equil },
      heatTransferPrinciple,
      massTransferPrinciple
    };
  }
}

window.ChemicalEngineeringDryingModel = ChemicalEngineeringDryingModel;
