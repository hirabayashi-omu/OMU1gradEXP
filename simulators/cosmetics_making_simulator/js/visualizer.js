/**
 * DIY Cosmetics & Daily Care Formulation Visualizer
 * カラフルでワクワクするコスメ・日用品メイキングアニメーション
 */

class FormulationVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 540;
    this.time = 0;

    this.sparkles = [];
    for (let i = 0; i < 30; i++) {
      this.sparkles.push({
        x: Math.random() * 1200,
        y: Math.random() * 540,
        size: 1 + Math.random() * 3,
        speed: 0.5 + Math.random() * 1.5,
        alpha: Math.random()
      });
    }

    this.foamBubbles = [];
    for (let i = 0; i < 35; i++) {
      this.foamBubbles.push({
        x: 430 + (Math.random() - 0.5) * 75,
        y: 270 + Math.random() * 100,
        r: 2 + Math.random() * 6,
        vy: 0.8 + Math.random() * 1.5
      });
    }
  }

  resize() {
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 540;
  }

  draw(engine) {
    this.time += 0.03;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const p = engine.getCurrentProduct();

    // 背景（明るく清潔感のあるモダンラボ・コスメキッチン調）
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.4, '#1e293b');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // タイル調の床＆カウンター
    this.drawLabBackground(ctx, w, h);

    // 5つのステップヘッダー
    this.drawStepHeaders(ctx, engine);

    // 配管＆コネクタ
    this.drawPipes(ctx, engine, p);

    // ① 原料計量コーナー
    this.drawStage1Weighing(ctx, engine, p);

    // ② 加熱ブレンドタンク
    this.drawStage2Mixing(ctx, engine, p);

    // ③ なめらかフィルター
    this.drawStage3Filtration(ctx, engine, p);

    // ④ ボトル充填
    this.drawStage4Bottling(ctx, engine, p);

    // ⑤ ラベル＆完成品
    this.drawStage5Packaging(ctx, engine, p);

    // 下部バナー
    this.drawBottomBanner(ctx, w, h, p);
  }

  drawLabBackground(ctx, w, h) {
    ctx.save();
    // カウンター作業台
    const tableGrad = ctx.createLinearGradient(0, h - 85, 0, h);
    tableGrad.addColorStop(0, '#334155');
    tableGrad.addColorStop(0.08, '#475569');
    tableGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = tableGrad;
    ctx.fillRect(20, h - 85, w - 40, 85);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, h - 85, w - 40, 85);

    // キラキラエフェクト
    this.sparkles.forEach(s => {
      s.alpha += (Math.random() - 0.5) * 0.1;
      s.alpha = Math.max(0.1, Math.min(0.8, s.alpha));
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  drawStepHeaders(ctx, engine) {
    const steps = [
      { id: 1, title: '① 原料を量る (計量)', sub: '水・オイル・美容成分を配合', x: 25, w: 215, st: engine.stages.weighing.status },
      { id: 2, title: '② 温めて混ぜる (ブレンド)', sub: '加熱＆高速撹拌で乳化・溶解', x: 250, w: 230, st: engine.stages.blending.status },
      { id: 3, title: '③ なめらかに整える (ろ過)', sub: 'ダマや気泡を除去してツヤ出し', x: 490, w: 230, st: engine.stages.filtration.status },
      { id: 4, title: '④ ボトルにつめる (充填)', sub: '1滴もこぼさず綺麗に注ぐ', x: 730, w: 225, st: engine.stages.bottling.status },
      { id: 5, title: '⑤ ラベルを貼って完成！', sub: 'オリジナルコスメのできあがり', x: 965, w: 210, st: engine.stages.packaging.status }
    ];

    steps.forEach((st, idx) => {
      ctx.save();
      let bg = 'rgba(30, 41, 59, 0.8)';
      let border = 'rgba(79, 195, 247, 0.3)';
      if (st.st === 'RUNNING') {
        bg = 'linear-gradient(135deg, rgba(14, 165, 233, 0.8), rgba(2, 132, 199, 0.9))';
        bg = '#0284c7';
        border = '#38bdf8';
      } else if (st.st === 'COMPLETED') {
        bg = '#059669';
        border = '#34d399';
      }

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = st.st === 'RUNNING' ? 2 : 1;

      ctx.beginPath();
      ctx.roundRect(st.x, 35, st.w, 48, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12.5px "Noto Sans JP", sans-serif';
      ctx.fillText(st.title, st.x + 10, 54);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '9.5px "Noto Sans JP", sans-serif';
      ctx.fillText(st.sub, st.x + 10, 71);

      if (idx < steps.length - 1) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        const ax = st.x + st.w + 3;
        ctx.moveTo(ax, 59);
        ctx.lineTo(ax + 7, 55);
        ctx.lineTo(ax + 7, 63);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
  }

  drawPipes(ctx, engine, p) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(200, 380);
    ctx.lineTo(260, 380);
    ctx.lineTo(260, 240);
    ctx.lineTo(330, 240);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(430, 395);
    ctx.lineTo(520, 395);
    ctx.lineTo(520, 330);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(570, 330);
    ctx.lineTo(740, 330);
    ctx.lineTo(740, 280);
    ctx.lineTo(785, 280);
    ctx.stroke();

    if (engine.running && !engine.paused) {
      ctx.fillStyle = p.baseColor;
      const offset = (this.time * 60) % 25;
      if (engine.stages.weighing.status === 'RUNNING') {
        for (let x = 200; x < 260; x += 20) {
          ctx.beginPath();
          ctx.arc(x + (offset % 20), 380, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (engine.stages.filtration.status === 'RUNNING') {
        for (let x = 570; x < 740; x += 20) {
          ctx.beginPath();
          ctx.arc(x + (offset % 20), 330, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawStage1Weighing(ctx, engine, p) {
    ctx.save();
    const wx = 80, wy = 230;

    // 電子天秤
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(wx, wy + 140, 90, 22);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(wx + 10, wy + 132, 70, 8);
    // 天秤ディスプレイ
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(wx + 20, wy + 145, 50, 14);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    const weightVal = (engine.stages.weighing.progress * 1.5).toFixed(1);
    ctx.fillText(`${weightVal}g`, wx + 24, wy + 156);

    // 調合ビーカー
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + 20, wy + 55);
    ctx.lineTo(wx + 20, wy + 132);
    ctx.lineTo(wx + 70, wy + 132);
    ctx.lineTo(wx + 70, wy + 55);
    ctx.stroke();

    // ビーカー内のカラフルな原料
    if (engine.stages.weighing.progress > 0) {
      const fillH = (engine.stages.weighing.progress / 100) * 60;
      ctx.fillStyle = p.baseColor + 'bb';
      ctx.fillRect(wx + 22, wy + 132 - fillH, 46, fillH);
    }

    // 周りの可愛いアロマ瓶・エッセンス瓶
    this.drawMiniBottle(ctx, wx - 45, wy + 100, '#e0e7ff', '水相');
    this.drawMiniBottle(ctx, wx - 18, wy + 105, '#fef08a', 'オイル');
    this.drawMiniBottle(ctx, wx + 85, wy + 105, '#fbcfe8', 'アロマ');

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('原料ビーカー', wx + 12, wy + 42);

    ctx.restore();
  }

  drawMiniBottle(ctx, x, y, color, label) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 10, 18, 28);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(x + 2, y + 10, 18, 28);
    // キャップ
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 6, y + 4, 10, 6);
    // ラベル文字
    ctx.fillStyle = '#1e293b';
    ctx.font = '7px sans-serif';
    ctx.fillText(label, x + 3, y + 24);
    ctx.restore();
  }

  drawStage2Mixing(ctx, engine, p) {
    ctx.save();
    const s = engine.stages.blending;
    const tx = 330, ty = 210, tw = 100, th = 190;

    // 上部モーター
    ctx.fillStyle = '#334155';
    ctx.fillRect(tx + 35, ty - 45, 30, 40);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(tx + 35, ty - 45, 30, 40);

    if (s.stirSpeed > 0) {
      const angle = this.time * (s.stirSpeed / 30);
      ctx.save();
      ctx.translate(tx + 50, ty - 25);
      ctx.rotate(angle);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-12, -2, 24, 4);
      ctx.fillRect(-2, -12, 4, 24);
      ctx.restore();
    }

    // タンク本体（温かみのあるステンレス＆ガラス窓）
    const tankGrad = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    tankGrad.addColorStop(0, '#64748b');
    tankGrad.addColorStop(0.2, '#cbd5e1');
    tankGrad.addColorStop(0.5, '#f1f5f9');
    tankGrad.addColorStop(0.8, '#cbd5e1');
    tankGrad.addColorStop(1, '#475569');

    ctx.fillStyle = tankGrad;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, [16, 16, 32, 32]);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 加熱ヒーター（温めるとオレンジに発光）
    const heaterColor = s.temp > 30 ? 'rgba(249, 115, 22, 0.7)' : 'rgba(148, 163, 184, 0.3)';
    ctx.fillStyle = heaterColor;
    ctx.fillRect(tx - 6, ty + 50, 6, 70);
    ctx.fillRect(tx + tw, ty + 50, 6, 70);

    // 覗き窓
    const gx = tx + 18, gy = ty + 35, gw = 64, gh = 95;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 8);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    // 窓内のブレンド液
    if (s.progress > 0 || engine.stages.weighing.status === 'COMPLETED') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx + 2, gy + 2, gw - 4, gh - 4);
      ctx.clip();

      const liquidLevel = gy + 25 + (1 - (s.progress / 100)) * 20;
      ctx.fillStyle = p.baseColor;

      // 渦巻き波
      ctx.beginPath();
      ctx.moveTo(gx, gy + gh);
      ctx.lineTo(gx, liquidLevel);
      const vortex = (s.stirSpeed / 400) * 16;
      for (let x = gx; x <= gx + gw; x += 4) {
        const nx = (x - (gx + gw / 2)) / (gw / 2);
        const vy = Math.cos(nx * Math.PI * 0.9) * vortex;
        const wave = Math.sin((x * 0.2) + this.time * (s.stirSpeed / 40)) * 3;
        ctx.lineTo(x, liquidLevel + vy + wave);
      }
      ctx.lineTo(gx + gw, gy + gh);
      ctx.closePath();
      ctx.fill();

      // シャフト＆プロペラ
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(tx + 48, gy, 4, gh - 15);
      const pAngle = this.time * (s.stirSpeed / 25);
      const bladeW = Math.cos(pAngle) * 22;
      ctx.beginPath();
      ctx.ellipse(tx + 50, gy + gh - 18, Math.abs(bladeW), 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 泡立ちアニメーション
      if (p.id === 'shampoo' && s.stirSpeed > 100) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.foamBubbles.forEach(b => {
          b.y -= b.vy * 0.8;
          if (b.y < liquidLevel + 5) b.y = gy + gh - 8;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.restore();
    }

    // デジタル温度＆回転数
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(tx + tw + 10, ty + 35, 52, 40);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(tx + tw + 10, ty + 35, 52, 40);
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 9.5px monospace';
    ctx.fillText(`♨ ${s.temp.toFixed(0)}℃`, tx + tw + 14, ty + 50);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`${Math.round(s.stirSpeed)}rpm`, tx + tw + 14, ty + 66);

    ctx.restore();
  }

  drawStage3Filtration(ctx, engine, p) {
    ctx.save();
    const s = engine.stages.filtration;
    const fx = 530, fy = 250, fw = 40, fh = 100;

    const fGrad = ctx.createLinearGradient(fx, 0, fx + fw, 0);
    fGrad.addColorStop(0, '#94a3b8');
    fGrad.addColorStop(0.5, '#f1f5f9');
    fGrad.addColorStop(1, '#64748b');

    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 10);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.stroke();

    // 内部メッシュ
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let y = fy + 15; y < fy + fh - 15; y += 8) {
      ctx.beginPath();
      ctx.moveTo(fx + 6, y);
      ctx.lineTo(fx + fw - 6, y);
      ctx.stroke();
    }

    // なめらか仕上げバッジ
    const bx = fx + 48, by = fy + 20;
    ctx.fillStyle = s.smoothness >= 90 ? 'rgba(16, 185, 129, 0.9)' : 'rgba(51, 65, 85, 0.9)';
    ctx.beginPath();
    ctx.roundRect(bx, by, 85, 30, 6);
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9.5px "Noto Sans JP", sans-serif';
    ctx.fillText(s.smoothness >= 90 ? '✨ ツヤツヤ仕上がり' : '🌀 ろ過中...', bx + 6, by + 18);

    ctx.restore();
  }

  drawStage4Bottling(ctx, engine, p) {
    ctx.save();
    const s = engine.stages.bottling;
    const ix = 745, iy = 150, iw = 200, ih = 280;

    // クリーンキャビネット
    ctx.fillStyle = 'rgba(14, 165, 233, 0.06)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, 8);
    ctx.fill();
    ctx.stroke();

    // 充填ノズル
    const nx = ix + 85, ny = iy + 60;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(nx, ny, 30, 10);
    ctx.fillStyle = '#cbd5e1';
    const nozzleY = ny + 10 + (s.status === 'RUNNING' ? Math.sin(this.time * 8) * 4 : 0);
    ctx.fillRect(nx + 13, nozzleY, 4, 30);

    // 液滴
    if (s.status === 'RUNNING' && Math.sin(this.time * 8) > 0.2) {
      ctx.fillStyle = p.baseColor;
      ctx.fillRect(nx + 14, nozzleY + 30, 2, 25);
    }

    // 搬送コンベア
    const cy = iy + 175;
    ctx.fillStyle = '#334155';
    ctx.fillRect(ix + 15, cy, iw - 30, 12);

    // ボトル列
    for (let i = 0; i < 5; i++) {
      const offset = (this.time * 15) % 30;
      const vx = ix + 25 + i * 32 + (s.status === 'RUNNING' ? offset : 0);
      if (vx < ix + iw - 35) {
        this.drawCosmeticBottle(ctx, vx, cy - 35, p, i >= 2);
      }
    }

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(ix + 40, iy + ih - 35, 120, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9.5px "Noto Sans JP", sans-serif';
    ctx.fillText(`充填完了: ${Math.floor(s.unitsFilled)} / ${s.targetUnits} 本`, ix + 50, iy + ih - 20);

    ctx.restore();
  }

  drawCosmeticBottle(ctx, x, y, p, isFilled) {
    ctx.save();
    // ポンプ/キャップ
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 6, y, 6, 8);
    ctx.fillRect(x + 3, y + 8, 12, 4);

    // ボトル本体
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y + 12, 18, 26, 3);
    ctx.fill();
    ctx.stroke();

    // 充填液
    if (isFilled) {
      ctx.fillStyle = p.baseColor;
      ctx.fillRect(x + 1, y + 18, 16, 19);
    }

    ctx.restore();
  }

  drawStage5Packaging(ctx, engine, p) {
    ctx.save();
    const s = engine.stages.packaging;
    const kx = 980, ky = 160, kw = 180, kh = 260;

    // ギフトボックス作業台
    const cy = ky + 155;
    ctx.fillStyle = '#334155';
    ctx.fillRect(kx + 5, cy, 170, 10);

    // お洒落なギフトボックス
    const bx = kx + 35, by = ky + 70;
    ctx.fillStyle = '#fce7f3';
    ctx.fillRect(bx, by, 110, 80);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, 110, 80);

    // リボン
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(bx + 48, by, 14, 80);
    ctx.fillRect(bx, by + 33, 110, 14);

    // 箱の中の完成コスメ
    if (s.progress > 0) {
      this.drawCosmeticBottle(ctx, bx + 15, by + 25, p, true);
      this.drawCosmeticBottle(ctx, bx + 75, by + 25, p, true);
    }

    // 完成ラベル
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('🎁 ギフトBOX完成！', bx + 6, by + 105);

    ctx.restore();
  }

  drawBottomBanner(ctx, w, h, p) {
    ctx.save();
    const bx = w / 2 - 320, by = h - 45, bw = 640, bh = 34;

    const bannerGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bannerGrad.addColorStop(0, '#0284c7');
    bannerGrad.addColorStop(0.5, '#4f46e5');
    bannerGrad.addColorStop(1, '#db2777');

    ctx.fillStyle = bannerGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 17);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12.5px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ 科学の力でつくる！[${p.name}] メイキング中`, w / 2, by + 21);

    ctx.restore();
  }
}

window.FormulationVisualizer = FormulationVisualizer;
