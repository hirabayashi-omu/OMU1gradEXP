/**
 * 2D Finite Volume Method (FVM) CFD Solver for Classroom Airflow & Thermal Dynamics
 * Commercial Air Conditioner (Ceiling Suspended, 2.3 HP)
 */
class CFDSolver2D {
    constructor(Nx = 70, Ny = 35) {
        // Domain Geometry
        this.Lx = 7.0; // Classroom width (m)
        this.Ly = 3.5; // Ceiling height (m)
        this.Nx = Nx;  // Grid cells in X
        this.Ny = Ny;  // Grid cells in Y
        
        this.dx = this.Lx / this.Nx;
        this.dy = this.Ly / this.Ny;

        // Physical Constants
        this.nu = 0.0015;   // Effective kinematic viscosity (m^2/s) - reduced for strong jet momentum
        this.alpha = 0.0025; // Effective thermal diffusivity (m^2/s)
        this.beta = 0.0034; // Thermal expansion coefficient (1/K)
        this.g = 9.81;      // Gravity (m/s^2)
        this.rho = 1.2;     // Air density (kg/m^3)

        // AC Operational Parameters
        this.outletTemp = 16.0;      // Blow air temp (°C)
        this.initTemp = 30.0;        // Initial room temp (°C)
        this.powerRating = 2.3;      // Horsepower rating (HP)
        this.outletVel = 4.2;        // Strong commercial AC discharge velocity (m/s) for deep straight penetration
        
        // Fin Mode & Angle
        this.isSweepMode = false;
        this.finAngleDeg = 45.0;     // 0° (Horizontal +X) to 75° (Downward -Y)
        this.sweepSpeedSec = 8.0;    // Oscillation period (s)
        
        // Window Boundary Condition (x = 0)
        this.windowCondition = 'summer'; // 'summer' (34°C), 'winter' (5°C), 'neutral'
        this.windowTemp = 34.0;

        // Simulation State
        this.time = 0.0;
        this.stepCount = 0;
        this.dt = 0.015; // Time step (s)

        // Allocate Arrays
        const numCells = this.Nx * this.Ny;
        this.u = new Float64Array(numCells);
        this.v = new Float64Array(numCells);
        this.u_new = new Float64Array(numCells);
        this.v_new = new Float64Array(numCells);
        this.p = new Float64Array(numCells);
        this.T = new Float64Array(numCells);
        this.T_new = new Float64Array(numCells);
        this.flags = new Uint8Array(numCells); // Cell types: 0=fluid, 1=wall, 2=AC body, 3=AC outlet, 4=AC inlet

        // Define AC Unit Geometry Cells
        // AC position: x = 1.0m (i around 8..14), ceiling hanging (y = 3.0..3.4m, j around 30..34)
        this.acMinI = Math.floor(0.7 / this.dx); // i = 7
        this.acMaxI = Math.floor(1.5 / this.dx); // i = 15
        this.acMinJ = Math.floor(3.0 / this.dy); // j = 30
        this.acMaxJ = Math.floor(3.4 / this.dy); // j = 34

        // Outlet Nozzle Cell (Bottom Right front of AC)
        this.outletI = this.acMaxI - 1;
        this.outletJ = this.acMinJ;

        // Suction Intake Cells (Bottom REAR side of unit, per real Ceiling Suspended AC design)
        this.inletIStart = this.acMinI;
        this.inletIEnd = this.acMinI + Math.floor((this.acMaxI - this.acMinI) * 0.6); // Rear 60% of bottom face
        this.inletJ = this.acMinJ;

        this.initDomain();
    }

    getIndex(i, j) {
        return j * this.Nx + i;
    }

    initDomain() {
        this.time = 0.0;
        this.stepCount = 0;

        for (let j = 0; j < this.Ny; j++) {
            for (let i = 0; i < this.Nx; i++) {
                const idx = this.getIndex(i, j);
                this.u[idx] = 0.0;
                this.v[idx] = 0.0;
                this.p[idx] = 0.0;
                this.T[idx] = this.initTemp;
                this.flags[idx] = 0; // Default fluid

                // Boundary Walls
                if (i === 0 || i === this.Nx - 1 || j === 0 || j === this.Ny - 1) {
                    this.flags[idx] = 1; // Wall boundary
                }

                // AC Unit Internal Solid Body
                if (i >= this.acMinI && i <= this.acMaxI && j >= this.acMinJ && j <= this.acMaxJ) {
                    this.flags[idx] = 2; // AC Body
                }
            }
        }

        // Assign AC Outlet & Inlet cell flags
        // Assign AC Outlet (Front-Right slanted nozzle 2x2 zone)
        for (let i = this.acMaxI - 1; i <= this.acMaxI; i++) {
            for (let j = this.acMinJ; j <= this.acMinJ + 1; j++) {
                if (i >= 0 && i < this.Nx && j >= 0 && j < this.Ny) {
                    this.flags[this.getIndex(i, j)] = 3; // Outlet Nozzle
                }
            }
        }

        for (let i = this.inletIStart; i <= this.inletIEnd; i++) {
            this.flags[this.getIndex(i, this.inletJ)] = 4; // Inlet
        }
    }

    updateWindowTemp() {
        if (this.windowCondition === 'summer') {
            this.windowTemp = 34.0;
        } else if (this.windowCondition === 'winter') {
            this.windowTemp = 5.0;
        } else {
            this.windowTemp = this.initTemp;
        }
    }

    getCurrentFinAngle() {
        if (!this.isSweepMode) {
            return this.finAngleDeg;
        }
        // Auto-Sweep sinusoidal oscillation between 10° and 70°
        const mid = 40.0;
        const amp = 30.0;
        const freq = (2.0 * Math.PI) / this.sweepSpeedSec;
        return mid + amp * Math.sin(freq * this.time);
    }

    step() {
        this.updateWindowTemp();
        const dt = this.dt;
        const currentAngle = this.getCurrentFinAngle();
        const angleRad = (currentAngle * Math.PI) / 180.0;

        // AC Nozzle Discharge Velocities
        // 0° = Horizontal +X, 90° = Downward -Y
        const u_out = this.outletVel * Math.cos(angleRad);
        const v_out = -this.outletVel * Math.sin(angleRad);

        // Suction Velocity into AC bottom (Mass conservation)
        const inletWidth = (this.inletIEnd - this.inletIStart + 1);
        const v_in = (this.outletVel / inletWidth) * 0.8; // Upward flow into inlet

        // ----------------------------------------------------
        // 1. Momentum Equation (Advection, Diffusion, Thermal Buoyancy)
        // ----------------------------------------------------
        for (let j = 1; j < this.Ny - 1; j++) {
            for (let i = 1; i < this.Nx - 1; i++) {
                const idx = this.getIndex(i, j);

                // Skip solid AC body
                if (this.flags[idx] === 2) {
                    this.u_new[idx] = 0.0;
                    this.v_new[idx] = 0.0;
                    continue;
                }

                // AC Outlet Cell (Enforce Directional Louver Vector)
                if (this.flags[idx] === 3) {
                    this.u_new[idx] = u_out;
                    this.v_new[idx] = v_out;
                    continue;
                }

                // AC Inlet Cell
                if (this.flags[idx] === 4) {
                    this.u_new[idx] = 0.0;
                    this.v_new[idx] = v_in; // Pulling air upward
                    continue;
                }

                const u_ij = this.u[idx];
                const v_ij = this.v[idx];

                const u_E = this.u[this.getIndex(i + 1, j)];
                const u_W = this.u[this.getIndex(i - 1, j)];
                const u_N = this.u[this.getIndex(i, j + 1)];
                const u_S = this.u[this.getIndex(i, j - 1)];

                const v_E = this.v[this.getIndex(i + 1, j)];
                const v_W = this.v[this.getIndex(i - 1, j)];
                const v_N = this.v[this.getIndex(i, j + 1)];
                const v_S = this.v[this.getIndex(i, j - 1)];

                // Face velocities & UDS Upwind Advection for U
                const u_e = 0.5 * (u_ij + u_E);
                const u_w = 0.5 * (u_W + u_ij);
                const v_n = 0.5 * (v_ij + v_N);
                const v_s = 0.5 * (v_S + v_ij);

                const u_face_e = u_e >= 0 ? u_ij : u_E;
                const u_face_w = u_w >= 0 ? u_W : u_ij;
                const u_face_n = v_n >= 0 ? u_ij : u_N;
                const u_face_s = v_s >= 0 ? u_S : u_ij;

                const advect_u = (u_e * u_face_e - u_w * u_face_w) / this.dx +
                                 (v_n * u_face_n - v_s * u_face_s) / this.dy;

                const laplacian_u = (u_E - 2 * u_ij + u_W) / (this.dx * this.dx) +
                                    (u_N - 2 * u_ij + u_S) / (this.dy * this.dy);

                let u_star = u_ij + dt * (-advect_u + this.nu * laplacian_u);

                // Face velocities & UDS Upwind Advection for V
                const v_face_e = u_e >= 0 ? v_ij : v_E;
                const v_face_w = u_w >= 0 ? v_W : v_ij;
                const v_face_n = v_n >= 0 ? v_ij : v_N;
                const v_face_s = v_s >= 0 ? v_S : v_ij;

                const advect_v = (u_e * v_face_e - u_w * v_face_w) / this.dx +
                                 (v_n * v_face_n - v_s * v_face_s) / this.dy;

                const laplacian_v = (v_E - 2 * v_ij + v_W) / (this.dx * this.dx) +
                                    (v_N - 2 * v_ij + v_S) / (this.dy * this.dy);

                // Boussinesq Thermal Buoyancy Force: Fy = +g * beta * (T - T_init)
                // Cold air (T < T_init) -> negative Fy (SINKS downward to floor)
                // Warm air (T > T_init) -> positive Fy (RISES upward to ceiling)
                const T_ij = this.T[idx];
                const buoyancy = +this.g * this.beta * (T_ij - this.initTemp);

                let v_star = v_ij + dt * (-advect_v + this.nu * laplacian_v + buoyancy);

                this.u_new[idx] = u_star;
                this.v_new[idx] = v_star;
            }
        }

        // Apply Wall Boundary Conditions to u_star, v_star
        this.applyVelocityBoundaries(this.u_new, this.v_new);

        // Extrapolate Pressure Neumann BC to AC Outlet & Boundary Cells before SOR
        for (let j = 0; j < this.Ny; j++) {
            for (let i = 0; i < this.Nx; i++) {
                const idx = this.getIndex(i, j);
                if (this.flags[idx] === 3) {
                    // Outlet nozzle copies pressure from adjacent fluid cell to prevent pressure choking
                    const fluidIdx = this.getIndex(Math.min(this.Nx - 1, i + 1), Math.max(0, j - 1));
                    this.p[idx] = this.p[fluidIdx];
                }
            }
        }

        // ----------------------------------------------------
        // 2. Pressure Poisson Equation (SOR Iteration)
        // ----------------------------------------------------
        const sorFactor = 1.5;
        const maxIter = 25;

        for (let iter = 0; iter < maxIter; iter++) {
            for (let j = 1; j < this.Ny - 1; j++) {
                for (let i = 1; i < this.Nx - 1; i++) {
                    const idx = this.getIndex(i, j);
                    if (this.flags[idx] !== 0) continue; // Only solve pressure in fluid cells

                    // Velocity Divergence RHS
                    const div = ((this.u_new[this.getIndex(i + 1, j)] - this.u_new[this.getIndex(i - 1, j)]) / (2 * this.dx) +
                                 (this.v_new[this.getIndex(i, j + 1)] - this.v_new[this.getIndex(i, j - 1)]) / (2 * this.dy));

                    const rhs = (this.rho / dt) * div;

                    const p_east = this.p[this.getIndex(i + 1, j)];
                    const p_west = this.p[this.getIndex(i - 1, j)];
                    const p_north = this.p[this.getIndex(i, j + 1)];
                    const p_south = this.p[this.getIndex(i, j - 1)];

                    const p_new_val = 0.25 * (p_east + p_west + p_north + p_south - rhs * this.dx * this.dy);
                    this.p[idx] += sorFactor * (p_new_val - this.p[idx]);
                }
            }
        }

        // ----------------------------------------------------
        // 3. Pressure Correction for Final Velocity Field
        // ----------------------------------------------------
        for (let j = 1; j < this.Ny - 1; j++) {
            for (let i = 1; i < this.Nx - 1; i++) {
                const idx = this.getIndex(i, j);
                if (this.flags[idx] === 3) {
                    // Lock AC Outlet Nozzle Velocity along Louver Angle
                    this.u[idx] = u_out;
                    this.v[idx] = v_out;
                    continue;
                }
                if (this.flags[idx] === 4) {
                    // Lock AC Inlet Suction Velocity
                    this.u[idx] = 0.0;
                    this.v[idx] = v_in;
                    continue;
                }
                if (this.flags[idx] !== 0) continue; // Only fluid cells

                const dpdx = (this.p[this.getIndex(i + 1, j)] - this.p[this.getIndex(i - 1, j)]) / (2 * this.dx);
                const dpdy = (this.p[this.getIndex(i, j + 1)] - this.p[this.getIndex(i, j - 1)]) / (2 * this.dy);

                this.u[idx] = this.u_new[idx] - (dt / this.rho) * dpdx;
                this.v[idx] = this.v_new[idx] - (dt / this.rho) * dpdy;
            }
        }
        this.applyVelocityBoundaries(this.u, this.v);

        // ----------------------------------------------------
        // 4. Energy (Temperature) Advection-Diffusion (Advective Form UDS)
        // ----------------------------------------------------
        for (let j = 1; j < this.Ny - 1; j++) {
            for (let i = 1; i < this.Nx - 1; i++) {
                const idx = this.getIndex(i, j);

                // AC Outlet Cell (Enforce Blow Temp)
                if (this.flags[idx] === 3) {
                    this.T_new[idx] = this.outletTemp;
                    continue;
                }

                // AC Internal Solid Body
                if (this.flags[idx] === 2) {
                    this.T_new[idx] = this.T[idx];
                    continue;
                }

                const T_ij = this.T[idx];
                const u_ij = this.u[idx];
                const v_ij = this.v[idx];

                const T_E = this.T[this.getIndex(i + 1, j)];
                const T_W = this.T[this.getIndex(i - 1, j)];
                const T_N = this.T[this.getIndex(i, j + 1)];
                const T_S = this.T[this.getIndex(i, j - 1)];

                // Upwind temperature gradients
                const dTdx = u_ij >= 0 ? (T_ij - T_W) / this.dx : (T_E - T_ij) / this.dx;
                const dTdy = v_ij >= 0 ? (T_ij - T_S) / this.dy : (T_N - T_ij) / this.dy;

                // Central Diffusion for Temperature
                const laplacian_T = (T_E - 2 * T_ij + T_W) / (this.dx * this.dx) +
                                    (T_N - 2 * T_ij + T_S) / (this.dy * this.dy);

                this.T_new[idx] = T_ij + dt * (- (u_ij * dTdx + v_ij * dTdy) + this.alpha * laplacian_T);
            }
        }

        // Apply Temperature Boundary Conditions
        this.applyTemperatureBoundaries(this.T_new);

        // Swap Temperature arrays
        const tempPtr = this.T;
        this.T = this.T_new;
        this.T_new = tempPtr;

        this.time += dt;
        this.stepCount++;
    }

    applyVelocityBoundaries(u_arr, v_arr) {
        // No-slip condition on outer walls
        for (let j = 0; j < this.Ny; j++) {
            // Left Wall (x=0) & Right Wall (x=Lx)
            u_arr[this.getIndex(0, j)] = 0.0;
            v_arr[this.getIndex(0, j)] = 0.0;
            u_arr[this.getIndex(this.Nx - 1, j)] = 0.0;
            v_arr[this.getIndex(this.Nx - 1, j)] = 0.0;
        }
        for (let i = 0; i < this.Nx; i++) {
            // Floor (y=0) & Ceiling (y=Ly)
            u_arr[this.getIndex(i, 0)] = 0.0;
            v_arr[this.getIndex(i, 0)] = 0.0;
            u_arr[this.getIndex(i, this.Ny - 1)] = 0.0;
            v_arr[this.getIndex(i, this.Ny - 1)] = 0.0;
        }
    }

    applyTemperatureBoundaries(T_arr) {
        // Window Wall (x=0, i=0): Enforce Window Temp
        for (let j = 0; j < this.Ny; j++) {
            T_arr[this.getIndex(0, j)] = this.windowTemp;
        }

        // Right Wall (x=Lx, i=Nx-1): Adiabatic (zero flux)
        for (let j = 0; j < this.Ny; j++) {
            T_arr[this.getIndex(this.Nx - 1, j)] = T_arr[this.getIndex(this.Nx - 2, j)];
        }

        // Floor (y=0, j=0) & Ceiling (y=Ly, j=Ny-1): Adiabatic
        for (let i = 0; i < this.Nx; i++) {
            T_arr[this.getIndex(i, 0)] = T_arr[this.getIndex(i, 1)];
            T_arr[this.getIndex(i, this.Ny - 1)] = T_arr[this.getIndex(i, this.Ny - 2)];
        }
    }

    // Statistical Query Helpers
    getTemperatureStats() {
        let minT = 999.0;
        let maxT = -999.0;
        let sumT = 0.0;
        let count = 0;

        for (let j = 1; j < this.Ny - 1; j++) {
            for (let i = 1; i < this.Nx - 1; i++) {
                const idx = this.getIndex(i, j);
                if (this.flags[idx] === 2) continue; // Exclude AC solid body
                const val = this.T[idx];
                if (val < minT) minT = val;
                if (val > maxT) maxT = val;
                sumT += val;
                count++;
            }
        }
        return {
            min: minT === 999.0 ? this.initTemp : minT,
            max: maxT === -999.0 ? this.initTemp : maxT,
            avg: count > 0 ? sumT / count : this.initTemp
        };
    }

    // Seated Height Temperature Profile (y = 0.8m, cell j ~ 8)
    getSeatedTemperatureProfile() {
        const j_seated = Math.floor(0.8 / this.dy);
        const profile = [];
        for (let i = 0; i < this.Nx; i++) {
            const x = i * this.dx;
            const temp = this.T[this.getIndex(i, j_seated)];
            profile.push({ x: parseFloat(x.toFixed(2)), temp: parseFloat(temp.toFixed(1)) });
        }
        return profile;
    }

    // Sample Value at Real Position (x, y) in meters
    sampleAt(x, y) {
        const i = Math.max(0, Math.min(this.Nx - 1, Math.floor(x / this.dx)));
        const j = Math.max(0, Math.min(this.Ny - 1, Math.floor(y / this.dy)));
        const idx = this.getIndex(i, j);

        const u_val = this.u[idx];
        const v_val = this.v[idx];
        const velMag = Math.sqrt(u_val * u_val + v_val * v_val);
        const temp_val = this.T[idx];

        return {
            i, j,
            x: parseFloat(x.toFixed(2)),
            y: parseFloat(y.toFixed(2)),
            u: parseFloat(u_val.toFixed(2)),
            v: parseFloat(v_val.toFixed(2)),
            vel: parseFloat(velMag.toFixed(2)),
            temp: parseFloat(temp_val.toFixed(1))
        };
    }
}
