/**
 * Main Application Orchestrator for 2D CFD Classroom Air Conditioning Simulator
 */
document.addEventListener('DOMContentLoaded', () => {
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
    const btnPresetWinter = document.getElementById('btnPresetWinterHeating');
    const btnPresetRapid = document.getElementById('btnPresetRapidCool');

    // Slider Controls
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

    const chkParticles = document.getElementById('chkParticles');
    const chkVectors = document.getElementById('chkVectors');
    const chkDesks = document.getElementById('chkDesks');

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

    // 3. Initialize Chart.js Graphs
    const historyChartCtx = document.getElementById('chartTempHistory').getContext('2d');
    const seatedChartCtx = document.getElementById('chartSeatedProfile').getContext('2d');

    // Temperature History Line Chart
    const historyChart = new Chart(historyChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '平均室温 (°C)',
                data: [],
                borderColor: '#00f2fe',
                backgroundColor: 'rgba(0, 242, 254, 0.1)',
                borderWidth: 2,
                fill: true,
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
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });

    // Seated Height Temperature Profile Bar/Line Chart
    const seatedChart = new Chart(seatedChartCtx, {
        type: 'line',
        data: {
            labels: solver.getSeatedTemperatureProfile().map(p => `${p.x}m`),
            datasets: [{
                label: '着席高さ(y=0.8m) 温度プロファイル (°C)',
                data: solver.getSeatedTemperatureProfile().map(p => p.temp),
                borderColor: '#ff6b4a',
                backgroundColor: 'rgba(255, 107, 74, 0.15)',
                borderWidth: 2,
                fill: true,
                tension: 0.2,
                pointRadius: 2,
                pointBackgroundColor: '#ff6b4a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });

    // 4. Update UI Values from Solver State
    function syncUiFromSolver() {
        valOutletTemp.textContent = `${solver.outletTemp.toFixed(1)} °C`;
        sliderOutletTemp.value = solver.outletTemp;

        valInitTemp.textContent = `${solver.initTemp.toFixed(1)} °C`;
        sliderInitTemp.value = solver.initTemp;

        sliderFinAngle.value = solver.finAngleDeg;
        updateFinAngleBadge(solver.finAngleDeg);

        sliderSweepSpeed.value = solver.sweepSpeedSec;
        valSweepSpeed.textContent = `${solver.sweepSpeedSec} 秒`;

        selectPowerRating.value = solver.powerRating;
        selectWindowCondition.value = solver.windowCondition;
    }

    function updateFinAngleBadge(deg) {
        if (deg <= 15) {
            valFinAngle.textContent = `${deg}° (水平吹き)`;
        } else if (deg <= 50) {
            valFinAngle.textContent = `${deg}° (斜め下)`;
        } else {
            valFinAngle.textContent = `${deg}° (強下吹き)`;
        }
    }

    // 5. Preset Loader
    function applyPreset(presetKey) {
        const p = SIM_PRESETS[presetKey];
        if (!p) return;

        solver.outletTemp = p.outletTemp;
        solver.initTemp = p.initTemp;
        solver.isSweepMode = p.isSweepMode;
        solver.finAngleDeg = p.finAngleDeg;
        solver.sweepSpeedSec = p.sweepSpeedSec;
        solver.powerRating = p.powerRating;
        solver.windowCondition = p.windowCondition;

        // Reset domain with new preset temperatures
        solver.initDomain();
        renderer.initParticles();

        // Update UI Tabs
        if (p.isSweepMode) {
            btnModeSweep.classList.add('active');
            btnModeFixed.classList.remove('active');
            groupSweepParams.classList.remove('hidden');
            groupFixedAngle.classList.add('hidden');
        } else {
            btnModeFixed.classList.add('active');
            btnModeSweep.classList.remove('active');
            groupFixedAngle.classList.remove('hidden');
            groupSweepParams.classList.add('hidden');
        }

        // Highlight preset button
        [btnPresetSummer, btnPresetWinter, btnPresetRapid].forEach(b => b.classList.remove('active'));
        if (presetKey === 'summerCooling') btnPresetSummer.classList.add('active');
        if (presetKey === 'winterHeating') btnPresetWinter.classList.add('active');
        if (presetKey === 'rapidCoolSweep') btnPresetRapid.classList.add('active');

        syncUiFromSolver();
        resetCharts();
    }

    function resetCharts() {
        historyChart.data.labels = [];
        historyChart.data.datasets[0].data = [];
        historyChart.update();

        const profile = solver.getSeatedTemperatureProfile();
        seatedChart.data.labels = profile.map(p => `${p.x}m`);
        seatedChart.data.datasets[0].data = profile.map(p => p.temp);
        seatedChart.update();
    }

    // 6. Event Listeners
    // Play/Pause
    btnPlayPause.addEventListener('click', () => {
        isRunning = !isRunning;
        if (isRunning) {
            statusBadge.classList.remove('paused');
            statusText.textContent = '計算実行中';
            iconPlayPause.setAttribute('data-lucide', 'pause');
            textPlayPause.textContent = '一時停止';
        } else {
            statusBadge.classList.add('paused');
            statusText.textContent = '一時停止中';
            iconPlayPause.setAttribute('data-lucide', 'play');
            textPlayPause.textContent = '再開';
        }
        lucide.createIcons();
    });

    // Step
    btnStep.addEventListener('click', () => {
        if (!isRunning) {
            solver.step();
            renderer.render();
            updateStatsAndCharts();
        }
    });

    // Reset
    btnReset.addEventListener('click', () => {
        solver.initDomain();
        renderer.initParticles();
        resetCharts();
        renderer.render();
        updateStatsAndCharts();
    });

    // Engine Switch (CPU vs GPU)
    btnEngineCpu.addEventListener('click', () => {
        useGpuMode = false;
        btnEngineCpu.classList.add('active');
        btnEngineGpu.classList.remove('active');
        statusText.textContent = isRunning ? '計算実行中 (CPU FVM)' : '一時停止中';
    });

    btnEngineGpu.addEventListener('click', () => {
        if (!gpuSolver || !gpuSolver.isSupported) {
            alert('お使いのブラウザ/環境はWebGL GPGPU加速に対応していません。CPUモードを使用します。');
            return;
        }
        useGpuMode = true;
        btnEngineGpu.classList.add('active');
        btnEngineCpu.classList.remove('active');
        statusText.textContent = isRunning ? '計算実行中 (GPU WebGL加速)' : '一時停止中';
    });

    // Presets
    btnPresetSummer.addEventListener('click', () => applyPreset('summerCooling'));
    btnPresetWinter.addEventListener('click', () => applyPreset('winterHeating'));
    btnPresetRapid.addEventListener('click', () => applyPreset('rapidCoolSweep'));

    // Sliders
    sliderOutletTemp.addEventListener('input', (e) => {
        solver.outletTemp = parseFloat(e.target.value);
        valOutletTemp.textContent = `${solver.outletTemp.toFixed(1)} °C`;
    });

    sliderInitTemp.addEventListener('input', (e) => {
        solver.initTemp = parseFloat(e.target.value);
        valInitTemp.textContent = `${solver.initTemp.toFixed(1)} °C`;
    });

    // Fin Angle Mode
    btnModeFixed.addEventListener('click', () => {
        solver.isSweepMode = false;
        btnModeFixed.classList.add('active');
        btnModeSweep.classList.remove('active');
        groupFixedAngle.classList.remove('hidden');
        groupSweepParams.classList.add('hidden');
    });

    btnModeSweep.addEventListener('click', () => {
        solver.isSweepMode = true;
        btnModeSweep.classList.add('active');
        btnModeFixed.classList.remove('active');
        groupSweepParams.classList.remove('hidden');
        groupFixedAngle.classList.add('hidden');
    });

    sliderFinAngle.addEventListener('input', (e) => {
        solver.finAngleDeg = parseFloat(e.target.value);
        updateFinAngleBadge(solver.finAngleDeg);
    });

    sliderSweepSpeed.addEventListener('input', (e) => {
        solver.sweepSpeedSec = parseFloat(e.target.value);
        valSweepSpeed.textContent = `${solver.sweepSpeedSec} 秒`;
    });

    selectPowerRating.addEventListener('change', (e) => {
        solver.powerRating = parseFloat(e.target.value);
        // Scale outlet velocity: 1.8 HP -> 2.0 m/s, 2.3 HP -> 2.8 m/s, 3.0 HP -> 3.6 m/s
        solver.outletVel = solver.powerRating * 1.2;
    });

    selectWindowCondition.addEventListener('change', (e) => {
        solver.windowCondition = e.target.value;
    });

    selectColormap.addEventListener('change', (e) => {
        renderer.setColormap(e.target.value);
    });

    // Heatmap Physical Field Switch (Temperature vs Velocity)
    const btnFieldTemp = document.getElementById('btnFieldTemp');
    const btnFieldVel = document.getElementById('btnFieldVel');

    if (btnFieldTemp && btnFieldVel) {
        btnFieldTemp.addEventListener('click', () => {
            renderer.heatmapField = 'temp';
            renderer.updateLegendBar();
            btnFieldTemp.classList.add('active');
            btnFieldVel.classList.remove('active');
        });

        btnFieldVel.addEventListener('click', () => {
            renderer.heatmapField = 'vel';
            renderer.updateLegendBar();
            btnFieldVel.classList.add('active');
            btnFieldTemp.classList.remove('active');
        });
    }

    // Display View Mode Tabs
    const btnViewBoth = document.getElementById('btnViewBoth');
    const btnViewTemp = document.getElementById('btnViewTemp');
    const btnViewStream = document.getElementById('btnViewStream');
    const chkHeatmap = document.getElementById('chkHeatmap');

    function setViewMode(mode) {
        [btnViewBoth, btnViewTemp, btnViewStream].forEach(b => b.classList.remove('active'));

        if (mode === 'both') {
            btnViewBoth.classList.add('active');
            renderer.showHeatmap = true;
            renderer.showParticles = true;
            chkHeatmap.checked = true;
            chkParticles.checked = true;
        } else if (mode === 'temp') {
            btnViewTemp.classList.add('active');
            renderer.showHeatmap = true;
            renderer.showParticles = false;
            chkHeatmap.checked = true;
            chkParticles.checked = false;
        } else if (mode === 'stream') {
            btnViewStream.classList.add('active');
            renderer.showHeatmap = false;
            renderer.showParticles = true;
            chkHeatmap.checked = false;
            chkParticles.checked = true;
        }
    }

    btnViewBoth.addEventListener('click', () => setViewMode('both'));
    btnViewTemp.addEventListener('click', () => setViewMode('temp'));
    btnViewStream.addEventListener('click', () => setViewMode('stream'));

    // Layer Toggles
    chkHeatmap.addEventListener('change', (e) => { renderer.showHeatmap = e.target.checked; });
    chkParticles.addEventListener('change', (e) => { renderer.showParticles = e.target.checked; });
    chkVectors.addEventListener('change', (e) => { renderer.showVectors = e.target.checked; });
    chkDesks.addEventListener('change', (e) => { renderer.showDesks = e.target.checked; });

    // Interactive Probe Hover
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert canvas pixels to physical domain (m)
        const posX = (mouseX / rect.width) * solver.Lx;
        const posY = ((rect.height - mouseY) / rect.height) * solver.Ly;

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

        let statusStr = '';
        if (pmv > 1.5) statusStr = ' (暑い)';
        else if (pmv > 0.5) statusStr = ' (やや暖かい)';
        else if (pmv >= -0.5) statusStr = ' (快適)';
        else if (pmv >= -1.5) statusStr = ' (やや涼しい)';
        else statusStr = ' (寒い)';

        return (pmv >= 0 ? '+' : '') + pmv.toFixed(1) + statusStr;
    }

    btnExportCsv.addEventListener('click', () => {
        const profile = solver.getSeatedTemperatureProfile();
        let csvContent = '\uFEFF'; // UTF-8 BOM for Japanese Excel compatibility
        csvContent += '時間(s),平均室温(°C),1列目(°C),2列目(°C),3列目(°C),4列目(°C),5列目(°C),6列目(°C),7列目(°C)\n';

        const historyLen = historyChart.data.labels.length;
        for (let k = 0; k < historyLen; k++) {
            const timeStr = historyChart.data.labels[k];
            const avgTemp = historyChart.data.datasets[0].data[k];
            const rowVals = profile.slice(0, 7).map(p => p.temp).join(',');
            csvContent += `${timeStr},${avgTemp},${rowVals}\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CFD_Classroom_Report_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });

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
            statPmv.textContent = calculatePMV(avgSeatedTemp, 0.2);
        }

        stepCounter.textContent = solver.stepCount;
        simTime.textContent = `${solver.time.toFixed(1)}s`;

        // Update Charts every 20 steps
        if (solver.stepCount % 20 === 0) {
            // Temperature History
            if (historyChart.data.labels.length > 50) {
                historyChart.data.labels.shift();
                historyChart.data.datasets[0].data.shift();
            }
            historyChart.data.labels.push(`${solver.time.toFixed(0)}s`);
            historyChart.data.datasets[0].data.push(parseFloat(stats.avg.toFixed(2)));
            historyChart.update();

            // Seated Profile
            seatedChart.data.datasets[0].data = seatedProfile.map(p => p.temp);
            seatedChart.update();
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
});
