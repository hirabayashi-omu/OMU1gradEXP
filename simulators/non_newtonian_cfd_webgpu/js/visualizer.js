/**
 * visualizer.js - 2Dテクスチャ・流体界面 (VOF)・コンター・流線可視化レンダラー
 * 
 * 添付画像再現仕様:
 *   - 金型キャビティ内の流体界面 (メルトフロント F = 0.5) の追跡
 *   - 未充填領域 (空気: F < 0.05) は白背景 (金型キャビティ内部)
 *   - 充填された流体領域 (F >= 0.05) に圧力等のカラーコンターを描画
 *   - 外周金型フレーム (赤枠) と流体先端界面エッジ
 */

import { CELL_TYPE } from './geometry.js?v=coating_fix_v105';

export class CFDVisualizer {
  constructor(canvas, Nx, Ny) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.Nx = Nx;
    this.Ny = Ny;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = Nx;
    this.offscreenCanvas.height = Ny;
    this.offCtx = this.offscreenCanvas.getContext('2d');
    this.imageData = this.offCtx.createImageData(Nx, Ny);

    this.fieldMode = 'pressure';     // 'pressure' | 'viscosity' | 'shear_rate' | 'velocity' | 'vof'
    this.useBands = true;            // 等高線バンド（16階調）
    this.bandCount = 16;
    this.showVectors = false;
    this.showParticles = true;
    this.autoScale = true;

    this.currentRange = { min: 0, max: 1.0e6 };

    this.particles = [];
    this.particleCount = 350;
    this._initParticles();
  }

  setResolution(Nx, Ny) {
    this.Nx = Nx;
    this.Ny = Ny;
    this.offscreenCanvas.width = Nx;
    this.offscreenCanvas.height = Ny;
    this.imageData = this.offCtx.createImageData(Nx, Ny);
    this._initParticles();
  }

  _initParticles() {
    this.particles = [];
    for (let k = 0; k < this.particleCount; k++) {
      this.particles.push({
        x: this.Nx * 0.5 + (Math.random() - 0.5) * (this.Nx * 0.04),
        y: Math.random() * 8,
        age: Math.random() * 60,
        maxAge: 40 + Math.random() * 50
      });
    }
  }

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

  static getVelocityColor(vel, maxVel = 2.5) {
    const norm = Math.max(0.0, Math.min(1.0, vel / Math.max(0.01, maxVel)));
    return CFDVisualizer.sampleRainbow(norm);
  }

  static getViscosityColor(eta, minEta = 0.05, maxEta = 120.0) {
    const norm = Math.max(0.0, Math.min(1.0, (eta - minEta) / (maxEta - minEta)));
    return CFDVisualizer.sampleRainbow(norm);
  }

  render(stateData, cellTypeMask, stats = {}) {
    if (!stateData) return;

    const Nx = this.Nx;
    const Ny = this.Ny;
    const imgData = this.imageData.data;

    let vMin = 0;
    let vMax = stats.maxPressure ?? 1.0e6;
    if (vMax <= 1.0) vMax = 1.0e5;

    if (this.fieldMode === 'pressure') {
      vMin = 0;
      vMax = stats.maxPressure ?? 1.0e6;
      if (vMax <= 1.0) vMax = 1.0e5;
    } else if (this.fieldMode === 'viscosity') {
      vMin = 0.01;
      vMax = 20.0;
    } else if (this.fieldMode === 'velocity') {
      vMin = 0.0;
      vMax = Math.max(0.1, stats.maxVel ?? 1.0);
    } else if (this.fieldMode === 'shear_rate') {
      vMin = 0.0;
      vMax = 120.0;
    } else if (this.fieldMode === 'vof') {
      vMin = 0.0;
      vMax = 1.0;
    }

    this.currentRange = { min: vMin, max: vMax };

    const stride = 4;
    const dx = 1.0 / Nx;
    const dy = 1.0 / Nx;

    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const cellIdx = j * Nx + i;
        const pixelOffset = cellIdx * 4;
        const stateOffset = cellIdx * stride;

        const cType = cellTypeMask[cellIdx];

        // 1. 金型外壁 (SOLID): 濃いグレー背景
        if (cType === CELL_TYPE.SOLID) {
          imgData[pixelOffset] = 15;
          imgData[pixelOffset + 1] = 20;
          imgData[pixelOffset + 2] = 28;
          imgData[pixelOffset + 3] = 255;
          continue;
        }

        const u = stateData[stateOffset];
        const v = stateData[stateOffset + 1];
        const p = stateData[stateOffset + 2];
        const F = stateData[stateOffset + 3]; // VOF 流体分率

        // 2. 未充填領域 (空気: F < 0.05): 添付画像通りの白 (255, 255, 255)
        if (F < 0.05) {
          imgData[pixelOffset] = 255;
          imgData[pixelOffset + 1] = 255;
          imgData[pixelOffset + 2] = 255;
          imgData[pixelOffset + 3] = 255;
          continue;
        }

        // 3. 流体充填領域: 物理量コンター
        let val = 0;
        if (this.fieldMode === 'pressure') {
          val = p;
        } else if (this.fieldMode === 'viscosity') {
          let dudy = 0, dvdx = 0;
          if (i > 0 && i < Nx - 1 && j > 0 && j < Ny - 1) {
            dudy = (stateData[(cellIdx + Nx) * stride] - stateData[(cellIdx - Nx) * stride]) / (2 * dy);
            dvdx = (stateData[(cellIdx + 1) * stride + 1] - stateData[(cellIdx - 1) * stride + 1]) / (2 * dx);
          }
          val = Math.sqrt(dudy * dudy + dvdx * dvdx);
        } else if (this.fieldMode === 'velocity') {
          val = Math.sqrt(u * u + v * v);
        } else if (this.fieldMode === 'shear_rate') {
          let dudy = 0, dvdx = 0;
          if (i > 0 && i < Nx - 1 && j > 0 && j < Ny - 1) {
            dudy = (stateData[(cellIdx + Nx) * stride] - stateData[(cellIdx - Nx) * stride]) / (2 * dy);
            dvdx = (stateData[(cellIdx + 1) * stride + 1] - stateData[(cellIdx - 1) * stride + 1]) / (2 * dx);
          }
          val = Math.abs(dudy + dvdx);
        } else if (this.fieldMode === 'vof') {
          val = F;
        }

        let norm = (val - vMin) / (vMax - vMin);
        norm = Math.max(0.0, Math.min(1.0, norm));

        if (this.useBands) {
          const bands = this.bandCount;
          norm = Math.floor(norm * bands) / (bands - 1);
        }

        const rgb = CFDVisualizer.sampleRainbow(norm);

        // 界面付近 (0.05 <= F < 0.9) の半透明・滑らかブレンド
        if (F < 0.95) {
          const alpha = F;
          imgData[pixelOffset] = Math.floor(rgb[0] * alpha + 255 * (1 - alpha));
          imgData[pixelOffset + 1] = Math.floor(rgb[1] * alpha + 255 * (1 - alpha));
          imgData[pixelOffset + 2] = Math.floor(rgb[2] * alpha + 255 * (1 - alpha));
        } else {
          imgData[pixelOffset] = rgb[0];
          imgData[pixelOffset + 1] = rgb[1];
          imgData[pixelOffset + 2] = rgb[2];
        }
        imgData[pixelOffset + 3] = 255;
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);

    // 4. 金型枠（赤枠線）の描画
    this._renderDomainBoundary(cellTypeMask);

    // 5. 流体界面（メルトフロント F = 0.5）のエッジ線描画
    this._renderFluidInterface(stateData, cellTypeMask);

    // 6. 流体領域内のパーティクル
    if (this.showParticles) {
      this._renderParticles(stateData, cellTypeMask);
    }
  }

  _renderDomainBoundary(cellTypeMask) {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / this.Nx;
    const scaleY = this.canvas.height / this.Ny;

    ctx.save();
    // 添付画像の赤い外枠
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

    // キャビティ輪郭
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    const Nx = this.Nx;
    const Ny = this.Ny;

    for (let j = 1; j < Ny - 1; j += 2) {
      for (let i = 1; i < Nx - 1; i += 2) {
        const idx = j * Nx + i;
        const isCavity = cellTypeMask[idx] !== CELL_TYPE.SOLID;
        const isRightSolid = cellTypeMask[idx + 1] === CELL_TYPE.SOLID;
        const isBottomSolid = cellTypeMask[idx + Nx] === CELL_TYPE.SOLID;

        if (isCavity && isRightSolid) {
          ctx.moveTo((i + 1) * scaleX, j * scaleY);
          ctx.lineTo((i + 1) * scaleX, (j + 2) * scaleY);
        }
        if (isCavity && isBottomSolid) {
          ctx.moveTo(i * scaleX, (j + 1) * scaleY);
          ctx.lineTo((i + 2) * scaleX, (j + 1) * scaleY);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 流体界面 (メルトフロント F = 0.5) の境界輪郭線描画
   */
  _renderFluidInterface(stateData, cellTypeMask) {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / this.Nx;
    const scaleY = this.canvas.height / this.Ny;
    const stride = 4;
    const Nx = this.Nx;
    const Ny = this.Ny;

    ctx.save();
    ctx.strokeStyle = '#2563eb'; // 添付画像の界面最前線（青色のフロントライン）
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    for (let j = 1; j < Ny - 1; j++) {
      for (let i = 1; i < Nx - 1; i++) {
        const idx = j * Nx + i;
        if (cellTypeMask[idx] === CELL_TYPE.SOLID) continue;

        const f = stateData[idx * stride + 3];
        const fDown = stateData[(idx + Nx) * stride + 3];
        const fRight = stateData[(idx + 1) * stride + 3];

        // 垂直方向の界面
        if ((f >= 0.5 && fDown < 0.5) || (f < 0.5 && fDown >= 0.5)) {
          ctx.moveTo(i * scaleX, (j + 0.5) * scaleY);
          ctx.lineTo((i + 1) * scaleX, (j + 0.5) * scaleY);
        }
        // 水平方向の界面
        if ((f >= 0.5 && fRight < 0.5) || (f < 0.5 && fRight >= 0.5)) {
          ctx.moveTo((i + 0.5) * scaleX, j * scaleY);
          ctx.lineTo((i + 0.5) * scaleX, (j + 1) * scaleY);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _renderParticles(stateData, cellTypeMask) {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / this.Nx;
    const scaleY = this.canvas.height / this.Ny;
    const stride = 4;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

    for (let k = 0; k < this.particles.length; k++) {
      const p = this.particles[k];
      p.age++;

      const i = Math.floor(p.x);
      const j = Math.floor(p.y);

      if (i < 0 || i >= this.Nx || j < 0 || j >= this.Ny || p.age > p.maxAge) {
        p.x = this.Nx * 0.5 + (Math.random() - 0.5) * (this.Nx * 0.04);
        p.y = 1 + Math.random() * 4;
        p.age = 0;
        continue;
      }

      const cellIdx = j * this.Nx + i;
      const F = stateData[cellIdx * stride + 3];
      if (cellTypeMask[cellIdx] === CELL_TYPE.SOLID || F < 0.1) {
        p.age = p.maxAge;
        continue;
      }

      const u = stateData[cellIdx * stride];
      const v = stateData[cellIdx * stride + 1];

      const dt = 1.0;
      p.x += u * dt;
      p.y += v * dt;

      const px = p.x * scaleX;
      const py = p.y * scaleY;

      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
