/**
 * charts.js - S-S曲線(応力-ひずみ線図) & 衝撃荷重・緩衝器変位リアルタイムモニタ
 */

export class CouplerCharts {
  constructor(materialEngine) {
    this.materialEngine = materialEngine;
    this.ssChart = null;
    this.waveChart = null;

    // 波形データバッファ (最大60サンプル)
    this.maxSamples = 50;
    this.timeLabels = [];
    this.forceData = [];
    this.strokeData = [];
    this.sampleTimer = 0;

    this.initSSChart();
    this.initWaveChart();
  }

  /**
   * S-S曲線チャートの初期化
   */
  initSSChart() {
    const ctx = document.getElementById('chartSS');
    if (!ctx) return;

    const curveInfo = this.materialEngine.getCurveData(80);

    this.ssChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '材料S-S特性曲線',
            data: curveInfo.curve,
            showLine: true,
            borderColor: '#4facfe',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1
          },
          {
            label: '降伏点 (0.2%耐力)',
            data: [curveInfo.yieldPoint],
            pointBackgroundColor: '#fbbf24',
            pointBorderColor: '#fff',
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: '引張強さ (最大耐力)',
            data: [curveInfo.ultimatePoint],
            pointBackgroundColor: '#f87171',
            pointBorderColor: '#fff',
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: '破断限界',
            data: [curveInfo.fracturePoint],
            pointBackgroundColor: '#c084fc',
            pointBorderColor: '#fff',
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: '現在作動点 (Current State)',
            data: [{ x: 0, y: 0 }],
            pointBackgroundColor: '#00f2fe',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 7,
            pointHoverRadius: 10
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'ひずみ ε (Strain)',
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
          },
          y: {
            title: {
              display: true,
              text: '応力 σ (MPa)',
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#cbd5e1',
              font: { family: 'Noto Sans JP', size: 10 },
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ε: , σ:  MPa
            }
          }
        }
      }
    });
  }

  /**
   * 荷重・緩衝器ストローク時間波形チャートの初期化
   */
  initWaveChart() {
    const ctx = document.getElementById('chartWave');
    if (!ctx) return;

    for (let i = 0; i < this.maxSamples; i++) {
      this.timeLabels.push('');
      this.forceData.push(0);
      this.strokeData.push(0);
    }

    this.waveChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.timeLabels,
        datasets: [
          {
            label: '軸力 Fx (kN)',
            data: this.forceData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'yForce',
            tension: 0.2
          },
          {
            label: '緩衝器変位 (mm)',
            data: this.strokeData,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'yStroke',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: {
            display: false
          },
          yForce: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: '軸力 (kN)',
              color: '#f59e0b',
              font: { family: 'JetBrains Mono', size: 11 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#f59e0b', font: { family: 'JetBrains Mono' } }
          },
          yStroke: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: '変位 (mm)',
              color: '#38bdf8',
              font: { family: 'JetBrains Mono', size: 11 }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#38bdf8', font: { family: 'JetBrains Mono' } }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#cbd5e1',
              font: { family: 'Noto Sans JP', size: 10 },
              boxWidth: 10
            }
          }
        }
      }
    });
  }

  /**
   * 材料切り替え時のS-S曲線更新
   */
  updateMaterialCurve() {
    if (!this.ssChart) return;
    const curveInfo = this.materialEngine.getCurveData(80);
    this.ssChart.data.datasets[0].data = curveInfo.curve;
    this.ssChart.data.datasets[1].data = [curveInfo.yieldPoint];
    this.ssChart.data.datasets[2].data = [curveInfo.ultimatePoint];
    this.ssChart.data.datasets[3].data = [curveInfo.fracturePoint];
    this.ssChart.update('none');
  }

  /**
   * 毎フレームのリアルタイム更新
   */
  update(dt, physData, materialData) {
    // 1. S-S曲線の作動点更新
    if (this.ssChart && materialData) {
      const currentStressMPa = materialData.stress / 1e6;
      const currentStrain = materialData.strain;
      const ptDataset = this.ssChart.data.datasets[4];
      ptDataset.data = [{ x: currentStrain, y: currentStressMPa }];

      // 降伏・破断に応じた作動点カラー
      if (materialData.isFractured) {
        ptDataset.pointBackgroundColor = '#ef4444';
      } else if (materialData.isYielded) {
        ptDataset.pointBackgroundColor = '#f59e0b';
      } else {
        ptDataset.pointBackgroundColor = '#00f2fe';
      }
      this.ssChart.update('none');
    }

    // 2. 波形チャートの間引き更新 (約15Hz)
    this.sampleTimer += dt;
    if (this.sampleTimer >= 0.065 && this.waveChart) {
      this.sampleTimer = 0;
      const forceKn = (physData.contactForceX / 1000).toFixed(1);
      const strokeMm = (physData.draftStrokeA * 1000).toFixed(1);

      this.forceData.shift();
      this.forceData.push(forceKn);

      this.strokeData.shift();
      this.strokeData.push(strokeMm);

      this.waveChart.update('none');
    }
  }
}