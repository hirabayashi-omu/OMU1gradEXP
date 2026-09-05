/**
 * sph_visualizer.js - SPH 粒子法レンダラー (ノズル・受け皿・非ニュートン粒子コンター・リアル質感)
 */

import { CFDVisualizer } from './visualizer.js?v=coating_fix_v105';

export class SPHVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.renderMode = 'viscosity'; // 'viscosity' | 'velocity' | 'pressure' | 'shear_rate' | 'realistic'
    this.particleRadius = 7.0;

    // 化粧品質感カラー定義
    this.cosmeticColors = {
      rich_cream: { base: '#fdfbf7', stroke: '#e2d9cc', alpha: 0.9 },       // 純白・濃厚クリーム
      emulsion_serum: { base: '#f0f9ff', stroke: '#bae6fd', alpha: 0.8 },   // 半透明とろみ美容液
      lipstick_gloss: { base: '#e11d48', stroke: '#9f1239', alpha: 0.95 },  // 鮮やかなルージュ口紅
      liquid_foundation: { base: '#e8c49e', stroke: '#c49a6c', alpha: 0.92},// オークルファンデ
      skin_lotion: { base: '#38bdf8', stroke: '#0284c7', alpha: 0.65 },     // 透明水色化粧水
      clay_scrub: { base: '#78716c', stroke: '#44403c', alpha: 0.9 }        // 泥色クレイパック
    };

    this.currentPreset = 'rich_cream';
  }

  setPreset(presetId) {
    this.currentPreset = presetId;
  }

  render(solver) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. 背景グリッド
    this._renderBackground(ctx, w, h);

    // 2. 下部受け皿プレート
    this._renderPlate(ctx, w, solver.plateY);

    // 3. 上部ノズル
    this._renderNozzle(ctx, solver.nozzleX, solver.nozzleY, solver.nozzleRadius);

    // 4. SPH 粒子の描画
    this._renderParticles(ctx, solver);

    // 5. 統計オーバーレイ
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(`粒子数: ${solver.numParticles} / ${solver.maxParticles}`, 16, h - 14);
  }

  _renderBackground(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  _renderNozzle(ctx, nx, ny, nr) {
    ctx.save();
    // ノズル金属円筒
    const grad = ctx.createLinearGradient(nx - nr - 6, 0, nx + nr + 6, 0);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(0.3, '#94a3b8');
    grad.addColorStop(0.7, '#cbd5e1');
    grad.addColorStop(1, '#334155');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;

    // ノズル本体
    ctx.beginPath();
    ctx.moveTo(nx - nr - 8, 0);
    ctx.lineTo(nx - nr, ny);
    ctx.lineTo(nx + nr, ny);
    ctx.lineTo(nx + nr + 8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ノズル開口リング
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(nx, ny, nr, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ノズルラベル
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('DISPENSER NOZZLE', nx, ny - 10);
    ctx.restore();
  }

  _renderPlate(ctx, w, plateY) {
    ctx.save();
    // 受け皿プレート
    const plateGrad = ctx.createLinearGradient(0, plateY, 0, plateY + 30);
    plateGrad.addColorStop(0, '#334155');
    plateGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = plateGrad;
    ctx.fillRect(40, plateY, w - 80, 24);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, plateY);
    ctx.lineTo(w - 40, plateY);
    ctx.stroke();

    // ラベル
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('COLLECTING PLATE / TRAY', w / 2, plateY + 16);
    ctx.restore();
  }

  _renderParticles(ctx, solver) {
    const N = solver.numParticles;
    const r = this.particleRadius;

    // 統計・スケール用
    let vMax = 1.0;
    let etaMax = solver.eta_max * 0.4;
    let pMax = 5000.0;
    let gMax = 50.0;

    for (let i = 0; i < N; i++) {
      const spd = Math.sqrt(solver.vx[i] * solver.vx[i] + solver.vy[i] * solver.vy[i]);
      if (spd > vMax) vMax = spd;
    }

    ctx.save();

    for (let i = 0; i < N; i++) {
      const px = solver.x[i];
      const py = solver.y[i];

      let rgb = [255, 255, 255];
      let alpha = 0.85;

      if (this.renderMode === 'viscosity') {
        // 見かけ粘度: 低粘度(青/シアン) -> 高粘度(赤)
        const norm = Math.max(0, Math.min(1.0, (solver.eta[i] - solver.eta_min) / (etaMax - solver.eta_min)));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (this.renderMode === 'velocity') {
        const spd = Math.sqrt(solver.vx[i] * solver.vx[i] + solver.vy[i] * solver.vy[i]);
        const norm = Math.max(0, Math.min(1.0, spd / vMax));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (this.renderMode === 'pressure') {
        const norm = Math.max(0, Math.min(1.0, solver.p[i] / pMax));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (this.renderMode === 'shear_rate') {
        const norm = Math.max(0, Math.min(1.0, solver.gammaDot[i] / gMax));
        rgb = CFDVisualizer.sampleRainbow(norm);
      } else if (this.renderMode === 'realistic') {
        const c = this.cosmeticColors[this.currentPreset] || this.cosmeticColors.rich_cream;
        ctx.fillStyle = c.base;
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
