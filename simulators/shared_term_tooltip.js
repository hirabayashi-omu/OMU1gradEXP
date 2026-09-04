/**
 * Shared Engineering & Science Glossary for High School & College Students
 * 高校生・高専生向け わかりやすい工学・科学用語ヘルプチップ辞書
 */

(function() {
  const GLOSSARY = {
    // ==========================================
    // 1. 制御工学・メカトロニクス
    // ==========================================
    'PID制御': {
      title: 'PID制御（自動コントロール技術）',
      desc: '目標値との「現在のズレ(P)」「過去のズレの蓄積(I)」「未来の変化スピード(D)」の3つを計算して、ドローンや工場設備をピタッと安定させる世界標準の自動制御技術です。'
    },
    '比例ゲイン': {
      title: '比例ゲイン (Kp / 比例の強さ)',
      desc: '今あるズレ（誤差）の大きさに比例して力を出す強さです。大きくすると素早く目標に向かいますが、強すぎると行き過ぎてガタガタ振動します。'
    },
    'Kp': {
      title: 'Kp（比例ゲイン / Proportional）',
      desc: '「今のズレ」に比例した力を加える強さ。反応をキビキビ速くしますが、上げすぎると激しい振動を引き起こします。'
    },
    '積分ゲイン': {
      title: '積分ゲイン (Ki / 過去のズレの足し算)',
      desc: '過去のズレをコツコツ足し算して補正する力です。摩擦や重力で少しズレたまま残る「定常偏差」を完全になくして目標値ピッタリに合わせます。'
    },
    'Ki': {
      title: 'Ki（積分ゲイン / Integral）',
      desc: '「過去のズレの蓄積」を消す力。定常偏差をゼロにしますが、溜まりすぎるとブレーキが遅れて暴走（オーバーシュート）を招きます。'
    },
    '微分ゲイン': {
      title: '微分ゲイン (Kd / ブレーキ力)',
      desc: '変化の勢い（スピード）を感知して逆向きのブレーキをかける力です。目標を飛び越えてしまう「オーバーシュート」を抑えてピタッと止めます。'
    },
    'Kd': {
      title: 'Kd（微分ゲイン / Derivative）',
      desc: '「未来の勢い」を予測してかけるブレーキ力。急な飛び出しや振動をグッと抑えて安定させます。'
    },
    'アンチワインドアップ': {
      title: 'アンチワインドアップ (Anti-Windup)',
      desc: 'モータやバルブが100%全開のときに、不要に積分値が溜まりすぎて制御が暴走（過熱やタンク溢水）するのを防ぐ安全保護機能です。'
    },
    'Anti-Windup': {
      title: 'アンチワインドアップ (Anti-Windup)',
      desc: 'アクチュエータ（モータやヒーター）が最大出力のとき、積分項が溜まりすぎて目標到達後も過熱や飛び出しが続くのを防ぐ賢い安全制御です。'
    },
    '倒立振子': {
      title: '倒立振子（カート・ペンデュラム）',
      desc: '手のひらの上でほうきを立てて倒れないように手を動かすのと同様に、台車を左右に動かして棒を真上に直立維持するメカトロニクスの代表的な不安定システムです。'
    },
    '整定時間': {
      title: '整定時間 (Settling Time)',
      desc: '操作を始めてから、目標値のすぐ近く（誤差±2%〜5%以内）に収まってピタッと安定するまでにかかる時間（秒）です。'
    },
    'オーバーシュート': {
      title: 'オーバーシュート (Overshoot)',
      desc: '制御の勢いが余って、目標値を行き過ぎて飛び出してしまった最大の割合（%）です。'
    },
    '定常偏差': {
      title: '定常偏差 (Steady-State Error)',
      desc: '十分に時間が経って安定した後も、目標値と実測値の間にわずかに残ってしまっているズレのことです。'
    },
    'むだ時間': {
      title: 'むだ時間（Dead Time / 遅延時間）',
      desc: 'スイッチを入れたりバルブを開けてから、実際にパイプを通ってセンサーに変化が現れるまでの「タイムラグ（時間差）」のことです。'
    },
    'CSTR': {
      title: 'CSTR（連続槽型反応器）',
      desc: '原料を連続的に注ぎ入れ、撹拌翼で混ぜながら同時に製品を取り出す、化学工場で最も広く使われている加熱・反応タンクです。'
    },

    // ==========================================
    // 2. 熱流体力学・空調・CFD
    // ==========================================
    '熱伝導率': {
      title: '熱伝導率（熱の伝わりやすさ）',
      desc: '物質の中を熱がどれくらい速く伝わるかを表す値。銅（約390）やアルミ（約230）は非常に高く、鉄（約50）やプラスチック（約0.2）は低いです。'
    },
    '熱伝導': {
      title: '熱伝導（Conduction）',
      desc: '物質を構成する原子や分子の振動（または自由電子）が隣へ次々に伝わることで、高温側から低温側へ熱が移動する現象です。'
    },
    'CFD': {
      title: 'CFD（数値流体力学 / 流体シミュレーション）',
      desc: '空気や水の複雑な流れを、物理の方程式（ナビエ・ストークス方程式）を使ってコンピュータで細かくマス目ごとに計算・予測する最先端技術です。'
    },
    'FVM': {
      title: 'FVM（有限体積法 / 計算手法）',
      desc: '計算したい空間を小さなブロック（小部屋）に区切り、それぞれの小部屋に入ってくる熱や空気と出ていく熱のバランスを正確に解く計算法です。'
    },
    '対流': {
      title: '対流（Convection）',
      desc: '温かい空気が軽くなって上昇したり、扇風機やポンプで風・水流を起こすことで、流体そのものが動いて熱を運ぶ現象です。'
    },
    '揚力': {
      title: '揚力（飛行機を持ち上げる力）',
      desc: '飛行機の翼の上下で空気の流れの速さが変わることで気圧差が生まれ、機体をフワッと空へ押し上げる上向きの力です。'
    },
    '抗力': {
      title: '抗力（空気抵抗・ブレーキになる力）',
      desc: '物体が空気や水の中を突き進むときに、邪魔をするように後ろ向きに受ける抵抗力のことです。'
    },

    // ==========================================
    // 3. エネルギー・電気化学・自動車
    // ==========================================
    'EIS': {
      title: 'EIS（電気化学インピーダンス測定）',
      desc: '燃料電池やバッテリーに周波数の違う微弱な交流電気を流し、内部の電解質や電極の「電気の通りにくさ（抵抗）」を詳しく調べる健康診断テストです。'
    },
    'Cole-Coleプロット': {
      title: 'Cole-Coleプロット（ナイキスト線図）',
      desc: 'EISの測定データを半円状のグラフに描くことで、溶液の抵抗や電極の化学反応の遅れなどをひと目で分解・特定できる専門グラフです。'
    },
    '三元触媒': {
      title: '三元触媒（エコ触媒コンバーター）',
      desc: '自動車の排気ガスに含まれる3大有害物質（CO・HC・NOx）を、白金などの貴金属のチカラで無害な水・二酸化炭素・窒素へ一瞬で化学変換するフィルターです。'
    },
    '理論空燃比': {
      title: '理論空燃比（A/F 14.7、λ=1.0）',
      desc: 'ガソリンが最も過不足なく完全燃焼する「空気と燃料の理想的な重さの比率（空気14.7gに対してガソリン1.0g）」のことです。'
    },
    'EGR': {
      title: 'EGR（排気再循環システム）',
      desc: '排気ガスの一部をもう一度エンジンの吸気へ戻すことで燃焼温度を下げ、大気汚染の原因となるNOx（窒素酸化物）の発生を大幅に減らすエコ技術です。'
    },
    '燃料電池': {
      title: '燃料電池（Fuel Cell）',
      desc: '水素と空気中の酸素を化学反応させて「電気」と「水」だけを作り出す、CO2を一切出さないクリーンな次世代発電装置です。'
    },
    '電解質': {
      title: '電解質（Electrolyte）',
      desc: '電気を帯びたイオン（H+やOH-など）は通すけれど、電子（e-）は通さない特殊な膜や水溶液のことです。'
    },
    '上死点': {
      title: '上死点（TDC / Top Dead Center）',
      desc: 'エンジンのピストンがシリンダー内を上昇して、最も高い位置（てっぺん）に達した瞬間の位置です。'
    },
    '下死点': {
      title: '下死点（BDC / Bottom Dead Center）',
      desc: 'エンジンのピストンが下がって、最も低い位置（底）に達した瞬間の位置です。'
    },

    // ==========================================
    // 4. 化学工学・水処理・製剤・流体
    // ==========================================
    '乳化': {
      title: '乳化（エマルション化）',
      desc: '本来は決して混ざり合わない「水」と「油」を、界面活性剤の助けで微小なナノカプセルにして均一に安定して混ぜ合わせる技術です（マヨネーズやクリームなど）。'
    },
    'ミセル': {
      title: 'ミセル（分子カプセル）',
      desc: '水になじむ部分と油になじむ部分を持つ界面活性剤が集まり、油の粒を中に包み込んで水中に溶け込ませている球状のナノ構造です。'
    },
    'HLB値': {
      title: 'HLB値（親水・親油バランス）',
      desc: '界面活性剤が「どれくらい水になじみやすいか」を表す0〜20の指標。数値が低いと油になじみ、高いと水になじみます。'
    },
    '凝集剤': {
      title: '凝集剤（ぎょうしゅうざい）',
      desc: '濁った水の中でマイナスの電気を帯びて反発し合っている微小な汚れ粒子を中和し、磁石のようにくっつきやすくする水処理薬品です。'
    },
    'フロック': {
      title: 'フロック（汚れの塊）',
      desc: '凝集剤によって小さな汚れの粒が集まって雪のかたまりのように大きくなったもの。重くなるため急速に底へ沈殿します。'
    },
    '中空糸膜': {
      title: '中空糸膜（ストロー状の超微細フィルター）',
      desc: 'マカロニのように中が空洞になったストロー状の細い繊維。表面に無数のナノ微細孔が開いており、バイキンや微粒子を完璧にこし取ります。'
    },
    'ろ過': {
      title: 'ろ過（Filtration / こし分け）',
      desc: '液体と固体の混ざったものをフィルター（ろ材）に通し、液体だけを通過させて固体の汚れや不純物を取り除く分離操作です。'
    },
    'ろ材': {
      title: 'ろ材（フィルター材料）',
      desc: '砂・礫（小石）・脱脂綿・不織布・中空糸膜など、水の中の不純物やフロックを引っ掛けて捕まえるための多孔質材料です。'
    },
    '空隙': {
      title: '空隙（くうげき / 粒子同士のすき間）',
      desc: '砂や小石の粒同士の間にできるすき間のこと。空隙が広いと水はスルスル通りますが小さなゴミは素通りし、狭いと小さなゴミまで捕獲できます。'
    },
    '非ニュートン流体': {
      title: '非ニュートン流体（とろみ液体）',
      desc: '水のようにサラサラ一定ではなく、力を加えると粘り気（とろみ）が変化する液体（ハンドクリーム、ケチャップ、スライムなど）のことです。'
    },
    'SPH法': {
      title: 'SPH法（粒子法流体シミュレーション）',
      desc: '液体を無数の丸い粒（粒子）の集まりとして計算し、水しぶきや複雑な容器への充填、液だれをリアルに再現できる計算法です。'
    },
    'トルク': {
      title: 'トルク（Torque / 回転させる力）',
      desc: 'エンジンやモータが車輪やシャフトを「グッと回そうとする回転力（ねじり力）」のことです。加速力や坂道を登る力に直結します。'
    },
    '変速比': {
      title: '変速比（ギア比 / Gear Ratio）',
      desc: 'エンジンの回転をタイヤに伝えるギアの歯数比。1速などギア比が大きいと低速で大きな力（トルク）が出せ、トップギアでは高速巡航できます。'
    },

    // ==========================================
    // 5. 材料力学・試験・サスペンション
    // ==========================================
    '応力': {
      title: '応力（Stress / 内部にかかる力）',
      desc: '材料を引っ張ったり押したりしたときに、材料の内部で抵抗して発生する「1平方ミリメートルあたりの力（MPa）」です。'
    },
    'ひずみ': {
      title: 'ひずみ（Strain / 変形した割合）',
      desc: '力を加えたときに、元の長さに対してどれくらい伸びたり縮んだかを表す比率（%）です。'
    },
    '降伏点': {
      title: '降伏点（Yield Point / 永久変形の始まり）',
      desc: '材料に力を加えたとき、手を離せば元に戻る「弾性」の限界を超えて、力を抜いても元に戻らない永久の曲がり（塑性変形）が始まる境目です。'
    },
    '引張強さ': {
      title: '引張強さ（材料が耐えられる最大応力）',
      desc: '材料を両側から力いっぱい引っ張ったときに、千切れるまでに耐えられる最大の応力（最高強度）です。'
    },
    'S45C': {
      title: 'S45C（機械構造用炭素鋼）',
      desc: '炭素を0.45%含む代表的な鉄鋼材料。適度な硬さと粘り強さがあり、自動車のシャフトやボルト、歯車など身の回りの機械部品に最も多く使われます。'
    },
    'テクスチャー': {
      title: 'テクスチャー（食感・触感の物理量）',
      desc: '食品や化粧品を口に入れたり指で塗ったときに感じる「硬さ・弾力・なめらかさ・伸びやすさ」を機械で数値化したものです。'
    },
    '粘弾性': {
      title: '粘弾性（Viscoelasticity）',
      desc: 'バネのように跳ね返る「弾力」と、水あめのようにゆっくり変形する「粘り気」の両方の性質を併せ持つ性質（ゴム、チーズ、プラスチックなど）です。'
    },
    'ダンパー': {
      title: 'ダンパー（ショックアブソーバー / 減衰器）',
      desc: '車のサスペンションで、オイルの抵抗を利用してバネのフワフワした揺れを一瞬でスッと吸収して止める衝撃吸収ピストンです。'
    },
    'ダブルウィッシュボーン': {
      title: 'ダブルウィッシュボーン（サスペンション形式）',
      desc: '上下2組のアーム（鳥の胸骨ウィッシュボーンに似た形）で車輪を支え、路面の段差でもタイヤが常に地面と直角に接地して抜群の安定性を誇る高級車・スポーツカー用の足回りです。'
    }
  };

  // Tooltip Manager Instance
  class SharedTermTooltip {
    constructor() {
      this.initDOM();
      this.bindAutoScan();
    }

    initDOM() {
      let el = document.getElementById('shared-term-tooltip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'shared-term-tooltip';
        el.className = 'shared-term-tooltip';
        document.body.appendChild(el);
      }
      this.tooltipEl = el;
      this.activeTarget = null;
      this.hideTimer = null;

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.has-term-tooltip') && !e.target.closest('#shared-term-tooltip')) {
          this.hide();
        }
      });
    }

    show(target, title, desc) {
      clearTimeout(this.hideTimer);
      this.activeTarget = target;

      this.tooltipEl.innerHTML = `
        <div class="shared-tooltip-header">
          <span class="shared-tooltip-icon">💡</span>
          <span class="shared-tooltip-title">${title}</span>
        </div>
        <div class="shared-tooltip-desc">${desc}</div>
      `;

      const rect = target.getBoundingClientRect();
      const tooltipWidth = 320;
      let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      let top = rect.top - 10;

      // 画面上部にはみ出す場合は下に表示
      if (top - 120 < 10) {
        top = rect.bottom + 12;
      } else {
        top = rect.top - 12;
        this.tooltipEl.style.transformOrigin = 'bottom center';
      }

      // 画面左右はみ出し防止
      if (left < 10) left = 10;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }

      this.tooltipEl.style.left = `${left}px`;
      this.tooltipEl.style.top = `${top}px`;
      this.tooltipEl.classList.add('visible');
    }

    hide() {
      this.hideTimer = setTimeout(() => {
        this.tooltipEl.classList.remove('visible');
        this.activeTarget = null;
      }, 120);
    }

    bindAutoScan() {
      document.addEventListener('DOMContentLoaded', () => {
        this.scanAndEnhance();
      });
      // すでにロード済みの場合は即スキャン
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        this.scanAndEnhance();
      }
    }

    scanAndEnhance() {
      // 1. 手動マークアップされた .has-term-tooltip
      document.querySelectorAll('.has-term-tooltip, [data-term]').forEach(el => {
        const termKey = el.getAttribute('data-term') || el.textContent.trim();
        const data = GLOSSARY[termKey] || GLOSSARY[el.textContent.trim()];
        if (data) {
          this.attachEvents(el, data.title, data.desc);
        }
      });

      // 2. ラベルや見出し内の用語を自動検知してツールチップ化
      const targetSelectors = 'label, .card-title, .param-row span, .chart-header span, .hud-item, .metric-title, th, dt, .param-label';
      document.querySelectorAll(targetSelectors).forEach(node => {
        if (node.children.length === 0 && !node.classList.contains('has-term-tooltip')) {
          const text = node.textContent;
          for (const [key, data] of Object.entries(GLOSSARY)) {
            if (text.includes(key) && key.length >= 2) {
              node.classList.add('has-term-tooltip');
              node.setAttribute('data-term', key);
              this.attachEvents(node, data.title, data.desc);
              break;
            }
          }
        }
      });
    }

    attachEvents(el, title, desc) {
      el.addEventListener('mouseenter', () => this.show(el, title, desc));
      el.addEventListener('mouseleave', () => this.hide());
      el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (this.tooltipEl.classList.contains('visible') && this.activeTarget === el) {
          this.hide();
        } else {
          this.show(el, title, desc);
        }
      }, { passive: true });
    }
  }

  window.SharedTermTooltip = new SharedTermTooltip();
  window.SharedGlossary = GLOSSARY;
})();
