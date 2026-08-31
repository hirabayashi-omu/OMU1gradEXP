/**
 * Three-Way Catalyst Visualizer
 * システム全体動的機構アニメーション（吸気・エンジン・EGR・O2センサ・触媒・ECU）
 * および 触媒浄化ウインドウ特性グラフ＆オシロスコープ描画
 */

class CatalystVisualizer {
  constructor(canvasId, engine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.engine = engine;

    // 分子パーティクルリスト
    this.particles = [];
    this.maxParticles = 140;

    // アニメーション用位相
    this.enginePhase = 0.0;
    this.pulsePhase = 0.0;

    // グラフ表示モード ('af_window' または 'temp_lightoff')
    this.graphMode = 'af_window';
    this.tab1Rect = null;
    this.tab2Rect = null;

    this.initParticles();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.canvas.addEventListener('click', e => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      if (this.tab1Rect && clickX >= this.tab1Rect.x && clickX <= this.tab1Rect.x + this.tab1Rect.w &&
          clickY >= this.tab1Rect.y && clickY <= this.tab1Rect.y + this.tab1Rect.h) {
        this.graphMode = 'af_window';
      } else if (this.tab2Rect && clickX >= this.tab2Rect.x && clickX <= this.tab2Rect.x + this.tab2Rect.w &&
                 clickY >= this.tab2Rect.y && clickY <= this.tab2Rect.y + this.tab2Rect.h) {
        this.graphMode = 'temp_lightoff';
      }
    });
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createParticle(Math.random()));
    }
  }

  createParticle(initialProgress = 0.0) {
    // 排ガス種別: 'co', 'hc', 'nox'
    const rand = Math.random();
    let type = 'nox';
    if (rand < 0.35) type = 'co';
    else if (rand < 0.65) type = 'hc';

    return {
      progress: initialProgress, // 0.0 (エンジン排気弁) -> 0.5 (触媒入口) -> 1.0 (マフラー出口)
      type: type,
      converted: false,
      yOffset: (Math.random() - 0.5) * 22,
      speed: 0.18 + Math.random() * 0.08
    };
  }

  // ─── メイン描画ループ ───
  render(dt) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 背景ダークグラデーション
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#060a12');
    bgGrad.addColorStop(1, '#0c1322');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    this.enginePhase += (this.engine.engineRpm / 60.0) * dt * Math.PI * 2;
    this.pulsePhase += dt * 8.0;

    // 1. 上半分: 三元触媒システム全体構造図 (ユーザー資料2枚目完全準拠)
    this.drawSystemDiagram(ctx, w, h * 0.58, dt);

    // 2. 下半分: 触媒浄化ウインドウ特性グラフ (ユーザー資料1枚目完全準拠) ＆ オシロスコープ
    this.drawCharacteristicsGraph(ctx, 20, h * 0.60, (w - 50) * 0.52, h * 0.37);
    this.drawOscilloscope(ctx, 30 + (w - 50) * 0.52, h * 0.60, (w - 50) * 0.48, h * 0.37);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. システム全体構造図（吸気・エンジン・EGR・O2センサ・触媒・ECU）
  // ══════════════════════════════════════════════════════════════════════════
  drawSystemDiagram(ctx, totalW, totalH, dt) {
    ctx.save();

    // タイトルバナー
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('〈 三元触媒方式 排ガス浄化システム全体構成 〉', 25, 24);

    const startX = 25;
    const startY = 55;

    // ─── A. 吸気系 (エアフロ・スロットル・インジェクター・吸気ポート) ───
    const airX = startX + 10;
    const airY = startY + 28;
    const cylX = airX + 260;
    const cylY = startY + 70;
    const cylW = 86;
    const cylH = 100;
    const valveInX = cylX + 18;
    const valveExX = cylX + cylW - 18;

    // 吸気管 (空気入口からシリンダー左肩の吸気バルブへ完全に接続)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // 上壁
    ctx.moveTo(airX, airY - 18);
    ctx.lineTo(cylX - 50, airY - 18);
    ctx.quadraticCurveTo(cylX - 10, airY - 18, valveInX + 12, cylY);
    // バルブ開口部下側へ
    ctx.lineTo(valveInX - 14, cylY);
    // 下壁
    ctx.quadraticCurveTo(cylX - 25, airY + 18, cylX - 60, airY + 18);
    ctx.lineTo(airX, airY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 空気流入矢印
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('空気 ⇒', airX + 4, airY + 4);

    // エアフローマスター
    const mafX = airX + 65;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillRect(mafX - 10, airY - 24, 20, 48);
    ctx.strokeRect(mafX - 10, airY - 24, 20, 48);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('エアフロー', mafX, airY + 38);
    ctx.fillText('メータ', mafX, airY + 48);

    // スロットルバルブ
    const throtX = airX + 130;
    const throtAngle = (this.engine.throttleOpen / 100.0) * (Math.PI / 2.5);
    ctx.save();
    ctx.translate(throtX, airY);
    ctx.rotate(throtAngle);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 16);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('スロットル', throtX, airY + 38);

    // インジェクター (吸気ポート上部に設置、吸気バルブへ向けて噴射)
    const injX = cylX - 35;
    const injY = airY - 14;
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(injX, injY);
    ctx.rotate(Math.PI / 4.5); // 斜め下向き
    ctx.fillRect(-7, -18, 14, 26);
    ctx.strokeRect(-7, -18, 14, 26);
    ctx.restore();

    // 燃料供給ライン
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(injX - 45, injY - 15);
    ctx.lineTo(injX - 4, injY - 15);
    ctx.stroke();
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('燃料 ⇨', injX - 25, injY - 21);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('インジェクタ', injX + 2, injY + 28);

    // 燃料噴射スプレー（パルス噴射アニメーション: 吸気バルブに向かって霧化）
    const isInjecting = Math.sin(this.enginePhase * 0.5) > -0.2;
    if (isInjecting) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.45)';
      ctx.beginPath();
      ctx.moveTo(injX + 2, injY + 8);
      ctx.lineTo(valveInX - 10, cylY);
      ctx.lineTo(valveInX + 8, cylY);
      ctx.closePath();
      ctx.fill();
    }

    // ─── B. エンジン本体（シリンダー＆ピストン＆点火燃焼） ───
    // シリンダーブロック外枠
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.fillRect(cylX, cylY, cylW, cylH);
    ctx.strokeRect(cylX, cylY, cylW, cylH);

    // ピストン往復位置計算
    const pistonStroke = 24;
    const pistonOffset = Math.cos(this.enginePhase) * pistonStroke;
    const pistonY = cylY + 40 + pistonOffset;

    // 燃焼室（上部火炎エフェクト）
    const isCombustion = Math.sin(this.enginePhase) > 0.4;
    if (isCombustion) {
      const flameGrad = ctx.createRadialGradient(cylX + cylW / 2, cylY + 15, 5, cylX + cylW / 2, cylY + 25, 35);
      flameGrad.addColorStop(0, '#ffedd5');
      flameGrad.addColorStop(0.3, '#f97316');
      flameGrad.addColorStop(0.8, '#ef4444');
      flameGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGrad;
      ctx.fillRect(cylX + 5, cylY + 5, cylW - 10, pistonY - cylY - 5);
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(cylX + 5, cylY + 5, cylW - 10, pistonY - cylY - 5);
    }

    // ピストンヘッド
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.fillRect(cylX + 5, pistonY, cylW - 10, 26);
    ctx.strokeRect(cylX + 5, pistonY, cylW - 10, 26);
    // ピストンリング溝
    ctx.fillStyle = '#334155';
    ctx.fillRect(cylX + 5, pistonY + 5, cylW - 10, 2);
    ctx.fillRect(cylX + 5, pistonY + 10, cylW - 10, 2);

    // コネクティングロッド
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cylX + cylW / 2, pistonY + 16);
    ctx.lineTo(cylX + cylW / 2 + Math.sin(this.enginePhase) * 14, cylY + cylH - 6);
    ctx.stroke();

    // 吸気バルブ・排気バルブ
    const inValveOpen = Math.sin(this.enginePhase) < -0.3;
    const exValveOpen = Math.sin(this.enginePhase) > 0.3;

    // 吸気弁 (左)
    ctx.strokeStyle = inValveOpen ? '#38bdf8' : '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(valveInX, cylY - 14 + (inValveOpen ? 6 : 0));
    ctx.lineTo(valveInX, cylY + 4 + (inValveOpen ? 6 : 0));
    ctx.stroke();

    // 排気弁 (右)
    ctx.strokeStyle = exValveOpen ? '#f43f5e' : '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(valveExX, cylY - 14 + (exValveOpen ? 6 : 0));
    ctx.lineTo(valveExX, cylY + 4 + (exValveOpen ? 6 : 0));
    ctx.stroke();

    // ─── C. 排気マニホールド＆EGRシステム ───
    const exhStartX = cylX + cylW;
    const exhStartY = startY + 28;
    const o2X = exhStartX + 55;
    const catX = exhStartX + 135;
    const catW = 160;
    const catH = 65;

    // 排気管 (排気バルブ開口部から触媒へ完全に接続)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // 下壁: 排気バルブ右端から触媒下部へ
    ctx.moveTo(valveExX + 12, cylY);
    ctx.quadraticCurveTo(cylX + cylW + 15, cylY, catX, exhStartY + 36);
    ctx.lineTo(catX + 20, exhStartY + 50);
    ctx.lineTo(catX + catW - 20, exhStartY + 50);
    ctx.lineTo(catX + catW, exhStartY + 36);
    ctx.lineTo(totalW - 25, exhStartY + 36);
    // 右端
    ctx.lineTo(totalW - 25, exhStartY - 18);
    // 上壁: 触媒上部から排気バルブ左端へ
    ctx.lineTo(catX + catW, exhStartY - 18);
    ctx.lineTo(catX + catW - 20, exhStartY - 28);
    ctx.lineTo(catX + 20, exhStartY - 28);
    ctx.lineTo(catX, exhStartY - 18);
    ctx.quadraticCurveTo(cylX + cylW - 5, exhStartY - 18, valveExX - 12, cylY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 排気ガス出口矢印
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('クリーン排気 ⇒', totalW - 32, exhStartY + 22);

    // EGR配管（排気から吸気へ戻るループ管）
    const egrPipeColor = this.engine.egrRate > 0 ? 'rgba(245, 158, 11, 0.75)' : 'rgba(100, 116, 139, 0.4)';
    ctx.strokeStyle = egrPipeColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(exhStartX + 25, exhStartY - 5);
    ctx.lineTo(exhStartX + 25, startY - 20);
    ctx.lineTo(airX + 90, startY - 20);
    ctx.lineTo(airX + 90, airY - 20);
    ctx.stroke();

    // EGRバルブ＆最適化されたラベル枠
    const egrMidX = (airX + 90 + exhStartX + 25) / 2;
    const egrBoxW = 125;
    const egrBoxH = 22;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.fillRect(egrMidX - egrBoxW / 2, startY - 31, egrBoxW, egrBoxH);
    ctx.strokeRect(egrMidX - egrBoxW / 2, startY - 31, egrBoxW, egrBoxH);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`EGRシステム (${this.engine.egrRate.toFixed(0)}%)`, egrMidX, startY - 17);

    // ─── D. ジルコニアO2センサ ───
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(o2X - 10, exhStartY - 38, 20, 38);
    ctx.strokeRect(o2X - 10, exhStartY - 38, 20, 38);

    // センサ先端（排気中）
    const o2Volt = this.engine.o2SensorVoltage;
    const isRich = o2Volt > 0.50;
    ctx.fillStyle = isRich ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(o2X, exhStartY + 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('O₂センサ', o2X, exhStartY - 44);
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = isRich ? '#f87171' : '#60a5fa';
    ctx.fillText(`${o2Volt.toFixed(2)}V`, o2X, exhStartY - 24);

    // ─── E. 三元触媒コンバーター（Three-Way Catalyst） ───
    // コンバータ外殻
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.fillRect(catX + 20, exhStartY - 14, catW - 40, catH);
    ctx.strokeRect(catX + 20, exhStartY - 14, catW - 40, catH);

    // 触媒ハニカムセル（モノリス担体）のグリッドパターン
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    for (let x = catX + 25; x < catX + catW - 25; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, exhStartY - 12);
      ctx.lineTo(x, exhStartY + catH - 16);
      ctx.stroke();
    }

    // 触媒床温度ヒートグラデーション
    const tempRatio = Math.min(1.0, Math.max(0.0, (this.engine.catalystTemp - 100) / 500.0));
    const catGlowGrad = ctx.createLinearGradient(catX + 20, 0, catX + catW - 20, 0);
    catGlowGrad.addColorStop(0, `rgba(239, 68, 68, ${0.15 + tempRatio * 0.4})`);
    catGlowGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.2 + tempRatio * 0.45})`);
    catGlowGrad.addColorStop(1, `rgba(16, 185, 129, ${0.2 + tempRatio * 0.45})`);
    ctx.fillStyle = catGlowGrad;
    ctx.fillRect(catX + 20, exhStartY - 14, catW - 40, catH);

    // 触媒ラベル＆化学反応式
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('三元触媒コンバータ', catX + catW / 2, exhStartY - 22);

    // 入口生ガス (CO, HC, NOx) -> 出口クリーンガス (CO2, H2O, N2)
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('CO', catX + 40, exhStartY + 8);
    ctx.fillText('HC', catX + 40, exhStartY + 20);
    ctx.fillText('NOx', catX + 40, exhStartY + 32);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('➔', catX + catW / 2, exhStartY + 20);

    ctx.fillStyle = '#86efac';
    ctx.fillText('CO₂', catX + catW - 40, exhStartY + 8);
    ctx.fillText('H₂O', catX + catW - 40, exhStartY + 20);
    ctx.fillText('N₂', catX + catW - 40, exhStartY + 32);

    // ─── F. 排ガス分子パーティクル更新＆描画 ───
    this.updateAndDrawParticles(ctx, cylX + cylW, exhStartY + 18, catX, catW, totalW - 25, dt);

    // ─── G. EFIコンピュータ（ECU）配線＆制御ユニット（シリンダー真下・干渉ゼロ） ───
    const ecuX = cylX - 12;
    const ecuY = cylY + cylH + 14;
    const ecuW = 110;
    const ecuH = 50;

    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(ecuX, ecuY, ecuW, ecuH);
    ctx.strokeRect(ecuX, ecuY, ecuW, ecuH);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px "JetBrains Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EFI (ECU)', ecuX + ecuW / 2, ecuY + 18);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('空燃比フィードバック', ecuX + ecuW / 2, ecuY + 31);
    ctx.fillText(`Trim: ${this.engine.fuelTrim >= 0 ? '+' : ''}${this.engine.fuelTrim.toFixed(1)}%`, ecuX + ecuW / 2, ecuY + 43);

    // ECU配線ライン (エアフロ -> ECU, O2センサ -> ECU, ECU -> インジェクター)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    // 1. O2センサ -> ECU (O2センサの下端からまっすぐ降りてECU右側にピッタリ接続)
    ctx.beginPath();
    ctx.moveTo(o2X, exhStartY + 36);
    ctx.lineTo(o2X, ecuY + 25);
    ctx.lineTo(ecuX + ecuW, ecuY + 25);
    ctx.stroke();

    // 2. エアフローマスター -> ECU
    ctx.beginPath();
    ctx.moveTo(mafX, airY + 25);
    ctx.lineTo(mafX, ecuY + 15);
    ctx.lineTo(ecuX, ecuY + 15);
    ctx.stroke();

    // 3. ECU -> インジェクター
    ctx.beginPath();
    ctx.moveTo(ecuX + 20, ecuY);
    ctx.lineTo(ecuX + 20, injY + 25);
    ctx.lineTo(injX, injY + 25);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // ─── 分子パーティクルの移動と触媒反応の描画 ───
  updateAndDrawParticles(ctx, startX, startY, catX, catW, endX, dt) {
    const totalDist = endX - startX;
    const catEntryProgress = (catX - startX) / totalDist;
    const catExitProgress = (catX + catW - startX) / totalDist;

    this.particles.forEach(p => {
      p.progress += (this.engine.airFlowRate / 15.0) * p.speed * dt * 0.8;
      if (p.progress > 1.0) {
        p.progress = 0.0;
        p.converted = false;
      }

      const curX = startX + p.progress * totalDist;
      const curY = startY + p.yOffset;

      // 触媒通過時に浄化率に応じてクリーンガスへ変換
      if (p.progress >= catEntryProgress && p.progress <= catExitProgress) {
        if (!p.converted) {
          const purifChance = this.engine.purificationRates[p.type] / 100.0;
          if (Math.random() < purifChance) {
            p.converted = true;
          }
        }
      }

      ctx.beginPath();
      if (!p.converted) {
        // 未浄化排ガス
        if (p.type === 'co') ctx.fillStyle = '#f59e0b';
        else if (p.type === 'hc') ctx.fillStyle = '#e11d48';
        else ctx.fillStyle = '#a855f7';
        ctx.arc(curX, curY, 3.5, 0, Math.PI * 2);
      } else {
        // 浄化後クリーン分子 (CO2, H2O, N2)
        ctx.fillStyle = '#34d399';
        ctx.arc(curX, curY, 2.8, 0, Math.PI * 2);
      }
      ctx.fill();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. 触媒浄化ウインドウ特性グラフ ＆ 触媒温度活性（ライトオフ）特性グラフ
  // ══════════════════════════════════════════════════════════════════════════
  drawCharacteristicsGraph(ctx, x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);

    // カード背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeRect(0, 0, w, h);

    // グラフ切替タブ (1: A/Fウインドウ, 2: 触媒温度活性)
    const tab1W = 145;
    const tab2W = 145;
    const tabH = 22;
    const tabY = 8;

    // タブ1: A/Fウインドウ特性
    const isTab1 = this.graphMode === 'af_window';
    ctx.fillStyle = isTab1 ? '#0284c7' : 'rgba(30, 41, 59, 0.8)';
    ctx.strokeStyle = isTab1 ? '#38bdf8' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.fillRect(10, tabY, tab1W, tabH);
    ctx.strokeRect(10, tabY, tab1W, tabH);
    ctx.fillStyle = isTab1 ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📊 A/F浄化ウインドウ', 10 + tab1W / 2, tabY + 15);

    // タブ2: 触媒温度活性特性 (資料図3)
    const isTab2 = this.graphMode === 'temp_lightoff';
    ctx.fillStyle = isTab2 ? '#dc2626' : 'rgba(30, 41, 59, 0.8)';
    ctx.strokeStyle = isTab2 ? '#f87171' : '#475569';
    ctx.fillRect(15 + tab1W, tabY, tab2W, tabH);
    ctx.strokeRect(15 + tab1W, tabY, tab2W, tabH);
    ctx.fillStyle = isTab2 ? '#ffffff' : '#94a3b8';
    ctx.fillText('🌡️ 触媒温度 vs 浄化率', 15 + tab1W + tab2W / 2, tabY + 15);

    // クリック判定領域を保持
    this.tab1Rect = { x: x + 10, y: y + tabY, w: tab1W, h: tabH };
    this.tab2Rect = { x: x + 15 + tab1W, y: y + tabY, w: tab2W, h: tabH };

    if (this.graphMode === 'temp_lightoff') {
      this.drawTemperatureLightOffGraph(ctx, w, h);
    } else {
      this.drawAFWindowGraph(ctx, w, h);
    }

    ctx.restore();
  }

  // ─── A. A/F浄化ウインドウ特性グラフ (資料図1) ───
  drawAFWindowGraph(ctx, w, h) {
    const padL = 45;
    const padR = 45;
    const padT = 38;
    const padB = 30;
    const gw = w - padL - padR;
    const gh = h - padT - padB;

    const afMin = 12.0;
    const afMax = 17.5;
    const stoichAF = 14.70;

    const getX = af => padL + ((af - afMin) / (afMax - afMin)) * gw;
    const getY_Purif = rate => padT + (1.0 - rate / 100.0) * gh;
    const getY_Volt = v => padT + (1.0 - v / 1.0) * gh;

    // ─── ウインドウ領域のハッチング (A/F 14.6 〜 14.8) ───
    const winX1 = getX(14.55);
    const winX2 = getX(14.85);
    const winW = winX2 - winX1;

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(winX1, padT, winW, gh);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX1, padT, winW, gh);

    // ハッチング線
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    for (let hx = winX1; hx < winX2 + gh; hx += 8) {
      ctx.beginPath();
      ctx.moveTo(hx, padT + gh);
      ctx.lineTo(hx - gh, padT);
      ctx.stroke();
    }

    // ウインドウタグ
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ウインドウ', (winX1 + winX2) / 2, padT - 4);

    // ─── 軸線＆目盛 ───
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + gh);
    ctx.lineTo(padL + gw, padT + gh);
    ctx.lineTo(padL + gw, padT);
    ctx.stroke();

    // X軸目盛
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    [13, 14, 15, 16, 17].forEach(af => {
      const ax = getX(af);
      ctx.beginPath();
      ctx.moveTo(ax, padT + gh);
      ctx.lineTo(ax, padT + gh + 4);
      ctx.stroke();
      ctx.fillText(af.toString(), ax, padT + gh + 14);
    });

    // 14.7 (理論空燃比) 強調
    const stoichX = getX(stoichAF);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('14.7 (理論空燃比)', stoichX, padT + gh + 25);
    ctx.strokeStyle = '#10b981';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(stoichX, padT);
    ctx.lineTo(stoichX, padT + gh);
    ctx.stroke();
    ctx.setLineDash([]);

    // 左Y軸ラベル（触媒浄化率 %）
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    [0, 50, 100].forEach(p => {
      const py = getY_Purif(p);
      ctx.fillText(`${p}%`, padL - 6, py + 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + gw, py);
      ctx.stroke();
    });

    // 右Y軸ラベル（O2センサ出力電圧 V）
    ctx.textAlign = 'left';
    [0.0, 0.5, 1.0].forEach(v => {
      const vy = getY_Volt(v);
      ctx.fillText(`${v.toFixed(1)}V`, padL + gw + 6, vy + 3);
    });

    // ─── 現在の触媒温度活性ファクター ───
    const tempFactor = 1.0 / (1.0 + Math.exp(-(this.engine.catalystTemp - 300.0) / 32.0));

    // ─── 特性曲線の描画 ───
    const steps = 80;

    // ① CO 浄化率 (橙色・破線)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const af = afMin + (i / steps) * (afMax - afMin);
      let r = 0;
      if (af >= 14.7) r = (99.0 - Math.max(0, (af - 16.5) * 2.0)) * tempFactor;
      else r = 99.0 * Math.exp(-Math.pow((14.7 - af) / 1.3, 1.8)) * tempFactor;
      const px = getX(af);
      const py = getY_Purif(r);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ② HC 浄化率 (赤色・一点鎖線)
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 2, 2, 2]);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const af = afMin + (i / steps) * (afMax - afMin);
      let r = 0;
      if (af >= 14.7) r = (98.5 - Math.max(0, (af - 16.5) * 1.5)) * tempFactor;
      else r = 98.5 * Math.exp(-Math.pow((14.7 - af) / 1.6, 1.7)) * tempFactor;
      const px = getX(af);
      const py = getY_Purif(r);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ③ NOx 浄化率 (紫色・実線)
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const af = afMin + (i / steps) * (afMax - afMin);
      let r = 0;
      if (af <= 14.7) r = 99.2 * tempFactor;
      else r = 99.2 * Math.exp(-Math.pow((af - 14.7) / 0.75, 1.9)) * tempFactor;
      const px = getX(af);
      const py = getY_Purif(r);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ④ O2センサ出力電圧 (水色・破線)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const af = afMin + (i / steps) * (afMax - afMin);
      const lambda = af / 14.7;
      const v = 0.08 + 0.82 / (1.0 + Math.exp(-55.0 * (lambda - 1.0)));
      const px = getX(af);
      const py = getY_Volt(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 凡例
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f59e0b'; ctx.fillText('-- CO', padL + 10, padT + 14);
    ctx.fillStyle = '#f43f5e'; ctx.fillText('·- HC', padL + 55, padT + 14);
    ctx.fillStyle = '#a855f7'; ctx.fillText('— NOx', padL + 100, padT + 14);
    ctx.fillStyle = '#38bdf8'; ctx.fillText('·· O₂電圧', padL + 145, padT + 14);

    // 現在動作点プロット
    const curAF = this.engine.actualAF;
    const curX = getX(curAF);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(curX, padT);
    ctx.lineTo(curX, padT + gh);
    ctx.stroke();

    const drawPoint = (valY, color) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(curX, valY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    drawPoint(getY_Purif(this.engine.purificationRates.nox), '#a855f7');
    drawPoint(getY_Purif(this.engine.purificationRates.co), '#f59e0b');
    drawPoint(getY_Purif(this.engine.purificationRates.hc), '#f43f5e');
    drawPoint(getY_Volt(this.engine.o2SensorVoltage), '#38bdf8');
  }

  // ─── B. 触媒装置の温度活性（ライトオフ）特性グラフ (ユーザー添付画像3の完全再現) ───
  drawTemperatureLightOffGraph(ctx, w, h) {
    const padL = 50;
    const padR = 30;
    const padT = 38;
    const padB = 35;
    const gw = w - padL - padR;
    const gh = h - padT - padB;

    const tMin = 0;
    const tMax = 600;

    const getX = temp => padL + ((temp - tMin) / (tMax - tMin)) * gw;
    const getY = rate => padT + (1.0 - rate / 100.0) * gh;

    // グラフ枠内 クリーム色背景 (ユーザー資料再現)
    ctx.fillStyle = 'rgba(254, 243, 199, 0.12)';
    ctx.fillRect(padL, padT, gw, gh);

    // 軸線
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(padL, padT, gw, gh);

    // グリッド線 (50%, 100%, 300℃)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    [0, 50, 100].forEach(p => {
      const py = getY(p);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + gw, py);
      ctx.stroke();
    });

    // 300℃ ライトオフ点線
    const t300X = getX(300);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(t300X, padT);
    ctx.lineTo(t300X, padT + gh);
    ctx.stroke();
    ctx.setLineDash([]);

    // X軸目盛: 0℃, 300℃, 600℃
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0℃', getX(0), padT + gh + 16);
    ctx.fillText('300℃', t300X, padT + gh + 16);
    ctx.fillText('600℃', getX(600), padT + gh + 16);

    // X軸タイトル
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('触媒装置の温度', padL + gw / 2, padT + gh + 30);

    // Y軸目盛: 0, 50, 100
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('0', padL - 8, getY(0) + 4);
    ctx.fillText('50', padL - 8, getY(50) + 4);
    ctx.fillText('100', padL - 8, getY(100) + 4);

    // Y軸タイトル (縦書き回転)
    ctx.save();
    ctx.translate(14, padT + gh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('触媒装置の浄化率 (%)', 0, 0);
    ctx.restore();

    // ─── 温度活性S字曲線（赤色太線: ユーザー資料完全準拠） ───
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const temp = tMin + (i / steps) * (tMax - tMin);
      const rate = 100.0 / (1.0 + Math.exp(-(temp - 300.0) / 32.0));
      const px = getX(temp);
      const py = getY(rate);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ─── 現在温度マーカープロット ───
    const curTemp = this.engine.catalystTemp;
    const curTempRate = 100.0 / (1.0 + Math.exp(-(curTemp - 300.0) / 32.0));
    const curTX = getX(curTemp);
    const curTY = getY(curTempRate);

    // 現在温度の縦線
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(curTX, padT);
    ctx.lineTo(curTX, padT + gh);
    ctx.stroke();
    ctx.setLineDash([]);

    // マーカーポイント
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(curTX, curTY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // マーカータグ
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "JetBrains Mono", sans-serif';
    ctx.textAlign = curTX > padL + gw * 0.7 ? 'right' : 'left';
    ctx.fillText(`現在: ${curTemp.toFixed(0)}℃ (活性度: ${curTempRate.toFixed(1)}%)`, curTX + (curTX > padL + gw * 0.7 ? -10 : 10), curTY - 8);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. オシロスコープ（時間応答波形: A/F, O2電圧, 浄化率推移）
  // ══════════════════════════════════════════════════════════════════════════
  drawOscilloscope(ctx, x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);

    // カード背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeRect(0, 0, w, h);

    // タイトル
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('過渡応答オシロスコープ（λ制御・O₂センサ・浄化率）', 12, 18);

    const padL = 35;
    const padR = 20;
    const padT = 32;
    const padB = 25;
    const gw = w - padL - padR;
    const gh = h - padT - padB;

    // グリッド線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let gy = padT; gy <= padT + gh; gy += gh / 4) {
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + gw, gy);
      ctx.stroke();
    }

    const afHist = this.engine.afHistory;
    const o2Hist = this.engine.o2VoltHistory;
    const noxPurif = this.engine.noxPurifHistory;

    if (afHist.length > 2) {
      const len = afHist.length;

      // 1. O2センサ電圧波形 (水色) : 0〜1.0V
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const px = padL + (i / (this.engine.historyMaxLength - 1)) * gw;
        const py = padT + (1.0 - o2Hist[i] / 1.0) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 2. A/F波形 (緑色) : 13.5〜16.0
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const px = padL + (i / (this.engine.historyMaxLength - 1)) * gw;
        const normAF = (afHist[i] - 13.5) / (16.0 - 13.5);
        const py = padT + (1.0 - Math.max(0, Math.min(1, normAF))) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 3. NOx浄化率波形 (紫色) : 0〜100%
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const px = padL + (i / (this.engine.historyMaxLength - 1)) * gw;
        const py = padT + (1.0 - noxPurif[i] / 100.0) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 4. CO浄化率波形 (橙色破線) : 0〜100%
      const coPurif = this.engine.coPurifHistory;
      if (coPurif && coPurif.length > 2) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const px = padL + (i / (this.engine.historyMaxLength - 1)) * gw;
          const py = padT + (1.0 - (coPurif[i] || 0) / 100.0) * gh;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 凡例
    ctx.font = 'bold 8.5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8'; ctx.fillText('— O₂電圧', padL + 4, padT + 14);
    ctx.fillStyle = '#10b981'; ctx.fillText('— A/F', padL + 68, padT + 14);
    ctx.fillStyle = '#c084fc'; ctx.fillText('— NOx浄化', padL + 120, padT + 14);
    ctx.fillStyle = '#f59e0b'; ctx.fillText('-- CO浄化', padL + 185, padT + 14);

    ctx.restore();
  }
}
