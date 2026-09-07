/**
 * particleRenderer.js
 * Three.js を用いた熱流体パーティクルの高速・高品質レンダリング
 * - 頂点温度に応じた動的サーモグラフィカラー
 * - グロービルボードテクスチャ
 * - 流速ベクトル・流線表示
 */

class ParticleRenderer {
  constructor(scene, maxParticles = 5000) {
    this.scene = scene;
    this.maxParticles = maxParticles;

    // BufferGeometry
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colorAttr);

    // 円形ソフトグラデーションテクスチャの生成
    const particleTexture = this._createGlowTexture();

    // マテリアル
    this.material = new THREE.PointsMaterial({
      size: 0.14,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'CFDParticles';
    this.scene.add(this.points);

    // テンポラリカラー
    this._tempColor = new THREE.Color();
  }

  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  setParticleSize(size) {
    this.material.size = size;
  }

  setOpacity(op) {
    this.material.opacity = op;
  }

  setVisible(vis) {
    this.points.visible = vis;
  }

  setColorMode(mode) { // 'temp' または 'velocity'
    this.colorMode = mode;
  }

  /**
   * CFDシミュレーション配列からGPUバッファを更新
   */
  update(positions, temperatures, speeds, alive, maxCount) {
    const posArr = this.posAttr.array;
    const colArr = this.colorAttr.array;
    const isVelMode = (this.colorMode === 'velocity');

    for (let i = 0; i < maxCount; i++) {
      const idx3 = i * 3;
      if (alive[i]) {
        posArr[idx3] = positions[idx3];
        posArr[idx3 + 1] = positions[idx3 + 1];
        posArr[idx3 + 2] = positions[idx3 + 2];

        // カラーマップ（温度 or 流速）
        const { r, g, b } = isVelMode 
          ? ParticleRenderer.speedToRgb(speeds[i])
          : ParticleRenderer.tempToRgb(temperatures[i]);

        colArr[idx3] = r;
        colArr[idx3 + 1] = g;
        colArr[idx3 + 2] = b;
      } else {
        posArr[idx3] = 9999;
        posArr[idx3 + 1] = 9999;
        posArr[idx3 + 2] = 9999;
      }
    }

    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  static tempToRgb(temp) {
    const tMin = 20.0;
    const tMax = 95.0;
    const val = Math.max(0, Math.min(1, (temp - tMin) / (tMax - tMin)));

    let r = 0, g = 0, b = 0;
    if (val < 0.25) {
      const f = val / 0.25;
      r = 0.05;
      g = 0.2 + 0.7 * f;
      b = 0.95;
    } else if (val < 0.5) {
      const f = (val - 0.25) / 0.25;
      r = 0.05 + 0.3 * f;
      g = 0.9 + 0.1 * f;
      b = 0.95 * (1 - f);
    } else if (val < 0.75) {
      const f = (val - 0.5) / 0.25;
      r = 0.35 + 0.65 * f;
      g = 1.0;
      b = 0.05;
    } else {
      const f = (val - 0.75) / 0.25;
      r = 1.0;
      g = 1.0 * (1 - f * 0.8);
      b = 0.05;
    }
    return { r, g, b };
  }

  // 流速カラーマップ (0 〜 25 m/s)
  static speedToRgb(speed) {
    const sMax = 22.0; // 22 m/s
    const val = Math.max(0, Math.min(1, speed / sMax));

    let r = 0, g = 0, b = 0;
    if (val < 0.25) {
      const f = val / 0.25;
      r = 0.05;
      g = 0.3 + 0.6 * f;
      b = 0.9;
    } else if (val < 0.5) {
      const f = (val - 0.25) / 0.25;
      r = 0.05 + 0.4 * f;
      g = 0.9;
      b = 0.9 * (1 - f);
    } else if (val < 0.75) {
      const f = (val - 0.5) / 0.25;
      r = 0.45 + 0.55 * f;
      g = 0.95;
      b = 0.05;
    } else {
      const f = (val - 0.75) / 0.25;
      r = 1.0;
      g = 0.95 * (1 - f * 0.85);
      b = 0.1;
    }
    return { r, g, b };
  }
}

window.ParticleRenderer = ParticleRenderer;
