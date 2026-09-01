/**
 * renderer.js - Canvas描画エンジン
 * 翼型流線アニメーション、圧力コンター、FEM変形可視化
 */

'use strict';

const Renderer = (() => {

  // -------------------------------------------------------
  // カラーマップ
  // -------------------------------------------------------
  /**
   * 値 [0,1] を ブルー→シアン→グリーン→イエロー→レッド のカラーにマッピング
   */
  function colormap(t, scheme = 'pressure') {
    t = Math.max(0, Math.min(1, t));
    if (scheme === 'pressure') {
      // 圧力カラーマップ: 濃青(強負圧/低圧 -3.0) → シアン → 緑 → 黄 → 赤(高圧/澱み点 +1.0)
      if (t < 0.25) {
        const s = t / 0.25;
        return `rgb(${Math.round(20 + 20*s)},${Math.round(40 + 100*s)},${Math.round(180 + 75*s)})`; // 濃青→シアン
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        return `rgb(${Math.round(40 - 20*s)},${Math.round(140 + 100*s)},${Math.round(255 - 155*s)})`; // シアン→緑
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        return `rgb(${Math.round(20 + 235*s)},${Math.round(240 + 15*s)},${Math.round(100 - 100*s)})`; // 緑→黄
      } else {
        const s = (t - 0.75) / 0.25;
        return `rgb(255,${Math.round(255 - 215*s)},${Math.round(20*s)})`; // 黄→鮮烈赤
      }
    }
    if (scheme === 'stress') {
      // 青（低）→緑→黄→赤（高）
      if (t < 0.33) {
        const s = t / 0.33;
        return `rgb(0,${Math.round(120 + 135*s)},${Math.round(255 - 255*s)})`;
      } else if (t < 0.66) {
        const s = (t - 0.33) / 0.33;
        return `rgb(${Math.round(255*s)},255,0)`;
      } else {
        const s = (t - 0.66) / 0.34;
        return `rgb(255,${Math.round(255 - 255*s)},0)`;
      }
    }
    if (scheme === 'cool' || scheme === 'velocity' || scheme === 'turbo') {
      // 速度強調カラーマップ: 濃青(低速) → シアン → 明るい緑 → 黄 → 鮮烈な赤/マゼンタ(高速)
      if (t < 0.25) {
        const s = t / 0.25;
        return `rgb(${Math.round(20 + 30*s)},${Math.round(60 + 140*s)},${Math.round(180 + 75*s)})`; // 深青→シアン
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        return `rgb(${Math.round(50 - 50*s)},${Math.round(200 + 55*s)},${Math.round(255 - 135*s)})`; // シアン→ライムグリーン
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        return `rgb(${Math.round(255*s)},${Math.round(255 - 35*s)},${Math.round(120 - 120*s)})`; // グリーン→黄
      } else {
        const s = (t - 0.75) / 0.25;
        return `rgb(255,${Math.round(220 - 200*s)},${Math.round(20 + 80*s)})`; // 黄→鮮烈オレンジ/レッド
      }
    }
    return `hsl(${Math.round(240 - 240*t)},90%,55%)`;
  }

  // -------------------------------------------------------
  // 翼型描画（Canvas 2D）
  // -------------------------------------------------------
  /**
   * 翼型の上下面をキャンバスに描画
   */
  function drawAirfoil(ctx, airfoilData, ox, oy, scaleX, scaleY, opts = {}) {
    const { upper, lower } = airfoilData;
    const { fillColor = '#1a2a3a', strokeColor = '#4af', lineWidth = 1.5 } = opts;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox + upper[0].x * scaleX, oy - upper[0].y * scaleY);
    for (const p of upper) ctx.lineTo(ox + p.x * scaleX, oy - p.y * scaleY);
    for (let i = lower.length - 1; i >= 0; i--) {
      const p = lower[i];
      ctx.lineTo(ox + p.x * scaleX, oy - p.y * scaleY);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------
  // 圧力分布コンター描画
  // -------------------------------------------------------
  /**
   * 翼型表面に圧力係数を色分け表示
   */
  function drawPressureContour(ctx, airfoilData, cpUpper, cpLower, ox, oy, scaleX, scaleY) {
    const { upper, lower } = airfoilData;
    const N = upper.length - 1;

    const cpMin = -3.0, cpMax = 1.0;

    // 上面
    for (let i = 0; i < N; i++) {
      const p1 = upper[i], p2 = upper[i + 1];
      const t = (cpUpper[i] - cpMin) / (cpMax - cpMin);
      const color = colormap(1 - t, 'pressure');

      ctx.beginPath();
      ctx.moveTo(ox + p1.x * scaleX, oy - p1.y * scaleY);
      ctx.lineTo(ox + p2.x * scaleX, oy - p2.y * scaleY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // 下面
    for (let i = 0; i < N; i++) {
      const p1 = lower[i], p2 = lower[i + 1];
      const t = (cpLower[i] - cpMin) / (cpMax - cpMin);
      const color = colormap(1 - t, 'pressure');

      ctx.beginPath();
      ctx.moveTo(ox + p1.x * scaleX, oy - p1.y * scaleY);
      ctx.lineTo(ox + p2.x * scaleX, oy - p2.y * scaleY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  /**
   * Cp 分布グラフをキャンバスに描く（翼型図の上に）
   */
  function drawCpDistribution(ctx, airfoilData, cpUpper, cpLower, ox, oy, scaleX, scaleY) {
    const { upper, lower } = airfoilData;
    const N = upper.length - 1;
    const cpScale = 60; // Cp=1.0 → 60px

    ctx.save();
    // 上面 Cp
    ctx.beginPath();
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= N; i++) {
      const px = ox + upper[i].x * scaleX;
      const py = oy - upper[i].y * scaleY - cpUpper[i] * cpScale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 下面 Cp
    ctx.beginPath();
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= N; i++) {
      const px = ox + lower[i].x * scaleX;
      const py = oy - lower[i].y * scaleY - cpLower[i] * cpScale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------
  // 粒子ベースの流線アニメーション
  // -------------------------------------------------------
  class ParticleSystem {
    constructor(canvas, airfoilData, alpha, Vinf) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.airfoilData = airfoilData;
      this.alpha = alpha;
      this.Vinf = Vinf;
      this.animId = null;
      this.velocityField = null;
      this.gridNx = 512;
      this.gridNy = 256;
      this.N_PARTICLES = 400;
      this.chord = airfoilData.chord;
      this._initParticles();
    }

    setVelocityField(vf) {
      this.velocityField = vf;
      if (vf && vf.length > 0 && vf[0].length > 0) {
        this.gridNy = vf.length - 1;
        this.gridNx = vf[0].length - 1;
      }
    }

    _initParticles() {
      this.particles = [];
      for (let i = 0; i < this.N_PARTICLES; i++) {
        this._resetParticle(i, true);
      }
    }

    _resetParticle(i, random = false) {
      const c = this.canvas;
      const chord = this.chord;
      const ox = this.getOx();
      const oy = this.getOy();

      // 粒子を流入面（左端）および前縁上下の全域に均等配置
      // random時はキャンバス全体に散らす
      let px, py;
      if (random) {
        px = Math.random() * c.width;
        py = Math.random() * c.height;
      } else {
        // 流入境界（左端）
        px = Math.random() * (ox * 0.8) - 10;
        // 翼の上下にバランスよく流入させる
        py = (i / this.N_PARTICLES) * c.height;
      }

      this.particles[i] = {
        x: px,
        y: py,
        age: random ? Math.random() * 260 : 0,
        maxAge: 240 + Math.random() * 120,
        speed: 0.95 + Math.random() * 0.15,
        trail: [],
        alpha: 0.7 + Math.random() * 0.3,
      };
    }

    getScaleX() {
      return this.canvas.width * 0.52 / this.chord;
    }
    getScaleY() {
      return this.canvas.height * 0.52 / this.chord;
    }
    getOx() { return this.canvas.width * 0.12; }
    getOy() { return this.canvas.height * 0.52; }

    _getVelocity(wx, wy) {
      if (!this.velocityField) {
        return { u: this.Vinf * Math.cos(this.alpha), v: this.Vinf * Math.sin(this.alpha) };
      }
      const vf = this.velocityField;
      const chord = this.chord;
      const scaleX = this.getScaleX();
      const scaleY = this.getScaleY();
      const ox = this.getOx();
      const oy = this.getOy();

      // キャンバス座標 → 翼型基準ワールド座標 (LE=(0,0), TE=(chord,0))
      const worldX = (wx - ox) / scaleX;
      const worldY = -(wy - oy) / scaleY;

      const gridW = chord * 2.4;
      const gridH = chord * 2.0;
      const nx = this.gridNx, ny = this.gridNy;

      // gx in [-0.5*chord, 1.9*chord], gy in [-1.0*chord, 1.0*chord]
      const gi = ((worldX + 0.5 * chord) / gridW) * nx;
      const gj = ((worldY + 0.5 * gridH) / gridH) * ny;

      if (gi < 0 || gi >= nx || gj < 0 || gj >= ny) {
        return { u: this.Vinf * Math.cos(this.alpha), v: this.Vinf * Math.sin(this.alpha) };
      }

      const i0 = Math.max(0, Math.min(nx - 1, Math.floor(gi)));
      const j0 = Math.max(0, Math.min(ny - 1, Math.floor(gj)));
      const i1 = Math.min(nx, i0 + 1);
      const j1 = Math.min(ny, j0 + 1);

      const ti = gi - i0;
      const tj = gj - j0;

      const bilerp = (arr, i0, j0, i1, j1, ti, tj) => {
        try {
          const v00 = arr[j0][i0], v10 = arr[j0][i1];
          const v01 = arr[j1][i0], v11 = arr[j1][i1];
          if (!v00 || v00.inside) return { u: this.Vinf * 0.9, v: 0 };
          return (v00.u !== undefined)
            ? {
              u: (v00.u*(1-ti) + v10.u*ti)*(1-tj) + (v01.u*(1-ti) + v11.u*ti)*tj,
              v: (v00.v*(1-ti) + v10.v*ti)*(1-tj) + (v01.v*(1-ti) + v11.v*ti)*tj,
            }
            : { u: this.Vinf, v: 0 };
        } catch { return { u: this.Vinf, v: 0 }; }
      };

      return bilerp(vf, i0, j0, i1, j1, ti, tj);
    }

    _isInsideAirfoil(px, py) {
      const { upper, lower } = this.airfoilData;
      const scaleX = this.getScaleX(), scaleY = this.getScaleY();
      const ox = this.getOx(), oy = this.getOy();

      // AABB簡易チェック
      const axMin = ox + upper[0].x * scaleX - 1;
      const axMax = ox + upper[upper.length - 1].x * scaleX + 1;
      if (px < axMin || px > axMax) return { inside: false };

      // 翼型の上下面の y を補間
      const xi = (px - ox) / scaleX;
      let uY = oy, lY = oy;
      for (let i = 0; i < upper.length - 1; i++) {
        if (upper[i].x <= xi && xi <= upper[i + 1].x) {
          const t = (xi - upper[i].x) / (upper[i + 1].x - upper[i].x);
          uY = oy - (upper[i].y + t * (upper[i + 1].y - upper[i].y)) * scaleY;
          lY = oy - (lower[i].y + t * (lower[i + 1].y - lower[i].y)) * scaleY;
          break;
        }
      }
      const topY = Math.min(uY, lY);
      const botY = Math.max(uY, lY);
      const inside = py >= topY && py <= botY;
      const isUpperSide = py < (topY + botY) / 2;
      return { inside, topY, botY, isUpperSide };
    }

    update(dt = 1) {
      const c = this.canvas;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];

        // 翼型との接触判定
        const check = this._isInsideAirfoil(p.x, p.y);
        if (check.inside) {
          // 翼表面に沿って外側にスライド（上面なら上方、下面なら下方）
          if (check.isUpperSide) {
            p.y = check.topY - 1.5;
          } else {
            p.y = check.botY + 1.5;
          }
        }

        // 速度場から速度を取得
        const vel = this._getVelocity(p.x, p.y);
        const speed = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
        const normSpeed = Math.min(2.0, Math.max(0.2, speed / (this.Vinf || 1)));

        // 粒子移動ステップ (流速に比例)
        const step = 3.5;
        const dx = (vel.u / (this.Vinf || 1)) * step * p.speed;
        const dy = (-vel.v / (this.Vinf || 1)) * step * p.speed;

        p.trail.push({ x: p.x, y: p.y, speed: normSpeed });
        if (p.trail.length > 16) p.trail.shift();

        p.x += dx;
        p.y += dy;
        p.age++;

        // 画面外 or 寿命で再生成
        if (p.age > p.maxAge || p.x > c.width + 10 || p.x < -30
            || p.y < -30 || p.y > c.height + 30) {
          this._resetParticle(i, false);
        }
      }
    }

    draw(ctx, isStalled) {
      ctx.save();
      for (const p of this.particles) {
        if (p.trail.length < 2) continue;
        const n = p.trail.length;

        for (let k = 1; k < n; k++) {
          const t = k / n;
          const prev = p.trail[k - 1];
          const curr = p.trail[k];
          const spd = curr.speed;

          // 速度に応じた色
          let color;
          if (isStalled && p.trail[n - 1].x > this.getOx() + this.chord * this.getScaleX() * 0.3) {
            color = `hsla(${Math.round(30 - spd * 30)},90%,60%,${t * p.alpha * 0.7})`;
          } else {
            color = `hsla(${Math.round(200 - spd * 80)},85%,${Math.round(50 + spd * 30)}%,${t * p.alpha * 0.8})`;
          }

          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2 + spd * 1.8;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    startAnimation(renderCallback) {
      this._renderCallback = renderCallback;
      this._tick();
    }

    _tick() {
      this.update();
      if (this._renderCallback) this._renderCallback();
      this.animId = requestAnimationFrame(() => this._tick());
    }

    stop() {
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    updateParams(airfoilData, alpha, Vinf, velocityField) {
      this.airfoilData = airfoilData;
      this.alpha = alpha;
      this.Vinf = Vinf;
      this.velocityField = velocityField;
    }
  }

  // -------------------------------------------------------
  // FEM変形・応力コンター描画
  // -------------------------------------------------------
  /**
   * 翼スパン方向の変形形状を描画
   */
  function drawBeamDeformation(ctx, femResult, ox, oy, spanPixels, ampFactor = 50) {
    const { deflections, stresses, nNode, span } = femResult;
    if (!deflections) return;

    const maxStress = Math.max(...stresses, 1e3);
    const maxDefl = Math.max(...deflections.map(Math.abs), 1e-6);

    ctx.save();

    // 翼スパン（水平線）
    ctx.strokeStyle = 'rgba(100,180,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + spanPixels, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 変形後の翼スパン（カラーコンター）
    for (let i = 0; i < nNode - 1; i++) {
      const x1 = ox + (i / (nNode - 1)) * spanPixels;
      const y1 = oy - deflections[i] * ampFactor;
      const x2 = ox + ((i + 1) / (nNode - 1)) * spanPixels;
      const y2 = oy - deflections[i + 1] * ampFactor;

      // 応力で色付け（要素応力は nNode-1 個）
      const stress = i < stresses.length ? stresses[i] : 0;
      const t = Math.min(1, stress / (maxStress * 0.8));
      const color = colormap(t, 'stress');

      // 翼幅の描画（断面を示す帯）
      const chordPixels = spanPixels * 0.08;
      ctx.beginPath();
      ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ',0.7)');
      ctx.fillRect(x1, y1 - chordPixels / 2, x2 - x1, chordPixels);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 節点マーカー
    for (let i = 0; i < nNode; i++) {
      const x = ox + (i / (nNode - 1)) * spanPixels;
      const y = oy - deflections[i] * ampFactor;
      const stress = i < stresses.length ? stresses[i] : stresses[stresses.length - 1];
      const t = Math.min(1, stress / (maxStress * 0.8));

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = colormap(t, 'stress');
      ctx.fill();
    }

    // 翼根固定マーク
    ctx.fillStyle = 'rgba(255,255,100,0.9)';
    ctx.fillRect(ox - 4, oy - 20, 4, 40);

    ctx.restore();
  }

  /**
   * 翼断面の応力コンターを描画（2D翼断面上に）
   */
  function drawSectionStress(ctx, airfoilData, stressVal, maxStress, ox, oy, scaleX, scaleY) {
    const { upper, lower } = airfoilData;
    const N = upper.length - 1;
    const t = Math.min(1, stressVal / (maxStress || 1));

    // 断面全体を応力色で塗る（グラデーション）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox + upper[0].x * scaleX, oy - upper[0].y * scaleY);
    for (const p of upper) ctx.lineTo(ox + p.x * scaleX, oy - p.y * scaleY);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(ox + lower[i].x * scaleX, oy - lower[i].y * scaleY);
    ctx.closePath();

    // ラジアルグラデーション（上面が高応力）
    const cx = ox + 0.4 * airfoilData.chord * scaleX;
    const cy = oy - 0.01 * airfoilData.chord * scaleY;
    const r = airfoilData.chord * scaleX * 0.5;
    const grad = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.05, cx, cy, r * 1.1);
    const c1 = colormap(t * 0.9, 'stress');
    const c2 = colormap(t * 0.3, 'stress');
    grad.addColorStop(0, c1.replace('rgb', 'rgba').replace(')', ',0.85)'));
    grad.addColorStop(1, c2.replace('rgb', 'rgba').replace(')', ',0.5)'));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  /**
   * カラーバー（凡例）の描画
   */
  function drawColorBar(ctx, x, y, w, h, minVal, maxVal, label, scheme = 'stress') {
    // 文字列で渡された場合も数値に変換する
    minVal = Number(minVal);
    maxVal = Number(maxVal);
    ctx.save();
    const grad = ctx.createLinearGradient(x, y + h, x, y);
    for (let i = 0; i <= 10; i++) {
      grad.addColorStop(i / 10, colormap(i / 10, scheme));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#ccc';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(maxVal.toFixed(1), x + w + 4, y + 8);
    ctx.fillText(minVal.toFixed(1), x + w + 4, y + h + 4);
    ctx.fillText(label, x, y - 6);
    ctx.restore();
  }


  /**
   * スタンバイ画面（初期状態）
   */
  function drawStandby(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,20,40,0.95)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(100,180,255,0.15)';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('「解析実行」ボタンを押してシミュレーションを開始', w / 2, h / 2);
    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = 'rgba(100,180,255,0.5)';
    ctx.fillText('CFD + FEM 連成解析が実行されます', w / 2, h / 2 + 28);
  }

  // -------------------------------------------------------
  // 矢印描画ユーティリティ
  // -------------------------------------------------------
  /**
   * キャンバスに矢印を1本描く
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x0,y0 - 始点
   * @param {number} x1,y1 - 終点
   * @param {string} color
   * @param {number} lineW
   * @param {number} headSize - 矢頭サイズ [px]
   */
  function drawArrow(ctx, x0, y0, x1, y1, color, lineW = 1.5, headSize = 6) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';

    // 軸線（矢頭の手前まで）
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * headSize * 0.8, y1 - uy * headSize * 0.8);
    ctx.stroke();

    // 矢頭（三角形）
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headSize * Math.cos(ang - 0.4), y1 - headSize * Math.sin(ang - 0.4));
    ctx.lineTo(x1 - headSize * Math.cos(ang + 0.4), y1 - headSize * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 速度ベクトル場描画
  // -------------------------------------------------------
  /**
   * 速度場の矢印グリッドを描画する
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} velocityField - [[{u,v,inside,speed}]] 2D配列
   * @param {number} ox,oy - 翼型の画面オフセット
   * @param {number} W,H - canvas幅高さ
   * @param {number} Vinf - 一様流速度（正規化用）
   * @param {number} nx,ny - グリッド分割数
   * @param {number} chord
   */
  function drawVelocityVectors(ctx, velocityField, ox, oy, W, H, Vinf, chord) {
    if (!velocityField || velocityField.length === 0) return;

    const ny = velocityField.length - 1;
    const nx = velocityField[0].length - 1;

    // 高密度ベクトル表示 (nx/54, ny/30)
    const skipX = Math.max(1, Math.floor(nx / 52));
    const skipY = Math.max(1, Math.floor(ny / 28));

    let vMax = 0;
    for (const row of velocityField) {
      for (const cell of row) {
        if (!cell.inside && cell.speed) vMax = Math.max(vMax, cell.speed);
      }
    }
    vMax = Math.max(vMax, Vinf * 0.5);

    const arrowScale = Math.min(W, H) * 0.030;
    const gridW = chord * 2.4;
    const gridH = chord * 2.0;
    const scaleX = W * 0.52 / chord;
    const scaleY = H * 0.52 / chord;

    ctx.save();
    for (let j = 0; j <= ny; j += skipY) {
      const gy = ((j / ny) - 0.5) * gridH;
      const py = oy - gy * scaleY;

      for (let i = 0; i <= nx; i += skipX) {
        const cell = velocityField[j][i];
        if (!cell || cell.inside) continue;

        const gx = -0.5 * chord + (i / nx) * gridW;
        const px = ox + gx * scaleX;

        const spd = Math.min(1.0, cell.speed / vMax);
        // 速度強調スケーリング（高速域を際立たせる）
        const len = (0.25 + 0.75 * Math.pow(spd, 1.2)) * arrowScale;
        const lineW = 0.9 + spd * 1.8; // 0.9px ~ 2.7px
        const headSz = 3.5 + spd * 5.0; // 3.5px ~ 8.5px

        const mag = Math.sqrt(cell.u * cell.u + cell.v * cell.v) || 1;
        const ux = cell.u / mag;
        const uy = -cell.v / mag;

        const color = colormap(spd, 'turbo');

        // 高速部（特に翼上面の加速流）の発光強調
        if (spd > 0.55) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 4 + spd * 4;
        } else {
          ctx.shadowBlur = 0;
        }

        drawArrow(
          ctx,
          px - ux * len * 0.35,
          py - uy * len * 0.35,
          px + ux * len * 0.65,
          py + uy * len * 0.65,
          color,
          lineW,
          headSz
        );
      }
    }
    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 速度場コンター描画 (流場全体の速度スカラー分布)
  // -------------------------------------------------------
  /**
   * 速度場全体の速度コンター（ヒートマップ）を描画
   */
  function drawVelocityContour(ctx, velocityField, ox, oy, W, H, Vinf, chord) {
    if (!velocityField || velocityField.length === 0) return;

    const ny = velocityField.length - 1;
    const nx = velocityField[0].length - 1;
    const gridW = chord * 2.4;
    const gridH = chord * 2.0;
    const scaleX = W * 0.52 / chord;
    const scaleY = H * 0.52 / chord;

    const stepX = Math.max(1, Math.floor(nx / 128));
    const stepY = Math.max(1, Math.floor(ny / 64));
    const cellW = (stepX / nx) * gridW * scaleX + 1.2;
    const cellH = (stepY / ny) * gridH * scaleY + 1.2;

    let vMax = Vinf * 1.5;

    ctx.save();
    for (let j = 0; j <= ny; j += stepY) {
      const gy = ((j / ny) - 0.5) * gridH;
      const py = oy - gy * scaleY - cellH / 2;

      for (let i = 0; i <= nx; i += stepX) {
        const cell = velocityField[j][i];
        if (!cell || cell.inside) continue;

        const gx = -0.5 * chord + (i / nx) * gridW;
        const px = ox + gx * scaleX - cellW / 2;

        const t = Math.min(1.0, Math.max(0.0, cell.speed / vMax));
        const col = colormap(t, 'turbo');
        ctx.fillStyle = col.replace('rgb', 'rgba').replace(')', ',0.65)');
        ctx.fillRect(px, py, cellW, cellH);
      }
    }
    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 圧力場コンター描画 (流場全体の圧力係数 Cp 分布)
  // -------------------------------------------------------
  /**
   * 圧力場全体の Cp コンター（ヒートマップ）を描画
   */
  function drawPressureFieldContour(ctx, velocityField, ox, oy, W, H, Vinf, chord) {
    if (!velocityField || velocityField.length === 0) return;

    const ny = velocityField.length - 1;
    const nx = velocityField[0].length - 1;
    const gridW = chord * 2.4;
    const gridH = chord * 2.0;
    const scaleX = W * 0.52 / chord;
    const scaleY = H * 0.52 / chord;

    const stepX = Math.max(1, Math.floor(nx / 128));
    const stepY = Math.max(1, Math.floor(ny / 64));
    const cellW = (stepX / nx) * gridW * scaleX + 1.2;
    const cellH = (stepY / ny) * gridH * scaleY + 1.2;

    const cpMin = -3.0, cpMax = 1.0;

    ctx.save();
    for (let j = 0; j <= ny; j += stepY) {
      const gy = ((j / ny) - 0.5) * gridH;
      const py = oy - gy * scaleY - cellH / 2;

      for (let i = 0; i <= nx; i += stepX) {
        const cell = velocityField[j][i];
        if (!cell || cell.inside) continue;

        const gx = -0.5 * chord + (i / nx) * gridW;
        const px = ox + gx * scaleX - cellW / 2;

        // Bernoulli 式による局所 Cp
        const cpLocal = 1.0 - Math.pow(cell.speed / (Vinf || 1), 2);
        const t = Math.min(1.0, Math.max(0.0, (cpLocal - cpMin) / (cpMax - cpMin)));

        const col = colormap(t, 'pressure');
        ctx.fillStyle = col.replace('rgb', 'rgba').replace(')', ',0.75)');
        ctx.fillRect(px, py, cellW, cellH);
      }
    }
    ctx.restore();
  }

  // -------------------------------------------------------
  // FEM: 変位ベクトル描画
  // -------------------------------------------------------
  /**
   * スパン方向の変位ベクトルを描画する
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} femResult
   * @param {number} ox,oy - スパン図の基準点
   * @param {number} spanPixels - スパン図の幅 [px]
   * @param {number} ampFactor - 変形拡大係数
   */
  function drawDisplacementVectors(ctx, femResult, ox, oy, spanPixels, ampFactor = 50) {
    const { deflections, rotations, stresses, nNode, span } = femResult;
    if (!deflections) return;

    const maxDefl = Math.max(...deflections.map(Math.abs), 1e-6);
    const maxStress = Math.max(...stresses, 1e3);
    const maxRot = Math.max(...rotations.map(Math.abs), 1e-6);

    ctx.save();

    // 基準軸（変形前スパン）
    ctx.strokeStyle = 'rgba(100,180,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + spanPixels, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 各節点に変位ベクトル矢印を描く
    for (let i = 0; i < nNode; i++) {
      const x = ox + (i / (nNode - 1)) * spanPixels;
      const y = oy; // 変形前位置

      const defl = deflections[i];
      const rot  = rotations[i];
      const stress = i < stresses.length ? stresses[i] : stresses[stresses.length - 1];

      const t = Math.min(1, stress / (maxStress * 0.8));
      const color = colormap(t, 'stress');

      // 変位ベクトル（垂直成分: 曲げたわみ、水平成分: 回転角による水平投影）
      const dy = defl * ampFactor;
      const dx = rot * spanPixels * 0.04; // 回転による水平分量（微小）

      const vx = x + dx;
      const vy = y - dy;

      // 変位が小さすぎる場合はスキップ
      if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) {
        // 点のみ表示
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        continue;
      }

      // 変位矢印
      const arrowColor = color.replace('rgb', 'rgba').replace(')', ',0.9)');
      drawArrow(ctx, x, y, vx, vy, arrowColor, 1.8 + t * 1.5, 7 + t * 5);

      // 節点円
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      // 変位後の点
      ctx.beginPath();
      ctx.arc(vx, vy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = arrowColor;
      ctx.fill();
    }

    // 変形後の形状（細線で）
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200,255,220,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i < nNode; i++) {
      const x = ox + (i / (nNode - 1)) * spanPixels;
      const dx = rotations[i] * spanPixels * 0.04;
      const dy = deflections[i] * ampFactor;
      if (i === 0) ctx.moveTo(x + dx, oy - dy);
      else ctx.lineTo(x + dx, oy - dy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 翼根固定マーク
    ctx.fillStyle = 'rgba(255,255,100,0.9)';
    ctx.fillRect(ox - 4, oy - 20, 4, 40);

    // 凡例
    ctx.fillStyle = 'rgba(200,255,220,0.6)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('● 変位前節点  → 変位ベクトル  ● 変位後節点', ox + 8, oy + 28);

    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 翼型幾何ラベル・寸法線描画 (スッキリした引出線＋バッジ表示)
  // -------------------------------------------------------
  /**
   * 翼型の各部名称・寸法線・キャンバー線・コード線を描画
   */
  function drawAirfoilGeometryLabels(ctx, airfoilData, ox, oy, scaleX, scaleY) {
    if (!airfoilData || !airfoilData.upper) return;
    const { upper, lower, preset, chord = 1.6 } = airfoilData;
    const { m = 0.04, p = 0.4, t = 0.12 } = preset || {};

    const leX = ox;
    const leY = oy;
    const teX = ox + chord * scaleX;
    const teY = oy;

    ctx.save();

    // ── 1. コード線 (翼弦線) ──
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(leX, leY);
    ctx.lineTo(teX, teY);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 2. キャンバー線 (中心線) ──
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    const N = upper.length;
    for (let i = 0; i < N; i++) {
      const cx = (upper[i].x + lower[i].x) * 0.5;
      const cy = (upper[i].y + lower[i].y) * 0.5;
      const px = ox + cx * scaleX;
      const py = oy - cy * scaleY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 3. 前縁 & 後縁 点マーカー ──
    [ {x: leX, y: leY, label: '前縁 (LE)', align: 'right', dx: -8},
      {x: teX, y: teY, label: '後縁 (TE)', align: 'left',  dx: 8}
    ].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4466';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 小型バッジ
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(10,24,45,0.85)';
      const txt = pt.label;
      const tw = ctx.measureText(txt).width;
      const bx = pt.align === 'right' ? pt.x - tw - 14 : pt.x + 8;
      ctx.fillRect(bx, pt.y - 8, tw + 8, 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(bx, pt.y - 8, tw + 8, 16);
      ctx.fillStyle = '#ff8899';
      ctx.textAlign = 'left';
      ctx.fillText(txt, bx + 4, pt.y + 4);
    });

    // ── 4. 上部引出線：最大翼厚 & 最大キャンバー（上部余白に整理） ──
    const maxThickX = ox + 0.30 * chord * scaleX;
    const maxThickTop = oy - (m * 0.8 + t * 0.5) * chord * scaleY;
    const calloutY = oy - chord * scaleY * 0.28;

    // 最大翼厚の引出線
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 210, 68, 0.6)';
    ctx.lineWidth = 1;
    ctx.moveTo(maxThickX, maxThickTop - 2);
    ctx.lineTo(maxThickX, calloutY);
    ctx.stroke();

    // 最大翼厚バッジ
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(10,24,45,0.9)';
    ctx.fillRect(maxThickX - 45, calloutY - 14, 90, 16);
    ctx.strokeStyle = '#ffd244';
    ctx.strokeRect(maxThickX - 45, calloutY - 14, 90, 16);
    ctx.fillStyle = '#ffd244';
    ctx.textAlign = 'center';
    ctx.fillText(`最大翼厚 ${(t * 100).toFixed(0)}%c`, maxThickX, calloutY - 2);

    // ── 5. コード長寸法線 (下部余白) ──
    const dimY = oy + chord * scaleY * 0.24 + 10;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.moveTo(leX, oy + 6); ctx.lineTo(leX, dimY + 4);
    ctx.moveTo(teX, oy + 6); ctx.lineTo(teX, dimY + 4);
    ctx.moveTo(leX, dimY);   ctx.lineTo(teX, dimY);
    ctx.stroke();

    drawArrow(ctx, leX + 20, dimY, leX, dimY, 'rgba(255,255,255,0.6)', 1, 4);
    drawArrow(ctx, teX - 20, dimY, teX, dimY, 'rgba(255,255,255,0.6)', 1, 4);

    ctx.fillStyle = 'rgba(10,24,45,0.85)';
    const dimTxt = `コード長 c = ${chord.toFixed(2)} m`;
    ctx.font = '11px Inter, sans-serif';
    const dimTw = ctx.measureText(dimTxt).width;
    ctx.fillRect((leX + teX) * 0.5 - dimTw/2 - 6, dimY - 9, dimTw + 12, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect((leX + teX) * 0.5 - dimTw/2 - 6, dimY - 9, dimTw + 12, 16);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(dimTxt, (leX + teX) * 0.5, dimY + 3);

    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 重心・揚力・抗力・重力ベクトル描画 (バッジ付きクッキリ表示)
  // -------------------------------------------------------
  /**
   * 翼の重心位置から重力・揚力・抗力ベクトルを描画
   */
  function drawAerodynamicAndGravityVectors(ctx, cg, liftN, dragN, weightN, alpha, ox, oy, scaleX, scaleY, H) {
    if (!cg) return;

    const px = ox + cg.x * scaleX;
    const py = oy - cg.y * scaleY;

    // スケーリング
    const maxLen = H * 0.32;
    const baseForce = Math.max(Math.abs(liftN), Math.abs(weightN), 1000);
    const scaleL = Math.min(1.0, Math.max(0.18, Math.abs(liftN) / baseForce));
    const scaleW = Math.min(1.0, Math.max(0.18, Math.abs(weightN) / baseForce));
    const scaleD = Math.min(0.55, Math.max(0.20, (Math.abs(dragN || liftN * 0.05) / baseForce) * 4.0));

    const lenL = scaleL * maxLen;
    const lenW = scaleW * maxLen;
    const lenD = scaleD * maxLen;

    ctx.save();

    // ── 1. 揚力ベクトル L (飛行方向に厳密に垂直上向き・グリーン) ──
    const gamma = (typeof resultGamma !== 'undefined') ? resultGamma : 0;
    const lx = px + lenL * Math.sin(gamma);
    const ly = py - lenL * Math.cos(gamma);
    ctx.shadowColor = 'rgba(0, 255, 150, 0.8)';
    ctx.shadowBlur = 6;
    drawArrow(ctx, px, py, lx, ly, '#28e68a', 2.5, 9);

    // ── 2. 抗力ベクトル D (飛行方向に平行後向き・レッド) ──
    const dx = px + lenD * Math.cos(gamma);
    const dy = py + lenD * Math.sin(gamma);
    ctx.shadowColor = 'rgba(255, 68, 102, 0.8)';
    ctx.shadowBlur = 6;
    drawArrow(ctx, px, py, dx, dy, '#ff4466', 2.5, 9);

    // ── 3. 重力ベクトル W (地球鉛直真下・オレンジ) ──
    // 水平面に対して常に真下 90°
    const wx = px;
    const wy = py + lenW;
    ctx.shadowColor = 'rgba(255, 170, 0, 0.8)';
    ctx.shadowBlur = 6;
    drawArrow(ctx, px, py, wx, wy, '#ffaa00', 2.5, 9);

    ctx.shadowBlur = 0;

    // ── 揚力と抗力の直角記号 (90° Orthogonality Mark) ──
    const rSize = 12;
    const rLx = Math.sin(gamma) * rSize;
    const rLy = -Math.cos(gamma) * rSize;
    const rDx = Math.cos(gamma) * rSize;
    const rDy = Math.sin(gamma) * rSize;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.moveTo(px + rLx, py + rLy);
    ctx.lineTo(px + rLx + rDx, py + rLy + rDy);
    ctx.lineTo(px + rDx, py + rDy);
    ctx.stroke();

    // ── 4. 重心シンボル ⊕ (クッキリ小型化) ──
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#060d1a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 0.5);
    ctx.lineTo(px, py);
    ctx.fillStyle = '#ffaa00';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 5, Math.PI, Math.PI * 1.5);
    ctx.lineTo(px, py);
    ctx.fill();

    // ── 5. 各力ラベル（半透明ピル背景付きで文字被りゼロ） ──
    ctx.font = 'bold 11px Inter, sans-serif';

    const drawPill = (text, tx, ty, color) => {
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(8, 18, 36, 0.90)';
      ctx.beginPath();
      ctx.roundRect(tx - 6, ty - 11, tw + 12, 18, 4);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(text, tx, ty + 2);
    };

    // 揚力ピル
    const liftStr = (liftN >= 1000) ? `${(liftN / 1000).toFixed(1)} kN` : `${liftN.toFixed(0)} N`;
    drawPill(`揚力 L: ${liftStr}`, lx + 6, ly - 6, '#28e68a');

    // 抗力ピル
    const dragStr = (dragN >= 1000) ? `${(dragN / 1000).toFixed(2)} kN` : `${(dragN || 0).toFixed(0)} N`;
    drawPill(`抗力 D: ${dragStr}`, dx + 6, dy - 2, '#ff4466');

    // 重力ピル
    const weightStr = (weightN >= 1000) ? `${(weightN / 1000).toFixed(2)} kN` : `${weightN.toFixed(0)} N`;
    drawPill(`重力 W (地球鉛直真下): ${weightStr}`, wx + 6, wy + 12, '#ffaa00');

    ctx.restore();
  }

  // -------------------------------------------------------
  // CFD: 飛行機の力のつりあい（上昇・水平・降下）& 幾何基準軸
  // -------------------------------------------------------
  /**
   * 航空工学標準の「上昇・水平・降下の幾何関係と力のつりあい」を描画
   */
  function drawAircraftFuselageAndFlightVectors(ctx, ox, oy, chord, scaleX, scaleY, alpha, gamma, W, H) {
    ctx.save();

    const theta = gamma + alpha; // ピッチ角 / 仰角
    const cLen = chord * scaleX;
    const noseX = ox - cLen * 0.85;
    const tailX = ox + cLen * 2.05;
    const fuseY = oy + cLen * 0.05;

    // ── 1. 飛行機胴体シルエット (控えめな半透明ゴースト描画) ──
    ctx.beginPath();
    ctx.moveTo(noseX, fuseY + cLen * 0.02);
    ctx.lineTo(noseX - cLen * 0.08, fuseY + cLen * 0.06);
    ctx.lineTo(noseX - cLen * 0.08, fuseY - cLen * 0.06);
    ctx.lineTo(noseX, fuseY - cLen * 0.02);
    ctx.bezierCurveTo(noseX + cLen * 0.35, fuseY - cLen * 0.12, ox - cLen * 0.15, fuseY - cLen * 0.38, ox + cLen * 0.25, fuseY - cLen * 0.38);
    ctx.bezierCurveTo(ox + cLen * 0.60, fuseY - cLen * 0.38, ox + cLen * 1.30, fuseY - cLen * 0.12, tailX - cLen * 0.35, fuseY - cLen * 0.06);
    ctx.lineTo(tailX - cLen * 0.15, fuseY - cLen * 0.55);
    ctx.bezierCurveTo(tailX + cLen * 0.05, fuseY - cLen * 0.55, tailX + cLen * 0.08, fuseY - cLen * 0.25, tailX + cLen * 0.10, fuseY - cLen * 0.02);
    ctx.lineTo(tailX + cLen * 0.08, fuseY + cLen * 0.04);
    ctx.bezierCurveTo(ox + cLen * 1.20, fuseY + cLen * 0.16, ox + cLen * 0.30, fuseY + cLen * 0.22, noseX + cLen * 0.40, fuseY + cLen * 0.16);
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 窓 (Windows)
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.07)';
    ctx.roundRect(ox - cLen * 0.05, fuseY - cLen * 0.32, cLen * 0.25, cLen * 0.14, 4);
    ctx.roundRect(ox + cLen * 0.24, fuseY - cLen * 0.30, cLen * 0.20, cLen * 0.12, 3);
    ctx.roundRect(ox + cLen * 0.48, fuseY - cLen * 0.27, cLen * 0.18, cLen * 0.10, 3);
    ctx.fill();

    // ── 2. 水平方向 基準線 (白の水平破線) ──
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(ox - cLen * 1.10, oy);
    ctx.lineTo(ox + cLen * 1.60, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    ctx.font = '10.5px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('水平方向 ──', ox - cLen * 0.75, oy - 6);

    // ── 3. 機軸方向 (主翼弦線 / 機首線) ──
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e'; // グリーン
    ctx.lineWidth = 1.2;
    ctx.moveTo(ox - cLen * 0.80, oy);
    ctx.lineTo(ox + cLen * 1.40, oy);
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`機軸方向 (仰角 θ=${(theta * 180 / Math.PI).toFixed(1)}°)`, ox - cLen * 0.75, oy - 18);

    // ── 4. 飛行方向 (青色矢印: 上昇/水平/降下) ──
    const flightStartX = ox - cLen * 0.30;
    const flightStartY = oy;
    const flightLen    = cLen * 0.60;
    const flightEndX   = flightStartX - flightLen * Math.cos(gamma);
    const flightEndY   = flightStartY - flightLen * Math.sin(gamma); // 上昇時は上に伸びる

    drawArrow(ctx, flightStartX, flightStartY, flightEndX, flightEndY, '#38bdf8', 2.0, 7);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const stateLabel = gamma > 0.01 ? '飛行方向 (上昇)' : gamma < -0.01 ? '飛行方向 (降下)' : '飛行方向 (水平)';
    ctx.fillText(stateLabel, flightEndX - 6, flightEndY + 4);

    // ── 5. 上昇角/降下角 γ アーク (水平線と飛行方向のなす角) ──
    if (Math.abs(gamma) > 0.01) {
      const gRadius = cLen * 0.28;
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      if (gamma > 0) {
        ctx.arc(flightStartX, flightStartY, gRadius, Math.PI, Math.PI - gamma, true);
      } else {
        ctx.arc(flightStartX, flightStartY, gRadius, Math.PI, Math.PI - gamma, false);
      }
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = '10.5px Inter, sans-serif';
      ctx.textAlign = 'right';
      const gAngle = Math.PI - gamma * 0.5;
      const gX = flightStartX + (gRadius + 10) * Math.cos(gAngle);
      const gY = flightStartY + (gRadius + 10) * Math.sin(gAngle);
      const gText = gamma > 0 ? `上昇角 γ: +${(gamma * 180 / Math.PI).toFixed(1)}°` : `降下角 γ: ${(gamma * 180 / Math.PI).toFixed(1)}°`;
      ctx.fillText(gText, gX, gY);
    }

    // ── 6. 迎角 α アーク (飛行方向と機軸方向のなす角) ──
    const arcRadius = cLen * 0.42;
    ctx.beginPath();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.6;
    if (alpha >= 0) {
      ctx.arc(flightStartX, flightStartY, arcRadius, Math.PI - gamma, Math.PI, false);
    } else {
      ctx.arc(flightStartX, flightStartY, arcRadius, Math.PI, Math.PI - gamma, false);
    }
    ctx.stroke();

    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const arcAngle = Math.PI - gamma * 0.5;
    const aX = flightStartX + (arcRadius + 12) * Math.cos(arcAngle);
    const aY = flightStartY + (arcRadius + 12) * Math.sin(arcAngle) - (gamma > 0 ? 8 : -8);
    ctx.fillText(`迎角 α: ${(alpha * 180 / Math.PI).toFixed(1)}°`, aX, aY + 3);

    // ── 7. 推力ベクトル T (Thrust: 機軸前向き) ──
    const thrustLen = cLen * 0.35;
    const tx = ox - thrustLen;
    const ty = oy;
    drawArrow(ctx, ox, oy, tx, ty, '#00d4ff', 2.2, 8);
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('推力 (T)', tx - 6, ty - 4);

    ctx.restore();
  }

  return {
    colormap,
    drawAirfoil,
    drawAirfoilGeometryLabels,
    drawAircraftFuselageAndFlightVectors,
    drawPressureContour,
    drawCpDistribution,
    drawBeamDeformation,
    drawSectionStress,
    drawColorBar,
    drawStandby,
    drawArrow,
    drawVelocityVectors,
    drawVelocityContour,
    drawPressureFieldContour,
    drawDisplacementVectors,
    drawAerodynamicAndGravityVectors,
    drawGravityAndLiftVectors: drawAerodynamicAndGravityVectors,
    ParticleSystem,
  };
})();
