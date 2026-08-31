/**
 * Suspension & Vibration Dynamics App Controller
 * 実機サスペンション設計、レバー比、フォークト／マックスウェル応力緩和制御
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new SuspensionEngine();
  const visualizer = new SuspensionVisualizer('suspensionCanvas');

  // UI要素
  const selectSuspensionType = document.getElementById('selectSuspensionType');
  const inputLeverRatio = document.getElementById('inputLeverRatio');
  const valLeverRatio = document.getElementById('valLeverRatio');
  const inputKs = document.getElementById('inputKs');
  const valKs = document.getElementById('valKs');
  const inputCs = document.getElementById('inputCs');
  const valCs = document.getElementById('valCs');

  const radioModelTypes = document.getElementsByName('modelType');
  const maxwellParamsArea = document.getElementById('maxwellParamsArea');
  const inputG = document.getElementById('inputG');
  const valG = document.getElementById('valG');
  const inputEta = document.getElementById('inputEta');
  const valEta = document.getElementById('valEta');

  const selectRoad = document.getElementById('selectRoad');
  const inputSpeed = document.getElementById('inputSpeed');
  const valSpeed = document.getElementById('valSpeed');

  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');
  const radioSimSpeeds = document.getElementsByName('simSpeed');
  const scienceFactText = document.getElementById('scienceFactText');

  // 診断表示要素
  const diag_kw = document.getElementById('diag_kw');
  const diag_fn1 = document.getElementById('diag_fn1');
  const diag_zeta = document.getElementById('diag_zeta');
  const diag_tau = document.getElementById('diag_tau');
  const diag_comfort = document.getElementById('diag_comfort');
  const diag_rms = document.getElementById('diag_rms');

  // ─── 1. サスペンション形式切替 ───
  selectSuspensionType.addEventListener('change', (e) => {
    const typeId = e.target.value;
    engine.applySuspensionType(typeId);
    syncUIWithEngine();
  });

  function syncUIWithEngine() {
    const isStrut = (engine.currentSuspensionTypeId === 'strut');
    
    if (isStrut) {
      engine.leverRatio = 1.00;
    }
    
    inputLeverRatio.value = engine.leverRatio;
    inputLeverRatio.disabled = isStrut;
    inputLeverRatio.style.opacity = isStrut ? '0.45' : '1.0';
    inputLeverRatio.style.cursor = isStrut ? 'not-allowed' : 'pointer';

    valLeverRatio.textContent = isStrut ? '1.00 (固定)' : engine.leverRatio.toFixed(2);

    const ksNmm = engine.ks_installed / 1000.0;
    inputKs.value = engine.ks_installed;
    valKs.textContent = `${ksNmm.toFixed(1)} N/mm (${engine.ks_installed.toLocaleString()} N/m)`;

    inputCs.value = engine.cs_installed;
    valCs.textContent = `${engine.cs_installed.toLocaleString()} N・s/m`;

    inputG.value = engine.maxwellG;
    valG.textContent = `${engine.maxwellG.toLocaleString()} N/m`;

    inputEta.value = engine.maxwellEta;
    valEta.textContent = `${engine.maxwellEta.toLocaleString()} N・s/m`;

    inputSpeed.value = engine.vehicleSpeed;
    valSpeed.textContent = `${engine.vehicleSpeed} km/h`;

    for (const r of radioModelTypes) {
      r.checked = (r.value === engine.modelType);
    }

    maxwellParamsArea.style.display = (engine.modelType === 'maxwell') ? 'block' : 'none';
    updateScienceFact();
  }

  // ─── 2. レバー比スライダー ───
  inputLeverRatio.addEventListener('input', (e) => {
    if (engine.currentSuspensionTypeId === 'strut') {
      engine.leverRatio = 1.00;
      e.target.value = 1.00;
      valLeverRatio.textContent = '1.00 (固定)';
      return;
    }
    engine.leverRatio = parseFloat(e.target.value);
    valLeverRatio.textContent = engine.leverRatio.toFixed(2);
    engine.calculateWheelRatesAndModals();
  });

  // ─── 3. スプリング＆ダンパー ───
  inputKs.addEventListener('input', (e) => {
    engine.ks_installed = parseFloat(e.target.value);
    const ksNmm = engine.ks_installed / 1000.0;
    valKs.textContent = `${ksNmm.toFixed(1)} N/mm (${engine.ks_installed.toLocaleString()} N/m)`;
    engine.calculateWheelRatesAndModals();
  });

  inputCs.addEventListener('input', (e) => {
    engine.cs_installed = parseFloat(e.target.value);
    valCs.textContent = `${engine.cs_installed.toLocaleString()} N・s/m`;
    engine.calculateWheelRatesAndModals();
  });

  // ─── 4. 粘弾性モデル切替 (フォークト vs マックスウェル) ───
  for (const r of radioModelTypes) {
    r.addEventListener('change', (e) => {
      engine.modelType = e.target.value;
      maxwellParamsArea.style.display = (engine.modelType === 'maxwell') ? 'block' : 'none';
      engine.reset();
      updateScienceFact();
    });
  }

  inputG.addEventListener('input', (e) => {
    engine.maxwellG = parseFloat(e.target.value);
    valG.textContent = `${engine.maxwellG.toLocaleString()} N/m`;
    engine.calculateWheelRatesAndModals();
  });

  inputEta.addEventListener('input', (e) => {
    engine.maxwellEta = parseFloat(e.target.value);
    valEta.textContent = `${engine.maxwellEta.toLocaleString()} N・s/m`;
    engine.calculateWheelRatesAndModals();
  });

  // ─── 5. 路面＆速度 ───
  selectRoad.addEventListener('change', (e) => {
    engine.roadType = e.target.value;
    engine.reset();
    updateScienceFact();
  });

  inputSpeed.addEventListener('input', (e) => {
    engine.vehicleSpeed = parseFloat(e.target.value);
    valSpeed.textContent = `${engine.vehicleSpeed} km/h`;
  });

  // ─── 6. アクション ───
  btnPause.addEventListener('click', () => {
    engine.paused = !engine.paused;
    btnPause.textContent = engine.paused ? '▶ 再開' : '⏸ 一時停止';
  });

  btnReset.addEventListener('click', () => {
    engine.reset();
  });

  for (const r of radioSimSpeeds) {
    r.addEventListener('change', (e) => {
      engine.simSpeed = parseFloat(e.target.value);
    });
  }

  function updateScienceFact() {
    if (engine.modelType === 'voigt') {
      scienceFactText.innerHTML = `
        <strong>【フォークトモデル（並列: σ = σ1 + σ2）】</strong> スプリング（G）とダンパー（η）が並列に作用する標準サスペンションのモデルです。路面変位に対して即座に復元力と減衰力が発生し、定常車高を維持しつつ振動エネルギーを熱へと散逸させます。
      `;
    } else {
      scienceFactText.innerHTML = `
        <strong>【マックスウェルモデル（直列: γ = γ1 + γ2）】</strong> スプリング（G）とダッシュポット（η）が直列に結合された応力緩和モデルです。一定変形を与えた際、応力が時間とともに <strong>σ(t) = σ₀ · exp(-t/τ)</strong>（緩和時間 τ = η/G = ${engine.evaluation.relaxationTimeTau.toFixed(3)}s）で減衰し、マウントゴムや液体封入ブッシュが高周波振動を逃がす仕組みを表現します。
      `;
    }
  }

  // ─── 7. アニメーションループ ───
  let lastTime = performance.now();

  function animate(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    engine.update(dt);
    visualizer.draw(engine);
    updateDiagnosisCards(engine);

    requestAnimationFrame(animate);
  }

  function updateDiagnosisCards(eng) {
    const ev = eng.evaluation;
    diag_kw.textContent = `${ev.wheelRateKwNmm.toFixed(1)} N/mm`;
    diag_fn1.textContent = `${ev.naturalFreq1.toFixed(2)} Hz`;
    diag_zeta.textContent = `${ev.dampingRatio.toFixed(2)} (${ev.dampingRatio < 1 ? '不足減衰' : '過減衰'})`;
    diag_tau.textContent = (eng.modelType === 'maxwell')
      ? `緩和時間 τ = η/G: ${ev.relaxationTimeTau.toFixed(3)} s`
      : `並列等価減衰 Cw: ${ev.wheelDampingCw.toFixed(0)} N・s/m`;
    diag_comfort.textContent = `${ev.comfortScore} 点 (${ev.comfortGrade.split(' ')[0]})`;
    diag_rms.textContent = `上下加速度 RMS: ${ev.accRms.toFixed(2)} m/s²`;
  }

  syncUIWithEngine();
  requestAnimationFrame(animate);
});
