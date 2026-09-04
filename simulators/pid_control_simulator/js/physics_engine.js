/**
 * Physics Engine for Process Control & Mechatronics Simulator
 * プロセス制御＆メカトロニクス物理エンジン
 * 1. ⚗️ 連続槽型反応器・加熱撹拌槽 (CSTR / 一次遅れ＋むだ時間系・熱収支)
 * 2. 🚰 バッファタンク液位制御 (流体プロセス・非線形流出系)
 * 3. 🛴 倒立振子台車 (メカトロニクス・非線形連立運動方程式・RK4)
 * 4. 🚁 クアッドコプター・ドローン (航空力学・高度＆姿勢ロール角)
 */

(function() {
  class PhysicsEngine {
    constructor() {
      this.mode = 'cstr'; // 'cstr' | 'tank' | 'pendulum' | 'drone'
      this.g = 9.81; // 重力加速度 [m/s^2]

      // ==========================================
      // 1. CSTR / 加熱撹拌槽 (Continuous Stirred Tank)
      // ==========================================
      this.cstr = {
        T: 25.0,            // 反応液温度 [℃]
        T_feed: 20.0,       // 原料供給温度 [℃]
        T_amb: 20.0,        // 周囲温度 [℃]
        V: 100.0,           // タンク容量 [L]
        Fin: 2.0,           // 供給流量 [L/s] (適正滞留時間)
        Cth: 15.0,          // 等価熱容量 [kJ/℃]
        UA: 0.35,           // 放熱係数 [kW/℃]
        heaterMax: 90.0,    // 最大ヒーター出力 [kW] (定常負荷の約3倍)
        heaterPower: 0.0,   // 現在のヒーター出力 [kW]
        deadTime: 0.45,     // 輸送・熱拡散むだ時間 [s]
        inputBuffer: [],    // むだ時間用キュー [{t, u}]
        impellerAngle: 0.0, // 撹拌翼回転角 [rad]
        distTemp: 0.0,      // 原料温度外乱 [℃]
        distDuration: 0.0   // 外乱残り時間 [s]
      };

      // ==========================================
      // 2. バッファタンク液位 (Liquid Level Tank)
      // ==========================================
      this.tank = {
        h: 0.6,             // 液面高さ [m] (最大 3.0m)
        maxH: 3.0,          // タンク最大高さ [m]
        A: 1.0,             // タンク断面積 [m^2]
        QinMax: 0.12,       // 最大流入流量 [m^3/s]
        Qin: 0.0,           // 現在の流入量 [m^3/s]
        Qout: 0.0,          // 流出量 [m^3/s]
        Cv: 0.008,          // 出口バルブ流出係数 (定常開度 ~40%)
        distOutflow: 0.0,   // 下流消費外乱 [m^3/s]
        distDuration: 0.0,  // 外乱残り時間 [s]
        valveInOpen: 0.0,   // 流入バルブ開度 [0-1]
        valveOutOpen: 1.0   // 流出バルブ開度 [0-1]
      };

      // ==========================================
      // 3. 倒立振子 (Inverted Pendulum on Cart)
      // ==========================================
      this.cart = {
        M: 1.0,          // カート質量 [kg]
        m: 0.2,          // 振子質量 [kg]
        L: 0.5,          // 振子重心長 [m] (全長 1.0m)
        bc: 0.2,         // カート摩擦係数 [N*s/m]
        bp: 0.01,        // 振子回転粘性摩擦 [N*m*s/rad]
        x: 0.0,          // カート位置 [m]
        vx: 0.0,         // カート速度 [m/s]
        ax: 0.0,         // カート加速度 [m/s^2]
        theta: 0.12,     // 振子角度 [rad] (0 = 鉛直真上, ~6.9度)
        omega: 0.0,      // 振子角速度 [rad/s]
        alpha: 0.0,      // 振子角加速度 [rad/s^2]
        railLimit: 2.2,  // レール端 [m]
        extForce: 0.0,   // 外部外乱力 [N]
        isDragging: false
      };

      // ==========================================
      // 4. クアッドコプター・ドローン (Quadcopter)
      // ==========================================
      this.drone = {
        m: 1.0,          // ドローン総質量 [kg]
        armLength: 0.25, // アーム長 d [m] (プロペラ間 0.5m)
        Ixx: 0.015,      // ロール慣性モーメント [kg*m^2]
        bAir: 0.2,       // 空気抵抗係数 [N*s/m]
        bRot: 0.08,      // 回転減衰係数 [N*m*s/rad]
        y: 0.0,          // 水平位置 [m]
        vy: 0.0,         // 水平速度 [m/s]
        z: 1.5,          // 高度 [m]
        vz: 0.0,         // 上昇速度 [m/s]
        phi: 0.05,       // ロール姿勢角 [rad]
        omega: 0.0,      // ロール角速度 [rad/s]
        thrustL: 4.905,  // 左ローター推力 [N]
        thrustR: 4.905,  // 右ローター推力 [N]
        windForce: 0.0,  // 突風外乱 [N]
        windDuration: 0, // 突風残り時間 [s]
        isDragging: false
      };
    }

    setMode(mode) {
      this.mode = mode;
      this.reset();
    }

    reset() {
      if (this.mode === 'cstr') {
        this.cstr.T = 25.0;
        this.cstr.heaterPower = 0.0;
        this.cstr.inputBuffer = [];
        this.cstr.distTemp = 0.0;
        this.cstr.distDuration = 0.0;
      } else if (this.mode === 'tank') {
        this.tank.h = 0.6;
        this.tank.Qin = 0.0;
        this.tank.Qout = 0.0;
        this.tank.distOutflow = 0.0;
        this.tank.distDuration = 0.0;
        this.tank.valveInOpen = 0.0;
      } else if (this.mode === 'pendulum') {
        this.cart.x = 0.0;
        this.cart.vx = 0.0;
        this.cart.ax = 0.0;
        this.cart.theta = 0.12; // 6.9度
        this.cart.omega = 0.0;
        this.cart.alpha = 0.0;
        this.cart.extForce = 0.0;
      } else if (this.mode === 'drone') {
        this.drone.y = 0.0;
        this.drone.vy = 0.0;
        this.drone.z = 1.0;
        this.drone.vz = 0.0;
        this.drone.phi = 0.05;
        this.drone.omega = 0.0;
        this.drone.windForce = 0.0;
        this.drone.windDuration = 0;
        this.drone.thrustL = (this.drone.m * this.g) / 2.0;
        this.drone.thrustR = (this.drone.m * this.g) / 2.0;
      }
    }

    // ==========================================
    // 1. CSTR 加熱反応器 温度ステップ
    // ==========================================
    stepCstr(heaterCmd, simTime, dt) {
      // 制御入力 u (0% - 100%) -> ヒーター最大出力換算
      const clampedU = Math.max(0, Math.min(100, heaterCmd));
      const targetPower = (clampedU / 100.0) * this.cstr.heaterMax;

      // むだ時間バッファ更新
      this.cstr.inputBuffer.push({ time: simTime, power: targetPower });
      while (this.cstr.inputBuffer.length > 0 && simTime - this.cstr.inputBuffer[0].time > this.cstr.deadTime) {
        this.cstr.heaterPower = this.cstr.inputBuffer.shift().power;
      }

      // 外乱減衰
      if (this.cstr.distDuration > 0) {
        this.cstr.distDuration -= dt;
        if (this.cstr.distDuration <= 0) this.cstr.distTemp = 0.0;
      }

      // 撹拌翼回転
      this.cstr.impellerAngle += 15.0 * dt;

      // 熱収支微分方程式:
      // dT/dt = (Fin/V)*(T_feed_eff - T) + Q_heat/Cth - UA*(T - T_amb)/Cth
      const T_feed_eff = this.cstr.T_feed + this.cstr.distTemp;
      const inflowTerm = (this.cstr.Fin / this.cstr.V) * (T_feed_eff - this.cstr.T);
      const heaterTerm = this.cstr.heaterPower / this.cstr.Cth;
      const lossTerm = (this.cstr.UA * (this.cstr.T - this.cstr.T_amb)) / this.cstr.Cth;

      const dT_dt = inflowTerm + heaterTerm - lossTerm;
      this.cstr.T += dT_dt * dt;

      // 物理的限界
      this.cstr.T = Math.max(0.0, Math.min(150.0, this.cstr.T));
    }

    // ==========================================
    // 2. バッファタンク液位 ステップ
    // ==========================================
    stepTank(valveCmd, dt) {
      const clampedValve = Math.max(0, Math.min(100, valveCmd)) / 100.0;
      this.tank.valveInOpen = clampedValve;
      this.tank.Qin = clampedValve * this.tank.QinMax;

      if (this.tank.distDuration > 0) {
        this.tank.distDuration -= dt;
        if (this.tank.distDuration <= 0) this.tank.distOutflow = 0.0;
      }

      // トリチェリの定理流出: Qout = Cv * sqrt(2*g*h) + 外乱
      const effectiveH = Math.max(0.0, this.tank.h);
      this.tank.Qout = this.tank.Cv * Math.sqrt(2 * this.g * effectiveH) + this.tank.distOutflow;

      // 質量収支: dh/dt = (Qin - Qout) / A
      const dh_dt = (this.tank.Qin - this.tank.Qout) / this.tank.A;
      this.tank.h += dh_dt * dt;

      // 液面制限
      if (this.tank.h < 0.0) this.tank.h = 0.0;
      if (this.tank.h > this.tank.maxH) this.tank.h = this.tank.maxH;
    }

    // ==========================================
    // 3. 倒立振子 力学計算 (高精度 10サブステップ RK4)
    // ==========================================
    stepPendulum(motorForce, dt) {
      const substeps = 10;
      const subDt = dt / substeps;

      for (let s = 0; s < substeps; s++) {
        if (this.cart.isDragging) continue;

        const state = [this.cart.x, this.cart.vx, this.cart.theta, this.cart.omega];
        const k1 = this.calcPendulumDerivatives(state, motorForce);
        
        const s2 = state.map((val, i) => val + 0.5 * subDt * k1[i]);
        const k2 = this.calcPendulumDerivatives(s2, motorForce);

        const s3 = state.map((val, i) => val + 0.5 * subDt * k2[i]);
        const k3 = this.calcPendulumDerivatives(s3, motorForce);

        const s4 = state.map((val, i) => val + subDt * k3[i]);
        const k4 = this.calcPendulumDerivatives(s4, motorForce);

        this.cart.x += (subDt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        this.cart.vx += (subDt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        this.cart.theta += (subDt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        this.cart.omega += (subDt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

        if (Math.abs(this.cart.x) > this.cart.railLimit) {
          this.cart.x = Math.sign(this.cart.x) * this.cart.railLimit;
          this.cart.vx = -this.cart.vx * 0.2;
        }

        while (this.cart.theta > Math.PI) this.cart.theta -= 2 * Math.PI;
        while (this.cart.theta < -Math.PI) this.cart.theta += 2 * Math.PI;
      }

      this.cart.extForce *= 0.95;
      if (Math.abs(this.cart.extForce) < 0.01) this.cart.extForce = 0;
    }

    calcPendulumDerivatives(state, motorForce) {
      const [x, vx, theta, omega] = state;
      const { M, m, L, bc, bp, extForce } = this.cart;
      const g = this.g;

      const I = (1.0 / 3.0) * m * L * L;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const F_total = motorForce + extForce;
      const A11 = M + m;
      const A12 = m * L * cosT;
      const A21 = m * L * cosT;
      const A22 = I + m * L * L;

      const B1 = F_total + m * L * omega * omega * sinT - bc * vx;
      const B2 = m * g * L * sinT - bp * omega;

      const det = A11 * A22 - A12 * A21;
      let ax = 0;
      let alpha = 0;

      if (Math.abs(det) > 1e-6) {
        ax = (B1 * A22 - A12 * B2) / det;
        alpha = (A11 * B2 - A21 * B1) / det;
      }

      this.cart.ax = ax;
      this.cart.alpha = alpha;

      return [vx, ax, omega, alpha];
    }

    // ==========================================
    // 4. ドローン・クアッドコプター 力学計算
    // ==========================================
    stepDrone(thrustL, thrustR, dt) {
      this.drone.thrustL = Math.max(0, Math.min(15.0, thrustL));
      this.drone.thrustR = Math.max(0, Math.min(15.0, thrustR));

      if (this.drone.windDuration > 0) {
        this.drone.windDuration -= dt;
        if (this.drone.windDuration <= 0) this.drone.windForce = 0;
      }

      if (this.drone.isDragging) return;

      const substeps = 10;
      const subDt = dt / substeps;

      for (let s = 0; s < substeps; s++) {
        const state = [this.drone.y, this.drone.vy, this.drone.z, this.drone.vz, this.drone.phi, this.drone.omega];
        const k1 = this.calcDroneDerivatives(state);

        const s2 = state.map((val, i) => val + 0.5 * subDt * k1[i]);
        const k2 = this.calcDroneDerivatives(s2);

        const s3 = state.map((val, i) => val + 0.5 * subDt * k2[i]);
        const k3 = this.calcDroneDerivatives(s3);

        const s4 = state.map((val, i) => val + subDt * k3[i]);
        const k4 = this.calcDroneDerivatives(s4);

        this.drone.y += (subDt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        this.drone.vy += (subDt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        this.drone.z += (subDt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        this.drone.vz += (subDt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
        this.drone.phi += (subDt / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]);
        this.drone.omega += (subDt / 6) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5]);

        if (this.drone.z < 0.15) {
          this.drone.z = 0.15;
          this.drone.vz = -this.drone.vz * 0.2;
          this.drone.vy *= 0.5;
          if (Math.abs(this.drone.vz) < 0.05) this.drone.vz = 0;
        }

        if (Math.abs(this.drone.y) > 2.8) {
          this.drone.y = Math.sign(this.drone.y) * 2.8;
          this.drone.vy = -this.drone.vy * 0.3;
        }

        while (this.drone.phi > Math.PI) this.drone.phi -= 2 * Math.PI;
        while (this.drone.phi < -Math.PI) this.drone.phi += 2 * Math.PI;
      }
    }

    calcDroneDerivatives(state) {
      const [y, vy, z, vz, phi, omega] = state;
      const { m, armLength, Ixx, bAir, bRot, thrustL, thrustR, windForce } = this.drone;
      const g = this.g;

      const totalThrust = thrustL + thrustR;
      const rollTorque = (thrustL - thrustR) * armLength;

      const ay = (-totalThrust * Math.sin(phi) - bAir * vy + windForce) / m;
      const az = (totalThrust * Math.cos(phi) - m * g - bAir * vz) / m;
      const alpha = (rollTorque - bRot * omega) / Ixx;

      return [vy, ay, vz, az, omega, alpha];
    }

    applyImpulse(force) {
      if (this.mode === 'cstr') {
        this.cstr.distTemp = -15.0; // 原料温度が -15℃急冷
        this.cstr.distDuration = 3.5;
      } else if (this.mode === 'tank') {
        this.tank.distOutflow = 0.06; // 下流バルブが急開して流出急増
        this.tank.distDuration = 3.0;
      } else if (this.mode === 'pendulum') {
        this.cart.extForce += force;
        this.cart.omega += (force / (this.cart.m * this.cart.L)) * 0.04;
      } else if (this.mode === 'drone') {
        this.drone.windForce += force;
        this.drone.windDuration = 1.0;
        this.drone.omega += (force * 0.05) / this.drone.Ixx;
      }
    }
  }

  window.PhysicsEngine = PhysicsEngine;
})();
