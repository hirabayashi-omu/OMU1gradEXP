/**
 * PID Controller with Component Decomposition, Anti-Windup, and Derivative Filtering
 * 制御工学：PID制御器（P/I/D成分分離、積分ワインドアップ対策、微分直接入力対応、飽和制限）
 */

(function() {
  class PIDController {
    constructor(config = {}) {
      this.kp = config.kp ?? 100.0;
      this.ki = config.ki ?? 2.0;
      this.kd = config.kd ?? 20.0;

      // 飽和制限
      this.outputMin = config.outputMin ?? -120.0;
      this.outputMax = config.outputMax ?? 120.0;

      // アンチワインドアップ
      this.enableAntiWindup = config.enableAntiWindup ?? true;
      this.integralLimit = config.integralLimit ?? 40.0;

      // 内部状態
      this.integral = 0.0;
      this.prevError = 0.0;
      this.prevDerivative = 0.0;

      // 最新の分解成分
      this.pTerm = 0.0;
      this.iTerm = 0.0;
      this.dTerm = 0.0;
      this.rawOutput = 0.0;
      this.saturatedOutput = 0.0;
      this.isSaturated = false;
    }

    setGains(kp, ki, kd) {
      this.kp = Math.max(0, kp);
      this.ki = Math.max(0, ki);
      this.kd = Math.max(0, kd);
    }

    setSaturationLimits(min, max) {
      this.outputMin = min;
      this.outputMax = max;
    }

    reset() {
      this.integral = 0.0;
      this.prevError = 0.0;
      this.prevDerivative = 0.0;
      this.pTerm = 0.0;
      this.iTerm = 0.0;
      this.dTerm = 0.0;
      this.rawOutput = 0.0;
      this.saturatedOutput = 0.0;
      this.isSaturated = false;
    }

    /**
     * PID更新計算
     * @param {number} setpoint 目標値 r(t)
     * @param {number} measurement 現在値 y(t)
     * @param {number} dt 刻み時間 [s]
     * @param {number|null} directVelocity 現在の微分値（角速度等があれば直接利用でノイズゼロ化）
     * @returns {number} 制御操作量 u(t)
     */
    update(setpoint, measurement, dt, directVelocity = null) {
      if (dt <= 0.0001) return this.saturatedOutput;

      const error = setpoint - measurement;

      // 1. 比例項 (P)
      this.pTerm = this.kp * error;

      // 2. 積分項 (I with Anti-Windup)
      if (this.enableAntiWindup && this.isSaturated) {
        if ((error > 0 && this.saturatedOutput >= this.outputMax) ||
            (error < 0 && this.saturatedOutput <= this.outputMin)) {
          // クランピング
        } else {
          this.integral += error * dt;
        }
      } else {
        this.integral += error * dt;
      }

      if (this.integralLimit > 0) {
        this.integral = Math.max(-this.integralLimit, Math.min(this.integralLimit, this.integral));
      }
      this.iTerm = this.ki * this.integral;

      // 3. 微分項 (D)
      if (directVelocity !== null) {
        // 角速度・速度が既知の場合は微分キック・差分ノイズのない理想微分
        this.dTerm = -this.kd * directVelocity;
      } else {
        const rawD = (error - this.prevError) / dt;
        const alpha = (20.0 * dt) / (1.0 + 20.0 * dt);
        this.prevDerivative += alpha * (rawD - this.prevDerivative);
        this.dTerm = this.kd * this.prevDerivative;
      }

      // 4. 合成と飽和
      this.rawOutput = this.pTerm + this.iTerm + this.dTerm;

      if (this.rawOutput > this.outputMax) {
        this.saturatedOutput = this.outputMax;
        this.isSaturated = true;
      } else if (this.rawOutput < this.outputMin) {
        this.saturatedOutput = this.outputMin;
        this.isSaturated = true;
      } else {
        this.saturatedOutput = this.rawOutput;
        this.isSaturated = false;
      }

      this.prevError = error;
      return this.saturatedOutput;
    }
  }

  window.PIDController = PIDController;
})();
