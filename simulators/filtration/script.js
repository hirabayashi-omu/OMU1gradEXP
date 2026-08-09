/**
 * ろ過シミュレータ (自然流下)  script.js
 *
 * 物理モデル:
 *   液頭圧:  ΔP(t) = ρ_f · g · H(t)
 *   液面降下: H(t) = max(0, H₀ − V/A)
 *   Ruth 定圧ろ過方程式 (瞬間的に準定常と見なす):
 *     dV/dt = ΔP(t)·A² / [μ·(α·m·V + Rm·A)]
 *   ケーク厚み:
 *     L_c = C_s·V / [A·(1−ε)]   ε=0.4
 *   H(t)=0 になると流れが止まる (ろ過終了)
 */

'use strict';

const g = 9.81; // 重力加速度 [m/s²]

// ===== パラメータ読み込み =====
function getParams() {
    return {
        H0:    parseFloat(document.getElementById('sl-H0').value)    * 1e-2,  // m
        A:     parseFloat(document.getElementById('sl-area').value)  * 1e-4,  // m²
        rhoP:  parseFloat(document.getElementById('sl-rho-p').value),          // kg/m³
        dp:    parseFloat(document.getElementById('sl-dp').value)    * 1e-6,  // m
        Cs:    parseFloat(document.getElementById('sl-cs').value)    * 0.01,  // -
        mu:    parseFloat(document.getElementById('sl-mu').value)    * 1e-3,  // Pa·s
        rhoF:  parseFloat(document.getElementById('sl-rho-f').value),          // kg/m³
        alpha: parseFloat(document.getElementById('sl-alpha').value) * 1e8,   // m/kg
        Rm:    parseFloat(document.getElementById('sl-rm').value)    * 1e8,   // m⁻¹
    };
}

// ===== スライダー表示 =====
const sliderDefs = [
    ['sl-H0',    'vd-H0',    v => v],
    ['sl-area',  'vd-area',  v => v],
    ['sl-rho-p', 'vd-rho-p', v => v],
    ['sl-dp',    'vd-dp',    v => v],
    ['sl-cs',    'vd-cs',    v => parseFloat(v).toFixed(1)],
    ['sl-mu',    'vd-mu',    v => parseFloat(v).toFixed(1)],
    ['sl-rho-f', 'vd-rho-f', v => v],
    ['sl-alpha', 'vd-alpha', v => v],
    ['sl-rm',    'vd-rm',    v => parseFloat(v).toFixed(1)],
];
sliderDefs.forEach(([slId, vdId, fmt]) => {
    const sl = document.getElementById(slId);
    const vd = document.getElementById(vdId);
    if (!sl || !vd) return;
    vd.textContent = fmt(sl.value);
    sl.addEventListener('input', () => { vd.textContent = fmt(sl.value); });
});

// ===== Three.js セットアップ =====
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.FogExp2(0x0f172a, 0.18);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 20);
camera.position.set(1.6, 1.0, 2.0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.35, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.update();

// ===== ライト =====
scene.add(new THREE.AmbientLight(0x334155, 2.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(3, 6, 4); dirLight.castShadow = true;
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);

// ===== 寸法定数 =====
const W = 1.0, D = 0.6, H_MAX = 1.6;
const FILTER_Y = 0.025; // ろ布上面
const SCENE_SCALE = 4.0; // 物理 1m → scene 4.0

// ===== ろ布 =====
const filterCloth = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.025, D),
    new THREE.MeshPhongMaterial({ color: 0x475569, emissive: 0x1e293b, shininess: 30 })
);
filterCloth.position.set(0, FILTER_Y / 2, 0);
filterCloth.receiveShadow = true;
scene.add(filterCloth);
const grid = new THREE.GridHelper(W, 14, 0x334155, 0x1e293b);
grid.position.set(0, FILTER_Y + 0.001, 0);
scene.add(grid);

// ===== 容器の壁 =====
function addWall(w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshPhongMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.15, depthWrite: false })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
}
addWall(0.015, H_MAX, D, -W/2, H_MAX/2, 0);
addWall(0.015, H_MAX, D,  W/2, H_MAX/2, 0);
addWall(W+0.015, H_MAX, 0.015, 0, H_MAX/2, -D/2);
addWall(W+0.015, H_MAX, 0.015, 0, H_MAX/2,  D/2);

// ===== 液面メッシュ (水色半透明) =====
const liquidSurfGeo = new THREE.PlaneGeometry(W * 0.99, D * 0.99);
const liquidSurfMat = new THREE.MeshPhongMaterial({
    color: 0x38bdf8, emissive: 0x0369a1,
    transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false,
});
const liquidSurf = new THREE.Mesh(liquidSurfGeo, liquidSurfMat);
liquidSurf.rotation.x = -Math.PI / 2;
scene.add(liquidSurf);

// スラリー液体の本体（内部を青くする半透明ブロック）
const liquidBodyGeo = new THREE.BoxGeometry(1, 1, 1);
const liquidBodyMat = new THREE.MeshPhongMaterial({
    color: 0x0ea5e9, transparent: true, opacity: 0.08, depthWrite: false,
});
const liquidBody = new THREE.Mesh(liquidBodyGeo, liquidBodyMat);
scene.add(liquidBody);

// ===== ケーク層 (InstancedMesh) =====
const CAKE_N = 50;
const cakeMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0xb45309, emissive: 0x78350f, shininess: 15 }),
    CAKE_N
);
cakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(cakeMesh);

const dummy = new THREE.Object3D();
function hideCake() {
    for (let i = 0; i < CAKE_N; i++) {
        dummy.position.set(0, -100, 0); dummy.scale.set(0,0,0); dummy.updateMatrix();
        cakeMesh.setMatrixAt(i, dummy.matrix);
    }
    cakeMesh.instanceMatrix.needsUpdate = true;
}
hideCake();

// ===== スラリー浮遊粒子 =====
const PARTICLE_COUNT = 500;
const slurryMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 6),
    new THREE.MeshPhongMaterial({ color: 0xef4444, emissive: 0x7f1d1d, shininess: 60 }),
    PARTICLE_COUNT
);
slurryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(slurryMesh);

// ===== ケーク表面粒子 =====
const SURF_N = 250;
const surfMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 6),
    new THREE.MeshPhongMaterial({ color: 0xdc2626, emissive: 0x7f1d1d, shininess: 40 }),
    SURF_N
);
surfMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(surfMesh);

// ===== ろ液流出点 =====
const EFF_N = 150;
const effGeo = new THREE.BufferGeometry();
const effPos = new Float32Array(EFF_N * 3);
const effLife = new Float32Array(EFF_N);
for (let i = 0; i < EFF_N; i++) {
    effPos[i*3] = (Math.random()-0.5)*W; effPos[i*3+1] = -0.06; effPos[i*3+2] = (Math.random()-0.5)*D;
    effLife[i] = Math.random();
}
effGeo.setAttribute('position', new THREE.BufferAttribute(effPos, 3));
const effMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.02, transparent: true, opacity: 0.8 });
scene.add(new THREE.Points(effGeo, effMat));

// ===== 粒子データ =====
const particleData = [];
function initParticles(cakeY, liquidY) {
    particleData.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particleData.push({
            x: (Math.random()-0.5)*W*0.85,
            y: cakeY + 0.05 + Math.random() * Math.max(0.01, liquidY - cakeY - 0.06),
            z: (Math.random()-0.5)*D*0.85,
            vy: -(0.04 + Math.random()*0.06),
            phase: Math.random()*Math.PI*2,
            settled: false,
        });
    }
}

// ===== シミュレーション状態 =====
let isRunning = false;
let isFinished = false;
let simTime = 0;
let V  = 0;   // ろ液体積 [m³]
let Lc = 0;   // ケーク厚み [m]
let Ht = 0;   // 現在の液面高さ [m]
let cakeTopY   = FILTER_Y;
let liquidTopY = FILTER_Y;

// ===== 物理演算: 自然流下ろ過 =====
function stepPhysics(dt_real) {
    const p = getParams();
    const SIM_SPEED = 12.0;
    const dt = dt_real * SIM_SPEED;

    // 液面高さ
    Ht = Math.max(0, p.H0 - V / p.A);
    if (Ht <= 0) {
        isRunning = false;
        isFinished = true;
        document.getElementById('btn-run').textContent = '▶ 開始';
        document.getElementById('btn-run').classList.remove('running');
        document.getElementById('finish-banner').style.display = 'block';
        return 0;
    }

    // ヘッド圧
    const dP = p.rhoF * g * Ht;

    // 堆積固体質量係数
    const m = p.Cs * p.rhoP / Math.max(1 - p.Cs, 0.01);

    // Ruth 方程式
    const denom = p.mu * (p.alpha * m * V + p.Rm * p.A);
    const dVdt = (dP * p.A * p.A) / Math.max(denom, 1e-20);

    V += dVdt * dt;
    simTime += dt;

    // ケーク厚み
    const eps = 0.4;
    Lc = p.Cs * V / (p.A * (1 - eps));

    // UI更新
    document.getElementById('res-V').textContent    = (V * 1e3).toFixed(3);
    document.getElementById('res-dVdt').textContent = (dVdt * 1e6).toFixed(3);
    document.getElementById('res-H').textContent    = (Ht * 1e2).toFixed(2);
    document.getElementById('res-dP').textContent   = dP.toFixed(1);
    document.getElementById('res-Lc').textContent   = (Lc * 1e3).toFixed(3);
    document.getElementById('res-t').textContent    = simTime.toFixed(1);

    return dVdt;
}

// ===== 3D更新 =====
function update3D(dt_real, dVdt) {
    const p = getParams();
    const pSize = Math.max(0.008, Math.min(0.025, p.dp * 1e6 * 0.00025));

    // ケーク上端 Y (scene)
    cakeTopY  = FILTER_Y + Math.min(Lc * SCENE_SCALE, H_MAX * 0.6);
    // 液面 Y (scene): FILTER_Y + H(t) * SCENE_SCALE
    liquidTopY = FILTER_Y + Math.min(Ht * SCENE_SCALE, H_MAX * 0.92);

    // --- 液面・液体ブロック ---
    liquidSurf.position.set(0, liquidTopY, 0);
    liquidSurf.visible = Ht > 0.001;

    const liqH = Math.max(0, liquidTopY - cakeTopY);
    liquidBody.position.set(0, cakeTopY + liqH / 2, 0);
    liquidBody.scale.set(W * 0.995, Math.max(0.001, liqH), D * 0.995);

    // --- ケーク層 ---
    const cakeH = cakeTopY - FILTER_Y;
    if (cakeH < 0.001) {
        hideCake();
    } else {
        const layerH = cakeH / CAKE_N;
        for (let i = 0; i < CAKE_N; i++) {
            dummy.position.set(0, FILTER_Y + layerH*(i+0.5), 0);
            dummy.scale.set(W*0.995, layerH, D*0.995);
            dummy.updateMatrix();
            cakeMesh.setMatrixAt(i, dummy.matrix);
            cakeMesh.setColorAt(i, new THREE.Color().setHSL(0.08, 0.75, 0.22 + (i/CAKE_N)*0.18));
        }
        cakeMesh.instanceMatrix.needsUpdate = true;
        if (cakeMesh.instanceColor) cakeMesh.instanceColor.needsUpdate = true;
    }

    // --- スラリー粒子 ---
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const pd = particleData[i];

        if (isRunning && !pd.settled) {
            pd.y += pd.vy * dt_real;
            pd.x += Math.sin(pd.phase + simTime*0.8) * 0.0015;
            pd.z += Math.cos(pd.phase + simTime*0.6) * 0.0015;
        }

        // 液面が下がったら液面上の粒子をリサイクル
        if (pd.y > liquidTopY - pSize && !pd.settled) {
            pd.y = liquidTopY - pSize * 2;
        }
        // ケーク面に着地
        if (pd.y < cakeTopY + pSize*2 && !pd.settled && isRunning) {
            pd.y = cakeTopY + pSize*2;
            pd.settled = true;
        }
        // 着地粒子をゆっくりリサイクル (液面内に空きがある場合)
        if (pd.settled && Math.random() < (isRunning ? 0.003 : 0) && liqH > pSize * 4) {
            pd.x = (Math.random()-0.5)*W*0.85;
            pd.y = cakeTopY + pSize*3 + Math.random() * Math.max(0.01, liqH - pSize*4);
            pd.z = (Math.random()-0.5)*D*0.85;
            pd.vy = -(0.04 + Math.random()*0.06);
            pd.settled = false;
        }

        // 壁クランプ
        pd.x = Math.max(-W/2*0.9, Math.min(W/2*0.9, pd.x));
        pd.z = Math.max(-D/2*0.9, Math.min(D/2*0.9, pd.z));

        // 液面超過チェック (非表示)
        const inLiquid = pd.y > cakeTopY && pd.y < liquidTopY;
        dummy.position.set(pd.x, pd.y, pd.z);
        dummy.scale.setScalar(inLiquid ? pSize : 0);
        dummy.updateMatrix();
        slurryMesh.setMatrixAt(i, dummy.matrix);
    }
    slurryMesh.instanceMatrix.needsUpdate = true;

    // --- ケーク表面粒子 ---
    const surfPSize = pSize * 0.9;
    const cols = Math.ceil(Math.sqrt(SURF_N));
    for (let i = 0; i < SURF_N; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const sx = (col/cols - 0.5)*W*0.92, sz = (row/cols - 0.5)*D*0.92;
        const visLayers = Math.floor(cakeH / (surfPSize * 2.5));
        const ly = Math.floor(Math.random() * Math.max(1, visLayers));
        const sy = cakeH < 0.001 ? -100 : FILTER_Y + surfPSize + ly * surfPSize * 2.2;
        dummy.position.set(sx, Math.min(sy, cakeTopY), sz);
        dummy.scale.setScalar(cakeH > 0.001 ? surfPSize : 0);
        dummy.updateMatrix();
        surfMesh.setMatrixAt(i, dummy.matrix);
    }
    surfMesh.instanceMatrix.needsUpdate = true;

    // --- ろ液流出 ---
    const flowRate = (isRunning && !isFinished) ? Math.min(1.0, dVdt * 1e4) : 0.05;
    for (let i = 0; i < EFF_N; i++) {
        effLife[i] -= dt_real * (0.5 + flowRate);
        if (effLife[i] <= 0) {
            effPos[i*3]   = (Math.random()-0.5)*W*0.75;
            effPos[i*3+1] = -0.04;
            effPos[i*3+2] = (Math.random()-0.5)*D*0.75;
            effLife[i]    = 0.4 + Math.random();
        } else {
            effPos[i*3+1] -= dt_real * (0.05 + flowRate*0.1);
        }
    }
    effGeo.attributes.position.needsUpdate = true;
    effMat.opacity = 0.2 + flowRate * 0.7;
}

// ===== リセット =====
function resetSim() {
    isRunning = false; isFinished = false;
    simTime = 0; V = 0; Lc = 0;
    const p = getParams();
    Ht = p.H0;
    cakeTopY   = FILTER_Y;
    liquidTopY = FILTER_Y + Math.min(p.H0 * SCENE_SCALE, H_MAX * 0.92);

    document.getElementById('res-V').textContent    = '0.000';
    document.getElementById('res-dVdt').textContent = '0.000';
    document.getElementById('res-H').textContent    = (p.H0 * 100).toFixed(1);
    document.getElementById('res-dP').textContent   = (p.rhoF * g * p.H0).toFixed(1);
    document.getElementById('res-Lc').textContent   = '0.000';
    document.getElementById('res-t').textContent    = '0.0';
    document.getElementById('btn-run').textContent  = '▶ 開始';
    document.getElementById('btn-run').classList.remove('running');
    document.getElementById('finish-banner').style.display = 'none';

    hideCake();
    initParticles(cakeTopY, liquidTopY);
}

// ===== ボタン =====
document.getElementById('btn-run').addEventListener('click', () => {
    if (isFinished) return;
    isRunning = !isRunning;
    const btn = document.getElementById('btn-run');
    if (isRunning) { btn.textContent = '⏸ 一時停止'; btn.classList.add('running'); }
    else           { btn.textContent = '▶ 開始';     btn.classList.remove('running'); }
});
document.getElementById('btn-reset').addEventListener('click', resetSim);

// ===== アニメーション =====
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt_real = Math.min(clock.getDelta(), 0.05);
    let dVdt = 0;
    if (isRunning && !isFinished) dVdt = stepPhysics(dt_real);
    update3D(dt_real, dVdt);
    controls.update();
    renderer.render(scene, camera);
}

// ===== カメラ最適化 =====
function optimizeCameraLayout() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    const db = document.getElementById('dashboard');
    const leftEdge = db ? db.getBoundingClientRect().right : 0;
    const availW = Math.max(100, w - leftEdge);
    camera.setViewOffset(w, h, -((leftEdge + availW/2) - w/2), 0, w, h);
    camera.zoom = Math.max(0.6, Math.min(1.4, Math.min(availW/700, h/600)));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener('resize', optimizeCameraLayout);

// ===== 初期化 =====
resetSim();
optimizeCameraLayout();
animate();
