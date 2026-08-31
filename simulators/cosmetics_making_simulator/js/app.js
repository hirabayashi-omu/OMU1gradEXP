/**
 * Industrial Vacuum Emulsifying & Formulation App Controller
 * プラント制御 ＆ HLB値・ミセル分子ビュー切替
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new FormulationEngine();
  const visualizer = new FormulationVisualizer('processCanvas');
  visualizer.resize();

  // UI参照
  const selectProduct = document.getElementById('selectProduct');
  const inputProductName = document.getElementById('inputProductName');
  const materialsContainer = document.getElementById('materialsContainer');
  const totalRatioBadge = document.getElementById('totalRatioBadge');

  // HLB UI参照
  const emulsionTypeBadge = document.getElementById('emulsionTypeBadge');
  const hlbVal = document.getElementById('hlbVal');
  const hlbMatch = document.getElementById('hlbMatch');
  const hlbIndicatorPin = document.getElementById('hlbIndicatorPin');

  const inputHomo = document.getElementById('inputHomo');
  const valHomo = document.getElementById('valHomo');
  const inputAnchor = document.getElementById('inputAnchor');
  const valAnchor = document.getElementById('valAnchor');
  const inputVacuum = document.getElementById('inputVacuum');
  const valVacuum = document.getElementById('valVacuum');
  const inputHeatTemp = document.getElementById('inputHeatTemp');
  const valHeatTemp = document.getElementById('valHeatTemp');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');
  const speedRadios = document.querySelectorAll('input[name="simSpeed"]');

  const btnToggleMicelle = document.getElementById('btnToggleMicelle');
  const btnToggleDroplets = document.getElementById('btnToggleDroplets');

  const resultModal = document.getElementById('resultModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnMakeAgain = document.getElementById('btnMakeAgain');

  // 初期描画
  renderMaterialsList();
  updateHLBUI();
  updateUI();

  // イベントリスナー
  selectProduct.addEventListener('change', (e) => {
    engine.setProduct(e.target.value);
    inputProductName.value = engine.productName;
    
    inputHomo.value = engine.homoRpm;
    valHomo.textContent = `${engine.homoRpm} rpm`;

    inputAnchor.value = engine.anchorRpm;
    valAnchor.textContent = `${engine.anchorRpm} rpm`;

    inputVacuum.value = engine.targetVacuum;
    valVacuum.textContent = `${engine.targetVacuum.toFixed(3)} MPa`;

    inputHeatTemp.value = engine.targetHeatTemp;
    valHeatTemp.textContent = `${engine.targetHeatTemp} ℃`;

    renderMaterialsList();
    updateHLBUI();
    updateUI();
  });

  inputProductName.addEventListener('input', (e) => {
    engine.productName = e.target.value;
  });

  inputHomo.addEventListener('input', (e) => {
    engine.homoRpm = parseFloat(e.target.value);
    valHomo.textContent = `${engine.homoRpm} rpm`;
  });

  inputAnchor.addEventListener('input', (e) => {
    engine.anchorRpm = parseFloat(e.target.value);
    valAnchor.textContent = `${engine.anchorRpm} rpm`;
  });

  inputVacuum.addEventListener('input', (e) => {
    engine.targetVacuum = parseFloat(e.target.value);
    valVacuum.textContent = `${engine.targetVacuum.toFixed(3)} MPa`;
  });

  inputHeatTemp.addEventListener('input', (e) => {
    engine.targetHeatTemp = parseFloat(e.target.value);
    valHeatTemp.textContent = `${engine.targetHeatTemp} ℃`;
  });

  // 顕微鏡モード切替
  btnToggleMicelle.addEventListener('click', () => {
    engine.molecularViewMode = 'micelle';
    btnToggleMicelle.classList.add('active');
    btnToggleDroplets.classList.remove('active');
  });

  btnToggleDroplets.addEventListener('click', () => {
    engine.molecularViewMode = 'droplets';
    btnToggleDroplets.classList.add('active');
    btnToggleMicelle.classList.remove('active');
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

  // メインアニメーションループ
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

    if (engine.stages.phase5.status === 'COMPLETED' && !hasShownModalForBatch) {
      hasShownModalForBatch = true;
      showQCCertificateModal();
    } else if (engine.stages.phase5.status !== 'COMPLETED') {
      hasShownModalForBatch = false;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function renderMaterialsList() {
    const p = engine.getCurrentProduct();
    materialsContainer.innerHTML = p.materials.map(m => {
      const currentVal = engine.customFormula[m.id] !== undefined ? engine.customFormula[m.id] : m.defaultRatio;
      const phaseClass = m.phase === 'oil' ? 'phase-oil' : 'phase-water';
      return `
        <div class="material-slider-row ${phaseClass}">
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

    updateTotalRatio();

    materialsContainer.querySelectorAll('.mat-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const matId = e.target.dataset.mat;
        const val = e.target.value;
        document.getElementById(`val_${matId}`).textContent = `${val}%`;
        engine.setMaterialRatio(matId, val);
        updateTotalRatio();
        updateHLBUI();
      });
    });

    document.getElementById('scienceFactBox').innerHTML = `
      <div class="science-badge">💡 化学工学・界面科学のポイント</div>
      <p class="science-text">${p.scienceFact}</p>
    `;
  }

  function updateHLBUI() {
    hlbVal.textContent = `HLB ${engine.effectiveHLB.toFixed(1)}`;
    hlbMatch.textContent = `所要HLB一致率 ${engine.hlbMatchScore}%`;

    // ピン位置 (HLB 0〜20 -> 0%〜100%)
    const pinPercent = Math.max(0, Math.min(100, (engine.effectiveHLB / 20.0) * 100));
    hlbIndicatorPin.style.left = `${pinPercent}%`;

    // エマルションバッジ
    emulsionTypeBadge.className = 'emulsion-badge';
    if (engine.activeEmulsionType === 'W/O') {
      emulsionTypeBadge.textContent = 'W/O型 (油中水滴・逆ミセル)';
      emulsionTypeBadge.classList.add('badge-wo');
    } else if (engine.activeEmulsionType === 'MICELLE') {
      emulsionTypeBadge.textContent = '棒状ミセル形成 (高HLB洗浄)';
      emulsionTypeBadge.classList.add('badge-micelle');
    } else if (engine.activeEmulsionType === 'GEL') {
      emulsionTypeBadge.textContent = '高分子網目ゲル (ハイドロゲル)';
      emulsionTypeBadge.classList.add('badge-gel');
    } else {
      emulsionTypeBadge.textContent = 'O/W型 (水中油滴・正ミセル)';
      emulsionTypeBadge.classList.add('badge-ow');
    }
  }

  function updateTotalRatio() {
    const p = engine.getCurrentProduct();
    let total = 0;
    p.materials.forEach(m => {
      total += engine.customFormula[m.id] !== undefined ? engine.customFormula[m.id] : m.defaultRatio;
    });
    totalRatioBadge.textContent = `Total: ${total}%`;
    if (total === 100) {
      totalRatioBadge.style.color = '#34d399';
      totalRatioBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    } else {
      totalRatioBadge.style.color = '#f59e0b';
      totalRatioBadge.style.background = 'rgba(245, 158, 11, 0.15)';
    }
  }

  function updateUI() {
    const s1 = engine.stages.phase1;
    const s2 = engine.stages.phase2;
    const s3 = engine.stages.phase3;
    const s4 = engine.stages.phase4;
    const s5 = engine.stages.phase5;

    document.getElementById('bar_phase1').style.width = `${s1.progress}%`;
    document.getElementById('bar_phase2').style.width = `${s2.progress}%`;
    document.getElementById('bar_phase3').style.width = `${s3.progress}%`;
    document.getElementById('bar_phase4').style.width = `${s4.progress}%`;
    document.getElementById('bar_phase5').style.width = `${s5.progress}%`;

    document.getElementById('stat_phase1').textContent = s1.status === 'COMPLETED' ? '完了 ✔' : s1.status === 'RUNNING' ? `加温中 (${engine.waterKettleTemp.toFixed(0)}℃)` : '待機中';
    document.getElementById('stat_phase2').textContent = s2.status === 'COMPLETED' ? '仕込完了 ✔' : s2.status === 'RUNNING' ? `真空吸引中 (${engine.currentVacuum.toFixed(2)}MPa)` : '待機中';
    document.getElementById('stat_phase3').textContent = s3.status === 'COMPLETED' ? '乳化完了 ✔' : s3.status === 'RUNNING' ? `ホモ剪断中 (${Math.round(engine.homoRpm)}rpm)` : '待機中';
    document.getElementById('stat_phase4').textContent = s4.status === 'COMPLETED' ? '徐冷完了 ✔' : s4.status === 'RUNNING' ? `冷却中 (${engine.mainVesselTemp.toFixed(0)}℃)` : '待機中';
    document.getElementById('stat_phase5').textContent = s5.status === 'COMPLETED' ? '合格・完成 🎉' : s5.status === 'RUNNING' ? `充填中 (${Math.floor(s5.unitsFilled)}/${s5.targetUnits}本)` : '待機中';
  }

  function updateButtons() {
    btnStart.disabled = engine.running && !engine.paused;
    btnPause.disabled = !engine.running;
    btnPause.textContent = engine.paused ? '▶ 再開' : '⏸ 一時停止';
  }

  function showQCCertificateModal() {
    const qc = engine.qcReport;
    const p = engine.getCurrentProduct();
    const modalBody = document.getElementById('resultModalBody');

    modalBody.innerHTML = `
      <div class="coa-card">
        <div class="coa-header">
          <span class="coa-badge">GMP Certificate of Analysis (COA)</span>
          <h2>製造ロット品質検査成績書</h2>
          <p class="coa-sub">${engine.productName} | ${p.category} | ${engine.activeEmulsionType}型</p>
        </div>

        <div class="coa-grade-box">
          <div class="coa-grade-title">総合判定: 総合グレード 【 ${qc.grade} 】</div>
          <p class="coa-compliance">${qc.standardsCompliance}</p>
        </div>

        <table class="coa-table">
          <tr>
            <th>エマルション構造 / HLB</th>
            <td style="color: ${engine.activeEmulsionType === 'W/O' ? '#f59e0b' : '#38bdf8'}; font-weight: bold;">
              ${engine.activeEmulsionType}型 (実効HLB: ${engine.effectiveHLB.toFixed(1)} / 一致度 ${engine.hlbMatchScore}%)
            </td>
          </tr>
          <tr>
            <th>平均粒子径 (レーザー回折)</th>
            <td>${qc.particleSizeResult} (適合度 ${qc.particleSizeScore}点)</td>
          </tr>
          <tr>
            <th>B型粘度計 (チキソトロピー性)</th>
            <td>${qc.viscosityResult} (適合度 ${qc.viscosityScore}点)</td>
          </tr>
          <tr>
            <th>乳化安定性 (遠心分離テスト)</th>
            <td>${qc.stabilityResult} (適合度 ${qc.stabilityScore}点)</td>
          </tr>
          <tr>
            <th>真空脱泡度 (気泡・光沢度)</th>
            <td>${qc.deaerationResult} (適合度 ${qc.deaerationScore}点)</td>
          </tr>
          <tr>
            <th>製剤テクスチャー感触評価</th>
            <td style="color: #38bdf8;">${qc.sensoryTitle}</td>
          </tr>
          <tr>
            <th>充填容器 / 仕様</th>
            <td>${p.containerName}</td>
          </tr>
        </table>

        <div class="formula-summary">
          <strong>【確定処方ブレンド比率】</strong>
          <ul>
            ${p.materials.map(m => `<li>${m.name}: <strong>${engine.customFormula[m.id] || m.defaultRatio}%</strong></li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    resultModal.style.display = 'flex';
  }
});
