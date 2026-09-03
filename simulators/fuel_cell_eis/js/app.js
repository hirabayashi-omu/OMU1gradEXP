/**
 * Main Application Logic
 * 
 * Coordinates:
 * - EIS Engine (Complex math & physics)
 * - Wiring Visualizer (4-Terminal Kelvin SVG)
 * - Canvas EIS Plotter (Cole-Cole & Bode plots)
 * - Equivalent Circuit Interactive Schematic & Interpretation Guide
 * - Sweep Simulation Runner & CSV Export
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize core engines
  const eis = new EISEngine();
  const wiring = new WiringVisualizer('wiring-diagram-container', {
    instrumentType: 'fra',
    mode: '4-terminal',
    targetCell: 'full',
    rLead: 45.0
  });

  const circuitSvg = new CircuitSchematicVisualizer('circuit-schematic-svg-container');
  const plots = new EISPlots('nyquist-canvas', 'bode-canvas');

  // Synchronize wiring AC oscillation speed with inspected point frequency
  plots.onHoverCallback = (pt) => {
    if (pt && pt.f) {
      updateInspectTable(pt);
      wiring.setSimulationState(isSimulating, pt.f);
    }
  };

  // Sweep simulation state
  let isSimulating = false;
  let sweepTimer = null;
  let currentSweepIdx = -1;
  let fullSpectrum = [];

  // ================= DOM ELEMENT REFERENCES =================
  const els = {
    // Mode toggles
    targetCellSelect: document.getElementById('target-cell-select'),
    modeSelect: document.getElementById('measurement-mode-select'),
    instrumentSelect: document.getElementById('instrument-type-select'),
    presetSelect: document.getElementById('preset-select'),

    // Parameter inputs & sliders
    rLead: document.getElementById('param-r-lead'),
    rLeadVal: document.getElementById('val-r-lead'),
    rLeadGroup: document.getElementById('group-r-lead'),

    enableROhm: document.getElementById('param-enable-r-ohm'),
    rOhm: document.getElementById('param-r-ohm'),
    rOhmVal: document.getElementById('val-r-ohm'),
    rOhmGroup: document.getElementById('group-r-ohm'),

    enableCathode: document.getElementById('param-enable-cathode'),
    rCtCathode: document.getElementById('param-r-ct-c'),
    rCtCathodeVal: document.getElementById('val-r-ct-c'),
    qCathode: document.getElementById('param-q-c'),
    qCathodeVal: document.getElementById('val-q-c'),
    nCathode: document.getElementById('param-n-c'),
    nCathodeVal: document.getElementById('val-n-c'),
    cathodeGroup: document.getElementById('group-cathode'),

    enableAnode: document.getElementById('param-enable-anode'),
    rCtAnode: document.getElementById('param-r-ct-a'),
    rCtAnodeVal: document.getElementById('val-r-ct-a'),
    cDlAnode: document.getElementById('param-c-dl-a'),
    cDlAnodeVal: document.getElementById('val-c-dl-a'),
    enableWarburgAnode: document.getElementById('param-enable-warburg-anode'),
    rWarburgAnode: document.getElementById('param-r-w-a'),
    rWarburgAnodeVal: document.getElementById('val-r-w-a'),
    anodeGroup: document.getElementById('group-anode'),

    enableWarburg: document.getElementById('param-enable-warburg'),
    rWarburg: document.getElementById('param-r-w'),
    rWarburgVal: document.getElementById('val-r-w'),
    tauWarburg: document.getElementById('param-tau-w'),
    tauWarburgVal: document.getElementById('val-tau-w'),
    warburgGroup: document.getElementById('group-warburg'),

    enableInductance: document.getElementById('param-enable-inductance'),
    lCable: document.getElementById('param-l-cable'),
    lCableVal: document.getElementById('val-l-cable'),
    inductanceGroup: document.getElementById('group-inductance'),

    noiseLevel: document.getElementById('param-noise-level'),
    noiseLevelVal: document.getElementById('val-noise-level'),

    // Simulation controls
    btnRunSweep: document.getElementById('btn-run-sweep'),
    btnResetSweep: document.getElementById('btn-reset-sweep'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    sweepStatusText: document.getElementById('sweep-status-text'),

    // Live Metrics displays
    metricROhm: document.getElementById('metric-r-ohm'),
    metricRct: document.getElementById('metric-r-ct'),
    metricFApex: document.getElementById('metric-f-apex'),
    metricCdl: document.getElementById('metric-c-dl'),
    metricRWarburg: document.getElementById('metric-r-w'),
    diagSummaryBox: document.getElementById('diag-summary-box'),
    diagBadge: document.getElementById('diag-badge'),

    // Inspection Point display
    inspectF: document.getElementById('inspect-f'),
    inspectZre: document.getElementById('inspect-zre'),
    inspectZim: document.getElementById('inspect-zim'),
    inspectMag: document.getElementById('inspect-mag'),
    inspectPhase: document.getElementById('inspect-phase'),

    // Interpretation tabs
    guideTabs: document.querySelectorAll('.guide-tab-btn'),
    guidePanels: document.querySelectorAll('.guide-panel-content'),
    circuitElementBoxes: document.querySelectorAll('.circuit-comp-box')
  };

  // ================= UPDATE & RECALCULATION =================
  function updateAll(keepSweepState = false) {
    // Read parameter values from UI
    const targetCell = els.targetCellSelect ? els.targetCellSelect.value : 'full';
    const params = {
      targetCell: targetCell,
      mode: els.modeSelect.value,
      instrumentType: els.instrumentSelect.value,
      rLead: parseFloat(els.rLead.value),

      enableROhm: els.enableROhm ? els.enableROhm.checked : true,
      rOhm: parseFloat(els.rOhm.value),

      enableCathode: els.enableCathode ? els.enableCathode.checked : true,
      rCtCathode: parseFloat(els.rCtCathode.value),
      qCathode: parseFloat(els.qCathode.value),
      nCathode: parseFloat(els.nCathode.value),

      enableAnode: els.enableAnode ? els.enableAnode.checked : true,
      rCtAnode: parseFloat(els.rCtAnode.value),
      cDlAnode: parseFloat(els.cDlAnode.value),
      enableWarburgAnode: els.enableWarburgAnode ? els.enableWarburgAnode.checked : false,
      rWarburgAnode: els.rWarburgAnode ? parseFloat(els.rWarburgAnode.value) : 0,
      tauWarburgAnode: 0.08,
      alphaWarburgAnode: 0.5,

      enableWarburg: els.enableWarburg ? els.enableWarburg.checked : true,
      rWarburg: parseFloat(els.rWarburg.value),
      tauWarburg: parseFloat(els.tauWarburg.value),

      enableInductance: els.enableInductance ? els.enableInductance.checked : true,
      lCable: parseFloat(els.lCable.value),

      noiseLevel: parseFloat(els.noiseLevel.value)
    };

    // Update Slider text labels
    els.rLeadVal.textContent = `${params.rLead.toFixed(1)} mΩ`;
    els.rOhmVal.textContent = params.enableROhm ? `${params.rOhm.toFixed(1)} mΩ` : 'OFF';
    els.rCtCathodeVal.textContent = params.enableCathode ? `${params.rCtCathode.toFixed(1)} mΩ` : 'OFF';
    els.qCathodeVal.textContent = `${params.qCathode.toFixed(1)} mF·s^(n-1)`;
    els.nCathodeVal.textContent = params.nCathode.toFixed(2);
    els.rCtAnodeVal.textContent = params.enableAnode ? `${params.rCtAnode.toFixed(1)} mΩ` : 'OFF';
    els.cDlAnodeVal.textContent = `${params.cDlAnode.toFixed(0)} µF`;
    if (els.rWarburgAnodeVal) {
      els.rWarburgAnodeVal.textContent = params.enableWarburgAnode ? `${params.rWarburgAnode.toFixed(1)} mΩ` : 'OFF';
    }
    els.rWarburgVal.textContent = params.enableWarburg ? `${params.rWarburg.toFixed(1)} mΩ` : 'OFF';
    els.tauWarburgVal.textContent = `${params.tauWarburg.toFixed(2)} s`;
    els.lCableVal.textContent = params.enableInductance ? `${params.lCable.toFixed(1)} nH` : 'OFF';
    els.noiseLevelVal.textContent = `${params.noiseLevel.toFixed(1)} %`;

    // Dynamic slider enabling/disabling based on ON/OFF checkboxes
    if (params.mode === '2-terminal') {
      els.rLeadGroup.classList.remove('opacity-40');
      els.rLead.disabled = false;
    } else {
      els.rLeadGroup.classList.add('opacity-40');
      els.rLead.disabled = true;
    }

    els.rOhm.disabled = !params.enableROhm;

    els.rCtCathode.disabled = !params.enableCathode;
    els.qCathode.disabled = !params.enableCathode;
    els.nCathode.disabled = !params.enableCathode;

    els.rCtAnode.disabled = !params.enableAnode;
    els.cDlAnode.disabled = !params.enableAnode;

    els.rWarburg.disabled = !params.enableWarburg;
    els.tauWarburg.disabled = !params.enableWarburg;

    els.lCable.disabled = !params.enableInductance;

    // Pass to Engine & Calculate
    eis.setParams(params);
    fullSpectrum = eis.calculateSpectrum(params.noiseLevel > 0);
    const analysis = eis.analyzeSpectrum(fullSpectrum);
    const theoretical = eis.getTheoreticalComponents();
    plots.setTheoreticalComponents(theoretical);

    // Update SVG Wiring & Circuit Schematic
    wiring.setTargetCell(targetCell);
    wiring.setMode(params.mode, params.rLead);
    wiring.setInstrumentType(params.instrumentType);

    circuitSvg.update(params, (hoverKey) => {
      plots.setHighlightElement(hoverKey);
    });

    // Update Plots
    if (!keepSweepState) {
      currentSweepIdx = -1;
      plots.setData(fullSpectrum, analysis, -1);
    } else {
      plots.setData(fullSpectrum, analysis, currentSweepIdx);
    }

    // Update Live Metrics & Diagnostics
    updateMetricsAndDiagnosis(analysis, params);
    updateCircuitBadgeValues(params);
  }

  function updateMetricsAndDiagnosis(analysis, params) {
    if (!analysis) return;

    els.metricROhm.textContent = `${analysis.rOhmEst.toFixed(1)} mΩ`;
    els.metricRct.textContent = `${params.rCtCathode.toFixed(1)} mΩ`;
    els.metricFApex.textContent = `${analysis.fApex.toFixed(1)} Hz`;
    els.metricCdl.textContent = `${analysis.estimatedCdl_uF >= 1000 ? (analysis.estimatedCdl_uF / 1000).toFixed(2) + ' mF' : analysis.estimatedCdl_uF.toFixed(0) + ' µF'}`;
    els.metricRWarburg.textContent = params.enableWarburg ? `${params.rWarburg.toFixed(1)} mΩ` : '無効 (OFF)';

    const diag = analysis.diagnosis;
    els.diagBadge.textContent = diag.membraneHealth.split(' ')[0];
    els.diagBadge.className = `badge ${diag.overallSeverity === 'danger' ? 'badge-danger' : (diag.overallSeverity === 'warning' ? 'badge-warning' : 'badge-success')}`;

    els.diagSummaryBox.innerHTML = `
      <ul class="diag-bullet-list">
        ${diag.bulletPoints.map(pt => `<li>${pt}</li>`).join('')}
      </ul>
    `;
  }

  function updateCircuitBadgeValues(params) {
    const elRohmVal = document.getElementById('diag-circ-rohm');
    const elRctcVal = document.getElementById('diag-circ-rctc');
    const elCdlcVal = document.getElementById('diag-circ-cdlc');
    const elRctaVal = document.getElementById('diag-circ-rcta');
    const elRwVal = document.getElementById('diag-circ-rw');
    const elLVal = document.getElementById('diag-circ-l');

    if (elRohmVal) elRohmVal.textContent = `${params.rOhm.toFixed(1)}mΩ`;
    if (elRctcVal) elRctcVal.textContent = `${params.rCtCathode.toFixed(1)}mΩ`;
    if (elCdlcVal) elCdlcVal.textContent = `Q=${params.qCathode.toFixed(0)}mF (n=${params.nCathode})`;
    if (elRctaVal) elRctaVal.textContent = params.enableAnode ? `${params.rCtAnode.toFixed(1)}mΩ` : 'OFF';
    if (elRwVal) elRwVal.textContent = params.enableWarburg ? `${params.rWarburg.toFixed(1)}mΩ` : 'OFF';
    if (elLVal) elLVal.textContent = params.enableInductance ? `${params.lCable.toFixed(0)}nH` : 'OFF';
  }

  // ================= PRESET SELECTION =================
  els.presetSelect.addEventListener('change', (e) => {
    const presetKey = e.target.value;
    const preset = window.FC_PRESETS[presetKey];
    if (!preset) return;

    // Apply preset parameters to UI
    els.modeSelect.value = preset.params.mode;
    els.rLead.value = preset.params.rLead;
    if (els.enableROhm) els.enableROhm.checked = preset.params.enableROhm !== false;
    els.rOhm.value = preset.params.rOhm;
    if (els.enableCathode) els.enableCathode.checked = preset.params.enableCathode !== false;
    els.rCtCathode.value = preset.params.rCtCathode;
    els.qCathode.value = preset.params.qCathode;
    els.nCathode.value = preset.params.nCathode;
    els.enableAnode.checked = preset.params.enableAnode !== false;
    els.rCtAnode.value = preset.params.rCtAnode;
    els.cDlAnode.value = preset.params.cDlAnode;
    if (els.enableWarburgAnode) els.enableWarburgAnode.checked = preset.params.enableWarburgAnode === true;
    if (els.rWarburgAnode) els.rWarburgAnode.value = preset.params.rWarburgAnode || 0;
    els.enableWarburg.checked = preset.params.enableWarburg !== false;
    els.rWarburg.value = preset.params.rWarburg;
    els.tauWarburg.value = preset.params.tauWarburg;
    els.enableInductance.checked = preset.params.enableInductance !== false;
    els.lCable.value = preset.params.lCable;
    els.noiseLevel.value = preset.params.noiseLevel;

    // Stop ongoing sweep simulation if any
    stopSweep();
    updateAll(false);
  });

  // ================= SWEEP SIMULATION =================
  function startSweep() {
    if (isSimulating) {
      stopSweep();
      return;
    }

    isSimulating = true;
    currentSweepIdx = 0;
    els.btnRunSweep.innerHTML = '<span class="icon">⏸</span> 測定一時停止';
    els.btnRunSweep.classList.add('btn-warning');
    els.sweepStatusText.textContent = '周波数スイープ測定中...';
    wiring.setSimulating(true);

    fullSpectrum = eis.calculateSpectrum(parseFloat(els.noiseLevel.value) > 0);
    const analysis = eis.analyzeSpectrum(fullSpectrum);

    function step() {
      if (!isSimulating) return;

      if (currentSweepIdx < fullSpectrum.length) {
        const curPt = fullSpectrum[currentSweepIdx];
        plots.setData(fullSpectrum, analysis, currentSweepIdx);
        wiring.setSimulating(true, curPt.f);

        // Update inspect table with current live sweeping point
        updateInspectTable(curPt);

        els.sweepStatusText.textContent = `測定周波数: ${curPt.f >= 1000 ? (curPt.f/1000).toFixed(2)+' kHz' : curPt.f.toFixed(2)+' Hz'} (${currentSweepIdx + 1}/${fullSpectrum.length} 点)`;

        currentSweepIdx++;
        // Frequency sweep interval: high frequencies sweep faster, low frequencies take slightly longer
        const delay = curPt.f < 1 ? 150 : 60;
        sweepTimer = setTimeout(step, delay);
      } else {
        // Finished
        stopSweep();
        els.sweepStatusText.textContent = '✓ 全周波数スイープ測定完了 (Complete)';
      }
    }

    step();
  }

  function stopSweep() {
    isSimulating = false;
    if (sweepTimer) clearTimeout(sweepTimer);
    els.btnRunSweep.innerHTML = '<span class="icon">▶</span> スイープ測定開始';
    els.btnRunSweep.classList.remove('btn-warning');
    wiring.setSimulating(false);
  }

  function resetSweep() {
    stopSweep();
    currentSweepIdx = -1;
    els.sweepStatusText.textContent = '待機中 (全プロット表示中)';
    updateAll(false);
  }

  els.btnRunSweep.addEventListener('click', startSweep);
  els.btnResetSweep.addEventListener('click', resetSweep);

  // ================= CSV EXPORT =================
  els.btnExportCsv.addEventListener('click', () => {
    if (!fullSpectrum || fullSpectrum.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Frequency_Hz,Z_Real_mOhm,Z_Imag_mOhm,Neg_Z_Imag_mOhm,Magnitude_mOhm,Phase_Deg\r\n';

    fullSpectrum.forEach(pt => {
      csvContent += `${pt.f.toExponential(4)},${pt.zRe.toFixed(4)},${pt.zIm.toFixed(4)},${pt.negZIm.toFixed(4)},${pt.mag.toFixed(4)},${pt.phase.toFixed(2)}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fuel_cell_eis_data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // ================= HOVER POINT INSPECTION =================
  function updateInspectTable(pt) {
    if (!pt) return;
    els.inspectF.textContent = pt.f >= 1000 ? `${(pt.f/1000).toFixed(3)} kHz` : `${pt.f.toFixed(3)} Hz`;
    els.inspectZre.textContent = `${pt.zRe.toFixed(2)} mΩ`;
    els.inspectZim.textContent = `${pt.negZIm.toFixed(2)} mΩ`;
    els.inspectMag.textContent = `${pt.mag.toFixed(2)} mΩ`;
    els.inspectPhase.textContent = `${pt.phase.toFixed(1)}°`;
  }

  plots.onHoverCallback = (pt) => {
    if (pt && pt.f) {
      updateInspectTable(pt);
      wiring.setSimulationState(isSimulating, pt.f);
    }
  };

  // ================= THEORETICAL & BASELINE OVERLAY TOGGLES =================
  const toggleBaselineOverlay = document.getElementById('toggle-baseline-overlay');
  const toggleShiftVectors = document.getElementById('toggle-shift-vectors');
  const btnSetBaseline = document.getElementById('btn-set-baseline');
  const toggleShowAllTheo = document.getElementById('toggle-show-all-theoretical');
  const toggleNyquistOverlay = document.getElementById('toggle-nyquist-overlay');
  const toggleIdealCompare = document.getElementById('toggle-nyquist-ideal-compare');

  // Baseline Reference Spectrum setup (Normal operation preset by default)
  let baselineSpectrum = eis.calculateBaselineSpectrum();
  let baselineAnalysis = eis.analyzeSpectrum(baselineSpectrum);
  plots.setBaselineSpectrum(baselineSpectrum, baselineAnalysis);

  if (toggleBaselineOverlay) {
    toggleBaselineOverlay.addEventListener('change', (e) => {
      plots.setShowBaselineOverlay(e.target.checked);
    });
  }

  if (toggleShiftVectors) {
    toggleShiftVectors.addEventListener('change', (e) => {
      plots.setShowShiftVectors(e.target.checked);
    });
  }

  if (btnSetBaseline) {
    btnSetBaseline.addEventListener('click', () => {
      eis.setBaselineParams(eis.params);
      baselineSpectrum = eis.calculateBaselineSpectrum();
      baselineAnalysis = eis.analyzeSpectrum(baselineSpectrum);
      plots.setBaselineSpectrum(baselineSpectrum, baselineAnalysis);

      // Visual feedback on button
      btnSetBaseline.textContent = '✓ 基準更新完了';
      btnSetBaseline.classList.add('btn-emerald');
      setTimeout(() => {
        btnSetBaseline.textContent = '📌 基準に設定';
        btnSetBaseline.classList.remove('btn-emerald');
      }, 1500);
    });
  }

  function setTheoreticalOverlayState(enabled) {
    if (toggleShowAllTheo) toggleShowAllTheo.checked = enabled;
    if (toggleNyquistOverlay) toggleNyquistOverlay.checked = enabled;
    plots.setShowAllTheoretical(enabled);
  }

  if (toggleShowAllTheo) {
    toggleShowAllTheo.addEventListener('change', (e) => {
      setTheoreticalOverlayState(e.target.checked);
    });
  }

  if (toggleNyquistOverlay) {
    toggleNyquistOverlay.addEventListener('change', (e) => {
      setTheoreticalOverlayState(e.target.checked);
    });
  }

  if (toggleIdealCompare) {
    toggleIdealCompare.addEventListener('change', (e) => {
      plots.setShowIdealCompare(e.target.checked);
    });
  }

  // ================= CIRCUIT ELEMENT HIGHLIGHT BINDING =================
  els.circuitElementBoxes.forEach(box => {
    const elKey = box.getAttribute('data-element');
    box.addEventListener('mouseenter', () => {
      plots.setHighlightElement(elKey);
      box.classList.add('active-highlight');
    });
    box.addEventListener('mouseleave', () => {
      plots.setHighlightElement(null);
      box.classList.remove('active-highlight');
    });
  });

  // ================= VISUALIZER GRAPHICS TABS =================
  const visTabBtns = document.querySelectorAll('.vis-tab-btn');
  const visTabPanels = document.querySelectorAll('.vis-tab-panel');
  const circuitAnalysisContainer = document.getElementById('circuit-analysis-container');

  visTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPanelId = btn.getAttribute('data-vis-tab');
      visTabBtns.forEach(b => b.classList.remove('active'));
      visTabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      // Hide plots, metrics, diagnosis, and interpretation guide when in Wiring View
      if (circuitAnalysisContainer) {
        if (targetPanelId === 'vis-panel-wiring') {
          circuitAnalysisContainer.style.display = 'none';
        } else {
          circuitAnalysisContainer.style.display = 'block';
          // Refresh plots layout when coming back to circuit/plots tab
          setTimeout(() => {
            plots.resize();
          }, 50);
        }
      }
    });
  });

  // ================= INTERPRETATION GUIDE TABS =================
  els.guideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      els.guideTabs.forEach(t => t.classList.remove('active'));
      els.guidePanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        if (window.MathRenderer) window.MathRenderer.renderAll(targetPanel);
      }
    });
  });

  // ================= EVENT BINDINGS FOR ALL INPUTS =================
  const inputElements = [
    els.targetCellSelect, els.modeSelect, els.instrumentSelect, els.rLead,
    els.enableROhm, els.rOhm,
    els.enableCathode, els.rCtCathode, els.qCathode, els.nCathode,
    els.enableAnode, els.rCtAnode, els.cDlAnode,
    els.enableWarburgAnode, els.rWarburgAnode,
    els.enableWarburg, els.rWarburg, els.tauWarburg,
    els.enableInductance, els.lCable, els.noiseLevel
  ];

  inputElements.forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => updateAll(true));
      inp.addEventListener('change', () => updateAll(true));
    }
  });

  // Initial calculation and draw
  if (toggleShowAllTheo) {
    plots.setShowAllTheoretical(toggleShowAllTheo.checked);
  }
  updateAll(false);
  if (window.MathRenderer) {
    window.MathRenderer.renderAll(document.body);
  }
});
