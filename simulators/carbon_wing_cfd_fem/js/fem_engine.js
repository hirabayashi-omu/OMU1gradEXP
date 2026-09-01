/**
 * fem_engine.js - 有限要素法（FEM）構造解析エンジン
 * CFRP翼の2D平面応力 + スパン方向梁要素 連成解析
 */

'use strict';

const FEMEngine = (() => {

  // -------------------------------------------------------
  // CFRP材料プリセット（積層構成別）
  // -------------------------------------------------------
  const LAYUP_PRESETS = {
    'UD_0': {
      name: '[0°] 一方向 (UD)',
      desc: 'スパン方向に最大剛性',
      E1: 135e9,  // Pa
      E2: 10e9,
      G12: 5.5e9,
      nu12: 0.28,
      rho: 1600,  // kg/m³
      Xt: 1500e6, // 引張強度
      Xc: 1200e6, // 圧縮強度
      Yt: 50e6,
      Yc: 200e6,
      S12: 70e6,
      color: '#00d4ff',
    },
    'CROSS_0_90': {
      name: '[0/90]s クロスプライ',
      desc: 'バランス型・扱いやすい',
      E1: 72e9,
      E2: 72e9,
      G12: 5.5e9,
      nu12: 0.05,
      rho: 1600,
      Xt: 700e6,
      Xc: 700e6,
      Yt: 700e6,
      Yc: 700e6,
      S12: 70e6,
      color: '#00ff88',
    },
    'ANGLE_45': {
      name: '[±45]s アングルプライ',
      desc: 'せん断剛性最大',
      E1: 17e9,
      E2: 17e9,
      G12: 45e9,
      nu12: 0.65,
      rho: 1600,
      Xt: 250e6,
      Xc: 250e6,
      Yt: 250e6,
      Yc: 250e6,
      S12: 400e6,
      color: '#ff8800',
    },
    'QUASI_ISO': {
      name: '[0/±45/90]s 擬似等方性 (QI)',
      desc: '旅客機一般部材の標準',
      E1: 54e9,
      E2: 54e9,
      G12: 20e9,
      nu12: 0.30,
      rho: 1600,
      Xt: 600e6,
      Xc: 600e6,
      Yt: 600e6,
      Yc: 600e6,
      S12: 300e6,
      color: '#cc44ff',
    },
    'HYBRID': {
      name: '[0/±45/0]s ハイブリッド',
      desc: '曲げ + せん断の複合最適化',
      E1: 95e9,
      E2: 30e9,
      G12: 15e9,
      nu12: 0.20,
      rho: 1600,
      Xt: 1000e6,
      Xc: 800e6,
      Yt: 200e6,
      Yc: 300e6,
      S12: 150e6,
      color: '#ff3366',
    },
    'DURALUMIN_7075': {
      name: '超々ジュラルミン (A7075-T6)',
      desc: '最高強度アルミ合金（航空機主翼・零戦開発材）',
      E1: 71.7e9,
      E2: 71.7e9,
      G12: 26.9e9,
      nu12: 0.33,
      rho: 2810, // CFRP比 1.75倍
      Xt: 505e6, // 降伏耐力 [Pa]
      Xc: 505e6,
      Yt: 505e6,
      Yc: 505e6,
      S12: 330e6,
      color: '#e6c86e',
      isMetal: true,
    },
    'DURALUMIN_2024': {
      name: 'ジュラルミン (2024-T3)',
      desc: '旅客機主翼・外板の標準アルミ合金（高靭性）',
      E1: 73.1e9,
      E2: 73.1e9,
      G12: 28.0e9,
      nu12: 0.33,
      rho: 2780, // CFRP比 1.74倍
      Xt: 345e6, // 降伏耐力 [Pa]
      Xc: 345e6,
      Yt: 345e6,
      Yc: 345e6,
      S12: 280e6,
      color: '#a8c6e0',
      isMetal: true,
    },
  };

  // -------------------------------------------------------
  // 1D 梁FEM（スパン方向の曲げ解析）
  // -------------------------------------------------------
  /**
   * Euler-Bernoulli 梁要素の剛性マトリクス (4x4)
   * @param {number} E - 弾性率 [Pa]
   * @param {number} I - 断面2次モーメント [m^4]
   * @param {number} L - 要素長さ [m]
   * @returns {number[][]} 4x4 要素剛性マトリクス
   */
  function beamStiffness(E, I, L) {
    const EI_L3 = E * I / (L * L * L);
    return [
      [ 12*EI_L3,    6*L*EI_L3,  -12*EI_L3,    6*L*EI_L3 ],
      [  6*L*EI_L3,  4*L*L*EI_L3, -6*L*EI_L3,  2*L*L*EI_L3 ],
      [-12*EI_L3,   -6*L*EI_L3,   12*EI_L3,   -6*L*EI_L3 ],
      [  6*L*EI_L3,  2*L*L*EI_L3, -6*L*EI_L3,  4*L*L*EI_L3 ],
    ];
  }

  /**
   * 対称行列のコレスキー分解（ガウスの消去法で代用）
   * 小規模なので単純なピボット付きガウス消去を使う
   */
  function solveLinear(K, f) {
    const n = f.length;
    const A = K.map(row => [...row]);
    const b = [...f];

    // 前進消去
    for (let i = 0; i < n; i++) {
      // ピボット選択
      let maxRow = i;
      let maxVal = Math.abs(A[i][i]);
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxVal) {
          maxVal = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [b[i], b[maxRow]] = [b[maxRow], b[i]];

      for (let k = i + 1; k < n; k++) {
        const factor = A[k][i] / A[i][i];
        for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
        b[k] -= factor * b[i];
      }
    }

    // 後退代入
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i];
      for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
      x[i] /= A[i][i];
    }
    return x;
  }

  /**
   * スパン方向の曲げ解析（梁FEM）
   * @param {object} params
   * @returns {{ deflections, rotations, moments, shears, stresses, safetyFactors }}
   */
  function analyzeBeam(params) {
    const {
      span = 15,      // スパン [m]
      nElem = 100,    // 要素数 (100要素メッシュ)
      chord = 1.5,    // 弦長 [m]
      layupKey = 'QUASI_ISO',
      airfoilKey = 'NACA2412',
      liftDist,       // [{y, L_per_unit}] スパン揚力分布
      thickness_ratio = 0.12,
    } = params;

    const mat = LAYUP_PRESETS[layupKey] || LAYUP_PRESETS['QUASI_ISO'];
    const secProps = Airfoil.getSectionProperties(airfoilKey, layupKey);

    // 実スケール断面特性
    const Ixx = secProps.Ixx * Math.pow(chord, 4); // [m^4]
    const E = mat.E1; // スパン方向弾性率 [Pa]
    const EI = E * Ixx;

    const nNode = nElem + 1;
    const Le = span / nElem; // 要素長さ [m]
    const ndof = nNode * 2;  // 各ノード: 変位 + 回転 = 2DOF

    // 全体剛性マトリクス
    const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
    const F = new Array(ndof).fill(0);

    // 要素剛性の組み立て
    for (let e = 0; e < nElem; e++) {
      const ke = beamStiffness(E, Ixx, Le);
      const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          K[dofs[i]][dofs[j]] += ke[i][j];
        }
      }
    }

    // 分布荷重を等価節点力に変換
    for (let e = 0; e < nElem; e++) {
      const y1 = e * Le;
      const y2 = (e + 1) * Le;

      // 揚力分布の補間
      const L1 = interpolateLift(liftDist, y1 - span / 2);
      const L2 = interpolateLift(liftDist, y2 - span / 2);
      const Lavg = (L1 + L2) / 2;

      // 分布荷重の等価節点力（一様近似）
      // F_nodal = w*L/2 (平行移動), M_nodal = w*L²/12 (モーメント)
      F[2 * e]     += Lavg * Le / 2;
      F[2 * e + 1] += Lavg * Le * Le / 12;
      F[2 * e + 2] += Lavg * Le / 2;
      F[2 * e + 3] -= Lavg * Le * Le / 12;
    }

    // 境界条件（翼根固定: u=0, θ=0 at node 0）
    // ペナルティ法で固定
    const penalty = EI * 1e8;
    K[0][0] += penalty;
    K[1][1] += penalty;

    // 連立方程式を解く
    const u = solveLinear(K, F);

    // 結果の格納
    const deflections = [];
    const rotations = [];
    for (let i = 0; i < nNode; i++) {
      deflections.push(u[2 * i]);
      rotations.push(u[2 * i + 1]);
    }

    // 断面力（曲げモーメント・せん断力）を計算
    const moments = [];
    const shears = [];
    for (let e = 0; e < nElem; e++) {
      // 要素変位ベクトル
      const ue = [
        u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]
      ];
      // EI/L^2 * [d²w/dx²] ≈ 曲げモーメント（要素中点）
      const M = EI / (Le * Le) * (6 * ue[0] + 2 * Le * ue[1] - 6 * ue[2] + 4 * Le * ue[3] - 6 * ue[0] - 4 * Le * ue[1] + 6 * ue[2] - 2 * Le * ue[3]);
      const M_mid = EI * (6 * (ue[0] - ue[2]) / (Le * Le * Le) + (4 * ue[1] + 2 * ue[3]) / (Le * Le)) * Le / 2;
      moments.push(Math.abs(M_mid));
      // せん断力 V = dM/dx
      const V = EI * (12 * (ue[0] - ue[2]) / (Le * Le * Le) + 6 * (ue[1] + ue[3]) / (Le * Le));
      shears.push(Math.abs(V));
    }

    // 曲げ応力（最外縁）
    const stresses = moments.map(M => {
      const yMax = chord * thickness_ratio / 2; // 中立軸から表面まで
      return M * yMax / Ixx; // σ = My/I [Pa]
    });

    // 安全率（Tsai-Wu基準 簡易版）
    const safetyFactors = stresses.map(sigma => {
      const X = sigma >= 0 ? mat.Xt : mat.Xc;
      return X / (Math.abs(sigma) + 1);
    });

    // 最大値サマリー
    const maxDeflection = Math.max(...deflections.map(Math.abs));
    const maxStress = Math.max(...stresses);
    const minSF = Math.min(...safetyFactors);
    const tipDeflection = deflections[nNode - 1];

    return {
      deflections,
      rotations,
      moments,
      shears,
      stresses,
      safetyFactors,
      maxDeflection,
      maxStress,
      minSF,
      tipDeflection,
      nNode,
      nElem,
      Le,
      span,
      material: mat,
    };
  }

  /**
   * 線形補間で揚力値を得る
   */
  function interpolateLift(liftDist, y) {
    if (!liftDist || liftDist.length === 0) return 0;
    for (let i = 0; i < liftDist.length - 1; i++) {
      if (y >= liftDist[i].y && y <= liftDist[i + 1].y) {
        const t = (y - liftDist[i].y) / (liftDist[i + 1].y - liftDist[i].y);
        return liftDist[i].L_per_unit * (1 - t) + liftDist[i + 1].L_per_unit * t;
      }
    }
    return liftDist[0].L_per_unit;
  }

  /**
   * Tsai-Wu 破壊基準（簡易版）
   * @param {number} sigma1 - 繊維方向応力 [Pa]
   * @param {number} sigma2 - 直交方向応力 [Pa]
   * @param {number} tau12 - 面内せん断応力 [Pa]
   * @param {object} mat - 材料プリセット
   * @returns {number} Tsai-Wu 指数 (< 1: 安全, > 1: 破断)
   */
  function tsaiWu(sigma1, sigma2, tau12, mat) {
    const F1 = 1 / mat.Xt - 1 / mat.Xc;
    const F2 = 1 / mat.Yt - 1 / mat.Yc;
    const F11 = 1 / (mat.Xt * mat.Xc);
    const F22 = 1 / (mat.Yt * mat.Yc);
    const F66 = 1 / (mat.S12 * mat.S12);
    const F12 = -0.5 * Math.sqrt(F11 * F22);

    return F1 * sigma1 + F2 * sigma2
         + F11 * sigma1 * sigma1 + F22 * sigma2 * sigma2
         + 2 * F12 * sigma1 * sigma2 + F66 * tau12 * tau12;
  }

  return {
    LAYUP_PRESETS,
    analyzeBeam,
    tsaiWu,
    interpolateLift,
  };
})();
