/**
 * Industrial Vacuum Emulsifying & Formulation Visualizer
 * 実機（SUS316L鏡面サニタリー真空乳化機）＆ HLB・ミセル分子構造（O/W型・W/O型）のリアルタイム物理可視化
 */

class FormulationVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
    this.time = 0;

    // ミクロスコープ用油滴パーティクル (全体分散ビュー用)
    this.microDroplets = [];
    for (let i = 0; i < 60; i++) {
      this.microDroplets.push({
        x: (Math.random() - 0.5) * 130,
        y: (Math.random() - 0.5) * 130,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18,
        baseR: 4 + Math.random() * 16,
        phase: Math.random() * Math.PI * 2
      });
    }

    // 真空脱泡用マイクロバブル
    this.bubbles = [];
    for (let i = 0; i < 45; i++) {
      this.bubbles.push({
        x: 420 + (Math.random() - 0.5) * 180,
        y: 320 + Math.random() * 160,
        r: 1.5 + Math.random() * 3.5,
        vy: 1.0 + Math.random() * 3.0,
        alpha: 0.2 + Math.random() * 0.6
      });
    }

    // ホモミキサー剪断ジェット流パーティクル
    this.shearParticles = [];
    for (let i = 0; i < 50; i++) {
      this.shearParticles.push({
        x: 420,
        y: 470,
        angle: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 5,
        life: Math.random(),
        maxLife: 0.6 + Math.random() * 0.5
      });
    }
  }

  resize() {
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
  }

  draw(engine) {
    this.time += 0.025;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const p = engine.getCurrentProduct();

    // 1. クリーンルーム背景
    this.drawCleanroomBackground(ctx, w, h);

    // 2. プロセス5工程ヘッダー
    this.drawStageHeaders(ctx, engine);

    // 3. 左エリア: 水相釜・油相釜 (Pre-mixing Kettles)
    this.drawPreDissolutionKettles(ctx, engine, p);

    // 4. 中央エリア: 大型真空乳化攪拌装置 (Main Vacuum Emulsifier Vessel)
    this.drawMainEmulsifierVessel(ctx, engine, p);

    // 5. 右上エリア: リアルタイム・ミセル分子 ＆ 粒子径スコープ (Micelle & Droplet Scope)
    this.drawMicroscopicScope(ctx, engine, p);

    // 6. 右下エリア: クリーン充填・打栓ライン (Aseptic Bottling Line)
    this.drawAsepticBottlingLine(ctx, engine, p);

    // 7. 最下部: リアルタイム計測計器HUD (Process Dashboard HUD)
    this.drawProcessHUD(ctx, engine, p);
  }

  drawCleanroomBackground(ctx, w, h) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#080c14');
    bgGrad.addColorStop(0.35, '#0f172a');
    bgGrad.addColorStop(0.85, '#131e33');
    bgGrad.addColorStop(1, '#0b1120');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // クリーンルームエポキシ床面
    const floorY = h - 90;
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, '#1e293b');
    floorGrad.addColorStop(0.08, '#334155');
    floorGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(15, floorY, w - 30, 90);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, floorY, w - 30, 90);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(15, floorY + 30);
    ctx.lineTo(w - 15, floorY + 30);
    ctx.stroke();
  }

  drawStageHeaders(ctx, engine) {
    const stages = [
      { id: 1, title: '① 予備加熱溶解', sub: '水相75℃ / 油相75℃', x: 20, w: 220, st: engine.stages.phase1.status },
      { id: 2, title: '② 真空吸引仕込み', sub: '主釜-0.08MPa吸引', x: 250, w: 225, st: engine.stages.phase2.status },
      { id: 3, title: '③ 高剪断ホモ乳化', sub: '5000rpm微細化＆脱泡', x: 485, w: 235, st: engine.stages.phase3.status },
      { id: 4, title: '④ ジャケット徐冷', sub: 'スクレーパー結晶化', x: 730, w: 225, st: engine.stages.phase4.status },
      { id: 5, title: '⑤ 無菌充填・QC', sub: '品質合格・製剤完成', x: 965, w: 215, st: engine.stages.phase5.status }
    ];

    stages.forEach((st, idx) => {
      ctx.save();
      let bg = 'rgba(15, 23, 42, 0.85)';
      let border = 'rgba(148, 163, 184, 0.25)';
      let glow = false;

      if (st.st === 'RUNNING') {
        bg = '#0284c7';
        border = '#38bdf8';
        glow = true;
      } else if (st.st === 'COMPLETED') {
        bg = 'rgba(5, 150, 105, 0.85)';
        border = '#34d399';
      }

      if (glow) {
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
      }

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = st.st === 'RUNNING' ? 2 : 1;

      ctx.beginPath();
      ctx.roundRect(st.x, 12, st.w, 42, 7);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
      ctx.fillText(st.title, st.x + 10, 29);

      ctx.fillStyle = st.st === 'RUNNING' ? '#f0f9ff' : '#94a3b8';
      ctx.font = '10px "Noto Sans JP", sans-serif';
      ctx.fillText(st.sub, st.x + 10, 44);

      if (idx < stages.length - 1) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        const ax = st.x + st.w + 3;
        ctx.moveTo(ax, 33);
        ctx.lineTo(ax + 5, 30);
        ctx.lineTo(ax + 5, 36);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
  }

  drawPreDissolutionKettles(ctx, engine, p) {
    ctx.save();

    // ─── 水相釜 (Water Phase Kettle) ───
    const wx = 80;
    const wy = 120;
    const ww = 110;
    const wh = 140;

    // 架台
    ctx.fillStyle = '#334155';
    ctx.fillRect(wx - 10, wy + wh, ww + 20, 12);
    ctx.fillRect(wx + 10, wy + wh + 12, 10, 130);
    ctx.fillRect(wx + ww - 20, wy + wh + 12, 10, 130);

    // 水相釜本体
    const wJacketGrad = ctx.createLinearGradient(wx, 0, wx + ww, 0);
    const wHeating = engine.stages.phase1.status === 'RUNNING';
    if (wHeating) {
      wJacketGrad.addColorStop(0, '#f97316');
      wJacketGrad.addColorStop(0.5, '#fed7aa');
      wJacketGrad.addColorStop(1, '#ea580c');
    } else {
      wJacketGrad.addColorStop(0, '#64748b');
      wJacketGrad.addColorStop(0.5, '#cbd5e1');
      wJacketGrad.addColorStop(1, '#475569');
    }

    ctx.fillStyle = wJacketGrad;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, [6, 6, 25, 25]);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内部液面 (水相)
    const wFillRatio = Math.max(0.05, 1.0 - (engine.waterTransferred / 100));
    const wLiquidH = (wh - 25) * wFillRatio;
    const wLiquidY = wy + wh - 15 - wLiquidH;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(wx + 8, wy + 15, ww - 16, wh - 25, [0, 0, 20, 20]);
    ctx.clip();

    ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
    ctx.fillRect(wx + 8, wLiquidY, ww - 16, wLiquidH + 20);

    if (engine.stages.phase1.status === 'RUNNING') {
      const waveOff = Math.sin(this.time * 6) * 3;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(wx + 8, wLiquidY, ww - 16, 3 + waveOff);
    }
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💧 水相予備溶解釜', wx + ww / 2, wy + 25);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${engine.waterKettleTemp.toFixed(1)} ℃`, wx + ww / 2, wy + 42);

    // ─── 油相釜 (Oil Phase Kettle) ───
    const ox = 80;
    const oy = 295;
    const ow = 110;
    const oh = 135;

    const oJacketGrad = ctx.createLinearGradient(ox, 0, ox + ow, 0);
    if (wHeating) {
      oJacketGrad.addColorStop(0, '#f97316');
      oJacketGrad.addColorStop(0.5, '#fef08a');
      oJacketGrad.addColorStop(1, '#ea580c');
    } else {
      oJacketGrad.addColorStop(0, '#64748b');
      oJacketGrad.addColorStop(0.5, '#cbd5e1');
      oJacketGrad.addColorStop(1, '#475569');
    }

    ctx.fillStyle = oJacketGrad;
    ctx.beginPath();
    ctx.roundRect(ox, oy, ow, oh, [6, 6, 25, 25]);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    const oFillRatio = Math.max(0.05, 1.0 - (engine.oilTransferred / 100));
    const oLiquidH = (oh - 25) * oFillRatio;
    const oLiquidY = oy + oh - 15 - oLiquidH;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox + 8, oy + 15, ow - 16, oh - 25, [0, 0, 20, 20]);
    ctx.clip();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
    ctx.fillRect(ox + 8, oLiquidY, ow - 16, oLiquidH + 20);

    if (engine.stages.phase1.status === 'RUNNING') {
      const waveOff2 = Math.cos(this.time * 6) * 3;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(ox + 8, oLiquidY, ow - 16, 3 + waveOff2);
    }
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧴 油相予備溶解釜', ox + ow / 2, oy + 25);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${engine.oilKettleTemp.toFixed(1)} ℃`, ox + ow / 2, oy + 42);

    this.drawTransferPipes(ctx, engine, wx + ww, wy + wh / 2, ox + ow, oy + oh / 2);

    ctx.restore();
  }

  drawTransferPipes(ctx, engine, wx, wy, ox, oy) {
    ctx.save();
    const targetX = 330;
    const targetY = 220;

    // 水相配管
    ctx.strokeStyle = engine.stages.phase2.status === 'RUNNING' && engine.waterTransferred < 100 ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + 50, wy);
    ctx.lineTo(wx + 50, targetY - 20);
    ctx.lineTo(targetX, targetY - 20);
    ctx.stroke();

    // 油相配管
    ctx.strokeStyle = engine.stages.phase2.status === 'RUNNING' && engine.waterTransferred >= 100 && engine.oilTransferred < 100 ? '#f59e0b' : 'rgba(148, 163, 184, 0.4)';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + 40, oy);
    ctx.lineTo(ox + 40, targetY + 10);
    ctx.lineTo(targetX, targetY + 10);
    ctx.stroke();

    // 移送流動アニメーション
    if (engine.stages.phase2.status === 'RUNNING') {
      const flowOff = (this.time * 80) % 20;
      if (engine.waterTransferred < 100) {
        ctx.fillStyle = '#0ea5e9';
        for (let x = wx; x < targetX; x += 22) {
          ctx.beginPath();
          ctx.arc(x + flowOff, x < wx + 50 ? wy : (targetY - 20), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (engine.oilTransferred < 100) {
        ctx.fillStyle = '#f59e0b';
        for (let x = ox; x < targetX; x += 22) {
          ctx.beginPath();
          ctx.arc(x + flowOff, x < ox + 40 ? oy : (targetY + 10), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  drawMainEmulsifierVessel(ctx, engine, p) {
    ctx.save();
    const vx = 320;
    const vy = 110;
    const vw = 250;
    const vh = 320;

    this.drawHydraulicPillars(ctx, vx, vy, vw, vh);
    this.drawThermalJacket(ctx, engine, vx, vy, vw, vh);
    this.drawSanitaryBowl(ctx, vx, vy, vw, vh);
    this.drawVesselLiquid(ctx, engine, p, vx, vy, vw, vh);
    this.drawTripleShaftAgitators(ctx, engine, p, vx, vy, vw, vh);

    if (engine.stages.phase3.status === 'RUNNING' || engine.stages.phase4.status === 'RUNNING') {
      this.drawDeaerationBubbles(ctx, engine, vx, vy, vw, vh);
    }

    this.drawVesselTopDome(ctx, engine, vx, vy, vw, vh);
    ctx.restore();
  }

  drawHydraulicPillars(ctx, vx, vy, vw, vh) {
    const pillarW = 22;
    const leftPx = vx - pillarW - 12;
    const rightPx = vx + vw + 12;

    [leftPx, rightPx].forEach(px => {
      const pGrad = ctx.createLinearGradient(px, 0, px + pillarW, 0);
      pGrad.addColorStop(0, '#475569');
      pGrad.addColorStop(0.3, '#f1f5f9');
      pGrad.addColorStop(0.7, '#cbd5e1');
      pGrad.addColorStop(1, '#334155');

      ctx.fillStyle = pGrad;
      ctx.fillRect(px, 75, pillarW, vh + 75);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, 75, pillarW, vh + 75);

      ctx.fillStyle = '#64748b';
      ctx.fillRect(px - 4, 75, pillarW + 8, 14);
      ctx.fillRect(px - 4, vy + vh + 60, pillarW + 8, 14);
    });
  }

  drawThermalJacket(ctx, engine, vx, vy, vw, vh) {
    const jw = vw + 24;
    const jh = vh + 12;
    const jx = vx - 12;
    const jy = vy + 30;

    let jGrad = ctx.createLinearGradient(jx, 0, jx + jw, 0);
    if (engine.stages.phase1.status === 'RUNNING' || engine.stages.phase2.status === 'RUNNING' || engine.stages.phase3.status === 'RUNNING') {
      jGrad.addColorStop(0, '#b91c1c');
      jGrad.addColorStop(0.5, '#f97316');
      jGrad.addColorStop(1, '#991b1b');
    } else if (engine.stages.phase4.status === 'RUNNING') {
      jGrad.addColorStop(0, '#0369a1');
      jGrad.addColorStop(0.5, '#38bdf8');
      jGrad.addColorStop(1, '#075985');
    } else {
      jGrad.addColorStop(0, '#334155');
      jGrad.addColorStop(0.5, '#64748b');
      jGrad.addColorStop(1, '#1e293b');
    }

    ctx.fillStyle = jGrad;
    ctx.beginPath();
    ctx.roundRect(jx, jy, jw, jh, [0, 0, 110, 110]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.fillRect(jx - 16, jy + 40, 16, 12);
    ctx.fillRect(jx + jw, jy + jh - 50, 16, 12);
  }

  drawSanitaryBowl(ctx, vx, vy, vw, vh) {
    const bGrad = ctx.createLinearGradient(vx, 0, vx + vw, 0);
    bGrad.addColorStop(0, '#64748b');
    bGrad.addColorStop(0.2, '#f8fafc');
    bGrad.addColorStop(0.5, '#e2e8f0');
    bGrad.addColorStop(0.8, '#cbd5e1');
    bGrad.addColorStop(1, '#475569');

    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.roundRect(vx, vy + 35, vw, vh - 25, [0, 0, 100, 100]);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(vx + 10, vy + 45, vw - 20, vh - 45, [0, 0, 90, 90]);
    ctx.fill();
  }

  drawVesselLiquid(ctx, engine, p, vx, vy, vw, vh) {
    const liquidTotal = (engine.waterTransferred + engine.oilTransferred) / 200.0;
    if (liquidTotal <= 0.01) return;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(vx + 10, vy + 45, vw - 20, vh - 45, [0, 0, 90, 90]);
    ctx.clip();

    const maxH = vh - 75;
    const curH = maxH * liquidTotal;
    const curY = (vy + vh - 10) - curH;

    let liqColor = p.liquidColor;
    if (engine.stages.phase2.status === 'RUNNING') {
      liqColor = p.emulsionType === 'W/O' ? 'rgba(254, 240, 138, 0.8)' : 'rgba(217, 249, 157, 0.75)';
    } else if (engine.stages.phase3.status === 'RUNNING') {
      const p3Ratio = engine.stages.phase3.progress / 100;
      if (p.emulsionType === 'W/O') {
        liqColor = `rgba(${Math.round(254 - 5 * p3Ratio)}, ${Math.round(243 - 10 * p3Ratio)}, ${Math.round(199 + 30 * p3Ratio)}, ${0.85 + 0.12 * p3Ratio})`;
      } else {
        liqColor = `rgba(${Math.round(230 + 25 * p3Ratio)}, ${Math.round(245 + 10 * p3Ratio)}, 255, ${0.8 + 0.18 * p3Ratio})`;
      }
    }

    ctx.fillStyle = liqColor;
    ctx.fillRect(vx + 10, curY, vw - 20, curH + 30);

    const wave = Math.sin(this.time * 8) * (engine.homoRpm > 0 ? 4 : 1.5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(vx + vw / 2, curY + 2, (vw - 24) / 2, 6 + wave, 0, 0, Math.PI * 2);
    ctx.fill();

    const shineGrad = ctx.createLinearGradient(vx + 10, 0, vx + vw - 10, 0);
    shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shineGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.35)');
    shineGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
    shineGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.15)');
    shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shineGrad;
    ctx.fillRect(vx + 10, curY, vw - 20, curH + 30);

    ctx.restore();
  }

  drawTripleShaftAgitators(ctx, engine, p, vx, vy, vw, vh) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(vx + 10, vy + 45, vw - 20, vh - 45, [0, 0, 90, 90]);
    ctx.clip();

    const cx = vx + vw / 2;
    const topY = vy + 45;
    const botY = vy + vh - 20;

    // 1. スクレーパー付きアンカー翼
    const anchorSpeed = engine.anchorRpm > 0 && engine.running ? (engine.anchorRpm / 35.0) : 0;
    const anchorAngle = this.time * 2.0 * anchorSpeed;
    const anchorCos = Math.cos(anchorAngle);

    const frameSpan = (vw - 40) / 2 * Math.abs(anchorCos);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx - frameSpan, topY + 40);
    ctx.lineTo(cx - frameSpan, botY - 35);
    ctx.quadraticCurveTo(cx, botY - 10, cx + frameSpan, botY - 35);
    ctx.lineTo(cx + frameSpan, topY + 40);
    ctx.stroke();

    // 白色PTFEテフロンスクレーパー
    if (Math.abs(anchorCos) > 0.4) {
      ctx.fillStyle = '#ffffff';
      for (let sy = topY + 70; sy < botY - 40; sy += 45) {
        ctx.fillRect(cx - frameSpan - 6, sy, 7, 18);
        ctx.fillRect(cx + frameSpan - 1, sy, 7, 18);
      }
    }

    // 2. 中心軸 ＆ 逆回転パドル翼
    const shaftGrad = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
    shaftGrad.addColorStop(0, '#475569');
    shaftGrad.addColorStop(0.5, '#f8fafc');
    shaftGrad.addColorStop(1, '#334155');
    ctx.fillStyle = shaftGrad;
    ctx.fillRect(cx - 5, topY, 10, vh - 75);

    const paddleSpeed = engine.paddleRpm > 0 && engine.running ? (engine.paddleRpm / 50.0) : 0;
    const paddleAngle = -this.time * 3.5 * paddleSpeed;
    const paddleSpan = 42 * Math.cos(paddleAngle);

    ctx.fillStyle = '#cbd5e1';
    for (let py = topY + 80; py < botY - 70; py += 55) {
      ctx.beginPath();
      ctx.roundRect(cx - paddleSpan, py, paddleSpan * 2, 10, 3);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. 底部超高速ホモミキサー
    const homoY = botY - 18;
    const homoSpeed = engine.homoRpm > 0 && engine.running ? (engine.homoRpm / 5000.0) : 0;

    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(cx - 32, homoY - 12, 64, 24, 6);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const rotorAngle = this.time * 25.0 * homoSpeed;
    ctx.fillStyle = '#f8fafc';
    for (let i = 0; i < 4; i++) {
      const a = rotorAngle + (i * Math.PI / 2);
      const rx = cx + Math.cos(a) * 20;
      const ry = homoY + Math.sin(a) * 5;
      ctx.beginPath();
      ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (homoSpeed > 0.2) {
      this.shearParticles.forEach(sp => {
        sp.y -= sp.speed * homoSpeed;
        sp.x += Math.sin(this.time * 15 + sp.angle) * 3 * homoSpeed;
        sp.life += 0.03;
        if (sp.life > sp.maxLife || sp.y < topY + 70) {
          sp.x = cx + (Math.random() - 0.5) * 35;
          sp.y = homoY - 5;
          sp.life = 0;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${(1.0 - sp.life / sp.maxLife) * 0.75})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }

  drawDeaerationBubbles(ctx, engine, vx, vy, vw, vh) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(vx + 10, vy + 45, vw - 20, vh - 45, [0, 0, 90, 90]);
    ctx.clip();

    this.bubbles.forEach(b => {
      b.y -= b.vy * (1.0 + Math.abs(engine.currentVacuum) * 10);
      if (b.y < vy + 100) {
        b.y = vy + vh - 30;
        b.x = vx + 30 + Math.random() * (vw - 60);
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * (1.0 - engine.deaerationRate / 100)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  drawVesselTopDome(ctx, engine, vx, vy, vw, vh) {
    const domeW = vw + 36;
    const domeH = 50;
    const domeX = vx - 18;
    const domeY = vy - 10;

    const dGrad = ctx.createLinearGradient(domeX, 0, domeX + domeW, 0);
    dGrad.addColorStop(0, '#475569');
    dGrad.addColorStop(0.2, '#f8fafc');
    dGrad.addColorStop(0.5, '#e2e8f0');
    dGrad.addColorStop(0.8, '#cbd5e1');
    dGrad.addColorStop(1, '#334155');

    ctx.fillStyle = dGrad;
    ctx.beginPath();
    ctx.roundRect(domeX, domeY, domeW, domeH, [30, 30, 6, 6]);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // サイトグラス
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(vx + 60, domeY + 22, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 真空圧力ゲージ
    const gaugeX = vx + vw - 60;
    const gaugeY = domeY + 18;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    const needleAngle = Math.PI * 0.75 + (Math.abs(engine.currentVacuum) / 0.1) * Math.PI * 1.5;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gaugeX, gaugeY);
    ctx.lineTo(gaugeX + Math.cos(needleAngle) * 11, gaugeY + Math.sin(needleAngle) * 11);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11.5px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SUS316L 真空乳化攪拌装置 (100L)', vx + vw / 2, domeY + 28);
  }

  // ─── 🔬 リアルタイム・ミセル分子 ＆ 粒子径スコープ (Micro-Scope View) ───
  drawMicroscopicScope(ctx, engine, p) {
    ctx.save();
    const scX = 990;
    const scY = 195;
    const scR = 92;

    // スコープ外枠
    const bGrad = ctx.createRadialGradient(scX, scY, scR - 15, scX, scY, scR + 12);
    bGrad.addColorStop(0, '#1e293b');
    bGrad.addColorStop(0.8, '#334155');
    bGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(scX, scY, scR + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 視野内部
    ctx.save();
    ctx.beginPath();
    ctx.arc(scX, scY, scR, 0, Math.PI * 2);
    ctx.clip();

    const isWO = engine.activeEmulsionType === 'W/O';
    const isMicelle = engine.activeEmulsionType === 'MICELLE';

    // 背景色 (O/W型: 水相ブルー / W/O型: 油相アンバー)
    if (isWO) {
      ctx.fillStyle = '#1e1b13'; // 油中
    } else {
      ctx.fillStyle = '#061325'; // 水中
    }
    ctx.fillRect(scX - scR, scY - scR, scR * 2, scR * 2);

    // グリッド線
    ctx.strokeStyle = isWO ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    for (let gx = -scR; gx < scR; gx += 25) {
      ctx.beginPath();
      ctx.moveTo(scX + gx, scY - scR);
      ctx.lineTo(scX + gx, scY + scR);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(scX - scR, scY + gx);
      ctx.lineTo(scX + scR, scY + gx);
      ctx.stroke();
    }

    if (engine.molecularViewMode === 'micelle') {
      // 🧬 【分子ミセル拡大モード】: 界面活性剤の親水基・親油基とドロップレットの自己組織化
      this.drawSurfactantMicelleStructure(ctx, engine, p, scX, scY, isWO, isMicelle);
    } else {
      // 🌐 【全体分散粒子モード】: レーザー回折風マルチパーティクル
      this.drawLaserDiffractionParticles(ctx, engine, p, scX, scY, scR);
    }

    ctx.restore();

    // スコープ上部タイトル ＆ モード表示
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(engine.molecularViewMode === 'micelle' ? '🔬 界面活性剤ミセル分子配向ビュー' : '🌐 レーザー回折 粒子分散ビュー', scX, scY - scR - 18);

    // 下部情報バッジ (HLB ＆ エマルション型)
    const badgeY = scY + scR + 18;
    ctx.fillStyle = isWO ? '#f59e0b' : '#38bdf8';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.fillText(`${engine.activeEmulsionType}型 (${isWO ? '油中水滴型' : '水中油滴型'}) | HLB: ${engine.effectiveHLB.toFixed(1)}`, scX, badgeY);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`平均粒子径 d = ${engine.dropletSize.toFixed(2)} μm (適合度 ${engine.hlbMatchScore}%)`, scX, badgeY + 16);

    ctx.restore();
  }

  // 🧬 界面活性剤分子（親水基・親油基）による正ミセル／逆ミセルの精密描画
  drawSurfactantMicelleStructure(ctx, engine, p, cx, cy, isWO, isMicelle) {
    const time = this.time;
    const baseDropR = 42; // ドロップレット基本半径
    const numMolecules = 22; // 界面活性剤分子数

    if (isMicelle) {
      // 🧴 【棒状・球状ミセル (シャンプー系)】
      // 水相中に親油テールを内側に寄せた球状・楕円ミセル
      ctx.fillStyle = '#0ea5e9';
      ctx.font = '9px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('【水相 (外相)】', cx, cy - 65);

      // ミセル核
      ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // 界面活性剤分子 (親油テール内側・親水ヘッド外側)
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + Math.sin(time * 2 + i) * 0.05;
        const innerR = 12;
        const outerR = 30;

        const hx = cx + Math.cos(ang) * outerR;
        const hy = cy + Math.sin(ang) * outerR;
        const tx = cx + Math.cos(ang) * innerR;
        const ty = cy + Math.sin(ang) * innerR;

        // 親油テール (波打つ炭化水素鎖)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const midX = (hx + tx) / 2 + Math.cos(time * 6 + i) * 3;
        const midY = (hy + ty) / 2 + Math.sin(time * 6 + i) * 3;
        ctx.quadraticCurveTo(midX, midY, tx, ty);
        ctx.stroke();

        // 親水ヘッド (親水性球体)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
      ctx.fillText('アミノ酸球状ミセル', cx, cy + 50);

    } else if (isWO) {
      // 🟠 【W/O型エマルション (逆ミセル)】
      // 外相: 油相 (Amber) / 内相: 水滴 (Blue)
      // 親水基(ヘッド)が内側の水に向き、親油基(テール)が外側の油に広がる！
      
      // 外相ラベル
      ctx.fillStyle = '#f59e0b';
      ctx.font = '9px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('【外相: 油相 (Oil)】', cx - 80, cy - 70);

      // 内相水滴 (Water Droplet)
      const dropGrad = ctx.createRadialGradient(cx - 10, cy - 10, 5, cx, cy, baseDropR);
      dropGrad.addColorStop(0, '#bae6fd');
      dropGrad.addColorStop(0.7, '#0284c7');
      dropGrad.addColorStop(1, '#0369a1');
      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseDropR - 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('内相: 水滴 (Water)', cx, cy + 4);

      // 界面活性剤分子 (逆ミセル配向)
      for (let i = 0; i < numMolecules; i++) {
        const ang = (i / numMolecules) * Math.PI * 2 + Math.sin(time * 3 + i) * 0.04;
        const headR = baseDropR - 6; // 親水基（内側水滴表面）
        const tailR = baseDropR + 22; // 親油基（外側油相へ伸びる）

        const hx = cx + Math.cos(ang) * headR;
        const hy = cy + Math.sin(ang) * headR;
        const tx = cx + Math.cos(ang) * tailR;
        const ty = cy + Math.sin(ang) * tailR;

        // 親油テール (外側油相へ放射状に伸びるオレンジのジグザグ炭化水素鎖)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const midX = (hx + tx) / 2 + Math.sin(time * 5 + i * 2) * 4;
        const midY = (hy + ty) / 2 + Math.cos(time * 5 + i * 2) * 4;
        ctx.quadraticCurveTo(midX, midY, tx, ty);
        ctx.stroke();

        // 親水ヘッド (内側の水滴に向く親水性球体)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 分子説明ラベル
      ctx.fillStyle = '#38bdf8';
      ctx.font = '8.5px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('● 親水基 (内包水滴へ結合)', cx, cy + 70);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('〜 親油基 (外相油へ伸長)', cx, cy + 82);

    } else {
      // 🔵 【O/W型エマルション (正ミセル)】
      // 外相: 水相 (Blue) / 内相: 油滴 (Amber)
      // 親油基(テール)が内側の油滴に潜り、親水基(ヘッド)が外側の水に向く！

      // 外相ラベル
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('【外相: 水相 (Water)】', cx - 80, cy - 70);

      // 内相油滴 (Oil Droplet)
      const dropGrad = ctx.createRadialGradient(cx - 10, cy - 10, 5, cx, cy, baseDropR);
      dropGrad.addColorStop(0, '#fef08a');
      dropGrad.addColorStop(0.7, '#f59e0b');
      dropGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseDropR - 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('内相: 油滴 (Oil)', cx, cy + 4);

      // 界面活性剤分子 (正ミセル配向)
      for (let i = 0; i < numMolecules; i++) {
        const ang = (i / numMolecules) * Math.PI * 2 + Math.sin(time * 3 + i) * 0.04;
        const headR = baseDropR + 8;  // 親水基（外側の水相へ向く）
        const tailR = baseDropR - 22; // 親油基（内側の油滴に潜り込む）

        const hx = cx + Math.cos(ang) * headR;
        const hy = cy + Math.sin(ang) * headR;
        const tx = cx + Math.cos(ang) * tailR;
        const ty = cy + Math.sin(ang) * tailR;

        // 親油テール (内側油滴へ潜り込む炭化水素鎖)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const midX = (hx + tx) / 2 + Math.sin(time * 5 + i * 2) * 3;
        const midY = (hy + ty) / 2 + Math.cos(time * 5 + i * 2) * 3;
        ctx.quadraticCurveTo(midX, midY, tx, ty);
        ctx.stroke();

        // 親水ヘッド (外側の水相に向くシアン球体)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 分子説明ラベル
      ctx.fillStyle = '#38bdf8';
      ctx.font = '8.5px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('● 親水基 (外側水相へ整列)', cx, cy + 70);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('〜 親油基 (内側油滴へ挿入)', cx, cy + 82);
    }
  }

  // 🌐 レーザー回折風マルチドロップレット描画
  drawLaserDiffractionParticles(ctx, engine, p, scX, scY, scR) {
    const currentScale = engine.dropletSize / 50.0;
    const agitationEnergy = engine.homoRpm > 0 ? (engine.homoRpm / 2000.0) : 0.5;

    this.microDroplets.forEach((d) => {
      d.x += (Math.cos(this.time * 4 + d.phase) * d.vx * 0.08) * agitationEnergy;
      d.y += (Math.sin(this.time * 4 + d.phase) * d.vy * 0.08) * agitationEnergy;

      if (d.x > scR - 10) d.x = -scR + 10;
      if (d.x < -scR + 10) d.x = scR - 10;
      if (d.y > scR - 10) d.y = -scR + 10;
      if (d.y < -scR + 10) d.y = scR - 10;

      const r = Math.max(1.5, d.baseR * (0.15 + 0.85 * currentScale));
      const dGrad = ctx.createRadialGradient(scX + d.x - r * 0.3, scY + d.y - r * 0.3, r * 0.1, scX + d.x, scY + d.y, r);
      dGrad.addColorStop(0, '#ffffff');
      dGrad.addColorStop(0.4, p.dropletColor);
      dGrad.addColorStop(1, 'rgba(2, 132, 199, 0.4)');

      ctx.fillStyle = dGrad;
      ctx.beginPath();
      ctx.arc(scX + d.x, scY + d.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawAsepticBottlingLine(ctx, engine, p) {
    ctx.save();
    const bx = 890;
    const by = 370;
    const bw = 280;
    const bh = 100;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📦 クリーン充填・キャッピングライン', bx + 12, by + 18);

    const convY = by + 65;
    ctx.fillStyle = '#334155';
    ctx.fillRect(bx + 15, convY, bw - 30, 8);

    const nozX = bx + 90;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(nozX - 3, by + 28, 6, 22);

    if (engine.stages.phase5.status === 'RUNNING') {
      ctx.fillStyle = p.liquidColor;
      ctx.fillRect(nozX - 1.5, by + 50, 3, 15);
    }

    const filledCount = engine.stages.phase5.unitsFilled || 0;
    const bottles = [
      { x: bx + 50, filled: filledCount > 2 },
      { x: bx + 90, filled: filledCount > 0 },
      { x: bx + 135, filled: true },
      { x: bx + 180, filled: true },
      { x: bx + 225, filled: true }
    ];

    bottles.forEach(bt => {
      ctx.fillStyle = bt.filled ? p.liquidColor : 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.roundRect(bt.x - 10, convY - 26, 20, 26, 4);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.fillRect(bt.x - 6, convY - 32, 12, 6);
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(filledCount)} / ${engine.stages.phase5.targetUnits || 25} 本`, bx + bw - 15, by + 35);

    ctx.restore();
  }

  drawProcessHUD(ctx, engine, p) {
    ctx.save();
    const hudY = this.height - 75;
    const items = [
      { label: '主釜温度', val: `${engine.mainVesselTemp.toFixed(1)} ℃`, color: '#f97316' },
      { label: '真空度', val: `${engine.currentVacuum.toFixed(3)} MPa`, color: '#38bdf8' },
      { label: 'ホモミキサー', val: `${Math.round(engine.homoRpm)} rpm`, color: '#ec4899' },
      { label: '実効 HLB 値', val: `HLB ${engine.effectiveHLB.toFixed(1)}`, color: engine.effectiveHLB < 7 ? '#f59e0b' : '#38bdf8' },
      { label: '平均粒子径', val: `${engine.dropletSize.toFixed(2)} μm`, color: '#10b981' },
      { label: '粘度 (チキソ)', val: `${Math.round(engine.currentViscosity).toLocaleString()} mPa・s`, color: '#fbbf24' },
      { label: '真空脱泡率', val: `${engine.deaerationRate.toFixed(1)} %`, color: '#06b6d4' }
    ];

    const itemW = (this.width - 60) / items.length;
    items.forEach((it, idx) => {
      const ix = 30 + idx * itemW;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(ix, hudY, itemW - 8, 55, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(it.label, ix + (itemW - 8) / 2, hudY + 18);

      ctx.fillStyle = it.color;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(it.val, ix + (itemW - 8) / 2, hudY + 38);
    });

    ctx.restore();
  }
}

if (typeof window !== 'undefined') {
  window.FormulationVisualizer = FormulationVisualizer;
}
