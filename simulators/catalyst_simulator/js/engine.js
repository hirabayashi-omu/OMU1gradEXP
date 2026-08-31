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

    // スロットル過渡応答モデル (吸気管内容積によるむだ時間)
    // スロットル急変時に一瞬リーン/リッチになる実車局面を再現
    this.throttlePrev = 30;      // 前ステップのスロットル開度 [%]
    this.transientAFPerturb = 0.0; // 過渡A/F履れ [単位: A/F]

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
    this.rawO2History = [];    // 排気O₂濃度 [%] 履歴 (チャンネル4用)
    this.rawCOHistory = [];    // 排気CO濃度 [%] 履歴
    this.rawHCHistory = [];    // 排気HC濃度 [ppm] 履歴
    this.rawCO2History = [];   // 排気CO₂濃度 [%] 履歴 (炭素保存則連動でCOと逆相関)

    // 制御フラグ
    this.running = true;
    this.paused = false;
    this.simTime = 0.0;

    this.calculateAllStates();
  }

  // ─── 1. 空燃比＆排�  // ─── 2. エンジン燃焼室出口の生排ガス生成モデル (回転数＆スロットル負荷連動) ───
  calculateRawEmission(dt = null) {
    const af = this.actualAF;
    const egr = this.egrRate / 100.0;
    const loadFactor = 0.5 + 0.5 * (this.throttleOpen / 100.0);

    // ─ 瞬間目標値の計算 (A/F・負荷・回転数からの燃焼化学) ─
    // CO (%)
    let tgt_co;
    if (af < 14.7) {
      tgt_co = (0.3 + 1.1 * Math.pow(14.7 - af, 1.4)) * loadFactor;
    } else {
      tgt_co = Math.max(0.04, (0.28 - (af - 14.7) * 0.05) * loadFactor);
    }

    // HC (ppm)
    let tgt_hc;
    if (af < 14.7) {
      tgt_hc = (160 + 130 * Math.pow(14.7 - af, 1.35)) * loadFactor;
    } else {
      tgt_hc = (160 - (af - 14.7) * 14 + Math.max(0, Math.pow(af - 16.0, 2) * 80)) * loadFactor;
    }

    // NOx (ppm) : Zeldovich熱NOx生成
    let baseNox = 0;
    if (af < 12.0) {
      baseNox = 180;
    } else if (af < 15.2) {
      baseNox = 180 + 1350 * ((af - 12.0) / 3.2);
    } else {
      baseNox = 1530 * Math.exp(-(af - 15.2) * 0.7);
    }
    const thermalNoxFactor = (0.45 + 0.85 * (this.throttleOpen / 100.0)) * (0.65 + 0.55 * (this.engineRpm / 6000.0));
    const egrFactor = Math.exp(-egr * 5.5);
    const tgt_nox = Math.max(20, baseNox * thermalNoxFactor * egrFactor);

    // O2 (%)
    let tgt_o2;
    if (af < 14.7) {
      tgt_o2 = Math.max(0.02, 0.3 * Math.exp(-(14.7 - af) * 1.5));
    } else {
      tgt_o2 = 0.3 + (af - 14.7) * 0.55;
    }

    // ─ 1次遅れフィルタ適用 ─
    // 排気輸送時間（シリンダー→センサ/テールパイプまでのガス体移動時間）
    // tauはRPMに反比例: 高回転ほど排気流量増→輸送遅れ短縮
    if (dt === null || dt <= 0) {
      // dtなし: 即時適用（コンストラクタ初期化用）
      this.rawGas.co  = tgt_co;
      this.rawGas.hc  = tgt_hc;
      this.rawGas.nox = tgt_nox;
      this.rawGas.o2  = tgt_o2;
    } else {
      // 1次遅れフィルタ: tau = 0.4 * (1000/RPM)^0.65  [s]
      // アイドル(800rpm): tau≈0.47s, 中速(3000rpm): tau≈0.17s, 高回転(6000rpm): tau≈0.10s
      const tau = Math.min(0.8, Math.max(0.06, 0.4 * Math.pow(1000.0 / this.engineRpm, 0.65)));
      const alpha = 1.0 - Math.exp(-dt / tau);
      this.rawGas.co  += (tgt_co  - this.rawGas.co)  * alpha;
      this.rawGas.hc  += (tgt_hc  - this.rawGas.hc)  * alpha;
      this.rawGas.nox += (tgt_nox - this.rawGas.nox) * alpha;
      this.rawGas.o2  += (tgt_o2  - this.rawGas.o2)  * alpha;
    }

    // ─ 量論・マスバランス拘束 (ラグ後のrawGasから一貫計算) ─
    // 炭素保存則: CO + CO₂ ≈ 14.5%
    const C_GAS_TOTAL = 14.5;
    this.rawGas.co2 = Math.max(7.0, C_GAS_TOTAL - this.rawGas.co);

    // 水素保存則: H₂O
    if (af < 14.7) {
      this.rawGas.h2o = 13.5 - (14.7 - af) * 0.75;
    } else {
      this.rawGas.h2o = 13.5 - (af - 14.7) * 0.28;
    }
    this.rawGas.h2o = Math.max(7.0, this.rawGas.h2o);

    // N₂ 差し引きクロージャ
    const nox_vol_pct = this.rawGas.nox * 0.0001;
    const hc_vol_pct  = this.rawGas.hc  * 0.0001;
    const sum_all = this.rawGas.co + this.rawGas.co2 + this.rawGas.o2
                  + this.rawGas.h2o + nox_vol_pct + hc_vol_pct;
    this.rawGas.n2 = Math.max(60.0, 100.0 - sum_all);
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

        // 排気流速による切り替わり周期の変化モデル
        // 高RPM→排気ガスが速く到達→アップストリームO₂センサの反応が速まり→フィードバック周期短縮
        // アイドル(800rpm): ≈0.5Hz, 中速(3000rpm): ≈1.6Hz, 高回転(6000rpm): ≈3.2Hz
        const rpmNorm = Math.min(1.0, Math.max(0.0, (this.engineRpm - 600) / (6000 - 600)));
        const ditherFreq = 0.5 + rpmNorm * 2.7; // [Hz]: RPM連動

        // インテグレータゲインもRPMに応じて微増（高回転ほど応答性が上がる）
        const Ki = 0.8 + rpmNorm * 0.6;
        if (v > thresholdV) {
          this.fuelTrim = Math.max(-5.0, this.fuelTrim - Ki * dt * 4.0);
        } else {
          this.fuelTrim = Math.min(5.0, this.fuelTrim + Ki * dt * 4.0);
        }

        // セリアOSC (酸素ストレージ) の充放電
        if (this.actualAF > 14.7) {
          this.oscStorage = Math.min(1.0, this.oscStorage + 0.20 * dt);
        } else {
          this.oscStorage = Math.max(0.0, this.oscStorage - 0.20 * dt);
        }

        // RPM連動ディザリング (振幅は固定 ±0.05 A/F、周波数は回転数連動)
        this.ditherPhase += dt * (Math.PI * 2 * ditherFreq);
        const dither = 0.05 * Math.sin(this.ditherPhase);

        // スロットル過渡応答: 急変時の過渡A/F履れ（吸気管インジェクタ応答のむだ時間）
        // tip-in (スロットル展開): 空気先行→一瞬A/F上昇(リーンスパイク) → O₂電圧下降
        // tip-out(スロットル閉密): 燃料先行→一瞬A/F下降(リッチスパイク) → O₂電圧上昇
        const dThrottle = this.throttleOpen - this.throttlePrev;
        this.throttlePrev = this.throttleOpen;
        // インジェクタ応答のもらい時間による過渡A/F履れを縮道型1次遅れで表現
        // dThrottle > 0: リーン履れ (+方向), dThrottle < 0: リッチ履れ (-方向)
        const transientGain = 0.04; // [A/F per %スロットル]
        this.transientAFPerturb += dThrottle * transientGain;
        // 1次遅れ減衰: 時定数わく 0.4s (実車のインジェクタメカニカル応答時間)
        const tauTransient = 0.4;
        this.transientAFPerturb *= Math.exp(-dt / tauTransient);

        // 実測A/Fの算出: 常たるフィードバック + 過渡履れ重畚
        const baseAF = 14.70 - (this.fuelTrim * 0.015);
        const rawAF = baseAF + dither + this.transientAFPerturb;
        // 過渡時はウィンドウ外へ出ることを許可（リーンかるは13.5履れ、リッチかるは15.5履れ）
        this.actualAF = Math.max(13.5, Math.min(15.5, rawAF));
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

    this.calculateAllStates(dt);  // dtを渡して1次遅れフィルタを有効化
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
      this.rawO2History.shift();
      this.rawCOHistory.shift();
      this.rawHCHistory.shift();
      this.rawCO2History.shift();
    }

    this.timeHistory.push(this.simTime);
    this.afHistory.push(this.actualAF);
    this.o2VoltHistory.push(this.o2SensorVoltage);
    this.noxPurifHistory.push(this.purificationRates.nox);
    this.coPurifHistory.push(this.purificationRates.co);
    this.hcPurifHistory.push(this.purificationRates.hc);
    this.rawNoxHistory.push(this.rawGas.nox);
    this.tailNoxHistory.push(this.tailGas.nox);
    this.rawO2History.push(this.rawGas.o2);
    this.rawCOHistory.push(this.rawGas.co);    // CO [%]
    this.rawHCHistory.push(this.rawGas.hc);    // HC [ppm]
    this.rawCO2History.push(this.rawGas.co2);  // CO₂ [%] (炭素保存則連動)
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
    this.rawO2History = [];
    this.rawCOHistory = [];
    this.rawHCHistory = [];
    this.rawCO2History = [];

    this.calculateAllStates();
  }
}
