/**
 * charts.js - 添付画像スタイルカラーバー凡例、レオロジー流動曲線、残差収束モニター
 */

import { CFDVisualizer } from './visualizer.js?v=coating_modelsel_v112';

export class ChartRenderer {
  constructor(colorbarCanvas, rheologyCanvas, convergenceCanvas) {
    this.cbCanvas = colorbarCanvas;
    this.cbCtx = colorbarCanvas ? colorbarCanvas.getContext('2d') : null;

    this.rhCanvas = rheologyCanvas;
    this.rhCtx = rheologyCanvas ? rheologyCanvas.getContext('2d') : null;

    this.convCanvas = convergenceCanvas;
    this.convCtx = convergenceCanvas ? convergenceCanvas.getContext('2d') : null;

    this.residualHistory = [];
    this.maxResidualPoints = 120;
  }

  /**
   * 添付画像の左側カラーバーを忠実に再現 (見切れ防止・クリーンレイアウト)
   * @param {string} title - タイトル (例: 'η [Pa·s]')
   * @param {number} minVal - 最小値
   * @param {number} maxVal - 最大値
   * @param {number} bands - 分割階調数 (デフォルト14)
   */
  renderColorBar(title, minVal, maxVal, bands = 14) {
    if (!this.cbCanvas || !this.cbCtx) return;

    const ctx = this.cbCtx;
    const w = this.cbCanvas.width;
    const h = this.cbCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // タイトル
    ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(title, 4, 16);

    const barX = 6;
    const barY = 24;
    const barW = 14;
    const barH = h - 34;

    const stepH = barH / bands;

    for (let k = 0; k < bands; k++) {
      // 上が最大値 (1.0)、下が最小値 (0.0)
      const normTop = 1.0 - k / bands;
      const normBottom = 1.0 - (k + 1) / bands;
      const normMid = (normTop + normBottom) * 0.5;

      const rgb = CFDVisualizer.sampleRainbow(normMid);
      ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

      const y = barY + k * stepH;
      ctx.fillRect(barX, y, barW, stepH);

      // 数値目盛り (3ステップごとに表示して見やすさを確保)
      if (k % 3 === 0 || k === bands - 1) {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'left';
        const val = minVal + normTop * (maxVal - minVal);
        const text = val < 10 ? val.toFixed(1) : (val < 100 ? val.toFixed(0) : val.toExponential(1));
        ctx.fillText(text, barX + barW + 4, y + 6);
      }
    }

    // 最下部のゼロ点ラベル
    const minStr = minVal < 10 ? minVal.toFixed(1) : minVal.toFixed(0);
    ctx.fillText(minStr, barX + barW + 4, barY + barH);

    // カラーバー外枠
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  /**
   * 描画モードに応じたカラーバー凡例
   */
  renderColorbar(mode = 'realistic') {
    if (!this.cbCanvas || !this.cbCtx) return;

    if (mode === 'viscosity') {
      this.renderColorBar('粘度 [Pa·s]', 0.05, 120.0);
    } else if (mode === 'velocity') {
      this.renderColorBar('流速 [m/s]', 0.0, 2.5);
    } else if (mode === 'peaking') {
      const ctx = this.cbCtx;
      const w = this.cbCanvas.width;
      const h = this.cbCanvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('ツノ立ち解析', 4, 16);

      // シアン: 堆積層
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(6, 26, 14, 14);
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('静止層', 24, 37);

      // 黄: 落下流動中
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(6, 46, 14, 14);
      ctx.fillText('流動中', 24, 57);
    } else {
      // realistic (マテリアルテクスチャ) / monochrome は見切れた説明テキストを出さずクリーンに保持
      const ctx = this.cbCtx;
      const w = this.cbCanvas.width;
      const h = this.cbCanvas.height;
      ctx.clearRect(0, 0, w, h);
    }
  }

  /**
   * 添付画像スタイル: 学術論文クオリティのレオロジー流動曲線 (Rheological Flow Curves)
   * - 左縦軸: せん断応力 Shear stress τ (Pa) [赤実線]
   * - 右縦軸: 見かけ粘度 Apparent viscosity η (Pa·s) [青破線]
   * - 横軸: せん断速度 Shear rate γ̇ (s⁻¹)
   * - 降伏応力 τ_y 切片マーカー & 物性パラメータ表示
   */
  renderRheologyCurve(rheologyModel, targetCanvas = null) {
    const canvas = targetCanvas || this.rhCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const realW = canvas.width;
    const realH = canvas.height;
    const logW = canvas.clientWidth || 390;
    const logH = canvas.clientHeight || 350;

    ctx.save();
    ctx.scale(realW / logW, realH / logH);

    // 1. 学術ペーパー純白背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logW, logH);

    // プロット余白 (左軸: τ, 右軸: η, 下軸: γ̇)
    const padL = 56;
    const padR = 56;
    const padT = 18;
    const padB = 42;
    const plotW = logW - padL - padR;
    const plotH = logH - padT - padB;

    // 横軸せん断速度範囲: 0 〜 100 s⁻¹
    const gammaMax = 100.0;

    // 現在評価中の非ニュートン流体物性パラメータ
    const tauY = rheologyModel.tau_y;
    const K = rheologyModel.K;
    const n = rheologyModel.n;

    // せん断応力 tau(g) と 見かけ粘度 eta(g)
    const calcTau = (g) => {
      if (g <= 0) return tauY;
      return tauY + K * Math.pow(g, n);
    };

    const calcEta = (g) => {
      return rheologyModel.calcApparentViscosity(Math.max(0.01, g));
    };

    // --- 1. せん断応力 (左軸) の最大値と目盛り選定 ---
    const rawTauMax = calcTau(gammaMax);
    let tauMax = 10.0;
    let tauStep = 2.0;

    if (rawTauMax <= 5.0) {
      tauMax = 5.0; tauStep = 1.0;
    } else if (rawTauMax <= 10.0) {
      tauMax = 10.0; tauStep = 2.0;
    } else if (rawTauMax <= 25.0) {
      tauMax = 25.0; tauStep = 5.0;
    } else if (rawTauMax <= 50.0) {
      tauMax = 50.0; tauStep = 10.0;
    } else if (rawTauMax <= 100.0) {
      tauMax = 100.0; tauStep = 20.0;
    } else if (rawTauMax <= 200.0) {
      tauMax = 200.0; tauStep = 40.0;
    } else if (rawTauMax <= 400.0) {
      tauMax = 400.0; tauStep = 100.0;
    } else {
      tauMax = Math.ceil(rawTauMax / 100) * 100;
      tauStep = tauMax / 5;
    }

    // --- 2. 見かけ粘度 (右軸) の最大値と目盛り選定 ---
    const rawEtaRef = calcEta(2.0);
    let etaMax = 10.0;
    let etaStep = 2.0;

    if (rawEtaRef <= 2.0) {
      etaMax = 2.0; etaStep = 0.5;
    } else if (rawEtaRef <= 5.0) {
      etaMax = 5.0; etaStep = 1.0;
    } else if (rawEtaRef <= 10.0) {
      etaMax = 10.0; etaStep = 2.0;
    } else if (rawEtaRef <= 25.0) {
      etaMax = 25.0; etaStep = 5.0;
    } else if (rawEtaRef <= 60.0) {
      etaMax = 60.0; etaStep = 15.0;
    } else if (rawEtaRef <= 150.0) {
      etaMax = 150.0; etaStep = 30.0;
    } else if (rawEtaRef <= 300.0) {
      etaMax = 300.0; etaStep = 60.0;
    } else {
      etaMax = Math.ceil(rawEtaRef / 100) * 100;
      etaStep = etaMax / 5;
    }

    // 座標マッピング関数
    const mapX = (g) => padL + (g / gammaMax) * plotW;
    const mapY_Tau = (tau) => padT + (1.0 - Math.min(tauMax, tau) / tauMax) * plotH;
    const mapY_Eta = (eta) => padT + (1.0 - Math.min(etaMax, eta) / etaMax) * plotH;

    // --- 3. グリッド線 (薄い学術グリッド) ---
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.0;
    const numXSteps = 5;
    for (let i = 1; i < numXSteps; i++) {
      const g = (i / numXSteps) * gammaMax;
      const x = mapX(g);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    const numYSteps = Math.round(tauMax / tauStep);
    for (let i = 1; i < numYSteps; i++) {
      const val = i * tauStep;
      const y = mapY_Tau(val);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // --- 4. 横軸: せん断速度 Shear rate (0, 20, 40, 60, 80, 100) ---
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.font = '12px "Times New Roman", "Cambria", serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const xTicks = [0, 20, 40, 60, 80, 100];
    for (const g of xTicks) {
      const x = mapX(g);
      // 下辺内向きティック
      ctx.beginPath();
      ctx.moveTo(x, padT + plotH);
      ctx.lineTo(x, padT + plotH - 7);
      ctx.stroke();

      // 上辺対向内向きティック
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + 7);
      ctx.stroke();

      // 数値
      ctx.fillText(g.toString(), x, padT + plotH + 6);
    }

    // 横軸 Minor ticks (10, 30, 50, 70, 90)
    for (let g = 10; g < gammaMax; g += 20) {
      const x = mapX(g);
      ctx.beginPath();
      ctx.moveTo(x, padT + plotH);
      ctx.lineTo(x, padT + plotH - 4);
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + 4);
      ctx.stroke();
    }

    // 横軸ラベル
    ctx.font = 'bold 13px "Times New Roman", "Cambria", serif';
    ctx.fillText('Shear rate  γ̇ (s⁻¹)', padL + plotW / 2, logH - 14);

    // --- 5. 左縦軸: せん断応力 Shear stress τ (Pa) [赤] ---
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b91c1c'; // 深紅
    ctx.font = '12px "Times New Roman", "Cambria", serif';

    for (let i = 0; i <= numYSteps; i++) {
      const val = i * tauStep;
      const y = mapY_Tau(val);

      // 左辺内向きティック
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + 7, y);
      ctx.stroke();

      const labelStr = (tauStep < 1) ? val.toFixed(1) : Math.round(val).toString();
      ctx.fillText(labelStr, padL - 8, y);
    }

    // 左軸タイトル (90度回転)
    ctx.save();
    ctx.translate(16, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Times New Roman", "Cambria", serif';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('Shear stress  τ (Pa)', 0, 0);
    ctx.restore();

    // --- 6. 右縦軸: 見かけ粘度 Viscosity η (Pa·s) [青] ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0284c7'; // シアン青
    ctx.font = '12px "Times New Roman", "Cambria", serif';

    const numEtaSteps = Math.round(etaMax / etaStep);
    for (let i = 0; i <= numEtaSteps; i++) {
      const val = i * etaStep;
      const y = mapY_Eta(val);

      // 右辺内向きティック
      ctx.beginPath();
      ctx.moveTo(padL + plotW, y);
      ctx.lineTo(padL + plotW - 7, y);
      ctx.stroke();

      const labelStr = (etaStep < 1) ? val.toFixed(1) : Math.round(val).toString();
      ctx.fillText(labelStr, padL + plotW + 8, y);
    }

    // 右軸タイトル (-90度回転)
    ctx.save();
    ctx.translate(logW - 14, padT + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Times New Roman", "Cambria", serif';
    ctx.fillStyle = '#0284c7';
    ctx.fillText('Viscosity  η (Pa·s)', 0, 0);
    ctx.restore();

    // --- 7. 完全ボックス枠 (Box Frame) ---
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(padL, padT, plotW, plotH);

    // --- 8. 評価中の非ニュートン流体曲線のプロット ---
    const steps = 140;

    // ① せん断応力曲線 τ(γ̇) [赤色実線, 太さ 2.4px]
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#dc2626';
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const g = (i / steps) * gammaMax;
      const tau = calcTau(g);
      const x = mapX(g);
      const y = mapY_Tau(tau);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ② 見かけ粘度曲線 η(γ̇) [青色破線, 太さ 2.2px]
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#0284c7';
    ctx.setLineDash([6, 4]); // 学術破線
    ctx.beginPath();
    for (let i = 1; i <= steps; i++) {
      const g = (i / steps) * gammaMax;
      const eta = calcEta(g);
      const x = mapX(g);
      const y = mapY_Eta(eta);
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]); // 実線に戻す

    // --- 9. 降伏応力 τ_y 切片マーカー ---
    if (tauY > 0) {
      const yZero = mapY_Tau(tauY);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(padL, yZero, 4.0, 0, Math.PI * 2);
      ctx.fill();

      // τ_y 注記 (枠内上側に邪魔にならないよう小さく注記)
      ctx.font = 'bold 11px "Times New Roman", serif';
      ctx.textAlign = 'left';
      ctx.fillText(`τ_y=${tauY.toFixed(1)} Pa`, padL + 8, yZero - 8);
    }

    ctx.restore();
  }

  /**
   * 疑似タイムステップ残差収束グラフ
   */
  renderConvergence(residual, stepCount) {
    if (!this.convCanvas || !this.convCtx) return;

    this.residualHistory.push(Math.max(1e-6, residual));
    if (this.residualHistory.length > this.maxResidualPoints) {
      this.residualHistory.shift();
    }

    const ctx = this.convCtx;
    const w = this.convCanvas.width;
    const h = this.convCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const padL = 40, padR = 15, padT = 20, padB = 25;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // タイトル
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`定常収束残差 (Steps: ${stepCount})`, w / 2, 13);

    // ログスケール (10^0 ~ 10^-5)
    const logMin = -5;
    const logMax = 1;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    for (let l = logMax; l >= logMin; l -= 2) {
      const frac = (logMax - l) / (logMax - logMin);
      const y = padT + frac * plotH;

      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      ctx.fillText(`1e${l}`, padL - 4, y + 3);
    }

    // 残差推移プロット
    if (this.residualHistory.length >= 2) {
      ctx.strokeStyle = '#10b981'; // エメラルドグリーン
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      for (let i = 0; i < this.residualHistory.length; i++) {
        const val = this.residualHistory[i];
        const logVal = Math.log10(val);
        const fracY = (logMax - logVal) / (logMax - logMin);
        const y = padT + Math.max(0, Math.min(plotH, fracY * plotH));
        const x = padL + (i / (this.maxResidualPoints - 1)) * plotW;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /**
   * 傾斜板・垂直板放置試験: 時間 vs 垂れ先端距離・流速 2軸グラフ (Sagging Kinetics: L(t) & v(t) vs t)
   * 論文・学術仕様:
   * - 純白背景 + 黒色外枠 + 内向き目盛り
   * - 横軸: 経過時間 t (s)
   * - 第1軸 (左縦軸): 垂れ先端移動距離 L (mm) [青色実線]
   * - 第2軸 (右縦軸): 先端移動速度 v (mm/s) [橙色破線]
   * - 凡例: グラフ内右下に配置
   */
  renderSaggingCurve(solver, rheologyModel, targetCanvas = null) {
    const canvas = targetCanvas || this.rhCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const realW = canvas.width;
    const realH = canvas.height;
    const logW = canvas.clientWidth || 390;
    const logH = canvas.clientHeight || 350;

    ctx.save();
    ctx.scale(realW / logW, realH / logH);

    // 1. 学術ペーパー純白背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logW, logH);

    // 余白設定 (左右に十分な軸余白を確保: 左にL、右にv)
    const padL = 52;
    const padR = 52;
    const padT = 24;
    const padB = 42;
    const plotW = logW - padL - padR;
    const plotH = logH - padT - padB;

    const history = solver.sagHistory || [{ time: 0, dist: 0, vel: 0 }];
    const curTime = Math.max(0.1, solver.sagTimerSec || 0.0);
    const curDist = solver.sagDistanceMm || 0.0;
    const curVel = solver.sagVelocityMmS || 0.0;
    const targetSagTime = solver.targetSagTimeSec || 0.0;

    // --- 横軸 (時間 t / s) の最大値スケール選定 ---
    let tMax = 10.0;
    if (targetSagTime > 0) {
      tMax = targetSagTime;
    } else {
      if (curTime > 30.0) tMax = Math.ceil(curTime / 10.0) * 10.0;
      else if (curTime > 15.0) tMax = 30.0;
      else if (curTime > 8.0) tMax = 20.0;
      else if (curTime > 4.0) tMax = 10.0;
      else tMax = 5.0;
    }

    // --- 第1軸: 縦軸 (移動距離 L / mm) の最大値スケール選定 ---
    let lMax = 20.0;
    let maxHistoryDist = curDist;
    for (const pt of history) {
      if (pt.dist > maxHistoryDist) maxHistoryDist = pt.dist;
    }

    if (maxHistoryDist > 100.0) lMax = Math.ceil(maxHistoryDist / 20.0) * 20.0;
    else if (maxHistoryDist > 60.0) lMax = 100.0;
    else if (maxHistoryDist > 35.0) lMax = 60.0;
    else if (maxHistoryDist > 18.0) lMax = 40.0;
    else if (maxHistoryDist > 8.0) lMax = 20.0;
    else lMax = 10.0;

    // --- 第2軸: 縦軸 (移動速度 v / mm/s) の最大値スケール選定 ---
    let vMax = 5.0;
    let maxHistoryVel = curVel;
    for (const pt of history) {
      if (pt.vel > maxHistoryVel) maxHistoryVel = pt.vel;
    }

    if (maxHistoryVel > 40.0) vMax = Math.ceil(maxHistoryVel / 10.0) * 10.0;
    else if (maxHistoryVel > 20.0) vMax = 40.0;
    else if (maxHistoryVel > 10.0) vMax = 20.0;
    else if (maxHistoryVel > 5.0) vMax = 10.0;
    else if (maxHistoryVel > 2.0) vMax = 5.0;
    else vMax = 2.0;

    const mapX = (t) => padL + (Math.min(tMax, Math.max(0, t)) / tMax) * plotW;
    const mapY_L = (l) => padT + (1.0 - Math.min(lMax, Math.max(0, l)) / lMax) * plotH;
    const mapY_V = (v) => padT + (1.0 - Math.min(vMax, Math.max(0, v)) / vMax) * plotH;

    // 2. グリッド線 (薄い学術グリッド)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1.0;
    const numXGrid = 5;
    for (let i = 1; i < numXGrid; i++) {
      const tVal = (i / numXGrid) * tMax;
      const x = mapX(tVal);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    const numYGrid = 5;
    for (let i = 1; i < numYGrid; i++) {
      const lVal = (i / numYGrid) * lMax;
      const y = mapY_L(lVal);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // 3. データプロット線 (第1軸: L(t) 青実線 / 第2軸: v(t) 橙破線)
    if (history.length >= 2) {
      // (1) 移動距離 L(t) 塗りつぶし領域 & 実線
      ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
      ctx.beginPath();
      ctx.moveTo(mapX(history[0].time), mapY_L(0));
      for (let i = 0; i < history.length; i++) {
        ctx.lineTo(mapX(history[i].time), mapY_L(history[i].dist));
      }
      ctx.lineTo(mapX(history[history.length - 1].time), mapY_L(0));
      ctx.closePath();
      ctx.fill();

      // 第1軸: 移動距離 L(t) [青実線]
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = mapX(history[i].time);
        const y = mapY_L(history[i].dist);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 第2軸: 移動速度 v(t) [橙色破線]
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = mapX(history[i].time);
        const y = mapY_V(history[i].vel);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 移動距離 L(t) データ点 (青丸)
      const stepInterval = Math.max(1, Math.floor(history.length / 15));
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < history.length; i += stepInterval) {
        const x = mapX(history[i].time);
        const y = mapY_L(history[i].dist);
        ctx.beginPath();
        ctx.arc(x, y, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 最終測定点 (最新位置) のハイライト
      const lastPt = history[history.length - 1];
      const lastX = mapX(lastPt.time);
      const lastY = mapY_L(lastPt.dist);
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. 外枠 & 内向き目盛り (学術論文標準)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // --- 横軸目盛り (時間 t) ---
    ctx.font = '11px "Times New Roman", "Cambria", serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const tStep = tMax / 5;
    for (let i = 0; i <= 5; i++) {
      const tVal = i * tStep;
      const x = mapX(tVal);

      // 下辺内向き目盛り
      ctx.beginPath();
      ctx.moveTo(x, padT + plotH);
      ctx.lineTo(x, padT + plotH - 6);
      ctx.stroke();

      // 上辺内向き目盛り
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + 6);
      ctx.stroke();

      ctx.fillText(tVal.toFixed(tMax <= 10 ? 1 : 0), x, padT + plotH + 5);
    }

    // --- 第1軸 (左縦軸: 移動距離 L / mm) 目盛り ---
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const lStep = lMax / 5;
    for (let i = 0; i <= 5; i++) {
      const lVal = i * lStep;
      const y = mapY_L(lVal);

      // 左辺内向き目盛り
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + 6, y);
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.fillText(lVal.toFixed(0), padL - 6, y);
    }

    // --- 第2軸 (右縦軸: 移動速度 v / mm/s) 目盛り ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const vStep = vMax / 5;
    for (let i = 0; i <= 5; i++) {
      const vVal = i * vStep;
      const y = mapY_V(vVal);

      // 右辺内向き目盛り
      ctx.beginPath();
      ctx.moveTo(padL + plotW, y);
      ctx.lineTo(padL + plotW - 6, y);
      ctx.stroke();

      ctx.fillStyle = '#ea580c';
      ctx.fillText(vVal.toFixed(vMax <= 5 ? 1 : 0), padL + plotW + 6, y);
    }

    // 5. 軸ラベル
    // 横軸ラベル
    ctx.font = 'bold 12px "Times New Roman", "Cambria", serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Elapsed time  t  (s)', padL + plotW / 2, logH - 4);

    // 左縦軸ラベル (第1軸: L)
    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#0284c7';
    ctx.textAlign = 'center';
    ctx.fillText('Sagging distance  L(t)  (mm)', 0, 0);
    ctx.restore();

    // 右縦軸ラベル (第2軸: v)
    ctx.save();
    ctx.translate(logW - 14, padT + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#ea580c';
    ctx.textAlign = 'center';
    ctx.fillText('Sagging velocity  v(t)  (mm/s)', 0, 0);
    ctx.restore();

    // 6. 【プロット干渉回避・動的最適凡例配置 (Smart Dynamic Legend Placement)】
    const legendW = 138;
    const legendH = 38;

    // 凡例候補位置 (左上, 中央上, 右上, 右中央, 右下)
    const candidates = [
      { id: 'top-left', x: padL + 8, y: padT + 8 },
      { id: 'top-center', x: padL + (plotW - legendW) * 0.5, y: padT + 8 },
      { id: 'top-right', x: padL + plotW - legendW - 8, y: padT + 8 },
      { id: 'bottom-right', x: padL + plotW - legendW - 8, y: padT + plotH - legendH - 8 },
      { id: 'right-center', x: padL + plotW - legendW - 8, y: padT + (plotH - legendH) * 0.5 }
    ];

    // プロット点群のスクリーン座標を抽出
    const plotPoints = [];
    if (history.length > 0) {
      for (let i = 0; i < history.length; i++) {
        const px = mapX(history[i].time);
        plotPoints.push({ x: px, y: mapY_L(history[i].dist) });
        plotPoints.push({ x: px, y: mapY_V(history[i].vel) });
      }
    }

    // 各候補位置におけるプロット線との干渉スコア（距離の二乗和と包含判定）を計算
    let bestCand = candidates[0];
    let maxMinDist = -1;

    for (const cand of candidates) {
      const cx = cand.x + legendW * 0.5;
      const cy = cand.y + legendH * 0.5;
      const rx1 = cand.x - 8;
      const rx2 = cand.x + legendW + 8;
      const ry1 = cand.y - 8;
      const ry2 = cand.y + legendH + 8;

      let hasDirectOverlap = false;
      let minDist = 1e9;

      for (const pt of plotPoints) {
        if (pt.x >= rx1 && pt.x <= rx2 && pt.y >= ry1 && pt.y <= ry2) {
          hasDirectOverlap = true;
        }
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d < minDist) minDist = d;
      }

      // 直接重なっていない候補を最優先、その中でプロットから最も遠い位置を選択
      const score = (hasDirectOverlap ? 0 : 10000) + minDist;
      if (score > maxMinDist) {
        maxMinDist = score;
        bestCand = cand;
      }
    }

    const legendX = bestCand.x;
    const legendY = bestCand.y;

    // 凡例背景ボックス
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 1;
    ctx.fillRect(legendX, legendY, legendW, legendH);
    ctx.strokeRect(legendX, legendY, legendW, legendH);

    // 凡例項目 1: 移動距離 L (青実線)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(legendX + 6, legendY + 11);
    ctx.lineTo(legendX + 22, legendY + 11);
    ctx.stroke();

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(legendX + 14, legendY + 11, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('距離 L (mm) [左軸]', legendX + 26, legendY + 11);

    // 凡例項目 2: 移動速度 v (橙破線)
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(legendX + 6, legendY + 27);
    ctx.lineTo(legendX + 22, legendY + 27);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillText('速度 v (mm/s) [右軸]', legendX + 26, legendY + 27);

    ctx.restore();
  }

  resetConvergence() {
    this.residualHistory = [];
  }

  /**
   * 塗膜均一性プロファイル (位置 x vs 局所湿潤膜厚 h(x)) のリアルタイムグラフ描画
   * @param {object} solver - SPHソルバーインスタンス
   * @param {HTMLCanvasElement} targetCanvas - 描画対象キャンバス
   */
  renderCoatingProfileChart(solver, targetCanvas) {
    const canvas = targetCanvas || this.convCanvas;
    if (!canvas || !solver) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // プロファイルデータ取得
    const profile = solver.getCoatingFilmProfile ? solver.getCoatingFilmProfile() : null;
    if (!profile) {
      ctx.restore();
      return;
    }

    // パディング設定 (上部ヘッダー帯 padT=62px を確保して凡例・バッジとプロットの被りを完全根絶)
    const padL = 46;
    const padR = 20;
    const padT = 62;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // 白背景クリア
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // 縦軸レンジの動的オートスケール (レンジオーバー・上部突き抜けを完全防止)
    const minX = -4.0;
    const maxX = 80.0; // mm
    const maxDataVal = Math.max(profile.targetGapUm, profile.maxThicknessUm, profile.avgThicknessUm, 150.0);
    const minY = 0.0;
    const maxY = Math.ceil((maxDataVal * 1.35) / 50) * 50; // μm (例: 250, 300, 350, 400 μm)

    const mapX = (xMm) => padL + ((xMm - minX) / (maxX - minX)) * plotW;
    const mapY = (hUm) => padT + plotH - ((hUm - minY) / (maxY - minY)) * plotH;

    // 1. 背景グリッド
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    // 横グリッド (膜厚 h)
    const yStep = maxY <= 200 ? 50 : (maxY <= 350 ? 50 : 100);
    for (let yVal = 0; yVal <= maxY; yVal += yStep) {
      const py = mapY(yVal);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
      ctx.stroke();

      ctx.font = '10px "Inter", "Segoe UI", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(yVal.toString(), padL - 6, py);
    }

    // 縦グリッド (位置 x)
    for (let xVal = 0; xVal <= maxX; xVal += 10) {
      const px = mapX(xVal);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();

      ctx.font = '10px "Inter", "Segoe UI", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(xVal.toString(), px, padT + plotH + 5);
    }

    // 軸枠線
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // 軸ラベル
    ctx.font = 'bold 10.5px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('塗工スキャン位置 x [mm]', padL + plotW * 0.5, h - 2);

    ctx.save();
    ctx.translate(13, padT + plotH * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('局所湿潤塗膜厚さ h [μm]', 0, 0);
    ctx.restore();

    // 2. 目標クリアランスギャップ線 (赤破線)
    const gapY = mapY(profile.targetGapUm);
    if (gapY >= padT && gapY <= padT + plotH) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, gapY);
      ctx.lineTo(padL + plotW, gapY);
      ctx.stroke();
    }

    // 3. クエット流 理論塗膜厚さ線 (アンバー細破線)
    if (profile.theoreticalThicknessUm > 0) {
      const theoY = mapY(profile.theoreticalThicknessUm);
      if (theoY >= padT && theoY <= padT + plotH) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(padL, theoY);
        ctx.lineTo(padL + plotW, theoY);
        ctx.stroke();
      }
    }

    // 4. 実測平均膜厚線 (青緑一点鎖線)
    if (profile.avgThicknessUm > 0) {
      const avgY = mapY(profile.avgThicknessUm);
      if (avgY >= padT && avgY <= padT + plotH) {
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 2, 2, 2]);
        ctx.beginPath();
        ctx.moveTo(padL, avgY);
        ctx.lineTo(padL + plotW, avgY);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 5. ブレード現在位置ライン (紫色縦破線)
    const bladePx = mapX(profile.bladePosMm);
    if (bladePx >= padL && bladePx <= padL + plotW) {
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(bladePx, padT);
      ctx.lineTo(bladePx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#8b5cf6';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▼ 刃先', bladePx, padT - 4);
    }

    // 6. 塗膜プロファイル曲線 (平滑化済みプロファイルの滑らかな面塗り & シアンライン)
    const bins = profile.bins;
    if (bins && bins.length > 0) {
      // 塗膜領域のみ抽出 (未塗布バンクによるレンジ破壊を排除)
      const coatedBins = bins.filter(b => b.isCoated);

      if (coatedBins.length > 0) {
        // 面塗り
        ctx.beginPath();
        const firstPx = mapX(coatedBins[0].xMm);
        const lastPx = mapX(coatedBins[coatedBins.length - 1].xMm);
        const basePy = mapY(0);

        ctx.moveTo(firstPx, basePy);
        for (let i = 0; i < coatedBins.length; i++) {
          const px = mapX(coatedBins[i].xMm);
          const py = Math.max(padT, Math.min(padT + plotH, mapY(coatedBins[i].thicknessUm)));
          ctx.lineTo(px, py);
        }
        ctx.lineTo(lastPx, basePy);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, 'rgba(14, 165, 233, 0.40)');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0.04)');
        ctx.fillStyle = grad;
        ctx.fill();

        // 輪郭線
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i < coatedBins.length; i++) {
          const px = mapX(coatedBins[i].xMm);
          const py = Math.max(padT, Math.min(padT + plotH, mapY(coatedBins[i].thicknessUm)));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // プロット点マーカー (適度な間隔で打点)
        for (let i = 0; i < coatedBins.length; i += 2) {
          const px = mapX(coatedBins[i].xMm);
          const py = Math.max(padT, Math.min(padT + plotH, mapY(coatedBins[i].thicknessUm)));
          ctx.fillStyle = '#0369a1';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 未塗工バンク（スラリー溜まり）領域の淡いガイド表示 (ブレード前方)
      const bankBins = bins.filter(b => b.isBank);
      if (bankBins.length > 0) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        for (let i = 0; i < bankBins.length; i++) {
          const px = mapX(bankBins[i].xMm);
          const py = Math.max(padT, Math.min(padT + plotH, mapY(bankBins[i].thicknessUm)));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. 凡例ボックス (プロット枠外の上部ヘッダー帯に配置してデータ被りを完全防止)
    // ══════════════════════════════════════════════════════════════════
    const legX = padL;
    const legY = 6;
    const legW = 240;
    const legH = 48;

    ctx.fillStyle = 'rgba(248, 250, 252, 0.96)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeRect(legX, legY, legW, legH);

    // 凡例1: 実測プロファイル
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(legX + 6, legY + 11);
    ctx.lineTo(legX + 20, legY + 11);
    ctx.stroke();
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('実測湿潤膜厚 h(x)', legX + 24, legY + 11);

    // 凡例2: 設定ギャップ
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(legX + 6, legY + 24);
    ctx.lineTo(legX + 20, legY + 24);
    ctx.stroke();
    ctx.fillText(`設定隙間 h_gap (${profile.targetGapUm} μm)`, legX + 24, legY + 24);

    // 凡例3: 平均膜厚
    ctx.strokeStyle = '#059669';
    ctx.setLineDash([4, 2, 1, 2]);
    ctx.beginPath();
    ctx.moveTo(legX + 6, legY + 37);
    ctx.lineTo(legX + 20, legY + 37);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`平均実測膜厚 h̄ (${profile.avgThicknessUm} μm)`, legX + 24, legY + 37);

    // ══════════════════════════════════════════════════════════════════
    // 8. 均一性統計スコアバッジ (プロット枠外の右上ヘッダー帯に配置してデータ被りを完全防止)
    // ══════════════════════════════════════════════════════════════════
    const badgeW = 154;
    const badgeH = 48;
    const badgeX = padL + plotW - badgeW;
    const badgeY = 6;

    ctx.fillStyle = 'rgba(240, 253, 250, 0.98)';
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 1.2;
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.fillStyle = '#0f766e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🎯 塗膜均一性評価 (Uniformity)', badgeX + 6, badgeY + 4);

    ctx.font = 'bold 13px "Inter", monospace';
    ctx.fillStyle = profile.uniformityScore >= 90 ? '#059669' : (profile.uniformityScore >= 75 ? '#d97706' : '#dc2626');
    ctx.fillText(`${profile.uniformityScore.toFixed(1)}%`, badgeX + 6, badgeY + 16);

    ctx.font = '8.5px monospace';
    ctx.fillStyle = '#334155';
    ctx.fillText(`σ = ±${profile.stdDevUm.toFixed(1)} μm (CV ${profile.cvPercent}%)`, badgeX + 6, badgeY + 32);

    ctx.restore();
  }
}

