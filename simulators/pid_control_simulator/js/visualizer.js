/**
 * 2D Physics Visualizer for Inverted Pendulum & Quadcopter Drone
 * リアルタイム物理可視化：倒立振子台車・ドローン姿勢・気流パーティクル・HUD描画
 */

(function() {
  class Visualizer {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');

      this.width = 800;
      this.height = 450;
      this.scale = 140; // 1m = 140px

      this.particles = [];
      this.windParticles = [];
      this.dragTarget = null;
      this.initEvents();
    }

    initEvents() {
      let isDown = false;

      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * (this.canvas.width / rect.width),
          y: (clientY - rect.top) * (this.canvas.height / rect.height)
        };
      };

      const onStart = (e) => {
        const pos = getPos(e);
        if (this.onMouseDownCallback) {
          this.onMouseDownCallback(pos);
        }
        isDown = true;
      };

      const onMove = (e) => {
        if (!isDown) return;
        const pos = getPos(e);
        if (this.onMouseMoveCallback) {
          this.onMouseMoveCallback(pos);
        }
      };

      const onEnd = () => {
        isDown = false;
        if (this.onMouseUpCallback) {
          this.onMouseUpCallback();
        }
      };

      this.canvas.addEventListener('mousedown', onStart);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);

      this.canvas.addEventListener('touchstart', onStart, { passive: true });
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('touchend', onEnd);
    }

    resize() {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight || 420;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = this.width = w;
        this.canvas.height = this.height = Math.max(380, h);
      }
    }

    render(physics, pid, setpoint) {
      this.resize();
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // 背景
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, h);

      this.drawGrid(ctx, w, h);

      if (physics.mode === 'pendulum') {
        this.drawPendulum(ctx, physics.cart, physics.g, pid, setpoint);
      } else {
        this.drawDrone(ctx, physics.drone, physics.g, pid, setpoint);
      }
    }

    drawGrid(ctx, w, h) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 40;

      ctx.beginPath();
      for (let x = 0; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    drawPendulum(ctx, cart, g, pid, setpoint) {
      const originX = this.width / 2;
      const originY = this.height * 0.72;

      const cartPxX = originX + cart.x * this.scale;
      const cartPxY = originY;

      // 1. レール
      const railHalfW = cart.railLimit * this.scale;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(originX - railHalfW, originY + 20);
      ctx.lineTo(originX + railHalfW, originY + 20);
      ctx.stroke();

      // 目盛り
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let m = -2; m <= 2; m++) {
        const rx = originX + m * this.scale;
        ctx.moveTo(rx, originY + 12);
        ctx.lineTo(rx, originY + 28);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${m > 0 ? '+' : ''}${m}m`, rx, originY + 42);
      }
      ctx.stroke();

      // ストッパー
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(originX - railHalfW - 8, originY + 4, 8, 28);
      ctx.fillRect(originX + railHalfW, originY + 4, 8, 28);

      // 2. カート本体
      const cartW = 100;
      const cartH = 40;
      const cx = cartPxX - cartW / 2;
      const cy = cartPxY - cartH / 2;

      // カートシャドウ
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(cx, cy + 8, cartW, cartH, 8);
      ctx.fill();

      // カートボディ
      const grad = ctx.createLinearGradient(cx, cy, cx, cy + cartH);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.5, '#0284c7');
      grad.addColorStop(1, '#0369a1');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cartW, cartH, 8);
      ctx.fill();
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 車輪
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      [cx + 18, cx + cartW - 18].forEach(wx => {
        ctx.beginPath();
        ctx.arc(wx, originY + 16, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // 3. 振子ロッド
      const rodLengthPx = cart.L * 2.0 * this.scale;
      const tipX = cartPxX + rodLengthPx * Math.sin(cart.theta);
      const tipY = cartPxY - rodLengthPx * Math.cos(cart.theta);

      // 目標ライン
      const targetTipX = cartPxX + rodLengthPx * Math.sin(setpoint);
      const targetTipY = cartPxY - rodLengthPx * Math.cos(setpoint);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cartPxX, cartPxY);
      ctx.lineTo(targetTipX, targetTipY);
      ctx.stroke();
      ctx.setLineDash([]);

      // ロッド
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cartPxX, cartPxY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 先端ウェイト
      const bobRadius = 16;
      const bobGrad = ctx.createRadialGradient(tipX - 4, tipY - 4, 2, tipX, tipY, bobRadius);
      bobGrad.addColorStop(0, '#fde047');
      bobGrad.addColorStop(0.7, '#eab308');
      bobGrad.addColorStop(1, '#a16207');
      ctx.fillStyle = bobGrad;
      ctx.beginPath();
      ctx.arc(tipX, tipY, bobRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ヒンジピン
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cartPxX, cartPxY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4. モータ駆動力矢印
      if (Math.abs(pid.saturatedOutput) > 0.5) {
        const arrowLen = Math.min(80, Math.abs(pid.saturatedOutput) * 1.5) * Math.sign(pid.saturatedOutput);
        ctx.strokeStyle = pid.saturatedOutput > 0 ? '#3b82f6' : '#ec4899';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cartPxX, cartPxY + 30);
        ctx.lineTo(cartPxX + arrowLen, cartPxY + 30);
        ctx.stroke();
        // 矢じり
        ctx.beginPath();
        ctx.moveTo(cartPxX + arrowLen, cartPxY + 30);
        ctx.lineTo(cartPxX + arrowLen - Math.sign(arrowLen) * 10, cartPxY + 24);
        ctx.lineTo(cartPxX + arrowLen - Math.sign(arrowLen) * 10, cartPxY + 36);
        ctx.fill();

        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText(`F = ${pid.saturatedOutput.toFixed(1)} N`, cartPxX + arrowLen / 2, cartPxY + 46);
      }

      // 5. 角度情報HUD
      const deg = ((cart.theta * 180) / Math.PI).toFixed(1);
      ctx.fillStyle = Math.abs(cart.theta) < 0.1 ? '#4ade80' : (Math.abs(cart.theta) < 0.3 ? '#facc15' : '#f87171');
      ctx.font = 'bold 13px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`θ = ${deg}°`, tipX, tipY - 24);
    }

    drawDrone(ctx, drone, g, pid, setpoint) {
      const originX = this.width / 2;
      const groundY = this.height * 0.85;

      const dronePxX = originX + drone.y * this.scale;
      const dronePxY = groundY - drone.z * this.scale;

      // 1. 地面
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(this.width, groundY);
      ctx.stroke();

      // 2. 目標高度ライン
      const targetY = groundY - setpoint * this.scale;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, targetY);
      ctx.lineTo(this.width, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`目標高度 z = ${setpoint.toFixed(2)} m`, 15, targetY - 6);

      // 3. スラスト気流
      this.updateThrustParticles(dronePxX, dronePxY, drone.phi, drone.thrustL, drone.thrustR);
      this.drawThrustParticles(ctx);

      // 4. ドローン本体
      ctx.save();
      ctx.translate(dronePxX, dronePxY);
      ctx.rotate(drone.phi);

      const armLenPx = drone.armLength * this.scale;

      // アーム
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-armLenPx, 0);
      ctx.lineTo(armLenPx, 0);
      ctx.stroke();

      // モータマウント
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-armLenPx - 6, -8, 12, 16);
      ctx.fillRect(armLenPx - 6, -8, 12, 16);

      // プロペラ
      const propW = 44;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.beginPath();
      ctx.ellipse(-armLenPx, -10, propW / 2, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(armLenPx, -10, propW / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // ボディ
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-20, -12, 40, 24, 6);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // LED
      const isStable = Math.abs(drone.phi) < 0.05 && Math.abs(drone.vz) < 0.1;
      ctx.fillStyle = isStable ? '#4ade80' : '#ef4444';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // スキッド
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, 12);
      ctx.lineTo(-18, 22);
      ctx.moveTo(12, 12);
      ctx.lineTo(18, 22);
      ctx.stroke();

      ctx.restore();

      // 5. 突風
      if (drone.windForce > 0) {
        this.drawWindEffect(ctx, dronePxX, dronePxY, drone.windForce);
      }

      // 6. HUD
      const rollDeg = ((drone.phi * 180) / Math.PI).toFixed(1);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`高度 z = ${drone.z.toFixed(2)}m | 傾斜 φ = ${rollDeg}°`, dronePxX, dronePxY - 35);
    }

    updateThrustParticles(x, y, phi, tl, tr) {
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      const lx = x - 35 * cosP;
      const ly = y - 35 * sinP;
      const rx = x + 35 * cosP;
      const ry = y + 35 * sinP;

      if (Math.random() < tl / 6.0) {
        this.particles.push({
          x: lx,
          y: ly,
          vx: sinP * 3 + (Math.random() - 0.5) * 2,
          vy: cosP * 5 + (Math.random() - 0.5) * 2,
          life: 1.0
        });
      }
      if (Math.random() < tr / 6.0) {
        this.particles.push({
          x: rx,
          y: ry,
          vx: sinP * 3 + (Math.random() - 0.5) * 2,
          vy: cosP * 5 + (Math.random() - 0.5) * 2,
          life: 1.0
        });
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    drawThrustParticles(ctx) {
      this.particles.forEach(p => {
        ctx.fillStyle = `rgba(56, 189, 248, ${p.life * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1.0 - p.life) * 6 + 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawWindEffect(ctx, x, y, force) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const wx = (Date.now() / 5 + i * 40) % this.width;
        const wy = y - 50 + i * 25;
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 30, wy);
      }
      ctx.stroke();

      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 12px Noto Sans JP, sans-serif';
      ctx.fillText(`🌪️ 突風横風 +${force.toFixed(1)}N`, x, y + 60);
    }
  }

  window.Visualizer = Visualizer;
})();
