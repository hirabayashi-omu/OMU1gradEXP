/**
 * Real-time Chart Renderer for PID Step Response & Component Decomposition
 * リアルタイム・グラフ描画：ステップ応答波形 ＆ P/I/D成分寄与度分解グラフ
 */

(function() {
  class ChartRenderer {
    constructor(canvasResponseId, canvasPidId) {
      this.canvasResp = document.getElementById(canvasResponseId);
      this.ctxResp = this.canvasResp?.getContext('2d');

      this.canvasPid = document.getElementById(canvasPidId);
      this.ctxPid = this.canvasPid?.getContext('2d');

      this.maxDataPoints = 300; // 5秒分 (60fps)
      this.history = [];
      this.startTime = Date.now();

      // 性能指標
      this.metrics = {
        riseTime: null,
        overshootPct: 0,
        settlingTime: null,
        steadyStateError: 0,
        isSettled: false
      };

      this.initialError = null;
      this.maxOvershootVal = 0;
    }

    reset() {
      this.history = [];
      this.startTime = Date.now();
      this.metrics = {
        riseTime: null,
        overshootPct: 0,
        settlingTime: null,
        steadyStateError: 0,
        isSettled: false
      };
      this.initialError = null;
      this.maxOvershootVal = 0;
    }

    addDataPoint(simTime, target, actual, pid) {
      const error = target - actual;
      if (this.initialError === null && Math.abs(error) > 0.001) {
        this.initialError = error;
      }

      const data = {
        t: simTime,
        target: target,
        actual: actual,
        error: error,
        pTerm: pid.pTerm,
        iTerm: pid.iTerm,
        dTerm: pid.dTerm,
        totalOut: pid.saturatedOutput,
        isSaturated: pid.isSaturated
      };

      this.history.push(data);
      if (this.history.length > this.maxDataPoints) {
        this.history.shift();
      }

      this.updateMetrics(data);
    }

    updateMetrics(current) {
      if (this.history.length < 5) return;

      const initialT = this.history[0].actual;
      const target = current.target;
      const error = current.error;

      // 行き過ぎ量
      if (target > initialT && current.actual > target) {
        const overshoot = current.actual - target;
        if (overshoot > this.maxOvershootVal) {
          this.maxOvershootVal = overshoot;
          const stepSize = Math.abs(target - initialT) || 1.0;
          this.metrics.overshootPct = Math.round((this.maxOvershootVal / stepSize) * 100);
        }
      } else if (target < initialT && current.actual < target) {
        const overshoot = target - current.actual;
        if (overshoot > this.maxOvershootVal) {
          this.maxOvershootVal = overshoot;
          const stepSize = Math.abs(target - initialT) || 1.0;
          this.metrics.overshootPct = Math.round((this.maxOvershootVal / stepSize) * 100);
        }
      }

      // 定常偏差
      this.metrics.steadyStateError = Math.abs(error);

      // 整定判定
      const band = 0.05 * (Math.abs(target) || 1.0);
      const recent = this.history.slice(-30);
      const withinBand = recent.every(d => Math.abs(d.error) <= Math.max(0.05, band));
      if (withinBand && !this.metrics.isSettled && current.t > 0.5) {
        this.metrics.isSettled = true;
        this.metrics.settlingTime = current.t.toFixed(2);
      } else if (!withinBand) {
        this.metrics.isSettled = false;
      }
    }

    render() {
      this.renderResponseChart();
      this.renderPidDecompositionChart();
    }

    renderResponseChart() {
      if (!this.ctxResp || !this.canvasResp) return;
      const ctx = this.ctxResp;
      const w = this.canvasResp.width = this.canvasResp.parentElement.clientWidth || 400;
      const h = this.canvasResp.height = 140;

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, w, h);

      const padLeft = 45;
      const padRight = 15;
      const padTop = 20;
      const padBottom = 25;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      if (this.history.length < 2) return;

      let yMin = Infinity;
      let yMax = -Infinity;
      this.history.forEach(d => {
        yMin = Math.min(yMin, d.target, d.actual);
        yMax = Math.max(yMax, d.target, d.actual);
      });

      const margin = Math.max(0.2, (yMax - yMin) * 0.2);
      yMin -= margin;
      yMax += margin;

      const mapX = (idx) => padLeft + (idx / (this.maxDataPoints - 1)) * plotW;
      const mapY = (val) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

      // グリッド線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const y = padTop + (plotH / 4) * i;
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);

        const val = yMax - (i / 4) * (yMax - yMin);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(1), padLeft - 6, y + 3);
      }
      ctx.stroke();

      // 目標値ライン (赤破線)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      this.history.forEach((d, i) => {
        const x = mapX(i + (this.maxDataPoints - this.history.length));
        const y = mapY(d.target);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // 実測応答ライン (シアン実線)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      this.history.forEach((d, i) => {
        const x = mapX(i + (this.maxDataPoints - this.history.length));
        const y = mapY(d.actual);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 凡例
      ctx.font = '10px Noto Sans JP, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('--- 目標値 r(t)', padLeft + 10, padTop - 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('━━ 実測応答 y(t)', padLeft + 100, padTop - 6);
    }

    renderPidDecompositionChart() {
      if (!this.ctxPid || !this.canvasPid) return;
      const ctx = this.ctxPid;
      const w = this.canvasPid.width = this.canvasPid.parentElement.clientWidth || 400;
      const h = this.canvasPid.height = 140;

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, w, h);

      const padLeft = 45;
      const padRight = 15;
      const padTop = 20;
      const padBottom = 25;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      if (this.history.length < 2) return;

      let maxMag = 10;
      this.history.forEach(d => {
        maxMag = Math.max(maxMag, Math.abs(d.pTerm), Math.abs(d.iTerm), Math.abs(d.dTerm), Math.abs(d.totalOut));
      });
      maxMag *= 1.2;

      const mapX = (idx) => padLeft + (idx / (this.maxDataPoints - 1)) * plotW;
      const mapY = (val) => padTop + plotH / 2 - (val / maxMag) * (plotH / 2);

      // ゼロ基準線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop + plotH / 2);
      ctx.lineTo(w - padRight, padTop + plotH / 2);
      ctx.stroke();

      const drawLine = (prop, color, width, dash = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        this.history.forEach((d, i) => {
          const x = mapX(i + (this.maxDataPoints - this.history.length));
          const y = mapY(d[prop]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };

      drawLine('pTerm', '#3b82f6', 1.5);
      drawLine('iTerm', '#10b981', 1.5);
      drawLine('dTerm', '#f59e0b', 1.5);
      drawLine('totalOut', '#a855f7', 2.0);

      // 凡例
      ctx.font = '9px Noto Sans JP, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('P成分', padLeft + 5, padTop - 6);
      ctx.fillStyle = '#10b981';
      ctx.fillText('I成分', padLeft + 55, padTop - 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('D成分', padLeft + 105, padTop - 6);
      ctx.fillStyle = '#a855f7';
      ctx.fillText('総操作量 u(t)', padLeft + 155, padTop - 6);
    }
  }

  window.ChartRenderer = ChartRenderer;
})();
