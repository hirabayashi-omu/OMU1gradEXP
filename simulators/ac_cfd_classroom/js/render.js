/**
 * Canvas 2D Renderer for CFD Classroom Simulation
 * Visualizes Temperature Heatmap, Airflow Streamline Particles, Vector Field, and AC Unit
 */
class CFDRenderer {
    constructor(canvas, solver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.solver = solver;

        // Visual Options
        this.colormapName = 'jet'; // 'jet', 'turbo', 'coolwarm', 'inferno'
        this.heatmapField = 'temp'; // 'temp' (Temperature °C) or 'vel' (Velocity m/s)
        this.showHeatmap = true;
        this.showParticles = true;
        this.showVectors = false;
        this.showDesks = true;

        // Color Range
        this.minTempColor = 12.0;
        this.maxTempColor = 34.0;

        this.minVelColor = 0.0;
        this.maxVelColor = 4.2;

        // Particle System
        this.numParticles = 180;
        this.particles = [];
        this.initParticles();

        // Offscreen Canvas for Fast Heatmap Interpolation
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = solver.Nx;
        this.offscreenCanvas.height = solver.Ny;
        this.offCtx = this.offscreenCanvas.getContext('2d');
        this.imgData = this.offCtx.createImageData(solver.Nx, solver.Ny);
    }

    initParticles() {
        this.particles = [];
        for (let k = 0; k < this.numParticles; k++) {
            this.particles.push(this.createParticle());
        }
    }

    createParticle(fromOutlet = false) {
        if (fromOutlet) {
            // Spawn directly at AC discharge louver nozzle (x=1.45m, y=3.05m)
            return {
                x: 1.45 + (Math.random() - 0.5) * 0.1,
                y: 3.05 + (Math.random() - 0.5) * 0.1,
                life: Math.random() * 120 + 80,
                maxLife: 200,
                history: []
            };
        }
        return {
            x: Math.random() * (this.solver.Lx - 0.4) + 0.2,
            y: Math.random() * (this.solver.Ly - 0.4) + 0.2,
            life: Math.random() * 140 + 40,
            maxLife: 180,
            history: []
        };
    }

    setColormap(name) {
        this.colormapName = name;
        this.updateLegendBar();
    }

    // Color Gradients
    getColorRGB(val) {
        let t = 0.0;
        if (this.heatmapField === 'vel') {
            t = (val - this.minVelColor) / (this.maxVelColor - this.minVelColor);
        } else {
            t = (val - this.minTempColor) / (this.maxTempColor - this.minTempColor);
        }
        t = Math.max(0.0, Math.min(1.0, t));

        let r = 0, g = 0, b = 0;

        if (this.colormapName === 'jet') {
            // Jet Colormap: Blue -> Cyan -> Green -> Yellow -> Red
            if (t < 0.25) {
                r = 0; g = Math.floor(4 * t * 255); b = 255;
            } else if (t < 0.5) {
                r = 0; g = 255; b = Math.floor((1 - 4 * (t - 0.25)) * 255);
            } else if (t < 0.75) {
                r = Math.floor(4 * (t - 0.5) * 255); g = 255; b = 0;
            } else {
                r = 255; g = Math.floor((1 - 4 * (t - 0.75)) * 255); b = 0;
            }
        } else if (this.colormapName === 'turbo') {
            // Turbo approximation
            r = Math.floor(255 * Math.sin(t * Math.PI * 0.9));
            g = Math.floor(255 * Math.sin(t * Math.PI));
            b = Math.floor(255 * Math.cos(t * Math.PI * 0.5));
        } else if (this.colormapName === 'coolwarm') {
            // Coolwarm: Soft Blue -> Grey -> Soft Red
            r = Math.floor(255 * t);
            g = Math.floor(220 * (1 - Math.abs(t - 0.5) * 1.5));
            b = Math.floor(255 * (1 - t));
        } else if (this.colormapName === 'inferno') {
            // Inferno: Black -> Purple -> Orange -> Yellow
            r = Math.floor(255 * Math.pow(t, 0.7));
            g = Math.floor(255 * Math.pow(t, 1.8));
            b = Math.floor(255 * Math.pow(t, 3.5));
        }

        return [r, g, b];
    }

    updateLegendBar() {
        const bar = document.getElementById('legendBar');
        const minLabel = document.getElementById('legendMinTemp');
        const maxLabel = document.getElementById('legendMaxTemp');

        if (minLabel && maxLabel) {
            if (this.heatmapField === 'vel') {
                minLabel.textContent = `${this.minVelColor.toFixed(1)} m/s`;
                maxLabel.textContent = `${this.maxVelColor.toFixed(1)} m/s`;
            } else {
                minLabel.textContent = `${this.minTempColor.toFixed(0)}°C`;
                maxLabel.textContent = `${this.maxTempColor.toFixed(0)}°C`;
            }
        }

        if (!bar) return;

        let gradStr = '';
        if (this.colormapName === 'jet') {
            gradStr = 'linear-gradient(90deg, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)';
        } else if (this.colormapName === 'turbo') {
            gradStr = 'linear-gradient(90deg, #30123b, #28bbec, #a2fc3c, #fb8022, #7a0403)';
        } else if (this.colormapName === 'coolwarm') {
            gradStr = 'linear-gradient(90deg, #3b4cc0, #8897db, #dddddd, #f49a7b, #b40426)';
        } else if (this.colormapName === 'inferno') {
            gradStr = 'linear-gradient(90deg, #000004, #57106e, #bb3754, #f98e09, #fcffa4)';
        }
        bar.style.background = gradStr;
    }

    render() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);

        if (this.showHeatmap) {
            // 1. Draw Heatmap (Temperature or Velocity Contour)
            this.renderHeatmap(width, height);
        } else {
            // Dark Background when Heatmap is hidden
            ctx.fillStyle = '#060911';
            ctx.fillRect(0, 0, width, height);
        }

        // 2. Draw Window Condition Wall Effect
        this.renderWindowEffect(width, height);

        // 3. Draw Desks & Seated Students Overlay
        if (this.showDesks) {
            this.renderDesks(width, height);
        }

        // 4. Draw Air Vector Arrows
        if (this.showVectors) {
            this.renderVectors(width, height);
        }

        // 5. Draw Particle Airflow Streamlines
        if (this.showParticles) {
            this.renderParticles(width, height);
        }

        // 6. Draw AC Unit Frame, Louver & Jet Stream
        this.renderACUnit(width, height);
    }

    renderHeatmap(w, h) {
        const solver = this.solver;
        const buf = this.imgData.data;

        // Render low-res grid to offscreen pixel buffer
        for (let j = 0; j < solver.Ny; j++) {
            const cfdJ = solver.Ny - 1 - j; // Flip Y for canvas display
            for (let i = 0; i < solver.Nx; i++) {
                const idx = solver.getIndex(i, cfdJ);
                let val = 0;

                if (this.heatmapField === 'vel') {
                    const u_val = solver.u[idx];
                    const v_val = solver.v[idx];
                    val = Math.sqrt(u_val * u_val + v_val * v_val);
                } else {
                    val = solver.T[idx];
                }

                const [r, g, b] = this.getColorRGB(val);

                const pixelIdx = (j * solver.Nx + i) * 4;
                buf[pixelIdx] = r;
                buf[pixelIdx + 1] = g;
                buf[pixelIdx + 2] = b;
                buf[pixelIdx + 3] = 230; // Slight alpha transparency
            }
        }

        this.offCtx.putImageData(this.imgData, 0, 0);

        // Scale offscreen canvas smoothly to main canvas
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, w, h);
        this.ctx.restore();
    }

    renderWindowEffect(w, h) {
        const ctx = this.ctx;
        const windowCond = this.solver.windowCondition;
        const windowW = 16; // Width of window graphic on left wall

        ctx.save();
        if (windowCond === 'summer') {
            // Summer Sun Glow
            const grad = ctx.createLinearGradient(0, 0, 100, 0);
            grad.addColorStop(0, 'rgba(255, 120, 0, 0.4)');
            grad.addColorStop(1, 'rgba(255, 120, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 100, h);

            // Sun Icon/Rays indicator
            ctx.fillStyle = '#ff7800';
            ctx.fillRect(0, 0, windowW, h);
        } else if (windowCond === 'winter') {
            // Winter Cold Draft Aura
            const grad = ctx.createLinearGradient(0, 0, 100, 0);
            grad.addColorStop(0, 'rgba(0, 200, 255, 0.4)');
            grad.addColorStop(1, 'rgba(0, 200, 255, 0.0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 100, h);

            ctx.fillStyle = '#00c8ff';
            ctx.fillRect(0, 0, windowW, h);
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, 0, windowW, h);
        }
        ctx.restore();
    }

    renderDesks(w, h) {
        const ctx = this.ctx;
        const scaleX = w / this.solver.Lx;
        const scaleY = h / this.solver.Ly;

        // Seated height reference line y = 0.8m
        const seatedCanvasY = h - (0.8 * scaleY);

        ctx.save();
        // Reference height line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, seatedCanvasY);
        ctx.lineTo(w, seatedCanvasY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('児童着席高さ (y = 0.8m)', 12, seatedCanvasY - 4);

        // 7 Desk Columns (70cm width, 65cm height)
        // Col 1 touches left window wall (x=0.0m), Col 7 touches right corridor wall (x=7.0m)
        const deskXPositions = [0.00, 1.05, 2.10, 3.15, 4.20, 5.25, 6.30];
        const deskW = 0.70 * scaleX; // 70cm width
        const deskH = 0.65 * scaleY; // 65cm height
        const deskCanvasY = h - deskH;

        deskXPositions.forEach((xPos, idx) => {
            const deskCanvasX = xPos * scaleX;

            // Desk Tabletop
            ctx.fillStyle = 'rgba(210, 180, 140, 0.75)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.fillRect(deskCanvasX, deskCanvasY, deskW, 6);
            ctx.strokeRect(deskCanvasX, deskCanvasY, deskW, 6);

            // Desk Legs
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(deskCanvasX + 3, deskCanvasY + 6);
            ctx.lineTo(deskCanvasX + 3, h);
            ctx.moveTo(deskCanvasX + deskW - 3, deskCanvasY + 6);
            ctx.lineTo(deskCanvasX + deskW - 3, h);
            ctx.stroke();

            // Student Silhouette Icon (Seated at desk)
            const studentX = deskCanvasX + deskW / 2;
            const headY = seatedCanvasY - 10;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.arc(studentX, headY, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(studentX, headY + 12, 8, Math.PI, Math.PI * 2);
            ctx.fill();

            // Row Label Badge (1列, 2列, ... 7列)
            ctx.fillStyle = '#00f2fe';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${idx + 1}列`, studentX, deskCanvasY - 4);
            ctx.textAlign = 'left'; // Reset
        });

        ctx.restore();
    }

    renderVectors(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        const stepI = 2;
        const stepJ = 2;

        ctx.save();

        for (let j = 1; j < solver.Ny - 1; j += stepJ) {
            const canvasY = h - (j * solver.dy * scaleY);
            for (let i = 1; i < solver.Nx - 1; i += stepI) {
                const canvasX = i * solver.dx * scaleX;
                const idx = solver.getIndex(i, j);

                // Skip solid AC body cells
                if (solver.flags[idx] === 2) continue;

                const u_val = solver.u[idx];
                const v_val = solver.v[idx];
                const mag = Math.sqrt(u_val * u_val + v_val * v_val);

                if (mag < 0.08) continue; // Skip stationary air

                // Vector length scaled by velocity magnitude
                const arrowLen = Math.min(28, Math.max(7, mag * 14));
                const angle = Math.atan2(-v_val, u_val); // Invert V for canvas coords

                const endX = canvasX + arrowLen * Math.cos(angle);
                const endY = canvasY + arrowLen * Math.sin(angle);

                // Dark contrast outline for maximum readability on any heatmap background
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(canvasX, canvasY);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // High-visibility cyan/white foreground shaft
                ctx.strokeStyle = mag > 1.5 ? '#ffffff' : '#00f2fe';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(canvasX, canvasY);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // Crisp Triangular Arrowhead
                const headLen = Math.min(7, arrowLen * 0.35);
                const headAngle = Math.PI / 6;

                const leftX = endX - headLen * Math.cos(angle - headAngle);
                const leftY = endY - headLen * Math.sin(angle - headAngle);
                const rightX = endX - headLen * Math.cos(angle + headAngle);
                const rightY = endY - headLen * Math.sin(angle + headAngle);

                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(leftX, leftY);
                ctx.lineTo(rightX, rightY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    renderParticles(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        ctx.save();

        this.particles.forEach(p => {
            // Sample velocity at particle location
            const sample = solver.sampleAt(p.x, p.y);
            const dt = 0.025;
            const speedScale = 1.2;

            // Move particle
            p.x += sample.u * dt * speedScale;
            p.y += sample.v * dt * speedScale;
            p.life--;

            // Wall Collision & Boundary Clamping (Smooth wall deflection along floor, ceiling, and side walls)
            const margin = 0.04;
            p.x = Math.max(margin, Math.min(solver.Lx - margin, p.x));
            p.y = Math.max(margin, Math.min(solver.Ly - margin, p.y));

            // AC Suction Intake Recirculation (Sucked into filter and respawns at nozzle)
            if (p.x >= 0.65 && p.x <= 1.25 && p.y >= 2.9 && p.y <= 3.3) {
                Object.assign(p, this.createParticle(true));
                return;
            }

            // Check if lifespan expired
            if (p.life <= 0) {
                const fromOutlet = Math.random() < 0.45; // 45% chance to respawn at AC louver
                Object.assign(p, this.createParticle(fromOutlet));
                return;
            }

            // Record history for tail line
            const px = p.x * scaleX;
            const py = h - (p.y * scaleY);

            p.history.push({ x: px, y: py });
            if (p.history.length > 10) p.history.shift();

            // Draw particle tail
            if (p.history.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.history[0].x, p.history[0].y);
                for (let k = 1; k < p.history.length; k++) {
                    ctx.lineTo(p.history[k].x, p.history[k].y);
                }
                const alpha = Math.min(1.0, p.life / p.maxLife);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
                ctx.lineWidth = 1.8;
                ctx.stroke();
            }

            // Particle Head
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    renderACUnit(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        // AC Position: x = 1.0m (spans 0.7m..1.5m), ceiling suspended y = 3.1m..3.4m
        const acX = 0.7 * scaleX;
        const acW = 0.8 * scaleX;
        const acY = h - (3.4 * scaleY);
        const acH = 0.3 * scaleY;

        const currentAngle = solver.getCurrentFinAngle();
        const angleRad = (currentAngle * Math.PI) / 180.0;

        // Slanted Nozzle Geometry (per user diagram)
        const noseX1 = acX + acW * 0.70;
        const noseY1 = acY + acH;
        const noseX2 = acX + acW;
        const noseY2 = acY + acH * 0.35;

        // Midpoint of Slanted Red Outlet Slot
        const slotMidX = (noseX1 + noseX2) / 2;
        const slotMidY = (noseY1 + noseY2) / 2;

        // Louver Pivot sits INSIDE/JUST BEHIND the slanted slot (per user diagram)
        const outletX = slotMidX - 8;
        const outletY = slotMidY - 8;

        ctx.save();

        // 1. AC Main Unit Housing Box with Slanted Front Nose
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(acX, acY);
        ctx.lineTo(acX + acW, acY);
        ctx.lineTo(noseX2, noseY2);
        ctx.lineTo(noseX1, noseY1);
        ctx.lineTo(acX, acY + acH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Top Mounting Trim
        ctx.fillStyle = '#334155';
        ctx.fillRect(acX + 2, acY + 2, acW - 4, 4);

        // Bottom REAR Intake Filter Panel Grille (ユニット下部・後ろ寄り吸入口)
        const intakeXStart = acX + 4;
        const intakeXEnd = acX + acW * 0.55;
        ctx.fillStyle = 'rgba(0, 100, 150, 0.4)';
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(intakeXStart, acY + acH - 8, intakeXEnd - intakeXStart, 6);
        ctx.strokeRect(intakeXStart, acY + acH - 8, intakeXEnd - intakeXStart, 6);

        // Suction Filter Mesh Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        for (let gx = intakeXStart + 6; gx < intakeXEnd; gx += 7) {
            ctx.beginPath();
            ctx.moveTo(gx, acY + acH - 2);
            ctx.lineTo(gx, acY + acH - 8);
            ctx.stroke();
        }

        // Intake Label
        ctx.fillStyle = 'rgba(0, 242, 254, 0.85)';
        ctx.font = '8px Inter, sans-serif';
        ctx.fillText('吸入口 (下部後ろ)', intakeXStart + 2, acY + acH - 12);

        // Slanted Red Outlet Slot (赤線: 傾斜吹き出し口)
        ctx.strokeStyle = '#ff3b5c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(noseX1, noseY1);
        ctx.lineTo(noseX2, noseY2);
        ctx.stroke();

        // 2. Parallel Air Jet Stream Cone (斜め吹き出し口からの平行直進噴流)
        const coneLen = 240;
        const coneSpread = 0.07; // Parallel flow spread (~4°)
        const leftAngle = angleRad - coneSpread;
        const rightAngle = angleRad + coneSpread;

        const leftX = slotMidX + coneLen * Math.cos(leftAngle);
        const leftY = slotMidY + coneLen * Math.sin(leftAngle);
        const rightX = slotMidX + coneLen * Math.cos(rightAngle);
        const rightY = slotMidY + coneLen * Math.sin(rightAngle);

        const isCooling = solver.outletTemp < solver.initTemp;
        const coneGrad = ctx.createLinearGradient(
            slotMidX, slotMidY,
            slotMidX + coneLen * Math.cos(angleRad),
            slotMidY + coneLen * Math.sin(angleRad)
        );

        if (isCooling) {
            coneGrad.addColorStop(0, 'rgba(0, 242, 254, 0.65)');
            coneGrad.addColorStop(0.7, 'rgba(0, 242, 254, 0.25)');
            coneGrad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
        } else {
            coneGrad.addColorStop(0, 'rgba(255, 107, 74, 0.65)');
            coneGrad.addColorStop(0.7, 'rgba(255, 107, 74, 0.25)');
            coneGrad.addColorStop(1, 'rgba(255, 107, 74, 0.0)');
        }

        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(slotMidX, slotMidY);
        ctx.lineTo(leftX, leftY);
        ctx.lineTo(rightX, rightY);
        ctx.closePath();
        ctx.fill();

        // Parallel Jet Core Line
        ctx.strokeStyle = isCooling ? 'rgba(0, 242, 254, 0.85)' : 'rgba(255, 107, 74, 0.85)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(slotMidX, slotMidY);
        ctx.lineTo(slotMidX + coneLen * Math.cos(angleRad), slotMidY + coneLen * Math.sin(angleRad));
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Louver Blade (内部ピボットから赤線を貫通して伸びるルーバー)
        const louverLen = 26;
        const louverEndX = outletX + louverLen * Math.cos(angleRad);
        const louverEndY = outletY + louverLen * Math.sin(angleRad);

        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(outletX, outletY);
        ctx.lineTo(louverEndX, louverEndY);
        ctx.stroke();

        // Louver Pivot Point (内部に配置された青色/白色ピボット)
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(outletX, outletY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // AC Title Badge
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText('天井吊形 2.3馬力', acX + 8, acY + 14);

        ctx.restore();
    }
}
