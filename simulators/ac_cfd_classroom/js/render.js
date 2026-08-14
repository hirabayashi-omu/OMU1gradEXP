/**
 * Canvas 2D Renderer for CFD Classroom Simulation
 * Features Classroom Background (Blackboard, Teacher's Podium), Semi-transparent Heatmap Contours, High-Visibility Vectors, and Oscillating Circulator
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
        this.heatmapOpacity = 0.60; // Semi-transparent contour overlay

        // Color Range
        this.minTempColor = 12.0;
        this.maxTempColor = 34.0;

        this.minVelColor = 0.0;
        this.maxVelColor = 4.2;

        // Circulator Visual State
        this.circulatorBladeAngle = 0.0;

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

    createParticle(fromOutlet = false, fromCirculator = false) {
        if (fromCirculator) {
            // Spawn directly at Ceiling Circulator (x=3.5m, y=3.25m)
            return {
                x: 3.5 + (Math.random() - 0.5) * 0.3,
                y: 3.25 + (Math.random() - 0.5) * 0.1,
                life: Math.random() * 120 + 80,
                maxLife: 200,
                history: []
            };
        }
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

    updateTempRange() {
        const minT = Math.min(10, this.solver.outletTemp, this.solver.initTemp);
        const maxT = Math.max(35, this.solver.outletTemp, this.solver.initTemp);
        this.minTempColor = Math.floor(minT);
        this.maxTempColor = Math.ceil(maxT);
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
            r = Math.floor(255 * Math.sin(t * Math.PI * 0.9));
            g = Math.floor(255 * Math.sin(t * Math.PI));
            b = Math.floor(255 * Math.cos(t * Math.PI * 0.5));
        } else if (this.colormapName === 'coolwarm') {
            r = Math.floor(255 * t);
            g = Math.floor(220 * (1 - Math.abs(t - 0.5) * 1.5));
            b = Math.floor(255 * (1 - t));
        } else if (this.colormapName === 'inferno') {
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

        // 1. Draw Classroom Architectural Background (Wall, Blackboard, Chalk Tray, Teacher's Podium)
        this.renderClassroomBackground(width, height);

        // 2. Draw Semi-transparent Heatmap Contour Layer
        if (this.showHeatmap) {
            this.renderHeatmap(width, height);
        }

        // 3. Draw Window Condition Wall Effect
        this.renderWindowEffect(width, height);

        // 4. Draw Desks & Seated Students Overlay
        if (this.showDesks) {
            this.renderDesks(width, height);
        }

        // 5. Draw Air Vector Arrows (High-Visibility Vector Field)
        if (this.showVectors) {
            this.renderVectors(width, height);
        }

        // 6. Draw Particle Airflow Streamlines
        if (this.showParticles) {
            this.renderParticles(width, height);
        }

        // 7. Draw AC Unit Frame, Louver & Jet Stream
        this.renderACUnit(width, height);

        // 8. Draw Ceiling Oscillating Circulator Fan (Center x = 3.5m)
        this.renderCirculatorFan(width, height);
    }

    /**
     * Render Realistic Classroom Background: Beige Wall, Green Blackboard (黒板), Chalk Tray, and Wooden Teacher's Podium (教卓)
     */
    renderClassroomBackground(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        ctx.save();

        // 1. Upper Wall Paint (温かみのある学校教室のベージュ壁)
        const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
        wallGrad.addColorStop(0, '#ebe6da');
        wallGrad.addColorStop(1, '#dfd8ca');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(0, 0, w, h);

        // Top Hanging Picture Rail / Metal Track (天井下の掲示用ピクチャーレール)
        const railY = h - (3.2 * scaleY);
        ctx.fillStyle = '#b0aba0';
        ctx.fillRect(0, railY, w, 4);
        ctx.fillStyle = '#8c877d';
        ctx.fillRect(0, railY + 4, w, 1.5);

        // 2. Lower Wainscot Wall (白・クリーム色の腰壁パネル)
        const wainscotTopY = h - (1.0 * scaleY);
        const wainscotGrad = ctx.createLinearGradient(0, wainscotTopY, 0, h);
        wainscotGrad.addColorStop(0, '#f8fafc');
        wainscotGrad.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = wainscotGrad;
        ctx.fillRect(0, wainscotTopY, w, h - wainscotTopY);

        // Wainscot Top Trim (見切り縁)
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, wainscotTopY - 3, w, 5);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, wainscotTopY + 2, w, 1);

        // Wainscot Vertical Panel Seams
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1;
        for (let px = scaleX * 1.0; px < w; px += scaleX * 1.0) {
            ctx.beginPath();
            ctx.moveTo(px, wainscotTopY + 3);
            ctx.lineTo(px, h);
            ctx.stroke();
        }

        // Baseboard (巾木) at floor
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, h - 6, w, 6);

        // 3. Wide Classroom Blackboard (教室の大型黒板)
        // Position: x = 0.7m .. 6.3m (Width = 5.6m), y = 1.15m .. 2.85m (Height = 1.7m)
        const boardX = 0.7 * scaleX;
        const boardW = 5.6 * scaleX;
        const boardTopY = h - (2.85 * scaleY);
        const boardH = 1.70 * scaleY;
        const boardBottomY = boardTopY + boardH;

        // Blackboard Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(boardX + 4, boardTopY + 4, boardW, boardH + 8);

        // Blackboard Surface (深緑の黒板面)
        const boardGrad = ctx.createLinearGradient(boardX, boardTopY, boardX, boardBottomY);
        boardGrad.addColorStop(0, '#1d3e2f');
        boardGrad.addColorStop(0.5, '#234937');
        boardGrad.addColorStop(1, '#1b3a2c');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(boardX, boardTopY, boardW, boardH);

        // Subtle Blackboard Texture / Classroom Writing Impression
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let gy = boardTopY + 30; gy < boardBottomY; gy += 30) {
            ctx.beginPath();
            ctx.moveTo(boardX + 10, gy);
            ctx.lineTo(boardX + boardW - 10, gy);
            ctx.stroke();
        }

        // Aluminum Blackboard Frame (アルミ外枠)
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 4;
        ctx.strokeRect(boardX, boardTopY, boardW, boardH);

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(boardX + 3, boardTopY + 3, boardW - 6, boardH - 6);

        // 4. Chalk Tray & Chalk / Eraser (粉受け・チョーク・黒板消し)
        const trayH = 8;
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(boardX - 4, boardBottomY, boardW + 8, trayH);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(boardX - 4, boardBottomY + trayH - 2, boardW + 8, 2);

        // Chalk Eraser (黒板消し: 右下に配置)
        const eraserX = boardX + boardW - 75;
        const eraserY = boardBottomY - 6;
        ctx.fillStyle = '#1e3a8a'; // Blue corduroy back
        ctx.fillRect(eraserX, eraserY, 26, 4);
        ctx.fillStyle = '#f59e0b'; // Sponge yellow/orange bottom
        ctx.fillRect(eraserX, eraserY + 4, 26, 3);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(eraserX, eraserY, 26, 7);

        // Chalk Pieces (白・黄・赤チョーク)
        const chalkX = eraserX - 45;
        ctx.fillStyle = '#ffffff'; // White chalk
        ctx.fillRect(chalkX, boardBottomY - 3, 12, 3);
        ctx.fillStyle = '#facc15'; // Yellow chalk
        ctx.fillRect(chalkX + 15, boardBottomY - 3, 10, 3);
        ctx.fillStyle = '#f87171'; // Red chalk
        ctx.fillRect(chalkX + 28, boardBottomY - 3, 8, 3);

        // 5. Wooden Teacher's Podium (中央の木製教卓)
        // Position: x = 3.1m .. 3.9m (Width = 0.8m), height from floor y=0 to y=1.05m
        const podiumX = 3.10 * scaleX;
        const podiumW = 0.80 * scaleX;
        const podiumH = 1.05 * scaleY;
        const podiumTopY = h - podiumH;

        // Podium Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(podiumX - 4, podiumTopY + 6, podiumW + 8, podiumH);

        // Podium Main Wooden Cabinet Body (木目調キャビネット)
        const woodGrad = ctx.createLinearGradient(podiumX, podiumTopY, podiumX + podiumW, podiumTopY);
        woodGrad.addColorStop(0, '#9a5e24');
        woodGrad.addColorStop(0.3, '#b77533');
        woodGrad.addColorStop(0.7, '#ba7a3a');
        woodGrad.addColorStop(1, '#8c521c');
        ctx.fillStyle = woodGrad;
        ctx.fillRect(podiumX + 4, podiumTopY + 10, podiumW - 8, podiumH - 10);

        // Front Inset Panel Board
        ctx.fillStyle = '#a2662c';
        ctx.fillRect(podiumX + 10, podiumTopY + 16, podiumW - 20, podiumH - 26);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(podiumX + 10, podiumTopY + 16, podiumW - 20, podiumH - 26);

        // Podium Top Overhanging Desk Surface (教卓の天板)
        const topGrad = ctx.createLinearGradient(podiumX, podiumTopY, podiumX, podiumTopY + 10);
        topGrad.addColorStop(0, '#df9b53');
        topGrad.addColorStop(1, '#a8682a');
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = '#5c330a';
        ctx.lineWidth = 1.5;
        ctx.fillRect(podiumX, podiumTopY, podiumW, 10);
        ctx.strokeRect(podiumX, podiumTopY, podiumW, 10);

        // Podium Base / Feet
        ctx.fillStyle = '#334155';
        ctx.fillRect(podiumX + 6, h - 8, 10, 8);
        ctx.fillRect(podiumX + podiumW - 16, h - 8, 10, 8);

        // Podium Label Badge
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('教 卓', podiumX + podiumW / 2, podiumTopY + 36);
        ctx.textAlign = 'left';

        ctx.restore();
    }

    renderHeatmap(w, h) {
        const solver = this.solver;
        const buf = this.imgData.data;

        // Render low-res grid to offscreen pixel buffer with semi-transparency
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
                buf[pixelIdx + 3] = 255; // Full alpha in texture, modulated by globalAlpha
            }
        }

        this.offCtx.putImageData(this.imgData, 0, 0);

        // Draw onto main canvas with semi-transparency so blackboard & podium show through
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.globalAlpha = this.heatmapOpacity; // 0.60 Semi-transparent contour overlay
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, w, h);
        this.ctx.restore();
    }

    renderWindowEffect(w, h) {
        const ctx = this.ctx;
        const windowCond = this.solver.windowCondition;
        const windowW = 16; // Width of window graphic on left wall

        ctx.save();
        if (windowCond === 'summer') {
            const grad = ctx.createLinearGradient(0, 0, 100, 0);
            grad.addColorStop(0, 'rgba(255, 120, 0, 0.4)');
            grad.addColorStop(1, 'rgba(255, 120, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 100, h);

            ctx.fillStyle = '#ff7800';
            ctx.fillRect(0, 0, windowW, h);
        } else if (windowCond === 'winter') {
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, seatedCanvasY);
        ctx.lineTo(w, seatedCanvasY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('学生着席高さ (y = 0.8m)', 12, seatedCanvasY - 4);

        // 7 Desk Columns (70cm width, 65cm height)
        const deskXPositions = [0.00, 1.05, 2.10, 3.15, 4.20, 5.25, 6.30];
        const deskW = 0.70 * scaleX;
        const deskH = 0.65 * scaleY;
        const deskCanvasY = h - deskH;

        deskXPositions.forEach((xPos, idx) => {
            const deskCanvasX = xPos * scaleX;

            // Desk Tabletop
            ctx.fillStyle = 'rgba(210, 150, 90, 0.9)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.fillRect(deskCanvasX, deskCanvasY, deskW, 7);
            ctx.strokeRect(deskCanvasX, deskCanvasY, deskW, 7);

            // Desk Legs
            ctx.strokeStyle = 'rgba(220, 220, 220, 0.85)';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(deskCanvasX + 3, deskCanvasY + 7);
            ctx.lineTo(deskCanvasX + 3, h);
            ctx.moveTo(deskCanvasX + deskW - 3, deskCanvasY + 7);
            ctx.lineTo(deskCanvasX + deskW - 3, h);
            ctx.stroke();

            // Student Silhouette Icon (Seated at desk)
            const studentX = deskCanvasX + deskW / 2;
            const headY = seatedCanvasY - 10;

            // Sample local desk temperature for comfort face icon
            const sample = this.solver.sampleAt(xPos + 0.35, 0.8);
            const tLocal = sample.temp;

            let faceIcon = '😊';
            let headColor = 'rgba(255, 255, 255, 0.95)';
            if (tLocal >= 28.5) {
                faceIcon = '🥵';
                headColor = 'rgba(255, 107, 74, 0.95)';
            } else if (tLocal >= 26.0) {
                faceIcon = '😅';
                headColor = 'rgba(255, 180, 74, 0.95)';
            } else if (tLocal >= 22.0) {
                faceIcon = '😊';
                headColor = 'rgba(0, 230, 118, 0.95)';
            } else if (tLocal >= 18.5) {
                faceIcon = '🙂';
                headColor = 'rgba(79, 172, 254, 0.95)';
            } else {
                faceIcon = '🥶';
                headColor = 'rgba(0, 242, 254, 0.95)';
            }

            // Draw Thermal Comfort Face Emoji above student
            ctx.font = '22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(faceIcon, studentX, headY - 14);

            ctx.fillStyle = headColor;
            ctx.beginPath();
            ctx.arc(studentX, headY, 6.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(studentX, headY + 13, 9.5, Math.PI, Math.PI * 2);
            ctx.fill();

            // Row Label Badge
            ctx.fillStyle = '#00f2fe';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`学生${idx + 1}列`, studentX, deskCanvasY - 4);
            ctx.textAlign = 'left';
        });

        ctx.restore();
    }

    renderVectors(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        ctx.save();

        const stepI = 3;
        const stepJ = 2;

        const vectorList = [];

        for (let j = 1; j < solver.Ny - 1; j += stepJ) {
            for (let i = 1; i < solver.Nx - 1; i += stepI) {
                const idx = solver.getIndex(i, j);
                if (solver.flags[idx] === 2) continue;

                const px = i * solver.dx * scaleX;
                const py = h - (j * solver.dy * scaleY);

                const u = solver.u[idx];
                const v = solver.v[idx];
                const mag = Math.sqrt(u * u + v * v);
                if (mag < 0.04) continue;

                const len = Math.max(12, Math.min(36, 10 + mag * 8.5));
                const angle = Math.atan2(-v, u);

                const endX = px + len * Math.cos(angle);
                const endY = py + len * Math.sin(angle);
                const headLen = 8.5;
                const headAngle = 0.46;

                const h1X = endX - headLen * Math.cos(angle - headAngle);
                const h1Y = endY - headLen * Math.sin(angle - headAngle);
                const h2X = endX - headLen * Math.cos(angle + headAngle);
                const h2Y = endY - headLen * Math.sin(angle + headAngle);

                let color = '#38bdf8';
                if (mag >= 2.5) {
                    color = '#ff3366';
                } else if (mag >= 1.6) {
                    color = '#fb923c';
                } else if (mag >= 0.9) {
                    color = '#facc15';
                } else if (mag >= 0.4) {
                    color = '#4ade80';
                }

                vectorList.push({ px, py, endX, endY, h1X, h1Y, h2X, h2Y, color });
            }
        }

        // Pass 1: Dark Outline Pass
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        vectorList.forEach(v => {
            ctx.beginPath();
            ctx.moveTo(v.px, v.py);
            ctx.lineTo(v.endX, v.endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(v.endX, v.endY);
            ctx.lineTo(v.h1X, v.h1Y);
            ctx.lineTo(v.h2X, v.h2Y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(v.px, v.py, 3.2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Pass 2: Colored Arrow Pass
        ctx.lineWidth = 2.4;
        vectorList.forEach(v => {
            ctx.strokeStyle = v.color;
            ctx.fillStyle = v.color;

            ctx.beginPath();
            ctx.moveTo(v.px, v.py);
            ctx.lineTo(v.endX, v.endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(v.endX, v.endY);
            ctx.lineTo(v.h1X, v.h1Y);
            ctx.lineTo(v.h2X, v.h2Y);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.arc(v.px, v.py, 2.0, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    renderParticles(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        ctx.save();

        this.particles.forEach(p => {
            const sample = solver.sampleAt(p.x, p.y);
            const dt = 0.025;
            const speedScale = 1.2;

            p.x += sample.u * dt * speedScale;
            p.y += sample.v * dt * speedScale;
            p.life--;

            const margin = 0.04;
            p.x = Math.max(margin, Math.min(solver.Lx - margin, p.x));
            p.y = Math.max(margin, Math.min(solver.Ly - margin, p.y));

            if (p.x >= 0.65 && p.x <= 1.25 && p.y >= 2.9 && p.y <= 3.3) {
                Object.assign(p, this.createParticle(true));
                return;
            }

            if (p.life <= 0) {
                let fromOutlet = false;
                let fromCirc = false;
                if (solver.circulatorEnabled && Math.random() < 0.35) {
                    fromCirc = true;
                } else if (Math.random() < 0.45) {
                    fromOutlet = true;
                }
                Object.assign(p, this.createParticle(fromOutlet, fromCirc));
                return;
            }

            const px = p.x * scaleX;
            const py = h - (p.y * scaleY);

            p.history.push({ x: px, y: py });
            if (p.history.length > 10) p.history.shift();

            if (p.history.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.history[0].x, p.history[0].y);
                for (let k = 1; k < p.history.length; k++) {
                    ctx.lineTo(p.history[k].x, p.history[k].y);
                }
                const alpha = Math.min(1.0, p.life / p.maxLife);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
                ctx.lineWidth = 2.0;
                ctx.stroke();
            }

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 2.4, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    renderACUnit(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        const acX = 0.7 * scaleX;
        const acW = 0.8 * scaleX;
        const acY = h - (3.4 * scaleY);
        const acH = 0.3 * scaleY;

        const currentAngle = solver.getCurrentFinAngle();
        const angleRad = (currentAngle * Math.PI) / 180.0;

        const noseX1 = acX + acW * 0.70;
        const noseY1 = acY + acH;
        const noseX2 = acX + acW;
        const noseY2 = acY + acH * 0.35;

        const slotMidX = (noseX1 + noseX2) / 2;
        const slotMidY = (noseY1 + noseY2) / 2;

        const outletX = slotMidX - 8;
        const outletY = slotMidY - 8;

        ctx.save();

        // 1. AC Main Unit Housing Box
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

        // Bottom REAR Intake Filter Panel Grille
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

        // Slanted Red Outlet Slot
        ctx.strokeStyle = '#ff3b5c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(noseX1, noseY1);
        ctx.lineTo(noseX2, noseY2);
        ctx.stroke();

        // 2. Parallel Air Jet Stream Cone
        const coneLen = 240;
        const coneSpread = 0.07;
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

        // 3. Louver Blade
        const louverLen = 26;
        const louverEndX = outletX + louverLen * Math.cos(angleRad);
        const louverEndY = outletY + louverLen * Math.sin(angleRad);

        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(outletX, outletY);
        ctx.lineTo(louverEndX, louverEndY);
        ctx.stroke();

        // Louver Pivot Point
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

    renderCirculatorFan(w, h) {
        const ctx = this.ctx;
        const solver = this.solver;
        const scaleX = w / solver.Lx;
        const scaleY = h / solver.Ly;

        const fanPosX = solver.circulatorPosX * scaleX;
        const fanCeilingY = h - (solver.Ly * scaleY);
        const fanPivotY = h - (solver.circulatorPosY * scaleY);

        const isEnabled = solver.circulatorEnabled;
        const swingAngleDeg = solver.getCurrentCirculatorAngle();
        const swingAngleRad = (swingAngleDeg * Math.PI) / 180.0;

        if (isEnabled) {
            this.circulatorBladeAngle += (solver.circulatorSpeed / 2.6) * 0.45;
        }

        ctx.save();

        // 1. Ceiling Base Mount Bracket
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(fanPosX - 18, fanCeilingY, 36, 6, [0, 0, 4, 4]);
        ctx.fill();
        ctx.stroke();

        // Suspension Stem
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(fanPosX - 4, fanCeilingY + 6, 8, fanPivotY - fanCeilingY - 10);
        ctx.strokeRect(fanPosX - 4, fanCeilingY + 6, 8, fanPivotY - fanCeilingY - 10);

        // 2. Airflow Jet Cone
        if (isEnabled) {
            const jetLength = 220 * (solver.circulatorSpeed / 2.6);
            const jetSpread = 0.22;
            
            const baseDir = Math.PI / 2 - swingAngleRad;
            const jetAngleL = baseDir - jetSpread;
            const jetAngleR = baseDir + jetSpread;

            const pL_x = fanPosX + jetLength * Math.cos(jetAngleL);
            const pL_y = fanPivotY + jetLength * Math.sin(jetAngleL);
            const pR_x = fanPosX + jetLength * Math.cos(jetAngleR);
            const pR_y = fanPivotY + jetLength * Math.sin(jetAngleR);
            const pMid_x = fanPosX + jetLength * Math.cos(baseDir);
            const pMid_y = fanPivotY + jetLength * Math.sin(baseDir);

            const jetGrad = ctx.createLinearGradient(fanPosX, fanPivotY, pMid_x, pMid_y);
            jetGrad.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
            jetGrad.addColorStop(0.6, 'rgba(14, 165, 233, 0.20)');
            jetGrad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

            ctx.fillStyle = jetGrad;
            ctx.beginPath();
            ctx.moveTo(fanPosX, fanPivotY);
            ctx.lineTo(pL_x, pL_y);
            ctx.lineTo(pR_x, pR_y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(fanPosX, fanPivotY);
            ctx.lineTo(pMid_x, pMid_y);
            ctx.stroke();

            const pSubL_x = fanPosX + jetLength * 0.8 * Math.cos(baseDir - 0.11);
            const pSubL_y = fanPivotY + jetLength * 0.8 * Math.sin(baseDir - 0.11);
            const pSubR_x = fanPosX + jetLength * 0.8 * Math.cos(baseDir + 0.11);
            const pSubR_y = fanPivotY + jetLength * 0.8 * Math.sin(baseDir + 0.11);
            ctx.beginPath();
            ctx.moveTo(fanPosX, fanPivotY);
            ctx.lineTo(pSubL_x, pSubL_y);
            ctx.moveTo(fanPosX, fanPivotY);
            ctx.lineTo(pSubR_x, pSubR_y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 3. Oscillating Fan Head Assembly
        ctx.save();
        ctx.translate(fanPosX, fanPivotY);
        ctx.rotate(-swingAngleRad);

        // Motor Housing
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-10, -18, 20, 16, 5);
        ctx.fill();
        ctx.stroke();

        // Neck Joint Hinge
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(0, -6, 5, 0, Math.PI * 2);
        ctx.fill();

        // 4. Circular Wire Cage Guard
        const cageRadius = 24;
        
        ctx.strokeStyle = isEnabled ? '#38bdf8' : '#cbd5e1';
        ctx.lineWidth = 2.0;
        ctx.fillStyle = isEnabled ? 'rgba(14, 165, 233, 0.08)' : 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.arc(0, 0, cageRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = isEnabled ? 'rgba(56, 189, 248, 0.5)' : 'rgba(203, 213, 225, 0.4)';
        ctx.lineWidth = 1.0;
        [8, 16].forEach(r => {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        const numSpokes = 12;
        for (let s = 0; s < numSpokes; s++) {
            const spokeAngle = (s * Math.PI * 2) / numSpokes;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(cageRadius * Math.cos(spokeAngle), cageRadius * Math.sin(spokeAngle));
            ctx.stroke();
        }

        // 5. 3 Translucent Blue Blades
        ctx.save();
        ctx.rotate(this.circulatorBladeAngle);
        const numBlades = 3;
        const bladeLen = 20;

        for (let b = 0; b < numBlades; b++) {
            ctx.save();
            ctx.rotate((b * Math.PI * 2) / numBlades);

            const bGrad = ctx.createLinearGradient(0, 0, bladeLen, 0);
            bGrad.addColorStop(0, 'rgba(14, 165, 233, 0.95)');
            bGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.85)');
            bGrad.addColorStop(1, 'rgba(186, 230, 253, 0.65)');

            ctx.fillStyle = bGrad;
            ctx.strokeStyle = 'rgba(2, 132, 199, 0.9)';
            ctx.lineWidth = 1.0;

            ctx.beginPath();
            ctx.moveTo(3, -3);
            ctx.bezierCurveTo(8, -12, 18, -10, bladeLen, -4);
            ctx.bezierCurveTo(bladeLen + 2, 4, 14, 11, 4, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }
        ctx.restore();

        // 6. Center Hub
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // 7. Status Label Badge & Glow LED
        ctx.fillStyle = isEnabled ? '#00f2fe' : '#64748b';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        const statusTxt = isEnabled ? `オート扇: ON (${solver.circulatorSpeed}m/s)` : 'オート扇: OFF';
        ctx.fillText(statusTxt, fanPosX, fanCeilingY + 16);

        ctx.fillStyle = isEnabled ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(fanPosX - 38, fanCeilingY + 13, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.restore();
    }
}
