/**
 * PID Controller with Component Decomposition, Anti-Windup, and Derivative Filtering
 * 制御工学：PID制御器（P/I/D成分分離、積分ワインドアップ対策、不完全微分フィルタ、飽和制限）
 */

(function() {
  class PIDController {
    constructor(config = {}) {
      this.kp = config.kp ?? 40.0;
      this.ki = config.ki ?? 2.0;
      this.kd = config.kd ?? 8.0;

      // 飽和制限 (Actuator Saturation)
      this.outputMin = config.outputMin ?? -100.0;
      this.outputMax = config.outputMax ?? 100.0;

      // アンチワインドアップ (Anti-Windup: Clamping / Back-calculation)
      this.enableAntiWindup = config.enableAntiWindup ?? true;
      this.integralLimit = config.integralLimit ?? 50.0;

      // 微分フィルタ係数 (Derivative Low-Pass Filter: N = 10~20)
      this.enableFilter = config.enableFilter ?? true;
      this.filterCoefficient = config.filterCoefficient ?? 15.0;

      // 内部状態
      this.integral = 0.0;
      this.prevError = 0.0;
      this.prevDerivative = 0.0;
      this.prevMeasurement = 0.0;

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
      this.prevMeasurement = 0.0;
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
     * @returns {number} 制御操作量 u(t)
     */
    update(setpoint, measurement, dt) {
      if (dt <= 0.0001) return this.saturatedOutput;

      const error = setpoint - measurement;

      // 1. 比例項 (Proportional Term)
      this.pTerm = this.kp * error;

      // 2. 積分項 (Integral Term with Anti-Windup)
      if (this.enableAntiWindup && this.isSaturated) {
        // 飽和時は誤差と同じ符号の積分の加算をストップ（クランピング）
        if ((error > 0 && this.saturatedOutput >= this.outputMax) ||
            (error < 0 && this.saturatedOutput <= this.outputMin)) {
          // 積分を蓄積しない (Anti-Windup Clamping)
        } else {
          this.integral += error * dt;
        }
      } else {
        this.integral += error * dt;
      }

      // 積分値リミット
      if (this.integralLimit > 0) {
        this.integral = Math.max(-this.integralLimit, Math.min(this.integralLimit, this.integral));
      }
      this.iTerm = this.ki * this.integral;

      // 3. 微分項 (Derivative Term with Low-Pass Filter)
      // 微分先行型 (Measurement derivative to prevent derivative kick)
      const rawD = (error - this.prevError) / dt;
      if (this.enableFilter) {
        // 1次ローパスフィルタ: D_filt = D_prev + (rawD - D_prev) * (N * dt / (1 + N * dt))
        const alpha = (this.filterCoefficient * dt) / (1.0 + this.filterCoefficient * dt);
        this.prevDerivative += alpha * (rawD - this.prevDerivative);
        this.dTerm = this.kd * this.prevDerivative;
      } else {
        this.dTerm = this.kd * rawD;
      }

      // 4. 操作量の合算と飽和判定
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
      this.prevMeasurement = measurement;

      return this.saturatedOutput;
    }
  }

  window.PIDController = PIDController;
})();
