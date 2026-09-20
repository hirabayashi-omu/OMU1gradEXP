/**
 * app.js
 * Multi-Physics Laundry Washer-Dryer Simulator Controller.
 * Fully couples:
 * ① Drum DEM Cloth Mesh Physics (ほぐし・展開 vs 団子化・Aeff(t) 変動)
 * ② Multi-layer Textile FVM (3階層抵抗: 団子内マクロ・布内メソ・繊維内ミクロ熱物質移動連成)
 * ③ Dual Characteristic Curves Live Simulation Traces & Principles Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Engines
  const drumSim = new LaundryDrumSimulation('drumCanvas');
  const fabricFvm = new FabricFVMSimulation('chipCanvas');
  const chemModel = new ChemicalEngineeringDryingModel();
  
  window.sims = { drumSim, fabricFvm, chemModel };
  
  // Safe helper to set text content
  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  
  // 2. Navigation Tab Switching (3 Tabs)
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');
      
      // Resize canvases and charts upon tab activation
      setTimeout(() => {
        drumSim.initCanvasSize();
        fabricFvm.initCanvasSize();
        if (targetTab === 'romTab') {
          updateDualDryingCharts();
          updateLiveHighlightOnCharts();
        }
      }, 50);
    });
  });
  
  // 3. Dynamic Charts
  let dryingRateChart, phaseChangeChart, dryingRateCurveChart;
  let isUserDraggingSeeker = false;
  let chartUpdateTimer = 0;
  let highlightUpdateTimer = 0;
  let lastTime = performance.now();
  
  function initCharts() {
    // A. Dynamic Tumbling Rate Chart (Tab 1)
    const ctxRate = document.getElementById('dryingRateChart')?.getContext('2d');
    if (ctxRate) {
      dryingRateChart = new Chart(ctxRate, {
        type: 'line',
        data: {
          labels: Array.from({ length: 60 }, (_, i) => (i * 0.2).toFixed(1)),
          datasets: [{
            label: 'ドラム内 瞬時水分蒸散速度 (g/s)',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            borderWidth: 2,
            data: new Array(60).fill(0),
            tension: 0.3,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: 'タンブリング時間 (s)', color: '#9ca3af' }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#38bdf8', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '蒸発速度 (g/s)', color: '#38bdf8' },
              min: 0,
              suggestedMax: 1.5
            }
          }
        }
      });
    }
    
    // B. FORMAT 1: Phase Change Chart (加熱乾燥の相変化: X-t, Ts-t, Tc-t)
    const ctxPhase = document.getElementById('phaseChangeChart')?.getContext('2d');
    if (ctxPhase) {
      phaseChangeChart = new Chart(ctxPhase, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            // 0: Theoretical Moisture (dashed guide)
            {
              label: '理論予測 X_theory(t)',
              borderColor: 'rgba(56, 189, 248, 0.35)',
              borderWidth: 1.8,
              borderDash: [4, 4],
              data: [],
              yAxisID: 'yMoisture',
              pointRadius: 0
            },
            // 1: Live Simulated Moisture X(t)
            {
              label: '実機シミュレーション X(t) [kg/kg-DA]',
              borderColor: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              borderWidth: 2.6,
              fill: false,
              data: [],
              yAxisID: 'yMoisture',
              tension: 0.1,
              pointRadius: 0
            },
            // 2: Theoretical Surface Temp (dashed guide)
            {
              label: '理論予測 洗濯物温度 Ts_theory(t)',
              borderColor: 'rgba(239, 68, 68, 0.35)',
              borderWidth: 1.8,
              borderDash: [4, 4],
              data: [],
              yAxisID: 'yTemp',
              pointRadius: 0
            },
            // 3: Live Simulated Surface Temp Ts(t)
            {
              label: '実機シミュレーション 洗濯物表面温度 Ts(t) [°C]',
              borderColor: '#ef4444',
              borderWidth: 2.6,
              data: [],
              yAxisID: 'yTemp',
              tension: 0.15,
              pointRadius: 0
            },
            // 4: Live Simulated Center Temp Tc(t)
            {
              label: '実機シミュレーション 洗濯物芯層温度 Tc(t) [°C]',
              borderColor: '#f59e0b',
              borderWidth: 2.2,
              borderDash: [5, 3],
              data: [],
              yAxisID: 'yTemp',
              tension: 0.15,
              pointRadius: 0
            },
            // 5: Current Highlight Marker: Moisture X
            {
              label: '現在位置 [含水率 X]',
              borderColor: 'transparent',
              backgroundColor: '#38bdf8',
              pointBackgroundColor: '#38bdf8',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2.5,
              pointRadius: 8,
              pointHoverRadius: 10,
              showLine: false,
              data: [],
              yAxisID: 'yMoisture'
            },
            // 6: Current Highlight Marker: Surface Temp Ts
            {
              label: '現在位置 [表面温度 Ts]',
              borderColor: 'transparent',
              backgroundColor: '#ef4444',
              pointBackgroundColor: '#ef4444',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2.5,
              pointRadius: 8,
              pointHoverRadius: 10,
              showLine: false,
              data: [],
              yAxisID: 'yTemp'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              labels: {
                color: '#d1d5db',
                font: { family: 'JetBrains Mono', size: 9 },
                filter: (item) => !item.text.includes('現在位置')
              }
            },
            tooltip: { mode: 'nearest', intersect: false }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '乾燥経過時間 t (分)', color: '#9ca3af' }
            },
            yMoisture: {
              type: 'linear',
              position: 'left',
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#38bdf8', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '乾量含水率 X [kg/kg-DA]', color: '#38bdf8' },
              min: 0,
              suggestedMax: 0.85
            },
            yTemp: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { color: '#f87171', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '洗濯物温度 Ts, Tc [°C]', color: '#f87171' },
              min: 20,
              suggestedMax: 100
            }
          }
        }
      });
    }
    
    // C. FORMAT 2: Drying Rate Curve Chart (乾燥速度曲線: 含水率特性 R vs X)
    const ctxRateCurve = document.getElementById('dryingRateCurveChart')?.getContext('2d');
    if (ctxRateCurve) {
      dryingRateCurveChart = new Chart(ctxRateCurve, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            // 0: Theoretical Baseline R(X)
            {
              label: '化学工学理論曲線 R_theory(X)',
              borderColor: 'rgba(52, 211, 153, 0.35)',
              backgroundColor: 'rgba(52, 211, 153, 0.04)',
              fill: false,
              borderWidth: 1.8,
              borderDash: [5, 4],
              data: [],
              tension: 0.1,
              pointRadius: 0
            },
            // 1: Live Coupled Simulation Trace (DEMほぐし・3階層連成実測軌跡)
            {
              label: '実機シミュレーション軌跡 (DEMほぐし・3階層連成)',
              borderColor: '#34d399',
              backgroundColor: 'rgba(52, 211, 153, 0.12)',
              fill: true,
              borderWidth: 2.8,
              data: [],
              tension: 0.15,
              pointRadius: 0
            },
            // 2: Current Point Pulse Marker
            {
              label: '現在状態位置 (R vs X)',
              borderColor: 'transparent',
              backgroundColor: '#10b981',
              pointBackgroundColor: '#10b981',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 3,
              pointRadius: 9,
              pointHoverRadius: 12,
              showLine: false,
              data: []
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              labels: {
                color: '#d1d5db',
                font: { family: 'JetBrains Mono', size: 9 },
                filter: (item) => !item.text.includes('現在状態位置')
              }
            },
            tooltip: { mode: 'nearest', intersect: false }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '乾量含水率 X [kg/kg-DA] (右:高含水率 ➔ 左:低含水率)', color: '#9ca3af' }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#34d399', font: { family: 'JetBrains Mono', size: 10 } },
              title: { display: true, text: '乾燥速度 R [kg/(m²·h)]', color: '#34d399' },
              min: 0
            }
          }
        }
      });
    }
  }
  
  initCharts();
  
  // 4. Update Dual Drying Characteristic Curves Baseline
  function updateDualDryingCharts() {
    const data = chemModel.generateAllCharacteristics();
    
    // Update Format 1 Chart Theoretical Guides
    if (phaseChangeChart) {
      phaseChangeChart.data.labels = data.format1.labels;
      phaseChangeChart.data.datasets[0].data = data.format1.moisture;
      phaseChangeChart.data.datasets[2].data = data.format1.surfTemp;
      
      if (!phaseChangeChart.data.datasets[1].data || phaseChangeChart.data.datasets[1].data.length !== data.format1.labels.length) {
        phaseChangeChart.data.datasets[1].data = new Array(data.format1.labels.length).fill(null);
        phaseChangeChart.data.datasets[3].data = new Array(data.format1.labels.length).fill(null);
        phaseChangeChart.data.datasets[4].data = new Array(data.format1.labels.length).fill(null);
      }
      phaseChangeChart.update('none');
    }
    
    // Update Format 2 Chart Theoretical Baseline
    if (dryingRateCurveChart) {
      dryingRateCurveChart.data.labels = data.format2.moisture;
      dryingRateCurveChart.data.datasets[0].data = data.format2.rate;
      
      if (!dryingRateCurveChart.data.datasets[1].data || dryingRateCurveChart.data.datasets[1].data.length !== data.format2.moisture.length) {
        dryingRateCurveChart.data.datasets[1].data = new Array(data.format2.moisture.length).fill(null);
      }
      dryingRateCurveChart.update('none');
    }
    
    // Update Statistical Display Cards
    safeSetText('statRc', `${data.Rc.toFixed(2)} kg/(m²·h)`);
    safeSetText('statTwb', `${data.Twb.toFixed(1)} °C`);
    safeSetText('statTcrit', `${data.periods.t_crit.toFixed(1)} 分`);
    safeSetText('statTequil', `${data.periods.t_equil.toFixed(1)} 分`);
    
    const seekSlider = document.getElementById('seekMoistureX');
    if (seekSlider) {
      seekSlider.min = data.params.Xe;
      seekSlider.max = data.params.X0;
    }
  }
  
  // 5. Live State Highlighting & Dynamic Simulation Trajectory Synchronization
  function updateLiveHighlightOnCharts(forcedX = null) {
    const curX = (forcedX !== null) ? forcedX : fabricFvm.stats.meanMoisture;
    const curTs = fabricFvm.stats.surfaceTemp;
    const curTc = fabricFvm.stats.centerTemp;
    const curR = fabricFvm.stats.dryingRate;
    // 等価乾燥経過時間 (分): FVMが積算した物理乾燥時間 (fabricFvm.time / 60.0) を使用
    // これにより倍速 (1x, 10x, 30x, 60x) によらず理論予測曲線 (0〜90分) と完全に同期
    const equivTimeMin = (fabricFvm.time / 60.0);
    const pNum = fabricFvm.stats.phaseNum;
    
    // 1. Update Format 1 Live Simulation Traces & Marker
    if (phaseChangeChart && phaseChangeChart.data.labels.length > 0) {
      const labels = phaseChangeChart.data.labels;
      // Dynamic Time Axis Auto-Extension (突き当たった場合の時間軸の動的自動拡張)
      // 実機シミュレーションの乾燥時間がチャート右端 (例: 90分) に近づいた、または超えた場合、
      // 時間軸を +30分 自動拡張してシミュレーション軌跡が途切れずに継続できるようにする
      const currentChartMaxTime = parseFloat(labels[labels.length - 1]);
      if (equivTimeMin >= currentChartMaxTime - 1.0) {
        const dtStep = 0.5; // 0.5分刻み
        const newTargetMax = Math.ceil((equivTimeMin + 30.0) / 10.0) * 10.0;
        const Xe = (chemModel && chemModel.params && chemModel.params.Xe) ? chemModel.params.Xe : 0.035;
        const Ta = (chemModel && chemModel.params && chemModel.params.Ta) ? chemModel.params.Ta : 65.0;
        
        for (let t = currentChartMaxTime + dtStep; t <= newTargetMax + 1e-4; t += dtStep) {
          labels.push(t.toFixed(1));
          phaseChangeChart.data.datasets[0].data.push(Xe);      // 理論含水率は平衡値(Xe)で水平延長
          phaseChangeChart.data.datasets[1].data.push(null);    // 実機含水率 X(t)
          phaseChangeChart.data.datasets[2].data.push(Ta);      // 理論表面温度は熱風温度(Ta)で水平延長
          phaseChangeChart.data.datasets[3].data.push(null);    // 実機表面温度 Ts(t)
          phaseChangeChart.data.datasets[4].data.push(null);    // 実機芯層温度 Tc(t)
        }
      }
      
      let closestIdx = 0;
      let minDiff = 1e9;
      for (let i = 0; i < labels.length; i++) {
        const diff = Math.abs(parseFloat(labels[i]) - equivTimeMin);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      
      // Update the live simulation curve up to current time
      if (closestIdx >= 0 && closestIdx < labels.length) {
        phaseChangeChart.data.datasets[1].data[closestIdx] = curX;
        phaseChangeChart.data.datasets[3].data[closestIdx] = curTs;
        phaseChangeChart.data.datasets[4].data[closestIdx] = curTc;
      }
      
      // Set current position markers
      const arrX = new Array(labels.length).fill(null);
      arrX[closestIdx] = curX;
      phaseChangeChart.data.datasets[5].data = arrX;
      
      const arrTs = new Array(labels.length).fill(null);
      arrTs[closestIdx] = curTs;
      phaseChangeChart.data.datasets[6].data = arrTs;
      
      phaseChangeChart.update('none');
    }
    
    // 2. Update Format 2 Live Coupled Trajectory & Marker
    if (dryingRateCurveChart && dryingRateCurveChart.data.labels.length > 0) {
      const labels2 = dryingRateCurveChart.data.labels;
      let closestIdx2 = 0;
      let minDiff2 = 1e9;
      for (let i = 0; i < labels2.length; i++) {
        const diff = Math.abs(parseFloat(labels2[i]) - curX);
        if (diff < minDiff2) {
          minDiff2 = diff;
          closestIdx2 = i;
        }
      }
      
      // Record actual live simulation rate point on the trajectory line
      if (closestIdx2 >= 0 && closestIdx2 < labels2.length) {
        dryingRateCurveChart.data.datasets[1].data[closestIdx2] = curR;
      }
      
      // Current glowing green point marker
      const arrR = new Array(labels2.length).fill(null);
      arrR[closestIdx2] = curR;
      dryingRateCurveChart.data.datasets[2].data = arrR;
      
      dryingRateCurveChart.update('none');
    }
    
    // 3. Synchronize Phase Pills Highlight
    const pillIds = ['phasePill1', 'phasePill2', 'phasePill3', 'phasePill4', 'phasePill5'];
    pillIds.forEach((pid, idx) => {
      const el = document.getElementById(pid);
      if (el) {
        el.classList.toggle('active', (idx + 1) === pNum);
      }
    });
    
    // 4. Synchronize 3-Scale Hierarchical Resistance Bar & Texts
    safeSetText('currentPhaseBadge', fabricFvm.stats.phaseName);
    safeSetText('principleUntangleBadge', `ほぐし度: ${Math.round(drumSim.effectiveAreaRatio * 100)}% (Aeff: ${drumSim.effectiveArea.toFixed(2)} m²)`);
    
    safeSetText('resClumpText', `① 団子内マクロ抵抗: ${fabricFvm.stats.R_clump_pct}% (気流遮断・ほぐし連動)`);
    safeSetText('resFabricText', `② 布内メソ抵抗: ${fabricFvm.stats.R_fabric_pct}% (毛細管液流・乾き面後退)`);
    safeSetText('resFiberText', `③ 繊維内ミクロ抵抗: ${fabricFvm.stats.R_fiber_pct}% (結合水脱着・分子拡散)`);
    
    const barClump = document.getElementById('barResClump');
    const barFabric = document.getElementById('barResFabric');
    const barFiber = document.getElementById('barResFiber');
    if (barClump) barClump.style.width = `${fabricFvm.stats.R_clump_pct}%`;
    if (barFabric) barFabric.style.width = `${fabricFvm.stats.R_fabric_pct}%`;
    if (barFiber) barFiber.style.width = `${fabricFvm.stats.R_fiber_pct}%`;
    
    // Dynamic physics principle descriptions based on active phase & 3-scale resistance
    if (pNum === 1) {
      safeSetText('heatPrincipleText', '【顕熱支配】熱風対流熱 Q = hH·Aeff·(Ta - Ts) の大部分が布の顕熱昇温 (室温 ➔ 湿球温度 Twb) に消費される過渡期。');
      safeSetText('massPrincipleText', '【蒸発立ち上がり】布表面温度が低いため飽和水蒸気圧が小さく、物質移動流束は微小。');
    } else if (pNum === 2) {
      safeSetText('heatPrincipleText', `【伝熱律速・Twb維持】受熱の全量が水の気化潜熱 (Q = R·Aeff·ΔHv) として消費。気化冷却により表面 Ts は湿球温度 ${chemModel.calculateWetBulbTemp().toFixed(1)}℃ に自動固定。`);
      safeSetText('massPrincipleText', `【ほぐし伝熱面積連成】表面自由水が十分存在。ドラム内での布の「ほぐれ(Aeff=${drumSim.effectiveArea.toFixed(2)}m²)」により団子内抵抗が最小化し、蒸発速度が最大化。`);
    } else if (pNum === 3) {
      safeSetText('heatPrincipleText', '【表面乾き・Ts上昇】表面自由水が枯渇し乾き面が出現。気化冷却が失われ、熱風からの熱が布表面 Ts を急上昇させる。');
      safeSetText('massPrincipleText', '【布内毛細管限界】布内部の毛細管液架橋水が表面へ追いつかず蒸発面が後退。ほぐしで内部湿潤布が露出すると一時的に速度が回復。');
    } else if (pNum === 4) {
      safeSetText('heatPrincipleText', '【深部熱伝導・Tc上昇】蒸発面が繊維深部へ後退。熱伝導により芯層温度 Tc も熱風温度 Ta へ向かって本格的に上昇。');
      safeSetText('massPrincipleText', '【繊維内結合水脱着律速】セルロース非晶領域の強固な水素結合吸着水の脱着エネルギーと分子拡散が律速となり、乾燥速度が緩慢に減衰。');
    } else {
      safeSetText('heatPrincipleText', '【熱平衡】材料表面・芯層ともに熱風温度 Ta に達し、熱移動が平衡終了。');
      safeSetText('massPrincipleText', '【水分平衡】繊維含水率が環境平衡含水率 Xe に到達し、正味の水分移動が停止。');
    }
    
    // 5. Synchronize Seeker UI Readouts
    const seekSlider = document.getElementById('seekMoistureX');
    if (seekSlider && !isUserDraggingSeeker) {
      seekSlider.value = curX;
    }
    safeSetText('seekerPhaseBadge', fabricFvm.stats.phaseName);
    safeSetText('seekerCurrentReadout', `現在含水率 X = ${curX.toFixed(3)} kg/kg-dry ｜ 速度 R = ${curR.toFixed(2)} kg/(m²·h) ｜ 表面 Ts = ${curTs.toFixed(1)}°C ｜ 芯層 Tc = ${curTc.toFixed(1)}°C ｜ ほぐし度 = ${Math.round(drumSim.effectiveAreaRatio * 100)}%`);
  }
  
  // 6. Modal Dialog Controller
  const modal = document.getElementById('configModal');
  const btnOpenModal = document.getElementById('btnOpenConfigModal');
  const btnCloseModal = document.getElementById('btnCloseConfigModal');
  const btnCancelModal = document.getElementById('btnCancelConfig');
  const btnApplyModal = document.getElementById('btnApplyConfig');
  
  function openModal() {
    const p = chemModel.params;
    document.getElementById('inputTa').value = p.Ta;
    document.getElementById('inputRHa').value = p.RHa;
    document.getElementById('inputHH').value = p.hH;
    document.getElementById('inputA').value = p.A;
    document.getElementById('inputWd').value = p.Wd;
    document.getElementById('inputX0').value = p.X0;
    document.getElementById('inputXc').value = p.Xc;
    document.getElementById('inputXc2').value = p.Xc2;
    document.getElementById('inputXe').value = p.Xe;
    document.getElementById('inputDHv').value = p.dHv;
    
    modal.classList.add('active');
  }
  
  function closeModal() {
    modal.classList.remove('active');
  }
  
  btnOpenModal?.addEventListener('click', openModal);
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Preset Chips Selection
  const presetChips = document.querySelectorAll('.preset-chip-btn');
  presetChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const key = chip.getAttribute('data-preset');
      const preset = chemModel.presets[key];
      if (preset) {
        document.getElementById('inputTa').value = preset.Ta;
        document.getElementById('inputRHa').value = preset.RHa;
        document.getElementById('inputHH').value = preset.hH;
        document.getElementById('inputA').value = preset.A;
        document.getElementById('inputWd').value = preset.Wd;
        document.getElementById('inputX0').value = preset.X0;
        document.getElementById('inputXc').value = preset.Xc;
        document.getElementById('inputXc2').value = preset.Xc2;
        document.getElementById('inputXe').value = preset.Xe;
      }
    });
  });
  
  // Apply Parameters Button
  btnApplyModal?.addEventListener('click', (e) => {
    e.preventDefault();
    const updated = {
      Ta: parseFloat(document.getElementById('inputTa').value) || 65,
      RHa: parseFloat(document.getElementById('inputRHa').value) || 15,
      hH: parseFloat(document.getElementById('inputHH').value) || 45,
      A: parseFloat(document.getElementById('inputA').value) || 1.2,
      Wd: parseFloat(document.getElementById('inputWd').value) || 3.0,
      X0: parseFloat(document.getElementById('inputX0').value) || 0.75,
      Xc: parseFloat(document.getElementById('inputXc').value) || 0.25,
      Xc2: parseFloat(document.getElementById('inputXc2').value) || 0.10,
      Xe: parseFloat(document.getElementById('inputXe').value) || 0.035,
      dHv: parseFloat(document.getElementById('inputDHv').value) || 2260
    };
    
    chemModel.setParameters(updated);
    
    // Synchronize to Drum simulation & Fabric simulation
    drumSim.T_air_inlet = updated.Ta + 273.15;
    drumSim.wetBulbTemp = chemModel.calculateWetBulbTemp(updated.Ta, updated.RHa) + 273.15;
    drumSim.criticalMoisture = updated.Xc;
    drumSim.equilibriumMoisture = updated.Xe;
    drumSim.nominalDryingArea = updated.A;
    drumSim.totalDryMass = updated.Wd;
    
    fabricFvm.T_air = updated.Ta + 273.15;
    fabricFvm.T_wetbulb = drumSim.wetBulbTemp;
    fabricFvm.Xc = updated.Xc;
    fabricFvm.Xc2 = updated.Xc2;
    fabricFvm.Xe = updated.Xe;
    fabricFvm.hH = updated.hH;
    fabricFvm.dHv = updated.dHv * 1000;
    
    closeModal();
    updateDualDryingCharts();
    updateLiveHighlightOnCharts();
  });

  // 7b. Fabric Preset & Thickness Controls (生地プリセット & 厚み・物性連動)
  const selectFabricPreset = document.getElementById('selectFabricPreset');
  const sliderThickness = document.getElementById('sliderThickness');
  const labelThicknessVal = document.getElementById('labelThicknessVal');
  const sliderElasticity = document.getElementById('sliderElasticity');
  const labelElasticityVal = document.getElementById('labelElasticityVal');

  selectFabricPreset?.addEventListener('change', (e) => {
    const presetKey = e.target.value;
    if (window.FABRIC_PRESETS && window.FABRIC_PRESETS[presetKey]) {
      const p = window.FABRIC_PRESETS[presetKey];
      drumSim.setFabricPreset(presetKey);
      if (sliderThickness) {
        sliderThickness.value = p.thickness;
        if (labelThicknessVal) labelThicknessVal.textContent = `${p.thickness.toFixed(1)}mm`;
      }
      if (sliderElasticity) {
        sliderElasticity.value = p.elasticityMult;
        if (labelElasticityVal) labelElasticityVal.textContent = `${p.elasticityMult.toFixed(2)}x`;
      }
      if (fabricFvm) {
        fabricFvm.L_fabric = (p.thickness * 1e-3);
      }
    }
  });

  sliderThickness?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (labelThicknessVal) labelThicknessVal.textContent = `${val.toFixed(1)}mm`;
    drumSim.setFabricParameters({ thickness: val });
    if (fabricFvm) fabricFvm.L_fabric = (val * 1e-3);
  });

  sliderElasticity?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (labelElasticityVal) labelElasticityVal.textContent = `${val.toFixed(2)}x`;
    drumSim.setFabricParameters({ elasticityMult: val });
  });
  
  // 7. Tab 1 Drum Controls
  const btnToggleDrum = document.getElementById('btnToggleDrum');
  const btnResetDrum = document.getElementById('btnResetDrum');
  const modeButtons = document.querySelectorAll('.mode-btn');
  
  btnToggleDrum?.addEventListener('click', () => {
    drumSim.isRunning = !drumSim.isRunning;
    fabricFvm.isRunning = drumSim.isRunning;
    btnToggleDrum.textContent = drumSim.isRunning ? '一時停止' : 'ドラム回転再開';
    btnToggleDrum.className = drumSim.isRunning ? 'btn btn-secondary' : 'btn btn-primary';
  });
  
  btnResetDrum?.addEventListener('click', () => {
    drumSim.time = 0;
    drumSim.drumAngle = 0;
    drumSim.stateTimer = 0;
    drumSim.tumbleState = 'CW';
    drumSim.initClothSheets();
    fabricFvm.resetFields();
    updateLiveHighlightOnCharts();
  });
  
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-mode');
      drumSim.setDryingMode(mode);
      fabricFvm.T_air = drumSim.T_air_inlet;
      fabricFvm.T_wetbulb = drumSim.wetBulbTemp;
      
      const badge = document.getElementById('dryingTechBadge');
      if (badge) badge.textContent = (mode === 'HeatPump') ? 'ヒートポンプ式 (65℃低温風・除湿循環)' : 'ヒーター式 (85℃高温風・排気)';
      
      updateDualDryingCharts();
      updateLiveHighlightOnCharts();
    });
  });
  
  // Fabric FVM Controls (Tab 2)
  const btnToggleFvm = document.getElementById('btnToggleFvm');
  const btnResetFvm = document.getElementById('btnResetFvm');
  
  btnToggleFvm?.addEventListener('click', () => {
    fabricFvm.isRunning = !fabricFvm.isRunning;
    drumSim.isRunning = fabricFvm.isRunning;
    btnToggleFvm.textContent = fabricFvm.isRunning ? '一時停止' : 'FVM計算開始';
    btnToggleFvm.className = fabricFvm.isRunning ? 'btn btn-secondary' : 'btn btn-primary';
  });
  
  btnResetFvm?.addEventListener('click', () => {
    fabricFvm.resetFields();
    drumSim.time = 0;
    drumSim.initClothSheets();
    updateLiveHighlightOnCharts();
  });

  // 8. Seeker & Drying Speed Controls (Tab 3)
  const seekMoistureX = document.getElementById('seekMoistureX');
  if (seekMoistureX) {
    const handleSeek = (e) => {
      isUserDraggingSeeker = true;
      const targetX = parseFloat(e.target.value);
      
      fabricFvm.stats.meanMoisture = targetX;
      for (let k = 0; k < fabricFvm.Nz; k++) {
        fabricFvm.X[k] = targetX;
        fabricFvm.X_free[k] = Math.max(0, targetX - fabricFvm.Xc);
        fabricFvm.X_bound[k] = Math.min(targetX, fabricFvm.Xc);
      }
      
      drumSim.currentMoisture = targetX;
      drumSim.freeWater = Math.max(0, targetX - drumSim.criticalMoisture);
      drumSim.boundWater = Math.min(targetX, drumSim.criticalMoisture);
      
      const state = chemModel.evaluateCurrentState(targetX);
        drumSim.clothesTemp = state.Ts + 273.15;
        // 同期: シーカー操作時に理論乾燥時間とFVM時間を一致させる
        if (state.equivTime !== undefined) {
          fabricFvm.time = state.equivTime * 60.0;
        }
      drumSim.time = state.equivTime * 60.0;
      fabricFvm.time = drumSim.time;
      for (let k = 0; k < fabricFvm.Nz; k++) {
        fabricFvm.T[k] = state.Ts + 273.15;
      }
      
      updateLiveHighlightOnCharts(targetX);
    };
    seekMoistureX.addEventListener('input', handleSeek);
    seekMoistureX.addEventListener('change', () => {
      isUserDraggingSeeker = false;
    });
  }

  // Speed selector buttons (1x, 10x, 30x, 60x)
  const speedButtons = document.querySelectorAll('.btn-speed-select');
  speedButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      speedButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const speed = parseFloat(btn.dataset.speed) || 30;
      drumSim.speedMultiplier = speed;
      fabricFvm.speedMultiplier = speed;
    });
  });

  // Toggle Auto-drying play/pause
  let autoDryingPaused = false;
  const btnToggleAuto = document.getElementById('btnToggleAutoDrying');
  const autoPlayIcon = document.getElementById('autoDryingPlayIcon');
  const autoPlayText = document.getElementById('autoDryingPlayText');
  btnToggleAuto?.addEventListener('click', () => {
    autoDryingPaused = !autoDryingPaused;
    if (autoDryingPaused) {
      drumSim.savedSpeed = drumSim.speedMultiplier;
      drumSim.speedMultiplier = 0;
      fabricFvm.speedMultiplier = 0;
      if (autoPlayIcon) autoPlayIcon.textContent = '▶️';
      if (autoPlayText) autoPlayText.textContent = '乾燥停止中 (再生)';
    } else {
      drumSim.speedMultiplier = drumSim.savedSpeed || 30;
      fabricFvm.speedMultiplier = drumSim.speedMultiplier;
      if (autoPlayIcon) autoPlayIcon.textContent = '⏸️';
      if (autoPlayText) autoPlayText.textContent = '自動乾燥進行中';
    }
  });

  // Reset Drying Progress button
  const btnResetDrying = document.getElementById('btnResetDryingProgress');
  btnResetDrying?.addEventListener('click', () => {
    const p = chemModel.params;
    drumSim.currentMoisture = p.X0;
    drumSim.freeWater = Math.max(0, p.X0 - drumSim.criticalMoisture);
    drumSim.boundWater = Math.min(p.X0, drumSim.criticalMoisture);
    drumSim.clothesTemp = 308.15;
    drumSim.time = 0;
    
    fabricFvm.resetFields();
    
    if (phaseChangeChart) {
      phaseChangeChart.data.datasets[1].data = new Array(phaseChangeChart.data.labels.length).fill(null);
      phaseChangeChart.data.datasets[3].data = new Array(phaseChangeChart.data.labels.length).fill(null);
      phaseChangeChart.data.datasets[4].data = new Array(phaseChangeChart.data.labels.length).fill(null);
      phaseChangeChart.update('none');
    }
    if (dryingRateCurveChart) {
      dryingRateCurveChart.data.datasets[1].data = new Array(dryingRateCurveChart.data.labels.length).fill(null);
      dryingRateCurveChart.update('none');
    }
    
    if (seekMoistureX) seekMoistureX.value = p.X0;
    updateLiveHighlightOnCharts(p.X0);
  });

  
  // =========================================================
  // 7c. Inline Drying Rate Parameters & Tank Air Temperature Badges
  // (槽内乾球温度 Ta・湿球温度 Twb のリアルタイム表示 & インライン設定)
  // =========================================================
  const inlineTa = document.getElementById('inlineTa');
  const inlineRHa = document.getElementById('inlineRHa');
  const inlineHH = document.getElementById('inlineHH');
  const inlineA = document.getElementById('inlineA');
  const inlineWd = document.getElementById('inlineWd');
  const inlineX0 = document.getElementById('inlineX0');
  const inlineXc = document.getElementById('inlineXc');
  const inlineXe = document.getElementById('inlineXe');
  
  const inlineBadgeTa = document.getElementById('inlineBadgeTa');
  const inlineBadgeTwb = document.getElementById('inlineBadgeTwb');
  const inlineBadgeRHa = document.getElementById('inlineBadgeRHa');
  
  const btnApplyInlineParams = document.getElementById('btnApplyInlineParams');
  const btnToggleInlineParams = document.getElementById('btnToggleInlineParams');
  const inlineParamsBody = document.getElementById('inlineParamsBody');
  const toggleParamsIcon = document.getElementById('toggleParamsIcon');
  const toggleParamsText = document.getElementById('toggleParamsText');

  function updateTankTempBadges(taVal, rhaVal) {
    const ta = parseFloat(taVal) || chemModel.params.Ta;
    const rha = parseFloat(rhaVal) || chemModel.params.RHa;
    const twb = chemModel.calculateWetBulbTemp(ta, rha);
    
    if (inlineBadgeTa) inlineBadgeTa.textContent = ta.toFixed(1);
    if (inlineBadgeTwb) inlineBadgeTwb.textContent = twb.toFixed(1);
    if (inlineBadgeRHa) inlineBadgeRHa.textContent = rha.toFixed(1);
  }

  function syncInlineInputsFromModel() {
    const p = chemModel.params;
    if (inlineTa) inlineTa.value = p.Ta;
    if (inlineRHa) inlineRHa.value = p.RHa;
    if (inlineHH) inlineHH.value = p.hH;
    if (inlineA) inlineA.value = p.A;
    if (inlineWd) inlineWd.value = p.Wd;
    if (inlineX0) inlineX0.value = p.X0;
    if (inlineXc) inlineXc.value = p.Xc;
    if (inlineXe) inlineXe.value = p.Xe;
    updateTankTempBadges(p.Ta, p.RHa);
  }

  // Real-time badge update on input
  inlineTa?.addEventListener('input', (e) => updateTankTempBadges(e.target.value, inlineRHa?.value));
  inlineRHa?.addEventListener('input', (e) => updateTankTempBadges(inlineTa?.value, e.target.value));

  // Toggle inline params panel open/close
  let isInlineParamsOpen = true;
  btnToggleInlineParams?.addEventListener('click', () => {
    isInlineParamsOpen = !isInlineParamsOpen;
    if (inlineParamsBody) {
      inlineParamsBody.style.display = isInlineParamsOpen ? 'block' : 'none';
    }
    if (toggleParamsIcon) toggleParamsIcon.textContent = isInlineParamsOpen ? '▲' : '▼';
    if (toggleParamsText) toggleParamsText.textContent = isInlineParamsOpen ? '設定を閉じる' : '設定を開く';
  });

  // Inline Preset Chips Selection
  const inlinePresetChips = document.querySelectorAll('.preset-chips-container .preset-chip');
  inlinePresetChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      inlinePresetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const key = chip.getAttribute('data-preset');
      const preset = chemModel.presets[key];
      if (preset) {
        if (inlineTa) inlineTa.value = preset.Ta;
        if (inlineRHa) inlineRHa.value = preset.RHa;
        if (inlineHH) inlineHH.value = preset.hH;
        if (inlineA) inlineA.value = preset.A;
        if (inlineWd) inlineWd.value = preset.Wd;
        if (inlineX0) inlineX0.value = preset.X0;
        if (inlineXc) inlineXc.value = preset.Xc;
        if (inlineXe) inlineXe.value = preset.Xe;
        updateTankTempBadges(preset.Ta, preset.RHa);
        
        // Auto apply preset
        btnApplyInlineParams?.click();
      }
    });
  });

  // Apply inline parameters and recalculate
  btnApplyInlineParams?.addEventListener('click', (e) => {
    e?.preventDefault();
    const updated = {
      Ta: parseFloat(inlineTa?.value) || 65,
      RHa: parseFloat(inlineRHa?.value) || 15,
      hH: parseFloat(inlineHH?.value) || 45,
      A: parseFloat(inlineA?.value) || 1.2,
      Wd: parseFloat(inlineWd?.value) || 3.0,
      X0: parseFloat(inlineX0?.value) || 0.75,
      Xc: parseFloat(inlineXc?.value) || 0.25,
      Xc2: (chemModel.params.Xc2 !== undefined) ? chemModel.params.Xc2 : 0.10,
      Xe: parseFloat(inlineXe?.value) || 0.035,
      dHv: 2260
    };

    chemModel.setParameters(updated);

    // Synchronize to Drum simulation & Fabric simulation
    drumSim.T_air_inlet = updated.Ta + 273.15;
    drumSim.wetBulbTemp = chemModel.calculateWetBulbTemp(updated.Ta, updated.RHa) + 273.15;
    drumSim.criticalMoisture = updated.Xc;
    drumSim.equilibriumMoisture = updated.Xe;
    drumSim.nominalDryingArea = updated.A;
    drumSim.totalDryMass = updated.Wd;

    fabricFvm.T_air = updated.Ta + 273.15;
    fabricFvm.T_wetbulb = drumSim.wetBulbTemp;
    fabricFvm.Xc = updated.Xc;
    fabricFvm.Xe = updated.Xe;
    fabricFvm.hH = updated.hH;
    fabricFvm.totalDryMass = updated.Wd;
    fabricFvm.nominalArea = updated.A;
    fabricFvm.dryAreaDensity = updated.Wd / updated.A;
    fabricFvm.layerMass = fabricFvm.dryAreaDensity / fabricFvm.Nz;

    updateTankTempBadges(updated.Ta, updated.RHa);
    updateDualDryingCharts();
    updateLiveHighlightOnCharts();
  });

  // Initial sync
  syncInlineInputsFromModel();

  
  // =========================================================
  // Drum Rotation Speed (RPM) Slider Control (回転速度スライダー連動)
  // =========================================================
  const sliderRpm = document.getElementById('sliderRpm');
  const valRpm = document.getElementById('valRpm') || document.getElementById('labelRpmVal') || document.querySelector('.slider-val[data-for="sliderRpm"]');
  
  if (sliderRpm) {
    const updateRpm = (e) => {
      const rpm = parseFloat(e.target.value);
      drumSim.setRpm(rpm);
      if (valRpm) valRpm.textContent = `${rpm} rpm`;
    };
    sliderRpm.addEventListener('input', updateRpm);
    sliderRpm.addEventListener('change', updateRpm);
    // Initial sync
    drumSim.setRpm(parseFloat(sliderRpm.value) || 48);
  }

  // 9. Main Animation & Physics Loop
  function mainLoop(now) {
    const dt = Math.min((now - lastTime) / 1000.0, 0.05);
    lastTime = now;
    
    if (drumSim.isRunning) {
      drumSim.step(dt);
      
      // Couple directly with multi-layer FVM simulation
      fabricFvm.step(dt, drumSim.effectiveAreaRatio, drumSim.effectiveArea);
      
      // Synchronize states
      drumSim.currentMoisture = fabricFvm.stats.meanMoisture;
      drumSim.freeWater = fabricFvm.stats.freeWaterTotal;
      drumSim.boundWater = fabricFvm.stats.boundWaterTotal;
      drumSim.clothesTemp = fabricFvm.stats.surfaceTemp + 273.15;
      drumSim.dryingRate = (fabricFvm.stats.dryingRate / 3600.0) * drumSim.effectiveAreaRatio; // kg/s
      drumSim.dryingPeriod = fabricFvm.stats.phaseNum <= 2 ? 'ConstantRate' : 'FallingRate';
      
      // Update Tab 1 UI Counters
      safeSetText('drumTimeVal', `${drumSim.time.toFixed(1)} s`);
      safeSetText('drumStateVal', drumSim.tumbleState === 'CW' ? '正転 (CW)' : drumSim.tumbleState === 'CCW' ? '反転 (CCW)' : 'もみほぐし停止');
      safeSetText('dryingRateVal', `${(drumSim.dryingRate * 1000).toFixed(2)} g/s`);
      safeSetText('totalMoistureVal', `${(drumSim.currentMoisture * 100).toFixed(1)} %`);
      
      const freePct = Math.max(0, Math.min(100, (drumSim.freeWater / 0.5) * 100));
      const boundPct = Math.max(0, Math.min(100, (drumSim.boundWater / 0.25) * 100));
      
      const freeBar = document.getElementById('freeWaterBar');
      if (freeBar) freeBar.style.width = `${freePct}%`;
      const boundBar = document.getElementById('boundWaterBar');
      if (boundBar) boundBar.style.width = `${boundPct}%`;
      
      safeSetText('freeWaterVal', `${(drumSim.freeWater * 100).toFixed(1)}%`);
      safeSetText('boundWaterVal', `${(drumSim.boundWater * 100).toFixed(1)}%`);
      
      const tempC = drumSim.clothesTemp - 273.15;
      safeSetText('clothesTempVal', `${tempC.toFixed(1)} °C`);
      
      const periodBadge = document.getElementById('periodBadge');
      if (periodBadge) {
        periodBadge.textContent = fabricFvm.stats.phaseName;
        periodBadge.className = fabricFvm.stats.phaseNum <= 2 ? 'badge-excellent' : fabricFvm.stats.phaseNum <= 4 ? 'badge-pass' : 'badge-verify';
      }
    }
    drumSim.render();
    
    if (fabricFvm.isRunning) {
      safeSetText('fvmTimeVal', `${fabricFvm.time.toFixed(1)} s`);
      safeSetText('fvmMoistVal', `${(fabricFvm.stats.meanMoisture * 100).toFixed(1)} %`);
      safeSetText('fvmTempCVal', `${fabricFvm.stats.surfaceTemp.toFixed(1)} °C`);
      safeSetText('fvmPeriodVal', fabricFvm.stats.period);
    }
    fabricFvm.render();
    
    // Update Tab 1 rate chart
    chartUpdateTimer += dt;
    if (chartUpdateTimer > 0.1) {
      chartUpdateTimer = 0;
      if (dryingRateChart && drumSim.history.length > 0) {
        const recent = drumSim.history.slice(-60);
        dryingRateChart.data.labels = recent.map((_, i) => (i * 0.2).toFixed(1));
        dryingRateChart.data.datasets[0].data = recent.map(r => r.dryingRate * 1000);
        dryingRateChart.update('none');
      }
    }
    
    // Live update dual characteristic curves every ~200ms
    highlightUpdateTimer += dt;
    if (highlightUpdateTimer > 0.2) {
      highlightUpdateTimer = 0;
      updateLiveHighlightOnCharts();
    }
    
    requestAnimationFrame(mainLoop);
  }
  
  // Initial executions
  drumSim.isRunning = true;
  fabricFvm.isRunning = true;
  updateDualDryingCharts();
  updateLiveHighlightOnCharts();
  
  requestAnimationFrame(mainLoop);
});
