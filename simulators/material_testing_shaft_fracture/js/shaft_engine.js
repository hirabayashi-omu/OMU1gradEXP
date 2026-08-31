/**
 * Propeller Shaft Torsion, Buckling & Fracture Dynamics Engine
 * プロペラシャフトねじり・軸力・座屈・45°スパイラル破断計算エンジン
 */

class ShaftEngine {
  constructor(materialEngine) {
    this.matEngine = materialEngine;

    // シャフト寸法パラメータ
    this.outerDiameter = 75.0; // 外径 D [mm] (50〜120mm)
    this.thickness = 3.0;      // 肉厚 t [mm] (1.0〜8.0mm)
    this.length = 1200.0;      // シャフト全長 L [mm] (600〜2000mm)

    // 負荷パラメータ
    this.appliedTorque = 1500; // 印加トルク T [N・m] (0〜8000 N・m)
    this.appliedAxialForce = 0; // 軸力 P [kN] (圧縮: 負, 引張: 正, -100〜+100 kN)
    this.rpm = 2500;           // 回転数 [rpm] (0〜8000 rpm)

    // 応力・破壊状態変数
    this.shearStressTau = 0.0;      // ねじりせん断応力 τ [MPa]
    this.axialStressSigma = 0.0;    // 軸応力 σ_z [MPa]
    this.vonMisesStress = 0.0;      // フォン・ミーゼス相当応力 σ_eq [MPa]
    this.maxPrincipalStress = 0.0;  // 最大主応力 σ_1 [MPa]
    this.principalAngleRad = Math.PI / 4; // 主応力方向角 θ_p (純ねじり時 = 45°)
    this.twistAngleDeg = 0.0;       // ねじれ角 θ [deg]
    
    // 臨界限界値
    this.yieldTorque = 0.0;         // 降伏トルク T_y [N・m]
    this.ultimateTorque = 0.0;      // 破断トルク T_u [N・m]
    this.bucklingTorque = 0.0;      // ねじり座屈臨界トルク T_cr [N・m]
    this.eulerBucklingForce = 0.0;  // 軸圧縮オイラー座屈荷重 P_cr [kN]

    // 破壊モード・フラグ
    this.isYielded = false;
    this.isBuckled = false;         // ねじり座屈フラグ (ペコ潰れ)
    this.isFractured = false;       // 破断フラグ (45°スパイラル破断)
    this.fractureType = 'none';     // 'spiral_shear', 'torsional_buckling', 'euler_buckling', 'delamination'
    this.fractureProgress = 0.0;    // 破断アニメーション進行度 (0.0〜1.0)

    this.calculateShaftState();
  }

  // シャフト幾何学・応力・破壊限界の計算
  calculateShaftState() {
    const mat = this.matEngine.currentMaterial;
    const D = this.outerDiameter / 1000.0; // [m]
    const t = this.thickness / 1000.0;     // [m]
    const d = D - 2 * t;                  // 内径 [m]
    const L = this.length / 1000.0;        // [m]
    const R = D / 2.0;                     // 外半径 [m]

    // 断面積 A [m^2]
    const A = (Math.PI / 4) * (Math.pow(D, 2) - Math.pow(d, 2));

    // 断面二次極モーメント Ip [m^4]
    const Ip = (Math.PI / 32) * (Math.pow(D, 4) - Math.pow(d, 4));

    // 極断面係数 Zp [m^3]
    const Zp = (Math.PI / 16) * (Math.pow(D, 4) - Math.pow(d, 4)) / D;

    // 断面二次モーメント I [m^4] (曲げ・オイラー座屈用)
    const I = Ip / 2.0;

    // 1. せん断応力 τ = T / Zp [MPa]
    const T = Math.abs(this.appliedTorque); // [N・m]
    this.shearStressTau = (T / Zp) / 1e6;  // [MPa]

    // 2. 軸応力 σ_z = P / A [MPa]
    const P = this.appliedAxialForce * 1000.0; // [N]
    this.axialStressSigma = (P / A) / 1e6;     // [MPa]

    // 3. フォン・ミーゼス相当応力 σ_eq = sqrt(σ_z^2 + 3 * τ^2)
    this.vonMisesStress = Math.sqrt(Math.pow(this.axialStressSigma, 2) + 3 * Math.pow(this.shearStressTau, 2));

    // 4. 主応力 σ_1, σ_2 ＆ 主応力方向角 θ_p
    const sigmaAvg = this.axialStressSigma / 2.0;
    const maxShearR = Math.sqrt(Math.pow(sigmaAvg, 2) + Math.pow(this.shearStressTau, 2));
    this.maxPrincipalStress = sigmaAvg + maxShearR;
    this.principalAngleRad = 0.5 * Math.atan2(2 * this.shearStressTau, this.axialStressSigma);

    // 5. ねじれ角 θ = (T * L) / (G * Ip) [deg]
    // せん断弾性係数 G = E / (2 * (1 + nu))
    const G = (mat.E * 1e6) / (2 * (1 + mat.nu)); // [Pa]
    const thetaRad = (T * L) / (G * Ip);
    this.twistAngleDeg = (thetaRad * 180) / Math.PI;

    // ─── 臨界限界値の計算 ───
    // 降伏トルク T_y = τ_y * Zp (τ_y = σ_y / sqrt(3))
    const tau_y = (mat.sigma_y / Math.sqrt(3)) * 1e6; // [Pa]
    this.yieldTorque = tau_y * Zp; // [N・m]

    // 破断トルク T_u = τ_u * Zp (τ_u = σ_u / sqrt(3))
    const tau_u = (mat.sigma_u / Math.sqrt(3)) * 1e6; // [Pa]
    this.ultimateTorque = tau_u * Zp; // [N・m]

    // 薄肉円筒ねじり座屈臨界トルク T_cr [N・m] (NASA SP-8007 / 航空宇宙座屈式)
    const E_Pa = mat.E * 1e6;
    const nu = mat.nu;
    const t_m = t;
    const R_m = (D - t) / 2.0; // 平均半径
    const tau_cr_Pa = (0.75 * E_Pa / Math.pow(1 - nu * nu, 0.75)) * Math.pow(t_m / R_m, 1.25) * Math.sqrt(R_m / L);
    this.bucklingTorque = tau_cr_Pa * Zp; // [N・m]

    // 軸圧縮オイラー座屈臨界荷重 P_cr [kN] (両端ピン支持: π^2 * E * I / L^2)
    const P_cr_N = (Math.PI * Math.PI * E_Pa * I) / Math.pow(L, 2);
    this.eulerBucklingForce = P_cr_N / 1000.0; // [kN]

    // ─── 破壊・破断モード判定 ───
    this.isYielded = (this.vonMisesStress >= mat.sigma_y);

    // 判定優先度1: 軸圧縮オイラー座屈
    if (this.appliedAxialForce < 0 && Math.abs(this.appliedAxialForce) >= this.eulerBucklingForce) {
      this.isBuckled = true;
      this.isFractured = true;
      this.fractureType = 'euler_buckling';
    }
    // 判定優先度2: 薄肉ねじり座屈 (ダイヤモンドペコ潰れ)
    else if (this.appliedTorque >= this.bucklingTorque && this.bucklingTorque < this.ultimateTorque) {
      this.isBuckled = true;
      this.isFractured = true;
      this.fractureType = 'torsional_buckling';
    }
    // 判定優先度3: 純ねじりスパイラル破断
    else if (this.appliedTorque >= this.ultimateTorque) {
      this.isFractured = true;
      this.fractureType = (mat.id === 'cfrp') ? 'delamination' : 'spiral_shear';
    }
    else {
      this.isBuckled = false;
      this.isFractured = false;
      this.fractureType = 'none';
      this.fractureProgress = 0.0;
    }
  }

  // 破断アニメーションの更新
  updateFractureAnimation(delta) {
    if (this.isFractured && this.fractureProgress < 1.0) {
      this.fractureProgress = Math.min(1.0, this.fractureProgress + delta * 2.5);
    }
  }

  // 診断データサマリー取得
  getShaftSummary() {
    const sf_yield = this.yieldTorque / Math.max(1, this.appliedTorque);
    const sf_ultimate = this.ultimateTorque / Math.max(1, this.appliedTorque);
    const sf_buckling = this.bucklingTorque / Math.max(1, this.appliedTorque);

    return {
      outerDiameter_mm: this.outerDiameter,
      thickness_mm: this.thickness,
      innerDiameter_mm: (this.outerDiameter - 2 * this.thickness).toFixed(1),
      length_mm: this.length,
      torque_Nm: this.appliedTorque,
      shearStress_MPa: this.shearStressTau.toFixed(1),
      vonMises_MPa: this.vonMisesStress.toFixed(1),
      maxPrincipal_MPa: this.maxPrincipalStress.toFixed(1),
      principalAngle_deg: ((this.principalAngleRad * 180) / Math.PI).toFixed(1),
      twistAngle_deg: this.twistAngleDeg.toFixed(2),
      yieldTorque_Nm: Math.round(this.yieldTorque),
      ultimateTorque_Nm: Math.round(this.ultimateTorque),
      bucklingTorque_Nm: Math.round(this.bucklingTorque),
      eulerBuckling_kN: this.eulerBucklingForce.toFixed(1),
      safetyFactor: Math.min(sf_yield, sf_ultimate, sf_buckling).toFixed(2),
      status: this.isFractured ? `💥 破断発生 (${this.getFractureName()})` : (this.isYielded ? '⚠️ 塑性降伏中' : '🟢 弾性安全域')
    };
  }

  getFractureName() {
    switch (this.fractureType) {
      case 'spiral_shear': return '45°螺旋引張/せん断破断';
      case 'torsional_buckling': return '薄肉円筒ねじり座屈 (ペコ潰れ)';
      case 'euler_buckling': return '軸圧縮オイラー座屈破壊';
      case 'delamination': return 'CFRP層間剥離・繊維破断';
      default: return '健全';
    }
  }
}

if (typeof window !== 'undefined') {
  window.ShaftEngine = ShaftEngine;
}
