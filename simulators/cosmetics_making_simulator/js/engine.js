/**
 * DIY Cosmetics & Daily Care Formulation Engine
 * 身近なコスメ・日用品メイキングシミュレーター
 */

class FormulationEngine {
  constructor() {
    this.productTemplates = {
      shampoo: {
        id: 'shampoo',
        name: '🧴 泡立ちアロマシャンプー',
        category: 'ヘアケア・洗浄剤',
        description: '豊かな泡立ちで汚れをスッキリ落とし、髪がきしまない優しい洗い心地のシャンプーを作ります。',
        scienceFact: '【化学】界面活性剤分子（水になじむ親水基と油になじむ親油基）が油汚れを包み込んで水に流します（ミセル形成）。',
        baseColor: '#00e5ff',
        defaultTemp: 45,
        defaultStir: 320,
        containerType: 'pump_bottle',
        containerName: 'ポンプボトル (300mL)',
        materials: [
          { id: 'water', name: '精製水（ベース）', defaultRatio: 65, min: 40, max: 80, unit: '%', type: 'base', desc: 'すべての土台となる清潔な水' },
          { id: 'surfactant', name: 'アミノ酸系マイルド洗浄成分', defaultRatio: 20, min: 10, max: 35, unit: '%', type: 'active', desc: '髪と地肌に優しい泡立ち成分' },
          { id: 'thickener', name: '植物由来とろみ成分', defaultRatio: 8, min: 2, max: 15, unit: '%', type: 'texture', desc: '使いやすいジェル状にする成分' },
          { id: 'conditioner', name: 'シルクプロテイン・保湿エキス', defaultRatio: 5, min: 1, max: 10, unit: '%', type: 'care', desc: '指通りをなめらかにする成分' },
          { id: 'fragrance', name: '天然シトラスアロマ精油', defaultRatio: 2, min: 0, max: 5, unit: '%', type: 'aroma', desc: '爽やかな柑橘の香り' }
        ]
      },
      lotion: {
        id: 'lotion',
        name: '💧 ぷるぷる高保湿アロマ化粧水',
        category: 'スキンケア・保湿液',
        description: '肌の奥（角質層）まで水分を届け、ヒアルロン酸で潤いを閉じ込めるフレッシュな化粧水。',
        scienceFact: '【生物・化学】ヒアルロン酸は自分の重さの約6000倍の水を抱え込む高分子！分子の力で水分蒸発を防ぎます。',
        baseColor: '#00e676',
        defaultTemp: 40,
        defaultStir: 250,
        containerType: 'bottle',
        containerName: 'ミストボトル (150mL)',
        materials: [
          { id: 'water', name: '高純度フローラルウォーター', defaultRatio: 78, min: 50, max: 90, unit: '%', type: 'base', desc: '植物の恵みを含んだ化粧水ベース' },
          { id: 'hyaluronic', name: '高分子ヒアルロン酸液', defaultRatio: 10, min: 2, max: 20, unit: '%', type: 'active', desc: '圧倒的な保水力をもつ保湿の王様' },
          { id: 'glycerin', name: '植物性グリセリン', defaultRatio: 7, min: 2, max: 15, unit: '%', type: 'texture', desc: 'しっとり感を与える定番保湿剤' },
          { id: 'vitamin', name: 'ビタミンC誘導体・植物エキス', defaultRatio: 3, min: 1, max: 8, unit: '%', type: 'care', desc: 'キメを整えて透明感をアップ' },
          { id: 'fragrance', name: 'ダマスクローズ精油', defaultRatio: 2, min: 0, max: 5, unit: '%', type: 'aroma', desc: '華やかでリラックスする花の香り' }
        ]
      },
      cream: {
        id: 'cream',
        name: '🍦 なめらかうるおいハンドクリーム',
        category: 'スキンケア・乳化エマルション',
        description: 'シアバターとホホバオイルを水とブレンド。白く変化する「乳化（エマルション）」の不思議を体験！',
        scienceFact: '【化学】水と油に界面活性剤を加え、高速でかき混ぜることでミクロな油滴が水中に均一に分散し、白いクリームになります。',
        baseColor: '#ffb74d',
        defaultTemp: 70,
        defaultStir: 480,
        containerType: 'jar',
        containerName: 'アルミチューブ / ジャー容器 (50g)',
        materials: [
          { id: 'water', name: '精製水（水相）', defaultRatio: 55, min: 30, max: 70, unit: '%', type: 'base', desc: 'クリームのみずみずしさを担当' },
          { id: 'oil', name: 'オーガニックホホバオイル（油相）', defaultRatio: 20, min: 10, max: 35, unit: '%', type: 'active', desc: '肌を柔らかく守る天然オイル' },
          { id: 'shea', name: '天然シアバター・ミツロウ', defaultRatio: 12, min: 5, max: 20, unit: '%', type: 'texture', desc: '体温でとろける濃厚リッチな保湿固形脂' },
          { id: 'emulsifier', name: 'オリーブ由来乳化ワックス', defaultRatio: 8, min: 3, max: 15, unit: '%', type: 'care', desc: '水と油を仲良く結びつける乳化剤' },
          { id: 'fragrance', name: 'オーガニックラベンダー精油', defaultRatio: 5, min: 0, max: 8, unit: '%', type: 'aroma', desc: '安らぐハーブの香り' }
        ]
      },
      handgel: {
        id: 'handgel',
        name: '🌿 ひんやり爽快・清潔ハンドジェル',
        category: '衛生ケア・アルコールジェル',
        description: '手肌を清潔に保ちながら、ヒアルロン酸とミントで乾燥を防ぎスッキリ爽快にするジェル。',
        scienceFact: '【化学・物理】カルボマーなどの高分子ポリマーが水を抱え込んで3次元網目構造（ゲル）をつくり、プルプルのジェルに変化します。',
        baseColor: '#b388ff',
        defaultTemp: 25,
        defaultStir: 200,
        containerType: 'dropper',
        containerName: '携帯用チューブボトル (60mL)',
        materials: [
          { id: 'ethanol', name: '発酵植物エタノール', defaultRatio: 65, min: 50, max: 75, unit: '%', type: 'base', desc: 'バイキンをすばやく除去する清潔成分' },
          { id: 'water', name: '精製水', defaultRatio: 22, min: 10, max: 35, unit: '%', type: 'base', desc: '刺激をやわらげる水' },
          { id: 'carbomer', name: '高分子ゲル化剤（ぷるぷる基剤）', defaultRatio: 6, min: 2, max: 12, unit: '%', type: 'texture', desc: '液体を一瞬でジェルに変えるポリマー' },
          { id: 'aloe', name: 'アロエベラ・ヒアルロン酸', defaultRatio: 5, min: 1, max: 10, unit: '%', type: 'care', desc: 'アルコールによる手荒れを防ぐ成分' },
          { id: 'fragrance', name: 'ハッカ油（メントール）精油', defaultRatio: 2, min: 0, max: 5, unit: '%', type: 'aroma', desc: 'ひんやりクールな清涼感' }
        ]
      }
    };

    this.currentProductId = 'shampoo';
    this.customFormula = {};
    this.productName = 'マイ・オリジナルシャンプー';
    this.targetTemp = 45;
    this.targetStir = 320;

    this.running = false;
    this.paused = false;
    this.simSpeed = 1.0;
    this.simTime = 0;
    this.batchCount = 1;

    this.stages = {
      weighing: { status: 'IDLE', progress: 0, title: '① 原料の計量', desc: '選んだレシピの原料を1g単位で正確にカップへ量り取ります。' },
      blending: { status: 'IDLE', progress: 0, temp: 20, stirSpeed: 0, viscosity: 1.0, emulsionDegree: 0, title: '② 加熱・ブレンド溶解', desc: 'ヒーターで温めながら撹拌し、均一に溶かして乳化・ジェル化させます。' },
      filtration: { status: 'IDLE', progress: 0, smoothness: 0, title: '③ ろ過・なめらか仕上げ', desc: '細かなメッシュフィルターを通し、ダマや気泡を取り除いてツヤを出します。' },
      bottling: { status: 'IDLE', progress: 0, unitsFilled: 0, targetUnits: 20, title: '④ ボトル充填・キャッピング', desc: 'お洒落な容器に1本ずつピッタリ注ぎ、フタ（ポンプ）を取り付けます。' },
      packaging: { status: 'IDLE', progress: 0, unitsPacked: 0, title: '⑤ ラベル貼り・完成！', desc: 'オリジナルブランドのラベルを貼り、完成品をギフトボックスに並べます。' }
    };

    this.evaluation = {
      textureScore: 90,
      foamScore: 95,
      moistureScore: 88,
      scentScore: 92,
      textureDescription: 'とろ〜りなめらか',
      overallTitle: '極上の洗い心地！プロ級アロマシャンプー'
    };

    this.initFormula();
  }

  initFormula() {
    const p = this.productTemplates[this.currentProductId];
    this.customFormula = {};
    p.materials.forEach(m => {
      this.customFormula[m.id] = m.defaultRatio;
    });
    this.targetTemp = p.defaultTemp;
    this.targetStir = p.defaultStir;
    this.productName = `特製${p.name.slice(2)}`;
    this.reset();
  }

  setProduct(productId) {
    if (!this.productTemplates[productId]) return;
    this.currentProductId = productId;
    this.initFormula();
  }

  setMaterialRatio(matId, val) {
    this.customFormula[matId] = parseFloat(val);
  }

  getCurrentProduct() {
    return this.productTemplates[this.currentProductId];
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.simTime = 0;

    const p = this.getCurrentProduct();
    this.stages.weighing = { status: 'IDLE', progress: 0, title: '① 原料の計量', desc: '選んだレシピの原料を1g単位で正確にカップへ量り取ります。' };
    this.stages.blending = { status: 'IDLE', progress: 0, temp: 22, stirSpeed: 0, viscosity: 1.0, emulsionDegree: 0, title: '② 加熱・ブレンド溶解', desc: 'ヒーターで温めながら撹拌し、均一に溶かして乳化・ジェル化させます。' };
    this.stages.filtration = { status: 'IDLE', progress: 0, smoothness: 0, title: '③ ろ過・なめらか仕上げ', desc: '細かなメッシュフィルターを通し、ダマや気泡を取り除いてツヤを出します。' };
    this.stages.bottling = { status: 'IDLE', progress: 0, unitsFilled: 0, targetUnits: 20, title: '④ ボトル充填・キャッピング', desc: 'お洒落な容器に1本ずつピッタリ注ぎ、フタ（ポンプ）を取り付けます。' };
    this.stages.packaging = { status: 'IDLE', progress: 0, unitsPacked: 0, title: '⑤ ラベル貼り・完成！', desc: 'オリジナルブランドのラベルを貼り、完成品をギフトボックスに並べます。' };
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

    // ① 計量
    const s1 = this.stages.weighing;
    if (s1.status === 'IDLE') s1.status = 'RUNNING';
    if (s1.status === 'RUNNING') {
      s1.progress = Math.min(100, s1.progress + (dt / 3.0) * 100);
      if (s1.progress >= 100) {
        s1.status = 'COMPLETED';
        if (this.stages.blending.status === 'IDLE') this.stages.blending.status = 'RUNNING';
      }
    }

    // ② 加熱・ブレンド
    const s2 = this.stages.blending;
    if (s2.status === 'RUNNING') {
      if (s2.stirSpeed < this.targetStir) {
        s2.stirSpeed += 120 * dt;
      }
      s2.temp += ((this.targetTemp - s2.temp) * 0.35) * dt;

      s2.progress = Math.min(100, s2.progress + (dt / 5.0) * 100);
      s2.emulsionDegree = Math.min(100, s2.progress * 1.05);
      s2.viscosity = 1.0 + (s2.progress / 100) * 18.0;

      if (s2.progress >= 100) {
        s2.status = 'COMPLETED';
        if (this.stages.filtration.status === 'IDLE') this.stages.filtration.status = 'RUNNING';
      }
    }

    // ③ ろ過・なめらか仕上げ
    const s3 = this.stages.filtration;
    if (s3.status === 'RUNNING') {
      s3.progress = Math.min(100, s3.progress + (dt / 3.5) * 100);
      s3.smoothness = Math.min(100, s3.progress);
      if (s3.progress >= 100) {
        s3.status = 'COMPLETED';
        if (this.stages.bottling.status === 'IDLE') this.stages.bottling.status = 'RUNNING';
      }
    }

    // ④ ボトル充填
    const s4 = this.stages.bottling;
    if (s4.status === 'RUNNING') {
      s4.unitsFilled = Math.min(s4.targetUnits, s4.unitsFilled + (dt * 4.5));
      s4.progress = (s4.unitsFilled / s4.targetUnits) * 100;
      if (s4.unitsFilled >= s4.targetUnits) {
        s4.status = 'COMPLETED';
        if (this.stages.packaging.status === 'IDLE') this.stages.packaging.status = 'RUNNING';
      }
    }

    // ⑤ ラベル・箱詰め
    const s5 = this.stages.packaging;
    if (s5.status === 'RUNNING') {
      s5.unitsPacked = Math.min(s4.targetUnits, s5.unitsPacked + (dt * 5.0));
      s5.progress = (s5.unitsPacked / s4.targetUnits) * 100;
      if (s5.unitsPacked >= s4.targetUnits) {
        s5.status = 'COMPLETED';
        this.running = false;
        this.calculateEvaluation();
      }
    }
  }

  calculateEvaluation() {
    const f = this.customFormula;
    const p = this.getCurrentProduct();

    if (p.id === 'shampoo') {
      const surf = f['surfactant'] || 20;
      const thick = f['thickener'] || 8;
      const frag = f['fragrance'] || 2;
      this.evaluation.foamScore = Math.min(100, Math.round(surf * 4.2));
      this.evaluation.textureScore = Math.min(100, Math.round(thick * 9.5));
      this.evaluation.moistureScore = Math.min(100, Math.round((f['conditioner'] || 5) * 16));
      this.evaluation.scentScore = Math.min(100, Math.round(frag * 35));
      this.evaluation.textureDescription = thick > 10 ? 'もっちり高粘度ジェル' : 'サラッと心地よいリキッド';
      this.evaluation.overallTitle = surf >= 20 ? '✨ 極上の泡立ち！贅沢サロン級アロマシャンプー' : '🌿 敏感肌にも安心！超マイルドオーガニックシャンプー';
    } else if (p.id === 'cream') {
      const oil = f['oil'] || 20;
      const shea = f['shea'] || 12;
      this.evaluation.moistureScore = Math.min(100, Math.round((oil + shea) * 2.8));
      this.evaluation.textureScore = Math.min(100, Math.round(shea * 6.5 + 20));
      this.evaluation.foamScore = 0;
      this.evaluation.scentScore = Math.min(100, Math.round((f['fragrance'] || 5) * 18));
      this.evaluation.textureDescription = shea > 14 ? 'こっくり濃厚バタークリーム' : 'みずみずしいホイップクリーム';
      this.evaluation.overallTitle = '🍦 とろける浸透感！潤い密着ハンドクリーム';
    } else if (p.id === 'lotion') {
      const hya = f['hyaluronic'] || 10;
      this.evaluation.moistureScore = Math.min(100, Math.round(hya * 7.5 + 25));
      this.evaluation.textureScore = Math.min(100, Math.round(hya * 8.0));
      this.evaluation.foamScore = 0;
      this.evaluation.scentScore = Math.min(100, Math.round((f['fragrance'] || 2) * 40));
      this.evaluation.textureDescription = hya > 12 ? 'とろみリッチな潤いベール' : 'すっと浸透するフレッシュミスト';
      this.evaluation.overallTitle = '💧 乾いた肌がごくごく飲む！高保湿ビタミン化粧水';
    } else {
      this.evaluation.moistureScore = 85;
      this.evaluation.textureScore = 92;
      this.evaluation.foamScore = 0;
      this.evaluation.scentScore = 95;
      this.evaluation.textureDescription = 'ひんやり速乾ぷるぷるジェル';
      this.evaluation.overallTitle = '🌿 手肌うるおう！爽快アロマ除菌ジェル';
    }
  }
}

window.FormulationEngine = FormulationEngine;
