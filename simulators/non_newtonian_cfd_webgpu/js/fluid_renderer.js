/**
 * fluid_renderer.js - 化粧品充填プロセス (Cosmetic Filling Process) 美麗レンダラー
 * 
 * 可視化機能:
 *   - 高級化粧品容器 (ジャー容器、美容液ボトル、口紅金型、ファンデーション皿) のパッケージ描画
 *   - 昇降追従ディスペンサーノズル (SUS316Lノズル + 液吐出バルブ)
 *   - 化粧品流体 (リアル光沢質感、見かけ粘度コンター、流速、ツノ立ち・レベリング解析)
 *   - 液面メニスカスとツノ立ち・堆積プロファイル線
 */

import { CFDVisualizer } from './visualizer.js?v=coating_modelsel_v112';
import { MeshSmoother } from './mesh_smoother.js?v=coating_modelsel_v112';
import { MATERIAL_PALETTES } from './models.js?v=coating_modelsel_v112';

export class FluidRenderer {
  static sampleRainbow(val) {
    const t = Math.max(0.0, Math.min(1.0, val));
    let r = 0, g = 0, b = 0;
    if (t < 0.125) {
      const f = t / 0.125;
      r = 0; g = 0; b = Math.floor(128 + 127 * f);
    } else if (t < 0.375) {
      const f = (t - 0.125) / 0.25;
      r = 0; g = Math.floor(255 * f); b = 255;
    } else if (t < 0.625) {
      const f = (t - 0.375) / 0.25;
      r = Math.floor(255 * f); g = 255; b = Math.floor(255 * (1.0 - f));
    } else if (t < 0.875) {
      const f = (t - 0.625) / 0.25;
      r = 255; g = Math.floor(255 * (1.0 - 0.5 * f)); b = 0;
    } else {
      const f = (t - 0.875) / 0.125;
      r = 255; g = Math.floor(128 * (1.0 - f)); b = 0;
    }
    return [r, g, b];
  }

  static getViscosityColor(eta, minEta = 0.05, maxEta = 120.0) {
    const norm = Math.max(0.0, Math.min(1.0, (eta - minEta) / Math.max(0.001, maxEta - minEta)));
    return FluidRenderer.sampleRainbow(norm);
  }

  static getVelocityColor(vel, maxVel = 180.0) {
    const norm = Math.max(0.0, Math.min(1.0, vel / Math.max(0.01, maxVel)));
    return FluidRenderer.sampleRainbow(norm);
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.renderMode = 'realistic'; // 初期: 化粧品リアル質感 (高級感あふれる光沢)
    this.smoothingMode = 'laplacian'; // 'laplacian' (標準・粒感除去) | 'taubin' (体積保持) | 'raw' (未処理・粒子感)
    this.smoothingIterations = 10;
    this.activeMaterial = null; // ユーザーがパレットから選択したマテリアルオブジェクト
  }

  resize() {}

  render(solver, currentPreset = null) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. クリーンなスタジオライティング背景
    this._renderStudioBackground(ctx, w, h, solver);

    if (solver.testMode === 'sagging') {
      // 傾斜板・垂直板放置試験モード
      this._renderSaggingPlate(ctx, solver);
      this._renderWettingTrace(ctx, solver, currentPreset);
      this._renderFluid(ctx, solver, currentPreset);
      this._renderSaggingOverlay(ctx, solver);
    } else if (solver.testMode === 'crown') {
      // 👑 ミルククラウン試験モード
      this._renderCrownPoolBack(ctx, solver);
      this._renderFluid(ctx, solver, currentPreset);
      this._renderCrownPoolFront(ctx, solver);
      this._renderCrownOverlay(ctx, solver);
    } else if (solver.testMode === 'coating') {
      // 🎨 エッジ塗布・コーティング試験モード
      this._renderCoatingSubstrate(ctx, solver);
      this._renderFluid(ctx, solver, currentPreset);
      this._renderDoctorBlade(ctx, solver);
      this._renderCoatingOverlay(ctx, solver);
      this._renderCoatingMicroscopePIP(ctx, solver, currentPreset);
    } else {
      // 容器充填試験モード
      this._renderContainerBack(ctx, solver);
      this._renderFluid(ctx, solver, currentPreset);
      this._renderContainerFront(ctx, solver);
      this._renderDispenserNozzle(ctx, solver);
      this._renderOverlay(ctx, solver);
    }
  }

  /**
   * クリーンなクリーンルーム/化粧品ラボ風の背景
   */
  _renderStudioBackground(ctx, w, h, solver = null) {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 80, w * 0.5, h * 0.5, w * 0.8);
    grad.addColorStop(0, '#151e2e');
    grad.addColorStop(0.6, '#0c111a');
    grad.addColorStop(1, '#070a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (solver?.testMode === 'sagging' || solver?.testMode === 'coating') return;

    // 作業台・ステージ
    const tableY = (solverY) => solverY;
    const gradTable = ctx.createLinearGradient(0, 480, 0, h);
    gradTable.addColorStop(0, 'rgba(30, 41, 59, 0.6)');
    gradTable.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    ctx.fillStyle = gradTable;
    ctx.fillRect(0, 480, w, h - 480);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 480);
    ctx.lineTo(w, 480);
    ctx.stroke();
  }

  /**
   * 化粧品容器の背面・ベース描画
   */
  _renderContainerBack(ctx, solver) {
    const c = solver.container;
    const nx = solver.nozzleX;
    const halfW = c.width * 0.5;
    const leftX = nx - halfW;
    const rightX = nx + halfW;
    const bottomY = c.bottomY;
    const topY = c.bottomY - c.height;

    const pivotX = solver.containerPivotX || nx;
    const pivotY = solver.containerPivotY || bottomY;
    const sx = solver.shakeX || 0.0;
    const sy = solver.shakeY || 0.0;
    const sAng = solver.shakeAngle || 0.0;

    ctx.save();
    ctx.translate(pivotX + sx, pivotY + sy);
    ctx.rotate(sAng);
    ctx.translate(-pivotX, -pivotY);

    if (c.id === 'petri_dish') {
      // 超薄平皿 (高品質耐熱ボロシリケートガラスシャーレ)
      // 外側ベース (極浅・高透明ガラスリム)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 2;
      this._drawRoundRect(ctx, leftX - 14, topY - 4, c.width + 28, c.height + 12, 6);
      ctx.fill();
      ctx.stroke();

      // 内側キャビティ (広大で平らな底面)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      this._drawRoundRect(ctx, leftX, topY + 2, c.width, c.height - 2, 4);
      ctx.fill();

    } else if (c.id === 'jar') {
      // 高級ガラスクリームジャー (底が厚い二重構造)
      // 外側ベース
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      this._drawRoundRect(ctx, leftX - 12, topY, c.width + 24, c.height + 15, 14);
      ctx.fill();
      ctx.stroke();

      // 内側キャビティ
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      this._drawRoundRect(ctx, leftX, topY + 10, c.width, c.height - 10, 10);
      ctx.fill();

    } else if (c.id === 'bottle') {
      // 美容液ドロッパーボトル (縦長スマートボトル)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      this._drawRoundRect(ctx, leftX - 8, topY, c.width + 16, c.height + 10, 18);
      ctx.fill();
      ctx.stroke();

      // 内側キャビティ
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      this._drawRoundRect(ctx, leftX, topY + 15, c.width, c.height - 15, 12);
      ctx.fill();

    } else if (c.id === 'lipstick') {
      // 口紅金型モールド (真鍮/ステンレス金属モールド)
      const gradMetal = ctx.createLinearGradient(leftX, 0, rightX, 0);
      gradMetal.addColorStop(0, '#334155');
      gradMetal.addColorStop(0.3, '#64748b');
      gradMetal.addColorStop(0.5, '#475569');
      gradMetal.addColorStop(0.8, '#64748b');
      gradMetal.addColorStop(1, '#1e293b');

      ctx.fillStyle = gradMetal;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      this._drawRoundRect(ctx, leftX - 18, topY - 10, c.width + 36, c.height + 25, 8);
      ctx.fill();
      ctx.stroke();

      // 内側キャビティ
      ctx.fillStyle = '#090d16';
      this._drawRoundRect(ctx, leftX, topY, c.width, c.height, 4);
      ctx.fill();

    } else if (c.id === 'compact') {
      // ファンデーションコンパクト平皿
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      this._drawRoundRect(ctx, leftX - 16, topY, c.width + 32, c.height + 15, 12);
      ctx.fill();
      ctx.stroke();

      // 内側キャビティ
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      this._drawRoundRect(ctx, leftX, topY + 5, c.width, c.height - 5, 8);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 化粧品容器の前面・ガラス光沢・目盛り線
   */
  _renderContainerFront(ctx, solver) {
    const c = solver.container;
    const nx = solver.nozzleX;
    const halfW = c.width * 0.5;
    const leftX = nx - halfW;
    const rightX = nx + halfW;
    const bottomY = c.bottomY;
    const topY = c.bottomY - c.height;

    const pivotX = solver.containerPivotX || nx;
    const pivotY = solver.containerPivotY || bottomY;
    const sx = solver.shakeX || 0.0;
    const sy = solver.shakeY || 0.0;
    const sAng = solver.shakeAngle || 0.0;

    ctx.save();
    ctx.translate(pivotX + sx, pivotY + sy);
    ctx.rotate(sAng);
    ctx.translate(-pivotX, -pivotY);

    // ガラス反射の縦ハイライト
    const gradGlass = ctx.createLinearGradient(leftX, 0, rightX, 0);
    gradGlass.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    gradGlass.addColorStop(0.12, 'rgba(255, 255, 255, 0.02)');
    gradGlass.addColorStop(0.7, 'rgba(255, 255, 255, 0.0)');
    gradGlass.addColorStop(0.88, 'rgba(255, 255, 255, 0.12)');
    gradGlass.addColorStop(1, 'rgba(255, 255, 255, 0.25)');

    ctx.fillStyle = gradGlass;
    ctx.fillRect(leftX - 8, topY, c.width + 16, c.height);

    // 目盛り線 & ラベル (シャーレ・ボトル・ジャー・口紅モールド) - 容器の外側に配置し流体と重ならないようにする
    if (c.id === 'petri_dish' || c.id === 'bottle' || c.id === 'jar' || c.id === 'lipstick') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';

      const numTicks = (c.id === 'petri_dish') ? 4 : (c.id === 'lipstick' ? 3 : 5);
      for (let i = 1; i <= numTicks; i++) {
        const ty = bottomY - (c.height * 0.85) * (i / numTicks);
        const vMl = (c.targetVolume * (i / numTicks)).toFixed(0);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftX - 6, ty);
        ctx.lineTo(leftX, ty);
        ctx.stroke();

        if (i % 2 === 0 || i === numTicks || c.id === 'lipstick' || c.id === 'petri_dish') {
          ctx.fillText(`${vMl}mL`, leftX - 9, ty + 3);
        }
      }
    }

    // 容器名キャプション (寸法ベース一般呼称 / 実容量)
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${c.name} [容量: ${c.targetVolume} mL]`, nx, bottomY + 28);

    // 揺らし可能ヒント表示
    ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`🫨 クリック / ドラッグで容器を揺らす`, nx, bottomY + 44);

    ctx.restore();
  }

  /**
   * 昇降追従ディスペンサーノズルの描画 (スレンダーな実機SUS316L充填ニードル)
   */
  _renderDispenserNozzle(ctx, solver) {
    const nx = solver.nozzleX;
    const ny = solver.nozzleY;
    const nr = Math.max(7, solver.nozzleRadiusPx); // スレンダーなニードル外径 (約 8〜14px)

    ctx.save();

    // 1. 上部シリンダーブロック (上部マウント機構)
    const mountW = 60;
    const mountH = 30;
    const gradBlock = ctx.createLinearGradient(nx - mountW / 2, 0, nx + mountW / 2, 0);
    gradBlock.addColorStop(0, '#334155');
    gradBlock.addColorStop(0.5, '#64748b');
    gradBlock.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradBlock;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    this._drawRoundRect(ctx, nx - mountW / 2, 0, mountW, mountH, 4);
    ctx.fill();
    ctx.stroke();

    // 2. スレンダーなSUS316L鏡面ステンレスノズルニードル
    const gradNeedle = ctx.createLinearGradient(nx - nr, 0, nx + nr, 0);
    gradNeedle.addColorStop(0, '#64748b');
    gradNeedle.addColorStop(0.3, '#f1f5f9');
    gradNeedle.addColorStop(0.6, '#cbd5e1');
    gradNeedle.addColorStop(1, '#475569');

    ctx.fillStyle = gradNeedle;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(nx - nr - 2, mountH);
    ctx.lineTo(nx + nr + 2, mountH);
    ctx.lineTo(nx + nr, ny - 6);
    ctx.lineTo(nx + nr - 1, ny);
    ctx.lineTo(nx - nr + 1, ny);
    ctx.lineTo(nx - nr, ny - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. 先端テフロンリング (液垂れ・液キレ防止用)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(nx - nr + 1, ny - 3, (nr - 1) * 2, 3);

    // インジケーター表示 (上部シリンダーブロックの右横にコンパクト配置)
    const badgeW = 118;
    const badgeH = 28;
    let labelX = nx + (mountW * 0.5) + 8;
    let labelY = 8;

    // もし右端をオーバーフローする場合は、ノズル左側に反転配置
    if (labelX + badgeW > ctx.canvas.width - 6) {
      labelX = Math.max(6, nx - (mountW * 0.5) - 8 - badgeW);
    }

    // 半透明の整流バッジ背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.30)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, labelX - 3, labelY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();

    if (solver.fillingMode === 'bottom_up' && solver.fillPercentage > 5 && solver.fillPercentage < 98) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('▲ ボトムアップ追従', labelX + 2, labelY + 11);
    } else if (solver.fillingMode === 'fixed') {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⬇️ 固定ノズル', labelX + 2, labelY + 11);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('▲ 昇降ノズル', labelX + 2, labelY + 11);
    }

    ctx.font = '9px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(`口径 d = ${solver.nozzleDiameterMm.toFixed(1)}mm`, labelX + 2, labelY + 22);

    ctx.restore();
  }

  /**
   * 👑 ミルククラウン試験: 平皿シャーレプールの背面＆滴下ガイド描画
   */
  _renderCrownPoolBack(ctx, solver) {
    const nx = solver.nozzleX;
    const bottomY = solver.crownPoolBottomY; // 480.0
    const poolRadiusPx = solver.crownPoolRadiusPx; // 160.0 (40 mm)
    const leftX = nx - poolRadiusPx;
    const rightX = nx + poolRadiusPx;
    const filmThickMm = solver.crownFilmThicknessMm;
    const filmPx = filmThickMm * solver.pixelPerMm;
    const poolHeight = 32.0;
    const topY = bottomY - poolHeight;

    ctx.save();

    // 1. 滴下高さ基準ガイド線 (Drop Height Guide Line)
    const dropHeightMm = solver.crownDropHeightMm;
    const dropHeightPx = dropHeightMm * solver.pixelPerMm;
    const dropReleaseY = bottomY - filmPx - dropHeightPx;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(nx - 60, dropReleaseY);
    ctx.lineTo(nx + 60, dropReleaseY);
    ctx.stroke();

    // 高さ寸法インジケーター (矢印ライン)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(nx + 70, dropReleaseY);
    ctx.lineTo(nx + 70, bottomY - filmPx);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`H = ${dropHeightMm.toFixed(0)} mm (V₀ = ${Math.sqrt(2 * 9.81 * dropHeightMm * 1e-3).toFixed(2)} m/s)`, nx + 76, (dropReleaseY + bottomY - filmPx) * 0.5 + 3);

    // 2. シャーレ平皿の外側ガラスベース (高品質ボロシリケートガラス)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    this._drawRoundRect(ctx, leftX - 12, topY, poolRadiusPx * 2 + 24, poolHeight + 10, 6);
    ctx.fill();
    ctx.stroke();

    // 3. シャーレ内側キャビティ
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    this._drawRoundRect(ctx, leftX, topY + 4, poolRadiusPx * 2, poolHeight - 4, 4);
    ctx.fill();

    ctx.restore();
  }

  /**
   * 👑 ミルククラウン試験: 平皿シャーレの前面ガラス光沢＆クラウン計測ライン
   */
  _renderCrownPoolFront(ctx, solver) {
    const nx = solver.nozzleX;
    const bottomY = solver.crownPoolBottomY;
    const poolRadiusPx = solver.crownPoolRadiusPx;
    const leftX = nx - poolRadiusPx;
    const filmThickMm = solver.crownFilmThicknessMm;
    const filmPx = filmThickMm * solver.pixelPerMm;
    const poolHeight = 32.0;
    const topY = bottomY - poolHeight;

    ctx.save();

    // 1. 液膜の初期表面ライン (破線)
    if (filmThickMm > 0.05) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(leftX, bottomY - filmPx);
      ctx.lineTo(leftX + poolRadiusPx * 2, bottomY - filmPx);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. シャーレ前面のガラス光沢ハイライト
    const gradGlass = ctx.createLinearGradient(0, topY, 0, bottomY);
    gradGlass.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
    gradGlass.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    gradGlass.addColorStop(1, 'rgba(56, 189, 248, 0.15)');

    ctx.fillStyle = gradGlass;
    this._drawRoundRect(ctx, leftX - 10, bottomY - 6, poolRadiusPx * 2 + 20, 6, 2);
    ctx.fill();

    // シャーレ左右リムの光沢エッジ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX - 10, topY + 4);
    ctx.lineTo(leftX - 10, bottomY);
    ctx.moveTo(leftX + poolRadiusPx * 2 + 10, topY + 4);
    ctx.lineTo(leftX + poolRadiusPx * 2 + 10, bottomY);
    ctx.stroke();

    // 3. シャーレ規格キャプション
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`平皿シャーレ Φ80mm (液膜厚さ h₀ = ${filmThickMm.toFixed(1)} mm)`, nx, bottomY + 22);

    ctx.restore();
  }

  /**
   * 👑 ミルククラウン試験: HUDオーバーレイ
   */
  _renderCrownOverlay(ctx, solver) {
    const dim = solver.getCrownDimensionlessNumbers();
    const w = this.canvas.width;
    const h = this.canvas.height;
    const nx = solver.nozzleX;

    ctx.save();

    // 超コンパクトHUD (幅158px × 高さ62px)
    let hudX = 10;
    let hudY = 10;
    let hudW = 158;
    let hudH = 62;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, hudX, hudY, hudW, hudH, 5);
    ctx.fill();
    ctx.stroke();

    const textX = hudX + 7;

    // 1行目: タイトル
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('👑 ミルククラウン試験', textX, hudY + 14);

    // 2行目: 無次元数 We / Re / Oh
    ctx.font = '9px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`We:${dim.We.toFixed(0)}  Re:${dim.Re.toFixed(0)}  Oh:${dim.Oh.toFixed(2)}`, textX, hudY + 29);

    // 3行目: クラウン最高高さ & 広がり半径
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`王冠高: ${solver.crownMaxHeightMm.toFixed(1)}mm  幅: ${(solver.crownMaxRadiusMm * 2).toFixed(1)}mm`, textX, hudY + 44);

    // 4行目: 状態ステータス
    if (solver.crownState === 'falling') {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '8.5px sans-serif';
      ctx.fillText(`⚡ 液滴落下中 (V₀=${dim.V0.toFixed(2)}m/s)`, textX, hudY + 56);
    } else if (solver.crownState === 'impact') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.fillText('👑 クラウン王冠形成中!', textX, hudY + 56);
    } else {
      ctx.fillStyle = '#10b981';
      ctx.font = '8.5px sans-serif';
      ctx.fillText(`✅ ${dim.regime === 'splash' ? 'スプラッシュ飛散' : (dim.regime === 'crater' ? 'クレーター沈降' : 'クラウン形成')}`, textX, hudY + 56);
    }

    ctx.restore();
  }

  /**
   * SPH 充填流体の描画 (中身の詰まった滑らかな「面」を形成)
   */
  _renderFluid(ctx, solver, currentPreset) {
    const N = solver.numParticles;
    if (N === 0) return;

    const r = solver.particleRadius;
    const mode = this.renderMode;

    // マテリアル決定 (アクティブ選択マテリアル > プリセット指定マテリアル > デフォルト)
    let mat = this.activeMaterial;
    if (!mat && currentPreset) {
      if (currentPreset.material) {
        mat = currentPreset.material;
      } else if (currentPreset.materialId && MATERIAL_PALETTES[currentPreset.materialId]) {
        mat = MATERIAL_PALETTES[currentPreset.materialId];
      }
    }

    let baseColor = mat?.color ? [...mat.color] : [252, 250, 245];
    let fluidGloss = mat?.gloss ?? 0.65;
    let fluidAlpha = mat?.alpha ?? 0.98;

    if (!mat && currentPreset) {
      if (currentPreset.id === 'cleansing_oil') {
        baseColor = [245, 235, 185];
        fluidGloss = 0.90;
      } else if (currentPreset.id === 'lipstick_gloss' || currentPreset.id === 'lipstick') {
        baseColor = [225, 29, 72];
        fluidGloss = 0.88;
      } else if (currentPreset.id === 'liquid_foundation') {
        baseColor = [228, 178, 137];
        fluidGloss = 0.45;
      } else if (currentPreset.id === 'clay_scrub') {
        baseColor = [95, 100, 105];
        fluidGloss = 0.25;
      } else if (currentPreset.id === 'skin_lotion') {
        baseColor = [195, 235, 255];
        fluidGloss = 0.92;
      } else if (currentPreset.id === 'emulsion_serum') {
        baseColor = [255, 225, 235];
        fluidGloss = 0.78;
      }
    }

    if (mode === 'monochrome') {
      baseColor = [0, 240, 255];
      fluidGloss = 0.80;
    }

    ctx.save();

    // 1. 【メイン面形成 (Surface Mesh Polygon Filling)】
    // 充填試験・垂れ試験・塗布試験で適用
    if (this.smoothingMode !== 'raw') {
      if (solver.testMode === 'sagging') {
        this._renderSaggingDropletMesh(ctx, solver, baseColor, fluidGloss, mode);
      } else if (solver.testMode === 'coating') {
        this._renderCoatingFluidMesh(ctx, solver, baseColor, fluidGloss, mode);
      } else if (solver.testMode === 'filling') {
        this._renderFillingFluidMesh(ctx, solver, baseColor, fluidGloss, mode);
      }
    }

    // 2. 【高密度ブレンド粒子レイヤー】
    // 局所の粘度・速度コンターや、表面の滑らかな微小凹凸を補間
    const etaMin = solver.eta_min;
    const etaMax = Math.max(10.0, solver.eta_max * 0.4);
    const vMax = 180.0;
    
    // 粒子同士が完全に融合して隙間をゼロにするブレンド半径
    const isCrown = (solver.testMode === 'crown');
    const blendR = (this.smoothingMode === 'raw') 
      ? (r * 1.35) 
      : (isCrown ? Math.max(3.2, r * 2.8) : Math.max(3.8, r * 4.5));

    const particleAlpha = (this.smoothingMode === 'raw') 
      ? 0.92 
      : (isCrown ? 0.82 : 0.45);

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      const vx = solver.vx[i];
      const vy = solver.vy[i];
      const spd = Math.hypot(vx, vy);

      let rgb = baseColor;
      if (mode === 'viscosity') {
        const norm = Math.max(0, Math.min(1.0, (solver.eta[i] - etaMin) / (etaMax - etaMin)));
        rgb = FluidRenderer.sampleRainbow(norm);
      } else if (mode === 'velocity') {
        const norm = Math.max(0, Math.min(1.0, spd / vMax));
        rgb = FluidRenderer.sampleRainbow(norm);
      } else if (mode === 'peaking') {
        rgb = solver.isSettled[i] === 2 ? [16, 185, 129] : [56, 189, 248];
      }

      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${particleAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, blendR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 【光沢ハイライトスキン (Top Specular Coat)】
    if (this.smoothingMode !== 'raw' && (mode === 'realistic' || mode === 'monochrome')) {
      const glossAlpha = (mode === 'monochrome') ? 0.25 : (fluidGloss * 0.35);
      ctx.fillStyle = `rgba(255, 255, 255, ${glossAlpha})`;
      for (let i = 0; i < N; i += 3) {
        const px = solver.x[i];
        const py = solver.y[i];
        ctx.beginPath();
        ctx.arc(px - 0.5, py - 0.5, blendR * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ツノ立ちピーク位置とレベリングラインのオーバーレイ (peaking解析モード時のみ)
    if (solver.testMode === 'filling' && mode === 'peaking' && solver.peakHeightMm > 1.0) {
      const halfW = solver.container.width * 0.5;
      const rightEdge = solver.nozzleX + halfW;
      let minPileY = solver.container.bottomY;
      for (let i = 0; i < N; i++) {
        if (solver.isSettled[i] === 1 && solver.y[i] < minPileY) {
          minPileY = solver.y[i];
        }
      }

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(solver.nozzleX - halfW, minPileY);
      ctx.lineTo(solver.nozzleX + halfW, minPileY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f43f5e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`▲ ツノ立ち: ${solver.peakHeightMm.toFixed(1)}mm`, rightEdge + 8, minPileY + 3);
    }

    ctx.restore();
  }

  /**
   * 充填メトリクスオーバーレイ
   */
  _renderOverlay(ctx, solver) {
    const c = solver.container;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const nx = solver.nozzleX;
    const nr = Math.max(7, solver.nozzleRadiusPx);
    const mountW = Math.max(26, nr * 2.6);
    const mountLeftX = nx - (mountW * 0.5);

    ctx.save();

    // 画面左上 HUD: 簡略モード (超コンパクト・ミニマルHUD)
    // 幅148px × 高さ56px に凝縮し、サイドバー表示時や狭い画面でもノズルと一切かぶらない
    let hudX = 10;
    let hudY = 10;
    let hudW = 148;
    let hudH = 56;

    // もしノズル左端までのスペースが狭い場合はさらに自動調整
    if (mountLeftX - hudX < 155 && mountLeftX > 60) {
      hudW = Math.max(120, mountLeftX - hudX - 8);
    } else if (mountLeftX <= 60) {
      // ノズルが極端に左にある場合の退避
      hudY = Math.max(10, h - 140);
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, hudX, hudY, hudW, hudH, 5);
    ctx.fill();
    ctx.stroke();

    const textX = hudX + 7;
    const isUltraSmall = hudW < 135;
    const fsTitle = isUltraSmall ? '9.5px' : '10.5px';
    const fsSub = isUltraSmall ? '8.5px' : '9.5px';

    // 1行目: 充填率 & 注入量
    ctx.font = `bold ${fsTitle} sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`🧴 充填: ${solver.fillPercentage.toFixed(1)}% (${solver.filledVolumeMl.toFixed(1)}mL)`, textX, hudY + 15);

    // 2行目: ツノ立ち高さ & 平坦度
    ctx.font = `${fsSub} sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`ツノ: ${solver.peakHeightMm.toFixed(1)}mm  平坦: ${solver.levelingFlatness.toFixed(0)}%`, textX, hudY + 31);

    // 3行目: 状態ステータス
    if (solver.isFilled) {
      ctx.fillStyle = '#10b981';
      ctx.font = `bold ${fsSub} sans-serif`;
      ctx.fillText('✅ 規定量充填完了', textX, hudY + 47);
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.font = `${fsSub} sans-serif`;
      ctx.fillText('⚡ 注入充填中...', textX, hudY + 47);
    }

    ctx.restore();
  }

  _drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * 傾斜板・垂直板の描画 (高コントラスト精密定規スケール、基板テクスチャ、角度分度器、滴下基準線)
   */
  _renderSaggingPlate(ctx, solver) {
    const geom = solver.getPlateGeometry();
    const L = geom.L;
    const plateThick = 14.0;
    const pxPerMm = solver.pixelPerMm; // 4.0 px/mm

    ctx.save();

    // 1. 角度分度器 (アークガイド & 角度ラベル)
    if (geom.angleDeg > 0) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);

      // 水平基準破線
      ctx.beginPath();
      ctx.moveTo(geom.p0x, geom.p0y);
      ctx.lineTo(geom.p0x + 120, geom.p0y);
      ctx.stroke();

      // 円弧
      ctx.beginPath();
      ctx.arc(geom.p0x, geom.p0y, 75, 0, geom.angleRad, false);
      ctx.stroke();
      ctx.setLineDash([]);

      // 角度ラベル
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      const labelRad = geom.angleRad * 0.5;
      const lx = geom.p0x + 88 * Math.cos(labelRad);
      const ly = geom.p0y + 88 * Math.sin(labelRad);
      ctx.fillText(`θ = ${geom.angleDeg.toFixed(0)}° (傾斜角)`, lx, ly);
    }

    // 2. 傾斜板本体 (角丸ポリゴン)
    const visualHalfLength = Math.hypot(ctx.canvas.width, ctx.canvas.height);
    const p0 = { x: geom.cx - visualHalfLength * geom.tx, y: geom.cy - visualHalfLength * geom.ty };
    const p1 = { x: geom.cx + visualHalfLength * geom.tx, y: geom.cy + visualHalfLength * geom.ty };
    const p2 = { x: p1.x - plateThick * geom.nx, y: p1.y - plateThick * geom.ny };
    const p3 = { x: p0.x - plateThick * geom.nx, y: p0.y - plateThick * geom.ny };

    // 材質テクスチャ
    let gradPlate = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
    let strokeColor = 'rgba(255, 255, 255, 0.4)';
    if (solver.substrateType === 'sus') {
      gradPlate.addColorStop(0, '#64748b');
      gradPlate.addColorStop(0.3, '#94a3b8');
      gradPlate.addColorStop(0.7, '#475569');
      gradPlate.addColorStop(1, '#1e293b');
      strokeColor = 'rgba(226, 232, 240, 0.75)';
    } else if (solver.substrateType === 'glass') {
      gradPlate.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      gradPlate.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
      gradPlate.addColorStop(1, 'rgba(14, 165, 233, 0.55)');
      strokeColor = 'rgba(125, 211, 252, 0.9)';
    } else if (solver.substrateType === 'silicone') {
      // 撥水シリコーンコート板 (フロスト半透明ホワイト & 滑らかなシリコン光沢)
      gradPlate.addColorStop(0, 'rgba(241, 245, 249, 0.65)');
      gradPlate.addColorStop(0.4, 'rgba(203, 213, 225, 0.45)');
      gradPlate.addColorStop(0.8, 'rgba(148, 163, 184, 0.35)');
      gradPlate.addColorStop(1, 'rgba(100, 116, 139, 0.55)');
      strokeColor = 'rgba(248, 250, 252, 0.85)';
    } else {
      // acrylic
      gradPlate.addColorStop(0, 'rgba(203, 213, 225, 0.4)');
      gradPlate.addColorStop(0.5, 'rgba(148, 163, 184, 0.2)');
      gradPlate.addColorStop(1, 'rgba(71, 85, 105, 0.5)');
      strokeColor = 'rgba(203, 213, 225, 0.7)';
    }

    ctx.fillStyle = gradPlate;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. 【超高視認性 精密ミリ目盛り定規スケール帯】
    // 板の側面・裏側 (法線マイナス側) にくっきりとした定規トラックを描画
    const rulerThick = 18.0;
    const r0 = { x: geom.p0x, y: geom.p0y };
    const r1 = { x: geom.p0x + (L + 60) * geom.tx, y: geom.p0y + (L + 60) * geom.ty };
    const r2 = { x: r1.x - rulerThick * geom.nx, y: r1.y - rulerThick * geom.ny };
    const r3 = { x: r0.x - rulerThick * geom.nx, y: r0.y - rulerThick * geom.ny };

    // 定規のコントラスト背景 (ダークスレート & グロー枠)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r0.x, r0.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.lineTo(r2.x, r2.y);
    ctx.lineTo(r3.x, r3.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 目盛り刻み (1mm, 5mm, 10mm)
    const maxMm = Math.floor((L + 50) / pxPerMm);
    const dropS = 27.0 * pxPerMm; // 滴下基準位置 (27 mm)

    for (let mm = 0; mm <= maxMm; mm += 1) {
      const s = mm * pxPerMm;
      const isMajor10 = (mm % 10 === 0);
      const isMajor5 = (mm % 5 === 0);

      // 目盛り線の長さ
      let tickLen = 3.5;
      let tickWidth = 0.8;
      let tickColor = 'rgba(203, 213, 225, 0.45)';

      if (isMajor10) {
        tickLen = 12.0;
        tickWidth = 1.8;
        tickColor = '#f8fafc';
      } else if (isMajor5) {
        tickLen = 7.5;
        tickWidth = 1.2;
        tickColor = '#38bdf8';
      }

      const txStart = geom.p0x + s * geom.tx;
      const tyStart = geom.p0y + s * geom.ty;
      const txEnd = txStart - tickLen * geom.nx;
      const tyEnd = tyStart - tickLen * geom.ny;

      ctx.strokeStyle = tickColor;
      ctx.lineWidth = tickWidth;
      ctx.beginPath();
      ctx.moveTo(txStart, tyStart);
      ctx.lineTo(txEnd, tyEnd);
      ctx.stroke();

      // 10mm ごとの目盛り数値 (クッキリ表示)
      if (isMajor10) {
        const lx = txStart - (tickLen + 3.5) * geom.nx;
        const ly = tyStart - (tickLen + 3.5) * geom.ny;

        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(geom.angleRad);

        // 文字の影 (黒縁取りで 100% の視認性を確保)
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 3;
        ctx.strokeText(`${mm}`, 0, 0);

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${mm}`, 0, 0);
        ctx.restore();
      }
    }

    // 4. 【滴下基準位置 (0 mm) マーカー & ガイドライン】
    const dx0 = geom.p0x + dropS * geom.tx;
    const dy0 = geom.p0y + dropS * geom.ty;

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(dx0 - 16 * geom.nx, dy0 - 16 * geom.ny);
    ctx.lineTo(dx0 + 26 * geom.nx, dy0 + 26 * geom.ny);
    ctx.stroke();
    ctx.setLineDash([]);

    // 滴下基準バッジ
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.2;
    const badgeX = dx0 + 28 * geom.nx;
    const badgeY = dy0 + 28 * geom.ny;
    this._drawRoundRect(ctx, badgeX - 4, badgeY - 10, 105, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`📍 滴下基準 (0 mm)`, badgeX + 2, badgeY);

    ctx.restore();
  }

  /**
   * 濡れ跡 (Wetting Trace / Residual Film) の美麗描画
   * 流体が傾斜板上を流下した際に残る薄い液膜・濡れツヤ光沢をリアルに再現
   */
  _renderWettingTrace(ctx, solver, currentPreset) {
    if (solver.wettingMinS >= solver.wettingMaxS || solver.numParticles === 0) return;

    const geom = solver.getPlateGeometry();
    const minS = Math.max(0, solver.wettingMinS);
    const maxS = Math.min(geom.L + 80, solver.wettingMaxS);
    if (maxS - minS < 2.0) return;

    ctx.save();

    // 濡れ膜の始点と終点
    const startX = geom.p0x + minS * geom.tx;
    const startY = geom.p0y + minS * geom.ty;
    const endX = geom.p0x + maxS * geom.tx;
    const endY = geom.p0y + maxS * geom.ty;

    // 濡れ膜の厚み (約 2.5px = 0.6mm の極薄残膜)
    const filmThick = 2.5;

    // 濡れ跡ポリゴン (板の表面にぴったり密着)
    const p0 = { x: startX, y: startY };
    const p1 = { x: endX, y: endY };
    const p2 = { x: endX + filmThick * geom.nx, y: endY + filmThick * geom.ny };
    const p3 = { x: startX + filmThick * geom.nx, y: startY + filmThick * geom.ny };

    if (this.renderMode === 'monochrome') {
      // 単色モード: 鮮やかなネオンアクアの濡れ膜トレース
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

    } else {
      // 化粧品テクスチャモード: 上品なしっとり濡れツヤ光沢 (Wet Glossy Sheen)
      const baseColor = currentPreset?.color || [255, 250, 240];
      const r = baseColor[0], g = baseColor[1], b = baseColor[2];

      // 半透明の薄い液膜
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.38)`;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();

      // 濡れ膜表面のツヤハイライト線 (表面張力メニスカスの光沢)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // 濡れ跡の境界点インジケーター (微細な丸み)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(p3.x, p3.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 放置試験 HUD & たれ先端トラッキングコールアウト描画
   */
  _renderSaggingOverlay(ctx, solver) {
    const geom = solver.getPlateGeometry();

    ctx.save();

    // 1. 先端位置のトラッキングライン & コールアウト
    if (solver.numParticles > 0) {
      let maxS = -1e9;
      for (let i = 0; i < solver.numParticles; i++) {
        const dx = solver.x[i] - geom.p0x;
        const dy = solver.y[i] - geom.p0y;
        const s = dx * geom.tx + dy * geom.ty;
        if (s > maxS) maxS = s;
      }

      const fx = geom.p0x + maxS * geom.tx;
      const fy = geom.p0y + maxS * geom.ty;

      // 先端トラッキング線 (赤色)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(fx - 4 * geom.nx, fy - 4 * geom.ny);
      ctx.lineTo(fx + 26 * geom.nx, fy + 26 * geom.ny);
      ctx.stroke();
      ctx.setLineDash([]);

      // たれ移動距離マーカー
      const markerX = fx + 30 * geom.nx;
      const markerY = fy + 30 * geom.ny;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1;
      this._drawRoundRect(ctx, markerX - 4, markerY - 12, 115, 24, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fda4af';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`たれ先端: ${solver.sagDistanceMm.toFixed(1)} mm`, markerX + 2, markerY + 4);
    }

    // 2. 左上 HUD: 放置試験計測パネル
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, 16, 16, 280, 136, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('📐 傾斜板・垂直板放置試験ステータス', 28, 36);

    const targetStr = solver.targetSagTimeSec > 0 ? ` (目標: ${solver.targetSagTimeSec.toFixed(0)}s)` : ' (無制限)';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`放置時間: ${solver.sagTimerSec.toFixed(1)} s${targetStr}`, 28, 56);
    ctx.fillText(`傾斜角度: ${geom.angleDeg.toFixed(0)}° (基板: ${solver.substrateType.toUpperCase()})`, 28, 76);
    ctx.fillText(`たれ移動距離: ${solver.sagDistanceMm.toFixed(1)} mm`, 28, 96);
    ctx.fillText(`先端流速: ${solver.sagVelocityMmS.toFixed(2)} mm/s`, 28, 116);

    if (solver.isSagTimeReached) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('🏁 [完了] 目標放置時間到達 (評価確定)', 28, 136);
    } else if (solver.isSagArrested) {
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('✅ [静止] 降伏応力による自立停止 (No-Sag)', 28, 136);
    } else {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('⏳ [流下中] 垂れ流動進行中...', 28, 136);
    }

    ctx.restore();
  }

  /**
   * 容器充填流体の連続面メッシュ形成 (Filling Fluid Mesh Body)
   * 隙間のない中身の詰まった1枚の連続流体面として塗りつぶし
   */
  _renderFillingFluidMesh(ctx, solver, baseColor, fluidGloss, mode) {
    const c = solver.container;
    const halfW = c.width * 0.5;
    const leftX = solver.nozzleX - halfW;
    const rightX = solver.nozzleX + halfW;
    const bottomY = c.bottomY;
    const numBins = 64;
    const binW = c.width / numBins;

    const topYByBin = new Float32Array(numBins).fill(bottomY);
    const bottomYByBin = new Float32Array(numBins).fill(0);
    const countByBin = new Uint16Array(numBins).fill(0);
    const hasBedContact = new Uint8Array(numBins).fill(0);
    const N = solver.numParticles;

    // 1. 各ビンの液面高さと底面接触判定
    // 実際に底面に着液・堆積している流体層 (isSettled === 1) のみを正確にサンプリング
    let totalBedCount = 0;
    const nr = Math.max(3.0, solver.nozzleRadiusPx * 0.9);
    const nx = solver.nozzleX;

    // 底面堆積層の実際の最高高さを事前算出 (ツノ立ち高さに応じた自然な厚み)
    const peakHeightPx = Math.max(0.0, (solver.peakHeightMm || 0.0) * solver.pixelPerMm);

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      if (px >= leftX - 4 && px <= rightX + 4 && py <= bottomY + 2) {
        const bin = Math.min(numBins - 1, Math.max(0, Math.floor((px - leftX) / binW)));
        
        // 空中落下粒子 (isSettled !== 1 かつ ノズル直下の空中高度) を底面メッシュから確実に除外
        const isSettledParticle = (solver.isSettled[i] === 1 || py >= bottomY - 6.0);
        if (isSettledParticle) {
          if (py < topYByBin[bin]) {
            topYByBin[bin] = py;
          }
          if (py > bottomYByBin[bin]) {
            bottomYByBin[bin] = py;
          }
          countByBin[bin]++;

          if (py >= bottomY - 8.0) {
            hasBedContact[bin] = 1;
            totalBedCount++;
          }
        }
      }
    }

    // 2. 【底面堆積流体の面形成】(実際に底面に着液・堆積している部分のみ)
    if (totalBedCount >= 3) {
      const rawContour = [];
      let firstBin = -1;
      let lastBin = -1;

      for (let b = 0; b < numBins; b++) {
        // 底面と接触しており、液面が形成されているビンのみ
        if (hasBedContact[b] === 1 && topYByBin[b] < bottomY - 0.5) {
          if (firstBin === -1) firstBin = b;
          lastBin = b;
          rawContour.push({
            x: leftX + (b + 0.5) * binW,
            y: topYByBin[b]
          });
        }
      }

      if (rawContour.length >= 2) {
        const useTaubin = this.smoothingMode === 'taubin';
        const smoothedContour = MeshSmoother.smoothContour2D(
          rawContour,
          this.smoothingIterations,
          useTaubin,
          0.35,
          -0.36
        );

        ctx.save();

        const gradBody = ctx.createLinearGradient(0, topYByBin[Math.floor(numBins / 2)], 0, bottomY);
        gradBody.addColorStop(0, `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
        gradBody.addColorStop(0.7, `rgb(${Math.max(0, baseColor[0] - 15)}, ${Math.max(0, baseColor[1] - 15)}, ${Math.max(0, baseColor[2] - 15)})`);
        gradBody.addColorStop(1, `rgb(${Math.max(0, baseColor[0] - 30)}, ${Math.max(0, baseColor[1] - 30)}, ${Math.max(0, baseColor[2] - 30)})`);

        ctx.fillStyle = (mode === 'monochrome') ? 'rgb(0, 240, 255)' : gradBody;
        ctx.beginPath();
        
        const startX = Math.max(leftX, smoothedContour[0].x - binW);
        const endX = Math.min(rightX, smoothedContour[smoothedContour.length - 1].x + binW);

        ctx.moveTo(startX, bottomY);
        ctx.lineTo(smoothedContour[0].x, smoothedContour[0].y);

        for (let i = 1; i < smoothedContour.length; i++) {
          const pPrev = smoothedContour[i - 1];
          const pCurr = smoothedContour[i];
          const midX = (pPrev.x + pCurr.x) * 0.5;
          const midY = (pPrev.y + pCurr.y) * 0.5;
          ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
        }

        ctx.lineTo(smoothedContour[smoothedContour.length - 1].x, smoothedContour[smoothedContour.length - 1].y);
        ctx.lineTo(endX, bottomY);
        ctx.closePath();
        ctx.fill();

        // 上部液面メニスカス・光沢ハイライト
        if (mode === 'realistic') {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fluidGloss * 0.65})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(smoothedContour[0].x, smoothedContour[0].y);
          for (let i = 1; i < smoothedContour.length; i++) {
            const pPrev = smoothedContour[i - 1];
            const pCurr = smoothedContour[i];
            const midX = (pPrev.x + pCurr.x) * 0.5;
            const midY = (pPrev.y + pCurr.y) * 0.5;
            ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
          }
          ctx.lineTo(smoothedContour[smoothedContour.length - 1].x, smoothedContour[smoothedContour.length - 1].y);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    // 3. 【ノズル吐出流体柱 (Jet Stream Body)】
    // ノズルから落下中の流体柱を正確な上下端（実粒子存在範囲）で形成
    // 堆積液面の最高高さ
    let highestBedY = bottomY;
    if (totalBedCount >= 3) {
      for (let b = 0; b < numBins; b++) {
        if (hasBedContact[b] === 1 && topYByBin[b] < highestBedY) {
          highestBedY = topYByBin[b];
        }
      }
    }

    // 堆積液面よりも上に実際に存在している空中流体粒子のみをサンプリング
    const jetParticles = [];
    const minJetY = solver.nozzleY - 2;
    const maxAllowedY = highestBedY + 2.0;

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      if (py >= minJetY && py <= maxAllowedY && Math.abs(px - solver.nozzleX) < solver.nozzleRadiusPx * 2.8) {
        jetParticles.push({ x: px, y: py });
      }
    }

    // 空中粒子が4個以上ある場合のみ流体柱を形成 (充填完了後や液切れ後は自動消滅)
    if (jetParticles.length >= 4) {
      let highestJetY = 999999;
      let lowestJetY = -999999;
      for (let p of jetParticles) {
        if (p.y < highestJetY) highestJetY = p.y;
        if (p.y > lowestJetY) lowestJetY = p.y;
      }

      // ノズル先端にまだ粒子が供給されているか判定
      const isAttachedToNozzle = (highestJetY <= solver.nozzleY + 6.0) && !solver.isFilled;
      const topY = isAttachedToNozzle ? solver.nozzleY : Math.max(solver.nozzleY, highestJetY - 2.0);
      const isReachingBed = (lowestJetY >= highestBedY - 4.0);
      const targetTipY = isReachingBed ? highestBedY : (lowestJetY + 2.0);

      // 上端と下端に有効な高さ差がある場合のみ描画
      if (targetTipY - topY > 3.0) {
        ctx.save();
        const nrTop = Math.max(2.8, solver.nozzleRadiusPx * 0.88);
        const nx = solver.nozzleX;
        const jetLen = targetTipY - topY;

        // 重力加速 (連続の式 Q=Av) および界面張力による先端ネックダウン (細身化) 率
        // 落下距離が長いほど流速が増加して断面積が絞られ、先端が細くなる
        const neckingRatio = Math.max(0.52, Math.pow(1.0 + 0.0075 * jetLen, -0.32));
        const nrTip = nrTop * neckingRatio;

        const gradJet = ctx.createLinearGradient(nx - nrTop, 0, nx + nrTop, 0);
        gradJet.addColorStop(0, `rgb(${Math.max(0, baseColor[0] - 20)}, ${Math.max(0, baseColor[1] - 20)}, ${Math.max(0, baseColor[2] - 20)})`);
        gradJet.addColorStop(0.3, `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
        gradJet.addColorStop(0.7, `rgb(${Math.min(255, baseColor[0] + 15)}, ${Math.min(255, baseColor[1] + 15)}, ${Math.min(255, baseColor[2] + 15)})`);
        gradJet.addColorStop(1, `rgb(${Math.max(0, baseColor[0] - 15)}, ${Math.max(0, baseColor[1] - 15)}, ${Math.max(0, baseColor[2] - 15)})`);

        ctx.fillStyle = (mode === 'monochrome') ? 'rgb(0, 240, 255)' : gradJet;

        ctx.beginPath();

        if (isAttachedToNozzle) {
          // ノズル口元に接続 (口元半径 nrTop)
          ctx.moveTo(nx - nrTop, topY);
          ctx.lineTo(nx + nrTop, topY);
        } else {
          // ノズルから離れて落下中の場合: 上端を丸いドームとして閉じる
          ctx.moveTo(nx - nrTop, topY + nrTop * 0.8);
          ctx.quadraticCurveTo(nx - nrTop, topY, nx, topY);
          ctx.quadraticCurveTo(nx + nrTop, topY, nx + nrTop, topY + nrTop * 0.8);
        }

        // 右側輪郭: 重力加速による美しいテーパー・ネックダウン曲線
        const midY = topY + jetLen * 0.55;
        const midNr = (nrTop + nrTip) * 0.52;
        ctx.quadraticCurveTo(nx + midNr, midY, nx + nrTip, targetTipY - (isReachingBed ? 0 : nrTip * 0.8));

        if (!isReachingBed) {
          // 空中落下先端: 表面張力による丸いしずくドーム (細くなった先端半径 nrTip)
          ctx.quadraticCurveTo(nx + nrTip, targetTipY, nx, targetTipY);
          ctx.quadraticCurveTo(nx - nrTip, targetTipY, nx - nrTip, targetTipY - nrTip * 0.8);
        } else {
          // 接液部: 表面張力メニスカスによる自然な接続フィレット
          ctx.lineTo(nx + nrTip * 1.25, targetTipY);
          ctx.lineTo(nx - nrTip * 1.25, targetTipY);
          ctx.lineTo(nx - nrTip, targetTipY - 2.0);
        }

        // 左側輪郭: 上部へ戻るテーパー曲線
        ctx.quadraticCurveTo(nx - midNr, midY, nx - nrTop, topY + (isAttachedToNozzle ? 0 : nrTop * 0.8));

        ctx.closePath();
        ctx.fill();

        // ジェット流の縦光沢ハイライト (先細り追従)
        if (mode === 'realistic') {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fluidGloss * 0.6})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(nx - nrTop * 0.25, topY);
          ctx.lineTo(nx - nrTip * 0.25, targetTipY - 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }
  }

  /**
   * 傾斜板・垂直板上の液滴の連続面メッシュ形成 (Sagging Droplet Mesh Body)
   * 滴下起点からたれ先端まで隙間のない美しい1枚の連続流体面（メッシュ）として塗りつぶし
   */
  _renderSaggingDropletMesh(ctx, solver, baseColor, fluidGloss, mode) {
    const geom = solver.getPlateGeometry();
    const N = solver.numParticles;
    if (N < 3) return;

    // 1. 全アクティブ粒子の板座標系 (s: 板に沿った距離, h: 板からの法線高さ) をスキャン
    let minS = 1e9;
    let maxS = -1e9;
    const sArr = new Float32Array(N);
    const hArr = new Float32Array(N);
    let validCount = 0;

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      const dx = px - geom.p0x;
      const dy = py - geom.p0y;
      const s = dx * geom.tx + dy * geom.ty;
      const h = dx * geom.nx + dy * geom.ny;

      sArr[i] = s;
      hArr[i] = h;

      if (h >= -3.0 && h <= 60.0) {
        if (s < minS) minS = s;
        if (s > maxS) maxS = s;
        validCount++;
      }
    }

    if (validCount < 3 || maxS - minS < 2.0) return;

    // 滴下起点（濡れ跡開始点）から先端までを一体の涙滴（ティアドロップ）メッシュとして連続サンプリング
    const effMinS = Math.min(minS, (solver.wettingMinS < 1e8 ? solver.wettingMinS : minS));
    const totalSpan = maxS - effMinS;
    if (totalSpan < 2.0) return;

    // 2. 高解像度ビンサンプリング (96ビン)
    const numBins = 96;
    const binW = totalSpan / numBins;
    const maxHByBin = new Float32Array(numBins).fill(0);
    const countByBin = new Uint16Array(numBins).fill(0);

    for (let i = 0; i < N; i++) {
      const s = sArr[i];
      const h = hArr[i];
      if (s >= effMinS && s <= maxS && h >= -3.0 && h <= 60.0) {
        const bin = Math.min(numBins - 1, Math.max(0, Math.floor((s - effMinS) / binW)));
        if (h > maxHByBin[bin]) {
          maxHByBin[bin] = h;
        }
        countByBin[bin]++;
      }
    }

    // 3. ギャップ補間と濡れ残膜・涙滴フロントの自然な厚み形成
    const rawContour = [];
    const pr = solver.particleRadius || 1.8;

    // 開始端部 (滴下起点・濡れ膜立ち上がり)
    const startS = Math.max(0, effMinS - 1.5);
    rawContour.push({
      x: geom.p0x + startS * geom.tx,
      y: geom.p0y + startS * geom.ty,
      s: startS,
      h: 0
    });

    let lastKnownH = 2.5;
    for (let b = 0; b < numBins; b++) {
      const s = effMinS + (b + 0.5) * binW;
      let h = maxHByBin[b];

      if (countByBin[b] > 0 && h > 0.2) {
        h = Math.max(2.5, h + pr * 1.1); // 粒子径分を覆うふくらみ
        lastKnownH = h;
      } else {
        // 濡れ残膜領域 (粒子が前方に流下した後の薄い液膜: 約2.5px = 0.6mm)
        const isTailRegion = (s < minS);
        h = isTailRegion ? 2.5 : Math.max(2.2, lastKnownH * 0.7);
      }

      rawContour.push({
        x: geom.p0x + s * geom.tx + h * geom.nx,
        y: geom.p0y + s * geom.ty + h * geom.ny,
        s: s,
        h: h
      });
    }

    // 先端端部 (たれフロントの丸いキャップ)
    const endS = maxS + pr * 1.2;
    rawContour.push({
      x: geom.p0x + endS * geom.tx,
      y: geom.p0y + endS * geom.ty,
      s: endS,
      h: 0
    });

    if (rawContour.length < 3) return;

    // 4. MeshSmoother による Taubin / Laplacian 平滑化
    const useTaubin = this.smoothingMode === 'taubin';
    const smoothedContour = MeshSmoother.smoothContour2D(
      rawContour,
      this.smoothingIterations,
      useTaubin,
      0.35,
      -0.36
    );

    ctx.save();

    // 5. 液滴・流体膜グラデーション (板の表面に向かう立体的な陰影)
    const midIdx = Math.floor(smoothedContour.length / 2);
    const midPt = smoothedContour[midIdx];

    const gradDroplet = ctx.createLinearGradient(
      midPt.x, midPt.y,
      midPt.x - 14 * geom.nx, midPt.y - 14 * geom.ny
    );
    gradDroplet.addColorStop(0, `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
    gradDroplet.addColorStop(0.65, `rgb(${Math.max(0, baseColor[0] - 16)}, ${Math.max(0, baseColor[1] - 16)}, ${Math.max(0, baseColor[2] - 16)})`);
    gradDroplet.addColorStop(1, `rgb(${Math.max(0, baseColor[0] - 32)}, ${Math.max(0, baseColor[1] - 32)}, ${Math.max(0, baseColor[2] - 32)})`);

    ctx.fillStyle = (mode === 'monochrome') ? 'rgb(0, 240, 255)' : gradDroplet;

    // 6. 接地面を含めた完全な閉じた流体面ポリゴン (Closed Fluid Sheet Polygon)
    ctx.beginPath();
    ctx.moveTo(smoothedContour[0].x, smoothedContour[0].y);

    for (let i = 1; i < smoothedContour.length; i++) {
      const pPrev = smoothedContour[i - 1];
      const pCurr = smoothedContour[i];
      const midX = (pPrev.x + pCurr.x) * 0.5;
      const midY = (pPrev.y + pCurr.y) * 0.5;
      ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
    }
    ctx.lineTo(smoothedContour[smoothedContour.length - 1].x, smoothedContour[smoothedContour.length - 1].y);

    const baseStart = { x: geom.p0x + startS * geom.tx, y: geom.p0y + startS * geom.ty };
    ctx.lineTo(baseStart.x, baseStart.y);
    ctx.closePath();
    ctx.fill();

    // 7. 液膜・液滴表面の光沢ハイライトライン (Specular Sheen)
    if (mode === 'realistic' || mode === 'monochrome') {
      const glossAlpha = (mode === 'monochrome') ? 0.45 : (fluidGloss * 0.75);
      ctx.strokeStyle = `rgba(255, 255, 255, ${glossAlpha})`;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(smoothedContour[1].x, smoothedContour[1].y);
      for (let i = 2; i < smoothedContour.length - 1; i++) {
        const pPrev = smoothedContour[i - 1];
        const pCurr = smoothedContour[i];
        const midX = (pPrev.x + pCurr.x) * 0.5;
        const midY = (pPrev.y + pCurr.y) * 0.5;
        ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
      }
      ctx.lineTo(smoothedContour[smoothedContour.length - 2].x, smoothedContour[smoothedContour.length - 2].y);
      ctx.stroke();

      const lastPt = smoothedContour[smoothedContour.length - 2];
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, glossAlpha + 0.2)})`;
      ctx.beginPath();
      ctx.arc(lastPt.x - 1.2 * geom.tx, lastPt.y - 1.2 * geom.ty, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 🎨 塗布試験: 水平コーティングステージ＆精密ミリ目盛りスケールの描画
   */
  _renderCoatingSubstrate(ctx, solver) {
    const bottomY = solver.coatingStageBottomY; // 480.0
    const stageLeftX = 100.0;
    const stageRightX = 580.0;
    const stageWidth = stageRightX - stageLeftX;
    const stageThick = 24.0;
    const pxPerMm = solver.pixelPerMm; // 4.0 px/mm
    const substrate = solver.coatingSubstrateType || solver.substrateType || 'sus';
    const roughness = solver.coatingRoughness || 'smooth';

    ctx.save();

    // 1. コーティングステージ本体 (SUS304研磨 / 高精度ガラス / アクリル / シリコーン)
    let gradStage = ctx.createLinearGradient(0, bottomY - 4, 0, bottomY + stageThick);
    let strokeColor = 'rgba(56, 189, 248, 0.45)';

    if (substrate === 'sus') {
      gradStage.addColorStop(0, '#64748b');
      gradStage.addColorStop(0.3, '#94a3b8');
      gradStage.addColorStop(0.7, '#475569');
      gradStage.addColorStop(1, '#1e293b');
      strokeColor = 'rgba(226, 232, 240, 0.75)';
    } else if (substrate === 'glass') {
      gradStage.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      gradStage.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
      gradStage.addColorStop(1, 'rgba(14, 165, 233, 0.55)');
      strokeColor = 'rgba(125, 211, 252, 0.9)';
    } else if (substrate === 'silicone') {
      gradStage.addColorStop(0, 'rgba(241, 245, 249, 0.65)');
      gradStage.addColorStop(0.5, 'rgba(148, 163, 184, 0.35)');
      gradStage.addColorStop(1, 'rgba(100, 116, 139, 0.55)');
      strokeColor = 'rgba(248, 250, 252, 0.85)';
    } else {
      // acrylic
      gradStage.addColorStop(0, 'rgba(203, 213, 225, 0.4)');
      gradStage.addColorStop(0.5, 'rgba(148, 163, 184, 0.2)');
      gradStage.addColorStop(1, 'rgba(71, 85, 105, 0.5)');
      strokeColor = 'rgba(203, 213, 225, 0.7)';
    }

    ctx.fillStyle = gradStage;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;

    // 基板ポリゴン (表面プロファイル getCoatingBedY に忠実な形状パス)
    ctx.beginPath();
    const plateMinX = stageLeftX - 10;
    const plateMaxX = stageRightX + 10;
    const startBedY = solver.getCoatingBedY ? solver.getCoatingBedY(plateMinX) : bottomY;
    ctx.moveTo(plateMinX, startBedY);

    for (let rx = plateMinX; rx <= plateMaxX; rx += 2.0) {
      const ry = solver.getCoatingBedY ? solver.getCoatingBedY(rx) : bottomY;
      ctx.lineTo(rx, ry);
    }
    // 底面側の角丸長方形を閉じる
    ctx.lineTo(plateMaxX, bottomY + stageThick + 4);
    ctx.lineTo(plateMinX, bottomY + stageThick + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. 基板表面のテクスチャ (平滑鏡面 / ざらざら微細粗面 / 凸凹リブテクスチャ)
    if (roughness === 'smooth') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(plateMinX, bottomY);
      ctx.lineTo(plateMaxX, bottomY);
      ctx.stroke();
    } else if (roughness === 'rough') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let rx = plateMinX; rx <= plateMaxX; rx += 2.0) {
        const ry = solver.getCoatingBedY(rx);
        if (rx === plateMinX) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let rx = stageLeftX; rx < stageRightX; rx += 4.0) {
        const ry = solver.getCoatingBedY(rx);
        ctx.fillRect(rx, ry - 0.5, 1.2, 1.2);
      }
    } else if (roughness === 'textured') {
      // 凸凹溝のトップハイライト & 溝の陰影
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let rx = plateMinX; rx <= plateMaxX; rx += 1.5) {
        const ry = solver.getCoatingBedY(rx);
        if (rx === plateMinX) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.stroke();

      // 溝の陰影グラデーション
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      const lambda = 18.0;
      for (let rx = stageLeftX; rx < stageRightX; rx += lambda) {
        const midX = rx + lambda * 0.5;
        const ry = solver.getCoatingBedY(midX);
        ctx.beginPath();
        ctx.arc(midX, ry + 1.0, 4.0, 0, Math.PI);
        ctx.fill();
      }
    }

    // 3. 精密ミリ目盛りトラック (0 mm 〜 110 mm)
    const rulerY = bottomY + 2;
    const rulerH = 14;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(stageLeftX, rulerY, stageWidth, rulerH);

    const startX = solver.bladeStartX; // 180.0
    for (let mm = 0; mm <= 95; mm++) {
      const tx = startX + mm * pxPerMm;
      if (tx > stageRightX - 4) break;

      const isMajor10 = (mm % 10 === 0);
      const isMajor5 = (mm % 5 === 0);
      const tickH = isMajor10 ? 9 : (isMajor5 ? 6 : 3.5);
      const tickColor = isMajor10 ? '#f8fafc' : (isMajor5 ? '#38bdf8' : 'rgba(203, 213, 225, 0.45)');

      ctx.strokeStyle = tickColor;
      ctx.lineWidth = isMajor10 ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(tx, rulerY);
      ctx.lineTo(tx, rulerY + tickH);
      ctx.stroke();

      if (isMajor10) {
        ctx.font = '8.5px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(`${mm}`, tx, rulerY + 12);
      }
    }

    // 4. 塗工開始ライン (0 mm) & 終了ライン
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(startX, bottomY - 35);
    ctx.lineTo(startX, bottomY);
    ctx.moveTo(solver.bladeEndX, bottomY - 35);
    ctx.lineTo(solver.bladeEndX, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'center';
    ctx.fillText('0mm (塗工開始)', startX, bottomY - 38);
    ctx.fillText('終了', solver.bladeEndX, bottomY - 38);

    ctx.restore();
  }

  /**
   * 🎨 塗布試験: SUS製ドクターブレード＆マイクロメーターヘッド＆クリアランス隙間インジケーター描画
   */
  _renderDoctorBlade(ctx, solver) {
    const bottomY = solver.coatingStageBottomY; // 480.0
    const bx = solver.bladeX;
    const gapUm = solver.bladeGapUm;
    const gapPx = Math.max(1.8, (gapUm / 1000.0) * solver.pixelPerMm);
    const bladeTipY = bottomY - gapPx;

    const bladeW = 14.0;
    const bladeH = 110.0;
    const bladeTopY = bladeTipY - bladeH;

    ctx.save();

    // 1. ドクターブレード本体 (SUS316L 精密研削ブレード)
    const gradBlade = ctx.createLinearGradient(bx - bladeW, 0, bx, 0);
    gradBlade.addColorStop(0, '#475569');
    gradBlade.addColorStop(0.3, '#94a3b8');
    gradBlade.addColorStop(0.7, '#cbd5e1');
    gradBlade.addColorStop(1, '#334155');

    ctx.fillStyle = gradBlade;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;

    // 刃先斜めベベルカット (エッジ刃先)
    ctx.beginPath();
    ctx.moveTo(bx - bladeW, bladeTopY);
    ctx.lineTo(bx, bladeTopY);
    ctx.lineTo(bx, bladeTipY);
    ctx.lineTo(bx - 3, bladeTipY);
    ctx.lineTo(bx - bladeW, bladeTipY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ブレード先端の極細エッジハイライト (チタンブルーコート)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(bx - 3, bladeTipY - 1.5, 3, 1.5);

    // 2. 上部マイクロメーターヘッド (精密厚み調整ダイヤル)
    const micW = 24.0;
    const micH = 34.0;
    const micX = bx - (bladeW * 0.5) - (micW * 0.5);
    const micY = bladeTopY - micH;

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.2;
    this._drawRoundRect(ctx, micX, micY, micW, micH, 3);
    ctx.fill();
    ctx.stroke();

    // ダイヤル目盛り
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.8;
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(micX + 4, micY + k * 5);
      ctx.lineTo(micX + 10, micY + k * 5);
      ctx.stroke();
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('μm', micX + micW * 0.5, micY + micH - 4);

    // 3. クリアランスギャップ寸法インジケーター (引き出し線付きスマート寸法バッジ)
    const gapMidY = (bottomY + bladeTipY) * 0.5;

    // ギャップ先端の極小矢印・ドット
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx + 4, bottomY);
    ctx.lineTo(bx + 4, bladeTipY);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(bx + 4, gapMidY, 2.0, 0, Math.PI * 2);
    ctx.fill();

    // 引き出しリーダー線 (斜め右上 -> 水平)
    const leaderStartX = bx + 4;
    const leaderStartY = gapMidY;
    const leaderCornerX = bx + 22;
    const leaderCornerY = bladeTipY - 20;
    const leaderEndX = bx + 36;

    ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(leaderStartX, leaderStartY);
    ctx.lineTo(leaderCornerX, leaderCornerY);
    ctx.lineTo(leaderEndX, leaderCornerY);
    ctx.stroke();

    // ギャップ寸法バッジ (流体・目盛りと一切被らない上空クリアエリア)
    const badgeW = 66;
    const badgeH = 18;
    const badgeX = leaderCornerX + 6;
    const badgeY = leaderCornerY - 9;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`h = ${gapUm.toFixed(0)}μm`, badgeX + badgeW * 0.5, badgeY + 12);

    // 4. 塗工スキャン中の移動方向矢印 & 速度表示 (寸法バッジのさらに上部に配置)
    if (solver.isCoatingRunning) {
      const arrowX = bx + 22;
      const arrowY = bladeTipY - 52;

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9.5px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`▶ V = ${solver.bladeSpeedMmS.toFixed(0)} mm/s`, arrowX, arrowY);

      // 動的パルス矢印
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY + 8);
      ctx.lineTo(arrowX + 26, arrowY + 8);
      ctx.lineTo(arrowX + 20, arrowY + 4);
      ctx.moveTo(arrowX + 26, arrowY + 8);
      ctx.lineTo(arrowX + 20, arrowY + 12);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 🎨 塗布試験: スラリー溜まり＆引き延ばし薄膜の連続面メッシュ形成 (Coating Slurry Mesh Body)
   */
  _renderCoatingFluidMesh(ctx, solver, baseColor, fluidGloss, mode) {
    const N = solver.numParticles;
    if (N < 3) return;

    const bottomY = solver.coatingStageBottomY; // 480.0
    const bx = solver.bladeX;
    const startX = solver.bladeStartX;
    const pr = solver.particleRadius || 1.8;

    // 1. 全粒子のX座標範囲をスキャン
    let minX = 1e9;
    let maxX = -1e9;
    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
    }

    const totalSpan = Math.max(20.0, maxX - minX);
    const numBins = 96;
    const binW = totalSpan / numBins;

    const topYByBin = new Float32Array(numBins).fill(bottomY);
    const countByBin = new Uint16Array(numBins).fill(0);

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      if (px >= minX && px <= maxX && py <= bottomY + 2.0) {
        const bin = Math.min(numBins - 1, Math.max(0, Math.floor((px - minX) / binW)));
        if (py < topYByBin[bin]) {
          topYByBin[bin] = py;
        }
        countByBin[bin]++;
      }
    }

    // 2. 輪郭点列の構築 (スラリーバンクから塗膜への滑らかな連続メッシュ)
    const rawContour = [];
    rawContour.push({ x: minX - 1.0, y: bottomY });

    let lastKnownY = bottomY - 2.0;
    for (let b = 0; b < numBins; b++) {
      const x = minX + (b + 0.5) * binW;
      let y = topYByBin[b];

      if (countByBin[b] > 0 && y < bottomY - 0.5) {
        y = Math.min(bottomY - 1.2, y - pr * 0.8);
        lastKnownY = y;
      } else {
        // ギャップ補間
        y = Math.min(bottomY - 1.0, lastKnownY);
      }

      rawContour.push({ x, y });
    }

    rawContour.push({ x: maxX + 1.5, y: bottomY });

    if (rawContour.length < 3) return;

    // 3. MeshSmoother による平滑化
    const useTaubin = this.smoothingMode === 'taubin';
    const smoothedContour = MeshSmoother.smoothContour2D(
      rawContour,
      this.smoothingIterations,
      useTaubin,
      0.35,
      -0.36
    );

    ctx.save();

    // 4. スラリー塗膜グラデーション塗りつぶし
    const gradBody = ctx.createLinearGradient(0, bottomY - 40, 0, bottomY);
    gradBody.addColorStop(0, `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
    gradBody.addColorStop(0.65, `rgb(${Math.max(0, baseColor[0] - 16)}, ${Math.max(0, baseColor[1] - 16)}, ${Math.max(0, baseColor[2] - 16)})`);
    gradBody.addColorStop(1, `rgb(${Math.max(0, baseColor[0] - 32)}, ${Math.max(0, baseColor[1] - 32)}, ${Math.max(0, baseColor[2] - 32)})`);

    ctx.fillStyle = (mode === 'monochrome') ? 'rgb(0, 240, 255)' : gradBody;

    ctx.beginPath();
    ctx.moveTo(minX - 1.0, bottomY);
    ctx.lineTo(smoothedContour[0].x, smoothedContour[0].y);

    for (let i = 1; i < smoothedContour.length; i++) {
      const pPrev = smoothedContour[i - 1];
      const pCurr = smoothedContour[i];
      const midX = (pPrev.x + pCurr.x) * 0.5;
      const midY = (pPrev.y + pCurr.y) * 0.5;
      ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
    }

    ctx.lineTo(smoothedContour[smoothedContour.length - 1].x, smoothedContour[smoothedContour.length - 1].y);
    ctx.lineTo(maxX + 1.5, bottomY);
    ctx.closePath();
    ctx.fill();

    // 5. 塗膜表面の光沢ハイライトライン (Specular Sheen)
    if (mode === 'realistic' || mode === 'monochrome') {
      const glossAlpha = (mode === 'monochrome') ? 0.45 : (fluidGloss * 0.75);
      ctx.strokeStyle = `rgba(255, 255, 255, ${glossAlpha})`;
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(smoothedContour[1].x, smoothedContour[1].y);
      for (let i = 2; i < smoothedContour.length - 1; i++) {
        const pPrev = smoothedContour[i - 1];
        const pCurr = smoothedContour[i];
        const midX = (pPrev.x + pCurr.x) * 0.5;
        const midY = (pPrev.y + pCurr.y) * 0.5;
        ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
      }
      ctx.lineTo(smoothedContour[smoothedContour.length - 2].x, smoothedContour[smoothedContour.length - 2].y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 🎨 塗布試験: HUDオーバーレイ (塗工せん断速度、見かけ粘度、湿潤膜厚、ブレード抵抗、レベリング)
   */
  _renderCoatingOverlay(ctx, solver) {
    ctx.save();

    let hudX = 12;
    let hudY = 12;
    let hudW = 205;
    let hudH = 68;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, hudX, hudY, hudW, hudH, 6);
    ctx.fill();
    ctx.stroke();

    const textX = hudX + 9;

    // 1行目: タイトル
    ctx.font = 'bold 10.5px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('🎨 塗布・引き延ばし試験 (Doctor Blade)', textX, hudY + 15);

    // 2行目: 塗工せん断速度 \dot{\gamma} & 塗工粘度 \eta
    const shearRate = solver.coatingShearRate || 0.0;
    const visc = solver.coatingViscosity || 0.0;
    const viscStr = visc < 1.0 ? `${(visc * 1000).toFixed(0)} mPa·s` : `${visc.toFixed(2)} Pa·s`;
    ctx.font = '9.5px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`γ̇: ${shearRate.toFixed(0)} s⁻¹   η: ${viscStr}`, textX, hudY + 31);

    // 3行目: 湿潤塗布膜厚 h_wet & ブレード抵抗 \tau_w
    const filmUm = solver.coatingFilmThicknessUm || 0.0;
    const dragPa = solver.coatingDragForcePa || 0.0;
    ctx.font = '9.5px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`膜厚: ${filmUm.toFixed(0)} μm   抵抗: ${dragPa.toFixed(0)} Pa`, textX, hudY + 47);

    // 4行目: 状態ステータス
    if (solver.isCoatingRunning) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(`⚡ ブレード塗工中... (V=${solver.bladeSpeedMmS.toFixed(0)} mm/s)`, textX, hudY + 61);
    } else if (solver.coatingFinished) {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(`✅ 塗布完了 (平坦度: ${solver.coatingLevelingScore.toFixed(0)}%)`, textX, hudY + 61);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.fillText('⏸ 塗工待機中 (塗工開始をクリック)', textX, hudY + 61);
    }

    ctx.restore();
  }

  /**
   * 🔬 塗布試験: エッジ刃先 4.2x 精密顕微鏡拡大スコープ (Edge Microscope PIP View)
   */
  _renderCoatingMicroscopePIP(ctx, solver, currentPreset) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w < 480) return; // 画面幅が極端に狭いモバイル時は非表示

    const bottomY = solver.coatingStageBottomY; // 480.0
    const bx = solver.bladeX;
    const gapUm = solver.bladeGapUm;
    const gapPx = Math.max(1.8, (gapUm / 1000.0) * solver.pixelPerMm);
    const bladeTipY = bottomY - gapPx;

    // PIPウィンドウ幾何
    const pipW = Math.min(340, Math.max(260, w * 0.32));
    const pipH = 200;
    const pipX = w - pipW - 14;
    const pipY = 12;
    const radius = 8;
    const zoomM = 4.2; // 4.2倍拡大

    ctx.save();

    // 1. スコープ外枠・背景ベース (サイバーグラスモーフィズム)
    ctx.fillStyle = 'rgba(11, 17, 32, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(2, 132, 199, 0.4)';
    ctx.shadowBlur = 12;
    this._drawRoundRect(ctx, pipX, pipY, pipW, pipH, radius);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. 内部クリッピング領域の設定
    ctx.save();
    this._drawRoundRect(ctx, pipX + 1, pipY + 1, pipW - 2, pipH - 2, radius - 1);
    ctx.clip();

    // 3. 顕微鏡座標変換 (ブレード刃先中心にパン＆ズーム)
    const viewCenterX = pipX + pipW * 0.5;
    const viewCenterY = pipY + pipH * 0.5 + 20; // 少し下寄りにオフセット
    const focusX = bx;
    const focusY = (bottomY + bladeTipY) * 0.5;

    ctx.translate(viewCenterX, viewCenterY);
    ctx.scale(zoomM, zoomM);
    ctx.translate(-focusX, -focusY);

    // ── 拡大ワールド描画開始 ──

    // A. マイクログリッド背景 (50 μm / 100 μm 刻み)
    const gridSpacingPx = (0.05 * solver.pixelPerMm); // 50 μm
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.25)';
    ctx.lineWidth = 0.4 / zoomM;
    const minGridX = focusX - (pipW / zoomM);
    const maxGridX = focusX + (pipW / zoomM);
    const minGridY = focusY - (pipH / zoomM);
    const maxGridY = focusY + (pipH / zoomM);

    ctx.beginPath();
    for (let gx = Math.floor(minGridX / gridSpacingPx) * gridSpacingPx; gx <= maxGridX; gx += gridSpacingPx) {
      ctx.moveTo(gx, minGridY);
      ctx.lineTo(gx, maxGridY);
    }
    for (let gy = Math.floor(minGridY / gridSpacingPx) * gridSpacingPx; gy <= maxGridY; gy += gridSpacingPx) {
      ctx.moveTo(minGridX, gy);
      ctx.lineTo(maxGridX, gy);
    }
    ctx.stroke();

    // B. 基板表面 (材質別グラデーション & 表面形状 getCoatingBedY に忠実な断面)
    const substrate = solver.coatingSubstrateType || solver.substrateType || 'sus';
    const roughness = solver.coatingRoughness || 'smooth';

    let gradSubstrate = ctx.createLinearGradient(0, bottomY, 0, bottomY + 30);
    let hairlineColor = '#e2e8f0';

    if (substrate === 'sus') {
      gradSubstrate.addColorStop(0, '#64748b');
      gradSubstrate.addColorStop(0.2, '#94a3b8');
      gradSubstrate.addColorStop(0.6, '#334155');
      gradSubstrate.addColorStop(1, '#0f172a');
      hairlineColor = 'rgba(241, 245, 249, 0.9)';
    } else if (substrate === 'glass') {
      gradSubstrate.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
      gradSubstrate.addColorStop(0.3, 'rgba(255, 255, 255, 0.35)');
      gradSubstrate.addColorStop(0.7, 'rgba(14, 165, 233, 0.7)');
      gradSubstrate.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
      hairlineColor = '#38bdf8';
    } else if (substrate === 'silicone') {
      gradSubstrate.addColorStop(0, 'rgba(241, 245, 249, 0.75)');
      gradSubstrate.addColorStop(0.3, 'rgba(203, 213, 225, 0.55)');
      gradSubstrate.addColorStop(0.7, 'rgba(100, 116, 139, 0.75)');
      gradSubstrate.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
      hairlineColor = '#f8fafc';
    } else {
      // acrylic
      gradSubstrate.addColorStop(0, 'rgba(203, 213, 225, 0.6)');
      gradSubstrate.addColorStop(0.3, 'rgba(148, 163, 184, 0.35)');
      gradSubstrate.addColorStop(0.7, 'rgba(71, 85, 105, 0.7)');
      gradSubstrate.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
      hairlineColor = 'rgba(203, 213, 225, 0.85)';
    }

    ctx.fillStyle = gradSubstrate;
    ctx.beginPath();
    const bedStartBedY = solver.getCoatingBedY ? solver.getCoatingBedY(minGridX) : bottomY;
    ctx.moveTo(minGridX, bedStartBedY);

    const stepX = 1.0;
    for (let gx = minGridX; gx <= maxGridX; gx += stepX) {
      const gy = solver.getCoatingBedY ? solver.getCoatingBedY(gx) : bottomY;
      ctx.lineTo(gx, gy);
    }
    ctx.lineTo(maxGridX, bottomY + 50);
    ctx.lineTo(minGridX, bottomY + 50);
    ctx.closePath();
    ctx.fill();

    // 基板表面ヘアライン
    ctx.strokeStyle = hairlineColor;
    ctx.lineWidth = 1.0 / zoomM;
    ctx.beginPath();
    for (let gx = minGridX; gx <= maxGridX; gx += stepX) {
      const gy = solver.getCoatingBedY ? solver.getCoatingBedY(gx) : bottomY;
      if (gx === minGridX) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    }
    ctx.stroke();

    // C. スラリー流体粒子 & 連続メッシュ (拡大スケール描画)
    const N = solver.numParticles;
    const pr = solver.particleRadius || 1.8;
    const activeMat = this.activeMaterial || (currentPreset ? MATERIAL_PALETTES[currentPreset.materialId] : null);
    const baseColor = activeMat ? activeMat.color : [250, 245, 230];

    const etaMin = solver.eta_min || 0.05;
    const etaMax = Math.max(10.0, (solver.eta_max || 100.0) * 0.4);
    const vMax = 180.0;

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      const localBed = solver.getCoatingBedY ? solver.getCoatingBedY(px) : bottomY;
      if (px < minGridX - 5 || px > maxGridX + 5 || py < minGridY - 5 || py > localBed + 2) continue;

      let r = baseColor[0];
      let g = baseColor[1];
      let b = baseColor[2];

      if (this.renderMode === 'viscosity') {
        const norm = Math.max(0, Math.min(1.0, (solver.eta[i] - etaMin) / (etaMax - etaMin)));
        const rgb = FluidRenderer.sampleRainbow(norm);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      } else if (this.renderMode === 'velocity') {
        const spd = Math.hypot(solver.vx[i], solver.vy[i]);
        const norm = Math.max(0, Math.min(1.0, spd / vMax));
        const rgb = FluidRenderer.sampleRainbow(norm);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      } else if (this.renderMode === 'peaking') {
        const rgb = solver.isSettled[i] === 2 ? [16, 185, 129] : [56, 189, 248];
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      }

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`;
      ctx.beginPath();
      ctx.arc(px, py, pr * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // クエット流速ベクトル矢印 (隙間通過部の局所せん断可視化)
      if (Math.abs(px - bx) < 14.0 && py >= bladeTipY - 2 && py <= localBed) {
        const vx = solver.vx[i];
        if (Math.abs(vx) > 0.5) {
          const arrowLen = Math.min(4.5, Math.max(1.2, Math.abs(vx) * 0.12));
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.lineWidth = 0.8 / zoomM;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (vx > 0 ? arrowLen : -arrowLen), py);
          ctx.stroke();
        }
      }
    }

    // D. ドクターブレード刃先 (SUS研磨ブレード拡大)
    const bladeW = 14.0;
    const bladeH = 80.0;
    const bladeTopY = bladeTipY - bladeH;

    const gradBladeZoom = ctx.createLinearGradient(bx - bladeW, 0, bx, 0);
    gradBladeZoom.addColorStop(0, '#475569');
    gradBladeZoom.addColorStop(0.35, '#cbd5e1');
    gradBladeZoom.addColorStop(0.8, '#94a3b8');
    gradBladeZoom.addColorStop(1, '#334155');

    ctx.fillStyle = gradBladeZoom;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.0 / zoomM;

    ctx.beginPath();
    ctx.moveTo(bx - bladeW, bladeTopY);
    ctx.lineTo(bx, bladeTopY);
    ctx.lineTo(bx, bladeTipY);
    ctx.lineTo(bx - 3, bladeTipY);
    ctx.lineTo(bx - bladeW, bladeTipY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 刃先極小チタンコーティングエッジ
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(bx - 3, bladeTipY - 1.5, 3, 1.5);

    // E. 隙間クリアランス寸法線 (拡大ビュー内)
    const clearanceBedY = solver.getCoatingBedY ? solver.getCoatingBedY(bx - 6) : bottomY;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.0 / zoomM;
    ctx.beginPath();
    ctx.moveTo(bx - 6, clearanceBedY);
    ctx.lineTo(bx - 6, bladeTipY);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(bx - 6, clearanceBedY, 1.0 / zoomM, 0, Math.PI * 2);
    ctx.arc(bx - 6, bladeTipY, 1.0 / zoomM, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // クリップ・ズーム座標系の解除

    // ── 4. PIP HUDフレーム & レチクル十字線 & 寸法ラベル ──

    // スコープヘッダーバー
    ctx.fillStyle = 'rgba(2, 132, 199, 0.25)';
    ctx.fillRect(pipX, pipY, pipW, 22);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pipX, pipY + 22);
    ctx.lineTo(pipX + pipW, pipY + 22);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🔬 エッジ刃先 4.2x 拡大顕微鏡 (Microscope)', pipX + 8, pipY + 15);

    // レチクル十字センターマーク
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(viewCenterX, pipY + 24);
    ctx.lineTo(viewCenterX, pipY + pipH - 24);
    ctx.moveTo(pipX + 8, viewCenterY);
    ctx.lineTo(pipX + pipW - 8, viewCenterY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 顕微鏡HUD下部ステータスバッジ
    const wetThickUm = solver.coatingFilmThicknessUm || (gapUm * 0.56);
    const shearVal = solver.coatingShearRate || (solver.bladeSpeedMmS * 1000.0 / gapUm);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, pipX + 6, pipY + pipH - 24, pipW - 12, 18, 3);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#fda4af';
    ctx.textAlign = 'left';
    ctx.fillText(`隙間:h=${gapUm.toFixed(0)}μm`, pipX + 10, pipY + pipH - 12);

    ctx.fillStyle = '#34d399';
    ctx.fillText(`湿潤膜厚:≈${wetThickUm.toFixed(0)}μm`, pipX + pipW * 0.38, pipY + pipH - 12);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`γ̇:${shearVal.toFixed(0)}s⁻¹`, pipX + pipW - 10, pipY + pipH - 12);

    ctx.restore();
  }
}

