import { COSMETIC_PRESETS, RheologyModel, MATERIAL_PALETTES } from './models.js?v=coating_pore_v110';
import { WebGPUSPHSolver, CONTAINER_TYPES } from './sph_solver_webgpu.js?v=coating_pore_v110';
import { FluidRenderer } from './fluid_renderer.js?v=coating_pore_v110';
import { ChartRenderer } from './charts.js?v=coating_pore_v110';
import { PresetManager } from './preset_manager.js?v=coating_pore_v110';

class CosmeticFillingApp {
  constructor() {
    this.presetManager = new PresetManager();
    this.currentPresetId = 'cleansing_oil';
    this.currentPreset = this.presetManager.getPreset(this.currentPresetId) || COSMETIC_PRESETS.cleansing_oil;
    this.model = new RheologyModel(this.currentPreset);

    // テクスチャ・マテリアルパレット管理
    this.activeMaterialCategory = 'cosmetics';
    this.currentMaterialId = this.currentPreset?.materialId || 'cleansing_gold';
    this.currentMaterial = MATERIAL_PALETTES[this.currentMaterialId] || MATERIAL_PALETTES.cleansing_gold;

    this.isRunning = true;
    this.solver = null;
    this.renderer = null;
    this.charts = null;
    this.activeChartMode = 'rheology'; // 'rheology' | 'sagging'

    this._initElements();
    this._rebuildPresetSelectOptions();
    this._initMaterialPalette();
    this._bindEvents();
  }

  _initElements() {
    this.simCanvas = document.getElementById('simCanvas');
    this.cbCanvas = document.getElementById('colorbarCanvas');
    this.rhCanvas = document.getElementById('rheologyCanvas') || document.getElementById('floatRheologyCanvas');

    // グラフカード関連要素 (フォールバック)
    this.tabChartRheoBtn = document.getElementById('tabChartRheoBtn') || document.getElementById('tabFloatRheoBtn');
    this.tabChartSagBtn = document.getElementById('tabChartSagBtn') || document.getElementById('tabFloatSagBtn');
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

    this.floatingControlBar = document.getElementById('floatingControlBar');
    // プリセット管理ボタン
    this.savePresetBtn = document.getElementById('savePresetBtn');
    this.deletePresetBtn = document.getElementById('deletePresetBtn');
    this.exportPresetJsonBtn = document.getElementById('exportPresetJsonBtn');
    this.importPresetJsonBtn = document.getElementById('importPresetJsonBtn');
    this.importJsonInput = document.getElementById('importJsonInput');

    // プリセット保存モーダル要素
    this.savePresetModal = document.getElementById('savePresetModal');
    this.closePresetModalBtn = document.getElementById('closePresetModalBtn');
    this.cancelPresetModalBtn = document.getElementById('cancelPresetModalBtn');
    this.confirmSavePresetBtn = document.getElementById('confirmSavePresetBtn');
    this.modalPresetName = document.getElementById('modalPresetName');
    this.modalPresetDesc = document.getElementById('modalPresetDesc');
    this.modalPresetEmulsion = document.getElementById('modalPresetEmulsion');
    this.modalPresetHlb = document.getElementById('modalPresetHlb');
    this.modalSummaryTauY = document.getElementById('modalSummaryTauY');
    this.modalSummaryK = document.getElementById('modalSummaryK');
    this.modalSummaryN = document.getElementById('modalSummaryN');
    this.modalSummarySigma = document.getElementById('modalSummarySigma');
    this.modalSummaryInletVel = document.getElementById('modalSummaryInletVel');
    this.modalSummaryMaterial = document.getElementById('modalSummaryMaterial');

    // マテリアル・テクスチャパレット関連要素
    this.activeMaterialBadge = document.getElementById('activeMaterialBadge');
    this.materialPaletteContainer = document.getElementById('materialPaletteContainer');
    this.customMaterialColorInput = document.getElementById('customMaterialColorInput');
    this.customMaterialGlossInput = document.getElementById('customMaterialGlossInput');
    this.customMaterialGlossVal = document.getElementById('customMaterialGlossVal');

    // コマ送り静止画（Filmstrip）モーダル関連要素
    this.filmstripParams = {
      startRatio: 0.0,
      endRatio: 1.0,
      frameCount: 7,
      extraTime: 0.8
    };
    this.currentFilmstripDataUrl = null;
    this.filmstripModal = document.getElementById('filmstripModal');
    this.closeFilmstripModalBtn = document.getElementById('closeFilmstripModalBtn');
    this.cancelFilmstripModalBtn = document.getElementById('cancelFilmstripModalBtn');
    this.downloadFilmstripBtn = document.getElementById('downloadFilmstripBtn');
    this.refreshFilmstripPreviewBtn = document.getElementById('refreshFilmstripPreviewBtn');
    this.filmstripImagePreview = document.getElementById('filmstripImagePreview');
    this.filmstripLoadingSpinner = document.getElementById('filmstripLoadingSpinner');
    this.timelineSelectedRange = document.getElementById('timelineSelectedRange');
    this.timelineMarkersContainer = document.getElementById('timelineMarkersContainer');
    this.filmstripTimelineRangeText = document.getElementById('filmstripTimelineRangeText');
    this.fsStartRange = document.getElementById('fsStartRange');
    this.fsStartNum = document.getElementById('fsStartNum');
    this.fsEndRange = document.getElementById('fsEndRange');
    this.fsEndNum = document.getElementById('fsEndNum');
    this.fsFrameCountRange = document.getElementById('fsFrameCountRange');
    this.fsFrameCountNum = document.getElementById('fsFrameCountNum');
    this.fsExtraTimeRange = document.getElementById('fsExtraTimeRange');
    this.fsExtraTimeNum = document.getElementById('fsExtraTimeNum');

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

    // サイドバー ナビゲーションタブ
    this.tabSidebarFluidBtn = document.getElementById('tabSidebarFluidBtn');
    this.tabSidebarContainerBtn = document.getElementById('tabSidebarContainerBtn');
    this.tabSidebarSaggingBtn = document.getElementById('tabSidebarSaggingBtn');
    this.tabSidebarCrownBtn = document.getElementById('tabSidebarCrownBtn');
    this.tabSidebarCoatingBtn = document.getElementById('tabSidebarCoatingBtn');
    this.sidebarTabFluid = document.getElementById('sidebarTabFluid');
    this.sidebarTabContainer = document.getElementById('sidebarTabContainer');
    this.sidebarTabSagging = document.getElementById('sidebarTabSagging');
    this.sidebarTabCrown = document.getElementById('sidebarTabCrown');
    this.sidebarTabCoating = document.getElementById('sidebarTabCoating');

    // 🎨 塗布・引き延ばし試験 (Doctor Blade) 用UI要素
    this.bladeGapInput = document.getElementById('bladeGapInput');
    this.bladeGapVal = document.getElementById('bladeGapVal');
    this.bladeSpeedInput = document.getElementById('bladeSpeedInput');
    this.bladeSpeedVal = document.getElementById('bladeSpeedVal');
    this.coatingSlurryVolInput = document.getElementById('coatingSlurryVolInput');
    this.coatingSlurryVolVal = document.getElementById('coatingSlurryVolVal');
    this.coatingSubstrateSelect = document.getElementById('coatingSubstrateSelect');
    this.coatingRoughDesc = document.getElementById('coatingRoughDesc');
    this.coatingShearRateText = document.getElementById('coatingShearRateText');
    this.coatingViscosityText = document.getElementById('coatingViscosityText');
    this.coatingStressText = document.getElementById('coatingStressText');
    this.coatingWetThicknessText = document.getElementById('coatingWetThicknessText');
    this.coatingQualityBadge = document.getElementById('coatingQualityBadge');
    this.startCoatingBtn = document.getElementById('startCoatingBtn');
    this.resetCoatingBtn = document.getElementById('resetCoatingBtn');
    this.floatCoatingBtn = document.getElementById('floatCoatingBtn');
    this.coatingStats = document.getElementById('coatingStats');
    this.coatingFilmThicknessVal = document.getElementById('coatingFilmThicknessVal');
    this.coatingShearRateVal = document.getElementById('coatingShearRateVal');
    this.coatingViscosityVal = document.getElementById('coatingViscosityVal');
    this.coatingDragForceVal = document.getElementById('coatingDragForceVal');

    // 👑 クラウン試験用UI要素
    this.crownHeightInput = document.getElementById('crownHeightInput');
    this.crownHeightVal = document.getElementById('crownHeightVal');
    this.crownDiameterInput = document.getElementById('crownDiameterInput');
    this.crownDiameterVal = document.getElementById('crownDiameterVal');
    this.crownFilmInput = document.getElementById('crownFilmInput');
    this.crownFilmVal = document.getElementById('crownFilmVal');
    this.crownV0Text = document.getElementById('crownV0Text');
    this.crownWeText = document.getElementById('crownWeText');
    this.crownReText = document.getElementById('crownReText');
    this.crownOhText = document.getElementById('crownOhText');
    this.crownKText = document.getElementById('crownKText');
    this.crownRegimeBadge = document.getElementById('crownRegimeBadge');
    this.dropCrownBtn = document.getElementById('dropCrownBtn');
    this.resetCrownBtn = document.getElementById('resetCrownBtn');

    // 充填容器ドロップダウン & 説明
    this.containerSelect = document.getElementById('containerSelect');
    this.containerInfoDesc = document.getElementById('containerInfoDesc');

    // 充填方式ボタン
    this.modeBottomUpBtn = document.getElementById('modeBottomUpBtn');
    this.modeFixedBtn = document.getElementById('modeFixedBtn');

    // 口径 & 充填条件 (スライダー & 数値入力)
    this.nozzleDiameterInput = document.getElementById('nozzleDiameterInput');
    this.nozzleDiameterNumInput = document.getElementById('nozzleDiameterNumInput');
    this.inletVelInput = document.getElementById('inletVelInput');
    this.inletVelNumInput = document.getElementById('inletVelNumInput');
    this.sigmaInput = document.getElementById('sigmaInput');
    this.sigmaNumInput = document.getElementById('sigmaNumInput');

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

    // レオロジーパラメータ (スライダー & 数値直接入力)
    this.tauYInput = document.getElementById('tauYInput');
    this.tauYNumInput = document.getElementById('tauYNumInput');
    this.kInput = document.getElementById('kInput');
    this.kNumInput = document.getElementById('kNumInput');
    this.nInput = document.getElementById('nInput');
    this.nNumInput = document.getElementById('nNumInput');

    this.fieldSelect = document.getElementById('fieldSelect');
    this.smoothingSelect = document.getElementById('smoothingSelect');

    this.playBtn = document.getElementById('playBtn');
    this.stepBtn = document.getElementById('stepBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.floatDropBtn = document.getElementById('floatDropBtn');
    this.exportBtn = document.getElementById('exportBtn');
    this.exportFilmstripBtn = document.getElementById('exportFilmstripBtn');
    this.shakeContainerBtn = document.getElementById('shakeContainerBtn');
    this.motionSensorBtn = document.getElementById('motionSensorBtn');

    // スマホ加速度・傾きセンサー状態
    this.isMotionSensorActive = false;
    this.lastSensorShakeTime = 0;
    this.hasSensorPermission = false;

    // サイドバー トグル & ドロワー要素
    this.appContainer = document.getElementById('appContainer') || document.querySelector('.app-container');
    this.mainSidebar = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
    this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    this.closeSidebarMobileBtn = document.getElementById('closeSidebarMobileBtn');
    this.sidebarBackdrop = document.getElementById('sidebarBackdrop');
    this.isSidebarOpen = false;

    // 右サイドバー ON/OFF トグル
    this.toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
    this.rightSidebarStateText = document.getElementById('rightSidebarStateText');
    this.isRightSidebarVisible = true;

    // フローティングダイアログ開閉ボタン
    this.openRheoFloatBtn = document.getElementById('openRheoFloatBtn');
    this.openSagFloatBtn = document.getElementById('openSagFloatBtn');
    this.openCoatingFloatBtn = document.getElementById('openCoatingFloatBtn');
    this.openDocDialogBtn = document.getElementById('openDocDialogBtn');
    this.openChartDialogBtn = document.getElementById('openChartDialogBtn');
    this.toggleFloatChartBtn = document.getElementById('toggleFloatChartBtn');

    // 1. 📈 統合フローティンググラフダイアログ要素
    this.floatingChartDialog = document.getElementById('floatingChartDialog');
    this.floatingChartHeader = document.getElementById('floatingChartHeader');
    this.closeFloatChartBtn = document.getElementById('closeFloatChartBtn');
    this.tabFloatRheoBtn = document.getElementById('tabFloatRheoBtn');
    this.tabFloatSagBtn = document.getElementById('tabFloatSagBtn');
    this.tabFloatCoatingBtn = document.getElementById('tabFloatCoatingBtn');
    this.tabFloatParamBtn = document.getElementById('tabFloatParamBtn');
    this.floatPanelRheo = document.getElementById('floatPanelRheo');
    this.floatPanelSag = document.getElementById('floatPanelSag');
    this.floatPanelCoating = document.getElementById('floatPanelCoating');
    this.floatPanelParam = document.getElementById('floatPanelParam');
    this.floatRheologyCanvas = document.getElementById('floatRheologyCanvas');
    this.floatRheologyFormulaBadge = document.getElementById('floatRheologyFormulaBadge');
    this.floatSaggingCanvas = document.getElementById('floatSaggingCanvas');
    this.floatSagInfoBadge = document.getElementById('floatSagInfoBadge');
    this.floatCoatingCanvas = document.getElementById('floatCoatingCanvas');
    this.floatCoatingInfoBadge = document.getElementById('floatCoatingInfoBadge');

    // 2. 📖 学術解説ダイアログ要素
    this.floatingDocDialog = document.getElementById('floatingDocDialog');
    this.floatingDocHeader = document.getElementById('floatingDocHeader');
    this.closeFloatDocBtn = document.getElementById('closeFloatDocBtn');
    this.floatDocContent = document.getElementById('floatDocContent');

    // 解説カテゴリ切り替え
    this.docCategorySelect = document.getElementById('docCategorySelect');
  }

  async init() {
    this._resizeCanvases();

    // SPH ソルバー & レンダラー初期化
    this.solver = new WebGPUSPHSolver(this.simCanvas.width, this.simCanvas.height, 36000);
    this.renderer = new FluidRenderer(this.simCanvas);
    if (this.smoothingSelect) {
      this.renderer.smoothingMode = this.smoothingSelect.value || 'laplacian';
    }
    this.charts = new ChartRenderer(this.cbCanvas, this.floatRheologyCanvas || this.rhCanvas, null);

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

    // 画面幅に応じた初期サイドバー開閉同期
    this.isSidebarOpen = (window.innerWidth > 900);
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.classList.toggle('btn-active', this.isSidebarOpen);
    }

    this._loop();
  }

  _resizeCanvases() {
    if (this.simCanvas) {
      const rect = this.simCanvas.getBoundingClientRect();
      const w = Math.round(rect.width) || this.simCanvas.clientWidth || 960;
      const h = Math.round(rect.height) || this.simCanvas.clientHeight || 640;
      this.simCanvas.width = w;
      this.simCanvas.height = h;

      if (this.solver) {
        this.solver.resize(w, h);
      }
      if (this.renderer) {
        this.renderer.resize();
      }

      // フローティング操作バーの自動アイコン化 (はみ出し防止)
      if (this.floatingControlBar) {
        if (w < 840) {
          this.floatingControlBar.classList.add('compact-icons');
        } else {
          this.floatingControlBar.classList.remove('compact-icons');
          if (this.floatingControlBar.scrollWidth > w - 24) {
            this.floatingControlBar.classList.add('compact-icons');
          }
        }
      }
    }

    if (this.cbCanvas) {
      const cbRect = this.cbCanvas.getBoundingClientRect();
      this.cbCanvas.width = Math.round(cbRect.width) || 80;
      this.cbCanvas.height = this.simCanvas ? this.simCanvas.height : 640;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.rhCanvas) {
      const rw = this.rhCanvas.clientWidth || 370;
      const rh = 340;
      this.rhCanvas.width = Math.round(rw * dpr);
      this.rhCanvas.height = Math.round(rh * dpr);
    }

    if (this.floatRheologyCanvas) {
      const frw = this.floatRheologyCanvas.clientWidth || 430;
      const frh = 260;
      this.floatRheologyCanvas.width = Math.round(frw * dpr);
      this.floatRheologyCanvas.height = Math.round(frh * dpr);
    }

    if (this.floatSaggingCanvas) {
      const fsw = this.floatSaggingCanvas.clientWidth || 430;
      const fsh = 260;
      this.floatSaggingCanvas.width = Math.round(fsw * dpr);
      this.floatSaggingCanvas.height = Math.round(fsh * dpr);
    }
  }

  _rebuildPresetSelectOptions() {
    if (!this.presetSelect) return;
    const currentVal = this.currentPresetId;
    this.presetSelect.innerHTML = '';

    // 1. 組み込みデフォルトプリセットグループ
    const defaultGroup = document.createElement('optgroup');
    defaultGroup.label = '── 組み込み処方プリセット ──';
    for (const key in COSMETIC_PRESETS) {
      const p = COSMETIC_PRESETS[key];
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === currentVal) opt.selected = true;
      defaultGroup.appendChild(opt);
    }
    this.presetSelect.appendChild(defaultGroup);

    // 2. カスタム保存プリセットグループ
    const customPresets = this.presetManager.customPresets;
    const customKeys = Object.keys(customPresets);
    if (customKeys.length > 0) {
      const customGroup = document.createElement('optgroup');
      customGroup.label = '── 保存済みカスタム処方 (キャッシュ) ──';
      for (const key of customKeys) {
        const p = customPresets[key];
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `⭐ ${p.name}`;
        if (p.id === currentVal) opt.selected = true;
        customGroup.appendChild(opt);
      }
      this.presetSelect.appendChild(customGroup);
    }
  }

  /**
   * テクスチャ・マテリアルパレットの初期化とイベントバインド
   */
  _initMaterialPalette() {
    // カテゴリ切り替えタブ
    const catBtns = document.querySelectorAll('.material-cat-btn');
    catBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeMaterialCategory = btn.dataset.cat || 'cosmetics';
        this._renderMaterialPalette(this.activeMaterialCategory);
      });
    });

    // 初回レンダリング
    this._renderMaterialPalette(this.activeMaterialCategory);

    // カスタム調色カラーピッカー
    if (this.customMaterialColorInput) {
      this.customMaterialColorInput.addEventListener('input', (e) => {
        this._onCustomMaterialChanged();
      });
    }

    // カスタム光沢度スライダー
    if (this.customMaterialGlossInput) {
      this.customMaterialGlossInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0.65;
        if (this.customMaterialGlossVal) this.customMaterialGlossVal.textContent = val.toFixed(2);
        this._onCustomMaterialChanged();
      });
    }
  }

  /**
   * 指定カテゴリのマテリアル一覧をパレットに描画
   */
  _renderMaterialPalette(category = 'cosmetics') {
    if (!this.materialPaletteContainer) return;
    this.materialPaletteContainer.innerHTML = '';

    const items = Object.values(MATERIAL_PALETTES).filter(m => m.category === category);
    for (const item of items) {
      const el = document.createElement('div');
      el.className = `material-swatch-item ${this.currentMaterialId === item.id ? 'active' : ''}`;
      el.title = `${item.name}\n${item.desc}\n(光沢度: ${item.gloss})`;

      // カラーサークル
      const [r, g, b] = item.color;
      const circle = document.createElement('div');
      circle.className = 'material-color-circle';
      circle.style.background = `radial-gradient(circle at 35% 35%, rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)}), rgb(${r}, ${g}, ${b}) 70%, rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}))`;

      // 名前ラベル
      const name = document.createElement('span');
      name.className = 'material-swatch-name';
      name.textContent = `${item.icon} ${item.name.split(' ')[0]}`;

      el.appendChild(circle);
      el.appendChild(name);

      el.addEventListener('click', () => {
        this._selectMaterial(item.id);
      });

      this.materialPaletteContainer.appendChild(el);
    }
  }

  /**
   * パレットからマテリアルを選択
   */
  _selectMaterial(materialId, isFromPreset = false) {
    const item = MATERIAL_PALETTES[materialId];
    if (!item) return;

    this.currentMaterialId = materialId;
    this.currentMaterial = { ...item };

    if (this.renderer) {
      this.renderer.activeMaterial = this.currentMaterial;
    }

    // UIバッジ更新
    if (this.activeMaterialBadge) {
      this.activeMaterialBadge.textContent = `${item.icon} ${item.name.split(' ')[0]}`;
      this.activeMaterialBadge.title = item.desc;
    }

    // カラーピッカー & 光沢度を同期
    const [r, g, b] = item.color;
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    if (this.customMaterialColorInput) this.customMaterialColorInput.value = hex;
    if (this.customMaterialGlossInput) this.customMaterialGlossInput.value = item.gloss;
    if (this.customMaterialGlossVal) this.customMaterialGlossVal.textContent = item.gloss.toFixed(2);

    // カテゴリタブの同期 (プリセット適用時など)
    if (isFromPreset && item.category && item.category !== this.activeMaterialCategory) {
      this.activeMaterialCategory = item.category;
      document.querySelectorAll('.material-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === item.category);
      });
      this._renderMaterialPalette(this.activeMaterialCategory);
    } else {
      // パレット内のアクティブクラス更新
      document.querySelectorAll('.material-swatch-item').forEach(el => {
        const isMatch = el.title.includes(item.name);
        el.classList.toggle('active', isMatch);
      });
    }

    // シミュレーション再描画
    if (this.renderer && this.solver) {
      this.renderer.render(this.solver, this.currentPreset);
    }
  }

  /**
   * ユーザーによるカラーピッカー / 光沢スライダー操作のカスタム調色
   */
  _onCustomMaterialChanged() {
    if (!this.customMaterialColorInput) return;

    const hex = this.customMaterialColorInput.value;
    const gloss = parseFloat(this.customMaterialGlossInput?.value) || 0.65;

    // hex -> rgb
    const r = parseInt(hex.slice(1, 3), 16) || 250;
    const g = parseInt(hex.slice(3, 5), 16) || 250;
    const b = parseInt(hex.slice(5, 7), 16) || 250;

    this.currentMaterialId = 'custom';
    this.currentMaterial = {
      id: 'custom',
      name: 'カスタム調色ペースト',
      icon: '🎨',
      color: [r, g, b],
      gloss: gloss,
      alpha: 0.96,
      desc: `カスタム調色 (RGB: ${r},${g},${b}, 光沢度: ${gloss.toFixed(2)})`
    };

    if (this.renderer) {
      this.renderer.activeMaterial = this.currentMaterial;
    }

    if (this.activeMaterialBadge) {
      this.activeMaterialBadge.textContent = '🎨 カスタム調色';
    }

    document.querySelectorAll('.material-swatch-item').forEach(el => el.classList.remove('active'));

    if (this.renderer && this.solver) {
      this.renderer.render(this.solver, this.currentPreset);
    }
  }

  _applyPreset(presetId) {
    const p = this.presetManager.getPreset(presetId) || COSMETIC_PRESETS[presetId];
    if (!p) return;

    this.currentPresetId = presetId;
    this.currentPreset = p;
    this.model = new RheologyModel(p);

    // プリセットに紐づくマテリアルテクスチャの自動同期
    const targetMatId = p.materialId || 'cream_white';
    this._selectMaterial(targetMatId, true);

    if (this.tauYInput) this.tauYInput.value = p.tau_y;
    if (this.tauYNumInput) this.tauYNumInput.value = p.tau_y;

    if (this.kInput) this.kInput.value = p.K;
    if (this.kNumInput) this.kNumInput.value = p.K;

    if (this.nInput) this.nInput.value = p.n;
    if (this.nNumInput) this.nNumInput.value = p.n;

    if (this.inletVelInput && p.inlet_vel !== undefined) this.inletVelInput.value = p.inlet_vel;
    if (this.inletVelNumInput && p.inlet_vel !== undefined) this.inletVelNumInput.value = p.inlet_vel;

    if (this.sigmaInput && p.sigma !== undefined) this.sigmaInput.value = p.sigma;
    if (this.sigmaNumInput && p.sigma !== undefined) this.sigmaNumInput.value = p.sigma;

    if (this.presetDesc) {
      this.presetDesc.textContent = p.desc || 'カスタムレオロジーパラメータ';
    }

    // 削除ボタンの表示/非表示 (カスタムプリセットのみ削除可能)
    if (this.deletePresetBtn) {
      this.deletePresetBtn.style.display = p.isCustom ? 'inline-block' : 'none';
    }

    // どのプリセットでも超薄平皿（シャーレ）をデフォルトに設定
    this._selectContainer('petri_dish');

    this._syncParams();

    // 放置試験・クラウン試験モード時は液滴を再滴下
    if (this.solver && this.solver.testMode === 'sagging') {
      this.solver.dropLiquid();
    } else if (this.solver && this.solver.testMode === 'crown') {
      this.solver.dropCrownLiquid();
    }
  }

  _selectContainer(containerId) {
    if (!this.solver || !CONTAINER_TYPES[containerId]) return;

    this.solver.setContainer(containerId);

    // ドロップダウン選択値の同期
    if (this.containerSelect && this.containerSelect.value !== containerId) {
      this.containerSelect.value = containerId;
    }

    // 容器説明文の動的更新
    if (this.containerInfoDesc) {
      const descMap = {
        petri_dish: '全面ぬれ広がり・薄膜レベリング評価に最適な超薄平皿ガラスシャーレ (Φ80×H7, 20 mL)。',
        jar: '高粘度クリームの山立ち・巻き込み気泡評価に適した広口ジャー容器 (Φ45×H22, 50 mL)。',
        bottle: 'さらさら化粧水や美容液の液面直上追従充填に適した細長ボトル (Φ23×H36, 40 mL)。',
        lipstick: '高降伏応力固形ゲルの充填・ボイド発生評価に適した細径円管 (Φ12×H45, 15 mL)。',
        compact: '乳化ファンデーションやパクト用ペーストの充填に適した浅型皿 (Φ60×H13, 35 mL)。'
      };
      this.containerInfoDesc.textContent = descMap[containerId] || '充填対象のパッケージ容器規格';
    }

    document.querySelectorAll('[data-container]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.container === containerId);
    });

    this._updateCaption();
  }

  /**
   * サイドバー項目別ナビゲーションタブの切り替え
   * @param {'fluid'|'container'|'sagging'|'crown'|'coating'} tabName 
   */
  _switchSidebarTab(tabName) {
    // タブボタンのアクティブ表示切り替え
    if (this.tabSidebarFluidBtn) this.tabSidebarFluidBtn.classList.toggle('active', tabName === 'fluid');
    if (this.tabSidebarContainerBtn) this.tabSidebarContainerBtn.classList.toggle('active', tabName === 'container');
    if (this.tabSidebarSaggingBtn) this.tabSidebarSaggingBtn.classList.toggle('active', tabName === 'sagging');
    if (this.tabSidebarCrownBtn) this.tabSidebarCrownBtn.classList.toggle('active', tabName === 'crown');
    if (this.tabSidebarCoatingBtn) this.tabSidebarCoatingBtn.classList.toggle('active', tabName === 'coating');

    // タブパネルの表示・非表示切り替え
    if (this.sidebarTabFluid) this.sidebarTabFluid.style.display = (tabName === 'fluid') ? 'flex' : 'none';
    if (this.sidebarTabContainer) this.sidebarTabContainer.style.display = (tabName === 'container') ? 'flex' : 'none';
    if (this.sidebarTabSagging) this.sidebarTabSagging.style.display = (tabName === 'sagging') ? 'flex' : 'none';
    if (this.sidebarTabCrown) this.sidebarTabCrown.style.display = (tabName === 'crown') ? 'flex' : 'none';
    if (this.sidebarTabCoating) this.sidebarTabCoating.style.display = (tabName === 'coating') ? 'flex' : 'none';

    // 評価モード（充填 / たれ試験 / クラウン試験 / 塗布試験）との連動
    if (tabName === 'sagging') {
      if (this.solver && this.solver.testMode !== 'sagging') {
        this._switchTestMode('sagging', false);
      }
    } else if (tabName === 'crown') {
      if (this.solver && this.solver.testMode !== 'crown') {
        this._switchTestMode('crown', false);
      }
    } else if (tabName === 'coating') {
      if (this.solver && this.solver.testMode !== 'coating') {
        this._switchTestMode('coating', false);
      }
    } else {
      if (this.solver && this.solver.testMode !== 'filling') {
        this._switchTestMode('filling', false);
      }
    }
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
      this._syncFloatingCharts();
    }

    if (this.rheologyFormulaBadge && this.model) {
      const presName = this.currentPreset?.name?.split(' ')[0] || '評価流体';
      const formulaStr = `<strong>${presName}</strong>: τ = ${this.model.tau_y.toFixed(1)} + ${this.model.K.toFixed(2)}·γ̇<sup>${this.model.n.toFixed(2)}</sup> &nbsp;[Pa]`;
      this.rheologyFormulaBadge.innerHTML = formulaStr;
      if (this.floatRheologyFormulaBadge) {
        this.floatRheologyFormulaBadge.innerHTML = formulaStr;
      }
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
    if (this.solver.testMode === 'coating') {
      this.viewportCaption.textContent = `🎨 ドクターブレード塗布・引き延ばし試験: ギャップ h = ${this.solver.bladeGapUm} μm / 走査速度 V = ${this.solver.bladeSpeedMmS} mm/s (${this.currentPreset.name}, 降伏応力 τ_y = ${this.solver.tau_y.toFixed(1)} Pa)`;
    } else if (this.solver.testMode === 'crown') {
      this.viewportCaption.textContent = `👑 ミルククラウン試験 (液滴落下衝突): 滴下高さ ${this.solver.crownDropHeightMm} mm / 液滴径 φ${this.solver.crownDropDiameterMm.toFixed(1)} mm / 液膜 ${this.solver.crownFilmThicknessMm.toFixed(1)} mm (${this.currentPreset.name}, 表面張力 σ = ${this.solver.sigma.toFixed(1)} mN/m)`;
    } else if (this.solver.testMode === 'sagging') {
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
    const tabKey = (mode === 'sagging') ? 'sag' : 'rheo';
    this._switchFloatChartTab(tabKey);
  }

  /**
   * 統合フローティンググラフウィンドウ内のタブ切り替え
   * @param {'rheo'|'sag'|'coating'|'param'} tabKey 
   */
  _switchFloatChartTab(tabKey = 'rheo') {
    if (this.tabFloatRheoBtn) this.tabFloatRheoBtn.classList.toggle('active', tabKey === 'rheo');
    if (this.tabFloatSagBtn) this.tabFloatSagBtn.classList.toggle('active', tabKey === 'sag');
    if (this.tabFloatCoatingBtn) this.tabFloatCoatingBtn.classList.toggle('active', tabKey === 'coating');
    if (this.tabFloatParamBtn) this.tabFloatParamBtn.classList.toggle('active', tabKey === 'param');

    // タブボタンのアクティブ色
    [this.tabFloatRheoBtn, this.tabFloatSagBtn, this.tabFloatCoatingBtn, this.tabFloatParamBtn].forEach(btn => {
      if (!btn) return;
      const isActive = btn.dataset.charttab === tabKey;
      btn.style.background = isActive ? '#0284c7' : 'transparent';
      btn.style.color = isActive ? '#fff' : '#94a3b8';
    });

    if (this.floatPanelRheo) this.floatPanelRheo.style.display = (tabKey === 'rheo') ? 'flex' : 'none';
    if (this.floatPanelSag) this.floatPanelSag.style.display = (tabKey === 'sag') ? 'flex' : 'none';
    if (this.floatPanelCoating) this.floatPanelCoating.style.display = (tabKey === 'coating') ? 'flex' : 'none';
    if (this.floatPanelParam) this.floatPanelParam.style.display = (tabKey === 'param') ? 'flex' : 'none';

    this._syncFloatingCharts();
  }

  /**
   * 統合フローティンググラフダイアログの表示/非表示トグル
   */
  _toggleFloatingChart() {
    if (!this.floatingChartDialog) return;
    const isVisible = this.floatingChartDialog.style.display !== 'none';
    if (isVisible) {
      this._closeFloatingDialog(this.floatingChartDialog);
    } else {
      this._openFloatingDialog(this.floatingChartDialog);
      // モードに応じた初期タブのインテリジェント自動選択
      if (this.solver && this.solver.testMode === 'coating') {
        this._switchFloatChartTab('coating');
      } else if (this.solver && this.solver.testMode === 'sagging') {
        this._switchFloatChartTab('sag');
      }
    }
  }

  /**
   * フローティングダイアログ内のキャンバスを更新
   */
  _syncFloatingCharts() {
    if (!this.charts) return;

    if (this.floatingChartDialog && this.floatingChartDialog.style.display !== 'none') {
      // レオロジータブ表示中
      if (this.floatPanelRheo && this.floatPanelRheo.style.display !== 'none' && this.floatRheologyCanvas) {
        this.charts.renderRheologyCurve(this.model, this.floatRheologyCanvas);
      }
      // タレ試験タブ表示中
      if (this.floatPanelSag && this.floatPanelSag.style.display !== 'none' && this.floatSaggingCanvas && this.solver) {
        this.charts.renderSaggingCurve(this.solver, this.model, this.floatSaggingCanvas);
        if (this.floatSagInfoBadge) {
          const geom = this.solver.getPlateGeometry();
          this.floatSagInfoBadge.textContent = `傾斜板放置試験: θ = ${geom.angleDeg.toFixed(0)}° / ${this.solver.substrateType.toUpperCase()}基板 (滴下量: ${this.solver.dropVolumeMl.toFixed(1)} mL)`;
        }
      }
      // 塗膜均一性タブ表示中
      if (this.floatPanelCoating && this.floatPanelCoating.style.display !== 'none' && this.floatCoatingCanvas && this.solver) {
        this.charts.renderCoatingProfileChart(this.solver, this.floatCoatingCanvas);
        if (this.floatCoatingInfoBadge) {
          const theo = this.solver.getCoatingTheoreticalMetrics();
          this.floatCoatingInfoBadge.textContent = `ドクターブレード塗布試験: 設定隙間 h_gap = ${this.solver.bladeGapUm.toFixed(0)} μm / 速度 ${this.solver.bladeSpeedMmS.toFixed(0)} mm/s (理論膜厚: ${theo.wetThicknessUm.toFixed(1)} μm)`;
        }
      }
    }
  }

  /**
   * 左サイドバー (処方・充填パラメータ) のドロワー開閉 / 折りたたみトグル
   */
  _toggleSidebar(forceState) {
    const isMobile = window.innerWidth <= 900;
    if (typeof forceState === 'boolean') {
      this.isSidebarOpen = forceState;
    } else {
      this.isSidebarOpen = !this.isSidebarOpen;
    }

    if (isMobile) {
      if (this.mainSidebar) {
        this.mainSidebar.classList.toggle('drawer-open', this.isSidebarOpen);
      }
      if (this.sidebarBackdrop) {
        this.sidebarBackdrop.classList.toggle('active', this.isSidebarOpen);
      }
    } else {
      if (this.appContainer) {
        this.appContainer.classList.toggle('sidebar-collapsed', !this.isSidebarOpen);
      }
      setTimeout(() => {
        this._resizeCanvases();
        if (this.renderer && this.solver) {
          this.renderer.render(this.solver, this.currentPreset);
        }
      }, 260);
    }

    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.classList.toggle('btn-active', this.isSidebarOpen);
    }
  }

  /**
   * 右サイドバー (グラフ・物性・解説パネル) の表示/非表示トグル
   */
  _toggleRightSidebar() {
    this.isRightSidebarVisible = !this.isRightSidebarVisible;
    if (this.appContainer) {
      this.appContainer.classList.toggle('hide-right-sidebar', !this.isRightSidebarVisible);
    }
    if (this.rightSidebarStateText) {
      this.rightSidebarStateText.textContent = this.isRightSidebarVisible ? 'ON' : 'OFF';
      this.rightSidebarStateText.style.color = this.isRightSidebarVisible ? '#34d399' : '#94a3b8';
    }
    // ビューポートサイズ変更に伴うキャンバスリサイズ
    setTimeout(() => {
      this._resizeCanvases();
      if (this.renderer && this.solver) {
        this.renderer.render(this.solver, this.currentPreset);
      }
    }, 50);
  }

  /**
   * 指定したダイアログを画面上の一番上に開く
   */
  _openFloatingDialog(dialogEl) {
    if (!dialogEl) return;
    dialogEl.style.display = 'block';
    this._bringToFront(dialogEl);

    // グラフ更新
    if (dialogEl === this.floatingChartDialog) {
      this._syncFloatingCharts();
    } else if (dialogEl === this.floatingDocDialog) {
      this._renderFloatDoc('non_newtonian');
    }
  }

  _closeFloatingDialog(dialogEl) {
    if (dialogEl) dialogEl.style.display = 'none';
  }

  _bringToFront(dialogEl) {
    document.querySelectorAll('.draggable-dialog').forEach(el => {
      el.style.zIndex = '100';
    });
    if (dialogEl) dialogEl.style.zIndex = '120';
  }

  /**
   * サイドバー各設定カードのアコーディオン開閉トグルを初期化
   */
  _setupAccordionSections() {
    document.querySelectorAll('.panel-section.accordion-collapsible').forEach(section => {
      const title = section.querySelector('.section-title');
      if (!title) return;

      title.addEventListener('click', (e) => {
        // ボタンや入力欄、リンクがクリックされた場合は開閉しない
        if (e.target.closest('button, input, select, a, textarea')) return;

        section.classList.toggle('collapsed');
      });
    });
  }

  /**
   * ダイアログをドラッグ移動可能にする共通ハンドラ
   */
  _makeDraggable(dialogEl, headerEl) {
    if (!dialogEl || !headerEl) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    dialogEl.addEventListener('mousedown', () => {
      this._bringToFront(dialogEl);
    });

    headerEl.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('dialog-close-btn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = dialogEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = Math.max(10, Math.min(window.innerWidth - dialogEl.offsetWidth - 10, initialLeft + dx));
        let newTop = Math.max(60, Math.min(window.innerHeight - dialogEl.offsetHeight - 10, initialTop + dy));

        dialogEl.style.left = `${newLeft}px`;
        dialogEl.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * 解説カテゴリの切り替え (右サイドバー & フロートダイアログ)
   */
  _switchDocCategory(categoryKey) {
    const docItems = {
      non_newtonian: document.getElementById('docNonNewtonian'),
      sph: document.getElementById('docSPH'),
      filling_mechanics: document.getElementById('docFilling'),
      sagging_mechanics: document.getElementById('docSagging')
    };

    for (const key in docItems) {
      if (docItems[key]) {
        docItems[key].style.display = (key === categoryKey) ? 'block' : 'none';
      }
    }

    if (this.docCategorySelect && this.docCategorySelect.value !== categoryKey) {
      this.docCategorySelect.value = categoryKey;
    }
  }

  _renderFloatDoc(categoryKey = 'non_newtonian') {
    if (!this.floatDocContent) return;

    // タブボタンのアクティブ状態を更新
    document.querySelectorAll('.float-doc-tab-btn').forEach(btn => {
      const isMatch = btn.dataset.doctab === categoryKey;
      btn.classList.toggle('active', isMatch);
      btn.style.background = isMatch ? '#0284c7' : 'transparent';
      btn.style.color = isMatch ? '#fff' : '#94a3b8';
    });

    const docContents = {
      non_newtonian: `
        <h4 style="color:#38bdf8; margin:0 0 8px 0; font-size:0.9rem;">🧪 非ニュートン流体のレオロジー力学</h4>
        <p style="margin-bottom:8px;">
          化粧品・食品・塗料などの濃厚ペーストは、せん断速度 &gamma;&#775; によって粘度が非線形に変化する<strong>非ニュートン流体 (Non-Newtonian Fluid)</strong> です。本シミュレーターでは最も汎用性の高い<strong>ハーシェル・バルクリー (Herschel-Bulkley: HB) モデル</strong>を採用しています。
        </p>
        <div style="background:rgba(0,0,0,0.5); padding:8px 10px; border-radius:6px; border:1px solid rgba(56,189,248,0.3); margin-bottom:8px; font-family:'Times New Roman', serif;">
          <strong style="color:#38bdf8;">【構成方程式】</strong><br>
          &tau; = &tau;<sub>y</sub> + K &middot; &gamma;&#775;<sup>n</sup> &nbsp; (&tau; &gt; &tau;<sub>y</sub>)<br>
          &eta;(&gamma;&#775;) = &tau; / &gamma;&#775; = &tau;<sub>y</sub> / &gamma;&#775; + K &middot; &gamma;&#775;<sup>n - 1</sup>
        </div>
        <ul style="padding-left:18px; margin:0 0 8px 0; line-height:1.6;">
          <li><strong style="color:#ef4444;">降伏応力 &tau;<sub>y</sub> [Pa]:</strong> 流動を開始させるのに必要な最小せん断応力。ツノ立ちや垂れ防止に寄与。</li>
          <li><strong style="color:#38bdf8;">粘性係数 K [Pa&middot;s<sup>n</sup>]:</strong> 流体のベースとなる粘稠度。</li>
          <li><strong style="color:#a78bfa;">流動特性指数 n [-]:</strong> n &lt; 1 で擬塑性（シアシニング）、n = 1 でビンガム塑性、n &gt; 1 でダイラタント（シアシックニング）。</li>
        </ul>
        <div style="font-size:0.73rem; color:#94a3b8; background:rgba(255,255,255,0.03); padding:6px; border-radius:4px;">
          ※ 数値計算上の特異点（&gamma;&#775; &rarr; 0 での見かけ粘度無限大発散）は、<strong>Papanastasiou正則化</strong>によって平滑化し、未流動コア（プラグ領域）の剛体挙動を安定に再現しています。
        </div>
      `,
      sph: `
        <h4 style="color:#38bdf8; margin:0 0 8px 0; font-size:0.9rem;">🌊 SPH粒子法 (Smoothed Particle Hydrodynamics)</h4>
        <p style="margin-bottom:8px;">
          SPH法は格子（メッシュ）を用いずに、流体を有限個の離散粒子として追跡する<strong>ラグランジュ型（粒子追跡型）連続体流体力学手法</strong>です。激しい自由表面の大変形、液滴分裂、巻き込み、壁面衝突を安定かつ高精度に追跡できます。
        </p>
        <div style="background:rgba(0,0,0,0.5); padding:8px 10px; border-radius:6px; border:1px solid rgba(56,189,248,0.3); margin-bottom:8px; font-family:'Times New Roman', serif;">
          <strong style="color:#38bdf8;">【カーネル関数近似と運動方程式】</strong><br>
          A(r<sub>i</sub>) &approx; &Sigma;<sub>j</sub> m<sub>j</sub> (A<sub>j</sub> / &rho;<sub>j</sub>) W(|r<sub>i</sub> - r<sub>j</sub>|, h)<br>
          Dv<sub>i</sub> / Dt = - &Sigma;<sub>j</sub> m<sub>j</sub> (p<sub>i</sub>/&rho;<sub>i</sub><sup>2</sup> + p<sub>j</sub>/&rho;<sub>j</sub><sup>2</sup>) &nabla;W<sub>ij</sub> + &Sigma;<sub>j</sub> [m<sub>j</sub>(&eta;<sub>i</sub>+&eta;<sub>j</sub>)/(&rho;<sub>i</sub>&rho;<sub>j</sub>)] [r<sub>ij</sub>&middot;&nabla;W<sub>ij</sub> / (|r<sub>ij</sub>|<sup>2</sup> + 0.01h<sup>2</sup>)] v<sub>ij</sub> + g + F<sub>&sigma;</sub>
        </div>
        <ul style="padding-left:18px; margin:0 0 8px 0; line-height:1.6;">
          <li><strong>カーネル関数 W(r,h):</strong> スムージング半径 h 内の近傍粒子からの影響度を滑らかに補間。</li>
          <li><strong>状態方程式 (WCSPH):</strong> わずかな体積変化を許容する準非圧縮 Tait の状態方程式で圧力を高速求解。</li>
          <li><strong>表面張力 F<sub>&sigma;</sub> (CSFモデル):</strong> 色関数勾配と界面曲率から求まる毛管力・界面自由エネルギーを付加。</li>
          <li><strong>Taubin表面平滑化:</strong> 粒子表面の凹凸（粒感）を体積収縮なしに平滑化し、高品位なCG質感を生成。</li>
        </ul>
      `,
      filling_mechanics: `
        <h4 style="color:#38bdf8; margin:0 0 8px 0; font-size:0.9rem;">🧴 化粧品充填プロセスの流体力学</h4>
        <p style="margin-bottom:8px;">
          化粧品ペーストの高速充填ラインでは、<strong>「巻き込み気泡（エアボイド）の防止」</strong>と<strong>「液ハネ・サージ圧の抑制」</strong>、そして<strong>「均一なレベリング（表面平坦化）」</strong>が製品品質の決定要因となります。
        </p>
        <div style="background:rgba(0,0,0,0.5); padding:8px 10px; border-radius:6px; border:1px solid rgba(56,189,248,0.3); margin-bottom:8px;">
          <strong style="color:#38bdf8;">【ボトムアップ昇降ノズルのメカニズム】</strong><br>
          容器底部までノズルを降下させて注入を開始し、<strong>上昇する液面直上（1〜3 mm）を追従しながら引き上げる</strong>ことで、自由落下による衝撃・液ハネをゼロにし、界面巻き込み気泡を根絶します。
        </div>
        <ul style="padding-left:18px; margin:0 0 8px 0; line-height:1.6;">
          <li><strong>ツノ立ち (Peaking):</strong> ノズル離脱時の高せん断から静止時の未流動化への転移。降伏応力 &tau;<sub>y</sub> が高いとツノが保持されます。</li>
          <li><strong>レベリング (Leveling):</strong> 表面張力 &sigma; と自重重力による平坦化プロセス。降伏応力 &tau;<sub>y</sub> を超える応力がある間のみ平坦化が進行します。</li>
          <li><strong>ボイド発生リスク:</strong> 固定トップダウン注入では、落下噴流が滞留液面に衝突する際のキャビテーションにより気泡が混入します。</li>
        </ul>
      `,
            sagging_mechanics: `
        <h4 style="color:#38bdf8; margin:0 0 8px 0; font-size:0.9rem;">📐 傾斜板・垂直板放置試験 (たれ力学)</h4>
        <p style="margin-bottom:8px;">
          肌や垂直壁面に塗布・滴下されたペーストが自重によって流下する現象を評価する試験です。自重せん断応力が降伏応力 &tau;<sub>y</sub> を下回る膜厚になると、<strong>自立的にたれが完全停止</strong>します。
        </p>
        <div style="background:rgba(0,0,0,0.5); padding:8px 10px; border-radius:6px; border:1px solid rgba(56,189,248,0.3); margin-bottom:8px; font-family:'Times New Roman', serif;">
          <strong style="color:#38bdf8;">【臨界停止膜厚 (Critical Thickness)】</strong><br>
          自重せん断駆動力: &tau;<sub>g</sub> = &rho; &middot; g &middot; sin&theta; &middot; h<br>
          臨界停止膜厚: h<sub>c</sub> = &tau;<sub>y</sub> / (&rho; &middot; g &middot; sin&theta;)
        </div>
        <ul style="padding-left:18px; margin:0 0 8px 0; line-height:1.6;">
          <li><strong>停止条件 (h &le; h<sub>c</sub>):</strong> 膜厚 h が臨界膜厚 h<sub>c</sub> 以下になると、&tau;<sub>g</sub> &le; &tau;<sub>y</sub> となり流動が完全停止。</li>
          <li><strong>HLB・濡れ接触角 &theta;<sub>c</sub> 連動:</strong> 基板の親疎水性と製剤HLBの相性によって接触角が変化し、界面のピン留め・接触線摩擦力が付加されます。</li>
          <li><strong>先端移動距離 L(t) 曲線:</strong> 初期は高速流下し、膜厚減少とともに減速して漸近限界距離 L<sub>&infin;</sub> で停止します。</li>
        </ul>
      `,
      coating_pore_v110: `
        <h4 style="color:#38bdf8; margin:0 0 8px 0; font-size:0.9rem;">🎨 塗布力学 (Coating Dynamics) と人肌化粧品品質評価系</h4>
        <p style="margin-bottom:8px;">
          ブレード塗布（ドクターブレード・ナイフ塗布）は、<strong>「指先やアプリケーターで化粧品を肌に引き延ばして均一薄膜を形成するプロセス」</strong>を流体力学・界面レオロジー的にモデル化した評価系です。
        </p>

        <div style="background:rgba(0,0,0,0.5); padding:8px 10px; border-radius:6px; border:1px solid rgba(56,189,248,0.3); margin-bottom:8px; font-family:'Times New Roman', serif; line-height:1.7;">
          <strong style="color:#38bdf8;">【狭小隙間の潤滑力学 (Couette-Poiseuille流) と膜厚決定則】</strong><br>
          ・塗布せん断速度: &gamma;&#775; = V<sub>blade</sub> / h<sub>gap</sub> &nbsp; [s<sup>-1</sup>] &nbsp; (指塗り高せん断域: 10<sup>2</sup>〜10<sup>5</sup> s<sup>-1</sup>)<br>
          ・壁面せん断応力 (塗布抵抗): &tau;<sub>w</sub> = &eta;(&gamma;&#775;) &middot; &gamma;&#775; &nbsp; [Pa] &nbsp; (指先に感じる「コク・伸びの軽さ」)<br>
          ・湿潤膜厚式: h<sub>wet</sub> &approx; h<sub>gap</sub> &middot; [0.50 + 0.08 &middot; &eta;(&gamma;&#775;)<sup>0.3</sup>] &nbsp; [&mu;m] (クエット流分離 + 粘弾性膨潤)
        </div>

        <ul style="padding-left:18px; margin:0 0 8px 0; line-height:1.6;">
          <li><strong style="color:#38bdf8;">高せん断シアシニング (みずみずしい伸び・すべり感):</strong> 静止時の高粘度構造が、ブレード隙間の高せん断下で劇的に粘度低下 (&eta; &darr;)。摩擦抵抗 &tau;<sub>w</sub> が減少し、指先でスッと軽やかに広がる感触を再現。</li>
          <li><strong style="color:#34d399;">基板親和性と濡れ広がり (HLB &times; 表面自由エネルギー):</strong> シリコーンコート（人肌皮脂膜・バイオスキン相当）、SUS304、アクリル樹脂、ガラスとの界面親和性から接触角 &theta;<sub>c</sub> (16&deg;〜85&deg;) と付着摩擦力 &mu;<sub>sub</sub> を算出。親和性が高いと薄く均一に密着保持され（肌なじみ）、低いとはじき・玉状化が発生。</li>
                    <li><strong style="color:#f59e0b;">生体皮膚・毛穴トラブル6大分類 &amp; 多段階ニキビモデル:</strong>
            <br>皮膚表面の微細解剖構造（皮丘・皮溝・毛漏斗部）と化粧品スラリーの流動相互作用を厳密にモデル化：
            <br>① <strong style="color:#38bdf8;">正常な毛穴:</strong> 直径 0.1〜0.2mm (100〜200&mu;m)。引き締まった微細小孔。最少流動抵抗で均一薄膜レベリング。
            <br>② <strong style="color:#fb923c;">乾燥開き毛穴:</strong> 直径 0.25〜0.35mm。角質水分低下・キメ乱れによる「すり鉢状クレーター」。塗布時の液吸い込みと凹み残りを解析。
            <br>③ <strong style="color:#facc15;">皮脂開き毛穴:</strong> 直径 0.35〜0.50mm。過剰皮脂分泌により毛穴内部にセバムが充満し出口が押し広げられた状態。油性皮脂と水性化粧品の界面反発・馴染みを評価。
            <br>④ <strong style="color:#a78bfa;">たるみ毛穴:</strong> 直径 0.40〜0.60mm、深さ 80〜120&mu;m。真皮コラーゲン低下に伴う「しずく型・楕円スリット凹み」。深い皮溝と連動し、塗布方向依存の液充填性を評価。
            <br>⑤ <strong style="color:#94a3b8;">黒ずみ毛穴:</strong> 直径 0.20〜0.35mm。毛穴詰まり角栓が酸化した黒褐色キャップ構造。凹凸カバー性・トーンアップ光学評価。
            <br>⑥ <strong style="color:#f8fafc;">角栓詰まり毛穴:</strong> 皮脂と古い角質が硬化した角栓突起（コメド、突出高さ +50〜100&mu;m）。突起通過時の局所せん断と液ヨレを解析。
            <br>🔴 <strong style="color:#f87171;">多段階ニキビ病態 (10代):</strong> 初期 (白/黒ニキビ: h=0.05〜0.15mm) &rarr; 進行期 (赤ニキビ: h=1.0〜1.8mm 炎症腫脹) &rarr; 重症期 (黄ニキビ: h=1.8〜2.8mm 膿汁充満ドーム)。巨大隆起物に対するブレード通過時の局所高せん断（&gt;10⁴ s⁻¹）と塗膜回り込み挙動を再現。
          </li>
          <li><strong style="color:#a78bfa;">塗布後レベリング (Orchard平滑化理論):</strong> 表面張力 &sigma; による毛細管圧で塗膜の微小凹凸が減衰。平滑化時間 &tau;<sub>leveling</sub> &prop; &eta;&middot;&lambda;<sup>4</sup> / (&sigma;&middot;h<sup>3</sup>)。降伏応力 &tau;<sub>y</sub> とチキソトロピー回復によって液垂れを防ぎ、均一な保護膜が肌上に固定化されます。</li>
        </ul>
        <div style="font-size:0.73rem; color:#94a3b8; background:rgba(255,255,255,0.03); padding:6px; border-radius:4px;">
          💡 <strong>品質評価系との相関:</strong> 塗膜均一性プロファイル（X位置 vs 湿潤膜厚）、局所せん断速度・粘度コンター、塗布抵抗力（Drag Force）をリアルタイム計測し、官能評価（すべり・密着・カバー力）を定量評価します。
        </div>
      `};

    this.floatDocContent.innerHTML = docContents[categoryKey] || docContents.non_newtonian;
  }

  _switchTestMode(mode, syncSidebarTab = true) {
    if (!this.solver) return;
    this.solver.setTestMode(mode);

    if (mode === 'coating') {
      if (this.tabFillingBtn) this.tabFillingBtn.classList.remove('active');
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'none';
      if (this.saggingControls) this.saggingControls.style.display = 'none';
      if (this.fillingStats) this.fillingStats.style.display = 'none';
      if (this.saggingStats) this.saggingStats.style.display = 'none';
      if (this.coatingStats) this.coatingStats.style.display = 'flex';
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'none';
      if (this.floatDropBtn) this.floatDropBtn.style.display = 'none';
      if (this.floatCoatingBtn) this.floatCoatingBtn.style.display = 'inline-flex';

      if (syncSidebarTab && this.sidebarTabCoating) {
        this._switchSidebarTab('coating');
      }

      this._switchChartMode('rheology');
      this._updateCoatingTheoryCard();

      if (this.viewportTipText) {
        this.viewportTipText.textContent = '🎨 ドクターブレード塗布試験: 高せん断力によるスラリー引き延ばし・薄膜レベリング平坦度を評価します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> <span class="btn-label">最初から塗布</span>';
      }
    } else if (mode === 'crown') {
      if (this.tabFillingBtn) this.tabFillingBtn.classList.remove('active');
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'none';
      if (this.saggingControls) this.saggingControls.style.display = 'none';
      if (this.fillingStats) this.fillingStats.style.display = 'none';
      if (this.saggingStats) this.saggingStats.style.display = 'none';
      if (this.coatingStats) this.coatingStats.style.display = 'none';
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'none';
      if (this.floatDropBtn) this.floatDropBtn.style.display = 'inline-flex';
      if (this.floatCoatingBtn) this.floatCoatingBtn.style.display = 'none';

      if (syncSidebarTab && this.sidebarTabCrown) {
        this._switchSidebarTab('crown');
      }

      this._switchChartMode('rheology');
      this._updateCrownTheoryCard();

      if (this.viewportTipText) {
        this.viewportTipText.textContent = '👑 ミルククラウン試験: 液滴の高速衝突・王冠形成・スプラッシュ飛散・クレーター沈降挙動を評価します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> <span class="btn-label">最初から試験</span>';
      }
    } else if (mode === 'sagging') {
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.add('active');
      if (this.tabFillingBtn) this.tabFillingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'none';
      if (this.saggingControls) this.saggingControls.style.display = 'block';
      if (this.fillingStats) this.fillingStats.style.display = 'none';
      if (this.saggingStats) this.saggingStats.style.display = 'flex';
      if (this.coatingStats) this.coatingStats.style.display = 'none';
      if (this.floatDropBtn) this.floatDropBtn.style.display = 'inline-flex';
      if (this.floatCoatingBtn) this.floatCoatingBtn.style.display = 'none';

      // 垂れ試験モードでは不要な充填進捗UIを完全非表示
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'none';

      // サイドバータブをたれ試験タブに同期
      if (syncSidebarTab && this.sidebarTabSagging) {
        this._switchSidebarTab('sagging');
      }

      // グラフタブを自動で垂れ試験モードに連動切り替え
      this._switchChartMode('sagging');

      // ツールバー案内文を垂れ試験用に切り替え
      if (this.viewportTipText) {
        this.viewportTipText.textContent = '📐 傾斜板・垂直板放置試験: 角度・基板親疎水性・HLB相性に応じたタレ停止限界と自重せん断流動を評価します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> <span class="btn-label">最初から試験</span>';
      }
    } else {
      if (this.tabFillingBtn) this.tabFillingBtn.classList.add('active');
      if (this.tabSaggingBtn) this.tabSaggingBtn.classList.remove('active');
      if (this.fillingControls) this.fillingControls.style.display = 'block';
      if (this.saggingControls) this.saggingControls.style.display = 'none';
      if (this.fillingStats) this.fillingStats.style.display = 'flex';
      if (this.saggingStats) this.saggingStats.style.display = 'none';
      if (this.coatingStats) this.coatingStats.style.display = 'none';
      if (this.floatDropBtn) this.floatDropBtn.style.display = 'none';
      if (this.floatCoatingBtn) this.floatCoatingBtn.style.display = 'none';

      // 充填モードでは充填進捗インジケーターを表示
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'flex';

      // サイドバータブが他モードだった場合、流体・処方タブへ戻す
      if (syncSidebarTab && (this.tabSidebarSaggingBtn?.classList.contains('active') || this.tabSidebarCrownBtn?.classList.contains('active') || this.tabSidebarCoatingBtn?.classList.contains('active'))) {
        this._switchSidebarTab('fluid');
      }

      // グラフタブをレオロジー曲線に連動切り替え
      this._switchChartMode('rheology');

      // ツールバー案内文をノズル昇降案内に切り替え
      if (this.viewportTipText) {
        this.viewportTipText.textContent = '💡 ボトムアップ昇降ノズルにより液面直上に追従し、気泡混入や液ハネを防止します';
      }
      if (this.resetBtn) {
        this.resetBtn.innerHTML = '<span class="icon">🔄</span> <span class="btn-label">最初から充填</span>';
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

    // 左サイドバー ドロワー / 折りたたみ トグル
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.addEventListener('click', () => this._toggleSidebar());
    }
    if (this.closeSidebarMobileBtn) {
      this.closeSidebarMobileBtn.addEventListener('click', () => this._toggleSidebar(false));
    }
    if (this.sidebarBackdrop) {
      this.sidebarBackdrop.addEventListener('click', () => this._toggleSidebar(false));
    }

    // 右サイドバー ON/OFF トグル
    if (this.toggleRightSidebarBtn) {
      this.toggleRightSidebarBtn.addEventListener('click', () => this._toggleRightSidebar());
    }

    // アコーディオン開閉セクションの初期化
    this._setupAccordionSections();

    // フローティングダイアログのドラッグ移動機能の有効化
    this._makeDraggable(this.floatingChartDialog, this.floatingChartHeader);
    this._makeDraggable(this.floatingDocDialog, this.floatingDocHeader);

    // 統合フローティンググラフダイアログの開閉・トグル
    if (this.openChartDialogBtn) {
      this.openChartDialogBtn.addEventListener('click', () => this._toggleFloatingChart());
    }
    if (this.toggleFloatChartBtn) {
      this.toggleFloatChartBtn.addEventListener('click', () => this._toggleFloatingChart());
    }
    if (this.closeFloatChartBtn) {
      this.closeFloatChartBtn.addEventListener('click', () => this._closeFloatingDialog(this.floatingChartDialog));
    }

    // 左サイドバーのボタンからグラフを開く場合
    if (this.openRheoFloatBtn) {
      this.openRheoFloatBtn.addEventListener('click', () => {
        this._openFloatingDialog(this.floatingChartDialog);
        this._switchFloatChartTab('rheo');
      });
    }
    if (this.openSagFloatBtn) {
      this.openSagFloatBtn.addEventListener('click', () => {
        this._openFloatingDialog(this.floatingChartDialog);
        this._switchFloatChartTab('sag');
      });
    }
    if (this.openCoatingFloatBtn) {
      this.openCoatingFloatBtn.addEventListener('click', () => {
        this._openFloatingDialog(this.floatingChartDialog);
        this._switchFloatChartTab('coating');
      });
    }

    // 統合フローティンググラフのタブ切り替え
    if (this.tabFloatRheoBtn) {
      this.tabFloatRheoBtn.addEventListener('click', () => this._switchFloatChartTab('rheo'));
    }
    if (this.tabFloatSagBtn) {
      this.tabFloatSagBtn.addEventListener('click', () => this._switchFloatChartTab('sag'));
    }
    if (this.tabFloatCoatingBtn) {
      this.tabFloatCoatingBtn.addEventListener('click', () => this._switchFloatChartTab('coating'));
    }
    if (this.tabFloatParamBtn) {
      this.tabFloatParamBtn.addEventListener('click', () => this._switchFloatChartTab('param'));
    }

    // 解説ダイアログ開閉
    if (this.openDocDialogBtn) {
      this.openDocDialogBtn.addEventListener('click', () => this._openFloatingDialog(this.floatingDocDialog));
    }
    if (this.closeFloatDocBtn) {
      this.closeFloatDocBtn.addEventListener('click', () => this._closeFloatingDialog(this.floatingDocDialog));
    }

    // 解説ダイアログ内タブ切り替え
    document.querySelectorAll('.float-doc-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._renderFloatDoc(e.currentTarget.dataset.doctab);
      });
    });

    // 右サイドバー解説セレクト切り替え
    if (this.docCategorySelect) {
      this.docCategorySelect.addEventListener('change', (e) => {
        this._switchDocCategory(e.target.value);
      });
    }

    // サイドバー項目別タブ切り替え
    if (this.tabSidebarFluidBtn) {
      this.tabSidebarFluidBtn.addEventListener('click', () => this._switchSidebarTab('fluid'));
    }
    if (this.tabSidebarContainerBtn) {
      this.tabSidebarContainerBtn.addEventListener('click', () => this._switchSidebarTab('container'));
    }
    if (this.tabSidebarSaggingBtn) {
      this.tabSidebarSaggingBtn.addEventListener('click', () => this._switchSidebarTab('sagging'));
    }

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

    // 充填容器ドロップダウン選択
    if (this.containerSelect) {
      this.containerSelect.addEventListener('change', (e) => {
        this._selectContainer(e.target.value);
      });
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

    // 👑 クラウン試験用イベントバインド
    if (this.tabSidebarCrownBtn) {
      this.tabSidebarCrownBtn.addEventListener('click', () => this._switchSidebarTab('crown'));
    }

    if (this.crownHeightInput) {
      this.crownHeightInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.crownHeightVal) this.crownHeightVal.textContent = `${val} mm`;
        if (this.solver) {
          this.solver.setCrownParams({ heightMm: val });
          this._updateCrownTheoryCard();
        }
      });
    }

    if (this.crownDiameterInput) {
      this.crownDiameterInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.crownDiameterVal) this.crownDiameterVal.textContent = `${val.toFixed(1)} mm`;
        if (this.solver) {
          this.solver.setCrownParams({ diameterMm: val });
          this._updateCrownTheoryCard();
        }
      });
    }

    if (this.crownFilmInput) {
      this.crownFilmInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.crownFilmVal) this.crownFilmVal.textContent = `${val.toFixed(1)} mm`;
        if (this.solver) {
          this.solver.setCrownParams({ filmThicknessMm: val });
          this._updateCrownTheoryCard();
        }
      });
    }

    document.querySelectorAll('.crown-slow-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseFloat(e.currentTarget.dataset.speed);
        document.querySelectorAll('.crown-slow-btn').forEach(b => {
          b.className = (b === e.currentTarget) ? 'btn btn-primary crown-slow-btn active' : 'btn btn-secondary crown-slow-btn';
        });
        if (this.solver) {
          this.solver.setCrownParams({ slowRate: speed });
        }
      });
    });

    if (this.dropCrownBtn) {
      this.dropCrownBtn.addEventListener('click', () => {
        if (this.solver) {
          this.solver.dropCrownLiquid();
        }
      });
    }

    if (this.resetCrownBtn) {
      this.resetCrownBtn.addEventListener('click', () => {
        if (this.solver) {
          this.solver.resetCrownTest();
        }
      });
    }

    // 🎨 塗布・引き延ばし試験 (Doctor Blade) 用イベントバインド
    if (this.tabSidebarCoatingBtn) {
      this.tabSidebarCoatingBtn.addEventListener('click', () => this._switchSidebarTab('coating'));
    }

    if (this.bladeGapInput) {
      this.bladeGapInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.bladeGapVal) this.bladeGapVal.textContent = `${val} μm`;
        if (this.solver) {
          this.solver.setBladeParams({ gapUm: val });
          this._updateCoatingTheoryCard();
          this._updateCaption();
        }
      });
    }

    if (this.bladeSpeedInput) {
      this.bladeSpeedInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.bladeSpeedVal) this.bladeSpeedVal.textContent = `${val} mm/s`;
        if (this.solver) {
          this.solver.setBladeParams({ speedMmS: val });
          this._updateCoatingTheoryCard();
          this._updateCaption();
        }
      });
    }

    if (this.coatingSlurryVolInput) {
      this.coatingSlurryVolInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.coatingSlurryVolVal) this.coatingSlurryVolVal.textContent = `${val} mL`;
        if (this.solver) {
          this.solver.setBladeParams({ slurryVolumeMl: val });
          if (this.solver.testMode === 'coating' && !this.solver.isCoatingRunning) {
            this.solver.initCoatingTest();
          }
          this._updateCoatingTheoryCard();
        }
      });
    }

    if (this.coatingSubstrateSelect) {
      this.coatingSubstrateSelect.addEventListener('change', (e) => {
        const sub = e.target.value;
        if (this.solver) {
          this.solver.setCoatingSubstrate(sub);
          this._updateCoatingTheoryCard();
          this._updateCaption();
          if (this.renderer && this.solver) {
            this.renderer.render(this.solver, this.currentPreset);
          }
        }
        if (this.substrateSelect && this.substrateSelect.value !== sub) {
          this.substrateSelect.value = sub;
          this._updateSaggingTheory();
        }
      });
    }

    // 塗工基板表面性状（平滑・ざらざら・凸凹）ボタン
    document.querySelectorAll('.coating-rough-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rough = e.currentTarget.dataset.rough;
        document.querySelectorAll('.coating-rough-btn').forEach(b => {
          b.className = (b.dataset.rough === rough) ? 'btn btn-primary coating-rough-btn active' : 'btn btn-secondary coating-rough-btn';
        });

        const descMap = {
          smooth: '✨ 鏡面研磨面 (Ra ≈ 0.05 μm) : 均一レベリング・壁面滑り最小',
          rough: '🏜️ サンドブラスト微細粗面 (Ra ≈ 5 μm) : 界面ピンニング・付着抵抗増',
          textured: '〰️ 周期微細リブ溝 (Ra ≈ 25 μm, ピッチ 4.5mm) : 凹凸追従・波状膜厚プロファイル',
          skin_10s: '🌸 10代人肌モデル: ⑥角栓詰まり・⑤黒ずみ毛穴・初期(白/黒:0.14mm)・進行期(赤:1.4mm)・重症期(黄:2.4mm膿汁)',
          skin_20s: '💎 20代人肌モデル: 張りのある皮丘(幅320μm)・浅く引き締まった皮溝(深さ35μm)・きめ細か美肌',
          skin_30s: '🌿 30代人肌モデル: 開いた毛穴(径0.3〜0.5mm, 深さ180μm)・深まった皮溝(深さ90μm)・皮脂肌'
        };
        if (this.coatingRoughDesc) {
          this.coatingRoughDesc.textContent = descMap[rough] || '';
        }

        if (this.solver) {
          this.solver.setCoatingRoughness(rough);
          this._updateCoatingTheoryCard();
          if (this.renderer && this.solver) {
            this.renderer.render(this.solver, this.currentPreset);
          }
        }
      });
    });

    if (this.startCoatingBtn) {
      this.startCoatingBtn.addEventListener('click', () => {
        if (this.solver) {
          this.solver.startCoating();
          this.isRunning = true;
          if (this.playBtn) {
            this.playBtn.innerHTML = '<span class="icon">⏸</span> <span class="btn-label">一時停止</span>';
            this.playBtn.className = 'btn btn-active floating-btn';
          }
        }
      });
    }

    if (this.resetCoatingBtn) {
      this.resetCoatingBtn.addEventListener('click', () => {
        if (this.solver) {
          this.solver.resetCoatingTest();
        }
      });
    }

    // 🫨 容器インタラクティブ揺動（クリック & ドラッグ & HUDボタン & スマホ加速度センサー）
    if (this.shakeContainerBtn) {
      this.shakeContainerBtn.addEventListener('click', async () => {
        if (!this.solver) return;
        const dir = (Math.random() > 0.5 ? 1 : -1);
        this.solver.triggerShake(dir * 22.0, -3.0, dir * 0.012);

        // スマホ等でセンサーがまだ未有効化の場合は初期化を試みる
        if (!this.isMotionSensorActive && typeof DeviceMotionEvent !== 'undefined') {
          this._enableMotionSensor(false);
        }
      });
    }

    if (this.motionSensorBtn) {
      this.motionSensorBtn.addEventListener('click', () => {
        this._toggleMotionSensor();
      });
    }

    if (this.simCanvas) {
      let isPointerDown = false;
      let startCanvasX = 0;
      let startCanvasY = 0;

      const getCanvasCoords = (e) => {
        const rect = this.simCanvas.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        const scaleX = this.simCanvas.width / (rect.width || 1);
        const scaleY = this.simCanvas.height / (rect.height || 1);
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
        };
      };

      const isInsideContainer = (cx, cy) => {
        if (!this.solver) return false;
        if (this.solver.testMode === 'sagging') {
          const geom = this.solver.getPlateGeometry();
          const minX = Math.min(geom.p0x, geom.p1x) - 40;
          const maxX = Math.max(geom.p0x, geom.p1x) + 40;
          const minY = Math.min(geom.p0y, geom.p1y) - 40;
          const maxY = Math.max(geom.p0y, geom.p1y) + 40;
          return (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY);
        } else {
          const c = this.solver.container;
          const nx = this.solver.nozzleX;
          const halfW = c.width * 0.5;
          const leftX = nx - halfW - 35;
          const rightX = nx + halfW + 35;
          const bottomY = c.bottomY + 50;
          const topY = c.bottomY - c.height - 40;
          return (cx >= leftX && cx <= rightX && cy >= topY && cy <= bottomY);
        }
      };

      const onPointerStart = (e) => {
        if (!this.solver) return;
        const { x, y } = getCanvasCoords(e);
        if (isInsideContainer(x, y)) {
          isPointerDown = true;
          startCanvasX = x;
          startCanvasY = y;
          this.simCanvas.style.cursor = 'grabbing';
          // 初期タップ撃力（微小なインパルス）
          const nx = this.solver.nozzleX;
          const forceX = (x < nx ? -18.0 : 18.0);
          this.solver.triggerShake(forceX, -2.5, (x < nx ? -0.010 : 0.010));
        }
      };

      const onPointerMove = (e) => {
        if (!this.solver) return;
        const { x, y } = getCanvasCoords(e);

        if (isPointerDown) {
          const dx = x - startCanvasX;
          const dy = y - startCanvasY;
          // ドラッグ感度を低減（大きな揺れを許容せず、微小な揺れにとどめる）
          const dAngle = (dx / (this.solver.container.width || 200)) * 0.04;
          this.solver.setContainerDragOffset(dx * 0.12, dy * 0.08, dAngle);
        } else {
          // ホバー時のカーソル変更 (掴めることを視覚提示)
          this.simCanvas.style.cursor = isInsideContainer(x, y) ? 'grab' : 'default';
        }
      };

      const onPointerEnd = () => {
        if (isPointerDown) {
          isPointerDown = false;
          this.simCanvas.style.cursor = 'default';
          if (this.solver) {
            this.solver.releaseContainerDrag();
          }
        }
      };

      this.simCanvas.addEventListener('mousedown', onPointerStart);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerEnd);

      this.simCanvas.addEventListener('touchstart', onPointerStart, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerEnd, { passive: true });
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

    // ── プリセット管理イベント (キャッシュ保管 & JSON入出力) ──
    if (this.savePresetBtn) {
      this.savePresetBtn.addEventListener('click', () => {
        // 現在のパラメータをモーダルサマリーに反映して表示
        if (this.modalSummaryTauY) this.modalSummaryTauY.textContent = this.model.tau_y.toFixed(1);
        if (this.modalSummaryK) this.modalSummaryK.textContent = this.model.K.toFixed(2);
        if (this.modalSummaryN) this.modalSummaryN.textContent = this.model.n.toFixed(2);
        if (this.modalSummarySigma) this.modalSummarySigma.textContent = (this.solver?.sigma || 40.0).toFixed(1);
        if (this.modalSummaryInletVel) this.modalSummaryInletVel.textContent = (this.model.inlet_vel || 1.15).toFixed(2);
        if (this.modalSummaryMaterial) {
          this.modalSummaryMaterial.textContent = `${this.currentMaterial?.icon || '🎨'} ${this.currentMaterial?.name || 'カスタム調色'}`;
        }
        
        if (this.modalPresetName) this.modalPresetName.value = `${this.currentPreset?.name?.split(' ')[0] || 'カスタム処方'}_改`;
        if (this.modalPresetDesc) this.modalPresetDesc.value = `τy=${this.model.tau_y.toFixed(1)}Pa, K=${this.model.K.toFixed(2)}, n=${this.model.n.toFixed(2)}`;
        
        if (this.savePresetModal) this.savePresetModal.style.display = 'flex';
      });
    }

    if (this.closePresetModalBtn) {
      this.closePresetModalBtn.addEventListener('click', () => {
        if (this.savePresetModal) this.savePresetModal.style.display = 'none';
      });
    }

    if (this.cancelPresetModalBtn) {
      this.cancelPresetModalBtn.addEventListener('click', () => {
        if (this.savePresetModal) this.savePresetModal.style.display = 'none';
      });
    }

    if (this.confirmSavePresetBtn) {
      this.confirmSavePresetBtn.addEventListener('click', () => {
        const name = this.modalPresetName?.value?.trim() || 'カスタム処方';
        const desc = this.modalPresetDesc?.value?.trim() || 'ユーザー定義レオロジーパラメータ';
        const emulsion = this.modalPresetEmulsion?.value?.trim() || 'カスタム処方';
        const hlb = parseFloat(this.modalPresetHlb?.value) || 10.5;

        const newPreset = this.presetManager.saveCustomPreset({
          name: name,
          desc: desc,
          emulsion_type: emulsion,
          hlb: hlb,
          polarity: hlb < 7 ? '親油性' : (hlb > 13 ? '親水性' : '両親媒性'),
          tau_y: this.model.tau_y,
          K: this.model.K,
          n: this.model.n,
          sigma: this.solver?.sigma || 40.0,
          inlet_vel: this.model.inlet_vel || 1.15,
          rho: this.model.rho || 1000.0,
          materialId: this.currentMaterialId,
          material: this.currentMaterial
        });

        this._rebuildPresetSelectOptions();
        this._applyPreset(newPreset.id);
        if (this.presetSelect) this.presetSelect.value = newPreset.id;
        if (this.savePresetModal) this.savePresetModal.style.display = 'none';
      });
    }

    if (this.deletePresetBtn) {
      this.deletePresetBtn.addEventListener('click', () => {
        if (confirm(`カスタム処方「${this.currentPreset.name}」を削除しますか？`)) {
          this.presetManager.deleteCustomPreset(this.currentPresetId);
          this._rebuildPresetSelectOptions();
          this._applyPreset('cleansing_oil');
          if (this.presetSelect) this.presetSelect.value = 'cleansing_oil';
        }
      });
    }

    if (this.exportPresetJsonBtn) {
      this.exportPresetJsonBtn.addEventListener('click', () => {
        // 現在選択中のプリセットまたは全プリセットをエクスポート
        this.presetManager.exportToJsonFile(this.currentPreset);
      });
    }

    if (this.importPresetJsonBtn && this.importJsonInput) {
      this.importPresetJsonBtn.addEventListener('click', () => {
        this.importJsonInput.click();
      });

      this.importJsonInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const imported = await this.presetManager.importFromJsonFile(file);
          this._rebuildPresetSelectOptions();
          if (imported.length > 0) {
            this._applyPreset(imported[0].id);
            if (this.presetSelect) this.presetSelect.value = imported[0].id;
            alert(`✅ ${imported.length} 件のプリセットを読み込みました！`);
          }
        } catch (err) {
          alert(`❌ 読込エラー: ${err.message}`);
        }
        e.target.value = '';
      });
    }

    // 処方プリセット選択
    this.presetSelect.addEventListener('change', (e) => {
      this._applyPreset(e.target.value);
    });

    // ── ノズル口径 & 充填速度 (スライダー & 数値入力の双方向同期) ──
    const syncNozzleDiameter = (val) => {
      val = Math.max(1.0, Math.min(25.0, parseFloat(val) || 2.0));
      if (this.nozzleDiameterInput) this.nozzleDiameterInput.value = val;
      if (this.nozzleDiameterNumInput) this.nozzleDiameterNumInput.value = val;
      this.solver.setNozzleDiameter(val);
      this._updateCaption();
    };
    if (this.nozzleDiameterInput) this.nozzleDiameterInput.addEventListener('input', (e) => syncNozzleDiameter(e.target.value));
    if (this.nozzleDiameterNumInput) this.nozzleDiameterNumInput.addEventListener('change', (e) => syncNozzleDiameter(e.target.value));

    const syncInletVel = (val) => {
      val = Math.max(0.1, Math.min(5.0, parseFloat(val) || 1.15));
      if (this.inletVelInput) this.inletVelInput.value = val;
      if (this.inletVelNumInput) this.inletVelNumInput.value = val;
      this.model.inlet_vel = val;
      this.solver.setInletVelocity(val);
      this.solver.setRheologyParams(this.model);
    };
    if (this.inletVelInput) this.inletVelInput.addEventListener('input', (e) => syncInletVel(e.target.value));
    if (this.inletVelNumInput) this.inletVelNumInput.addEventListener('change', (e) => syncInletVel(e.target.value));

    const syncSigma = (val) => {
      val = Math.max(1.0, Math.min(150.0, parseFloat(val) || 40.0));
      if (this.sigmaInput) this.sigmaInput.value = val;
      if (this.sigmaNumInput) this.sigmaNumInput.value = val;
      this.solver.sigma = val;
      this.model.sigma = val;
    };
    if (this.sigmaInput) this.sigmaInput.addEventListener('input', (e) => syncSigma(e.target.value));
    if (this.sigmaNumInput) this.sigmaNumInput.addEventListener('change', (e) => syncSigma(e.target.value));

    // ── レオロジー数理パラメータ (スライダー & 数値入力の双方向同期) ──
    const updateRheology = () => {
      this.solver.setRheologyParams(this.model);
      this.charts.renderRheologyCurve(this.model);
      this._updateCaption();
      this._updateSaggingTheory();
    };

    const syncTauY = (val) => {
      val = Math.max(0, parseFloat(val) || 0);
      this.model.tau_y = val;
      if (this.tauYInput) this.tauYInput.value = val;
      if (this.tauYNumInput) this.tauYNumInput.value = val;
      updateRheology();
    };
    if (this.tauYInput) this.tauYInput.addEventListener('input', (e) => syncTauY(e.target.value));
    if (this.tauYNumInput) this.tauYNumInput.addEventListener('change', (e) => syncTauY(e.target.value));

    const syncK = (val) => {
      val = Math.max(0.001, parseFloat(val) || 0.001);
      this.model.K = val;
      if (this.kInput) this.kInput.value = val;
      if (this.kNumInput) this.kNumInput.value = val;
      updateRheology();
    };
    if (this.kInput) this.kInput.addEventListener('input', (e) => syncK(e.target.value));
    if (this.kNumInput) this.kNumInput.addEventListener('change', (e) => syncK(e.target.value));

    const syncN = (val) => {
      val = Math.max(0.1, Math.min(3.0, parseFloat(val) || 1.0));
      this.model.n = val;
      if (this.nInput) this.nInput.value = val;
      if (this.nNumInput) this.nNumInput.value = val;
      updateRheology();
    };
    if (this.nInput) this.nInput.addEventListener('input', (e) => syncN(e.target.value));
    if (this.nNumInput) this.nNumInput.addEventListener('change', (e) => syncN(e.target.value));

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
        ? '<span class="icon">⏸</span> <span class="btn-label">一時停止</span>'
        : '<span class="icon">▶</span> <span class="btn-label">再開</span>';
      this.playBtn.className = this.isRunning ? 'btn btn-active floating-btn' : 'btn btn-primary floating-btn';
    });

    this.stepBtn.addEventListener('click', () => {
      if (!this.isRunning && this.solver) {
        this.solver.step(0.003, 3);
        this.renderer.render(this.solver, this.currentPreset);
        this._updateUIStats();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      if (this.solver.testMode === 'coating') {
        this.solver.resetCoatingTest();
      } else if (this.solver.testMode === 'sagging') {
        this.solver.resetSagTest();
        this.solver.dropLiquid();
      } else if (this.solver.testMode === 'crown') {
        this.solver.resetCrownTest();
      } else {
        this.solver.reset();
      }
      this._updateUIStats();
    });

    if (this.floatCoatingBtn) {
      this.floatCoatingBtn.addEventListener('click', () => {
        if (this.solver && this.solver.testMode === 'coating') {
          this.solver.startCoating();
          this.isRunning = true;
          if (this.playBtn) {
            this.playBtn.innerHTML = '<span class="icon">⏸</span> <span class="btn-label">一時停止</span>';
            this.playBtn.className = 'btn btn-active floating-btn';
          }
        }
      });
    }

    if (this.floatDropBtn) {
      this.floatDropBtn.addEventListener('click', () => {
        if (!this.solver) return;
        if (this.solver.testMode === 'crown') {
          this.solver.dropCrownLiquid();
        } else if (this.solver.testMode === 'sagging') {
          this.solver.dropLiquid();
        }
        this._updateUIStats();
      });
    }

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
        this.openFilmstripModal();
      });
    }

    this._bindFilmstripEvents();
  }

  /**
   * コマ送り静止画（Filmstrip）モーダルのイベント登録 (スライダー & 数値入力の双方向連動)
   */
  _bindFilmstripEvents() {
    if (!this.filmstripModal) return;

    // 閉じるボタン
    if (this.closeFilmstripModalBtn) {
      this.closeFilmstripModalBtn.addEventListener('click', () => {
        this.filmstripModal.style.display = 'none';
      });
    }
    if (this.cancelFilmstripModalBtn) {
      this.cancelFilmstripModalBtn.addEventListener('click', () => {
        this.filmstripModal.style.display = 'none';
      });
    }

    // 開始進捗 (Start)
    const updateStart = (val) => {
      val = Math.max(0, Math.min(100, parseFloat(val) || 0));
      this.fsStartRange.value = val;
      this.fsStartNum.value = val;
      this.filmstripParams.startRatio = val / 100.0;
      if (this.filmstripParams.startRatio > this.filmstripParams.endRatio) {
        this.filmstripParams.endRatio = this.filmstripParams.startRatio;
        this.fsEndRange.value = val;
        this.fsEndNum.value = val;
      }
      this._renderFilmstripTimeline();
    };
    if (this.fsStartRange) this.fsStartRange.addEventListener('input', (e) => updateStart(e.target.value));
    if (this.fsStartNum) this.fsStartNum.addEventListener('input', (e) => updateStart(e.target.value));

    // 終了進捗 (End)
    const updateEnd = (val) => {
      val = Math.max(0, Math.min(100, parseFloat(val) || 100));
      this.fsEndRange.value = val;
      this.fsEndNum.value = val;
      this.filmstripParams.endRatio = val / 100.0;
      if (this.filmstripParams.endRatio < this.filmstripParams.startRatio) {
        this.filmstripParams.startRatio = this.filmstripParams.endRatio;
        this.fsStartRange.value = val;
        this.fsStartNum.value = val;
      }
      this._renderFilmstripTimeline();
    };
    if (this.fsEndRange) this.fsEndRange.addEventListener('input', (e) => updateEnd(e.target.value));
    if (this.fsEndNum) this.fsEndNum.addEventListener('input', (e) => updateEnd(e.target.value));

    // コマ数 (Frame Count)
    const updateFrames = (val) => {
      val = Math.max(3, Math.min(12, parseInt(val) || 7));
      this.fsFrameCountRange.value = val;
      this.fsFrameCountNum.value = val;
      this.filmstripParams.frameCount = val;
      this._renderFilmstripTimeline();
    };
    if (this.fsFrameCountRange) this.fsFrameCountRange.addEventListener('input', (e) => updateFrames(e.target.value));
    if (this.fsFrameCountNum) this.fsFrameCountNum.addEventListener('input', (e) => updateFrames(e.target.value));

    // レベリング静止時間 (Extra Time)
    const updateExtraTime = (val) => {
      val = Math.max(0, Math.min(3.0, parseFloat(val) || 0.8));
      this.fsExtraTimeRange.value = val;
      this.fsExtraTimeNum.value = val;
      this.filmstripParams.extraTime = val;
      this._renderFilmstripTimeline();
    };
    if (this.fsExtraTimeRange) this.fsExtraTimeRange.addEventListener('input', (e) => updateExtraTime(e.target.value));
    if (this.fsExtraTimeNum) this.fsExtraTimeNum.addEventListener('input', (e) => updateExtraTime(e.target.value));

    // プレビュー再生成ボタン
    if (this.refreshFilmstripPreviewBtn) {
      this.refreshFilmstripPreviewBtn.addEventListener('click', () => {
        this._generateFilmstripPreview();
      });
    }

    // 保存 (ダウンロード) ボタン
    if (this.downloadFilmstripBtn) {
      this.downloadFilmstripBtn.addEventListener('click', () => {
        if (!this.currentFilmstripDataUrl) {
          this._generateFilmstripPreview(() => this._triggerDownload());
        } else {
          this._triggerDownload();
        }
      });
    }
  }

  _triggerDownload() {
    if (!this.currentFilmstripDataUrl) return;
    const link = document.createElement('a');
    const containerName = this.solver ? this.solver.containerType : 'container';
    link.download = `cosmetic_filling_filmstrip_${containerName}_${Date.now()}.png`;
    link.href = this.currentFilmstripDataUrl;
    link.click();
  }

  /**
   * コマ送り静止画モーダルを開き、タイムライン描画と初期プレビューを生成
   */
  openFilmstripModal() {
    if (!this.filmstripModal) return;

    // UI値を同期
    if (this.fsStartRange) this.fsStartRange.value = Math.round(this.filmstripParams.startRatio * 100);
    if (this.fsStartNum) this.fsStartNum.value = Math.round(this.filmstripParams.startRatio * 100);
    if (this.fsEndRange) this.fsEndRange.value = Math.round(this.filmstripParams.endRatio * 100);
    if (this.fsEndNum) this.fsEndNum.value = Math.round(this.filmstripParams.endRatio * 100);
    if (this.fsFrameCountRange) this.fsFrameCountRange.value = this.filmstripParams.frameCount;
    if (this.fsFrameCountNum) this.fsFrameCountNum.value = this.filmstripParams.frameCount;
    if (this.fsExtraTimeRange) this.fsExtraTimeRange.value = this.filmstripParams.extraTime;
    if (this.fsExtraTimeNum) this.fsExtraTimeNum.value = this.filmstripParams.extraTime;

    this.filmstripModal.style.display = 'flex';
    this._renderFilmstripTimeline();
    this._generateFilmstripPreview();
  }

  /**
   * タイムライン上の選択範囲および各コマの抽出位置マーカーを描画
   */
  _renderFilmstripTimeline() {
    const { startRatio, endRatio, frameCount, extraTime } = this.filmstripParams;

    // 選択範囲ハイライト更新
    if (this.timelineSelectedRange) {
      const leftPct = startRatio * 100;
      const widthPct = Math.max(2, (endRatio - startRatio) * 100);
      this.timelineSelectedRange.style.left = `${leftPct}%`;
      this.timelineSelectedRange.style.width = `${widthPct}%`;
    }

    // 範囲サマリーテキスト更新
    if (this.filmstripTimelineRangeText) {
      const stepPct = frameCount > 1 ? ((endRatio - startRatio) / (frameCount - 1) * 100).toFixed(1) : '0';
      this.filmstripTimelineRangeText.textContent = 
        `範囲: ${(startRatio * 100).toFixed(0)}% 〜 ${(endRatio * 100).toFixed(0)}% (全 ${frameCount} コマ, 間隔 約${stepPct}%) + ${extraTime.toFixed(1)}s 安定`;
    }

    // マーカーピンの生成
    if (this.timelineMarkersContainer) {
      this.timelineMarkersContainer.innerHTML = '';
      for (let i = 0; i < frameCount; i++) {
        const ratio = frameCount > 1 ? startRatio + (i / (frameCount - 1)) * (endRatio - startRatio) : startRatio;
        const posPct = ratio * 100;

        const pin = document.createElement('div');
        pin.style.position = 'absolute';
        pin.style.left = `${posPct}%`;
        pin.style.top = '-4px';
        pin.style.height = '34px';
        pin.style.width = '2px';
        pin.style.background = i === 0 ? '#38bdf8' : (i === frameCount - 1 ? '#a78bfa' : '#34d399');
        pin.style.transform = 'translateX(-50%)';
        pin.style.zIndex = '5';

        // ピン上部のバッジ
        const badge = document.createElement('div');
        badge.style.position = 'absolute';
        badge.style.top = '-18px';
        badge.style.left = '50%';
        badge.style.transform = 'translateX(-50%)';
        badge.style.background = '#0f172a';
        badge.style.border = `1px solid ${i === 0 ? '#38bdf8' : (i === frameCount - 1 ? '#a78bfa' : '#34d399')}`;
        badge.style.color = '#f8fafc';
        badge.style.fontSize = '9px';
        badge.style.fontWeight = '700';
        badge.style.padding = '1px 3px';
        badge.style.borderRadius = '3px';
        badge.style.whiteSpace = 'nowrap';
        badge.textContent = `F${i + 1}:${(ratio * 100).toFixed(0)}%`;

        pin.appendChild(badge);
        this.timelineMarkersContainer.appendChild(pin);
      }
    }
  }

  /**
   * 指定パラメータに基づいてオフスクリーン高速サンプリングを行い、フィルムストリップ画像を生成
   * (ブラウザの応答なし警告を防止するため、非同期タイムスライス＆チャンク処理で実行)
   */
  async _generateFilmstripPreview(callback) {
    if (!this.solver) return;

    // 世代IDをインクリメントし、古い非同期生成タスクを安全に中断
    if (!this._filmstripGenId) this._filmstripGenId = 0;
    const currentGenId = ++this._filmstripGenId;

    if (this.filmstripLoadingSpinner) {
      this.filmstripLoadingSpinner.style.display = 'flex';
      const spinnerText = this.filmstripLoadingSpinner.querySelector('span');
      if (spinnerText) spinnerText.textContent = '充填プロセス サンプリング中 (0%)...';
    }

    // 初回UI描画のための微小待機
    await new Promise(r => setTimeout(r, 20));
    if (this._filmstripGenId !== currentGenId) return;

    try {
      const { startRatio, endRatio, frameCount, extraTime } = this.filmstripParams;

      // 容器ごとの満杯粒子数
      const maxCapacity = {
        petri_dish: 4500,
        jar: 7500,
        bottle: 7000,
        lipstick: 4500,
        compact: 6000
      }[this.solver.containerType] || 5000;

      const targetVol = this.solver.container.targetVolume;

      // 各コマのサンプリング定義を構築
      const sampleTargets = [];
      for (let i = 0; i < frameCount; i++) {
        const ratio = frameCount > 1 ? startRatio + (i / (frameCount - 1)) * (endRatio - startRatio) : startRatio;
        let phase = '充填進行';
        if (ratio <= 0.02) phase = '初期状態・開始前';
        else if (ratio < 0.25) phase = '初期着液・中央ぬれ広がり';
        else if (ratio < 0.55) phase = '底部拡散・シャーレ進展';
        else if (ratio < 0.85) phase = '液面上昇・メニスカス成長';
        else if (ratio < 0.99) phase = '規定量間近・液面平坦化';
        else phase = '規定量到達・充填完了';

        const isLastFrame = (i === frameCount - 1);
        const waitExtra = (isLastFrame && ratio >= 0.95 && extraTime > 0) ? extraTime : 0;
        if (waitExtra > 0) phase = `平坦化静止安定 (+${extraTime.toFixed(1)}s)`;

        sampleTargets.push({
          label: `Frame ${i + 1}: ${(ratio * 100).toFixed(0)}%`,
          ratio: ratio,
          phase: phase,
          waitExtraSec: waitExtra
        });
      }

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
      filmCtx.fillText(`製剤: ${presName} | 容器: ${this.solver.container.name} | τy=${this.solver.tau_y.toFixed(1)}Pa, K=${this.solver.K.toFixed(2)}, n=${this.solver.n.toFixed(2)}, σ=${this.solver.sigma.toFixed(1)}mN/m`, totalW - 16, 24);

      // 一時シミュレーターを初期化して高速サンプリング
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
      offRenderer.smoothingMode = this.renderer.smoothingMode;
      offRenderer.activeMaterial = this.renderer.activeMaterial;

      // クロップ領域: シャーレ容器と液面を最適クローズアップ
      const nx = tempSolver.nozzleX;
      const bottomY = tempSolver.container.bottomY;
      const cropW = Math.max(300, tempSolver.container.width + 50);
      const cropH = cropW * (frameH / frameW);
      const cropX = nx - cropW * 0.5;
      const cropY = bottomY - cropH + 20;

      const dt = 0.004;
      const subSteps = 2;
      let simTime = 0.0;

      for (let targetIdx = 0; targetIdx < numFrames; targetIdx++) {
        if (this._filmstripGenId !== currentGenId) return; // 新しいリクエストがあれば中断

        // スピナー進捗表示
        if (this.filmstripLoadingSpinner) {
          const spinnerText = this.filmstripLoadingSpinner.querySelector('span');
          if (spinnerText) {
            const pct = Math.round((targetIdx / numFrames) * 100);
            spinnerText.textContent = `サンプリング進行中: コマ ${targetIdx + 1} / ${numFrames} (${pct}%)...`;
          }
        }

        const target = sampleTargets[targetIdx];
        const targetParticles = Math.floor(target.ratio * maxCapacity);

        // 目標の液体蓄積量（粒子数）に達するまでシミュレーション進行
        if (targetIdx > 0 || target.ratio > 0.01) {
          let safetyTimeout = 2000;
          let stepChunk = 0;
          while (tempSolver.numParticles < targetParticles && safetyTimeout-- > 0 && !tempSolver.isFilled) {
            tempSolver.step(dt, subSteps);
            simTime += dt;
            stepChunk++;

            // 40ステップごとにメインスレッドに処理を譲渡してフリーズを完全に防止
            if (stepChunk >= 40) {
              stepChunk = 0;
              await new Promise(r => setTimeout(r, 0));
              if (this._filmstripGenId !== currentGenId) return;
            }
          }

          if (target.waitExtraSec > 0) {
            // 充填完了後のレベリング時間進行
            const extraSteps = Math.floor(target.waitExtraSec / dt);
            let extraChunk = 0;
            for (let s = 0; s < extraSteps; s++) {
              tempSolver.step(dt, subSteps);
              simTime += dt;
              extraChunk++;
              if (extraChunk >= 40) {
                extraChunk = 0;
                await new Promise(r => setTimeout(r, 0));
                if (this._filmstripGenId !== currentGenId) return;
              }
            }
          }
        }

        // コマ描画直前にもUIスライス
        await new Promise(r => setTimeout(r, 0));
        if (this._filmstripGenId !== currentGenId) return;

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
        filmCtx.fillText(`${target.label} [${target.phase}]`, destX + 12, destY + 22);

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

      this.currentFilmstripDataUrl = filmCanvas.toDataURL('image/png');

      if (this.filmstripImagePreview) {
        this.filmstripImagePreview.src = this.currentFilmstripDataUrl;
      }

      if (typeof callback === 'function') {
        callback();
      }
    } catch (err) {
      console.error('Filmstrip generation error:', err);
    } finally {
      if (this._filmstripGenId === currentGenId && this.filmstripLoadingSpinner) {
        this.filmstripLoadingSpinner.style.display = 'none';
      }
    }
  }

  _updateCrownTheoryCard() {
    if (!this.solver) return;
    const dim = this.solver.getCrownDimensionlessNumbers();
    if (this.crownV0Text) this.crownV0Text.textContent = `${dim.V0.toFixed(2)} m/s`;
    if (this.crownWeText) this.crownWeText.textContent = dim.We.toFixed(1);
    if (this.crownReText) this.crownReText.textContent = dim.Re.toFixed(1);
    if (this.crownOhText) this.crownOhText.textContent = dim.Oh.toFixed(3);
    if (this.crownKText) this.crownKText.textContent = dim.K.toFixed(1);
    if (this.crownRegimeBadge) {
      this.crownRegimeBadge.textContent = dim.regimeText;
      if (dim.regime === 'splash') {
        this.crownRegimeBadge.style.color = '#f43f5e';
        this.crownRegimeBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        this.crownRegimeBadge.style.background = 'rgba(244, 63, 94, 0.15)';
      } else if (dim.regime === 'crater') {
        this.crownRegimeBadge.style.color = '#cbd5e1';
        this.crownRegimeBadge.style.borderColor = 'rgba(203, 213, 225, 0.3)';
        this.crownRegimeBadge.style.background = 'rgba(203, 213, 225, 0.08)';
      } else {
        this.crownRegimeBadge.style.color = '#38bdf8';
        this.crownRegimeBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        this.crownRegimeBadge.style.background = 'rgba(56, 189, 248, 0.15)';
      }
    }
  }

  _updateCoatingTheoryCard() {
    if (!this.solver) return;
    const m = this.solver.getCoatingTheoreticalMetrics();
    if (this.coatingShearRateText) this.coatingShearRateText.textContent = `${m.shearRate.toFixed(1)} s⁻¹`;
    if (this.coatingViscosityText) {
      const viscMpa = m.viscosity * 1000.0;
      this.coatingViscosityText.textContent = viscMpa < 1000 ? `${viscMpa.toFixed(1)} mPa·s` : `${m.viscosity.toFixed(3)} Pa·s`;
    }
    if (this.coatingStressText) this.coatingStressText.textContent = `${m.wallStress.toFixed(1)} Pa`;
    if (this.coatingWetThicknessText) {
      this.coatingWetThicknessText.textContent = `${m.wetThicknessUm.toFixed(1)} μm (${(m.thicknessRatio * 100).toFixed(1)}%)`;
    }
    if (this.coatingQualityBadge) {
      let qText = m.qualityText;
      if (this.solver.coatingRoughness === 'textured') {
        qText = '〰️ 凸凹テクスチャ基板 (Textured Ribbed Coating)';
      } else if (this.solver.coatingRoughness === 'rough') {
        qText = '🏜️ 粗面ピンニング塗工 (Rough Sandblasted Coating)';
      }
      this.coatingQualityBadge.textContent = qText;
      if (m.quality === 'good' && this.solver.coatingRoughness === 'smooth') {
        this.coatingQualityBadge.style.color = '#10b981';
        this.coatingQualityBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        this.coatingQualityBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      } else {
        this.coatingQualityBadge.style.color = '#38bdf8';
        this.coatingQualityBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        this.coatingQualityBadge.style.background = 'rgba(56, 189, 248, 0.15)';
      }
    }
  }

  _updateUIStats() {
    if (!this.solver) return;

    if (this.solver.testMode === 'coating') {
      if (this.coatingFilmThicknessVal) {
        this.coatingFilmThicknessVal.textContent = `${this.solver.coatingFilmThicknessUm.toFixed(1)} μm`;
      }
      if (this.coatingShearRateVal) {
        this.coatingShearRateVal.textContent = `${this.solver.coatingShearRate.toFixed(0)} s⁻¹`;
      }
      if (this.coatingViscosityVal) {
        this.coatingViscosityVal.textContent = `${this.solver.coatingViscosity.toFixed(3)} Pa·s`;
      }
      if (this.coatingDragForceVal) {
        this.coatingDragForceVal.textContent = `${this.solver.coatingDragForcePa.toFixed(1)} Pa`;
      }
      if (this.particleCountVal) {
        this.particleCountVal.textContent = this.solver.numParticles.toLocaleString();
      }
      return;
    }

    if (this.solver.testMode === 'crown') {
      if (this.particleCountVal) {
        this.particleCountVal.textContent = this.solver.numParticles.toLocaleString();
      }
      return;
    }

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

  // ══════════════════════════════════════════════════════════════════
  // 📱 スマホ加速度・傾きセンサー連携 (DeviceMotion / DeviceOrientation)
  // ══════════════════════════════════════════════════════════════════

  async _toggleMotionSensor() {
    if (this.isMotionSensorActive) {
      this._disableMotionSensor();
    } else {
      await this._enableMotionSensor(true);
    }
  }

  async _enableMotionSensor(showFeedback = true) {
    try {
      // iOS 13+ の Permissions API による加速度/傾きセンサー許可要求
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const motionRes = await DeviceMotionEvent.requestPermission();
        if (motionRes !== 'granted') {
          if (showFeedback) alert('加速度センサーの利用が許可されませんでした。Safariの設定をご確認ください。');
          return;
        }
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => {});
      }

      if (!this._boundDeviceMotionHandler) {
        this._boundDeviceMotionHandler = (e) => this._onDeviceMotion(e);
      }
      if (!this._boundDeviceOrientationHandler) {
        this._boundDeviceOrientationHandler = (e) => this._onDeviceOrientation(e);
      }

      window.addEventListener('devicemotion', this._boundDeviceMotionHandler, { passive: true });
      window.addEventListener('deviceorientation', this._boundDeviceOrientationHandler, { passive: true });

      this.isMotionSensorActive = true;
      if (this.motionSensorBtn) {
        this.motionSensorBtn.classList.add('btn-active');
        this.motionSensorBtn.style.background = 'rgba(16, 185, 129, 0.25)';
        this.motionSensorBtn.style.borderColor = '#10b981';
        this.motionSensorBtn.title = 'スマホセンサー連携中 (タップでOFF)';
      }
    } catch (err) {
      console.warn('Motion sensor init error:', err);
      if (showFeedback) {
        alert('加速度センサーの有効化に失敗しました（HTTPS環境または対応端末が必要です）');
      }
    }
  }

  _disableMotionSensor() {
    if (this._boundDeviceMotionHandler) {
      window.removeEventListener('devicemotion', this._boundDeviceMotionHandler);
    }
    if (this._boundDeviceOrientationHandler) {
      window.removeEventListener('deviceorientation', this._boundDeviceOrientationHandler);
    }
    this.isMotionSensorActive = false;
    if (this.solver) {
      this.solver.setSensorTilt(0, 0);
    }
    if (this.motionSensorBtn) {
      this.motionSensorBtn.classList.remove('btn-active');
      this.motionSensorBtn.style.background = '';
      this.motionSensorBtn.style.borderColor = '';
      this.motionSensorBtn.title = 'スマホの加速度・傾きセンサー連携を有効化/無効化';
    }
  }

  _onDeviceMotion(e) {
    if (!this.solver || !this.isMotionSensorActive) return;

    // 重力を除いた加速度、または重力を含む加速度
    const acc = e.acceleration || e.accelerationIncludingGravity;
    if (!acc) return;

    const ax = acc.x || 0.0;
    const ay = acc.y || 0.0;
    const az = acc.z || 0.0;

    // スマホの振り (Shake) 検出: 大きな揺れは許容せず、一定以上の素早い振りを微小インパルスとして付加
    const totalAcc = Math.sqrt(ax * ax + ay * ay + az * az);
    const now = performance.now();

    // 閾値: 約 11.5 m/s^2 以上、かつ前回の揺れから 450ms 以上経過
    if (totalAcc > 11.5 && (now - this.lastSensorShakeTime > 450)) {
      this.lastSensorShakeTime = now;
      this.solver.triggerShakeFromSensor(ax, ay, az);
    }
  }

  _onDeviceOrientation(e) {
    if (!this.solver || !this.isMotionSensorActive) return;

    // gamma: 左右傾き (-90°〜+90°)
    // beta: 前後傾き (-180°〜+180°)
    const gamma = e.gamma || 0.0;
    const beta = e.beta || 0.0;

    this.solver.setSensorTilt(gamma, beta);
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

      // フローティンググラフダイアログが表示されている場合のリアルタイム同期
      if (this.floatingChartDialog && this.floatingChartDialog.style.display !== 'none' && this.charts) {
        if (!this._floatChartFrameCount) this._floatChartFrameCount = 0;
        this._floatChartFrameCount++;
        if (this._floatChartFrameCount % 3 === 0) {
          if (this.floatPanelCoating && this.floatPanelCoating.style.display !== 'none' && this.floatCoatingCanvas) {
            this.charts.renderCoatingProfileChart(this.solver, this.floatCoatingCanvas);
          } else if (this.floatPanelSag && this.floatPanelSag.style.display !== 'none' && this.floatSaggingCanvas) {
            this.charts.renderSaggingCurve(this.solver, this.model, this.floatSaggingCanvas);
          }
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
