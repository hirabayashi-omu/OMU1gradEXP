/**
 * webgpu_engine.js - WebGPUによるCFD高解像度並列計算・レンダリングエンジン
 * 512x256以上の高密度グリッドにおける速度場・圧力場の並列Compute Shader処理
 */

'use strict';

const WebGPUEngine = (() => {
  let isSupported = false;
  let adapter = null;
  let device = null;
  let computePipeline = null;
  let isInitialized = false;

  // グリッド解像度設定
  const GRID_NX = 512;
  const GRID_NY = 256;

  // WGSL Compute Shader
  const COMPUTE_SHADER_WGSL = `
    struct Params {
      alpha: f32,
      vInf: f32,
      chord: f32,
      gamma: f32,
      thickSource: f32,
      gridW: f32,
      gridH: f32,
      nx: u32,
      ny: u32,
      m: f32,
      p: f32,
      t: f32,
    };

    @group(0) @binding(0) var<uniform> params: Params;
    @group(0) @binding(1) var<storage, read_write> velocityField: array<vec4f>;

    fn thickness_local(x: f32, t: f32) -> f32 {
      if (x < 0.0 || x > 1.0) { return 0.0; }
      return (t / 0.2) * (
        0.2969 * sqrt(max(x, 0.0)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x
      );
    }

    fn camber_local(x: f32, m: f32, p: f32) -> f32 {
      if (m == 0.0 || p == 0.0 || x < 0.0 || x > 1.0) { return 0.0; }
      if (x < p) {
        return (m / (p * p)) * (2.0 * p * x - x * x);
      } else {
        return (m / ((1.0 - p) * (1.0 - p))) * (1.0 - 2.0 * p + 2.0 * p * x - x * x);
      }
    }

    @compute @workgroup_size(16, 16)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let i = global_id.x;
      let j = global_id.y;

      if (i >= params.nx || j >= params.ny) {
        return;
      }

      let index = j * params.nx + i;
      let gx = -0.5 * params.chord + (f32(i) / f32(params.nx - 1u)) * params.gridW;
      let gy = (f32(j) / f32(params.ny - 1u) - 0.5) * params.gridH;

      let xi = gx / params.chord;
      var inside: f32 = 0.0;
      if (xi >= 0.0 && xi <= 1.0) {
        let yt = thickness_local(xi, params.t);
        let yc = camber_local(xi, params.m, params.p);
        if (abs(gy / params.chord - yc) < yt * 1.05) {
          inside = 1.0;
        }
      }

      if (inside > 0.5) {
        velocityField[index] = vec4f(0.0, 0.0, 0.0, 1.0); // u, v, speed, inside
        return;
      }

      // 1. 一様流
      var u = params.vInf * cos(params.alpha);
      var v = params.vInf * sin(params.alpha);

      let pi = 3.141592653589793;

      // 2. 分布渦（前縁0.15cから0.85c）
      let g0 = params.gamma * 0.40;
      let rx0 = gx - 0.20 * params.chord;
      let r2_0 = max(rx0 * rx0 + gy * gy, 0.0036 * params.chord * params.chord);
      u += g0 * gy / (2.0 * pi * r2_0);
      v += -g0 * rx0 / (2.0 * pi * r2_0);

      let g1 = params.gamma * 0.35;
      let rx1 = gx - 0.45 * params.chord;
      let r2_1 = max(rx1 * rx1 + gy * gy, 0.0036 * params.chord * params.chord);
      u += g1 * gy / (2.0 * pi * r2_1);
      v += -g1 * rx1 / (2.0 * pi * r2_1);

      let g2 = params.gamma * 0.25;
      let rx2 = gx - 0.70 * params.chord;
      let r2_2 = max(rx2 * rx2 + gy * gy, 0.0036 * params.chord * params.chord);
      u += g2 * gy / (2.0 * pi * r2_2);
      v += -g2 * rx2 / (2.0 * pi * r2_2);

      // 3. 厚みダブレット
      let kappa = params.vInf * pi * (params.t * params.chord) * (params.t * params.chord) * 0.45;
      let rxD = gx - 0.30 * params.chord;
      let r2D = max(rxD * rxD + gy * gy, 0.0064 * params.chord * params.chord);
      let dubU = kappa * (rxD * rxD - gy * gy) / (2.0 * pi * r2D * r2D);
      let dubV = kappa * (2.0 * rxD * gy) / (2.0 * pi * r2D * r2D);
      u += dubU;
      v += dubV;

      // 4. 翼表面のすべり境界条件 (Flow Tangency)
      if (xi >= 0.0 && xi <= 1.0) {
        let xClamped = clamp(xi, 0.001, 0.999);
        let yc = camber_local(xClamped, params.m, params.p);
        let yt = thickness_local(xClamped, params.t);
        let yUpper = (yc + yt) * params.chord;
        let yLower = (yc - yt) * params.chord;
        let isUpper = select(0.0, 1.0, gy >= yc * params.chord);
        let ySurf = select(yLower, yUpper, isUpper > 0.5);

        // 傾き計算 (差分)
        let dx = 0.005;
        let yc_p = camber_local(min(1.0, xClamped + dx), params.m, params.p);
        let yt_p = thickness_local(min(1.0, xClamped + dx), params.t);
        let yc_m = camber_local(max(0.0, xClamped - dx), params.m, params.p);
        let yt_m = thickness_local(max(0.0, xClamped - dx), params.t);
        let dyc_dx = (yc_p - yc_m) / (2.0 * dx);
        let dyt_dx = (yt_p - yt_m) / (2.0 * dx);
        let slope = select(dyc_dx - dyt_dx, dyc_dx + dyt_dx, isUpper > 0.5);

        let dist = abs(gy - ySurf);
        let blendDist = 0.16 * params.chord;
        if (dist < blendDist) {
          let w = exp(-pow(dist / (0.07 * params.chord), 2.0));
          let tLen = sqrt(1.0 + slope * slope);
          let tx = 1.0 / tLen;
          let ty = slope / tLen;

          let curSpeed = sqrt(u * u + v * v);
          let targetU = curSpeed * tx;
          let targetV = curSpeed * ty;

          u = (1.0 - w) * u + w * targetU;
          v = (1.0 - w) * v + w * targetV;
        }
      }

      let speed = sqrt(u * u + v * v);
      // vec4f: x=u, y=v, z=speed, w=inside (0.0=外部, 1.0=内部)
      velocityField[index] = vec4f(u, v, speed, 0.0);
    }
  `;

  /**
   * WebGPU の初期化
   */
  async function init() {
    if (!navigator.gpu) {
      console.warn('[WebGPU] navigator.gpu がサポートされていません。CPUフォールバックを使用します。');
      isSupported = false;
      return false;
    }

    try {
      adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      if (!adapter) {
        console.warn('[WebGPU] GPU Adapter の取得に失敗しました。');
        isSupported = false;
        return false;
      }

      device = await adapter.requestDevice();
      
      // Compute Shader Module作成
      const shaderModule = device.createShaderModule({
        code: COMPUTE_SHADER_WGSL
      });

      computePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: shaderModule,
          entryPoint: 'main'
        }
      });

      isSupported = true;
      isInitialized = true;
      console.log('[WebGPU] WebGPU Compute Shader の初期化に成功しました。(Grid: 512x256)');
      return true;
    } catch (err) {
      console.warn('[WebGPU] 初期化中に例外が発生しました:', err);
      isSupported = false;
      return false;
    }
  }

  /**
   * WebGPUを用いて高解像度速度場を並列計算
   */
  async function computeVelocityFieldGPU(airfoilData, alpha, Vinf, gridW, gridH, nx = GRID_NX, ny = GRID_NY) {
    if (!isSupported || !device || !computePipeline) {
      return null;
    }

    const chord = airfoilData.chord;
    const { m, p, t } = airfoilData.preset;
    const Gamma = Vinf * chord * Math.PI * (alpha - (m > 0 ? -2 * m : 0));
    const thickSource = Vinf * t * chord * 0.8;

    // Uniform バッファの準備 (12 float32 = 48 bytes -> 16 bytes align: 48 bytes)
    const uniformArray = new ArrayBuffer(48);
    const floatView = new Float32Array(uniformArray);
    const uintView = new Uint32Array(uniformArray);

    floatView[0] = alpha;
    floatView[1] = Vinf;
    floatView[2] = chord;
    floatView[3] = Gamma;
    floatView[4] = thickSource;
    floatView[5] = gridW;
    floatView[6] = gridH;
    uintView[7]  = nx;
    uintView[8]  = ny;
    floatView[9] = m;
    floatView[10] = p;
    floatView[11] = t;

    const uniformBuffer = device.createBuffer({
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Uint8Array(uniformBuffer.getMappedRange()).set(new Uint8Array(uniformArray));
    uniformBuffer.unmap();

    // 出力ストレージバッファ (nx * ny * vec4f(16 bytes))
    const totalCells = nx * ny;
    const outputBufferSize = totalCells * 16;

    const storageBuffer = device.createBuffer({
      size: outputBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const readbackBuffer = device.createBuffer({
      size: outputBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    // BindGroup 作成
    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } }
      ]
    });

    // コマンドエンコード
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(nx / 16), Math.ceil(ny / 16));
    passEncoder.end();

    // 読み戻しコピー
    commandEncoder.copyBufferToBuffer(storageBuffer, 0, readbackBuffer, 0, outputBufferSize);
    device.queue.submit([commandEncoder.finish()]);

    // 結果の読み出し
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const copyArray = new Float32Array(readbackBuffer.getMappedRange());
    
    // 2D配列形式（rendererおよびCFD Engineと互換性維持）へ変換
    const field = [];
    for (let j = 0; j < ny; j++) {
      const row = [];
      const rowOffset = j * nx * 4;
      for (let i = 0; i < nx; i++) {
        const idx = rowOffset + i * 4;
        const u = copyArray[idx];
        const v = copyArray[idx + 1];
        const speed = copyArray[idx + 2];
        const inside = copyArray[idx + 3] > 0.5;
        row.push({ u, v, speed, inside });
      }
      field.push(row);
    }

    readbackBuffer.unmap();
    uniformBuffer.destroy();
    storageBuffer.destroy();
    readbackBuffer.destroy();

    return field;
  }

  return {
    init,
    computeVelocityFieldGPU,
    get isSupported() { return isSupported; },
    get isInitialized() { return isInitialized; },
    GRID_NX,
    GRID_NY
  };
})();
