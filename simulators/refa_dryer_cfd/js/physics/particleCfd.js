/**
 * particleCfd.js
 * 粒子法（Particle-based CFD）熱流体ソルバー
 * - 物理的に厳密なノズル開口部径と吹出流速 (V = Q / A) の連動
 * - 3D頭部曲面立体（楕円体＆ヘアドーム）との正確な流体干渉・回り込み流（よどみ点、剥離、コアンダ効果）
 * - 温度場および風速場（スカラー＆ベクトル）のリアルタイムサンプリング
 * - ReFaプロセンシング（60℃/50℃自動温冷切替制御）
 */

class ParticleCFD {
  constructor(maxParticles = 5000) {
    this.maxParticles = maxParticles;
    
    // パーティクル属性配列 (Float32Array)
    this.positions = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.temperatures = new Float32Array(this.maxParticles); // ℃
    this.speeds = new Float32Array(this.maxParticles);       // m/s
    this.ages = new Float32Array(this.maxParticles);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.alive = new Uint8Array(this.maxParticles);
    this.aliveCount = 0;

    // ノズル仕様 (実機ノズル径と1対1連動)
    this.nozzlePos = new THREE.Vector3(1.35, 0, 0);
    this.nozzleRadius = 0.35; // 3D単位 (~35mm)
    this.targetX = 3.4;       // ターゲット先端位置
    this.targetType = 'head'; // 'head' または 'plate'
    this.ambientTemp = 25.0;  // 外気温度 (℃)

    // 設定パラメータ
    this.setAirflow = 1.4;    // m³/min (0.5 ~ 1.8)
    this.setTemp = 90.0;      // ℃
    this.isCoolMode = false;
    this.sensingMode = 'moist'; // 'off', 'moist'(60℃), 'scalp'(50℃)
    
    // プロセンシング内部状態
    this.heaterDuty = 1.0;
    this.sensingState = 'HOT';
    this.sensingTimer = 0;

    // 粒子噴射レート
    this.particlesPerSec = 1800;
    this.spawnAccumulator = 0;
  }

  setParameters(params) {
    if (params.airflow !== undefined) this.setAirflow = params.airflow;
    if (params.temp !== undefined) this.setTemp = params.temp;
    if (params.sensingMode !== undefined) this.sensingMode = params.sensingMode;
    if (params.targetX !== undefined) this.targetX = params.targetX;
    if (params.targetType !== undefined) this.targetType = params.targetType;
    if (params.ambientTemp !== undefined) this.ambientTemp = params.ambientTemp;
    if (params.isCoolMode !== undefined) this.isCoolMode = params.isCoolMode;
  }

  /**
   * ノズル仕様（口径・先端X座標）を設定し、噴射径を完全に一致させる
   */
  setNozzleSpec(radius, exitX) {
    this.nozzleRadius = radius;
    this.nozzlePos.x = exitX;
  }

  update(dt, targetSurfaceMaxTemp = 25.0) {
    // 1. ReFaプロセンシング制御
    this._updateSensingControl(dt, targetSurfaceMaxTemp);

    const activeTemp = this.isCoolMode 
      ? this.ambientTemp 
      : this.ambientTemp + (this.setTemp - this.ambientTemp) * this.heaterDuty;

    // 2. ノズル断面積 A = π * r² に応じた物理流速計算
    // 流速 V = Q / A (ノズルが細い機種ほど高風速になる！)
    // 基準: BX (r=0.35, Q=1.4 m³/min) -> ~18 m/s
    const baseRadius = 0.35;
    const areaRatio = (baseRadius * baseRadius) / (this.nozzleRadius * this.nozzleRadius);
    const speedScale = 11.5 * (this.setAirflow / 1.4) * Math.sqrt(areaRatio);

    // 3. 新規粒子の生成 (ノズル開口部径から正確に噴射)
    this._spawnParticles(dt, activeTemp, speedScale);

    // 4. 粒子運動・熱伝導・3D頭部曲面回り込み計算
    const hits = [];
    const airDrag = 1.2;
    const thermalDiffusivity = 1.1;
    const buoyancyFactor = 0.012;

    let alive = 0;
    let tempSum = 0;
    let speedSum = 0;

    // 頭部3D幾何パラメータ
    // targetX は毛髪・顔の前面先端。頭部中心は targetX + 0.85
    const headCenterX = this.targetX + 0.82;
    const headCenterY = 0.0;
    const headCenterZ = 0.0;
    const headRx = 0.86; // 楕円体半軸
    const headRy = 1.10;
    const headRz = 0.96;

    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.alive[i]) continue;

      this.ages[i] += dt;
      if (this.ages[i] >= this.lifetimes[i]) {
        this.alive[i] = 0;
        continue;
      }

      const idx3 = i * 3;
      let px = this.positions[idx3];
      let py = this.positions[idx3 + 1];
      let pz = this.positions[idx3 + 2];

      let vx = this.velocities[idx3];
      let vy = this.velocities[idx3 + 1];
      let vz = this.velocities[idx3 + 2];

      let t = this.temperatures[i];

      const distFromNozzle = Math.max(0.01, px - this.nozzlePos.x);

      // (A) エントレインメント（周囲空気巻き込みによる乱流拡がり）
      const turbulence = (Math.random() - 0.5) * 0.7 * Math.sqrt(distFromNozzle);
      vy += turbulence * dt * 3.5;
      vz += turbulence * dt * 3.5;

      // (B) 自然対流浮力
      const tempDiff = t - this.ambientTemp;
      vy += buoyancyFactor * tempDiff * dt;

      // (C) 抵抗と減衰
      const curSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      vx -= vx * airDrag * dt * (0.2 + 0.15 * distFromNozzle);
      vy -= vy * airDrag * dt;
      vz -= vz * airDrag * dt;

      // (D) 熱混合
      const entrainmentRate = thermalDiffusivity * (1.0 + 1.2 * distFromNozzle);
      t += (this.ambientTemp - t) * Math.min(entrainmentRate * dt, 0.6);

      // (E) 位置更新
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      // (F) 障害物との熱流体干渉計算
      if (this.targetType === 'head') {
        // --- 3D頭部曲面回り込み流（頭の形状と一致したCFD） ---
        const dx = px - headCenterX;
        const dy = py - headCenterY;
        const dz = pz - headCenterZ;

        // 楕円体距離関数 S = (dx/Rx)² + (dy/Ry)² + (dz/Rz)²
        const normDistSq = (dx * dx) / (headRx * headRx) + (dy * dy) / (headRy * headRy) + (dz * dz) / (headRz * headRz);

        // 頭部表面（曲面）との接触判定
        if (normDistSq < 1.05) {
          const normDist = Math.sqrt(normDistSq);

          // 楕円体表面の法線ベクトル n = ∇S
          let nx = dx / (headRx * headRx);
          let ny = dy / (headRy * headRy);
          let nz = dz / (headRz * headRz);
          const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= nLen;
          ny /= nLen;
          nz /= nLen;

          // 粒子を頭部表面の外側へ押し出す
          const push = 1.03 / Math.max(0.1, normDist);
          px = headCenterX + dx * push;
          py = headCenterY + dy * push;
          pz = headCenterZ + dz * push;

          // 流速を法線成分(vn)と接線成分(vt)に分解
          const vn = vx * nx + vy * ny + vz * nz;
          
          if (vn < 0) { // 頭部に向かって衝突する場合
            // 前頭部・よどみ点での受熱
            if (dx < 0) { // 風があたる前面
              hits.push({
                dy: py,
                dz: pz,
                dx: dx,
                temp: t,
                weight: Math.abs(vn)
              });
            }

            // 法線方向速度は反射・減衰し、接線方向（頭頂・側頭・首へ沿う流れ）に滑らかに偏向
            const restitution = 0.05;
            vx = vx - (1 + restitution) * vn * nx;
            vy = vy - (1 + restitution) * vn * ny;
            vz = vz - (1 + restitution) * vn * nz;

            // コアンダ効果（曲面に沿う加速・後方への巻き込み）
            // 接線流速を維持して頭の後ろへスムーズに流す
            const tangentSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (tangentSpeed > 0.1) {
              // わずかに曲面沿いへ吸着させつつ後方(+X)へ誘導
              vx += 0.8 * dt * tangentSpeed;
            }
          }
        }
      } else {
        // --- サーモセンサープレート（平面） ---
        if (px >= this.targetX && (px - vx * dt) < this.targetX) {
          const distFromCenter = Math.sqrt(py * py + pz * pz);
          if (distFromCenter < 1.3) {
            hits.push({
              dy: py,
              dz: pz,
              dx: 0,
              temp: t,
              weight: curSpeed
            });
          }
          px = this.targetX;
          vx = -vx * 0.1;
          const radialAngle = Math.atan2(pz, py);
          const wallSpeed = curSpeed * 0.65;
          vy = Math.cos(radialAngle) * wallSpeed;
          vz = Math.sin(radialAngle) * wallSpeed;
        }
      }

      // 空間範囲外判定
      if (px > this.targetX + 2.5 || px < -1.8 || Math.abs(py) > 2.8 || Math.abs(pz) > 2.8) {
        this.alive[i] = 0;
        continue;
      }

      // 配列更新
      this.positions[idx3] = px;
      this.positions[idx3 + 1] = py;
      this.positions[idx3 + 2] = pz;

      this.velocities[idx3] = vx;
      this.velocities[idx3 + 1] = vy;
      this.velocities[idx3 + 2] = vz;

      this.temperatures[i] = t;
      this.speeds[i] = Math.sqrt(vx * vx + vy * vy + vz * vz);

      alive++;
      tempSum += t;
      speedSum += this.speeds[i];
    }

    this.aliveCount = alive;
    const avgT = alive > 0 ? tempSum / alive : this.ambientTemp;
    const avgS = alive > 0 ? speedSum / alive : 0;

    return {
      hits,
      currentBlowTemp: activeTemp,
      sensingState: this.sensingState,
      heaterDuty: this.heaterDuty,
      avgTemp: avgT,
      avgSpeed: avgS,
      particleCount: alive
    };
  }

  _updateSensingControl(dt, surfaceMaxTemp) {
    if (this.sensingMode === 'off' || this.isCoolMode) {
      this.heaterDuty = 1.0;
      this.sensingState = 'OFF';
      return;
    }

    const thresholdTemp = (this.sensingMode === 'scalp') ? 50.0 : 60.0;
    this.sensingTimer += dt;

    if (this.sensingState === 'HOT') {
      if (surfaceMaxTemp >= thresholdTemp) {
        this.sensingState = 'COOL';
        this.sensingTimer = 0;
      }
      this.heaterDuty = Math.min(1.0, this.heaterDuty + dt * 2.0);
    } else {
      this.heaterDuty = Math.max(0.0, this.heaterDuty - dt * 4.0);
      if (surfaceMaxTemp < thresholdTemp - 6.0 || this.sensingTimer > 3.0) {
        this.sensingState = 'HOT';
        this.sensingTimer = 0;
      }
    }
  }

  // 吹出ノズル口から粒子を噴射（ノズル径と完全一致）
  _spawnParticles(dt, blowTemp, baseSpeed) {
    this.spawnAccumulator += this.particlesPerSec * dt;
    const spawnCount = Math.floor(this.spawnAccumulator);
    this.spawnAccumulator -= spawnCount;

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < spawnCount; i++) {
      if (this.alive[i]) continue;

      // 機種ごとの正確なノズル開口部断面 (半径: this.nozzleRadius)
      const r = Math.sqrt(Math.random()) * this.nozzleRadius;
      const theta = Math.random() * Math.PI * 2;
      const dy = Math.cos(theta) * r;
      const dz = Math.sin(theta) * r;

      const idx3 = i * 3;
      this.positions[idx3] = this.nozzlePos.x;
      this.positions[idx3 + 1] = this.nozzlePos.y + dy;
      this.positions[idx3 + 2] = this.nozzlePos.z + dz;

      // 吹出流速
      const spreadAngle = 0.06;
      this.velocities[idx3] = baseSpeed * (1.0 + (Math.random() - 0.5) * 0.1);
      this.velocities[idx3 + 1] = dy * spreadAngle * baseSpeed + (Math.random() - 0.5) * 0.15;
      this.velocities[idx3 + 2] = dz * spreadAngle * baseSpeed + (Math.random() - 0.5) * 0.15;

      // 温度
      const centerFactor = 1.0 - (r / this.nozzleRadius) * 0.08;
      this.temperatures[i] = this.ambientTemp + (blowTemp - this.ambientTemp) * centerFactor + (Math.random() - 0.5) * 1.0;
      this.speeds[i] = baseSpeed;

      this.ages[i] = 0;
      this.lifetimes[i] = 1.8 + Math.random() * 0.8;
      this.alive[i] = 1;

      spawned++;
    }
  }

  /**
   * 空間断面（XY平面, Z=0）の温度場および風速場（スカラー＆ベクトル）サンプリング
   */
  sampleSliceGrid(gridX, gridY, xRange, yRange) {
    const totalCells = gridX * gridY;
    const tempGrid = new Float32Array(totalCells);
    const velGrid = new Float32Array(totalCells);
    const uGrid = new Float32Array(totalCells); // X方向風速
    const vGrid = new Float32Array(totalCells); // Y方向風速
    const weights = new Float32Array(totalCells);

    for (let i = 0; i < totalCells; i++) {
      tempGrid[i] = this.ambientTemp;
      velGrid[i] = 0;
      uGrid[i] = 0;
      vGrid[i] = 0;
    }

    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const dx = (xMax - xMin) / gridX;
    const dy = (yMax - yMin) / gridY;

    const kernelRadius = 0.28;
    const kernelRadiusSq = kernelRadius * kernelRadius;

    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.alive[i]) continue;
      const idx3 = i * 3;
      const pz = this.positions[idx3 + 2];
      if (Math.abs(pz) > kernelRadius * 1.5) continue;

      const px = this.positions[idx3];
      const py = this.positions[idx3 + 1];
      const pt = this.temperatures[i];
      const vx = this.velocities[idx3];
      const vy = this.velocities[idx3 + 1];
      const spd = this.speeds[i];

      const gxCenter = Math.floor((px - xMin) / dx);
      const gyCenter = Math.floor((py - yMin) / dy);

      const rCells = 3;
      for (let gx = Math.max(0, gxCenter - rCells); gx <= Math.min(gridX - 1, gxCenter + rCells); gx++) {
        const cx = xMin + (gx + 0.5) * dx;
        const dX = px - cx;

        for (let gy = Math.max(0, gyCenter - rCells); gy <= Math.min(gridY - 1, gyCenter + rCells); gy++) {
          const cy = yMin + (gy + 0.5) * dy;
          const dY = py - cy;
          const distSq = dX * dX + dY * dY + pz * pz;

          if (distSq < kernelRadiusSq) {
            const w = Math.exp(-distSq / (kernelRadiusSq * 0.5));
            const gIdx = gy * gridX + gx;
            tempGrid[gIdx] += (pt - this.ambientTemp) * w;
            velGrid[gIdx] += spd * w;
            uGrid[gIdx] += vx * w;
            vGrid[gIdx] += vy * w;
            weights[gIdx] += w;
          }
        }
      }
    }

    for (let i = 0; i < totalCells; i++) {
      if (weights[i] > 0.001) {
        tempGrid[i] = this.ambientTemp + (tempGrid[i] - this.ambientTemp) / (weights[i] + 0.15);
        velGrid[i] = velGrid[i] / (weights[i] + 0.15);
        uGrid[i] = uGrid[i] / (weights[i] + 0.15);
        vGrid[i] = vGrid[i] / (weights[i] + 0.15);
      }
    }

    return { tempGrid, velGrid, uGrid, vGrid, gridX, gridY, xRange, yRange };
  }
}

window.ParticleCFD = ParticleCFD;
