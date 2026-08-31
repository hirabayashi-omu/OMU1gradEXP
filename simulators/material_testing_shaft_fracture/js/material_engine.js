/**
 * Comprehensive Material Mechanics, Unidirectional Needle & Bulk Compression Engine
 * 食品・化粧品・軟質材料の一方向単調圧縮（針入度・圧縮応力-ひずみ）計算エンジン
 */

class MaterialEngine {
  constructor() {
    // 総合材料・食品・化粧品データベース (純粋な圧縮力学物性)
    this.materials = {
      // ─── 💄 1. 化粧品 ───
      cosmetic_lipstick: {
        id: 'cosmetic_lipstick',
        category: 'needle_test',
        name: 'リップスティック',
        type: 'wax_paste',
        E: 16.0,              // 圧縮弾性率 [MPa]
        yieldStressMPa: 0.65, // 圧縮降伏応力 [MPa]
        flowStressMPa: 0.42,  // 塑性流動応力 [MPa]
        maxStressMPa: 0.85,   // 最大圧縮強度 [MPa]
        hardnessN: 3.8,       // 針入抵抗力 [N]
        penetrationDepthMax: 8.0, // 最大針入深さ [mm]
        eta_kv: 0.18,       // KV粘性係数 [MPa·s]
        tau_eps: 0.25,      // 緩和ひずみ
        E_v: 3.0,           // Maxwell弾性率 [MPa]
        desc: '固形ワックス。弾性変形から滑らかに変形・流動します。'
      },
      cosmetic_balm: {
        id: 'cosmetic_balm',
        category: 'needle_test',
        name: 'リップバーム',
        type: 'soft_paste',
        E: 4.5,
        yieldStressMPa: 0.18,
        flowStressMPa: 0.12,
        maxStressMPa: 0.28,
        hardnessN: 1.2,
        penetrationDepthMax: 12.0,
        eta_kv: 0.04,
        tau_eps: 0.60,
        E_v: 0.5,
        desc: '柔らかいペースト状。小さな力で容易に変形します。'
      },
      cosmetic_foundation: {
        id: 'cosmetic_foundation',
        category: 'needle_test',
        name: 'ファンデーション',
        type: 'emulsion_solid',
        E: 8.0,
        yieldStressMPa: 0.35,
        flowStressMPa: 0.22,
        maxStressMPa: 0.48,
        hardnessN: 2.2,
        penetrationDepthMax: 10.0,
        eta_kv: 0.08,
        tau_eps: 0.35,
        E_v: 1.5,
        desc: '適度な硬さがあり、均一に変形します。'
      },

      // ─── 🧀 2. 食品 ───
      food_cheese: {
        id: 'food_cheese',
        category: 'needle_test',
        name: 'チーズ',
        type: 'food_viscoelastic',
        E: 2.2,
        yieldStressMPa: 0.24,
        flowStressMPa: 0.19,
        maxStressMPa: 0.45,
        hardnessN: 2.8,
        penetrationDepthMax: 10.0,
        compressiveStrengthMPa: 0.45,
        eta_kv: 0.05,
        tau_eps: 0.50,
        E_v: 0.4,
        desc: '粘弾性。初期の弾性変形から徐々に塑性変形へ移行します。'
      },
      food_butter: {
        id: 'food_butter',
        category: 'needle_test',
        name: 'バター',
        type: 'fat_crystal',
        E: 12.0,
        yieldStressMPa: 0.52,
        flowStressMPa: 0.30,
        maxStressMPa: 0.85,
        hardnessN: 4.5,
        penetrationDepthMax: 8.0,
        compressiveStrengthMPa: 0.85,
        eta_kv: 0.12,
        tau_eps: 0.30,
        E_v: 2.0,
        desc: '油脂結晶。針入度により硬さを評価します。'
      },
      food_gummy: {
        id: 'food_gummy',
        category: 'needle_test',
        name: 'グミ',
        type: 'gel_elastic',
        E: 3.5,
        yieldStressMPa: 0.60,
        flowStressMPa: 0.55,
        maxStressMPa: 1.60,
        hardnessN: 5.2,
        penetrationDepthMax: 6.0,
        compressiveStrengthMPa: 1.60,
        eta_kv: 0.08,
        tau_eps: 0.70,
        E_v: 0.6,
        desc: '高弾性ゲル。大きく変形しても復元します。'
      },
      food_chocolate: {
        id: 'food_chocolate',
        category: 'needle_test',
        name: 'チョコレート',
        type: 'food_brittle',
        E: 45.0,
        yieldStressMPa: 1.80,
        flowStressMPa: 0.40,
        maxStressMPa: 2.20,
        hardnessN: 15.0,
        penetrationDepthMax: 3.0,
        compressiveStrengthMPa: 2.20,
        eta_kv: 0.30,
        tau_eps: 0.10,
        E_v: 8.0,
        desc: '硬くもろい固体。ピーク荷重に達すると割れて破砕します。'
      },

      // ─── 🧬 3. ゴム・金属 ───
      rubber_nr: {
        id: 'rubber_nr',
        category: 'soft_matter',
        name: '天然ゴム',
        type: 'hyperelastic',
        E: 2.5,
        nu: 0.499,
        sigma_y: 1.2,
        sigma_u: 25.0,
        eps_y: 0.15,
        eps_u: 5.5,
        eps_f: 6.5,
        C10: 0.4,
        C01: 0.1,
        // SLS粘弾性アーム（τ: 緩和ひずみ, E_v: Maxwell弾性率）
        E_v: 0.35,          // Maxwell アーム弾性率 [MPa]
        tau_eps: 0.80,      // 緩和ひずみ（= τ·ε̇）
        eps_f_comp: 0.72,   // 圧縮破断ひずみ
        desc: '超弾性ゴム。大きな伸びと非線形な弾性変形を示します。'
      },
      hydrogel: {
        id: 'hydrogel',
        category: 'soft_matter',
        name: 'ハイドロゲル',
        type: 'gel',
        E: 0.35,
        nu: 0.48,
        sigma_y: 0.25,
        sigma_u: 4.8,
        eps_y: 0.30,
        eps_u: 8.0,
        eps_f: 10.0,
        C10: 0.06,
        C01: 0.02,
        E_v: 0.04,          // Maxwell アーム弾性率 [MPa]
        tau_eps: 1.20,      // 緩和ひずみ（ゲルは緩和が遅い）
        eps_f_comp: 0.68,   // 圧縮破断ひずみ
        desc: '高含水ゲル。柔軟で高い保水クッション性を持ちます。'
      },
      s45c: {
        id: 's45c',
        category: 'metal',
        name: '炭素鋼 (S45C)',
        type: 'metal',
        E: 206000,
        nu: 0.29,
        sigma_y: 490,
        sigma_u: 690,
        eps_y: 0.00238,
        eps_u: 0.12,
        eps_f: 0.22,
        eps_c_f: 0.18,      // 圧縮破断ひずみ
        C_cs: 40.4,         // Cowper-Symonds C [1/s]
        P_cs: 5.0,          // Cowper-Symonds P (べき指数)
        eta_vp: 0.002,      // 粘塑性粘性係数 [MPa·s]
        desc: '構造用鋼材。高強度で降伏・塑性変形・破断を示します。'
      }
    };

    this.currentMaterialId = 'cosmetic_lipstick';
    this.currentMaterial = this.materials.cosmetic_lipstick;

    // ─── 📍 ニードルプローブ 一方向単調圧縮 状態 ───
    this.probeType = 'needle';     // 'needle' | 'cone' | 'ball'
    this.needleDepth = 0.0;        // 現在針入深さ h [mm]
    this.needleSpeed = 0.08;       // 一方向侵入速度 [mm/step]
    this.needleMaxDepth = 10.0;    // 最大試験深さ [mm]
    this.sampleInitialHeight = 20.0;// サンプル初期高さ H0 [mm]
    this.needleCurrentForce = 0.0; // 圧縮力 F [N]
    this.needleCompStress = 0.0;   // 圧縮応力 σ [MPa]
    this.needleTrueStrain = 0.0;   // 圧縮ひずみ ε = h / H0
    this.needleIsRunning = false;  // 測定中フラグ
    this.needleIsCompleted = false;// 完了フラグ

    // 一方向測定履歴
    this.needleDepthHistory = [];
    this.needleForceHistory = [];
    this.needleStressHistory = [];
    this.needleStrainHistory = [];

    // ─── 食品一方向単調圧縮 状態 ───
    this.foodCompDepth = 0.0;
    this.foodCompForce = 0.0;
    this.foodCompStress = 0.0;
    this.foodCompStrain = 0.0;
    this.foodIsRunning = false;
    this.foodCompHistory = [];
    this.foodStressHistory = [];

    // ─── 万能試験 状態 ───
    this.testMode = 'compression';
    this.currentStrain = 0.0;
    this.currentStress = 0.0;
    this.currentForce = 0.0;
    this.isFractured = false;
    this.isYielded = false;
    this.strainHistory = [];
    this.stressHistory = [];
    this.isRunning = false;
  }

  setMaterial(matId) {
    if (this.materials[matId]) {
      this.currentMaterialId = matId;
      this.currentMaterial = this.materials[matId];
      this.resetNeedleTest();
      this.resetFoodCompTest();
      this.resetUniversalTest();
    }
  }

  setProbeType(type) {
    this.probeType = type;
    this.resetNeedleTest();
  }

  // ─── 📍 ニードルプローブ 一方向単調圧縮エンジン ───
  resetNeedleTest() {
    this.needleDepth = 0.0;
    this.needleCurrentForce = 0.0;
    this.needleCompStress = 0.0;
    this.needleTrueStrain = 0.0;
    this.needleIsRunning = false;
    this.needleIsCompleted = false;
    this.needleDepthHistory = [0];
    this.needleForceHistory = [0];
    this.needleStressHistory = [0];
    this.needleStrainHistory = [0];
    this.needle_sigma_v = 0.0; // SLS Maxwell内部応力
  }

  stepNeedleTest() {
    if (!this.needleIsRunning || this.needleIsCompleted) return;

    this.needleDepth += this.needleSpeed;
    if (this.needleDepth >= this.needleMaxDepth) {
      this.needleDepth = this.needleMaxDepth;
      this.needleIsRunning = false;
      this.needleIsCompleted = true;
    }

    this.calculateNeedleState();
  }

  calculateNeedleState() {
    const mat  = this.currentMaterial;
    const h    = this.needleDepth;
    const H0   = this.sampleInitialHeight;
    this.needleTrueStrain = h / H0;

    // プローブ形状別 投影面積
    let A_proj = 0.785; // needle 1mm針 断面積 [mm^2]
    if (this.probeType === 'cone') {
      const r = Math.min(6.0, h * Math.tan((15 * Math.PI) / 180));
      A_proj = Math.PI * r * r;
    } else if (this.probeType === 'ball') {
      const R    = 1.5;
      const capH = Math.min(R, h);
      A_proj = Math.PI * (2 * R * capH - capH * capH);
    }
    A_proj = Math.max(0.2, A_proj);

    const yieldStr = mat.yieldStressMPa || 0.35;
    const flowStr  = mat.flowStressMPa  || 0.22;
    const maxHard  = mat.hardnessN      || 3.0;
    const dh       = this.needleSpeed;   // 侵入速度 [mm/step]

    // ── Kelvin-Voigt 粘弾性: σ = E·ε + η·ε̇ ──
    // 針入ひずみ速度 = dh/H0 / (1/60) = dh * 60 / H0
    const eps_dot_n = (dh / H0) * 60;  // [/s]
    const E_kv = mat.E || 10.0;
    const eta  = (mat.eta_kv || E_kv * 0.015); // 粘性係数 [MPa·s]
    const eps  = this.needleTrueStrain;

    // KV 弾性 + 粘性応力（線形域）
    const sigma_kv = E_kv * eps + eta * eps_dot_n;

    // 降伏後: 塑性流動応力 + 粘性項
    let sigma_base;
    if (eps <= yieldStr / E_kv) {
      sigma_base = sigma_kv;
    } else {
      const sigma_flow = flowStr + (yieldStr - flowStr) * Math.exp(-(eps - yieldStr / E_kv) * 2.5);
      sigma_base = sigma_flow + eta * eps_dot_n * 0.3;
    }

    // SLS Maxwell アーム（緩和応力）
    const tau_n   = (mat.tau_eps || 0.4) * 0.5;
    const dEps_n  = dh / H0;
    const alpha_n = (tau_n > 0) ? Math.exp(-dEps_n / tau_n) : 0;
    const fac_n   = (tau_n > 0 && dEps_n > 0) ? (1 - alpha_n) / (dEps_n / tau_n) : 1;
    const E_v_n   = (mat.E_v || E_kv * 0.3);
    this.needle_sigma_v = this.needle_sigma_v * alpha_n + E_v_n * dEps_n * fac_n;

    let stress = Math.max(0, sigma_base + this.needle_sigma_v);

    // チョコレート特有: 破砕後急落
    if (mat.id === 'food_chocolate' && h > 1.2) {
      stress = (maxHard / A_proj) * 0.45 + (maxHard / A_proj) * 0.55 * Math.exp(-(h - 1.2) * 2.0);
      this.needle_sigma_v *= 0.5; // 破砕で一部緩和
    }

    // 深さ依存スケール（プローブが深く刺さるほど接触面積増・硬化）
    const depthScale = 1.0 + Math.pow(h / this.needleMaxDepth, 1.2) * 0.6;
    stress *= depthScale;

    this.needleCurrentForce = Math.max(0, stress * A_proj);
    this.needleCompStress   = stress;

    this.needleDepthHistory.push(this.needleDepth);
    this.needleForceHistory.push(this.needleCurrentForce);
    this.needleStressHistory.push(this.needleCompStress);
    this.needleStrainHistory.push(this.needleTrueStrain);
  }

  // ─── 🧀 食品 一方向単調圧縮試験エンジン ───
  resetFoodCompTest() {
    this.foodCompDepth = 0.0;
    this.foodCompForce = 0.0;
    this.foodCompStress = 0.0;
    this.foodCompStrain = 0.0;
    this.foodIsRunning = false;
    this.foodCompHistory = [0];
    this.foodStressHistory = [0];
  }

  stepFoodCompTest(dt = 0.03) {
    if (!this.foodIsRunning) return;
    const maxComp = 12.0;
    const dh = 0.08; // 圧縮深さ増分 [mm/step]
    this.foodCompDepth += dh;

    if (this.foodCompDepth >= maxComp) {
      this.foodCompDepth = maxComp;
      this.foodIsRunning = false;
    }

    const mat   = this.currentMaterial;
    const H0    = 20.0;
    const strain = this.foodCompDepth / H0;
    this.foodCompStrain = strain * 100; // [%]

    const A0   = (Math.PI / 4) * Math.pow(20.0, 2); // [mm^2]
    const E    = mat.E || 2.0;
    const yStr = mat.yieldStressMPa || 0.3;
    const sigC = mat.compressiveStrengthMPa || 0.6;

    // ── Kelvin-Voigt 粘弾性: σ = E·ε + η·ε̇ ──
    const eps_dot_f = (dh / H0) * 60; // ひずみ速度 [/s]
    const eta_f = (mat.eta_kv || E * 0.02); // 粘性係数
    const sigma_kv = E * strain + eta_f * eps_dot_f;

    // ── SLS Maxwell アーム ──
    if (!this.food_sigma_v) this.food_sigma_v = 0.0;
    const tau_f   = mat.tau_eps || 0.3;
    const dEps_f  = dh / H0;
    const alpha_f = (tau_f > 0) ? Math.exp(-dEps_f / tau_f) : 0;
    const fac_f   = (tau_f > 0 && dEps_f > 0) ? (1 - alpha_f) / (dEps_f / tau_f) : 1;
    const E_v_f   = mat.E_v || E * 0.4;
    this.food_sigma_v = this.food_sigma_v * alpha_f + E_v_f * dEps_f * fac_f;

    let stress;
    if (strain <= yStr / E) {
      // 弾性域: KV 粘弾性
      stress = sigma_kv + this.food_sigma_v;
    } else {
      // 降伏後: 圧縮硬化 + 粘性
      const eps_ratio = (strain - yStr / E) / Math.max(0.01, (maxComp / H0) - yStr / E);
      stress = yStr + sigC * Math.pow(eps_ratio, 0.55) * (1 + strain * 0.6)
             + eta_f * eps_dot_f * 0.4
             + this.food_sigma_v * 0.5;
    }

    // チョコレート: 破砕 (brittle fracture)
    if (mat.id === 'food_chocolate' && strain > 0.06) {
      const decayFactor = Math.exp(-(strain - 0.06) * 10);
      stress = (sigC * 1.1) * decayFactor + yStr * 0.2 * (1 - decayFactor);
      this.food_sigma_v *= decayFactor; // 破砕で緩和消去
    }

    this.foodCompStress = Math.max(0, stress);
    this.foodCompForce  = (this.foodCompStress * A0) / 1.0;

    this.foodCompHistory.push(this.foodCompStrain);
    this.foodStressHistory.push(this.foodCompStress);
  }
  // ─── 万能試験 ───
  resetUniversalTest() {
    this.currentStrain = 0.0;
    this.currentStress = 0.0;
    this.currentForce = 0.0;
    this.isFractured = false;
    this.fractureRecorded = false;
    this.isYielded = false;
    this.strainHistory = [0];
    this.stressHistory = [0];
    this.isRunning = false;
    // ── 粘弾性 内部状態変数 ──
    this.sigma_v = 0.0;       // SLS Maxwell アーム内部応力 [MPa]
    this.eps_plastic = 0.0;   // 粘塑性累積塑性ひずみ
    this.eps_dot = 0.0;       // 現在のひずみ速度 [/s]
    this.dt_frame = 1 / 60;   // 1フレームの実時間 [s]
  }

  stepUniversalTest() {
    if (!this.isRunning) return;
    // 破断直後: 一度だけ σ=0 を記録して停止
    if (this.isFractured) {
      if (!this.fractureRecorded) {
        this.stressHistory.push(0.0);
        this.strainHistory.push(this.currentStrain);
        this.currentStress = 0.0;
        this.currentForce  = 0.0;
        this.fractureRecorded = true;
        this.isRunning = false;
      }
      return;
    }

    const mat    = this.currentMaterial;
    const isComp = (this.testMode === 'compression');
    const E       = mat.E       || 1.0;
    const sigma_y = mat.sigma_y || mat.yieldStressMPa || 0.5;
    const sigma_u = mat.sigma_u || sigma_y * 1.5;
    const eps_y   = mat.eps_y   || sigma_y / E;
    const dt      = this.dt_frame; // 1/60 s

    // ひずみ増分（圧縮は細かく刻む）
    const dEps = isComp
      ? (mat.category === 'soft_matter' ? 0.005 : 0.0015)
      : (mat.category === 'soft_matter' ? 0.010 : 0.0025);
    this.currentStrain += dEps;

    // ひずみ速度 [/s]
    const eps_dot = dEps / dt;
    this.eps_dot  = eps_dot;

    // ════════════════════════════════════════════════════════
    //  A. 超弾性・ゲル系 --- Standard Linear Solid (SLS/Zener)
    //
    //  σ = σ_eq(ε)  +  σ_v(ε)          ... 平衡+Maxwell応力
    //  σ_eq : Mooney-Rivlin 超弾性（平衡）
    //  σ_v  : Maxwell アーム内部応力（速度依存・緩和）
    //
    //  指数精度更新（Δε ステップ）:
    //    α = exp(-Δε / τ_ε)
    //    σ_v(n+1) = σ_v(n)·α + E_v·Δε·(1-α)/(Δε/τ_ε)
    //  τ_ε : 緩和ひずみ（τ·ε̇, 無次元）
    // ════════════════════════════════════════════════════════
    if (mat.type === 'hyperelastic' || mat.type === 'gel') {
      const C10    = mat.C10    || 0.4;
      const C01    = mat.C01    || 0.1;
      const E_v    = mat.E_v    || C10 * 0.8;
      const tau_e  = mat.tau_eps || 0.6;   // 緩和ひずみ

      // Maxwell アーム 指数精度更新
      const alpha  = (tau_e > 0) ? Math.exp(-dEps / tau_e) : 0;
      const fac    = (tau_e > 0 && dEps > 0) ? (1 - alpha) / (dEps / tau_e) : 1;
      this.sigma_v = this.sigma_v * alpha + E_v * dEps * fac;

      if (isComp) {
        // 圧縮: λ = 1 - ε
        const eps_f_c = mat.eps_f_comp || (mat.eps_f ? mat.eps_f * 0.55 : 0.72);
        if (this.currentStrain >= eps_f_c) { this.isFractured = true; return; }
        const lam = Math.max(0.05, 1.0 - this.currentStrain);
        const sigma_eq = Math.abs(2 * C10 * (lam - 1.0 / (lam * lam)));
        this.currentStress = sigma_eq + this.sigma_v;
      } else {
        // 引張: λ = 1 + ε
        const eps_f_t = mat.eps_f || 3.0;
        if (this.currentStrain >= eps_f_t) { this.isFractured = true; return; }
        const lam = Math.max(0.05, 1.0 + this.currentStrain);
        const sigma_eq = 2 * C10 * (lam - 1 / (lam * lam))
                       + 2 * C01 * (1 - 1 / (lam * lam * lam));
        this.currentStress = Math.abs(sigma_eq) + this.sigma_v;
      }
      this.isYielded    = (this.currentStrain > eps_y);
      this.neckingRatio = 0.0;

    // ════════════════════════════════════════════════════════
    //  B. 金属・剛性材料 --- Perzyna 粘塑性
    //
    //  降伏応力の速度依存（Cowper-Symonds 式）:
    //    σ_y*(ε̇) = σ_y0 · [1 + (ε̇/C)^(1/P)]
    //
    //  引張: 弾性 → 速度依存降伏 → 粘塑性加工硬化 → ネッキング → 破断
    //  圧縮: 弾性 → 速度依存降伏 → 単調加工硬化（ネッキングなし）→ 圧縮破断
    //
    //  粘性応力付加（Perzyna 項）:
    //    σ_vis = η_vp · ε̇_p     (ε̇_p: 塑性ひずみ速度)
    // ════════════════════════════════════════════════════════
    } else {
      const C_cs   = mat.C_cs   || 40.4;    // Cowper-Symonds C [/s]
      const P_cs   = mat.P_cs   || 5.0;     // Cowper-Symonds P
      const eta_vp = mat.eta_vp || 0.001;   // 粘塑性係数 [MPa·s]

      // 速度依存降伏応力
      const sigma_y_dyn = (eps_dot > 0 && C_cs > 0)
        ? sigma_y * (1.0 + Math.pow(eps_dot / C_cs, 1.0 / P_cs))
        : sigma_y;
      const eps_y_dyn = sigma_y_dyn / E;

      if (isComp) {
        // ─ 圧縮試験 ─
        const eps_c_f = mat.eps_c_f || mat.eps_f || 0.25;
        if (this.currentStrain >= eps_c_f) { this.isFractured = true; return; }

        if (this.currentStrain <= eps_y_dyn) {
          this.currentStress = E * this.currentStrain;
        } else {
          this.isYielded = true;
          // 速度依存 Power-law 圧縮硬化（凹型: n≈2.2）
          const n_c  = 2.2;
          const eps_r = this.currentStrain / eps_y_dyn;
          const sigma_pl = sigma_y_dyn * Math.pow(eps_r, n_c);
          // Perzyna 粘性項
          const eps_dot_p = Math.max(0, eps_dot - sigma_y_dyn / (E * dt));
          const sigma_vis = eta_vp * eps_dot_p;
          this.currentStress = Math.min(sigma_pl + sigma_vis, sigma_u * 1.8);
        }
        this.neckingRatio = 0.0;

      } else {
        // ─ 引張試験 ─
        const eps_u = mat.eps_u || mat.eps_f || 0.5;
        const eps_f = mat.eps_f || eps_u * 1.1;
        if (this.currentStrain >= eps_f) { this.isFractured = true; return; }

        if (this.currentStrain <= eps_y_dyn) {
          this.currentStress = E * this.currentStrain;
        } else if (this.currentStrain < eps_u) {
          this.isYielded = true;
          // 速度依存加工硬化 (Power-law, n=0.25)
          const ratio    = (this.currentStrain - eps_y_dyn) / (eps_u - eps_y_dyn);
          const sigma_pl = sigma_y_dyn + (sigma_u - sigma_y_dyn) * Math.pow(Math.min(1.0, ratio), 0.25);
          // Perzyna 粘性項
          const eps_dot_p = Math.max(0, eps_dot - sigma_y_dyn / (E * dt));
          const sigma_vis = eta_vp * eps_dot_p;
          this.currentStress = sigma_pl + sigma_vis;
        } else {
          // ネッキング・引張軟化
          const ratio = (this.currentStrain - eps_u) / (eps_f - eps_u);
          this.currentStress = sigma_u * (1.0 - ratio * 0.35);
        }
        // ネッキング比（くびれ描画用）
        this.neckingRatio = this.currentStrain > eps_u
          ? Math.min(1.0, (this.currentStrain - eps_u) / (eps_f - eps_u))
          : 0.0;
      }
    }

    const A0 = (Math.PI / 4) * Math.pow(10.0, 2);
    this.currentForce = (this.currentStress * A0) / 1000.0;
    this.strainHistory.push(this.currentStrain);
    this.stressHistory.push(this.currentStress);
  }
}

if (typeof window !== 'undefined') {
  window.MaterialEngine = MaterialEngine;
}
