/**
 * Main Application Orchestrator for 2D CFD Classroom Air Conditioning Simulator
 * Includes Ceiling Oscillating Circulator Fan Controls
 */
function initApp() {
    // 1. Initialize DOM Elements
    const canvas = document.getElementById('cfdCanvas');
    const probeTooltip = document.getElementById('probeTooltip');

    // Stats & Status Elements
    const statusBadge = document.getElementById('simStatusBadge');
    const statusText = document.getElementById('statusText');
    const stepCounter = document.getElementById('stepCounter');
    const simTime = document.getElementById('simTime');
    const statMaxTemp = document.getElementById('statMaxTemp');
    const statAvgTemp = document.getElementById('statAvgTemp');
    const statMinTemp = document.getElementById('statMinTemp');
    const statCurrentAngle = document.getElementById('statCurrentAngle');

    // Controls Elements
    const btnPlayPause = document.getElementById('btnPlayPause');
    const iconPlayPause = document.getElementById('iconPlayPause');
    const textPlayPause = document.getElementById('textPlayPause');
    const btnStep = document.getElementById('btnStep');
    const btnReset = document.getElementById('btnReset');

    // Engine Switch Buttons
    const btnEngineCpu = document.getElementById('btnEngineCpu');
    const btnEngineGpu = document.getElementById('btnEngineGpu');

    // Preset Buttons
    const btnPresetSummer = document.getElementById('btnPresetSummerCooling');
    const btnPresetCircCool = document.getElementById('btnPresetCircCool');
    const btnPresetWinter = document.getElementById('btnPresetWinterHeating');
    const btnPresetRapid = document.getElementById('btnPresetRapidCool');

    // Slider Controls (AC)
    const sliderOutletTemp = document.getElementById('sliderOutletTemp');
    const valOutletTemp = document.getElementById('valOutletTemp');
    const sliderInitTemp = document.getElementById('sliderInitTemp');
    const valInitTemp = document.getElementById('valInitTemp');

    const btnModeFixed = document.getElementById('btnModeFixed');
    const btnModeSweep = document.getElementById('btnModeSweep');
    const groupFixedAngle = document.getElementById('groupFixedAngle');
    const groupSweepParams = document.getElementById('groupSweepParams');

    const sliderFinAngle = document.getElementById('sliderFinAngle');
    const valFinAngle = document.getElementById('valFinAngle');
    const sliderSweepSpeed = document.getElementById('sliderSweepSpeed');
    const valSweepSpeed = document.getElementById('valSweepSpeed');

    const selectPowerRating = document.getElementById('selectPowerRating');
    const selectWindowCondition = document.getElementById('selectWindowCondition');
    const selectColormap = document.getElementById('selectColormap');

    // Ceiling Circulator Fan Controls
    const btnCircOff = document.getElementById('btnCircOff');
    const btnCircOn = document.getElementById('btnCircOn');
    const valCircStatus = document.getElementById('valCircStatus');
    const sliderCircSpeed = document.getElementById('sliderCircSpeed');
    const valCircSpeed = document.getElementById('valCircSpeed');
    const btnCircSwingOn = document.getElementById('btnCircSwingOn');
    const btnCircSwingOff = document.getElementById('btnCircSwingOff');

    // Layer Checkboxes
    const chkHeatmap = document.getElementById('chkHeatmap');
    const chkParticles = document.getElementById('chkParticles');
    const chkVectors = document.getElementById('chkVectors');
    const chkDesks = document.getElementById('chkDesks');

    // Power Rating to Air Velocity mapping
    const powerVelMap = { 1.8: 2.0, 2.3: 2.8, 3.0: 3.6 };
    const circSpeedMap = { 1: { vel: 1.8, label: '弱風 (1.8 m/s)' }, 2: { vel: 2.6, label: '中風 (2.6 m/s)' }, 3: { vel: 3.4, label: '強風 (3.4 m/s)' } };

    // 2. Initialize Solver & Renderer
    let useGpuMode = false;
    let solver = new CFDSolver2D(70, 35);
    let gpuSolver = null;
    try {
        if (typeof CFDGpuSolver2D !== 'undefined') {
            gpuSolver = new CFDGpuSolver2D(canvas, 140, 70);
        }
    } catch (err) {
        console.warn('GPU solver init warning:', err);
    }
    let renderer = new CFDRenderer(canvas, solver);

    let isRunning = true;
    let animFrameId = null;

    // 3. Charts Disabled
    const historyChart = null;
    const seatedChart = null;

    // 4. Helper Functions
    function setPlayState(running) {
        isRunning = running;
        if (running) {
            statusBadge.classList.remove('paused');
            statusText.textContent = '計算実行中';
            textPlayPause.textContent = '一時停止';
            iconPlayPause.setAttribute('data-lucide', 'pause');
        } else {
            statusBadge.classList.add('paused');
            statusText.textContent = '一時停止中';
            textPlayPause.textContent = '再開';
            iconPlayPause.setAttribute('data-lucide', 'play');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function resetSimulation() {
        solver.initDomain();
        renderer.initParticles();
        renderer.updateTempRange();

        if (historyChart) {
            historyChart.data.labels = [];
            historyChart.data.datasets[0].data = [];
            historyChart.update();
        }

        if (seatedChart) {
            const profile = solver.getSeatedTemperatureProfile();
            seatedChart.data.datasets[0].data = profile.map(p => p.temp);
            seatedChart.update();
        }

        updateStatsAndCharts();
    }

    function updateFinModeUI(isSweep) {
        if (isSweep) {
            btnModeSweep.classList.add('active');
            btnModeFixed.classList.remove('active');
            groupFixedAngle.classList.add('hidden');
            groupSweepParams.classList.remove('hidden');
        } else {
            btnModeFixed.classList.add('active');
            btnModeSweep.classList.remove('active');
            groupFixedAngle.classList.remove('hidden');
            groupSweepParams.classList.add('hidden');
        }
    }

    function updateCirculatorUI() {
        if (solver.circulatorEnabled) {
            btnCircOn.classList.add('active');
            btnCircOff.classList.remove('active');
            valCircStatus.textContent = 'ON（運転中）';
            valCircStatus.classList.add('active-green');
        } else {
            btnCircOff.classList.add('active');
            btnCircOn.classList.remove('active');
            valCircStatus.textContent = 'OFF（停止中）';
            valCircStatus.classList.remove('active-green');
        }

        if (solver.circulatorSwing) {
            btnCircSwingOn.classList.add('active');
            btnCircSwingOff.classList.remove('active');
        } else {
            btnCircSwingOff.classList.add('active');
            btnCircSwingOn.classList.remove('active');
        }

        // Match slider to speed
        if (solver.circulatorSpeed <= 2.0) {
            sliderCircSpeed.value = 1;
            valCircSpeed.textContent = circSpeedMap[1].label;
        } else if (solver.circulatorSpeed <= 3.0) {
            sliderCircSpeed.value = 2;
            valCircSpeed.textContent = circSpeedMap[2].label;
        } else {
            sliderCircSpeed.value = 3;
            valCircSpeed.textContent = circSpeedMap[3].label;
        }
    }

    function applyPreset(presetKey) {
        const p = SIM_PRESETS[presetKey];
        if (!p) return;

        solver.initTemp = p.initTemp;
        solver.outletTemp = p.outletTemp;
        solver.isSweepMode = p.isSweepMode;
        solver.finAngleDeg = p.finAngleDeg;
        solver.sweepSpeedSec = p.sweepSpeedSec;
        solver.powerRating = p.powerRating;
        solver.outletVel = powerVelMap[p.powerRating] || 2.8;
        solver.windowCondition = p.windowCondition;

        if (typeof p.circulatorEnabled !== 'undefined') {
            solver.circulatorEnabled = p.circulatorEnabled;
            solver.circulatorSpeed = p.circulatorSpeed || 2.6;
            solver.circulatorSwing = typeof p.circulatorSwing !== 'undefined' ? p.circulatorSwing : true;
        }

        // Update UI Inputs
        sliderInitTemp.value = p.initTemp;
        valInitTemp.textContent = `${p.initTemp.toFixed(1)} °C`;

        sliderOutletTemp.value = p.outletTemp;
        valOutletTemp.textContent = `${p.outletTemp.toFixed(1)} °C`;

        sliderFinAngle.value = p.finAngleDeg;
        valFinAngle.textContent = `${p.finAngleDeg}°`;

        sliderSweepSpeed.value = p.sweepSpeedSec;
        valSweepSpeed.textContent = `${p.sweepSpeedSec} 秒`;

        selectPowerRating.value = p.powerRating.toString();
        selectWindowCondition.value = p.windowCondition;

        updateFinModeUI(p.isSweepMode);
        updateCirculatorUI();

        // Highlight active preset button
        [btnPresetSummer, btnPresetCircCool, btnPresetWinter, btnPresetRapid].forEach(b => {
            if (b) b.classList.remove('active');
        });
        if (presetKey === 'summerCooling' && btnPresetSummer) btnPresetSummer.classList.add('active');
        if (presetKey === 'summerCirculatorCool' && btnPresetCircCool) btnPresetCircCool.classList.add('active');
        if (presetKey === 'winterHeating' && btnPresetWinter) btnPresetWinter.classList.add('active');
        if (presetKey === 'rapidCoolSweep' && btnPresetRapid) btnPresetRapid.classList.add('active');

        resetSimulation();
    }

    // 5. Event Listeners: Simulation Controls
    btnPlayPause.addEventListener('click', () => setPlayState(!isRunning));
    btnStep.addEventListener('click', () => {
        setPlayState(false);
        solver.step();
        updateStatsAndCharts();
        renderer.render();
    });
    btnReset.addEventListener('click', resetSimulation);

    // Engine Switch
    btnEngineCpu.addEventListener('click', () => {
        useGpuMode = false;
        btnEngineCpu.classList.add('active');
        btnEngineGpu.classList.remove('active');
    });

    btnEngineGpu.addEventListener('click', () => {
        if (gpuSolver && gpuSolver.isSupported) {
            useGpuMode = true;
            btnEngineGpu.classList.add('active');
            btnEngineCpu.classList.remove('active');
        } else {
            alert('お使いのブラウザ・グラフィック環境ではWebGL GPGPU拡張が利用できません。CPUモードで実行します。');
        }
    });

    // Presets
    if (btnPresetSummer) btnPresetSummer.addEventListener('click', () => applyPreset('summerCooling'));
    if (btnPresetCircCool) btnPresetCircCool.addEventListener('click', () => applyPreset('summerCirculatorCool'));
    if (btnPresetWinter) btnPresetWinter.addEventListener('click', () => applyPreset('winterHeating'));
    if (btnPresetRapid) btnPresetRapid.addEventListener('click', () => applyPreset('rapidCoolSweep'));

    // AC Sliders & Inputs
    sliderOutletTemp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        solver.outletTemp = val;
        valOutletTemp.textContent = `${val.toFixed(1)} °C`;
        renderer.updateTempRange();
    });

    sliderInitTemp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        solver.initTemp = val;
        valInitTemp.textContent = `${val.toFixed(1)} °C`;
        renderer.updateTempRange();
    });

    btnModeFixed.addEventListener('click', () => {
        solver.isSweepMode = false;
        updateFinModeUI(false);
    });

    btnModeSweep.addEventListener('click', () => {
        solver.isSweepMode = true;
        updateFinModeUI(true);
    });

    sliderFinAngle.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        solver.finAngleDeg = val;
        valFinAngle.textContent = `${val}°`;
    });

    sliderSweepSpeed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        solver.sweepSpeedSec = val;
        valSweepSpeed.textContent = `${val} 秒`;
    });

    selectPowerRating.addEventListener('change', (e) => {
        const rating = parseFloat(e.target.value);
        solver.powerRating = rating;
        solver.outletVel = powerVelMap[rating] || 2.8;
    });

    selectWindowCondition.addEventListener('change', (e) => {
        solver.windowCondition = e.target.value;
    });

    // 5.1 Ceiling Circulator Controls
    btnCircOn.addEventListener('click', () => {
        solver.circulatorEnabled = true;
        updateCirculatorUI();
    });

    btnCircOff.addEventListener('click', () => {
        solver.circulatorEnabled = false;
        updateCirculatorUI();
    });

    sliderCircSpeed.addEventListener('input', (e) => {
        const level = parseInt(e.target.value);
        const info = circSpeedMap[level] || circSpeedMap[2];
        solver.circulatorSpeed = info.vel;
        valCircSpeed.textContent = info.label;
    });

    btnCircSwingOn.addEventListener('click', () => {
        solver.circulatorSwing = true;
        updateCirculatorUI();
    });

    btnCircSwingOff.addEventListener('click', () => {
        solver.circulatorSwing = false;
        updateCirculatorUI();
    });

    // 6. Visualizer Options
    selectColormap.addEventListener('change', (e) => {
        renderer.setColormap(e.target.value);
    });

    const sliderHeatmapOpacity = document.getElementById('sliderHeatmapOpacity');
    const valHeatmapOpacity = document.getElementById('valHeatmapOpacity');
    if (sliderHeatmapOpacity) {
        sliderHeatmapOpacity.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            renderer.heatmapOpacity = val / 100.0;
            if (valHeatmapOpacity) valHeatmapOpacity.textContent = `${val}%`;
        });
    }

    const btnFieldTemp = document.getElementById('btnFieldTemp');
    const btnFieldVel = document.getElementById('btnFieldVel');

    btnFieldTemp.addEventListener('click', () => {
        renderer.heatmapField = 'temp';
        btnFieldTemp.classList.add('active');
        btnFieldVel.classList.remove('active');
        renderer.updateLegendBar();
    });

    btnFieldVel.addEventListener('click', () => {
        renderer.heatmapField = 'vel';
        btnFieldVel.classList.add('active');
        btnFieldTemp.classList.remove('active');
        renderer.updateLegendBar();
    });

    const btnViewBoth = document.getElementById('btnViewBoth');
    const btnViewVectors = document.getElementById('btnViewVectors');
    const btnViewTemp = document.getElementById('btnViewTemp');
    const btnViewStream = document.getElementById('btnViewStream');

    function setViewMode(mode) {
        [btnViewBoth, btnViewVectors, btnViewTemp, btnViewStream].forEach(b => {
            if (b) b.classList.remove('active');
        });
        if (mode === 'both') {
            btnViewBoth.classList.add('active');
            renderer.showHeatmap = true;
            renderer.showParticles = true;
            renderer.showVectors = false;
            chkHeatmap.checked = true;
            chkParticles.checked = true;
            chkVectors.checked = false;
        } else if (mode === 'vectors') {
            if (btnViewVectors) btnViewVectors.classList.add('active');
            renderer.showHeatmap = true;
            renderer.showParticles = false;
            renderer.showVectors = true;
            chkHeatmap.checked = true;
            chkParticles.checked = false;
            chkVectors.checked = true;
        } else if (mode === 'temp') {
            btnViewTemp.classList.add('active');
            renderer.showHeatmap = true;
            renderer.showParticles = false;
            renderer.showVectors = false;
            chkHeatmap.checked = true;
            chkParticles.checked = false;
            chkVectors.checked = false;
        } else if (mode === 'stream') {
            btnViewStream.classList.add('active');
            renderer.showHeatmap = false;
            renderer.showParticles = true;
            renderer.showVectors = false;
            chkHeatmap.checked = false;
            chkParticles.checked = true;
            chkVectors.checked = false;
        }
    }

    if (btnViewBoth) btnViewBoth.addEventListener('click', () => setViewMode('both'));
    if (btnViewVectors) btnViewVectors.addEventListener('click', () => setViewMode('vectors'));
    if (btnViewTemp) btnViewTemp.addEventListener('click', () => setViewMode('temp'));
    if (btnViewStream) btnViewStream.addEventListener('click', () => setViewMode('stream'));

    // Layer Toggles
    chkHeatmap.addEventListener('change', (e) => { renderer.showHeatmap = e.target.checked; });
    chkParticles.addEventListener('change', (e) => { renderer.showParticles = e.target.checked; });
    chkVectors.addEventListener('change', (e) => { renderer.showVectors = e.target.checked; });
    chkDesks.addEventListener('change', (e) => { renderer.showDesks = e.target.checked; });

    // Interactive Probe Hover & Click
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert canvas pixels to physical domain (m)
        const posX = (mouseX / rect.width) * solver.Lx;
        const posY = ((rect.height - mouseY) / rect.height) * solver.Ly;

        // Change cursor to pointer if hovering over ceiling circulator fan
        if (Math.abs(posX - 3.5) < 0.4 && posY >= 3.1) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'crosshair';
        }

        if (posX >= 0 && posX <= solver.Lx && posY >= 0 && posY <= solver.Ly) {
            const sample = solver.sampleAt(posX, posY);
            document.getElementById('tpPos').textContent = `X: ${sample.x}m, Y: ${sample.y}m`;
            document.getElementById('tpTemp').textContent = `${sample.temp} °C`;
            document.getElementById('tpVel').textContent = `${sample.vel} m/s (u: ${sample.u}, v: ${sample.v})`;

            probeTooltip.style.left = `${mouseX}px`;
            probeTooltip.style.top = `${mouseY}px`;
            probeTooltip.classList.remove('hidden');
        } else {
            probeTooltip.classList.add('hidden');
        }
    });

    // Click on canvas (toggle circulator fan if clicking on it)
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const posX = (mouseX / rect.width) * solver.Lx;
        const posY = ((rect.height - mouseY) / rect.height) * solver.Ly;

        if (Math.abs(posX - 3.5) < 0.5 && posY >= 3.0) {
            solver.circulatorEnabled = !solver.circulatorEnabled;
            updateCirculatorUI();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        probeTooltip.classList.add('hidden');
    });

    // CSV Export & PNG Snapshot Handlers
    const btnExportCsv = document.getElementById('btnExportCsv');
    const btnSnapshot = document.getElementById('btnSnapshot');
    const statPmv = document.getElementById('statPmv');

    function calculatePMV(ta, va) {
        // Simplified Fanger PMV index for indoor classroom environment
        const tempDiff = ta - 24.5;
        const velEffect = 0.35 * Math.sqrt(Math.max(0.1, va));
        let pmv = 0.35 * tempDiff - velEffect;
        pmv = Math.max(-3.0, Math.min(3.0, pmv));

        let faceIcon = '😊';
        let statusStr = '快適';
        let colorClass = 'accent';

        if (pmv > 1.5) {
            faceIcon = '🥵';
            statusStr = '暑い';
            colorClass = 'hot';
        } else if (pmv > 0.5) {
            faceIcon = '😅';
            statusStr = 'やや暖かい';
            colorClass = 'hot';
        } else if (pmv >= -0.5) {
            faceIcon = '😊';
            statusStr = '快適';
            colorClass = 'accent';
        } else if (pmv >= -1.5) {
            faceIcon = '🙂';
            statusStr = 'やや涼しい';
            colorClass = 'cold';
        } else {
            faceIcon = '🥶';
            statusStr = '寒い';
            colorClass = 'cold';
        }

        const pmvSign = pmv >= 0 ? '+' : '';
        return {
            formattedText: `${faceIcon} ${pmvSign}${pmv.toFixed(1)} (${statusStr})`,
            colorClass: colorClass
        };
    }

    btnExportCsv.addEventListener('click', () => {
        const profile = solver.getSeatedTemperatureProfile();
        let csvContent = '\uFEFF'; // UTF-8 BOM for Japanese Excel compatibility
        csvContent += '時間(s),平均室温(°C),1列目(°C),2列目(°C),3列目(°C),4列目(°C),5列目(°C),6列目(°C),7列目(°C),サーキュレータ\n';

        const historyLen = historyChart && historyChart.data.labels.length;
        const circState = solver.circulatorEnabled ? 'ON' : 'OFF';
        for (let k = 0; k < historyLen; k++) {
            const timeStr = historyChart && historyChart.data.labels[k];
            const avgTemp = historyChart && historyChart.data.datasets[0].data[k];
            const rowVals = profile.slice(0, 7).map(p => p.temp).join(',');
            csvContent += `${timeStr},${avgTemp},${rowVals},${circState}\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CFD_Classroom_Report_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });

    // Sub-Sidebar Toggle Handler
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnToggleSidebarToolbar = document.getElementById('btnToggleSidebarToolbar');
    const controlSidebar = document.getElementById('controlSidebar');
    const iconToggleSidebar = document.getElementById('iconToggleSidebar');

    function toggleSidebarHandler() {
        if (!controlSidebar) return;
        const isCollapsed = controlSidebar.classList.toggle('collapsed');
        if (iconToggleSidebar) {
            if (isCollapsed) {
                iconToggleSidebar.setAttribute('data-lucide', 'panel-left-open');
            } else {
                iconToggleSidebar.setAttribute('data-lucide', 'panel-left-close');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 260);
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebarHandler);
    if (btnToggleSidebarToolbar) btnToggleSidebarToolbar.addEventListener('click', toggleSidebarHandler);

    btnSnapshot.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `CFD_Simulation_Snapshot_${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // 7. Stats & Charts Updater
    function updateStatsAndCharts() {
        const stats = solver.getTemperatureStats();
        statMaxTemp.textContent = `${stats.max.toFixed(1)} °C`;
        statAvgTemp.textContent = `${stats.avg.toFixed(1)} °C`;
        statMinTemp.textContent = `${stats.min.toFixed(1)} °C`;
        statCurrentAngle.textContent = `${solver.getCurrentFinAngle().toFixed(1)}°`;

        // Update PMV
        const seatedProfile = solver.getSeatedTemperatureProfile();
        const avgSeatedTemp = seatedProfile.reduce((acc, p) => acc + p.temp, 0) / seatedProfile.length;
        if (statPmv) {
            const pmvRes = calculatePMV(avgSeatedTemp, 0.2);
            statPmv.textContent = pmvRes.formattedText;
            statPmv.className = `v-val ${pmvRes.colorClass}`;
        }

        stepCounter.textContent = solver.stepCount;
        simTime.textContent = `${solver.time.toFixed(1)}s`;

        // Update Charts every 20 steps
        if (solver.stepCount % 20 === 0) {
            // Temperature History
            if (historyChart && historyChart.data.labels.length > 50) {
                historyChart && historyChart.data.labels.shift();
                historyChart && historyChart.data.datasets[0].data.shift();
            }
            historyChart && historyChart.data.labels.push(`${solver.time.toFixed(0)}s`);
            historyChart && historyChart.data.datasets[0].data.push(parseFloat(stats.avg.toFixed(2)));
            historyChart && historyChart.update();

            // Seated Profile
            const temps = seatedProfile.map(p => p.temp);
            seatedChart && seatedChart.data.datasets[0].data = temps;
            const minProfileT = Math.min(...temps);
            const maxProfileT = Math.max(...temps);
            seatedChart && seatedChart.options.scales.y.min = Math.floor(Math.min(minProfileT, solver.initTemp, solver.outletTemp) - 1.0);
            seatedChart && seatedChart.options.scales.y.max = Math.ceil(Math.max(maxProfileT, solver.initTemp, solver.outletTemp) + 1.0);
            seatedChart && seatedChart.update();
        }
    }

    // 8. Main Animation Loop
    function loop() {
        if (isRunning) {
            // Solve 1 CFD Step
            solver.step();
            updateStatsAndCharts();
        }

        // Render Canvas
        renderer.render();

        animFrameId = requestAnimationFrame(loop);
    }

    // Apply default summer preset and start loop
    applyPreset('summerCooling');
    loop();
}

// Safe Initialization Guard: Run immediately if DOM is ready, otherwise listen to DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}