/**
 * app.js - ??????? 3D???????????????? ?????????
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Coupler3D } from './coupler3D.js';
import { CouplerPhysics, COUPLER_STATES } from './physics.js';
import { FEMEngine } from './fem.js';
import { MaterialEngine, MATERIALS } from './material.js';
import { CouplerCharts } from './charts.js';

class App {
  constructor() {
    this.container = document.getElementById('canvasContainer');
    
    // ?????????
    this.physics = new CouplerPhysics();
    this.materialEngine = new MaterialEngine('sc480');
    this.femEngine = new FEMEngine();
    
    this.initThree();
    this.coupler3D = new Coupler3D(this.scene);
    this.charts = new CouplerCharts(this.materialEngine);

    this.simSpeed = 1.0;
    this.isPaused = false;
    this.lastTime = performance.now();

    this.initUI();
    this.initKeyboard();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  /**
   * Three.js ??????????????????
   */
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.12);

    const width = this.container.clientWidth || window.innerWidth * 0.5;
    const height = this.container.clientHeight || window.innerHeight * 0.8;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    this.camera.position.set(0.6, 0.9, 1.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(-0.1, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // ??????
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x111827, 1.2);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight1.position.set(4, 6, 4);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 25;
    dirLight1.shadow.camera.left = -2;
    dirLight1.shadow.camera.right = 2;
    dirLight1.shadow.camera.top = 2;
    dirLight1.shadow.camera.bottom = -2;
    dirLight1.shadow.bias = -0.0005;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4facfe, 1.0);
    dirLight2.position.set(-4, -2, -3);
    this.scene.add(dirLight2);

    // ???????????
    const grid = new THREE.GridHelper(12, 40, 0x00f2fe, 0x1f293d);
    grid.position.y = -0.35;
    this.scene.add(grid);

    // ?????? (2???????)
    const railGeo = new THREE.BoxGeometry(10, 0.04, 0.05);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a6578, metalness: 0.9, roughness: 0.2 });
    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(0, -0.32, 0.53);
    const railR = new THREE.Mesh(railGeo, railMat);
    railR.position.set(0, -0.32, -0.53);
    this.scene.add(railL);
    this.scene.add(railR);

    // ????????
    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    });
  }

  /**
   * UI???????????
   */
  initUI() {
    // ?????????
    const sliderPower = document.getElementById('sliderPower');
    const valPower = document.getElementById('valPower');
    sliderPower.addEventListener('input', (e) => {
      const p = parseInt(e.target.value, 10);
      this.physics.notchPower = p;
      valPower.textContent = (p === 0) ? '?' : ('P' + p);
    });

    // ??????????
    const sliderBrake = document.getElementById('sliderBrake');
    const valBrake = document.getElementById('valBrake');
    sliderBrake.addEventListener('input', (e) => {
      const b = parseInt(e.target.value, 10);
      this.physics.notchBrake = b;
      valBrake.textContent = (b === 0) ? '??' : ((b === 9) ? '??(EB)' : ('B' + b));
    });

    // ??????
    const revForward = document.getElementById('revForward');
    const revNeutral = document.getElementById('revNeutral');
    const revBackward = document.getElementById('revBackward');
    const setRev = (r) => {
      this.physics.reverser = r;
      revForward.classList.toggle('active', r === 1);
      revNeutral.classList.toggle('active', r === 0);
      revBackward.classList.toggle('active', r === -1);
    };
    revForward.addEventListener('click', () => setRev(1));
    revNeutral.addEventListener('click', () => setRev(0));
    revBackward.addEventListener('click', () => setRev(-1));

    // ???????
    const leverRange = document.getElementById('leverRange');
    const leverVal = document.getElementById('leverVal');
    leverRange.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.physics.setUncoupleLever(val);
      leverVal.textContent = val > 0.5 ? '??(??)' : '??(??)';
    });

    // ????????????
    const btnPullLever = document.getElementById('btnPullLever');
    btnPullLever.addEventListener('click', () => {
      leverRange.value = '1.0';
      this.physics.setUncoupleLever(1.0);
      leverVal.textContent = '??(??)';
      setTimeout(() => {
        leverRange.value = '0.0';
        this.physics.setUncoupleLever(0.0);
        leverVal.textContent = '??(??)';
      }, 3000);
    });

    // ?????????
    const sliderVib = document.getElementById('sliderVib');
    const valVib = document.getElementById('valVib');
    sliderVib.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.physics.vibrationLevel = v;
      valVib.textContent = v.toFixed(1) + 'x';
    });

    // ????
    const selMaterial = document.getElementById('selMaterial');
    selMaterial.addEventListener('change', (e) => {
      this.materialEngine.setMaterial(e.target.value);
      this.charts.updateMaterialCurve();
      this.updateMaterialSpecUI();
    });
    this.updateMaterialSpecUI();

    // FEM???????
    const toggleFEM = document.getElementById('toggleFEM');
    toggleFEM.addEventListener('change', (e) => {
      this.coupler3D.setFEMMode(e.target.checked);
      document.getElementById('femLegend').style.display = e.target.checked ? 'flex' : 'none';
    });

    // ?????????
    document.getElementById('camCloseUp').addEventListener('click', () => {
      this.setCameraView(0.05, 0.25, 0.65, 0, 0, 0);
    });
    document.getElementById('camTop').addEventListener('click', () => {
      this.setCameraView(0, 1.4, 0.05, 0, 0, 0);
    });
    document.getElementById('camSide').addEventListener('click', () => {
      this.setCameraView(0, 0.05, 1.3, 0, 0, 0);
    });
    document.getElementById('camOverview').addEventListener('click', () => {
      this.setCameraView(0.8, 1.0, 2.0, -0.2, 0, 0);
    });

    // ????????????
    document.getElementById('scenarioIdealCoupling').addEventListener('click', () => {
      this.runScenario('ideal');
    });
    document.getElementById('scenarioHardCrash').addEventListener('click', () => {
      this.runScenario('crash');
    });
    document.getElementById('scenarioSlowBounce').addEventListener('click', () => {
      this.runScenario('slow');
    });
    document.getElementById('scenarioUncouple').addEventListener('click', () => {
      this.runScenario('uncouple');
    });
    document.getElementById('btnReset').addEventListener('click', () => {
      this.resetAll();
    });
  }

  updateMaterialSpecUI() {
    const mat = this.materialEngine.mat;
    document.getElementById('specYield').textContent = (mat.yieldStress / 1e6).toFixed(0) + ' MPa';
    document.getElementById('specTensile').textContent = (mat.ultimateStress / 1e6).toFixed(0) + ' MPa';
    document.getElementById('specElongation').textContent = (mat.fractureStrain * 100).toFixed(0) + ' %';
    document.getElementById('specCompLimit').textContent = (mat.compressiveLimit / 1e6).toFixed(0) + ' MPa';
  }

  setCameraView(x, y, z, tx, ty, tz) {
    this.camera.position.set(x, y, z);
    this.controls.target.set(tx, ty, tz);
    this.controls.update();
  }

  /**
   * ???????
   */
  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'w' || e.key === 'W') {
        const p = Math.min(5, this.physics.notchPower + 1);
        document.getElementById('sliderPower').value = p;
        document.getElementById('sliderPower').dispatchEvent(new Event('input'));
      } else if (e.key === 's' || e.key === 'S') {
        const b = Math.min(9, this.physics.notchBrake + 1);
        document.getElementById('sliderBrake').value = b;
        document.getElementById('sliderBrake').dispatchEvent(new Event('input'));
      } else if (e.key === 'x' || e.key === 'X') {
        document.getElementById('sliderPower').value = 0;
        document.getElementById('sliderPower').dispatchEvent(new Event('input'));
        document.getElementById('sliderBrake').value = 0;
        document.getElementById('sliderBrake').dispatchEvent(new Event('input'));
      } else if (e.key === ' ') {
        document.getElementById('sliderPower').value = 0;
        document.getElementById('sliderPower').dispatchEvent(new Event('input'));
        document.getElementById('sliderBrake').value = 9;
        document.getElementById('sliderBrake').dispatchEvent(new Event('input'));
      } else if (e.key === 'a' || e.key === 'A') {
        document.getElementById('btnPullLever').click();
      }
    });
  }

  /**
   * ???????????
   */
  runScenario(type) {
    this.resetAll();
    if (type === 'ideal') {
      this.physics.posA = -1.2;
      this.physics.velA = 3.5 / 3.6;
      this.physics.reverser = 1;
      this.physics.notchPower = 1;
      document.getElementById('sliderPower').value = 1;
      document.getElementById('valPower').textContent = 'P1';
    } else if (type === 'crash') {
      this.physics.posA = -1.5;
      this.physics.velA = 22.0 / 3.6;
      this.physics.reverser = 1;
      this.physics.notchPower = 5;
      document.getElementById('sliderPower').value = 5;
      document.getElementById('valPower').textContent = 'P5';
    } else if (type === 'slow') {
      this.physics.posA = -0.5;
      this.physics.velA = 0.4 / 3.6;
      this.physics.reverser = 1;
      this.physics.notchPower = 0;
    } else if (type === 'uncouple') {
      this.physics.posA = 0.0;
      this.physics.velA = 0.0;
      this.physics.state = COUPLER_STATES.LOCKED;
      this.physics.knuckleAngleA = 0;
      this.physics.knuckleAngleB = 0;
      this.physics.lockHeightA = 0;
      this.physics.lockHeightB = 0;
      setTimeout(() => {
        document.getElementById('btnPullLever').click();
        setTimeout(() => {
          this.physics.reverser = -1;
          document.getElementById('revBackward').click();
          this.physics.notchPower = 2;
          document.getElementById('sliderPower').value = 2;
          document.getElementById('valPower').textContent = 'P2';
        }, 600);
      }, 300);
    }
  }

  resetAll() {
    this.physics.reset();
    this.materialEngine.resetState();
    this.femEngine.reset();
    document.getElementById('sliderPower').value = 0;
    document.getElementById('valPower').textContent = '?';
    document.getElementById('sliderBrake').value = 0;
    document.getElementById('valBrake').textContent = '??';
    document.getElementById('revForward').click();
    document.getElementById('leverRange').value = '0.0';
    document.getElementById('leverVal').textContent = '??(??)';
    this.charts.updateMaterialCurve();
  }

  /**
   * ?????????????
   */
  animate(timestamp) {
    requestAnimationFrame(this.animate);

    const rawDt = (timestamp - this.lastTime) * 0.001;
    this.lastTime = timestamp;
    const dt = Math.min(0.05, rawDt) * this.simSpeed;

    if (!this.isPaused) {
      // 1. ????????
      const physData = this.physics.step(dt, this.materialEngine);

      // 2. FEM????
      const yieldStress = this.materialEngine.mat.yieldStress;
      const femData = this.femEngine.compute(
        physData.contactForceX,
        physData.contactForceY,
        physData.contactForceZ,
        yieldStress
      );

      // 3. ?????? (S-S?? & ????)
      const normalStress = physData.contactForceX > 0 ? femData.maxGlobalStress : -femData.maxGlobalStress;
      const shearStress = Math.abs(physData.contactForceY + physData.contactForceZ) / 0.0048;
      const materialData = this.materialEngine.update(femData.maxGlobalStress, normalStress, shearStress);

      // 4. 3D????? & FEM?????
      this.coupler3D.update(physData, femData, this.materialEngine);

      // 5. ?????
      this.charts.update(dt, physData, materialData);

      // 6. UI???????
      this.updateTelemetry(physData, femData, materialData);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * HUD & ??????????
   */
  updateTelemetry(phys, fem, mat) {
    // ?? & ??
    document.getElementById('hudSpeed').textContent = phys.speedKmh.toFixed(1) + ' km/h';
    document.getElementById('hudRelDist').textContent = (phys.posB - phys.posA).toFixed(3) + ' m';
    document.getElementById('hudContactForce').textContent = (phys.contactForceX / 1000).toFixed(1) + ' kN';
    document.getElementById('hudDraftStroke').textContent = (phys.draftStrokeA * 1000).toFixed(1) + ' mm';

    // ????????
    const badgeState = document.getElementById('badgeCouplerState');
    badgeState.className = 'status-badge';
    if (mat.isFractured) {
      badgeState.textContent = '?? [' + mat.failureMode + ']';
      badgeState.classList.add('status-failed');
    } else if (phys.state === COUPLER_STATES.LOCKED) {
      badgeState.textContent = '???? (???)';
      badgeState.classList.add('status-locked');
    } else if (phys.state === COUPLER_STATES.ENGAGING) {
      badgeState.textContent = '???????';
      badgeState.classList.add('status-engaging');
    } else if (phys.state === COUPLER_STATES.APPROACHING) {
      badgeState.textContent = '?????';
      badgeState.classList.add('status-approaching');
    } else if (phys.state === COUPLER_STATES.UNLOCKED) {
      badgeState.textContent = '?????';
      badgeState.classList.add('status-unlocked');
    } else {
      badgeState.textContent = '??? (??)';
      badgeState.classList.add('status-disconnected');
    }

    // ?? & ???
    const stressMPa = (fem.maxGlobalStress / 1e6).toFixed(1);
    const peakMPa = (fem.peakGlobalStress / 1e6).toFixed(1);
    document.getElementById('telStress').textContent = stressMPa + ' MPa';
    document.getElementById('telPeakStress').textContent = peakMPa + ' MPa';
    document.getElementById('telCriticalNode').textContent = fem.criticalNodeName;

    const sf = mat.safetyFactor;
    const elSafety = document.getElementById('telSafetyFactor');
    elSafety.textContent = sf > 50 ? '?? (??)' : sf.toFixed(2);
    if (sf < 1.0) {
      elSafety.style.color = '#ef4444';
    } else if (sf < 1.5) {
      elSafety.style.color = '#f59e0b';
    } else {
      elSafety.style.color = '#10b981';
    }

    // ????? & ????
    document.getElementById('telKnuckleAngle').textContent = phys.knuckleAngleA.toFixed(1) + '?';
    document.getElementById('telSlack').textContent = (this.physics.currentSlackX * 1000).toFixed(1) + ' mm';

    // ?????
    const plasticEl = document.getElementById('telPlasticStrain');
    plasticEl.textContent = (mat.plasticStrain * 100).toFixed(3) + ' %';
    if (mat.plasticStrain > 0) {
      plasticEl.style.color = '#f59e0b';
    } else {
      plasticEl.style.color = '#cbd5e1';
    }

    // ????
    document.getElementById('logMessage').textContent = phys.lastEvent;
  }
}

// ?????
window.addEventListener('DOMContentLoaded', () => {
  new App();
});