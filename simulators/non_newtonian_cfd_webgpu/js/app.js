/**
 * app.js - 化粧品充填プロセス (Cosmetic Filling Process) シミュレーター統合コントローラー
 */

import { COSMETIC_PRESETS, RheologyModel } from './models.js?v=fluid_pinch_off_v50';
import { WebGPUSPHSolver, CONTAINER_TYPES } from './sph_solver_webgpu.js?v=fluid_pinch_off_v50';
import { FluidRenderer } from './fluid_renderer.js?v=fluid_pinch_off_v50';
import { ChartRenderer } from './charts.js?v=fluid_pinch_off_v50';

class CosmeticFillingApp {
  constructor() {
    this.currentPresetId = 'cleansing_oil';
    this.currentPreset = COSMETIC_PRESETS.cleansing_oil;
    this.model = new RheologyModel(this.currentPreset);

    this.isRunning = true;
    this.solver = null;
    this.renderer = null;
    this.charts = null;
    this.activeChartMode = 'rheology'; // 'rheology' | 'sagging'

    this._initElements();
    this._bindEvents();
  }

  _initElements() {
    this.simCanvas = document.getElementById('simCanvas');
    this.cbCanvas = document.getElementById('colorbarCanvas');
    this.rhCanvas = document.getElementById('rheologyCanvas');

    // グラフカード関連要素
    this.tabChartRheoBtn = document.getElementById('tabChartRheoBtn');
    this.tabChartSagBtn = document.getElementById('tabChartSagBtn');
    this.chartCardTitle = document.getElementById('chartCardTitle');
    this.chartCardSubTitle = document.getElementById('chartCardSubTitle');
    this.chartLegendBar = document.getElementById('chartLegendBar');
    this.legendItem1 = document.getElementById('legendItem1');
    this.legendItem2 = document.getElementById('legendItem2');
    this.chartCaptionText = document.getElementById('chartCaptionText');

    this.fillProgressContainer = document.getElementById('fillProgressContainer');
    this.fillProgressText = document.getElementById('fillProgressText');
    this.fillProgressBar = document.getElementById('fillProgressBar');
    this.viewportTipText = document.getElementById('viewportTipText');
    this.peakHeightVal = document.getElementById('peakHeightVal');
    this.flatnessVal = document.getElementById('flatnessVal');
    this.particleCountVal = document.getElementById('particleCountVal');
    this.statusBadge = document.getElementById('backendStatus');
    this.viewportCaption = document.getElementById('viewportCaption');
    this.presetDesc = document.getElementById('presetDesc');
    this.presetSelect = document.getElementById('presetSelect');
    this.rheologyFormulaBadge = document.getElementById('rheologyFormulaBadge');

    // HLB & 基板濡れ性相性フィールド
    this.formulaHlbText = document.getElementById('formulaHlbText');
    this.substrateTypeText = document.getElementById('substrateTypeText');
    this.contactAngleText = document.getElementById('contactAngleText');
    this.affinityLevelBadge = document.getElementById('affinityLevelBadge');
    this.tableHlb = document.getElementById('tableHlb');
    this.tableEmulsion = document.getElementById('tableEmulsion');

    // 評価モードタブ
    this.tabFillingBtn = document.getElementById('tabFillingBtn');
    this.tabSaggingBtn = document.getElementById('tabSaggingBtn');
    this.fillingControls = document.getElementById('fillingControls');
    this.saggingControls = document.getElementById('saggingControls');
    this.fillingStats = document.getElementById('fillingStats');
    this.saggingStats = document.getElementById('saggingStats');

    // 充填方式ボタン
    this.modeBottomUpBtn = document.getElementById('modeBottomUpBtn');
    this.modeFixedBtn = document.getElementById('modeFixedBtn');

    // 口径 & 充填条件
    this.nozzleDiameterInput = document.getElementById('nozzleDiameterInput');
    this.nozzleDiameterVal = document.getElementById('nozzleDiameterVal');
    this.inletVelInput = document.getElementById('inletVelInput');
    this.inletVelVal = document.getElementById('inletVelVal');
    this.sigmaInput = document.getElementById('sigmaInput');
    this.sigmaVal = document.getElementById('sigmaVal');

    // 傾斜板・垂直板放置試験コントロール
    this.plateAngleInput = document.getElementById('plateAngleInput');
    this.plateAngleVal = document.getElementById('plateAngleVal');
    this.targetSagTimeInput = document.getElementById('targetSagTimeInput');
    this.targetSagTimeVal = document.getElementById('targetSagTimeVal');
    this.dropVolumeInput = document.getElementById('dropVolumeInput');
    this.dropVolumeVal = document.getElementById('dropVolumeVal');
    this.substrateSelect = document.getElementById('substrateSelect');
    this.dropLiquidBtn = document.getElementById('dropLiquidBtn');
    this.resetSagTestBtn = document.getElementById('resetSagTestBtn');

    // 放置試験ステータス表示
    this.sagDistanceVal = document.getElementById('sagDistanceVal');
    this.sagVelocityVal = document.getElementById('sagVelocityVal');
    this.sagStatusVal = document.getElementById('sagStatusVal');

    // レオロジースライダー
    this.tauYInput = document.getElementById('tauYInput');
    this.tauYVal = document.getElementById('tauYVal');
    this.kInput = document.getElementById('kInput');
    this.kVal = document.getElementById('kVal');
    this.nInput = document.getElementById('nInput');
    this.nVal = document.getElementById('nVal');

    this.fieldSelect = document.getElementById('fieldSelect');
    this.smoothingSelect = document.getElementById('smoothingSelect');

    this.playBtn = document.getElementById('playBtn');
    this.stepBtn = document.getElementById('stepBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.exportBtn = document.getElementById('exportBtn');
  }

  async init() {
    this._resizeCanvases();

    // SPH ソルバー & レンダラー初期化
    this.solver = new WebGPUSPHSolver(this.simCanvas.width, this.simCanvas.height, 36000);
    this.renderer = new FluidRenderer(this.simCanvas);
    this.charts = new ChartRenderer(this.cbCanvas, this.rhCanvas, null);

    // 傾斜板・垂直板放置試験の標準条件 (15°, 撥水シリコーン, 1.5 mL) の初期同期
    if (this.plateAngleInput) this.plateAngleInput.value = 15;
    if (this.plateAngleVal) this.plateAngleVal.textContent = '15°';
    document.querySelectorAll('[data-angle]').forEach(b => {
      b.className = (parseFloat(b.dataset.angle) === 15) ? 'btn btn-primary plate-angle-btn' : 'btn btn-secondary plate-angle-btn';
    });

    if (this.dropVolumeInput) this.dropVolumeInput.value = 1.50;
    if (this.dropVolumeVal) this.dropVolumeVal.textContent = '1.50 mL';
    document.querySelectorAll('[data-vol]').forEach(b => {
      b.className = (parseFloat(b.dataset.vol) === 1.5) ? 'btn btn-primary drop-vol-btn' : 'btn btn-secondary drop-vol-btn';
    });

    if (this.substrateSelect) this.substrateSelect.value = 'silicone';
    this.solver.setPlateAngle(15.0);
    this.solver.setDropVolume(1.50);
    this.solver.setSubstrateType('silicone');

    // 充填方式の初期同期 (ボトムアップ昇降をデフォルト)
    if (this.modeBottomUpBtn) this.modeBottomUpBtn.className = 'btn btn-primary';
    if (this.modeFixedBtn) this.modeFixedBtn.className = 'btn btn-secondary';

    this._applyPreset('cleansing_oil');
    this._syncParams();

    this._loop();
  }

  _resizeCanvases() {
    const rect = this.simCanvas.getBoundingClientRect();
    const w = Math.round(rect.width) || this.simCanvas.clientWidth || 960;
    const h = Math.round(rect.height) || this.simCanvas.clientHeight || 640;
    this.simCanvas.width = w;
    this.simCanvas.height = h;

    const cbRect = this.cbCanvas.getBoundingClientRect();
    this.cbCanvas.width = Math.round(cbRect.width) || 80;
    this.cbCanvas.height = h;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rw = this.rhCanvas.clientWidth || 370;
    const rh = 340;
    this.rhCanvas.width = Math.round(rw * dpr);
    this.rhCanvas.height = Math.round(rh * dpr);

    if (this.solver) {
      this.solver.width = w;
      this.solver.height = h;
      this.solver.nozzleX = w * 0.5;
      this.solver.initWallParticles();
    }
    if (this.renderer) {
      this.renderer.resize();
    }
  }

  _applyPreset(presetId) {
    const p = COSMETIC_PRESETS[presetId];
    if (!p) return;

    this.currentPresetId = presetId;
    this.currentPreset = p;
    this.model = new RheologyModel(p);

    if (this.tauYInput) {
      this.tauYInput.value = p.tau_y;
      this.tauYVal.textContent = p.tau_y.toFixed(1);
    }
    if (this.kInput) {
      this.kInput.value = p.K;
      this.kVal.textContent = p.K.toFixed(2);
    }
    if (this.nInput) {
      this.nInput.value = p.n;
      this.nVal.textContent = p.n.toFixed(2);
    }
    if (this.inletVelInput && p.inlet_vel !== undefined) {
      this.inletVelInput.value = p.inlet_vel;
      this.inletVelVal.textContent = p.inlet_vel.toFixed(2);
    }
    if (this.sigmaInput && p.sigma !== undefined) {
      this.sigmaInput.value = p.sigma;
      this.sigmaVal.textContent = p.sigma.toFixed(1);
    }

    if (this.presetDesc) {
      this.presetDesc.textContent = p.desc;
    }

    // どのプリセットでも超薄平皿（シャーレ）をデフォルトに設定
    this._selectContainer('petri_dish');

    this._syncParams();

    // 放置試験モード時は液滴を再滴下
    if (this.solver && this.solver.testMode === 'sagging') {
      this.solver.dropLiquid();
    }
  }

  _selectContainer(containerId) {
    if (!this.solver || !CONTAINER_TYPES[containerId]) return;

    this.solver.setContainer(containerId);

    document.querySelectorAll('[data-container]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.container === containerId);
    });

    this._updateCaption();
  }

  _syncParams() {
    if (this.solver) {
      this.solver.setRheologyParams(this.model);
      if (this.nozzleDiameterInput) {
        this.solver.setNozzleDiameter(parseFloat(this.nozzleDiameterInput.value));
      }
      if (this.sigmaInput) {
        this.solver.sigma = parseFloat(this.sigmaInput.value);
      }
    }

    if (this.charts) {
      this.charts.renderRheologyCurve(this.model);
      this.charts.renderColorbar(this.renderer.renderMode);
    }

    if (this.rheologyFormulaBadge && this.model) {
      const presName = this.currentPreset?.name?.split(' ')[0] || '評価流体';
      this.rheologyFormulaBadge.innerHTML = `<strong>${presName}</strong>: τ = ${this.model.tau_y.toFixed(1)} + ${this.model.K.toFixed(2)}·γ̇<sup>${this.model.n.toFixed(2)}</sup> &nbsp;[Pa]`;
    }

    // 右サイドバーの物性パラメータ表を更新
    if (this.tableHlb && this.model) {
      this.tableHlb.textContent = `HLB ${this.model.hlb.toFixed(1)} (${this.model.polarity?.split(' ')[0] || ''})`;
    }
    if (this.tableEmulsion && this.model) {
      this.tableEmulsion.textContent = this.model.emulsion_type || '標準バルク';
    }

    const tableTauY = document.getElementById('tableTauY');
    const tableK = document.getElementById('tableK');
    const tableN = document.getElementById('tableN');
    const tableSigma = document.getElementById('tableSigma');
    if (tableTauY) tableTauY.textContent = `${this.model.tau_y.toFixed(1)} Pa`;
    if (tableK) tableK.textContent = `${this.model.K.toFixed(2)} Pa·sⁿ`;
    if (tableN) {
      const typeStr = this.model.n < 0.98 ? ' (擬塑性)' : (this.model.n > 1.05 ? ' (ダイラタント)' : ' (ニュートン)');
      tableN.textContent = `${this.model.n.toFixed(2)}${typeStr}`;
    }
    if (tableSigma && this.solver) tableSigma.textContent = `${this.solver.sigma.toFixed(1)} mN/m`;

    this._updateSaggingTheory();
    this._updateCaption();
  }

  _updateSaggingTheory() {
    if (!this.solver) return;
    const angleRad = (this.solver.plateAngleDeg * Math.PI) / 180.0;
    const gSin = 9.80665 * Math.sin(angleRad);
    const rho = this.model.rho || 1040.0;
    const tauY = this.model.tau_y;

    // HLB × 基板親疎水性・濡れ性相性カードの動的更新
    const wetting = this.solver.getWettingAndAffinity();
    if (this.formulaHlbText) {
      this.formulaHlbText.textContent = `HLB ${wetting.hlb.toFixed(1)} (${this.model.polarity?.split(' ')[0] || ''})`;
    }
    if (this.substrateTypeText) {
      this.substrateTypeText.textContent = `${wetting.subName} (${wetting.subTypeLabel.split(' ')[0]})`;
    }
    if (this.contactAngleText) {
      this.contactAngleText.textContent = `θc ≈ ${wetting.contactAngleDeg.toFixed(0)}° (${wetting.aspect < 0.3 ? '濡れ広がり・薄膜' : (wetting.aspect < 0.45 ? '標準ドーム' : '撥液・玉状化')})`;
    }
    if (this.affinityLevelBadge) {
      this.affinityLevelBadge.textContent = wetting.affinityLevel;
      if (wetting.affinity > 0.65) {
        this.affinityLevelBadge.style.color = '#34d399';
      } else if (wetting.affinity < 0.4) {
        this.affinityLevelBadge.style.color = '#f87171';
      } else {
        this.affinityLevelBadge.style.color = '#38bdf8';
      }
    }

    const gravEl = document.getElementById('gravityForceText');
    const thickEl = document.getElementById('critThicknessText');
    const badgeEl = document.getElementById('theoryStatusBadge');

    if (gravEl) gravEl.textContent = `${gSin.toFixed(2)} N/kg`;

    if (gSin < 0.05) {
      if (thickEl) thickEl.textContent = '∞ (水平: たれゼロ)';
      if (badgeEl) {
        badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
        badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        badgeEl.style.color = '#34d399';
        badgeEl.textContent = '✅ 水平静置（たれ駆動力ゼロ）';
      }
    } else {
      const hcMm = (tauY / (rho * gSin)) * 1000.0;
      if (thickEl) thickEl.textContent = `${hcMm.toFixed(1)} mm`;

      if (tauY > 0 && hcMm >= 2.0) {
        if (badgeEl) {
          badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
          badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          badgeEl.style.color = '#34d399';
          badgeEl.textContent = '✅ 降伏保持領域（たれ自立停止）';
        }
      } else {
        if (badgeEl) {
          badgeEl.style.background = 'rgba(245, 158, 11, 0.2)';
          badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          badgeEl.style.color = '#fbbf24';
          badgeEl.textContent = '⚠️ 流下支配領域（たれ進行中）';
        }
      }
    }
  }

  _updateCaption() {
    if (!this.viewportCaption || !this.solver) return;
    if (this.solver.testMode === 'sagging') {
      const geom = this.solver.getPlateGeometry();
      this.viewportCaption.textContent = `傾斜板・垂直板放置試験 (たれ評価): 傾斜角 ${geom.angleDeg.toFixed(0)}° / ${this.solver.substrateType.toUpperCase()}基板 (${this.currentPreset.name}, 降伏応力 τ_y = ${this.solver.tau_y.toFixed(1)} Pa)`;
    } else {
      const c = this.solver.container;
      const modeDesc = this.solver.fillingMode === 'bottom_up' ? 'ボトムアップ昇降追従' : 'トップダウン固定注入';
      this.viewportCaption.textContent = `化粧品充填プロセス: ${c.name} への ${modeDesc} (${this.currentPreset.name}, 降伏応力 τ_y = ${this.solver.tau_y.toFixed(1)} Pa)`;
    }
  }

  _switchChartMode(mode) {
    this.activeChartMode = mode;
    if (mode === 'sagging') {
      if (this.tabChartSagBtn) {
        this.tabChartSagBtn.className = 'btn btn-primary';
      }
      if (this.tabChartRheoBtn) {
        this.tabChartRheoBtn.className = 'btn btn-secondary';
      }
      if (this.chartCardTitle) {
        this.chartCardTitle.textContent = '垂れ先端移動速度・距離推移 (L-t 曲線)';
      }
      if (this.chartCardSubTitle) {
        this.chartCardSubTitle.textContent = 'Sagging Kinetics Plot';
      }
      if (this.rheologyFormulaBadge && this.solver) {
        const geom = this.solver.getPlateGeometry();
        this.rheologyFormulaBadge.innerHTML = `傾斜板試験: θ = ${geom.angleDeg.toFixed(0)}° / ${this.solver.substrateType.toUpperCase()}基板 (滴下量: ${this.solver.dropVolumeMl.toFixed(1)} mL)`;
      }
      if (this.legendItem1) {
        this.legendItem1.innerHTML = '<span style="display:inline-block; width:16px; height:3px; background:#0284c7; border-radius:1px;"></span> 垂れ移動距離 L (mm) [第1軸]';
        this.legendItem1.style.color = '#0284c7';
      }
      if (this.legendItem2) {
        this.legendItem2.innerHTML = '<span style="display:inline-block; width:16px; height:2px; border-top:2px dashed #f97316;"></span> 先端流速 v (mm/s) [第2軸]';
        this.legendItem2.style.color = '#f97316';
      }
      if (this.chartCaptionText && this.solver) {
        const geom = this.solver.getPlateGeometry();
        this.chartCaptionText.innerHTML = `<em>Fig. 2</em> &nbsp; Kinetic sagging curve: Sagging front displacement <em>L</em>(<em>t</em>) vs. Time <em>t</em> (θ = ${geom.angleDeg.toFixed(0)}°)`;
      }
      if (this.charts && this.solver) {
        this.charts.renderSaggingCurve(this.solver, this.model);
      }
    } else {
      if (this.tabChartRheoBtn) {
        this.tabChartRheoBtn.className = 'btn btn-primary';
      }
      if (this.tabChartSagBtn) {
        this.tabChartSagBtn.className = 'btn btn-secondary';
      }
      if (this.chartCardTitle) {
        this.chartCardTitle.textContent = '評価流体レオロジー特性 (流動曲線)';
      }
      if (this.chartCardSubTitle) {
        this.chartCardSubTitle.textContent = 'Academic Rheology Plot';
      }
      if (this.rheologyFormulaBadge) {
        this.rheologyFormulaBadge.innerHTML = `Herschel-Bulkley: τ = ${this.model.tau_y.toFixed(1)} + ${this.model.K.toFixed(2)}·γ̇<sup>${this.model.n.toFixed(2)}</sup> [Pa]`;
      }
      if (this.legendItem1) {
        this.legendItem1.innerHTML = '<span style="display:inline-block; width:16px; height:3px; background:#ef4444; border-radius:1px;"></span> せん断応力 τ (Pa)';
        this.legendItem1.style.color = '#ef4444';
      }
      if (this.legendItem2) {
        this.legendItem2.innerHTML = '<span style="display:inline-block; width:16px; height:2px; border-top:2px dashed #0284c7;"></span> 見かけ粘度 η (Pa·s)';
        this.legendItem2.style.color = '#0284c7';
      }
      if (this.chartCaptionText) {
        this.chartCaptionText.innerHTML = '<em>Fig. 1</em> &nbsp; Rheological flow curves: Shear stress τ and Apparent viscosity η vs. Shear rate γ̇';
      }
      if (this.charts) {
        this.charts.renderRheologyCurve(this.model);
      }
    }
  }

  _switchTestMode(mode) {
    if (!this.solver) return;
    this.solver.setTestMode(mode);

    if (mode === 'sagging') {
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.add('active');
      if (this.tabFillingBtn) this.tabFillingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'none';
      if (this.saggingControls) this.saggingControls.style.display = 'block';
      if (this.fillingStats) this.fillingStats.style.display = 'none';
      if (this.saggingStats) this.saggingStats.style.display = 'grid';

      // 垂れ試験モードでは不要な充填進捗UIを完全非表示
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'none';

      // グラフタブを自動で垂れ試験モードに連動切り替え
      this._switchChartMode('sagging');

      // ツールバー案内文を垂れ試験用に切り替え
      if (this.viewportTipText) {
        this.viewportTipText.textContent = '📐 傾斜板・垂直板放置試験: 角度・基板親疎水性・HLB相性に応じたタレ停止限界と自重せん断流動を評価します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> 最初から試験 (液滴滴下)';
      }
    } else {
      if (this.tabFillingBtn) this.tabFillingBtn.classList.add('active');
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'block';
      if (this.saggingControls) this.saggingControls.style.display = 'none';
      if (this.fillingStats) this.fillingStats.style.display = 'grid';
      if (this.saggingStats) this.saggingStats.style.display = 'none';

      // 充填モードでは充填進捗インジケーターを表示
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'flex';

      // グラフタブをレオロジー曲線に連動切り替え
      this._switchChartMode('rheology');

      // ツールバー案内文をノズル昇降案内に切り替え
      if (this.viewportTipText) {
        this.viewportTipText.textContent = '💡 ボトムアップ昇降ノズルにより液面直上に追従し、気泡混入や液ハネを防止します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> 最初から充填';
      }
    }

    this._syncParams();
    this._updateCaption();
    this._updateUIStats();
    if (this.renderer) this.renderer.render(this.solver, this.currentPreset);
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this._resizeCanvases();
    });

    // グラフカードタブ切り替え
    if (this.tabChartRheoBtn) {
      this.tabChartRheoBtn.addEventListener('click', () => this._switchChartMode('rheology'));
    }
    if (this.tabChartSagBtn) {
      this.tabChartSagBtn.addEventListener('click', () => this._switchChartMode('sagging'));
    }

    // 評価モードタブ切り替え
    if (this.tabFillingBtn) {
      this.tabFillingBtn.addEventListener('click', () => this._switchTestMode('filling'));
    }
    if (this.tabSaggingBtn) {
      this.tabSaggingBtn.addEventListener('click', () => this._switchTestMode('sagging'));
    }

    // 傾斜板・垂直板放置試験コントロール
    if (this.plateAngleInput) {
      this.plateAngleInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.plateAngleVal) this.plateAngleVal.textContent = `${val.toFixed(0)}°`;
        document.querySelectorAll('[data-angle]').forEach(b => {
          b.className = (parseFloat(b.dataset.angle) === val) ? 'btn btn-primary plate-angle-btn' : 'btn btn-secondary plate-angle-btn';
        });
        this.solver.setPlateAngle(val);
        this._updateSaggingTheory();
        this._updateCaption();
      });
    }

    document.querySelectorAll('[data-angle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ang = parseFloat(e.currentTarget.dataset.angle);
        if (this.plateAngleInput) {
          this.plateAngleInput.value = ang;
          if (this.plateAngleVal) this.plateAngleVal.textContent = `${ang.toFixed(0)}°`;
        }
        document.querySelectorAll('[data-angle]').forEach(b => {
          b.className = (b === e.currentTarget) ? 'btn btn-primary plate-angle-btn' : 'btn btn-secondary plate-angle-btn';
        });
        this.solver.setPlateAngle(ang);
        this._updateSaggingTheory();
        this._updateCaption();
      });
    });

    if (this.targetSagTimeInput) {
      this.targetSagTimeInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.targetSagTimeVal) this.targetSagTimeVal.textContent = val > 0 ? `${val.toFixed(1)} s` : '無制限';
        document.querySelectorAll('.sag-time-btn').forEach(b => {
          b.className = (parseFloat(b.dataset.time) === val) ? 'btn btn-primary sag-time-btn' : 'btn btn-secondary sag-time-btn';
        });
        this.solver.setTargetSagTime(val);
      });
    }

    document.querySelectorAll('.sag-time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const time = parseFloat(e.currentTarget.dataset.time);
        if (this.targetSagTimeInput) {
          this.targetSagTimeInput.value = time;
          if (this.targetSagTimeVal) this.targetSagTimeVal.textContent = time > 0 ? `${time.toFixed(1)} s` : '無制限';
        }
        document.querySelectorAll('.sag-time-btn').forEach(b => {
          b.className = (b === e.currentTarget) ? 'btn btn-primary sag-time-btn' : 'btn btn-secondary sag-time-btn';
        });
        this.solver.setTargetSagTime(time);
      });
    });

    if (this.dropVolumeInput) {
      this.dropVolumeInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.dropVolumeVal) this.dropVolumeVal.textContent = `${val.toFixed(1)} mL`;
        document.querySelectorAll('[data-vol]').forEach(b => {
          b.className = (parseFloat(b.dataset.vol) === val) ? 'btn btn-primary drop-vol-btn' : 'btn btn-secondary drop-vol-btn';
        });
        this.solver.setDropVolume(val);
      });
    }

    document.querySelectorAll('[data-vol]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const vol = parseFloat(e.currentTarget.dataset.vol);
        if (this.dropVolumeInput) {
          this.dropVolumeInput.value = vol;
          if (this.dropVolumeVal) this.dropVolumeVal.textContent = `${vol.toFixed(1)} mL`;
        }
        document.querySelectorAll('[data-vol]').forEach(b => {
          b.className = (b === e.currentTarget) ? 'btn btn-primary drop-vol-btn' : 'btn btn-secondary drop-vol-btn';
        });
        this.solver.setDropVolume(vol);
        if (this.solver.testMode === 'sagging') {
          this.solver.dropLiquid();
        }
      });
    });

    if (this.substrateSelect) {
      this.substrateSelect.addEventListener('change', (e) => {
        this.solver.setSubstrateType(e.target.value);
        this._updateSaggingTheory();
        this._updateCaption();
      });
    }

    if (this.dropLiquidBtn) {
      this.dropLiquidBtn.addEventListener('click', () => {
        this.solver.dropLiquid();
      });
    }

    if (this.resetSagTestBtn) {
      this.resetSagTestBtn.addEventListener('click', () => {
        this.solver.resetSagTest();
        this._updateUIStats();
      });
    }

    // 容器選択ボタン
    document.querySelectorAll('[data-container]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cId = e.currentTarget.dataset.container;
        this._selectContainer(cId);
      });
    });

    // 充填方式ボタン
    this.modeBottomUpBtn.addEventListener('click', () => {
      this.modeBottomUpBtn.className = 'btn btn-primary';
      this.modeFixedBtn.className = 'btn btn-secondary';
      this.solver.setFillingMode('bottom_up');
      this._updateCaption();
    });

    this.modeFixedBtn.addEventListener('click', () => {
      this.modeFixedBtn.className = 'btn btn-primary';
      this.modeBottomUpBtn.className = 'btn btn-secondary';
      this.solver.setFillingMode('fixed');
      this._updateCaption();
    });

    // 処方プリセット
    this.presetSelect.addEventListener('change', (e) => {
      this._applyPreset(e.target.value);
    });

    // ノズル口径
    this.nozzleDiameterInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.nozzleDiameterVal.textContent = `${val.toFixed(1)} mm`;
      this.solver.setNozzleDiameter(val);
      this._updateCaption();
    });

    // 注入流速
    this.inletVelInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.inletVelVal.textContent = val.toFixed(2);
      this.model.inlet_vel = val;
      this.solver.setInletVelocity(val);
      this.solver.setRheologyParams(this.model);
    });

    // 界面張力
    this.sigmaInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.sigmaVal.textContent = val.toFixed(1);
      this.solver.sigma = val;
      this.model.sigma = val;
    });

    // レオロジーパラメータ
    const updateRheology = () => {
      this.model.tau_y = parseFloat(this.tauYInput.value);
      this.model.K = parseFloat(this.kInput.value);
      this.model.n = parseFloat(this.nInput.value);

      this.tauYVal.textContent = this.model.tau_y.toFixed(1);
      this.kVal.textContent = this.model.K.toFixed(2);
      this.nVal.textContent = this.model.n.toFixed(2);

      this.solver.setRheologyParams(this.model);
      this.charts.renderRheologyCurve(this.model);
      this._updateCaption();
    };

    this.tauYInput.addEventListener('input', updateRheology);
    this.kInput.addEventListener('input', updateRheology);
    this.nInput.addEventListener('input', updateRheology);

    // 描画モード
    this.fieldSelect.addEventListener('change', (e) => {
      this.renderer.renderMode = e.target.value;
      this.charts.renderColorbar(e.target.value);
    });

    // 表面平滑化（粒感除去）フィルター設定
    if (this.smoothingSelect) {
      this.smoothingSelect.addEventListener('change', (e) => {
        this.renderer.smoothingMode = e.target.value;
      });
    }

    // シミュレーション制御
    this.playBtn.addEventListener('click', () => {
      this.isRunning = !this.isRunning;
      this.playBtn.innerHTML = this.isRunning
        ? '<span class="icon">⏸</span> 一時停止'
        : '<span class="icon">▶</span> 再開';
      this.playBtn.className = this.isRunning ? 'btn btn-active' : 'btn btn-primary';
    });

    this.stepBtn.addEventListener('click', () => {
      if (!this.isRunning && this.solver) {
        this.solver.step(0.003, 3);
        this.renderer.render(this.solver, this.currentPreset);
        this._updateUIStats();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      if (this.solver.testMode === 'sagging') {
        this.solver.resetSagTest();
        this.solver.dropLiquid();
      } else {
        this.solver.reset();
      }
      this._updateUIStats();
    });

    this.exportBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `cosmetic_filling_${this.solver.containerType}_${Date.now()}.png`;
      link.href = this.simCanvas.toDataURL('image/png');
      link.click();
    });

    // コマ送り静止画（横長ストリップ）出力
    const exportFilmstripBtn = document.getElementById('exportFilmstripBtn');
    if (exportFilmstripBtn) {
      exportFilmstripBtn.addEventListener('click', () => {
        this.exportFilmstrip();
      });
    }

    const closeFilmstripModalBtn = document.getElementById('closeFilmstripModalBtn');
    if (closeFilmstripModalBtn) {
      closeFilmstripModalBtn.addEventListener('click', () => {
        const modal = document.getElementById('filmstripModal');
        if (modal) modal.style.display = 'none';
      });
    }
  }

  /**
   * 充填ステップごとのコマ送り静止画シーケンス (横長フィルムストリップ画像) の生成・エクスポート
   * ノズルの動きではなく「液体の蓄積・ぬれ広がり・液面上昇・レベリング」を均等に追跡
   */
  exportFilmstrip() {
    if (!this.solver) return;

    // 容器ごとの満杯粒子数
    const maxCapacity = {
      petri_dish: 4500,
      jar: 7500,
      bottle: 7000,
      lipstick: 4500,
      compact: 6000
    }[this.solver.containerType] || 5000;

    const targetVol = this.solver.container.targetVolume;

    // 液体の蓄積を均等に追う 7コマのサンプリング定義
    const sampleTargets = [
      { label: 'Step 1: 充填開始前', ratio: 0.00, phase: '初期状態' },
      { label: 'Step 2: 初期着液', ratio: 0.15, phase: '中央ぬれ広がり' },
      { label: 'Step 3: 底部拡散', ratio: 0.35, phase: 'シャーレ中間進展' },
      { label: 'Step 4: 全面カバー', ratio: 0.60, phase: '底面薄膜形成' },
      { label: 'Step 5: 液面上昇', ratio: 0.85, phase: 'メニスカス成長' },
      { label: 'Step 6: 規定量到達', ratio: 1.00, phase: '充填完了' },
      { label: 'Step 7: レベリング', ratio: 1.00, phase: '平坦化静止安定', waitExtraSec: 0.8 }
    ];

    const frameW = 380;
    const frameH = 280;
    const numFrames = sampleTargets.length;
    const headerH = 38;
    const footerH = 34;
    const totalW = frameW * numFrames;
    const totalH = frameH + headerH + footerH;

    const filmCanvas = document.createElement('canvas');
    filmCanvas.width = totalW;
    filmCanvas.height = totalH;
    const filmCtx = filmCanvas.getContext('2d');

    // 全体背景
    filmCtx.fillStyle = '#070a12';
    filmCtx.fillRect(0, 0, totalW, totalH);

    // 全体上部ヘッダー (製剤名、レオロジー特性、容器規格)
    filmCtx.fillStyle = '#0f172a';
    filmCtx.fillRect(0, 0, totalW, headerH);
    filmCtx.strokeStyle = '#334155';
    filmCtx.lineWidth = 1;
    filmCtx.strokeRect(0, 0, totalW, headerH);

    filmCtx.fillStyle = '#38bdf8';
    filmCtx.font = 'bold 13px "Segoe UI", sans-serif';
    filmCtx.textAlign = 'left';
    filmCtx.fillText(`🧪 化粧品充填プロセス CFD 液体蓄積・ぬれ広がり コマ送りシーケンス (Fluid Accumulation Filmstrip)`, 16, 24);

    filmCtx.fillStyle = '#cbd5e1';
    filmCtx.font = '11px monospace';
    filmCtx.textAlign = 'right';
    const presName = this.currentPreset?.name || '化粧品バルク';
    filmCtx.fillText(`製剤: ${presName} | 容器: ${this.solver.container.name} | τy=${this.solver.tau_y.toFixed(1)}Pa, K=${this.solver.K.toFixed(2)}, n=${this.solver.n.toFixed(2)}`, totalW - 16, 24);

    // 一時シミュレーターを初期化して高速にステップを進めながらキャプチャ
    const tempSolver = new WebGPUSPHSolver(this.simCanvas.width, this.simCanvas.height, 36000);
    tempSolver.setContainer(this.solver.containerType);
    tempSolver.setFillingMode(this.solver.fillingMode);
    tempSolver.setNozzleDiameter(this.solver.nozzleDiameterMm);
    tempSolver.sigma = this.solver.sigma;
    tempSolver.setRheologyParams(this.model);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = this.simCanvas.width;
    offCanvas.height = this.simCanvas.height;
    const offRenderer = new FluidRenderer(offCanvas);
    offRenderer.renderMode = this.renderer.renderMode;

    // クロップ領域: シャーレ容器と液面を最適クローズアップ
    const nx = tempSolver.nozzleX;
    const bottomY = tempSolver.container.bottomY;
    const cropW = Math.max(300, tempSolver.container.width + 50);
    const cropH = cropW * (frameH / frameW);
    const cropX = nx - cropW * 0.5;
    const cropY = bottomY - cropH + 20;

    const dt = 0.003;
    const subSteps = 3;
    let simTime = 0.0;

    for (let targetIdx = 0; targetIdx < numFrames; targetIdx++) {
      const target = sampleTargets[targetIdx];
      const targetParticles = Math.floor(target.ratio * maxCapacity);

      // 目標の液体蓄積量（粒子数）に達するまでシミュレーション進行
      if (targetIdx > 0) {
        if (target.waitExtraSec) {
          // 充填完了後のレベリング時間進行
          const extraSteps = Math.floor(target.waitExtraSec / dt);
          for (let s = 0; s < extraSteps; s++) {
            tempSolver.step(dt, subSteps);
            simTime += dt;
          }
        } else {
          let safetyTimeout = 2500;
          while (tempSolver.numParticles < targetParticles && safetyTimeout-- > 0 && !tempSolver.isFilled) {
            tempSolver.step(dt, subSteps);
            simTime += dt;
          }
        }
      }

      // キャプチャ
      tempSolver._computeFillingProfile();
      offRenderer.render(tempSolver, this.currentPreset);

      const destX = targetIdx * frameW;
      const destY = headerH;

      // コマの背景と枠線
      filmCtx.save();
      filmCtx.drawImage(offCanvas, cropX, cropY, cropW, cropH, destX, destY, frameW, frameH);

      // コマ上部バッジ
      filmCtx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      filmCtx.fillRect(destX + 6, destY + 6, frameW - 12, 24);
      filmCtx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      filmCtx.strokeRect(destX + 6, destY + 6, frameW - 12, 24);

      filmCtx.fillStyle = '#38bdf8';
      filmCtx.font = 'bold 11px sans-serif';
      filmCtx.textAlign = 'left';
      filmCtx.fillText(`${target.label}`, destX + 12, destY + 22);

      filmCtx.fillStyle = '#f8fafc';
      filmCtx.font = '10px monospace';
      filmCtx.textAlign = 'right';
      const actualVol = (tempSolver.numParticles / maxCapacity) * targetVol;
      filmCtx.fillText(`t=${simTime.toFixed(2)}s | ${actualVol.toFixed(1)}mL`, destX + frameW - 12, destY + 22);

      // コマ下部メトリクス
      filmCtx.fillStyle = '#0b111e';
      filmCtx.fillRect(destX, destY + frameH, frameW, footerH);
      filmCtx.strokeStyle = '#1e293b';
      filmCtx.strokeRect(destX, destY + frameH, frameW, footerH);

      filmCtx.fillStyle = '#94a3b8';
      filmCtx.font = '10px sans-serif';
      filmCtx.textAlign = 'center';
      filmCtx.fillText(`蓄積量: ${actualVol.toFixed(1)}mL (${(target.ratio * 100).toFixed(0)}%) | ツノ立ち: ${tempSolver.peakHeightMm.toFixed(1)}mm | 平坦度: ${tempSolver.levelingFlatness.toFixed(0)}%`, destX + frameW * 0.5, destY + frameH + 21);

      // コマ区切り縦線
      filmCtx.strokeStyle = '#334155';
      filmCtx.lineWidth = 1.5;
      filmCtx.beginPath();
      filmCtx.moveTo(destX, 0);
      filmCtx.lineTo(destX, totalH);
      filmCtx.stroke();

      filmCtx.restore();
    }

    const dataUrl = filmCanvas.toDataURL('image/png');

    // モーダル表示
    const modal = document.getElementById('filmstripModal');
    const imgPreview = document.getElementById('filmstripImagePreview');
    const dlBtn = document.getElementById('downloadFilmstripBtn');

    if (imgPreview) imgPreview.src = dataUrl;
    if (modal) modal.style.display = 'flex';

    if (dlBtn) {
      dlBtn.onclick = () => {
        const link = document.createElement('a');
        link.download = `cosmetic_filling_filmstrip_${tempSolver.containerType}_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      };
    }

    // 自動ダウンロードもトリガー
    const autoLink = document.createElement('a');
    autoLink.download = `cosmetic_filling_filmstrip_${tempSolver.containerType}_${Date.now()}.png`;
    autoLink.href = dataUrl;
    autoLink.click();
  }

  _updateUIStats() {
    if (!this.solver) return;

    if (this.solver.testMode === 'sagging') {
      if (this.sagDistanceVal) {
        this.sagDistanceVal.textContent = `${this.solver.sagDistanceMm.toFixed(1)} mm`;
      }
      if (this.sagVelocityVal) {
        this.sagVelocityVal.textContent = `${this.solver.sagVelocityMmS.toFixed(2)} mm/s`;
      }
      if (this.sagStatusVal) {
        if (this.solver.isSagArrested) {
          this.sagStatusVal.innerHTML = '<span style="color:#10b981;font-weight:700;">✅ 降伏停止 (安定)</span>';
        } else {
          this.sagStatusVal.innerHTML = '<span style="color:#f59e0b;font-weight:700;">⚡ たれ進行中</span>';
        }
      }
      if (this.particleCountVal) {
        this.particleCountVal.textContent = this.solver.numParticles.toLocaleString();
      }
      return;
    }

    const fillPct = this.solver.fillPercentage;
    const filledMl = this.solver.filledVolumeMl;
    const targetMl = this.solver.container.targetVolume;

    this.fillProgressText.textContent = `${fillPct.toFixed(1)} % (${filledMl.toFixed(1)} / ${targetMl} mL)`;
    this.fillProgressBar.style.width = `${fillPct}%`;

    if (fillPct >= 100) {
      this.fillProgressBar.style.background = '#10b981';
    } else {
      this.fillProgressBar.style.background = 'linear-gradient(90deg, #0284c7, #38bdf8)';
    }

    this.peakHeightVal.textContent = `${this.solver.peakHeightMm.toFixed(1)} mm`;
    this.flatnessVal.textContent = `${this.solver.levelingFlatness.toFixed(1)} %`;
    this.particleCountVal.textContent = this.solver.numParticles.toLocaleString();
  }

  _loop() {
    if (this.isRunning && this.solver) {
      this.solver.step(0.003, 3);
      this.renderer.render(this.solver, this.currentPreset);
      this._updateUIStats();

      // グラフのリアルタイム更新 (垂れ試験モードまたはL-tタブ表示時)
      if (this.activeChartMode === 'sagging' && this.charts) {
        if (!this._chartFrameCount) this._chartFrameCount = 0;
        this._chartFrameCount++;
        if (this._chartFrameCount % 2 === 0) {
          this.charts.renderSaggingCurve(this.solver, this.model);
        }
      }
    }

    requestAnimationFrame(() => this._loop());
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new CosmeticFillingApp();
  app.init();
});
