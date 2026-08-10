const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const statusText = document.getElementById('status-text');
const speedSlider = document.getElementById('flow-speed');
const speedVal = document.getElementById('speed-val');
const densityGravelSlider = document.getElementById('density-gravel');
const densitySandSlider = document.getElementById('density-sand');
const densityCottonSlider = document.getElementById('density-cotton');
const densityGravelVal = document.getElementById('density-gravel-val');
const densitySandVal = document.getElementById('density-sand-val');
const densityCottonVal = document.getElementById('density-cotton-val');

speedSlider.addEventListener('input', () => {
    speedVal.textContent = parseFloat(speedSlider.value).toFixed(1) + 'x';
});

// Density multipliers: 1.0 = default packing. Higher = more tightly packed
// grains/fibers (smaller gaps, slower flow, higher capture). Lower = sparser.
let densityGravel = 1;
let densitySand = 1;
let densityCotton = 1;

function onDensityChange() {
    densityGravel = parseFloat(densityGravelSlider.value);
    densitySand = parseFloat(densitySandSlider.value);
    densityCotton = parseFloat(densityCottonSlider.value);
    densityGravelVal.textContent = densityGravel.toFixed(1) + 'x';
    densitySandVal.textContent = densitySand.toFixed(1) + 'x';
    densityCottonVal.textContent = densityCotton.toFixed(1) + 'x';
    // Regenerate the media geometry in place — existing water particles keep
    // their current state, only the packing of gravel/sand/cotton changes.
    createMedia();
}
densityGravelSlider.addEventListener('input', onDensityChange);
densitySandSlider.addEventListener('input', onDensityChange);
densityCottonSlider.addEventListener('input', onDensityChange);

let state = 0;
let particles = [];
let gravels = [];
let sands = [];
let cottonLines = [];

const COL_W = canvas.width / 3; // 300
const mediaTop = 180;
const mediaBottom = 410;
const FINE_PER_COL = 60;

// Continuous raw-water supply tuning:
// - Fine SS that make it through the media float below for a while, then are
//   recycled back to the top as "fresh" raw water — this keeps the influent
//   turbid indefinitely instead of the tank slowly draining and clearing.
// - Debris that slips through gravel uncaptured (rests on the floor) is
//   recycled the same way. Debris/SS actually captured INSIDE the media stays
//   put permanently, so the visible build-up of trapped impurities still shows.
const RECYCLE_FLOAT_FRAMES = 260;
const RECYCLE_REST_FRAMES = 220;
const ABOVE_FINE_TARGET = FINE_PER_COL;   // keep the upstream zone this turbid, always
const ABOVE_DEBRIS_TARGET = 5;
const MAX_TOTAL_FINE_PER_COL = 260;   // safety ceiling so captured particles don't grow forever
const MAX_TOTAL_DEBRIS_PER_COL = 40;
const TOPUP_INTERVAL = 15;
let frameCount = 0;

// Generates an irregular, non-convex-looking polygon as an array of {x,y}
// offsets from a center point, for drawing angular gravel/sand grains.
function makeIrregularPoly(baseR, sides, jag) {
    const pts = [];
    const angleStep = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep + (Math.random() - 0.5) * angleStep * 0.6;
        const r = baseR * (1 - jag / 2 + Math.random() * jag);
        pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return pts;
}

function createMedia() {
    gravels = [];
    sands = [];
    cottonLines = [];

    // --- Gravel (col 0: x=0..300) ---
    // Large stones r=28-40; spacing shrinks as density increases (tighter packing,
    // smaller gaps), and grows as density decreases (sparser, bigger gaps).
    const gravelSpacingY = 80 / densityGravel;
    const gravelSpacingX = 75 / densityGravel;
    for (let y = mediaTop + 40; y < mediaBottom - 15; y += gravelSpacingY) {
        for (let x = 35; x < 270; x += gravelSpacingX) {
            const r = 28 + Math.random() * 12;
            gravels.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                r: r,
                angle: Math.random() * Math.PI,
                poly: makeIrregularPoly(r, 6 + Math.floor(Math.random() * 4), 0.5)
            });
        }
    }

    // --- Sand (col 1: x=300..600) ---
    // Medium grains r=6-9; spacing shrinks as density increases → smaller, more
    // numerous gaps and more grains to encounter as water passes through.
    const sandSpacing = 22 / densitySand;
    for (let y = mediaTop + 10; y < mediaBottom - 5; y += sandSpacing) {
        const rowOdd = Math.floor((y - mediaTop) / sandSpacing) % 2 === 1;
        const xOff = rowOdd ? sandSpacing / 2 : 0;
        for (let x = 308 + xOff; x < 590; x += sandSpacing) {
            if (Math.random() > 0.12) {
                const r = 6 + Math.random() * 3;
                sands.push({
                    x: x + (Math.random() - 0.5) * 4,
                    y: y + (Math.random() - 0.5) * 4,
                    r: r,
                    angle: Math.random() * Math.PI * 2,
                    poly: makeIrregularPoly(r, 5 + Math.floor(Math.random() * 3), 0.55)
                });
            }
        }
    }

    // --- Cotton (col 2: x=600..900) ---
    // Fiber count scales directly with density — more fibers packed into the
    // same space means finer entanglement and a harder path through.
    const cottonCount = Math.max(40, Math.round(350 * densityCotton));
    for (let i = 0; i < cottonCount; i++) {
        cottonLines.push({
            x1: 610 + Math.random() * 280,
            y1: mediaTop + Math.random() * (mediaBottom - mediaTop),
            x2: 610 + Math.random() * 280,
            y2: mediaTop + Math.random() * (mediaBottom - mediaTop),
            cpx: 610 + Math.random() * 280,
            cpy: mediaTop + Math.random() * (mediaBottom - mediaTop)
        });
    }
}

class Particle {
    constructor(col, isDebris) {
        this.col = col;
        this.isDebris = isDebris;
        // Debris=large leaf/chunk, Fine SS=tiny dot
        this.r = isDebris ? 13 : 1.2;
        this.x = col * COL_W + COL_W / 2 + (Math.random() - 0.5) * (COL_W - 50);
        this.y = 40 + Math.random() * 110;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.settled = false;
        this.angle = Math.random() * Math.PI;
        this.passed = false; // has passed through the media to below
        this.touchedSands = new Set(); // sand grains already rolled for adsorption
        this.capturedInMedia = false; // true = actually trapped in the media (stays forever)
        this.floatTimer = 0; // frames spent floating below the media, uncaptured
        this.restTimer = 0;  // frames spent resting uncaptured on the floor (gravel only)
    }

    // Sends this particle back to the top as a fresh raw-water particle —
    // used for continuous supply so the influent never runs dry.
    resetToTop() {
        this.x = this.col * COL_W + COL_W / 2 + (Math.random() - 0.5) * (COL_W - 50);
        this.y = 40 + Math.random() * 110;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.settled = false;
        this.passed = false;
        this.capturedInMedia = false;
        this.floatTimer = 0;
        this.restTimer = 0;
        this.touchedSands.clear();
        this.angle = Math.random() * Math.PI;
    }

    update() {
        const flow = parseFloat(speedSlider.value);
        if (state === 0) {
            // Idle: fine SS particles show Brownian suspension, debris drifts slowly
            if (!this.isDebris) {
                // Brownian motion — random kicks in all directions
                this.vx += (Math.random() - 0.5) * 0.35;
                this.vy += (Math.random() - 0.5) * 0.35;
                // Slight buoyancy: resist downward drift
                this.vy -= 0.015;
            } else {
                this.vx += (Math.random() - 0.5) * 0.08;
                this.vy += (Math.random() - 0.5) * 0.08;
            }
            this.vx *= 0.94;
            this.vy *= 0.94;
            this.x += this.vx;
            this.y += this.vy;
            const x0 = this.col * COL_W + this.r + 3;
            const x1 = (this.col + 1) * COL_W - this.r - 3;
            if (this.x < x0) { this.x = x0; this.vx *= -1; }
            if (this.x > x1) { this.x = x1; this.vx *= -1; }
            if (this.y < 25) { this.y = 25; this.vy *= -1; }
            if (this.y > mediaTop - this.r - 8) { this.y = mediaTop - this.r - 8; this.vy *= -1; }
        } else if (state === 1 && !this.settled) {
            if (this.passed && !this.isDebris) {
                // Already passed through the filter: drift as floating suspended
                // turbidity in the filtered water below, rather than sinking to the floor.
                this.floatTimer++;
                if (this.floatTimer > RECYCLE_FLOAT_FRAMES) {
                    // Recycle back to the top as fresh raw water — keeps the supply
                    // continuous instead of the below-zone just accumulating forever.
                    this.resetToTop();
                    return;
                }
                this.vx += (Math.random() - 0.5) * 0.35;
                this.vy += (Math.random() - 0.5) * 0.35;
                this.vy -= 0.012; // slight buoyancy so it doesn't just sink and pile up
                this.vx *= 0.94;
                this.vy *= 0.94;
                this.x += this.vx;
                this.y += this.vy;
                const x0 = this.col * COL_W + this.r + 3;
                const x1 = (this.col + 1) * COL_W - this.r - 3;
                const yTop = mediaBottom + this.r + 6;
                const yBot = canvas.height - this.r - 6;
                if (this.x < x0) { this.x = x0; this.vx *= -1; }
                if (this.x > x1) { this.x = x1; this.vx *= -1; }
                if (this.y < yTop) { this.y = yTop; this.vy *= -1; }
                if (this.y > yBot) { this.y = yBot; this.vy *= -1; }
                return;
            }

            // Gravity with flow
            this.vy += 0.12 * flow;
            if (!this.isDebris) {
                // Fine SS: Brownian kicks oppose gravity slightly → "suspended" feel
                this.vx += (Math.random() - 0.5) * 0.5 * flow;
                this.vy += (Math.random() - 0.5) * 0.3 * flow; // ±kick fights pure fall
            }
            if (this.y < mediaTop) {
                // Above the media: extra buoyancy for everything (debris included) so
                // the raw water drifts and stays visibly suspended throughout the upper
                // column, instead of free-falling straight down and piling up right at
                // the media surface.
                this.vy -= (this.isDebris ? 0.05 : 0.07) * flow;
            }

            // Max speed: per-material resistance
            let maxSpeed;
            if (this.y < mediaTop) {
                // Above the media: slow, floaty descent
                maxSpeed = (this.isDebris ? 1.8 : 1.0) * flow;
            } else if (this.y < mediaBottom) {
                maxSpeed = (this.isDebris ? 3 : 2.5) * flow;
                if (this.col === 0) maxSpeed = 4.5 * flow / densityGravel;         // Gravel: fast, slower if denser
                else if (this.col === 1) maxSpeed = 1.8 * flow / densitySand;      // Sand: medium, slower if denser
                else if (this.col === 2) {
                    maxSpeed = 0.6 * flow / densityCotton;                          // Cotton: very slow, slower if denser
                    this.vx *= 0.82;
                    this.vy *= 0.82;
                }
            } else {
                maxSpeed = (this.isDebris ? 3 : 2.5) * flow;
            }
            const spd = Math.hypot(this.vx, this.vy);
            if (spd > maxSpeed) { this.vx = this.vx / spd * maxSpeed; this.vy = this.vy / spd * maxSpeed; }

            let nx = this.x + this.vx;
            let ny = this.y + this.vy;
            if (ny < 25) { ny = 25; this.vy *= -0.3; }

            // Column walls
            const wx0 = this.col * COL_W + this.r;
            const wx1 = (this.col + 1) * COL_W - this.r;
            if (nx < wx0) { nx = wx0; this.vx *= -0.4; }
            if (nx > wx1) { nx = wx1; this.vx *= -0.4; }

            // Media interaction
            if (ny + this.r > mediaTop && ny - this.r < mediaBottom) {
                if (this.col === 0) {
                    // Gravel — very large stones, huge gaps
                    // Fine SS slips through; debris may wedge
                    for (const g of gravels) {
                        const dx = nx - g.x, dy = ny - g.y;
                        const d2 = dx * dx + dy * dy;
                        const md = this.r + g.r;
                        if (d2 < md * md) {
                            const d = Math.sqrt(d2);
                            nx += (dx / d) * (md - d);
                            ny += (dy / d) * (md - d);
                            this.vx *= 0.55; this.vy *= 0.55;
                            // Only debris wedges in gravel
                            if (this.isDebris && Math.abs(this.vy) < 0.5) { this.settled = true; this.capturedInMedia = true; }
                            // Fine SS always slips through — no settling
                        }
                    }
                } else if (this.col === 1) {
                    // Sand — medium grains, gaps ~5-8px
                    // Debris (r=13) blocked at surface
                    if (this.isDebris) {
                        if (ny > mediaTop + this.r) { ny = mediaTop + this.r; this.settled = true; this.capturedInMedia = true; }
                    } else {
                        // Fine SS (r=3): fits in gaps, contact adsorption is rolled once
                        // per grain encountered (not every frame of contact), and at a
                        // low rate — most fine particles should pass through sand.
                        for (const s of sands) {
                            if (Math.abs(ny - s.y) > 12) continue;
                            const dx = nx - s.x, dy = ny - s.y;
                            const d2 = dx * dx + dy * dy;
                            const md = this.r + s.r;
                            if (d2 < md * md) {
                                const d = Math.sqrt(d2);
                                nx += (dx / d) * (md - d);
                                ny += (dy / d) * (md - d);
                                this.vx *= 0.3; this.vy *= 0.3;
                                if (!this.touchedSands.has(s)) {
                                    this.touchedSands.add(s);
                                    if (Math.random() < 0.045) { this.settled = true; this.capturedInMedia = true; break; }
                                }
                            }
                        }
                    }
                } else if (this.col === 2) {
                    // Cotton — fibers; debris blocked at surface, fine SS entangled by depth
                    if (this.isDebris) {
                        if (ny > mediaTop + this.r) { ny = mediaTop + this.r; this.settled = true; this.capturedInMedia = true; }
                    } else {
                        const depth = Math.max(0, (ny - mediaTop) / (mediaBottom - mediaTop));
                        // Increasing entanglement probability with depth, scaled by
                        // how densely packed the cotton fibers are.
                        if (Math.random() < (0.04 + depth * 0.12) * densityCotton) { this.settled = true; this.capturedInMedia = true; }
                    }
                }
            }

            this.x = nx; this.y = ny;

            // Passed below media (fine SS only — debris is handled by the floor/capture logic)
            if (!this.passed && !this.isDebris && this.y > mediaBottom) {
                this.passed = true;
            }

            // Floor — only debris reaches this; fine SS switches to the floating
            // branch above the instant it crosses mediaBottom, so it never sinks here.
            if (this.isDebris && this.y > canvas.height - this.r) {
                this.y = canvas.height - this.r;
                this.vy *= -0.25; this.vx *= 0.9;
                if (Math.abs(this.vy) < 0.15) this.settled = true;
            }
        } else if (state === 1 && this.settled) {
            if (this.isDebris && this.y < mediaBottom) {
                this.angle += (Math.random() - 0.5) * 0.08;
            }
            if (this.isDebris && !this.capturedInMedia) {
                // Debris that slipped all the way through (gravel only) and is just
                // resting at the bottom, uncaptured — recycle it back to the top so
                // debris keeps arriving continuously instead of piling up forever.
                this.restTimer++;
                if (this.restTimer > RECYCLE_REST_FRAMES) {
                    this.resetToTop();
                }
            }
        }
    }

    draw() {
        if (this.isDebris) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.fillStyle = '#92400e';
            ctx.beginPath();
            ctx.ellipse(0, 0, this.r, this.r * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
            ctx.strokeStyle = 'rgba(161, 98, 7, 0.6)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
}

// ---- Turbidity water color ----
// Returns a CSS rgba color from murky brown to clear blue based on clarity [0=turbid, 1=clear]
function turbidColor(clarity, alpha) {
    // clarity=0 → murky brown (180,160,110), clarity=1 → clear sky blue (56,189,248)
    const r = Math.round(180 + (56 - 180) * clarity);
    const g = Math.round(160 + (189 - 160) * clarity);
    const b = Math.round(110 + (248 - 110) * clarity);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Fixed upstream turbidity level (0 = fully murky, 1 = clear). Kept constant
// rather than recomputed from the live particle count, so the raw-water color
// above the media never flickers or fades — it's always exactly this dirty.
const UPSTREAM_CLARITY = 0;

function drawWaterZones() {
    for (let col = 0; col < 3; col++) {
        const x0 = col * COL_W + 2;
        const w = COL_W - 4;

        // Upstream (above the media) is intentionally held at a FIXED clarity —
        // not derived from the live particle count — so its color never drifts
        // or flickers. It represents "raw water is always this dirty," constant
        // by definition, independent of how many individual dots happen to be
        // on screen at any given instant.
        const aboveClarity = UPSTREAM_CLARITY;

        const belowCount = particles.filter(p =>
            p.col === col && !p.isDebris && p.passed && !p.settled
        ).length;
        const belowClarity = state === 1
            ? 1 - Math.min(belowCount / FINE_PER_COL, 1)
            : aboveClarity;

        // Single vertical gradient spanning the whole column: turbid raw water
        // above, gradually clearing across the depth of the media itself, to the
        // (comparatively) clearer effluent below — rather than two flat blocks.
        const grad = ctx.createLinearGradient(0, 25, 0, canvas.height);
        const aboveStop = turbidColor(aboveClarity, 0.28);
        const belowStop = turbidColor(belowClarity, 0.28);
        const topFrac = Math.max(0, Math.min(1, (mediaTop - 25) / (canvas.height - 25)));
        const botFrac = Math.max(0, Math.min(1, (mediaBottom - 25) / (canvas.height - 25)));
        grad.addColorStop(0, aboveStop);
        grad.addColorStop(topFrac, aboveStop);
        grad.addColorStop(botFrac, belowStop);
        grad.addColorStop(1, belowStop);
        ctx.fillStyle = grad;
        ctx.fillRect(x0, 25, w, canvas.height - 27);

        // Water surface line
        ctx.strokeStyle = turbidColor(aboveClarity, 0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, 25); ctx.lineTo(x0 + w, 25);
        ctx.stroke();

        // Effluent line just below the media, tinted to the current below-clarity
        if (state === 1) {
            ctx.strokeStyle = turbidColor(belowClarity, 0.55);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x0, mediaBottom + 2); ctx.lineTo(x0 + w, mediaBottom + 2);
            ctx.stroke();
        }
    }
}

// Continuously replenishes each column with fresh raw-water particles so the
// upstream (above-media) zone stays turbid indefinitely — captured particles
// permanently lodged inside the media must NOT count against this budget,
// otherwise the top zone would visibly clear out over a long run as more and
// more particles get trapped. A separate, much looser total-count ceiling per
// column just guards against unbounded memory/CPU growth.
function topUpSupply() {
    for (let col = 0; col < 3; col++) {
        const aboveFine = particles.filter(p =>
            p.col === col && !p.isDebris && !p.passed && !p.settled && p.y < mediaTop
        ).length;
        // The safety ceiling must only count particles still "in play" (above,
        // passing through, or floating below). Particles permanently trapped
        // inside the media (capturedInMedia) must be excluded here — otherwise,
        // as more and more get captured over a long run, the column's total
        // count creeps up to the ceiling and blocks further top-ups, which is
        // exactly what starved the upstream zone and faded the gradient out.
        const activeFine = particles.filter(p =>
            p.col === col && !p.isDebris && !p.capturedInMedia
        ).length;
        if (aboveFine < ABOVE_FINE_TARGET && activeFine < MAX_TOTAL_FINE_PER_COL) {
            particles.push(new Particle(col, false));
        }

        const aboveDebris = particles.filter(p =>
            p.col === col && p.isDebris && !p.settled && p.y < mediaTop
        ).length;
        const activeDebris = particles.filter(p =>
            p.col === col && p.isDebris && !p.capturedInMedia
        ).length;
        if (aboveDebris < ABOVE_DEBRIS_TARGET && activeDebris < MAX_TOTAL_DEBRIS_PER_COL) {
            particles.push(new Particle(col, true));
        }
    }
}


function animate() {
    frameCount++;
    if (state === 1 && frameCount % TOPUP_INTERVAL === 0) {
        topUpSupply();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Base background — a single neutral tone shared by all three columns, so the
    // only color differences visible come from the fluid/turbidity itself.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Water turbidity zones
    drawWaterZones();

    // Column dividers
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(COL_W, 0); ctx.lineTo(COL_W, canvas.height);
    ctx.moveTo(COL_W * 2, 0); ctx.lineTo(COL_W * 2, canvas.height);
    ctx.stroke();

    // Draw Gravel — irregular angular polygons
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    gravels.forEach(g => {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        ctx.beginPath();
        g.poly.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
    });

    // Draw Sand — irregular angular polygons
    ctx.fillStyle = '#d4c99a';
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 0.5;
    sands.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.beginPath();
        s.poly.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
    });

    // Draw Cotton fibers
    ctx.strokeStyle = 'rgba(203,213,225,0.9)';
    ctx.lineWidth = 1;
    cottonLines.forEach(l => {
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.quadraticCurveTo(l.cpx, l.cpy, l.x2, l.y2);
        ctx.stroke();
    });

    // Mesh divider at media bottom
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(0, mediaBottom); ctx.lineTo(canvas.width, mediaBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Particles
    particles.forEach(p => { p.update(); p.draw(); });


    requestAnimationFrame(animate);
}

function init() {
    state = 0;
    particles = [];
    frameCount = 0;
    createMedia();
    for (let col = 0; col < 3; col++) {
        for (let i = 0; i < 5; i++) particles.push(new Particle(col, true));
        for (let i = 0; i < FINE_PER_COL; i++) particles.push(new Particle(col, false));
    }
    btnStart.disabled = false;
    statusText.innerHTML = "状態: <strong>待機中</strong> — 各ろ材の空隙の違いを確認してください。「ろ過開始」で原水を流します。";
}

btnStart.addEventListener('click', () => {
    state = 1;
    btnStart.disabled = true;
    statusText.innerHTML = "状態: <strong>ろ過中</strong> — 原水は粗大ごみ・微細な濁りを連続的に供給し続けます。グラデーションは、ろ材を通過するほど清澄になっていく様子を表しています。";
    particles.forEach(p => { p.vy = 2 + Math.random() * 2; });
});

btnReset.addEventListener('click', init);

init();
animate();
