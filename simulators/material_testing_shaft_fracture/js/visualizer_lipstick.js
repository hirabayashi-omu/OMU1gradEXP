/**
 * Lipstick Break Strength & Penetration Texture Analyzer Visualizer
 * Anton Paar PNR 500型 精密針入度計 / テクスチャーアナライザー実機再現 ＆ リップ折れ強度Canvas描画
 */

class LipstickVisualizer {
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

    // 1. クリーンなラボ・スタジオ背景
    this.drawLabBackground(ctx, w, h);

    // 2. Anton Paar PNR 500型 自動針入度計・テクスチャーアナライザー実機全体描画 (左側 x: 30〜520)
    this.drawAntonPaarApparatus(ctx, matEngine, 255, 290);

    // 3. 右側: 曲げ応力-荷重特性 ＆ 処方設計HUD (右側 x: 540〜1160)
    this.drawLipstickBendingGraph(ctx, matEngine, 540, 30, 620, 520);
  }

  drawLabBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.35, h * 0.35, 60, w * 0.35, h * 0.35, 750);
    bgGrad.addColorStop(0, '#101624');
    bgGrad.addColorStop(0.55, '#090d16');
    bgGrad.addColorStop(1, '#04060a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // ─── 🔬 Anton Paar PNR 500型 精密テクスチャー・針入度試験機 ───
  drawAntonPaarApparatus(ctx, matEngine, cx, cy) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    const D = matEngine.lipstickDiameter; // mm
    const L = matEngine.lipstickExtension; // mm
    const forceN = matEngine.lipstickAppliedForce;
    const isBroken = matEngine.lipstickIsBroken;
    const breakAngle = matEngine.lipstickBreakAngle;

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

    // 垂直リニアガイドレール（黒い溝）
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(towerX + towerW - 22, towerY + 30, 14, towerH - 50);

    // ─── 3. 操作パネル・カラーLCDディスプレイ (Touch Screen) ───
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

    // ディスプレイ内表示
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

    // Anton Paar ロゴ
    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Anton Paar', panelX + 8, panelY + 18);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('Test: Break/Penet.', panelX + 8, panelY + 35);
    ctx.fillText(`Status: ${isBroken ? 'BROKEN' : 'TESTING'}`, panelX + 8, panelY + 48);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Force: ${forceN.toFixed(2)} N`, panelX + 8, panelY + 65);
    ctx.fillText(`Ext L: ${L} mm`, panelX + 8, panelY + 78);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Stress: ${matEngine.lipstickBendingStress.toFixed(2)}MPa`, panelX + 8, panelY + 92);

    // 型番ロゴ
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PNR 500', panelX + panelW / 2, panelY + panelH - 8);

    // ─── 4. フレキシブルアーム付きLED作業灯 (Dual Flexible Arms) ───
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

    // LEDランプヘッド
    [ [towerX + 10, baseY - 160], [towerX + 30, baseY - 180] ].forEach(([lx, ly]) => {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();

    // ─── 5. 下部円形テストステージ ＆ ステンレスサンプル容器 ───
    const stageRadius = 75;
    const stageY = baseY - 8;
    const stageCenterX = cx + 55;

    // 円形回転プレート
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

    // ─── 6. リップスティック固定ホルダー ＆ リップ本体 ───
    const lipBaseX = stageCenterX;
    const lipBaseY = stageY - 10;
    const lipRadiusPx = (D / 2.0) * 3.8;
    const extLenPx = L * 3.8;

    // 金色リップケースホルダー
    const holderW = lipRadiusPx * 2 + 16;
    const holderH = 75;
    const holderGrad = ctx.createLinearGradient(lipBaseX - holderW / 2, 0, lipBaseX + holderW / 2, 0);
    holderGrad.addColorStop(0, '#ffd700');
    holderGrad.addColorStop(0.3, '#fffbeb');
    holderGrad.addColorStop(0.6, '#d97706');
    holderGrad.addColorStop(1, '#78350f');

    ctx.fillStyle = holderGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(lipBaseX - holderW / 2, lipBaseY - holderH, holderW, holderH, [4, 4, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // リップスティック本体
    const lipTopY = lipBaseY - holderH;
    const lipColor = (mat.id === 'lipstick_matte') ? { light: '#f43f5e', dark: '#881337' } : { light: '#fb7185', dark: '#9f1239' };

    ctx.save();
    ctx.translate(lipBaseX, lipTopY);

    if (!isBroken) {
      // 健全たわみリップ
      const deflPx = matEngine.lipstickDeflection * 3.8 * 2.2;
      const lipGrad = ctx.createLinearGradient(-lipRadiusPx, 0, lipRadiusPx, 0);
      lipGrad.addColorStop(0, lipColor.dark);
      lipGrad.addColorStop(0.4, lipColor.light);
      lipGrad.addColorStop(1, lipColor.dark);

      ctx.fillStyle = lipGrad;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-lipRadiusPx, 0);
      ctx.quadraticCurveTo(-lipRadiusPx + deflPx * 0.3, -extLenPx * 0.5, -lipRadiusPx + deflPx, -extLenPx);
      ctx.lineTo(lipRadiusPx + deflPx, -extLenPx + 12);
      ctx.quadraticCurveTo(lipRadiusPx + deflPx * 0.3, -extLenPx * 0.5, lipRadiusPx, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (matEngine.lipstickBendingStress > 0.2) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.beginPath();
        ctx.ellipse(0, -3, lipRadiusPx + 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

    } else {
      // 折れ破断後リップ
      ctx.fillStyle = lipColor.dark;
      ctx.beginPath();
      ctx.moveTo(-lipRadiusPx, 0);
      ctx.lineTo(lipRadiusPx, 0);
      ctx.lineTo(lipRadiusPx + 2, -8);
      ctx.lineTo(-lipRadiusPx - 2, -6);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.translate(0, -6);
      ctx.rotate((breakAngle * Math.PI) / 180);
      const lipGrad = ctx.createLinearGradient(-lipRadiusPx, 0, lipRadiusPx, 0);
      lipGrad.addColorStop(0, lipColor.dark);
      lipGrad.addColorStop(0.4, lipColor.light);
      lipGrad.addColorStop(1, lipColor.dark);
      ctx.fillStyle = lipGrad;
      ctx.beginPath();
      ctx.moveTo(-lipRadiusPx, 0);
      ctx.lineTo(-lipRadiusPx, -extLenPx + 8);
      ctx.lineTo(lipRadiusPx, -extLenPx + 20);
      ctx.lineTo(lipRadiusPx, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥 折れ破断！', 0, -extLenPx - 20);
    }
    ctx.restore();

    // ─── 7. 可動アクチュエーターヘッド ＆ 精密ニードル/プローブ (Measuring Head) ───
    const headX = towerX + towerW - 30;
    const headY = lipTopY - extLenPx - 70;
    const headW = 135;
    const headH = 65;

    // ヘッド本体（白＆シルバーの精密ブロック）
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

    // 警告ラベル（黄色三角マーク）
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(headX + 60, headY + 12);
    ctx.lineTo(headX + 50, headY + 28);
    ctx.lineTo(headX + 70, headY + 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // ロードセルチャック（金メッキコレット）
    const probeOriginX = lipBaseX;
    const probeOriginY = headY + headH;

    ctx.fillStyle = '#d97706';
    ctx.fillRect(probeOriginX - 8, probeOriginY, 16, 15);
    ctx.strokeStyle = '#78350f';
    ctx.strokeRect(probeOriginX - 8, probeOriginY, 16, 15);

    // テストニードル・加圧プローブ軸
    const probeTipY = lipTopY - extLenPx + 5;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(probeOriginX, probeOriginY + 15);
    ctx.lineTo(probeOriginX, probeTipY);
    ctx.stroke();

    // 先端球
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(probeOriginX, probeTipY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // 荷重矢印（プローブ加圧）
    if (forceN > 0.05) {
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(probeOriginX + 45, probeTipY);
      ctx.lineTo(probeOriginX + 12, probeTipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(probeOriginX + 18, probeTipY - 5);
      ctx.lineTo(probeOriginX + 10, probeTipY);
      ctx.lineTo(probeOriginX + 18, probeTipY + 5);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`F = ${forceN.toFixed(2)} N`, probeOriginX + 48, probeTipY + 4);
    }

    ctx.restore();
  }

  // ─── 📊 右側: リップ曲げ応力 ＆ 処方レオロジー解析 ───
  drawLipstickBendingGraph(ctx, matEngine, gx, gy, gw, gh) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 13px "Noto Sans JP", sans-serif';
    ctx.fillText(`💄 リップスティック折れ強度 ＆ 針入度レオロジー - ${mat.name}`, gx + 20, gy + 26);

    // 1. 曲げ応力公式カード
    const cardY = gy + 45;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.beginPath();
    ctx.roundRect(gx + 20, cardY, gw - 40, 75, 6);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('最大曲げ応力: σb = (F × L) / Z  [MPa]', gx + 35, cardY + 24);
    ctx.font = '10px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`・現在曲げモーメント: M = ${(matEngine.lipstickAppliedForce * matEngine.lipstickExtension).toFixed(1)} N・mm`, gx + 35, cardY + 44);
    ctx.fillText(`・断面係数 Z = π/32 × D³ = ${((Math.PI/32)*Math.pow(matEngine.lipstickDiameter, 3)).toFixed(1)} mm³ (D=${matEngine.lipstickDiameter}mm)`, gx + 35, cardY + 62);

    // 2. 応力バー ＆ 限界強度ゲージ
    const gaugeY = cardY + 95;
    const maxStressLimit = mat.sigma_u; // [MPa]
    const curStress = matEngine.lipstickBendingStress;
    const barW = gw - 180;

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('曲げ応力 σb vs 折れ限界強度 σu', gx + 20, gaugeY + 12);

    // 背景バー
    ctx.fillStyle = '#060a12';
    ctx.fillRect(gx + 20, gaugeY + 25, barW, 20);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(gx + 20, gaugeY + 25, barW, 20);

    // 現在応力バー
    const ratio = Math.min(1.0, curStress / (maxStressLimit * 1.3));
    ctx.fillStyle = matEngine.lipstickIsBroken ? '#ef4444' : '#f43f5e';
    ctx.fillRect(gx + 20, gaugeY + 25, barW * ratio, 20);

    // 限界線
    const limitX = gx + 20 + barW * (maxStressLimit / (maxStressLimit * 1.3));
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(limitX, gaugeY + 20);
    ctx.lineTo(limitX, gaugeY + 50);
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '9px monospace';
    ctx.fillText(`折れ限界 σu=${maxStressLimit} MPa`, limitX - 35, gaugeY + 62);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`${curStress.toFixed(2)} MPa`, gx + 30 + barW * ratio, gaugeY + 40);

    // 3. レオロジー・処方設計の解説
    const descY = gaugeY + 80;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx + 20, descY, gw - 40, 190, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('💡 Anton Paar PNR 500 による化粧品レオロジー評価', gx + 35, descY + 26);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px "Noto Sans JP", sans-serif';
    const lines = [
      '・自動針入度試験（Penetration）: 先端円錐/針プローブの侵入力からワックス硬度・塗布初期硬さを評価。',
      '・折れ強度（Break Strength）: リップスティック横加圧時の最大ピーク力・曲げ破断モーメントを同定。',
      '・繰り出し長さ L の影響: モーメント M ∝ L に比例するため、長く出すほど低荷重で折損。',
      '・温度依存性・チキソトロピー: 室温では保形し、唇の摩擦・体温（36℃）で滑らかに溶け広がる。'
    ];
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, gx + 35, descY + 52 + idx * 28);
    });

    ctx.restore();
  }
}

if (typeof window !== 'undefined') {
  window.LipstickVisualizer = LipstickVisualizer;
}
