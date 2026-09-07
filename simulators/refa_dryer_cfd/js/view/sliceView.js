/**
 * sliceView.js
 * 空間温度・風速分布の断面スライス（XY平面、Z=0）サーモグラフィ＆コンター＆速度ベクトル表示
 * - 物理量切替：温度 (Temperature) / 風速 (Velocity)
 * - 2D/3D風速ベクトル（矢印グリッド）表示
 */

class SliceView {
  constructor(scene) {
    this.scene = scene;
    this.gridX = 64;
    this.gridY = 36;
    this.xRange = [1.3, 4.8];
    this.yRange = [-1.4, 1.4];

    // 表示設定
    this.displayMode = 'temp'; // 'temp' または 'velocity'
    this.showVectors = true;   // ベクトル矢印の表示フラグ
    this.visible = true;

    // 内部キャンバス（テクスチャ生成）
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.gridX;
    this.canvas.height = this.gridY;
    this.ctx = this.canvas.getContext('2d');
    this.imgData = this.ctx.createImageData(this.gridX, this.gridY);

    // Three.js 空間断面プレーン
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const width = this.xRange[1] - this.xRange[0];
    const height = this.yRange[1] - this.yRange[0];
    const planeGeo = new THREE.PlaneGeometry(width, height);
    
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(planeGeo, this.material);
    this.mesh.name = 'ThermalSlicePlane';
    this.mesh.position.set(
      (this.xRange[0] + this.xRange[1]) / 2,
      (this.yRange[0] + this.yRange[1]) / 2,
      0
    );
    this.scene.add(this.mesh);

    // 3D風速ベクトル矢印用グループ
    this.vectorGroup = new THREE.Group();
    this.vectorGroup.name = 'VelocityVectors';
    this.scene.add(this.vectorGroup);
    this._init3DVectorArrows();
  }

  _init3DVectorArrows() {
    // グリッド間引き（8x5 = 40本の矢印）
    this.vecCols = 16;
    this.vecRows = 9;
    this.arrows = [];

    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < this.vecCols * this.vecRows; i++) {
      const arrow = new THREE.ArrowHelper(dir, origin, 0.2, 0x38bdf8, 0.06, 0.04);
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.8;
      this.vectorGroup.add(arrow);
      this.arrows.push(arrow);
    }
  }

  setDisplayMode(mode) {
    this.displayMode = mode; // 'temp' or 'velocity'
  }

  setShowVectors(show) {
    this.showVectors = show;
    this.vectorGroup.visible = show;
  }

  setVisible(vis) {
    this.visible = vis;
    this.mesh.visible = vis;
    this.vectorGroup.visible = vis && this.showVectors;
  }

  setOpacity(opacity) {
    this.material.opacity = opacity;
  }

  /**
   * サンプリングデータからコンターテクスチャとベクトル矢印を更新
   * @param {{ tempGrid: Float32Array, velGrid: Float32Array, uGrid: Float32Array, vGrid: Float32Array, gridX: number, gridY: number }} data 
   * @param {HTMLCanvasElement} [hudCanvas] 
   */
  update(data, hudCanvas = null) {
    if (!data) return;
    const { tempGrid, velGrid, uGrid, vGrid } = data;
    const isVel = (this.displayMode === 'velocity');

    const pixels = this.imgData.data;
    const w = this.gridX;
    const h = this.gridY;

    // 1. 断面コンターマップ（温度 or 風速）のピクセル生成
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const srcIdx = (h - 1 - gy) * w + gx;
        const val = isVel ? velGrid[srcIdx] : tempGrid[srcIdx];

        const { r, g, b } = isVel 
          ? ParticleRenderer.speedToRgb(val)
          : ParticleRenderer.tempToRgb(val);

        const pIdx = (gy * w + gx) * 4;
        
        let alpha = 0;
        if (isVel) {
          // 風速: 0.5 m/s 以上で可視化
          alpha = (val > 0.5) ? Math.min(240, Math.floor(60 + val * 9)) : 0;
        } else {
          // 温度: 外気(25℃)より高い部分を可視化
          const tDiff = Math.max(0, val - 25);
          alpha = (tDiff > 0.5) ? Math.min(240, Math.floor(40 + tDiff * 4.5)) : 0;
        }

        pixels[pIdx] = Math.floor(r * 255);
        pixels[pIdx + 1] = Math.floor(g * 255);
        pixels[pIdx + 2] = Math.floor(b * 255);
        pixels[pIdx + 3] = alpha;
      }
    }

    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;

    // 2. 3D空間の速度ベクトル矢印の更新
    if (this.visible && this.showVectors) {
      this._update3DVectorArrows(uGrid, vGrid, velGrid, w, h);
    }

    // 3. 2D HUDキャンバスの描画
    if (hudCanvas) {
      const hudCtx = hudCanvas.getContext('2d');
      hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
      hudCtx.imageSmoothingEnabled = true;
      hudCtx.drawImage(this.canvas, 0, 0, hudCanvas.width, hudCanvas.height);

      if (this.showVectors) {
        // HUD上に風速ベクトル矢印をオーバーレイ描画
        this._drawHUDVectors(hudCtx, uGrid, vGrid, velGrid, w, h, hudCanvas.width, hudCanvas.height);
      } else if (!isVel) {
        // 温度等温線の描画
        this._drawIsothermHUD(hudCtx, tempGrid, hudCanvas.width, hudCanvas.height);
      }
    }
  }

  _update3DVectorArrows(uGrid, vGrid, velGrid, w, h) {
    const dx = (this.xRange[1] - this.xRange[0]) / this.vecCols;
    const dy = (this.yRange[1] - this.yRange[0]) / this.vecRows;

    let arrowIdx = 0;
    for (let row = 0; row < this.vecRows; row++) {
      for (let col = 0; col < this.vecCols; col++) {
        const gx = Math.min(w - 1, Math.floor((col + 0.5) * (w / this.vecCols)));
        const gy = Math.min(h - 1, Math.floor((row + 0.5) * (h / this.vecRows)));
        const gridIdx = gy * w + gx;

        const u = uGrid[gridIdx];
        const v = vGrid[gridIdx];
        const spd = velGrid[gridIdx];

        const arrow = this.arrows[arrowIdx++];
        if (!arrow) continue;

        if (spd > 0.8) {
          arrow.visible = true;
          const px = this.xRange[0] + (col + 0.5) * dx;
          const py = this.yRange[0] + (row + 0.5) * dy;
          arrow.position.set(px, py, 0);

          const len = Math.min(0.35, Math.max(0.08, spd * 0.022));
          arrow.setLength(len, len * 0.35, len * 0.25);
          arrow.setDirection(new THREE.Vector3(u / spd, v / spd, 0));

          const rgb = ParticleRenderer.speedToRgb(spd);
          arrow.setColor(new THREE.Color(rgb.r, rgb.g, rgb.b));
        } else {
          arrow.visible = false;
        }
      }
    }
  }

  // 2D HUDキャンバス上への風速ベクトル矢印描画
  _drawHUDVectors(ctx, uGrid, vGrid, velGrid, w, h, canvasW, canvasH) {
    const cols = 14;
    const rows = 6;
    ctx.lineWidth = 1.2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gx = Math.min(w - 1, Math.floor((c + 0.5) * (w / cols)));
        const gy = Math.min(h - 1, Math.floor((r + 0.5) * (h / rows)));
        const srcIdx = (h - 1 - gy) * w + gx;

        const spd = velGrid[srcIdx];
        if (spd < 1.0) continue;

        const u = uGrid[srcIdx];
        const v = vGrid[srcIdx];

        const cx = ((c + 0.5) / cols) * canvasW;
        const cy = ((r + 0.5) / rows) * canvasH;

        // 矢印の長さと向き
        const len = Math.min(18, Math.max(5, spd * 0.9));
        const angle = Math.atan2(-v, u); // Canvas は上がマイナスY

        const endX = cx + Math.cos(angle) * len;
        const endY = cy + Math.sin(angle) * len;

        const rgb = ParticleRenderer.speedToRgb(spd);
        ctx.strokeStyle = `rgb(${Math.floor(rgb.r * 255)}, ${Math.floor(rgb.g * 255)}, ${Math.floor(rgb.b * 255)})`;
        ctx.fillStyle = ctx.strokeStyle;

        // 矢印幹
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 矢じり
        const arrowHeadLen = 4;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowHeadLen * Math.cos(angle - Math.PI / 6), endY - arrowHeadLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - arrowHeadLen * Math.cos(angle + Math.PI / 6), endY - arrowHeadLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  _drawIsothermHUD(ctx, tempGrid, width, height) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    const w = this.gridX;
    const h = this.gridY;
    const targetIso = 60.0;

    ctx.beginPath();
    for (let gx = 0; gx < w - 1; gx++) {
      for (let gy = 0; gy < h - 1; gy++) {
        const t = tempGrid[(h - 1 - gy) * w + gx];
        const tRight = tempGrid[(h - 1 - gy) * w + (gx + 1)];
        if ((t - targetIso) * (tRight - targetIso) <= 0) {
          const frac = Math.abs(targetIso - t) / (Math.abs(tRight - t) + 0.001);
          const x = ((gx + frac) / w) * width;
          const y = (gy / h) * height;
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

window.SliceView = SliceView;
