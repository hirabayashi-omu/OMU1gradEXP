/**
 * PID Control Simulator - Main Application Controller
 * メインコントローラー：物理計算・PID制御ループ・UI同期・プリセット・探究ミッション管理
 */

(function() {
  class App {
    constructor() {
      this.physics = new window.PhysicsEngine();
      
      // 主PID制御器 (角度 or 高度)
      this.pid = new window.PIDController({
        kp: 60.0,
        ki: 1.5,
        kd: 12.0,
        outputMin: -80.0,
        outputMax: 80.0,
        enableAntiWindup: true
      });

      // ドローン用 副PID制御器 (姿勢ロール角安定化用)
      this.droneRollPid = new window.PIDController({
        kp: 8.0,
        ki: 0.5,
        kd: 3.0,
        outputMin: -4.0,
        outputMax: 4.0,
        enableAntiWindup: true
      });

      this.visualizer = new window.Visualizer('simCanvas');
      this.chartRenderer = new window.ChartRenderer('canvasResponse', 'canvasPid');

      this.setpoint = 0.0;
      this.simTime = 0.0;
      this.isRunning = true;
      this.lastTime = performance.now();

      this.activeMission = null;
      this.missionTimer = 0;
      this.missionSuccess = false;

      this.initElements();
      this.initEvents();
      this.setMode('pendulum');
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

      this.inputSetpoint = document.getElementById('inputSetpoint');
      this.valSetpoint = document.getElementById('valSetpoint');
      this.labelSetpoint = document.getElementById('labelSetpoint');

      this.metricSettling = document.getElementById('metricSettling');
      this.metricOvershoot = document.getElementById('metricOvershoot');
      this.metricSteadyError = document.getElementById('metricSteadyError');
      this.metricStatus = document.getElementById('metricStatus');

      this.missionStatusBadge = document.getElementById('missionStatusBadge');
      this.missionText = document.getElementById('missionText');
    }

    initEvents() {
      this.selectMode.addEventListener('change', (e) => {
        this.setMode(e.target.value);
      });

      const updateGains = () => {
        const kp = parseFloat(this.inputKp.value);
        const ki = parseFloat(this.inputKi.value);
        const kd = parseFloat(this.inputKd.value);

        this.valKp.textContent = kp.toFixed(1);
        this.valKi.textContent = ki.toFixed(2);
        this.valKd.textContent = kd.toFixed(2);

        this.pid.setGains(kp, ki, kd);
      };

      this.inputKp.addEventListener('input', updateGains);
      this.inputKi.addEventListener('input', updateGains);
      this.inputKd.addEventListener('input', updateGains);

      this.inputSaturation.addEventListener('input', (e) => {
        const limit = parseFloat(e.target.value);
        this.valSaturation.textContent = `±${limit} N`;
        this.pid.setSaturationLimits(-limit, limit);
      });

      this.toggleAntiWindup.addEventListener('change', (e) => {
        this.pid.enableAntiWindup = e.target.checked;
      });

      this.inputSetpoint.addEventListener('input', (e) => {
        this.setpoint = parseFloat(e.target.value);
        if (this.physics.mode === 'pendulum') {
          const deg = ((this.setpoint * 180) / Math.PI).toFixed(1);
          this.valSetpoint.textContent = `${deg}°`;
        } else {
          this.valSetpoint.textContent = `${this.setpoint.toFixed(2)} m`;
        }
        this.chartRenderer.reset();
      });

      document.getElementById('btnReset')?.addEventListener('click', () => this.resetSimulation());
      document.getElementById('btnDisturb')?.addEventListener('click', () => {
        const force = this.physics.mode === 'pendulum' ? (Math.random() > 0.5 ? 8.0 : -8.0) : 4.0;
        this.physics.applyImpulse(force);
      });

      document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = btn.dataset.preset;
          this.applyPreset(preset);
        });
      });

      document.querySelectorAll('.btn-mission').forEach(btn => {
        btn.addEventListener('click', () => {
          const mission = btn.dataset.mission;
          this.startMission(mission);
        });
      });

      this.visualizer.onMouseDownCallback = (pos) => {
        if (this.physics.mode === 'pendulum') {
          this.physics.cart.isDragging = true;
        } else {
          this.physics.drone.isDragging = true;
        }
      };

      this.visualizer.onMouseMoveCallback = (pos) => {
        if (this.physics.mode === 'pendulum' && this.physics.cart.isDragging) {
          const originX = this.visualizer.width / 2;
          const originY = this.visualizer.height * 0.72;
          const dx = pos.x - (originX + this.physics.cart.x * this.visualizer.scale);
          const dy = originY - pos.y;
          this.physics.cart.theta = Math.atan2(dx, dy);
          this.physics.cart.omega = 0;
        } else if (this.physics.mode === 'drone' && this.physics.drone.isDragging) {
          const originX = this.visualizer.width / 2;
          const groundY = this.visualizer.height * 0.85;
          this.physics.drone.y = (pos.x - originX) / this.visualizer.scale;
          this.physics.drone.z = Math.max(0.15, (groundY - pos.y) / this.visualizer.scale);
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

      if (mode === 'pendulum') {
        this.labelSetpoint.textContent = '目標角度 (θ_ref):';
        this.inputSetpoint.min = -0.35;
        this.inputSetpoint.max = 0.35;
        this.inputSetpoint.step = 0.01;
        this.inputSetpoint.value = 0.0;
        this.valSetpoint.textContent = '0.0°';
        this.setpoint = 0.0;
        this.applyPreset('opt_pid');
      } else {
        this.labelSetpoint.textContent = '目標高度 (z_ref):';
        this.inputSetpoint.min = 0.3;
        this.inputSetpoint.max = 2.5;
        this.inputSetpoint.step = 0.1;
        this.inputSetpoint.value = 1.5;
        this.valSetpoint.textContent = '1.50 m';
        this.setpoint = 1.5;
        this.applyPreset('opt_pid');
      }
    }

    applyPreset(presetKey) {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      document.querySelector(`[data-preset="${presetKey}"]`)?.classList.add('active');

      if (this.physics.mode === 'pendulum') {
        switch (presetKey) {
          case 'p_low':
            this.setGainsUI(15.0, 0.0, 0.0);
            break;
          case 'p_high':
            this.setGainsUI(95.0, 0.0, 0.0);
            break;
          case 'pd':
            this.setGainsUI(55.0, 0.0, 10.0);
            this.physics.cart.extForce = 3.0;
            break;
          case 'i_windup':
            this.setGainsUI(40.0, 15.0, 2.0);
            this.toggleAntiWindup.checked = false;
            this.pid.enableAntiWindup = false;
            break;
          case 'opt_pid':
          default:
            this.setGainsUI(65.0, 2.5, 14.0);
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
      this.valKp.textContent = kp.toFixed(1);
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

    startMission(missionKey) {
      this.activeMission = missionKey;
      this.missionTimer = 0;
      this.missionSuccess = false;

      document.querySelectorAll('.btn-mission').forEach(b => b.classList.remove('active'));
      document.querySelector(`[data-mission="${missionKey}"]`)?.classList.add('active');

      this.resetSimulation();

      if (missionKey === 'm1') {
        this.setMode('pendulum');
        this.physics.cart.theta = 0.25;
        this.missionText.textContent = '【初級ミッション】初期角度14°から、振子を倒さずに3秒以内に直立整定（偏差±2°以内）させよ！';
        this.missionStatusBadge.textContent = '挑戦中...';
        this.missionStatusBadge.className = 'badge-mission badge-pending';
      } else if (missionKey === 'm2') {
        this.setMode('pendulum');
        this.physics.cart.extForce = 4.0;
        this.missionText.textContent = '【中級ミッション】4Nの定常外乱が加わる中で、積分ゲインKiを活用して定常偏差をゼロにせよ！';
        this.missionStatusBadge.textContent = '挑戦中...';
        this.missionStatusBadge.className = 'badge-mission badge-pending';
      } else if (missionKey === 'm3') {
        this.setMode('drone');
        this.setpoint = 1.8;
        this.inputSetpoint.value = 1.8;
        this.valSetpoint.textContent = '1.80 m';
        this.missionText.textContent = '【上級ミッション】突風を受けながら、ドローンを高度1.8mにオーバーシュート15%以内で最速ホバリングさせよ！';
        this.missionStatusBadge.textContent = '挑戦中...';
        this.missionStatusBadge.className = 'badge-mission badge-pending';
      }
    }

    checkMission(dt) {
      if (!this.activeMission || this.missionSuccess) return;

      this.missionTimer += dt;

      if (this.activeMission === 'm1') {
        const errDeg = Math.abs(this.physics.cart.theta * 180 / Math.PI);
        if (errDeg < 2.0 && this.chartRenderer.metrics.isSettled) {
          this.missionSuccess = true;
          this.missionStatusBadge.textContent = '🎉 MISSION CLEAR!';
          this.missionStatusBadge.className = 'badge-mission badge-success';
        }
      } else if (this.activeMission === 'm2') {
        const errDeg = Math.abs((this.setpoint - this.physics.cart.theta) * 180 / Math.PI);
        if (errDeg < 0.5 && this.simTime > 3.0) {
          this.missionSuccess = true;
          this.missionStatusBadge.textContent = '🎉 MISSION CLEAR!';
          this.missionStatusBadge.className = 'badge-mission badge-success';
        }
      } else if (this.activeMission === 'm3') {
        const zErr = Math.abs(this.setpoint - this.physics.drone.z);
        if (zErr < 0.05 && this.chartRenderer.metrics.overshootPct < 15 && this.simTime > 2.5) {
          this.missionSuccess = true;
          this.missionStatusBadge.textContent = '🎉 MISSION CLEAR!';
          this.missionStatusBadge.className = 'badge-mission badge-success';
        }
      }
    }

    loop(currentTime) {
      const dt = Math.min(0.033, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      if (this.isRunning) {
        this.simTime += dt;

        let measurement = 0;
        let target = this.setpoint;

        if (this.physics.mode === 'pendulum') {
          measurement = this.physics.cart.theta;

          const controlForce = this.pid.update(target, measurement, dt);
          const posFeedback = -1.2 * this.physics.cart.x - 1.5 * this.physics.cart.vx;
          const totalForce = controlForce + posFeedback;

          this.physics.stepPendulum(totalForce, dt);
        } else {
          measurement = this.physics.drone.z;

          const hoverThrust = this.physics.drone.m * this.physics.g;
          const altitudeOut = this.pid.update(target, measurement, dt);
          const totalThrust = hoverThrust + altitudeOut;

          const rollOut = this.droneRollPid.update(0.0, this.physics.drone.phi, dt);

          const thrustL = totalThrust / 2.0 - rollOut;
          const thrustR = totalThrust / 2.0 + rollOut;

          this.physics.stepDrone(thrustL, thrustR, dt);
        }

        this.chartRenderer.addDataPoint(this.simTime, target, measurement, this.pid);
        this.updateHudMetrics();
        this.checkMission(dt);
      }

      this.visualizer.render(this.physics, this.pid, this.setpoint);
      this.chartRenderer.render();

      requestAnimationFrame(this.loop);
    }

    updateHudMetrics() {
      const m = this.chartRenderer.metrics;
      this.metricSettling.textContent = m.settlingTime ? `${m.settlingTime} s` : (m.isSettled ? '整定済' : '計測中...');
      this.metricOvershoot.textContent = `${m.overshootPct} %`;
      
      if (this.physics.mode === 'pendulum') {
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
