/**
 * fluid_renderer.js - 化粧品充填プロセス (Cosmetic Filling Process) 美麗レンダラー
 * 
 * 可視化機能:
 *   - 高級化粧品容器 (ジャー容器、美容液ボトル、口紅金型、ファンデーション皿) のパッケージ描画
 *   - 昇降追従ディスペンサーノズル (SUS316Lノズル + 液吐出バルブ)
 *   - 化粧品流体 (リアル光沢質感、見かけ粘度コンター、流速、ツノ立ち・レベリング解析)
 *   - 液面メニスカスとツノ立ち・堆積プロファイル線
 */

import { CFDVisualizer } from './visualizer.js';
import { MeshSmoother } from './mesh_smoother.js';
import { MATERIAL_PALETTES } from './models.js';

export class FluidRenderer {
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

    if (solver?.testMode === 'sagging') return;

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

    // インジケーター表示 (上部シリンダーブロックの右横または安全な余白に配置)
    const badgeW = 144;
    const badgeH = 34;
    let labelX = nx + (mountW * 0.5) + 12;
    let labelY = 8;

    // もし右端をオーバーフローする場合は、ノズル左側に反転配置
    if (labelX + badgeW > ctx.canvas.width - 8) {
      labelX = Math.max(8, nx - (mountW * 0.5) - 12 - badgeW);
    }

    // 半透明の整流バッジ背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.30)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, labelX - 4, labelY, badgeW, badgeH, 5);
    ctx.fill();
    ctx.stroke();

    if (solver.fillingMode === 'bottom_up' && solver.fillPercentage > 5 && solver.fillPercentage < 98) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9.5px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('▲ ボトムアップ昇降追従中', labelX + 2, labelY + 13);
    } else if (solver.fillingMode === 'fixed') {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9.5px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⬇️ 固定注入ノズル', labelX + 2, labelY + 13);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9.5px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('▲ ボトムアップ昇降ノズル', labelX + 2, labelY + 13);
    }

    ctx.font = '9.5px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(`口径 d = ${solver.nozzleDiameterMm.toFixed(1)} mm`, labelX + 2, labelY + 26);

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
    // 粒子の点々ではなく、隙間のない中身の詰まった1枚の連続流体面（Blob Mesh Body）を形成
    if (this.smoothingMode !== 'raw') {
      if (solver.testMode === 'sagging') {
        this._renderSaggingDropletMesh(ctx, solver, baseColor, fluidGloss, mode);
      } else {
        this._renderFillingFluidMesh(ctx, solver, baseColor, fluidGloss, mode);
      }
    }

    // 2. 【高密度ブレンド粒子レイヤー】
    // 局所の粘度・速度コンターや、表面の滑らかな微小凹凸を補間
    const etaMin = solver.eta_min;
    const etaMax = Math.max(10.0, solver.eta_max * 0.4);
    const vMax = 180.0;
    
    // 粒子同士が完全に融合して隙間をゼロにするブレンド半径
    const blendR = (this.smoothingMode === 'raw') ? (r * 1.2) : Math.max(3.8, r * 4.5);

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      const vx = solver.vx[i];
      const vy = solver.vy[i];
      const spd = Math.hypot(vx, vy);

      let rgb = baseColor;
      if (mode === 'viscosity') {
        const norm = Math.max(0, Math.min(1.0, (solver.eta[i] - etaMin) / (etaMax - etaMin)));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (mode === 'velocity') {
        const norm = Math.max(0, Math.min(1.0, spd / vMax));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (mode === 'peaking') {
        rgb = solver.isSettled[i] === 2 ? [16, 185, 129] : [56, 189, 248];
      }

      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${this.smoothingMode === 'raw' ? 0.9 : 0.45})`;
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

    // 画面左上 HUD: 充填ステータス
    // ノズルシャフト・上部マウントブロックとの被りを完全に防ぐ動的レイアウト
    let hudX = 12;
    let hudY = 12;
    let hudW = 196;
    let hudH = 100;

    // 左上配置時のノズル左端までの最大許容幅
    const maxAllowedWidthOnLeft = mountLeftX - hudX - 12;

    if (maxAllowedWidthOnLeft >= 160) {
      // 左上スペースに収まる場合: ノズルと12px以上のクリアランスを保ち重なりゼロ
      hudW = Math.min(196, maxAllowedWidthOnLeft);
    } else {
      // 画面幅が狭くノズル左側に収まらない場合: 下部安全エリア(フローティングバーの上)に自動退避
      hudX = 12;
      hudY = Math.max(12, h - 165);
      hudW = Math.min(210, w - 24);
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    this._drawRoundRect(ctx, hudX, hudY, hudW, hudH, 6);
    ctx.fill();
    ctx.stroke();

    const textX = hudX + 9;
    const isSmall = hudW < 185;
    const fs = isSmall ? '10px' : '10.5px';

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('🧴 化粧品充填ステータス', textX, hudY + 18);

    ctx.font = `${fs} sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`充填進捗: ${solver.fillPercentage.toFixed(1)}% (${solver.filledVolumeMl.toFixed(1)}/${c.targetVolume}mL)`, textX, hudY + 36);
    ctx.fillText(`ツノ立ち高さ: ${solver.peakHeightMm.toFixed(1)} mm`, textX, hudY + 53);
    ctx.fillText(`レベリング平坦度: ${solver.levelingFlatness.toFixed(1)} %`, textX, hudY + 70);

    if (solver.isFilled) {
      ctx.fillStyle = '#10b981';
      ctx.font = `bold ${fs} sans-serif`;
      ctx.fillText('✅ 規定量充填完了 (Filled)', textX, hudY + 88);
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.font = `${fs} sans-serif`;
      ctx.fillText('⚡ 注入充填中...', textX, hudY + 88);
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
    let totalBedCount = 0;
    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];
      if (px >= leftX - 4 && px <= rightX + 4 && py <= bottomY + 2) {
        const bin = Math.min(numBins - 1, Math.max(0, Math.floor((px - leftX) / binW)));
        if (py < topYByBin[bin]) {
          topYByBin[bin] = py;
        }
        if (py > bottomYByBin[bin]) {
          bottomYByBin[bin] = py;
        }
        countByBin[bin]++;

        // 底面（bottomY - 8px以内）に粒子が存在する場合のみ「着液・底面接触」と判定
        if (py >= bottomY - 8.0) {
          hasBedContact[bin] = 1;
          totalBedCount++;
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
        const nr = Math.max(2.8, solver.nozzleRadiusPx * 0.88);
        const nx = solver.nozzleX;

        const gradJet = ctx.createLinearGradient(nx - nr, 0, nx + nr, 0);
        gradJet.addColorStop(0, `rgb(${Math.max(0, baseColor[0] - 20)}, ${Math.max(0, baseColor[1] - 20)}, ${Math.max(0, baseColor[2] - 20)})`);
        gradJet.addColorStop(0.3, `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
        gradJet.addColorStop(0.7, `rgb(${Math.min(255, baseColor[0] + 15)}, ${Math.min(255, baseColor[1] + 15)}, ${Math.min(255, baseColor[2] + 15)})`);
        gradJet.addColorStop(1, `rgb(${Math.max(0, baseColor[0] - 15)}, ${Math.max(0, baseColor[1] - 15)}, ${Math.max(0, baseColor[2] - 15)})`);

        ctx.fillStyle = (mode === 'monochrome') ? 'rgb(0, 240, 255)' : gradJet;

        ctx.beginPath();

        if (isAttachedToNozzle) {
          // ノズル口元に接続
          ctx.moveTo(nx - nr, topY);
          ctx.lineTo(nx + nr, topY);
        } else {
          // ノズルから離れて落下中の場合: 上端を丸いドームとして閉じる
          ctx.moveTo(nx - nr, topY + nr * 0.8);
          ctx.quadraticCurveTo(nx - nr, topY, nx, topY);
          ctx.quadraticCurveTo(nx + nr, topY, nx + nr, topY + nr * 0.8);
        }

        if (!isReachingBed) {
          // まだ底面・液面に着いていない場合: 下端先端を丸いドームとして閉じる
          ctx.lineTo(nx + nr * 1.05, targetTipY - nr * 0.8);
          ctx.quadraticCurveTo(nx + nr * 1.05, targetTipY, nx, targetTipY);
          ctx.quadraticCurveTo(nx - nr * 1.05, targetTipY, nx - nr * 1.05, targetTipY - nr * 0.8);
        } else {
          // 液面に到達している場合: 液面へスムーズに接続
          ctx.lineTo(nx + nr * 1.15, targetTipY);
          ctx.lineTo(nx - nr * 1.15, targetTipY);
        }

        ctx.closePath();
        ctx.fill();

        // ジェット流の縦光沢ハイライト
        if (mode === 'realistic') {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fluidGloss * 0.6})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(nx - nr * 0.25, topY);
          ctx.lineTo(nx - nr * 0.25, targetTipY - 2);
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

    // 2. 高解像度ビンサンプリング (80ビン)
    const numBins = 80;
    const binW = (maxS - minS) / numBins;
    const maxHByBin = new Float32Array(numBins).fill(0);
    const countByBin = new Uint16Array(numBins).fill(0);

    for (let i = 0; i < N; i++) {
      const s = sArr[i];
      const h = hArr[i];
      if (s >= minS && s <= maxS && h >= -3.0 && h <= 60.0) {
        const bin = Math.min(numBins - 1, Math.max(0, Math.floor((s - minS) / binW)));
        if (h > maxHByBin[bin]) {
          maxHByBin[bin] = h;
        }
        countByBin[bin]++;
      }
    }

    // 3. ギャップ補間と最小液膜厚みの保証 (途切れ・抜けの完全防止)
    const rawContour = [];
    const pr = solver.particleRadius || 1.8;

    // 開始端部 (板表面からの立ち上がりメニスカス)
    const startS = Math.max(0, minS - 2.0);
    rawContour.push({
      x: geom.p0x + startS * geom.tx,
      y: geom.p0y + startS * geom.ty,
      s: startS,
      h: 0
    });

    let lastKnownH = 3.0;
    for (let b = 0; b < numBins; b++) {
      const s = minS + (b + 0.5) * binW;
      let h = maxHByBin[b];

      if (countByBin[b] > 0 && h > 0.2) {
        h = Math.max(2.5, h + pr * 1.1); // 粒子径分を覆うふくらみ
        lastKnownH = h;
      } else {
        // 前後の高さから滑らかに補間 (最低液膜厚み 2.2px)
        let nextH = 0;
        for (let nb = b + 1; nb < Math.min(numBins, b + 6); nb++) {
          if (countByBin[nb] > 0 && maxHByBin[nb] > 0.2) {
            nextH = maxHByBin[nb] + pr * 1.1;
            break;
          }
        }
        h = nextH > 0 ? (lastKnownH + nextH) * 0.5 : Math.max(2.2, lastKnownH * 0.7);
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
    // 始点: 板上の開始点
    ctx.moveTo(smoothedContour[0].x, smoothedContour[0].y);

    // 上面輪郭を滑らかなベジェ曲線で描画
    for (let i = 1; i < smoothedContour.length; i++) {
      const pPrev = smoothedContour[i - 1];
      const pCurr = smoothedContour[i];
      const midX = (pPrev.x + pCurr.x) * 0.5;
      const midY = (pPrev.y + pCurr.y) * 0.5;
      ctx.quadraticCurveTo(pPrev.x, pPrev.y, midX, midY);
    }
    ctx.lineTo(smoothedContour[smoothedContour.length - 1].x, smoothedContour[smoothedContour.length - 1].y);

    // 板表面に沿って戻り、閉じる
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

      // たれ先端フロントの丸みハイライト
      const lastPt = smoothedContour[smoothedContour.length - 2];
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, glossAlpha + 0.2)})`;
      ctx.beginPath();
      ctx.arc(lastPt.x - 1.2 * geom.tx, lastPt.y - 1.2 * geom.ty, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
