/**
 * coupling.js - CFD⇔FEM 連成インターフェース
 * 空力荷重を構造解析にマッピングし、連成解析を実行する
 */

'use strict';

const Coupling = (() => {

  /**
   * CFD結果からFEM入力を生成し、フル連成解析を実行する
   * @param {object} cfdParams - CFDパラメータ
   * @param {object} femParams - FEMパラメータ
   * @returns {object} 連成解析結果
   */
  async function runCoupledAnalysis(cfdParams, femParams) {
    const {
      airfoilKey = 'NACA2412',
      alphaDeg = 5,
      gammaDeg = 0,
      flapDeg = 0,
      Vinf = 60,
      chord = 1.5,
      span = 12,
      altitude = 0, // [m] 高度（密度補正用）
    } = cfdParams;

    const {
      layupKey = 'QUASI_ISO',
      nElem = 100,
    } = femParams;

    const alpha = alphaDeg * Math.PI / 180;
    const gamma = gammaDeg * Math.PI / 180;
    const theta = gamma + alpha; // ピッチ角（仰角）
    const thetaDeg = gammaDeg + alphaDeg;

    // ── Step 1: 翼型ジオメトリ生成 (高密度 200 パネル & フラップ展開) ──────────────────────────────
    const airfoilData = Airfoil.generate(airfoilKey, 200, chord, flapDeg, 0.70);

    // ── Step 2: CFD解析（圧力分布・揚力・抗力） ─────────────────
    const cfdResult = CFDEngine.computePressure(
      airfoilData.upper,
      airfoilData.lower,
      alpha,
      Vinf,
      airfoilKey,
      flapDeg
    );

    const { lift, drag, qDynamic } = CFDEngine.computeForces(
      cfdResult.clFinal,
      cfdResult.cdForm,
      Vinf,
      chord,
      span
    );

    // ── Step 3: スパン方向揚力分布計算 ──────────────────────────
    const liftDist = CFDEngine.computeSpanwiseLift(
      cfdResult.clFinal, span, chord, Vinf, nElem
    );

    // ── Step 4: 速度場計算（WebGPU 並列 Compute Shader / CPU Fallback） ──────────
    let velocityField = null;
    let usedGPU = false;
    const gridW = chord * 2.4;
    const gridH = chord * 2.0;

    if (typeof WebGPUEngine !== 'undefined' && WebGPUEngine.isSupported) {
      try {
        velocityField = await WebGPUEngine.computeVelocityFieldGPU(
          airfoilData, alpha, Vinf, gridW, gridH, WebGPUEngine.GRID_NX, WebGPUEngine.GRID_NY
        );
        if (velocityField) usedGPU = true;
      } catch (err) {
        console.warn('[Coupling] WebGPU compute failed, falling back to CPU:', err);
      }
    }

    if (!velocityField) {
      // CPU フォールバック (120x80 の中高密度グリッド)
      velocityField = CFDEngine.computeVelocityField(
        airfoilData, alpha, Vinf,
        gridW, gridH, 120, 80
      );
      usedGPU = false;
    }

    // ── Step 5: FEM構造解析（連成） ──────────────────────────────
    const femResult = FEMEngine.analyzeBeam({
      span,
      nElem,
      chord,
      layupKey,
      airfoilKey,
      liftDist,
      thickness_ratio: airfoilData.preset.t,
    });

    // ── Step 6: αスイープデータ（グラフ用） ──────────────────────
    const sweepData = CFDEngine.sweepAlpha(airfoilKey, {
      alphaMin: -5, alphaMax: 25, steps: 30,
      Vinf, chord, span
    });

    // ── Step 7: 応力-AoAデータ ────────────────────────────────────
    const stressVsAlpha = sweepData.map(sw => {
      const ld = CFDEngine.computeSpanwiseLift(sw.Cl, span, chord, Vinf, nElem);
      const fr = FEMEngine.analyzeBeam({
        span, nElem, chord, layupKey, airfoilKey,
        liftDist: ld, thickness_ratio: airfoilData.preset.t,
      });
      return {
        alphaDeg: sw.alphaDeg,
        Cl: sw.Cl,
        Cd: sw.Cd,
        lift: sw.lift,
        drag: sw.drag,
        maxStress: fr.maxStress,
        tipDeflection: fr.tipDeflection,
        minSF: fr.minSF,
      };
    });

    // ── Step 8: 翼重心・自重（重力）計算 ─────────────────────────
    const material = FEMEngine.LAYUP_PRESETS[layupKey] || FEMEngine.LAYUP_PRESETS['QUASI_ISO'];
    const secProps = Airfoil.getSectionProperties(airfoilKey, layupKey);
    const areaReal = (secProps.area || 0.08) * chord * chord;
    const wingMassKg = (material.rho || 1600) * areaReal * span * 0.28; // 中空CFRP構造実効質量 [kg]
    const weightN = wingMassKg * 9.80665; // 重力 [N]
    const cg = {
      x: (secProps.xCentroid || 0.40) * chord, // 前縁基準 x [m]
      y: (secProps.zCentroid || 0.0) * chord,  // 翼弦線基準 y [m]
    };

    // ── 統合結果を返す ────────────────────────────────────────────
    return {
      params: {
        alphaDeg, alpha,
        gammaDeg, gamma,
        thetaDeg, theta,
        flapDeg,
        Vinf, chord, span, altitude, airfoilKey, layupKey, nElem,
      },
      airfoilData,

      // 構造重心・自重データ
      gravity: {
        massKg: wingMassKg,
        weightN: weightN,
        cg: cg,
      },

      // CFD結果
      cfd: {
        ...cfdResult,
        lift,
        drag,
        qDynamic,
        liftDist,
        velocityField,
        usedGPU,
      },

      // FEM結果
      fem: femResult,

      // グラフ用データ
      sweepData,
      stressVsAlpha,

      // 材料
      material,

      // 現在の状態サマリー
      summary: {
        Cl: cfdResult.clFinal,
        Cd: cfdResult.cdForm,
        liftN: lift,
        dragN: drag,
        massKg: wingMassKg,
        weightN: weightN,
        tipDeflectionM: femResult.tipDeflection,
        tipDeflectionPct: Math.abs(femResult.tipDeflection) / (span / 2) * 100,
        maxStressMPa: femResult.maxStress / 1e6,
        minSafetyFactor: femResult.minSF,
        isStalled: cfdResult.stallFactor < 0.7,
        isCritical: femResult.minSF < 1.5,
        isDangerous: femResult.minSF < 1.0,
      },
    };
  }

  /**
   * 運用条件に応じたパラメータ自動計算
   * @param {number} altitude - 高度 [m]
   * @param {number} airspeed - 対気速度 [m/s]
   * @returns {{ rho, q, Re }}
   */
  function atmosphericProps(altitude, airspeed, chord) {
    // 国際標準大気 (ISA) 簡易式 (対流圏)
    const T0 = 288.15, L = 0.0065, g = 9.81, R = 287.05;
    const T = T0 - L * Math.min(altitude, 11000);
    const rho = 1.225 * Math.pow(T / T0, (g / (R * L)) - 1);
    const mu = 1.789e-5 * Math.pow(T / T0, 0.76); // Sutherland近似
    const q = 0.5 * rho * airspeed * airspeed;
    const Re = rho * airspeed * chord / mu;
    const a = Math.sqrt(1.4 * R * T); // 音速
    const Ma = airspeed / a;
    return { rho, q, Re, Ma, a };
  }

  return { runCoupledAnalysis, atmosphericProps };
})();
