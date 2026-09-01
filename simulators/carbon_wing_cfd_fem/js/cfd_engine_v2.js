/**
 * cfd_engine.js - CFD解析エンジン（薄翼理論 + パネル法近似）
 * 揚力係数、抗力係数、翼面圧力分布を計算する
 */

'use strict';

const CFDEngine = (() => {

  // -------------------------------------------------------
  // 定数
  // -------------------------------------------------------
  const AIR_DENSITY = 1.225;   // kg/m³ (海面標準大気)
  const AIR_VISCOSITY = 1.789e-5; // Pa·s

  // -------------------------------------------------------
  // CFRP翼の材料プリセット（空力には無関係だがUIで共有）
  // -------------------------------------------------------

  /**
   * 圧力係数 Cp を Bernoulli 式で計算
   * @param {number} Vlocal - 局所速度
   * @param {number} Vinf - 一様流速度
   * @returns {number} Cp
   */
  function cpFromVelocity(Vlocal, Vinf) {
    return 1 - (Vlocal / Vinf) ** 2;
  }

  /**
   * NACA翼型の表面速度分布を計算（ポテンシャル流近似＋フラップ展開効果）
   * @param {Array} upper - 上面座標 [{x,y}]
   * @param {Array} lower - 下面座標 [{x,y}]
   * @param {number} alpha - 迎角 [rad]
   * @param {number} Vinf - 一様流速度 [m/s]
   * @param {string} presetKey - 翼型キー
   * @param {number} flapDeg - フラップ展開角 [deg]
   * @returns {{ cpUpper, cpLower, clInviscid, cdForm }} 
   */
  function computePressure(upper, lower, alpha, Vinf, presetKey, flapDeg = 0) {
    const preset = Airfoil.PRESETS[presetKey] || Airfoil.PRESETS['NACA2412'];
    const { m, p, t } = preset;

    const N = upper.length - 1;
    const cpUpper = new Array(N + 1);
    const cpLower = new Array(N + 1);

    // フラップ展開によるゼロ揚力角のマイナスシフト（揚力激増効果）
    // 理論値: d(alphaL0)/d(deltaF) ≈ -0.65 ~ -0.75 for 30% flap chord
    const deltaFRad = (flapDeg || 0) * Math.PI / 180;
    const flapAlphaL0Shift = -0.70 * deltaFRad;

    // 薄翼理論の Cl 計算
    const alphaL0Base = (m > 0 && p > 0) ? -(2 * m) : 0;
    const alphaL0 = alphaL0Base + flapAlphaL0Shift; // フラップ展開時ゼロ揚力角が大幅に低下
    const clInviscid = 2 * Math.PI * (alpha - alphaL0);

    // 表面速度分布（ポテンシャル流 + 薄翼近似 + フラップ吹き下げ効果）
    for (let i = 0; i <= N; i++) {
      const xi = upper[i].x; // 局所位置

      const cosineX = Math.max(0, Math.min(1, xi));
      
      // 揚力による速度増分
      const gammaFactor = (cosineX > 0.001 && cosineX < 0.999)
        ? 2 * (alpha - flapAlphaL0Shift * 0.7) * Math.sqrt((1 - cosineX) / cosineX)
        : 0;

      // 厚み効果
      const thickFactor = 1.0 + 4 * t * (0.2969 / (2 * Math.sqrt(Math.max(cosineX, 0.001)))
        - 0.1260 - 0.7032 * cosineX + 0.8529 * cosineX * cosineX - 0.4144 * cosineX * cosineX * cosineX);

      const Vu = Vinf * Math.max(0.1, thickFactor + gammaFactor * 0.5);
      const Vl = Vinf * Math.max(0.1, thickFactor - gammaFactor * 0.5);

      cpUpper[i] = cpFromVelocity(Vu, Vinf);
      cpLower[i] = cpFromVelocity(Vl, Vinf);
    }

    // 失速モデル（フラップ展開時は最大揚力が増大し、失速角が若干変化）
    const alphaStall = (15 + 5 * m / 0.04 - (flapDeg * 0.12)) * Math.PI / 180; // 失速角 [rad]
    const alphaAbs = Math.abs(alpha);
    let clFinal = clInviscid;
    let stallFactor = 1.0;

    if (alphaAbs > alphaStall) {
      const excess = (alphaAbs - alphaStall);
      stallFactor = Math.max(0.2, 1.0 - 2.5 * excess);
      clFinal = clInviscid * stallFactor;

      if (alpha > 0) {
        for (let i = Math.floor(N * 0.3); i <= N; i++) {
          cpUpper[i] = cpUpper[i] * stallFactor + (1 - stallFactor) * 0.2;
        }
      }
    }

    // 粘性抗力 + フラップブレーキ抗力
    const cdFriction = 0.0065 * (1 + 0.6 * t);
    const cdPressure = clFinal * clFinal / (Math.PI * 8);
    // フラップ展開による形状抗力増分（ブレーキ効果）
    const cdFlap = 0.0018 * flapDeg + 0.00014 * flapDeg * flapDeg;
    const cdForm = cdFriction + cdPressure + cdFlap;

    // ピッチングモーメント係数 Cm (1/4弦回り)
    const cm = -Math.PI * (alpha + alphaL0) / 2 + 0.25 * (clFinal - clInviscid * stallFactor) * 0;

    return { cpUpper, cpLower, clFinal, cdForm, alphaL0, stallFactor, alphaStall };
  }

  /**
   * 揚力・抗力を物理量で返す
   * @param {number} Cl
   * @param {number} Cd  
   * @param {number} Vinf - 速度 [m/s]
   * @param {number} chord - 翼弦長 [m]
   * @param {number} span - 翼スパン [m]
   * @returns {{ lift, drag }} [N/m (スパン単位長さ当たり)]
   */
  function computeForces(Cl, Cd, Vinf, chord, span) {
    const q = 0.5 * AIR_DENSITY * Vinf * Vinf; // 動圧 [Pa]
    const Sref = chord * span; // 基準面積 [m²]
    const lift = q * Sref * Cl;
    const drag = q * Sref * Cd;
    return { lift, drag, qDynamic: q };
  }

  /**
   * スパン方向の揚力分布（楕円分布近似）
   * @param {number} Cl - 揚力係数
   * @param {number} span - スパン [m]
   * @param {number} chord - 弦長 [m]
   * @param {number} Vinf - 一様流速度
   * @param {number} nSpan - スパン分割数
   * @returns {Array<{y, L_per_unit}>} 各スパン位置の揚力分布 [N/m]
   */
  function computeSpanwiseLift(Cl, span, chord, Vinf, nSpan = 20) {
    const q = 0.5 * AIR_DENSITY * Vinf * Vinf;
    const L_total = q * span * chord * Cl;
    const distribution = [];

    // 楕円分布: L(y) = L0 * sqrt(1 - (2y/b)²)
    // L0 は全揚力と一致するよう正規化
    // ∫ L(y) dy = L0 * π*b/4 → L0 = 4*L_total / (π*b)
    const L0 = (4 * L_total) / (Math.PI * span);

    for (let i = 0; i <= nSpan; i++) {
      const yi = (i / nSpan - 0.5) * span; // -b/2 ~ +b/2
      const eta = 2 * yi / span;
      const Ly = L0 * Math.sqrt(Math.max(0, 1 - eta * eta));
      distribution.push({ y: yi, L_per_unit: Ly });
    }
    return distribution;
  }

  /**
   * 流線追跡用の速度場を格子点で計算する
   * （翼型周りのポテンシャル流: ランキン楕円 + 循環）
   * @param {object} airfoilData - generate()の戻り値
   * @param {number} alpha - 迎角 [rad]
   * @param {number} Vinf - 一様流速度 [m/s]
   * @param {number} gridW - グリッド幅
   * @param {number} gridH - グリッド高さ
   * @param {number} nx - x分割
   * @param {number} ny - y分割
   * @returns {Array<Array<{u,v}>>} 速度場
   */
  function computeVelocityField(airfoilData, alpha, Vinf, gridW, gridH, nx, ny) {
    const field = [];
    const chord = airfoilData.chord;
    const { m, p, t } = airfoilData.preset;

    // 翼型内部かどうかを簡易判定
    function isInsideAirfoil(x, y) {
      const xi = x / chord;
      if (xi < 0 || xi > 1) return false;
      const yt = Airfoil ? thickness_local(xi, t) : 0;
      const { yc } = camber_local(xi, m, p);
      return Math.abs(y / chord - yc) < yt * 1.05;
    }

    function thickness_local(x, t) {
      return (t / 0.2) * (
        0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x
      );
    }
    function camber_local(x, m, p) {
      if (m === 0 || p === 0) return { yc: 0 };
      if (x < p) return { yc: (m / (p * p)) * (2 * p * x - x * x) };
      return { yc: (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x) };
    }

    // 循環量（Kutta-Joukowski）
    const Gamma = Vinf * chord * Math.PI * (alpha - (m > 0 ? -2 * m : 0));

    // 翼面の傾き計算 (dy/dx)
    function getAirfoilSlopes(xi) {
      const xClamped = Math.max(0.001, Math.min(0.999, xi));
      const dx = 0.002;
      const x1 = Math.max(0, xClamped - dx), x2 = Math.min(1, xClamped + dx);
      const yt1 = thickness_local(x1, t), yt2 = thickness_local(x2, t);
      const yc1 = camber_local(x1, m, p).yc, yc2 = camber_local(x2, m, p).yc;
      const dyt_dx = (yt2 - yt1) / (x2 - x1);
      const dyc_dx = (yc2 - yc1) / (x2 - x1);
      return {
        slopeUpper: dyc_dx + dyt_dx,
        slopeLower: dyc_dx - dyt_dx,
        yc: camber_local(xClamped, m, p).yc,
        yt: thickness_local(xClamped, t),
      };
    }

    for (let j = 0; j <= ny; j++) {
      const row = [];
      const gy = ((j / ny) - 0.5) * gridH; // y: -gridH/2 ~ +gridH/2

      for (let i = 0; i <= nx; i++) {
        const gx = -0.5 * chord + (i / nx) * gridW;
        const xi = gx / chord;

        if (isInsideAirfoil(gx, gy)) {
          row.push({ u: 0, v: 0, inside: true, speed: 0 });
          continue;
        }

        // 1. 一様流
        let u = Vinf * Math.cos(alpha);
        let v = Vinf * Math.sin(alpha);

        // 2. 分布渦による誘導速度（前縁0.1cから後縁0.9cに分散配置）
        const nVort = 6;
        for (let k = 0; k < nVort; k++) {
          const vx = (0.15 + (k / (nVort - 1)) * 0.70) * chord;
          const weight = (nVort - k) / (nVort * (nVort + 1) / 2); // 前縁寄りに強い循環分布
          const gK = Gamma * weight;
          const rx = gx - vx;
          const ry = gy;
          const r2 = rx * rx + ry * ry;
          const safeR2 = Math.max(r2, (0.06 * chord) ** 2);
          u += gK * ry / (2 * Math.PI * safeR2);
          v += -gK * rx / (2 * Math.PI * safeR2);
        }

        // 3. 翼型厚みによる押しのけ効果 (ダブレット)
        const kappa = Vinf * Math.PI * (t * chord) ** 2 * 0.45;
        const rxD = gx - 0.3 * chord;
        const ryD = gy;
        const r2D = rxD * rxD + ryD * ryD;
        const safeR2D = Math.max(r2D, (0.08 * chord) ** 2);
        u += kappa * (rxD * rxD - ryD * ryD) / (2 * Math.PI * safeR2D * safeR2D);
        v += kappa * (2 * rxD * ryD) / (2 * Math.PI * safeR2D * safeR2D);

        // 4. 翼表面の滑り境界条件（Flow Tangency Condition: V・n = 0）の厳密適用
        if (xi >= -0.05 && xi <= 1.05) {
          const clampedXi = Math.max(0.001, Math.min(0.999, xi));
          const geom = getAirfoilSlopes(clampedXi);
          const yUpper = (geom.yc + geom.yt) * chord;
          const yLower = (geom.yc - geom.yt) * chord;

          const isUpper = gy >= geom.yc * chord;
          const ySurf = isUpper ? yUpper : yLower;
          const slope = isUpper ? geom.slopeUpper : geom.slopeLower;

          const dist = Math.abs(gy - ySurf);
          const blendDist = 0.16 * chord; // 境界影響領域

          if (dist < blendDist) {
            const w = Math.exp(-Math.pow(dist / (0.07 * chord), 2)); // 表面で1.0、離れると0.0
            // 壁面接線単位ベクトル
            const tLen = Math.sqrt(1 + slope * slope);
            const tx = 1.0 / tLen;
            const ty = slope / tLen;

            // 接線方向速度成分 (Vt = V・t)
            const currentSpeed = Math.sqrt(u * u + v * v);
            const targetU = currentSpeed * tx;
            const targetV = currentSpeed * ty;

            // 壁面に向かう法線速度を消去し、接線流にブレンド
            u = (1 - w) * u + w * targetU;
            v = (1 - w) * v + w * targetV;
          }
        }

        const speed = Math.sqrt(u * u + v * v);
        row.push({ u, v, inside: false, speed });
      }
      field.push(row);
    }
    return field;
  }

  /**
   * αスイープで Cl-α 曲線データを生成
   * @param {string} presetKey
   * @param {object} params - { alphaMin, alphaMax, steps, Vinf, chord, span }
   * @returns {Array<{alpha, Cl, Cd, lift, drag}>}
   */
  function sweepAlpha(presetKey, params) {
    const { alphaMin = -10, alphaMax = 25, steps = 36,
            Vinf = 60, chord = 1.5, span = 10 } = params;
    const airfoilData = Airfoil.generate(presetKey, 60, chord);
    const results = [];

    for (let i = 0; i <= steps; i++) {
      const alphaDeg = alphaMin + (alphaMax - alphaMin) * i / steps;
      const alpha = alphaDeg * Math.PI / 180;
      const { cpUpper, cpLower, clFinal, cdForm } = computePressure(
        airfoilData.upper, airfoilData.lower, alpha, Vinf, presetKey
      );
      const { lift, drag } = computeForces(clFinal, cdForm, Vinf, chord, span);
      results.push({ alphaDeg, alpha, Cl: clFinal, Cd: cdForm, lift, drag });
    }
    return results;
  }

  return {
    computePressure,
    computeForces,
    computeSpanwiseLift,
    computeVelocityField,
    sweepAlpha,
    AIR_DENSITY,
  };
})();
