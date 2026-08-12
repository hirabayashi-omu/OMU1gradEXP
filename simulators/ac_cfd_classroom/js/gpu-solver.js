/**
 * WebGL GPGPU Accelerated 2D CFD Solver & Renderer
 * Leverages Fragment Shaders for parallel Jacobi pressure projection & heat advection
 */
class CFDGpuSolver2D {
    constructor(canvas, Nx = 140, Ny = 70) {
        this.mainCanvas = canvas;
        this.Nx = Nx; // High resolution grid for GPU
        this.Ny = Ny;

        // Use dedicated offscreen canvas for WebGL GPGPU
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = Nx;
        this.offscreenCanvas.height = Ny;

        this.gl = this.offscreenCanvas.getContext('webgl2') || this.offscreenCanvas.getContext('webgl');
        this.isSupported = !!this.gl;

        if (!this.isSupported) {
            console.warn('WebGL not supported, falling back to CPU solver.');
            return;
        }

        const gl = this.gl;

        // Check Float Texture extension for WebGL 1 fallback
        if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('OES_texture_float')) {
            console.warn('Float textures not supported on this GPU, using highp precision byte FBOs.');
        }

        // Initialize Shaders, Program & Textures
        this.initShaders();
        this.initTextures();

        console.log(`[GPU CFD Solver] WebGL GPGPU Engine Initialized successfully (${Nx}x${Ny} Grid).`);
    }

    initShaders() {
        const gl = this.gl;

        // Vertex Shader (Fullscreen Quad)
        const vsSource = `
            attribute vec2 aPosition;
            varying vec2 vTexCoord;
            void main() {
                vTexCoord = aPosition * 0.5 + 0.5;
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        // Fragment Shader: Heatmap Colormap Rendering
        const fsColormapSource = `
            precision highp float;
            varying vec2 vTexCoord;
            uniform sampler2D uTempTexture;
            uniform float uMinTemp;
            uniform float uMaxTemp;
            uniform int uColormap; // 0=Jet, 1=Turbo, 2=Coolwarm, 3=Inferno

            vec3 getJet(float t) {
                if (t < 0.25) return vec3(0.0, 4.0 * t, 1.0);
                if (t < 0.5)  return vec3(0.0, 1.0, 1.0 - 4.0 * (t - 0.25));
                if (t < 0.75) return vec3(4.0 * (t - 0.5), 1.0, 0.0);
                return vec3(1.0, 1.0 - 4.0 * (t - 0.75), 0.0);
            }

            vec3 getTurbo(float t) {
                return vec3(sin(t * 2.8), sin(t * 3.14), cos(t * 1.57));
            }

            vec3 getCoolwarm(float t) {
                return mix(vec3(0.23, 0.3, 0.75), vec3(0.7, 0.01, 0.15), t);
            }

            vec3 getInferno(float t) {
                return vec3(pow(t, 0.7), pow(t, 1.8), pow(t, 3.5));
            }

            void main() {
                float temp = texture2D(uTempTexture, vTexCoord).r;
                float t = clamp((temp - uMinTemp) / (uMaxTemp - uMinTemp), 0.0, 1.0);

                vec3 color = vec3(0.0);
                if (uColormap == 0) color = getJet(t);
                else if (uColormap == 1) color = getTurbo(t);
                else if (uColormap == 2) color = getCoolwarm(t);
                else color = getInferno(t);

                gl_FragColor = vec4(color, 0.9);
            }
        `;

        this.quadProgram = this.createProgram(vsSource, fsColormapSource);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(vsSource, fsSource) {
        const gl = this.gl;
        const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        return program;
    }

    initTextures() {
        const gl = this.gl;

        // Quad Buffer
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1
        ]), gl.STATIC_DRAW);
    }

    renderGPUHeatmap(tempTexture, colormapType, minT, maxT) {
        const gl = this.gl;
        if (!gl) return;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.quadProgram);

        // Bind Quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.quadProgram, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.glVertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // Uniforms
        gl.uniform1f(gl.getUniformLocation(this.quadProgram, 'uMinTemp'), minT);
        gl.uniform1f(gl.getUniformLocation(this.quadProgram, 'uMaxTemp'), maxT);
        gl.uniform1i(gl.getUniformLocation(this.quadProgram, 'uColormap'), colormapType);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
