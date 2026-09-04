/**
 * models.js - レオロジー数理モデル定義
 * 
 * ハーシェル・バルクリー (Herschel-Bulkley: HB) 一般モデル:
 *   tau = tau_y + K * (gamma_dot)^n
 * 
 * 見かけ粘度 eta(gamma_dot) = tau / gamma_dot:
 *   eta = tau_y / gamma_dot + K * (gamma_dot)^(n - 1)
 * 
 * 数値的正則化 (Papanastasiou / Bercovier-Engelman model):
 *   特異点 (gamma_dot -> 0) における無限大発散を防止し、
 *   未流動・高粘度領域 (Plug flow) を上限粘度 eta_max で滑らかに表現。
 */

export const FLUID_PRESETS = {
  newtonian: {
    id: 'newtonian',
    name: 'ニュートン流体 (Newtonian)',
    desc: '粘度はせん断速度に依存せず一定。水、油、空気など。',
    tau_y: 0.0,       // 降伏応力 [Pa]
    K: 1.0,           // コンシステンシー指数 / 粘度 [Pa·s^n]
    n: 1.0,           // 流動特性指数 [-]
    m_reg: 100.0,     // Papanastasiou正則化係数
    eta_min: 0.001,   // 下限粘度 [Pa·s]
    eta_max: 100.0,   // 上限粘度 [Pa·s]
    rho: 1000.0,      // 密度 [kg/m^3]
    inlet_vel: 1.0    // 流入流速 [m/s]
  },
  bingham: {
    id: 'bingham',
    name: 'ビンガム流体 (Bingham Plastic)',
    desc: '降伏応力を超えるまで流動せず、超過後は線形に流動。歯磨き粉、塗料、泥水など。',
    tau_y: 60.0,
    K: 0.8,
    n: 1.0,
    m_reg: 50.0,
    eta_min: 0.01,
    eta_max: 500.0,
    rho: 1100.0,
    inlet_vel: 1.0
  },
  pseudoplastic: {
    id: 'pseudoplastic',
    name: '擬塑性流体 (Shear-Thinning)',
    desc: 'せん断速度が増加すると粘度が低下（べき乗則 n < 1）。高分子溶液、マヨネーズ、インクなど。',
    tau_y: 0.0,
    K: 5.0,
    n: 0.40,
    m_reg: 100.0,
    eta_min: 0.01,
    eta_max: 250.0,
    rho: 1000.0,
    inlet_vel: 1.0
  },
  dilatant: {
    id: 'dilatant',
    name: 'ダイラタント流体 (Shear-Thickening)',
    desc: 'せん断速度が増加すると粘度が上昇（べき乗則 n > 1）。コーンスターチ懸濁液、濃厚スラリーなど。',
    tau_y: 0.0,
    K: 0.05,
    n: 1.70,
    m_reg: 100.0,
    eta_min: 0.01,
    eta_max: 200.0,
    rho: 1200.0,
    inlet_vel: 1.0
  },
  herschel_bulkley: {
    id: 'herschel_bulkley',
    name: 'ハーシェル・バルクリー流体 (HB Model)',
    desc: '降伏応力とシアシニング/シックニングの両方を持つ一般モデル。ゲル状食品、血液、セメントペーストなど。',
    tau_y: 40.0,
    K: 2.5,
    n: 0.50,
    m_reg: 50.0,
    eta_min: 0.01,
    eta_max: 350.0,
    rho: 1050.0,
    inlet_vel: 1.0
  }
};

/**
 * 化粧品（コスメティックス）レオロジープリセット
 */
export const COSMETIC_PRESETS = {
  cleansing_oil: {
    id: 'cleansing_oil',
    name: 'クレンジングオイル (Cleansing Oil)',
    desc: '【ニュートン性・親油性オイル】エステル油・植物油主体の低粘度流体。肌上で素早く広がりメイクとなじみ、傾斜面を滑らかに流下します。',
    hlb: 8.5,           // 親油・両親媒性 (HLB 8.5, 界面活性剤配合)
    emulsion_type: '無水オイル可溶化系 (Oil Base)',
    polarity: '親油・オイル性 (Lipophilic Oil)',
    tau_y: 0.0,         // 降伏応力ゼロ (サラサラ流動)
    K: 0.045,           // 低粘度 (45 mPa·s)
    n: 1.0,             // ニュートン流動
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 920.0,         // オイル密度 (0.92 g/cm3)
    inlet_vel: 1.2
  },
  skin_lotion: {
    id: 'skin_lotion',
    name: '化粧水・ローション (Skin Lotion)',
    desc: '【ニュートン性・高親水性】水溶性保湿成分が主体の低粘度流体。さらさらと素早く広がり浸透します。',
    hlb: 16.5,          // 高親水性 (HLB 16.5)
    emulsion_type: '水性可溶化系 (Aqueous)',
    polarity: '親水性 (Hydrophilic)',
    tau_y: 0.0,
    K: 0.08,
    n: 0.98,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 50.0,
    rho: 1000.0,
    inlet_vel: 1.2
  },
  emulsion_serum: {
    id: 'emulsion_serum',
    name: '乳液・美容液 (Moisturizing Serum)',
    desc: '【擬塑性・O/W型】静置時はとろみがあり液ダレせず、ノズル吐出や肌に伸ばす際のせん断で粘度が急低下。',
    hlb: 12.8,          // 親水リッチO/W型 (HLB 12.8)
    emulsion_type: 'O/W型エマルション',
    polarity: '親水性リッチ (Hydrophilic-rich)',
    tau_y: 3.0,
    K: 2.8,
    n: 0.52,
    m_reg: 80.0,
    eta_min: 0.01,
    eta_max: 120.0,
    rho: 1020.0,
    inlet_vel: 1.0
  },
  rich_cream: {
    id: 'rich_cream',
    name: '高保湿フェイスクリーム (Rich Cream)',
    desc: '【HBモデル・両親媒性】容器内で角が立つ明確な降伏応力τ_yを持ち、指で肌に塗ると体温とせん断でスルスル伸びる。',
    hlb: 9.5,           // 中間・両親媒性 (HLB 9.5)
    emulsion_type: '高内相O/WまたはW/O/W型',
    polarity: '両親媒・バランス型 (Amphiphilic)',
    tau_y: 55.0,
    K: 8.5,
    n: 0.38,
    m_reg: 60.0,
    eta_min: 0.02,
    eta_max: 400.0,
    rho: 1040.0,
    inlet_vel: 0.8
  },
  liquid_foundation: {
    id: 'liquid_foundation',
    name: 'リキッドファンデーション (Foundation)',
    desc: '【ビンガム/HB・W/Si型】酸化チタン・微粒子顔料が高分散。保存時の沈降を防ぎつつ、均一な薄膜形成を実現。',
    hlb: 6.5,           // 親油・疎水性 (HLB 6.5)
    emulsion_type: 'W/Si型 (Water in Silicone)',
    polarity: '疎水・親油性 (Lipophilic)',
    tau_y: 28.0,
    K: 4.2,
    n: 0.55,
    m_reg: 70.0,
    eta_min: 0.01,
    eta_max: 250.0,
    rho: 1150.0,
    inlet_vel: 1.0
  },
  lipstick_gloss: {
    id: 'lipstick_gloss',
    name: '口紅・リップグロス金型充填 (Lipstick)',
    desc: '【高降伏応力HB・無水油性】ワックス・エステル油リッチ系。金型ノズルからの注入成形挙動。プラグ流が発生。',
    hlb: 3.5,           // 強親油・強疎水性 (HLB 3.5)
    emulsion_type: '無水油性ゲル (Anhydrous Oil/Wax)',
    polarity: '強疎水・強親油性 (Strongly Lipophilic)',
    tau_y: 90.0,
    K: 12.0,
    n: 0.32,
    m_reg: 50.0,
    eta_min: 0.03,
    eta_max: 500.0,
    rho: 980.0,
    inlet_vel: 0.7
  },
  clay_scrub: {
    id: 'clay_scrub',
    name: 'クレイパック・スクラブ (Clay Mask)',
    desc: '【粒子分散ダイラタント・水和ゲル】高濃度泥粒子を含むペースト。急激な変形で抵抗増大。',
    hlb: 14.5,          // 親水性泥粘土水和系 (HLB 14.5)
    emulsion_type: '水和親水性クレイゲル (Aqueous Clay)',
    polarity: '親水性ゲル (Hydrophilic Gel)',
    tau_y: 35.0,
    K: 1.2,
    n: 1.38,
    m_reg: 60.0,
    eta_min: 0.02,
    eta_max: 300.0,
    rho: 1250.0,
    inlet_vel: 0.9
  },
  rice_bran_oil: {
    id: 'rice_bran_oil',
    name: '米ぬか油 (Rice Bran Oil)',
    desc: '実測 HB フィッティング。R² = 0.9983。',
    hlb: 7.0,
    emulsion_type: '植物油 (Vegetable Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.6974,
    K: 0.0672,
    n: 1.0837,
    m_reg: 60.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 1000.0,
    inlet_vel: 1.0,
    fit_r2: 0.9983
  },
  camellia_oil: {
    id: 'camellia_oil',
    name: '椿油 (Camellia Oil)',
    desc: '実測 HB フィッティング。R² = 0.9982。',
    hlb: 7.0,
    emulsion_type: '植物油 (Vegetable Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 1.0177,
    K: 0.0552,
    n: 1.1097,
    m_reg: 60.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 1000.0,
    inlet_vel: 1.0,
    fit_r2: 0.9982
  },
  olive_oil: {
    id: 'olive_oil',
    name: 'オリーブ油 (Olive Oil)',
    desc: '実測 HB フィッティング。R² = 1.0000。',
    hlb: 7.0,
    emulsion_type: '植物油 (Vegetable Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.1235,
    n: 0.9733,
    m_reg: 60.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 1000.0,
    inlet_vel: 1.0,
    fit_r2: 1.0
  },
  macadamia_oil: {
    id: 'macadamia_oil',
    name: 'マカデミア油 (Macadamia Oil)',
    desc: '実測 HB フィッティング。R² = 0.9998。',
    hlb: 7.0,
    emulsion_type: '植物油 (Vegetable Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.6147,
    K: 0.0887,
    n: 1.0392,
    m_reg: 60.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 1000.0,
    inlet_vel: 1.0,
    fit_r2: 0.9998
  },
  salad_oil: {
    id: 'salad_oil',
    name: 'サラダ油 (Salad Oil)',
    desc: '実測 HB フィッティング。R² = 0.9973。',
    hlb: 7.0,
    emulsion_type: '植物油 (Vegetable Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.7067,
    K: 0.0718,
    n: 1.0893,
    m_reg: 60.0,
    eta_min: 0.001,
    eta_max: 20.0,
    rho: 1000.0,
    inlet_vel: 1.0,
    fit_r2: 0.9973
  }
};

export class RheologyModel {
  constructor(params = FLUID_PRESETS.pseudoplastic) {
    this.setParams(params);
  }

  setParams(params) {
    this.hlb = Number(params.hlb ?? 10.0);
    this.emulsion_type = params.emulsion_type || '標準バルク';
    this.polarity = params.polarity || '中庸';
    this.tau_y = Number(params.tau_y ?? 0.0);
    this.K = Number(params.K ?? 1.0);
    this.n = Number(params.n ?? 1.0);
    this.m_reg = Number(params.m_reg ?? 100.0);
    this.eta_min = Number(params.eta_min ?? 0.001);
    this.eta_max = Number(params.eta_max ?? 500.0);
    this.rho = Number(params.rho ?? 1000.0);
    this.inlet_vel = Number(params.inlet_vel ?? 1.0);
  }

  /**
   * せん断速度 gamma_dot [1/s] から見かけ粘度 eta [Pa·s] を計算
   * Papanastasiou の正則化モデル:
   *   eta = (tau_y / gamma_dot) * [1 - exp(-m * gamma_dot)] + K * gamma_dot^(n - 1)
   */
  calcApparentViscosity(gammaDot) {
    const eps = 1e-6;
    const g = Math.max(eps, Math.abs(gammaDot));

    // 降伏応力項 (Papanastasiou regularized)
    let etaYield = 0.0;
    if (this.tau_y > 0.0) {
      etaYield = (this.tau_y / g) * (1.0 - Math.exp(-this.m_reg * g));
    }

    // べき乗項
    const etaPower = this.K * Math.pow(g, this.n - 1.0);

    let eta = etaYield + etaPower;

    // リミッター
    if (eta < this.eta_min) eta = this.eta_min;
    if (eta > this.eta_max) eta = this.eta_max;

    return eta;
  }

  /**
   * せん断速度 gamma_dot [1/s] からせん断応力 tau [Pa] を計算
   */
  calcShearStress(gammaDot) {
    return this.calcApparentViscosity(gammaDot) * gammaDot;
  }

  /**
   * レオロジー曲線データ生成 (グラフ描画用)
   */
  generateFlowCurveData(minGamma = 0.01, maxGamma = 200, points = 80) {
    const logMin = Math.log10(minGamma);
    const logMax = Math.log10(maxGamma);
    const step = (logMax - logMin) / (points - 1);

    const gammaDots = [];
    const stresses = [];
    const viscosities = [];

    for (let i = 0; i < points; i++) {
      const g = Math.pow(10, logMin + i * step);
      const eta = this.calcApparentViscosity(g);
      const tau = eta * g;

      gammaDots.push(g);
      stresses.push(tau);
      viscosities.push(eta);
    }

    return { gammaDots, stresses, viscosities };
  }
}
