/**
 * simulator.js - 鉄道自動連結器（柴田式/並形）3Dマルチフィジックス・シミュレータ
 * 3D機構モデリング、剛体・緩衝器連成運動学、FEM応力解析、材料S-S曲線非線形破壊
 */

// ============================================================================
// 1. 材料物性・S-S曲線（応力-ひずみ線図）モデル
// ============================================================================
const MATERIALS = {
  sc480: {
    name: 'JIS SC480 炭素鋼鋳鋼 (標準)',
    youngModulus: 206e9,      // Pa
    yieldStress: 275e6,       // Pa (275 MPa)
    ultimateStress: 480e6,    // Pa (480 MPa)
    fractureStrain: 0.22,     // 22% 伸び
    density: 7850,
    hardeningExponent: 6.5,
    shearStrength: 320e6,
    compressiveLimit: 550e6
  },
  scw480: {
    name: 'JIS SCW480 溶接構造用鋳鋼',
    youngModulus: 206e9,
    yieldStress: 280e6,       // Pa (280 MPa)
    ultimateStress: 480e6,    // Pa (480 MPa)
    fractureStrain: 0.24,     // 24% 伸び
    density: 7850,
    hardeningExponent: 7.0,
    shearStrength: 330e6,
    compressiveLimit: 560e6
  },
  scmn1: {
    name: 'JIS SCMn1 高マンガン鋳鋼 (高靭性)',
    youngModulus: 210e9,
    yieldStress: 350e6,       // Pa (350 MPa)
    ultimateStress: 590e6,    // Pa (590 MPa)
    fractureStrain: 0.30,     // 30% 伸び
    density: 7890,
    hardeningExponent: 8.5,
    shearStrength: 410e6,
    compressiveLimit: 750e6
  },
  aarGradeE: {
    name: 'AAR Grade E 高張力鋳鋼 (強化型)',
    youngModulus: 210e9,
    yieldStress: 690e6,       // Pa (690 MPa)
    ultimateStress: 830e6,    // Pa (830 MPa)
    fractureStrain: 0.16,
    density: 7850,
    hardeningExponent: 8.0,
    shearStrength: 520e6,
    compressiveLimit: 950e6
  },
  specialAlloy: {
    name: 'Ni-Cr-Mo 低合金高靭性鋳鋼',
    youngModulus: 208e9,
    yieldStress: 780e6,       // Pa (780 MPa)
    ultimateStress: 980e6,    // Pa (980 MPa)
    fractureStrain: 0.18,
    density: 7870,
    hardeningExponent: 9.0,
    shearStrength: 600e6,
    compressiveLimit: 1100e6
  }
};

class MaterialEngine {
  constructor(key = 'sc480') {
    this.currentKey = 'sc480';
    this.mat = MATERIALS.sc480;
    this.setMaterial(key);
    this.resetState();
  }

  setMaterial(key) {
    if (!key) return;
    const lower = key.toLowerCase();
    const resolvedKey = MATERIALS[key] ? key : (MATERIALS[lower] ? lower : null);
    if (resolvedKey && MATERIALS[resolvedKey]) {
      this.currentKey = resolvedKey;
      this.mat = MATERIALS[resolvedKey];
      this.resetState();
    }
  }

  reset() {
    this.resetState();
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

  computeStrain(stressPa) {
    const s = Math.abs(stressPa);
    const E = this.mat.youngModulus;
    const sy = this.mat.yieldStress;
    const n = this.mat.hardeningExponent;
    const elastic = s / E;
    const plastic = (s > sy) ? 0.002 * Math.pow(s / sy, n) : 0;
    return elastic + plastic;
  }

  update(vonMisesStressPa, normalStressPa = 0, shearStressPa = 0) {
    if (this.isFractured) {
      return {
        stress: this.currentStress,
        strain: this.currentStrain,
        plasticStrain: this.plasticStrain,
        isYielded: true,
        isFractured: true,
        failureMode: this.failureMode,
        safetyFactor: 0.0
      };
    }

    this.currentStress = vonMisesStressPa;
    if (this.currentStress > this.peakStress) {
      this.peakStress = this.currentStress;
    }

    const sy = this.mat.yieldStress;
    const su = this.mat.ultimateStress;
    const ef = this.mat.fractureStrain;
    const E = this.mat.youngModulus;

    this.currentStrain = this.computeStrain(this.currentStress) + this.plasticStrain;

    if (this.currentStress >= sy) {
      this.isYielded = true;
      const deltaPlastic = Math.max(0, (this.currentStress - sy) / (E * 0.08) * 0.0005);
      this.plasticStrain += deltaPlastic;
    }

    if (this.currentStrain >= ef || this.currentStress >= su * 1.05) {
      this.isFractured = true;
      this.failureMode = '引張・曲げ破断 (Tension Fracture)';
    } else if (normalStressPa < 0 && Math.abs(normalStressPa) >= this.mat.compressiveLimit) {
      this.isFractured = true;
      this.failureMode = '圧縮座屈・圧潰破壊 (Compressive Crush)';
    } else if (Math.abs(shearStressPa) >= this.mat.shearStrength) {
      this.isFractured = true;
      this.failureMode = 'ピンせん断破壊 (Pin Shear Failure)';
    }

    const sf = this.currentStress > 1e3 ? (sy / this.currentStress) : 99.9;
    return {
      stress: this.currentStress,
      strain: this.currentStrain,
      plasticStrain: this.plasticStrain,
      isYielded: this.isYielded,
      isFractured: this.isFractured,
      failureMode: this.failureMode,
      safetyFactor: sf
    };
  }

  getCurveData(points = 80) {
    const data = [];
    const sy = this.mat.yieldStress / 1e6;
    const su = this.mat.ultimateStress / 1e6;
    const ef = this.mat.fractureStrain;
    const E = this.mat.youngModulus / 1e6;

    const yieldStrain = (sy / E) + 0.002;
    const maxStrain = ef * 1.08;

    for (let i = 0; i <= points; i++) {
      const strain = (i / points) * maxStrain;
      let stress = 0;
      if (strain <= yieldStrain) {
        stress = strain * E;
      } else if (strain <= ef * 0.75) {
        const plasticPart = strain - (sy / E);
        stress = sy + (su - sy) * Math.pow(plasticPart / (ef * 0.75 - sy / E), 0.45);
      } else if (strain <= ef) {
        const neckRatio = (strain - ef * 0.75) / (ef * 0.25);
        stress = su - (su * 0.12) * neckRatio;
      } else {
        stress = 0;
      }
      data.push({ x: Number(strain.toFixed(5)), y: Number(stress.toFixed(1)) });
    }

    return {
      curve: data,
      yieldPoint: { x: Number(yieldStrain.toFixed(5)), y: sy },
      ultimatePoint: { x: Number((ef * 0.75).toFixed(5)), y: su },
      fracturePoint: { x: Number(ef.toFixed(5)), y: Number((su * 0.88).toFixed(1)) }
    };
  }
}

// ============================================================================
// 2. リアルタイム有限要素・応力集中 (FEM) 解析エンジン
// ============================================================================
class FEMEngine {
  constructor() {
    this.nodes = {
      knuckleNose: { name: 'ナックル先端部', stress: 0, maxStress: 0 },
      knuckleNeck: { name: 'ナックル付け根 (応力集中部)', stress: 0, maxStress: 0 },
      knucklePin:  { name: 'ナックル回転ピン (せん断部)', stress: 0, maxStress: 0 },
      lockBlock:   { name: '錠 (Lock Block) 受面', stress: 0, maxStress: 0 },
      guardArm:    { name: '本体顎部 (ガードアーム)', stress: 0, maxStress: 0 },
      shank:       { name: '連結器胴体シャンク', stress: 0, maxStress: 0 }
    };

    this.sectionProps = {
      knuckleNeck: { area: 0.0165, zMod: 0.00072, kt: 2.85, type: 'bending_tension' },
      knucklePin:  { area: 0.0048, zMod: 0.00008, kt: 1.65, type: 'pure_shear' },
      knuckleNose: { area: 0.0220, zMod: 0.00095, kt: 1.45, type: 'contact_hertz' },
      lockBlock:   { area: 0.0120, zMod: 0.00045, kt: 2.10, type: 'bearing_shear' },
      guardArm:    { area: 0.0250, zMod: 0.00120, kt: 1.95, type: 'contact_bending' },
      shank:       { area: 0.0280, zMod: 0.00160, kt: 1.25, type: 'axial_bending' }
    };

    this.maxGlobalStress = 0;
    this.peakGlobalStress = 0;
    this.criticalNode = 'knuckleNeck';
  }

  reset() {
    this.posA = -0.90;
    this.velA = 0.0;
    this.posB = 0.0;
    this.velB = 0.0;
    this.notchPower = 0;
    this.notchBrake = 0;
    this.reverser = 1;
    this.state = COUPLER_STATES.DISCONNECTED;
    this.knuckleAngleA = 0.0; // 閉鎖・施錠待機位置 (0°: 開放てこ操作で開く)
    this.knuckleAngleB = 60.0; // 相手車は開放待機位置 (60°)
    this.lockHeightA = 0.0;
    this.lockHeightB = 0.0;
    this.uncoupleLever = 0.0;
    this.draftStrokeA = 0.0;
    this.draftStrokeB = 0.0;
    this.currentSlackX = 0.0;
    this.contactForceX = 0.0;
    this.contactForceY = 0.0;
    this.contactForceZ = 0.0;
    this.speedKmh = 0.0;
    this.lastEvent = '初期状態: 相対待機中（自車閉鎖0°・相手車開放60°）';
  }

  compute(Fx, Fy, Fz, yieldStress = 275e6) {
    const absFx = Math.abs(Fx);
    const absFy = Math.abs(Fy);
    const absFz = Math.abs(Fz);
    const arm = 0.28;
    const My = absFz * arm;
    const Mz = absFy * arm;

    let maxStress = 0;
    let worstNode = 'knuckleNeck';

    for (const [key, prop] of Object.entries(this.sectionProps)) {
      let sigmaMises = 0;
      if (prop.type === 'bending_tension') {
        const sAxial = absFx / prop.area;
        const sBending = (My + Mz) / prop.zMod;
        const totalNormal = (sAxial + sBending) * prop.kt;
        const tau = (absFy + absFz) / (prop.area * 0.7);
        sigmaMises = Math.sqrt(totalNormal * totalNormal + 3 * tau * tau);
      } else if (prop.type === 'pure_shear') {
        const tau = (absFx * 0.6 + Math.sqrt(Fy * Fy + Fz * Fz)) / prop.area * prop.kt;
        sigmaMises = Math.sqrt(3 * tau * tau);
      } else if (prop.type === 'contact_hertz') {
        sigmaMises = Math.min(
          Math.sqrt((absFx + 100) / prop.area * 2.1e11 * 0.00015) * prop.kt,
          (absFx / prop.area) * prop.kt * 2.2
        );
      } else if (prop.type === 'bearing_shear') {
        sigmaMises = (absFx * 0.55 / prop.area) * prop.kt * 1.15;
      } else if (prop.type === 'contact_bending') {
        sigmaMises = ((My * 1.4) / prop.zMod) * prop.kt + (absFx * 0.2) / prop.area;
      } else if (prop.type === 'axial_bending') {
        sigmaMises = (absFx / prop.area) * prop.kt + ((My * 0.5 + Mz * 0.5) / prop.zMod);
      }

      sigmaMises = Math.max(0.1e6, sigmaMises);
      this.nodes[key].stress = sigmaMises;
      if (sigmaMises > this.nodes[key].maxStress) {
        this.nodes[key].maxStress = sigmaMises;
      }

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

  static getStressColor(ratio) {
    let r = 0, g = 0, b = 0;
    if (ratio <= 0.25) {
      const t = ratio / 0.25;
      r = 0.05; g = 0.2 + 0.6 * t; b = 0.8 + 0.2 * (1 - t);
    } else if (ratio <= 0.6) {
      const t = (ratio - 0.25) / 0.35;
      r = 0.1 + 0.7 * t; g = 0.8 + 0.15 * t; b = 0.9 * (1 - t);
    } else if (ratio <= 0.95) {
      const t = (ratio - 0.6) / 0.35;
      r = 0.85 + 0.15 * t; g = 0.9 * (1 - t * 0.7); b = 0.05;
    } else if (ratio <= 1.25) {
      const t = (ratio - 0.95) / 0.3;
      r = 1.0; g = 0.25 * (1 - t); b = 0.3 * t;
    } else {
      const t = Math.min(1.0, (ratio - 1.25) / 0.5);
      r = 0.8 + 0.2 * t; g = 0.05; b = 0.8 + 0.2 * t;
    }
    return { r, g, b };
  }
}

// ============================================================================
// 3. マルチボディ・ダイナミクス & 緩衝器・振動・機構物理エンジン
// ============================================================================
const COUPLER_STATES = {
  DISCONNECTED: 'DISCONNECTED',
  APPROACHING:  'APPROACHING',
  ENGAGING:     'ENGAGING',
  LOCKED:       'LOCKED',
  UNLOCKED:     'UNLOCKED',
  FAILED:       'FAILED'
};

class CouplerPhysics {
  constructor() {
    this.massCarA = 36000;
    this.massCarB = 40000;
    this.posA = -0.90;
    this.velA = 0.0;
    this.posB = 0.0;
    this.velB = 0.0;
    this.bBrakeCarB = true;

    this.notchPower = 0;
    this.notchBrake = 0;
    this.reverser = 1;

    this.state = COUPLER_STATES.DISCONNECTED;
    this.knuckleAngleA = 60.0; // どちらの連結器も開放状態 (てこを引いた状態)
    this.knuckleAngleB = 60.0; // どちらの連結器も開放状態 (てこを引いた状態)
    this.lockHeightA = 1.0;
    this.lockHeightB = 1.0;
    this.uncoupleLever = 1.0;
    this.uncoupleLeverB = 1.0;

    // 基準間隔: ナックル内面剛体接触位置 (適正締結距離 0.550m)
    this.coupledDist = 0.550;
    // ナックル先端が相手ナックルの内側面に初接触する距離 (0.630m)
    this.contactStartDist = 0.630;

    // 開放てこ・自動閉塞フラグ
    this.isKnuckleFreeA = true;
    this.isKnuckleFreeB = true;
    this.autoCloseTimerA = 0.0;
    this.autoCloseTimerB = 0.0;

    // 緩衝器（ドラフトギア）パラメータ
    this.draftStrokeA = 0.0;
    this.draftStrokeB = 0.0;
    this.draftMaxStroke = 0.082; // 最大ストローク 82mm
    this.kDraftMain = 6.2e6;      // コイルばね定数 (N/m)
    this.cDraft = 1.4e5;          // 減衰係数 (N*s/m)
    this.kDraftBottom = 9.8e7;    // 底付ばね定数

    this.slackX = 0.008;          // 遊間 (8mm)
    this.currentSlackX = 0.0;

    this.contactForceX = 0.0;
    this.contactForceY = 0.0;
    this.contactForceZ = 0.0;

    this.vibrationTime = 0.0;
    this.vibrationLevel = 1.0;
    this.vibA = { y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
    this.vibB = { y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
    this.speedKmh = 0.0;

    this.lastEvent = '初期状態: 双方開放待機（てこ引上・ナックル開放60°）';
  }

  reset() {
    this.posA = -0.90;
    this.velA = 0.0;
    this.posB = 0.0;
    this.velB = 0.0;
    this.notchPower = 0;
    this.notchBrake = 0;
    this.reverser = 1;
    this.state = COUPLER_STATES.DISCONNECTED;
    this.knuckleAngleA = 60.0; // どちらの連結器も開放状態 (60°)
    this.knuckleAngleB = 60.0; // どちらの連結器も開放状態 (60°)
    this.lockHeightA = 1.0;    // 錠引き上げ状態
    this.lockHeightB = 1.0;
    this.uncoupleLever = 1.0;  // てこを引き上げた状態
    this.uncoupleLeverB = 1.0;
    this.isKnuckleFreeA = true;
    this.isKnuckleFreeB = true;
    this.autoCloseTimerA = 0.0;
    this.autoCloseTimerB = 0.0;
    this.draftStrokeA = 0.0;
    this.draftStrokeB = 0.0;
    this.currentSlackX = 0.0;
    this.contactForceX = 0.0;
    this.contactForceY = 0.0;
    this.contactForceZ = 0.0;
    this.speedKmh = 0.0;
    this.lastEvent = 'リセット: 双方開放待機（てこ引上・ナックル開放60°）';
  }

  updateVibration(dt) {
    this.vibrationTime += dt;
    const t = this.vibrationTime;
    const s = this.vibrationLevel;
    const v = Math.abs(this.velA) + 0.2;

    const f1A = Math.sin(t * 2 * Math.PI * 0.8) * 0.003;
    const f2A = Math.sin(t * 2 * Math.PI * 4.2 + 1.2) * 0.0018;
    this.vibA.y = (f1A + f2A) * s * Math.min(2.0, v * 0.8);
    this.vibA.z = (f1A * 1.2 + f2A * 0.9) * s * Math.min(2.0, v * 0.8);

    const f1B = Math.sin(t * 2 * Math.PI * 0.8 + 1.7) * 0.002;
    this.vibB.y = f1B * s;
    this.vibB.z = f1B * 1.1 * s;
  }

  setUncoupleLever(val) {
    this.uncoupleLever = Math.max(0, Math.min(1, val));
    this.uncoupleLeverB = this.uncoupleLever; // 左右同期
    this.lockHeightA = this.uncoupleLever;
    this.lockHeightB = this.uncoupleLever; // 左右同期

    const relDist = this.posB - this.posA;
    const isCoupledRange = relDist <= this.contactStartDist;

    if (this.uncoupleLever > 0.05) {
      this.isKnuckleFreeA = true;
      this.isKnuckleFreeB = true;

      if (isCoupledRange) {
        // 【締結・接触状態での開放てこ操作】
        // 相手ナックルとの遊間拘束限界(最大8.5°)まで開いて解錠待機
        this.state = COUPLER_STATES.UNLOCKED;
        this.knuckleAngleA = Math.min(8.5, this.uncoupleLever * 8.5);
        this.knuckleAngleB = Math.min(3.0, this.uncoupleLever * 3.0);
        this.lastEvent = `締結中てこ操作: 左右錠同期引き上げ解錠 (遊間接触 A:${this.knuckleAngleA.toFixed(1)}° / B:${this.knuckleAngleB.toFixed(1)}°)`;
      } else {
        // 【未締結状態での開放てこ操作】
        // DISCONNECTED状態を維持し、錠が引き上げられ、左右ナックル開き機が同期して全開(60°)へ動く
        this.state = COUPLER_STATES.DISCONNECTED;
        this.knuckleAngleA = 60.0 * this.uncoupleLever;
        this.knuckleAngleB = 60.0 * this.uncoupleLever;
        this.lastEvent = `未締結てこ操作: 左右ナックル開き機同期連動・開口 (${this.knuckleAngleA.toFixed(1)}°)`;
      }
    } else {
      // てこを下ろした時
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      if (this.state === COUPLER_STATES.UNLOCKED) {
        if (relDist <= this.coupledDist + 0.015) {
          this.state = COUPLER_STATES.LOCKED;
          this.knuckleAngleA = 0.0;
          this.knuckleAngleB = 0.0;
          this.isKnuckleFreeA = false;
          this.isKnuckleFreeB = false;
          this.lastEvent = '施錠復帰: 連結状態ロック (0.0°)';
        } else {
          this.state = COUPLER_STATES.DISCONNECTED;
          this.isKnuckleFreeA = false;
          this.isKnuckleFreeB = false;
          this.lastEvent = '開放待機: ナックル開放保持（錠控え作用）';
        }
      } else if (this.state === COUPLER_STATES.DISCONNECTED) {
        this.isKnuckleFreeA = false;
        this.isKnuckleFreeB = false;
        // 未締結時：てこを下ろしても、ナックルは開いたまま保持される（錠控え作用）
        if (this.knuckleAngleA > 5.0 || this.knuckleAngleB > 5.0) {
          this.lastEvent = '開放待機: 左右ナックル開放保持（錠控え作用）';
        }
      }
    }
  }

  closeKnuckleA() {
    // 手押しでナックルを閉鎖位置(0°)へ押し込む (左右同期)
    const relDist = this.posB - this.posA;
    if (relDist <= this.coupledDist + 0.015) {
      this.knuckleAngleA = 0.0;
      this.knuckleAngleB = 0.0;
      this.state = COUPLER_STATES.LOCKED;
      this.uncoupleLever = 0.0;
      this.uncoupleLeverB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      this.lastEvent = '手押し操作: 左右ナックル完全閉鎖・施錠完了 (0.0°)';
    } else {
      this.knuckleAngleA = 0.0;
      this.knuckleAngleB = 0.0;
      this.uncoupleLever = 0.0;
      this.uncoupleLeverB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      this.isKnuckleFreeA = false;
      this.isKnuckleFreeB = false;
      this.state = COUPLER_STATES.DISCONNECTED;
      this.lastEvent = '手押し操作: 左右ナックル閉鎖・錠落下施錠 (0.0°)';
    }
  }

  loadScenario(name) {
    this.reset();
    if (name === 'SLOW_COUPLING') {
      this.posA = -0.95;
      this.velA = 1.2 / 3.6;
      this.notchPower = 1;
      this.notchBrake = 0;
      this.reverser = 1;
      this.state = COUPLER_STATES.APPROACHING;
      this.uncoupleLever = 0.0;
      this.uncoupleLeverB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      this.isKnuckleFreeA = true;
      this.isKnuckleFreeB = true;
      this.knuckleAngleA = 60.0;
      this.knuckleAngleB = 60.0;
      this.lastEvent = '微速連結シナリオ開始 (1.2 km/h)';
    } else if (name === 'HARD_CRASH') {
      this.posA = -1.25;
      this.velA = 22.0 / 3.6;
      this.notchPower = 5;
      this.notchBrake = 0;
      this.reverser = 1;
      this.state = COUPLER_STATES.APPROACHING;
      this.uncoupleLever = 0.0;
      this.uncoupleLeverB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      this.isKnuckleFreeA = true;
      this.isKnuckleFreeB = true;
      this.knuckleAngleA = 60.0;
      this.knuckleAngleB = 60.0;
      this.lastEvent = '過大衝突シナリオ開始 (22.0 km/h)';
    } else if (name === 'UNCOUPLING') {
      // 開放てこ解結シナリオ: 開放てこを引き上げ、微速後退で自動引き離し
      this.posA = -this.coupledDist;
      this.notchPower = 1;
      this.notchBrake = 0;
      this.reverser = -1; // 後進
      this.velA = -0.45 / 3.6; // 微速後退 -0.45 km/h でキビキビとしたリアルなすりあい解結動作
      this.setUncoupleLever(1.0);
      this.lastEvent = '開放てこ解結シナリオ: 錠引き上げ ＆ 微速後退引き離し開始';
    }
  }

  applyEmergencyBrake() {
    this.notchPower = 0;
    this.notchBrake = 8;
  }

  step(dt, materialEngine = null) {
    this.updateVibration(dt);

    // 1. 力行牽引力 (P1〜P5)
    let tractiveForce = 0;
    if (this.reverser !== 0 && this.notchPower > 0) {
      tractiveForce = this.notchPower * 7500 * this.reverser;
    }

    // 2. ブレーキ力 (B1〜B8 非常)
    let brakeForce = 0;
    if (this.notchBrake > 0) {
      const bCoeff = (this.notchBrake >= 8) ? 85000 : (this.notchBrake * 9000);
      if (Math.abs(this.velA) > 0.005) {
        brakeForce = bCoeff * Math.sign(this.velA);
      } else if (tractiveForce === 0) {
        this.velA = 0.0;
      }
    }

    // 3. 走行抵抗（転がり抵抗・空気抵抗）
    const rollingRes = Math.abs(this.velA) > 0.005 ? 1200 * Math.sign(this.velA) : 0;
    const airRes = 120 * this.velA * Math.abs(this.velA);
    const relDist = this.posB - this.posA;

    let forceX = 0;

    // 4. 連結器状態遷移 ＆ 接触・緩衝力学（剛体非貫通拘束）
    if (this.state === COUPLER_STATES.DISCONNECTED) {
      forceX = 0.0;
      this.draftStrokeA = 0.0;
      this.draftStrokeB = 0.0;

      if (relDist <= this.contactStartDist + 0.05) {
        this.state = COUPLER_STATES.APPROACHING;
        this.lastEvent = '接近中: 開放状態維持 (ナックル非接触)';
      }
    } else if (this.state === COUPLER_STATES.APPROACHING) {
      forceX = 0.0;
      this.draftStrokeA = 0.0;
      this.draftStrokeB = 0.0;

      if (relDist <= this.contactStartDist) {
        // 先端が相手の内側に衝突した瞬間に ENGAGING 開始
        this.state = COUPLER_STATES.ENGAGING;
        this.lastEvent = '先端衝突開始: ナックル内側に先端が衝突・回転開始';
      } else if (relDist > this.contactStartDist + 0.15) {
        this.state = COUPLER_STATES.DISCONNECTED;
      }
    } else if (this.state === COUPLER_STATES.ENGAGING) {
      // 剛体接触幾何学: ナックル先端が相手ナックル内側面に接触し、内側面を滑りながら押し込まれて回転
      const span = this.contactStartDist - this.coupledDist; // 0.630 - 0.550 = 0.080m
      const engageRatio = Math.max(0.0, Math.min(1.0, (this.contactStartDist - relDist) / Math.max(0.005, span)));

      // 剛体幾何学による正確な非干渉角度曲線 (めり込みを100%防止)
      const smoothCam = engageRatio * engageRatio * (3.0 - 2.0 * engageRatio);
      this.knuckleAngleA = 60.0 * (1.0 - smoothCam);
      this.knuckleAngleB = 60.0 * (1.0 - smoothCam);

      // 完全閉塞(0°)直前まで錠が浮いており、閉じた瞬間にストンと落下
      if (engageRatio < 0.96) {
        this.lockHeightA = 0.75 * (1.0 - engageRatio * 0.25);
        this.lockHeightB = 0.75 * (1.0 - engageRatio * 0.25);
        this.lastEvent = `ナックル先端が内側面を摺動回転中 (${this.knuckleAngleA.toFixed(1)}°)`;
      } else {
        this.lockHeightA = 0.0;
        this.lockHeightB = 0.0;
      }

      // ナックル先端と相手内側面のこすれ抵抗
      const frictionF = Math.abs(this.velA) > 0.002 ? 4000 * Math.sign(this.velA) : 0;
      forceX = -smoothCam * 20000 - frictionF;

      if (engageRatio >= 0.98 || relDist <= this.coupledDist + 0.002) {
        this.knuckleAngleA = 0.0;
        this.knuckleAngleB = 0.0;
        this.lockHeightA = 0.0;
        this.lockHeightB = 0.0;
        this.uncoupleLever = 0.0;  // てこ接触によりロック位置へ復帰
        this.uncoupleLeverB = 0.0; // 接続側車両Bのてこも同期ロック位置復帰
        this.isKnuckleFreeA = false;
        this.isKnuckleFreeB = false;
        this.state = COUPLER_STATES.LOCKED;
        const spd = Math.abs(this.velA * 3.6).toFixed(1);
        this.lastEvent = `締結完了: 内側面相互勘合・錠落下固定 (${spd} km/h)`;
        if (typeof document !== 'undefined') {
          const sliderLever = document.getElementById('sliderLever');
          if (sliderLever) sliderLever.value = '0';
          const valEl = document.getElementById('leverVal');
          if (valEl) valEl.textContent = '施錠 (下)';
        }
      } else if (this.velA < -0.05 && relDist > this.contactStartDist + 0.03) {
        this.state = COUPLER_STATES.DISCONNECTED;
        this.lastEvent = '離反: 接触解除';
      }
    } else if (this.state === COUPLER_STATES.LOCKED) {
      // 締結状態: ナックル角度は完全に0.0°で剛体密着 (相互めり込みゼロ)
      this.knuckleAngleA = 0.0;
      this.knuckleAngleB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;
      this.uncoupleLever = 0.0;
      this.uncoupleLeverB = 0.0;
      this.isKnuckleFreeA = false;
      this.isKnuckleFreeB = false;

      const penetration = this.coupledDist - relDist;
      const relVel = this.velA - this.velB;

      if (Math.abs(penetration) <= this.slackX) {
        this.currentSlackX = penetration;
        forceX = (Math.abs(this.velA) > 0.001 || Math.abs(tractiveForce) > 0.001)
          ? (-penetration * 4.0e4 - relVel * 1500) : 0.0;
        this.draftStrokeA = 0.0;
        this.draftStrokeB = 0.0;
      } else {
        const netDef = penetration > 0 ? (penetration - this.slackX) : (penetration + this.slackX);
        const absDef = Math.min(0.082, Math.abs(netDef));
        this.draftStrokeA = Math.max(-0.02, Math.min(this.draftMaxStroke, absDef * 0.5));
        this.draftStrokeB = Math.max(-0.02, Math.min(this.draftMaxStroke, absDef * 0.5));

        let springF = this.kDraftMain * Math.sign(netDef) * absDef + this.cDraft * relVel;
        springF = Math.max(-1.0e6, Math.min(1.0e6, springF));
        forceX = -springF;
      }
    } else if (this.state === COUPLER_STATES.UNLOCKED) {
      // 【ユーザー指定仕様：締結状態での開放てこ操作の物理挙動】
      const penetration = this.coupledDist - relDist;
      const relVel = this.velA - this.velB;

      // 1. 前進状態・押圧方向（penetration > -this.slackX）
      // ナックルや車両を絶対に透過せず、相手ナックルに当たりながら接触し、0°に戻り再締結ロック
      if (penetration > -this.slackX) {
        const netDef = Math.max(0.0, penetration - this.slackX);
        const absDef = Math.min(0.082, netDef);
        this.draftStrokeA = Math.max(0.0, Math.min(this.draftMaxStroke, absDef * 0.5));
        this.draftStrokeB = Math.max(0.0, Math.min(this.draftMaxStroke, absDef * 0.5));

        // 剛体反力 ＆ 緩衝器弾性反力（前進透過を100%完全防止）
        let springF = this.kDraftMain * absDef + this.cDraft * Math.max(0, relVel);
        if (penetration > 0) {
          springF += penetration * 2.5e7; // 剛体非貫通の巨大弾性反力
        }
        forceX = -springF;

        // 前進力行または前進速度がある場合：相手ナックルに押されて双方0°に戻り再締結ロック
        if (this.velA > 0.0005 || tractiveForce > 0 || penetration > 0.0005) {
          // 相手ナックルに押圧されて双方が0°へ急速に戻る
          this.knuckleAngleA = Math.max(0.0, this.knuckleAngleA - 35.0 * dt);
          this.knuckleAngleB = Math.max(0.0, this.knuckleAngleB - 35.0 * dt);
          if (this.knuckleAngleA <= 0.2) {
            this.knuckleAngleA = 0.0;
            this.knuckleAngleB = 0.0;
            this.lockHeightA = 0.0;
            this.lockHeightB = 0.0;
            this.uncoupleLever = 0.0;
            this.uncoupleLeverB = 0.0;
            this.state = COUPLER_STATES.LOCKED;
            this.lastEvent = '前進押圧接触: 双方ナックル押圧0°復帰・再締結ロック完了';
            if (typeof document !== 'undefined') {
              const sliderLever = document.getElementById('sliderLever');
              if (sliderLever) sliderLever.value = '0';
              const valEl = document.getElementById('leverVal');
              if (valEl) valEl.textContent = '施錠 (下)';
            }
          } else {
            this.lastEvent = `前進押圧中: 双方ナックル接触0°復帰中 (A:${this.knuckleAngleA.toFixed(1)}° / B:${this.knuckleAngleB.toFixed(1)}°)`;
          }
        } else {
          // 静止待機中: ナックルAはナックルピンを軸に相手接触限界(最大8.5°)まで開く
          // ナックルBも接触力を受けてナックルピンを軸に遊間内(最大3.0°)で接触微動
          this.lockHeightA = Math.max(0.6, this.uncoupleLever);
          this.lockHeightB = this.lockHeightA;
          this.knuckleAngleA = Math.min(8.5, this.uncoupleLever * 8.5);
          this.knuckleAngleB = Math.min(3.0, this.uncoupleLever * 3.0);
          this.lastEvent = `締結中てこ待機: 双方ナックル接触限界 (A:${this.knuckleAngleA.toFixed(1)}° / B:${this.knuckleAngleB.toFixed(1)}°)`;
        }
      } else {
        // 2. 引き離しの方向 (後退・解結離脱方向: relDist > this.coupledDist)
        this.draftStrokeA = 0.0;
        this.draftStrokeB = 0.0;

        const dCoupled = this.coupledDist; // 0.550m (締結・引き離し開始位置)
        const dRelease = 0.720;            // 完全離脱クリア位置 (約17cm移動)

        if (relDist < dRelease) {
          // 引き離し中: 相手ナックル内側・先端に押されて双方が外側へスムーズ＆ダイナミックに大きく開口 (0° -> 60.0°)
          const t = Math.max(0.0, Math.min(1.0, (relDist - dCoupled) / Math.max(0.01, dRelease - dCoupled)));
          // S字曲線でガバッと力強く開口
          const openProgress = t * t * (3.0 - 2.0 * t);
          const targetAngle = 60.0 * openProgress;
          this.knuckleAngleA = Math.max(this.knuckleAngleA, targetAngle);
          this.knuckleAngleB = Math.max(this.knuckleAngleB, targetAngle);
          this.lockHeightA = Math.max(0.9, this.uncoupleLever);
          this.lockHeightB = this.lockHeightA;
          this.isKnuckleFreeA = true;
          this.isKnuckleFreeB = true;

          this.lastEvent = `解結引き離し中: 双方ナックル相手内面擦れ合い・大きく開口中 (A:${this.knuckleAngleA.toFixed(1)}° / B:${this.knuckleAngleB.toFixed(1)}°)`;
          forceX = (relVel < -0.01) ? 2200 : 0; // すりあい摩擦抵抗
        } else {
          // フェーズ3: 完全離脱完了！てこを引いた開放状態を維持（双方が開放待機位置 60.0°）
          this.knuckleAngleA = 60.0;
          this.knuckleAngleB = 60.0;
          this.lockHeightA = this.uncoupleLever;
          this.lockHeightB = this.uncoupleLever;
          this.isKnuckleFreeA = true;
          this.isKnuckleFreeB = true;
          this.state = COUPLER_STATES.DISCONNECTED;
          forceX = 0.0;
          this.lastEvent = '解結完了: 双方ナックル完全離脱・開放待機位置保持 (60.0°)';
        }
      }
    }
    // 5. 車両A 運動方程式
    const netForceA = tractiveForce - brakeForce - rollingRes - airRes + forceX;
    const accelA = netForceA / this.massCarA;
    this.velA += accelA * dt;

    // 静止安定化（力行していない時、または中立の時はスムーズに減速・停止）
    if (this.reverser === 0 || this.notchPower === 0) {
      if (this.notchBrake > 0 || Math.abs(this.velA) < 0.008 || (this.reverser === 0 && Math.abs(this.velA) < 0.03)) {
        this.velA = 0.0;
      }
    }
    // 力行が働いている時は微速閾値でキャンセルされない
    if (this.state === COUPLER_STATES.LOCKED && this.notchPower === 0 && Math.abs(this.velA) < 0.001) {
      this.velA = 0.0;
      this.posA = -this.coupledDist;
    }
    this.posA += this.velA * dt;
    if (this.posA < -2.2) {
      this.posA = -2.2;
      if (this.velA < 0) this.velA = 0.0;
    }

    // 6. 車両B 運動方程式（被牽引車・留置ブレーキ）
    let netForceB = -forceX;
    if (this.bBrakeCarB) {
      const bResB = Math.abs(this.velB) > 0.005 ? 85000 * Math.sign(this.velB) : 0;
      netForceB -= bResB;
    }
    const accelB = netForceB / this.massCarB;
    this.velB += accelB * dt;
    if (Math.abs(this.velB) < 0.002 && Math.abs(netForceB) < 80000) {
      this.velB = 0.0;
    }
    this.posB += this.velB * dt;

    this.contactForceX = Math.abs(forceX);
    this.contactForceY = (this.vibA.y - this.vibB.y) * 1.5e5;
    this.contactForceZ = (this.vibA.z - this.vibB.z) * 1.8e5;
    this.speedKmh = Math.abs(this.velA * 3.6);
    return this;
  }
}

class Coupler3D {
  constructor(scene) {
    this.scene = scene;
    this.femMode = false;
    this.isBroken = false;

    // マテリアル定義
    this.matBody = new THREE.MeshStandardMaterial({
      color: 0x5a6878,
      metalness: 0.70,
      roughness: 0.35
    });

    this.matKnuckle = new THREE.MeshStandardMaterial({
      color: 0xb58c5a, // 鋳鋼ブロンズゴールド
      metalness: 0.65,
      roughness: 0.35
    });

    this.matPin = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25
    });

    this.matCap = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.80,
      roughness: 0.30
    });

    this.matLock = new THREE.MeshStandardMaterial({
      color: 0x2b3440,
      metalness: 0.85,
      roughness: 0.25
    });

    this.matThrower = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.75,
      roughness: 0.30
    });

    this.matLever = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // 実機注意色: 警告イエロー
      metalness: 0.50,
      roughness: 0.30
    });

    this.matChain = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9, // 鋼製光沢リンク（高張力シルバー鋼）で明瞭に視認
      metalness: 0.85,
      roughness: 0.20
    });

    this.matFrame = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.70,
      roughness: 0.50
    });

    this.matSpring = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // 緩衝器コイルスプリング（鮮明なブルー）
      metalness: 0.88,
      roughness: 0.18
    });

    this.matRadialSpring = new THREE.MeshStandardMaterial({
      color: 0x0369a1, // 復心ばね
      metalness: 0.80,
      roughness: 0.25
    });

    // 鉄道軌道マテリアル: side: DoubleSide で欠落を完全防止！
    this.matRail = new THREE.MeshStandardMaterial({
      color: 0xa0aec0,
      metalness: 0.90,
      roughness: 0.20,
      side: THREE.DoubleSide
    });

    this.matSleeper = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.15,
      roughness: 0.85
    });

    this.matTiePlate = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.80,
      roughness: 0.40
    });

    this.matFastener = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.30
    });

    this.matBallast = new THREE.MeshStandardMaterial({
      color: 0x242d3d,
      roughness: 0.95,
      metalness: 0.05
    });

    this.stlLoader = typeof THREE.STLLoader !== 'undefined' ? new THREE.STLLoader() : null;

    // 1. JIS 50kgNレール・JR在来線1067mm狭軌・地上高880mm軌道構築
    this.initTrack();

    // 2. 連結器ユニット（車体A & 車体B）の構築
    this.couplerA = this.createCouplerUnit(false);
    this.couplerB = this.createCouplerUnit(true);

    this.scene.add(this.couplerA.root);
    this.scene.add(this.couplerB.root);
  }

  // =========================================================================
  // ユーザー提示の「50kg Nレール」正確断面 Shape & ExtrudeGeometry (完全な面を形成)
  // =========================================================================
  createRailGeometry(length = 26) {
    const shape = new THREE.Shape();
    // 50kgNレール規格断面 (全高 153mm, 底部 127mm, 頭部 65mm, 腹部 15mm)
    const h = 0.153;    // 全高 153mm
    const bw2 = 0.0635; // 底部半幅 63.5mm
    const hw2 = 0.0325; // 頭部半幅 32.5mm
    const ww2 = 0.0075; // 腹部半幅 7.5mm

    shape.moveTo(0, 0); // 底部中心
    shape.lineTo(bw2, 0); // 底部右端
    shape.lineTo(bw2, 0.011); // 底部フランジ端面
    shape.lineTo(ww2 + 0.015, 0.027); // フランジ上面傾斜
    shape.quadraticCurveTo(ww2, 0.040, ww2, 0.075); // 腹部下部フィレット
    shape.lineTo(ww2, 0.105); // 腹部ウェッブ直線
    shape.quadraticCurveTo(ww2, 0.118, hw2, 0.122); // 頭部下顎フィレット
    shape.lineTo(hw2, 0.142); // 頭部右側面
    shape.quadraticCurveTo(hw2, h, 0.015, h); // 頭部右上丸み
    shape.lineTo(0, h); // 踏面頂部

    // 左半分 (厳密に対称反転)
    shape.lineTo(-0.015, h);
    shape.quadraticCurveTo(-hw2, h, -hw2, 0.142);
    shape.lineTo(-hw2, 0.122);
    shape.quadraticCurveTo(-ww2, 0.118, -ww2, 0.105);
    shape.lineTo(-ww2, 0.075);
    shape.quadraticCurveTo(-ww2, 0.040, -(ww2 + 0.015), 0.027);
    shape.lineTo(-bw2, 0.011);
    shape.lineTo(-bw2, 0);
    shape.closePath();

    const extrudeSettings = {
      steps: 16, // 長手方向を16分割して面のねじれ・欠落を完全に解消
      depth: length,
      bevelEnabled: false
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    geo.rotateY(Math.PI / 2); // 長手方向をX軸に
    geo.computeVertexNormals();
    return geo;
  }

  // =========================================================================
  // 線路軌道（地上高880mm・JR狭軌1067mm・50kgNレール・PC枕木・締結金具・道床）
  // =========================================================================
  initTrack() {
    this.trackGroup = new THREE.Group();
    this.trackGroup.name = 'RailwayTrack';

    // 連結器中心線は Y = 0.0m
    // レール上面（踏面）の地上高は連結器中心から厳密に -880mm (-0.880m)
    const topOfRailY = -0.880;
    const railHeight = 0.153;
    const railCenterY = topOfRailY - (railHeight * 0.5); // -0.9565m
    const railBaseY = topOfRailY - railHeight;           // -1.033m

    // 1. バラスト砕石道床
    const ballastGeo = new THREE.BoxGeometry(26, 0.16, 3.20);
    const ballast = new THREE.Mesh(ballastGeo, this.matBallast);
    ballast.position.set(0, railBaseY - 0.16, 0);
    ballast.receiveShadow = true;
    this.trackGroup.add(ballast);

    // 2. JR在来線規格（1067mm狭軌）レール2条
    // 内軌間（Gauge face）が正確に 1.0670m
    // レール頭部半幅 0.0325m -> レール中心 Z = +/- (0.5335 + 0.0325) = +/- 0.5660m
    const railZ = 0.5660;
    const railGeo = this.createRailGeometry(26);

    const railL = new THREE.Mesh(railGeo, this.matRail);
    railL.position.set(0, railCenterY, railZ);
    railL.castShadow = true;
    railL.receiveShadow = true;
    this.trackGroup.add(railL);

    const railR = new THREE.Mesh(railGeo, this.matRail);
    railR.position.set(0, railCenterY, -railZ);
    railR.castShadow = true;
    railR.receiveShadow = true;
    this.trackGroup.add(railR);

    // 3. PCまくらぎ & タイプレート & 締結金具
    const sleeperGeo = new THREE.BoxGeometry(0.24, 0.14, 2.10);
    const tiePlateGeo = new THREE.BoxGeometry(0.18, 0.014, 0.24);
    const fastenerGeo = new THREE.BoxGeometry(0.04, 0.022, 0.035);

    const sleeperY = railBaseY - 0.080; // まくらぎ中心
    const plateY = railBaseY - 0.007;   // タイプレート

    for (let x = -11.0; x <= 11.0; x += 0.58) {
      // まくらぎ
      const sleeper = new THREE.Mesh(sleeperGeo, this.matSleeper);
      sleeper.position.set(x, sleeperY, 0);
      sleeper.castShadow = true;
      sleeper.receiveShadow = true;
      this.trackGroup.add(sleeper);

      // 左側タイプレート & 締結具
      const plateL = new THREE.Mesh(tiePlateGeo, this.matTiePlate);
      plateL.position.set(x, plateY, railZ);
      plateL.receiveShadow = true;
      this.trackGroup.add(plateL);

      const fastL1 = new THREE.Mesh(fastenerGeo, this.matFastener);
      fastL1.position.set(x, plateY + 0.012, railZ + 0.07);
      this.trackGroup.add(fastL1);
      const fastL2 = new THREE.Mesh(fastenerGeo, this.matFastener);
      fastL2.position.set(x, plateY + 0.012, railZ - 0.07);
      this.trackGroup.add(fastL2);

      // 右側タイプレート & 締結具
      const plateR = new THREE.Mesh(tiePlateGeo, this.matTiePlate);
      plateR.position.set(x, plateY, -railZ);
      plateR.receiveShadow = true;
      this.trackGroup.add(plateR);

      const fastR1 = new THREE.Mesh(fastenerGeo, this.matFastener);
      fastR1.position.set(x, plateY + 0.012, -railZ + 0.07);
      this.trackGroup.add(fastR1);
      const fastR2 = new THREE.Mesh(fastenerGeo, this.matFastener);
      fastR2.position.set(x, plateY + 0.012, -railZ - 0.07);
      this.trackGroup.add(fastR2);
    }

    this.scene.add(this.trackGroup);
  }

  // =========================================================================
  // 水平コイルスプリング生成 (図面通りの太径ドラフトスプリング)
  // =========================================================================
  createHorizontalCoilSpring(radius, wireRadius, coils, length) {
    const points = [];
    const segments = coils * 40;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * coils * Math.PI * 2;
      const x = (t - 0.5) * length;
      const y = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, segments, wireRadius, 10, false);
    return new THREE.Mesh(geo, this.matSpring);
  }

  // =========================================================================
  // 連結器ユニット（ユーザー提示の構造図通りの完全アセンブリ）
  // =========================================================================
    // =========================================================================
  // 車両車端部（妻面・車体シェル・アンチクライマー・台車車輪・胴受）
  // =========================================================================
  createVehicleBody(isVehicleB = false) {
    const vehicleGroup = new THREE.Group();
    vehicleGroup.name = isVehicleB ? 'Vehicle_Body_B' : 'Vehicle_Body_A';

    // 車体外板マテリアル (ステンレスシルバー)
    const matCarBody = new THREE.MeshStandardMaterial({
      color: isVehicleB ? 0xcbd5e1 : 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.28
    });

    // 車体帯（ラインカラー）：車両Aはエメラルドグリーン、車両Bはコーポレートブルー
    const stripeColor = isVehicleB ? 0x0284c7 : 0x10b981;
    const matStripe = new THREE.MeshStandardMaterial({
      color: stripeColor,
      metalness: 0.60,
      roughness: 0.35
    });

    // 台枠・アンダーフレーム
    const matChassis = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.45
    });

    // 貫通幌（黒キャンバスゴム）
    const matDiaphragm = new THREE.MeshStandardMaterial({
      color: 0x181e29,
      metalness: 0.10,
      roughness: 0.90
    });

    // 妻窓ガラス
    const matWindow = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.90,
      roughness: 0.10,
      transparent: true,
      opacity: 0.65
    });

    // 標識灯・テールライト
    const matTailLight = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });

    // 1. 車端部メイン外板（妻面壁）: X = -0.34m より後方
    // 幅 2.80m, 高さ 2.50m, 長さ 1.80m
    const bodyLength = 1.80;
    const bodyCenterY = 1.35;
    const bodyStartX = -0.34 - (bodyLength * 0.5);

    const bodyBoxGeo = new THREE.BoxGeometry(bodyLength, 2.30, 2.75);
    const bodyBox = new THREE.Mesh(bodyBoxGeo, matCarBody);
    bodyBox.position.set(bodyStartX, bodyCenterY, 0);
    bodyBox.castShadow = true;
    bodyBox.receiveShadow = true;
    vehicleGroup.add(bodyBox);

    // 車体屋根アール
    const roofCurveGeo = new THREE.CylinderGeometry(1.38, 1.38, bodyLength, 24, 1, false, 0, Math.PI);
    const roofMesh = new THREE.Mesh(roofCurveGeo, matCarBody);
    roofMesh.rotation.z = Math.PI / 2;
    roofMesh.position.set(bodyStartX, bodyCenterY + 1.15, 0);
    roofMesh.scale.set(0.35, 1.0, 1.0);
    roofMesh.castShadow = true;
    vehicleGroup.add(roofMesh);

    // 2. 帯（ラインカラー）
    const stripeGeo = new THREE.BoxGeometry(bodyLength + 0.01, 0.14, 2.77);
    const stripeMesh = new THREE.Mesh(stripeGeo, matStripe);
    stripeMesh.position.set(bodyStartX, bodyCenterY - 0.45, 0);
    vehicleGroup.add(stripeMesh);

    // 3. 妻面正面 (X = -0.34m)
    const faceX = -0.34;

    // 貫通幌枠 (中央突出)
    const diaphragmGeo = new THREE.BoxGeometry(0.16, 1.85, 0.88);
    const diaphragm = new THREE.Mesh(diaphragmGeo, matDiaphragm);
    diaphragm.position.set(faceX + 0.08, bodyCenterY - 0.15, 0);
    diaphragm.castShadow = true;
    vehicleGroup.add(diaphragm);

    // 貫通扉窓
    const doorWinGeo = new THREE.PlaneGeometry(0.30, 0.60);
    const doorWin = new THREE.Mesh(doorWinGeo, matWindow);
    doorWin.position.set(faceX + 0.162, bodyCenterY + 0.15, 0);
    doorWin.rotation.y = Math.PI / 2;
    vehicleGroup.add(doorWin);

    // 左右の妻窓
    const winL = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.52), matWindow);
    winL.position.set(faceX + 0.002, bodyCenterY + 0.20, 0.82);
    winL.rotation.y = Math.PI / 2;
    vehicleGroup.add(winL);

    const winR = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.52), matWindow);
    winR.position.set(faceX + 0.002, bodyCenterY + 0.20, -0.82);
    winR.rotation.y = Math.PI / 2;
    vehicleGroup.add(winR);

    // アンチクライマーリブ
    for (let i = 0; i < 3; i++) {
      const ribGeo = new THREE.BoxGeometry(0.04, 0.025, 1.25);
      const rib = new THREE.Mesh(ribGeo, matChassis);
      rib.position.set(faceX + 0.02, 0.22 + i * 0.04, 0);
      vehicleGroup.add(rib);
    }

    // 標識灯・テールライト
    const tailL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), matTailLight);
    tailL.rotation.z = Math.PI / 2;
    tailL.position.set(faceX + 0.01, 0.36, 0.95);
    vehicleGroup.add(tailL);

    const tailR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), matTailLight);
    tailR.rotation.z = Math.PI / 2;
    tailR.position.set(faceX + 0.01, 0.36, -0.95);
    vehicleGroup.add(tailR);

    // 4. 台車・車軸・車輪 (レール頭面 Y = -0.880m、車輪半径 0.430m)
    const wheelAxisY = -0.450;
    const wheelTrackZ = 0.5335;
    const axleX = -1.15;

    // 車軸
    const axleGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.45, 16);
    const axle = new THREE.Mesh(axleGeo, matChassis);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(axleX, wheelAxisY, 0);
    axle.castShadow = true;
    vehicleGroup.add(axle);

    // 車輪 (左・右)
    const wheelGeo = new THREE.CylinderGeometry(0.430, 0.430, 0.125, 24);
    const wheelL = new THREE.Mesh(wheelGeo, this.matRail);
    wheelL.rotation.x = Math.PI / 2;
    wheelL.position.set(axleX, wheelAxisY, wheelTrackZ);
    wheelL.castShadow = true;
    vehicleGroup.add(wheelL);

    const wheelR = new THREE.Mesh(wheelGeo, this.matRail);
    wheelR.rotation.x = Math.PI / 2;
    wheelR.position.set(axleX, wheelAxisY, -wheelTrackZ);
    wheelR.castShadow = true;
    vehicleGroup.add(wheelR);

    // 台車側枠
    const bogieBeamGeo = new THREE.BoxGeometry(0.95, 0.15, 0.08);
    const bogieL = new THREE.Mesh(bogieBeamGeo, matChassis);
    bogieL.position.set(axleX, wheelAxisY, wheelTrackZ + 0.12);
    vehicleGroup.add(bogieL);

    const bogieR = new THREE.Mesh(bogieBeamGeo, matChassis);
    bogieR.position.set(axleX, wheelAxisY, -wheelTrackZ - 0.12);
    vehicleGroup.add(bogieR);

    // 5. 胴受 (Coupler Carrier)
    const carrierGeo = new THREE.BoxGeometry(0.10, 0.04, 0.42);
    const carrier = new THREE.Mesh(carrierGeo, matChassis);
    carrier.position.set(-0.16, -0.16, 0.0);
    carrier.castShadow = true;
    vehicleGroup.add(carrier);

    return vehicleGroup;
  }

  parseBase64STL(b64) {
    const binStr = atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const loader = this.stlLoader || (typeof THREE.STLLoader !== 'undefined' ? new THREE.STLLoader() : null);
    return loader ? loader.parse(bytes.buffer) : null;
  }

  loadCadCouplerParts(cadParts, knucklePivot, throwerPivot, lockSlide) {
    const deg2rad = THREE.MathUtils.degToRad;
    const partsDef = [
      { name: 'body_b', file: 'models/body_b.stl', mat: this.matBody, target: cadParts, pos: [23, -0.5, 26], rot: [deg2rad(-90), 0, 0] },
      { name: 'body_a', file: 'models/body_a.stl', mat: this.matBody, target: cadParts, pos: [23, 8.5, 26], rot: [deg2rad(-90), 0, 0] },
      { name: 'knuckle', file: 'models/knuckle.stl', mat: this.matKnuckle, target: knucklePivot, pos: [-0.25, -12.5, 0.75], rot: [deg2rad(-90), 0, 0] },
      { name: 'pivot_pin', file: 'models/pivot_pin.stl', mat: this.matPin, target: cadParts, pos: [-17, 14.5, 21], rot: [deg2rad(90), 0, 0] },
      { name: 'top_cap', file: 'models/top_cap.stl', mat: this.matCap, target: cadParts, pos: [-29, 10.5, 15], rot: [deg2rad(-90), 0, 0] },
      { name: 'lock', file: 'models/lock.stl', mat: this.matLock, target: lockSlide, pos: [-4, -3.5, 3], rot: [deg2rad(-90), deg2rad(90), 0] },
      { name: 'locklift', file: 'models/locklift.stl', mat: this.matLock, target: lockSlide, pos: [0, -6.8, 4], rot: [deg2rad(-90), deg2rad(-90), 0] },
      { name: 'thrower', file: 'models/thrower.stl', mat: this.matThrower, target: throwerPivot, pos: [-24, -2.5, 9], rot: [deg2rad(-180), 0, deg2rad(-90)] }
    ];

    const loader = this.stlLoader || (typeof THREE.STLLoader !== 'undefined' ? new THREE.STLLoader() : null);
    if (loader) {
      this.stlLoader = loader;
      partsDef.forEach(p => {
        const onGeom = (geom) => {
          if (!geom) return;
          geom.computeVertexNormals();
          const mesh = new THREE.Mesh(geom, p.mat);
          mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
          mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          p.target.add(mesh);
        };

        // 1. 優先: インラインBase64データからのゼロネットワーク・パース（file://プロトコル・Electron完全互換）
        if (window.CAD_MODELS_DATA && window.CAD_MODELS_DATA[p.name]) {
          try {
            const geom = this.parseBase64STL(window.CAD_MODELS_DATA[p.name]);
            if (geom) {
              onGeom(geom);
              return;
            }
          } catch (e) {
            console.warn('Base64 parse failed for ' + p.name, e);
          }
        }

        // 2. フォールバック: HTTP XHRリクエスト
        loader.load(p.file, onGeom, undefined, (err) => {
          console.warn('Fallback: could not load ' + p.file);
        });
      });
    }
  }

createCouplerUnit(isVehicleB = false) {
    const root = new THREE.Group();
    root.name = isVehicleB ? 'Coupler_B' : 'Coupler_A';
    root.add(this.createVehicleBody(isVehicleB));


    // 1. 車体端梁 (実機図面通りのすっきりした鋼製ビーム: 巨大ブロックを完全解消)
    const bufferBeamGeo = new THREE.BoxGeometry(0.08, 0.20, 1.05);
    const bufferBeam = new THREE.Mesh(bufferBeamGeo, this.matFrame);
    bufferBeam.position.set(-0.34, 0.10, 0.0);
    bufferBeam.castShadow = true;
    bufferBeam.receiveShadow = true;
    root.add(bufferBeam);

    // 2. 緩衝器（Draft Gear: 実機構造図通り、左右に2本の水平コイルスプリング！）
    const draftGroup = new THREE.Group();
    draftGroup.position.set(-0.32, 0.0, 0.0);

    // オープン中梁チャンネル枠 (上板と底板・後部ストッパーで、内部の左右2本スプリングが完全に露出して見える！)
    const sillTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.020, 0.28), this.matFrame);
    sillTop.position.set(-0.16, 0.110, 0);
    sillTop.castShadow = true;
    draftGroup.add(sillTop);

    const sillBtm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.020, 0.28), this.matFrame);
    sillBtm.position.set(-0.16, -0.110, 0);
    sillBtm.castShadow = true;
    draftGroup.add(sillBtm);

    const sillStopRear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.20, 0.28), this.matFrame);
    sillStopRear.position.set(-0.35, 0, 0);
    draftGroup.add(sillStopRear);

    // 前部フォロワープレート (Front Follower Plate)
    const frontFollower = new THREE.Group();
    frontFollower.position.set(0.03, 0, 0);
    const ffMain = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.19, 0.26), this.matLock);
    ffMain.castShadow = true;
    frontFollower.add(ffMain);
    draftGroup.add(frontFollower);

    // 後部フォロワープレート (Rear Follower Plate)
    const rearFollower = new THREE.Group();
    rearFollower.position.set(-0.33, 0, 0);
    const rfMain = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.19, 0.26), this.matLock);
    rfMain.castShadow = true;
    rearFollower.add(rfMain);
    draftGroup.add(rearFollower);

    // 【重要】緩衝器のばねは左右に2本（ドラフトスプリング左右2連並列配置！）
    const springLen = 0.31;
    // 左側コイルスプリング (Z = +0.065m)
    const spLeft = this.createHorizontalCoilSpring(0.046, 0.012, 5.5, springLen);
    spLeft.position.set(-0.15, 0.0, 0.065);
    spLeft.castShadow = true;
    draftGroup.add(spLeft);

    // 右側コイルスプリング (Z = -0.065m)
    const spRight = this.createHorizontalCoilSpring(0.046, 0.012, 5.5, springLen);
    spRight.position.set(-0.15, 0.0, -0.065);
    spRight.castShadow = true;
    draftGroup.add(spRight);

    root.add(draftGroup);

    // 3. 連結器本体（シャンク）＆ 復心装置（構造図に描かれたラジアルスプリング）
    const bodyGroup = new THREE.Group();

    // 角形シャンク (340mm規格)
    const shankGeo = new THREE.BoxGeometry(0.32, 0.135, 0.145);
    const shank = new THREE.Mesh(shankGeo, this.matBody);
    shank.position.set(-0.15, 0.0, 0.0);
    shank.castShadow = true;
    bodyGroup.add(shank);

    // シャンク後端ピボットピン (緩衝器ヨークとの垂直連結ピン)
    const shankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.20, 16), this.matPin);
    shankPin.position.set(-0.28, 0.0, 0.0);
    shankPin.castShadow = true;
    bodyGroup.add(shankPin);

    // 復心装置（構造図通りの左右水平コイルスプリング ＆ 支持ブラケット枠）
    const radialL = this.createHorizontalCoilSpring(0.028, 0.007, 5.0, 0.095);
    radialL.rotation.y = Math.PI / 2;
    radialL.position.set(-0.15, 0.0, 0.115);
    radialL.castShadow = true;
    bodyGroup.add(radialL);

    const radialBracketL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.06), this.matFrame);
    radialBracketL.position.set(-0.15, 0.0, 0.165);
    bodyGroup.add(radialBracketL);

    const radialR = this.createHorizontalCoilSpring(0.028, 0.007, 5.0, 0.095);
    radialR.rotation.y = -Math.PI / 2;
    radialR.position.set(-0.15, 0.0, -0.115);
    radialR.castShadow = true;
    bodyGroup.add(radialR);

    const radialBracketR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.06), this.matFrame);
    radialBracketR.position.set(-0.15, 0.0, -0.165);
    bodyGroup.add(radialBracketR);

    // =========================================================================
    // 実機 CAD STL 8パーツ完全アセンブリ (連結器横幅340mm厳密規格 cadScale = 0.006518)
    // =========================================================================
    const cadRoot = new THREE.Group();
    cadRoot.rotation.x = 0;
    cadRoot.rotation.y = Math.PI / 2; // +90度回転で進行軸(+X)に整列
    cadRoot.rotation.z = 0;
    const cadScale = 0.006518; // 横幅厳密340mm (340mm / 52.1607)
    cadRoot.scale.set(cadScale, cadScale, cadScale);
    cadRoot.position.set(0.0, 0.0, 0.0);

    const cadParts = new THREE.Group();
    cadParts.position.set(-0.20, 0.0, 17.02);
    cadRoot.add(cadParts);

    // ナックル回転ピボット (ピン中心: X=-12.75, Z=25.25)
    const knucklePivot = new THREE.Group();
    knucklePivot.position.set(-12.75, 0.0, 25.25);
    cadParts.add(knucklePivot);

    // 錠昇降スライドグループ
    const lockSlide = new THREE.Group();
    cadParts.add(lockSlide);

    // 肘開ケピボット
    const throwerPivot = new THREE.Group();
    cadParts.add(throwerPivot);

    const deg2rad = THREE.MathUtils.degToRad;
    const partsDef = [
      { name: 'body_b', file: 'models/body_b.stl', mat: this.matBody, target: cadParts, pos: [23, -0.5, 26], rot: [deg2rad(-90), 0, 0] },
      { name: 'body_a', file: 'models/body_a.stl', mat: this.matBody, target: cadParts, pos: [23, 8.5, 26], rot: [deg2rad(-90), 0, 0] },
      { name: 'knuckle', file: 'models/knuckle.stl', mat: this.matKnuckle, target: knucklePivot, pos: [-0.25, -12.5, 0.75], rot: [deg2rad(-90), 0, 0] },
      { name: 'pivot_pin', file: 'models/pivot_pin.stl', mat: this.matPin, target: cadParts, pos: [-17, 14.5, 21], rot: [deg2rad(90), 0, 0] },
      { name: 'top_cap', file: 'models/top_cap.stl', mat: this.matCap, target: cadParts, pos: [-29, 10.5, 15], rot: [deg2rad(-90), 0, 0] },
      { name: 'lock', file: 'models/lock.stl', mat: this.matLock, target: lockSlide, pos: [-4, -3.5, 3], rot: [deg2rad(-90), deg2rad(90), 0] },
      { name: 'locklift', file: 'models/locklift.stl', mat: this.matLock, target: lockSlide, pos: [0, -6.8, 4], rot: [deg2rad(-90), deg2rad(-90), 0] },
      { name: 'thrower', file: 'models/thrower.stl', mat: this.matThrower, target: throwerPivot, pos: [-24, -2.5, 9], rot: [deg2rad(-180), 0, deg2rad(-90)] }
    ];

    if (this.stlLoader) {
      partsDef.forEach(p => {
        this.stlLoader.load(p.file, (geom) => {
          geom.computeVertexNormals();
          const mesh = new THREE.Mesh(geom, p.mat);
          mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
          mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          p.target.add(mesh);

        }, undefined, (err) => {
          console.warn('Fallback: could not load ' + p.file);
        });
      });
    }

    bodyGroup.add(cadRoot);
    root.add(bodyGroup);

    // =========================================================================
    // 実機図面通りの「クランク状開放てこ」＆「つりリンク」＆「locklift」物理結合
    // =========================================================================
    let leverShaftGroup = null;
    let suspLinkGroup = null;

    {
      const leverSystem = new THREE.Group();
      leverSystem.name = 'UncouplingLeverSystem';

      // 1. 端梁前面の軸受ブラケット (2箇所)
      const bracketGeo = new THREE.BoxGeometry(0.025, 0.12, 0.035);
      const bracketL = new THREE.Mesh(bracketGeo, this.matFrame);
      bracketL.position.set(-0.34, 0.18, 0.15);
      bracketL.castShadow = true;
      leverSystem.add(bracketL);

      const bracketR = new THREE.Mesh(bracketGeo, this.matFrame);
      bracketR.position.set(-0.34, 0.18, 0.45);
      bracketR.castShadow = true;
      leverSystem.add(bracketR);

      // 2. 開放てこ回転シャフトグループ (回転軸: X = -0.34m, Y = 0.18m)
      leverShaftGroup = new THREE.Group();
      leverShaftGroup.position.set(-0.34, 0.18, 0.0);

      // 横棒操作シャフト: 車体外側 (Z = 0.52m) から折れ曲がり開始部 (Z = 0.06m) まで
      const shaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.46, 16);
      const shaft = new THREE.Mesh(shaftGeo, this.matLever);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, 0, 0.29);
      shaft.castShadow = true;
      leverShaftGroup.add(shaft);

      // 実機図面通りの端部操作ハンドル (車体外側 Z = 0.52m)
      const handleGroup = new THREE.Group();
      handleGroup.position.set(0, 0, 0.52);
      // 屈曲ハンドルフレーム
      const hV = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 12), this.matLever);
      hV.position.set(0.0, -0.11, 0.0);
      hV.castShadow = true;
      handleGroup.add(hV);
      const hB = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 12), this.matLever);
      hB.rotation.z = Math.PI / 2;
      hB.position.set(0.045, -0.22, 0.0);
      hB.castShadow = true;
      handleGroup.add(hB);
      const hD = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.24, 12), this.matLever);
      hD.rotation.z = 0.40;
      hD.position.set(0.045, -0.11, 0.0);
      hD.castShadow = true;
      handleGroup.add(hD);
      leverShaftGroup.add(handleGroup);

      // 3. 【指示通り・角度と長さを調整】実機図面通りの「クランク状折れ曲がりロッド」
      // シャフト軸 (0, 0, 0.06) から 端梁に沿って斜め下方の locklift (X = 0.1370, Y = 0.0250, Z = 0.0052) 真上へ至る！
      // 通常施錠時: tipEye は (X = 0.1370, Y = 0.0650, Z = 0.0052)
      // 相対座標: X = 0.1370 - (-0.34) = +0.4770m, Y = 0.0650 - 0.18 = -0.1150m, Z = 0.0052m
      const crankPoints = [
        new THREE.Vector3(0.0000,  0.0000, 0.0600),
        new THREE.Vector3(0.1200, -0.0250, 0.0500),
        new THREE.Vector3(0.2400, -0.0550, 0.0350),
        new THREE.Vector3(0.3600, -0.0850, 0.0180),
        new THREE.Vector3(0.4770, -0.1150, 0.0052)
      ];
      const crankCurve = new THREE.CatmullRomCurve3(crankPoints, false, 'catmullrom', 0.2);
      const crankGeo = new THREE.TubeGeometry(crankCurve, 32, 0.0075, 10, false);
      const crankRod = new THREE.Mesh(crankGeo, this.matLever);
      crankRod.castShadow = true;
      leverShaftGroup.add(crankRod);

      // ロッド先端のアイフック (クランクロッド先端の環: locklift穴の真上 Y = 0.0650m)
      const tipEye = new THREE.Mesh(new THREE.TorusGeometry(0.010, 0.0030, 8, 20), this.matLever);
      tipEye.position.set(0.4770, -0.1150, 0.0052);
      tipEye.rotation.y = Math.PI / 2;
      tipEye.castShadow = true;
      leverShaftGroup.add(tipEye);

      leverSystem.add(leverShaftGroup);

      // 4. 【指示通り】「つりリンク」金具 (ロック・非ロック時どちらも完全に結び付く直結リンク)
      // クランクロッド先端アイ(0.1370, 0.0650, 0.0052) と locklift上部アイ穴(0.1370, 0.0250, 0.0052) を直結する長円リンク
      suspLinkGroup = new THREE.Group();
      // 通常時: 中点 (0.1370, 0.0450, 0.0052)、全長 40mm
      suspLinkGroup.position.set(0.1370, 0.0450, 0.0052);

      // つりリンク金具（縦長 40mm の高張力鋼シルバーリンク）
      const linkGeo = new THREE.CylinderGeometry(0.0030, 0.0030, 0.040, 12);
      const linkRodL = new THREE.Mesh(linkGeo, this.matChain);
      linkRodL.position.set(0.0, 0.0, 0.006);
      linkRodL.castShadow = true;
      suspLinkGroup.add(linkRodL);

      const linkRodR = new THREE.Mesh(linkGeo, this.matChain);
      linkRodR.position.set(0.0, 0.0, -0.006);
      linkRodR.castShadow = true;
      suspLinkGroup.add(linkRodR);

      // 上端環 (ロッド先端アイと連結: Y = +0.020m -> root Y = 0.0650m)
      const linkTopRing = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, 8, 16), this.matChain);
      linkTopRing.position.set(0.0, 0.020, 0.0);
      linkTopRing.rotation.y = Math.PI / 2;
      linkTopRing.castShadow = true;
      suspLinkGroup.add(linkTopRing);

      // 下端環 (locklift穴と連結: Y = -0.020m -> root Y = 0.0250m)
      const linkBtmRing = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, 8, 16), this.matChain);
      linkBtmRing.position.set(0.0, -0.020, 0.0);
      linkBtmRing.rotation.y = Math.PI / 2;
      linkBtmRing.castShadow = true;
      suspLinkGroup.add(linkBtmRing);

      leverSystem.add(suspLinkGroup);
      root.add(leverSystem);
    }

    if (isVehicleB) {
      root.rotation.y = Math.PI;
    }

    return {
      root,
      bodyGroup,
      draftGroup,
      frontFollower,
      rearFollower,
      spLeft,
      spRight,
      knucklePivot,
      lockSlide,
      throwerPivot,
      leverShaftGroup,
      suspLinkGroup
    };
  }

  // =========================================================================
  // リアルタイム更新（65度ナックル剛体開口、接触閉鎖勘合、緩衝器伸縮）
  // =========================================================================
  update(phys, fem, mat) {
    // 1. 車両位置更新 (進行軸 X)
    this.couplerA.root.position.x = phys.posA;
    this.couplerB.root.position.x = phys.posB;

    // 2. 緩衝器ストローク＆コイルスプリング弾性伸縮アニメーション (外からはっきり見える！)
    const strokeA = phys.draftStrokeA || 0;
    const strokeB = phys.draftStrokeB || 0;
    this.couplerA.draftGroup.position.x = -0.32 - (strokeA * 0.5);
    this.couplerB.draftGroup.position.x = -0.32 - (strokeB * 0.5);

    // フォロワープレートと緩衝器左右2本コイルスプリングの弾性伸縮アニメーション
    if (this.couplerA.frontFollower) {
      this.couplerA.frontFollower.position.x = 0.03 - (strokeA * 0.9);
      const sScaleA = Math.max(0.35, 1.0 - strokeA * 4.2);
      if (this.couplerA.spLeft) this.couplerA.spLeft.scale.x = sScaleA;
      if (this.couplerA.spRight) this.couplerA.spRight.scale.x = sScaleA;
    }
    if (this.couplerB.frontFollower) {
      this.couplerB.frontFollower.position.x = 0.03 - (strokeB * 0.9);
      const sScaleB = Math.max(0.35, 1.0 - strokeB * 4.2);
      if (this.couplerB.spLeft) this.couplerB.spLeft.scale.x = sScaleB;
      if (this.couplerB.spRight) this.couplerB.spRight.scale.x = sScaleB;
    }

    // 3. ナックル回転（開放時は60度、接触・締結時は0度で内側面適正抱合・押し込みすぎ解消）
    const yAngleA = 14.0 - (phys.knuckleAngleA || 0);
    const yAngleB = 14.0 - (phys.knuckleAngleB || 0);
    this.couplerA.knucklePivot.rotation.y = THREE.MathUtils.degToRad(yAngleA);
    this.couplerB.knucklePivot.rotation.y = THREE.MathUtils.degToRad(yAngleB);

    // 4. 錠スライド昇降（左右両連結器で完全同期）
    const uncoupleValA = phys.uncoupleLever || 0;
    const uncoupleValB = (phys.uncoupleLeverB !== undefined) ? phys.uncoupleLeverB : uncoupleValA;
    const liftFactorA = Math.max(uncoupleValA, (phys.lockHeightA || 0));
    const liftFactorB = Math.max(uncoupleValB, (phys.lockHeightB || 0));
    this.couplerA.lockSlide.position.y = liftFactorA * 16.0;
    this.couplerB.lockSlide.position.y = liftFactorB * 16.0;

    // ナックル開き機（肘開ケ Thrower）の回転連動（左右同期）
    // 錠が持ち上がると、肘開ケが回転してナックル尾部を外側へ蹴り出す
    if (this.couplerA.throwerPivot) {
      this.couplerA.throwerPivot.rotation.z = THREE.MathUtils.degToRad(-liftFactorA * 30.0);
    }
    if (this.couplerB.throwerPivot) {
      this.couplerB.throwerPivot.rotation.z = THREE.MathUtils.degToRad(-liftFactorB * 30.0);
    }

    // 5. 開放てこ・つりリンク・lockliftの物理的連動キネマティクス（左右同期）
    // ロック・非ロック時どちらもリンクが完全に結び付く完全同期仕様
    const lockliftBaseX = 0.1370;
    const lockliftBaseY = 0.0250;
    const lockliftBaseZ = 0.0052;
    const tipBaseRelX = 0.4770;
    const tipBaseRelY = -0.1150;
    const shaftX = -0.34;
    const shaftY = 0.18;

    if (this.couplerA.leverShaftGroup && this.couplerA.suspLinkGroup) {
      // liftFactorA (0=施錠, 1=開放): てこ引き角 0 〜 0.22rad (最大約12.6度)
      const leverAngleA = liftFactorA * 0.22;
      this.couplerA.leverShaftGroup.rotation.z = leverAngleA;

      const cosA = Math.cos(leverAngleA);
      const sinA = Math.sin(leverAngleA);
      const tipRelXA = tipBaseRelX * cosA - tipBaseRelY * sinA;
      const tipRelYA = tipBaseRelX * sinA + tipBaseRelY * cosA;
      const tipWorldXA = shaftX + tipRelXA;
      const tipWorldYA = shaftY + tipRelYA;

      const restTipYA = shaftY + tipBaseRelY; // 0.0650m
      const actualLiftA = tipWorldYA - restTipYA; // 0 〜 0.104m
      this.couplerA.lockSlide.position.y = actualLiftA / 0.006518; // 0 〜 16.0

      const lockliftEyeYA = lockliftBaseY + actualLiftA;
      const midXA = (tipWorldXA + lockliftBaseX) * 0.5;
      const midYA = (tipWorldYA + lockliftEyeYA) * 0.5;
      const dxA = tipWorldXA - lockliftBaseX;
      const dyA = tipWorldYA - lockliftEyeYA;

      this.couplerA.suspLinkGroup.position.set(midXA, midYA, lockliftBaseZ);
      this.couplerA.suspLinkGroup.rotation.z = -Math.atan2(dxA, dyA);
    }

    if (this.couplerB.leverShaftGroup && this.couplerB.suspLinkGroup) {
      const leverAngleB = liftFactorB * 0.22;
      this.couplerB.leverShaftGroup.rotation.z = leverAngleB;

      const cosB = Math.cos(leverAngleB);
      const sinB = Math.sin(leverAngleB);
      const tipRelXB = tipBaseRelX * cosB - tipBaseRelY * sinB;
      const tipRelYB = tipBaseRelX * sinB + tipBaseRelY * cosB;
      const tipWorldXB = shaftX + tipRelXB;
      const tipWorldYB = shaftY + tipRelYB;

      const restTipYB = shaftY + tipBaseRelY;
      const actualLiftB = tipWorldYB - restTipYB;
      this.couplerB.lockSlide.position.y = actualLiftB / 0.006518;

      const lockliftEyeYB = lockliftBaseY + actualLiftB;
      const midXB = (tipWorldXB + lockliftBaseX) * 0.5;
      const midYB = (tipWorldYB + lockliftEyeYB) * 0.5;
      const dxB = tipWorldXB - lockliftBaseX;
      const dyB = tipWorldYB - lockliftEyeYB;

      this.couplerB.suspLinkGroup.position.set(midXB, midYB, lockliftBaseZ);
      this.couplerB.suspLinkGroup.rotation.z = -Math.atan2(dxB, dyB);
    }
  }

  updateStressColors(fem, matEngine, showFEM = false) {
    if (!showFEM || !fem || !matEngine) {
      if (this.matKnuckle) this.matKnuckle.color.setHex(0xb58c5a);
      if (this.matBody) this.matBody.color.setHex(0x5a6878);
      return;
    }

    const stressPa = fem.maxGlobalStress || 0;
    const yieldPa = (matEngine.mat && matEngine.mat.yieldStress) ? matEngine.mat.yieldStress : 275e6;
    const ratio = Math.min(2.0, stressPa / yieldPa);

    let color;
    if (matEngine.isFractured) {
      color = new THREE.Color(0xef4444); // 破断・深紅
    } else if (ratio < 0.25) {
      color = new THREE.Color(0x38bdf8); // 安全青
    } else if (ratio < 0.60) {
      const t = (ratio - 0.25) / 0.35;
      color = new THREE.Color().lerpColors(new THREE.Color(0x38bdf8), new THREE.Color(0x10b981), t);
    } else if (ratio < 1.0) {
      const t = (ratio - 0.60) / 0.40;
      color = new THREE.Color().lerpColors(new THREE.Color(0x10b981), new THREE.Color(0xf59e0b), t);
    } else {
      const t = Math.min(1.0, (ratio - 1.0) / 0.80);
      color = new THREE.Color().lerpColors(new THREE.Color(0xf59e0b), new THREE.Color(0xef4444), t);
    }

    if (this.matKnuckle) this.matKnuckle.color.copy(color);
    if (this.matBody) {
      const bodyColor = color.clone().lerp(new THREE.Color(0x5a6878), 0.55);
      this.matBody.color.copy(bodyColor);
    }
  }
}

class KnuckleFEMViewer {
  constructor(containerId = 'knuckleFemCanvasContainer') {
    this.container = document.getElementById(containerId) ||
                     document.getElementById('knuckleFemCanvasContainer') ||
                     document.getElementById('knuckleFemCanvas');
    if (!this.container) return;

    this.scene = new THREE.Scene();
    const w = this.container.clientWidth || 380;
    const h = this.container.clientHeight || 200;

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.02, 10);
    this.fitDistance = 0.62; // ナックル全体がキャンバス内に100%収まる距離
    this.camera.position.set(0.35, 0.35, 0.40);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 照明 (応力色とポリゴン陰影が美しく見えるライティング)
    const amb = new THREE.AmbientLight(0xffffff, 0.80);
    this.scene.add(amb);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(0.6, 0.9, 0.7);
    this.scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x90b0d0, 0.7);
    dirLight2.position.set(-0.6, -0.4, -0.5);
    this.scene.add(dirLight2);

    // ナックル親グループ (中心 (0, 0, 0) を軸に回転)
    this.knuckleGroup = new THREE.Group();
    this.scene.add(this.knuckleGroup);

    this.rot = { x: 0, y: 0 };
    this.knuckleGroup.rotation.x = this.rot.x;
    this.knuckleGroup.rotation.y = this.rot.y;

    this.mesh = null;
    this.wireMesh = null;
    this.geometry = null;
    this.originalPositions = null;
    this.throatVertexIndices = [];
    this.noseVertexIndices = [];
    this.pinVertexIndices = [];

    // 接触点マーカー (応力入力点)
    const markerGeom = new THREE.SphereGeometry(0.008, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
    this.contactMarker = new THREE.Mesh(markerGeom, markerMat);
    this.contactMarker.visible = false;
    this.knuckleGroup.add(this.contactMarker);

    // 接触力ベクトル矢印
    this.contactArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      0.05,
      0xff3366,
      0.015,
      0.010
    );
    this.contactArrow.visible = false;
    this.knuckleGroup.add(this.contactArrow);

    // ピボットピン拘束軸 (回転中心固定: 実寸直径約30mm)
    const pinGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.20, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xe0a020,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.55
    });
    this.pinAxisMesh = new THREE.Mesh(pinGeom, pinMat);
    this.pinAxisMesh.position.set(0, 0, 0);
    this.knuckleGroup.add(this.pinAxisMesh);

    this.initInteraction();
    this.loadRealKnuckleSTL();
  }

  computeFitDistance() {
    if (!this.geometry || !this.camera) return 0.62;
    if (!this.geometry.boundingSphere) this.geometry.computeBoundingSphere();
    const r = this.geometry.boundingSphere.radius || 0.16;
    const aspect = (this.container && this.container.clientWidth && this.container.clientHeight) ?
                   (this.container.clientWidth / this.container.clientHeight) : (380 / 200);
    const fovRadV = (this.camera.fov / 2) * (Math.PI / 180);
    const fovRadH = Math.atan(Math.tan(fovRadV) * aspect);
    const minFovRad = Math.min(fovRadV, fovRadH);
    // ナックル全体がキャンバス内に100%美しく収まる距離 (20%の余白マージン)
    this.fitDistance = (r / Math.sin(minFovRad)) * 1.20;
    return this.fitDistance;
  }

  loadRealKnuckleSTL() {
    const onGeometry = (geometry) => {
      geometry.rotateX(-Math.PI / 2);
      geometry.rotateY(Math.PI / 2);
      const cadScale = 0.006518;
      geometry.scale(cadScale, cadScale, cadScale);
      geometry.center();
      geometry.translate(0.025, 0, -0.02);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.setupKnuckleMesh(geometry);
    };

    if (window.CAD_MODELS_DATA && window.CAD_MODELS_DATA['knuckle']) {
      try {
        const geom = this.parseBase64STL(window.CAD_MODELS_DATA['knuckle']);
        if (geom) {
          onGeometry(geom);
          return;
        }
      } catch (e) {
        console.warn('Base64 knuckle parse failed', e);
      }
    }

    const loader = this.stlLoader || (typeof THREE.STLLoader !== 'undefined' ? new THREE.STLLoader() : null);
    if (!loader) {
      const fbGeom = this.createFallbackGeometry();
      fbGeom.center();
      fbGeom.computeVertexNormals();
      this.setupKnuckleMesh(fbGeom);
      return;
    }

    loader.load(
      'models/knuckle.stl',
      onGeometry,
      undefined,
      (err) => {
        console.warn('Fallback: knuckle.stl not loaded, generating parametric model.', err);
        const fbGeom = this.createFallbackGeometry();
        fbGeom.center();
        fbGeom.computeVertexNormals();
        this.setupKnuckleMesh(fbGeom);
      }
    );
  }

  createFallbackGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.04, -0.03);
    shape.lineTo(0.06, -0.03);
    shape.quadraticCurveTo(0.09, -0.01, 0.08, 0.03);
    shape.lineTo(0.03, 0.05);
    shape.quadraticCurveTo(0.0, 0.04, -0.02, 0.04);
    shape.lineTo(-0.05, 0.02);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 3,
      bevelSize: 0.005,
      bevelThickness: 0.005
    });
  }

  setupKnuckleMesh(geom) {
    this.geometry = geom;
    const count = geom.attributes.position.count;
    this.originalPositions = new Float32Array(geom.attributes.position.array);

    // 画面フィット距離を厳密計算
    this.computeFitDistance();

    // 頂点カラーバッファ初期化 (無負荷: ディープブルー)
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 0.10;
      colors[i * 3 + 1] = 0.20;
      colors[i * 3 + 2] = 0.55;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // ナックルの特徴的部位（喉部、ノーズ、ピン穴）の頂点インデックスを特定
    const pos = geom.attributes.position;
    this.throatVertexIndices = [];
    this.noseVertexIndices = [];
    this.pinVertexIndices = [];

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // 喉部 (内側湾曲フック部: 牽引力集中部)
      if (x > -0.025 && x < 0.075 && z > -0.09 && z < -0.01) {
        this.throatVertexIndices.push(i);
      }
      // ノーズ案内面 (先端外側)
      if (x > 0.075) {
        this.noseVertexIndices.push(i);
      }
      // ピン穴周辺 (回転中心拘束)
      if (Math.hypot(x, z) < 0.03) {
        this.pinVertexIndices.push(i);
      }
    }

    // メインソリッドメッシュ
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.35,
      roughness: 0.40,
      flatShading: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.knuckleGroup.add(this.mesh);

    // CADワイヤーフレーム (ポリゴンエッジを鮮明化)
    const wireGeom = new THREE.WireframeGeometry(geom);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: 0.25,
      depthTest: true
    });
    this.wireMesh = new THREE.LineSegments(wireGeom, wireMat);
    this.knuckleGroup.add(this.wireMesh);

    this.resetCamera();
  }

  /* ------------------------------------------------------------------------
     拡大・縮小の中心をポリゴン幾何中心 (0, 0, 0) に完全固定するインタラクション
     ------------------------------------------------------------------------ */
  initInteraction() {
    const el = this.renderer.domElement;
    el.style.cursor = 'grab';

    el.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      el.style.cursor = 'grabbing';
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      this.rot.y += dx * 0.012;
      this.rot.x += dy * 0.012;
      this.rot.x = Math.max(-1.4, Math.min(1.4, this.rot.x));

      this.knuckleGroup.rotation.x = this.rot.x;
      this.knuckleGroup.rotation.y = this.rot.y;
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      el.style.cursor = 'grab';
    });

    // マウスホイールズーム: 原点 (0, 0, 0) を向いたまま直線的に前進・後退
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const currentDist = this.camera.position.length();
      const factor = e.deltaY < 0 ? 0.92 : 1.08;
      const minDist = (this.fitDistance || 0.62) * 0.5;
      const maxDist = (this.fitDistance || 0.62) * 2.5;
      const newDist = Math.max(minDist, Math.min(maxDist, currentDist * factor));

      this.camera.position.normalize().multiplyScalar(newDist);
      this.camera.lookAt(0, 0, 0);
      this.render();
    }, { passive: false });

    // ダブルクリックで初期視点へリセット (全体フィット)
    el.addEventListener('dblclick', () => {
      this.resetCamera();
    });
  }

  resetCamera() {
    this.rot = { x: 0, y: 0 };
    this.knuckleGroup.rotation.set(0, 0, 0);
    const dist = this.computeFitDistance ? this.computeFitDistance() : (this.fitDistance || 0.62);
    // メインカメラと同じ斜め俯瞰位置へ
    this.camera.position.set(dist * 0.52, dist * 0.48, dist * 0.70);
    this.camera.lookAt(0, 0, 0);
    this.render();
  }

  /* ------------------------------------------------------------------------
     FEMの色変化を強調する高感度カラースケール
     - 微小応力 (10〜70 MPa) でも青からシアン、エメラルドグリーンへ即座に変色
     - 中度応力 (70〜160 MPa) でイエローへ
     - 強度応力 (160〜275+ MPa) でオレンジ〜クリムゾンレッドへ劇的変色
     ------------------------------------------------------------------------ */
  getEnhancedStressColor(stressMPa, yieldMPa = 275) {
    const s = Math.max(0, stressMPa);
    if (s <= 0.2) {
      return { r: 0.10, g: 0.20, b: 0.58 }; // ディープブルー
    }

    // 区分的非線形強調比率 t (0.0 〜 1.0)
    let t = 0.0;
    if (s < 20.0) {
      // 0〜20 MPa: ディープブルー(0.0) -> ターコイズシアン(0.25)
      t = (s / 20.0) * 0.25;
    } else if (s < 70.0) {
      // 20〜70 MPa: ターコイズシアン(0.25) -> エメラルドグリーン(0.50)
      t = 0.25 + ((s - 20.0) / 50.0) * 0.25;
    } else if (s < 160.0) {
      // 70〜160 MPa: エメラルドグリーン(0.50) -> ブライトイエロー(0.75)
      t = 0.50 + ((s - 70.0) / 90.0) * 0.25;
    } else {
      // 160〜275+ MPa: イエロー(0.75) -> オレンジ/クリムゾンレッド(1.0)
      t = 0.75 + Math.min(0.25, ((s - 160.0) / 115.0) * 0.25);
    }

    // マルチストップ・スムーズカラーパレット補間
    let r, g, b;
    if (t < 0.25) {
      const u = t / 0.25;
      r = 0.12 + (0.02 - 0.12) * u;
      g = 0.23 + (0.71 - 0.23) * u;
      b = 0.54 + (0.83 - 0.54) * u;
    } else if (t < 0.50) {
      const u = (t - 0.25) / 0.25;
      r = 0.02 + (0.06 - 0.02) * u;
      g = 0.71 + (0.73 - 0.71) * u;
      b = 0.83 + (0.51 - 0.83) * u;
    } else if (t < 0.75) {
      const u = (t - 0.50) / 0.25;
      r = 0.06 + (0.92 - 0.06) * u;
      g = 0.73 + (0.70 - 0.73) * u;
      b = 0.51 + (0.03 - 0.51) * u;
    } else {
      const u = (t - 0.75) / 0.25;
      r = 0.92 + (0.94 - 0.92) * u;
      g = 0.70 + (0.27 - 0.70) * u;
      b = 0.03 + (0.27 - 0.03) * u;
    }
    return { r, g, b };
  }

  /* ------------------------------------------------------------------------
     リアルタイム応力更新 & 衝突点（応力入力点）追従
     ------------------------------------------------------------------------ */
  updateStress(nominalStressMPa, yieldMPa, knuckleAngleRad = 0.0, simState = 'LOCKED', contactForceX = 0.0) {
    if (!this.mesh || !this.geometry) return;

    // 締結フェーズおよびナックル角度に応じた衝突点（応力入力点）の動的算出
    let contactX = 0.05;
    let contactY = 0.00;
    let contactZ = 0.02;
    let arrowDir = new THREE.Vector3(-1, 0, 0);
    let contactDesc = 'なし';

    if (simState === 'APPROACHING') {
      contactDesc = '接近中 (非接触)';
      this.contactMarker.visible = false;
      this.contactArrow.visible = false;
    } else if (simState === 'ENGAGING' || simState === 'COUPLING_CONTACT') {
      // 案内面衝突過渡期: ノーズ外側傾斜面で擦れ合う
      contactX = 0.070 - (knuckleAngleRad * 0.04);
      contactY = 0.00;
      contactZ = -0.040 + (knuckleAngleRad * 0.03);
      contactDesc = 'ノーズ案内面 (案内・滑り衝突)';
      arrowDir.set(-0.8, 0, 0.6).normalize();
      this.contactMarker.visible = true;
      this.contactArrow.visible = true;
    } else if (simState === 'LOCKED') {
      // 完全締結: ナックル喉部最深面で牽引・圧縮伝達
      contactX = 0.010;
      contactY = 0.00;
      contactZ = -0.025;
      contactDesc = '喉部最深接触面 (牽引引張)';
      arrowDir.set(-1, 0, 0).normalize();
      this.contactMarker.visible = Math.abs(contactForceX) > 0.5;
      this.contactArrow.visible = Math.abs(contactForceX) > 0.5;
    } else if (simState === 'UNCOUPLING') {
      contactDesc = '解結中 (案内面離脱)';
      contactX = 0.050;
      contactY = 0.00;
      contactZ = -0.020;
      arrowDir.set(0.6, 0, 0.8).normalize();
      this.contactMarker.visible = true;
      this.contactArrow.visible = true;
    }

    this.contactMarker.position.set(contactX, contactY, contactZ);
    this.contactArrow.position.set(contactX, contactY, contactZ);
    this.contactArrow.setDirection(arrowDir);
    const arrowLen = Math.max(0.02, Math.min(0.065, 0.02 + Math.abs(contactForceX) * 0.0003));
    this.contactArrow.setLength(arrowLen, arrowLen * 0.35, arrowLen * 0.25);

    // 応力テンソル計算 & メッシュ頂点カラー更新
    const pos = this.geometry.attributes.position;
    const colors = this.geometry.attributes.color;
    const count = pos.count;

    // 喉部の応力集中係数 Kt (幾何学的不連続部)
    const Kt = 2.45;
    const throatPeakMPa = nominalStressMPa * Kt;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // 衝突点からの距離
      const distContact = Math.hypot(x - contactX, y - contactY, z - contactZ);

      // 頂点ローカル応力
      let vStress = 0.0;
      // 1. 喉部応力集中 (Throat)
      if (x > -0.05 && x < 0.05 && z > -0.07 && z < 0.01) {
        const factor = Math.max(0, 1.0 - Math.hypot(x - 0.01, z - (-0.025)) / 0.055);
        vStress = Math.max(vStress, throatPeakMPa * factor);
      }
      // 2. 衝突入力点周辺の圧縮応力
      if (distContact < 0.045) {
        const factor = Math.max(0, 1.0 - distContact / 0.045);
        vStress = Math.max(vStress, (nominalStressMPa * 1.6) * factor);
      }
      // 3. 全体曲げ応力勾配
      const bendFactor = Math.max(0, (x + 0.06) / 0.14);
      vStress = Math.max(vStress, nominalStressMPa * bendFactor * 0.65);

      // 高感度強調カラースケール適用
      const c = this.getEnhancedStressColor(vStress, yieldMPa);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;

    // テレメトリ UI 更新 (メイン画面およびフロートウィンドウの双方に反映)
    const elKnuckleStress = document.getElementById('femKnuckleStress');
    if (elKnuckleStress) elKnuckleStress.textContent = nominalStressMPa.toFixed(1) + ' MPa';

    const elKnuckleMax = document.getElementById('femKnuckleMax');
    if (elKnuckleMax) elKnuckleMax.textContent = throatPeakMPa.toFixed(1) + ' MPa';

    const elFloatThroat = document.getElementById('femFloatThroatStress');
    if (elFloatThroat) elFloatThroat.textContent = throatPeakMPa.toFixed(1) + ' MPa';

    const elFloatPin = document.getElementById('femFloatPinStress');
    if (elFloatPin) elFloatPin.textContent = (nominalStressMPa * 0.72).toFixed(1) + ' MPa';

    const elKnuckleDisp = document.getElementById('femKnuckleDisp');
    if (elKnuckleDisp) {
      const dispMm = (throatPeakMPa / (yieldMPa || 275)) * 0.42;
      elKnuckleDisp.textContent = dispMm.toFixed(3) + ' mm';
    }

    const elContact = document.getElementById('femContactPoint');
    if (elContact) elContact.textContent = contactDesc;

    const elFloatContact = document.getElementById('femFloatContactPt');
    if (elFloatContact) elFloatContact.textContent = contactDesc;

    const elPivot = document.getElementById('femPivotFix');
    if (elPivot) elPivot.textContent = 'φ30ピン 完全固定拘束';

    const elFloatYield = document.getElementById('femFloatYieldState');
    if (elFloatYield) {
      if (throatPeakMPa >= yieldMPa * 1.5) {
        elFloatYield.textContent = '破断危険！ (過大応力)';
        elFloatYield.style.color = '#ef4444';
      } else if (throatPeakMPa >= yieldMPa) {
        elFloatYield.textContent = '降伏・塑性変形中';
        elFloatYield.style.color = '#f59e0b';
      } else {
        elFloatYield.textContent = '弾性域 (安全)';
        elFloatYield.style.color = '#10b981';
      }
    }

    this.render();
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.render();
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

class CouplerCharts {
  constructor(materialEngine) {
    this.matEngine = materialEngine;
    this.ssChart = null;
    this.waveChart = null;
    this.maxSamples = 40;
    this.forceData = Array(40).fill(0);
    this.strokeData = Array(40).fill(0);
    this.labels = Array(40).fill('');
    this.timer = 0;

    this.initSSChart();
    this.initWaveChart();
  }

  initSSChart() {
    const ctx = document.getElementById('chartSS');
    if (!ctx) return;
    const info = this.matEngine.getCurveData(80);

    this.ssChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'S-S特性曲線',
            data: info.curve,
            showLine: true,
            borderColor: '#4facfe',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: '降伏点',
            data: [info.yieldPoint],
            pointBackgroundColor: '#fbbf24',
            pointRadius: 5
          },
          {
            label: '引張強さ',
            data: [info.ultimatePoint],
            pointBackgroundColor: '#f87171',
            pointRadius: 5
          },
          {
            label: '破断限界',
            data: [info.fracturePoint],
            pointBackgroundColor: '#c084fc',
            pointRadius: 5
          },
          {
            label: '作動点',
            data: [{ x: 0, y: 0 }],
            pointBackgroundColor: '#00f2fe',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: {
            title: { display: true, text: 'ひずみ ε', color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } }
          },
          y: {
            title: { display: true, text: '応力 (MPa)', color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } }
          }
        },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 9 }, boxWidth: 8 } }
        }
      }
    });
    this.peakForceKN = 0.0;
    this.peakStrokeMM = 0.0;
  }

  initWaveChart() {
    const ctx = document.getElementById('chartForceHistory') || document.getElementById('chartWave');
    if (!ctx) return;

    this.waveChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: '軸力 Fx (kN)',
            data: this.forceData,
            borderColor: '#f59e0b',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'yForce',
            tension: 0.2
          },
          {
            label: '緩衝器変位 (mm)',
            data: this.strokeData,
            borderColor: '#38bdf8',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'yStroke',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: { display: false },
          yForce: {
            position: 'left',
            title: { display: true, text: 'kN', color: '#f59e0b', font: { size: 9 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#f59e0b', font: { size: 9 } }
          },
          yStroke: {
            position: 'right',
            title: { display: true, text: 'mm', color: '#38bdf8', font: { size: 9 } },
            grid: { drawOnChartArea: false },
            ticks: { color: '#38bdf8', font: { size: 9 } }
          }
        },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 9 }, boxWidth: 8 } }
        }
      }
    });
  }

  reset() {
    this.forceData.fill(0);
    this.strokeData.fill(0);
    this.peakForceKN = 0.0;
    this.peakStrokeMM = 0.0;
    if (this.waveChart) this.waveChart.update('none');
    if (this.ssChart) {
      if (this.ssChart.data.datasets[4]) {
        this.ssChart.data.datasets[4].data = [{ x: 0, y: 0 }];
      }
      this.ssChart.update('none');
    }
    const elFCurrent = document.getElementById('tabForceCurrent');
    const elFPeak = document.getElementById('tabForcePeak');
    const elSCurrent = document.getElementById('tabStrokeCurrent');
    const elSPeak = document.getElementById('tabStrokePeak');
    if (elFCurrent) elFCurrent.textContent = '0.0 kN';
    if (elFPeak) elFPeak.textContent = '0.0 kN';
    if (elSCurrent) elSCurrent.textContent = '0.0 mm';
    if (elSPeak) elSPeak.textContent = '0.0 mm';
  }

  updateMaterial() {
    if (!this.ssChart) return;
    const info = this.matEngine.getCurveData(80);
    this.ssChart.data.datasets[0].data = info.curve;
    this.ssChart.data.datasets[1].data = [info.yieldPoint];
    this.ssChart.data.datasets[2].data = [info.ultimatePoint];
    this.ssChart.data.datasets[3].data = [info.fracturePoint];
    this.ssChart.update('none');

    const mat = this.matEngine.mat;
    if (mat) {
      const elYield = document.getElementById('specYield');
      const elTensile = document.getElementById('specTensile');
      const elElong = document.getElementById('specElong');
      const elModulus = document.getElementById('specModulus');
      if (elYield) elYield.textContent = (mat.yieldStress / 1e6).toFixed(0) + ' MPa';
      if (elTensile) elTensile.textContent = (mat.ultimateStress / 1e6).toFixed(0) + ' MPa';
      if (elElong) elElong.textContent = Math.round(mat.fractureStrain * 100) + ' %';
      if (elModulus) elModulus.textContent = (mat.youngModulus / 1e9).toFixed(0) + ' GPa';
    }
  }

  update(dt, phys, mat) {
    if (this.ssChart && mat) {
      const sMPa = mat.stress / 1e6;
      const pt = this.ssChart.data.datasets[4];
      if (pt) {
        pt.data = [{ x: mat.strain, y: sMPa }];
        pt.pointBackgroundColor = mat.isFractured ? '#ef4444' : (mat.isYielded ? '#f59e0b' : '#00f2fe');
      }
      this.ssChart.update('none');

      // SS線図の上に示す最大応力リアルタイムインジケータ
      const elStress = document.getElementById('ssCurrentMaxStress');
      const elStatus = document.getElementById('ssYieldStatus');
      if (elStress) {
        elStress.textContent = sMPa.toFixed(1) + ' MPa';
        if (mat.isFractured) {
          elStress.style.color = '#ef4444';
          if (elStatus) {
            elStatus.textContent = '破断破壊！';
            elStatus.style.background = 'rgba(239, 68, 68, 0.3)';
            elStatus.style.color = '#ef4444';
          }
        } else if (mat.isYielded) {
          elStress.style.color = '#f59e0b';
          const yPct = ((sMPa / (this.matEngine.mat.yieldStress / 1e6)) * 100).toFixed(0);
          if (elStatus) {
            elStatus.textContent = '塑性硬化中 (' + yPct + '%)';
            elStatus.style.background = 'rgba(245, 158, 11, 0.3)';
            elStatus.style.color = '#f59e0b';
          }
        } else {
          elStress.style.color = '#00f2fe';
          const yPct = ((sMPa / (this.matEngine.mat.yieldStress / 1e6)) * 100).toFixed(0);
          if (elStatus) {
            elStatus.textContent = '弾性域 (' + yPct + '%)';
            elStatus.style.background = 'rgba(34, 197, 94, 0.2)';
            elStatus.style.color = '#4ade80';
          }
        }
      }
    }

    // タブ3: 衝突荷重・緩衝ストロークのリアルタイムメトリクス更新
    const curForceKN = Math.abs(phys.contactForceX || 0) / 1000;
    const curStrokeMM = Math.abs(phys.draftStrokeA || 0) * 1000;
    if (curForceKN > this.peakForceKN) this.peakForceKN = curForceKN;
    if (curStrokeMM > this.peakStrokeMM) this.peakStrokeMM = curStrokeMM;

    const elFCurrent = document.getElementById('tabForceCurrent');
    const elFPeak = document.getElementById('tabForcePeak');
    const elSCurrent = document.getElementById('tabStrokeCurrent');
    const elSPeak = document.getElementById('tabStrokePeak');
    if (elFCurrent) elFCurrent.textContent = curForceKN.toFixed(1) + ' kN';
    if (elFPeak) elFPeak.textContent = this.peakForceKN.toFixed(1) + ' kN';
    if (elSCurrent) elSCurrent.textContent = curStrokeMM.toFixed(1) + ' mm';
    if (elSPeak) elSPeak.textContent = this.peakStrokeMM.toFixed(1) + ' mm';

    this.timer += dt;
    if (this.timer >= 0.05 && this.waveChart) {
      this.timer = 0;
      this.forceData.shift();
      this.forceData.push(curForceKN.toFixed(1));
      this.strokeData.shift();
      this.strokeData.push(curStrokeMM.toFixed(1));
      this.waveChart.update('none');
    }
  }

  resize() {
    if (this.ssChart) {
      try { this.ssChart.resize(); } catch (e) {}
    }
    if (this.waveChart) {
      try { this.waveChart.resize(); } catch (e) {}
    }
  }
}

// ============================================================================
// 6. メインアプリケーション統合
// ============================================================================
class CouplerApp {
  constructor() {
    this.container = document.getElementById('canvasContainer');
    this.physics = new CouplerPhysics();
    this.materialEngine = new MaterialEngine('sc480');
    this.femEngine = new FEMEngine();

    // タイムコントロール
    this.timeScale = 1.0;
    this.isPaused = false;
    this.stepOnce = false;
    this.showFEM = false;

    this.initThree();
    this.coupler3D = new Coupler3D(this.scene);
    this.charts = new CouplerCharts(this.materialEngine);

    // ナックル本物STL 3D FEMビューア
    this.knuckleFEMViewer = new KnuckleFEMViewer('knuckleFemCanvasContainer');

    this.lastTime = performance.now();
    window.couplerApp = this;
    this.initUI();
    this.initCabController();
    this.initTimeControls();
    this.initFloatTabs();
    this.initFloatDraggableAndResizable();
    this.initKeyboard();
    this.syncCabUI();

    // 初期状態: toggleFEM チェックボックスの状態とフロート表示を同期
    const chkFem = document.getElementById('toggleFEM');
    const initFem = chkFem ? chkFem.checked : false;
    this.setFemFloatVisible(initFem);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  /* ------------------------------------------------------------------------
     FEM出力チェックボックスとフロートウィンドウの双方向同期メソッド
     ------------------------------------------------------------------------ */
  setFemFloatVisible(visible, activeTab = null) {
    this.showFEM = !!visible;
    const floatEl = document.getElementById('knuckleFemFloat');
    const chkFem = document.getElementById('toggleFEM');
    if (chkFem && chkFem.checked !== this.showFEM) {
      chkFem.checked = this.showFEM;
    }

    if (floatEl) {
      if (this.showFEM) {
        floatEl.style.display = 'flex';
        floatEl.classList.remove('closed');
        floatEl.classList.remove('minimized');
        if (activeTab) {
          this.switchFloatTab(activeTab);
        } else {
          this.switchFloatTab('tabFem3D');
        }
        setTimeout(() => {
          if (this.knuckleFEMViewer) this.knuckleFEMViewer.resize();
          if (this.charts) this.charts.resize();
        }, 50);
      } else {
        floatEl.style.display = 'none';
        floatEl.classList.add('closed');
      }
    }
  }

  /* ------------------------------------------------------------------------
     フロートウィンドウのタブ切り替え
     ------------------------------------------------------------------------ */
  switchFloatTab(targetTabId) {
    const tabBtns = document.querySelectorAll('.float-tab-btn');
    const tabPanes = document.querySelectorAll('.float-tab-pane');
    tabBtns.forEach(b => {
      if (b.dataset.tab === targetTabId) b.classList.add('active');
      else b.classList.remove('active');
    });
    tabPanes.forEach(p => {
      if (p.id === targetTabId) {
        p.classList.remove('hidden');
        p.classList.add('active');
      } else {
        p.classList.remove('active');
        p.classList.add('hidden');
      }
    });
    setTimeout(() => {
      if (this.knuckleFEMViewer) this.knuckleFEMViewer.resize();
      if (this.charts) this.charts.resize();
    }, 50);
  }

  initThree() {
    this.scene = new THREE.Scene();
    const isLight = typeof document !== 'undefined' ? document.body.classList.contains('light-mode') : true;
    const defaultBg = isLight ? 0xf8fafc : 0x0a0e14;
    this.scene.background = new THREE.Color(defaultBg);
    this.scene.fog = new THREE.FogExp2(defaultBg, 0.02);

    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 100);
    this.camera.position.set(-0.25, 0.70, 2.00);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(-0.25, 0.10, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.3);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);

    const dir1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dir1.position.set(4, 6, 4);
    dir1.castShadow = true;
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x93c5fd, 0.8);
    dir2.position.set(-4, 3, -3);
    this.scene.add(dir2);

    // 修正前の旧レール残骸・旧グリッドを完全除去 (地上高880mmの正規50kgNレール・枕木軌道に一本化)

    window.addEventListener('resize', () => {
      const nw = this.container.clientWidth;
      const nh = this.container.clientHeight;
      if (nw > 0 && nh > 0) {
        this.camera.aspect = nw / nh;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(nw, nh);
      }
    });
  }

  initUI() {
    const on = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
      return el;
    };

    // 1. 車両走行制御: 主幹制御器 (Power: 0〜5)
    const sliderPower = on('sliderPower', 'input', (e) => {
      const p = parseInt(e.target.value, 10);
      this.setCabCombinedNotch(p);
    });

    // 2. 車両走行制御: ブレーキ弁 (Brake: 0〜8)
    const sliderBrake = on('sliderBrake', 'input', (e) => {
      const b = parseInt(e.target.value, 10);
      this.setCabCombinedNotch(-b);
    });

    // 逆転器 (Reverser)
    const rf = document.getElementById('revForward');
    const rn = document.getElementById('revNeutral');
    const rb = document.getElementById('revBackward');
    if (rf) rf.addEventListener('click', () => this.setCabReverser(1));
    if (rn) rn.addEventListener('click', () => this.setCabReverser(0));
    if (rb) rb.addEventListener('click', () => this.setCabReverser(-1));

    // 旧UIスライダー互換
    on('sliderSpeed', 'input', (e) => {
      const spd = parseFloat(e.target.value);
      this.physics.targetSpeedKmh = spd;
    });

    // サイドバー（シナリオドロワー）のオーバーライド開閉制御
    const scenarioSidebar = document.getElementById('scenarioSidebar');
    const toggleSidebar = () => {
      if (scenarioSidebar) {
        scenarioSidebar.classList.toggle('collapsed');
      }
    };
    const closeSidebar = () => {
      if (scenarioSidebar) {
        scenarioSidebar.classList.add('collapsed');
      }
    };
    on('btnToggleSidebar', 'click', toggleSidebar);
    on('btnToolbarScenario', 'click', toggleSidebar);
    on('btnSidebarClose', 'click', closeSidebar);

    // キャンバス外クリックでサイドバーを閉じる
    const container = document.getElementById('canvasContainer');
    if (container) {
      container.addEventListener('click', () => {
        closeSidebar();
      });
    }

    // 3. キャンバス上 連結器手動操作 (開放てこ操作 / ナックル手動戻し)
    const triggerLeverTrip = () => {
      const valEl = document.getElementById('leverVal');
      if (this.physics.uncoupleLever > 0.5) {
        // 現在開放状態 -> 施錠状態（てこ下げ・錠落下）へ
        this.physics.closeKnuckleA();
        if (valEl) valEl.textContent = '施錠 (下)';
      } else {
        // 現在施錠状態 -> 開放状態（てこ引き上げ・錠引き上げ）へ
        this.physics.setUncoupleLever(1.0);
        if (valEl) valEl.textContent = '開放 (上)';
      }
    };
    on('btnTripLever', 'click', triggerLeverTrip);
    on('btnPullLever', 'click', triggerLeverTrip);

    // ナックル手動戻しボタン
    on('btnCloseKnuckle', 'click', () => {
      this.physics.closeKnuckleA();
      const valEl = document.getElementById('leverVal');
      if (valEl) valEl.textContent = '施錠 (下)';
    });

    // 4. 自動運転シナリオ
    on('btnScenarioCouple', 'click', () => {
      this.physics.loadScenario('SLOW_COUPLING');
      this.setCabReverser(1);
      this.setCabCombinedNotch(1);
      const valEl = document.getElementById('leverVal');
      if (valEl) valEl.textContent = '施錠 (下)';
      closeSidebar();
    });

    on('btnScenarioHardImpact', 'click', () => {
      this.physics.loadScenario('HARD_CRASH');
      this.setCabReverser(1);
      this.setCabCombinedNotch(5);
      const valEl = document.getElementById('leverVal');
      if (valEl) valEl.textContent = '施錠 (下)';
      closeSidebar();
    });

    on('btnScenarioUncouple', 'click', () => {
      this.physics.loadScenario('UNCOUPLING');
      this.setCabReverser(-1);
      this.setCabCombinedNotch(1);
      const valEl = document.getElementById('leverVal');
      if (valEl) valEl.textContent = '開放 (上)';
      closeSidebar();
    });

    on('btnScenarioRoughTrack', 'click', () => {
      this.physics.trackRoughness = 2.5;
      closeSidebar();
    });

    // 全リセット処理
    const doReset = () => {
      this.physics.reset();
      this.materialEngine.reset();
      if (this.charts) this.charts.reset();
      if (this.knuckleFEMViewer) this.knuckleFEMViewer.resetCamera();
      this.setCabReverser(1);
      this.setCabCombinedNotch(0);
      const lVal = document.getElementById('leverVal');
      if (lVal) lVal.textContent = '開放 (上)';
      const alertEl = document.getElementById('alertOverlay');
      if (alertEl) alertEl.style.display = 'none';
      closeSidebar();
    };
    on('btnResetAll', 'click', doReset);
    on('btnReset', 'click', doReset);

    // 6. ビューポート視点切替 & 背景切替
    on('btnBgToggle', 'click', () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      const bgCol = isLight ? 0xf8fafc : 0x0a0e14;
      this.scene.background = new THREE.Color(bgCol);
      if (this.scene.fog) this.scene.fog.color = new THREE.Color(bgCol);
    });

    on('camCloseUp', 'click', () => {
      this.camera.position.set(-0.25, 0.35, 0.75);
      this.controls.target.set(-0.25, 0.05, 0);
      this.controls.update();
    });

    on('camDraftGear', 'click', () => {
      this.camera.position.set(-0.35, 0.35, 0.80);
      this.controls.target.set(-0.25, 0.05, 0);
      this.controls.update();
    });

    on('camTop', 'click', () => {
      this.camera.position.set(-0.25, 2.20, 0.001);
      this.controls.target.set(-0.25, 0, 0);
      this.controls.update();
    });

    on('camSide', 'click', () => {
      this.camera.position.set(-0.25, 0.20, 2.20);
      this.controls.target.set(-0.25, 0.10, 0);
      this.controls.update();
    });

    on('camOverview', 'click', () => {
      this.camera.position.set(-0.55, 0.70, 2.30);
      this.controls.target.set(-0.55, 0.15, 0);
      this.controls.update();
    });

    // FEM応力カラー表示チェックボックス (フロート表示と完全双方向同期)
    on('toggleFEM', 'change', (e) => {
      this.setFemFloatVisible(e.target.checked);
    });

    // 右側パネルの詳細グラフフロート呼び出しボタン (クリックでフロート展開＆タブ切り替え＆チェックON)
    on('btnOpenFemTab', 'click', () => {
      this.setFemFloatVisible(true, 'tabFem3D');
    });
    on('btnOpenSSTab', 'click', () => {
      this.setFemFloatVisible(true, 'tabSS');
    });
    on('btnOpenForceTab', 'click', () => {
      this.setFemFloatVisible(true, 'tabForce');
    });
    on('btnOpenTelemTab', 'click', () => {
      this.setFemFloatVisible(true, 'tabTelemetry');
    });

    // 7. 時間制御（一時停止/コマ送り/速度倍率）
    on('btnTimePause', 'click', () => {
      this.isPaused = !this.isPaused;
      const lbl = document.getElementById('lblPause');
      if (lbl) lbl.textContent = this.isPaused ? '再開' : '停止';
    });
    on('btnTogglePlay', 'click', () => {
      this.isPaused = !this.isPaused;
      const lbl = document.getElementById('lblPause');
      if (lbl) lbl.textContent = this.isPaused ? '再開' : '停止';
    });

    on('btnTimeStep', 'click', () => {
      this.isPaused = true;
      const lbl = document.getElementById('lblPause');
      if (lbl) lbl.textContent = '再開';
      this.stepOnce(0.01);
    });

    // 速度ボタン
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const spd = parseFloat(btn.dataset.speed || '1.0');
        this.timeScale = spd;
        const badge = document.getElementById('timeScaleBadge');
        if (badge) badge.textContent = spd + 'x';
      });
    });

    // 材料選択 (<select id="selectMaterial"> およびボタン)
    const selMat = document.getElementById('selectMaterial');
    if (selMat) {
      selMat.addEventListener('change', (e) => {
        const matKey = e.target.value;
        if (matKey) {
          this.materialEngine.setMaterial(matKey);
          if (this.charts) this.charts.updateMaterial();
        }
      });
    }

    document.querySelectorAll('.mat-btn, .mat-radio').forEach(btn => {
      btn.addEventListener('click', () => {
        const matKey = btn.dataset.mat || btn.value;
        if (matKey) {
          this.materialEngine.setMaterial(matKey);
          if (selMat) selMat.value = matKey;
          if (this.charts) this.charts.updateMaterial();
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     車両運転台 (Cab Controller) 制御 & UI 双方向完全同期
     ------------------------------------------------------------------------ */
  syncCabUI() {
    const rev = this.physics.reverser;
    const p = this.physics.notchPower;
    const b = this.physics.notchBrake;

    // 1. 逆転器同期 (サイドバー)
    const rf = document.getElementById('revForward');
    const rn = document.getElementById('revNeutral');
    const rb = document.getElementById('revBackward');
    if (rf) rf.classList.toggle('active', rev === 1);
    if (rn) rn.classList.toggle('active', rev === 0);
    if (rb) rb.classList.toggle('active', rev === -1);

    // 逆転器同期 (運転台フロート)
    const cabRevF = document.getElementById('btnCabRevF');
    const cabRevN = document.getElementById('btnCabRevN');
    const cabRevR = document.getElementById('btnCabRevR');
    if (cabRevF) cabRevF.classList.toggle('active-forward', rev === 1);
    if (cabRevN) cabRevN.classList.toggle('active-neutral', rev === 0);
    if (cabRevR) cabRevR.classList.toggle('active-backward', rev === -1);

    // 2. マスコン・ノッチ同期
    const notchPowerLabels = ['切', 'P1', 'P2', 'P3', 'P4', 'P5'];
    const notchBrakeLabels = ['切', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', '非常'];

    const sliderPower = document.getElementById('sliderPower');
    if (sliderPower && parseInt(sliderPower.value, 10) !== p) sliderPower.value = String(p);
    const pVal = document.getElementById('notchPowerVal');
    if (pVal) pVal.textContent = notchPowerLabels[p] || '切';

    const sliderBrake = document.getElementById('sliderBrake');
    if (sliderBrake && parseInt(sliderBrake.value, 10) !== b) sliderBrake.value = String(b);
    const bVal = document.getElementById('notchBrakeVal');
    if (bVal) bVal.textContent = notchBrakeLabels[b] || '切';

    // 運転台ワンハンドルマスコン統合段数 (-8〜+5)
    let combined = 0;
    if (b > 0) combined = -b;
    else if (p > 0) combined = p;

    const sliderMascon = document.getElementById('sliderMasconCombined');
    if (sliderMascon && parseInt(sliderMascon.value, 10) !== combined) {
      sliderMascon.value = String(combined);
    }

    const notchBadge = document.getElementById('cabCurrentNotchText');
    if (notchBadge) {
      if (combined === -8) {
        notchBadge.textContent = '非常制動 (EB)';
        notchBadge.style.color = '#ef4444';
      } else if (combined < 0) {
        notchBadge.textContent = `制動 (B${-combined})`;
        notchBadge.style.color = '#f87171';
      } else if (combined === 0) {
        notchBadge.textContent = '中立 (N 惰行)';
        notchBadge.style.color = '#fbbf24';
      } else {
        notchBadge.textContent = `力行 (P${combined})`;
        notchBadge.style.color = '#10b981';
      }
    }

    const ledNotches = document.querySelectorAll('#cabLedBar .led-notch');
    ledNotches.forEach(el => {
      el.classList.remove('lit-brake', 'lit-neutral', 'lit-power');
      const tag = el.dataset.notch;
      if (combined < 0) {
        if (tag === `B${-combined}` || (combined === -8 && tag === 'EB')) {
          el.classList.add('lit-brake');
        }
      } else if (combined === 0) {
        if (tag === 'N') {
          el.classList.add('lit-neutral');
        }
      } else if (combined > 0) {
        if (tag === `P${combined}`) {
          el.classList.add('lit-power');
        }
      }
    });
  }

  setCabCombinedNotch(val) {
    const clamped = Math.max(-8, Math.min(5, val));
    if (clamped < 0) {
      this.physics.notchPower = 0;
      this.physics.notchBrake = -clamped;
    } else if (clamped > 0) {
      this.physics.notchPower = clamped;
      this.physics.notchBrake = 0;
    } else {
      this.physics.notchPower = 0;
      this.physics.notchBrake = 0;
    }
    this.syncCabUI();
  }

  setCabReverser(rev) {
    const val = rev > 0 ? 1 : (rev < 0 ? -1 : 0);
    this.physics.reverser = val;
    this.syncCabUI();
  }

  initCabController() {
    const cabFloat = document.getElementById('cabControllerFloat');
    const btnToggleCab = document.getElementById('btnToggleCab');
    const btnCabClose = document.getElementById('btnCabClose');
    const btnCabMin = document.getElementById('btnCabMin');
    const cabHeader = document.getElementById('cabFloatHeader');

    if (btnToggleCab && cabFloat) {
      btnToggleCab.addEventListener('click', () => {
        cabFloat.classList.toggle('closed');
      });
    }
    if (btnCabClose && cabFloat) {
      btnCabClose.addEventListener('click', () => {
        cabFloat.classList.add('closed');
      });
    }
    if (btnCabMin && cabFloat) {
      btnCabMin.addEventListener('click', () => {
        cabFloat.classList.toggle('minimized');
      });
    }

    if (cabHeader && cabFloat) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      cabHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = cabFloat.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        cabFloat.style.bottom = 'auto';
        cabFloat.style.right = 'auto';
        cabFloat.style.left = initialLeft + 'px';
        cabFloat.style.top = initialTop + 'px';
        cabFloat.style.margin = '0';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        cabFloat.style.left = Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx)) + 'px';
        cabFloat.style.top = Math.max(10, Math.min(window.innerHeight - 80, initialTop + dy)) + 'px';
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = '';
        }
      });
    }

    const cabRevF = document.getElementById('btnCabRevF');
    const cabRevN = document.getElementById('btnCabRevN');
    const cabRevR = document.getElementById('btnCabRevR');
    if (cabRevF) cabRevF.addEventListener('click', () => this.setCabReverser(1));
    if (cabRevN) cabRevN.addEventListener('click', () => this.setCabReverser(0));
    if (cabRevR) cabRevR.addEventListener('click', () => this.setCabReverser(-1));

    const btnBrake = document.getElementById('btnMasconBrake');
    const btnNeutral = document.getElementById('btnMasconNeutral');
    const btnPower = document.getElementById('btnMasconPower');
    const sliderMascon = document.getElementById('sliderMasconCombined');

    const getCombined = () => {
      if (this.physics.notchBrake > 0) return -this.physics.notchBrake;
      if (this.physics.notchPower > 0) return this.physics.notchPower;
      return 0;
    };

    if (btnBrake) {
      btnBrake.addEventListener('click', () => {
        this.setCabCombinedNotch(getCombined() - 1);
      });
    }
    if (btnNeutral) {
      btnNeutral.addEventListener('click', () => {
        this.setCabCombinedNotch(0);
      });
    }
    if (btnPower) {
      btnPower.addEventListener('click', () => {
        this.setCabCombinedNotch(getCombined() + 1);
      });
    }
    if (sliderMascon) {
      sliderMascon.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setCabCombinedNotch(val);
      });
    }

    const ledNotches = document.querySelectorAll('#cabLedBar .led-notch');
    ledNotches.forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const tag = el.dataset.notch;
        if (tag === 'EB' || tag === 'B8') this.setCabCombinedNotch(-8);
        else if (tag && tag.startsWith('B')) this.setCabCombinedNotch(-parseInt(tag.substring(1), 10));
        else if (tag === 'N') this.setCabCombinedNotch(0);
        else if (tag && tag.startsWith('P')) this.setCabCombinedNotch(parseInt(tag.substring(1), 10));
      });
    });
  }

  initTimeControls() {
    const badge = document.getElementById('timeScaleBadge');
    const btnPause = document.getElementById('btnTimePause');
    const btnStep = document.getElementById('btnTimeStep');
    const speedButtons = document.querySelectorAll('.speed-btn');

    // 速度ボタンクリック
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const spd = parseFloat(btn.dataset.speed) || 1.0;
        this.timeScale = spd;
        this.isPaused = false;

        if (btnPause) {
          btnPause.classList.remove('paused');
          btnPause.innerHTML = '<i class="ph-bold ph-pause"></i> 一時停止';
        }

        if (badge) {
          badge.textContent = btn.textContent.trim();
          badge.style.color = spd <= 0.1 ? '#00f2fe' : (spd < 1.0 ? '#fbbf24' : '#68d391');
        }
      });
    });

    // 一時停止ボタン
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          btnPause.classList.add('paused');
          btnPause.innerHTML = '<i class="ph-bold ph-play"></i> 再開';
          if (badge) {
            badge.textContent = '⏸ 一時停止中';
            badge.style.color = '#f87171';
          }
        } else {
          btnPause.classList.remove('paused');
          btnPause.innerHTML = '<i class="ph-bold ph-pause"></i> 一時停止';
          const activeBtn = document.querySelector('.speed-btn.active');
          if (badge && activeBtn) {
            badge.textContent = activeBtn.textContent.trim();
            const spd = this.timeScale;
            badge.style.color = spd <= 0.1 ? '#00f2fe' : (spd < 1.0 ? '#fbbf24' : '#68d391');
          }
        }
      });
    }

    // コマ送りボタン (+0.01秒ステップ)
    if (btnStep) {
      btnStep.addEventListener('click', () => {
        this.isPaused = true;
        this.stepOnce = true;
        if (btnPause) {
          btnPause.classList.add('paused');
          btnPause.innerHTML = '<i class="ph-bold ph-play"></i> 再開';
        }
        if (badge) {
          badge.textContent = '⏭ コマ送り (+0.01s)';
          badge.style.color = '#38bdf8';
        }
      });
    }
  }

  /* ------------------------------------------------------------------------
     フロートウィンドウのタブ切り替え
     ------------------------------------------------------------------------ */
  initFloatTabs() {
    const tabBtns = document.querySelectorAll('.float-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.dataset.tab;
        this.switchFloatTab(targetTabId);
      });
    });

    // デフォルトでナックル3D FEM表示タブをアクティブ化
    this.switchFloatTab('tabFem3D');

    // 閉じるボタン: フロート非表示 & toggleFEM チェックボックス OFF (同期)
    const btnClose = document.getElementById('btnFemFloatClose') || document.getElementById('btnFloatClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.setFemFloatVisible(false);
      });
    }

    // 最小化/展開ボタン
    const btnMin = document.getElementById('btnFemFloatMin');
    const floatEl = document.getElementById('knuckleFemFloat');
    if (btnMin && floatEl) {
      btnMin.addEventListener('click', () => {
        floatEl.classList.toggle('minimized');
      });
    }

    // カメラ視点リセットボタン
    const btnCam = document.getElementById('btnFemFloatCam');
    if (btnCam) {
      btnCam.addEventListener('click', () => {
        if (this.knuckleFEMViewer) this.knuckleFEMViewer.resetCamera();
      });
    }
  }

  /* ------------------------------------------------------------------------
     フロートウィンドウの自由移動 & 右下ハンドルによる可変サイズリサイズ
     ------------------------------------------------------------------------ */
  initFloatDraggableAndResizable() {
    const floatEl = document.getElementById('knuckleFemFloat');
    const headerEl = document.getElementById('femFloatHeader');
    const resizeHandle = document.getElementById('femFloatResize');
    if (!floatEl) return;

    // 1. ヘッダードラッグによる移動
    if (headerEl) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = floatEl.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        floatEl.style.bottom = 'auto';
        floatEl.style.right = 'auto';
        floatEl.style.left = initialLeft + 'px';
        floatEl.style.top = initialTop + 'px';
        floatEl.style.margin = '0';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        floatEl.style.left = Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx)) + 'px';
        floatEl.style.top = Math.max(10, Math.min(window.innerHeight - 80, initialTop + dy)) + 'px';
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = '';
        }
      });
    }

    // 2. 右下リサイズハンドルによるスムーズ可変サイズ
    if (resizeHandle) {
      let isResizing = false;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = floatEl.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;

        floatEl.style.bottom = 'auto';
        floatEl.style.right = 'auto';
        floatEl.style.left = rect.left + 'px';
        floatEl.style.top = rect.top + 'px';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dw = e.clientX - startX;
        const dh = e.clientY - startY;

        const newW = Math.max(300, Math.min(window.innerWidth * 0.85, startW + dw));
        const newH = Math.max(200, Math.min(window.innerHeight * 0.85, startH + dh));

        floatEl.style.width = newW + 'px';
        floatEl.style.height = newH + 'px';

        if (this.knuckleFEMViewer) this.knuckleFEMViewer.resize();
        if (this.charts) this.charts.resize();
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = '';
          if (this.knuckleFEMViewer) this.knuckleFEMViewer.resize();
          if (this.charts) this.charts.resize();
        }
      });
    }
  }


  /* ------------------------------------------------------------------------
     キーボードショートカット (Space: 一時停止/再開, ArrowRight: コマ送り, R: 視点リセット)
     ------------------------------------------------------------------------ */

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      const getCombined = () => {
        if (this.physics.notchBrake > 0) return -this.physics.notchBrake;
        if (this.physics.notchPower > 0) return this.physics.notchPower;
        return 0;
      };

      // ユーザー指定仕様:
      // 奥に倒すとブレーキ（制動）（↑）
      // 中央惰行（スペース）
      // 手前に倒すと加速（力行）（↓）
      // 逆転ハンドル（R）
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setCabCombinedNotch(getCombined() - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setCabCombinedNotch(getCombined() + 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.setCabCombinedNotch(0); // 中央惰行
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        // 逆転器切り替え (前進1 -> 中立0 -> 後進-1 -> 前進1)
        const currentRev = this.physics.reverser;
        let nextRev = 1;
        if (currentRev === 1) nextRev = 0;
        else if (currentRev === 0) nextRev = -1;
        else nextRev = 1;
        this.setCabReverser(nextRev);
      } else if (e.key === 'w' || e.key === 'W') {
        // 互換キー: 力行アップ
        this.setCabCombinedNotch(getCombined() + 1);
      } else if (e.key === 's' || e.key === 'S') {
        // 互換キー: 制動アップ
        this.setCabCombinedNotch(getCombined() - 1);
      } else if (e.key === 'x' || e.key === 'X') {
        // 互換キー: 惰行
        this.setCabCombinedNotch(0);
      } else if (e.key === 'a' || e.key === 'A') {
        // 開放てこトリガー
        const btnTrip = document.getElementById('btnTripLever');
        if (btnTrip) btnTrip.click();
      } else if (e.key === 'c' || e.key === 'C') {
        // ナックル手押し閉鎖
        const btnClose = document.getElementById('btnCloseKnuckle');
        if (btnClose) btnClose.click();
      }
    });
  }

  syncFEMCameraWithMain() {
    if (!this.knuckleFEMViewer || !this.knuckleFEMViewer.camera || !this.camera || !this.controls) return;

    // メインカメラの注視目標点からの視線方向ベクトル (正規化)
    const target = this.controls.target || new THREE.Vector3(-0.25, 0.05, 0);
    const viewDir = this.camera.position.clone().sub(target).normalize();

    // ナックルパーツ単一で全体がキャンバスに100%美しく収まる距離
    const fitDist = this.knuckleFEMViewer.computeFitDistance ?
                    this.knuckleFEMViewer.computeFitDistance() :
                    (this.knuckleFEMViewer.fitDistance || 0.62);

    // メイン画面の俯瞰方法（上面・側面・斜め見下ろし・ドラッグ回転）と完全同期
    this.knuckleFEMViewer.camera.position.copy(viewDir).multiplyScalar(fitDist);
    this.knuckleFEMViewer.camera.up.copy(this.camera.up);
    this.knuckleFEMViewer.camera.lookAt(0, 0, 0);

    // ナックル実物の回転角（締結開閉動作）も連動 (回転方向はメイン3Dと完全一致)
    if (this.knuckleFEMViewer.knuckleGroup) {
      const radA = -((this.physics.knuckleAngleA || 0) * Math.PI) / 180.0;
      this.knuckleFEMViewer.knuckleGroup.rotation.y = radA;
    }

    this.knuckleFEMViewer.render();
  }

  animate(t) {
    requestAnimationFrame(this.animate);
    const rawDt = (t - this.lastTime) * 0.001;
    this.lastTime = t;

    // スローモーション & コマ送り対応タイムステップ
    let dt = 0.0;
    if (this.isPaused) {
      if (this.stepOnce) {
        dt = 0.01;
        this.stepOnce = false;
      } else {
        dt = 0.0;
      }
    } else {
      dt = Math.min(0.05, rawDt) * (this.timeScale !== undefined ? this.timeScale : 1.0);
    }

    const phys = this.physics.step(dt, this.materialEngine);
    const fem = this.femEngine.compute(
      phys.contactForceX, phys.contactForceY, phys.contactForceZ,
      this.materialEngine.mat.yieldStress
    );
    const normalS = phys.contactForceX > 0 ? fem.maxGlobalStress : -fem.maxGlobalStress;
    const shearS = Math.abs(phys.contactForceY + phys.contactForceZ) / 0.0048;
    const mat = this.materialEngine.update(fem.maxGlobalStress, normalS, shearS);

    this.coupler3D.update(phys, fem, this.materialEngine);
    this.coupler3D.updateStressColors(fem, this.materialEngine, this.showFEM);

    // ナックル本物CAD STL 3D FEMのリアルタイム応力コンター & 衝突点更新
    if (this.knuckleFEMViewer) {
      this.knuckleFEMViewer.updateStress(
        fem.maxGlobalStress / 1e6,
        (this.materialEngine.mat ? this.materialEngine.mat.yieldStress : 275e6) / 1e6,
        phys.knuckleAngleA,
        phys.state,
        phys.contactForceX
      );
    }

    // 3Dメインの拡大像カメラとFEMカメラを毎フレームリアルタイム連動
    this.syncFEMCameraWithMain();
    this.charts.update(dt, phys, mat);
    this.updateTelemetry(phys, fem, mat);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateTelemetry(phys, fem, mat) {
    const elSpeed = document.getElementById('hudSpeed');
    if (elSpeed) elSpeed.textContent = (phys.speedKmh || 0).toFixed(1) + ' km/h';

    // デバッグ表示: ナックル角度A, ナックル角度B, 連結器間距離
    const dbgDist = document.getElementById('dbgRelDist');
    if (dbgDist) dbgDist.textContent = (Math.abs(phys.posB - phys.posA) || 0).toFixed(3) + ' m';

    const dbgAngleA = document.getElementById('dbgKnuckleA');
    if (dbgAngleA) dbgAngleA.textContent = (phys.knuckleAngleA || 0).toFixed(1) + '°';

    const dbgAngleB = document.getElementById('dbgKnuckleB');
    if (dbgAngleB) dbgAngleB.textContent = (phys.knuckleAngleB || 0).toFixed(1) + '°';

    const dbgState = document.getElementById('dbgCouplerState');
    if (dbgState) {
      let stateName = '非連結 (開放)';
      if (phys.state === COUPLER_STATES.LOCKED) stateName = '施錠 (連結完了)';
      else if (phys.state === COUPLER_STATES.ENGAGING) stateName = '先端内面衝突・押し込み回転中';
      else if (phys.state === COUPLER_STATES.APPROACHING) stateName = '接近中 (開放非接触)';
      else if (phys.state === COUPLER_STATES.UNLOCKED) stateName = '解結操作中';
      dbgState.textContent = stateName;
    }
    const elDist = document.getElementById('hudRelDist');
    if (elDist) elDist.textContent = (Math.abs(phys.posB - phys.posA) || 0).toFixed(3) + ' m';

    const elForce = document.getElementById('hudContactForce');
    if (elForce) elForce.textContent = ((phys.contactForceX || 0) / 1000).toFixed(1) + ' kN';

    const elStroke = document.getElementById('hudDraftStroke');
    if (elStroke) elStroke.textContent = ((phys.draftStrokeA || 0) * 1000).toFixed(1) + ' mm';

    // 連結状態バッジ (connStatus / connStatusText)
    const connStatus = document.getElementById('connStatus');
    const connText = document.getElementById('connStatusText');
    const badgeLegacy = document.getElementById('badgeCouplerState');

    let statusClass = 'status-unlocked';
    let statusLabel = '解結 (開口)';

    if (mat && mat.isFractured) {
      statusClass = 'status-failed';
      statusLabel = '破断: ' + (mat.failureMode || '過大過重');
    } else if (phys.state === COUPLER_STATES.LOCKED) {
      statusClass = 'status-locked';
      statusLabel = '完全締結 (ロック)';
    } else if (phys.state === COUPLER_STATES.ENGAGING) {
      statusClass = 'status-engaging';
      statusLabel = '噛合案内中';
    } else if (phys.state === COUPLER_STATES.APPROACHING) {
      statusClass = 'status-approaching';
      statusLabel = '接近中';
    } else if (phys.state === COUPLER_STATES.UNLOCKED) {
      statusClass = 'status-unlocked';
      statusLabel = '解結操作中';
    }

    if (connStatus) {
      connStatus.className = 'status-badge ' + statusClass;
    }
    if (connText) {
      connText.textContent = statusLabel;
    }
    if (badgeLegacy) {
      badgeLegacy.className = 'status-badge ' + statusClass;
      badgeLegacy.textContent = statusLabel;
    }
  }}

window.addEventListener('DOMContentLoaded', () => {
  new CouplerApp();
});

