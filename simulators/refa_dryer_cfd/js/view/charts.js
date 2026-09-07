/**
 * charts.js
 * 熱流体シミュレーションのリアルタイムグラフ描画
 * 1. 軸上距離別温度減衰プロファイル (Distance vs Temperature)
 * 2. ターゲット表面温度 & プロセンシング自動温冷切替タイムライン
 */

class SimulationCharts {
  constructor(decayCanvas, timeCanvas) {
    this.decayCanvas = decayCanvas;
    this.decayCtx = decayCanvas.getContext('2d');

    this.timeCanvas = timeCanvas;
    this.timeCtx = timeCanvas.getContext('2d');

    // タイムライン履歴バッファ
    this.historyLength = 80;
    this.timeHistory = []; // { time, surfaceTemp, blowTemp, duty }
    this.startTime = Date.now();
  }

  addTimeRecord(surfaceTemp, blowTemp, duty) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.timeHistory.push({
      time: elapsed,
      surfaceTemp: Math.round(surfaceTemp * 10) / 10,
      blowTemp: Math.round(blowTemp * 10) / 10,
      duty: duty
    });

    if (this.timeHistory.length > this.historyLength) {
      this.timeHistory.shift();
    }
  }

  /**
   * 1. 軸上温度減衰グラフの描画
   * @param {Array<{distCm: number, temp: number}>} profileData
   * @param {number} targetDistCm
   */
  drawDecayChart(profileData, targetDistCm) {
    const canvas = this.decayCanvas;
    const ctx = this.decayCtx;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 42;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 26;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    // 背景グリッド
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    // Y軸グリッド (20℃ ~ 100℃)
    const tMin = 20;
    const tMax = 100;
    for (let t = 20; t <= 100; t += 20) {
      const y = padTop + graphH * (1 - (t - tMin) / (tMax - tMin));
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + graphW, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${t}℃`, padLeft - 6, y + 3);
    }

    // X軸 (0cm ~ 35cm)
    const dMax = 35;
    for (let d = 0; d <= 35; d += 10) {
      const x = padLeft + graphW * (d / dMax);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + graphH);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${d}cm`, x, h - 8);
    }

    // 60℃ ReFa境界ライン（黄色ハイライト）
    const y60 = padTop + graphH * (1 - (60 - tMin) / (tMax - tMin));
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, y60);
    ctx.lineTo(padLeft + graphW, y60);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText('毛髪適温限界 (60℃)', padLeft + 6, y60 - 4);

    // ターゲット位置マーカー
    const xTarget = padLeft + graphW * (targetDistCm / dMax);
    if (xTarget <= padLeft + graphW) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(xTarget, padTop);
      ctx.lineTo(xTarget, padTop + graphH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('受熱面', xTarget, padTop + 10);
    }

    // プロファイル曲線の描画
    if (profileData && profileData.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < profileData.length; i++) {
        const pt = profileData[i];
        const x = padLeft + graphW * (Math.min(dMax, pt.distCm) / dMax);
        const y = padTop + graphH * (1 - (Math.max(tMin, Math.min(tMax, pt.temp)) - tMin) / (tMax - tMin));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // グロー効果
      ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
      ctx.lineWidth = 5.0;
      ctx.stroke();
    }
  }

  /**
   * 2. センシング温度＆ヒーター出力タイムラインの描画
   */
  drawTimeChart(targetLimitTemp = 60) {
    const canvas = this.timeCanvas;
    const ctx = this.timeCtx;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 38;
    const padRight = 36;
    const padTop = 18;
    const padBottom = 22;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    // グリッド
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const tMin = 20;
    const tMax = 90;
    for (let t = 20; t <= 80; t += 20) {
      const y = padTop + graphH * (1 - (t - tMin) / (tMax - tMin));
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + graphW, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${t}℃`, padLeft - 6, y + 3);
    }

    // 制限温度ライン (60℃または50℃)
    const yLimit = padTop + graphH * (1 - (targetLimitTemp - tMin) / (tMax - tMin));
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, yLimit);
    ctx.lineTo(padLeft + graphW, yLimit);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.timeHistory.length < 2) return;

    const n = this.timeHistory.length;
    const dx = graphW / (this.historyLength - 1);

    // ヒーター出力（デューティ比）の塗りつぶし背景
    ctx.fillStyle = 'rgba(255, 107, 107, 0.12)';
    ctx.beginPath();
    const startX = padLeft + (this.historyLength - n) * dx;
    ctx.moveTo(startX, padTop + graphH);
    for (let i = 0; i < n; i++) {
      const x = startX + i * dx;
      const duty = this.timeHistory[i].duty;
      const y = padTop + graphH * (1 - duty);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(startX + (n - 1) * dx, padTop + graphH);
    ctx.closePath();
    ctx.fill();

    // ターゲット表面最高温度ライン
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = startX + i * dx;
      const t = this.timeHistory[i].surfaceTemp;
      const y = padTop + graphH * (1 - (Math.max(tMin, Math.min(tMax, t)) - tMin) / (tMax - tMin));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 吹出温度ライン
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = startX + i * dx;
      const t = this.timeHistory[i].blowTemp;
      const y = padTop + graphH * (1 - (Math.max(tMin, Math.min(tMax, t)) - tMin) / (tMax - tMin));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 凡例
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('■ 髪表面温度', padLeft + 6, padTop + 10);

    ctx.fillStyle = '#f43f5e';
    ctx.fillText('■ 吹出温風温度', padLeft + 85, padTop + 10);
  }
}

window.SimulationCharts = SimulationCharts;
