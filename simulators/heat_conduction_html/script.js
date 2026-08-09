const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

let baseFrustumSize = 0.4;
const aspect = window.innerWidth / window.innerHeight;
let frustumSize = Math.max(baseFrustumSize, 0.5 / aspect);
const camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.001, 1000);
// パイプとパラフィンが上部のUI（パネルとグラフ）に被らないよう、カメラとターゲットを上方向にオフセットし、モデルを画面下部に表示する
camera.position.set(-0.03, 0.20, 0.15);
camera.zoom = 2.5;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0.07, 0.05, 0); // パラフィン中心(X=0.07)を維持しつつ、Yを適度に上げてモデルを下にずらす

controls.update();

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(0.5, 1, 1);
scene.add(dirLight);

// --- Flame Particle System ---
let flameCenter = 0;
let flameSpread = 0.08;
let isPlaying = false;
let simulationTime = 0;
let dt = 1.0;
const multiplier = 20.0;
const particleCount = 200;
const flameGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const velocities = [];
for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.02;
    positions[i * 3 + 1] = flameCenter + (Math.random() - 0.5) * flameSpread;
    positions[i * 3 + 2] = -0.01 - Math.random() * 0.03; // パイプより奥（背景）に配置
    velocities.push({
        y: 0.0005 + Math.random() * 0.001,
        x: (Math.random() - 0.5) * 0.0005,
        z: (Math.random() - 0.5) * 0.0005,
        life: Math.random()
    });
}
flameGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

// 円形のソフトなテクスチャを生成
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
flameParticles.visible = false; // 初期状態は非表示
scene.add(flameParticles);

// Background Grid (2cm = 0.02m intervals)
// サイズ50cm(0.5m)を25分割 = 2cm間隔
const gridHelper = new THREE.GridHelper(0.5, 25, 0x555555, 0x222222);
gridHelper.rotation.x = Math.PI / 2;
// X=0（パイプの左端）にグリッド線がぴったり合うように、中心をX=0.21に配置
gridHelper.position.set(0.21, 0, -0.05);
scene.add(gridHelper);

// FVM Grid Parameters
const Nr = 3;
const Ntheta = 16;
const Nz = 60; // 軸方向の分割数を少し増やす
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

// Precompute cell geometric properties
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
for(let i=2; i<=12; i+=2) {
    targetDistances.push(i / 100);
    targetLabels.push(i.toString());
    nullData.push(null);
}

const solidWaxMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.1,
    opacity: 0.9,
    transparent: true,
    roughness: 0.2
});
const meltedWaxMat = new THREE.MeshPhysicalMaterial({
    color: 0xdddddd,
    transmission: 0.9,
    opacity: 0.3,
    transparent: true,
    roughness: 0.1
});
const waxGeo = new THREE.SphereGeometry(0.003, 16, 16);

function setupPipesAndChart() {
    // 1. Cleanup existing
    pipes.forEach(pipe => {
        scene.remove(pipe.mesh);
        pipe.mesh.geometry.dispose();
        pipe.mesh.material.dispose();
        if (pipe.labelSprite) scene.remove(pipe.labelSprite);
        pipe.isothermSprites.forEach(s => { scene.remove(s.sprite); });
        pipe.isothermLines.forEach(l => { scene.remove(l.line); });
        if (pipe.waxParticles) {
            pipe.waxParticles.forEach(w => { scene.remove(w.mesh); });
        }
    });
    pipes = [];
    
    // 2. Get active materials
    const checkboxes = document.querySelectorAll('.mat-checkbox');
    const activeMats = [];
    checkboxes.forEach(cb => {
        if (cb.checked && allMaterials[cb.value]) {
            activeMats.push(allMaterials[cb.value]);
        }
    });
    
    // 3. Build pipes
    const spacing = 0.04;
    activeMats.forEach((mat, idx) => {
        const yOffset = (activeMats.length === 1) ? 0 : ( (activeMats.length - 1) / 2 - idx ) * spacing;
        
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
        scene.add(mesh);

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // ハイライト背景（控えめな角丸矩形）
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
        // depthTest: false でモデルに埋もれないようにする
        const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, side: THREE.DoubleSide });
        
        // ビルボード(Sprite)ではなく3D平面(Plane)にしてパイプの角度と平行にする
        const labelGeo = new THREE.PlaneGeometry(0.045, 0.011); // サイズを小さく調整
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        
        // 炎(X=0)とパラフィン(X=0.02~)と被らないよう、パイプのかなり上(Y=0.018)に配置してパラフィンを避ける
        labelMesh.position.set(0.03, yOffset + 0.018, 0.005);
        // カメラから見やすいように少し上を向かせる（X軸周りに回転）
        labelMesh.rotation.x = -Math.PI / 6; 
        labelMesh.renderOrder = 999; 
        scene.add(labelMesh);

        const isothermSprites = [];
        const isothermLines = [];
        const targetIsotherms = [50, 100, 300, 500, 700, 900, 1100];
        for (let T_iso of targetIsotherms) {
            const canvasIso = document.createElement('canvas');
            canvasIso.width = 128; canvasIso.height = 64;
            const ctxIso = canvasIso.getContext('2d');
            ctxIso.fillStyle = 'rgba(0,0,0,0)';
            ctxIso.fillRect(0,0,128,64);
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
            scene.add(spriteIso);
            isothermSprites.push({ T: T_iso, sprite: spriteIso });

            const lineGeom = new THREE.BufferGeometry();
            lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
                0, yOffset + r_out * 1.5, r_out,
                0, yOffset - r_out * 1.5, r_out
            ], 3));
            const lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.003, gapSize: 0.003 });
            const line = new THREE.Line(lineGeom, lineMat);
            line.computeLineDistances();
            scene.add(line);
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
            scene.add(waxMesh);
            pipe.waxParticles.push({ mesh: waxMesh, isMelted: false });
        });
    });

    if (pipes.length > 0) {
        const yMax = pipes[0].yOffset;
        const yMin = pipes[pipes.length - 1].yOffset;
        flameSpread = Math.max(0.08, (yMax - yMin) + 0.04);
        flameCenter = (yMax + yMin) / 2;
    }

    if (meltChartInstance) {
        meltChartInstance.destroy();
    }
    const datasets = pipes.map(pipe => {
        return {
            label: pipe.name + 'パイプ',
            borderColor: pipe.color,
            backgroundColor: pipe.color,
            data: [...nullData],
            tension: 0.1
        };
    });

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
                title: { display: true, text: '図：加熱端からの距離(cm)とパラフィンの融解時間(sec)の関係', color: '#f8fafc' }
            }
        }
    });

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
    updateColors();
    updateIsotherms();
}

document.querySelectorAll('.mat-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
        setupPipesAndChart();
    });
});

setupPipesAndChart();

function getHeatmapColor(val) {
    let r=0, g=0, b=0;
    if (val < 0.2) { b = 1; g = val * 5; }
    else if (val < 0.4) { g = 1; b = 1 - (val - 0.2) * 5; }
    else if (val < 0.6) { g = 1; r = (val - 0.4) * 5; }
    else if (val < 0.8) { r = 1; g = 1 - (val - 0.6) * 5; }
    else { r = 1; g = (val - 0.8) * 5; b = (val - 0.8) * 5; }
    return new THREE.Color(r, g, b);
}

function updateColors() {
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
            
            let i = Math.floor((r_sim - r_in) / dr);
            let j = Math.floor(theta_sim / dtheta);
            let k_z = Math.floor(z_sim / dz);
            
            i = Math.max(0, Math.min(Nr - 1, i));
            j = Math.max(0, Math.min(Ntheta - 1, j));
            k_z = Math.max(0, Math.min(Nz - 1, k_z));
            
            const temp = pipe.T[getIdx(i, j, k_z)];
            const tempNorm = Math.max(0, Math.min(1, (temp - 20) / 980));
            const color = getHeatmapColor(tempNorm);
            
            colors.setXYZ(idx, color.r, color.g, color.b);
        }
        colors.needsUpdate = true;
    });
}

// Simulation parameters
const h = 10;
const h_end = 10;
const T_inf = 20;

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


function stepSimulation3D() {
    pipes.forEach(pipe => {
        const T = pipe.T;
        const T_new = new Float64Array(T.length);
        const k = pipe.k;
        const mass_factor = dt / (pipe.rho * pipe.c);
        
        for (let i = 0; i < Nr; i++) {
            const props = cellProps[i];
            const invV = 1.0 / props.V;
            const factor = mass_factor * invV;
            
            for (let j = 0; j < Ntheta; j++) {
                const j_minus = (j - 1 + Ntheta) % Ntheta;
                const j_plus = (j + 1) % Ntheta;
                
                for (let k_z = 0; k_z < Nz; k_z++) {
                    const idx = getIdx(i, j, k_z);
                    const t_current = T[idx];
                    let Q = 0;
                    
                    if (i > 0) Q += k * (T[getIdx(i-1, j, k_z)] - t_current) / props.dist_r * props.A_r_minus;
                    if (i < Nr - 1) Q += k * (T[getIdx(i+1, j, k_z)] - t_current) / props.dist_r * props.A_r_plus;
                    else Q += h * (T_inf - t_current) * props.A_r_plus;
                    
                    Q += k * (T[getIdx(i, j_minus, k_z)] - t_current) / props.dist_theta * props.A_theta;
                    Q += k * (T[getIdx(i, j_plus, k_z)] - t_current) / props.dist_theta * props.A_theta;
                    
                    if (k_z > 0) Q += k * (T[getIdx(i, j, k_z-1)] - t_current) / props.dist_z * props.A_z;
                    else Q += k * (flameTemp - t_current) / (props.dist_z / 2) * props.A_z;
                    
                    if (k_z < Nz - 1) Q += k * (T[getIdx(i, j, k_z+1)] - t_current) / props.dist_z * props.A_z;
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
        for (let k = 0; k < Nz; k++) {
            profile[k] = pipe.T[getIdx(Nr - 1, 0, k)];
        }
        
        let lastDrawnX = -999;
        
        // 高温側（配列の後ろ）から描画し、重なる場合は間引く
        for (let i = pipe.isothermSprites.length - 1; i >= 0; i--) {
            const iso = pipe.isothermSprites[i];
            const lineObj = pipe.isothermLines[i];
            const targetT = iso.T;
            
            let foundX = -1;
            for (let k = 0; k < Nz - 1; k++) {
                const T_k = profile[k];
                const T_kp1 = profile[k+1];
                if (T_k >= targetT && T_kp1 <= targetT) {
                    let weight = (T_k - targetT) / (T_k - T_kp1);
                    if (isNaN(weight) || !isFinite(weight)) weight = 0;
                    const z_k = (k + 0.5) * dz;
                    const z_kp1 = (k + 1.5) * dz;
                    foundX = z_k + weight * (z_kp1 - z_k);
                    break;
                }
            }
            
            if (foundX >= 0) {
                // 50℃は必ず表示。それ以外で、前に描画したラベルと近すぎる場合は間引く (距離0.035 = 3.5cm)
                if (targetT !== 50 && foundX - lastDrawnX < 0.035) {
                    iso.sprite.visible = false;
                    lineObj.line.visible = false;
                } else {
                    iso.sprite.visible = true;
                    lineObj.line.visible = true;
                    // パイプの下側(Y方向マイナス)に配置する
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

function formatTime(totalSeconds) {
    const s = totalSeconds.toFixed(1);
    const m = Math.floor(totalSeconds / 60);
    const sec = Math.floor(totalSeconds % 60);
    return `${s} s (${m}分${sec.toString().padStart(2, '0')}秒)`;
}

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    
    if (isPlaying) {
        const frameTime = 1 / 60;
        const targetSimTime = frameTime * multiplier;
        const steps = Math.max(1, Math.floor(targetSimTime / dt));
        
        for(let s = 0; s < steps; s++){
            stepSimulation3D();
            simulationTime += dt;
        }
        updateColors();
        updateIsotherms();
        checkMeltingTimes();
        document.getElementById('time-display').textContent = formatTime(simulationTime);
    }
    
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
    
    const tempRatio = Math.max(0, Math.min(1, (flameTemp - 100) / 1900));
    const colorStart = new THREE.Color(0x880000);
    const colorMid = new THREE.Color(0xff6600);
    const colorEnd = new THREE.Color(0x88ccff);
    if (tempRatio < 0.5) {
        flameMat.color.lerpColors(colorStart, colorMid, tempRatio * 2);
    } else {
        flameMat.color.lerpColors(colorMid, colorEnd, (tempRatio - 0.5) * 2);
    }
    flameMat.size = 8 + tempRatio * 15;
    
    renderer.render(scene, camera);
}
animate(0);

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    let fs = Math.max(0.4, 0.5 / aspect);
    camera.left = -fs * aspect / 2;
    camera.right = fs * aspect / 2;
    camera.top = fs / 2;
    camera.bottom = -fs / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const flameAnimToggle = document.getElementById('flame-anim-toggle');
if (flameAnimToggle) {
    flameAnimToggle.addEventListener('change', () => {
        if (isPlaying) {
            flameParticles.visible = flameAnimToggle.checked;
        }
    });
}

document.getElementById('btn-start').addEventListener('click', () => {
    isPlaying = true;
    flameParticles.visible = flameAnimToggle ? flameAnimToggle.checked : true;
});
document.getElementById('btn-pause').addEventListener('click', () => {
    isPlaying = false;
    flameParticles.visible = false;
});

document.getElementById('btn-reset').addEventListener('click', () => {
    setupPipesAndChart();
    document.getElementById('time-display').textContent = formatTime(0);
});

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
                    meltChartInstance.data.datasets[pipeIdx].data[distIdx] = simulationTime;
                    chartUpdated = true;
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

// カメラ操作イベントリスナー
document.getElementById('btn-cam-3d').addEventListener('click', () => {
    // ① 3D俯瞰 (デフォルト) - 上部モーダル回避のため適度に下にオフセット
    camera.position.set(-0.03, 0.20, 0.15);
    camera.zoom = 2.5;
    camera.updateProjectionMatrix();
    controls.target.set(0.07, 0.05, 0); 
    controls.update();
});

document.getElementById('btn-cam-default').addEventListener('click', () => {
    // ② 真横 (全体) - 上部モーダル回避のため適度に下にオフセット
    const aspect = window.innerWidth / window.innerHeight;
    let fs = Math.max(0.4, 0.5 / aspect);
    camera.left = -fs * aspect / 2;
    camera.right = fs * aspect / 2;
    camera.top = fs / 2;
    camera.bottom = -fs / 2;
    camera.position.set(0.20, 0.10, 0.4);
    camera.zoom = 1.2;
    camera.updateProjectionMatrix();
    controls.target.set(0.20, 0.10, 0);
    controls.update();
});

document.getElementById('btn-cam-zoom').addEventListener('click', () => {
    // ③ 真横 (パラフィン拡大) - 上部モーダル回避のため適度に下にオフセット
    camera.position.set(0.07, 0.03, 0.4);
    camera.zoom = 3.5;
    camera.updateProjectionMatrix();
    controls.target.set(0.07, 0.03, 0);
    controls.update();
});
