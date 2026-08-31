/**
 * Suspension & Vibration Dynamics Front-View Orthographic Visualizer
 * サスペンション4大形式（ストラット／ダブルウィッシュボーン／マルチリンク／トーションビーム）
 * 資料図に完全一致する機構リンク幾何学の描き分け
 */

class SuspensionVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
    this.time = 0;
  }

  resize() {
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
  }

  draw(engine) {
    this.time += 0.03;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. クリーンなスタジオ背景
    this.drawStudioBackground(ctx, w, h);

    // 2. 正面視サスペンション機構 (形式別描き分け)
    this.drawFrontViewMechanism(ctx, engine);

    // 3. 右上: 粘弾性モデル（フォークト vs マックスウェル応力緩和）＆ オシロスコープ
    this.drawViscoRelaxationScope(ctx, engine);

    // 4. 右下: 周波数応答・共振線図 (Bode Plot)
    this.drawBodeAndWheelRatePlot(ctx, engine);

    // 5. 最下部: リアルタイム計測計器HUD
    this.drawDashboardHUD(ctx, engine);
  }

  // ─── 0. 背景描画 ───
  drawStudioBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.35, h * 0.4, 50, w * 0.35, h * 0.4, 700);
    bgGrad.addColorStop(0, '#0c1322');
    bgGrad.addColorStop(0.6, '#070b14');
    bgGrad.addColorStop(1, '#030509');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // ─── 1. 正面視サスペンション機構（4形式完全描き分け） ───
  drawFrontViewMechanism(ctx, engine) {
    ctx.save();

    const tireCenterX = 180;
    const groundBaseY = 445;
    const scale = 750;

    const zsPx = -engine.zs * scale;        // 車体変位
    const zuPx = -engine.zu * scale;        // タイヤ変位
    const zrPx = -engine.currentZr * scale; // 路面変位

    // 路面（奥から手前へ迫るパースペクティブ路面）
    this.drawFrontViewRoad(ctx, engine, tireCenterX, groundBaseY, scale);

    const bodyBaseY = 160 + zsPx;
    const subframeX = 360;
    const wheelCenterY = groundBaseY - 120 + zuPx;
    const camber = ((zuPx - zsPx) / 400) * -0.08;

    const isVoigt = (engine.modelType === 'voigt');
    const suspType = engine.currentSuspensionTypeId || 'double_wishbone';

    // 形式別の描画ルーチン
    if (suspType === 'strut') {
      // 🚗 ① 【ストラット式】: アッパーアームなし、ストラットがナックルに剛結固定＋下部ロアアーム
      this.drawMacPhersonStrutMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt);
    } else if (suspType === 'multilink') {
      // 🏎️ ③ 【マルチリンク式】: アッパーアーム＋アシストリンク、ロアアーム＋トレーリングアーム（独立5本リンク）
      this.drawMultiLinkMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt);
    } else if (suspType === 'torsion_beam') {
      // 🚙 ④ 【トーションビーム式】: トレーリングアーム＋横方向トーションビーム＋直立スプリング
      this.drawTorsionBeamMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt);
    } else {
      // 🏎️ ② 【ダブルウィッシュボーン式】: 上下2股A型アーム（アッパーアーム＋ロアアーム）＋スイベルハブ
      this.drawDoubleWishboneMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt);
    }

    ctx.restore();
  }

  // ─── 🚗 ① ストラット式（マクファーソンストラット） ───
  // 特徴: アッパーアームなし！ ナックル上部にショック＋スプリングが剛結固定。下部に2股ロアアーム。
  drawMacPhersonStrutMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt) {
    const lowerPivot1X = subframeX + 90;
    const lowerPivot1Y = bodyBaseY + 160;
    const lowerPivot2X = subframeX + 135;
    const lowerPivot2Y = bodyBaseY + 185;

    const hubCenterX = tireCenterX + 55;
    const hubLowerX = hubCenterX + 8;
    const hubLowerY = wheelCenterY + 45;

    // ストラット下端（ナックル剛結ブラケット）
    const strutBotX = hubCenterX + 12;
    const strutBotY = wheelCenterY - 25;

    // 車体ストラットタワー（アッパーマウント）
    const shockTopX = strutBotX + 15;
    const shockTopY = bodyBaseY - 50;

    // 車体フレーム
    this.drawChassisSubframeFront(ctx, subframeX, bodyBaseY, lowerPivot1X - 30, lowerPivot1Y - 40, lowerPivot2X, lowerPivot2Y, shockTopX, shockTopY, 'ストラット式');

    // 2股ロアアーム（資料図の2本に分かれたロアアーム）
    this.drawSuspensionArmBlue(ctx, hubLowerX, hubLowerY, lowerPivot1X, lowerPivot1Y, 8);
    this.drawSuspensionArmBlue(ctx, hubLowerX + 10, hubLowerY + 5, lowerPivot2X, lowerPivot2Y, 8);

    // ばね・ダンパー（ストラット）
    if (isVoigt) {
      this.drawFrontParallelCoilover(ctx, shockTopX, shockTopY, strutBotX, strutBotY);
    } else {
      this.drawFrontSeriesSpringDamper(ctx, shockTopX, shockTopY, strutBotX, strutBotY, engine);
    }

    // ナックル剛体（ハブとストラット下端を強固に直結する鋳造ナックル）
    this.drawStrutKnuckleBracket(ctx, strutBotX, strutBotY, hubCenterX, wheelCenterY, hubLowerX, hubLowerY);

    // タイヤ ＆ ピン
    this.drawFrontViewTire(ctx, tireCenterX, wheelCenterY, groundBaseY + zrPx, camber);
    this.drawMountPin(ctx, strutBotX, strutBotY, isVoigt);
  }

  // ─── 🏎️ ② ダブルウィッシュボーン式 ───
  // 特徴: 上下に2股のA型アーム（アッパーアーム ＆ ロアアーム）。スプリング・ダンパーはアームを支持。
  drawDoubleWishboneMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt) {
    const upPiv1X = subframeX + 80;
    const upPiv1Y = bodyBaseY + 105;
    const upPiv2X = subframeX + 115;
    const upPiv2Y = bodyBaseY + 125;

    const lowPiv1X = subframeX + 110;
    const lowPiv1Y = bodyBaseY + 165;
    const lowPiv2X = subframeX + 145;
    const lowPiv2Y = bodyBaseY + 185;

    const hubCenterX = tireCenterX + 55;
    const hubUpperX = hubCenterX + Math.sin(camber) * -45;
    const hubUpperY = wheelCenterY - 45 * Math.cos(camber);
    const hubLowerX = hubCenterX + Math.sin(camber) * 45;
    const hubLowerY = wheelCenterY + 45 * Math.cos(camber);

    const rL = engine.leverRatio;
    const mountA_X = upPiv1X + (hubUpperX - upPiv1X) * rL;
    const mountA_Y = upPiv1Y + (hubUpperY - upPiv1Y) * rL;
    const shockTopX = mountA_X;
    const shockTopY = bodyBaseY - 50;

    // 車体フレーム
    this.drawChassisSubframeFront(ctx, subframeX, bodyBaseY, upPiv1X, upPiv1Y, lowPiv2X, lowPiv2Y, shockTopX, shockTopY, 'ダブルウィッシュボーン式');

    // 2股アッパーアーム
    this.drawSuspensionArmBlue(ctx, hubUpperX, hubUpperY, upPiv1X, upPiv1Y, 7);
    this.drawSuspensionArmBlue(ctx, hubUpperX + 8, hubUpperY + 4, upPiv2X, upPiv2Y, 7);

    // 2股ロアアーム
    this.drawSuspensionArmBlue(ctx, hubLowerX, hubLowerY, lowPiv1X, lowPiv1Y, 8);
    this.drawSuspensionArmBlue(ctx, hubLowerX + 10, hubLowerY + 5, lowPiv2X, lowPiv2Y, 8);

    // ばね・ダンパー
    if (isVoigt) {
      this.drawFrontParallelCoilover(ctx, shockTopX, shockTopY, mountA_X, mountA_Y);
    } else {
      this.drawFrontSeriesSpringDamper(ctx, shockTopX, shockTopY, mountA_X, mountA_Y, engine);
    }

    // スイベルハブ（C字型ナックル）＆ タイヤ
    this.drawSwivelHub(ctx, hubUpperX, hubUpperY, hubLowerX, hubLowerY, hubCenterX, wheelCenterY, camber);
    this.drawFrontViewTire(ctx, tireCenterX, wheelCenterY, groundBaseY + zrPx, camber);
    this.drawMountPin(ctx, mountA_X, mountA_Y, isVoigt);
  }

  // ─── 🏎️ ③ マルチリンク式 ───
  // 特徴: 上部にアッパーアーム＋アシストリンク、下部にロアアーム＋トレーリングアーム（独立5本リンク配置）
  drawMultiLinkMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt) {
    const upArmPivX = subframeX + 75;
    const upArmPivY = bodyBaseY + 95;

    const assistPivX = subframeX + 115;
    const assistPivY = bodyBaseY + 115;

    const lowArmPivX = subframeX + 100;
    const lowArmPivY = bodyBaseY + 160;

    const trailingPivX = subframeX + 145;
    const trailingPivY = bodyBaseY + 185;

    const hubCenterX = tireCenterX + 55;
    const hubUpperX = hubCenterX + Math.sin(camber) * -45;
    const hubUpperY = wheelCenterY - 45 * Math.cos(camber);
    const hubLowerX = hubCenterX + Math.sin(camber) * 45;
    const hubLowerY = wheelCenterY + 45 * Math.cos(camber);

    const rL = engine.leverRatio;
    const mountA_X = upArmPivX + (hubUpperX - upArmPivX) * rL;
    const mountA_Y = upArmPivY + (hubUpperY - upArmPivY) * rL;
    const shockTopX = mountA_X;
    const shockTopY = bodyBaseY - 50;

    // 車体フレーム
    this.drawChassisSubframeFront(ctx, subframeX, bodyBaseY, upArmPivX, upArmPivY, trailingPivX, trailingPivY, shockTopX, shockTopY, 'マルチリンク式');

    // 1. アッパーアーム
    this.drawSuspensionArmBlue(ctx, hubUpperX, hubUpperY - 8, upArmPivX, upArmPivY, 6.5);
    // 2. アシストリンク
    this.drawSuspensionArmBlue(ctx, hubUpperX + 12, hubUpperY + 8, assistPivX, assistPivY, 6.5);
    // 3. ロアアーム
    this.drawSuspensionArmBlue(ctx, hubLowerX, hubLowerY - 6, lowArmPivX, lowArmPivY, 7);
    // 4. トレーリングアーム
    this.drawSuspensionArmBlue(ctx, hubLowerX + 14, hubLowerY + 8, trailingPivX, trailingPivY, 7);

    // ばね・ダンパー
    if (isVoigt) {
      this.drawFrontParallelCoilover(ctx, shockTopX, shockTopY, mountA_X, mountA_Y);
    } else {
      this.drawFrontSeriesSpringDamper(ctx, shockTopX, shockTopY, mountA_X, mountA_Y, engine);
    }

    // スイベルハブ ＆ タイヤ
    this.drawSwivelHub(ctx, hubUpperX, hubUpperY, hubLowerX, hubLowerY, hubCenterX, wheelCenterY, camber);
    this.drawFrontViewTire(ctx, tireCenterX, wheelCenterY, groundBaseY + zrPx, camber);
    this.drawMountPin(ctx, mountA_X, mountA_Y, isVoigt);
  }

  // ─── 🚙 ④ トーションビーム式 ───
  // 特徴: トレーリングアーム ＋ 左右を繋ぐ横方向トーションビーム ＋ トーションバー
  drawTorsionBeamMechanism(ctx, engine, tireCenterX, wheelCenterY, bodyBaseY, subframeX, groundBaseY, zrPx, camber, isVoigt) {
    const pivotX = subframeX + 130;
    const pivotY = bodyBaseY + 145;

    const hubCenterX = tireCenterX + 55;
    const hubLowerX = hubCenterX + 5;
    const hubLowerY = wheelCenterY + 40;

    // トーションビーム＆トレーリングアームの結合点
    const beamStartX = hubCenterX + 15;
    const beamStartY = wheelCenterY + 10;
    const beamEndX = subframeX + 150;
    const beamEndY = wheelCenterY + 10;

    const rL = engine.leverRatio;
    const mountX = beamStartX + (beamEndX - beamStartX) * (1 - rL);
    const mountY = beamStartY;
    const shockTopX = mountX;
    const shockTopY = bodyBaseY - 50;

    // 車体フレーム
    this.drawChassisSubframeFront(ctx, subframeX, bodyBaseY, pivotX - 30, pivotY - 40, pivotX, pivotY, shockTopX, shockTopY, 'トーションビーム式');

    // 1. トレーリングアーム（下部にカーブして伸びるアーム）
    this.drawTrailingArmCurved(ctx, hubLowerX, hubLowerY, beamStartX, beamStartY, pivotX, pivotY);

    // 2. トーションビーム（横方向に伸びる太いビームパイプ）＆ トーションバー（右端の黒いバー）
    this.drawTorsionBeamHorizontal(ctx, beamStartX, beamStartY, beamEndX, beamEndY);

    // ばね・ダンパー（ビーム上に垂直マウント）
    if (isVoigt) {
      this.drawFrontParallelCoilover(ctx, shockTopX, shockTopY, mountX, mountY);
    } else {
      this.drawFrontSeriesSpringDamper(ctx, shockTopX, shockTopY, mountX, mountY, engine);
    }

    // ナックル＆タイヤ
    this.drawSwivelHub(ctx, hubCenterX, wheelCenterY - 30, hubLowerX, hubLowerY, hubCenterX, wheelCenterY, 0);
    this.drawFrontViewTire(ctx, tireCenterX, wheelCenterY, groundBaseY + zrPx, 0);
    this.drawMountPin(ctx, mountX, mountY, isVoigt);
  }

  // ─── 🚙 トーションビーム＆トーションバー横パイプ描画 ───
  drawTorsionBeamHorizontal(ctx, x1, y1, x2, y2) {
    ctx.save();
    // トーションビーム（太い銀色スチールパイプ）
    const beamGrad = ctx.createLinearGradient(0, y1 - 10, 0, y1 + 10);
    beamGrad.addColorStop(0, '#94a3b8');
    beamGrad.addColorStop(0.5, '#f8fafc');
    beamGrad.addColorStop(1, '#475569');

    ctx.fillStyle = beamGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x1, y1 - 9, x2 - x1, 18, 4);
    ctx.fill();
    ctx.stroke();

    // トーションバー（右端からさらに内側に伸びる黒いねじりバー）
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x2, y1 - 4.5, 60, 9);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(x2, y1 - 4.5, 60, 9);

    ctx.restore();
  }

  // ─── 🚙 トレーリングアーム（J字型カーブアーム） ───
  drawTrailingArmCurved(ctx, hubX, hubY, beamX, beamY, pivX, pivY) {
    ctx.save();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(hubX, hubY);
    ctx.lineTo(beamX, beamY);
    ctx.lineTo(pivX, pivY);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // ピボットアイ
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(pivX, pivY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // ─── 🛣️ 正面視路面 ───
  drawFrontViewRoad(ctx, engine, tireX, groundY, scale) {
    ctx.save();
    const roadLeftX = 35;
    const roadRightX = 670;
    const currentZr = engine.currentZr;
    const surfaceY = groundY - currentZr * scale;

    const roadGrad = ctx.createLinearGradient(0, surfaceY, 0, groundY + 70);
    roadGrad.addColorStop(0, '#334155');
    roadGrad.addColorStop(0.2, '#1e293b');
    roadGrad.addColorStop(1, '#0b1120');

    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(roadLeftX, surfaceY);
    ctx.lineTo(roadRightX, surfaceY);
    ctx.lineTo(roadRightX, groundY + 70);
    ctx.lineTo(roadLeftX, groundY + 70);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const vanishY = surfaceY - 60;
    const laneNearHalfW = 95;
    const laneFarHalfW = 40;

    const laneGrad = ctx.createLinearGradient(tireX, vanishY, tireX, surfaceY);
    laneGrad.addColorStop(0, 'rgba(15, 23, 42, 0.2)');
    laneGrad.addColorStop(0.7, 'rgba(30, 41, 59, 0.7)');
    laneGrad.addColorStop(1, 'rgba(51, 65, 85, 0.9)');

    ctx.fillStyle = laneGrad;
    ctx.beginPath();
    ctx.moveTo(tireX - laneFarHalfW, vanishY);
    ctx.lineTo(tireX + laneFarHalfW, vanishY);
    ctx.lineTo(tireX + laneNearHalfW, surfaceY);
    ctx.lineTo(tireX - laneNearHalfW, surfaceY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tireX - laneFarHalfW, vanishY);
    ctx.lineTo(tireX - laneNearHalfW, surfaceY);
    ctx.moveTo(tireX + laneFarHalfW, vanishY);
    ctx.lineTo(tireX + laneNearHalfW, surfaceY);
    ctx.stroke();

    const maxLookaheadDist = 6.0;
    for (let d = maxLookaheadDist; d >= 0; d -= 0.25) {
      const worldX = engine.roadX + d;
      const elev = engine.getRoadElevation(worldX);
      const t = d / maxLookaheadDist;
      const projY = surfaceY - (t) * (surfaceY - vanishY) - elev * scale * (1 - t * 0.7);
      const halfW = laneNearHalfW * (1 - t * 0.6);

      if (Math.abs(elev) > 0.003) {
        ctx.save();
        if (elev > 0) {
          ctx.strokeStyle = `rgba(245, 158, 11, ${Math.min(1.0, (1 - t * 0.5) * (elev / 0.05))})`;
          ctx.lineWidth = Math.max(1.5, 5 * (1 - t * 0.6));
          ctx.beginPath();
          ctx.moveTo(tireX - halfW, projY);
          ctx.lineTo(tireX + halfW, projY);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(2, 6, 23, ${Math.min(1.0, 1 - t * 0.4)})`;
          ctx.lineWidth = Math.max(2, 6 * (1 - t * 0.6));
          ctx.beginPath();
          ctx.moveTo(tireX - halfW * 0.8, projY);
          ctx.lineTo(tireX + halfW * 0.8, projY);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadLeftX, surfaceY);
    ctx.lineTo(roadRightX, surfaceY);
    ctx.stroke();

    ctx.restore();
  }

  // ─── 🚙 車体サブフレーム ───
  drawChassisSubframeFront(ctx, x, y, upX, upY, lpX, lpY, shockTopX, shockTopY, label) {
    ctx.save();

    const towerLeftX = Math.min(x - 100, shockTopX - 35);
    const towerTopY = shockTopY - 20;

    const frameGrad = ctx.createLinearGradient(towerLeftX, towerTopY, x + 180, y + 200);
    frameGrad.addColorStop(0, '#334155');
    frameGrad.addColorStop(0.4, '#1e293b');
    frameGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = frameGrad;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(towerLeftX, towerTopY);
    ctx.lineTo(x + 180, towerTopY);
    ctx.lineTo(x + 180, y + 190);
    ctx.lineTo(lpX + 25, y + 190);
    ctx.lineTo(lpX + 25, y + 155);
    ctx.lineTo(x + 50, y + 155);
    ctx.lineTo(x + 50, y + 80);
    ctx.lineTo(towerLeftX, y + 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ショックアッパーマウントブラケット
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(shockTopX - 25, shockTopY - 14, 50, 18, 4);
    ctx.fill();
    ctx.stroke();

    [-15, 15].forEach(bx => {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(shockTopX + bx, shockTopY - 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    });

    // ピボットアイ
    [ { x: upX, y: upY }, { x: lpX, y: lpY } ].forEach(pt => {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText(`車体フレーム (${label || 'ばね上質量'})`, x + 20, towerTopY + 28);

    ctx.restore();
  }

  // ─── 🔵 サスペンションアーム ───
  drawSuspensionArmBlue(ctx, x1, y1, x2, y2, width) {
    ctx.save();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = width * 0.4;
    ctx.stroke();

    [ { x: x1, y: y1 }, { x: x2, y: y2 } ].forEach(pt => {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, width * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();
  }

  // ─── 🚗 ストラット・ナックル結合ブラケット ───
  drawStrutKnuckleBracket(ctx, strutX, strutY, hubX, hubY, lowX, lowY) {
    ctx.save();
    const bracketGrad = ctx.createLinearGradient(hubX - 25, hubY, hubX + 25, hubY);
    bracketGrad.addColorStop(0, '#475569');
    bracketGrad.addColorStop(0.5, '#94a3b8');
    bracketGrad.addColorStop(1, '#334155');

    ctx.fillStyle = bracketGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(strutX - 10, strutY);
    ctx.lineTo(strutX + 10, strutY);
    ctx.lineTo(strutX + 10, strutY + 30);
    ctx.lineTo(hubX + 15, hubY + 15);
    ctx.lineTo(lowX + 8, lowY);
    ctx.lineTo(lowX - 8, lowY);
    ctx.lineTo(hubX - 25, hubY + 10);
    ctx.lineTo(hubX - 25, hubY - 15);
    ctx.lineTo(strutX - 10, strutY + 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    [ strutY + 10, strutY + 22 ].forEach(by => {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(strutX, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    });

    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(lowX, lowY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    ctx.restore();
  }

  // ─── 🔵 【フォークトモデル（並列）】: 同軸並列コイルオーバー ───
  drawFrontParallelCoilover(ctx, topX, topY, botX, botY) {
    ctx.save();
    const len = botY - topY;

    // ダンパー
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(topX - 4, topY, 8, len * 0.72);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(topX - 4, topY, 8, len * 0.72);

    const cylH = len * 0.52;
    const cylGrad = ctx.createLinearGradient(botX - 10, 0, botX + 10, 0);
    cylGrad.addColorStop(0, '#034a78');
    cylGrad.addColorStop(0.3, '#0284c7');
    cylGrad.addColorStop(0.7, '#38bdf8');
    cylGrad.addColorStop(1, '#023150');

    ctx.fillStyle = cylGrad;
    ctx.beginPath();
    ctx.roundRect(botX - 10, botY - cylH, 20, cylH, 3);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // コイルスプリング（8巻）
    const spTop = topY + 8;
    const spBot = botY - 12;
    const spH = spBot - spTop;
    const coils = 8;
    const spRadius = 20;

    ctx.fillStyle = '#ffd700';
    ctx.fillRect(topX - 22, spTop - 4, 44, 6);
    ctx.fillRect(botX - 22, spBot - 2, 44, 6);

    ctx.strokeStyle = '#9d174d';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < coils; i++) {
      const stepY = spH / coils;
      const yStart = spTop + stepY * i;
      const yMid = spTop + stepY * (i + 0.5);
      ctx.moveTo(topX + spRadius, yStart);
      ctx.quadraticCurveTo(topX, yStart + stepY * 0.1, topX - spRadius, yMid);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < coils; i++) {
      const stepY = spH / coils;
      const yMid = spTop + stepY * (i + 0.5);
      const yEnd = spTop + stepY * (i + 1.0);
      ctx.moveTo(topX - spRadius, yMid);
      ctx.quadraticCurveTo(topX, yMid + stepY * 0.4, topX + spRadius, yEnd);
    }
    ctx.stroke();

    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    [ { x: topX, y: topY }, { x: botX, y: botY } ].forEach(pt => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  }

  // ─── 🟠 【マックスウェルモデル（直列）】: コイルスプリング ＋ ダンパー直結 ───
  drawFrontSeriesSpringDamper(ctx, topX, topY, botX, botY, engine) {
    ctx.save();
    const len = botY - topY;
    const midY = topY + len * 0.48;

    const spTop = topY + 6;
    const spBot = midY - 6;
    const spH = spBot - spTop;
    const coils = 6;
    const spRadius = 18;

    ctx.fillStyle = '#ffd700';
    ctx.fillRect(topX - 20, spTop - 4, 40, 5);

    ctx.strokeStyle = '#9d174d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < coils; i++) {
      const stepY = spH / coils;
      const yStart = spTop + stepY * i;
      const yMid = spTop + stepY * (i + 0.5);
      ctx.moveTo(topX + spRadius, yStart);
      ctx.quadraticCurveTo(topX, yStart + stepY * 0.1, topX - spRadius, yMid);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i < coils; i++) {
      const stepY = spH / coils;
      const yMid = spTop + stepY * (i + 0.5);
      const yEnd = spTop + stepY * (i + 1.0);
      ctx.moveTo(topX - spRadius, yMid);
      ctx.quadraticCurveTo(topX, yMid + stepY * 0.4, topX + spRadius, yEnd);
    }
    ctx.stroke();

    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 中間ジョイント
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(topX - 18, midY - 6, 36, 12);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(topX - 18, midY - 6, 36, 12);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(topX, midY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    const dmpLen = botY - (midY + 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(topX - 4, midY + 6, 8, dmpLen * 0.65);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(topX - 4, midY + 6, 8, dmpLen * 0.65);

    const cylH = dmpLen * 0.58;
    const cylGrad = ctx.createLinearGradient(botX - 9, 0, botX + 9, 0);
    cylGrad.addColorStop(0, '#991b1b');
    cylGrad.addColorStop(0.4, '#ef4444');
    cylGrad.addColorStop(0.8, '#dc2626');
    cylGrad.addColorStop(1, '#7f1d1d');

    ctx.fillStyle = cylGrad;
    ctx.beginPath();
    ctx.roundRect(botX - 9, botY - cylH, 18, cylH, 3);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    [ { x: topX, y: topY }, { x: botX, y: botY } ].forEach(pt => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  }

  // ─── 🦾 スイベルハブ ───
  drawSwivelHub(ctx, upX, upY, lowX, lowY, hubX, hubY, camber) {
    ctx.save();
    const hubGrad = ctx.createLinearGradient(hubX - 25, hubY, hubX + 15, hubY);
    hubGrad.addColorStop(0, '#475569');
    hubGrad.addColorStop(0.5, '#94a3b8');
    hubGrad.addColorStop(1, '#334155');

    ctx.fillStyle = hubGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(upX, upY);
    ctx.lineTo(upX - 16, upY + 8);
    ctx.lineTo(hubX - 28, hubY - 20);
    ctx.lineTo(hubX - 28, hubY + 20);
    ctx.lineTo(lowX - 16, lowY - 8);
    ctx.lineTo(lowX, lowY);
    ctx.lineTo(lowX + 10, lowY - 14);
    ctx.lineTo(hubX - 12, hubY + 12);
    ctx.lineTo(hubX - 12, hubY - 12);
    ctx.lineTo(upX + 10, upY + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    [ { x: upX, y: upY }, { x: lowX, y: lowY } ].forEach(pt => {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    });
    ctx.restore();
  }

  // ─── 🔘 正面視リアルタイヤ ───
  drawFrontViewTire(ctx, cx, cy, groundY, camber) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(camber);

    const tireW = 75;
    const tireH = 190;
    const tireHalfW = tireW / 2;
    const tireHalfH = tireH / 2;

    const bottomY = cy + tireHalfH;
    const deflection = Math.max(0, Math.min(10, bottomY - groundY));

    const tireGrad = ctx.createLinearGradient(-tireHalfW, 0, tireHalfW, 0);
    tireGrad.addColorStop(0, '#0f172a');
    tireGrad.addColorStop(0.15, '#334155');
    tireGrad.addColorStop(0.5, '#475569');
    tireGrad.addColorStop(0.85, '#334155');
    tireGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = tireGrad;
    ctx.beginPath();
    ctx.roundRect(-tireHalfW, -tireHalfH, tireW, tireH - deflection * 0.4, 24);
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    [-15, 0, 15].forEach(tx => {
      ctx.beginPath();
      ctx.moveTo(tx, -tireHalfH + 15);
      ctx.lineTo(tx, tireHalfH - 15);
      ctx.stroke();
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.restore();
  }

  // ─── 📍 マウントピン ───
  drawMountPin(ctx, x, y, isVoigt) {
    ctx.save();
    ctx.fillStyle = isVoigt ? '#ec4899' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ─── 🔬 右上: 粘弾性モデル回路 ＆ 応力緩和オシロスコープ ───
  drawViscoRelaxationScope(ctx, engine) {
    ctx.save();
    const ox = 710;
    const oy = 25;
    const ow = 460;
    const oh = 265;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ox, oy, ow, oh, 10);
    ctx.fill();
    ctx.stroke();

    const isVoigt = engine.modelType === 'voigt';

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.fillText('🔬 粘弾性モデル ＆ リアルタイム動的応答', ox + 15, oy + 22);

    ctx.fillStyle = isVoigt ? '#38bdf8' : '#f59e0b';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(isVoigt ? '【フォークトモデル (並列): σ = σ1 + σ2】' : '【マックスウェルモデル (直列): γ = γ1 + γ2】', ox + ow - 15, oy + 22);

    this.drawViscoCircuitDiagramDetailed(ctx, ox + 15, oy + 38, isVoigt, engine);

    const gx = ox + 170;
    const gy = oy + 42;
    const gw = ow - 185;
    const gh = oh - 58;

    this.drawScopeWaveforms(ctx, engine, gx, gy, gw, gh, isVoigt);

    ctx.restore();
  }

  // ─── 🔬 粘弾性モデル概念図 ───
  drawViscoCircuitDiagramDetailed(ctx, cx, cy, isVoigt, engine) {
    ctx.save();
    const midX = cx + 55;
    const topPinY = cy + 18;
    const botPinY = cy + 205;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(midX, topPinY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(midX, botPinY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isVoigt) {
      const branchDist = 32;
      const forkTopY = topPinY + 22;
      const forkBotY = botPinY - 22;

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX, topPinY + 4.5);
      ctx.lineTo(midX, forkTopY);
      ctx.lineTo(midX - branchDist, forkTopY);
      ctx.lineTo(midX - branchDist, forkTopY + 18);

      ctx.moveTo(midX, forkTopY);
      ctx.lineTo(midX + branchDist, forkTopY);
      ctx.lineTo(midX + branchDist, forkTopY + 18);
      ctx.stroke();

      const spTopY = forkTopY + 18;
      const spBotY = forkBotY - 18;
      const spH = spBotY - spTopY;
      const coils = 6;

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(midX - branchDist, spTopY);
      for (let i = 0; i < coils; i++) {
        const step = spH / coils;
        ctx.lineTo(midX - branchDist + 12, spTopY + step * (i + 0.25));
        ctx.lineTo(midX - branchDist - 12, spTopY + step * (i + 0.75));
        ctx.lineTo(midX - branchDist, spTopY + step * (i + 1.0));
      }
      ctx.stroke();

      const dmpTopY = forkTopY + 18;
      const dmpBotY = forkBotY - 18;
      const dmpH = dmpBotY - dmpTopY;

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX + branchDist, dmpTopY);
      ctx.lineTo(midX + branchDist, dmpTopY + dmpH * 0.48);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(midX + branchDist - 11, dmpTopY + dmpH * 0.48, 22, 4);

      const cylTop = dmpTopY + dmpH * 0.36;
      const cylBot = dmpBotY;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(midX + branchDist - 14, cylTop);
      ctx.lineTo(midX + branchDist - 14, cylBot);
      ctx.lineTo(midX + branchDist + 14, cylBot);
      ctx.lineTo(midX + branchDist + 14, cylTop);
      ctx.stroke();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX - branchDist, spBotY);
      ctx.lineTo(midX - branchDist, forkBotY);
      ctx.lineTo(midX, forkBotY);
      ctx.lineTo(midX, botPinY - 4.5);

      ctx.moveTo(midX + branchDist, cylBot);
      ctx.lineTo(midX + branchDist, forkBotY);
      ctx.lineTo(midX, forkBotY);
      ctx.stroke();

      ctx.fillStyle = '#ec4899';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('G (σ1)', midX - branchDist - 15, spTopY + spH * 0.5);

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText('η (σ2)', midX + branchDist + 18, dmpTopY + dmpH * 0.5);

    } else {
      const midJointY = (topPinY + botPinY) / 2 - 2;

      const spTopY = topPinY + 16;
      const spBotY = midJointY - 14;
      const spH = spBotY - spTopY;
      const coils = 5;

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX, topPinY + 4.5);
      ctx.lineTo(midX, spTopY);
      ctx.stroke();

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(midX, spTopY);
      for (let i = 0; i < coils; i++) {
        const step = spH / coils;
        ctx.lineTo(midX + 12, spTopY + step * (i + 0.25));
        ctx.lineTo(midX - 12, spTopY + step * (i + 0.75));
        ctx.lineTo(midX, spTopY + step * (i + 1.0));
      }
      ctx.stroke();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX, spBotY);
      ctx.lineTo(midX, midJointY);
      ctx.stroke();

      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(midX, midJointY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      const dmpTopY = midJointY + 4;
      const dmpBotY = botPinY - 16;
      const dmpH = dmpBotY - dmpTopY;

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX, dmpTopY);
      ctx.lineTo(midX, dmpTopY + dmpH * 0.45);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(midX - 11, dmpTopY + dmpH * 0.45, 22, 4);

      const cylTop = dmpTopY + dmpH * 0.32;
      const cylBot = dmpBotY;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(midX - 14, cylTop);
      ctx.lineTo(midX - 14, cylBot);
      ctx.lineTo(midX + 14, cylBot);
      ctx.lineTo(midX + 14, cylTop);
      ctx.stroke();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX, cylBot);
      ctx.lineTo(midX, botPinY - 4.5);
      ctx.stroke();

      ctx.fillStyle = '#ec4899';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('G (γ1)', midX + 18, spTopY + spH * 0.5);

      ctx.fillStyle = '#38bdf8';
      ctx.fillText('η (γ2)', midX + 18, dmpTopY + dmpH * 0.55);
    }

    ctx.restore();
  }

  // オシロスコープ波形
  drawScopeWaveforms(ctx, engine, gx, gy, gw, gh, isVoigt) {
    ctx.save();
    ctx.fillStyle = '#060a12';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    const midY = gy + gh / 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.beginPath();
    ctx.moveTo(gx, midY);
    ctx.lineTo(gx + gw, midY);
    ctx.stroke();

    const waveScale = 800;

    if (engine.zrHistory.length > 1) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      engine.zrHistory.forEach((zr, idx) => {
        const x = gx + (idx / engine.historyMaxLength) * gw;
        const y = midY - zr * waveScale;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (engine.zuHistory.length > 1) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      engine.zuHistory.forEach((zu, idx) => {
        const x = gx + (idx / engine.historyMaxLength) * gw;
        const y = midY - zu * waveScale;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (engine.zsHistory.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      engine.zsHistory.forEach((zs, idx) => {
        const x = gx + (idx / engine.historyMaxLength) * gw;
        const y = midY - zs * waveScale;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (!isVoigt) {
      const tau = engine.evaluation.relaxationTimeTau;
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`緩和時間 τ = η/G = ${tau.toFixed(3)}s`, gx + gw - 8, gy + gh - 8);
    }

    ctx.font = '9px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('― 車体変位 zs(t)', gx + 8, gy + 14);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('― タイヤ zu(t)', gx + 95, gy + 14);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('┄ 路面 zr(t)', gx + 175, gy + 14);

    ctx.restore();
  }

  // ─── 📈 右下: Bode Plot ───
  drawBodeAndWheelRatePlot(ctx, engine) {
    ctx.save();
    const bx = 710;
    const by = 300;
    const bw = 460;
    const bh = 190;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11.5px "Noto Sans JP", sans-serif';
    ctx.fillText('📈 周波数応答特性 ＆ 共振ピーク線図 (Bode Plot)', bx + 15, by + 20);

    const gx = bx + 45;
    const gy = by + 35;
    const gw = bw - 60;
    const gh = bh - 55;

    ctx.fillStyle = '#060a12';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    const fn1 = engine.evaluation.naturalFreq1;
    const zeta = engine.evaluation.dampingRatio;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    for (let px = 0; px <= gw; px += 2) {
      const f = 0.1 + (px / gw) * 19.9;
      const r = f / fn1;
      const num = 1 + Math.pow(2 * zeta * r, 2);
      const den = Math.pow(1 - r * r, 2) + Math.pow(2 * zeta * r, 2);
      const gain = Math.sqrt(num / den);

      const py = gy + gh - Math.min(gh - 5, (gain / 3.8) * gh);
      if (px === 0) ctx.moveTo(gx + px, py);
      else ctx.lineTo(gx + px, py);
    }
    ctx.stroke();

    const base1Y = gy + gh - (1.0 / 3.8) * gh;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(gx, base1Y);
    ctx.lineTo(gx + gw, base1Y);
    ctx.stroke();
    ctx.setLineDash([]);

    const fn1Px = ((fn1 - 0.1) / 19.9) * gw;
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx + fn1Px, gy);
    ctx.lineTo(gx + fn1Px, gy + gh);
    ctx.stroke();

    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`fn1 = ${fn1.toFixed(2)}Hz`, gx + fn1Px + 3, gy + 12);
    ctx.fillText('【車体共振】', gx + fn1Px + 3, gy + 24);

    const fn2 = engine.evaluation.naturalFreq2;
    const fn2Px = ((fn2 - 0.1) / 19.9) * gw;
    if (fn2Px > 0 && fn2Px < gw) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx + fn2Px, gy);
      ctx.lineTo(gx + fn2Px, gy + gh);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`fn2 = ${fn2.toFixed(1)}Hz`, gx + fn2Px - 45, gy + 12);
      ctx.fillText('【タイヤ共振】', gx + fn2Px - 45, gy + 24);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('3.0x', gx - 4, gy + gh - (3.0 / 3.8) * gh);
    ctx.fillText('1.0x', gx - 4, base1Y + 3);
    ctx.fillText('0.0x', gx - 4, gy + gh);

    ctx.textAlign = 'center';
    ctx.fillText('1Hz', gx + ((1 - 0.1) / 19.9) * gw, gy + gh + 12);
    ctx.fillText('5Hz', gx + ((5 - 0.1) / 19.9) * gw, gy + gh + 12);
    ctx.fillText('10Hz', gx + ((10 - 0.1) / 19.9) * gw, gy + gh + 12);
    ctx.fillText('20Hz', gx + gw, gy + gh + 12);

    ctx.restore();
  }

  // ─── 📊 最下部HUD ───
  drawDashboardHUD(ctx, engine) {
    ctx.save();
    const hudY = this.height - 75;
    const ev = engine.evaluation;

    const items = [
      { label: 'ホイールバネ定数 (Kw)', val: `${ev.wheelRateKwNmm.toFixed(1)} N/mm (RL=${engine.leverRatio.toFixed(2)})`, color: '#ffd700' },
      { label: '車体固有周波数 fn1', val: `${ev.naturalFreq1.toFixed(2)} Hz`, color: '#ec4899' },
      { label: '減衰比 ζ (ゼータ)', val: `${ev.dampingRatio.toFixed(2)} (${ev.dampingRatio < 1 ? '不足減衰' : '過減衰'})`, color: '#38bdf8' },
      { label: '上下加速度 RMS', val: `${ev.accRms.toFixed(2)} m/s²`, color: '#10b981' },
      { label: '緩和時間 τ (η/G)', val: `${ev.relaxationTimeTau.toFixed(3)} s`, color: '#f59e0b' },
      { label: 'ISO乗り心地判定', val: `${ev.comfortScore}点 (${ev.comfortGrade.split(' ')[0]})`, color: '#a855f7' }
    ];

    const itemW = (this.width - 60) / items.length;
    items.forEach((it, idx) => {
      const ix = 30 + idx * itemW;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.beginPath();
      ctx.roundRect(ix, hudY, itemW - 8, 58, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(it.label, ix + (itemW - 8) / 2, hudY + 18);

      ctx.fillStyle = it.color;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(it.val, ix + (itemW - 8) / 2, hudY + 40);
    });

    ctx.restore();
  }
}

if (typeof window !== 'undefined') {
  window.SuspensionVisualizer = SuspensionVisualizer;
}
