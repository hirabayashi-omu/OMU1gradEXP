/**
 * Process Control Simulator - Main Application Controller
 * メインコントローラー：化学プロセス (CSTR温度・タンク液位) ＆ メカトロニクス (倒立振子・ドローン)
 * PID制御ループ・UI同期・プリセット・アンチワインドアップ・性能評価
 */

(function() {
  class App {
    constructor() {
      this.physics = new window.PhysicsEngine();
      
      // 主PID制御器 (CSTR温度 / タンク液位 / 倒立振子角度 / ドローン高度)
      this.pid = new window.PIDController({
        kp: 3.8,
        ki: 0.42,
        kd: 1.8,
        outputMin: 0.0,
        outputMax: 100.0,
        enableAntiWindup: true
      });

      // ドローン用 副PID制御器 (姿勢ロール角安定化用)
      this.droneRollPid = new window.PIDController({
        kp: 3.0,
        ki: 0.2,
        kd: 1.2,
        outputMin: -4.0,
        outputMax: 4.0,
        enableAntiWindup: true
      });

      this.visualizer = new window.Visualizer('simCanvas');
      this.chartRenderer = new window.ChartRenderer('canvasResponse', 'canvasPid');

      this.setpoint = 65.0;
      this.simTime = 0.0;
      this.isRunning = true;
      this.lastTime = performance.now();

      this.initElements();
      this.initEvents();
      this.setMode('cstr');
      this.applyPreset('opt_pid');

      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    initElements() {
      this.selectMode = document.getElementById('selectMode');
      
      this.inputKp = document.getElementById('inputKp');
      this.valKp = document.getElementById('valKp');
      this.inputKi = document.getElementById('inputKi');
      this.valKi = document.getElementById('valKi');
      this.inputKd = document.getElementById('inputKd');
      this.valKd = document.getElementById('valKd');

      this.toggleAntiWindup = document.getElementById('toggleAntiWindup');
      this.inputSaturation = document.getElementById('inputSaturation');
      this.valSaturation = document.getElementById('valSaturation');

      this.labelSetpoint = document.getElementById('labelSetpoint');
      this.valSetpoint = document.getElementById('valSetpoint');
      this.inputSetpoint = document.getElementById('inputSetpoint');

      this.btnDisturb = document.getElementById('btnDisturb');
      this.btnReset = document.getElementById('btnReset');
      this.hudInstruction = document.getElementById('hudInstruction');

      // 性能指標
      this.metricSettling = document.getElementById('metricSettling');
      this.metricOvershoot = document.getElementById('metricOvershoot');
      this.metricSteadyError = document.getElementById('metricSteadyError');
      this.metricStatus = document.getElementById('metricStatus');
    }

    initEvents() {
      // プラント切り替え
      this.selectMode.addEventListener('change', (e) => {
        this.setMode(e.target.value);
      });

      // ゲイン調整
      const updateGainsFromUI = () => {
        const kp = parseFloat(this.inputKp.value);
        const ki = parseFloat(this.inputKi.value);
        const kd = parseFloat(this.inputKd.value);
        this.valKp.textContent = kp.toFixed(2);
        this.valKi.textContent = ki.toFixed(2);
        this.valKd.textContent = kd.toFixed(2);
        this.pid.setGains(kp, ki, kd);
      };

      this.inputKp.addEventListener('input', updateGainsFromUI);
      this.inputKi.addEventListener('input', updateGainsFromUI);
      this.inputKd.addEventListener('input', updateGainsFromUI);

      // 目標値
      this.inputSetpoint.addEventListener('input', (e) => {
        this.setpoint = parseFloat(e.target.value);
        if (this.physics.mode === 'cstr') {
          this.valSetpoint.textContent = `${this.setpoint.toFixed(1)} °C`;
        } else if (this.physics.mode === 'tank') {
          this.valSetpoint.textContent = `${this.setpoint.toFixed(2)} m`;
        } else if (this.physics.mode === 'pendulum') {
          this.valSetpoint.textContent = `${(this.setpoint * 180 / Math.PI).toFixed(1)}°`;
        } else {
          this.valSetpoint.textContent = `${this.setpoint.toFixed(2)} m`;
        }
      });

      // 飽和限界
      this.inputSaturation.addEventListener('input', (e) => {
        const sat = parseFloat(e.target.value);
        if (this.physics.mode === 'pendulum') {
          this.valSaturation.textContent = `±${sat} N`;
          this.pid.setOutputLimits(-sat, sat);
        } else if (this.physics.mode === 'drone') {
          this.valSaturation.textContent = `±${sat} N`;
          this.pid.setOutputLimits(-sat, sat);
        } else {
          this.valSaturation.textContent = `${sat} %`;
          this.pid.setOutputLimits(0.0, sat);
        }
      });

      // アンチワインドアップ
      this.toggleAntiWindup.addEventListener('change', (e) => {
        this.pid.enableAntiWindup = e.target.checked;
      });

      // プリセット
      document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          this.applyPreset(btn.dataset.preset);
        });
      });

      // 外乱付加
      this.btnDisturb.addEventListener('click', () => {
        this.physics.applyImpulse(18.0);
      });

      // リセット
      this.btnReset.addEventListener('click', () => {
        this.resetSimulation();
      });

      // マウス操作による外乱ドラッグ
      this.visualizer.onMouseDownCallback = (pos) => {
        const cx = this.visualizer.width / 2;
        if (this.physics.mode === 'pendulum') {
          const cartPxX = cx + this.physics.cart.x * this.visualizer.scale;
          const cartPxY = this.visualizer.height * 0.72;
          if (Math.hypot(pos.x - cartPxX, pos.y - cartPxY) < 60) {
            this.physics.cart.isDragging = true;
          }
        } else if (this.physics.mode === 'drone') {
          const dronePxX = cx + this.physics.drone.y * this.visualizer.scale;
          const dronePxY = this.visualizer.height * 0.85 - this.physics.drone.z * this.visualizer.scale;
          if (Math.hypot(pos.x - dronePxX, pos.y - dronePxY) < 60) {
            this.physics.drone.isDragging = true;
          }
        } else {
          this.physics.applyImpulse(15.0);
        }
      };

      this.visualizer.onMouseMoveCallback = (pos) => {
        const cx = this.visualizer.width / 2;
        if (this.physics.cart.isDragging) {
          const newX = (pos.x - cx) / this.visualizer.scale;
          this.physics.cart.x = Math.max(-2.0, Math.min(2.0, newX));
          this.physics.cart.vx = 0;
        }
        if (this.physics.drone.isDragging) {
          const newY = (pos.x - cx) / this.visualizer.scale;
          const groundY = this.visualizer.height * 0.85;
          const newZ = (groundY - pos.y) / this.visualizer.scale;
          this.physics.drone.y = Math.max(-2.5, Math.min(2.5, newY));
          this.physics.drone.z = Math.max(0.3, Math.min(2.6, newZ));
          this.physics.drone.vy = 0;
          this.physics.drone.vz = 0;
        }
      };

      this.visualizer.onMouseUpCallback = () => {
        this.physics.cart.isDragging = false;
        this.physics.drone.isDragging = false;
      };
    }

    setMode(mode) {
      this.physics.setMode(mode);
      this.chartRenderer.reset();

      if (mode === 'cstr') {
        this.labelSetpoint.textContent = '目標温度 (T_ref):';
        this.inputSetpoint.min = 25;
        this.inputSetpoint.max = 95;
        this.inputSetpoint.step = 0.5;
        this.inputSetpoint.value = 65.0;
        this.valSetpoint.textContent = '65.0 °C';
        this.setpoint = 65.0;

        this.inputKp.min = 0; this.inputKp.max = 20; this.inputKp.step = 0.1;
        this.inputKi.min = 0; this.inputKi.max = 2.5; this.inputKi.step = 0.02;
        this.inputKd.min = 0; this.inputKd.max = 10; this.inputKd.step = 0.1;

        this.inputSaturation.min = 20;
        this.inputSaturation.max = 100;
        this.inputSaturation.step = 5;
        this.inputSaturation.value = 100;
        this.valSaturation.textContent = '100 %';
        this.pid.setOutputLimits(0.0, 100.0);

        this.btnDisturb.textContent = '❄️ 原料急冷 (外乱付加)';
        if (this.hudInstruction) this.hudInstruction.innerHTML = '<strong>外乱ボタン</strong>で原料温度急冷に対する温度復帰を検証できます';
        this.applyPreset('opt_pid');
      } else if (mode === 'tank') {
        this.labelSetpoint.textContent = '目標液位 (h_ref):';
        this.inputSetpoint.min = 0.2;
        this.inputSetpoint.max = 2.8;
        this.inputSetpoint.step = 0.05;
        this.inputSetpoint.value = 1.8;
        this.valSetpoint.textContent = '1.80 m';
        this.setpoint = 1.8;

        this.inputKp.min = 0; this.inputKp.max = 150; this.inputKp.step = 1;
        this.inputKi.min = 0; this.inputKi.max = 10.0; this.inputKi.step = 0.1;
        this.inputKd.min = 0; this.inputKd.max = 40.0; this.inputKd.step = 0.5;

        this.inputSaturation.min = 20;
        this.inputSaturation.max = 100;
        this.inputSaturation.step = 5;
        this.inputSaturation.value = 100;
        this.valSaturation.textContent = '100 %';
        this.pid.setOutputLimits(0.0, 100.0);

        this.btnDisturb.textContent = '🚰 下流バルブ急開 (外乱)';
        if (this.hudInstruction) this.hudInstruction.innerHTML = '<strong>外乱ボタン</strong>で下流プロセス消費急変に対する液位維持を検証できます';
        this.applyPreset('opt_pid');
      } else if (mode === 'pendulum') {
        this.labelSetpoint.textContent = '目標角度 (θ_ref):';
        this.inputSetpoint.min = -0.35;
        this.inputSetpoint.max = 0.35;
        this.inputSetpoint.step = 0.01;
        this.inputSetpoint.value = 0.0;
        this.valSetpoint.textContent = '0.0°';
        this.setpoint = 0.0;

        this.inputKp.min = 0; this.inputKp.max = 200; this.inputKp.step = 1;
        this.inputKi.min = 0; this.inputKi.max = 25; this.inputKi.step = 0.5;
        this.inputKd.min = 0; this.inputKd.max = 40; this.inputKd.step = 0.5;

        this.inputSaturation.min = 20;
        this.inputSaturation.max = 150;
        this.inputSaturation.step = 5;
        this.inputSaturation.value = 80;
        this.valSaturation.textContent = '±80 N';
        this.pid.setOutputLimits(-80.0, 80.0);

        this.btnDisturb.textContent = '⚡ 小突く (外乱付加)';
        if (this.hudInstruction) this.hudInstruction.innerHTML = 'マウスドラッグまたは<strong>小突く</strong>で直立安定性を検証できます';
        this.applyPreset('opt_pid');
      } else {
        this.labelSetpoint.textContent = '目標高度 (z_ref):';
        this.inputSetpoint.min = 0.3;
        this.inputSetpoint.max = 2.5;
        this.inputSetpoint.step = 0.1;
        this.inputSetpoint.value = 1.5;
        this.valSetpoint.textContent = '1.50 m';
        this.setpoint = 1.5;

        this.inputKp.min = 0; this.inputKp.max = 40; this.inputKp.step = 0.5;
        this.inputKi.min = 0; this.inputKi.max = 10; this.inputKi.step = 0.1;
        this.inputKd.min = 0; this.inputKd.max = 20; this.inputKd.step = 0.2;

        this.inputSaturation.min = 5;
        this.inputSaturation.max = 30;
        this.inputSaturation.step = 1;
        this.inputSaturation.value = 20;
        this.valSaturation.textContent = '±20 N';
        this.pid.setOutputLimits(-20.0, 20.0);

        this.btnDisturb.textContent = '💨 突風 (外乱付加)';
        if (this.hudInstruction) this.hudInstruction.innerHTML = '<strong>突風ボタン</strong>で気流外乱に対する姿勢角・高度維持を検証できます';
        this.applyPreset('opt_pid');
      }
    }

    applyPreset(presetKey) {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      document.querySelector(`[data-preset="${presetKey}"]`)?.classList.add('active');

      if (this.physics.mode === 'cstr') {
        switch (presetKey) {
          case 'p_low': // 応答不足
            this.setGainsUI(0.6, 0.0, 0.0);
            break;
          case 'p_high': // むだ時間による激しい持続振動
            this.setGainsUI(12.0, 0.0, 0.0);
            break;
          case 'pd': // 定常偏差残留
            this.setGainsUI(4.0, 0.0, 2.5);
            break;
          case 'i_windup': // 積分過大でオーバーシュート過熱
            this.setGainsUI(3.0, 2.5, 0.1);
            this.toggleAntiWindup.checked = false;
            this.pid.enableAntiWindup = false;
            break;
          case 'opt_pid': // 最適PID整定
          default:
            this.setGainsUI(3.5, 0.60, 2.2);
            this.toggleAntiWindup.checked = true;
            this.pid.enableAntiWindup = true;
            break;
        }
      } else if (this.physics.mode === 'tank') {
        switch (presetKey) {
          case 'p_low':
            this.setGainsUI(15.0, 0.0, 0.0);
            break;
          case 'p_high':
            this.setGainsUI(140.0, 0.0, 0.0);
            break;
          case 'pd':
            this.setGainsUI(50.0, 0.0, 15.0);
            break;
          case 'i_windup':
            this.setGainsUI(40.0, 8.0, 1.0);
            this.toggleAntiWindup.checked = false;
            this.pid.enableAntiWindup = false;
            break;
          case 'opt_pid':
          default:
            this.setGainsUI(55.0, 2.5, 14.0);
            this.toggleAntiWindup.checked = true;
            this.pid.enableAntiWindup = true;
            break;
        }
      } else if (this.physics.mode === 'pendulum') {
        switch (presetKey) {
          case 'p_low':
            this.setGainsUI(15.0, 0.0, 0.0);
            break;
          case 'p_high':
            this.setGainsUI(180.0, 0.0, 0.0);
            break;
          case 'pd':
            this.setGainsUI(95.0, 0.0, 18.0);
            this.physics.cart.extForce = 3.5;
            break;
          case 'i_windup':
            this.setGainsUI(60.0, 20.0, 3.0);
            this.toggleAntiWindup.checked = false;
            this.pid.enableAntiWindup = false;
            break;
          case 'opt_pid':
          default:
            this.setGainsUI(95.0, 1.5, 18.0);
            this.toggleAntiWindup.checked = true;
            this.pid.enableAntiWindup = true;
            break;
        }
      } else {
        switch (presetKey) {
          case 'p_low':
            this.setGainsUI(4.0, 0.0, 0.0);
            break;
          case 'p_high':
            this.setGainsUI(25.0, 0.0, 0.0);
            break;
          case 'pd':
            this.setGainsUI(12.0, 0.0, 6.0);
            this.physics.drone.windForce = 2.0;
            this.physics.drone.windDuration = 999;
            break;
          case 'i_windup':
            this.setGainsUI(10.0, 8.0, 1.0);
            this.toggleAntiWindup.checked = false;
            this.pid.enableAntiWindup = false;
            break;
          case 'opt_pid':
          default:
            this.setGainsUI(14.0, 1.8, 8.0);
            this.toggleAntiWindup.checked = true;
            this.pid.enableAntiWindup = true;
            break;
        }
      }
      this.resetSimulation();
    }

    setGainsUI(kp, ki, kd) {
      this.inputKp.value = kp;
      this.inputKi.value = ki;
      this.inputKd.value = kd;
      this.valKp.textContent = kp.toFixed(2);
      this.valKi.textContent = ki.toFixed(2);
      this.valKd.textContent = kd.toFixed(2);
      this.pid.setGains(kp, ki, kd);
    }

    resetSimulation() {
      this.physics.reset();
      this.pid.reset();
      this.droneRollPid.reset();
      this.chartRenderer.reset();
      this.simTime = 0.0;
    }

    loop(currentTime) {
      const dt = Math.min(0.033, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      if (this.isRunning) {
        this.simTime += dt;

        let measurement = 0;
        let target = this.setpoint;

        if (this.physics.mode === 'cstr') {
          measurement = this.physics.cstr.T;
          const pidOut = this.pid.update(target, measurement, dt);
          this.physics.stepCstr(pidOut, this.simTime, dt);
        } else if (this.physics.mode === 'tank') {
          measurement = this.physics.tank.h;
          const pidOut = this.pid.update(target, measurement, dt);
          this.physics.stepTank(pidOut, dt);
        } else if (this.physics.mode === 'pendulum') {
          measurement = this.physics.cart.theta;

          const posOffset = -0.035 * this.physics.cart.x - 0.055 * this.physics.cart.vx;
          const thetaTarget = this.setpoint + Math.max(-0.15, Math.min(0.15, posOffset));

          let totalForce = 0;
          if (Math.abs(measurement) < 0.95) {
            const pidOut = this.pid.update(thetaTarget, measurement, dt, this.physics.cart.omega);
            totalForce = -pidOut;
          } else {
            this.pid.reset();
            totalForce = 0;
          }

          this.physics.stepPendulum(totalForce, dt);
          target = thetaTarget;
        } else {
          measurement = this.physics.drone.z;

          const hoverThrust = this.physics.drone.m * this.physics.g;
          const altitudeOut = this.pid.update(target, measurement, dt, this.physics.drone.vz);
          const totalThrust = Math.max(0.0, hoverThrust + altitudeOut);

          const yOffset = 0.05 * this.physics.drone.y + 0.1 * this.physics.drone.vy;
          const phiTarget = Math.max(-0.15, Math.min(0.15, yOffset));

          const rollOut = this.droneRollPid.update(phiTarget, this.physics.drone.phi, dt, this.physics.drone.omega);

          const thrustL = Math.max(0.0, totalThrust / 2.0 + rollOut);
          const thrustR = Math.max(0.0, totalThrust / 2.0 - rollOut);

          this.physics.stepDrone(thrustL, thrustR, dt);
        }

        this.chartRenderer.addDataPoint(this.simTime, target, measurement, this.pid);
        this.updateHudMetrics();
      }

      this.visualizer.render(this.physics, this.pid, this.setpoint);
      this.chartRenderer.render();

      requestAnimationFrame(this.loop);
    }

    updateHudMetrics() {
      const m = this.chartRenderer.metrics;
      this.metricSettling.textContent = m.settlingTime ? `${m.settlingTime} s` : (m.isSettled ? '整定済' : '計測中...');
      this.metricOvershoot.textContent = `${m.overshootPct} %`;
      
      if (this.physics.mode === 'cstr') {
        this.metricSteadyError.textContent = `${m.steadyStateError.toFixed(2)} °C`;
      } else if (this.physics.mode === 'tank') {
        this.metricSteadyError.textContent = `${m.steadyStateError.toFixed(3)} m`;
      } else if (this.physics.mode === 'pendulum') {
        const errDeg = (m.steadyStateError * 180 / Math.PI).toFixed(2);
        this.metricSteadyError.textContent = `${errDeg}°`;
      } else {
        this.metricSteadyError.textContent = `${m.steadyStateError.toFixed(3)} m`;
      }

      if (this.pid.isSaturated) {
        this.metricStatus.textContent = '⚠️ 出力飽和中';
        this.metricStatus.style.color = '#ef4444';
      } else if (m.isSettled) {
        this.metricStatus.textContent = '🟢 安定整定';
        this.metricStatus.style.color = '#4ade80';
      } else {
        this.metricStatus.textContent = '🔵 過渡応答中';
        this.metricStatus.style.color = '#38bdf8';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
})();
