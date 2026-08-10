const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');
const btnCoagulant = document.getElementById('btn-coagulant');
const btnPolymer = document.getElementById('btn-polymer');
const btnReset = document.getElementById('btn-reset');
const statusText = document.getElementById('status-text');

let state = 0; // 0: initial, 1: coagulant, 2: polymer
let particles = [];
let coagulants = [];
const NUM_PARTICLES = 60; // 60 * -1 = -60
const NUM_COAGULANTS = 20; // 20 * +3 = +60 (電荷量保存)
const NUM_FLOCS = 8;
const NUM_COARSE = 3;

class Particle {
    constructor(x, y, isCoagulant = false) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.radius = 12;
        this.isCoagulant = isCoagulant;
        this.charge = isCoagulant ? 3 : -1; // 凝集剤は+3、粒子は-1
        this.targetFloc = null;
        this.targetCoarse = null;
        this.settled = false;
        this.angle = Math.random() * Math.PI * 2; // For jiggle
    }

    update() {
        if (state === 0) {
            // Random floating
            this.x += this.vx;
            this.y += this.vy;
            
            // Bounce off walls
            if (this.x < this.radius) { this.x = this.radius; this.vx *= -1; }
            if (this.x > canvas.width - this.radius) { this.x = canvas.width - this.radius; this.vx *= -1; }
            if (this.y < this.radius) { this.y = this.radius; this.vy *= -1; }
            if (this.y > canvas.height - this.radius) { this.y = canvas.height - this.radius; this.vy *= -1; }
            
            // Add slight randomness (Brownian motion)
            this.vx += (Math.random() - 0.5) * 0.3;
            this.vy += (Math.random() - 0.5) * 0.3;
            
            // Limit speed
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 1.5) {
                this.vx = (this.vx / speed) * 1.5;
                this.vy = (this.vy / speed) * 1.5;
            }
        } else if (state === 1 && this.targetFloc != null) {
            // Move towards basic floc center
            const targetX = basicFlocCenters[this.targetFloc].x;
            const targetY = basicFlocCenters[this.targetFloc].y;
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 15) {
                this.vx += (dx / dist) * 0.15;
                this.vy += (dy / dist) * 0.15;
            }
            
            this.vx *= 0.94; // Friction
            this.vy *= 0.94;
            this.x += this.vx;
            this.y += this.vy;
            
            // Keep in bounds
            if (this.x < this.radius) this.x = this.radius;
            if (this.x > canvas.width - this.radius) this.x = canvas.width - this.radius;
            if (this.y < this.radius) this.y = this.radius;
            if (this.y > canvas.height - this.radius) this.y = canvas.height - this.radius;

        } else if (state === 2) {
            // Move towards coarse floc center and settle at bottom
            if (!this.settled) {
                const targetX = coarseFlocCenters[this.targetCoarse].x;
                const targetY = canvas.height - 30 - (this.targetFloc % 3) * 10; // Bottom area slightly randomized
                
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist > 25) {
                    this.vx += (dx / dist) * 0.1;
                    this.vy += (dy / dist) * 0.1 + 0.05; // Gravity
                } else {
                    this.settled = true;
                }
                
                this.vx *= 0.92;
                this.vy *= 0.92;
                this.x += this.vx;
                this.y += this.vy;
                
                // Add slight swirl for visual effect
                this.x += Math.cos(this.angle) * 0.5;
                this.y += Math.sin(this.angle) * 0.5;
                this.angle += 0.1;
            } else {
                // Jiggle slightly on bottom
                this.x += (Math.random() - 0.5) * 0.2;
                this.y += (Math.random() - 0.5) * 0.2;
            }
        }
        
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        if (this.isCoagulant) {
            // Coagulant (+)
            ctx.fillStyle = '#fef08a';
            ctx.fill();
            ctx.strokeStyle = '#ca8a04';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#ca8a04';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '16px Arial';
            ctx.fillText('+', this.x, this.y + 1);
        } else {
            // Particle (-)
            ctx.fillStyle = '#a5f3fc';
            ctx.fill();
            ctx.strokeStyle = '#0891b2';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#0891b2';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '18px Arial';
            ctx.fillText('-', this.x, this.y + 1);
        }
    }
}

function init() {
    state = 0;
    particles = [];
    coagulants = [];
    basicFlocCenters = [];
    coarseFlocCenters = [];

    // Create negative particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push(new Particle(
            Math.random() * (canvas.width - 40) + 20,
            Math.random() * (canvas.height - 40) + 20
        ));
    }
    
    // Setup target coarse flocs for state 2
    for (let i = 0; i < NUM_COARSE; i++) {
        coarseFlocCenters.push({
            x: canvas.width * (i + 1) / (NUM_COARSE + 1),
            y: canvas.height - 40
        });
    }

    btnCoagulant.disabled = false;
    btnPolymer.disabled = true;
    statusText.innerHTML = "状態: <strong>自然状態</strong> - 微細粒子がマイナスに帯電し、互いに反発して浮遊しています。";
}

btnCoagulant.addEventListener('click', () => {
    state = 1;
    btnCoagulant.disabled = true;
    btnPolymer.disabled = false;
    statusText.innerHTML = "状態: <strong>凝結反応</strong> - プラスの凝集剤により電荷が中和され、<strong>基礎フロック</strong>が形成されます。";
    
    // Add coagulants from the top
    for (let i = 0; i < NUM_COAGULANTS; i++) {
        let c = new Particle(Math.random() * canvas.width, -20, true);
        c.vy = 2 + Math.random() * 2;
        coagulants.push(c);
    }
    
    // Create random target centers for basic flocs
    for (let i = 0; i < NUM_FLOCS; i++) {
        basicFlocCenters.push({
            x: Math.random() * (canvas.width - 100) + 50,
            y: Math.random() * (canvas.height - 100) + 50,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5
        });
    }
    
    // Assign particles and coagulants to basic flocs
    const allP = [...particles, ...coagulants];
    allP.forEach((p, idx) => {
        p.targetFloc = idx % NUM_FLOCS;
        p.targetCoarse = p.targetFloc % NUM_COARSE;
    });
});

btnPolymer.addEventListener('click', () => {
    state = 2;
    btnPolymer.disabled = true;
    statusText.innerHTML = "状態: <strong>凝集反応</strong> - ポリマーが基礎フロックを吸着し、<strong>粗大フロック</strong>となって沈降します。";
    
    // Stirring effect: give an upward push before they settle down
    [...particles, ...coagulants].forEach(p => {
        p.vy = -4 - Math.random() * 4;
        p.vx += (Math.random() - 0.5) * 8;
        p.settled = false;
    });
});

btnReset.addEventListener('click', init);

function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const allParticles = [...particles, ...coagulants];

    // Draw polymers in state 2
    if (state === 2) {
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Connect particles that share the same coarse center to simulate polymer chain
        for (let i = 0; i < NUM_COARSE; i++) {
            // get random subset of particles in this coarse floc that are somewhat close
            let pts = allParticles.filter(p => p.targetCoarse === i && p.y > 0);
            
            if (pts.length > 5) {
                // sort points by x coordinate to form a continuous chain
                pts.sort((a, b) => a.x - b.x);
                const numConnect = Math.min(12, pts.length);
                const chainPts = pts.slice(0, numConnect);
                
                // Add tail extensions
                let startX = chainPts[0].x - 15;
                let startY = chainPts[0].y - 15;
                let endX = chainPts[numConnect-1].x + 15;
                let endY = chainPts[numConnect-1].y + 15;
                
                if (numConnect > 1) {
                    const dx0 = chainPts[0].x - chainPts[1].x;
                    const dy0 = chainPts[0].y - chainPts[1].y;
                    const len0 = Math.hypot(dx0, dy0) || 1;
                    startX = chainPts[0].x + (dx0 / len0) * 20;
                    startY = chainPts[0].y + (dy0 / len0) * 20;
                    
                    const dxN = chainPts[numConnect-1].x - chainPts[numConnect-2].x;
                    const dyN = chainPts[numConnect-1].y - chainPts[numConnect-2].y;
                    const lenN = Math.hypot(dxN, dyN) || 1;
                    endX = chainPts[numConnect-1].x + (dxN / lenN) * 20;
                    endY = chainPts[numConnect-1].y + (dyN / lenN) * 20;
                }

                ctx.strokeStyle = '#153e75';
                ctx.lineWidth = 3;
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(chainPts[0].x, chainPts[0].y);
                
                // Curve through points using quadratic curves
                for (let j = 0; j < numConnect - 1; j++) {
                    const xc = (chainPts[j].x + chainPts[j+1].x) / 2;
                    const yc = (chainPts[j].y + chainPts[j+1].y) / 2;
                    ctx.quadraticCurveTo(chainPts[j].x, chainPts[j].y, xc, yc);
                }
                if (numConnect > 1) {
                    ctx.lineTo(chainPts[numConnect-1].x, chainPts[numConnect-1].y);
                }
                
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                // Draw small nodes on the polymer chain
                ctx.fillStyle = '#153e75';
                for(let j=0; j<numConnect; j++) {
                    ctx.beginPath();
                    ctx.arc(chainPts[j].x, chainPts[j].y, 6, 0, Math.PI*2);
                    ctx.fill();
                }
            }
        }
    }
    
    // Update and drift basic floc centers in state 1
    if (state === 1) {
        basicFlocCenters.forEach(f => {
            f.x += f.vx;
            f.y += f.vy;
            
            // Randomly change direction slightly
            f.vx += (Math.random() - 0.5) * 0.1;
            f.vy += (Math.random() - 0.5) * 0.1;
            
            // Limit speed
            const speed = Math.hypot(f.vx, f.vy);
            if(speed > 0.5) {
                f.vx = (f.vx / speed) * 0.5;
                f.vy = (f.vy / speed) * 0.5;
            }
            
            // Keep in bounds
            if (f.x < 50) { f.x = 50; f.vx *= -1; }
            if (f.x > canvas.width - 50) { f.x = canvas.width - 50; f.vx *= -1; }
            if (f.y < 50) { f.y = 50; f.vy *= -1; }
            if (f.y > canvas.height - 50) { f.y = canvas.height - 50; f.vy *= -1; }
        });
    }

    // Update all particles
    allParticles.forEach(p => {
        p.update();
    });

    // Resolve collisions so they don't overlap too much
    for (let i = 0; i < allParticles.length; i++) {
        for (let j = i + 1; j < allParticles.length; j++) {
            const p1 = allParticles[i];
            const p2 = allParticles[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            // minimum distance is sum of radii plus a tiny gap
            const minDist = p1.radius + p2.radius + 1; 
            
            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;
                
                // Push them apart
                const push = overlap * 0.5;
                p1.x -= nx * push;
                p1.y -= ny * push;
                p2.x += nx * push;
                p2.y += ny * push;
                
                // Stabilize velocities to form a nice static cluster
                p1.vx *= 0.8;
                p1.vy *= 0.8;
                p2.vx *= 0.8;
                p2.vy *= 0.8;
            }
        }
    }

    // Draw all particles
    allParticles.forEach(p => {
        p.draw(ctx);
    });

    requestAnimationFrame(animate);
}

init();
animate();
