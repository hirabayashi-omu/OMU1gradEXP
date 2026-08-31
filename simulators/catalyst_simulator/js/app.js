/**
 * Three-Way Catalyst App Main Controller
 * UIイベント・診断カード更新・メインアニメーションループ
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new CatalystEngine();
  const visualizer = new CatalystVisualizer('catalystCanvas', engine);

  // ─── UI要素参照 ───
  const btnModeAuto = document.getElementById('btn-mode-auto');
  const btnModeManual = document.getElementById('btn-mode-manual');
  const btnModeFail = document.getElementById('btn-mode-fail');

  const sliderAF = document.getElementById('slider-af');
  const valAF = document.getElementById('val-af');
  const groupManualAF = document.getElementById('group-manual-af');

  const sliderRpm = document.getElementById('slider-rpm');
  const valRpm = document.getElementById('val-rpm');

  const sliderThrottle = document.getElementById('slider-throttle');
  const valThrottle = document.getElementById('val-throttle');

  const sliderEGR = document.getElementById('slider-egr');
  const valEGR = document.getElementById('val-egr');

  const sliderCatTemp = document.getElementById('slider-cat-temp');
  const valCatTemp = document.getElementById('val-cat-temp');

  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');

  // 診断カード要素
  const cardAF = document.getElementById('diag-af-val');
  const cardLambda = document.getElementById('diag-lambda-val');
  const cardO2 = document.getElementById('diag-o2-val');
  const cardO2Status = document.getElementById('diag-o2-status');
  const cardPurifAvg = document.getElementById('diag-purif-avg');
  const cardNoxPurif = document.getElementById('diag-nox-purif');
  const cardCoPurif = document.getElementById('diag-co-purif');
  const cardHcPurif = document.getElementById('diag-hc-purif');
  const cardNoxOut = document.getElementById('diag-nox-out');
  const cardCoOut = document.getElementById('diag-co-out');
  const cardHcOut = document.getElementById('diag-hc-out');

  // ─── 制御モード切替 ───
  function setMode(mode) {
    engine.controlMode = mode;
    btnModeAuto.classList.remove('active');
    btnModeManual.classList.remove('active');
    btnModeFail.classList.remove('active');

    if (mode === 'auto_closed_loop') {
      btnModeAuto.classList.add('active');
      groupManualAF.style.opacity = '0.4';
      sliderAF.disabled = true;
    } else if (mode === 'manual_af') {
      btnModeManual.classList.add('active');
      groupManualAF.style.opacity = '1.0';
      sliderAF.disabled = false;
      engine.targetAF = parseFloat(sliderAF.value);
    } else if (mode === 'failed_sensor') {
      btnModeFail.classList.add('active');
      groupManualAF.style.opacity = '1.0';
      sliderAF.disabled = false;
      engine.targetAF = parseFloat(sliderAF.value);
    }
  }

  btnModeAuto.addEventListener('click', () => setMode('auto_closed_loop'));
  btnModeManual.addEventListener('click', () => setMode('manual_af'));
  btnModeFail.addEventListener('click', () => setMode('failed_sensor'));

  // ─── スライダーイベント ───
  sliderAF.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valAF.textContent = val.toFixed(2);
    engine.targetAF = val;
  });

  sliderRpm.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valRpm.textContent = `${val} RPM`;
    engine.engineRpm = val;
  });

  sliderThrottle.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valThrottle.textContent = `${val} %`;
    engine.throttleOpen = val;
  });

  sliderEGR.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valEGR.textContent = `${val} %`;
    engine.egrRate = val;
  });

  sliderCatTemp.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valCatTemp.textContent = `${val} ℃`;
    engine.catalystTemp = val;
  });

  // ─── 再生・停止・リセット ───
  btnStart.addEventListener('click', () => {
    engine.running = true;
    engine.paused = false;
  });

  btnPause.addEventListener('click', () => {
    engine.paused = true;
  });

  btnReset.addEventListener('click', () => {
    engine.reset();
    setMode('auto_closed_loop');
    sliderAF.value = 14.70;
    valAF.textContent = '14.70';
    sliderRpm.value = 2000;
    valRpm.textContent = '2000 RPM';
    sliderThrottle.value = 30;
    valThrottle.textContent = '30 %';
    sliderEGR.value = 0;
    valEGR.textContent = '0 %';
    sliderCatTemp.value = 450;
    valCatTemp.textContent = '450 ℃';
  });

  // ─── 基礎理論モーダル ───
  const theoryModal = document.getElementById('theory-modal');
  const btnOpenTheory = document.getElementById('btn-open-theory');
  const btnCloseTheory = document.getElementById('btn-close-theory');

  if (btnOpenTheory && theoryModal) {
    btnOpenTheory.addEventListener('click', () => {
      theoryModal.style.display = 'flex';
    });
  }
  if (btnCloseTheory && theoryModal) {
    btnCloseTheory.addEventListener('click', () => {
      theoryModal.style.display = 'none';
    });
  }
  if (theoryModal) {
    theoryModal.addEventListener('click', (e) => {
      if (e.target === theoryModal) {
        theoryModal.style.display = 'none';
      }
    });
  }

  // ─── 診断カードHUD更新 ───
  function updateDiagnosticCards() {
    // A/F & λ
    if (cardAF) cardAF.textContent = engine.actualAF.toFixed(2);
    if (cardLambda) cardLambda.textContent = `λ = ${engine.lambda.toFixed(3)}`;

    if (cardAF) {
      if (Math.abs(engine.actualAF - 14.70) <= 0.15) {
        cardAF.style.color = '#10b981'; // ストイキ（緑）
      } else if (engine.actualAF < 14.70) {
        cardAF.style.color = '#ef4444'; // リッチ（赤）
      } else {
        cardAF.style.color = '#38bdf8'; // リーン（青）
      }
    }

    // O2センサ
    if (cardO2) cardO2.textContent = `${engine.o2SensorVoltage.toFixed(2)} V`;
    if (cardO2Status && cardO2) {
      if (engine.o2SensorVoltage > 0.60) {
        cardO2Status.textContent = 'リッチ状態 (起電力高)';
        cardO2.style.color = '#ef4444';
      } else if (engine.o2SensorVoltage < 0.30) {
        cardO2Status.textContent = 'リーン状態 (起電力低)';
        cardO2.style.color = '#38bdf8';
      } else {
        cardO2Status.textContent = 'ストイキオメトリ (目標)';
        cardO2.style.color = '#10b981';
      }
    }

    // 触媒総合浄化率
    if (cardPurifAvg) cardPurifAvg.textContent = `${engine.purificationRates.avg.toFixed(1)}%`;
    if (cardNoxPurif) cardNoxPurif.textContent = `NOx: ${engine.purificationRates.nox.toFixed(1)}%`;
    if (cardCoPurif) cardCoPurif.textContent = `CO: ${engine.purificationRates.co.toFixed(1)}%`;
    if (cardHcPurif) cardHcPurif.textContent = `HC: ${engine.purificationRates.hc.toFixed(1)}%`;

    // 排出ガス濃度
    if (cardNoxOut) cardNoxOut.textContent = `NOx: ${engine.tailGas.nox.toFixed(1)} ppm (元: ${engine.rawGas.nox.toFixed(0)})`;
    if (cardCoOut) cardCoOut.textContent = `CO: ${engine.tailGas.co.toFixed(3)} % (元: ${engine.rawGas.co.toFixed(2)})`;
    if (cardHcOut) cardHcOut.textContent = `HC: ${engine.tailGas.hc.toFixed(1)} ppm (元: ${engine.rawGas.hc.toFixed(0)})`;
  }

  // ─── メインアニメーションループ ───
  let lastTime = performance.now();

  function loop(currentTime) {
    const dt = (currentTime - lastTime) / 1000.0;
    lastTime = currentTime;

    engine.update(dt);
    visualizer.render(dt);
    updateDiagnosticCards();

    requestAnimationFrame(loop);
  }

  // 初期化
  setMode('auto_closed_loop');
  requestAnimationFrame(loop);
});
