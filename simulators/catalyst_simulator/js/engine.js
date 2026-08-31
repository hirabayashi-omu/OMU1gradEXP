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

    // 触媒状態
    this.catalystTemp = 450;     // 触媒床温度 [℃] (20〜800℃, ライトオフ温度 300〜350℃)
    this.catalystLightOffTemp = 300; // ライトオフ温度 [℃]
    this.oscStorage = 0.50;      // セリア(CeO2)酸素ストレージ蓄積率 (0.0〜1.0)
    this.oscCapacity = 1.0;      // OSC容量

    // O2センサ状態 (ジルコニア型)
    this.o2SensorVoltage = 0.50; // 起電力 [V] (0.05V〜0.95V)
    this.o2SensorTemp = 400;     // センサ温度 [℃]
    this.o2SensorState = 'stoich'; // 'rich', 'stoich', 'lean'

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

    // 1. 吸入空気量＆燃料量計算 (スロットル開度と回転数)
    const baseAir = (this.engineRpm / 1000.0) * (this.throttleOpen / 100.0) * 15.0; // g/s
    this.airFlowRate = Math.max(2.0, baseAir);
    this.fuelInjection = this.airFlowRate / this.actualAF;

    // 2. エンジン出口（触媒前）生排ガス濃度の算出
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

  // ─── 2. エンジン燃焼室出口の生排ガス生成モデル ───
  calculateRawEmission() {
    const af = this.actualAF;
    const egr = this.egrRate / 100.0; // 0.0〜0.25

    // CO (%) : リッチ側で急増、ストイキ以上で0.1〜0.3%
    if (af < 14.7) {
      this.rawGas.co = 0.3 + 0.9 * Math.pow(14.7 - af, 1.4);
    } else {
      this.rawGas.co = Math.max(0.05, 0.3 - (af - 14.7) * 0.05);
    }

    // HC (ppm) : リッチ側で不完全燃焼により急増、過度なリーンでも失火気味で増加
    if (af < 14.7) {
      this.rawGas.hc = 180 + 120 * Math.pow(14.7 - af, 1.35);
    } else {
      // リーン側 (15.5以上で緩やかに上昇)
      this.rawGas.hc = 180 - (af - 14.7) * 15 + Math.max(0, Math.pow(af - 16.0, 2) * 80);
    }

    // NOx (ppm) : ストイキ〜弱リーン (A/F 15.0〜15.5) の最高燃焼温度でピーク！
    // EGRにより燃焼温度が低下し大幅に抑制される
    let baseNox = 0;
    if (af < 12.0) {
      baseNox = 200;
    } else if (af < 15.2) {
      baseNox = 200 + 1400 * ((af - 12.0) / 3.2);
    } else {
      baseNox = 1600 * Math.exp(-(af - 15.2) * 0.7);
    }
    // EGR効果: EGR 10%で約40%低減、EGR 20%で約70%低減
    const egrFactor = Math.exp(-egr * 5.5);
    this.rawGas.nox = Math.max(30, baseNox * egrFactor);

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

  // ─── 4. 三元触媒浄化率モデル (資料図1の完全再現) ───
  calculateCatalystPurification() {
    const af = this.actualAF;

    // 触媒温度による活性化ファクター (ライトオフ曲線: 300〜350℃で急速活性)
    let tempFactor = 0;
    if (this.catalystTemp < 150) {
      tempFactor = 0.05;
    } else if (this.catalystTemp < this.catalystLightOffTemp) {
      tempFactor = 0.05 + 0.45 * ((this.catalystTemp - 150) / (this.catalystLightOffTemp - 150));
    } else if (this.catalystTemp < 400) {
      tempFactor = 0.50 + 0.48 * ((this.catalystTemp - this.catalystLightOffTemp) / 100);
    } else {
      tempFactor = 0.99; // 完全活性
    }

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

  // ─── 5. ECU 空燃比クローズドループ制御（ディザリング＆OSC緩衝） ───
  updateECUFeedback(dt) {
    if (this.controlMode === 'auto_closed_loop') {
      // O2センサフィードバック (λ=1.00 スイッチング制御)
      const thresholdV = 0.45; // ストイキ判定閾値
      const v = this.o2SensorVoltage;

      // 積分ゲイン
      const Ki = 0.75;
      if (v > thresholdV) {
        // リッチ検出 -> 燃料を減量 (A/Fを大きくリーン方向へ)
        this.fuelTrim -= Ki * dt;
      } else {
        // リーン検出 -> 燃料を増量 (A/Fを小さくリッチ方向へ)
        this.fuelTrim += Ki * dt;
      }

      // トリム制限 (-15% 〜 +15%)
      this.fuelTrim = Math.max(-15.0, Math.min(15.0, this.fuelTrim));

      // セリアOSC (酸素ストレージ) の充放電
      if (this.actualAF > 14.7) {
        // リーン時: 酸素を吸蔵 (Ce2O3 -> CeO2)
        this.oscStorage = Math.min(1.0, this.oscStorage + 0.15 * dt);
      } else {
        // リッチ時: 酸素を放出してCO/HCを酸化補償 (CeO2 -> Ce2O3)
        this.oscStorage = Math.max(0.0, this.oscStorage - 0.18 * dt);
      }

      // 微小なディザリング振動 (0.5〜1.5Hz) を伴うストイキ制御
      this.ditherPhase += dt * 5.0;
      const dither = 0.12 * Math.sin(this.ditherPhase);

      // 実測A/Fの算出
      this.actualAF = 14.70 + (this.fuelTrim * -0.06) + dither;

    } else if (this.controlMode === 'manual_af') {
      // 手動A/F設定モード
      this.fuelTrim = ((14.70 - this.targetAF) / 14.70) * 100.0;
      this.actualAF = this.targetAF;

    } else if (this.controlMode === 'failed_sensor') {
      // センサ故障/オープンループ (固定弱リッチまたは過度リーン)
      this.actualAF = this.targetAF;
    }

    this.calculateAllStates();
  }

  // ─── 6. 時間進行ステップ ───
  update(dtRaw) {
    if (!this.running || this.paused) return;
    const dt = Math.min(dtRaw, 0.05);
    this.simTime += dt;

    this.updateECUFeedback(dt);

    // 触媒温度の自然暖機 (運転中に定常温度に向かう)
    const targetTemp = 480 + (this.throttleOpen * 2.5);
    this.catalystTemp += (targetTemp - this.catalystTemp) * (dt * 0.15);
    this.o2SensorTemp += (targetTemp * 0.9 - this.o2SensorTemp) * (dt * 0.2);

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
    this.catalystTemp = 450;
    this.o2SensorTemp = 400;

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
