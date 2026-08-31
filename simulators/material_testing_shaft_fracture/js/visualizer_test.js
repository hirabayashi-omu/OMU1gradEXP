/**
 * Universal Material Testing Visualizer (Metals, Elastomers, Hydrogels)
 * 万能材料試験機（ゴム超弾性・ハイドロゲル・金属弾塑性ネッキング・S-S線図）Canvas描画
 */

class MaterialTestVisualizer {
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
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    this.drawBackground(ctx, w, h);
    this.drawTestingMachine(ctx, matEngine, 255, 290);
    this.drawStressStrainCurve(ctx, matEngine, 530, 30, 630, 520);
  }

  drawBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.3, h * 0.4, 50, w * 0.3, h * 0.4, 700);
    bgGrad.addColorStop(0, '#0c1322');
    bgGrad.addColorStop(0.6, '#070b14');
    bgGrad.addColorStop(1, '#030509');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  drawTestingMachine(ctx, matEngine, cx, cy) {
    ctx.save();
    const isTensile = (matEngine.testMode === 'tensile');
    const strain = matEngine.currentStrain;
    const mat = matEngine.currentMaterial;
    const isFractured = matEngine.isFractured;

    const pillarLeftX = cx - 140;
    const pillarRightX = cx + 140;
    const pillarTopY = 35;
    const pillarBotY = 535;

    [pillarLeftX, pillarRightX].forEach(px => {
      const pGrad = ctx.createLinearGradient(px - 14, 0, px + 14, 0);
      pGrad.addColorStop(0, '#1e293b');
      pGrad.addColorStop(0.3, '#64748b');
      pGrad.addColorStop(0.7, '#94a3b8');
      pGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = pGrad;
      ctx.fillRect(px - 12, pillarTopY, 24, pillarBotY - pillarTopY);
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px - 12, pillarTopY, 24, pillarBotY - pillarTopY);
    });

    // 上部固定フレーム & 下部固定ベース
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - 165, pillarTopY - 15, 330, 30);
    ctx.strokeRect(cx - 165, pillarTopY - 15, 330, 30);
    ctx.fillRect(cx - 165, pillarBotY - 15, 330, 30);
    ctx.strokeRect(cx - 165, pillarBotY - 15, 330, 30);

    // 下部チャック (固定位置)
    const lowerChuckY = 430;
    this.drawChuck(ctx, cx, lowerChuckY, false);

    // ─── 可動クロスヘッド位置の計算 (材料破断ひずみに応じた動的正規化) ───
    const upperChuckY0 = 310; // 初期位置 (ゲージ長 120px)
    let upperChuckY;

    if (isTensile) {
      // 引張: 最大破断ひずみ eps_f に到達した時に最大ストローク (165px) に達するようスケーリング
      const eps_f_target = Math.max(0.12, mat.eps_f || (mat.category === 'soft_matter' ? 6.0 : 0.22));
      const strokeNorm = Math.min(1.05, strain / eps_f_target);
      const dispPx = strokeNorm * 160; // 最大160px上昇 (upperChuckY >= 150)
      upperChuckY = upperChuckY0 - dispPx;
    } else {
      // 圧縮: 圧縮破断/限界ひずみに応じて下方に最大75px下降 (upperChuckY <= 385, 下部チャックと45pxの間隙確保)
      const eps_c_target = Math.max(0.08, mat.eps_f_comp || mat.eps_c_f || (mat.category === 'soft_matter' ? 0.7 : 0.25));
      const strokeNorm = Math.min(1.0, strain / eps_c_target);
      const dispPx = strokeNorm * 75;
      upperChuckY = upperChuckY0 + dispPx;
    }

    // 上部チャック (可動)
    this.drawChuck(ctx, cx, upperChuckY, true);

    // 可動クロスヘッドビーム
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - 155, upperChuckY - 35, 310, 26);
    ctx.strokeRect(cx - 155, upperChuckY - 35, 310, 26);

    // ロードセル
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(cx - 32, upperChuckY - 58, 64, 23);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 32, upperChuckY - 58, 64, 23);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOAD CELL', cx, upperChuckY - 43);

    if (isTensile) {
      this.drawTensileSpecimen(ctx, cx, upperChuckY, lowerChuckY, strain, matEngine.neckingRatio || 0, isFractured, mat);
    } else {
      this.drawCompressionSpecimen(ctx, cx, upperChuckY, lowerChuckY, strain, isFractured, mat);
    }

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('荷重 F = ' + matEngine.currentForce.toFixed(2) + ' kN', cx + 42, upperChuckY - 43);

    ctx.restore();
  }

  drawChuck(ctx, x, y, isUpper) {
    ctx.save();
    const dir = isUpper ? -1 : 1;
    const chuckGrad = ctx.createLinearGradient(x - 45, 0, x + 45, 0);
    chuckGrad.addColorStop(0, '#334155');
    chuckGrad.addColorStop(0.5, '#64748b');
    chuckGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = chuckGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 40, y);
    ctx.lineTo(x - 30, y + dir * 35);
    ctx.lineTo(x + 30, y + dir * 35);
    ctx.lineTo(x + 40, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawTensileSpecimen(ctx, cx, upY, lowY, strain, necking, isFractured, mat) {
    ctx.save();
    const isSoft = (mat.category === 'soft_matter');
    const midY = (upY + lowY) / 2;
    const gripW = 26;
    let gaugeW = 16;
    if (isSoft) {
      gaugeW = Math.max(3.5, 16.0 / Math.sqrt(1 + strain));
    } else if (necking > 0) {
      gaugeW = 16.0 * (1.0 - 0.55 * necking);
    }
    const specColor = this.getMatColors(mat.id);

    if (!isFractured) {
      const specGrad = ctx.createLinearGradient(cx - gripW, 0, cx + gripW, 0);
      specGrad.addColorStop(0, specColor.dark);
      specGrad.addColorStop(0.5, specColor.light);
      specGrad.addColorStop(1, specColor.dark);
      ctx.fillStyle = specGrad;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - gripW, upY);
      ctx.lineTo(cx + gripW, upY);
      ctx.lineTo(cx + gripW, upY + 25);
      ctx.quadraticCurveTo(cx + gaugeW, midY - 30, cx + gaugeW, midY);
      ctx.quadraticCurveTo(cx + gaugeW, midY + 30, cx + gripW, lowY - 25);
      ctx.lineTo(cx + gripW, lowY);
      ctx.lineTo(cx - gripW, lowY);
      ctx.lineTo(cx - gripW, lowY - 25);
      ctx.quadraticCurveTo(cx - gaugeW, midY + 30, cx - gaugeW, midY);
      ctx.quadraticCurveTo(cx - gaugeW, midY - 30, cx - gripW, upY + 25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (isSoft && strain > 1.0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillRect(cx - gaugeW + 1, upY + 25, (gaugeW * 2) - 2, lowY - upY - 50);
      }
    } else {
      const gap = 16;
      ctx.fillStyle = specColor.light;
      ctx.beginPath();
      ctx.moveTo(cx - gripW, upY);
      ctx.lineTo(cx + gripW, upY);
      ctx.lineTo(cx + gripW, upY + 25);
      ctx.lineTo(cx + gaugeW, midY - gap);
      ctx.lineTo(cx - gaugeW, midY - gap);
      ctx.lineTo(cx - gripW, upY + 25);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - gripW, lowY);
      ctx.lineTo(cx + gripW, lowY);
      ctx.lineTo(cx + gripW, lowY - 25);
      ctx.lineTo(cx + gaugeW, midY + gap);
      ctx.lineTo(cx - gaugeW, midY + gap);
      ctx.lineTo(cx - gripW, lowY - 25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥 材料破断完了', cx, midY);
    }
    ctx.restore();
  }

  drawCompressionSpecimen(ctx, cx, upY, lowY, strain, isFractured, mat) {
    ctx.save();
    const specColor = this.getMatColors(mat.id);
    const midY = (upY + lowY) / 2;
    const initR = 20;
    const barrelR = initR * (1.0 + strain * 1.5);
    const specGrad = ctx.createLinearGradient(cx - barrelR, 0, cx + barrelR, 0);
    specGrad.addColorStop(0, specColor.dark);
    specGrad.addColorStop(0.5, specColor.light);
    specGrad.addColorStop(1, specColor.dark);
    ctx.fillStyle = specGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - initR, upY);
    ctx.lineTo(cx + initR, upY);
    ctx.quadraticCurveTo(cx + barrelR, midY, cx + initR, lowY);
    ctx.lineTo(cx - initR, lowY);
    ctx.quadraticCurveTo(cx - barrelR, midY, cx - initR, upY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ─── S-S 線図 (動的オートスケーリング + クリッピング + 解釈パネル) ───
  drawStressStrainCurve(ctx, matEngine, gx, gy, gw, gh) {
    ctx.save();
    const mat = matEngine.currentMaterial;

    // パネル背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`📈 応力-ひずみ曲線 (S-S線図) - ${mat.name}`, gx + 20, gy + 26);

    // 解釈パネル用に右側の余白を確保: plotW を少し縮める
    const plotX = gx + 65;
    const plotY = gy + 48;
    const plotW = gw - 90;
    const plotH = gh - 210; // 下部に解釈パネル分を確保

    // 動的オートスケーリング
    const sh = matEngine.stressHistory || [0];
    const eh = matEngine.strainHistory || [0];
    const histMax = sh.length > 1 ? Math.max(...sh) : 0.0;
    const eps_f_m  = mat.eps_f || mat.eps_u || 0.5;
    const sigma_u_m = mat.sigma_u || mat.sigma_y || mat.yieldStressMPa || 1.0;
    let maxStress = Math.max(0.5, sigma_u_m * 1.35, histMax * 1.25);
    maxStress = Math.ceil(maxStress * 2) / 2;
    let maxStrain = Math.max(0.05, eps_f_m * 1.3);
    maxStrain = Math.ceil(maxStrain * 20) / 20;

    ctx.fillStyle = '#060a12';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // グリッド
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const py = plotY + plotH - (i / 5) * plotH;
      const sVal = (maxStress * i / 5).toFixed(1);
      ctx.beginPath();
      ctx.moveTo(plotX, py);
      ctx.lineTo(plotX + plotW, py);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(sVal, plotX - 6, py + 3);

      const px = plotX + (i / 5) * plotW;
      const eVal = (maxStrain * i / 5 * 100).toFixed(0);
      ctx.beginPath();
      ctx.moveTo(px, plotY);
      ctx.lineTo(px, plotY + plotH);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(eVal + '%', px, plotY + plotH + 14);
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('応力 σ [MPa]', plotX + 80, plotY - 8);
    ctx.fillText('ひずみ ε [%]', plotX + plotW, plotY + plotH + 30);

    // クリッピング
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, plotY, plotW, plotH);
    ctx.clip();

    const toX = function(eps) { return plotX + (eps / maxStrain) * plotW; };
    const toY = function(sig) { return plotY + plotH - (sig / maxStress) * plotH; };

    if (eh.length > 1) {
      // 面塗り
      ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      ctx.beginPath();
      ctx.moveTo(toX(eh[0]), plotY + plotH);
      for (let i = 0; i < eh.length; i++) {
        ctx.lineTo(toX(eh[i]), toY(sh[i]));
      }
      ctx.lineTo(toX(eh[eh.length - 1]), plotY + plotH);
      ctx.closePath();
      ctx.fill();

      // S-S曲線
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < eh.length; i++) {
        if (i === 0) ctx.moveTo(toX(eh[i]), toY(sh[i]));
        else ctx.lineTo(toX(eh[i]), toY(sh[i]));
      }
      ctx.stroke();

      // 破断マーカー
      if (matEngine.isFractured && matEngine.fractureRecorded) {
        const lastIdx = eh.length - 1;
        const fracX = toX(eh[lastIdx]);
        const fracY = plotY + plotH;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(fracX, fracY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('破断', fracX, fracY - 12);
      }
    }

    // 現在点（試験中のみ）
    if (!matEngine.isFractured && matEngine.currentStrain > 0) {
      const curPx = toX(matEngine.currentStrain);
      const curPy = toY(matEngine.currentStress);
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore(); // クリッピング解除

    // ─── キーポイント注釈（クリッピング解除後、グラフ上に番号を重ね描き）───
    this.drawKeyPointAnnotations(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxStrain);

    // ─── 解釈凡例パネル（グラフ下部）───
    this.drawInterpretationPanel(ctx, matEngine, gx, plotY + plotH + 12, gw, gh - (plotH + plotY - gy) - 16, maxStress, maxStrain);

    ctx.restore(); // 全体
  }

  // ─── キーポイント番号注釈（実データベース）───
  drawKeyPointAnnotations(ctx, matEngine, plotX, plotY, plotW, plotH, maxStress, maxStrain) {
    const mat = matEngine.currentMaterial;
    const sh = matEngine.stressHistory || [];
    const eh = matEngine.strainHistory || [];
    if (sh.length < 3) return;

    const isSoft = (mat.category === 'soft_matter');

    const toX = (eps) => plotX + (eps / maxStrain) * plotW;
    const toY = (sig) => plotY + plotH - (sig / maxStress) * plotH;

    // ─ 実データから各特徴点を算出 ─
    // ① 原点 (常に (0, 0))
    const p1 = { eps: eh[0] || 0, sig: sh[0] || 0 };

    // ③ ピーク点: 最大応力の実データ座標
    let peakIdx = 0;
    for (let i = 1; i < sh.length; i++) {
      if (sh[i] > sh[peakIdx]) peakIdx = i;
    }
    const p3 = { eps: eh[peakIdx], sig: sh[peakIdx] };

    // ② 非線形開始 or 降伏点: 最大応力の 40% に最初に到達した点
    const threshold2 = p3.sig * 0.40;
    let p2idx = 1;
    for (let i = 1; i < sh.length; i++) {
      if (sh[i] >= threshold2) { p2idx = i; break; }
    }
    const p2 = { eps: eh[p2idx], sig: sh[p2idx] };

    // ④ ネッキング開始（金属）: ピーク後で σu * 0.85 まで下がった点
    // ④ 破断点（ゴム・ゲル）: 最後の点
    let p4 = null, p5 = null;

    if (!isSoft) {
      // 金属: ④ = ネッキング域 (ピーク後、応力が σu*0.85 以下になった最初の点)
      const neckThresh = p3.sig * 0.85;
      for (let i = peakIdx + 1; i < sh.length; i++) {
        if (sh[i] <= neckThresh) { p4 = { eps: eh[i], sig: sh[i] }; break; }
      }
      if (!p4 && sh.length > peakIdx + 1) {
        p4 = { eps: eh[Math.min(peakIdx + Math.floor((sh.length - peakIdx) * 0.5), sh.length - 2)], sig: sh[Math.min(peakIdx + Math.floor((sh.length - peakIdx) * 0.5), sh.length - 2)] };
      }
      // ⑤ = 最終点 (σ = 0)
      const lastIdx = sh.length - 1;
      p5 = { eps: eh[lastIdx], sig: sh[lastIdx] };
    } else {
      // ゴム・ゲル: ④ = 最終点 (σ = 0)
      const lastIdx = sh.length - 1;
      p4 = { eps: eh[lastIdx], sig: sh[lastIdx] };
    }

    // ─ キーポイント配列 ─
    const keyPoints = isSoft ? [
      { ...p1, label: '①', color: '#64748b', desc: '初期' },
      { ...p2, label: '②', color: '#22d3ee', desc: '非線形開始' },
      { ...p3, label: '③', color: '#ef4444', desc: '最大応力' },
      { ...p4, label: '④', color: '#a78bfa', desc: '破断' },
    ] : [
      { ...p1, label: '①', color: '#64748b', desc: '無負荷' },
      { ...p2, label: '②', color: '#f59e0b', desc: '降伏点' },
      { ...p3, label: '③', color: '#ef4444', desc: '引張強さ' },
      ...(p4 ? [{ ...p4, label: '④', color: '#a78bfa', desc: 'ネッキング' }] : []),
      ...(p5 ? [{ ...p5, label: '⑤', color: '#22d3ee', desc: '破断' }] : []),
    ];

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX - 16, plotY - 16, plotW + 32, plotH + 32);
    ctx.clip();

    keyPoints.forEach(pt => {
      if (!pt || pt.eps === undefined) return;
      const px = toX(pt.eps);
      const py = toY(pt.sig);
      if (px < plotX - 12 || px > plotX + plotW + 12) return;
      if (py < plotY - 12 || py > plotY + plotH + 12) return;

      // 丸バッジ
      ctx.fillStyle = pt.color;
      ctx.strokeStyle = '#0a0f1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 番号
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.label, px, py + 3);

      // ラベル（バッジの上下に自動配置）
      const labelOffY = (py < plotY + 24) ? 22 : -14;
      ctx.fillStyle = pt.color;
      ctx.font = 'bold 9px "Noto Sans JP", sans-serif';
      ctx.fillText(pt.desc, px, py + labelOffY);
    });

    ctx.restore();
  }

  // ─── 解釈凡例パネル（グラフ下部 横並び・実測値を動的表示）───
  drawInterpretationPanel(ctx, matEngine, gx, panelY, gw, panelH, maxStress, maxStrain) {
    const mat = matEngine.currentMaterial;
    const isSoft = (mat.category === 'soft_matter');
    const sh = matEngine.stressHistory || [];
    const eh = matEngine.strainHistory || [];

    // 実データから各特徴値を算出
    let peakStress = 0, peakStrain = 0;
    for (let i = 0; i < sh.length; i++) {
      if (sh[i] > peakStress) { peakStress = sh[i]; peakStrain = eh[i]; }
    }
    const lastStrain = eh.length > 0 ? eh[eh.length - 1] : 0;
    const eps_y_pct = peakStrain * 40; // ピークの40%位置をひずみ%で
    const peakPct   = (peakStrain * 100).toFixed(0);
    const fracPct   = (lastStrain * 100).toFixed(0);

    const eps_y   = mat.eps_y   || (mat.sigma_y ? mat.sigma_y / (mat.E || 1) : 0.002);
    const sigma_y = mat.sigma_y || mat.yieldStressMPa || (peakStress * 0.7);
    const sigma_u = peakStress > 0 ? peakStress : (mat.sigma_u || sigma_y * 1.5);
    const eps_u   = peakStrain > 0 ? peakStrain : (mat.eps_u || 0.5);

    const items = isSoft ? [
      { badge: '①', color: '#64748b', title: '初期状態', body: '変形なし・荷重ゼロ' },
      { badge: '②', color: '#22d3ee', title: '伸び始め', body: `弾性変形\n(ε≈${(eps_u * 40).toFixed(0)}%)` },
      { badge: '③', color: '#ef4444', title: `最大応力 σu`, body: `${sigma_u.toFixed(2)} MPa\n(ε≈${peakPct}%)` },
      { badge: '④', color: '#a78bfa', title: '破断', body: `材料破断\n(ε≈${fracPct}%)` },
    ] : [
      { badge: '①', color: '#64748b', title: '弾性域', body: `元に戻る変形\nE=${(mat.E||0).toFixed(0)} MPa` },
      { badge: '②', color: '#f59e0b', title: `降伏点 σy`, body: `${sigma_y.toFixed(1)} MPa\n永久変形の開始` },
      { badge: '③', color: '#ef4444', title: `最大強さ σu`, body: `${sigma_u.toFixed(1)} MPa\nピーク応力` },
      { badge: '④', color: '#a78bfa', title: 'くびれ・軟化', body: `破断前の局所変形\n(ε→${fracPct}%)` },
      { badge: '⑤', color: '#22d3ee', title: '破断', body: `破断完了\n(応力ゼロ)` },
    ];

    // ─ パネル背景 ─
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx + 8, panelY, gw - 16, Math.max(panelH - 4, 80), 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📖 グラフの読み方', gx + 18, panelY + 16);

    const n = items.length;
    const cardW = (gw - 36) / n;
    const cardH = Math.max(panelH - 26, 56);

    items.forEach((item, i) => {
      const cx = gx + 14 + i * (cardW + 4);
      const cy = panelY + 22;

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
      ctx.arc(cx + 14, cy + 14, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.badge, cx + 14, cy + 17);

      // タイトル
      ctx.fillStyle = item.color;
      ctx.font = 'bold 9px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'left';
      item.title.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 28, cy + 11 + li * 12));

      // 説明文（実測値を含む）
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px "Noto Sans JP", sans-serif';
      item.body.split('\n').forEach((ln, li) => ctx.fillText(ln, cx + 8, cy + 32 + li * 11));
    });

    ctx.restore();
  }

  getMatColors(id) {
    switch (id) {
      case 'rubber_nr': return { light: '#f97316', dark: '#9a3412' };
      case 'hydrogel':  return { light: '#38bdf8', dark: '#0369a1' };
      case 's45c':      return { light: '#94a3b8', dark: '#334155' };
      default:          return { light: '#fb7185', dark: '#9f1239' };
    }
  }
}

if (typeof window !== 'undefined') {
  window.MaterialTestVisualizer = MaterialTestVisualizer;
}
