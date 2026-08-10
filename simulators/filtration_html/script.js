const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const statusText = document.getElementById('status-text');

let state = 0; // 0: idle, 1: filtering
let particlesLeft = [];
let particlesRight = [];
let meshes = [];
let drips = [];
let waterLevelY = 50;
let filteredWaterHeight = 0;

// Mesh configuration
const meshY = 350;
const meshThickness = 8;
const gapSize = 14;
const meshWidth = 24;

function createMeshes() {
    meshes = [];
    // Left side (0 to canvas.width/2)
    for (let x = 0; x < canvas.width / 2; x += (meshWidth + gapSize)) {
        meshes.push({ x: x, w: meshWidth });
    }
    // Right side (canvas.width/2 to canvas.width)
    for (let x = canvas.width / 2; x < canvas.width; x += (meshWidth + gapSize)) {
        meshes.push({ x: x, w: meshWidth });
    }
}

class Particle {
    constructor(x, y, isFloc) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.isFloc = isFloc;
        this.radius = isFloc ? 18 : 6;
        this.settled = false;
        
        // For flocs, visually they are composed of many small particles
        this.subParticles = [];
        if (isFloc) {
            for(let i=0; i<6; i++) {
                this.subParticles.push({
                    ox: (Math.random() - 0.5) * 16,
                    oy: (Math.random() - 0.5) * 16,
                    r: 4 + Math.random() * 3
                });
            }
        }
    }

    update() {
        if (state === 0) {
            if (this.isFloc) {
                if (!this.settled) {
                    this.vy += 0.05; // Gravity settling
                    this.vx *= 0.95;
                    this.vy *= 0.95;
                    
                    this.x += this.vx;
                    this.y += this.vy;
                    
                    const minX = canvas.width / 2 + this.radius;
                    const maxX = canvas.width - this.radius;
                    if (this.x < minX) { this.x = minX; this.vx *= -0.5; }
                    if (this.x > maxX) { this.x = maxX; this.vx *= -0.5; }
                    
                    if (this.y + this.radius > meshY) {
                        this.y = meshY - this.radius;
                        this.vy = 0;
                        this.vx = 0;
                        this.settled = true;
                    }
                }
            } else {
                // Drift in top water pool
                this.x += this.vx;
                this.y += this.vy;
                
                // Random motion
                this.vx += (Math.random() - 0.5) * 0.1;
                this.vy += (Math.random() - 0.5) * 0.1;
                
                const speed = Math.hypot(this.vx, this.vy);
                if(speed > 0.5) {
                    this.vx = (this.vx/speed)*0.5;
                    this.vy = (this.vy/speed)*0.5;
                }
                
                // Keep in top bounds
                const minX = this.radius + 5;
                const maxX = canvas.width / 2 - this.radius - 5;
                if (this.x < minX) { this.x = minX; this.vx *= -1; }
                if (this.x > maxX) { this.x = maxX; this.vx *= -1; }
                if (this.y < waterLevelY + this.radius) { this.y = waterLevelY + this.radius; this.vy *= -1; }
                if (this.y > meshY - this.radius) { this.y = meshY - this.radius; this.vy *= -1; }
            }

        } else if (state === 1) {
            if (!this.settled) {
                if (this.y < meshY) {
                    // Above mesh (in draining water)
                    this.vy += 0.02; // gentle pull down
                    this.vx += (Math.random() - 0.5) * 0.2;
                    
                    // Friction/buoyancy in water
                    this.vx *= 0.95;
                    this.vy *= 0.95;
                    
                    this.x += this.vx;
                    this.y += this.vy;
                    
                    // Push down if water level drops below them
                    if (this.y < waterLevelY + this.radius) {
                        this.y = waterLevelY + this.radius;
                        this.vy = Math.max(0, this.vy); // prevent going up
                    }
                    
                    const minX = this.isFloc ? canvas.width / 2 + this.radius : this.radius;
                    const maxX = this.isFloc ? canvas.width - this.radius : canvas.width / 2 - this.radius;
                    
                    if (this.x < minX) { this.x = minX; this.vx *= -0.5; }
                    if (this.x > maxX) { this.x = maxX; this.vx *= -0.5; }
                    
                    // Collision with mesh
                    if (this.y + this.radius > meshY) {
                        let overMesh = false;
                        for (let m of meshes) {
                            if (this.isFloc) {
                                overMesh = true;
                                break;
                            } else {
                                if (this.x > m.x - this.radius * 0.5 && this.x < m.x + m.w + this.radius * 0.5) {
                                    overMesh = true;
                                    break;
                                }
                            }
                        }
                        
                        if (overMesh) {
                            // Hit the mesh
                            this.y = meshY - this.radius;
                            this.vy = 0;
                            this.vx = 0;
                            this.settled = true;
                        } else {
                            // Falling through gap
                            this.y += 2; // slight push
                        }
                    }
                } else {
                    // Below mesh
                    const poolY = canvas.height - filteredWaterHeight;
                    if (this.y < poolY) {
                        // Falling through air
                        this.vy += 0.15; 
                        this.x += this.vx;
                        this.y += this.vy;
                    } else {
                        // Floating in bottom pool
                        this.x += this.vx;
                        this.y += this.vy;
                        
                        this.vx += (Math.random() - 0.5) * 0.1;
                        this.vy += (Math.random() - 0.5) * 0.1;
                        
                        // Buoyancy / water resistance
                        this.vx *= 0.95;
                        this.vy *= 0.95;
                        
                        if (this.y > canvas.height - this.radius) {
                            this.y = canvas.height - this.radius;
                            this.vy *= -1;
                        }
                        if (this.y < poolY + this.radius) {
                            this.y = poolY + this.radius;
                            this.vy = Math.max(0, this.vy); // stay in pool
                        }
                    }
                    
                    const minX = this.isFloc ? canvas.width / 2 + this.radius : this.radius;
                    const maxX = this.isFloc ? canvas.width - this.radius : canvas.width / 2 - this.radius;
                    if (this.x < minX) { this.x = minX; this.vx *= -0.5; }
                    if (this.x > maxX) { this.x = maxX; this.vx *= -0.5; }
                }
            } else {
                // Settled on mesh
                if (this.y < meshY) {
                    if (waterLevelY < meshY) {
                        if (!this.isFloc && Math.random() < 0.05) {
                            this.x += (Math.random() - 0.5) * 2;
                            // sometimes they fall through if they jiggle into a gap
                            let overMesh = false;
                            for (let m of meshes) {
                                if (this.x > m.x - this.radius * 0.5 && this.x < m.x + m.w + this.radius * 0.5) {
                                    overMesh = true;
                                    break;
                                }
                            }
                            if (!overMesh) {
                                this.settled = false;
                            }
                        }
                    }
                }
            }
        }
    }

    draw(ctx) {
        if (this.isFloc) {
            // Draw floc as a cluster
            ctx.fillStyle = '#bfdbfe';
            ctx.strokeStyle = '#1d4ed8';
            ctx.lineWidth = 1;
            this.subParticles.forEach(sp => {
                ctx.beginPath();
                ctx.arc(this.x + sp.ox, this.y + sp.oy, sp.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
            // Draw a faint connecting mesh over the floc to simulate polymer
            ctx.strokeStyle = 'rgba(29, 78, 216, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Normal particle
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#a5f3fc';
            ctx.fill();
            ctx.strokeStyle = '#0891b2';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw tiny '-'
            ctx.fillStyle = '#0891b2';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '8px Arial';
            ctx.fillText('-', this.x, this.y);
        }
    }
}

function init() {
    state = 0;
    particlesLeft = [];
    particlesRight = [];
    drips = [];
    waterLevelY = 50;
    filteredWaterHeight = 0;
    
    createMeshes();
    
    // Left: 80 small particles
    for (let i = 0; i < 80; i++) {
        particlesLeft.push(new Particle(
            Math.random() * (canvas.width / 2 - 40) + 20,
            Math.random() * 100 + 50,
            false
        ));
    }
    
    // Right: 20 large flocs
    for (let i = 0; i < 20; i++) {
        particlesRight.push(new Particle(
            Math.random() * (canvas.width / 2 - 60) + canvas.width / 2 + 30,
            Math.random() * 100 + 50,
            true
        ));
    }
    
    btnStart.disabled = false;
    statusText.innerHTML = "状態: <strong>待機中</strong> - 「ろ過開始」を押して、原水と凝集処理水のろ過過程を比較してください。";
}

btnStart.addEventListener('click', () => {
    state = 1;
    btnStart.disabled = true;
    statusText.innerHTML = "状態: <strong>ろ過中</strong> - 微粒子は水とともにすり抜け、粗大フロックは捕捉されて水が抜けた後に乾き粒子として残ります。";
    
    // Start gentle downward push
    [...particlesLeft, ...particlesRight].forEach(p => {
        if (!p.settled) p.vy += 0.2;
    });
});

btnReset.addEventListener('click', init);

function animate() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update liquid logic
    if (state === 1) {
        if (waterLevelY < meshY) {
            waterLevelY += 0.3; // drain rate
        }
        if (filteredWaterHeight < 120) {
            filteredWaterHeight += 0.15; // accumulate rate
        }
        
        // Add drips
        if (waterLevelY < meshY && Math.random() < 0.2) {
            let x = 0;
            if (Math.random() < 0.5) {
                const gapIdx = Math.floor(Math.random() * (meshes.length / 2 - 1));
                x = meshes[gapIdx].x + meshes[gapIdx].w + gapSize / 2;
            } else {
                const start = Math.floor(meshes.length / 2);
                const gapIdx = start + Math.floor(Math.random() * (meshes.length / 2 - 1));
                x = meshes[gapIdx].x + meshes[gapIdx].w + gapSize / 2;
            }
            drips.push({x: x, y: meshY + meshThickness, vy: 0});
        }
    }
    
    // Draw top water
    if (waterLevelY < meshY) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        ctx.fillRect(0, waterLevelY, canvas.width, meshY - waterLevelY);
        // Water surface
        ctx.beginPath();
        ctx.moveTo(0, waterLevelY);
        ctx.lineTo(canvas.width, waterLevelY);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw bottom water
    if (filteredWaterHeight > 0) {
        const poolY = canvas.height - filteredWaterHeight;
        ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        ctx.fillRect(0, poolY, canvas.width, filteredWaterHeight);
        ctx.beginPath();
        ctx.moveTo(0, poolY);
        ctx.lineTo(canvas.width, poolY);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw Center Divider
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 40);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw meshes
    meshes.forEach(m => {
        // Draw mesh solid part
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(m.x, meshY, m.w, meshThickness);
        // Draw some texture
        ctx.fillStyle = '#64748b';
        ctx.fillRect(m.x + 2, meshY + 2, m.w - 4, meshThickness - 4);
    });
    
    // Draw support line for meshes faintly
    ctx.beginPath();
    ctx.moveTo(0, meshY + meshThickness);
    ctx.lineTo(canvas.width, meshY + meshThickness);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Update and draw drips
    ctx.fillStyle = '#7dd3fc';
    for (let i = drips.length - 1; i >= 0; i--) {
        let d = drips[i];
        d.vy += 0.2; // gravity
        d.y += d.vy;
        
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Remove if it hits bottom pool
        if (d.y > canvas.height - filteredWaterHeight) {
            drips.splice(i, 1);
        }
    }

    // Collision between flocs on the right to stack them up
    for (let i = 0; i < particlesRight.length; i++) {
        for (let j = i + 1; j < particlesRight.length; j++) {
            let p1 = particlesRight[i];
            let p2 = particlesRight[j];
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let distSq = dx*dx + dy*dy;
            let minDist = p1.radius + p2.radius - 2; // slightly overlap
            if (distSq < minDist*minDist && distSq > 0) {
                let dist = Math.sqrt(distSq);
                let overlap = minDist - dist;
                let nx = dx / dist;
                let ny = dy / dist;
                p1.x -= nx * overlap * 0.5;
                p1.y -= ny * overlap * 0.5;
                p2.x += nx * overlap * 0.5;
                p2.y += ny * overlap * 0.5;
                
                p1.vx *= 0.8;
                p1.vy *= 0.8;
                p2.vx *= 0.8;
                p2.vy *= 0.8;
                
                if (p1.settled) p2.settled = true;
                if (p2.settled) p1.settled = true;
            }
        }
    }

    // Update and draw
    particlesLeft.forEach(p => {
        p.update();
        p.draw(ctx);
    });
    
    particlesRight.forEach(p => {
        p.update();
        p.draw(ctx);
    });
    
    requestAnimationFrame(animate);
}

// Start
init();
animate();
