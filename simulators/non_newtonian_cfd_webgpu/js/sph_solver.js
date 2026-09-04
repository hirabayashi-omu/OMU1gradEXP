/**
 * sph_solver.js - 非ニュートン流体 SPH + PBD (Position-Based Dynamics) ハイブリッドソルバー
 * 
 * 確実な濡れ広がり (Spreading) の実現:
 *   - 粒子間重なり解消 (PBD Overlap Solver): 粒子が縦一列にスタックするのを完全に防ぎ、
 *     上から落ちてきた粒子が下の粒子の丸みに沿って左右へ滑落・扇状に濡れ広がる。
 *   - 静水圧レベリング: 堆積した液体の重力により、左右へ押し広がる自然なスランピング流動。
 *   - レオロジー制御: 降伏応力 tau_y により、クリームはドーム状（ツノ立ち）で平衡、化粧水・乳液は薄くフラットに広がる。
 */

export class SPHNonNewtonianSolver {
  constructor(width = 800, height = 500, maxParticles = 2500) {
    this.width = width;
    this.height = height;
    this.maxParticles = maxParticles;
    this.numParticles = 0;

    // 粒子ジオメトリ
    this.particleRadius = 7.5;   // 粒子半径 [px]
    this.particleDiameter = this.particleRadius * 2.0;
    this.h = this.particleDiameter * 1.5; // 平滑化長
    this.h2 = this.h * this.h;

    this.gravity = 980.0;        // 重力加速度 [px/s^2]

    // レオロジーパラメータ (HBモデル)
    this.tau_y = 55.0;           // 降伏応力 [Pa]
    this.K = 8.5;                // コンシステンシー [Pa·s^n]
    this.n = 0.38;               // 流動特性指数
    this.m_reg = 60.0;
    this.eta_min = 0.05;
    this.eta_max = 300.0;

    // ノズル設定
    this.nozzleX = width * 0.5;
    this.nozzleY = 25;
    this.nozzleRadius = 14;      // ノズル口径
    this.inletVelocity = 70.0;   // 吐出速度 [px/s]
    this.emitRate = 2;           // 射出レート
    this.emitCounter = 0;

    // 受け皿プレート
    this.plateY = height - 45;

    // 粒子配列
    this.x = new Float32Array(maxParticles);
    this.y = new Float32Array(maxParticles);
    this.oldX = new Float32Array(maxParticles);
    this.oldY = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.eta = new Float32Array(maxParticles);
    this.gammaDot = new Float32Array(maxParticles);

    // 空間ハッシュグリッド
    this.cellSize = this.particleDiameter * 1.2;
    this.gridCols = Math.ceil(width / this.cellSize);
    this.gridRows = Math.ceil(height / this.cellSize);
    this.numCells = this.gridCols * this.gridRows;

    this.gridHead = new Int32Array(this.numCells);
    this.gridNext = new Int32Array(maxParticles);

    this.stepCount = 0;
  }

  setRheologyParams(params) {
    this.tau_y = Number(params.tau_y ?? 0.0);
    this.K = Number(params.K ?? 1.0);
    this.n = Number(params.n ?? 1.0);
    this.m_reg = Number(params.m_reg ?? 80.0);
    this.eta_min = Number(params.eta_min ?? 0.05);
    this.eta_max = Number(params.eta_max ?? 300.0);
    this.inletVelocity = Math.max(30.0, (params.inlet_vel ?? 1.0) * 65.0);
  }

  reset() {
    this.numParticles = 0;
    this.stepCount = 0;
    this.emitCounter = 0;
    this.x.fill(0);
    this.y.fill(0);
    this.oldX.fill(0);
    this.oldY.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.eta.fill(1.0);
    this.gammaDot.fill(0);
  }

  emitParticles() {
    for (let k = 0; k < this.emitRate; k++) {
      if (this.numParticles >= this.maxParticles) break;

      const idx = this.numParticles;
      // ノズル口径内でランダム散布
      const offset = (Math.random() - 0.5) * (this.nozzleRadius * 1.6);

      this.x[idx] = this.nozzleX + offset;
      this.y[idx] = this.nozzleY + Math.random() * 4;

      this.oldX[idx] = this.x[idx];
      this.oldY[idx] = this.y[idx];

      // わずかな横方向速度成分を付与
      this.vx[idx] = (Math.random() - 0.5) * 15.0;
      this.vy[idx] = this.inletVelocity + (Math.random() - 0.5) * 8.0;

      this.eta[idx] = this.calcViscosity(8.0);
      this.gammaDot[idx] = 8.0;

      this.numParticles++;
    }
  }

  calcViscosity(gDot) {
    const eps = 1e-4;
    const g = Math.max(eps, Math.abs(gDot));
    let etaY = 0.0;
    if (this.tau_y > 0.0) {
      etaY = (this.tau_y / g) * (1.0 - Math.exp(-this.m_reg * g));
    }
    const etaPow = this.K * Math.pow(g, this.n - 1.0);
    return Math.max(this.eta_min, Math.min(this.eta_max, etaY + etaPow));
  }

  _buildSpatialGrid() {
    this.gridHead.fill(-1);
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;

    for (let i = 0; i < this.numParticles; i++) {
      const gx = Math.floor(this.x[i] / cs);
      const gy = Math.floor(this.y[i] / cs);

      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const cell = gy * cols + gx;
        this.gridNext[i] = this.gridHead[cell];
        this.gridHead[cell] = i;
      } else {
        this.gridNext[i] = -1;
      }
    }
  }

  step(dt = 0.003, subSteps = 3) {
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.emitCounter++;
      if (this.emitCounter % 2 === 0) {
        this.emitParticles();
      }

      if (this.numParticles === 0) continue;

      // 1. 外力適用 (重力) & 予測位置更新 (Verlet Integration)
      for (let i = 0; i < this.numParticles; i++) {
        this.vy[i] += this.gravity * subDt;

        // 前の位置を保存
        this.oldX[i] = this.x[i];
        this.oldY[i] = this.y[i];

        this.x[i] += this.vx[i] * subDt;
        this.y[i] += this.vy[i] * subDt;
      }

      // 2. 空間ハッシュ構築
      this._buildSpatialGrid();

      // 3. 【最重要】粒子間重なり解消 (PBD Constraint Relaxation)
      // 2〜3回反復して完全に非圧縮・接触反発を解く
      this._solveParticleCollisions(3);

      // 4. 境界条件 (受け皿プレートでの濡れ広がり & 反発)
      this._enforceBoundaries();

      // 5. 速度更新 & 非ニュートン粘性摩擦・せん断計算
      this._updateVelocitiesAndViscosity(subDt);

      this.stepCount++;
    }
  }

  /**
   * PBD 粒子間接触・反発ソルバー
   * 粒子同士が重なり合ったら、中心線に沿って左右・上下に等分に押し戻す。
   * これにより、上から降ってきた粒子は下の粒子の肩を転がり落ちて、左右へ扇状に広がる！
   */
  _solveParticleCollisions(iterations = 3) {
    const minDist = this.particleDiameter * 0.96;
    const minDist2 = minDist * minDist;
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < this.numParticles; i++) {
        const xi = this.x[i];
        const yi = this.y[i];

        const gx = Math.floor(xi / cs);
        const gy = Math.floor(yi / cs);

        for (let dy = -1; dy <= 1; dy++) {
          const cy = gy + dy;
          if (cy < 0 || cy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const cx = gx + dx;
            if (cx < 0 || cx >= cols) continue;

            const cell = cy * cols + cx;
            let j = this.gridHead[cell];

            while (j !== -1) {
              if (i < j) { // 各ペアを1度だけ処理
                const rx = this.x[i] - this.x[j];
                const ry = this.y[i] - this.y[j];
                const r2 = rx * rx + ry * ry;

                if (r2 < minDist2 && r2 > 1e-6) {
                  const r = Math.sqrt(r2);
                  const overlap = (minDist - r);
                  const nx = rx / r;
                  const ny = ry / r;

                  // 左右・上下へ均等に押し戻し
                  const push = overlap * 0.5;
                  this.x[i] += nx * push;
                  this.y[i] += ny * push;
                  this.x[j] -= nx * push;
                  this.y[j] -= ny * push;
                }
              }
              j = this.gridNext[j];
            }
          }
        }
      }
    }
  }

  /**
   * 境界条件 (受け皿プレート & ノズル壁面)
   */
  _enforceBoundaries() {
    const margin = 20;
    const plateY = this.plateY - this.particleRadius;
    const nx = this.nozzleX;
    const ny = this.nozzleY;
    const nr = this.nozzleRadius;

    for (let i = 0; i < this.numParticles; i++) {
      // 1. 底面受け皿 (COLLECTING PLATE)
      if (this.y[i] > plateY) {
        this.y[i] = plateY;

        // 着液時の水平濡れ広がり速度付与
        // 中心より右なら右へ、左なら左へ押し出される
        const dx = this.x[i] - nx;
        const sign = dx >= 0 ? 1.0 : -1.0;

        // 垂直落下の衝撃を水平方向の広がり流速に変換
        const impactVy = Math.max(0, (this.y[i] - this.oldY[i]));
        this.x[i] += sign * impactVy * 0.45;

        // 底面スリップ (降伏応力 tau_y が低い流体ほど遠くまでサラサラ広がる)
        // クリーム (tau_y > 40) は途中で止まり山型を形成、化粧水・乳液はトレイ全体に薄く広がる
        const friction = Math.min(0.85, 0.45 + this.tau_y * 0.003);
        const vx_current = (this.x[i] - this.oldX[i]);
        this.oldX[i] = this.x[i] - vx_current * (1.0 - friction);
      }

      // 2. 左右壁面での制限
      if (this.x[i] < margin) {
        this.x[i] = margin;
      } else if (this.x[i] > this.width - margin) {
        this.x[i] = this.width - margin;
      }

      // 3. 上部ノズル外壁
      if (this.y[i] < ny + 10) {
        const dx = Math.abs(this.x[i] - nx);
        if (dx > nr && this.y[i] < ny) {
          this.y[i] = ny;
        }
      }
    }
  }

  /**
   * 速度更新および非ニュートン粘性摩擦・せん断速度の計算
   */
  _updateVelocitiesAndViscosity(subDt) {
    const invDt = 1.0 / subDt;
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cs = this.cellSize;
    const h = this.h;
    const h2 = this.h2;

    for (let i = 0; i < this.numParticles; i++) {
      // 位置の変化から速度を更新
      this.vx[i] = (this.x[i] - this.oldX[i]) * invDt;
      this.vy[i] = (this.y[i] - this.oldY[i]) * invDt;

      // 局所せん断速度と粘度の算出
      const xi = this.x[i];
      const yi = this.y[i];
      const gx = Math.floor(xi / cs);
      const gy = Math.floor(yi / cs);

      let relSpeedSum = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const cy = gy + dy;
        if (cy < 0 || cy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          if (cx < 0 || cx >= cols) continue;

          const cell = cy * cols + cx;
          let j = this.gridHead[cell];

          while (j !== -1) {
            if (i !== j) {
              const rx = xi - this.x[j];
              const ry = yi - this.y[j];
              const r2 = rx * rx + ry * ry;

              if (r2 < h2) {
                const du = this.vx[i] - this.vx[j];
                const dv = this.vy[i] - this.vy[j];
                relSpeedSum += Math.sqrt(du * du + dv * dv);
                count++;

                // 非ニュートン粘性ダンピング (粘度が高いほど粒子間の相対速度差を減衰させて一体化)
                const eta_mean = (this.eta[i] + this.eta[j]) * 0.5;
                const damp = Math.min(0.2, (eta_mean / this.eta_max) * 0.15);
                this.vx[i] -= du * damp * 0.5;
                this.vy[i] -= dv * damp * 0.5;
                this.vx[j] += du * damp * 0.5;
                this.vy[j] += dv * damp * 0.5;
              }
            }
            j = this.gridNext[j];
          }
        }
      }

      // せん断速度の近似
      const avgRelSpeed = count > 0 ? (relSpeedSum / count) : 0;
      const gammaDot = avgRelSpeed / this.particleDiameter;
      this.gammaDot[i] = gammaDot;
      this.eta[i] = this.calcViscosity(gammaDot);
    }
  }
}
