import { COSMETIC_PRESETS, RheologyModel, MATERIAL_PALETTES } from './models.js?v=floating_charts_v58';
import { WebGPUSPHSolver, CONTAINER_TYPES } from './sph_solver_webgpu.js?v=floating_charts_v58';
import { FluidRenderer } from './fluid_renderer.js?v=floating_charts_v58';
import { ChartRenderer } from './charts.js?v=floating_charts_v58';
import { PresetManager } from './preset_manager.js?v=floating_charts_v58';

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

    // サイドバー項目別ナビゲーションタブ要素
    this.tabSidebarFluidBtn = document.getElementById('tabSidebarFluidBtn');
    this.tabSidebarContainerBtn = document.getElementById('tabSidebarContainerBtn');
    this.tabSidebarSaggingBtn = document.getElementById('tabSidebarSaggingBtn');
    this.sidebarTabFluid = document.getElementById('sidebarTabFluid');
    this.sidebarTabContainer = document.getElementById('sidebarTabContainer');
    this.sidebarTabSagging = document.getElementById('sidebarTabSagging');

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
    this.exportBtn = document.getElementById('exportBtn');
    this.exportFilmstripBtn = document.getElementById('exportFilmstripBtn');

    // 右サイドバー ON/OFF トグル
    this.appContainer = document.querySelector('.app-container');
    this.toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
    this.rightSidebarStateText = document.getElementById('rightSidebarStateText');
    this.isRightSidebarVisible = true;

    // フローティングダイアログ開閉ボタン
    this.openRheoFloatBtn = document.getElementById('openRheoFloatBtn');
    this.openSagFloatBtn = document.getElementById('openSagFloatBtn');
    this.openDocDialogBtn = document.getElementById('openDocDialogBtn');
    this.openChartDialogBtn = document.getElementById('openChartDialogBtn');
    this.toggleFloatChartBtn = document.getElementById('toggleFloatChartBtn');

    // 1. 📈 統合フローティンググラフダイアログ要素
    this.floatingChartDialog = document.getElementById('floatingChartDialog');
    this.floatingChartHeader = document.getElementById('floatingChartHeader');
    this.closeFloatChartBtn = document.getElementById('closeFloatChartBtn');
    this.tabFloatRheoBtn = document.getElementById('tabFloatRheoBtn');
    this.tabFloatSagBtn = document.getElementById('tabFloatSagBtn');
    this.tabFloatParamBtn = document.getElementById('tabFloatParamBtn');
    this.floatPanelRheo = document.getElementById('floatPanelRheo');
    this.floatPanelSag = document.getElementById('floatPanelSag');
    this.floatPanelParam = document.getElementById('floatPanelParam');
    this.floatRheologyCanvas = document.getElementById('floatRheologyCanvas');
    this.floatRheologyFormulaBadge = document.getElementById('floatRheologyFormulaBadge');
    this.floatSaggingCanvas = document.getElementById('floatSaggingCanvas');
    this.floatSagInfoBadge = document.getElementById('floatSagInfoBadge');

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

    // 放置試験モード時は液滴を再滴下
    if (this.solver && this.solver.testMode === 'sagging') {
      this.solver.dropLiquid();
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
   * @param {'fluid'|'container'|'sagging'} tabName 
   */
  _switchSidebarTab(tabName) {
    // タブボタンのアクティブ表示切り替え
    if (this.tabSidebarFluidBtn) this.tabSidebarFluidBtn.classList.toggle('active', tabName === 'fluid');
    if (this.tabSidebarContainerBtn) this.tabSidebarContainerBtn.classList.toggle('active', tabName === 'container');
    if (this.tabSidebarSaggingBtn) this.tabSidebarSaggingBtn.classList.toggle('active', tabName === 'sagging');

    // タブパネルの表示・非表示切り替え
    if (this.sidebarTabFluid) this.sidebarTabFluid.style.display = (tabName === 'fluid') ? 'flex' : 'none';
    if (this.sidebarTabContainer) this.sidebarTabContainer.style.display = (tabName === 'container') ? 'flex' : 'none';
    if (this.sidebarTabSagging) this.sidebarTabSagging.style.display = (tabName === 'sagging') ? 'flex' : 'none';

    // 評価モード（充填 / たれ試験）との連動
    if (tabName === 'sagging') {
      if (this.solver && this.solver.testMode !== 'sagging') {
        this._switchTestMode('sagging', false);
      }
    } else {
      if (this.solver && this.solver.testMode === 'sagging') {
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
    const tabKey = (mode === 'sagging') ? 'sag' : 'rheo';
    this._switchFloatChartTab(tabKey);
  }

  /**
   * 統合フローティンググラフウィンドウ内のタブ切り替え
   * @param {'rheo'|'sag'|'param'} tabKey 
   */
  _switchFloatChartTab(tabKey = 'rheo') {
    if (this.tabFloatRheoBtn) this.tabFloatRheoBtn.classList.toggle('active', tabKey === 'rheo');
    if (this.tabFloatSagBtn) this.tabFloatSagBtn.classList.toggle('active', tabKey === 'sag');
    if (this.tabFloatParamBtn) this.tabFloatParamBtn.classList.toggle('active', tabKey === 'param');

    // タブボタンのアクティブ色
    [this.tabFloatRheoBtn, this.tabFloatSagBtn, this.tabFloatParamBtn].forEach(btn => {
      if (!btn) return;
      const isActive = btn.dataset.charttab === tabKey;
      btn.style.background = isActive ? '#0284c7' : 'transparent';
      btn.style.color = isActive ? '#fff' : '#94a3b8';
    });

    if (this.floatPanelRheo) this.floatPanelRheo.style.display = (tabKey === 'rheo') ? 'flex' : 'none';
    if (this.floatPanelSag) this.floatPanelSag.style.display = (tabKey === 'sag') ? 'flex' : 'none';
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

  _renderFloatDoc(categoryKey) {
    if (!this.floatDocContent) return;

    document.querySelectorAll('.float-doc-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.doctab === categoryKey);
    });

    const docItems = {
      non_newtonian: document.getElementById('docNonNewtonian'),
      sph: document.getElementById('docSPH'),
      filling_mechanics: document.getElementById('docFilling'),
      sagging_mechanics: document.getElementById('docSagging')
    };

    const targetDoc = docItems[categoryKey];
    if (targetDoc) {
      this.floatDocContent.innerHTML = targetDoc.innerHTML;
    }
  }

  _switchTestMode(mode, syncSidebarTab = true) {
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
      if (this.fillingStats) this.fillingStats.style.display = 'grid';
      if (this.saggingStats) this.saggingStats.style.display = 'none';

      // 充填モードでは充填進捗インジケーターを表示
      if (this.fillProgressContainer) this.fillProgressContainer.style.display = 'flex';

      // サイドバータブがたれ試験だった場合、流体・処方タブへ戻す
      if (syncSidebarTab && this.tabSidebarSaggingBtn?.classList.contains('active')) {
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

    // 右サイドバー ON/OFF トグル
    if (this.toggleRightSidebarBtn) {
      this.toggleRightSidebarBtn.addEventListener('click', () => this._toggleRightSidebar());
    }

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

    // 統合フローティンググラフのタブ切り替え
    if (this.tabFloatRheoBtn) {
      this.tabFloatRheoBtn.addEventListener('click', () => this._switchFloatChartTab('rheo'));
    }
    if (this.tabFloatSagBtn) {
      this.tabFloatSagBtn.addEventListener('click', () => this._switchFloatChartTab('sag'));
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
   */
  _generateFilmstripPreview(callback) {
    if (!this.solver) return;

    if (this.filmstripLoadingSpinner) {
      this.filmstripLoadingSpinner.style.display = 'flex';
    }

    // 非同期で描画を実行してUIスピナーを表示
    setTimeout(() => {
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
      offRenderer.smoothingMode = this.renderer.smoothingMode;
      offRenderer.activeMaterial = this.renderer.activeMaterial;

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
        if (targetIdx > 0 || target.ratio > 0.01) {
          let safetyTimeout = 3000;
          while (tempSolver.numParticles < targetParticles && safetyTimeout-- > 0 && !tempSolver.isFilled) {
            tempSolver.step(dt, subSteps);
            simTime += dt;
          }

          if (target.waitExtraSec > 0) {
            // 充填完了後のレベリング時間進行
            const extraSteps = Math.floor(target.waitExtraSec / dt);
            for (let s = 0; s < extraSteps; s++) {
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

      if (this.filmstripLoadingSpinner) {
        this.filmstripLoadingSpinner.style.display = 'none';
      }

      if (typeof callback === 'function') {
        callback();
      }
    }, 20);
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
