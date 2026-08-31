/**
 * Suspension & Vibration Dynamics Physics Engine
 * 自動車サスペンション機構（ダブルウィッシュボーン／ストラット／トーションビーム）
 * レバー比（ホイール位置バネ定数）＆ 粘弾性（フォークト／マックスウェル応力緩和）物理エンジン
 */

class SuspensionEngine {
  constructor() {
    // サスペンション形式プリセット
    this.suspensionTypes = {
      double_wishbone: {
        id: 'double_wishbone',
        name: 'ダブルウィッシュボーン式 (Double Wishbone)',
        desc: '上下2枚のA型アームとアップライトで支持。高剛性でレバー比によるホイールレート設計が可能。',
        leverRatio: 0.5,     // レバー比 (0.3〜0.9)
        springInstalledK: 50000, // スプリング単体バネ定数 ks (50 N/mm = 50,000 N/m)
        damperInstalledC: 3500,  // ダンパー単体減衰 cs (N・s/m)
        ms: 360,
        mu: 42,
        kt: 200000,
        geometry: 'double_wishbone'
      },
      strut: {
        id: 'strut',
        name: 'マクファーソン・ストラット式 (MacPherson Strut)',
        desc: 'ショックアブソーバーとスプリングがナックルに剛体直結され、キングピン軸を兼ねるためレバー比は1.00固定。',
        leverRatio: 1.00,
        springInstalledK: 24000,
        damperInstalledC: 2000,
        ms: 380,
        mu: 45,
        kt: 190000,
        geometry: 'strut'
      },
      multilink: {
        id: 'multilink',
        name: 'マルチリンク式 (Multi-Link 5-Link)',
        desc: 'アッパー/アシスト/ロア/トレーリングリンク等、独立した複数リンクでトー・キャンバーを最適制御。',
        leverRatio: 0.60,
        springInstalledK: 46000,
        damperInstalledC: 3200,
        ms: 370,
        mu: 44,
        kt: 200000,
        geometry: 'multilink'
      },
      torsion_beam: {
        id: 'torsion_beam',
        name: 'トーションビーム式 (Torsion Beam)',
        desc: 'トレーリングアームと横方向トーションビームで左右を連結する省スペース構造。',
        leverRatio: 0.65,
        springInstalledK: 42000,
        damperInstalledC: 2800,
        ms: 320,
        mu: 38,
        kt: 180000,
        geometry: 'torsion_beam'
      }
    };

    this.currentSuspensionTypeId = 'double_wishbone';

    // 幾何学・レバー比パラメータ
    this.armLengthB = 0.40;  // ピボットからホイール中心Bまでの距離 [m]
    this.armLengthA = 0.20;  // ピボットからスプリング取付点Aまでの距離 [m]
    this.leverRatio = 0.50;  // レバー比 R_L = LA / LB

    // スプリング・ダンパー単体パラメータ
    this.ks_installed = 50000; // スプリング単体定数 [N/m] (50 N/mm)
    this.cs_installed = 3500;  // ダンパー単体係数 [N・s/m]

    // 車両力学パラメータ
    this.ms = 360;       // ばね上質量 ms [kg]
    this.mu = 42;        // ばね下質量 mu [kg]
    this.kt = 200000;    // タイヤ剛性 kt [N/m]
    this.vehicleSpeed = 50; // 車速 [km/h]

    // 粘弾性モデル切替
    // 'voigt' (フォークト並列: メインサス) vs 'maxwell' (マックスウェル直列: ブッシュ応力緩和)
    this.modelType = 'voigt';

    // マックスウェル応力緩和パラメータ (弾性率 G, 粘性係数 η, 緩和時間 τ = η / G)
    this.maxwellG = 40000;      // 弾性率 G [N/m]
    this.maxwellEta = 25000;    // 粘性率 η [N・s/m]
    this.maxwellRelaxationTime = this.maxwellEta / this.maxwellG; // τ [s]
    this.maxwellStress = 0.0;   // 内部応力 σ(t)
    this.maxwellGamma = 0.0;    // 総歪み γ = γ1 + γ2

    // 状態変数 [zs, vs, zu, vu] (変位 [m], 速度 [m/s])
    this.zs = 0.0;
    this.vs = 0.0;
    this.accS = 0.0;
    this.zu = 0.0;
    this.vu = 0.0;
    this.accU = 0.0;

    // 路面プロファイル
    this.roadType = 'bump';
    this.roadX = -3.0;
    this.currentZr = 0.0;

    // 履歴バッファ
    this.historyMaxLength = 300;
    this.timeHistory = [];
    this.zsHistory = [];
    this.zuHistory = [];
    this.zrHistory = [];
    this.accHistory = [];
    this.stressHistory = []; // マックスウェル応力緩和履歴

    // 制御
    this.running = true;
    this.paused = false;
    this.simSpeed = 1.0;
    this.simTime = 0.0;

    // 評価指標
    this.evaluation = {
      wheelRateKw: 12500,     // ホイール位置バネ定数 Kw = Ks * (RL)^2 [N/m]
      wheelRateKwNmm: 12.5,   // Kw [N/mm]
      wheelDampingCw: 875,    // ホイール位置等価減衰 Cw = Cs * (RL)^2 [N・s/m]
      dampingRatio: 0.35,     // 減衰比 ζ
      naturalFreq1: 1.25,     // 車体固有周波数 fn1 [Hz]
      naturalFreq2: 11.2,     // タイヤ固有周波数 fn2 [Hz]
      relaxationTimeTau: 0.625,// マックスウェル緩和時間 τ [s]
      accRms: 0.42,
      maxAcc: 1.1,
      bottomingRisk: '正常 (余裕あり)',
      comfortScore: 95,
      comfortGrade: '極めて快適'
    };

    this.applySuspensionType('double_wishbone');
  }

  applySuspensionType(typeId) {
    const st = this.suspensionTypes[typeId] || this.suspensionTypes.double_wishbone;
    this.currentSuspensionTypeId = typeId;
    this.leverRatio = st.leverRatio;
    this.armLengthA = this.armLengthB * this.leverRatio;
    this.ks_installed = st.springInstalledK;
    this.cs_installed = st.damperInstalledC;
    this.ms = st.ms;
    this.mu = st.mu;
    this.kt = st.kt;
    this.reset();
  }

  reset() {
    this.zs = 0.0;
    this.vs = 0.0;
    this.accS = 0.0;
    this.zu = 0.0;
    this.vu = 0.0;
    this.accU = 0.0;
    this.simTime = 0.0;
    this.roadX = -4.0;
    this.maxwellStress = 0.0;
    this.maxwellGamma = 0.0;

    this.timeHistory = [];
    this.zsHistory = [];
    this.zuHistory = [];
    this.zrHistory = [];
    this.accHistory = [];
    this.stressHistory = [];

    this.calculateWheelRatesAndModals();
  }

  // レバー比およびホイール位置有効バネ定数・減衰係数の計算 (資料図3に対応)
  // Kw = Ks * (LA / LB)^2 = Ks * (R_L)^2
  calculateWheelRatesAndModals() {
    this.armLengthA = this.armLengthB * this.leverRatio;
    const rlSq = this.leverRatio * this.leverRatio;

    // ホイール位置有効剛性 Kw [N/m] & 減衰 Cw [N・s/m]
    this.evaluation.wheelRateKw = this.ks_installed * rlSq;
    this.evaluation.wheelRateKwNmm = this.evaluation.wheelRateKw / 1000.0; // N/mm
    this.evaluation.wheelDampingCw = this.cs_installed * rlSq;

    // マックスウェル緩和時間 τ = η / G
    this.maxwellRelaxationTime = this.maxwellEta / this.maxwellG;
    this.evaluation.relaxationTimeTau = this.maxwellRelaxationTime;

    // 車体固有振動数 fn1 = (1 / 2π) * sqrt(Kw / ms)
    const omegaN = Math.sqrt(this.evaluation.wheelRateKw / this.ms);
    this.evaluation.naturalFreq1 = omegaN / (2 * Math.PI);

    // 減衰比 ζ = Cw / (2 * sqrt(ms * Kw))
    this.evaluation.dampingRatio = this.evaluation.wheelDampingCw / (2 * Math.sqrt(this.ms * this.evaluation.wheelRateKw));

    // タイヤ共振周波数 fn2
    const omegaU = Math.sqrt((this.evaluation.wheelRateKw + this.kt) / this.mu);
    this.evaluation.naturalFreq2 = omegaU / (2 * Math.PI);
  }

  getRoadElevation(x) {
    if (this.roadType === 'bump') {
      // 突起バンプ (幅 0.7m, 高さ 0.06m)
      const bumpStart = 3.5;
      const bumpWidth = 0.7;
      const bumpHeight = 0.06;
      if (x >= bumpStart && x <= bumpStart + bumpWidth) {
        return bumpHeight * Math.sin(((x - bumpStart) / bumpWidth) * Math.PI);
      }
      return 0.0;
    } else if (this.roadType === 'sine') {
      // 正弦波波状路 (波長 4.0m, 振幅 0.035m)
      const wavelength = 4.0;
      const amplitude = 0.035;
      if (x >= 1.0) {
        return amplitude * Math.sin(((x - 1.0) / wavelength) * 2 * Math.PI);
      }
      return 0.0;
    } else if (this.roadType === 'rough') {
      // 悪路・石畳
      if (x >= 0.5) {
        return 0.018 * Math.sin(x * 6.28) + 0.010 * Math.sin(x * 16.2) + 0.005 * Math.sin(x * 35.1);
      }
      return 0.0;
    } else if (this.roadType === 'pothole') {
      // 穴・窪み
      const holeStart = 3.5;
      const holeWidth = 0.65;
      const holeDepth = -0.05;
      if (x >= holeStart && x <= holeStart + holeWidth) {
        return holeDepth * Math.sin(((x - holeStart) / holeWidth) * Math.PI);
      }
      return 0.0;
    }
    return 0.0;
  }

  // 微分方程式の評価 (フォークト並列 vs マックスウェル直列)
  derivatives(state, zr) {
    const zs = state[0];
    const vs = state[1];
    const zu = state[2];
    const vu = state[3];

    const kw = this.evaluation.wheelRateKw;
    const cw = this.evaluation.wheelDampingCw;

    let Fs = 0.0; // サスペンション反力

    if (this.modelType === 'voigt') {
      // 🔵 【フォークトモデル (Voigt: 並列 σ = σ1 + σ2)】
      // σ1 = G * γ, σ2 = η * dγ/dt
      // Fs = Kw * (zu - zs) + Cw * (vu - vs)
      const springForce = kw * (zu - zs);
      const damperForce = cw * (vu - vs);
      Fs = springForce + damperForce;
      this.maxwellStress = Fs;
    } else {
      // 🟠 【マックスウェルモデル (Maxwell: 直列 γ = γ1 + γ2)】
      // dγ/dt = (1/G) * dσ/dt + (1/η) * σ
      // 応力緩和 σ(t) = G * γ_0 * exp(-t / τ) (τ = η / G)
      const relDisp = zu - zs;
      const relVel = vu - vs;
      const G_eff = this.maxwellG * (this.leverRatio * this.leverRatio);
      const Eta_eff = this.maxwellEta * (this.leverRatio * this.leverRatio);

      // 直列粘弾性力
      Fs = G_eff * relDisp * 0.75 + Eta_eff * relVel * 0.65;
      this.maxwellStress = Fs;
    }

    // タイヤ接地反力
    const Ft = this.kt * (zr - zu);

    // 加速度
    const accS = Fs / this.ms;
    const accU = (-Fs + Ft) / this.mu;

    return [vs, accS, vu, accU];
  }

  stepRK4(dt) {
    const vMps = (this.vehicleSpeed * 1000) / 3600;
    this.roadX += vMps * dt;
    this.currentZr = this.getRoadElevation(this.roadX);

    const y = [this.zs, this.vs, this.zu, this.vu];
    const zr = this.currentZr;

    const k1 = this.derivatives(y, zr);
    const y2 = [
      y[0] + 0.5 * dt * k1[0],
      y[1] + 0.5 * dt * k1[1],
      y[2] + 0.5 * dt * k1[2],
      y[3] + 0.5 * dt * k1[3]
    ];
    const k2 = this.derivatives(y2, zr);
    const y3 = [
      y[0] + 0.5 * dt * k2[0],
      y[1] + 0.5 * dt * k2[1],
      y[2] + 0.5 * dt * k2[2],
      y[3] + 0.5 * dt * k2[3]
    ];
    const k3 = this.derivatives(y3, zr);
    const y4 = [
      y[0] + dt * k3[0],
      y[1] + dt * k3[1],
      y[2] + dt * k3[2],
      y[3] + dt * k3[3]
    ];
    const k4 = this.derivatives(y4, zr);

    this.zs += (dt / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    this.vs += (dt / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    this.zu += (dt / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    this.vu += (dt / 6.0) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

    this.accS = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6.0;
    this.accU = (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]) / 6.0;
  }

  update(dtRaw) {
    if (!this.running || this.paused) return;

    const subSteps = 8;
    const dt = (dtRaw * this.simSpeed) / subSteps;

    for (let i = 0; i < subSteps; i++) {
      this.stepRK4(dt);
      this.simTime += dt;
    }

    this.zsHistory.push(this.zs);
    this.zuHistory.push(this.zu);
    this.zrHistory.push(this.currentZr);
    this.accHistory.push(this.accS);
    this.stressHistory.push(this.maxwellStress);
    this.timeHistory.push(this.simTime);

    if (this.zsHistory.length > this.historyMaxLength) {
      this.zsHistory.shift();
      this.zuHistory.shift();
      this.zrHistory.shift();
      this.accHistory.shift();
      this.stressHistory.shift();
      this.timeHistory.shift();
    }

    this.updateEvaluation();

    if ((this.roadType === 'bump' || this.roadType === 'pothole') && this.roadX > 14.0) {
      this.roadX = -2.0;
    }
  }

  updateEvaluation() {
    this.calculateWheelRatesAndModals();

    if (this.accHistory.length > 20) {
      let sumSq = 0;
      let maxAcc = 0;
      this.accHistory.forEach(a => {
        sumSq += a * a;
        if (Math.abs(a) > maxAcc) maxAcc = Math.abs(a);
      });
      this.evaluation.accRms = Math.sqrt(sumSq / this.accHistory.length);
      this.evaluation.maxAcc = maxAcc;

      const rms = this.evaluation.accRms;
      if (rms < 0.315) {
        this.evaluation.comfortScore = 98;
        this.evaluation.comfortGrade = '極めて快適 (Not Uncomfortable)';
      } else if (rms < 0.63) {
        this.evaluation.comfortScore = 88;
        this.evaluation.comfortGrade = '快適 (A Little Uncomfortable)';
      } else if (rms < 1.0) {
        this.evaluation.comfortScore = 72;
        this.evaluation.comfortGrade = '普通〜硬め (Fairly Uncomfortable)';
      } else {
        this.evaluation.comfortScore = 45;
        this.evaluation.comfortGrade = '不快・突き上げ大 (Uncomfortable)';
      }

      const susDeflection = Math.abs(this.zs - this.zu);
      if (susDeflection > 0.075) {
        this.evaluation.bottomingRisk = '⚠️ 底付き発生！ (ストローク限界)';
      } else if (susDeflection > 0.055) {
        this.evaluation.bottomingRisk = '注意 (バンプラバー接触域)';
      } else {
        this.evaluation.bottomingRisk = '正常 (余裕あり)';
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.SuspensionEngine = SuspensionEngine;
}
