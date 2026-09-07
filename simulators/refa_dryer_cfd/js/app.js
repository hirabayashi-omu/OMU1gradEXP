/**
 * app.js
 * ReFa BEAUTECH ドライヤー 熱流体解析（粒子法）シミュレータ
 * アプリケーションメイン制御
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Three.js シーンの初期化
  const container = document.getElementById('viewport-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1117);
  scene.fog = new THREE.FogExp2(0x0e1117, 0.04);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
  camera.position.set(2.5, 2.2, 5.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(2.2, 0, 0); // ノズルとターゲットの中間を注視
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // 床下には潜りすぎない

  // 2. スタジオライティング (ReFaのメタリック＆パール質感を輝かせる)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.4);
  keyLight.position.set(4, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 15;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.8);
  fillLight.position.set(-3, 3, -3);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffffff, 1.2, 10);
  rimLight.position.set(-1.5, 1.5, 2);
  scene.add(rimLight);

  // 床面（洗練されたグリッドフロア）
  const gridHelper = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
  gridHelper.position.y = -1.8;
  scene.add(gridHelper);

  // 3. モジュール初期化
  const dryerFactory = new DryerModelFactory();
  let currentDryerMesh = null;
  let currentModelType = 'bx';

  function setDryerModel(modelType) {
    if (currentDryerMesh) {
      scene.remove(currentDryerMesh);
    }
    currentModelType = modelType;
    currentDryerMesh = dryerFactory.createDryer(modelType);
    scene.add(currentDryerMesh);

    // スペック情報の反映
    const spec = DRYER_SPECS[modelType];
    document.getElementById('model-name-display').textContent = spec.name;
    document.getElementById('model-tagline').textContent = spec.tagline;
    document.getElementById('spec-airflow').textContent = `${spec.maxAirflow} m³/min`;
    document.getElementById('spec-nozzle').textContent = `${Math.round(spec.nozzleRadius * 2 * 100)} mm`;
    
    // CFDエンジンのノズル口径を3Dモデルと完全に一致させる
    cfd.setNozzleSpec(spec.nozzleRadius, spec.nozzleExitX);

    // スライダーの初期値適用
    document.getElementById('val-airflow').textContent = `${spec.maxAirflow} m³/min`;
    document.getElementById('slider-airflow').value = spec.maxAirflow;
    cfd.setParameters({ airflow: spec.maxAirflow });
  }

  const target = new TargetModel();
  scene.add(target.root);

  const maxParticles = 4500;
  const cfd = new ParticleCFD(maxParticles);
  const particleRenderer = new ParticleRenderer(scene, maxParticles);
  const sliceView = new SliceView(scene);

  const decayCanvas = document.getElementById('chart-decay');
  const timeCanvas = document.getElementById('chart-time');
  const hudCanvas = document.getElementById('hud-slice-canvas');
  const charts = new SimulationCharts(decayCanvas, timeCanvas);

  // 初回ドライヤー設置
  setDryerModel('bx');

  // 4. UI コントロールのバインド
  const sliderAirflow = document.getElementById('slider-airflow');
  const sliderTemp = document.getElementById('slider-temp');
  const sliderDistance = document.getElementById('slider-distance');
  const toggleSensing = document.getElementById('sensing-mode-select');
  const btnCoolToggle = document.getElementById('btn-cool-toggle');
  const targetTypeSelect = document.getElementById('target-type-select');

  sliderAirflow.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-airflow').textContent = `${val.toFixed(2)} m³/min`;
    cfd.setParameters({ airflow: val });
  });

  sliderTemp.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-temp').textContent = `${Math.round(val)} ℃`;
    cfd.setParameters({ temp: val });
  });

  sliderDistance.addEventListener('input', (e) => {
    const distCm = parseFloat(e.target.value);
    document.getElementById('val-distance').textContent = `${Math.round(distCm)} cm`;
    target.updatePosition(distCm);
    // 吹出先端からターゲット前面先端までの3D距離
    cfd.setParameters({ targetX: 1.35 + distCm * 0.1 });
  });

  toggleSensing.addEventListener('change', (e) => {
    cfd.setParameters({ sensingMode: e.target.value });
  });

  let isManualCool = false;
  btnCoolToggle.addEventListener('click', () => {
    isManualCool = !isManualCool;
    cfd.setParameters({ isCoolMode: isManualCool });
    btnCoolToggle.classList.toggle('active', isManualCool);
    btnCoolToggle.textContent = isManualCool ? '❄️ 冷風固定中' : '❄️ 冷風切替 (手動)';
  });

  targetTypeSelect.addEventListener('change', (e) => {
    target.setTargetType(e.target.value);
    cfd.setParameters({ targetType: e.target.value });
  });

  // 機種切替タブ
  const modelButtons = document.querySelectorAll('.model-btn');
  modelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modelButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mType = btn.dataset.model;
      setDryerModel(mType);
    });
  });

  // 表示オプション
  document.getElementById('chk-particles').addEventListener('change', (e) => {
    particleRenderer.setVisible(e.target.checked);
  });
  document.getElementById('chk-slice-3d').addEventListener('change', (e) => {
    sliceView.setVisible(e.target.checked);
  });
  document.getElementById('chk-vectors').addEventListener('change', (e) => {
    sliceView.setShowVectors(e.target.checked);
  });
  document.getElementById('select-display-quantity').addEventListener('change', (e) => {
    sliceView.setDisplayMode(e.target.value);
    // HUDラベル等の更新
    const isVel = (e.target.value === 'velocity');
    document.getElementById('hud-slice-title').textContent = isVel ? '空間風速コンター＆流線ベクトル' : '空間温度サーモグラフィ (XY断面)';
    document.getElementById('colorbar-min-label').textContent = isVel ? '0 m/s' : '20℃ (冷)';
    document.getElementById('colorbar-mid-label').textContent = isVel ? '10 m/s' : '60℃ (適温)';
    document.getElementById('colorbar-max-label').textContent = isVel ? '20+ m/s' : '95℃ (熱)';
  });
  document.getElementById('select-particle-color').addEventListener('change', (e) => {
    particleRenderer.setColorMode(e.target.value);
  });
  document.getElementById('slider-slice-opacity').addEventListener('input', (e) => {
    sliceView.setOpacity(parseFloat(e.target.value));
  });

  // カメラ視点プリセット
  document.querySelectorAll('.cam-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.cam;
      animateCameraPreset(preset);
    });
  });

  function animateCameraPreset(preset) {
    let targetPos = new THREE.Vector3();
    let targetLook = new THREE.Vector3(2.2, 0, 0);

    switch (preset) {
      case 'perspective':
        targetPos.set(2.5, 2.2, 5.0);
        break;
      case 'side':
        targetPos.set(2.2, 0, 4.8);
        break;
      case 'target':
        targetPos.set(target.root.position.x + 1.2, 0.4, 1.8);
        targetLook.copy(target.root.position);
        break;
      case 'nozzle':
        targetPos.set(0.6, 0.8, 1.8);
        targetLook.set(1.4, 0, 0);
        break;
    }

    gsapAnimateCamera(targetPos, targetLook);
  }

  function gsapAnimateCamera(pos, look) {
    const startPos = camera.position.clone();
    const startLook = controls.target.clone();
    const duration = 800;
    const startTime = performance.now();

    function step(now) {
      const p = Math.min(1, (now - startTime) / duration);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      camera.position.lerpVectors(startPos, pos, ease);
      controls.target.lerpVectors(startLook, look, ease);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 5. シミュレーションメインループ
  const clock = new THREE.Clock();
  let lastChartUpdateTime = 0;
  let lastSliceSampleTime = 0;
  let targetSurfaceMaxTemp = 25.0;

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);
    const now = clock.getElapsedTime();

    // (A) 粒子法熱流体ソルバー更新
    const cfdResult = cfd.update(dt, targetSurfaceMaxTemp);

    // (B) パーティクル描画更新 (温度・風速の両方を渡す)
    particleRenderer.update(cfd.positions, cfd.temperatures, cfd.speeds, cfd.alive, cfd.maxParticles);

    // (C) ターゲット受熱計算＆3D曲面ヒートマップ更新
    const thermalResult = target.updateThermalImpact(cfdResult.hits, dt);
    targetSurfaceMaxTemp = thermalResult.maxTemp;

    // (D) 空間断面スライスサンプリング (温度・風速・流速ベクトル)
    if (now - lastSliceSampleTime > 0.08) {
      lastSliceSampleTime = now;
      const sliceData = cfd.sampleSliceGrid(sliceView.gridX, sliceView.gridY, sliceView.xRange, sliceView.yRange);
      sliceView.update(sliceData, hudCanvas);

      // 軸上距離別温度プロファイルの抽出
      const profile = [];
      const gxMax = sliceView.gridX;
      const midGy = Math.floor(sliceView.gridY / 2);
      for (let gx = 0; gx < gxMax; gx += 2) {
        const x3D = sliceView.xRange[0] + (gx / gxMax) * (sliceView.xRange[1] - sliceView.xRange[0]);
        const distCm = (x3D - 1.35) * 10;
        const t = sliceData.tempGrid[midGy * gxMax + gx];
        profile.push({ distCm, temp: t });
      }
      charts.drawDecayChart(profile, target.distance);
    }

    // (E) グラフ・HUDメーターのリアルタイム更新
    if (now - lastChartUpdateTime > 0.1) {
      lastChartUpdateTime = now;

      charts.addTimeRecord(thermalResult.maxTemp, cfdResult.currentBlowTemp, cfdResult.heaterDuty);
      const targetLimit = (cfd.sensingMode === 'scalp') ? 50 : 60;
      charts.drawTimeChart(targetLimit);

      // ステータスHUD
      document.getElementById('hud-blow-temp').textContent = `${Math.round(cfdResult.currentBlowTemp)}℃`;
      document.getElementById('hud-target-temp').textContent = `${Math.round(thermalResult.maxTemp * 10) / 10}℃`;
      document.getElementById('hud-target-temp').style.color = (thermalResult.maxTemp >= targetLimit) ? '#eab308' : '#38bdf8';
      
      const sensingBadge = document.getElementById('hud-sensing-badge');
      if (cfd.sensingMode === 'off') {
        sensingBadge.textContent = 'OFF';
        sensingBadge.className = 'status-badge off';
      } else if (cfdResult.sensingState === 'HOT') {
        sensingBadge.textContent = '温風加熱中 (HOT)';
        sensingBadge.className = 'status-badge hot';
      } else {
        sensingBadge.textContent = '冷風制御中 (COOL)';
        sensingBadge.className = 'status-badge cool';
      }

      document.getElementById('hud-particle-count').textContent = `${cfdResult.particleCount} 個`;
      document.getElementById('hud-heater-duty').textContent = `${Math.round(cfdResult.heaterDuty * 100)}%`;
      document.getElementById('hud-blow-speed').textContent = `${(cfdResult.avgSpeed * 1.3).toFixed(1)} m/s`;
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // ウィンドウリサイズ対応
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
});
