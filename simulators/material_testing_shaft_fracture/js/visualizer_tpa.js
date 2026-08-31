/**
 * Solid Food Unidirectional Compression Rheology Visualizer
 * 固形食品 一方向単調圧縮試験（プランジャー加圧・圧縮応力-ひずみ曲線・降伏/破砕点）Canvas描画
 */

class FoodCompressionVisualizer {
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
    matEngine.stepFoodCompTest(0.025);

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    this.drawBackground(ctx, w, h);
    this.drawCompressionMachine(ctx, matEngine, 255, 300);
    this.drawStressStrainCurve(ctx, matEngine, 500, 30, 660, 520);
  }

  drawBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.35, h * 0.4, 50, w * 0.35, h * 0.4, 750);
    bgGrad.addColorStop(0, '#0c151e');
    bgGrad.addColorStop(0.6, '#070d14');
    bgGrad.addColorStop(1, '#030508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  drawCompressionMachine(ctx, matEngine, cx, cy) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    const initH = 80;
    const initW = 75;
    const compDispPx = (matEngine.foodCompDepth / 20.0) * (initH * 0.65);

    const tableY = cy + 90;
    const currentSampleH = Math.max(16, initH - compDispPx);
    const barrelW = initW * (1.0 + (compDispPx / initH) * 0.75);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - 120, tableY, 240, 35, 4);
    ctx.fill();
    ctx.stroke();

    const sampleY = tableY - currentSampleH;
    const foodColors = this.getFoodColors(mat.id);

    ctx.fillStyle = foodColors.fill;
    ctx.strokeStyle = foodColors.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - barrelW / 2, sampleY, barrelW, currentSampleH, [4, 4, 0, 0]);
    ctx.fill();
    ctx.stroke();

    if (mat.id === 'food_chocolate' && matEngine.foodCompDepth > 1.2) {
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10, sampleY);
      ctx.lineTo(cx - 5, sampleY + currentSampleH * 0.5);
      ctx.lineTo(cx + 8, sampleY + currentSampleH);
      ctx.stroke();
    }

    const plungerR = 42;
    const plungerH = 120;
    const plungerY = sampleY - plungerH;

    const plGrad = ctx.createLinearGradient(cx - plungerR, 0, cx + plungerR, 0);
    plGrad.addColorStop(0, '#334155');
    plGrad.addColorStop(0.5, '#94a3b8');
    plGrad.addColorStop(1, '#1e293b');

    ctx.fillStyle = plGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - plungerR, plungerY, plungerR * 2, plungerH, [4, 4, 0, 0]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(cx - plungerR - 4, sampleY - 6, (plungerR + 4) * 2, 6);

    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, plungerY - 30);
    ctx.lineTo(cx, plungerY - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6, plungerY - 12);
    ctx.lineTo(cx, plungerY - 4);
    ctx.lineTo(cx + 6, plungerY - 12);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('一方向単調圧縮中 (↓)', cx, cy - 145);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`圧縮力: ${matEngine.foodCompForce.toFixed(2)} N (σ=${matEngine.foodCompStress.toFixed(2)} MPa)`, cx, cy - 125);

    ctx.restore();
  }

  // ─── 📈 右側: 一方向圧縮応力-ひずみ曲線 (動的オートスケーリング ＆ クリッピング) ───
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
    ctx.fillText(`🧀 圧縮応力 - ひずみ特性 - ${mat.name}`, gx + 20, gy + 26);

    const plotX = gx + 65;
    const plotY = gy + 45;
    const plotW = gw - 90;
    const plotH = 260;

    // 動的オートスケーリング
    const currentMax = matEngine.foodStressHistory.length > 0 ? Math.max(...matEngine.foodStressHistory) : 0.0;
    const baseExpected = (mat.compressiveStrengthMPa || mat.yieldStressMPa || 0.5) * 1.5;
    let maxStress = Math.max(1.0, baseExpected, currentMax * 1.25);
    maxStress = Math.ceil(maxStress * 2) / 2;

    const maxStrain = 60.0;

    // プロット背景
    ctx.fillStyle = '#060a12';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // グリッド線
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const py = plotY + (i / 5) * plotH;
      const sVal = (maxStress * (1 - i / 5)).toFixed(1);
      ctx.beginPath();
      ctx.moveTo(plotX, py);
      ctx.lineTo(plotX + plotW, py);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${sVal}`, plotX - 6, py + 3);

      const px = plotX + (i / 5) * plotW;
      const stVal = (maxStrain * (i / 5)).toFixed(0);
      ctx.beginPath();
      ctx.moveTo(px, plotY);
      ctx.lineTo(px, plotY + plotH);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(`${stVal}%`, px, plotY + plotH + 14);
    }

    // ─── 軸ラベル ───
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('圧縮応力 σ [MPa]', plotX + 110, plotY - 8);
    ctx.fillText('圧縮ひずみ ε [%]', plotX + plotW, plotY + plotH + 18);

    // クリッピング
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, plotY, plotW, plotH);
    ctx.clip();

    if (matEngine.foodCompHistory.length > 1) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + plotH);
      matEngine.foodCompHistory.forEach((st, idx) => {
        const px = plotX + (st / maxStrain) * plotW;
        const py = plotY + plotH - (matEngine.foodStressHistory[idx] / maxStress) * plotH;
        ctx.lineTo(px, py);
      });
      const lastX = plotX + (matEngine.foodCompStrain / maxStrain) * plotW;
      ctx.lineTo(lastX, plotY + plotH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      matEngine.foodCompHistory.forEach((st, idx) => {
        const px = plotX + (st / maxStrain) * plotW;
        const py = plotY + plotH - (matEngine.foodStressHistory[idx] / maxStress) * plotH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    const curPx = plotX + (matEngine.foodCompStrain / maxStrain) * plotW;
    const curPy = plotY + plotH - (matEngine.foodCompStress / maxStress) * plotH;
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore(); // クリッピング解除

    // ─── キーポイント注釈（曲線上に ①〜④ マーカー）───
    this.drawFoodKeyPoints(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxStrain);

    // ─── 解釈パネル（グラフ下部・重複のない整然とした配置）───
    const panelY = plotY + plotH + 28;
    const panelH = 92;
    this.drawFoodInterpretation(ctx, matEngine, gx, panelY, gw, panelH);

    ctx.restore();
  }

  // ─── 食品圧縮 キーポイント注釈 ───
  drawFoodKeyPoints(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxStrain) {
    const mat = matEngine.currentMaterial;
    const sh = matEngine.foodStressHistory || [];
    const eh = matEngine.foodCompHistory   || [];
    if (sh.length < 3) return;

    const sigma_y   = mat.yieldStressMPa || 0.3;
    const sigma_c   = mat.compressiveStrengthMPa || 0.6;
    const peakStress = Math.max(...sh);
    const peakStrain = eh[sh.indexOf(peakStress)] || 40;
    const eps_f      = mat.eps_f || 70;

    const toX = (e) => plotX + (e / maxStrain) * plotW;
    const toY = (s) => plotY + plotH - (s / maxStress) * plotH;

    const keyPoints = [
      { e: 0,                s: 0,               label: '①', color: '#64748b', desc: '初期' },
      { e: peakStrain * 0.4, s: sigma_y * 0.55,  label: '②', color: '#22d3ee', desc: '弾性変形' },
      { e: peakStrain,       s: peakStress,       label: '③', color: '#ef4444', desc: '最大応力' },
      { e: eps_f * 0.75,     s: peakStress * 0.55, label: '④', color: '#a78bfa', desc: '圧密変形' },
    ];

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX - 16, plotY - 16, plotW + 32, plotH + 32);
    ctx.clip();

    keyPoints.forEach(pt => {
      const px = toX(pt.e);
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

  // ─── 食品圧縮 解釈パネル ───
  drawFoodInterpretation(ctx, matEngine, gx, panelY, gw, panelH) {
    const mat = matEngine.currentMaterial;
    const sigma_y = mat.yieldStressMPa || 0.3;
    const sigma_c = mat.compressiveStrengthMPa || 0.6;

    const items = [
      {
        badge: '①', color: '#64748b',
        title: '初期接触',
        body: '接触開始点\n(荷重ゼロ)'
      },
      {
        badge: '②', color: '#22d3ee',
        title: '弾性域',
        body: '元に戻る変形\n(初期勾配)'
      },
      {
        badge: '③', color: '#ef4444',
        title: `最大応力 (固さ)\n(σc ≈ ${sigma_c.toFixed(2)} MPa)`,
        body: '最大強度・破砕\n(固さの指標)'
      },
      {
        badge: '④', color: '#a78bfa',
        title: '破砕・圧密域',
        body: '潰れ・粉体圧密\n(食感の終末)'
      },
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx + 8, panelY, gw - 16, Math.max(panelH, 60), 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📖 圧縮曲線の読み方', gx + 18, panelY + 14);

    const cardW = (gw - 36) / items.length;
    const cardH = Math.max(panelH - 20, 40);

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

      ctx.fillStyle = item.color;
      ctx.font = 'bold 8px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'left';
      item.title.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 25, cy + 9 + li * 10));

      ctx.fillStyle = '#94a3b8';
      ctx.font = '7.5px "Noto Sans JP", sans-serif';
      item.body.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 6, cy + 30 + li * 10));
    });

    ctx.restore();
  }

  getFoodColors(id) {
    switch (id) {
      case 'food_cheese': return { fill: '#fde047', stroke: '#ca8a04' };
      case 'food_butter': return { fill: '#fef9c3', stroke: '#eab308' };
      case 'food_gummy': return { fill: '#f43f5e', stroke: '#be123c' };
      case 'food_chocolate': return { fill: '#78350f', stroke: '#451a03' };
      default: return { fill: '#fed7aa', stroke: '#ea580c' };
    }
  }
}

if (typeof window !== 'undefined') {
  window.FoodCompressionVisualizer = FoodCompressionVisualizer;
}

