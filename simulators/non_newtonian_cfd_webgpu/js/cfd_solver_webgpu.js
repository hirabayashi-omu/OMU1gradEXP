/**
 * cfd_solver_webgpu.js - WebGPU Compute Shader による二相流 (VOF: 液相＋気相) 疑似タイムステップソルバー
 * 
 * 二相流 (Two-Phase VOF Formulation):
 *   - 液相 (Phase 1: 化粧品/高分子流体, F = 1): 密度 rho_1, 非ニュートン粘度 eta_1(gamma_dot) [HB/ビンガム/べき乗則]
 *   - 気相 (Phase 2: キャビティ内空気, F = 0): 密度 rho_2, 低粘度 eta_2
 *   - 混合物性:
 *       rho(F) = F * rho_1 + (1 - F) * rho_2
 *       eta(F) = F * eta_1 + (1 - F) * eta_2
 *   - 界面移流方程式:
 *       dF/dt + u * dF/dx + v * dF/dy = 0 (シャープな風上TVD法)
 *   - 人工圧縮性二相ナビエ・ストークス方程式で全領域をシームレスに解く
 */

import { CELL_TYPE } from './geometry.js?v=127';

export class WebGPUSolver {
  constructor(Nx, Ny) {
    this.Nx = Nx;
    this.Ny = Ny;
    this.totalCells = Nx * Ny;

    this.device = null;
    this.computePipeline = null;
    this.bindGroups = [];
    this.uniformBuffer = null;
    this.buffers = {
      stateA: null,
      stateB: null,
      cellType: null,
      staging: null
    };

    this.pingPongIndex = 0;
    this.stepCount = 0;
    this.fillRatio = 0.0;
    this.residual = 1.0;
    this.maxVel = 0.0;
    this.maxPressure = 0.0;
    this.minPressure = 0.0;
    this.isSupported = false;
  }

  async init() {
    if (!navigator.gpu) {
      this.isSupported = false;
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        this.isSupported = false;
        return false;
      }

      this.device = await adapter.requestDevice();
      this.isSupported = true;

      this._createBuffers();
      this._createComputePipeline();

      return true;
    } catch (err) {
      console.error('WebGPU init error:', err);
      this.isSupported = false;
      return false;
    }
  }

  _createBuffers() {
    const stateByteLength = this.totalCells * 16;
    const typeByteLength = this.totalCells * 4;

    const initState = new Float32Array(this.totalCells * 4);
    // 初期状態: 全領域空気 (u=0, v=0, p=0, F=0)
    initState.fill(0);

    this.buffers.stateA = this.device.createBuffer({
      size: stateByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    this.buffers.stateB = this.device.createBuffer({
      size: stateByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    this.buffers.staging = this.device.createBuffer({
      size: stateByteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.buffers.cellType = this.device.createBuffer({
      size: typeByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.uniformBuffer = this.device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.device.queue.writeBuffer(this.buffers.stateA, 0, initState);
    this.device.queue.writeBuffer(this.buffers.stateB, 0, initState);
  }

  setCellMask(maskArray) {
    if (!this.device || !this.buffers.cellType) return;
    const uint32Array = new Uint32Array(maskArray);
    this.device.queue.writeBuffer(this.buffers.cellType, 0, uint32Array);
  }

  _createComputePipeline() {
    const wgslShader = `
      struct Uniforms {
        Nx: u32,
        Ny: u32,
        dt_pseudo: f32,
        beta: f32,
        
        tau_y: f32,
        K: f32,
        n_flow: f32,
        m_reg: f32,

        eta_min: f32,
        eta_max: f32,
        rho_liquid: f32,
        inlet_vel: f32,

        dissipation: f32,
        dt_vof: f32,
        rho_gas: f32,
        eta_gas: f32,
      };

      @group(0) @binding(0) var<uniform> u: Uniforms;
      @group(0) @binding(1) var<storage, read> stateIn: array<vec4<f32>>;
      @group(0) @binding(2) var<storage, read_write> stateOut: array<vec4<f32>>;
      @group(0) @binding(3) var<storage, read> cellType: array<u32>;

      fn idx(i: i32, j: i32) -> i32 {
        let ci = clamp(i, 0, i32(u.Nx) - 1);
        let cj = clamp(j, 0, i32(u.Ny) - 1);
        return cj * i32(u.Nx) + ci;
      }

      // 液相の非ニュートン粘度計算 (HB / Papanastasiou)
      fn calc_liquid_viscosity(gamma_dot: f32) -> f32 {
        let eps = 1e-5;
        let g = max(eps, abs(gamma_dot));
        var eta_y = 0.0;
        if (u.tau_y > 0.0) {
          eta_y = (u.tau_y / g) * (1.0 - exp(-u.m_reg * g));
        }
        let eta_pow = u.K * pow(g, u.n_flow - 1.0);
        return clamp(eta_y + eta_pow, u.eta_min, u.eta_max);
      }

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let i = i32(id.x);
        let j = i32(id.y);
        let Nx = i32(u.Nx);
        let Ny = i32(u.Ny);

        if (i >= Nx || j >= Ny) { return; }

        let cur_idx = j * Nx + i;
        let cType = cellType[cur_idx];
        let dx = 1.0 / f32(Nx);
        let dy = 1.0 / f32(Nx);

        // 1. 壁面 (SOLID: No-slip)
        if (cType == 1u) {
          stateOut[cur_idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
          return;
        }

        // 2. 流入ノズル (INLET: 液相100%注入 F = 1.0, v = inlet_vel)
        if (cType == 2u) {
          let v_in = u.inlet_vel;
          let p_down = stateIn[idx(i, j + 1)].z;
          stateOut[cur_idx] = vec4<f32>(0.0, v_in, p_down, 1.0);
          return;
        }

        // 3. 流出・排気口 (OUTLET: 空気・流体の自由流出 p = 0)
        if (cType == 3u) {
          let prev = stateIn[idx(i, j - 1)];
          stateOut[cur_idx] = vec4<f32>(prev.x, prev.y, 0.0, prev.w);
          return;
        }

        let C = stateIn[cur_idx];
        let L = stateIn[idx(i - 1, j)];
        let R = stateIn[idx(i + 1, j)];
        let T = stateIn[idx(i, j + 1)]; // 下向き (+y)
        let B = stateIn[idx(i, j - 1)]; // 上向き (-y)

        let TL = stateIn[idx(i - 1, j + 1)];
        let TR = stateIn[idx(i + 1, j + 1)];
        let BL = stateIn[idx(i - 1, j - 1)];
        let BR = stateIn[idx(i + 1, j - 1)];

        // ==========================================
        // 1. VOF 二相流 界面移流方程式 (dF/dt + div(Fu) = 0)
        // ==========================================
        // セル面流速による移流フラックス (Donnor-Acceptor / Upwind)
        var flux_x = 0.0;
        if (C.x >= 0.0) {
          flux_x = C.x * (C.w - L.w) / dx;
        } else {
          flux_x = C.x * (R.w - C.w) / dx;
        }

        var flux_y = 0.0;
        if (C.y >= 0.0) {
          flux_y = C.y * (C.w - B.w) / dy;
        } else {
          flux_y = C.y * (T.w - C.w) / dy;
        }

        // 界面体積分率 F_new の更新 [0, 1]
        var F_new = clamp(C.w - u.dt_vof * (flux_x + flux_y), 0.0, 1.0);

        // ==========================================
        // 2. 二相流 局所混合物性 (One-Fluid Model)
        // ==========================================
        // 混合密度: rho(F) = F * rho_liquid + (1 - F) * rho_gas
        let rho_eff = F_new * u.rho_liquid + (1.0 - F_new) * u.rho_gas;
        let inv_rho = 1.0 / max(1.0, rho_eff);

        // せん断速度の計算
        let dudx = (R.x - L.x) / (2.0 * dx);
        let dudy = (T.x - B.x) / (2.0 * dy);
        let dvdx = (R.y - L.y) / (2.0 * dx);
        let dvdy = (T.y - B.y) / (2.0 * dy);
        let gamma_dot = sqrt(2.0 * (dudx * dudx + dvdy * dvdy) + (dudy + dvdx) * (dudy + dvdx));

        // 局所の液相非ニュートン粘度
        let eta_liq = calc_liquid_viscosity(gamma_dot);
        // 二相混合粘度: eta(F) = F * eta_liquid + (1 - F) * eta_gas
        let eta_eff = F_new * eta_liq + (1.0 - F_new) * u.eta_gas;

        // セル面粘度
        let eta_L = 0.5 * (eta_eff + (L.w * calc_liquid_viscosity(abs((L.y - BL.y)/dy + (L.x - BL.x)/dx)) + (1.0 - L.w) * u.eta_gas));
        let eta_R = 0.5 * (eta_eff + (R.w * calc_liquid_viscosity(abs((R.y - BR.y)/dy + (R.x - BR.x)/dx)) + (1.0 - R.w) * u.eta_gas));
        let eta_B = 0.5 * (eta_eff + (B.w * calc_liquid_viscosity(abs((B.y - BL.y)/dy + (B.x - BL.x)/dx)) + (1.0 - B.w) * u.eta_gas));
        let eta_T = 0.5 * (eta_eff + (T.w * calc_liquid_viscosity(abs((T.y - TL.y)/dy + (T.x - TL.x)/dx)) + (1.0 - T.w) * u.eta_gas));

        // 粘性応力テンソル発散
        let dtau_xx_dx = (2.0 * eta_R * (R.x - C.x) - 2.0 * eta_L * (C.x - L.x)) / (dx * dx);
        let dtau_yy_dy = (2.0 * eta_T * (T.y - C.y) - 2.0 * eta_B * (C.y - B.y)) / (dy * dy);
        let d_tau_xy_dy = (eta_T * ((T.x - C.x)/dy + (TR.y - TL.y)/(2.0*dx)) - eta_B * ((C.x - B.x)/dy + (BR.y - BL.y)/(2.0*dx))) / dy;
        let d_tau_xy_dx = (eta_R * ((R.y - C.y)/dx + (TR.x - BR.x)/(2.0*dy)) - eta_L * ((C.y - L.y)/dx + (TL.x - BL.x)/(2.0*dy))) / dx;

        let visc_force_x = dtau_xx_dx + d_tau_xy_dy;
        let visc_force_y = d_tau_xy_dx + dtau_yy_dy;

        // 移流項 (風上差分)
        var adv_u_x = 0.0; if (C.x >= 0.0) { adv_u_x = C.x * (C.x - L.x) / dx; } else { adv_u_x = C.x * (R.x - C.x) / dx; }
        var adv_u_y = 0.0; if (C.y >= 0.0) { adv_u_y = C.y * (C.y - B.y) / dy; } else { adv_u_y = C.y * (T.y - C.y) / dy; }
        var adv_v_x = 0.0; if (C.x >= 0.0) { adv_v_x = C.x * (C.y - L.y) / dx; } else { adv_v_x = C.x * (R.y - C.y) / dx; }
        var adv_v_y = 0.0; if (C.y >= 0.0) { adv_v_y = C.y * (C.y - B.y) / dy; } else { adv_v_y = C.y * (T.y - C.y) / dy; }

        // 圧力勾配
        let dpdx = (R.z - L.z) / (2.0 * dx);
        let dpdy = (T.z - B.z) / (2.0 * dy);

        // 運動量方程式更新
        let du_dt = - (adv_u_x + adv_u_y) - inv_rho * dpdx + inv_rho * visc_force_x;
        let dv_dt = - (adv_v_x + adv_v_y) - inv_rho * dpdy + inv_rho * visc_force_y;

        var u_new = C.x + u.dt_pseudo * du_dt;
        var v_new = C.y + u.dt_pseudo * dv_dt;

        // 連続の式 (発散) & 圧力緩和
        let div_u = dudx + dvdy;
        let laplace_p = (R.z + L.z + T.z + B.z - 4.0 * C.z) / (dx * dx);

        // 人工圧縮性二相圧力更新
        var p_new = C.z - u.dt_pseudo * u.beta * div_u + u.dissipation * laplace_p;

        // 気相領域 (F < 0.02) では大気圧 p = 0 に緩和
        if (F_new < 0.02) {
          p_new = p_new * 0.2;
          u_new = u_new * 0.8;
          v_new = v_new * 0.8;
        }

        // 壁面近傍の微小減衰
        if (cellType[idx(i - 1, j)] == 1u || cellType[idx(i + 1, j)] == 1u) {
          u_new = u_new * 0.5;
        }

        stateOut[cur_idx] = vec4<f32>(u_new, v_new, max(0.0, p_new), F_new);
      }
    `;

    const module = this.device.createShaderModule({ code: wgslShader });
    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' }
    });

    this.bindGroups[0] = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.buffers.stateA } },
        { binding: 2, resource: { buffer: this.buffers.stateB } },
        { binding: 3, resource: { buffer: this.buffers.cellType } }
      ]
    });

    this.bindGroups[1] = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.buffers.stateB } },
        { binding: 2, resource: { buffer: this.buffers.stateA } },
        { binding: 3, resource: { buffer: this.buffers.cellType } }
      ]
    });
  }

  updateUniforms(params) {
    if (!this.device || !this.uniformBuffer) return;

    const bufferData = new ArrayBuffer(64);
    const u32View = new Uint32Array(bufferData);
    const f32View = new Float32Array(bufferData);

    u32View[0] = this.Nx;
    u32View[1] = this.Ny;
    f32View[2] = params.dt_pseudo ?? 0.00015;
    f32View[3] = params.beta ?? 45.0;

    f32View[4] = params.tau_y ?? 0.0;
    f32View[5] = params.K ?? 1.0;
    f32View[6] = params.n ?? 1.0;
    f32View[7] = params.m_reg ?? 100.0;

    f32View[8] = params.eta_min ?? 0.001;
    f32View[9] = params.eta_max ?? 500.0;
    f32View[10] = params.rho ?? 1000.0; // rho_liquid
    f32View[11] = params.inlet_vel ?? 1.0;

    f32View[12] = params.dissipation ?? 0.0001;
    f32View[13] = params.dt_vof ?? 0.0010; // dt_vof
    f32View[14] = params.rho_gas ?? 15.0;  // rho_gas (数値安定化実効空気密度)
    f32View[15] = params.eta_gas ?? 0.01;  // eta_gas (空気粘度)

    this.device.queue.writeBuffer(this.uniformBuffer, 0, bufferData);
  }

  stepBatch(numSteps = 20) {
    if (!this.device || !this.computePipeline) return;

    const commandEncoder = this.device.createCommandEncoder();
    const workgroupsX = Math.ceil(this.Nx / 16);
    const workgroupsY = Math.ceil(this.Ny / 16);

    for (let s = 0; s < numSteps; s++) {
      const pass = commandEncoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, this.bindGroups[this.pingPongIndex]);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();

      this.pingPongIndex = 1 - this.pingPongIndex;
      this.stepCount++;
    }

    this.device.queue.submit([commandEncoder.finish()]);
  }

  async readbackState() {
    if (!this.device || !this.buffers.staging) return null;

    const currentBuffer = (this.pingPongIndex === 0) ? this.buffers.stateA : this.buffers.stateB;
    const byteLength = this.totalCells * 16;

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(currentBuffer, 0, this.buffers.staging, 0, byteLength);
    this.device.queue.submit([commandEncoder.finish()]);

    await this.buffers.staging.mapAsync(GPUMapMode.READ, 0, byteLength);
    const copyArrayBuffer = this.buffers.staging.getMappedRange(0, byteLength);
    const floatData = new Float32Array(copyArrayBuffer.slice(0));
    this.buffers.staging.unmap();

    this._computeStats(floatData);
    return floatData;
  }

  _computeStats(data) {
    let pMax = -Infinity;
    let vMax = 0;
    let sumDiv = 0;
    let sampleCount = 0;
    let filledCells = 0;
    let totalCavityCells = 0;

    const stride = 4;
    for (let j = 2; j < this.Ny - 2; j += 2) {
      for (let i = 2; i < this.Nx - 2; i += 2) {
        const idx = (j * this.Nx + i) * stride;
        const u = data[idx];
        const v = data[idx + 1];
        const p = data[idx + 2];
        const F = data[idx + 3];

        totalCavityCells++;
        if (F > 0.05) {
          filledCells += F;
          if (p > pMax) pMax = p;
          const speed = Math.sqrt(u * u + v * v);
          if (speed > vMax) vMax = speed;

          const uR = data[idx + stride];
          const uL = data[idx - stride];
          const vT = data[idx + this.Nx * stride + 1];
          const vB = data[idx - this.Nx * stride + 1];
          sumDiv += Math.abs((uR - uL) + (vT - vB));
          sampleCount++;
        }
      }
    }

    this.minPressure = 0.0;
    this.maxPressure = isFinite(pMax) && pMax > 0 ? pMax : 1.0e5;
    this.maxVel = vMax;
    this.residual = sampleCount > 0 ? (sumDiv / sampleCount) : 0;
    this.fillRatio = totalCavityCells > 0 ? (filledCells / totalCavityCells) : 0;
  }

  reset() {
    if (!this.device) return;
    const initState = new Float32Array(this.totalCells * 4);
    initState.fill(0);
    this.device.queue.writeBuffer(this.buffers.stateA, 0, initState);
    this.device.queue.writeBuffer(this.buffers.stateB, 0, initState);
    this.stepCount = 0;
    this.pingPongIndex = 0;
    this.residual = 1.0;
    this.fillRatio = 0.0;
  }
}
