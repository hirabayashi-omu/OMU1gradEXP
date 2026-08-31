/**
 * Unidirectional Needle & Food Compression Simulator App Controller
 * 化粧品・食品 一方向単調圧縮（ニードル針入度・食品圧縮）コントローラー
 */

document.addEventListener('DOMContentLoaded', () => {
  const matEngine = new MaterialEngine();

  const visualizerNeedle = new NeedleVisualizer('needleCanvas');
  const visualizerFood = new FoodCompressionVisualizer('foodCanvas');
  const visualizerTest = new MaterialTestVisualizer('testCanvas');

  // タブ切替 (3モード)
  let currentMode = 'needle'; // 初期タブ
  const tabNeedle = document.getElementById('tabNeedle');
  const tabFood = document.getElementById('tabFood');
  const tabTest = document.getElementById('tabTest');

  const panelNeedle = document.getElementById('panelNeedle');
  const panelFood = document.getElementById('panelFood');
  const panelTest = document.getElementById('panelTest');

  const wrapperNeedle = document.getElementById('wrapperNeedle');
  const wrapperFood = document.getElementById('wrapperFood');
  const wrapperTest = document.getElementById('wrapperTest');

  function switchTab(mode) {
    currentMode = mode;
    [tabNeedle, tabFood, tabTest].forEach(t => t.classList.remove('active'));
    [panelNeedle, panelFood, panelTest].forEach(p => p.style.display = 'none');
    [wrapperNeedle, wrapperFood, wrapperTest].forEach(w => w.style.display = 'none');

    if (mode === 'needle') {
      tabNeedle.classList.add('active');
      panelNeedle.style.display = 'flex';
      wrapperNeedle.style.display = 'flex';
      if (matEngine.currentMaterial.category !== 'needle_test') {
        selectMaterial.value = 'cosmetic_lipstick';
        matEngine.setMaterial('cosmetic_lipstick');
      }
    } else if (mode === 'food') {
      tabFood.classList.add('active');
      panelFood.style.display = 'flex';
      wrapperFood.style.display = 'flex';
      if (!matEngine.currentMaterial.id.startsWith('food_')) {
        selectMaterial.value = 'food_cheese';
        matEngine.setMaterial('food_cheese');
      }
    } else {
      tabTest.classList.add('active');
      panelTest.style.display = 'flex';
      wrapperTest.style.display = 'flex';
      if (matEngine.currentMaterial.category !== 'soft_matter' && matEngine.currentMaterial.category !== 'metal') {
        selectMaterial.value = 'rubber_nr';
        matEngine.setMaterial('rubber_nr');
      }
    }
    updateMaterialNotes();
    updateHUD();
  }

  tabNeedle.addEventListener('click', () => switchTab('needle'));
  tabFood.addEventListener('click', () => switchTab('food'));
  tabTest.addEventListener('click', () => switchTab('test'));

  // ─── 共通: サンプル選択 ───
  const selectMaterial = document.getElementById('selectMaterial');
  selectMaterial.addEventListener('change', (e) => {
    matEngine.setMaterial(e.target.value);
    const id = matEngine.currentMaterial.id;
    if (id.startsWith('cosmetic_') && currentMode !== 'needle') switchTab('needle');
    else if (id.startsWith('food_') && currentMode !== 'food' && currentMode !== 'needle') switchTab('food');
    else if ((id === 'rubber_nr' || id === 'hydrogel' || id === 's45c') && currentMode !== 'test') switchTab('test');

    updateMaterialNotes();
    updateHUD();
  });

  // ─── モジュール1: ニードルプローブ 一方向針入コントロール ───
  const selectProbeType = document.getElementById('selectProbeType');
  const btnStartNeedle = document.getElementById('btnStartNeedle');
  const btnResetNeedle = document.getElementById('btnResetNeedle');
  const inputNeedleMaxDepth = document.getElementById('inputNeedleMaxDepth');
  const valNeedleMaxDepth = document.getElementById('valNeedleMaxDepth');
  const inputManualDepth = document.getElementById('inputManualDepth');
  const valManualDepth = document.getElementById('valManualDepth');

  selectProbeType.addEventListener('change', (e) => {
    matEngine.setProbeType(e.target.value);
    updateHUD();
  });

  btnStartNeedle.addEventListener('click', () => {
    matEngine.resetNeedleTest();
    matEngine.needleIsRunning = true;
  });

  btnResetNeedle.addEventListener('click', () => {
    matEngine.resetNeedleTest();
    inputManualDepth.value = 0;
    valManualDepth.textContent = '0.0 mm';
    updateHUD();
  });

  inputNeedleMaxDepth.addEventListener('input', (e) => {
    matEngine.needleMaxDepth = parseFloat(e.target.value);
    valNeedleMaxDepth.textContent = `${e.target.value} mm`;
  });

  inputManualDepth.addEventListener('input', (e) => {
    matEngine.needleIsRunning = false;
    matEngine.needleDepth = parseFloat(e.target.value);
    matEngine.calculateNeedleState();
    valManualDepth.textContent = `${e.target.value} mm`;
    updateHUD();
  });

  // ─── モジュール2: 食品 一方向単調圧縮コントロール ───
  const btnStartFood = document.getElementById('btnStartFood');
  const btnResetFood = document.getElementById('btnResetFood');

  btnStartFood.addEventListener('click', () => {
    matEngine.resetFoodCompTest();
    matEngine.foodIsRunning = true;
  });

  btnResetFood.addEventListener('click', () => {
    matEngine.resetFoodCompTest();
    updateHUD();
  });

  // ─── モジュール3: 万能引張・圧縮コントロール ───
  const radioTestModes = document.getElementsByName('testMode');
  const btnStartTest = document.getElementById('btnStartTest');
  const btnPauseTest = document.getElementById('btnPauseTest');
  const btnResetTest = document.getElementById('btnResetTest');
  const inputManualStrain = document.getElementById('inputManualStrain');
  const valManualStrain = document.getElementById('valManualStrain');

  radioTestModes.forEach(radio => {
    radio.addEventListener('change', (e) => {
      matEngine.testMode = e.target.value;
      matEngine.resetUniversalTest();
      updateHUD();
    });
  });

  btnStartTest.addEventListener('click', () => { matEngine.isRunning = true; });
  btnPauseTest.addEventListener('click', () => { matEngine.isRunning = false; });
  btnResetTest.addEventListener('click', () => {
    matEngine.resetUniversalTest();
    inputManualStrain.value = 0;
    valManualStrain.textContent = '0.0 %';
    updateHUD();
  });

  inputManualStrain.addEventListener('input', (e) => {
    matEngine.isRunning = false;
    matEngine.currentStrain = (parseFloat(e.target.value) / 100.0);
    matEngine.stepUniversalTest();
    valManualStrain.textContent = `${e.target.value} %`;
    updateHUD();
  });

  // ─── HUD＆注記更新 ───
  const hud1_lbl = document.getElementById('hud1_lbl');
  const hud1_val = document.getElementById('hud1_val');
  const hud2_lbl = document.getElementById('hud2_lbl');
  const hud2_val = document.getElementById('hud2_val');
  const hud3_lbl = document.getElementById('hud3_lbl');
  const hud3_val = document.getElementById('hud3_val');
  const hud4_lbl = document.getElementById('hud4_lbl');
  const hud4_val = document.getElementById('hud4_val');
  const hud5_lbl = document.getElementById('hud5_lbl');
  const hud5_val = document.getElementById('hud5_val');
  const hud6_lbl = document.getElementById('hud6_lbl');
  const hud6_val = document.getElementById('hud6_val');

  const materialDescText = document.getElementById('materialDescText');

  function updateMaterialNotes() {
    const mat = matEngine.currentMaterial;
    materialDescText.innerHTML = `<strong>${mat.name}:</strong> ${mat.desc}<br>` +
      `弾性率 <code>E = ${mat.E} MPa</code>, 降伏応力 <code>σy = ${mat.yieldStressMPa || mat.sigma_y || 0.5} MPa</code>, 最大硬度 <code>${mat.hardnessN || mat.compressiveStrengthMPa || 3.0} N/MPa</code>`;
  }

  function updateHUD() {
    const mat = matEngine.currentMaterial;

    if (currentMode === 'needle') {
      hud1_lbl.textContent = '侵入深さ';
      hud1_val.textContent = `${matEngine.needleDepth.toFixed(2)} mm`;
      hud1_val.style.color = '#38bdf8';

      hud2_lbl.textContent = '針入度';
      hud2_val.textContent = `${(matEngine.needleDepth * 10).toFixed(0)} (0.1mm)`;
      hud2_val.style.color = '#ffd700';

      hud3_lbl.textContent = '応力 (σ)';
      hud3_val.textContent = `${matEngine.needleCompStress.toFixed(2)} MPa`;
      hud3_val.style.color = '#ec4899';

      hud4_lbl.textContent = '荷重 (F)';
      hud4_val.textContent = `${matEngine.needleCurrentForce.toFixed(2)} N`;
      hud4_val.style.color = '#f59e0b';

      hud5_lbl.textContent = '降伏応力';
      hud5_val.textContent = `${(mat.yieldStressMPa || 0.35).toFixed(2)} MPa`;
      hud5_val.style.color = '#10b981';

      hud6_lbl.textContent = '状態';
      hud6_val.textContent = matEngine.needleIsRunning ? '⚡ 測定中 (↓)' : (matEngine.needleDepth > 0 ? '✅ 完了' : '🟢 待機中');
      hud6_val.style.color = matEngine.needleIsRunning ? '#f59e0b' : '#10b981';

    } else if (currentMode === 'food') {
      hud1_lbl.textContent = '弾性率 (E)';
      hud1_val.textContent = `${mat.E.toFixed(1)} MPa`;
      hud1_val.style.color = '#38bdf8';

      hud2_lbl.textContent = '降伏応力';
      hud2_val.textContent = `${(mat.yieldStressMPa || 0.3).toFixed(2)} MPa`;
      hud2_val.style.color = '#ffd700';

      hud3_lbl.textContent = '応力 (σ)';
      hud3_val.textContent = `${matEngine.foodCompStress.toFixed(2)} MPa`;
      hud3_val.style.color = '#ec4899';

      hud4_lbl.textContent = '荷重 (F)';
      hud4_val.textContent = `${matEngine.foodCompForce.toFixed(2)} N`;
      hud4_val.style.color = '#f59e0b';

      hud5_lbl.textContent = 'ひずみ (ε)';
      hud5_val.textContent = `${matEngine.foodCompStrain.toFixed(1)} %`;
      hud5_val.style.color = '#10b981';

      hud6_lbl.textContent = '状態';
      hud6_val.textContent = matEngine.foodIsRunning ? '⚡ 圧縮中 (↓)' : (matEngine.foodCompDepth > 0 ? '✅ 完了' : '🟢 待機中');
      hud6_val.style.color = matEngine.foodIsRunning ? '#f59e0b' : '#10b981';

    } else {
      hud1_lbl.textContent = '弾性率 (E)';
      hud1_val.textContent = `${mat.E} MPa`;
      hud1_val.style.color = '#38bdf8';

      hud2_lbl.textContent = '降伏強度';
      hud2_val.textContent = `${mat.sigma_y || mat.yieldStressMPa || 1.0} MPa`;
      hud2_val.style.color = '#ffd700';

      hud3_lbl.textContent = '応力 (σ)';
      hud3_val.textContent = `${matEngine.currentStress.toFixed(2)} MPa`;
      hud3_val.style.color = '#ec4899';

      hud4_lbl.textContent = '荷重 (F)';
      hud4_val.textContent = `${matEngine.currentForce.toFixed(2)} kN`;
      hud4_val.style.color = '#f59e0b';

      hud5_lbl.textContent = 'ひずみ (ε)';
      hud5_val.textContent = `${(matEngine.currentStrain * 100).toFixed(1)} %`;
      hud5_val.style.color = '#10b981';

      hud6_lbl.textContent = '状態';
      const isTensile = (matEngine.testMode === 'tensile');
      if (matEngine.isFractured) {
        hud6_val.textContent = '💥 破断';
        hud6_val.style.color = '#ef4444';
      } else if (matEngine.isRunning) {
        hud6_val.textContent = isTensile ? '⚡ 引張中 (↑)' : '⚡ 圧縮中 (↓)';
        hud6_val.style.color = '#f59e0b';
      } else {
        hud6_val.textContent = '🟢 待機中';
        hud6_val.style.color = '#10b981';
      }
    }
  }

  // メインループ
  function animate() {
    matEngine.stepUniversalTest();

    if (currentMode === 'needle') {
      visualizerNeedle.draw(matEngine);
      if (matEngine.needleIsRunning) {
        inputManualDepth.value = matEngine.needleDepth.toFixed(1);
        valManualDepth.textContent = `${inputManualDepth.value} mm`;
      }
    } else if (currentMode === 'food') {
      visualizerFood.draw(matEngine);
    } else {
      visualizerTest.draw(matEngine);
    }

    updateHUD();
    requestAnimationFrame(animate);
  }

  switchTab('needle');
  animate();
});
