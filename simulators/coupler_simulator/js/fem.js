/**
 * fem.js - リアルタイム有限要素・応力集中解析エンジン
 * 接触衝突力、牽引力、偏心モーメントから連結器各部位の応力テンソルとVon Mises応力を算出
 */

export class FEMEngine {
  constructor() {
    // 応力解析用主要モニタ節点
    this.nodes = {
      knuckleNose: { name: 'ナックル先端部', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      knuckleNeck: { name: 'ナックル付け根(最大応力集中部)', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      knucklePin:  { name: 'ナックル回転ピン(せん断部)', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      lockBlock:   { name: '錠(Lock Block)受面', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      guardArm:    { name: '本体顎部(ガードアーム)', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      shank:       { name: '連結器シャンク(胴体部)', stress: 0, maxStress: 0, yieldLimitRatio: 0 },
      draftGear:   { name: '緩衝器フォロワー板', stress: 0, maxStress: 0, yieldLimitRatio: 0 }
    };

    // 部位ごとの断面定数・応力集中係数 Kt (実験・有限要素法データに基づく)
    this.sectionProps = {
      knuckleNeck: { area: 0.0165, zModulus: 0.00072, kt: 2.85, type: 'bending_tension' },
      knucklePin:  { area: 0.0048, zModulus: 0.00008, kt: 1.65, type: 'pure_shear' },
      knuckleNose: { area: 0.0220, zModulus: 0.00095, kt: 1.45, type: 'contact_hertz' },
      lockBlock:   { area: 0.0120, zModulus: 0.00045, kt: 2.10, type: 'bearing_shear' },
      guardArm:    { area: 0.0250, zModulus: 0.00120, kt: 1.95, type: 'contact_bending' },
      shank:       { area: 0.0280, zModulus: 0.00160, kt: 1.25, type: 'axial_bending' },
      draftGear:   { area: 0.0350, zModulus: 0.00220, kt: 1.35, type: 'compression' }
    };

    this.maxGlobalStress = 0;
    this.peakGlobalStress = 0;
    this.criticalNode = 'knuckleNeck';
  }

  reset() {
    for (const key of Object.keys(this.nodes)) {
      this.nodes[key].stress = 0;
      this.nodes[key].maxStress = 0;
      this.nodes[key].yieldLimitRatio = 0;
    }
    this.maxGlobalStress = 0;
    this.peakGlobalStress = 0;
    this.criticalNode = 'knuckleNeck';
  }

  /**
   * 力学的荷重から各節点のVon Mises相当応力を計算
   * @param {number} Fx - 前後軸力 (N, 正: 引張/牽引, 負: 衝突圧縮)
   * @param {number} Fy - 上下せん断・動揺力 (N)
   * @param {number} Fz - 左右偏心力 (N)
   * @param {number} yieldStress - 現在材料の降伏応力 (Pa)
   */
  compute(Fx, Fy, Fz, yieldStress = 275e6) {
    const absFx = Math.abs(Fx);
    const absFy = Math.abs(Fy);
    const absFz = Math.abs(Fz);
    const armLength = 0.28; // 作用点アーム長 (m)
    const My = absFz * armLength; // 左右曲げモーメント
    const Mz = absFy * armLength; // 上下曲げモーメント

    let maxStress = 0;
    let worstNode = 'knuckleNeck';

    for (const [key, prop] of Object.entries(this.sectionProps)) {
      let sigmaMises = 0;

      if (prop.type === 'bending_tension') {
        // ナックルネック: 軸引張/圧縮 + 偏心曲げによる過大な応力集中
        const sigmaAxial = absFx / prop.area;
        const sigmaBending = (My + Mz) / prop.zModulus;
        const totalNormal = (sigmaAxial + sigmaBending) * prop.kt;
        const tau = (absFy + absFz) / (prop.area * 0.7);
        sigmaMises = Math.sqrt(totalNormal * totalNormal + 3 * tau * tau);
      }
      else if (prop.type === 'pure_shear') {
        // ピン: ナックル牽引力による両振りせん断
        const tau = (absFx * 0.6 + Math.sqrt(Fy * Fy + Fz * Fz)) / prop.area * prop.kt;
        sigmaMises = Math.sqrt(3 * tau * tau);
      }
      else if (prop.type === 'contact_hertz') {
        // ナックル接触面: ヘルツ接触圧 + 局部圧縮
        const p0 = Math.sqrt((absFx + 100) / prop.area * 2.1e11 * 0.00015) * prop.kt;
        sigmaMises = Math.min(p0, (absFx / prop.area) * prop.kt * 2.2);
      }
      else if (prop.type === 'bearing_shear') {
        // 錠受面: 面圧 + 曲げ
        const sigmaBear = (absFx * 0.55) / prop.area * prop.kt;
        sigmaMises = sigmaBear * 1.15;
      }
      else if (prop.type === 'contact_bending') {
        // ガードアーム: ガタつき衝突時の横衝撃曲げ
        const sigmaBending = (My * 1.4) / prop.zModulus * prop.kt;
        sigmaMises = sigmaBending + (absFx * 0.2) / prop.area;
      }
      else if (prop.type === 'axial_bending') {
        // シャンク: 主軸力 + 走行振動曲げ
        const sigmaAxial = absFx / prop.area * prop.kt;
        const sigmaBending = (My * 0.5 + Mz * 0.5) / prop.zModulus;
        sigmaMises = Math.sqrt((sigmaAxial + sigmaBending) ** 2);
      }
      else if (prop.type === 'compression') {
        // 緩衝器フォロワー
        sigmaMises = (absFx / prop.area) * prop.kt;
      }

      // ノイズ・ベース応力
      sigmaMises = Math.max(0.1e6, sigmaMises);

      this.nodes[key].stress = sigmaMises;
      if (sigmaMises > this.nodes[key].maxStress) {
        this.nodes[key].maxStress = sigmaMises;
      }
      this.nodes[key].yieldLimitRatio = sigmaMises / yieldStress;

      if (sigmaMises > maxStress) {
        maxStress = sigmaMises;
        worstNode = key;
      }
    }

    this.maxGlobalStress = maxStress;
    if (maxStress > this.peakGlobalStress) {
      this.peakGlobalStress = maxStress;
    }
    this.criticalNode = worstNode;

    return {
      nodes: this.nodes,
      maxGlobalStress: this.maxGlobalStress,
      peakGlobalStress: this.peakGlobalStress,
      criticalNode: this.criticalNode,
      criticalNodeName: this.nodes[worstNode].name
    };
  }

  /**
   * 応力比 (stress / yieldStress) を RGB カラーに変換
   * 0.0〜0.3: Blue -> Cyan (完全安全域)
   * 0.3〜0.7: Cyan -> Green -> Yellow (通常負荷〜高負荷)
   * 0.7〜1.0: Yellow -> Orange -> Red (降伏直前〜降伏)
   * 1.0〜1.5+: Magenta -> Bright Purple (塑性変形・危険・破壊)
   */
  static getStressColor(ratio) {
    let r = 0, g = 0, b = 0;
    if (ratio <= 0.25) {
      const t = ratio / 0.25;
      r = 0.05;
      g = 0.2 + 0.6 * t;
      b = 0.8 + 0.2 * (1 - t);
    } else if (ratio <= 0.6) {
      const t = (ratio - 0.25) / 0.35;
      r = 0.1 + 0.7 * t;
      g = 0.8 + 0.15 * t;
      b = 0.9 * (1 - t);
    } else if (ratio <= 0.95) {
      const t = (ratio - 0.6) / 0.35;
      r = 0.85 + 0.15 * t;
      g = 0.9 * (1 - t * 0.7);
      b = 0.05;
    } else if (ratio <= 1.25) {
      const t = (ratio - 0.95) / 0.3;
      r = 1.0;
      g = 0.25 * (1 - t);
      b = 0.3 * t;
    } else {
      const t = Math.min(1.0, (ratio - 1.25) / 0.5);
      r = 0.8 + 0.2 * t;
      g = 0.05;
      b = 0.8 + 0.2 * t;
    }
    return { r, g, b };
  }
}