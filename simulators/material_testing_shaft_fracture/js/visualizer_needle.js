/**
 * Needle Probe Compression & Penetration Rheology Visualizer
 * Anton Paar PNR 500型 実機完全再現 ＆ ニードル圧縮応力・ひずみ特性Canvas描画
 */

class NeedleVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
  }

  resize() {
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
  }

  draw(matEngine) {
    matEngine.stepNeedleTest();

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. ラボ背景
    this.drawLabBackground(ctx, w, h);

    // 2. Anton Paar PNR 500型 実機 ＆ ニードル針入アニメーション (左側 x: 30〜520)
    this.drawAntonPaarApparatus(ctx, matEngine, 255, 290);

    // 3. 右側: 圧縮応力-ひずみ（針入度）特性グラフ (右側 x: 540〜1160)
    this.drawStressStrainCurve(ctx, matEngine, 540, 30, 620, 520);
  }

  drawLabBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.35, h * 0.35, 60, w * 0.35, h * 0.35, 750);
    bgGrad.addColorStop(0, '#101624');
    bgGrad.addColorStop(0.55, '#090d16');
    bgGrad.addColorStop(1, '#04060a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // ─── 🔬 Anton Paar PNR 500型 実機全体 ＆ ニードル圧縮描画 ───
  drawAntonPaarApparatus(ctx, matEngine, cx, cy) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    const probe = matEngine.probeType; // 'needle' | 'cone' | 'ball'
    const depth = matEngine.needleDepth; // mm
    const forceN = matEngine.needleCurrentForce;
    const stressMPa = matEngine.needleCompStress;

    // ─── 1. 装置ベース台座 (Base Plate) ───
    const baseW = 340;
    const baseH = 32;
    const baseY = cy + 205;
    const baseX = cx - baseW / 2;

    // ゴム脚 (3箇所)
    [-130, 0, 130].forEach(fx => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx + fx - 16, baseY + baseH - 4, 32, 12);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(cx + fx - 16, baseY + baseH - 4, 32, 12);
    });

    // メインベースプレート
    const baseGrad = ctx.createLinearGradient(baseX, 0, baseX + baseW, 0);
    baseGrad.addColorStop(0, '#1e293b');
    baseGrad.addColorStop(0.5, '#334155');
    baseGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(baseX, baseY, baseW, baseH, 6);
    ctx.fill();
    ctx.stroke();

    // 水平調整ダイヤル (右下)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(baseX + baseW - 32, baseY + baseH / 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // ─── 2. 垂直メインコラムタワー (White Tower Column) ───
    const towerW = 140;
    const towerH = 430;
    const towerX = cx - 145;
    const towerY = baseY - towerH;

    const towerGrad = ctx.createLinearGradient(towerX, 0, towerX + towerW, 0);
    towerGrad.addColorStop(0, '#f8fafc');
    towerGrad.addColorStop(0.7, '#e2e8f0');
    towerGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = towerGrad;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(towerX, towerY, towerW, towerH, [8, 8, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // 垂直リニアガイドレール
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(towerX + towerW - 22, towerY + 30, 14, towerH - 50);

    // ─── 3. タッチパネルディスプレイ (LCD Screen) ───
    const panelX = towerX + 18;
    const panelY = towerY + 220;
    const panelW = 100;
    const panelH = 135;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Anton Paar', panelX + 8, panelY + 18);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('Mode: Needle Comp.', panelX + 8, panelY + 35);
    ctx.fillText(`Status: ${matEngine.needleIsRunning ? 'MEASURING' : 'READY'}`, panelX + 8, panelY + 48);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Depth: ${depth.toFixed(2)} mm`, panelX + 8, panelY + 65);
    ctx.fillText(`Force: ${forceN.toFixed(2)} N`, panelX + 8, panelY + 78);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Stress: ${stressMPa.toFixed(2)}MPa`, panelX + 8, panelY + 92);
    ctx.fillStyle = '#10b981';
    ctx.fillText(`Penet: ${(depth * 10).toFixed(0)} (1/10mm)`, panelX + 8, panelY + 106);

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PNR 500', panelX + panelW / 2, panelY + panelH - 8);

    // ─── 4. フレキシブルアーム付きLED作業灯 ───
    ctx.save();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(towerX + 20, baseY);
    ctx.bezierCurveTo(towerX - 30, baseY - 60, towerX - 25, baseY - 140, towerX + 10, baseY - 160);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(towerX + 32, baseY);
    ctx.bezierCurveTo(towerX - 10, baseY - 70, towerX - 5, baseY - 160, towerX + 30, baseY - 180);
    ctx.stroke();

    [ [towerX + 10, baseY - 160], [towerX + 30, baseY - 180] ].forEach(([lx, ly]) => {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();

    // ─── 5. 下部ステージ ＆ サンプル容器 ───
    const stageRadius = 75;
    const stageY = baseY - 8;
    const stageCenterX = cx + 55;

    const stGrad = ctx.createLinearGradient(stageCenterX - stageRadius, 0, stageCenterX + stageRadius, 0);
    stGrad.addColorStop(0, '#64748b');
    stGrad.addColorStop(0.5, '#cbd5e1');
    stGrad.addColorStop(1, '#475569');
    ctx.fillStyle = stGrad;
    ctx.beginPath();
    ctx.ellipse(stageCenterX, stageY, stageRadius, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    const cupW = 85;
    const cupH = 65;
    const cupX = stageCenterX - cupW / 2;
    const cupY = stageY - cupH - 5;

    const cupGrad = ctx.createLinearGradient(cupX, 0, cupX + cupW, 0);
    cupGrad.addColorStop(0, '#475569');
    cupGrad.addColorStop(0.3, '#cbd5e1');
    cupGrad.addColorStop(0.7, '#f8fafc');
    cupGrad.addColorStop(1, '#334155');
    ctx.fillStyle = cupGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cupX, cupY, cupW, cupH, [4, 4, 2, 2]);
    ctx.fill();
    ctx.stroke();

    const sampleFillH = cupH - 12;
    const sampleY = cupY + 12;
    const sampleColor = this.getSampleColors(mat.id);

    ctx.fillStyle = sampleColor.fill;
    ctx.fillRect(cupX + 4, sampleY, cupW - 8, sampleFillH);

    const scalePx = 4.5;
    const depthPx = depth * scalePx;
    const needleTipX = stageCenterX;
    const needleTipY = sampleY + depthPx;

    // 応力集中コンター
    if (depth > 0.1) {
      const glowGrad = ctx.createRadialGradient(needleTipX, needleTipY, 2, needleTipX, needleTipY, 25);
      glowGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
      glowGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.5)');
      glowGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(needleTipX, needleTipY, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── 6. 可動測定ヘッド ＆ ニードルプローブ ───
    const headX = towerX + towerW - 30;
    const headW = 135;
    const headH = 65;
    const headRestY = sampleY - 140;
    const headY = headRestY + depthPx;

    const headGrad = ctx.createLinearGradient(headX, headY, headX + headW, headY + headH);
    headGrad.addColorStop(0, '#ffffff');
    headGrad.addColorStop(0.6, '#e2e8f0');
    headGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(headX, headY, headW, headH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(headX + 60, headY + 12);
    ctx.lineTo(headX + 50, headY + 28);
    ctx.lineTo(headX + 70, headY + 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    const colletX = stageCenterX;
    const colletY = headY + headH;
    ctx.fillStyle = '#d97706';
    ctx.fillRect(colletX - 8, colletY, 16, 14);
    ctx.strokeStyle = '#78350f';
    ctx.strokeRect(colletX - 8, colletY, 16, 14);

    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.fillStyle = '#cbd5e1';

    if (probe === 'needle') {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(colletX, colletY + 14);
      ctx.lineTo(colletX, needleTipY - 3);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(colletX - 2, needleTipY - 3);
      ctx.lineTo(colletX, needleTipY);
      ctx.lineTo(colletX + 2, needleTipY - 3);
      ctx.closePath();
      ctx.fill();

    } else if (probe === 'cone') {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(colletX, colletY + 14);
      ctx.lineTo(colletX, needleTipY - 18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(colletX - 9, needleTipY - 18);
      ctx.lineTo(colletX + 9, needleTipY - 18);
      ctx.lineTo(colletX, needleTipY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();

    } else {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(colletX, colletY + 14);
      ctx.lineTo(colletX, needleTipY - 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(colletX, needleTipY - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();
    }
    ctx.restore();

    // 一方向圧縮力矢印 ↓
    if (forceN > 0.05) {
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(colletX + 45, colletY - 25);
      ctx.lineTo(colletX + 45, colletY + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(colletX + 40, colletY + 4);
      ctx.lineTo(colletX + 45, colletY + 12);
      ctx.lineTo(colletX + 50, colletY + 4);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`F = ${forceN.toFixed(2)} N`, colletX + 55, colletY - 5);
      ctx.fillText(`σ = ${stressMPa.toFixed(2)} MPa`, colletX + 55, colletY + 10);
    }

    ctx.restore();
  }

  // ─── 📈 右側: 圧縮応力-ひずみ（針入度）特性グラフ (動的オートスケーリング ＆ クリッピング) ───
  drawStressStrainCurve(ctx, matEngine, gx, gy, gw, gh) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px "Noto Sans JP", sans-serif';
    ctx.fillText(`📍 侵入深さ - 応力特性 - ${mat.name}`, gx + 20, gy + 26);

    const plotX = gx + 65;
    const plotY = gy + 45;
    const plotW = gw - 90;
    const plotH = 260;

    // ─── 🌟 動的オートスケーリング (オーバーフロー防止) ───
    const currentMaxStressInHistory = matEngine.needleStressHistory.length > 0
      ? Math.max(...matEngine.needleStressHistory)
      : 0.0;
    const baseExpectedMax = (mat.yieldStressMPa || 0.5) * 4.0;
    // 現在の最大応力に応じて Y 軸上限を動的に拡大 (20%マージン)
    let maxStress = Math.max(1.5, baseExpectedMax, currentMaxStressInHistory * 1.25);
    maxStress = Math.ceil(maxStress * 2) / 2; // 0.5単位で綺麗に丸め

    const maxDepth = matEngine.needleMaxDepth || 10.0;

    // プロット背景
    ctx.fillStyle = '#060a12';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // グリッド線
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const py = plotY + plotH - (i / 5) * plotH;
      const sVal = (maxStress * (i / 5)).toFixed(1);
      ctx.beginPath();
      ctx.moveTo(plotX, py);
      ctx.lineTo(plotX + plotW, py);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${sVal}`, plotX - 6, py + 3);

      const px = plotX + (i / 5) * plotW;
      const dVal = (maxDepth * (i / 5)).toFixed(1);
      ctx.beginPath();
      ctx.moveTo(px, plotY);
      ctx.lineTo(px, plotY + plotH);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(`${dVal}mm`, px, plotY + plotH + 14);
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('一方向圧縮応力 σ [MPa]', plotX + 125, plotY - 8);
    ctx.fillText('針入深さ h [mm] / 圧縮ひずみ ε', plotX + plotW, plotY + plotH + 28);

    // ─── 🛡️ プロット枠内クリッピング（絶対にはみ出さない） ───
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, plotY, plotW, plotH);
    ctx.clip();

    // 履歴プロット
    if (matEngine.needleDepthHistory.length > 1) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + plotH);
      matEngine.needleDepthHistory.forEach((dp, idx) => {
        const px = plotX + (dp / maxDepth) * plotW;
        const py = plotY + plotH - (matEngine.needleStressHistory[idx] / maxStress) * plotH;
        ctx.lineTo(px, py);
      });
      const lastX = plotX + (matEngine.needleDepth / maxDepth) * plotW;
      ctx.lineTo(lastX, plotY + plotH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      matEngine.needleDepthHistory.forEach((dp, idx) => {
        const px = plotX + (dp / maxDepth) * plotW;
        const py = plotY + plotH - (matEngine.needleStressHistory[idx] / maxStress) * plotH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // 現在点ポインタ
    const curPx = plotX + (matEngine.needleDepth / maxDepth) * plotW;
    const curPy = plotY + plotH - (matEngine.needleCompStress / maxStress) * plotH;
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore(); // クリッピング解除

    // ─── キーポイント番号注釈（曲線上に ①〜③ マーカー）───
    this.drawNeedleKeyPoints(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxDepth);

    // ─── 解釈パネル（グラフ下部・重複のない整然とした配置）───
    const panelY = plotY + plotH + 28;
    const panelH = 92;
    this.drawNeedleInterpretation(ctx, matEngine, gx, panelY, gw, panelH);

    ctx.restore();
  }

  // ─── ニードル試験 キーポイント番号注釈 ───
  drawNeedleKeyPoints(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxDepth) {
    const mat = matEngine.currentMaterial;
    const dh = matEngine.needleDepthHistory || [];
    const sh = matEngine.needleStressHistory || [];
    if (sh.length < 3) return;

    const sigma_y = mat.yieldStressMPa || 0.35;
    const peakStress = sh.length > 0 ? Math.max(...sh) : sigma_y;
    const peakDepth  = dh[sh.indexOf(peakStress)] || maxDepth * 0.5;

    const toX = (d) => plotX + (d / maxDepth) * plotW;
    const toY = (s) => plotY + plotH - (s / maxStress) * plotH;

    const keyPoints = [
      { d: 0,            s: 0,           label: '①', color: '#64748b', desc: '初期' },
      { d: peakDepth * 0.35, s: sigma_y * 0.5, label: '②', color: '#22d3ee', desc: '弾性変形' },
      { d: peakDepth,    s: peakStress,  label: '③', color: '#ef4444', desc: '降伏・硬さ' },
      { d: peakDepth * 1.4, s: peakStress * 0.6, label: '④', color: '#a78bfa', desc: '塑性変形' },
    ];

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX - 16, plotY - 16, plotW + 32, plotH + 32);
    ctx.clip();

    keyPoints.forEach(pt => {
      const px = toX(pt.d);
      const py = toY(pt.s);
      if (px < plotX - 12 || px > plotX + plotW + 12) return;
      if (py < plotY - 12 || py > plotY + plotH + 12) return;

      ctx.fillStyle = pt.color;
      ctx.strokeStyle = '#0a0f1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.label, px, py + 3);

      const labelOffY = (py < plotY + 22) ? 22 : -14;
      ctx.fillStyle = pt.color;
      ctx.font = 'bold 9px "Noto Sans JP", sans-serif';
      ctx.fillText(pt.desc, px, py + labelOffY);
    });

    ctx.restore();
  }

  // ─── ニードル試験 解釈パネル（ユーザー画像準拠の 4ポイント解説）───
  drawNeedleInterpretation(ctx, matEngine, gx, panelY, gw, panelH) {
    const mat = matEngine.currentMaterial;
    const sigma_y = mat.yieldStressMPa || 0.35;

    const items = [
      {
        badge: '①', color: '#64748b',
        title: '初期接触',
        body: 'プローブ接触点\n(荷重ゼロ)'
      },
      {
        badge: '②', color: '#22d3ee',
        title: '弾性域',
        body: '元に戻る変形\n(線形領域)'
      },
      {
        badge: '③', color: '#ef4444',
        title: `降伏点 (硬さ)\n(σy ≈ ${sigma_y.toFixed(2)} MPa)`,
        body: '変形が始まる点\n(硬さの指標)'
      },
      {
        badge: '④', color: '#a78bfa',
        title: '流動・変形域',
        body: '深く刺さる領域\n(内部抵抗)'
      },
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx + 8, panelY, gw - 16, Math.max(panelH, 58), 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📖 針入度曲線の読み方', gx + 18, panelY + 14);

    const cardW = (gw - 36) / items.length;
    const cardH = Math.max(panelH - 20, 38);

    items.forEach((item, i) => {
      const cx = gx + 14 + i * (cardW + 3);
      const cy = panelY + 18;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.strokeStyle = item.color + '44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cardW, cardH, 5);
      ctx.fill();
      ctx.stroke();

      // バッジ
      ctx.fillStyle = item.color;
      ctx.strokeStyle = '#0a0f1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx + 12, cy + 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.badge, cx + 12, cy + 15);

      // タイトル
      ctx.fillStyle = item.color;
      ctx.font = 'bold 8px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'left';
      item.title.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 25, cy + 9 + li * 10));

      // 説明文
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7.5px "Noto Sans JP", sans-serif';
      item.body.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 6, cy + 30 + li * 10));
    });

    ctx.restore();
  }

  getSampleColors(id) {
    switch (id) {
      case 'cosmetic_lipstick': return { fill: '#e11d48', stroke: '#9f1239' };
      case 'cosmetic_balm': return { fill: '#fef08a', stroke: '#ca8a04' };
      case 'cosmetic_foundation': return { fill: '#fed7aa', stroke: '#ea580c' };
      case 'food_cheese': return { fill: '#fde047', stroke: '#ca8a04' };
      case 'food_butter': return { fill: '#fef9c3', stroke: '#eab308' };
      case 'food_gummy': return { fill: '#f43f5e', stroke: '#be123c' };
      case 'food_chocolate': return { fill: '#78350f', stroke: '#451a03' };
      default: return { fill: '#e11d48', stroke: '#9f1239' };
    }
  }
}

if (typeof window !== 'undefined') {
  window.NeedleVisualizer = NeedleVisualizer;
}
