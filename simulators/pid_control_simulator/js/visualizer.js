/**
 * 2D Physics & Process Visualizer
 * プロセス制御＆メカトロニクス可視化エンジン
 * 1. ⚗️ CSTR加熱反応器 (液温ヒートマップ・撹拌アニメーション・ヒータージャケット発光)
 * 2. 🚰 バッファタンク液位 (透明円筒タンク・水面波打ち・バルブ流入ジェット・目盛り)
 * 3. 🛴 倒立振子台車 (リニアレール・直立角度・モータ推力ベクトル)
 * 4. 🚁 クアッドコプター・ドローン (姿勢ロール角・スラスト気流パーティクル)
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
      this.fluidParticles = [];
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

      if (physics.mode === 'cstr') {
        this.drawCstr(ctx, physics.cstr, pid, setpoint);
      } else if (physics.mode === 'tank') {
        this.drawTank(ctx, physics.tank, pid, setpoint);
      } else if (physics.mode === 'pendulum') {
        this.drawPendulum(ctx, physics.cart, physics.g, pid, setpoint);
      } else if (physics.mode === 'drone') {
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

    // ==========================================
    // 1. CSTR 加熱反応器 可視化
    // ==========================================
    drawCstr(ctx, cstr, pid, setpoint) {
      const cx = this.width / 2;
      const cy = this.height / 2 + 10;
      const tankW = 200;
      const tankH = 220;
      const tankLeft = cx - tankW / 2;
      const tankTop = cy - tankH / 2;

      // 1. パイプライン
      // 流入パイプ (左上 -> タンク上部)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(50, tankTop + 40);
      ctx.lineTo(tankLeft + 30, tankTop + 40);
      ctx.lineTo(tankLeft + 30, tankTop + 70);
      ctx.stroke();

      // 原料流入液ストリーム
      const feedColor = cstr.distDuration > 0 ? '#38bdf8' : '#06b6d4';
      ctx.strokeStyle = feedColor;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(50, tankTop + 40);
      ctx.lineTo(tankLeft + 30, tankTop + 40);
      ctx.lineTo(tankLeft + 30, tankTop + 75);
      ctx.stroke();

      // 流出パイプ (タンク右下 -> 右端)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(tankLeft + tankW - 30, tankTop + tankH - 40);
      ctx.lineTo(this.width - 50, tankTop + tankH - 40);
      ctx.stroke();

      // 2. 加熱ジャケット (タンク外側)
      const heatFrac = Math.min(1.0, cstr.heaterPower / cstr.heaterMax);
      const jacketGrad = ctx.createLinearGradient(tankLeft - 15, cy, tankLeft + tankW + 15, cy);
      jacketGrad.addColorStop(0, `rgba(239, 68, 68, ${0.15 + heatFrac * 0.7})`);
      jacketGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.1 + heatFrac * 0.5})`);
      jacketGrad.addColorStop(1, `rgba(239, 68, 68, ${0.15 + heatFrac * 0.7})`);

      ctx.fillStyle = jacketGrad;
      ctx.beginPath();
      ctx.roundRect(tankLeft - 14, tankTop + 40, tankW + 28, tankH - 26, 16);
      ctx.fill();
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + heatFrac * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 加熱コイルグロー効果
      if (heatFrac > 0.05) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15 * heatFrac;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = tankTop + 60; y <= tankTop + tankH - 10; y += 18) {
          ctx.moveTo(tankLeft - 10, y);
          ctx.lineTo(tankLeft - 2, y);
          ctx.moveTo(tankLeft + tankW + 2, y);
          ctx.lineTo(tankLeft + tankW + 10, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 3. タンク内壁 (透明リアクター)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(tankLeft, tankTop, tankW, tankH, 12);
      ctx.fill();

      // 4. 反応液 (温度に応じたヒートマップ色)
      // 20℃: 青(#0284c7) -> 50℃: シアン/緑(#10b981) -> 80℃: オレンジ(#f59e0b) -> 100℃: 赤(#ef4444)
      const tempNorm = Math.max(0, Math.min(1, (cstr.T - 20) / 80));
      let liquidR = Math.floor(14 + tempNorm * 220);
      let liquidG = Math.floor(132 + (1 - Math.abs(tempNorm - 0.5) * 2) * 50 - tempNorm * 70);
      let liquidB = Math.floor(199 * (1 - tempNorm * 0.85));

      const liquidGrad = ctx.createLinearGradient(cx, tankTop + 40, cx, tankTop + tankH);
      liquidGrad.addColorStop(0, `rgba(${liquidR}, ${liquidG}, ${liquidB}, 0.75)`);
      liquidGrad.addColorStop(1, `rgba(${Math.max(0, liquidR - 30)}, ${Math.max(0, liquidG - 30)}, ${Math.max(0, liquidB - 30)}, 0.95)`);

      ctx.fillStyle = liquidGrad;
      ctx.beginPath();
      ctx.roundRect(tankLeft + 4, tankTop + 45, tankW - 8, tankH - 49, [4, 4, 10, 10]);
      ctx.fill();

      // 5. 撹拌機 (Shaft & Impeller)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, tankTop - 25);
      ctx.lineTo(cx, tankTop + tankH - 60);
      ctx.stroke();

      // 撹拌モータ (トップ)
      ctx.fillStyle = '#334155';
      ctx.fillRect(cx - 24, tankTop - 38, 48, 16);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx - 18, tankTop - 34, 36, 8);

      // 撹拌翼 (回転アニメーション)
      const bladeW = 55 * Math.cos(cstr.impellerAngle);
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.ellipse(cx, tankTop + tankH - 60, Math.abs(bladeW), 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 6. タンク外枠
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(tankLeft, tankTop, tankW, tankH, 12);
      ctx.stroke();

      // 7. 温度計HUD (タンク内部・右側)
      const thermoX = tankLeft + tankW + 45;
      const thermoY = cy - 80;
      const thermoH = 160;

      // 目標温度バー
      const targetRatio = Math.max(0, Math.min(1, (setpoint - 20) / 80));
      const targetY = thermoY + thermoH * (1 - targetRatio);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(tankLeft + 4, targetY);
      ctx.lineTo(thermoX + 25, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`目標: ${setpoint.toFixed(1)}℃`, thermoX + 30, targetY + 4);

      // 温度計ボディ
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(thermoX, thermoY, 14, thermoH, 7);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 温度計液柱
      const curRatio = Math.max(0, Math.min(1, (cstr.T - 20) / 80));
      const curH = thermoH * curRatio;
      ctx.fillStyle = `rgb(${liquidR}, ${liquidG}, ${liquidB})`;
      ctx.beginPath();
      ctx.roundRect(thermoX + 2, thermoY + thermoH - curH, 10, curH, 5);
      ctx.fill();

      // HUDテキスト
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px JetBrains Mono, monospace';
      ctx.fillStyle = `rgb(${liquidR}, ${liquidG}, ${liquidB})`;
      ctx.fillText(`T = ${cstr.T.toFixed(1)} °C`, cx, tankTop - 48);

      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ヒーター操作量 u: ${(pid.saturatedOutput).toFixed(1)} % (${cstr.heaterPower.toFixed(1)} kW)`, cx, tankTop + tankH + 28);
      if (cstr.distDuration > 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`⚠️ 原料温度急冷外乱発生中 (${cstr.distTemp.toFixed(1)}℃)`, cx, tankTop + tankH + 46);
      }
    }

    // ==========================================
    // 2. バッファタンク液位 可視化
    // ==========================================
    drawTank(ctx, tank, pid, setpoint) {
      const cx = this.width / 2;
      const cy = this.height / 2 + 10;
      const tankW = 180;
      const tankH = 240;
      const tankLeft = cx - tankW / 2;
      const tankTop = cy - tankH / 2;

      // 1. パイプライン
      // 上部流入パイプ
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(cx, tankTop - 50);
      ctx.lineTo(cx, tankTop);
      ctx.stroke();

      // 流入バルブ (開度アニメーション)
      const valveOpen = tank.valveInOpen;
      ctx.fillStyle = valveOpen > 0.1 ? '#38bdf8' : '#64748b';
      ctx.beginPath();
      ctx.arc(cx, tankTop - 25, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 流入ジェット噴射
      if (valveOpen > 0.02) {
        const jetGrad = ctx.createLinearGradient(cx, tankTop, cx, tankTop + 70);
        jetGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
        jetGrad.addColorStop(1, 'rgba(14, 165, 233, 0.2)');
        ctx.fillStyle = jetGrad;
        ctx.beginPath();
        const jetW = 4 + valveOpen * 12;
        ctx.rect(cx - jetW / 2, tankTop, jetW, 80);
        ctx.fill();
      }

      // 下部流出パイプ
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(tankLeft + tankW - 15, tankTop + tankH - 20);
      ctx.lineTo(this.width - 60, tankTop + tankH - 20);
      ctx.stroke();

      // 2. タンク本体 (クリアガラス)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(tankLeft, tankTop, tankW, tankH, 8);
      ctx.fill();

      // 3. 液体 (水面高さ比例)
      const fillRatio = Math.max(0, Math.min(1, tank.h / tank.maxH));
      const liquidH = tankH * fillRatio;
      const liquidTop = tankTop + tankH - liquidH;

      const waterGrad = ctx.createLinearGradient(cx, liquidTop, cx, tankTop + tankH);
      waterGrad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
      waterGrad.addColorStop(0.5, 'rgba(2, 132, 199, 0.9)');
      waterGrad.addColorStop(1, 'rgba(3, 105, 161, 0.95)');

      ctx.fillStyle = waterGrad;
      ctx.beginPath();
      ctx.roundRect(tankLeft + 3, liquidTop, tankW - 6, liquidH - 3, [0, 0, 6, 6]);
      ctx.fill();

      // 水面の波打ち
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tankLeft + 3, liquidTop);
      ctx.lineTo(tankLeft + tankW - 3, liquidTop);
      ctx.stroke();

      // 4. 目盛り＆目標液位ライン
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let m = 0.5; m <= 3.0; m += 0.5) {
        const my = tankTop + tankH - (m / tank.maxH) * tankH;
        ctx.beginPath();
        ctx.moveTo(tankLeft + 4, my);
        ctx.lineTo(tankLeft + 16, my);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${m.toFixed(1)}m`, tankLeft + 20, my + 3);
      }

      // 目標液位ライン
      const targetRatio = Math.max(0, Math.min(1, setpoint / tank.maxH));
      const targetY = tankTop + tankH - targetRatio * tankH;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(tankLeft - 20, targetY);
      ctx.lineTo(tankLeft + tankW + 20, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`目標液位: ${setpoint.toFixed(2)} m`, tankLeft + tankW + 25, targetY + 4);

      // 5. タンク枠
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(tankLeft, tankTop, tankW, tankH, 8);
      ctx.stroke();

      // HUD
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px JetBrains Mono, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`液位 h = ${tank.h.toFixed(2)} m`, cx, tankTop - 65);

      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`バルブ開度 u: ${(pid.saturatedOutput).toFixed(1)} % | 流入 Qin: ${(tank.Qin * 1000).toFixed(1)} L/s | 流出 Qout: ${(tank.Qout * 1000).toFixed(1)} L/s`, cx, tankTop + tankH + 28);
      if (tank.distDuration > 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`⚠️ 下流バルブ急開外乱発生中 (+${(tank.distOutflow*1000).toFixed(1)} L/s)`, cx, tankTop + tankH + 46);
      }
    }

    // ==========================================
    // 3. 倒立振子 可視化
    // ==========================================
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(cx, cy + 8, cartW, cartH, 8);
      ctx.fill();

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

      // ロッド本体
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cartPxX, cartPxY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // 振子先端ボブ
      const bobRadius = 14;
      const bobGrad = ctx.createRadialGradient(tipX - 4, tipY - 4, 2, tipX, tipY, bobRadius);
      bobGrad.addColorStop(0, '#fef08a');
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

    // ==========================================
    // 4. ドローン 可視化
    // ==========================================
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

      // ドローン中央キャノピー
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-24, -14, 48, 24, 6);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // LEDインジケータ
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(0, -2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 5. 高度・姿勢HUD
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 14px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`z = ${drone.z.toFixed(2)} m | φ = ${(drone.phi * 180 / Math.PI).toFixed(1)}°`, dronePxX, dronePxY - 32);
    }

    updateThrustParticles(x, y, phi, tl, tr) {
      if (Math.random() < 0.6) {
        const armPx = 0.25 * this.scale;
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);

        // 左プロペラ
        const leftX = x - armPx * cosP;
        const leftY = y - armPx * sinP;
        // 右プロペラ
        const rightX = x + armPx * cosP;
        const rightY = y + armPx * sinP;

        const downVx = sinP * 4;
        const downVy = cosP * 4;

        for (let i = 0; i < 2; i++) {
          this.particles.push({
            x: leftX + (Math.random() - 0.5) * 16,
            y: leftY,
            vx: downVx + (Math.random() - 0.5) * 1.5,
            vy: downVy + Math.random() * 2,
            alpha: 0.7,
            size: 2 + Math.random() * 2
          });
          this.particles.push({
            x: rightX + (Math.random() - 0.5) * 16,
            y: rightY,
            vx: downVx + (Math.random() - 0.5) * 1.5,
            vy: downVy + Math.random() * 2,
            alpha: 0.7,
            size: 2 + Math.random() * 2
          });
        }
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.035;
        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    drawThrustParticles(ctx) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      for (const p of this.particles) {
        ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  window.Visualizer = Visualizer;
})();
