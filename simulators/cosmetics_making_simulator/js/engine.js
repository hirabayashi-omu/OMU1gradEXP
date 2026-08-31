/**
 * Industrial Vacuum Emulsifying & Formulation Engine
 * 真空乳化攪拌装置＆メディカル・コスメ・日用品 製剤物理・HLB・ミセルシミュレーションエンジン
 */

class FormulationEngine {
  constructor() {
    this.productTemplates = {
      // 1. メディカル・コスメ (医薬部外品・薬用スキンケア)
      med_cica: {
        id: 'med_cica',
        category: 'メディカル・コスメ (医薬部外品)',
        categoryBadge: 'med',
        name: '🌿 薬用CICAリペア バリアエマルジョン',
        typeLabel: 'O/W型 薬用乳液 (水中油滴型エマルション)',
        emulsionType: 'O/W',
        requiredHLB: 12.5,
        description: 'ツボクサエキス（CICA）とトラネキサム酸、ヒト型セラミドをナノ乳化。水中に油滴が均一に分散するO/W型（水中油滴型）で、みずみずしい浸透感と角層バリア再生を両立。',
        scienceFact: '【O/W型エマルションとHLB値】親水性界面活性剤（高HLB: 10〜14）を用いることで、親水基（頭）が外側の水相を向き、親油基（尾）が内側の油滴を抱え込む正ミセル構造を形成し、肌に塗った瞬間みずみずしく広がります。',
        baseColor: '#e0f2fe',
        liquidColor: 'rgba(230, 245, 255, 0.92)',
        dropletColor: '#0284c7',
        targetDropletSize: 0.45, // μm
        standardViscosity: 2800, // mPa・s
        idealTemp: 78,
        idealCoolTemp: 32,
        defaultAnchorRpm: 35,
        defaultPaddleRpm: 50,
        defaultHomoRpm: 4800,
        defaultVacuum: -0.09, // MPa
        containerType: 'pump_bottle',
        containerName: 'エアレス遮光ポンプボトル (120mL)',
        materials: [
          { id: 'water_phase', name: '精製水＋ツボクサエキス(CICA)液', defaultRatio: 62, min: 45, max: 75, phase: 'water', hlb: 20.0, desc: '【水相】抗炎症・抗酸化ハーブ抽出水' },
          { id: 'active_tranexamic', name: '薬用トラネキサム酸 ＋ ナイアシンアミド', defaultRatio: 5, min: 2, max: 8, phase: 'water', hlb: 18.0, desc: '【有効成分】メラニン生成抑制・肌荒れ防止' },
          { id: 'oil_squalane', name: '植物性スクワラン ＋ ホホバ油', defaultRatio: 16, min: 8, max: 28, phase: 'oil', hlb: 1.0, desc: '【油相】皮脂膜に類似した高親和性エモリエント' },
          { id: 'ceramide_complex', name: 'ヒト型ナノセラミド複合体 ＋ シア脂', defaultRatio: 8, min: 3, max: 15, phase: 'oil', hlb: 3.5, desc: '【油相】角層ラメラ構造補修成分' },
          { id: 'emulsifier_poly', name: 'ポリグリセリル脂肪酸エステル (親水性乳化剤)', defaultRatio: 6, min: 3, max: 10, phase: 'water', hlb: 13.5, isSurfactant: true, desc: '【O/W乳化剤】HLB 13.5: 生体適合性親水性界面活性剤' },
          { id: 'stabilizer_gel', name: 'キサンタンガム ＋ ヒアルロン酸Na', defaultRatio: 3, min: 1, max: 6, phase: 'water', hlb: 16.0, desc: '【水溶性高分子】網目ゲルによる乳化安定化' }
        ]
      },

      med_shield_balm: {
        id: 'med_shield_balm',
        category: 'メディカル・コスメ (薬用皮膚保護バーム)',
        categoryBadge: 'med',
        name: '🛡️ 薬用高密着 モイスチャーシールドバーム',
        typeLabel: 'W/O型 薬用保護バーム (油中水滴型エマルション)',
        emulsionType: 'W/O',
        requiredHLB: 4.8,
        description: '油の中に微細な美容水滴を閉じ込めたW/O型（油中水滴型）処方。汗や水に極めて強く、肌表面に持続性オクルーシブ保護膜を形成して過酷な乾燥から肌を徹底ガード。',
        scienceFact: '【W/O型エマルションと逆ミセル】親油性界面活性剤（低HLB: 3〜6）を用いることで、親水基（頭）が内側の水滴を包み込み、親油基（尾）が外側の油相に向かって放射状に広がる逆ミセル構造を形成。高い耐水性と化粧持ち・保護力を発揮します。',
        baseColor: '#fef3c7',
        liquidColor: 'rgba(254, 243, 199, 0.95)',
        dropletColor: '#0284c7',
        targetDropletSize: 0.55,
        standardViscosity: 22000,
        idealTemp: 82,
        idealCoolTemp: 30,
        defaultAnchorRpm: 30,
        defaultPaddleRpm: 45,
        defaultHomoRpm: 5000,
        defaultVacuum: -0.092,
        containerType: 'jar',
        containerName: '高気密 シールドバーム缶 (60g)',
        materials: [
          { id: 'oil_petrolatum', name: '日局 高純度白色ワセリン ＋ スクワラン', defaultRatio: 45, min: 30, max: 60, phase: 'oil', hlb: 1.0, desc: '【油相 (外相)】高耐久撥水バリア保護膜' },
          { id: 'cera_wax', name: '天然ミツロウ ＋ マイクロワックス', defaultRatio: 12, min: 5, max: 20, phase: 'oil', hlb: 2.0, desc: '【油相】体温でとろける密着固形脂' },
          { id: 'water_solution', name: '超純水 ＋ アラントイン・セラミド水溶液', defaultRatio: 30, min: 15, max: 45, phase: 'water', hlb: 20.0, desc: '【水相 (内相)】内包される抗炎症美容水滴' },
          { id: 'emulsifier_wo', name: 'ポリリシノレイン酸ポリグリセリル (親油性乳化剤)', defaultRatio: 8, min: 4, max: 14, phase: 'oil', hlb: 4.2, isSurfactant: true, desc: '【W/O乳化剤】HLB 4.2: 強力な油中水滴型逆ミセル形成剤' },
          { id: 'magnesium_sulfate', name: '硫酸マグネシウム (W/O乳化安定塩)', defaultRatio: 3, min: 1, max: 6, phase: 'water', hlb: 15.0, desc: '【安定化塩】水滴界面の静電反発を防ぎ分離防止' },
          { id: 'tocopherol', name: '天然ビタミンE (トコフェロール)', defaultRatio: 2, min: 0, max: 4, phase: 'oil', hlb: 1.0, desc: '【抗酸化】油脂の酸化防止' }
        ]
      },

      med_heparin: {
        id: 'med_heparin',
        category: 'メディカル・コスメ (医薬部外品・薬用治療)',
        categoryBadge: 'med',
        name: '🔬 ヘパリン類似物質配合 薬用高保湿クリーム',
        typeLabel: '高粘度 O/W型 薬用濃厚保湿クリーム',
        emulsionType: 'O/W',
        requiredHLB: 11.8,
        description: 'ヘパリン類似物質が血行を促進し、角層の水分保持能を根本改善。高純度白色ワセリンとスクワランを高圧ホモジナイズで贅沢に乳化した濃厚処方。',
        scienceFact: '【界面活性剤のHLBマッチング】所要HLB（11.8）に対して乳化剤のブレンド比率が合致すると、界面張力が極小化し、超微細な液晶エマルションが形成されて経時分離を完全に防止できます。',
        baseColor: '#ffffff',
        liquidColor: 'rgba(255, 255, 255, 0.98)',
        dropletColor: '#f59e0b',
        targetDropletSize: 0.65,
        standardViscosity: 18500,
        idealTemp: 82,
        idealCoolTemp: 30,
        defaultAnchorRpm: 28,
        defaultPaddleRpm: 45,
        defaultHomoRpm: 5200,
        defaultVacuum: -0.092,
        containerType: 'jar',
        containerName: 'アルミシール付き メディカルジャー (100g)',
        materials: [
          { id: 'water_base', name: '超純水 ＋ グリセリン高濃度水相', defaultRatio: 48, min: 35, max: 60, phase: 'water', hlb: 20.0, desc: '【水相】持続性モイスチャー基剤' },
          { id: 'heparin_active', name: 'ヘパリン類似物質 ＋ グリチルリチン酸2K', defaultRatio: 6, min: 3, max: 10, phase: 'water', hlb: 18.0, desc: '【有効成分】血行促進・保水能改善・消炎' },
          { id: 'petrolatum', name: '日局 高純度白色ワセリン', defaultRatio: 20, min: 10, max: 30, phase: 'oil', hlb: 1.0, desc: '【油相】皮膚保護オクルーシブ膜形成' },
          { id: 'squalane_wax', name: '深海スクワラン ＋ マイクロクリスタリンワックス', defaultRatio: 14, min: 6, max: 22, phase: 'oil', hlb: 1.5, desc: '【油相】なめらかな伸びと密着感' },
          { id: 'emulsifier_nonionic', name: '自己乳化型モノステアリン酸グリセリン', defaultRatio: 8, min: 4, max: 12, phase: 'oil', hlb: 11.5, isSurfactant: true, desc: '【O/W乳化剤】HLB 11.5: 濃厚液晶エマルション形成剤' },
          { id: 'buffer_agent', name: 'pH調整緩衝液 ＋ トコフェロール(VE)', defaultRatio: 4, min: 1, max: 6, phase: 'water', hlb: 16.0, desc: '【安定化剤】弱酸性維持＆抗酸化' }
        ]
      },

      med_whitening: {
        id: 'med_whitening',
        category: 'メディカル・コスメ (薬用美白美容液)',
        categoryBadge: 'med',
        name: '💎 薬用美白・抗炎症 ナノクリアセラム',
        typeLabel: '高浸透 ナノエマルジョン美容液 (高HLB可溶化)',
        emulsionType: 'O/W',
        requiredHLB: 15.2,
        description: '高浸透ビタミンC誘導体とアルブチンを高圧ホモミキサーで粒子径0.2μm以下の透明感あるナノエマルションに仕上げた超微細美容液。',
        scienceFact: '【高HLB可溶化とナノエマルジョン】HLB 15以上の高親水性レシチン・界面活性剤を用いると、微細なミセル（ナノドロップレット）が形成され、光の波長以下となるため青みがかった透明な外観になります。',
        baseColor: '#ecfeff',
        liquidColor: 'rgba(224, 254, 255, 0.88)',
        dropletColor: '#06b6d4',
        targetDropletSize: 0.18,
        standardViscosity: 850,
        idealTemp: 70,
        idealCoolTemp: 28,
        defaultAnchorRpm: 40,
        defaultPaddleRpm: 60,
        defaultHomoRpm: 5800,
        defaultVacuum: -0.088,
        containerType: 'dropper',
        containerName: 'スポイト付 コバルトブルー遮光瓶 (50mL)',
        materials: [
          { id: 'water_extract', name: '白樺樹液 ＋ ダマスクバラ花水', defaultRatio: 66, min: 50, max: 78, phase: 'water', hlb: 20.0, desc: '【水相】ビタミン・ミネラル豊富な植物水' },
          { id: 'active_vit_c', name: '持続型ビタミンC誘導体(AA-2G) ＋ α-アルブチン', defaultRatio: 8, min: 3, max: 12, phase: 'water', hlb: 18.0, desc: '【有効成分】チロシナーゼ阻害・美白還元' },
          { id: 'oil_ester', name: '植物性エステル油 ＋ カニナバラ果実油', defaultRatio: 12, min: 5, max: 20, phase: 'oil', hlb: 2.5, desc: '【油相】軽やかな感触と必須脂肪酸補給' },
          { id: 'nano_lecithin', name: '水添大豆レシチン(高純度リン脂質)', defaultRatio: 7, min: 3, max: 12, phase: 'water', hlb: 15.5, isSurfactant: true, desc: '【ナノ乳化剤】HLB 15.5: 細胞膜と同一のリン脂質二重層' },
          { id: 'moist_polyol', name: 'BG ＋ 浸透型低分子ヒアルロン酸', defaultRatio: 5, min: 2, max: 10, phase: 'water', hlb: 16.0, desc: '【保湿剤】角層深部へのデリバリー促進' },
          { id: 'antioxidant', name: 'アスタキサンチン ＋ フラーレン', defaultRatio: 2, min: 0, max: 5, phase: 'oil', hlb: 1.0, desc: '【機能成分】スーパー抗酸化エイジングケア' }
        ]
      },

      // 2. コスメ・スキンケア (一般化粧品)
      cos_cream: {
        id: 'cos_cream',
        category: 'コスメ (ラグジュアリースキンケア)',
        categoryBadge: 'cosme',
        name: '🌸 高純度ボタニカル フェイシャルリッチクリーム',
        typeLabel: 'シア＆アルガン 液晶乳化リッチクリーム (O/W型)',
        emulsionType: 'O/W',
        requiredHLB: 11.0,
        description: 'オーガニックシアバターと未精製アルガンオイルをブレンド。なめらかなシルキータッチでとろける極上のテクスチャーを実現。',
        scienceFact: '【ラメラ液晶乳化】親水基と親油基が規則正しく並んだラメラ液晶構造（二重膜）が水分と油分をミルフィーユ状にサンドイッチし、肌内部のセラミドバリアと同等の持続保湿力を生み出します。',
        baseColor: '#fffbeb',
        liquidColor: 'rgba(255, 252, 235, 0.95)',
        dropletColor: '#f59e0b',
        targetDropletSize: 0.8,
        standardViscosity: 14000,
        idealTemp: 76,
        idealCoolTemp: 32,
        defaultAnchorRpm: 32,
        defaultPaddleRpm: 50,
        defaultHomoRpm: 4200,
        defaultVacuum: -0.09,
        containerType: 'jar',
        containerName: 'フロストガラス スパチュラ付きジャー (50g)',
        materials: [
          { id: 'water_floral', name: 'ダマスクローズ芳香蒸留水', defaultRatio: 54, min: 40, max: 68, phase: 'water', hlb: 20.0, desc: '【水相】優雅な香りと収斂作用をもつ花水' },
          { id: 'shea_butter', name: '未精製オーガニックシアバター', defaultRatio: 16, min: 8, max: 25, phase: 'oil', hlb: 1.0, desc: '【油相】体温（36℃）でとろけるリッチなステアリン酸脂' },
          { id: 'argan_oil', name: 'モロッコ産 エキストラバージンアルガンオイル', defaultRatio: 12, min: 5, max: 20, phase: 'oil', hlb: 1.5, desc: '【油相】ビタミンEとオレイン酸が豊富な黄金オイル' },
          { id: 'olive_emulsifier', name: 'オリーブ由来セテアリルアルコール乳化剤', defaultRatio: 8, min: 4, max: 14, phase: 'oil', hlb: 10.8, isSurfactant: true, desc: '【O/W乳化剤】HLB 10.8: 肌に溶け込む液晶ラメラ形成剤' },
          { id: 'glycerin_extract', name: '植物性濃縮グリセリン ＋ エーデルワイスエキス', defaultRatio: 7, min: 2, max: 12, phase: 'water', hlb: 18.0, desc: '【保湿エキス】高山植物の引き締め保護成分' },
          { id: 'essential_oil', name: 'ネロリ＆ゼラニウム 天然オーガニック精油', defaultRatio: 3, min: 0, max: 5, phase: 'oil', hlb: 1.0, desc: '【アロマ】心を解きほぐすフローラルハーブの香り' }
        ]
      },

      cos_shampoo: {
        id: 'cos_shampoo',
        category: 'コスメ・ヘアケア (サロン品質)',
        categoryBadge: 'cosme',
        name: '🧴 アミノ酸系 スカルプディープモイスチャーシャンプー',
        typeLabel: '棒状ミセル形成 アミノ酸系洗浄料 (高HLB 14)',
        emulsionType: 'MICELLE',
        requiredHLB: 14.5,
        description: 'ココイルグルタミン酸とラウロイルメチルアラニンを高濃度ブレンド。自己組織化による棒状ミセルの網目構造で濃密クッション泡を形成。',
        scienceFact: '【ミセル会合と洗浄機構】界面活性剤分子が水中で自発的に球状ミセルから長大な棒状ミセルへと会合・成長することで、皮脂汚れ（親油性）を中心部に捕獲して水で洗い流します。',
        baseColor: '#f0fdf4',
        liquidColor: 'rgba(235, 254, 240, 0.9)',
        dropletColor: '#10b981',
        targetDropletSize: 1.2,
        standardViscosity: 4200,
        idealTemp: 55,
        idealCoolTemp: 30,
        defaultAnchorRpm: 38,
        defaultPaddleRpm: 45,
        defaultHomoRpm: 2400,
        defaultVacuum: -0.085,
        containerType: 'pump_bottle',
        containerName: 'サステナブルリフィル ポンプボトル (400mL)',
        materials: [
          { id: 'water_base', name: '超純水（ベース基剤）', defaultRatio: 58, min: 45, max: 70, phase: 'water', hlb: 20.0, desc: '【水相】不純物を極限まで除去した清浄水' },
          { id: 'amino_surfactant1', name: 'ココイルグルタミン酸TEA (主界面活性剤)', defaultRatio: 18, min: 10, max: 28, phase: 'water', hlb: 14.8, isSurfactant: true, desc: '【洗浄剤】HLB 14.8: 弱酸性アミノ酸系界面活性剤' },
          { id: 'amino_surfactant2', name: 'ラウロイルメチルアラニンNa (助泡界面活性剤)', defaultRatio: 10, min: 5, max: 18, phase: 'water', hlb: 13.8, isSurfactant: true, desc: '【洗浄剤】HLB 13.8: 濃密ホイップ泡形成' },
          { id: 'silk_keratin', name: '加水分解シルクペプチド ＋ ケラチンタンパク', defaultRatio: 6, min: 2, max: 10, phase: 'water', hlb: 17.0, desc: '【補修成分】毛髪内部のコルテックスへ浸透補修' },
          { id: 'thickener_polymer', name: '植物由来セルロースガム ＋ グアーヒドロキシ', defaultRatio: 5, min: 2, max: 8, phase: 'water', hlb: 16.0, desc: '【増粘剤】滑らかな指通りとクッション泡を維持' },
          { id: 'citrus_aroma', name: 'ベルガモット＆ユーカリ 天然精油ブレンド', defaultRatio: 3, min: 0, max: 5, phase: 'oil', hlb: 1.0, desc: '【香料】頭皮をスッキリ整えるアロマ' }
        ]
      },

      // 3. 日用品・サニタリー (衛生＆機能性デイリーケア)
      care_gel: {
        id: 'care_gel',
        category: '日用品・サニタリー (指定医薬部外品・衛生)',
        categoryBadge: 'daily',
        name: '🧊 薬用アルコール殺菌 モイスチャークリアジェル',
        typeLabel: '高分子ハイドロゲル 薬用手指消毒剤',
        emulsionType: 'GEL',
        requiredHLB: 16.0,
        description: '発酵エタノール75vol%を含有しながら、ヒアルロン酸とアロエベラで手荒れをブロック。カルボマーの3次元網目により速乾サラサラ。',
        scienceFact: '【高分子カルボマーの中和増粘】アクリル酸重合体にアミンで中和（pH6〜7）すると、カルボキシル基がイオン化して静電反発により分子鎖が劇的に広がり、一瞬で透明な弾力ゲルが構築されます。',
        baseColor: '#f5f3ff',
        liquidColor: 'rgba(245, 243, 255, 0.85)',
        dropletColor: '#8b5cf6',
        targetDropletSize: 0.3,
        standardViscosity: 6500,
        idealTemp: 30,
        idealCoolTemp: 25,
        defaultAnchorRpm: 25,
        defaultPaddleRpm: 35,
        defaultHomoRpm: 1800,
        defaultVacuum: -0.06,
        containerType: 'dropper',
        containerName: 'フリップトップ付き 携帯スマートボトル (80mL)',
        materials: [
          { id: 'ethanol_active', name: '植物発酵エタノール (75vol% 殺菌主成分)', defaultRatio: 72, min: 60, max: 80, phase: 'water', hlb: 20.0, desc: '【有効成分】ウイルス・細菌のエンベロープ破壊' },
          { id: 'water_pure', name: '精製水', defaultRatio: 15, min: 8, max: 25, phase: 'water', hlb: 20.0, desc: '【水相】エタノールの浸透殺菌力を最大化する最適水分' },
          { id: 'carbomer_polymer', name: '高重合カルボキシビニルポリマー (カルボマー)', defaultRatio: 4, min: 1, max: 7, phase: 'water', hlb: 16.0, desc: '【ゲル化剤】3次元網目構造を形成する透明高分子' },
          { id: 'skin_shield', name: 'トリプルヒアルロン酸 ＋ アロエベラ葉エキス', defaultRatio: 5, min: 2, max: 10, phase: 'water', hlb: 18.0, desc: '【保湿バリア】アルコールによる脱脂手荒れを予防' },
          { id: 'neutralizer', name: 'TEA(トリエタノールアミン) 中和増粘剤', defaultRatio: 2, min: 1, max: 4, phase: 'water', hlb: 15.0, desc: '【中和剤】高分子を瞬時にゲル化させるpH調整剤' },
          { id: 'tea_tree', name: 'オーガニックティーツリー＆スペアミント精油', defaultRatio: 2, min: 0, max: 4, phase: 'oil', hlb: 1.0, desc: '【天然抗菌】爽快な清涼感と抗菌アロマ' }
        ]
      }
    };

    this.currentProductId = 'med_cica';
    this.customFormula = {};
    this.productName = '特製 薬用CICAリペア バリアエマルジョン';

    // 運転パラメータ (実機設定)
    this.anchorRpm = 35;
    this.paddleRpm = 50;
    this.homoRpm = 4800;
    this.targetVacuum = -0.09;
    this.targetHeatTemp = 78;
    this.targetCoolTemp = 32;

    // リアルタイム物理・化学ステート
    this.mainVesselTemp = 23.0;
    this.waterKettleTemp = 23.0;
    this.oilKettleTemp = 23.0;
    this.currentVacuum = 0.0;
    this.currentViscosity = 1.0;
    this.dropletSize = 50.0;
    this.deaerationRate = 0.0;
    this.emulsionStability = 0.0;
    this.waterTransferred = 0.0;
    this.oilTransferred = 0.0;

    // HLB & ミセル化学ステート
    this.effectiveHLB = 12.5; // 計算された実効HLB
    this.hlbMatchScore = 100; // 所要HLBとのマッチ度 (%)
    this.activeEmulsionType = 'O/W'; // 現在のエマルション型 (O/W, W/O, MICELLE, GEL)
    this.molecularViewMode = 'micelle'; // 'micelle' (分子・ミセル拡大) or 'droplets' (全体分散)

    // シミュレーション実行制御
    this.running = false;
    this.paused = false;
    this.simSpeed = 1.0;
    this.simTime = 0.0;

    // 5工程（SOP）
    this.stages = {
      phase1: { id: 'phase1', name: '① 水相・油相 予備加熱溶解', subName: 'Water & Oil Phase Pre-dissolution (75℃)', status: 'IDLE', progress: 0, desc: '水相釜（水溶性成分）と油相釜（油・固形ワックス）をそれぞれジャケット蒸気で75〜82℃に加温し完全溶解。' },
      phase2: { id: 'phase2', name: '② 真空吸引移送・主釜仕込み', subName: 'Vacuum Suction Loading to Main Vessel', status: 'IDLE', progress: 0, desc: '主釜を真空吸引（-0.08MPa）にし、水相を全量仕込んだ後、油相をバルブ微開で徐々に吸引して粗混合開始。' },
      phase3: { id: 'phase3', name: '③ 高剪断ホモ乳化 ＆ 真空脱泡', subName: 'High-Shear Homogenization & Deaeration', status: 'IDLE', progress: 0, desc: '底部ホモミキサー（4,500〜5,800rpm）の超高剪断力で油滴をサブミクロンへ微細化。界面活性剤がミセルを自己組織化。' },
      phase4: { id: 'phase4', name: '④ ジャケット徐冷 ＆ スクレーパー結晶化', subName: 'Controlled Cooling & Annealing (32℃)', status: 'IDLE', progress: 0, desc: 'ジャケットにチラー冷却水を通水。テフロンスクレーパーが壁面を掻き落としながら30〜35℃へ均一に徐冷・液晶ラメラ構造安定化。' },
      phase5: { id: 'phase5', name: '⑤ クリーン充填 ＆ 品質検査 (QC)', subName: 'Aseptic Filling & Quality Certification', status: 'IDLE', progress: 0, unitsFilled: 0, targetUnits: 25, desc: '無菌クリーンルームにて自動ボトル充填・打栓。粒子径・HLB安定性・粘度・脱泡度の品質合格判定を実施。' }
    };

    this.qcReport = {
      grade: 'S+',
      particleSizeResult: '0.38 μm (サブミクロン均一分散)',
      particleSizeScore: 98,
      viscosityResult: '2,850 mPa・s (目標値適合)',
      viscosityScore: 95,
      stabilityResult: '99.2% (HLB最適化・遠心分離安定)',
      stabilityScore: 99,
      deaerationResult: '99.8% (気泡混入ゼロ・鏡面光沢)',
      deaerationScore: 100,
      sensoryTitle: '極上のなめらかシルキータッチ ＆ 驚異のバリア浸透感',
      standardsCompliance: '医薬品医療機器等法（薬機法）およびGMP基準 適合'
    };

    this.initFormula();
  }

  initFormula() {
    const p = this.productTemplates[this.currentProductId];
    this.customFormula = {};
    p.materials.forEach(m => {
      this.customFormula[m.id] = m.defaultRatio;
    });

    this.anchorRpm = p.defaultAnchorRpm;
    this.paddleRpm = p.defaultPaddleRpm;
    this.homoRpm = p.defaultHomoRpm;
    this.targetVacuum = p.defaultVacuum;
    this.targetHeatTemp = p.idealTemp;
    this.targetCoolTemp = p.idealCoolTemp;
    this.productName = p.name;
    this.activeEmulsionType = p.emulsionType;

    this.calculateHLB();
    this.reset();
  }

  setProduct(productId) {
    if (!this.productTemplates[productId]) return;
    this.currentProductId = productId;
    this.initFormula();
  }

  setMaterialRatio(matId, val) {
    this.customFormula[matId] = parseFloat(val);
    this.calculateHLB();
  }

  calculateHLB() {
    const p = this.getCurrentProduct();
    let totalSurfactantWeight = 0;
    let weightedHLB = 0;

    // 界面活性剤成分の加重平均HLB計算
    p.materials.forEach(m => {
      const ratio = this.customFormula[m.id] !== undefined ? this.customFormula[m.id] : m.defaultRatio;
      if (m.isSurfactant) {
        totalSurfactantWeight += ratio;
        weightedHLB += m.hlb * ratio;
      }
    });

    if (totalSurfactantWeight > 0) {
      this.effectiveHLB = weightedHLB / totalSurfactantWeight;
    } else {
      this.effectiveHLB = p.requiredHLB;
    }

    // 所要HLBとのマッチ度スコア (100点満点)
    const diff = Math.abs(this.effectiveHLB - p.requiredHLB);
    this.hlbMatchScore = Math.max(50, Math.min(100, Math.round(100 - diff * 15)));

    // HLB値に応じたエマルション型の動的判定
    if (this.effectiveHLB < 7.0) {
      this.activeEmulsionType = 'W/O';
    } else if (p.emulsionType === 'MICELLE') {
      this.activeEmulsionType = 'MICELLE';
    } else if (p.emulsionType === 'GEL') {
      this.activeEmulsionType = 'GEL';
    } else {
      this.activeEmulsionType = 'O/W';
    }
  }

  getCurrentProduct() {
    return this.productTemplates[this.currentProductId];
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.simTime = 0.0;

    this.mainVesselTemp = 23.0;
    this.waterKettleTemp = 23.0;
    this.oilKettleTemp = 23.0;
    this.currentVacuum = 0.0;
    this.currentViscosity = 1.0;
    this.dropletSize = 50.0;
    this.deaerationRate = 0.0;
    this.emulsionStability = 0.0;
    this.waterTransferred = 0.0;
    this.oilTransferred = 0.0;

    Object.keys(this.stages).forEach(k => {
      this.stages[k].status = 'IDLE';
      this.stages[k].progress = 0;
      if (this.stages[k].unitsFilled !== undefined) {
        this.stages[k].unitsFilled = 0;
      }
    });
  }

  start() {
    this.running = true;
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  update(dtRaw) {
    if (!this.running || this.paused) return;
    const dt = dtRaw * this.simSpeed;
    this.simTime += dt;

    const p = this.getCurrentProduct();

    // Phase 1: 予備加熱溶解
    const s1 = this.stages.phase1;
    if (s1.status === 'IDLE') s1.status = 'RUNNING';
    if (s1.status === 'RUNNING') {
      this.waterKettleTemp += (this.targetHeatTemp - this.waterKettleTemp) * (0.35 * dt);
      this.oilKettleTemp += (this.targetHeatTemp - this.oilKettleTemp) * (0.30 * dt);

      s1.progress = Math.min(100, s1.progress + (dt / 4.0) * 100);
      if (s1.progress >= 100) {
        s1.status = 'COMPLETED';
        if (this.stages.phase2.status === 'IDLE') this.stages.phase2.status = 'RUNNING';
      }
    }

    // Phase 2: 真空吸引仕込み
    const s2 = this.stages.phase2;
    if (s2.status === 'RUNNING') {
      this.currentVacuum += (this.targetVacuum - this.currentVacuum) * (0.45 * dt);

      if (s2.progress < 50) {
        this.waterTransferred = Math.min(100, (s2.progress / 50) * 100);
      } else {
        this.waterTransferred = 100;
        this.oilTransferred = Math.min(100, ((s2.progress - 50) / 50) * 100);
      }

      this.mainVesselTemp += (this.targetHeatTemp - this.mainVesselTemp) * (0.4 * dt);
      this.dropletSize = Math.max(25.0, this.dropletSize - 5.0 * dt);

      s2.progress = Math.min(100, s2.progress + (dt / 4.5) * 100);
      if (s2.progress >= 100) {
        s2.status = 'COMPLETED';
        if (this.stages.phase3.status === 'IDLE') this.stages.phase3.status = 'RUNNING';
      }
    }

    // Phase 3: 高剪断ホモ乳化 ＆ 真空脱泡 (ミセル自己組織化)
    const s3 = this.stages.phase3;
    if (s3.status === 'RUNNING') {
      const shearIntensity = (this.homoRpm / 5000.0);
      const hlbFactor = (this.hlbMatchScore / 100.0);
      const breakupRate = 0.55 * shearIntensity * hlbFactor * dt;

      this.dropletSize = Math.max(p.targetDropletSize, this.dropletSize - (this.dropletSize - p.targetDropletSize) * breakupRate);

      const vacuumFactor = Math.abs(this.currentVacuum) / 0.09;
      this.deaerationRate = Math.min(100, this.deaerationRate + 18.0 * vacuumFactor * dt);
      this.emulsionStability = Math.min(100, (1.0 - (this.dropletSize - p.targetDropletSize) / 50.0) * hlbFactor * 100);
      this.currentViscosity = Math.min(p.standardViscosity * 0.4, this.currentViscosity + 400 * dt);

      s3.progress = Math.min(100, s3.progress + (dt / 6.0) * 100);
      if (s3.progress >= 100) {
        s3.status = 'COMPLETED';
        if (this.stages.phase4.status === 'IDLE') this.stages.phase4.status = 'RUNNING';
      }
    }

    // Phase 4: ジャケット徐冷 ＆ 液晶ラメラ結晶化
    const s4 = this.stages.phase4;
    if (s4.status === 'RUNNING') {
      this.mainVesselTemp += (this.targetCoolTemp - this.mainVesselTemp) * (0.35 * dt);
      this.currentViscosity += (p.standardViscosity - this.currentViscosity) * (0.45 * dt);
      this.deaerationRate = Math.min(100, this.deaerationRate + 8.0 * dt);

      s4.progress = Math.min(100, s4.progress + (dt / 5.0) * 100);
      if (s4.progress >= 100) {
        s4.status = 'COMPLETED';
        if (this.stages.phase5.status === 'IDLE') this.stages.phase5.status = 'RUNNING';
      }
    }

    // Phase 5: クリーン充填 ＆ QC
    const s5 = this.stages.phase5;
    if (s5.status === 'RUNNING') {
      s5.unitsFilled = Math.min(s5.targetUnits, s5.unitsFilled + (s5.targetUnits / 4.0) * dt);
      s5.progress = (s5.unitsFilled / s5.targetUnits) * 100;

      if (s5.progress >= 100) {
        s5.status = 'COMPLETED';
        this.calculateQCCertificate();
      }
    }
  }

  calculateQCCertificate() {
    const p = this.getCurrentProduct();
    const finalSize = this.dropletSize.toFixed(2);
    const finalVisc = Math.round(this.currentViscosity);
    const finalDeaer = this.deaerationRate.toFixed(1);

    const sizeDiff = Math.abs(this.dropletSize - p.targetDropletSize);
    const sizeScore = Math.max(80, Math.min(100, Math.round(100 - sizeDiff * 30)));

    const viscDiffRatio = Math.abs(this.currentViscosity - p.standardViscosity) / p.standardViscosity;
    const viscScore = Math.max(80, Math.min(100, Math.round(100 - viscDiffRatio * 50)));

    const deaerScore = Math.round(this.deaerationRate);
    const overallScore = (sizeScore + viscScore + deaerScore + this.hlbMatchScore) / 4;
    const grade = overallScore >= 95 ? 'S+ (最高品質・GMP基準適合)' : overallScore >= 90 ? 'S (極めて優良)' : 'A (合格)';

    this.qcReport = {
      grade: grade,
      particleSizeResult: `${finalSize} μm (${finalSize < 0.5 ? '超微細ナノエマルション' : '均一マイクロエマルション'})`,
      particleSizeScore: sizeScore,
      viscosityResult: `${finalVisc.toLocaleString()} mPa・s (最適チキソトロピー性)`,
      viscosityScore: viscScore,
      stabilityResult: `${(98.2 + (this.hlbMatchScore / 100) * 1.6).toFixed(1)}% (HLB整合・50℃ 1ヶ月安定)`,
      stabilityScore: this.hlbMatchScore,
      deaerationResult: `${finalDeaer}% (気泡ゼロ・シルキー鏡面光沢)`,
      deaerationScore: deaerScore,
      sensoryTitle: `${p.name} - ${this.activeEmulsionType}型 製剤化完了`,
      standardsCompliance: '医薬品医療機器等法（薬機法）GMP製剤基準およびISO22716（化粧品GMP）適合'
    };
  }
}

if (typeof window !== 'undefined') {
  window.FormulationEngine = FormulationEngine;
}
