/**
 * DIY Cosmetics & Daily Care Formulation App Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new FormulationEngine();
  const visualizer = new FormulationVisualizer('processCanvas');
  visualizer.resize();

  // UI参照
  const selectProduct = document.getElementById('selectProduct');
  const inputProductName = document.getElementById('inputProductName');
  const materialsContainer = document.getElementById('materialsContainer');
  const inputTemp = document.getElementById('inputTemp');
  const inputStir = document.getElementById('inputStir');
  const valTemp = document.getElementById('valTemp');
  const valStir = document.getElementById('valStir');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');
  const speedRadios = document.querySelectorAll('input[name="simSpeed"]');

  const resultModal = document.getElementById('resultModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnMakeAgain = document.getElementById('btnMakeAgain');

  // 初期描画
  renderMaterialsList();
  updateUI();

  // イベント
  selectProduct.addEventListener('change', (e) => {
    engine.setProduct(e.target.value);
    inputProductName.value = engine.productName;
    inputTemp.value = engine.targetTemp;
    inputStir.value = engine.targetStir;
    valTemp.textContent = `${engine.targetTemp}℃`;
    valStir.textContent = `${engine.targetStir}rpm`;
    renderMaterialsList();
    updateUI();
  });

  inputProductName.addEventListener('input', (e) => {
    engine.productName = e.target.value;
  });

  inputTemp.addEventListener('input', (e) => {
    engine.targetTemp = parseFloat(e.target.value);
    valTemp.textContent = `${engine.targetTemp}℃`;
  });

  inputStir.addEventListener('input', (e) => {
    engine.targetStir = parseFloat(e.target.value);
    valStir.textContent = `${engine.targetStir}rpm`;
  });

  btnStart.addEventListener('click', () => {
    engine.start();
    updateButtons();
  });

  btnPause.addEventListener('click', () => {
    if (engine.paused) engine.resume();
    else engine.pause();
    updateButtons();
  });

  btnReset.addEventListener('click', () => {
    engine.reset();
    updateButtons();
    updateUI();
  });

  speedRadios.forEach(r => {
    r.addEventListener('change', (e) => {
      engine.simSpeed = parseFloat(e.target.value);
    });
  });

  btnCloseModal.addEventListener('click', () => {
    resultModal.style.display = 'none';
  });

  btnMakeAgain.addEventListener('click', () => {
    resultModal.style.display = 'none';
    engine.reset();
    updateButtons();
    updateUI();
  });

  window.addEventListener('resize', () => {
    visualizer.resize();
  });

  // メインループ
  let lastTime = performance.now();
  let hasShownModalForBatch = false;

  function loop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (dt > 0 && dt < 0.1) {
      engine.update(dt);
    }

    visualizer.draw(engine);
    updateUI();

    // 完成時モーダル表示
    if (engine.stages.packaging.status === 'COMPLETED' && !hasShownModalForBatch) {
      hasShownModalForBatch = true;
      showResultCard();
    } else if (engine.stages.packaging.status !== 'COMPLETED') {
      hasShownModalForBatch = false;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function renderMaterialsList() {
    const p = engine.getCurrentProduct();
    materialsContainer.innerHTML = p.materials.map(m => {
      const currentVal = engine.customFormula[m.id] !== undefined ? engine.customFormula[m.id] : m.defaultRatio;
      return `
        <div class="material-slider-row">
          <div class="mat-label-area">
            <span class="mat-name">${m.name}</span>
            <span class="mat-desc">${m.desc}</span>
          </div>
          <div class="mat-control-area">
            <input type="range" min="${m.min}" max="${m.max}" value="${currentVal}" step="1" data-mat="${m.id}" class="mat-slider">
            <span class="mat-val" id="val_${m.id}">${currentVal}%</span>
          </div>
        </div>
      `;
    }).join('');

    materialsContainer.querySelectorAll('.mat-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const matId = e.target.dataset.mat;
        const val = e.target.value;
        document.getElementById(`val_${matId}`).textContent = `${val}%`;
        engine.setMaterialRatio(matId, val);
      });
    });

    // 科学ワンポイント解説の更新
    document.getElementById('scienceFactBox').innerHTML = `
      <div class="science-badge">💡 なぜ？がわかる科学のポイント</div>
      <p class="science-text">${p.scienceFact}</p>
    `;
  }

  function updateUI() {
    const s1 = engine.stages.weighing;
    const s2 = engine.stages.blending;
    const s3 = engine.stages.filtration;
    const s4 = engine.stages.bottling;
    const s5 = engine.stages.packaging;

    document.getElementById('bar_s1').style.width = `${s1.progress}%`;
    document.getElementById('bar_s2').style.width = `${s2.progress}%`;
    document.getElementById('bar_s3').style.width = `${s3.progress}%`;
    document.getElementById('bar_s4').style.width = `${s4.progress}%`;
    document.getElementById('bar_s5').style.width = `${s5.progress}%`;

    document.getElementById('stat_s1').textContent = s1.status === 'COMPLETED' ? '完了 ✔' : s1.status === 'RUNNING' ? '計量中...' : '待機中';
    document.getElementById('stat_s2').textContent = s2.status === 'COMPLETED' ? '溶解完了 ✔' : s2.status === 'RUNNING' ? `${s2.temp.toFixed(0)}℃ / ${Math.round(s2.stirSpeed)}rpm` : '待機中';
    document.getElementById('stat_s3').textContent = s3.status === 'COMPLETED' ? 'なめらか仕上げ ✔' : s3.status === 'RUNNING' ? 'ろ過中...' : '待機中';
    document.getElementById('stat_s4').textContent = s4.status === 'COMPLETED' ? `${s4.targetUnits}本完了 ✔` : s4.status === 'RUNNING' ? `${Math.floor(s4.unitsFilled)}/${s4.targetUnits}本` : '待機中';
    document.getElementById('stat_s5').textContent = s5.status === 'COMPLETED' ? '完成！🎉' : s5.status === 'RUNNING' ? '箱詰め中...' : '待機中';
  }

  function updateButtons() {
    btnStart.disabled = engine.running && !engine.paused;
    btnPause.disabled = !engine.running;
    btnPause.textContent = engine.paused ? '▶ 再開' : '⏸ 一時停止';
  }

  function showResultCard() {
    const ev = engine.evaluation;
    const p = engine.getCurrentProduct();
    const modalBody = document.getElementById('resultModalBody');

    modalBody.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <span class="result-badge">✨ できたてオリジナルコスメ ✨</span>
          <h2>${engine.productName}</h2>
          <p class="result-sub">${p.category} | ${p.containerName}</p>
        </div>

        <div class="result-title-box">
          <div class="result-eval-title">${ev.overallTitle}</div>
          <p class="result-texture-tag">テクスチャー: <strong>${ev.textureDescription}</strong></p>
        </div>

        <div class="result-scores-grid">
          <div class="score-card">
            <div class="score-label">💧 うるおい感</div>
            <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${ev.moistureScore}%; background: #38bdf8;"></div></div>
            <div class="score-num">${ev.moistureScore} 点</div>
          </div>
          ${ev.foamScore > 0 ? `
          <div class="score-card">
            <div class="score-label">🫧 泡立ち度</div>
            <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${ev.foamScore}%; background: #34d399;"></div></div>
            <div class="score-num">${ev.foamScore} 点</div>
          </div>` : ''}
          <div class="score-card">
            <div class="score-label">🌸 香りの良さ</div>
            <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${ev.scentScore}%; background: #f472b6;"></div></div>
            <div class="score-num">${ev.scentScore} 点</div>
          </div>
          <div class="score-card">
            <div class="score-label">✨ 肌なじみ・使いやすさ</div>
            <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${ev.textureScore}%; background: #fbbf24;"></div></div>
            <div class="score-num">${ev.textureScore} 点</div>
          </div>
        </div>

        <div class="formula-summary">
          <strong>【あなたの特製ブレンド比率】</strong>
          <ul>
            ${p.materials.map(m => `<li>${m.name}: <strong>${engine.customFormula[m.id] || m.defaultRatio}%</strong></li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    resultModal.style.display = 'flex';
  }
});
