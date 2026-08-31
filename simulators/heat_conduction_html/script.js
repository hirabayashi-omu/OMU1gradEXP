/**
 * 熱の可視化シミュレーター (パイプ熱伝導 ＆ CPUクーラー放熱モデル・内部温度断面可視化)
 * 共通の非定常熱伝導計算エンジン (FVM: 有限体積法) による温度分布可視化
 */

const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

let baseFrustumSize = 0.4;
const aspect = window.innerWidth / window.innerHeight;
let frustumSize = Math.max(baseFrustumSize, 0.5 / aspect);
const camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.001, 1000);
camera.position.set(-0.03, 0.20, 0.15);
camera.zoom = 2.5;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.localClippingEnabled = true; // 断面カット表示用
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0.07, 0.05, 0);
controls.update();

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(0.5, 1, 1);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4);
dirLight2.position.set(-0.5, -0.5, -1);
scene.add(dirLight2);

// ─── 3D Groups for Scene Management ───
const pipeGroup = new THREE.Group();
const cpuGroup = new THREE.Group();
scene.add(pipeGroup);
scene.add(cpuGroup);
cpuGroup.visible = false;

// ─── Simulation State ───
let currentSimMode = 'pipe'; // 'pipe' or 'cpu'
let isPlaying = false;
let simulationTime = 0;
let dt = 1.0;
const multiplier = 20.0;

// ─── Flame Particle System (Pipe Mode) ───
let flameCenter = 0;
let flameSpread = 0.08;
const particleCount = 200;
const flameGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const velocities = [];
for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.02;
    positions[i * 3 + 1] = flameCenter + (Math.random() - 0.5) * flameSpread;
    positions[i * 3 + 2] = -0.01 - Math.random() * 0.03;
    velocities.push({
        y: 0.0005 + Math.random() * 0.001,
        x: (Math.random() - 0.5) * 0.0005,
        z: (Math.random() - 0.5) * 0.0005,
        life: Math.random()
    });
}
flameGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const canvasFl = document.createElement('canvas');
canvasFl.width = 32; canvasFl.height = 32;
const ctxFl = canvasFl.getContext('2d');
const gradient = ctxFl.createRadialGradient(16, 16, 0, 16, 16, 16);
gradient.addColorStop(0, 'rgba(255,255,255,1)');
gradient.addColorStop(1, 'rgba(255,255,255,0)');
ctxFl.fillStyle = gradient;
ctxFl.fillRect(0, 0, 32, 32);
const flameTexture = new THREE.CanvasTexture(canvasFl);

const flameMat = new THREE.PointsMaterial({
    color: 0xff6600,
    size: 15,
    map: flameTexture,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const flameParticles = new THREE.Points(flameGeo, flameMat);
flameParticles.visible = false;
pipeGroup.add(flameParticles);

// Background Grid (Pipe Mode)
const gridHelper = new THREE.GridHelper(0.5, 25, 0x555555, 0x222222);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.position.set(0.21, 0, -0.05);
pipeGroup.add(gridHelper);

// ─── Heatmap Color Mapping ───
function getHeatmapColor(val) {
    let r = 0, g = 0, b = 0;
    val = Math.max(0, Math.min(1, val));
    if (val < 0.2) { b = 1; g = val * 5; }
    else if (val < 0.4) { g = 1; b = 1 - (val - 0.2) * 5; }
    else if (val < 0.6) { g = 1; r = (val - 0.4) * 5; }
    else if (val < 0.8) { r = 1; g = 1 - (val - 0.6) * 5; }
    else { r = 1; g = (val - 0.8) * 5; b = (val - 0.8) * 5; }
    return new THREE.Color(r, g, b);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. パイプ熱伝導モデル (FVM Cylindrical Solver)
// ══════════════════════════════════════════════════════════════════════════
const Nr = 3;
const Ntheta = 16;
const Nz = 60;
const D = 0.006;
const r_out = D / 2;
const r_in = r_out - 0.0012;
const L = 0.4;
const dr = (r_out - r_in) / Nr;
const dtheta = 2 * Math.PI / Ntheta;
const dz = L / Nz;

function getIdx(i, j, k) {
    const jj = (j + Ntheta) % Ntheta;
    return k * (Ntheta * Nr) + jj * Nr + i;
}

const cellProps = [];
for (let i = 0; i < Nr; i++) {
    const r_inner = r_in + i * dr;
    const r_outer = r_in + (i + 1) * dr;
    const r_center = r_in + (i + 0.5) * dr;
    cellProps.push({
        A_r_minus: r_inner * dtheta * dz,
        A_r_plus: r_outer * dtheta * dz,
        A_theta: dr * dz,
        A_z: 0.5 * (r_outer * r_outer - r_inner * r_inner) * dtheta,
        V: 0.5 * (r_outer * r_outer - r_inner * r_inner) * dtheta * dz,
        dist_r: dr,
        dist_theta: r_center * dtheta,
        dist_z: dz
    });
}

const allMaterials = {
    'アルミ合金(6063系相当)': { name: 'アルミニウム', k: 237, rho: 2700, c: 900, color: '#1e90ff' },
    '銅': { name: '銅', k: 401, rho: 8960, c: 385, color: '#ff6b81' },
    'ステンレス（SUS304）': { name: 'ステンレス', k: 16, rho: 8000, c: 500, color: '#2ed573' },
    '鉄': { name: '鉄', k: 50, rho: 7870, c: 440, color: '#a4b0be' },
    '真鍮': { name: '真鍮', k: 109, rho: 8500, c: 380, color: '#eccc68' },
    '銀': { name: '銀', k: 429, rho: 10490, c: 235, color: '#ced6e0' },
    'ガラス': { name: 'ガラス', k: 1, rho: 2500, c: 750, color: '#7bed9f' },
    'ヒートパイプ': { name: 'ヒートパイプ', k: 5000, rho: 3000, c: 500, color: '#ff4757' }
};

let pipes = [];
let meltChartInstance = null;
const targetDistances = [];
const targetLabels = [];
const nullData = [];
for (let i = 2; i <= 12; i += 2) {
    targetDistances.push(i / 100);
    targetLabels.push(i.toString());
    nullData.push(null);
}

const solidWaxMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.1, opacity: 0.9, transparent: true, roughness: 0.2 });
const meltedWaxMat = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, transmission: 0.9, opacity: 0.3, transparent: true, roughness: 0.1 });
const waxGeo = new THREE.SphereGeometry(0.003, 16, 16);

let flameTemp = 850;
const flameTempSlider = document.getElementById('flame-temp-slider');
const flameTempVal = document.getElementById('flame-temp-val');
const uiFlameTemp = document.getElementById('ui-flame-temp');
if (flameTempSlider && flameTempVal) {
    flameTempSlider.addEventListener('input', (e) => {
        flameTemp = parseFloat(e.target.value);
        flameTempVal.textContent = flameTemp;
        if (uiFlameTemp) uiFlameTemp.textContent = flameTemp;
    });
}

function setupPipesAndChart() {
    pipes.forEach(pipe => {
        pipeGroup.remove(pipe.mesh);
        pipe.mesh.geometry.dispose();
        pipe.mesh.material.dispose();
        if (pipe.labelSprite) pipeGroup.remove(pipe.labelSprite);
        pipe.isothermSprites.forEach(s => { pipeGroup.remove(s.sprite); });
        pipe.isothermLines.forEach(l => { pipeGroup.remove(l.line); });
        if (pipe.waxParticles) {
            pipe.waxParticles.forEach(w => { pipeGroup.remove(w.mesh); });
        }
    });
    pipes = [];

    const checkboxes = document.querySelectorAll('.mat-checkbox');
    const activeMats = [];
    checkboxes.forEach(cb => {
        if (cb.checked && allMaterials[cb.value]) {
            activeMats.push(allMaterials[cb.value]);
        }
    });

    const spacing = 0.04;
    activeMats.forEach((mat, idx) => {
        const yOffset = (activeMats.length === 1) ? 0 : ((activeMats.length - 1) / 2 - idx) * spacing;

        const shape = new THREE.Shape();
        shape.absarc(0, 0, r_out, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, r_in, 0, Math.PI * 2, true);
        shape.holes.push(holePath);

        const extrudeSettings = { depth: L, curveSegments: 24, steps: Nz * 2, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateY(Math.PI / 2);
        geometry.translate(0, yOffset, 0);

        const count = geometry.attributes.position.count;
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
        const mesh = new THREE.Mesh(geometry, material);
        pipeGroup.add(mesh);

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.roundRect(20, 20, 472, 88, 30);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 6;
        ctx.font = 'bold 44px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mat.name, 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, side: THREE.DoubleSide });
        const labelGeo = new THREE.PlaneGeometry(0.045, 0.011);
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.set(0.03, yOffset + 0.018, 0.005);
        labelMesh.rotation.x = -Math.PI / 6;
        labelMesh.renderOrder = 999;
        pipeGroup.add(labelMesh);

        const isothermSprites = [];
        const isothermLines = [];
        const targetIsotherms = [50, 100, 300, 500, 700, 900, 1100];
        for (let T_iso of targetIsotherms) {
            const canvasIso = document.createElement('canvas');
            canvasIso.width = 128; canvasIso.height = 64;
            const ctxIso = canvasIso.getContext('2d');
            ctxIso.fillStyle = 'rgba(0,0,0,0)';
            ctxIso.fillRect(0, 0, 128, 64);
            ctxIso.fillStyle = 'white';
            ctxIso.shadowColor = "black";
            ctxIso.shadowBlur = 4;
            ctxIso.font = 'bold 24px Inter, sans-serif';
            ctxIso.textAlign = 'center';
            ctxIso.fillText(`${T_iso}℃`, 64, 40);
            const texIso = new THREE.CanvasTexture(canvasIso);
            const spriteMatIso = new THREE.SpriteMaterial({ map: texIso });
            const spriteIso = new THREE.Sprite(spriteMatIso);
            spriteIso.scale.set(0.04, 0.02, 1);
            pipeGroup.add(spriteIso);
            isothermSprites.push({ T: T_iso, sprite: spriteIso });

            const lineGeom = new THREE.BufferGeometry();
            lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
                0, yOffset + r_out * 1.5, r_out,
                0, yOffset - r_out * 1.5, r_out
            ], 3));
            const lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.003, gapSize: 0.003 });
            const line = new THREE.Line(lineGeom, lineMat);
            line.computeLineDistances();
            pipeGroup.add(line);
            isothermLines.push({ T: T_iso, line: line });
        }

        pipes.push({
            ...mat,
            yOffset,
            mesh,
            labelSprite: labelMesh,
            isothermSprites,
            isothermLines,
            waxParticles: [],
            meltTimes: [...nullData],
            T: new Float64Array(Nr * Ntheta * Nz).fill(20)
        });
    });

    pipes.forEach(pipe => {
        targetDistances.forEach((dist, distIdx) => {
            if (distIdx >= 6) return;
            const waxMesh = new THREE.Mesh(waxGeo, solidWaxMat.clone());
            waxMesh.position.set(dist, pipe.yOffset + r_out, 0);
            pipeGroup.add(waxMesh);
            pipe.waxParticles.push({ mesh: waxMesh, isMelted: false });
        });
    });

    if (pipes.length > 0) {
        const yMax = pipes[0].yOffset;
        const yMin = pipes[pipes.length - 1].yOffset;
        flameSpread = Math.max(0.08, (yMax - yMin) + 0.04);
        flameCenter = (yMax + yMin) / 2;
    }

    setupPipeChart();

    let dt_safe = 1.0;
    pipes.forEach(pipe => {
        const p = cellProps[0];
        const conductances = pipe.k * (p.A_r_plus / p.dist_r + p.A_r_minus / p.dist_r + 2 * p.A_theta / p.dist_theta + 2 * p.A_z / p.dist_z);
        const dt_max = (pipe.rho * pipe.c * p.V) / conductances;
        if (dt_max < dt_safe) dt_safe = dt_max * 0.9;
    });
    if (pipes.length === 0) dt_safe = 0.01;
    dt = dt_safe;

    isPlaying = false;
    if (flameParticles) flameParticles.visible = false;
    simulationTime = 0;
    document.getElementById('time-display').textContent = formatTime(simulationTime);
    updatePipeColors();
    updateIsotherms();
}

function setupPipeChart() {
    if (meltChartInstance) meltChartInstance.destroy();
    const datasets = pipes.map(pipe => ({
        label: pipe.name + 'パイプ',
        borderColor: pipe.color,
        backgroundColor: pipe.color,
        data: [...nullData],
        tension: 0.1
    }));

    const ctxChart = document.getElementById('meltChart').getContext('2d');
    meltChartInstance = new Chart(ctxChart, {
        type: 'line',
        data: { labels: targetLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            color: '#cbd5e1',
            scales: {
                x: { title: { display: true, text: '加熱端からの距離 (cm)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { title: { display: true, text: '融解時間 (sec)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, min: 0 }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } },
                title: { display: true, text: '図：加熱端からの距離(cm)とパラフィン融解時間の関係', color: '#f8fafc' }
            }
        }
    });
}

function updatePipeColors() {
    pipes.forEach(pipe => {
        const positions = pipe.mesh.geometry.attributes.position;
        const colors = pipe.mesh.geometry.attributes.color;
        for (let idx = 0; idx < positions.count; idx++) {
            const X = positions.getX(idx);
            const Y = positions.getY(idx);
            const Z = positions.getZ(idx);
            const z_sim = X;
            const Y_orig = Y - pipe.yOffset;
            const X_orig = -Z;
            const r_sim = Math.sqrt(X_orig * X_orig + Y_orig * Y_orig);
            let theta_sim = Math.atan2(Y_orig, X_orig);
            if (theta_sim < 0) theta_sim += 2 * Math.PI;
            let i = Math.max(0, Math.min(Nr - 1, Math.floor((r_sim - r_in) / dr)));
            let j = Math.max(0, Math.min(Ntheta - 1, Math.floor(theta_sim / dtheta)));
            let k_z = Math.max(0, Math.min(Nz - 1, Math.floor(z_sim / dz)));
            const temp = pipe.T[getIdx(i, j, k_z)];
            const tempNorm = Math.max(0, Math.min(1, (temp - 20) / 980));
            const color = getHeatmapColor(tempNorm);
            colors.setXYZ(idx, color.r, color.g, color.b);
        }
        colors.needsUpdate = true;
    });
}

function stepPipeSimulation() {
    const h = 10;
    const h_end = 10;
    const T_inf = 20;

    pipes.forEach(pipe => {
        const T = pipe.T;
        const T_new = new Float64Array(T.length);
        const k = pipe.k;
        const mass_factor = dt / (pipe.rho * pipe.c);

        for (let i = 0; i < Nr; i++) {
            const props = cellProps[i];
            const factor = mass_factor / props.V;
            for (let j = 0; j < Ntheta; j++) {
                const j_minus = (j - 1 + Ntheta) % Ntheta;
                const j_plus = (j + 1) % Ntheta;
                for (let k_z = 0; k_z < Nz; k_z++) {
                    const idx = getIdx(i, j, k_z);
                    const t_current = T[idx];
                    let Q = 0;
                    if (i > 0) Q += k * (T[getIdx(i - 1, j, k_z)] - t_current) / props.dist_r * props.A_r_minus;
                    if (i < Nr - 1) Q += k * (T[getIdx(i + 1, j, k_z)] - t_current) / props.dist_r * props.A_r_plus;
                    else Q += h * (T_inf - t_current) * props.A_r_plus;

                    Q += k * (T[getIdx(i, j_minus, k_z)] - t_current) / props.dist_theta * props.A_theta;
                    Q += k * (T[getIdx(i, j_plus, k_z)] - t_current) / props.dist_theta * props.A_theta;

                    if (k_z > 0) Q += k * (T[getIdx(i, j, k_z - 1)] - t_current) / props.dist_z * props.A_z;
                    else Q += k * (flameTemp - t_current) / (props.dist_z / 2) * props.A_z;

                    if (k_z < Nz - 1) Q += k * (T[getIdx(i, j, k_z + 1)] - t_current) / props.dist_z * props.A_z;
                    else Q += h_end * (T_inf - t_current) * props.A_z;

                    T_new[idx] = t_current + factor * Q;
                }
            }
        }
        pipe.T = T_new;
    });
}

function updateIsotherms() {
    pipes.forEach(pipe => {
        const profile = new Float64Array(Nz);
        for (let k = 0; k < Nz; k++) profile[k] = pipe.T[getIdx(Nr - 1, 0, k)];
        let lastDrawnX = -999;
        for (let i = pipe.isothermSprites.length - 1; i >= 0; i--) {
            const iso = pipe.isothermSprites[i];
            const lineObj = pipe.isothermLines[i];
            const targetT = iso.T;
            let foundX = -1;
            for (let k = 0; k < Nz - 1; k++) {
                const T_k = profile[k];
                const T_kp1 = profile[k + 1];
                if (T_k >= targetT && T_kp1 <= targetT) {
                    let weight = (T_k - targetT) / (T_k - T_kp1);
                    if (isNaN(weight) || !isFinite(weight)) weight = 0;
                    foundX = (k + 0.5) * dz + weight * dz;
                    break;
                }
            }
            if (foundX >= 0) {
                if (targetT !== 50 && foundX - lastDrawnX < 0.035) {
                    iso.sprite.visible = false;
                    lineObj.line.visible = false;
                } else {
                    iso.sprite.visible = true;
                    lineObj.line.visible = true;
                    iso.sprite.position.set(foundX, pipe.yOffset - r_out * 3.5, r_out);
                    lineObj.line.position.x = foundX;
                    lastDrawnX = foundX;
                }
            } else {
                iso.sprite.visible = false;
                lineObj.line.visible = false;
            }
        }
    });
}

function checkMeltingTimes() {
    let chartUpdated = false;
    pipes.forEach((pipe, pipeIdx) => {
        const profile = new Float64Array(Nz);
        for (let k = 0; k < Nz; k++) profile[k] = pipe.T[getIdx(Nr - 1, 0, k)];
        targetDistances.forEach((dist, distIdx) => {
            const k_float = dist / dz - 0.5;
            const k0 = Math.floor(k_float);
            const k1 = k0 + 1;
            let tempAtDist = 20;
            if (k0 >= 0 && k1 < Nz) {
                const weight = k_float - k0;
                tempAtDist = (1 - weight) * profile[k0] + weight * profile[k1];
            } else if (k0 < 0) {
                tempAtDist = profile[0];
            } else {
                tempAtDist = profile[Nz - 1];
            }
            if (tempAtDist >= 50) {
                if (pipe.meltTimes[distIdx] === null) {
                    pipe.meltTimes[distIdx] = simulationTime;
                    if (meltChartInstance && meltChartInstance.data.datasets[pipeIdx]) {
                        meltChartInstance.data.datasets[pipeIdx].data[distIdx] = simulationTime;
                        chartUpdated = true;
                    }
                }
                if (distIdx < 6 && pipe.waxParticles[distIdx]) {
                    const wax = pipe.waxParticles[distIdx];
                    if (!wax.isMelted) {
                        wax.isMelted = true;
                        wax.mesh.scale.set(1.5, 0.2, 1.5);
                        wax.mesh.position.y = pipe.yOffset + r_out + 0.0005;
                        wax.mesh.material = meltedWaxMat;
                    }
                }
            }
        });
    });
    if (chartUpdated && meltChartInstance) meltChartInstance.update();
}

// ══════════════════════════════════════════════════════════════════════════
// 2. CPUクーラー放熱モデル (3D Heat Sink + Heat Pipe + Cutaway FVM Solver)
// ══════════════════════════════════════════════════════════════════════════

// CPUクーラー パラメータ
let cpuTDP = 125.0; // Watts
let fanRPM = 1500;  // RPM
let coolerType = 'heatpipe_al'; // 'heatpipe_al', 'solid_al', 'all_copper'
let cutawayMode = 'half'; // 'none', 'half', 'quarter'
let sliceZOffset = 0.0;
let showHeatFluxVectors = true;
let showProbeCallout = true;

// FVM 節点離散化
const NUM_FINS = 42;
const NUM_HP_NODES = 12;
const FIN_SPACING = 0.0024;
const FIN_BOTTOM_Y = -0.015;

// 熱容量 [J/K]
const C_CPU = 0.045 * 0.045 * 0.004 * 8960 * 385;
const C_BASE = 0.05 * 0.05 * 0.008 * 8960 * 385;
const C_HP_NODE = (0.012 * 8960 * 385) / NUM_HP_NODES;
const C_FIN = (0.120 * 0.050 * 0.0004) * 2700 * 900;

// 温度状態ベクトル
let T_cpu = 20.0;
let T_base = 20.0;
let T_hp = new Float64Array(NUM_HP_NODES).fill(20.0);
let T_fins = new Float64Array(NUM_FINS).fill(20.0);
let T_air_out = 20.0;

// 3D メッシュ参照
let cpuCoolerMeshes = {
    base: null,
    cpuDie: null,
    heatPipes: [],
    finMeshes: [],
    fanBlades: null,
    fanGroup: null,
    airflowParticles: null,
    sliceContourPlane: null,
    heatFluxArrowsGroup: null,
    probeCalloutMesh: null,
    clippableMaterials: []
};

// 断面クリッピング平面
const clipPlaneZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const clipPlaneX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

function updateClippingPlanes() {
    clipPlaneZ.constant = sliceZOffset;
    clipPlaneX.constant = 0.0;

    let planes = [];
    if (cutawayMode === 'half') {
        planes = [clipPlaneZ];
    } else if (cutawayMode === 'quarter') {
        planes = [clipPlaneZ, clipPlaneX];
    }

    cpuCoolerMeshes.clippableMaterials.forEach(mat => {
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
        mat.needsUpdate = true;
    });

    if (cpuCoolerMeshes.sliceContourPlane) {
        cpuCoolerMeshes.sliceContourPlane.visible = (cutawayMode !== 'none');
        cpuCoolerMeshes.sliceContourPlane.position.z = sliceZOffset;
    }

    if (cpuCoolerMeshes.heatFluxArrowsGroup) {
        cpuCoolerMeshes.heatFluxArrowsGroup.visible = showHeatFluxVectors;
        cpuCoolerMeshes.heatFluxArrowsGroup.position.z = sliceZOffset * 0.5;
    }

    if (cpuCoolerMeshes.probeCalloutMesh) {
        cpuCoolerMeshes.probeCalloutMesh.visible = showProbeCallout;
    }
}

function buildCPUCooler3D() {
    while (cpuGroup.children.length > 0) {
        const obj = cpuGroup.children[0];
        cpuGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    }
    cpuCoolerMeshes.heatPipes = [];
    cpuCoolerMeshes.finMeshes = [];
    cpuCoolerMeshes.clippableMaterials = [];

    // 1. マザーボード PCB
    const pcbGeo = new THREE.BoxGeometry(0.26, 0.004, 0.26);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0a192f, roughness: 0.8, metalness: 0.1 });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbMesh.position.set(0, -0.045, 0);
    cpuGroup.add(pcbMesh);

    // RAMスロット
    for (let r = 0; r < 2; r++) {
        const ramGeo = new THREE.BoxGeometry(0.006, 0.025, 0.13);
        const ramMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
        const ramMesh = new THREE.Mesh(ramGeo, ramMat);
        ramMesh.position.set(0.08 + r * 0.015, -0.030, 0);
        cpuGroup.add(ramMesh);
    }

    // 2. CPU Die / IHS (Integrated Heat Spreader)
    const cpuGeo = new THREE.BoxGeometry(0.042, 0.004, 0.042);
    cpuGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cpuGeo.attributes.position.count * 3), 3));
    const cpuMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.2, side: THREE.DoubleSide });
    const cpuMesh = new THREE.Mesh(cpuGeo, cpuMat);
    cpuMesh.position.set(0, -0.040, 0);
    cpuGroup.add(cpuMesh);
    cpuCoolerMeshes.cpuDie = cpuMesh;
    cpuCoolerMeshes.clippableMaterials.push(cpuMat);

    // 3. クーラーベースブロック (銅ベース)
    const baseGeo = new THREE.BoxGeometry(0.052, 0.008, 0.052);
    baseGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(baseGeo.attributes.position.count * 3), 3));
    const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.2, side: THREE.DoubleSide });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, -0.034, 0);
    cpuGroup.add(baseMesh);
    cpuCoolerMeshes.base = baseMesh;
    cpuCoolerMeshes.clippableMaterials.push(baseMat);

    // 4. ヒートパイプ (4本 U字型銅パイプ)
    const hpOffsets = [
        { x: -0.016, z: -0.010 },
        { x: -0.016, z:  0.010 },
        { x:  0.016, z: -0.010 },
        { x:  0.016, z:  0.010 }
    ];

    hpOffsets.forEach(pos => {
        const p1 = -0.020;
        const p2 = FIN_BOTTOM_Y + NUM_FINS * FIN_SPACING + 0.008;
        const tubeGeo = new THREE.CylinderGeometry(0.003, 0.003, (p2 - p1), 16, 24);
        tubeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tubeGeo.attributes.position.count * 3), 3));
        const tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.15, side: THREE.DoubleSide });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        tubeMesh.position.set(pos.x, (p1 + p2) / 2, pos.z);
        cpuGroup.add(tubeMesh);

        const capGeo = new THREE.ConeGeometry(0.0032, 0.006, 12);
        const capMesh = new THREE.Mesh(capGeo, tubeMat);
        capMesh.position.set(pos.x, p2 + 0.003, pos.z);
        cpuGroup.add(capMesh);

        cpuCoolerMeshes.heatPipes.push({ mesh: tubeMesh, cap: capMesh, x: pos.x, z: pos.z });
        cpuCoolerMeshes.clippableMaterials.push(tubeMat);
    });

    // 5. アルミ放熱フィン積層群 (42枚の平行薄板)
    const finW = 0.120;
    const finD = 0.050;
    const finThick = 0.0004;

    for (let f = 0; f < NUM_FINS; f++) {
        const finY = FIN_BOTTOM_Y + f * FIN_SPACING;
        const finGeo = new THREE.BoxGeometry(finW, finThick, finD);
        finGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(finGeo.attributes.position.count * 3), 3));
        const finMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.25, side: THREE.DoubleSide });
        const finMesh = new THREE.Mesh(finGeo, finMat);
        finMesh.position.set(0, finY, 0);
        cpuGroup.add(finMesh);
        cpuCoolerMeshes.finMeshes.push(finMesh);
        cpuCoolerMeshes.clippableMaterials.push(finMat);
    }

    // 6. 120mm 冷却ファン
    const fanGroup = new THREE.Group();
    fanGroup.position.set(0, FIN_BOTTOM_Y + (NUM_FINS * FIN_SPACING) / 2, finD / 2 + 0.015);

    const frameGeo = new THREE.BoxGeometry(0.125, 0.125, 0.018);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    fanGroup.add(frameMesh);
    cpuCoolerMeshes.clippableMaterials.push(frameMat);

    const ringGeo = new THREE.TorusGeometry(0.056, 0.005, 16, 32);
    const ringMesh = new THREE.Mesh(ringGeo, frameMat);
    ringMesh.position.z = 0.009;
    fanGroup.add(ringMesh);

    const fanBladeGroup = new THREE.Group();
    const hubGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.015, 24);
    hubGeo.rotateX(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    fanBladeGroup.add(hubMesh);
    cpuCoolerMeshes.clippableMaterials.push(hubMat);

    const bladeGeo = new THREE.BoxGeometry(0.042, 0.012, 0.0018);
    bladeGeo.rotateZ(Math.PI / 6);
    for (let b = 0; b < 9; b++) {
        const angle = (b / 9) * Math.PI * 2;
        const bladeMesh = new THREE.Mesh(bladeGeo, hubMat);
        bladeMesh.position.set(Math.cos(angle) * 0.032, Math.sin(angle) * 0.032, 0.002);
        bladeMesh.rotation.z = angle + 0.3;
        fanBladeGroup.add(bladeMesh);
    }
    fanGroup.add(fanBladeGroup);
    cpuGroup.add(fanGroup);
    cpuCoolerMeshes.fanGroup = fanGroup;
    cpuCoolerMeshes.fanBlades = fanBladeGroup;

    // 7. 内部断面スライス温度コンター面 (Slice Contour Plane)
    // ユーザー画像のように、切断面そのものに緻密な熱伝導コンターを表示
    const slicePlaneGeo = new THREE.PlaneGeometry(0.122, 0.145, 32, 36);
    slicePlaneGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slicePlaneGeo.attributes.position.count * 3), 3));
    const slicePlaneMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const slicePlaneMesh = new THREE.Mesh(slicePlaneGeo, slicePlaneMat);
    slicePlaneMesh.position.set(0, 0.032, 0);
    cpuGroup.add(slicePlaneMesh);
    cpuCoolerMeshes.sliceContourPlane = slicePlaneMesh;

    // 8. 熱流束ベクトル矢印群 (Heat Flux Vector Arrows: q = -k grad T)
    // ユーザー参考画像（黒い緻密な流束ベクトル矢印）を精緻に再現
    const arrowsGroup = new THREE.Group();
    const numArrowCols = 15;
    const numArrowRows = 14;
    const arrowGeo = new THREE.ConeGeometry(0.0016, 0.0045, 8);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowShaftGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 0.005, 8);
    arrowShaftGeo.rotateX(Math.PI / 2);

    for (let r = 0; r < numArrowRows; r++) {
        for (let c = 0; c < numArrowCols; c++) {
            const ax = -0.052 + (c / (numArrowCols - 1)) * 0.104;
            const ay = -0.036 + (r / (numArrowRows - 1)) * 0.130;

            const arrowMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
            const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
            const shaftMesh = new THREE.Mesh(arrowShaftGeo, arrowMat);
            shaftMesh.position.z = -0.003;

            const singleArrow = new THREE.Group();
            singleArrow.add(arrowMesh);
            singleArrow.add(shaftMesh);
            singleArrow.position.set(ax, ay, 0.002);
            arrowsGroup.add(singleArrow);
        }
    }
    cpuGroup.add(arrowsGroup);
    cpuCoolerMeshes.heatFluxArrowsGroup = arrowsGroup;

    // 9. 空気流線パーティクルエフェクト (Airflow Stream)
    const airParticleCount = 140;
    const airGeo = new THREE.BufferGeometry();
    const airPos = new Float32Array(airParticleCount * 3);
    const airCol = new Float32Array(airParticleCount * 3);
    const airVel = [];

    for (let i = 0; i < airParticleCount; i++) {
        airPos[i * 3] = (Math.random() - 0.5) * 0.11;
        airPos[i * 3 + 1] = FIN_BOTTOM_Y + Math.random() * (NUM_FINS * FIN_SPACING);
        airPos[i * 3 + 2] = 0.08 - Math.random() * 0.16;
        airCol[i * 3] = 0.2; airCol[i * 3 + 1] = 0.7; airCol[i * 3 + 2] = 1.0;
        airVel.push({
            speedZ: -0.003 - Math.random() * 0.003,
            life: Math.random()
        });
    }
    airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
    airGeo.setAttribute('color', new THREE.BufferAttribute(airCol, 3));
    const airMat = new THREE.PointsMaterial({
        size: 7,
        vertexColors: true,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const airflowPoints = new THREE.Points(airGeo, airMat);
    cpuGroup.add(airflowPoints);
    cpuCoolerMeshes.airflowParticles = { points: airflowPoints, velocities: airVel };

    // 10. CAE 最高温度サーフェスプローブ コールアウトタグ (ユーザー画像完全準拠)
    const probeGroup = new THREE.Group();
    probeGroup.position.set(0.04, -0.038, 0.03);

    // 引出線
    const leaderGeo = new THREE.BufferGeometry();
    leaderGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.04, 0, -0.03, // CPUコア接触点
        0.0, 0, 0,       // 中継点
        0.04, -0.02, 0.02 // ラベル位置
    ], 3));
    const leaderMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const leaderLine = new THREE.Line(leaderGeo, leaderMat);
    probeGroup.add(leaderLine);

    // CAE コールアウト スプライト
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 320; probeCanvas.height = 110;
    const pCtx = probeCanvas.getContext('2d');
    const pTex = new THREE.CanvasTexture(probeCanvas);
    const pSpriteMat = new THREE.SpriteMaterial({ map: pTex, depthTest: false });
    const pSprite = new THREE.Sprite(pSpriteMat);
    pSprite.scale.set(0.075, 0.026, 1);
    pSprite.position.set(0.085, -0.022, 0.02);
    probeGroup.add(pSprite);
    cpuGroup.add(probeGroup);

    cpuCoolerMeshes.probeCalloutMesh = {
        group: probeGroup,
        canvas: probeCanvas,
        ctx: pCtx,
        tex: pTex,
        sprite: pSprite
    };

    updateClippingPlanes();
    resetCPUThermalState();
}

function resetCPUThermalState() {
    T_cpu = 20.0;
    T_base = 20.0;
    T_hp.fill(20.0);
    T_fins.fill(20.0);
    T_air_out = 20.0;

    updateCPUColors();
    updateCPULabels();
    setupCPUChart();
}

function setupCPUChart() {
    if (meltChartInstance) meltChartInstance.destroy();
    const ctxChart = document.getElementById('meltChart').getContext('2d');
    meltChartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'CPUジャンクション (T_cpu)', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', data: [], tension: 0.2, borderWidth: 2.5 },
                { label: 'ヒートパイプ (T_hp)', borderColor: '#f59e0b', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 2 },
                { label: '放熱フィン平均 (T_fin)', borderColor: '#10b981', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 1.8 },
                { label: '排気空気温度 (T_air)', borderColor: '#38bdf8', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 1.5 },
                { label: 'サーマルスロットリング上限 (95℃)', borderColor: '#dc2626', borderDash: [6, 4], pointRadius: 0, data: [], fill: false, borderWidth: 1.5 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            color: '#cbd5e1',
            scales: {
                x: { title: { display: true, text: '経過時間 (s)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { title: { display: true, text: '温度 (℃)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, min: 15, max: 110 }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 10 } } },
                title: { display: true, text: '📊 CPUクーラー各部過渡温度応答特性', color: '#f8fafc' }
            }
        }
    });
}

function stepCPUSimulation(dtStep) {
    const T_inf = 20.0;

    let h_fin = 8.0;
    if (fanRPM > 0) {
        h_fin = 8.0 + 0.055 * Math.pow(fanRPM, 0.92);
    }

    let effectiveTDP = cpuTDP;
    const isThrottling = T_cpu >= 95.0;
    const warnEl = document.getElementById('throttling-warn');
    if (warnEl) warnEl.style.display = isThrottling ? 'block' : 'none';
    if (isThrottling) {
        effectiveTDP = cpuTDP * Math.max(0.4, 1.0 - (T_cpu - 95.0) * 0.08);
    }

    let k_hp_eff = 6500.0;
    let k_fin_mat = 237.0;
    if (coolerType === 'solid_al') {
        k_hp_eff = 237.0;
        k_fin_mat = 237.0;
    } else if (coolerType === 'all_copper') {
        k_hp_eff = 8500.0;
        k_fin_mat = 401.0;
    }

    // A) CPU Die
    const R_tim = 0.04;
    const q_cpu_to_base = (T_cpu - T_base) / R_tim;
    T_cpu += (effectiveTDP - q_cpu_to_base) / C_CPU * dtStep;

    // B) 銅ベースブロック
    const R_base_hp = 0.03;
    const q_base_to_hp = (T_base - T_hp[0]) / R_base_hp;
    const q_base_conv = 8.0 * (0.05 * 0.05 * 2) * (T_base - T_inf);
    T_base += (q_cpu_to_base - q_base_to_hp - q_base_conv) / C_BASE * dtStep;

    // C) ヒートパイプ (12節点)
    const dz_hp = 0.120 / NUM_HP_NODES;
    const A_hp_cross = 4 * (Math.PI * 0.003 * 0.003);
    const cond_hp = (k_hp_eff * A_hp_cross) / dz_hp;

    const T_hp_next = new Float64Array(NUM_HP_NODES);
    for (let k = 0; k < NUM_HP_NODES; k++) {
        let q_in = (k === 0) ? q_base_to_hp : cond_hp * (T_hp[k - 1] - T_hp[k]);
        let q_out = (k < NUM_HP_NODES - 1) ? cond_hp * (T_hp[k] - T_hp[k + 1]) : 0;

        const fin_start = Math.floor((k / NUM_HP_NODES) * NUM_FINS);
        const fin_end = Math.floor(((k + 1) / NUM_HP_NODES) * NUM_FINS);
        let q_to_fins = 0;
        for (let f = fin_start; f < fin_end; f++) {
            const q_f = (T_hp[k] - T_fins[f]) / 0.08;
            q_to_fins += q_f;
        }

        T_hp_next[k] = T_hp[k] + (q_in - q_out - q_to_fins) / C_HP_NODE * dtStep;
    }
    T_hp.set(T_hp_next);

    // D) 放熱フィン群 (42枚) & 強制対流放熱
    const A_fin_single = 2 * (0.120 * 0.050);
    let totalHeatToAir = 0;

    for (let f = 0; f < NUM_FINS; f++) {
        const hp_idx = Math.min(NUM_HP_NODES - 1, Math.floor((f / NUM_FINS) * NUM_HP_NODES));
        const q_from_hp = (T_hp[hp_idx] - T_fins[f]) / 0.08;
        const q_conv = h_fin * A_fin_single * (T_fins[f] - T_inf);
        totalHeatToAir += q_conv;

        T_fins[f] += (q_from_hp - q_conv) / C_FIN * dtStep;
    }

    // E) 排気空気温度 T_air
    const airFlowCfm = Math.max(2.0, (fanRPM / 2500) * 65.0);
    const airMassFlow = (airFlowCfm * 0.0004719) * 1.2;
    T_air_out = T_inf + totalHeatToAir / (Math.max(0.001, airMassFlow) * 1005);

    // 5. リアルタイム数値UI更新
    document.getElementById('temp-cpu-val').textContent = `${T_cpu.toFixed(1)} ℃`;
    document.getElementById('temp-hp-val').textContent = `${T_hp[0].toFixed(1)} ℃`;
    const avgFinT = T_fins.reduce((a, b) => a + b, 0) / NUM_FINS;
    document.getElementById('temp-fin-val').textContent = `${avgFinT.toFixed(1)} ℃`;
    document.getElementById('temp-air-val').textContent = `${T_air_out.toFixed(1)} ℃`;
}

function updateCPUColors() {
    // CPU Die
    if (cpuCoolerMeshes.cpuDie) {
        const colors = cpuCoolerMeshes.cpuDie.geometry.attributes.color;
        const col = getHeatmapColor((T_cpu - 20) / 80);
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, col.r, col.g, col.b);
        colors.needsUpdate = true;
    }

    // 銅ベース
    if (cpuCoolerMeshes.base) {
        const colors = cpuCoolerMeshes.base.geometry.attributes.color;
        const col = getHeatmapColor((T_base - 20) / 80);
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, col.r, col.g, col.b);
        colors.needsUpdate = true;
    }

    // ヒートパイプ
    cpuCoolerMeshes.heatPipes.forEach(hp => {
        const colors = hp.mesh.geometry.attributes.color;
        const pos = hp.mesh.geometry.attributes.position;
        for (let i = 0; i < colors.count; i++) {
            const yNorm = (pos.getY(i) + 0.05) / 0.12;
            const nodeIdx = Math.max(0, Math.min(NUM_HP_NODES - 1, Math.floor(yNorm * NUM_HP_NODES)));
            const col = getHeatmapColor((T_hp[nodeIdx] - 20) / 80);
            colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
    });

    // 放熱フィン
    cpuCoolerMeshes.finMeshes.forEach((fin, idx) => {
        const colors = fin.geometry.attributes.color;
        const pos = fin.geometry.attributes.position;
        const finT = T_fins[idx];
        for (let i = 0; i < colors.count; i++) {
            const xDist = Math.abs(pos.getX(i));
            const localT = finT * (1.0 - (xDist / 0.06) * 0.15);
            const col = getHeatmapColor((localT - 20) / 80);
            colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
    });

    // 内部断面スライス面 (Slice Plane) の温度コンター描画
    if (cpuCoolerMeshes.sliceContourPlane) {
        const colors = cpuCoolerMeshes.sliceContourPlane.geometry.attributes.color;
        const pos = cpuCoolerMeshes.sliceContourPlane.geometry.attributes.position;
        for (let i = 0; i < colors.count; i++) {
            const px = pos.getX(i);
            const py = pos.getY(i);
            let localT = 20.0;

            if (py < -0.038) {
                // CPU Die 部
                const r = Math.abs(px) / 0.021;
                localT = (r < 1.0) ? (T_cpu * (1 - r * 0.08)) : 20.0;
            } else if (py < -0.030) {
                // 銅ベース部
                const r = Math.abs(px) / 0.026;
                localT = (r < 1.0) ? (T_base * (1 - r * 0.12)) : 20.0;
            } else {
                // フィン ＆ ヒートパイプ部
                const fIdx = Math.max(0, Math.min(NUM_FINS - 1, Math.floor((py - FIN_BOTTOM_Y) / FIN_SPACING)));
                const hpIdx = Math.max(0, Math.min(NUM_HP_NODES - 1, Math.floor((py - FIN_BOTTOM_Y) / (NUM_FINS * FIN_SPACING) * NUM_HP_NODES)));
                const baseFinT = T_fins[fIdx];
                const pipeT = T_hp[hpIdx];

                // パイプ位置近傍 (x=±0.016) での温度上昇
                const distToHP = Math.min(Math.abs(px - 0.016), Math.abs(px + 0.016));
                const hpWeight = Math.exp(-distToHP * 80.0);
                localT = (1 - hpWeight) * (baseFinT * (1 - Math.abs(px) / 0.06 * 0.15)) + hpWeight * pipeT;
            }

            const col = getHeatmapColor((localT - 20) / 80);
            colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
    }

    // 熱流束ベクトルの向き・大きさ更新
    if (cpuCoolerMeshes.heatFluxArrowsGroup && showHeatFluxVectors) {
        const arrows = cpuCoolerMeshes.heatFluxArrowsGroup.children;
        arrows.forEach(arr => {
            const ax = arr.position.x;
            const ay = arr.position.y;

            // 熱流速ベクトル q = -k grad T
            let angle = Math.PI / 2; // デフォルト上向き
            let magnitude = 1.0;

            if (ay < -0.030) {
                // ベース部: CPUから上方向への強い熱流
                angle = Math.PI / 2;
                magnitude = 1.3;
            } else {
                // フィン部: パイプから外側(左右)へ分岐する熱流
                const dirX = (ax > 0) ? 1 : -1;
                const radRatio = Math.min(1, Math.abs(ax) / 0.04);
                angle = (Math.PI / 2) * (1 - radRatio * 0.6) + (dirX > 0 ? 0 : Math.PI) * (radRatio * 0.6);
                magnitude = Math.max(0.4, 1.1 - radRatio * 0.5);
            }

            arr.rotation.z = angle - Math.PI / 2;
            arr.scale.set(magnitude, magnitude, magnitude);
        });
    }
}

function updateCPULabels() {
    // CAE 最高温度サーフェスプローブ コールアウトのリアルタイム更新
    if (cpuCoolerMeshes.probeCalloutMesh && showProbeCallout) {
        const { ctx, tex } = cpuCoolerMeshes.probeCalloutMesh;
        ctx.clearRect(0, 0, 320, 110);

        // 外枠と背景（ANSYS/SolidWorks風のCAEコールアウト）
        ctx.fillStyle = 'rgba(241, 245, 249, 0.96)';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, 312, 102);
        ctx.fillRect(4, 4, 312, 102);

        // ヘッダーバー (灰色)
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(4, 4, 312, 38);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 22px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('サーフェスパラメータ 1', 16, 28);

        // データ本体
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px "Noto Sans JP", sans-serif';
        ctx.fillText(`温度（固体）最大`, 16, 80);
        ctx.fillStyle = (T_cpu >= 90) ? '#ef4444' : '#0284c7';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(`${T_cpu.toFixed(2)} ℃`, 185, 80);

        tex.needsUpdate = true;
    }
}

function updateCPUChartData() {
    if (!meltChartInstance) return;
    const avgFinT = T_fins.reduce((a, b) => a + b, 0) / NUM_FINS;
    const tLabel = simulationTime.toFixed(1);

    if (meltChartInstance.data.labels.length > 40) {
        meltChartInstance.data.labels.shift();
        meltChartInstance.data.datasets.forEach(ds => ds.data.shift());
    }

    meltChartInstance.data.labels.push(tLabel);
    meltChartInstance.data.datasets[0].data.push(T_cpu);
    meltChartInstance.data.datasets[1].data.push(T_hp[0]);
    meltChartInstance.data.datasets[2].data.push(avgFinT);
    meltChartInstance.data.datasets[3].data.push(T_air_out);
    meltChartInstance.data.datasets[4].data.push(95.0);

    meltChartInstance.update('none');
}

// ══════════════════════════════════════════════════════════════════════════
// 3. UI イベントリスナー & モード切替
// ══════════════════════════════════════════════════════════════════════════

const tabPipe = document.getElementById('tab-pipe');
const tabCpu = document.getElementById('tab-cpu');
const panelPipe = document.getElementById('panel-pipe-mode');
const panelCpu = document.getElementById('panel-cpu-mode');
const mainTitle = document.getElementById('main-title');

function switchMode(mode) {
    currentSimMode = mode;
    isPlaying = false;
    simulationTime = 0;
    document.getElementById('time-display').textContent = formatTime(0);

    if (mode === 'pipe') {
        tabPipe.classList.add('active');
        tabPipe.style.background = '#3b82f6';
        tabPipe.style.color = '#ffffff';
        tabCpu.classList.remove('active');
        tabCpu.style.background = 'transparent';
        tabCpu.style.color = '#94a3b8';

        panelPipe.style.display = 'block';
        panelCpu.style.display = 'none';
        mainTitle.textContent = '熱の可視化 (パイプ熱伝導)';

        pipeGroup.visible = true;
        cpuGroup.visible = false;

        document.getElementById('btn-cam-3d').textContent = '① 3D俯瞰';
        document.getElementById('btn-cam-default').textContent = '② 真横';
        document.getElementById('btn-cam-zoom').textContent = '③ 拡大';

        setupPipesAndChart();
    } else {
        tabCpu.classList.add('active');
        tabCpu.style.background = '#3b82f6';
        tabCpu.style.color = '#ffffff';
        tabPipe.classList.remove('active');
        tabPipe.style.background = 'transparent';
        tabPipe.style.color = '#94a3b8';

        panelPipe.style.display = 'none';
        panelCpu.style.display = 'block';
        mainTitle.textContent = 'CPUクーラー放熱・内部温度分布解析';

        pipeGroup.visible = false;
        cpuGroup.visible = true;

        document.getElementById('btn-cam-3d').textContent = '① 3D立体視';
        document.getElementById('btn-cam-default').textContent = '② 断面正面';
        document.getElementById('btn-cam-zoom').textContent = '③ 内部拡大';

        buildCPUCooler3D();
    }
    optimizeCameraLayout();
}

tabPipe.addEventListener('click', () => switchMode('pipe'));
tabCpu.addEventListener('click', () => switchMode('cpu'));

// 断面カットモード
document.querySelectorAll('.btn-cut-mode').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-cut-mode').forEach(b => {
            b.classList.remove('active');
            b.style.background = '#334155';
        });
        btn.classList.add('active');
        btn.style.background = '#2563eb';
        cutawayMode = btn.dataset.cut;
        updateClippingPlanes();
        updateCPUColors();
    });
});

// 熱流束ベクトル & プローブトグル
const toggleVectors = document.getElementById('toggle-flux-vectors');
if (toggleVectors) {
    toggleVectors.addEventListener('change', (e) => {
        showHeatFluxVectors = e.target.checked;
        updateClippingPlanes();
    });
}
const toggleProbe = document.getElementById('toggle-probe-callout');
if (toggleProbe) {
    toggleProbe.addEventListener('change', (e) => {
        showProbeCallout = e.target.checked;
        updateClippingPlanes();
    });
}

// 断面スライスポジションスライダー
const sliceSlider = document.getElementById('slice-pos-slider');
if (sliceSlider) {
    sliceSlider.addEventListener('input', (e) => {
        sliceZOffset = parseFloat(e.target.value);
        updateClippingPlanes();
        updateCPUColors();
    });
}

// CPU モード コントロールリスナー
const cpuPowerSlider = document.getElementById('cpu-power-slider');
const cpuPowerVal = document.getElementById('cpu-power-val');
if (cpuPowerSlider) {
    cpuPowerSlider.addEventListener('input', (e) => {
        cpuTDP = parseFloat(e.target.value);
        cpuPowerVal.textContent = `${cpuTDP} W`;
    });
}
document.querySelectorAll('.btn-tdp-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-tdp-preset').forEach(b => b.style.background = '#334155');
        btn.style.background = '#2563eb';
        cpuTDP = parseFloat(btn.dataset.tdp);
        cpuPowerSlider.value = cpuTDP;
        cpuPowerVal.textContent = `${cpuTDP} W`;
    });
});

const fanSpeedSlider = document.getElementById('fan-speed-slider');
const fanSpeedVal = document.getElementById('fan-speed-val');
if (fanSpeedSlider) {
    fanSpeedSlider.addEventListener('input', (e) => {
        fanRPM = parseInt(e.target.value, 10);
        fanSpeedVal.textContent = `${fanRPM} RPM`;
    });
}
document.querySelectorAll('.btn-fan-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-fan-preset').forEach(b => b.style.background = '#334155');
        btn.style.background = '#2563eb';
        fanRPM = parseInt(btn.dataset.rpm, 10);
        fanSpeedSlider.value = fanRPM;
        fanSpeedVal.textContent = `${fanRPM} RPM`;
    });
});

document.querySelectorAll('input[name="cooler-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        coolerType = e.target.value;
        resetCPUThermalState();
    });
});

// パイプ材質チェックボックス
document.querySelectorAll('.mat-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
        if (currentSimMode === 'pipe') setupPipesAndChart();
    });
});

const flameAnimToggle = document.getElementById('flame-anim-toggle');
if (flameAnimToggle) {
    flameAnimToggle.addEventListener('change', () => {
        if (isPlaying && currentSimMode === 'pipe') {
            flameParticles.visible = flameAnimToggle.checked;
        }
    });
}

// 再生 / 停止 / リセット
document.getElementById('btn-start').addEventListener('click', () => {
    isPlaying = true;
    if (currentSimMode === 'pipe') {
        flameParticles.visible = flameAnimToggle ? flameAnimToggle.checked : true;
    }
});

document.getElementById('btn-pause').addEventListener('click', () => {
    isPlaying = false;
    if (flameParticles) flameParticles.visible = false;
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (currentSimMode === 'pipe') {
        setupPipesAndChart();
    } else {
        resetCPUThermalState();
    }
    simulationTime = 0;
    document.getElementById('time-display').textContent = formatTime(0);
});

function formatTime(totalSeconds) {
    const s = totalSeconds.toFixed(1);
    const m = Math.floor(totalSeconds / 60);
    const sec = Math.floor(totalSeconds % 60);
    return `${s} s (${m}分${sec.toString().padStart(2, '0')}秒)`;
}

// ══════════════════════════════════════════════════════════════════════════
// 4. メインアニメーションループ
// ══════════════════════════════════════════════════════════════════════════

let lastChartUpdateSimTime = 0;

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (isPlaying) {
        if (currentSimMode === 'pipe') {
            const frameTime = 1 / 60;
            const targetSimTime = frameTime * multiplier;
            const steps = Math.max(1, Math.floor(targetSimTime / dt));
            for (let s = 0; s < steps; s++) {
                stepPipeSimulation();
                simulationTime += dt;
            }
            updatePipeColors();
            updateIsotherms();
            checkMeltingTimes();
        } else {
            const dtCPU = 0.05;
            const subSteps = 6;
            for (let s = 0; s < subSteps; s++) {
                stepCPUSimulation(dtCPU);
                simulationTime += dtCPU;
            }
            updateCPUColors();
            updateCPULabels();

            if (simulationTime - lastChartUpdateSimTime >= 0.5) {
                updateCPUChartData();
                lastChartUpdateSimTime = simulationTime;
            }
        }
        document.getElementById('time-display').textContent = formatTime(simulationTime);
    }

    // パイプモード: 火炎パーティクルアニメーション
    if (currentSimMode === 'pipe' && flameParticles.visible) {
        const posAttribute = flameGeo.attributes.position;
        for (let i = 0; i < particleCount; i++) {
            let y = posAttribute.getY(i);
            let life = velocities[i].life;
            y += velocities[i].y;
            posAttribute.setX(i, posAttribute.getX(i) + velocities[i].x);
            posAttribute.setZ(i, posAttribute.getZ(i) + velocities[i].z);
            life += 0.02;
            if (life > 1.0) {
                posAttribute.setX(i, (Math.random() - 0.5) * 0.02);
                y = flameCenter + (Math.random() - 0.5) * flameSpread;
                posAttribute.setZ(i, -0.01 - Math.random() * 0.03);
                life = 0;
            }
            posAttribute.setY(i, y);
            velocities[i].life = life;
        }
        posAttribute.needsUpdate = true;
    }

    // CPUクーラーモード: ファン回転 ＆ 空気流線アニメーション
    if (currentSimMode === 'cpu') {
        if (cpuCoolerMeshes.fanBlades) {
            const radPerSec = (fanRPM / 60) * Math.PI * 2;
            cpuCoolerMeshes.fanBlades.rotation.z += radPerSec * (1 / 60);
        }

        if (cpuCoolerMeshes.airflowParticles) {
            const { points, velocities: airVels } = cpuCoolerMeshes.airflowParticles;
            const posAttr = points.geometry.attributes.position;
            const colAttr = points.geometry.attributes.color;
            const flowSpeed = (fanRPM / 2500) * 0.003 + 0.0005;

            for (let i = 0; i < airVels.length; i++) {
                let z = posAttr.getZ(i) - flowSpeed;
                let life = airVels[i].life + 0.015;
                if (z < -0.08 || life > 1.0) {
                    z = 0.07 + Math.random() * 0.02;
                    posAttr.setX(i, (Math.random() - 0.5) * 0.11);
                    posAttr.setY(i, FIN_BOTTOM_Y + Math.random() * (NUM_FINS * FIN_SPACING));
                    life = 0;
                }
                posAttr.setZ(i, z);
                airVels[i].life = life;

                const heatRatio = Math.max(0, Math.min(1, (0.04 - z) / 0.08));
                const airTempCol = getHeatmapColor(((T_air_out - 20) / 60) * heatRatio);
                colAttr.setXYZ(i, airTempCol.r, airTempCol.g, airTempCol.b);
            }
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        }
    }

    renderer.render(scene, camera);
}
animate();

// ══════════════════════════════════════════════════════════════════════════
// 5. カメラ ＆ 画面レイアウト最適化
// ══════════════════════════════════════════════════════════════════════════

let currentCamMode = 1;

function optimizeCameraLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    let leftPanelRight = 320;
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
        const rect = uiContainer.getBoundingClientRect();
        leftPanelRight = Math.max(leftPanelRight, rect.right + 25);
    }

    const availWidth = Math.max(300, w - leftPanelRight - 30);
    const availHeight = Math.max(300, h - 60);
    const availCenterScreenX = leftPanelRight + availWidth / 2;
    const shiftFromScreenCenterX = availCenterScreenX - (w / 2);

    if (currentSimMode === 'pipe') {
        const worldViewWidth = 0.52;
        const worldViewHeight = worldViewWidth / (availWidth / availHeight);

        camera.left = -worldViewWidth / 2;
        camera.right = worldViewWidth / 2;
        camera.top = worldViewHeight / 2;
        camera.bottom = -worldViewHeight / 2;
        camera.clearViewOffset();
        camera.setViewOffset(w, h, -shiftFromScreenCenterX, 0, w, h);

        const pipeCenterX = 0.20;
        if (currentCamMode === 1) {
            camera.zoom = 1.05;
            camera.position.set(pipeCenterX - 0.08, 0.24, 0.32);
            controls.target.set(pipeCenterX, 0, 0);
        } else if (currentCamMode === 2) {
            camera.zoom = 1.05;
            camera.position.set(pipeCenterX, 0, 0.50);
            controls.target.set(pipeCenterX, 0, 0);
        } else if (currentCamMode === 3) {
            camera.zoom = 2.40;
            camera.position.set(0.06, 0.12, 0.18);
            controls.target.set(0.06, 0, 0);
        }
    } else {
        // CPUクーラー表示用カメラ
        const worldViewWidth = 0.30;
        const worldViewHeight = worldViewWidth / (availWidth / availHeight);

        camera.left = -worldViewWidth / 2;
        camera.right = worldViewWidth / 2;
        camera.top = worldViewHeight / 2;
        camera.bottom = -worldViewHeight / 2;
        camera.clearViewOffset();
        camera.setViewOffset(w, h, -shiftFromScreenCenterX, 0, w, h);

        const cpuCenterY = 0.035;
        if (currentCamMode === 1) {
            // ① 3D立体視 (内部断面が見やすい斜め俯瞰)
            camera.zoom = 1.10;
            camera.position.set(0.18, 0.16, 0.26);
            controls.target.set(0, cpuCenterY, 0);
        } else if (currentCamMode === 2) {
            // ② 断面正面 (直交スライスカット面)
            camera.zoom = 1.25;
            camera.position.set(0, cpuCenterY, 0.35);
            controls.target.set(0, cpuCenterY, 0);
        } else if (currentCamMode === 3) {
            // ③ 内部拡大 (CPUコア・ベース・ヒートパイプ接合部)
            camera.zoom = 2.30;
            camera.position.set(0.08, 0.01, 0.15);
            controls.target.set(0, -0.02, 0);
        }
    }

    camera.updateProjectionMatrix();
    controls.update();
}

// カメラボタン
document.getElementById('btn-cam-3d').addEventListener('click', () => {
    currentCamMode = 1;
    optimizeCameraLayout();
});
document.getElementById('btn-cam-default').addEventListener('click', () => {
    currentCamMode = 2;
    optimizeCameraLayout();
});
document.getElementById('btn-cam-zoom').addEventListener('click', () => {
    currentCamMode = 3;
    optimizeCameraLayout();
});

window.addEventListener('resize', optimizeCameraLayout);
window.addEventListener('DOMContentLoaded', () => {
    setupPipesAndChart();
    optimizeCameraLayout();
});
setTimeout(optimizeCameraLayout, 100);
