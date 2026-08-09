// Physics constants
const g = 9.81;     // Gravity (m/s^2)
let rho_f = 1000;   // Fluid density (kg/m^3)
let mu = 0.001;     // Dynamic viscosity (Pa*s)

// UI elements
const slider = document.getElementById('particle-size-slider');
const valDisp = document.getElementById('particle-size-val');
const matSelect = document.getElementById('particle-density');
const fluidPreset = document.getElementById('fluid-preset');
const fluidDensityInput = document.getElementById('fluid-density');
const fluidViscosityInput = document.getElementById('fluid-viscosity');
const btnDrop = document.getElementById('btn-drop');
const btnReset = document.getElementById('btn-reset');

const resDStar = document.getElementById('res-d-star');
const resRegion = document.getElementById('res-region');
const resVelocity = document.getElementById('res-velocity');
const resRep = document.getElementById('res-rep');

let d = 0.00001; // Particle diameter in meters (0.01mm default)
let rho_p = 2650; // Particle density

let isSwarmMode = true; // Always true now
const swarmCount = 3000; // significantly increased number of particles
let swarmData = []; // stores per-particle data

// Simulation state
let isDropping = false;
let currentY = 0.4; // Start height in meters (40cm cylinder)
const startHeight = 0.4;
let time = 0;
let region = '';
let d_star = 0;
let isFloating = false;

// Three.js setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e293b); // Distinct canvas background color
scene.fog = new THREE.FogExp2(0x1e293b, 0.05);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10);
// 俯瞰（斜め上）をデフォルトの視点にする
camera.position.set(0.35, startHeight * 1.3, 0.65);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// シリンダー中心をターゲットに
controls.target.set(0, startHeight / 2, 0);
controls.update();

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Boost ambient light
scene.add(ambientLight);

// Top-right light
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Front light (camera direction)
const frontLight = new THREE.DirectionalLight(0xffffff, 1.5); // Boost front light
frontLight.position.set(0, startHeight / 2, 1);
scene.add(frontLight);

// Grid & Environment
const grid = new THREE.GridHelper(0.5, 50, 0x334155, 0x1e293b);
scene.add(grid);

// Graduated Cylinder (Container)
const cylRadius = 0.02; // 40mm diameter -> 20mm radius = 0.02m
const cylGeo = new THREE.CylinderGeometry(cylRadius, cylRadius, startHeight, 32);
const cylMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    roughness: 0.05,
    transmission: 0.9, // Realistic glass transmission
    ior: 1.5,          // Index of refraction for glass
    side: THREE.DoubleSide,
    depthWrite: false
});
const cylinder = new THREE.Mesh(cylGeo, cylMat);
cylinder.position.set(0, startHeight / 2, 0);
scene.add(cylinder);

// Cylinder Edges (Outline)
const edgesGeo = new THREE.EdgesGeometry(cylGeo);
const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false });
const cylinderEdges = new THREE.LineSegments(edgesGeo, edgesMat);
cylinderEdges.position.copy(cylinder.position);
cylinderEdges.visible = false; // Hide dense wireframe to improve internal visibility
scene.add(cylinderEdges);

// Cylinder Base
const baseThickness = 0.005; // 5mm thick base
const baseGeo = new THREE.CylinderGeometry(cylRadius * 2, cylRadius * 2.5, baseThickness, 32);
const base = new THREE.Mesh(baseGeo, cylMat);
base.position.set(0, -baseThickness / 2, 0);
scene.add(base);

// Cylinder Base Edges
const baseEdgesGeo = new THREE.EdgesGeometry(baseGeo);
const baseEdges = new THREE.LineSegments(baseEdgesGeo, edgesMat);
baseEdges.position.copy(base.position);
scene.add(baseEdges);

// Liquid inside cylinder (slightly smaller radius to prevent z-fighting)
const liqGeo = new THREE.CylinderGeometry(cylRadius * 0.98, cylRadius * 0.98, startHeight * 0.95, 32);
const liqMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false // Fix transparency layering
});
const liquid = new THREE.Mesh(liqGeo, liqMat);
liquid.position.set(0, (startHeight * 0.95) / 2, 0);
liquid.visible = false; // Drop semi-transparency of fluid
scene.add(liquid);

// Measuring marks (ticks) have been removed as they created an unwanted wireframe look


// Particle Swarm (InstancedMesh)
const particleGeo = new THREE.SphereGeometry(1, 32, 32);
const particleMat = new THREE.MeshPhongMaterial({ color: 0xfacc15, emissive: 0xd97706, shininess: 150 });
const swarmMesh = new THREE.InstancedMesh(particleGeo, particleMat, swarmCount);
swarmMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
swarmMesh.visible = true; 
scene.add(swarmMesh);

function generateLogNormal(median) {
    // Generate log-normal distributed value around the median
    // A sigma of 0.6 provides a realistic particle size distribution without spawning massive outliers
    let sigma = 0.6; 
    let mu_log = Math.log(median); 
    let u1 = Math.random();
    let u2 = Math.random();
    // Box-Muller transform
    let z0 = Math.sqrt(-2.0 * Math.log(u1 + 1e-10)) * Math.cos(2.0 * Math.PI * u2);
    let val = Math.exp(mu_log + z0 * sigma);
    
    // Hard clamp to prevent particles larger than the cylinder itself
    let maxDiam = cylRadius * 1.8; // 90% of cylinder width
    if (val > maxDiam) val = maxDiam;
    
    return val;
}

function calculatePhysicsForDiameter(diameter, current_rho_p, current_rho_f, current_mu) {
    let density_diff = current_rho_p - current_rho_f;
    let floating = density_diff < 0;
    let abs_diff = Math.abs(density_diff);
    let ds = diameter * Math.pow((current_rho_f * abs_diff * g) / (current_mu * current_mu), 1/3);
    
    let vt = 0;
    let reg = '';
    if (ds < 3.3) {
        reg = 'Stokes';
        vt = (g * abs_diff * diameter * diameter) / (18 * current_mu);
    } else if (ds <= 43.6) {
        reg = 'Allen';
        vt = 0.153 * Math.pow(g, 0.71) * Math.pow(diameter, 1.14) * Math.pow(abs_diff, 0.71) / (Math.pow(current_rho_f, 0.29) * Math.pow(current_mu, 0.43));
    } else {
        reg = 'Newton';
        vt = 1.74 * Math.sqrt((g * abs_diff * diameter) / current_rho_f);
    }
    
    let suspended = (diameter <= 1e-6);
    if (suspended) {
        vt = 0;
    }
    
    if (floating) vt = -vt;
    let rep = (current_rho_f * Math.abs(vt) * diameter) / current_mu;
    return { vt, ds, reg, floating, rep, suspended };
}

function initSwarm(mean_d, logVal) {
    swarmData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < swarmCount; i++) {
        let diam = generateLogNormal(mean_d);
        let phys = calculatePhysicsForDiameter(diam, rho_p, rho_f, mu);
        
        // Draw at 10x scale for better visibility (SphereGeometry has radius 1, so true scale is diam/2)
        let visualScale = (diam * 10) / 2; 
        
        // Give the initial placement some thickness (cylindrical volume)
        let init_y = phys.floating ? (Math.random() * (startHeight * 0.15)) : (startHeight - Math.random() * (startHeight * 0.15));
        
        // Random placement in cylinder
        let r = Math.random() * cylRadius * 0.8;
        let theta = Math.random() * Math.PI * 2;
        let x = r * Math.cos(theta);
        let z = r * Math.sin(theta);
        
        swarmData.push({
            d: diam,
            vt: phys.vt,
            ds: phys.ds,
            reg: phys.reg,
            floating: phys.floating,
            suspended: phys.suspended,
            scale: visualScale,
            x: x,
            z: z,
            y: init_y,
            phaseX: Math.random() * Math.PI * 2,
            phaseZ: Math.random() * Math.PI * 2
        });
        
        dummy.position.set(x, init_y, z);
        dummy.scale.set(visualScale, visualScale, visualScale);
        dummy.updateMatrix();
        swarmMesh.setMatrixAt(i, dummy.matrix);
    }
    swarmMesh.instanceMatrix.needsUpdate = true;
}

function updatePhysics() {
    // Read inputs
    let logVal = parseFloat(slider.value);
    let d_mm = Math.pow(10, logVal);
    
    if (d_mm < 0.01) {
        valDisp.textContent = d_mm.toExponential(2);
    } else {
        valDisp.textContent = d_mm.toFixed(4);
    }
    
    d = d_mm / 1000.0;
    rho_p = parseFloat(matSelect.value);

    // Read fluid inputs
    rho_f = parseFloat(fluidDensityInput.value);
    mu = parseFloat(fluidViscosityInput.value);

    if (rho_f <= 0) rho_f = 1;
    if (mu <= 0) mu = 0.0001;

    // Calculate mean physics for UI
    let meanPhys = calculatePhysicsForDiameter(d, rho_p, rho_f, mu);
    v_t = meanPhys.vt;
    d_star = meanPhys.ds;
    region = meanPhys.reg;
    isFloating = meanPhys.floating;
    Re_p = meanPhys.rep;

    // Update UI
    resDStar.textContent = d_star.toFixed(2);
    resVelocity.textContent = v_t.toFixed(4) + ' m/s';
    resRep.textContent = Re_p.toFixed(1);
    
    if (meanPhys.suspended) {
        region = 'ブラウン運動 (浮遊)';
        resRegion.textContent = region;
        resRegion.style.color = '#a8a29e'; // Gray
    } else {
        resRegion.textContent = region + (region === 'Stokes' ? ' (層流域)' : (region === 'Allen' ? ' (中間域)' : ' (乱流域)'));
        if (d_star < 3.3) {
            resRegion.style.color = '#38bdf8'; // Blue
        } else if (d_star <= 43.6) {
            resRegion.style.color = '#10b981'; // Green
        } else {
            resRegion.style.color = '#f43f5e'; // Red
        }
    }

    initSwarm(d, logVal);
}

slider.addEventListener('input', updatePhysics);
matSelect.addEventListener('change', updatePhysics);
fluidDensityInput.addEventListener('input', updatePhysics);
fluidViscosityInput.addEventListener('input', updatePhysics);

fluidPreset.addEventListener('change', (e) => {
    if (e.target.value === 'water') {
        fluidDensityInput.value = 1000;
        fluidViscosityInput.value = 0.001;
    } else if (e.target.value === 'glycerin') {
        fluidDensityInput.value = 1260;
        fluidViscosityInput.value = 1.0;
    } else if (e.target.value === 'air') {
        fluidDensityInput.value = 1.2;
        fluidViscosityInput.value = 0.000018;
    }
    updatePhysics();
});

function resetPositions() {
    isDropping = false;
    time = 0;
    initSwarm(d, parseFloat(slider.value));
}

btnDrop.addEventListener('click', () => {
    resetPositions();
    isDropping = true;
});

btnReset.addEventListener('click', resetPositions);

// Initialization
updatePhysics();

const clock = new THREE.Clock();
const timeScale = 0.5; // Run simulation at half speed for better visual observation

function animate() {
    requestAnimationFrame(animate);
    
    // dt represents the elapsed physical time in this frame
    let realDt = clock.getDelta();
    let dt = realDt * timeScale;
    
    // カメラY追従: シリンダー中心を追従（距離・角度は変えない）
    let targetCamY = startHeight / 2;
    let dy = (targetCamY - controls.target.y) * 3 * realDt;
    controls.target.y += dy;
    camera.position.y  += dy;
    
    if (isDropping) {
        time += dt;
        
        const dummy = new THREE.Object3D();
        let allFinished = true;
        
        for (let i = 0; i < swarmCount; i++) {
            let p = swarmData[i];
            let visual_v_t = p.vt;
            
            let wobbleX = p.x;
            let wobbleZ = p.z;
            
            if (p.suspended) {
                // Brownian motion
                p.x += (Math.random() - 0.5) * 0.5 * dt;
                p.y += (Math.random() - 0.5) * 0.5 * dt;
                p.z += (Math.random() - 0.5) * 0.5 * dt;
                
                if (p.y < 0) p.y = 0;
                if (p.y > startHeight) p.y = startHeight;
                
                let dist = Math.sqrt(p.x * p.x + p.z * p.z);
                if (dist > cylRadius * 0.9) {
                    p.x *= (cylRadius * 0.9) / dist;
                    p.z *= (cylRadius * 0.9) / dist;
                }
                wobbleX = p.x;
                wobbleZ = p.z;
                allFinished = false;
            } else {
                if (p.reg === 'Allen') {
                    p.phaseX += dt * 5;
                    p.phaseZ += dt * 5;
                    wobbleX += Math.sin(p.phaseX) * 0.1 * p.scale;
                    wobbleZ += Math.cos(p.phaseZ) * 0.1 * p.scale;
                } else if (p.reg === 'Newton') {
                    p.x += (Math.random() - 0.5) * 8.0 * dt * p.scale;
                    p.z += (Math.random() - 0.5) * 8.0 * dt * p.scale;
                    
                    let dist = Math.sqrt(p.x * p.x + p.z * p.z);
                    if (dist > cylRadius * 0.9) {
                        p.x *= (cylRadius * 0.9) / dist;
                        p.z *= (cylRadius * 0.9) / dist;
                    }
                    wobbleX = p.x;
                    wobbleZ = p.z;
                }
                
                if (!p.floating) {
                    p.y -= visual_v_t * dt;
                    if (p.y <= 0.005) p.y = 0.005; else allFinished = false;
                } else {
                    p.y += Math.abs(visual_v_t) * dt;
                    if (p.y >= startHeight - 0.005) p.y = startHeight - 0.005; else allFinished = false;
                }
            }
            
            dummy.position.set(wobbleX, p.y, wobbleZ);
            dummy.scale.set(p.scale, p.scale, p.scale);
            dummy.updateMatrix();
            swarmMesh.setMatrixAt(i, dummy.matrix);
        }
        
        swarmMesh.instanceMatrix.needsUpdate = true;
        if (allFinished) isDropping = false;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

animate();

function optimizeCameraLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    camera.aspect = w / h;
    
    let leftEdge = 0;
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        const rect = dashboard.getBoundingClientRect();
        leftEdge = rect.right;
    }
    
    let availW = w - leftEdge;
    if (availW < 100) availW = 100;
    
    const availCenter = leftEdge + availW / 2;
    const shiftPx = availCenter - (w / 2);
    
    camera.setViewOffset(w, h, -shiftPx, 0, w, h);
    
    let widthScale = availW / 600;
    let heightScale = h / 600;
    let dynamicScale = Math.min(widthScale, heightScale);
    dynamicScale = Math.max(0.6, Math.min(1.5, dynamicScale));
    
    camera.zoom = 1.0 * dynamicScale;
    camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    optimizeCameraLayout();
});

// Initial call
optimizeCameraLayout();
