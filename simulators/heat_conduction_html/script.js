/**
 * 熱の可視化シミュレーター (パイプ熱伝導 ＆ 標準CPUクーラー構造・放熱解析)
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
renderer.localClippingEnabled = true;
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0.07, 0.05, 0);
controls.update();

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(0.6, 1.2, 0.8);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.45);
dirLight2.position.set(-0.6, -0.4, -0.8);
scene.add(dirLight2);

// ─── 3D Groups ───
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

// ─── 共通材料データベース ───
const allMaterials = {
    'アルミ合金(6063系相当)': { name: 'アルミニウム', k: 237, rho: 2700, c: 900, color: '#1e90ff', hex: 0x94a3b8 },
    '銅': { name: '銅', k: 401, rho: 8960, c: 385, color: '#ff6b81', hex: 0xb45309 },
    'ステンレス（SUS304）': { name: 'ステンレス', k: 16, rho: 8000, c: 500, color: '#2ed573', hex: 0x64748b },
    '鉄': { name: '鉄', k: 50, rho: 7870, c: 440, color: '#a4b0be', hex: 0x475569 },
    '真鍮': { name: '真鍮', k: 109, rho: 8500, c: 380, color: '#eccc68', hex: 0xd97706 },
    '銀': { name: '銀', k: 429, rho: 10490, c: 235, color: '#ced6e0', hex: 0xe2e8f0 },
    'ガラス': { name: 'ガラス', k: 1, rho: 2500, c: 750, color: '#7bed9f', hex: 0x38bdf8 }
};

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
// 2. 標準CPUクーラーモデル (リテール構造・分解図 ＆ 1/2断面CAE熱伝導解析)
// ══════════════════════════════════════════════════════════════════════════

// CPUクーラー パラメータ
let cpuTDP = 65.0;     // 65W (標準)
let fanRPM = 2800;     // -2800 RPM ~ -4400 RPM
let structureMode = 'assemble'; // 'assemble', 'cutaway', 'exploded'
let explodedRatio = 1.0;
let showHeatFluxVectors = true;
let showProbeCallout = true;
let selectedHeatsinkMatKey = 'アルミ合金(6063系相当)';
let coreStructureType = 'copper_core'; // 'copper_core' or 'solid_core'

// 物理物性値 (FVM熱伝導計算)
const R_COPPER_CORE = 0.015; // コア半径 15mm (φ30mm)
const H_COPPER_CORE = 0.026; // コア高さ 26mm
const R_RADIAL_FIN  = 0.046; // 放射状フィン外半径 46mm (φ92mm)
const NUM_RADIAL_FINS = 48;

// 熱容量 [J/K]
const C_CPU = 0.038 * 0.038 * 0.0035 * 8960 * 385; // CPU IHS (~17.5 J/K)

// 温度状態ベクトル
let T_cpu = 20.0;
let T_copper_core = 20.0;
let T_radial_fins = new Float64Array(8).fill(20.0); // 半径方向 8分割
let T_air_out = 20.0;

// 3D パーツグループ参照
let stockCoolerParts = {
    pcb: null,
    socket: null,
    cpu: null,
    copperCore: null,
    radialFin: null,
    caseBracket: null,
    fanAttach: null,
    fan: null,
    fanBlades: null,
    rpmCalloutSprite: null,
    sliceContourPlane: null,
    heatFluxArrowsGroup: null,
    probeCalloutGroup: null,
    probeCalloutText: null,
    explodedLabels: [], // 動的ラベル＆引出線
    clippableMaterials: []
};

// 断面クリッピング平面 (1/2 断面用: Z < 0 をカット)
const clipPlaneCutaway = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

function updateStructureDisplay() {
    const isCutaway = (structureMode === 'cutaway');
    const isExploded = (structureMode === 'exploded');

    // 1. クリッピング平面適用
    stockCoolerParts.clippableMaterials.forEach(mat => {
        mat.clippingPlanes = isCutaway ? [clipPlaneCutaway] : [];
        mat.clipShadows = true;
        mat.needsUpdate = true;
    });

    // 2. 断面コンター面 ＆ 熱流束ベクトル
    if (stockCoolerParts.sliceContourPlane) {
        stockCoolerParts.sliceContourPlane.visible = isCutaway;
    }
    if (stockCoolerParts.heatFluxArrowsGroup) {
        stockCoolerParts.heatFluxArrowsGroup.visible = isCutaway && showHeatFluxVectors;
    }

    // 3. CAE プローブコールアウトタグ
    if (stockCoolerParts.probeCalloutGroup) {
        stockCoolerParts.probeCalloutGroup.visible = isCutaway && showProbeCallout;
    }

    // 4. 回転速度コールアウトタグ
    if (stockCoolerParts.rpmCalloutSprite) {
        stockCoolerParts.rpmCalloutSprite.visible = (structureMode === 'assemble');
    }

    // 5. 分解パーツ＆ラベルのY座標同期更新
    applyExplodedOffsets();
}

function applyExplodedOffsets() {
    const isExploded = (structureMode === 'exploded');
    const r = isExploded ? explodedRatio : 0.0;

    // 各3Dパーツの垂直オフセット
    const yFan       = 0.038 + 0.125 * r;
    const yAttach    = 0.024 + 0.085 * r;
    const yCase      = 0.008 + 0.065 * r;
    const yFin       = 0.005 + 0.040 * r;
    const yCore      = 0.003 + 0.020 * r;
    const yCpu       = -0.010 + 0.008 * r;
    const ySocket    = -0.014;
    const yPcb       = -0.020 - 0.015 * r;

    if (stockCoolerParts.fan)         stockCoolerParts.fan.position.y = yFan;
    if (stockCoolerParts.fanAttach)   stockCoolerParts.fanAttach.position.y = yAttach;
    if (stockCoolerParts.caseBracket) stockCoolerParts.caseBracket.position.y = yCase;
    if (stockCoolerParts.radialFin)   stockCoolerParts.radialFin.position.y = yFin;
    if (stockCoolerParts.copperCore)  stockCoolerParts.copperCore.position.y = yCore;
    if (stockCoolerParts.cpu)         stockCoolerParts.cpu.position.y = yCpu;
    if (stockCoolerParts.socket)      stockCoolerParts.socket.position.y = ySocket;
    if (stockCoolerParts.pcb)         stockCoolerParts.pcb.position.y = yPcb;

    // 分解図ラベル ＆ 引出線の動的追従更新
    stockCoolerParts.explodedLabels.forEach(item => {
        item.group.visible = isExploded;
        if (!isExploded) return;

        let targetY = 0;
        let attachX = 0;
        let attachY = 0;
        let attachZ = 0;

        switch (item.key) {
            case 'fan':
                targetY = yFan + 0.004;
                attachX = 0.046; attachY = yFan; attachZ = 0;
                break;
            case 'fanAttach':
                targetY = yAttach + 0.004;
                attachX = 0.048; attachY = yAttach; attachZ = 0;
                break;
            case 'case':
                targetY = yCase + 0.004;
                attachX = 0.050; attachY = yCase; attachZ = 0;
                break;
            case 'fin':
                targetY = yFin + 0.012;
                attachX = 0.046; attachY = yFin + 0.012; attachZ = 0;
                break;
            case 'core':
                targetY = yCore + 0.012;
                attachX = 0.015; attachY = yCore + 0.012; attachZ = 0;
                break;
            case 'cpu':
                // CPU: 左側に水平配置し、CPU Dieの左端に精密接続
                targetY = yCpu + 0.002;
                attachX = -0.020; attachY = yCpu + 0.002; attachZ = 0;
                break;
            case 'socket':
                targetY = ySocket + 0.002;
                attachX = 0.025; attachY = ySocket + 0.002; attachZ = 0;
                break;
            case 'pcb':
                targetY = yPcb + 0.002;
                attachX = 0.065; attachY = yPcb + 0.002; attachZ = 0;
                break;
        }

        // スプライトの位置
        item.sprite.position.set(item.isLeft ? -0.085 : 0.090, targetY, 0.01);

        // 引出線の端点更新
        const linePos = item.line.geometry.attributes.position;
        if (item.isLeft) {
            linePos.setXYZ(0, -0.060, targetY, 0.01);
            linePos.setXYZ(1, attachX, attachY, attachZ);
        } else {
            linePos.setXYZ(0, 0.065, targetY, 0.01);
            linePos.setXYZ(1, attachX, attachY, attachZ);
        }
        linePos.needsUpdate = true;
    });
}

function buildStockCPUCooler3D() {
    while (cpuGroup.children.length > 0) {
        const obj = cpuGroup.children[0];
        cpuGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    }
    stockCoolerParts.clippableMaterials = [];
    stockCoolerParts.explodedLabels = [];

    const matProps = allMaterials[selectedHeatsinkMatKey] || allMaterials['アルミ合金(6063系相当)'];

    // ─── 1. 基板 (Motherboard PCB) ───
    const pcbGroup = new THREE.Group();
    const pcbGeo = new THREE.BoxGeometry(0.24, 0.004, 0.24);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7, metalness: 0.1 });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbGroup.add(pcbMesh);
    cpuGroup.add(pcbGroup);
    stockCoolerParts.pcb = pcbGroup;

    // ─── 2. ソケット (Socket LGA/AM4) ───
    const socketGroup = new THREE.Group();
    const socketGeo = new THREE.BoxGeometry(0.048, 0.004, 0.048);
    const socketMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 });
    const socketMesh = new THREE.Mesh(socketGeo, socketMat);
    socketGroup.add(socketMesh);

    const leverGeo = new THREE.CylinderGeometry(0.001, 0.001, 0.045, 8);
    leverGeo.rotateZ(Math.PI / 2);
    const leverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const leverMesh = new THREE.Mesh(leverGeo, leverMat);
    leverMesh.position.set(0, 0.002, 0.026);
    socketGroup.add(leverMesh);
    cpuGroup.add(socketGroup);
    stockCoolerParts.socket = socketGroup;

    // ─── 3. CPU (CPU Die + IHS) ───
    const cpuMeshGroup = new THREE.Group();
    const cpuGeo = new THREE.BoxGeometry(0.038, 0.0035, 0.038);
    cpuGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cpuGeo.attributes.position.count * 3), 3));
    const cpuMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.2, side: THREE.DoubleSide });
    const cpuMesh = new THREE.Mesh(cpuGeo, cpuMat);
    cpuMeshGroup.add(cpuMesh);
    cpuGroup.add(cpuMeshGroup);
    stockCoolerParts.cpu = cpuMeshGroup;
    stockCoolerParts.clippableMaterials.push(cpuMat);

    // ─── 4. 銅コア / 中央コア (Copper Core Cylinder) ───
    const coreGroup = new THREE.Group();
    const coreGeo = new THREE.CylinderGeometry(R_COPPER_CORE, R_COPPER_CORE, H_COPPER_CORE, 32, 16);
    coreGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(coreGeo.attributes.position.count * 3), 3));
    const coreMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, H_COPPER_CORE / 2, 0);
    coreGroup.add(coreMesh);
    cpuGroup.add(coreGroup);
    stockCoolerParts.copperCore = coreGroup;
    stockCoolerParts.clippableMaterials.push(coreMat);

    // ─── 5. ヒートシンク (Radial Aluminum/Selected Material Fins) ───
    const finGroup = new THREE.Group();
    const radialFinGeo = new THREE.BufferGeometry();
    const finPositions = [];
    const finColors = [];
    const finNormals = [];

    for (let i = 0; i < NUM_RADIAL_FINS; i++) {
        const theta = (i / NUM_RADIAL_FINS) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const rIn = R_COPPER_CORE + 0.0005;
        const rOut = R_RADIAL_FIN;
        const y0 = 0.002;
        const y1 = H_COPPER_CORE + 0.004;

        const pA = [rIn * cosT, y0, rIn * sinT];
        const pB = [rOut * cosT, y0, rOut * sinT];
        const pC = [rOut * cosT, y1, rOut * sinT];
        const pD = [rIn * cosT, y1, rIn * sinT];

        finPositions.push(...pA, ...pB, ...pC, ...pA, ...pC, ...pD);
        for (let v = 0; v < 6; v++) {
            finColors.push(0.2, 0.6, 0.9);
            finNormals.push(-sinT, 0, cosT);
        }
    }
    radialFinGeo.setAttribute('position', new THREE.Float32BufferAttribute(finPositions, 3));
    radialFinGeo.setAttribute('color', new THREE.Float32BufferAttribute(finColors, 3));
    radialFinGeo.setAttribute('normal', new THREE.Float32BufferAttribute(finNormals, 3));

    const radialFinMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide });
    const radialFinMesh = new THREE.Mesh(radialFinGeo, radialFinMat);
    finGroup.add(radialFinMesh);
    cpuGroup.add(finGroup);
    stockCoolerParts.radialFin = finGroup;
    stockCoolerParts.clippableMaterials.push(radialFinMat);

    // ─── 6. ケース / リテンションブラケット ───
    const caseGroup = new THREE.Group();
    const bracketGeo = new THREE.BoxGeometry(0.098, 0.008, 0.098);
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
    const bracketMesh = new THREE.Mesh(bracketGeo, caseMat);
    bracketMesh.position.set(0, H_COPPER_CORE * 0.75, 0);
    caseGroup.add(bracketMesh);

    const legGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.038, 12);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
    const legPositions = [
        { x: -0.042, z: -0.042 },
        { x: -0.042, z:  0.042 },
        { x:  0.042, z: -0.042 },
        { x:  0.042, z:  0.042 }
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(pos.x, 0.010, pos.z);
        caseGroup.add(leg);
    });
    cpuGroup.add(caseGroup);
    stockCoolerParts.caseBracket = caseGroup;
    stockCoolerParts.clippableMaterials.push(caseMat);

    // ─── 7. ファンアタッチ (Fan Attachment Hub) ───
    const attachGroup = new THREE.Group();
    const attachRingGeo = new THREE.CylinderGeometry(R_RADIAL_FIN + 0.002, R_RADIAL_FIN + 0.002, 0.008, 36, 1, true);
    const attachMesh = new THREE.Mesh(attachRingGeo, caseMat);
    attachMesh.position.set(0, H_COPPER_CORE + 0.004, 0);
    attachGroup.add(attachMesh);
    cpuGroup.add(attachGroup);
    stockCoolerParts.fanAttach = attachGroup;

    // ─── 8. ファン (Fan Impeller & Rotating Blades) ───
    const fanGroup = new THREE.Group();
    const fanBladeGroup = new THREE.Group();

    const hubGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 24);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    fanBladeGroup.add(hubMesh);

    const bladeGeo = new THREE.BoxGeometry(0.026, 0.0014, 0.012);
    bladeGeo.rotateY(Math.PI / 6);
    for (let b = 0; b < 7; b++) {
        const angle = (b / 7) * Math.PI * 2;
        const blade = new THREE.Mesh(bladeGeo, hubMat);
        blade.position.set(Math.cos(angle) * 0.026, 0, Math.sin(angle) * 0.026);
        blade.rotation.y = -angle + 0.3;
        fanBladeGroup.add(blade);
    }
    fanGroup.add(fanBladeGroup);

    const arrowCurve = new THREE.EllipseCurve(0, 0, 0.014, 0.014, 0, Math.PI * 1.5, false, 0);
    const arrowPoints = arrowCurve.getPoints(24);
    const arrowLineGeo = new THREE.BufferGeometry().setFromPoints(arrowPoints.map(p => new THREE.Vector3(p.x, 0.008, p.y)));
    const arrowLineMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 3 });
    const arrowLine = new THREE.Line(arrowLineGeo, arrowLineMat);
    fanGroup.add(arrowLine);

    const arrowHeadGeo = new THREE.ConeGeometry(0.0025, 0.005, 8);
    arrowHeadGeo.rotateX(Math.PI / 2);
    const arrowHeadMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const arrowHead = new THREE.Mesh(arrowHeadGeo, arrowHeadMat);
    arrowHead.position.set(0, 0.008, 0.014);
    fanGroup.add(arrowHead);

    cpuGroup.add(fanGroup);
    stockCoolerParts.fan = fanGroup;
    stockCoolerParts.fanBlades = fanBladeGroup;
    stockCoolerParts.clippableMaterials.push(hubMat);

    // ─── 9. 回転速度コールアウトタグ ───
    const rpmCanvas = document.createElement('canvas');
    rpmCanvas.width = 256; rpmCanvas.height = 100;
    const rCtx = rpmCanvas.getContext('2d');
    rCtx.fillStyle = 'rgba(241, 245, 249, 0.95)';
    rCtx.strokeStyle = '#92400e';
    rCtx.lineWidth = 3;
    rCtx.strokeRect(4, 4, 248, 92);
    rCtx.fillRect(4, 4, 248, 92);
    rCtx.fillStyle = '#78350f';
    rCtx.fillRect(4, 4, 248, 36);
    rCtx.fillStyle = '#ffffff';
    rCtx.font = 'bold 20px "Noto Sans JP", sans-serif';
    rCtx.textAlign = 'center';
    rCtx.fillText('角度方向速度', 128, 26);
    rCtx.fillStyle = '#0f172a';
    rCtx.font = 'bold 24px monospace';
    rCtx.fillText(`-${fanRPM} RPM`, 128, 74);

    const rpmTex = new THREE.CanvasTexture(rpmCanvas);
    const rpmSpriteMat = new THREE.SpriteMaterial({ map: rpmTex, depthTest: false });
    const rpmSprite = new THREE.Sprite(rpmSpriteMat);
    rpmSprite.scale.set(0.065, 0.025, 1);
    rpmSprite.position.set(-0.065, 0.065, 0.04);
    cpuGroup.add(rpmSprite);
    stockCoolerParts.rpmCalloutSprite = rpmSprite;

    // ─── 10. 1/2 断面コンター面 ───
    const sliceGeo = new THREE.PlaneGeometry(R_RADIAL_FIN * 2, H_COPPER_CORE + 0.015, 32, 24);
    sliceGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sliceGeo.attributes.position.count * 3), 3));
    const sliceMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const sliceMesh = new THREE.Mesh(sliceGeo, sliceMat);
    sliceMesh.position.set(0, H_COPPER_CORE / 2, 0);
    cpuGroup.add(sliceMesh);
    stockCoolerParts.sliceContourPlane = sliceMesh;

    // ─── 11. 熱流束ベクトル矢印群 ───
    const arrowsGroup = new THREE.Group();
    const numCols = 15;
    const numRows = 12;
    const arrowGeo = new THREE.ConeGeometry(0.0016, 0.0045, 8);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowShaftGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 0.005, 8);
    arrowShaftGeo.rotateX(Math.PI / 2);

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const ax = -R_RADIAL_FIN * 0.95 + (c / (numCols - 1)) * (R_RADIAL_FIN * 1.9);
            const ay = -0.002 + (r / (numRows - 1)) * (H_COPPER_CORE + 0.004);

            const arrowMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
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
    stockCoolerParts.heatFluxArrowsGroup = arrowsGroup;

    // ─── 12. CAE 最高温度サーフェスプローブ ───
    const probeGroup = new THREE.Group();
    probeGroup.position.set(0.04, -0.015, 0.03);

    const leaderGeo = new THREE.BufferGeometry();
    leaderGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.04, 0, -0.03,
        0.0, 0, 0,
        0.04, -0.02, 0.02
    ], 3));
    const leaderMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const leaderLine = new THREE.Line(leaderGeo, leaderMat);
    probeGroup.add(leaderLine);

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

    stockCoolerParts.probeCalloutGroup = probeGroup;
    stockCoolerParts.probeCalloutText = { canvas: probeCanvas, ctx: pCtx, tex: pTex };

    // ─── 13. 動的追従・分解図日本語ラベル群 (CPU位置最適化) ───
    const labelDefs = [
        { key: 'fan',       text: 'ファン',             isLeft: false },
        { key: 'fanAttach', text: 'ファンアタッチ',     isLeft: false },
        { key: 'case',      text: 'ケース',             isLeft: false },
        { key: 'fin',       text: 'ヒートシンク',       isLeft: false },
        { key: 'core',      text: (coreStructureType === 'copper_core' ? '銅コア' : 'コア部'), isLeft: false },
        { key: 'cpu',       text: 'CPU',                isLeft: true }, // 左側・CPU水平完全アライン
        { key: 'socket',    text: 'ソケット',           isLeft: false },
        { key: 'pcb',       text: '基板',               isLeft: false }
    ];

    labelDefs.forEach(def => {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath(); ctx.roundRect(10, 10, 236, 44, 10); ctx.fill();
        ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.text, 128, 32);

        const tex = new THREE.CanvasTexture(c);
        const sMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
        const sprite = new THREE.Sprite(sMat);
        sprite.scale.set(0.045, 0.014, 1);

        // 引出線
        const linePositions = new Float32Array([0, 0, 0,  0, 0, 0]);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2.5 });
        const line = new THREE.Line(lineGeo, lineMat);

        const labelSubGroup = new THREE.Group();
        labelSubGroup.add(sprite);
        labelSubGroup.add(line);
        cpuGroup.add(labelSubGroup);

        stockCoolerParts.explodedLabels.push({
            key: def.key,
            isLeft: def.isLeft,
            group: labelSubGroup,
            sprite,
            line
        });
    });

    updateStructureDisplay();
    resetStockCPUThermalState();
}

function resetStockCPUThermalState() {
    T_cpu = 20.0;
    T_copper_core = 20.0;
    T_radial_fins.fill(20.0);
    T_air_out = 20.0;

    updateStockCPUColors();
    updateStockCPULabels();
    setupStockCPUChart();
}

function setupStockCPUChart() {
    if (meltChartInstance) meltChartInstance.destroy();
    const ctxChart = document.getElementById('meltChart').getContext('2d');
    const matName = allMaterials[selectedHeatsinkMatKey]?.name || 'アルミ';

    meltChartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'CPU表面温度 (T_cpu)', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', data: [], tension: 0.2, borderWidth: 2.5 },
                { label: `${coreStructureType === 'copper_core' ? '銅コア' : 'コア部'} (T_core)`, borderColor: '#f59e0b', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 2 },
                { label: `${matName}フィン外周 (T_fin)`, borderColor: '#10b981', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 1.8 },
                { label: '排気空気温度 (T_air)', borderColor: '#38bdf8', backgroundColor: 'transparent', data: [], tension: 0.2, borderWidth: 1.5 },
                { label: '許容上限温度 (95℃)', borderColor: '#dc2626', borderDash: [6, 4], pointRadius: 0, data: [], fill: false, borderWidth: 1.5 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            color: '#cbd5e1',
            scales: {
                x: { title: { display: true, text: '経過時間 (s)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { title: { display: true, text: '温度 (℃)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, min: 15, max: 105 }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 10 } } },
                title: { display: true, text: `📊 標準CPUクーラー過渡熱応答 (${matName}ヒートシンク)`, color: '#f8fafc' }
            }
        }
    });
}

function stepStockCPUSimulation(dtStep) {
    const T_inf = 20.0;

    const finMat = allMaterials[selectedHeatsinkMatKey] || allMaterials['アルミ合金(6063系相当)'];
    const k_fin = finMat.k;
    const rho_fin = finMat.rho;
    const c_fin = finMat.c;

    const isCopperCore = (coreStructureType === 'copper_core');
    const k_core = isCopperCore ? 401.0 : k_fin;
    const rho_core = isCopperCore ? 8960.0 : rho_fin;
    const c_core = isCopperCore ? 385.0 : c_fin;

    const C_CORE_EFF = Math.PI * R_COPPER_CORE * R_COPPER_CORE * H_COPPER_CORE * rho_core * c_core;
    const C_FIN_TOTAL_EFF = 0.00015 * rho_fin * c_fin;
    const C_FIN_NODE_EFF = Math.max(1.0, C_FIN_TOTAL_EFF / 8);

    // 1. トップフローファン風速連動 対流熱伝達率 h_fin [W/(m²K)]
    let h_fin = 8.0;
    if (fanRPM > 0) {
        h_fin = 8.0 + 0.048 * Math.pow(fanRPM, 0.95);
    }

    // 2. サーマルスロットリング
    let effectiveTDP = cpuTDP;
    const isThrottling = T_cpu >= 95.0;
    const warnEl = document.getElementById('throttling-warn');
    if (warnEl) warnEl.style.display = isThrottling ? 'block' : 'none';
    if (isThrottling) {
        effectiveTDP = cpuTDP * Math.max(0.35, 1.0 - (T_cpu - 95.0) * 0.09);
    }

    // 3. FVM 節点熱収支計算
    // A) CPU Die
    const R_tim = 0.035;
    const q_cpu_to_core = (T_cpu - T_copper_core) / R_tim;
    T_cpu += (effectiveTDP - q_cpu_to_core) / C_CPU * dtStep;

    // B) 中央コア
    const R_core_to_fin0 = 0.045 * (237.0 / Math.max(1.0, k_core));
    const q_core_to_fin = (T_copper_core - T_radial_fins[0]) / R_core_to_fin0;
    T_copper_core += (q_cpu_to_core - q_core_to_fin) / C_CORE_EFF * dtStep;

    // C) 放射状フィン (半径方向 8分割 FVM)
    const dr_fin = (R_RADIAL_FIN - R_COPPER_CORE) / 8;
    const A_fin_surface_total = 2 * (NUM_RADIAL_FINS * (R_RADIAL_FIN - R_COPPER_CORE) * H_COPPER_CORE);
    const A_fin_node_surface = A_fin_surface_total / 8;

    const T_fin_next = new Float64Array(8);
    let totalHeatToAir = 0;

    for (let r = 0; r < 8; r++) {
        const A_cond_radial = NUM_RADIAL_FINS * (0.0008 * H_COPPER_CORE);
        const cond_radial = (k_fin * A_cond_radial) / dr_fin;

        let q_in = (r === 0) ? q_core_to_fin : cond_radial * (T_radial_fins[r - 1] - T_radial_fins[r]);
        let q_out = (r < 7) ? cond_radial * (T_radial_fins[r] - T_radial_fins[r + 1]) : 0;
        let q_conv = h_fin * A_fin_node_surface * (T_radial_fins[r] - T_inf);
        totalHeatToAir += q_conv;

        T_fin_next[r] = T_radial_fins[r] + (q_in - q_out - q_conv) / C_FIN_NODE_EFF * dtStep;
    }
    T_radial_fins.set(T_fin_next);

    // D) 排気空気温度
    const airFlowCfm = Math.max(3.0, (fanRPM / 4400) * 55.0);
    const airMassFlow = (airFlowCfm * 0.0004719) * 1.2;
    T_air_out = T_inf + totalHeatToAir / (Math.max(0.001, airMassFlow) * 1005);

    // 4. 数値UI更新
    document.getElementById('temp-cpu-val').textContent = `${T_cpu.toFixed(1)} ℃`;
    document.getElementById('temp-hp-val').textContent = `${T_copper_core.toFixed(1)} ℃`;
    document.getElementById('temp-fin-val').textContent = `${T_radial_fins[7].toFixed(1)} ℃`;
    document.getElementById('temp-air-val').textContent = `${T_air_out.toFixed(1)} ℃`;
}

function updateStockCPUColors() {
    // 1. CPU Die
    if (stockCoolerParts.cpu) {
        const mesh = stockCoolerParts.cpu.children[0];
        const colors = mesh.geometry.attributes.color;
        const col = getHeatmapColor((T_cpu - 20) / 75);
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, col.r, col.g, col.b);
        colors.needsUpdate = true;
    }

    // 2. 銅コア
    if (stockCoolerParts.copperCore) {
        const mesh = stockCoolerParts.copperCore.children[0];
        const colors = mesh.geometry.attributes.color;
        const col = getHeatmapColor((T_copper_core - 20) / 75);
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, col.r, col.g, col.b);
        colors.needsUpdate = true;
    }

    // 3. 放射状フィン
    if (stockCoolerParts.radialFin) {
        const mesh = stockCoolerParts.radialFin.children[0];
        const colors = mesh.geometry.attributes.color;
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i);
            const pz = pos.getZ(i);
            const r = Math.sqrt(px * px + pz * pz);
            const rNorm = Math.max(0, Math.min(1, (r - R_COPPER_CORE) / (R_RADIAL_FIN - R_COPPER_CORE)));
            const nodeIdx = Math.max(0, Math.min(7, Math.floor(rNorm * 8)));
            const finT = T_radial_fins[nodeIdx];
            const col = getHeatmapColor((finT - 20) / 75);
            colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
    }

    // 4. 1/2 断面コンター面
    if (stockCoolerParts.sliceContourPlane) {
        const colors = stockCoolerParts.sliceContourPlane.geometry.attributes.color;
        const pos = stockCoolerParts.sliceContourPlane.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i);
            const py = pos.getY(i);
            const r = Math.abs(px);
            let localT = 20.0;

            if (py < 0.002) {
                localT = (r < 0.019) ? T_cpu : 20.0;
            } else if (r <= R_COPPER_CORE) {
                const rFrac = r / R_COPPER_CORE;
                localT = T_copper_core * (1.0 - rFrac * 0.05);
            } else if (r <= R_RADIAL_FIN) {
                const rNorm = (r - R_COPPER_CORE) / (R_RADIAL_FIN - R_COPPER_CORE);
                const nodeIdx = Math.max(0, Math.min(7, Math.floor(rNorm * 8)));
                localT = T_radial_fins[nodeIdx];
            }
            const col = getHeatmapColor((localT - 20) / 75);
            colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
    }

    // 5. 熱流束ベクトル更新
    if (stockCoolerParts.heatFluxArrowsGroup && showHeatFluxVectors) {
        const arrows = stockCoolerParts.heatFluxArrowsGroup.children;
        arrows.forEach(arr => {
            const ax = arr.position.x;
            const ay = arr.position.y;
            const r = Math.abs(ax);

            let angle = Math.PI / 2;
            let magnitude = 1.0;

            if (ay < 0.006 && r < R_COPPER_CORE) {
                angle = Math.PI / 2;
                magnitude = 1.35;
            } else if (r < R_COPPER_CORE) {
                const dirX = (ax >= 0) ? 1 : -1;
                angle = Math.PI / 2 - dirX * (r / R_COPPER_CORE) * 0.5;
                magnitude = 1.15;
            } else {
                const dirX = (ax >= 0) ? 1 : -1;
                angle = dirX > 0 ? 0 : Math.PI;
                magnitude = Math.max(0.4, 0.95 - (r / R_RADIAL_FIN) * 0.55);
            }

            arr.rotation.z = angle - Math.PI / 2;
            arr.scale.set(magnitude, magnitude, magnitude);
        });
    }
}

function updateStockCPULabels() {
    if (stockCoolerParts.probeCalloutText && showProbeCallout) {
        const { ctx, tex } = stockCoolerParts.probeCalloutText;
        ctx.clearRect(0, 0, 320, 110);

        ctx.fillStyle = 'rgba(241, 245, 249, 0.96)';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, 312, 102);
        ctx.fillRect(4, 4, 312, 102);

        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(4, 4, 312, 38);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 22px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('サーフェスパラメータ 1', 16, 28);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px "Noto Sans JP", sans-serif';
        ctx.fillText(`温度（固体）最大`, 16, 80);
        ctx.fillStyle = (T_cpu >= 90) ? '#ef4444' : '#0284c7';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(`${T_cpu.toFixed(2)} ℃`, 185, 80);

        tex.needsUpdate = true;
    }
}

function updateStockCPUChartData() {
    if (!meltChartInstance) return;
    const tLabel = simulationTime.toFixed(1);

    if (meltChartInstance.data.labels.length > 40) {
        meltChartInstance.data.labels.shift();
        meltChartInstance.data.datasets.forEach(ds => ds.data.shift());
    }

    meltChartInstance.data.labels.push(tLabel);
    meltChartInstance.data.datasets[0].data.push(T_cpu);
    meltChartInstance.data.datasets[1].data.push(T_copper_core);
    meltChartInstance.data.datasets[2].data.push(T_radial_fins[7]);
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
        mainTitle.textContent = '標準CPUクーラー構造 ＆ 放熱解析';

        pipeGroup.visible = false;
        cpuGroup.visible = true;

        document.getElementById('btn-cam-3d').textContent = '① 3D斜視';
        document.getElementById('btn-cam-default').textContent = '② 真上(ファン)';
        document.getElementById('btn-cam-zoom').textContent = '③ 側面(コア)';

        buildStockCPUCooler3D();
    }
    optimizeCameraLayout();
}

tabPipe.addEventListener('click', () => switchMode('pipe'));
tabCpu.addEventListener('click', () => switchMode('cpu'));

// 構造表示モード (組み立て・1/2断面・構造分解図)
document.querySelectorAll('.btn-structure-mode').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-structure-mode').forEach(b => {
            b.classList.remove('active');
            b.style.background = '#334155';
        });
        btn.classList.add('active');
        btn.style.background = '#2563eb';
        structureMode = btn.dataset.mode;

        const explodedBox = document.getElementById('exploded-slider-box');
        const cutawayBox = document.getElementById('cutaway-options-box');
        if (explodedBox) explodedBox.style.display = (structureMode === 'exploded') ? 'block' : 'none';
        if (cutawayBox) cutawayBox.style.display = (structureMode === 'cutaway') ? 'flex' : 'none';

        updateStructureDisplay();
        updateStockCPUColors();
        optimizeCameraLayout();
    });
});

// 分解図スライダー
const expSlider = document.getElementById('exploded-slider');
const expVal = document.getElementById('exploded-val');
if (expSlider) {
    expSlider.addEventListener('input', (e) => {
        explodedRatio = parseFloat(e.target.value);
        if (expVal) expVal.textContent = `${Math.round(explodedRatio * 100)} %`;
        applyExplodedOffsets();
    });
}

// ヒートシンク材質選択
const matSelect = document.getElementById('heatsink-mat-select');
if (matSelect) {
    matSelect.addEventListener('change', (e) => {
        selectedHeatsinkMatKey = e.target.value;
        buildStockCPUCooler3D();
    });
}

// コア構造ラジオボタン
document.querySelectorAll('input[name="core-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        coreStructureType = e.target.value;
        buildStockCPUCooler3D();
    });
});

// 熱流束ベクトル & プローブトグル
const toggleVectors = document.getElementById('toggle-flux-vectors');
if (toggleVectors) {
    toggleVectors.addEventListener('change', (e) => {
        showHeatFluxVectors = e.target.checked;
        updateStructureDisplay();
    });
}
const toggleProbe = document.getElementById('toggle-probe-callout');
if (toggleProbe) {
    toggleProbe.addEventListener('change', (e) => {
        showProbeCallout = e.target.checked;
        updateStructureDisplay();
    });
}

// CPU TDP スライダー
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

// ファン回転数 スライダー
const fanSpeedSlider = document.getElementById('fan-speed-slider');
const fanSpeedVal = document.getElementById('fan-speed-val');
if (fanSpeedSlider) {
    fanSpeedSlider.addEventListener('input', (e) => {
        fanRPM = parseInt(e.target.value, 10);
        fanSpeedVal.textContent = `-${fanRPM} RPM`;
    });
}
document.querySelectorAll('.btn-fan-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-fan-preset').forEach(b => b.style.background = '#334155');
        btn.style.background = '#2563eb';
        fanRPM = parseInt(btn.dataset.rpm, 10);
        fanSpeedSlider.value = fanRPM;
        fanSpeedVal.textContent = `-${fanRPM} RPM`;
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
        resetStockCPUThermalState();
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
                stepStockCPUSimulation(dtCPU);
                simulationTime += dtCPU;
            }
            updateStockCPUColors();
            updateStockCPULabels();

            if (simulationTime - lastChartUpdateSimTime >= 0.5) {
                updateStockCPUChartData();
                lastChartUpdateSimTime = simulationTime;
            }
        }
        document.getElementById('time-display').textContent = formatTime(simulationTime);
    }

    // パイプモード: 火炎アニメーション
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

    // CPUクーラーモード: ファンブレード回転
    if (currentSimMode === 'cpu' && stockCoolerParts.fanBlades) {
        const radPerSec = (fanRPM / 60) * Math.PI * 2;
        stockCoolerParts.fanBlades.rotation.y += radPerSec * (1 / 60);
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
        const isExploded = (structureMode === 'exploded');
        const worldViewWidth = isExploded ? 0.38 : 0.28;
        const worldViewHeight = worldViewWidth / (availWidth / availHeight);

        camera.left = -worldViewWidth / 2;
        camera.right = worldViewWidth / 2;
        camera.top = worldViewHeight / 2;
        camera.bottom = -worldViewHeight / 2;
        camera.clearViewOffset();
        camera.setViewOffset(w, h, -shiftFromScreenCenterX, 0, w, h);

        const targetY = isExploded ? 0.06 : 0.02;

        if (currentCamMode === 1) {
            camera.zoom = 1.05;
            camera.position.set(0.18, 0.16, 0.22);
            controls.target.set(0, targetY, 0);
        } else if (currentCamMode === 2) {
            camera.zoom = 1.05;
            camera.position.set(0, 0.30, 0.001);
            controls.target.set(0, targetY, 0);
        } else if (currentCamMode === 3) {
            camera.zoom = 1.15;
            camera.position.set(0, targetY, 0.30);
            controls.target.set(0, targetY, 0);
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
