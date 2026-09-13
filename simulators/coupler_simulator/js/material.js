/**
 * material.js - 鉄道自動連結器 材料物性・S-S曲線（応力-ひずみ線図）モデル
 * 鉄道鋳鋼（JIS SC480 / AAR Grade E / 高張力鋼）の弾塑性・加工硬化・破壊限界
 */

export const MATERIALS = {
  sc480: {
    name: 'JIS SC480 炭素鋼鋳鋼 (標準)',
    desc: '日本国内の一般在来線・貨車に広く採用されている標準構造用鋳鋼',
    youngModulus: 206e9,      // Pa (206 GPa)
    yieldStress: 275e6,       // Pa (275 MPa)
    ultimateStress: 480e6,    // Pa (480 MPa)
    fractureStrain: 0.22,     // 22% 伸び
    density: 7850,            // kg/m^3
    poissonRatio: 0.30,
    hardeningExponent: 6.5,   // 加工硬化指数 n
    strengthCoeff: 820e6,     // K (Pa)
    shearStrength: 320e6,     // せん断許容 (Pa)
    compressiveLimit: 550e6   // 圧縮座屈・圧潰限界 (Pa)
  },
  aarGradeE: {
    name: 'AAR Grade E 高張力鋳鋼 (強化型)',
    desc: '重量貨物列車や高速・高耐荷重用途に用いられる高強度熱処理鋳鋼',
    youngModulus: 210e9,      // Pa (210 GPa)
    yieldStress: 690e6,       // Pa (690 MPa)
    ultimateStress: 830e6,    // Pa (830 MPa)
    fractureStrain: 0.16,     // 16% 伸び
    density: 7850,
    poissonRatio: 0.29,
    hardeningExponent: 8.0,
    strengthCoeff: 1250e6,
    shearStrength: 520e6,
    compressiveLimit: 950e6
  },
  specialAlloy: {
    name: 'ニッケルクロムモリブデン低合金鋳鋼',
    desc: '極寒地耐衝撃仕様・新幹線等の過酷環境向け高靭性合金鋼',
    youngModulus: 208e9,      // Pa (208 GPa)
    yieldStress: 780e6,       // Pa (780 MPa)
    ultimateStress: 980e6,    // Pa (980 MPa)
    fractureStrain: 0.18,     // 18% 伸び
    density: 7870,
    poissonRatio: 0.29,
    hardeningExponent: 9.0,
    strengthCoeff: 1400e6,
    shearStrength: 600e6,
    compressiveLimit: 1100e6
  }
};

export class MaterialEngine {
  constructor(materialKey = 'sc480') {
    this.currentKey = materialKey;
    this.mat = MATERIALS[materialKey];
    this.plasticStrain = 0.0;    // 累積塑性ひずみ (永久変形)
    this.currentStress = 0.0;     // 現在のVon Mises応力 (Pa)
    this.currentStrain = 0.0;     // 現在の全ひずみ
    this.peakStress = 0.0;        // 最大到達応力
    this.isYielded = false;       // 降伏フラグ
    this.isFractured = false;     // 破壊フラグ
    this.failureMode = null;      // 'tension_fracture', 'compressive_crush', 'shear_failure'
  }

  setMaterial(key) {
    if (MATERIALS[key]) {
      this.currentKey = key;
      this.mat = MATERIALS[key];
      this.resetState();
    }
  }

  resetState() {
    this.plasticStrain = 0.0;
    this.currentStress = 0.0;
    this.currentStrain = 0.0;
    this.peakStress = 0.0;
    this.isYielded = false;
    this.isFractured = false;
    this.failureMode = null;
  }

  /**
   * 応力からひずみを計算 (Ramberg-Osgood構成式)
   */
  computeStrain(stressPa) {
    const s = Math.abs(stressPa);
    const E = this.mat.youngModulus;
    const sy = this.mat.yieldStress;
    const n = this.mat.hardeningExponent;
    const alpha = 0.002 * E / sy; // 0.2%耐力オフセット係数

    const elastic = s / E;
    const plastic = (s > sy) ? 0.002 * Math.pow(s / sy, n) : 0;
    return elastic + plastic;
  }

  /**
   * 応力入力から状態更新・塑性変形・破壊判定
   * @param {number} vonMisesStressPa - Von Mises相当応力
   * @param {number} normalStressPa - 主応力(引張+/圧縮-)
   * @param {number} shearStressPa - 最大せん断応力
   */
  update(vonMisesStressPa, normalStressPa = 0, shearStressPa = 0) {
    if (this.isFractured) return { isFractured: true, failureMode: this.failureMode };

    this.currentStress = vonMisesStressPa;
    if (this.currentStress > this.peakStress) {
      this.peakStress = this.currentStress;
    }

    const sy = this.mat.yieldStress;
    const su = this.mat.ultimateStress;
    const ef = this.mat.fractureStrain;
    const E = this.mat.youngModulus;

    // 全ひずみ計算
    const totalStrain = this.computeStrain(this.currentStress) + this.plasticStrain;
    this.currentStrain = totalStrain;

    // 降伏判定
    if (this.currentStress >= sy) {
      this.isYielded = true;
      // 塑性ひずみの蓄積
      const deltaPlastic = Math.max(0, (this.currentStress - sy) / (E * 0.08) * 0.0005);
      this.plasticStrain += deltaPlastic;
    }

    // 破壊・破断判定
    // 1. 引張・曲げによる破断 (全ひずみが破断ひずみ超過、または引張強さ到達)
    if (this.currentStrain >= ef || this.currentStress >= su * 1.05) {
      this.isFractured = true;
      this.failureMode = 'tension_fracture';
    }
    // 2. 圧縮限界 (過大衝突による緩衝器底付き圧潰・座屈)
    else if (normalStressPa < 0 && Math.abs(normalStressPa) >= this.mat.compressiveLimit) {
      this.isFractured = true;
      this.failureMode = 'compressive_crush';
    }
    // 3. ナックルピン等のせん断破壊
    else if (Math.abs(shearStressPa) >= this.mat.shearStrength) {
      this.isFractured = true;
      this.failureMode = 'shear_failure';
    }

    return {
      stress: this.currentStress,
      strain: this.currentStrain,
      plasticStrain: this.plasticStrain,
      isYielded: this.isYielded,
      isFractured: this.isFractured,
      failureMode: this.failureMode,
      safetyFactor: this.currentStress > 1e3 ? (sy / this.currentStress) : 99.9
    };
  }

  /**
   * S-S曲線描画用のデータ系列を生成
   * 弾性域、降伏点、加工硬化、ネッキング、破壊点
   */
  getCurveData(points = 100) {
    const data = [];
    const sy = this.mat.yieldStress / 1e6;     // MPa
    const su = this.mat.ultimateStress / 1e6;  // MPa
    const ef = this.mat.fractureStrain;
    const E = this.mat.youngModulus / 1e6;     // MPa

    const yieldStrain = (sy / E) + 0.002;
    const maxStrain = ef * 1.08;

    for (let i = 0; i <= points; i++) {
      const strain = (i / points) * maxStrain;
      let stress = 0;

      if (strain <= yieldStrain) {
        // 弾性域
        stress = strain * E;
      } else if (strain <= ef * 0.75) {
        // 均一塑性変形・加工硬化域 (Hollomon / Ludwik則)
        const plasticPart = strain - (sy / E);
        stress = sy + (su - sy) * Math.pow(plasticPart / (ef * 0.75 - sy / E), 0.45);
      } else if (strain <= ef) {
        // ネッキング (局所くびれ・見かけ応力低下)
        const neckRatio = (strain - ef * 0.75) / (ef * 0.25);
        stress = su - (su * 0.12) * neckRatio;
      } else {
        // 破断後
        stress = 0;
      }

      data.push({ x: Number(strain.toFixed(5)), y: Number(stress.toFixed(2)) });
    }

    return {
      curve: data,
      yieldPoint: { x: Number(yieldStrain.toFixed(5)), y: sy },
      ultimatePoint: { x: Number((ef * 0.75).toFixed(5)), y: su },
      fracturePoint: { x: Number(ef.toFixed(5)), y: su * 0.88 }
    };
  }
}