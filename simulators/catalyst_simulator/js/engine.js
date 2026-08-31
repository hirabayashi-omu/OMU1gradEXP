/**
 * Three-Way Catalyst (TWC) & A/F Closed-Loop Control Engine
 * 自動車用排ガス浄化三元触媒・ジルコニアO2センサ・EFI空燃比フィードバック制御エンジン
 */

class CatalystEngine {
  constructor() {
    // 制御モード: 'auto_closed_loop' (ECU自動λ制御), 'manual_af' (手動A/F), 'failed_sensor' (O2センサ故障/オープンループ)
    this.controlMode = 'auto_closed_loop';

    // 基本パラメータ
    this.stoichAF = 14.70;       // ガソリン理論空燃比 (ストイキ)
    this.targetAF = 14.70;       // 目標A/F
    this.actualAF = 14.70;       // 実測シリンダー供給A/F
    this.lambda = 1.00;          // 空気過剰率 λ = A/F / 14.7

    // エンジン運転状態
    this.engineRpm = 2000;       // エンジン回転数 [rpm]
    this.throttleOpen = 30;      // スロットル開度 [%] (10〜100%)
    this.airFlowRate = 18.0;     // 吸入空気量 [g/s]
    this.fuelInjection = 1.22;   // 燃料噴射量 [g/s]
    this.egrRate = 0.0;          // EGR（排気再循環）率 [%] (0〜25%)

    // 触媒状態 (起動時は冷間始動 40℃ からスタートし、排気熱で暖機)
    this.catalystTemp = 40;      // 初期冷間温度 [℃] (ライトオフ温度 300℃)
    this.catalystLightOffTemp = 300; // ライトオフ温度 [℃]
    this.oscStorage = 0.50;      // セリア(CeO2)酸素ストレージ蓄積率 (0.0〜1.0)
    this.oscCapacity = 1.0;      // OSC容量

    // O2センサ状態 (ジルコニア型: 冷間時は不活性)
    this.o2SensorVoltage = 0.05; // 初期冷間起電力 [V]
    this.o2SensorTemp = 40;      // センサ温度 [℃] (300℃以上で活性化)
    this.o2SensorState = 'cold'; // 'cold', 'rich', 'stoich', 'lean'

    // ECU フィードバック制御内部変数 (PI+積分ディザリング)
    this.fuelTrim = 0.0;         // 燃料補正係数 [%] (-25% 〜 +25%)
    this.integralTerm = 0.0;
    this.ditherPhase = 0.0;
    this.switchTimer = 0.0;

    // 排ガス濃度 [ppm or %]
    // 1. エンジン出口 (触媒前 Raw Gas)
    this.rawGas = {
      co: 0.50,     // 一酸化炭素 [%]
      hc: 250,      // 未燃炭化水素 [ppm]
      nox: 1200,    // 窒素酸化物 [ppm]
      o2: 0.50,     // 残留酸素 [%]
      co2: 14.2,    // 二酸化炭素 [%]
      h2o: 13.5,    // 水蒸気 [%]
      n2: 71.0      // 窒素 [%]
    };

    // 2. 触媒浄化率 [%] (0〜100%)
    this.purificationRates = {
      co: 98.5,     // CO 酸化浄化率
      hc: 97.8,     // HC 酸化浄化率
      nox: 98.2,    // NOx 還元浄化率
      avg: 98.2     // 総合浄化率
    };

    // 3. マフラー出口 (触媒後 Clean Gas)
    this.tailGas = {
      co: 0.007,    // CO [%]
      hc: 5.5,      // HC [ppm]
      nox: 21.6,    // NOx [ppm]
      co2: 15.1,
      h2o: 14.1,
      n2: 70.8
    };

    // 履歴データバッファ (オシロスコープ用)
    this.historyMaxLength = 280;
    this.timeHistory = [];
    this.afHistory = [];
    this.o2VoltHistory = [];
    this.noxPurifHistory = [];
    this.coPurifHistory = [];
    this.hcPurifHistory = [];
    this.rawNoxHistory = [];
    this.tailNoxHistory = [];

    // 制御フラグ
    this.running = true;
    this.paused = false;
    this.simTime = 0.0;

    this.calculateAllStates();
  }

  // ─── 1. 空燃比＆排ガス生成・触媒化学反応の全状態計算 ───
  calculateAllStates() {
    this.lambda = this.actualAF / this.stoichAF;

    // 1. 吸入空気量＆燃料噴射量 (回転数 N [rpm] と スロットル開度 θ [%] の熱流体力学連動)
    // 充填効率 eta_v はスロットル開度により 0.25 (アイドリング負圧) 〜 0.92 (WOT全開) に変化
    const volumetricEff = 0.25 + 0.67 * (this.throttleOpen / 100.0);
    // 吸入空気質量流量 Qa [g/s] (排気量 2.0L 相当)
    this.airFlowRate = (this.engineRpm / 60.0) * (2.0 / 2.0) * 1.18 * volumetricEff * 1.2;
    this.fuelInjection = this.airFlowRate / this.actualAF;

    // 2. エンジン出口（触媒前）生排ガス濃度の算出 (燃焼温度・負荷連動)
    this.calculateRawEmission();

    // 3. ジルコニアO2センサの出力電圧（ネルンスト起電力特性）
    this.calculateO2SensorVoltage();

    // 4. 三元触媒の浄化率（ウインドウ特性＆触媒温度依存性）
    this.calculateCatalystPurification();

    // 5. 触媒後（テールパイプ）クリーンガス濃度の算出
    this.tailGas.co = this.rawGas.co * (1 - this.purificationRates.co / 100.0);
    this.tailGas.hc = this.rawGas.hc * (1 - this.purificationRates.hc / 100.0);
    this.tailGas.nox = this.rawGas.nox * (1 - this.purificationRates.nox / 100.0);
  }

  // ─── 2. エンジン燃焼室出口の生排ガス生成モデル (回転数＆スロットル負荷連動) ───
  calculateRawEmission() {
    const af = this.actualAF;
    const egr = this.egrRate / 100.0; // 0.0〜0.25
    const loadFactor = 0.5 + 0.5 * (this.throttleOpen / 100.0); // 負荷係数
    const rpmFactor = 0.7 + 0.3 * (this.engineRpm / 6000.0); // 回転数係数

    // CO (%) : リッチ側で急増、ストイキ以上で0.1〜0.3% (高負荷で燃焼密度上昇)
    if (af < 14.7) {
      this.rawGas.co = (0.3 + 1.1 * Math.pow(14.7 - af, 1.4)) * loadFactor;
    } else {
      this.rawGas.co = Math.max(0.04, (0.28 - (af - 14.7) * 0.05) * loadFactor);
    }

    // HC (ppm) : リッチ側で不完全燃焼により急増、過度なリーンでも失火気味で増加
    if (af < 14.7) {
      this.rawGas.hc = (160 + 130 * Math.pow(14.7 - af, 1.35)) * loadFactor;
    } else {
      this.rawGas.hc = (160 - (af - 14.7) * 14 + Math.max(0, Math.pow(af - 16.0, 2) * 80)) * loadFactor;
    }

    // NOx (ppm) : 燃焼最高温度（Zeldovich熱NOx生成機構）に強く依存！
    // スロットル開度（負荷）と回転数が高いほどシリンダー内温度が上昇しNOx激増
    let baseNox = 0;
    if (af < 12.0) {
      baseNox = 180;
    } else if (af < 15.2) {
      baseNox = 180 + 1350 * ((af - 12.0) / 3.2);
    } else {
      baseNox = 1530 * Math.exp(-(af - 15.2) * 0.7);
    }
    // 負荷・回転数による燃焼温度上昇倍率 (アイドリングで約0.5倍、高回転高負荷で最大1.8倍)
    const thermalNoxFactor = (0.45 + 0.85 * (this.throttleOpen / 100.0)) * (0.65 + 0.55 * (this.engineRpm / 6000.0));
    // EGR効果: 燃焼温度を下げてサーマルNOxを指数関数的に抑制
    const egrFactor = Math.exp(-egr * 5.5);
    this.rawGas.nox = Math.max(20, baseNox * thermalNoxFactor * egrFactor);

    // O2 (%) : リーン側で酸素過剰
    if (af < 14.7) {
      this.rawGas.o2 = Math.max(0.02, 0.3 * Math.exp(-(14.7 - af) * 1.5));
    } else {
      this.rawGas.o2 = 0.3 + (af - 14.7) * 0.55;
    }
  }

  // ─── 3. ジルコニアO2センサ起電力モデル (S字スイッチング特性) ───
  calculateO2SensorVoltage() {
    const lambda = this.lambda;
    // ネルンスト式に基づく急峻なロジスティックS字カーブ
    // λ < 1 (リッチ) => 0.85〜0.95V, λ > 1 (リーン) => 0.05〜0.15V
    const slope = -55.0; // ストイキ近傍の急峻度
    const midPoint = 1.000;
    const vSigmoid = 1.0 / (1.0 + Math.exp(slope * (lambda - midPoint)));
    
    // センサ温度が低い（冷間始動 < 300℃）場合は不活性で0V付近
    const tempActivation = Math.min(1.0, Math.max(0.0, (this.o2SensorTemp - 150) / 150.0));

    if (this.controlMode === 'failed_sensor') {
      // センサ断線/故障時
      this.o2SensorVoltage = 0.05;
      this.o2SensorState = 'lean';
    } else {
      this.o2SensorVoltage = (0.08 + 0.82 * vSigmoid) * tempActivation;
      if (this.o2SensorVoltage > 0.60) {
        this.o2SensorState = 'rich';
      } else if (this.o2SensorVoltage < 0.30) {
        this.o2SensorState = 'lean';
      } else {
        this.o2SensorState = 'stoich';
      }
    }
  }

  // ─── 4. 三元触媒浄化率モデル (資料図1＆図3温度活性の完全再現) ───
  calculateCatalystPurification() {
    const af = this.actualAF;

    // 触媒温度による活性化ファクター (資料図3: 0℃〜600℃, 300℃で50%活性のS字シグモイド特性)
    // eta_temp = 1 / (1 + exp(-(T - 300) / 32))
    const tempK = 32.0;
    const tempMid = 300.0;
    const tempFactor = Math.max(0.0, Math.min(1.0, 1.0 / (1.0 + Math.exp(-(this.catalystTemp - tempMid) / tempK))));

    // ① CO 酸化浄化率 (%): 2CO + O2 -> 2CO2
    // A/F < 14.7 で急減 (酸素不足)、A/F >= 14.7 で 98%以上
    let eta_co = 0;
    if (af >= 14.7) {
      eta_co = 99.0 - Math.max(0, (af - 16.5) * 2.0);
    } else {
      eta_co = 99.0 * Math.exp(-Math.pow((14.7 - af) / 1.3, 1.8));
    }

    // ② HC 酸化浄化率 (%): CnHm + O2 -> CO2 + H2O
    // A/F < 14.7 で低下、A/F >= 14.7 で 98%以上
    let eta_hc = 0;
    if (af >= 14.7) {
      eta_hc = 98.5 - Math.max(0, (af - 16.5) * 1.5);
    } else {
      eta_hc = 98.5 * Math.exp(-Math.pow((14.7 - af) / 1.6, 1.7));
    }

    // ③ NOx 還元浄化率 (%): 2NOx -> N2 + xO2
    // A/F <= 14.7 で 98%以上 (還元雰囲気)、A/F > 14.7 で急激に低下 (過剰酸素で還元不可)
    let eta_nox = 0;
    if (af <= 14.7) {
      eta_nox = 99.2;
    } else {
      // リーン側で急降下
      eta_nox = 99.2 * Math.exp(-Math.pow((af - 14.7) / 0.75, 1.9));
    }

    // 温度活性度を乗算
    this.purificationRates.co = Math.max(0, Math.min(99.8, eta_co * tempFactor));
    this.purificationRates.hc = Math.max(0, Math.min(99.8, eta_hc * tempFactor));
    this.purificationRates.nox = Math.max(0, Math.min(99.8, eta_nox * tempFactor));
    this.purificationRates.avg = (this.purificationRates.co + this.purificationRates.hc + this.purificationRates.nox) / 3.0;
  }

  // ─── 5. ECU 空燃比クローズドループ制御（ディザリング＆OSC緩衝＆WOT高負荷増量） ───
  updateECUFeedback(dt) {
    if (this.controlMode === 'auto_closed_loop') {
      // WOT (Wide Open Throttle: スロットル開度 > 85%) 時の高負荷パワーエンリッチメント
      if (this.throttleOpen > 85) {
        // 高負荷時は触媒過熱保護＆最大トルク発生のためオープンループリッチ増量 (A/F 12.5)
        this.fuelTrim = 15.0;
        this.actualAF = 14.70 - ((this.throttleOpen - 85) / 15.0) * 2.2;
      } else {
        // 通常運転: O2センサフィードバック (λ=1.00 スイッチング制御)
        const thresholdV = 0.45; // ストイキ判定閾値 (0.45V)
        const v = this.o2SensorVoltage;

        // 積分動作: リッチなら燃料減量(A/F上昇)、リーンなら燃料増量(A/F降下)
        const Ki = 0.8;
        if (v > thresholdV) {
          // リッチ検出 (V > 0.45V) -> 燃料減量トリム
          this.fuelTrim = Math.max(-5.0, this.fuelTrim - Ki * dt * 4.0);
        } else {
          // リーン検出 (V < 0.45V) -> 燃料増量トリム
          this.fuelTrim = Math.min(5.0, this.fuelTrim + Ki * dt * 4.0);
        }

        // セリアOSC (酸素ストレージ) の充放電
        if (this.actualAF > 14.7) {
          // リーン時: 酸素を吸蔵 (Ce2O3 -> CeO2)
          this.oscStorage = Math.min(1.0, this.oscStorage + 0.20 * dt);
        } else {
          // リッチ時: 酸素を放出してCO/HCを酸化補償 (CeO2 -> Ce2O3)
          this.oscStorage = Math.max(0.0, this.oscStorage - 0.20 * dt);
        }

        // 実車のディザリング周波数 (約1.0Hz) による微小振動: ±0.05 A/F
        this.ditherPhase += dt * (Math.PI * 2 * 0.8);
        const dither = 0.05 * Math.sin(this.ditherPhase);

        // 実測A/Fの算出: 常にウィンドウ(14.55〜14.85)の中央 14.70±0.06 に維持
        const baseAF = 14.70 - (this.fuelTrim * 0.015);
        this.actualAF = Math.max(14.62, Math.min(14.78, baseAF + dither));
      }

    } else if (this.controlMode === 'manual_af') {
      // 手動A/F設定モード
      this.fuelTrim = ((14.70 - this.targetAF) / 14.70) * 100.0;
      this.actualAF = this.targetAF;

    } else if (this.controlMode === 'failed_sensor') {
      // センサ故障時: センサが0.05V(リーン固着)となり、ECUが誤認識して燃料補正トリムを上限(+25%)まで過大増量！
      // 積分動作により燃料過大増量へ暴走
      this.fuelTrim = Math.min(25.0, this.fuelTrim + 4.0 * dt);
      
      // 不規則なハンチングノイズ (センサ断線・接触不良ノイズ)
      const faultNoise = 0.3 * Math.sin(this.simTime * 6.0) + 0.15 * Math.cos(this.simTime * 14.0);
      
      // 実測A/Fは過濃リッチ(A/F 11.5〜12.2)へ暴走し、ウインドウを完全に逸脱
      this.actualAF = Math.max(11.2, 14.70 - (this.fuelTrim * 0.13) + faultNoise);
    }

    this.calculateAllStates();
  }

  // ─── 6. 時間進行ステップ ───
  update(dtRaw) {
    if (!this.running || this.paused) return;
    const dt = Math.min(dtRaw, 0.05);
    this.simTime += dt;

    this.updateECUFeedback(dt);

    // 触媒温度の自然暖機 (回転数・負荷による排気熱量に連動: 380℃〜750℃)
    const exhaustGasTemp = 360 + (this.throttleOpen * 3.2) + ((this.engineRpm - 800) / 5200) * 160;
    this.catalystTemp += (exhaustGasTemp - this.catalystTemp) * (dt * 0.12);
    this.o2SensorTemp += (exhaustGasTemp * 0.95 - this.o2SensorTemp) * (dt * 0.18);

    // 履歴バッファの更新
    if (this.timeHistory.length > this.historyMaxLength) {
      this.timeHistory.shift();
      this.afHistory.shift();
      this.o2VoltHistory.shift();
      this.noxPurifHistory.shift();
      this.coPurifHistory.shift();
      this.hcPurifHistory.shift();
      this.rawNoxHistory.shift();
      this.tailNoxHistory.shift();
    }

    this.timeHistory.push(this.simTime);
    this.afHistory.push(this.actualAF);
    this.o2VoltHistory.push(this.o2SensorVoltage);
    this.noxPurifHistory.push(this.purificationRates.nox);
    this.coPurifHistory.push(this.purificationRates.co);
    this.hcPurifHistory.push(this.purificationRates.hc);
    this.rawNoxHistory.push(this.rawGas.nox);
    this.tailNoxHistory.push(this.tailGas.nox);
  }

  reset() {
    this.simTime = 0.0;
    this.actualAF = 14.70;
    this.targetAF = 14.70;
    this.fuelTrim = 0.0;
    this.oscStorage = 0.50;
    this.catalystTemp = 40;   // 冷間始動 (40℃) から再スタート
    this.o2SensorTemp = 40;
    this.o2SensorVoltage = 0.05;

    this.timeHistory = [];
    this.afHistory = [];
    this.o2VoltHistory = [];
    this.noxPurifHistory = [];
    this.coPurifHistory = [];
    this.hcPurifHistory = [];
    this.rawNoxHistory = [];
    this.tailNoxHistory = [];

    this.calculateAllStates();
  }
}
