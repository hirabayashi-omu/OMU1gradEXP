/**
 * ろ過シミュレータ  script.js
 *
 * 物理モデル: Ruth の定圧ろ過方程式 (ケーク理論)
 *   dV/dt = ΔP · A² / [μ · (α · m · V + R_m · A)]
 *
 *   m = C_s · ρ_p / (1 - C_s)  [kg固体 / m³ろ液]
 *   ε = ケーク空隙率 (0.4固定)
 *   L_c = C_s · V / [A · (1 - ε)]
 *
 * 可視化:
 *   - 赤い粒子群がスラリー相を表し、ケーク上面へ向かって沈降
 *   - ケーク層はブロックとして積み上がる
 *   - ろ液は底部から青い点として流出
 */

'use strict';

// ===== パラメータ読み込み =====
// alphaの単位をスライダー上は ×10^8 m/kg に変更（適切な可視範囲）
function getParams() {
    return {
        dP:    parseFloat(document.getElementById('sl-pressure').value) * 1e3,  // Pa
        A:     parseFloat(document.getElementById('sl-area').value)    * 1e-4,  // m²
        rhoP:  parseFloat(document.getElementById('sl-rho-p').value),           // kg/m³
        dp:    parseFloat(document.getElementById('sl-dp').value)      * 1e-6,  // m
        Cs:    parseFloat(document.getElementById('sl-cs').value)      * 0.01,  // -
        mu:    parseFloat(document.getElementById('sl-mu').value)      * 1e-3,  // Pa·s
        rhoF:  parseFloat(document.getElementById('sl-rho-f').value),           // kg/m³
        alpha: parseFloat(document.getElementById('sl-alpha').value)   * 1e8,   // m/kg (×10^8)
        Rm:    parseFloat(document.getElementById('sl-rm').value)      * 1e8,   // m⁻¹ (×10^8)
    };
}

// ===== UIリスナー =====
const sliderDefs = [
    ['sl-pressure','vd-pressure', v => v],
    ['sl-area',    'vd-area',     v => v],
    ['sl-rho-p',   'vd-rho-p',   v => v],
    ['sl-dp',      'vd-dp',      v => v],
    ['sl-cs',      'vd-cs',      v => parseFloat(v).toFixed(1)],
    ['sl-mu',      'vd-mu',      v => parseFloat(v).toFixed(1)],
    ['sl-rho-f',   'vd-rho-f',   v => v],
    ['sl-alpha',   'vd-alpha',   v => v],
    ['sl-rm',      'vd-rm',      v => parseFloat(v).toFixed(1)],
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
dirLight.position.set(3, 6, 4);
dirLight.castShadow = true;
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);

// ===== 仮想空間スケール =====
const W = 1.0;
const D = 0.6;
const H_max = 1.6;
const FILTER_Y = 0.025; // ろ布上面 Y

// ===== ろ材 (ろ布) =====
const clothGeo = new THREE.BoxGeometry(W, 0.025, D);
const clothMat = new THREE.MeshPhongMaterial({ color: 0x475569, emissive: 0x1e293b, shininess: 30 });
const filterCloth = new THREE.Mesh(clothGeo, clothMat);
filterCloth.position.set(0, FILTER_Y / 2, 0);
filterCloth.receiveShadow = true;
scene.add(filterCloth);

// ろ布グリッド模様
const grid = new THREE.GridHelper(W, 14, 0x334155, 0x1e293b);
grid.position.set(0, FILTER_Y + 0.001, 0);
scene.add(grid);

// ===== 容器の壁 (半透明) =====
function addWall(w, h, d, x, y, z) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshPhongMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.15, depthWrite: false })
    );
    m.position.set(x, y, z);
    scene.add(m);
}
addWall(0.015, H_max, D,  -W/2, H_max/2, 0);
addWall(0.015, H_max, D,   W/2, H_max/2, 0);
addWall(W + 0.015, H_max, 0.015, 0, H_max/2, -D/2);
addWall(W + 0.015, H_max, 0.015, 0, H_max/2,  D/2);

// ===== ケーク層 (InstancedMesh) =====
const CAKE_N = 50;
const cakeGeo = new THREE.BoxGeometry(1, 1, 1);
const cakeMat = new THREE.MeshPhongMaterial({ color: 0xb45309, emissive: 0x78350f, shininess: 15 });
const cakeMesh = new THREE.InstancedMesh(cakeGeo, cakeMat, CAKE_N);
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
const PARTICLE_COUNT = 600;
const pGeo = new THREE.SphereGeometry(1, 6, 6);
const pMat = new THREE.MeshPhongMaterial({ color: 0xef4444, emissive: 0x7f1d1d, shininess: 60 });
const slurryMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
slurryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(slurryMesh);

// ケーク表面の粒子（積み上がった粒子の表現）
const SURFACE_PARTICLE_COUNT = 300;
const surfGeo = new THREE.SphereGeometry(1, 6, 6);
const surfMat = new THREE.MeshPhongMaterial({ color: 0xdc2626, emissive: 0x7f1d1d, shininess: 40 });
const surfMesh = new THREE.InstancedMesh(surfGeo, surfMat, SURFACE_PARTICLE_COUNT);
surfMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(surfMesh);

// ===== ろ液流出点 =====
const EFF_COUNT = 200;
const effGeo = new THREE.BufferGeometry();
const effPos = new Float32Array(EFF_COUNT * 3);
const effLife = new Float32Array(EFF_COUNT);
for (let i = 0; i < EFF_COUNT; i++) {
    effPos[i*3] = (Math.random()-0.5)*W; effPos[i*3+1] = -0.1; effPos[i*3+2] = (Math.random()-0.5)*D;
    effLife[i] = Math.random();
}
effGeo.setAttribute('position', new THREE.BufferAttribute(effPos, 3));
const effMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.02, transparent: true, opacity: 0.8 });
const effPoints = new THREE.Points(effGeo, effMat);
scene.add(effPoints);

// ===== 粒子データ =====
const particleData = [];
function initParticles(topY) {
    particleData.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particleData.push({
            x: (Math.random()-0.5)*W*0.85,
            y: topY + 0.05 + Math.random()*(H_max - topY - 0.1),
            z: (Math.random()-0.5)*D*0.85,
            vy: -(0.04 + Math.random()*0.06), // scene units/s
            phase: Math.random()*Math.PI*2,
            settled: false,
        });
    }
}

// ===== シミュレーション状態 =====
let isRunning = false;
let simTime  = 0;
let V        = 0;    // ろ液体積 [m³]
let Lc       = 0;    // ケーク厚み [m]
let cakeTopY = FILTER_Y; // scene Y

// ===== グラフデータ =====
const dataVt  = { t: [], V: [] };
const dataTvV = { V: [], tV: [] };

const chartCanvas = document.getElementById('chart-canvas');
const ctx2d = chartCanvas.getContext('2d');
let activeTab = 'vt';

document.getElementById('tab-vt').addEventListener('click', () => {
    activeTab = 'vt';
    document.getElementById('tab-vt').classList.add('active');
    document.getElementById('tab-tv').classList.remove('active');
    drawChart();
});
document.getElementById('tab-tv').addEventListener('click', () => {
    activeTab = 'tv';
    document.getElementById('tab-tv').classList.add('active');
    document.getElementById('tab-vt').classList.remove('active');
    drawChart();
});

function drawChart() {
    const cw = chartCanvas.width, ch = chartCanvas.height;
    ctx2d.clearRect(0,0,cw,ch);
    ctx2d.fillStyle = 'rgba(0,0,0,0.3)';
    ctx2d.fillRect(0,0,cw,ch);

    const pad = {l:44,r:12,t:12,b:30};
    const pw = cw-pad.l-pad.r, ph = ch-pad.t-pad.b;

    let xs, ys, xl, yl;
    if (activeTab === 'vt') {
        xs = dataVt.t; ys = dataVt.V.map(v=>v*1e3); xl='t [s]'; yl='V [L]';
    } else {
        xs = dataTvV.V.map(v=>v*1e6); ys = dataTvV.tV; xl='V [cm³]'; yl='t/V [s/cm³]';
    }

    const xMax = xs.length ? Math.max(...xs)*1.05||1 : 1;
    const yMax = ys.length ? Math.max(...ys)*1.05||1 : 1;

    // 軸
    ctx2d.strokeStyle = 'rgba(255,255,255,0.2)'; ctx2d.lineWidth=1;
    ctx2d.beginPath(); ctx2d.moveTo(pad.l, pad.t); ctx2d.lineTo(pad.l, pad.t+ph); ctx2d.lineTo(pad.l+pw, pad.t+ph); ctx2d.stroke();
    ctx2d.fillStyle='#94a3b8'; ctx2d.font='10px Inter,sans-serif'; ctx2d.textAlign='center';
    ctx2d.fillText(xl, pad.l+pw/2, pad.t+ph+22);
    ctx2d.save(); ctx2d.translate(12, pad.t+ph/2); ctx2d.rotate(-Math.PI/2); ctx2d.fillText(yl,0,0); ctx2d.restore();

    for (let i=0;i<=4;i++) {
        const xv=xMax*i/4, px=pad.l+pw*i/4;
        ctx2d.fillStyle='#64748b'; ctx2d.font='9px Inter,sans-serif'; ctx2d.textAlign='center';
        ctx2d.fillText(xv.toPrecision(2), px, pad.t+ph+12);
        const yv=yMax*i/4, py=pad.t+ph-ph*i/4;
        ctx2d.textAlign='right'; ctx2d.fillText(yv.toPrecision(2), pad.l-3, py+3);
    }

    if (xs.length >= 2) {
        ctx2d.strokeStyle='#38bdf8'; ctx2d.lineWidth=2; ctx2d.beginPath();
        for (let i=0;i<xs.length;i++) {
            const px=pad.l+(xs[i]/xMax)*pw, py=pad.t+ph-(ys[i]/yMax)*ph;
            i===0 ? ctx2d.moveTo(px,py) : ctx2d.lineTo(px,py);
        }
        ctx2d.stroke();
    }
}

// ===== 物理演算: Ruth 定圧ろ過 =====
function stepPhysics(dt_real) {
    const p = getParams();
    const SIM_SPEED = 15.0; // 加速倍率
    const dt = dt_real * SIM_SPEED;

    // 堆積固体質量係数 [kg solid / m³ filtrate]
    const Cs = p.Cs;
    const m = Cs * p.rhoP / Math.max(1 - Cs, 0.01);

    // Ruth 方程式: dV/dt = ΔP·A² / [μ·(α·m·V + Rm·A)]
    const denom = p.mu * (p.alpha * m * V + p.Rm * p.A);
    const dVdt = (p.dP * p.A * p.A) / Math.max(denom, 1e-20); // [m³/s]

    V += dVdt * dt;
    simTime += dt;

    // ケーク厚み [m]
    const eps = 0.4;
    Lc = Cs * V / (p.A * (1 - eps));

    // グラフデータ
    const MAX_PTS = 250;
    if (dataVt.t.length === 0 || simTime - dataVt.t[dataVt.t.length-1] > 0.3) {
        dataVt.t.push(simTime); dataVt.V.push(V);
        if (V > 0) { dataTvV.V.push(V); dataTvV.tV.push(simTime / (V*1e6)); }
        if (dataVt.t.length > MAX_PTS) { dataVt.t.shift(); dataVt.V.shift(); }
        if (dataTvV.V.length > MAX_PTS) { dataTvV.V.shift(); dataTvV.tV.shift(); }
    }

    // UI
    document.getElementById('res-V').textContent    = (V*1e3).toFixed(3);
    document.getElementById('res-dVdt').textContent = (dVdt*1e6).toFixed(3);
    document.getElementById('res-Lc').textContent   = (Lc*1e3).toFixed(3);
    document.getElementById('res-t').textContent    = simTime.toFixed(1);

    return dVdt;
}

// ===== 3D更新 =====
function update3D(dt_real, dVdt) {
    const p = getParams();

    // ケーク上端 Y (scene)
    // SCENE_SCALE で物理厚みをscene座標に変換
    // 1m の物理 → SCENE_SCALE [scene unit]
    const SCENE_SCALE = 4.0;
    // ケークの最大視覚高さをH_maxの60%に制限
    cakeTopY = FILTER_Y + Math.min(Lc * SCENE_SCALE, H_max * 0.6);

    // --- ケーク層描画 ---
    const cakeH = cakeTopY - FILTER_Y;
    if (cakeH < 0.001) {
        hideCake();
    } else {
        const layerH = cakeH / CAKE_N;
        for (let i = 0; i < CAKE_N; i++) {
            dummy.position.set(0, FILTER_Y + layerH * (i + 0.5), 0);
            dummy.scale.set(W * 0.995, layerH, D * 0.995);
            dummy.updateMatrix();
            cakeMesh.setMatrixAt(i, dummy.matrix);
            // 下層ほど圧縮されて濃い色
            const t = i / CAKE_N;
            cakeMesh.setColorAt(i, new THREE.Color().setHSL(0.08, 0.75, 0.22 + t * 0.18));
        }
        cakeMesh.instanceMatrix.needsUpdate = true;
        if (cakeMesh.instanceColor) cakeMesh.instanceColor.needsUpdate = true;
    }

    // --- スラリー浮遊粒子 ---
    const pSize = Math.max(0.008, Math.min(0.025, p.dp * 1e6 * 0.00025));
    let settledCount = 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const pd = particleData[i];

        if (isRunning && !pd.settled) {
            pd.y += pd.vy * dt_real;
            // 横方向ゆらぎ
            pd.x += Math.sin(pd.phase + simTime * 0.8) * 0.0015;
            pd.z += Math.cos(pd.phase + simTime * 0.6) * 0.0015;
        }

        // ケーク面到達 → 着地（蓄積表現）
        if (pd.y < cakeTopY + pSize * 2 && !pd.settled && isRunning) {
            pd.y = cakeTopY + pSize * 2;
            pd.settled = true;
            settledCount++;
        }

        // 着地した粒子は一定時間後に上部から再投入（リサイクル）
        if (pd.settled) {
            settledCount++;
            // 着地位置をcakeTopYに追従させる
            pd.y = cakeTopY + pSize * 2 + (Math.random() < 0.001 && isRunning ? 999 : 0);
        }

        // リサイクル判定（上部から再投入）
        if (pd.y > 1e6 || (pd.settled && Math.random() < (isRunning ? 0.003 : 0))) {
            pd.x = (Math.random()-0.5)*W*0.85;
            pd.y = cakeTopY + 0.08 + Math.random()*(H_max - cakeTopY - 0.12);
            pd.z = (Math.random()-0.5)*D*0.85;
            pd.vy = -(0.04 + Math.random()*0.06);
            pd.settled = false;
        }

        // 壁クランプ
        pd.x = Math.max(-W/2*0.9, Math.min(W/2*0.9, pd.x));
        pd.z = Math.max(-D/2*0.9, Math.min(D/2*0.9, pd.z));
        pd.y = Math.min(pd.y, H_max * 0.95);

        dummy.position.set(pd.x, pd.y, pd.z);
        dummy.scale.setScalar(pSize);
        dummy.updateMatrix();
        slurryMesh.setMatrixAt(i, dummy.matrix);
    }
    slurryMesh.instanceMatrix.needsUpdate = true;

    // --- ケーク表面粒子（積み上がった粒子層の外観） ---
    const surfPSize = pSize * 0.9;
    const cols = Math.ceil(Math.sqrt(SURFACE_PARTICLE_COUNT));
    for (let i = 0; i < SURFACE_PARTICLE_COUNT; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const sx = (col / cols - 0.5) * W * 0.92;
        const sz = (row / cols - 0.5) * D * 0.92;
        // ケーク上面が薄い→粒子は非表示、厚くなると表示
        const visibleLayers = Math.floor(cakeH / (surfPSize * 2.5));
        const layerIdx = Math.floor(Math.random() * Math.max(1, visibleLayers));
        const sy = cakeH < 0.001 ? -100 : FILTER_Y + surfPSize + layerIdx * surfPSize * 2.2;

        dummy.position.set(sx, Math.min(sy, cakeTopY), sz);
        dummy.scale.setScalar(cakeH > 0.001 ? surfPSize : 0);
        dummy.updateMatrix();
        surfMesh.setMatrixAt(i, dummy.matrix);
    }
    surfMesh.instanceMatrix.needsUpdate = true;

    // --- ろ液流出点 ---
    const efPos = effGeo.attributes.position.array;
    const flowRate = isRunning ? Math.min(1.0, dVdt * 1e4) : 0.05;
    for (let i = 0; i < EFF_COUNT; i++) {
        effLife[i] -= dt_real * (0.5 + flowRate);
        if (effLife[i] <= 0) {
            efPos[i*3]   = (Math.random()-0.5)*W*0.75;
            efPos[i*3+1] = -0.04;
            efPos[i*3+2] = (Math.random()-0.5)*D*0.75;
            effLife[i]   = 0.5 + Math.random();
        } else {
            efPos[i*3+1] -= dt_real * (0.05 + flowRate * 0.1);
        }
    }
    effGeo.attributes.position.needsUpdate = true;
    effMat.opacity = 0.3 + flowRate * 0.6;
}

// ===== リセット =====
function resetSim() {
    isRunning = false;
    simTime = 0; V = 0; Lc = 0;
    cakeTopY = FILTER_Y;

    dataVt.t.length = 0; dataVt.V.length = 0;
    dataTvV.V.length = 0; dataTvV.tV.length = 0;

    document.getElementById('res-V').textContent    = '0.000';
    document.getElementById('res-dVdt').textContent = '0.000';
    document.getElementById('res-Lc').textContent   = '0.000';
    document.getElementById('res-t').textContent    = '0.0';
    document.getElementById('btn-run').textContent  = '▶ 開始';
    document.getElementById('btn-run').classList.remove('running');

    hideCake();
    initParticles(FILTER_Y);
    drawChart();
}

// ===== ボタン =====
document.getElementById('btn-run').addEventListener('click', () => {
    isRunning = !isRunning;
    const btn = document.getElementById('btn-run');
    if (isRunning) {
        btn.textContent = '⏸ 一時停止';
        btn.classList.add('running');
    } else {
        btn.textContent = '▶ 開始';
        btn.classList.remove('running');
    }
});
document.getElementById('btn-reset').addEventListener('click', resetSim);

// ===== アニメーション =====
const clock = new THREE.Clock();
let chartTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt_real = Math.min(clock.getDelta(), 0.05);

    let dVdt = 0;
    if (isRunning) dVdt = stepPhysics(dt_real);

    update3D(dt_real, dVdt);

    chartTimer += dt_real;
    if (chartTimer > 0.4) { chartTimer = 0; drawChart(); }

    controls.update();
    renderer.render(scene, camera);
}

// ===== カメラ最適化 =====
function optimizeCameraLayout() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    let leftEdge = 0;
    const db = document.getElementById('dashboard');
    if (db) leftEdge = db.getBoundingClientRect().right;
    const availW = Math.max(100, w - leftEdge);
    const shiftPx = (leftEdge + availW/2) - w/2;
    camera.setViewOffset(w, h, -shiftPx, 0, w, h);
    camera.zoom = Math.max(0.6, Math.min(1.4, Math.min(availW/700, h/600)));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', optimizeCameraLayout);

// ===== 初期化 =====
resetSim();
optimizeCameraLayout();
animate();
