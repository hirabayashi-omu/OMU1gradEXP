/**
 * Physics Engine for Inverted Pendulum on a Cart and Quadcopter Drone
 * 物理エンジン：倒立振子（非線形連立運動方程式・高精度RK4積分）＆ ドローン姿勢・高度力学モデル
 */

(function() {
  class PhysicsEngine {
    constructor() {
      this.mode = 'pendulum'; // 'pendulum' | 'drone'
      this.g = 9.81; // 重力加速度 [m/s^2]

      // ==========================================
      // 1. 倒立振子 (Inverted Pendulum on Cart)
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
      // 2. クアッドコプター・ドローン (Quadcopter)
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
        phi: 0.08,       // ロール姿勢角 [rad]
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
      if (this.mode === 'pendulum') {
        this.cart.x = 0.0;
        this.cart.vx = 0.0;
        this.cart.ax = 0.0;
        this.cart.theta = 0.12; // 6.9度
        this.cart.omega = 0.0;
        this.cart.alpha = 0.0;
        this.cart.extForce = 0.0;
      } else {
        this.drone.y = 0.0;
        this.drone.vy = 0.0;
        this.drone.z = 1.0;
        this.drone.vz = 0.0;
        this.drone.phi = 0.08;
        this.drone.omega = 0.0;
        this.drone.windForce = 0.0;
        this.drone.windDuration = 0;
        this.drone.thrustL = (this.drone.m * this.g) / 2.0;
        this.drone.thrustR = (this.drone.m * this.g) / 2.0;
      }
    }

    // ==========================================
    // 倒立振子 力学計算 (高精度 10サブステップ RK4)
    // ==========================================
    stepPendulum(motorForce, dt) {
      const substeps = 10;
      const subDt = dt / substeps;

      for (let s = 0; s < substeps; s++) {
        if (this.cart.isDragging) continue;

        // 状態: [x, vx, theta, omega]
        const state = [this.cart.x, this.cart.vx, this.cart.theta, this.cart.omega];
        const k1 = this.calcPendulumDerivatives(state, motorForce);
        
        const s2 = state.map((val, i) => val + 0.5 * subDt * k1[i]);
        const k2 = this.calcPendulumDerivatives(s2, motorForce);

        const s3 = state.map((val, i) => val + 0.5 * subDt * k2[i]);
        const k3 = this.calcPendulumDerivatives(s3, motorForce);

        const s4 = state.map((val, i) => val + subDt * k3[i]);
        const k4 = this.calcPendulumDerivatives(s4, motorForce);

        // 更新
        this.cart.x += (subDt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        this.cart.vx += (subDt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        this.cart.theta += (subDt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        this.cart.omega += (subDt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

        // レール端との衝突反発
        if (Math.abs(this.cart.x) > this.cart.railLimit) {
          this.cart.x = Math.sign(this.cart.x) * this.cart.railLimit;
          this.cart.vx = -this.cart.vx * 0.2;
        }

        // 角度正規化
        while (this.cart.theta > Math.PI) this.cart.theta -= 2 * Math.PI;
        while (this.cart.theta < -Math.PI) this.cart.theta += 2 * Math.PI;
      }

      // 外乱減衰
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

      // (M+m)*x_ddot + m*L*cosT*theta_ddot = F_total + m*L*omega^2*sinT - bc*vx
      // m*L*cosT*x_ddot + (I + m*L^2)*theta_ddot = m*g*L*sinT - bp*omega
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
    // ドローン・クアッドコプター 力学計算
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
      const rollTorque = (thrustR - thrustL) * armLength;

      const ay = (-totalThrust * Math.sin(phi) - bAir * vy + windForce) / m;
      const az = (totalThrust * Math.cos(phi) - m * g - bAir * vz) / m;
      const alpha = (rollTorque - bRot * omega) / Ixx;

      return [vy, ay, vz, az, omega, alpha];
    }

    applyImpulse(force) {
      if (this.mode === 'pendulum') {
        this.cart.extForce += force;
        this.cart.omega += (force / (this.cart.m * this.cart.L)) * 0.04;
      } else {
        this.drone.windForce += force;
        this.drone.windDuration = 1.0;
        this.drone.omega += (force * 0.05) / this.drone.Ixx;
      }
    }
  }

  window.PhysicsEngine = PhysicsEngine;
})();
