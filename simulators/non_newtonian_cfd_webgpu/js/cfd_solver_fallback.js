/**
 * cfd_solver_fallback.js - CPU TypedArray による VOF 二相流 (液相＋気相) ソルバー
 */

import { CELL_TYPE } from './geometry.js';

export class FallbackSolver {
  constructor(Nx, Ny) {
    this.Nx = Nx;
    this.Ny = Ny;
    this.totalCells = Nx * Ny;

    this.u = new Float32Array(this.totalCells);
    this.v = new Float32Array(this.totalCells);
    this.p = new Float32Array(this.totalCells);
    this.F = new Float32Array(this.totalCells);

    this.u_next = new Float32Array(this.totalCells);
    this.v_next = new Float32Array(this.totalCells);
    this.p_next = new Float32Array(this.totalCells);
    this.F_next = new Float32Array(this.totalCells);

    this.cellType = new Uint8Array(this.totalCells);
    this.interleavedCache = new Float32Array(this.totalCells * 4);

    this.stepCount = 0;
    this.fillRatio = 0.0;
    this.residual = 1.0;
    this.maxVel = 0.0;
    this.maxPressure = 0.0;
    this.minPressure = 0.0;
  }

  async init() {
    this.reset();
    return true;
  }

  setCellMask(maskArray) {
    this.cellType.set(maskArray);
  }

  reset() {
    this.u.fill(0);
    this.v.fill(0);
    this.p.fill(0);
    this.F.fill(0);
    this.u_next.fill(0);
    this.v_next.fill(0);
    this.p_next.fill(0);
    this.F_next.fill(0);
    this.stepCount = 0;
    this.fillRatio = 0.0;
    this.residual = 1.0;
  }

  updateUniforms(params) {
    this.params = params;
  }

  calcLiquidViscosity(gammaDot, p) {
    const eps = 1e-5;
    const g = Math.max(eps, Math.abs(gammaDot));
    let etaY = 0.0;
    if (p.tau_y > 0.0) {
      etaY = (p.tau_y / g) * (1.0 - Math.exp(-p.m_reg * g));
    }
    const etaPow = p.K * Math.pow(g, p.n - 1.0);
    return Math.max(p.eta_min, Math.min(p.eta_max, etaY + etaPow));
  }

  stepBatch(numSteps = 5) {
    const Nx = this.Nx;
    const Ny = this.Ny;
    const p = this.params;
    const dx = 1.0 / Nx;
    const dy = 1.0 / Nx;
    const dt = p.dt_pseudo ?? 0.00015;
    const dtVof = p.dt_vof ?? 0.0010;
    const beta = p.beta ?? 45.0;
    const rhoLiq = p.rho ?? 1000.0;
    const rhoGas = p.rho_gas ?? 15.0;
    const etaGas = p.eta_gas ?? 0.01;
    const dissipation = p.dissipation ?? 0.0001;

    for (let step = 0; step < numSteps; step++) {
      // 1. 境界条件
      for (let j = 0; j < Ny; j++) {
        for (let i = 0; i < Nx; i++) {
          const idx = j * Nx + i;
          const cType = this.cellType[idx];

          if (cType === CELL_TYPE.INLET) {
            this.u[idx] = 0;
            this.v[idx] = p.inlet_vel ?? 1.0;
            this.F[idx] = 1.0;
          } else if (cType === CELL_TYPE.SOLID) {
            this.u[idx] = 0;
            this.v[idx] = 0;
            this.F[idx] = 0;
            this.p[idx] = 0;
          }
        }
      }

      // 2. VOF 界面移流 (二相界面)
      for (let j = 1; j < Ny - 1; j++) {
        for (let i = 1; i < Nx - 1; i++) {
          const idx = j * Nx + i;
          if (this.cellType[idx] === CELL_TYPE.SOLID) continue;

          const uC = this.u[idx];
          const vC = this.v[idx];
          const fC = this.F[idx];
          const fL = this.F[idx - 1];
          const fR = this.F[idx + 1];
          const fB = this.F[idx - Nx];
          const fT = this.F[idx + Nx];

          const fluxX = uC >= 0 ? uC * (fC - fL) / dx : uC * (fR - fC) / dx;
          const fluxY = vC >= 0 ? vC * (fC - fB) / dy : vC * (fT - fC) / dy;

          this.F_next[idx] = Math.max(0, Math.min(1, fC - dtVof * (fluxX + fluxY)));
        }
      }

      // 3. 二相流運動量・連続の式更新
      for (let j = 1; j < Ny - 1; j++) {
        for (let i = 1; i < Nx - 1; i++) {
          const idx = j * Nx + i;
          const cType = this.cellType[idx];
          const fNew = this.F_next[idx];

          if (cType === CELL_TYPE.SOLID) {
            this.u_next[idx] = 0;
            this.v_next[idx] = 0;
            this.p_next[idx] = 0;
            continue;
          }

          if (cType === CELL_TYPE.INLET) {
            this.u_next[idx] = 0;
            this.v_next[idx] = p.inlet_vel ?? 1.0;
            this.p_next[idx] = this.p[idx + Nx];
            continue;
          }

          const uC = this.u[idx];
          const vC = this.v[idx];
          const uL = this.u[idx - 1];
          const uR = this.u[idx + 1];
          const uB = this.u[idx - Nx];
          const uT = this.u[idx + Nx];

          const vL = this.v[idx - 1];
          const vR = this.v[idx + 1];
          const vB = this.v[idx - Nx];
          const vT = this.v[idx + Nx];

          const pL = this.p[idx - 1];
          const pR = this.p[idx + 1];
          const pB = this.p[idx - Nx];
          const pT = this.p[idx + Nx];

          // 二相混合物性
          const rhoEff = fNew * rhoLiq + (1 - fNew) * rhoGas;
          const invRho = 1.0 / Math.max(1.0, rhoEff);

          const dudx = (uR - uL) / (2 * dx);
          const dudy = (uT - uB) / (2 * dy);
          const dvdx = (vR - vL) / (2 * dx);
          const dvdy = (vT - vB) / (2 * dy);

          const gammaDot = Math.sqrt(2 * (dudx * dudx + dvdy * dvdy) + (dudy + dvdx) * (dudy + dvdx));
          const etaLiq = this.calcLiquidViscosity(gammaDot, p);
          const etaEff = fNew * etaLiq + (1 - fNew) * etaGas;

          const viscForceX = etaEff * (uR + uL + uT + uB - 4 * uC) / (dx * dx);
          const viscForceY = etaEff * (vR + vL + vT + vB - 4 * vC) / (dy * dy);

          const advUx = uC >= 0 ? uC * (uC - uL) / dx : uC * (uR - uC) / dx;
          const advUy = vC >= 0 ? vC * (uC - uB) / dy : vC * (uT - uC) / dy;
          const advVx = uC >= 0 ? uC * (vC - vL) / dx : uC * (vR - vC) / dx;
          const advVy = vC >= 0 ? vC * (vC - vB) / dy : vC * (vT - vC) / dy;

          const dpdx = (pR - pL) / (2 * dx);
          const dpdy = (pT - pB) / (2 * dy);

          const duDt = -(advUx + advUy) - invRho * dpdx + invRho * viscForceX;
          const dvDt = -(advVx + advVy) - invRho * dpdy + invRho * viscForceY;

          this.u_next[idx] = uC + dt * duDt;
          this.v_next[idx] = vC + dt * dvDt;

          const divU = dudx + dvdy;
          const laplaceP = (pR + pL + pT + pB - 4 * this.p[idx]) / (dx * dx);

          let pNew = this.p[idx] - dt * beta * divU + dissipation * laplaceP;
          if (fNew < 0.05) pNew *= 0.2;
          this.p_next[idx] = Math.max(0, pNew);
        }
      }

      this.u.set(this.u_next);
      this.v.set(this.v_next);
      this.p.set(this.p_next);
      this.F.set(this.F_next);
      this.stepCount++;
    }
  }

  async readbackState() {
    let pMax = 0;
    let vMax = 0;
    let filled = 0;
    let total = 0;

    for (let i = 0; i < this.totalCells; i++) {
      const u = this.u[i];
      const v = this.v[i];
      const p = this.p[i];
      const f = this.F[i];

      const offset = i * 4;
      this.interleavedCache[offset] = u;
      this.interleavedCache[offset + 1] = v;
      this.interleavedCache[offset + 2] = p;
      this.interleavedCache[offset + 3] = f;

      if (this.cellType[i] !== CELL_TYPE.SOLID) {
        total++;
        if (f > 0.05) {
          filled += f;
          if (p > pMax) pMax = p;
          const vel = Math.sqrt(u * u + v * v);
          if (vel > vMax) vMax = vel;
        }
      }
    }

    this.minPressure = 0.0;
    this.maxPressure = pMax > 0 ? pMax : 1.0e5;
    this.maxVel = vMax;
    this.residual = Math.max(1e-5, pMax * 0.0005);
    this.fillRatio = total > 0 ? (filled / total) : 0;

    return this.interleavedCache;
  }
}
