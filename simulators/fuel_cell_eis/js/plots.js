/**
 * EIS Plots Manager
 * 
 * High-performance, retina-sharp Canvas 2D plotting engine for:
 * 1. Cole-Cole Plot (Nyquist Plot: -Z'' vs Z' with frequency annotations)
 * 2. Bode Plot (Magnitude |Z| and Phase θ vs log10 f)
 * 3. Interactive Frequency Inspection Cursor
 * 4. Equivalent Circuit Element Highlight Bands
 */

class EISPlots {
  constructor(nyquistCanvasId, bodeCanvasId) {
    this.nyquistCanvas = document.getElementById(nyquistCanvasId);
    this.bodeCanvas = document.getElementById(bodeCanvasId);

    this.spectrum = [];
    this.baselineSpectrum = []; // "もとの円弧" (基準・正常状態スペクトル)
    this.baselineAnalysis = null;
    this.showBaselineOverlay = true; // デフォルトで重なりのもとの円弧を表示
    this.showShiftVectors = true;   // 変化矢印 (ΔR_Ω, ΔR_ct) を表示
    this.analysis = null;
    this.hoverPoint = null;
    this.activeHighlightElement = null; // 'L', 'R_ohm', 'anode', 'cathode', 'warburg'
    this.sweepIndex = -1; // -1 means show all points

    this.initCanvas(this.nyquistCanvas);
    this.initCanvas(this.bodeCanvas);
    this.bindEvents();
  }

  initCanvas(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 50 ? rect.width : (canvas.parentElement ? canvas.parentElement.clientWidth : 600);
    const h = rect.height > 50 ? rect.height : (canvas.parentElement ? canvas.parentElement.clientHeight : 380);
    
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize() {
    this.initCanvas(this.nyquistCanvas);
    this.initCanvas(this.bodeCanvas);
    this.render();
  }

  bindEvents() {
    if (!this.nyquistCanvas) return;

    window.addEventListener('load', () => {
      this.resize();
    });
    setTimeout(() => this.resize(), 50);
    setTimeout(() => this.resize(), 250);
    setTimeout(() => this.resize(), 600);

    // Modern ResizeObserver for rock-solid responsive canvas
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        this.resize();
      });
      if (this.nyquistCanvas.parentElement) ro.observe(this.nyquistCanvas.parentElement);
      if (this.bodeCanvas && this.bodeCanvas.parentElement) ro.observe(this.bodeCanvas.parentElement);
    }

    this.nyquistCanvas.addEventListener('mousemove', (e) => {
      const rect = this.nyquistCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.handleNyquistHover(mouseX, mouseY, rect.width, rect.height);
    });

    this.nyquistCanvas.addEventListener('mouseleave', () => {
      this.hoverPoint = null;
      this.render();
      if (this.onHoverCallback) this.onHoverCallback(null);
    });

    if (this.bodeCanvas) {
      this.bodeCanvas.addEventListener('mousemove', (e) => {
        const rect = this.bodeCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.handleBodeHover(mouseX, mouseY, rect.width, rect.height);
      });

      this.bodeCanvas.addEventListener('mouseleave', () => {
        this.hoverPoint = null;
        this.render();
        if (this.onHoverCallback) this.onHoverCallback(null);
      });
    }

    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  setData(spectrum, analysis, sweepIndex = -1) {
    this.spectrum = spectrum || [];
    this.analysis = analysis;
    this.sweepIndex = sweepIndex;
    this.render();
  }

  setBaselineSpectrum(baselineSpec, baselineAnalysis = null) {
    this.baselineSpectrum = baselineSpec || [];
    this.baselineAnalysis = baselineAnalysis;
    this.render();
  }

  setShowBaselineOverlay(show) {
    this.showBaselineOverlay = show;
    this.render();
  }

  setShowShiftVectors(show) {
    this.showShiftVectors = show;
    this.render();
  }

  setHighlightElement(elementKey) {
    this.activeHighlightElement = elementKey;
    this.render();
  }

  handleNyquistHover(mx, my, width, height) {
    if (!this.spectrum || this.spectrum.length === 0) return;

    const visiblePoints = this.sweepIndex >= 0 
      ? this.spectrum.slice(0, this.sweepIndex + 1)
      : this.spectrum;

    const bounds = this.getNyquistBounds();
    let closestPt = null;
    let minDist = 25; // 25px hit radius

    for (const pt of visiblePoints) {
      const px = this.mapVal(pt.zRe, bounds.minX, bounds.maxX, bounds.padL, width - bounds.padR);
      const py = this.mapVal(pt.negZIm, bounds.minY, bounds.maxY, height - bounds.padB, bounds.padT);
      const dist = Math.hypot(mx - px, my - py);
      if (dist < minDist) {
        minDist = dist;
        closestPt = pt;
      }
    }

    this.hoverPoint = closestPt;
    this.render();
    if (this.onHoverCallback) this.onHoverCallback(closestPt);
  }

  handleBodeHover(mx, my, width, height) {
    if (!this.spectrum || this.spectrum.length === 0) return;

    const visiblePoints = this.sweepIndex >= 0 
      ? this.spectrum.slice(0, this.sweepIndex + 1)
      : this.spectrum;

    const bounds = this.getBodeBounds();
    let closestPt = null;
    let minDist = 25;

    for (const pt of visiblePoints) {
      const logF = Math.log10(pt.f);
      const px = this.mapVal(logF, bounds.minLogF, bounds.maxLogF, bounds.padL, width - bounds.padR);
      const dist = Math.abs(mx - px);
      if (dist < minDist) {
        minDist = dist;
        closestPt = pt;
      }
    }

    this.hoverPoint = closestPt;
    this.render();
    if (this.onHoverCallback) this.onHoverCallback(closestPt);
  }

  mapVal(val, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  getNyquistBounds() {
    let minX = 0;
    let maxX = 100;
    let minY = -10;
    let maxY = 50;

    const allPts = [...this.spectrum];
    if (this.showBaselineOverlay && this.baselineSpectrum && this.baselineSpectrum.length > 0) {
      allPts.push(...this.baselineSpectrum);
    }

    if (allPts.length > 0) {
      const zRes = allPts.map(p => p.zRe);
      const negZIms = allPts.map(p => p.negZIm);
      minX = Math.min(0, ...zRes);
      maxX = Math.max(80, ...zRes) * 1.15;
      minY = Math.min(-15, ...negZIms);
      maxY = Math.max(40, ...negZIms) * 1.25;
    }

    return {
      minX, maxX, minY, maxY,
      padL: 65, padR: 35, padT: 35, padB: 50
    };
  }

  getBodeBounds() {
    let minLogF = -2;
    let maxLogF = 5;
    let minMag = 10;
    let maxMag = 300;
    let minPhase = -90;
    let maxPhase = 30;

    if (this.spectrum.length > 0) {
      const logFs = this.spectrum.map(p => Math.log10(p.f));
      const mags = this.spectrum.map(p => p.mag);
      const phases = this.spectrum.map(p => p.phase);
      minLogF = Math.floor(Math.min(...logFs));
      maxLogF = Math.ceil(Math.max(...logFs));
      minMag = Math.max(1, Math.min(...mags) * 0.8);
      maxMag = Math.max(...mags) * 1.2;
      minPhase = Math.min(-60, ...phases) - 5;
      maxPhase = Math.max(10, ...phases) + 5;
    }

    return {
      minLogF, maxLogF, minMag, maxMag, minPhase, maxPhase,
      padL: 65, padR: 65, padT: 35, padB: 50
    };
  }

  render() {
    this.renderNyquist();
    this.renderBode();
  }

  renderNyquist() {
    const canvas = this.nyquistCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || (canvas.width / dpr) || 600;
    const height = rect.height || (canvas.height / dpr) || 400;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, width, height);

    const b = this.getNyquistBounds();
    const plotW = width - b.padL - b.padR;
    const plotH = height - b.padT - b.padB;

    // Grid lines & Axis
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';

    // X Grid (Z_real)
    const xStep = this.calcStep(b.maxX - b.minX, 6);
    const firstX = Math.ceil(b.minX / xStep) * xStep;
    for (let x = firstX; x <= b.maxX; x += xStep) {
      const px = this.mapVal(x, b.minX, b.maxX, b.padL, width - b.padR);
      ctx.beginPath();
      ctx.moveTo(px, b.padT);
      ctx.lineTo(px, height - b.padB);
      ctx.stroke();
      ctx.fillText(x.toFixed(0), px - 10, height - b.padB + 18);
    }

    // Y Grid (-Z_imag)
    const yStep = this.calcStep(b.maxY - b.minY, 5);
    const firstY = Math.ceil(b.minY / yStep) * yStep;
    for (let y = firstY; y <= b.maxY; y += yStep) {
      const py = this.mapVal(y, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.beginPath();
      ctx.moveTo(b.padL, py);
      ctx.lineTo(width - b.padR, py);
      ctx.stroke();
      ctx.fillText(y.toFixed(0), b.padL - 32, py + 4);
    }

    // Zero line for Y (Z_imag = 0 real axis)
    const zeroY = this.mapVal(0, b.minY, b.maxY, height - b.padB, b.padT);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.padL, zeroY);
    ctx.lineTo(width - b.padR, zeroY);
    ctx.stroke();

    // Axis Labels
    ctx.font = '12px "Outfit", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText("Z' 実部 (mΩ / Real Impedance)", width / 2 - 60, height - 12);
    
    ctx.save();
    ctx.translate(18, height / 2 + 60);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("-Z'' 虚部 (mΩ / -Imaginary Impedance)", 0, 0);
    ctx.restore();

    // Title / Legend
    ctx.font = 'bold 13px "Outfit", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ Cole-Cole (Nyquist) プロット', b.padL, 22);

    if (!this.spectrum || this.spectrum.length === 0) return;

    const visiblePoints = this.sweepIndex >= 0 
      ? this.spectrum.slice(0, this.sweepIndex + 1)
      : this.spectrum;

    // 1. Draw "もとの円弧" (Baseline Reference Arc - 赤色破線) if enabled
    if (this.showBaselineOverlay && this.baselineSpectrum && this.baselineSpectrum.length > 0) {
      this.drawBaselineOverlay(ctx, b, width, height);
    }

    // 2. Draw Highlight / Theoretical Decomposition Arcs (アノード・カソードCPE・Warburg)
    this.drawNyquistElementHighlight(ctx, b, width, height);

    // 3. Draw Nyquist Current Measured Curve (シアン実線)
    if (visiblePoints.length > 1) {
      ctx.beginPath();
      const firstPx = this.mapVal(visiblePoints[0].zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const firstPy = this.mapVal(visiblePoints[0].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.moveTo(firstPx, firstPy);

      for (let i = 1; i < visiblePoints.length; i++) {
        const pt = visiblePoints[i];
        const px = this.mapVal(pt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
        const py = this.mapVal(pt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
        ctx.lineTo(px, py);
      }

      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Draw Shift Vectors (ΔR_Ω 水平シフト矢印 & ΔR_ct 拡大矢印)
    if (this.showBaselineOverlay && this.showShiftVectors && this.baselineSpectrum.length > 0) {
      this.drawShiftVectors(ctx, b, width, height);
    }

    // Draw Data Points & Key Frequency Labels
    const keyFreqLabels = [100000, 10000, 1000, 100, 10, 1, 0.1, 0.01];
    for (let i = 0; i < visiblePoints.length; i++) {
      const pt = visiblePoints[i];
      const px = this.mapVal(pt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const py = this.mapVal(pt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      // Check if this point is near a key frequency
      const isKey = keyFreqLabels.some(kf => Math.abs(Math.log10(pt.f) - Math.log10(kf)) < 0.05);

      ctx.beginPath();
      ctx.arc(px, py, isKey ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isKey ? '#f59e0b' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isKey) {
        ctx.font = 'bold 10px "JetBrains Mono", Consolas, monospace';
        ctx.fillStyle = '#fbbf24';
        const label = pt.f >= 1000 ? `${(pt.f / 1000).toFixed(0)}k` : `${pt.f.toFixed(pt.f < 1 ? 1 : 0)}Hz`;
        ctx.fillText(label, px + 6, py - 6);
      }
    }

    // Draw Ohmic Resistance Intercept Marker (HFR)
    if (this.analysis && this.analysis.rOhmEst) {
      const rOhmX = this.mapVal(this.analysis.rOhmEst, b.minX, b.maxX, b.padL, width - b.padR);
      ctx.strokeStyle = '#10b981';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(rOhmX, b.padT);
      ctx.lineTo(rOhmX, height - b.padB);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 10px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(`R_Ω ≈ ${this.analysis.rOhmEst.toFixed(1)}mΩ`, rOhmX - 25, zeroY - 12);
    }

    // Draw Apex Marker (f_max)
    if (this.analysis && this.analysis.fApex && this.analysis.maxNegZIm > 0) {
      const apexPt = this.spectrum.find(p => p.f === this.analysis.fApex);
      if (apexPt) {
        const ax = this.mapVal(apexPt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
        const ay = this.mapVal(apexPt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 10px "JetBrains Mono", Consolas, monospace';
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`頂点 f_max=${apexPt.f.toFixed(1)}Hz`, ax - 30, ay - 10);
      }
    }

    // Draw Sweep Cursor indicator if currently sweeping
    if (this.sweepIndex >= 0 && this.sweepIndex < this.spectrum.length) {
      const curPt = this.spectrum[this.sweepIndex];
      const cx = this.mapVal(curPt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const cy = this.mapVal(curPt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover Tooltip
    if (this.hoverPoint) {
      const hx = this.mapVal(this.hoverPoint.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const hy = this.mapVal(this.hoverPoint.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.stroke();

      this.drawTooltip(ctx, hx, hy, width, height, [
        `周波数 (f): ${this.hoverPoint.f >= 1000 ? (this.hoverPoint.f/1000).toFixed(2)+' kHz' : this.hoverPoint.f.toFixed(2)+' Hz'}`,
        `実部 Z': ${this.hoverPoint.zRe.toFixed(2)} mΩ`,
        `虚部 -Z'': ${this.hoverPoint.negZIm.toFixed(2)} mΩ`,
        `インピーダンス |Z|: ${this.hoverPoint.mag.toFixed(2)} mΩ`,
        `位相角 θ: ${this.hoverPoint.phase.toFixed(1)}°`
      ]);
    }
  }

  /**
   * Draw "もとの円弧" (Baseline Reference Semicircle Arc - 正常運転時/比較基準)
   */
  drawBaselineOverlay(ctx, b, width, height) {
    const pts = this.baselineSpectrum;
    if (!pts || pts.length < 2) return;

    const zeroY = this.mapVal(0, b.minY, b.maxY, height - b.padB, b.padT);

    // 1. Shaded area under baseline arc
    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.06)';
    ctx.beginPath();
    const firstPx = this.mapVal(pts[0].zRe, b.minX, b.maxX, b.padL, width - b.padR);
    const firstPy = this.mapVal(pts[0].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
    ctx.moveTo(firstPx, firstPy);
    for (let i = 1; i < pts.length; i++) {
      const px = this.mapVal(pts[i].zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const py = this.mapVal(pts[i].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.lineTo(px, py);
    }
    const lastPx = this.mapVal(pts[pts.length - 1].zRe, b.minX, b.maxX, b.padL, width - b.padR);
    ctx.lineTo(lastPx, zeroY);
    ctx.lineTo(firstPx, zeroY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2. Stroke baseline dotted/dashed curve
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 4]);

    ctx.beginPath();
    ctx.moveTo(firstPx, firstPy);
    for (let i = 1; i < pts.length; i++) {
      const px = this.mapVal(pts[i].zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const py = this.mapVal(pts[i].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // 3. Baseline Key Data Points (tiny coral dots)
    for (let i = 0; i < pts.length; i += 4) {
      const pt = pts[i];
      const px = this.mapVal(pt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const py = this.mapVal(pt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fb7185';
      ctx.fill();
    }

    // 4. Baseline HFR Marker (R_ohm intercept)
    const baseROhm = pts[0] ? pts[0].zRe : 30.0;
    const baseROhmX = this.mapVal(baseROhm, b.minX, b.maxX, b.padL, width - b.padR);
    ctx.save();
    ctx.strokeStyle = '#f43f5e';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(baseROhmX, b.padT);
    ctx.lineTo(baseROhmX, height - b.padB);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 9.5px "JetBrains Mono", Consolas, monospace';
    ctx.fillText(`基準 R_Ω=${baseROhm.toFixed(0)}mΩ`, baseROhmX - 25, zeroY + 14);
    ctx.restore();

    // 5. Baseline Top Apex Marker
    let baseMaxNegZIm = -Infinity;
    let baseApexPt = pts[0];
    for (const pt of pts) {
      if (pt.negZIm > baseMaxNegZIm) {
        baseMaxNegZIm = pt.negZIm;
        baseApexPt = pt;
      }
    }
    if (baseApexPt && baseMaxNegZIm > 2) {
      const ax = this.mapVal(baseApexPt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const ay = this.mapVal(baseApexPt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      ctx.save();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 9.5px "JetBrains Mono", Consolas, monospace';
      ctx.fillStyle = '#fb7185';
      ctx.fillText(`基準頂点`, ax - 16, ay - 8);
      ctx.restore();
    }

    // 6. Main Overlay Legend (Top Left Banner)
    ctx.save();
    const legendX = b.padL + 10;
    const legendY = b.padT + 8;
    ctx.fillStyle = 'rgba(11, 19, 38, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.fillRect(legendX, legendY, 210, 48);
    ctx.strokeRect(legendX, legendY, 210, 48);

    ctx.font = 'bold 10px "Outfit", sans-serif';
    ctx.fillStyle = '#f43f5e';
    ctx.fillText('🔴 もとの基準円弧 (正常運転時)', legendX + 10, legendY + 18);

    ctx.font = 'bold 10px "Outfit", sans-serif';
    ctx.fillStyle = '#00f2fe';
    ctx.fillText('⚡ 現在の測定曲線 (状態変化後)', legendX + 10, legendY + 36);
    ctx.restore();
  }

  /**
   * Draw Shift Vectors & Deformation Arrows (添付画像のような矢印アノテーション)
   */
  drawShiftVectors(ctx, b, width, height) {
    if (!this.spectrum || this.spectrum.length === 0) return;
    if (!this.baselineSpectrum || this.baselineSpectrum.length === 0) return;

    const zeroY = this.mapVal(0, b.minY, b.maxY, height - b.padB, b.padT);

    // 1. R_ohm horizontal shift vector (電解質膜乾燥・接触抵抗による右シフト)
    const curROhm = this.analysis ? this.analysis.rOhmEst : this.spectrum[0].zRe;
    const baseROhm = this.baselineSpectrum[0].zRe;
    const deltaROhm = curROhm - baseROhm;

    if (Math.abs(deltaROhm) >= 4.0) {
      const fromX = this.mapVal(baseROhm, b.minX, b.maxX, b.padL, width - b.padR);
      const toX = this.mapVal(curROhm, b.minX, b.maxX, b.padL, width - b.padR);
      const arrowY = zeroY + 28;

      const label = deltaROhm > 0 
        ? `→ 膜乾燥: ΔR_{Ω} = +${deltaROhm.toFixed(1)} mΩ`
        : `← ΔR_{Ω} = ${deltaROhm.toFixed(1)} mΩ`;
      this.drawArrowHead(ctx, fromX, arrowY, toX, arrowY, '#10b981', 2.8, label, 'bottom');
    }

    // 2. R_ct arc expansion vector (触媒被毒・劣化・反応抵抗による円弧拡大)
    let curMaxIm = -Infinity;
    let curApex = this.spectrum[0];
    for (const pt of this.spectrum) {
      if (pt.negZIm > curMaxIm) {
        curMaxIm = pt.negZIm;
        curApex = pt;
      }
    }

    let baseMaxIm = -Infinity;
    let baseApex = this.baselineSpectrum[0];
    for (const pt of this.baselineSpectrum) {
      if (pt.negZIm > baseMaxIm) {
        baseMaxIm = pt.negZIm;
        baseApex = pt;
      }
    }

    const deltaRct = (curMaxIm * 2) - (baseMaxIm * 2);
    if (Math.abs(deltaRct) >= 15.0 && curApex && baseApex) {
      const fromX = this.mapVal(baseApex.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const fromY = this.mapVal(baseApex.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      const toX = this.mapVal(curApex.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const toY = this.mapVal(curApex.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      const label = deltaRct > 0
        ? `↗ 触媒劣化/被毒: ΔR_{ct} = +${deltaRct.toFixed(0)} mΩ`
        : `↘ ΔR_{ct} = ${deltaRct.toFixed(0)} mΩ`;
      this.drawArrowHead(ctx, fromX, fromY, toX, toY, '#38bdf8', 2.6, label, 'top');
    }

    // 3. Warburg low-frequency tail expansion (フラッディングによる拡散円弧拡大)
    const curLowFreq = this.spectrum[this.spectrum.length - 1];
    const baseLowFreq = this.baselineSpectrum[this.baselineSpectrum.length - 1];
    if (curLowFreq && baseLowFreq && (curLowFreq.zRe - baseLowFreq.zRe) > 25.0) {
      const fromX = this.mapVal(baseLowFreq.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const fromY = this.mapVal(baseLowFreq.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      const toX = this.mapVal(curLowFreq.zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const toY = this.mapVal(curLowFreq.negZIm, b.minY, b.maxY, height - b.padB, b.padT);

      const deltaW = curLowFreq.zRe - baseLowFreq.zRe;
      this.drawArrowHead(ctx, fromX, fromY, toX, toY, '#c084fc', 2.4, `💧 フラッディング: ΔZ_{diff} = +${deltaW.toFixed(0)} mΩ`, 'top');
    }
  }

  /**
   * Helper to draw text with natural subscripts in Canvas 2D (e.g. "R_{ct,a}: 6mΩ")
   */
  drawFormattedText(ctx, text, x, y, baseFont = 'bold 9.5px "JetBrains Mono", Consolas, monospace', subSizeRatio = 0.75, subDy = 2.5) {
    if (!text) return 0;
    
    // Parse parts like: normal text vs _{subscript}
    // Also auto-convert R_Ω -> R_{Ω}, R_cta -> R_{ct,a}, f_max -> f_{max}, etc.
    let normalized = text
      .replace(/R_Ω/g, 'R_{Ω}')
      .replace(/R_cta/g, 'R_{ct,a}')
      .replace(/R_ctc/g, 'R_{ct,c}')
      .replace(/R_ct/g, 'R_{ct}')
      .replace(/R_Wc/g, 'R_{W,c}')
      .replace(/R_Wa/g, 'R_{W,a}')
      .replace(/R_W/g, 'R_{W}')
      .replace(/f_max/g, 'f_{max}')
      .replace(/ΔR_Ω/g, 'ΔR_{Ω}')
      .replace(/ΔR_ct/g, 'ΔR_{ct}')
      .replace(/Z_W/g, 'Z_{W}')
      .replace(/C_dla/g, 'C_{dl,a}')
      .replace(/C_dl/g, 'C_{dl}');

    // Extract base font size
    const sizeMatch = baseFont.match(/(\d+(\.\d+)?)px/);
    const baseSize = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
    const subSize = Math.round(baseSize * subSizeRatio * 10) / 10;
    const subFont = baseFont.replace(/\d+(\.\d+)?px/, `${subSize}px`);

    const regex = /_\{([^}]+)\}|([^_]+)/g;
    let match;
    let curX = x;

    ctx.save();
    while ((match = regex.exec(normalized)) !== null) {
      if (match[1] !== undefined) {
        // Subscript part
        ctx.font = subFont;
        ctx.fillText(match[1], curX, y + subDy);
        curX += ctx.measureText(match[1]).width;
      } else if (match[2] !== undefined) {
        // Normal text part
        ctx.font = baseFont;
        ctx.fillText(match[2], curX, y);
        curX += ctx.measureText(match[2]).width;
      }
    }
    ctx.restore();
    return curX - x;
  }

  measureFormattedText(ctx, text, baseFont = 'bold 9.5px "JetBrains Mono", Consolas, monospace', subSizeRatio = 0.75) {
    if (!text) return 0;
    let normalized = text
      .replace(/R_Ω/g, 'R_{Ω}')
      .replace(/R_cta/g, 'R_{ct,a}')
      .replace(/R_ctc/g, 'R_{ct,c}')
      .replace(/R_ct/g, 'R_{ct}')
      .replace(/R_Wc/g, 'R_{W,c}')
      .replace(/R_Wa/g, 'R_{W,a}')
      .replace(/R_W/g, 'R_{W}')
      .replace(/f_max/g, 'f_{max}')
      .replace(/ΔR_Ω/g, 'ΔR_{Ω}')
      .replace(/ΔR_ct/g, 'ΔR_{ct}')
      .replace(/Z_W/g, 'Z_{W}')
      .replace(/C_dla/g, 'C_{dl,a}')
      .replace(/C_dl/g, 'C_{dl}');

    const sizeMatch = baseFont.match(/(\d+(\.\d+)?)px/);
    const baseSize = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
    const subSize = Math.round(baseSize * subSizeRatio * 10) / 10;
    const subFont = baseFont.replace(/\d+(\.\d+)?px/, `${subSize}px`);

    const regex = /_\{([^}]+)\}|([^_]+)/g;
    let match;
    let totalW = 0;

    ctx.save();
    while ((match = regex.exec(normalized)) !== null) {
      if (match[1] !== undefined) {
        ctx.font = subFont;
        totalW += ctx.measureText(match[1]).width;
      } else if (match[2] !== undefined) {
        ctx.font = baseFont;
        totalW += ctx.measureText(match[2]).width;
      }
    }
    ctx.restore();
    return totalW;
  }

  /**
   * Helper to draw high-visibility vector arrows with arrowhead and label
   */
  drawArrowHead(ctx, fromX, fromY, toX, toY, color, lineWidth, label, labelPos = 'top') {
    const headLen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    if (label) {
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      const font = 'bold 10.5px "Outfit", sans-serif';
      const textW = this.measureFormattedText(ctx, label, font, 0.78);
      
      const badgeY = labelPos === 'top' ? midY - 14 : midY + 12;
      ctx.fillStyle = 'rgba(8, 14, 28, 0.9)';
      ctx.fillRect(midX - textW / 2 - 4, badgeY - 10, textW + 8, 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - textW / 2 - 4, badgeY - 10, textW + 8, 16);

      ctx.fillStyle = color;
      this.drawFormattedText(ctx, label, midX - textW / 2, badgeY + 2, font, 0.78, 2.0);
    }
    ctx.restore();
  }

  setTheoreticalComponents(theo) {
    this.theoretical = theo;
  }

  setShowAllTheoretical(show) {
    this.showAllTheoretical = show;
    this.render();
  }

  setShowIdealCompare(show) {
    this.showIdealCompare = show;
    this.render();
  }

  drawNyquistElementHighlight(ctx, b, width, height) {
    if (!this.theoretical) return;

    const theo = this.theoretical;
    const zeroY = this.mapVal(0, b.minY, b.maxY, height - b.padB, b.padT);

    // Clean helper to draw theoretical curve (separate fill and stroke paths)
    const drawCurve = (pts, strokeColor, fillColor, label, isDashed = true, lineWidth = 2.5) => {
      if (!pts || pts.length === 0) return;

      // 1. Shaded area under arc
      if (fillColor) {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        const firstPx = this.mapVal(pts[0].zRe, b.minX, b.maxX, b.padL, width - b.padR);
        const firstPy = this.mapVal(pts[0].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
        ctx.moveTo(firstPx, firstPy);
        for (let i = 1; i < pts.length; i++) {
          const px = this.mapVal(pts[i].zRe, b.minX, b.maxX, b.padL, width - b.padR);
          const py = this.mapVal(pts[i].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
          ctx.lineTo(px, py);
        }
        const lastPx = this.mapVal(pts[pts.length - 1].zRe, b.minX, b.maxX, b.padL, width - b.padR);
        ctx.lineTo(lastPx, zeroY);
        ctx.lineTo(firstPx, zeroY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 2. Stroke curve line (only the arc curve, NOT the baseline)
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      if (isDashed) ctx.setLineDash([7, 4]);

      ctx.beginPath();
      const firstPx = this.mapVal(pts[0].zRe, b.minX, b.maxX, b.padL, width - b.padR);
      const firstPy = this.mapVal(pts[0].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
      ctx.moveTo(firstPx, firstPy);

      for (let i = 1; i < pts.length; i++) {
        const px = this.mapVal(pts[i].zRe, b.minX, b.maxX, b.padL, width - b.padR);
        const py = this.mapVal(pts[i].negZIm, b.minY, b.maxY, height - b.padB, b.padT);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      // 3. Label Badge if requested
      if (label) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        const badgeW = Math.min(width - b.padL - b.padR, 440);
        ctx.fillRect(b.padL + 12, b.padT + 10, badgeW, 26);
        ctx.strokeRect(b.padL + 12, b.padT + 10, badgeW, 26);

        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.fillStyle = strokeColor;
        ctx.fillText('📐 ' + label, b.padL + 22, b.padT + 27);
        ctx.restore();
      }
    };

    // Helper to draw horizontal dimension lines (|← R →|) under real axis
    const drawDimension = (xStartVal, xEndVal, yOffsetPx, color, labelText) => {
      const x1 = this.mapVal(xStartVal, b.minX, b.maxX, b.padL, width - b.padR);
      const x2 = this.mapVal(xEndVal, b.minX, b.maxX, b.padL, width - b.padR);
      const y = zeroY + yOffsetPx;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.4;

      // Vertical tick marks
      ctx.beginPath();
      ctx.moveTo(x1, y - 4);
      ctx.lineTo(x1, y + 4);
      ctx.moveTo(x2, y - 4);
      ctx.lineTo(x2, y + 4);
      ctx.stroke();

      // Horizontal dimension line
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      // Dimension text label with natural subscript
      const font = 'bold 9.5px "JetBrains Mono", Consolas, monospace';
      const tw = this.measureFormattedText(ctx, labelText, font, 0.78);
      const midX = (x1 + x2) / 2;
      ctx.fillStyle = 'rgba(8, 14, 28, 0.85)';
      ctx.fillRect(midX - tw / 2 - 3, y - 7, tw + 6, 14);
      ctx.fillStyle = color;
      this.drawFormattedText(ctx, labelText, midX - tw / 2, y + 3, font, 0.78, 2.0);
      ctx.restore();
    };

    // Helper to draw vertical boundary demarcation line
    const drawBoundaryLine = (xVal, color, label) => {
      const px = this.mapVal(xVal, b.minX, b.maxX, b.padL, width - b.padR);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, b.padT + 20);
      ctx.lineTo(px, height - b.padB);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = color;
        const font = 'bold 9px "JetBrains Mono", monospace';
        this.drawFormattedText(ctx, label, px + 3, b.padT + 30, font, 0.78, 2.0);
      }
      ctx.restore();
    };

    // If 'show all theoretical' is toggled, draw all component arcs simultaneously
    if (this.showAllTheoretical) {
      // 0. Demarcation lines & Dimensions
      const x0 = 0;
      const x1 = theo.baseOffset;
      const x2 = x1 + (theo.isAnodeActive ? theo.rCtAnode : 0);
      const x3 = x2 + (theo.isCathodeActive ? theo.rCtCathode : 0);
      const x4 = x3 + (theo.isWarburgActive ? theo.rWarburg : 0);

      // Boundaries
      if (theo.baseOffset > 0) drawBoundaryLine(x1, '#10b981', 'R_{Ω}');
      if (theo.isAnodeActive && theo.rCtAnode > 0) drawBoundaryLine(x2, '#f59e0b', '');
      if (theo.isCathodeActive && theo.rCtCathode > 0) drawBoundaryLine(x3, '#00f2fe', '');

      // Dimensions under axis
      let dimY = 16;
      if (theo.baseOffset > 0) {
        drawDimension(0, x1, dimY, '#10b981', `R_{Ω}:${theo.baseOffset.toFixed(0)}mΩ`);
      }
      if (theo.isAnodeActive && theo.rCtAnode > 0) {
        const anodeLabel = theo.isAnodeWarburgActive ? `R_{a}:${theo.rCtAnodePure.toFixed(1)}+W_{a}:${theo.rWarburgAnode.toFixed(0)}mΩ` : `R_{ct,a}:${theo.rCtAnode.toFixed(1)}mΩ`;
        drawDimension(x1, x2, dimY, '#f59e0b', anodeLabel);
      }
      if (theo.isCathodeActive && theo.rCtCathode > 0) {
        drawDimension(x2, x3, dimY, '#00f2fe', `R_{ct,c}:${theo.rCtCathode.toFixed(0)}mΩ`);
      }
      if (theo.isWarburgActive && theo.rWarburg > 0) {
        drawDimension(x3, x4, dimY, '#c084fc', `R_{W,c}:${theo.rWarburg.toFixed(0)}mΩ`);
      }

      // 1. Anode Isolated Arc (要素円 1)
      if (theo.isAnodeActive && theo.anodeArc && theo.anodeArc.length > 0) {
        drawCurve(theo.anodeArc, '#f59e0b', 'rgba(245, 158, 11, 0.14)', null, true, 2.4);

        // Apex of Anode Arc
        let maxAnodeIm = -Infinity;
        let anodeApex = theo.anodeArc[0];
        for (const pt of theo.anodeArc) {
          if (pt.negZIm > maxAnodeIm) {
            maxAnodeIm = pt.negZIm;
            anodeApex = pt;
          }
        }
        if (anodeApex && maxAnodeIm > 0.5) {
          const apx = this.mapVal(anodeApex.zRe, b.minX, b.maxX, b.padL, width - b.padR);
          const apy = this.mapVal(anodeApex.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
          ctx.save();
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(apx, apy, 3.5, 0, Math.PI * 2);
          ctx.fill();
          const font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#fbbf24';
          const aLabel = theo.isAnodeWarburgActive ? `①アノード(HOR+拡散)` : `①アノード半円`;
          this.drawFormattedText(ctx, aLabel, apx - 32, apy - 6, font, 0.78, 2.0);
          ctx.restore();
        }
      }

      // 2. Cathode Depressed CPE Arc (要素円 2 - Theory Elliptic Arc)
      if (theo.isCathodeActive && theo.cathodeArc && theo.cathodeArc.length > 0) {
        drawCurve(theo.cathodeArc, '#00f2fe', 'rgba(0, 242, 254, 0.12)', null, true, 2.6);

        // Apex of Cathode Arc
        let maxCathodeIm = -Infinity;
        let cathodeApex = theo.cathodeArc[0];
        for (const pt of theo.cathodeArc) {
          if (pt.negZIm > maxCathodeIm) {
            maxCathodeIm = pt.negZIm;
            cathodeApex = pt;
          }
        }
        if (cathodeApex && maxCathodeIm > 1) {
          const cpx = this.mapVal(cathodeApex.zRe, b.minX, b.maxX, b.padL, width - b.padR);
          const cpy = this.mapVal(cathodeApex.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
          ctx.save();
          ctx.fillStyle = '#00f2fe';
          ctx.beginPath();
          ctx.arc(cpx, cpy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          const font = 'bold 9.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#38bdf8';
          const cLabel = `②カソード主楕円弧 (f_{max}≈${theo.fApexCathode.toFixed(0)}Hz)`;
          this.drawFormattedText(ctx, cLabel, cpx - 45, cpy - 8, font, 0.78, 2.0);
          ctx.restore();
        }

        // Optional: Ideal semicircle comparison if n < 0.99
        if (this.showIdealCompare && theo.idealCathodeArc && theo.idealCathodeArc.length > 0) {
          drawCurve(theo.idealCathodeArc, '#94a3b8', null, null, true, 1.5);
        }
      }

      // 3. Cathode Warburg diffusion
      if (theo.isWarburgActive && theo.warburgCurve && theo.warburgCurve.length > 0) {
        drawCurve(theo.warburgCurve, '#c084fc', 'rgba(192, 132, 252, 0.12)', null, true, 2.4);

        // Label on Warburg
        const wbPt = theo.warburgCurve[Math.floor(theo.warburgCurve.length * 0.55)];
        if (wbPt) {
          const wbx = this.mapVal(wbPt.zRe, b.minX, b.maxX, b.padL, width - b.padR);
          const wby = this.mapVal(wbPt.negZIm, b.minY, b.maxY, height - b.padB, b.padT);
          ctx.save();
          const font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#d8b4fe';
          this.drawFormattedText(ctx, '③カソードWarburg拡散', wbx - 20, wby - 8, font, 0.78, 2.0);
          ctx.restore();
        }
      }

      // 4. Inductance line
      if (theo.inductanceLine && theo.inductanceLine.length > 0) {
        drawCurve(theo.inductanceLine, '#ef4444', null, null, true, 2.0);
      }

      // Overlay Legend in Top-Right
      ctx.save();
      const legendX = width - b.padR - 225;
      const legendY = b.padT + 10;
      const legendH = theo.isAnodeWarburgActive ? 98 : 84;
      ctx.fillStyle = 'rgba(11, 19, 38, 0.90)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.fillRect(legendX, legendY, 215, legendH);
      ctx.strokeRect(legendX, legendY, 215, legendH);

      ctx.font = 'bold 10.5px "Outfit", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('⚡ 電気素子ごとの要素円分解', legendX + 10, legendY + 16);

      const legFont = '9.5px "JetBrains Mono", monospace';
      let lY = legendY + 32;
      if (theo.baseOffset > 0) {
        ctx.fillStyle = '#10b981';
        this.drawFormattedText(ctx, `-- 膜オーム抵抗 (R_{Ω}=${theo.baseOffset.toFixed(1)}mΩ)`, legendX + 10, lY, legFont, 0.78, 2.0);
        lY += 14;
      }
      if (theo.isAnodeActive) {
        ctx.fillStyle = '#f59e0b';
        const aTxt = theo.isAnodeWarburgActive ? `-- ①アノード(R_{ct,a}=${theo.rCtAnodePure.toFixed(1)}+W_{a}=${theo.rWarburgAnode.toFixed(0)}mΩ)` : `-- ①アノード半円 (R_{ct,a}=${theo.rCtAnode.toFixed(1)}mΩ)`;
        this.drawFormattedText(ctx, aTxt, legendX + 10, lY, legFont, 0.78, 2.0);
        lY += 14;
      }
      if (theo.isCathodeActive) {
        ctx.fillStyle = '#00f2fe';
        ctx.fillText(`-- ②カソード主楕円弧 (R_ctc=${theo.rCtCathode.toFixed(0)}mΩ)`, legendX + 10, legendY + 60);
      }
      if (theo.isWarburgActive) {
        ctx.fillStyle = '#c084fc';
        ctx.fillText(`-- ③Warburg拡散 (R_W=${theo.rWarburg.toFixed(0)}mΩ)`, legendX + 10, legendY + 74);
      }
      ctx.restore();
    }

    // Specific hovered component theoretical arc overlay with high visibility
    if (this.activeHighlightElement === 'R_ohm') {
      const px = this.mapVal(theo.baseOffset, b.minX, b.maxX, b.padL, width - b.padR);
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.padL, zeroY);
      ctx.lineTo(px, zeroY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(b.padL, b.padT, px - b.padL, height - b.padB - b.padT);
      ctx.restore();

      drawCurve([], '#10b981', null, `理論オーム抵抗 R_Ω = ${theo.baseOffset.toFixed(1)} mΩ (電解質膜・接触オフセット)`);
    } else if (this.activeHighlightElement === 'anode') {
      drawCurve(theo.anodeArc, '#f59e0b', 'rgba(245, 158, 11, 0.25)', `理論アノードHOR半円弧: R_cta = ${theo.rCtAnode.toFixed(1)} mΩ ∥ C_dla (高周波完全半円)`);
    } else if (this.activeHighlightElement === 'cathode') {
      // Cathode CPE Theoretical Depressed Arc (Theory Elliptic / Depressed Semicircle Arc)
      drawCurve(theo.cathodeArc, '#00f2fe', 'rgba(0, 242, 254, 0.25)', `理論カソードORR楕円弧 (CPE): R_ctc=${theo.rCtCathode.toFixed(1)} mΩ, n=${theo.nCathode.toFixed(2)}, f_max≈${theo.fApexCathode.toFixed(1)}Hz`);

      // Draw CPE Center & Depression Angle Line
      if (theo.centerZRe && isFinite(theo.centerNegZIm)) {
        const cX = this.mapVal(theo.centerZRe, b.minX, b.maxX, b.padL, width - b.padR);
        const cY = this.mapVal(theo.centerNegZIm, b.minY, b.maxY, height - b.padB, b.padT);
        const startX = this.mapVal(theo.cathodeOffset, b.minX, b.maxX, b.padL, width - b.padR);
        const endX = this.mapVal(theo.cathodeOffset + theo.rCtCathode, b.minX, b.maxX, b.padL, width - b.padR);

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, zeroY);
        ctx.lineTo(cX, cY);
        ctx.lineTo(endX, zeroY);
        ctx.stroke();

        // Center Marker
        ctx.fillStyle = '#00f2fe';
        ctx.beginPath();
        ctx.arc(cX, cY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`Cole-Cole中心 (沈み込み角 α=${theo.alphaDepressDeg.toFixed(1)}°)`, cX + 6, cY + 4);
        ctx.restore();
      }

      // Draw ideal semicircle for comparison
      if (theo.idealCathodeArc && theo.idealCathodeArc.length > 0) {
        drawCurve(theo.idealCathodeArc, '#94a3b8', null, null, true, 1.5);
      }
    } else if (this.activeHighlightElement === 'warburg') {
      drawCurve(theo.warburgCurve, '#c084fc', 'rgba(192, 132, 252, 0.25)', `理論Warburg有限長拡散インピーダンス: R_W = ${theo.rWarburg.toFixed(1)} mΩ (低周波45°/拡散円弧)`);
    } else if (this.activeHighlightElement === 'L') {
      drawCurve(theo.inductanceLine, '#ef4444', null, '理論配線インダクタンス: Z_L = j·ω·L (高周波第4象限ループ)');
    }
  }

  renderBode() {
    const canvas = this.bodeCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || (canvas.width / dpr) || 600;
    const height = rect.height || (canvas.height / dpr) || 400;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, width, height);

    const b = this.getBodeBounds();

    // Grid lines & Frequency Axis (log10 f)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';

    for (let logF = b.minLogF; logF <= b.maxLogF; logF++) {
      const px = this.mapVal(logF, b.minLogF, b.maxLogF, b.padL, width - b.padR);
      ctx.beginPath();
      ctx.moveTo(px, b.padT);
      ctx.lineTo(px, height - b.padB);
      ctx.stroke();
      
      const fVal = Math.pow(10, logF);
      const label = fVal >= 1000 ? `${fVal/1000}k` : (fVal < 1 ? fVal.toFixed(2) : fVal);
      ctx.fillText(label + 'Hz', px - 12, height - b.padB + 18);
    }

    // Left Y Axis: Magnitude |Z| (mΩ)
    const magStep = this.calcStep(b.maxMag - b.minMag, 4);
    for (let m = Math.ceil(b.minMag / magStep) * magStep; m <= b.maxMag; m += magStep) {
      const py = this.mapVal(m, b.minMag, b.maxMag, height - b.padB, b.padT);
      ctx.beginPath();
      ctx.moveTo(b.padL, py);
      ctx.lineTo(width - b.padR, py);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(m.toFixed(0), b.padL - 32, py + 4);
    }

    // Right Y Axis: Phase θ (deg)
    for (let deg = -90; deg <= 30; deg += 30) {
      const py = this.mapVal(deg, b.minPhase, b.maxPhase, height - b.padB, b.padT);
      ctx.fillStyle = '#a855f7';
      ctx.fillText(deg + '°', width - b.padR + 8, py + 4);
    }

    // Axis Titles
    ctx.font = '12px "Outfit", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('周波数 Frequency (Hz, Log scale)', width / 2 - 70, height - 12);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('|Z| 振幅 (mΩ)', 15, 22);

    ctx.fillStyle = '#a855f7';
    ctx.fillText('θ 位相角 (°)', width - 80, 22);

    // Title / Legend
    ctx.font = 'bold 13px "Outfit", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('📈 Bode プロット (|Z| & Phase vs Frequency)', b.padL + 80, 22);

    if (!this.spectrum || this.spectrum.length === 0) return;

    const visiblePoints = this.sweepIndex >= 0 
      ? this.spectrum.slice(0, this.sweepIndex + 1)
      : this.spectrum;

    // Draw Magnitude Curve (|Z|)
    if (visiblePoints.length > 1) {
      ctx.beginPath();
      const firstLogF = Math.log10(visiblePoints[0].f);
      const firstPx = this.mapVal(firstLogF, b.minLogF, b.maxLogF, b.padL, width - b.padR);
      const firstPyMag = this.mapVal(visiblePoints[0].mag, b.minMag, b.maxMag, height - b.padB, b.padT);
      ctx.moveTo(firstPx, firstPyMag);

      for (let i = 1; i < visiblePoints.length; i++) {
        const pt = visiblePoints[i];
        const px = this.mapVal(Math.log10(pt.f), b.minLogF, b.maxLogF, b.padL, width - b.padR);
        const py = this.mapVal(pt.mag, b.minMag, b.maxMag, height - b.padB, b.padT);
        ctx.lineTo(px, py);
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Draw Phase Curve (Phase θ)
    if (visiblePoints.length > 1) {
      ctx.beginPath();
      const firstLogF = Math.log10(visiblePoints[0].f);
      const firstPx = this.mapVal(firstLogF, b.minLogF, b.maxLogF, b.padL, width - b.padR);
      const firstPyPhase = this.mapVal(visiblePoints[0].phase, b.minPhase, b.maxPhase, height - b.padB, b.padT);
      ctx.moveTo(firstPx, firstPyPhase);

      for (let i = 1; i < visiblePoints.length; i++) {
        const pt = visiblePoints[i];
        const px = this.mapVal(Math.log10(pt.f), b.minLogF, b.maxLogF, b.padL, width - b.padR);
        const py = this.mapVal(pt.phase, b.minPhase, b.maxPhase, height - b.padB, b.padT);
        ctx.lineTo(px, py);
      }

      ctx.strokeStyle = '#c084fc';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Hover Tooltip on Bode
    if (this.hoverPoint) {
      const hx = this.mapVal(Math.log10(this.hoverPoint.f), b.minLogF, b.maxLogF, b.padL, width - b.padR);
      const hyMag = this.mapVal(this.hoverPoint.mag, b.minMag, b.maxMag, height - b.padB, b.padT);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hyMag, 7, 0, Math.PI * 2);
      ctx.stroke();

      this.drawTooltip(ctx, hx, hyMag, width, height, [
        `周波数: ${this.hoverPoint.f >= 1000 ? (this.hoverPoint.f/1000).toFixed(2)+' kHz' : this.hoverPoint.f.toFixed(2)+' Hz'}`,
        `|Z|: ${this.hoverPoint.mag.toFixed(2)} mΩ`,
        `Phase θ: ${this.hoverPoint.phase.toFixed(1)}°`
      ]);
    }
  }

  drawNyquistElementHighlight(ctx, b, width, height) {
    if (!this.activeHighlightElement || this.spectrum.length === 0) return;

    let targetFreqRange = null;
    let label = '';
    let color = 'rgba(56, 189, 248, 0.2)';

    switch (this.activeHighlightElement) {
      case 'L':
        targetFreqRange = [5000, 100000];
        label = 'L_cable インダクタンス (高周波第4象限ループ)';
        color = 'rgba(239, 68, 68, 0.25)';
        break;
      case 'R_ohm':
        targetFreqRange = [500, 10000];
        label = 'R_Ω 高周波実軸切片 (電解質膜プロトン伝導抵抗)';
        color = 'rgba(16, 185, 129, 0.25)';
        break;
      case 'anode':
        targetFreqRange = [100, 5000];
        label = 'アノード HOR 反応 (R_cta ∥ C_dla 小円弧)';
        color = 'rgba(245, 158, 11, 0.25)';
        break;
      case 'cathode':
        targetFreqRange = [1, 500];
        label = 'カソード ORR 反応 (R_ctc ∥ CPE_c 主円弧)';
        color = 'rgba(14, 165, 233, 0.25)';
        break;
      case 'warburg':
        targetFreqRange = [0.01, 2];
        label = 'Warburg 拡散インピーダンス (低周波物質移動・フラッディング)';
        color = 'rgba(168, 85, 247, 0.25)';
        break;
    }

    if (!targetFreqRange) return;

    const matchedPts = this.spectrum.filter(p => p.f >= targetFreqRange[0] && p.f <= targetFreqRange[1]);
    if (matchedPts.length === 0) return;

    // Draw glowing hull / boundary around points
    ctx.save();
    ctx.strokeStyle = color.replace('0.25', '0.8');
    ctx.fillStyle = color;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const firstP = matchedPts[0];
    ctx.moveTo(
      this.mapVal(firstP.zRe, b.minX, b.maxX, b.padL, width - b.padR),
      this.mapVal(firstP.negZIm, b.minY, b.maxY, height - b.padB, b.padT)
    );
    for (let i = 1; i < matchedPts.length; i++) {
      const p = matchedPts[i];
      ctx.lineTo(
        this.mapVal(p.zRe, b.minX, b.maxX, b.padL, width - b.padR),
        this.mapVal(p.negZIm, b.minY, b.maxY, height - b.padB, b.padT)
      );
    }
    ctx.stroke();

    // Element highlight banner at top
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(b.padL + 200, 8, 300, 22);
    ctx.strokeStyle = color.replace('0.25', '1.0');
    ctx.lineWidth = 1;
    ctx.strokeRect(b.padL + 200, 8, 300, 22);

    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('🔍 ' + label, b.padL + 206, 23);

    ctx.restore();
  }

  drawTooltip(ctx, x, y, width, height, lines) {
    ctx.save();
    ctx.font = '11px "JetBrains Mono", monospace';
    const lineHeight = 16;
    const pad = 10;
    
    let maxW = 0;
    lines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    });

    const boxW = maxW + pad * 2;
    const boxH = lines.length * lineHeight + pad * 2;

    let boxX = x + 15;
    let boxY = y - boxH / 2;

    if (boxX + boxW > width - 10) boxX = x - boxW - 15;
    if (boxY < 10) boxY = 10;
    if (boxY + boxH > height - 10) boxY = height - boxH - 10;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    lines.forEach((line, idx) => {
      ctx.fillText(line, boxX + pad, boxY + pad + (idx + 1) * lineHeight - 3);
    });

    ctx.restore();
  }

  calcStep(range, targetSteps) {
    const rawStep = range / targetSteps;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const rel = rawStep / mag;
    let step;
    if (rel < 1.5) step = 1 * mag;
    else if (rel < 3.5) step = 2 * mag;
    else if (rel < 7.5) step = 5 * mag;
    else step = 10 * mag;
    return Math.max(1, step);
  }
}

// Export to window
window.EISPlots = EISPlots;
