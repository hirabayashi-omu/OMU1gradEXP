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
 * 多彩な質感・マテリアルテクスチャ パレット定義 (化粧品・食品・絵具・工業ペースト)
 */
export const MATERIAL_PALETTES = {
  // 1. 化粧品・スキンケア (Cosmetics)
  cream_white: {
    id: 'cream_white',
    category: 'cosmetics',
    name: 'シルキーホワイトクリーム',
    icon: '🍦',
    color: [252, 250, 245],
    gloss: 0.65,
    alpha: 0.98,
    highlight: [255, 255, 255],
    desc: '高保湿リッチクリーム・しっとりとしたツヤと自然な光沢'
  },
  cleansing_gold: {
    id: 'cleansing_gold',
    category: 'cosmetics',
    name: 'ゴールデンクリアオイル',
    icon: '🫒',
    color: [245, 235, 185],
    gloss: 0.90,
    alpha: 0.78,
    highlight: [255, 250, 210],
    desc: '透明感あふれる植物性クレンジングオイル・高光沢'
  },
  lotion_aqua: {
    id: 'lotion_aqua',
    category: 'cosmetics',
    name: 'クリアアクアローション',
    icon: '💧',
    color: [195, 235, 255],
    gloss: 0.92,
    alpha: 0.72,
    highlight: [255, 255, 255],
    desc: 'みずみずしい高透明度スキンローション'
  },
  serum_pink: {
    id: 'serum_pink',
    category: 'cosmetics',
    name: 'サクラエッセンス美容液',
    icon: '🌸',
    color: [255, 225, 235],
    gloss: 0.78,
    alpha: 0.88,
    highlight: [255, 245, 250],
    desc: 'とろみのある美容乳液・上品なピンクトーン'
  },
  foundation_ochre: {
    id: 'foundation_ochre',
    category: 'cosmetics',
    name: 'リキッドファンデーション',
    icon: '🧏',
    color: [228, 178, 137],
    gloss: 0.45,
    alpha: 1.0,
    highlight: [248, 205, 170],
    desc: '微粒子顔料が高分散したナチュラルオークル'
  },
  rouge_red: {
    id: 'rouge_red',
    category: 'cosmetics',
    name: 'ルージュリップグロス',
    icon: '💄',
    color: [225, 29, 72],
    gloss: 0.88,
    alpha: 0.92,
    highlight: [255, 140, 170],
    desc: '艶やかで濃厚なルビーレッドグロス'
  },
  clay_mask: {
    id: 'clay_mask',
    category: 'cosmetics',
    name: 'チャコールクレイ泥パック',
    icon: '🌑',
    color: [95, 100, 105],
    gloss: 0.25,
    alpha: 1.0,
    highlight: [140, 145, 150],
    desc: 'マットで重厚なミネラル泥粘土パック'
  },

  // 2. 食品・調味料 (Food & Paste)
  choco_syrup: {
    id: 'choco_syrup',
    category: 'foods',
    name: '濃厚チョコレートシロップ',
    icon: '🍫',
    color: [58, 30, 16],
    gloss: 0.82,
    alpha: 0.98,
    highlight: [120, 75, 45],
    desc: 'とろりと流れるダークカカオシロップ'
  },
  mayonnaise: {
    id: 'mayonnaise',
    category: 'foods',
    name: 'クリーミーマヨネーズ',
    icon: '🥚',
    color: [252, 242, 175],
    gloss: 0.55,
    alpha: 1.0,
    highlight: [255, 250, 215],
    desc: '卵黄とオイルの乳化ペースト・マイルドイエロー'
  },
  ketchup_red: {
    id: 'ketchup_red',
    category: 'foods',
    name: '完熟トマトケチャップ',
    icon: '🍅',
    color: [205, 30, 20],
    gloss: 0.72,
    alpha: 0.96,
    highlight: [255, 95, 80],
    desc: 'ツノ立ちの強い鮮やかな完熟トマトソース'
  },
  honey_amber: {
    id: 'honey_amber',
    category: 'foods',
    name: '天然アンバーハチミツ',
    icon: '🍯',
    color: [235, 165, 25],
    gloss: 0.92,
    alpha: 0.75,
    highlight: [255, 220, 100],
    desc: '黄金色の透明感と高い粘稠度を持つ純粋蜂蜜'
  },
  condensed_milk: {
    id: 'condensed_milk',
    category: 'foods',
    name: '濃厚練乳 (コンデンスミルク)',
    icon: '🥛',
    color: [255, 252, 235],
    gloss: 0.68,
    alpha: 0.98,
    highlight: [255, 255, 250],
    desc: '甘く濃厚なミルキーホワイト'
  },
  matcha_paste: {
    id: 'matcha_paste',
    category: 'foods',
    name: '濃厚宇治抹茶ペースト',
    icon: '🍵',
    color: [55, 110, 40],
    gloss: 0.48,
    alpha: 1.0,
    highlight: [100, 165, 80],
    desc: '深いグリーンと微粒粉末感を持つ抹茶餡'
  },
  mustard_yellow: {
    id: 'mustard_yellow',
    category: 'foods',
    name: 'ハニーマスタード',
    icon: '🌭',
    color: [225, 175, 40],
    gloss: 0.45,
    alpha: 1.0,
    highlight: [255, 215, 90],
    desc: '辛味とコクのあるイエローマスタード'
  },

  // 3. 絵具・アート塗料 (Paint & Inks)
  acrylic_blue: {
    id: 'acrylic_blue',
    category: 'paints',
    name: 'ウルトラマリンブルー (アクリル)',
    icon: '💙',
    color: [20, 75, 215],
    gloss: 0.70,
    alpha: 0.98,
    highlight: [100, 160, 255],
    desc: '発色の良い鮮烈な青色アクリル絵具'
  },
  acrylic_crimson: {
    id: 'acrylic_crimson',
    category: 'paints',
    name: 'クリムゾンレーキ (アクリル)',
    icon: '❤️',
    color: [215, 20, 50],
    gloss: 0.70,
    alpha: 0.98,
    highlight: [255, 90, 120],
    desc: '深みのある鮮やかな赤色絵具'
  },
  acrylic_yellow: {
    id: 'acrylic_yellow',
    category: 'paints',
    name: 'カドミウムイエロー (絵具)',
    icon: '💛',
    color: [252, 215, 20],
    gloss: 0.65,
    alpha: 1.0,
    highlight: [255, 245, 120],
    desc: '鮮明で隠蔽力の高いイエロー塗料'
  },
  oil_viridian: {
    id: 'oil_viridian',
    category: 'paints',
    name: 'ビリジアングリーン (油絵具)',
    icon: '💚',
    color: [15, 125, 80],
    gloss: 0.78,
    alpha: 0.95,
    highlight: [60, 195, 140],
    desc: '重厚なオイル光沢を持つエメラルド調グリーン'
  },
  metallic_silver: {
    id: 'metallic_silver',
    category: 'paints',
    name: 'メタリックシルバー (銀色塗料)',
    icon: '🪙',
    color: [210, 220, 230],
    gloss: 0.96,
    alpha: 1.0,
    highlight: [255, 255, 255],
    desc: '強い金属光沢と反射輝度を持つシルバー'
  },
  metallic_gold: {
    id: 'metallic_gold',
    category: 'paints',
    name: 'リッチパールゴールド (金色塗料)',
    icon: '👑',
    color: [235, 195, 60],
    gloss: 0.94,
    alpha: 1.0,
    highlight: [255, 245, 170],
    desc: '華やかなパール光沢を放つゴールド塗料'
  },
  acrylic_black: {
    id: 'acrylic_black',
    category: 'paints',
    name: 'ジェットブラック (漆黒インク)',
    icon: '🖤',
    color: [25, 25, 30],
    gloss: 0.85,
    alpha: 1.0,
    highlight: [80, 85, 95],
    desc: '深い艶と高濃度の黒色顔料インク'
  },

  // 4. 工業用ペースト・電子材料 (Industrial Paste)
  solder_paste: {
    id: 'solder_paste',
    category: 'industrial',
    name: 'はんだペースト (Solder Paste)',
    icon: '🔩',
    color: [145, 150, 160],
    gloss: 0.40,
    alpha: 1.0,
    highlight: [205, 210, 220],
    desc: 'SMT基板実装用の微粒子合金フラックスペースト'
  },
  thermal_grease: {
    id: 'thermal_grease',
    category: 'industrial',
    name: '放熱サーマルグリス (Thermal Grease)',
    icon: '❄️',
    color: [240, 242, 245],
    gloss: 0.35,
    alpha: 1.0,
    highlight: [255, 255, 255],
    desc: 'CPU/パワー半導体放熱用の高充填セラミックペースト'
  },
  silver_paste: {
    id: 'silver_paste',
    category: 'industrial',
    name: '導電性銀ペースト (Silver Paste)',
    icon: '⚡',
    color: [225, 230, 238],
    gloss: 0.85,
    alpha: 1.0,
    highlight: [255, 255, 255],
    desc: 'プリント基板配線形成用の高導電性ナノ銀ペースト'
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
    materialId: 'cleansing_gold',
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
    materialId: 'lotion_aqua',
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
    materialId: 'serum_pink',
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
    materialId: 'cream_white',
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
    materialId: 'foundation_ochre',
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
    materialId: 'rouge_red',
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
    materialId: 'clay_mask',
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
    desc: '【植物オイル・親油性】γ-オリザノールを含む伝統的天然美容油。',
    materialId: 'cleansing_gold',
    hlb: 7.0,
    emulsion_type: '天然植物油 (Pure Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.055,
    n: 1.0,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 25.0,
    rho: 920.0,
    inlet_vel: 1.2
  },
  camellia_oil: {
    id: 'camellia_oil',
    name: '椿油 (Camellia Oil)',
    desc: '【植物オイル・親油性】オレイン酸リッチな高品位オイル。',
    materialId: 'cleansing_gold',
    hlb: 7.0,
    emulsion_type: '天然植物油 (Pure Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.065,
    n: 1.0,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 30.0,
    rho: 915.0,
    inlet_vel: 1.2
  },
  olive_oil: {
    id: 'olive_oil',
    name: 'オリーブ油 (Olive Oil)',
    desc: '【植物オイル・親油性】適度な粘稠性を持つ代表的植物オイル。',
    materialId: 'cleansing_gold',
    hlb: 7.0,
    emulsion_type: '天然植物油 (Pure Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.084,
    n: 1.0,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 35.0,
    rho: 918.0,
    inlet_vel: 1.1
  },
  macadamia_oil: {
    id: 'macadamia_oil',
    name: 'マカデミアナッツ油 (Macadamia Oil)',
    desc: '【植物オイル・親油性】パルミトレイン酸を含み肌なじみ良好。',
    materialId: 'cleansing_gold',
    hlb: 7.0,
    emulsion_type: '天然植物油 (Pure Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.050,
    n: 1.0,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 25.0,
    rho: 915.0,
    inlet_vel: 1.2
  },
  salad_oil: {
    id: 'salad_oil',
    name: 'サラダ油 (Vegetable Salad Oil)',
    desc: '【低粘度ニュートン油】軽快な流動性を持つ精製植物油。',
    materialId: 'cleansing_gold',
    hlb: 6.5,
    emulsion_type: '精製植物油 (Refined Oil)',
    polarity: '親油性 (Lipophilic)',
    tau_y: 0.0,
    K: 0.055,
    n: 1.0,
    m_reg: 100.0,
    eta_min: 0.001,
    eta_max: 25.0,
    rho: 920.0,
    inlet_vel: 1.2
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
