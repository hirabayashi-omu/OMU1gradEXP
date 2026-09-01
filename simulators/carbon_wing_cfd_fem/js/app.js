/**
 * app.js - メインアプリケーションコントローラー
 * UIイベント処理、解析実行フロー、Chart.js グラフ管理
 */

'use strict';

// -------------------------------------------------------
// グローバル状態
// -------------------------------------------------------
let currentResult = null;
let particleSystem = null;
let chartCl = null;
let chartStress = null;
let currentMode = 'coupled'; // 常時連成（CFD + FEM 並列表示）
let cfdDisplayMode = 'streamlines'; // 'streamlines' | 'vectors' | 'velContour' | 'cpContour'
let femDisplayMode = 'vectors';      // 'vectors' (デフォルト) | 'stress'
let showGeometryLabels = false;     // 幾何ラベル表示（デフォルトOFFでスッキリ）

// -------------------------------------------------------
// DOM要素取得
// -------------------------------------------------------
const dom = {};
function initDom() {
  // モードタブ（もし存在すれば取得）
  dom.tabCfd    = document.getElementById('tabCfd');
  dom.tabFem    = document.getElementById('tabFem');
  dom.tabCoupled = document.getElementById('tabCoupled');

  // コントロール
  dom.selAirfoil    = document.getElementById('selAirfoil');
  dom.selLayup      = document.getElementById('selLayup');
  dom.selFlightState = document.getElementById('selFlightState');
  dom.sliderGamma   = document.getElementById('sliderGamma');
  dom.valGamma      = document.getElementById('valGamma');
  dom.sliderAlpha   = document.getElementById('sliderAlpha');
  dom.valAlpha      = document.getElementById('valAlpha');
  dom.sliderVinf    = document.getElementById('sliderVinf');
  dom.valVinf       = document.getElementById('valVinf');
  dom.sliderSpan    = document.getElementById('sliderSpan');
  dom.valSpan       = document.getElementById('valSpan');
  dom.sliderChord   = document.getElementById('sliderChord');
  dom.valChord      = document.getElementById('valChord');
  dom.sliderAlt     = document.getElementById('sliderAlt');
  dom.valAlt        = document.getElementById('valAlt');
  dom.btnRun        = document.getElementById('btnRun');
  dom.btnToggleSidebar = document.getElementById('btnToggleSidebar');
  dom.btnToggleLabels  = document.getElementById('btnToggleLabels');

  // Canvas
  dom.canvasCfd  = document.getElementById('canvasCfd');
  dom.canvasFem  = document.getElementById('canvasFem');

  // KPI カード
  dom.kpiCl   = document.getElementById('kpiCl');
  dom.kpiCd   = document.getElementById('kpiCd');
  dom.kpiLift = document.getElementById('kpiLift');
  dom.kpiWeight = document.getElementById('kpiWeight');
  dom.kpiDrag = document.getElementById('kpiDrag');
  dom.kpiDefl = document.getElementById('kpiDefl');
  dom.kpiStress = document.getElementById('kpiStress');
  dom.kpiSF   = document.getElementById('kpiSF');
  dom.kpiMa   = document.getElementById('kpiMa');

  // ステータス
  dom.statusBadge = document.getElementById('statusBadge');
  dom.statusMsg   = document.getElementById('statusMsg');
  dom.gpuBadge    = document.getElementById('gpuBadge');

  // 材料詳細パネル
  dom.matE1   = document.getElementById('matE1');
  dom.matG12  = document.getElementById('matG12');
  dom.matDens = document.getElementById('matDens');
  dom.matXt   = document.getElementById('matXt');
  dom.matColor = document.getElementById('matColor');

  // 翼重量試算パネル
  dom.weightTotalMass = document.getElementById('weightTotalMass');
  dom.weightTotalForce = document.getElementById('weightTotalForce');
  dom.weightCompareBadge = document.getElementById('weightCompareBadge');
  dom.weightSkin = document.getElementById('weightSkin');
  dom.weightSpar = document.getElementById('weightSpar');
  dom.weightRib = document.getElementById('weightRib');
  dom.weightJoint = document.getElementById('weightJoint');

  // サイドバー
  dom.sidebar = document.getElementById('controlSidebar');
  dom.iconToggle = document.getElementById('iconToggleSidebar');
}

// -------------------------------------------------------
// スライダーのリアルタイム表示更新
// -------------------------------------------------------
function bindSliders() {
  dom.sliderAlpha.addEventListener('input', () => {
    dom.valAlpha.textContent = `${parseFloat(dom.sliderAlpha.value).toFixed(1)}°`;
  });
  if (dom.sliderGamma) {
    dom.sliderGamma.addEventListener('input', () => {
      const g = parseFloat(dom.sliderGamma.value);
      dom.valGamma.textContent = `${g >= 0 ? '+' : ''}${g.toFixed(1)}°`;
    });
  }
  dom.sliderVinf.addEventListener('input', () => {
    const v = parseFloat(dom.sliderVinf.value);
    const kt = (v * 1.94384).toFixed(0);
    dom.valVinf.textContent = `${v.toFixed(0)} m/s (${kt} kt)`;
    const ma = (v / 340).toFixed(3);
    dom.kpiMa.textContent = `Ma ${ma}`;
  });

  // ⚖️ 水平飛行トリム自動計算 (L = W)
  const btnAutoTrim = document.getElementById('btnAutoTrim');
  if (btnAutoTrim) {
    btnAutoTrim.addEventListener('click', () => {
      if (!currentResult) return;
      const v = parseFloat(dom.sliderVinf.value);
      const span = parseFloat(dom.sliderSpan.value);
      const chord = parseFloat(dom.sliderChord.value);
      const weightN = currentResult.gravity ? currentResult.gravity.weightN : 9690;
      const S = span * chord;
      const rho = 1.225;
      const q = 0.5 * rho * v * v;
      const targetCl = weightN / (q * S);

      const m = currentResult.airfoilData.preset.m || 0;
      const alphaL0 = m > 0 ? -2 * m : 0;
      const targetAlphaRad = (targetCl / (2 * Math.PI)) + alphaL0;
      let targetAlphaDeg = targetAlphaRad * 180 / Math.PI;

      // クランプ
      targetAlphaDeg = Math.max(-6, Math.min(20, targetAlphaDeg));
      dom.sliderAlpha.value = targetAlphaDeg.toFixed(1);
      dom.valAlpha.textContent = `${targetAlphaDeg.toFixed(1)}°`;

      // 経路角は水平 (0°)
      if (dom.sliderGamma) {
        dom.sliderGamma.value = 0;
        dom.valGamma.textContent = '0.0°';
      }
      if (dom.selFlightState) dom.selFlightState.value = 'CRUISE';

      runAnalysis();
    });
  }
  dom.sliderSpan.addEventListener('input', () => {
    dom.valSpan.textContent = `${parseFloat(dom.sliderSpan.value).toFixed(1)} m`;
  });
  dom.sliderChord.addEventListener('input', () => {
    dom.valChord.textContent = `${parseFloat(dom.sliderChord.value).toFixed(2)} m`;
  });
  dom.sliderAlt.addEventListener('input', () => {
    dom.valAlt.textContent = `${parseInt(dom.sliderAlt.value).toLocaleString()} m`;
  });

  // 飛行状態プリセット連動
  if (dom.selFlightState) {
    dom.selFlightState.addEventListener('change', () => {
      const val = dom.selFlightState.value;
      if (val === 'CLIMB') dom.sliderGamma.value = 10;
      else if (val === 'DESCENT') dom.sliderGamma.value = -10;
      else dom.sliderGamma.value = 0;
      const g = parseFloat(dom.sliderGamma.value);
      dom.valGamma.textContent = `${g >= 0 ? '+' : ''}${g.toFixed(1)}°`;
      runAnalysis();
    });
  }

  // 翼型や積層、スライダー変更時に自動解析実行
  dom.selAirfoil.addEventListener('change', () => runAnalysis());
  dom.selLayup.addEventListener('change', () => {
    updateMaterialPanel();
    runAnalysis();
  });

  [dom.sliderGamma, dom.sliderAlpha, dom.sliderVinf, dom.sliderSpan, dom.sliderChord, dom.sliderAlt].forEach(sl => {
    if (sl) sl.addEventListener('change', () => runAnalysis());
  });
}

// -------------------------------------------------------
// 材料情報パネル更新
// -------------------------------------------------------
function updateMaterialPanel() {
  const key = dom.selLayup.value;
  const mat = FEMEngine.LAYUP_PRESETS[key];
  if (!mat) return;
  dom.matE1.textContent   = `${(mat.E1 / 1e9).toFixed(0)} GPa`;
  dom.matG12.textContent  = `${(mat.G12 / 1e9).toFixed(1)} GPa`;
  dom.matDens.textContent = `${mat.rho} kg/m³`;
  dom.matXt.textContent   = `${(mat.Xt / 1e6).toFixed(0)} MPa`;
  if (dom.matColor) dom.matColor.style.backgroundColor = mat.color;
}

// -------------------------------------------------------
// モードタブ切り替え
// -------------------------------------------------------
function setMode(mode) {
  currentMode = mode;
  [dom.tabCfd, dom.tabFem, dom.tabCoupled].forEach(t => t.classList.remove('active'));
  if (mode === 'cfd')     dom.tabCfd.classList.add('active');
  if (mode === 'fem')     dom.tabFem.classList.add('active');
  if (mode === 'coupled') dom.tabCoupled.classList.add('active');

  // Canvas表示切り替え
  dom.canvasCfd.parentElement.style.display = (mode === 'cfd' || mode === 'coupled') ? '' : 'none';
  dom.canvasFem.parentElement.style.display = (mode === 'fem' || mode === 'coupled') ? '' : 'none';

  if (currentResult) renderAll(currentResult);
}

// -------------------------------------------------------
// メイン解析実行
// -------------------------------------------------------
async function runAnalysis() {
  const alphaDeg = parseFloat(dom.sliderAlpha.value);
  const gammaDeg = dom.sliderGamma ? parseFloat(dom.sliderGamma.value) : 0;
  const Vinf     = parseFloat(dom.sliderVinf.value);
  const span     = parseFloat(dom.sliderSpan.value);
  const chord    = parseFloat(dom.sliderChord.value);
  const altitude = parseInt(dom.sliderAlt.value);
  const airfoilKey = dom.selAirfoil.value;
  const layupKey   = dom.selLayup.value;

  // 実行中UI
  dom.btnRun.disabled = true;
  dom.btnRun.innerHTML = '<span class="spin">⟳</span> 解析中...';
  dom.statusBadge.className = 'status-badge running';
  dom.statusMsg.textContent = 'CFD + FEM 連成解析実行中 (100要素 / 512x256)...';

  try {
    const result = await Coupling.runCoupledAnalysis(
      { alphaDeg, gammaDeg, Vinf, span, chord, altitude, airfoilKey },
      { layupKey, nElem: 100 }
    );
    currentResult = result;
    renderAll(result);
    updateKPIs(result);
    updateCharts(result);
    updateStatus(result);
  } catch (e) {
    console.error(e);
    dom.statusMsg.textContent = `エラー: ${e.message}`;
    dom.statusBadge.className = 'status-badge error';
  } finally {
    dom.btnRun.disabled = false;
    dom.btnRun.innerHTML = '<i data-lucide="play"></i> 解析実行';
    if (window.lucide) lucide.createIcons();
  }
}

// -------------------------------------------------------
// 描画全体
// -------------------------------------------------------
function renderAll(result) {
  if (currentMode === 'cfd' || currentMode === 'coupled') {
    renderCFDCanvas(result);
  }
  if (currentMode === 'fem' || currentMode === 'coupled') {
    renderFEMCanvas(result);
  }
}

// -------------------------------------------------------
// CFD Canvasの描画
// -------------------------------------------------------
function renderCFDCanvas(result) {
  const canvas = dom.canvasCfd;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // 背景グラデーション
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060d1a');
  bg.addColorStop(1, '#0a1624');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const chord = result.airfoilData.chord;
  const scaleX = W * 0.52 / chord;
  const scaleY = H * 0.52 / chord;
  const ox = W * 0.12;
  const oy = H * 0.52;

  // ── 背景：飛行機胴体ゴーストシルエット & 飛行/気流の向き & 迎角アーク ──
  Renderer.drawAircraftFuselageAndFlightVectors(ctx, ox, oy, chord, scaleX, scaleY, result.params.alpha, result.params.gamma || 0, W, H);

  const { cpUpper, cpLower, stallFactor, velocityField } = result.cfd;
  const isStalled = stallFactor < 0.7;

  // 1. 速度コンターモード（全域ヒートマップ）
  if (cfdDisplayMode === 'velContour') {
    if (particleSystem) { particleSystem.stop(); particleSystem = null; }
    Renderer.drawVelocityContour(ctx, velocityField, ox, oy, W, H, result.params.Vinf, chord);
    Renderer.drawAirfoil(ctx, result.airfoilData, ox, oy, scaleX, scaleY, {
      fillColor: 'rgba(5,12,25,0.85)',
      strokeColor: '#60b4ff',
      lineWidth: 2.0,
    });
    Renderer.drawColorBar(ctx, W - 36, H * 0.12, 14, H * 0.65,
      0, (result.params.Vinf * 1.5).toFixed(0), 'V [m/s]', 'turbo');
  }
  // 2. 速度ベクトルモード (高密度矢印 + 発光強調)
  else if (cfdDisplayMode === 'vectors') {
    if (particleSystem) { particleSystem.stop(); particleSystem = null; }
    // 背景に薄い速度コンターを敷いて視認性を極限まで強調
    ctx.globalAlpha = 0.28;
    Renderer.drawVelocityContour(ctx, velocityField, ox, oy, W, H, result.params.Vinf, chord);
    ctx.globalAlpha = 1.0;

    Renderer.drawVelocityVectors(ctx, velocityField, ox, oy, W, H, result.params.Vinf, chord);
    Renderer.drawAirfoil(ctx, result.airfoilData, ox, oy, scaleX, scaleY, {
      fillColor: 'rgba(10,24,45,0.92)',
      strokeColor: '#60b4ff',
      lineWidth: 2.0,
    });
    Renderer.drawColorBar(ctx, W - 36, H * 0.12, 14, H * 0.65,
      0, (result.params.Vinf * 1.5).toFixed(0), 'V [m/s]', 'turbo');
  }
  // 3. 圧力コンターモード (流場全域 Cp ヒートマップ + 翼面Cp)
  else if (cfdDisplayMode === 'cpContour') {
    if (particleSystem) { particleSystem.stop(); particleSystem = null; }
    Renderer.drawPressureFieldContour(ctx, velocityField, ox, oy, W, H, result.params.Vinf, chord);
    Renderer.drawPressureContour(ctx, result.airfoilData, cpUpper, cpLower, ox, oy, scaleX, scaleY);
    Renderer.drawAirfoil(ctx, result.airfoilData, ox, oy, scaleX, scaleY, {
      fillColor: 'rgba(12,30,55,0.85)',
      strokeColor: '#ffffff',
      lineWidth: 2.0,
    });
    Renderer.drawColorBar(ctx, W - 36, H * 0.12, 14, H * 0.65,
      -3.0, 1.0, 'Cp', 'pressure');
  }
  // 4. 流線アニメーションモード
  else {
    Renderer.drawPressureContour(ctx, result.airfoilData, cpUpper, cpLower, ox, oy, scaleX, scaleY);
    Renderer.drawAirfoil(ctx, result.airfoilData, ox, oy, scaleX, scaleY, {
      fillColor: 'rgba(12,30,55,0.92)',
      strokeColor: '#60b4ff',
      lineWidth: 1.8,
    });
    Renderer.drawColorBar(ctx, W - 36, H * 0.12, 14, H * 0.65,
      -3.0, 1.0, 'Cp', 'pressure');

    if (particleSystem) {
      particleSystem.updateParams(
        result.airfoilData,
        result.params.alpha,
        result.params.Vinf,
        result.cfd.velocityField
      );
    } else {
      startParticleAnimation(result, canvas, ctx, isStalled);
    }
  }

  // ── 翼型幾何ラベル・寸法線（トグルON時のみ表示） ──
  if (showGeometryLabels) {
    Renderer.drawAirfoilGeometryLabels(ctx, result.airfoilData, ox, oy, scaleX, scaleY);
  }

  // ── 重心から重力・揚力・抗力ベクトルを描画 ──
  if (result.gravity) {
    Renderer.drawAerodynamicAndGravityVectors(
      ctx,
      result.gravity.cg,
      result.cfd.lift,
      result.cfd.drag,
      result.gravity.weightN,
      result.params.alpha,
      ox, oy, scaleX, scaleY, H
    );
  }

  // 迎角・ピッチ角・KPI表示
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 13px Inter, sans-serif';
  const thetaDeg = (result.params.thetaDeg || result.params.alphaDeg).toFixed(1);
  const gammaDeg = (result.params.gammaDeg || 0).toFixed(1);
  ctx.fillText(`迎角 α = ${result.params.alphaDeg.toFixed(1)}°`, ox, H - 14);
  ctx.fillText(`経路角 γ = ${gammaDeg >= 0 ? '+' : ''}${gammaDeg}°`, ox + 110, H - 14);
  ctx.fillText(`ピッチ角 θ = ${thetaDeg}°`, ox + 240, H - 14);
  ctx.fillText(`Cl = ${result.cfd.clFinal.toFixed(3)}`, ox + 370, H - 14);
  if (isStalled) {
    ctx.fillStyle = '#ff4444';
    ctx.fillText('⚠ 失速 (STALL)', ox + 460, H - 14);
  }
  ctx.restore();
}

// -------------------------------------------------------
// パーティクルアニメーション開始/更新
// -------------------------------------------------------
function startParticleAnimation(result, canvas, ctx, isStalled) {
  if (particleSystem) particleSystem.stop();

  particleSystem = new Renderer.ParticleSystem(
    canvas,
    result.airfoilData,
    result.params.alpha,
    result.params.Vinf
  );
  particleSystem.setVelocityField(result.cfd.velocityField);

  particleSystem.startAnimation(() => {
    if (!currentResult || cfdDisplayMode !== 'streamlines') return;
    const r = currentResult;
    const W = canvas.width, H = canvas.height;
    const ctx2 = canvas.getContext('2d');
    const chord = r.airfoilData.chord;
    const scaleX = W * 0.52 / chord;
    const scaleY = H * 0.52 / chord;
    const ox = W * 0.12;
    const oy = H * 0.52;

    // 再描画
    const bg = ctx2.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#060d1a');
    bg.addColorStop(1, '#0a1624');
    ctx2.fillStyle = bg;
    ctx2.fillRect(0, 0, W, H);

    // 飛行機胴体ゴーストシルエット & 飛行/気流の向き & 迎角アーク
    Renderer.drawAircraftFuselageAndFlightVectors(ctx2, ox, oy, chord, scaleX, scaleY, r.params.alpha, r.params.gamma || 0, W, H);

    Renderer.drawPressureContour(ctx2, r.airfoilData, r.cfd.cpUpper, r.cfd.cpLower, ox, oy, scaleX, scaleY);
    particleSystem.draw(ctx2, r.cfd.stallFactor < 0.7);
    Renderer.drawAirfoil(ctx2, r.airfoilData, ox, oy, scaleX, scaleY, {
      fillColor: 'rgba(12,30,55,0.95)', strokeColor: '#60b4ff', lineWidth: 1.8,
    });
    Renderer.drawColorBar(ctx2, W - 36, H * 0.12, 14, H * 0.65, -3.0, 1.0, 'Cp', 'pressure');

    // 翼型幾何ラベル・寸法線（トグルON時のみ表示）
    if (showGeometryLabels) {
      Renderer.drawAirfoilGeometryLabels(ctx2, r.airfoilData, ox, oy, scaleX, scaleY);
    }

    // 重心から重力・揚力・抗力ベクトルを描画
    if (r.gravity) {
      Renderer.drawAerodynamicAndGravityVectors(
        ctx2,
        r.gravity.cg,
        r.cfd.lift,
        r.cfd.drag,
        r.gravity.weightN,
        r.params.alpha,
        ox, oy, scaleX, scaleY, H
      );
    }

    ctx2.save();
    ctx2.fillStyle = 'rgba(255,255,255,0.65)';
    ctx2.font = 'bold 13px Inter, sans-serif';
    ctx2.fillText(`α = ${r.params.alphaDeg.toFixed(1)}°`, ox, H - 14);
    ctx2.fillText(`Cl = ${r.cfd.clFinal.toFixed(3)}`, ox + 90, H - 14);
    ctx2.fillText(`Cd = ${r.cfd.cdForm.toFixed(4)}`, ox + 200, H - 14);
    if (r.cfd.stallFactor < 0.7) {
      ctx2.fillStyle = '#ff4466';
      ctx2.font = 'bold 14px Inter';
      ctx2.fillText('⚠ 失速 (STALL DETECTED)', ox + 340, H - 14);
    }
    ctx2.restore();
  });
}

// -------------------------------------------------------
// FEM Canvas描画
// -------------------------------------------------------
function renderFEMCanvas(result) {
  const canvas = dom.canvasFem;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#06100a');
  bg.addColorStop(1, '#0a1810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const { fem, airfoilData, params } = result;
  const chord = airfoilData.chord;

  // ── 上部: 変形スパン図 ──────────────────────────────────────
  const spanOx = W * 0.06;
  const spanOy = H * 0.38;
  const spanPx = W * 0.88;
  const ampFactor = Math.min(300, H * 0.25 / (Math.abs(fem.tipDeflection) + 0.001));

  // グリッド線
  ctx.save();
  ctx.strokeStyle = 'rgba(80,200,120,0.08)';
  ctx.lineWidth = 1;
  for (let gg = 0; gg <= 5; gg++) {
    ctx.beginPath();
    ctx.moveTo(spanOx, spanOy - gg * H * 0.06);
    ctx.lineTo(spanOx + spanPx, spanOy - gg * H * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(spanOx, spanOy + gg * H * 0.06);
    ctx.lineTo(spanOx + spanPx, spanOy + gg * H * 0.06);
    ctx.stroke();
  }
  ctx.restore();

  // ── 上部: スパン図（コンターorベクトル切り替え）─────────────
  if (femDisplayMode === 'vectors') {
    Renderer.drawDisplacementVectors(ctx, fem, spanOx, spanOy, spanPx, ampFactor);
    // ラベル（ベクトルモード）
    ctx.save();
    ctx.fillStyle = 'rgba(150,255,180,0.8)';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`変位ベクトル図  (倍率 ×${ampFactor.toFixed(0)})`, spanOx, spanOy - H * 0.34);
    ctx.fillText('翼根', spanOx - 2, spanOy + 18);
    ctx.fillText('翼端', spanOx + spanPx - 22, spanOy + 18);
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 13px Inter';
    ctx.fillText(`翼端たわみ: ${(fem.tipDeflection * 100).toFixed(1)} cm`, spanOx + spanPx - 150, spanOy - H * 0.34);
    ctx.restore();
  } else {
    Renderer.drawBeamDeformation(ctx, fem, spanOx, spanOy, spanPx, ampFactor);
    // ラベル（コンターモード）
    ctx.save();
    ctx.fillStyle = 'rgba(150,255,180,0.8)';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`スパン方向変形図  (変形倍率 ×${ampFactor.toFixed(0)})`, spanOx, spanOy - H * 0.34);
    ctx.fillText('翼根', spanOx - 2, spanOy + 18);
    ctx.fillText('翼端', spanOx + spanPx - 22, spanOy + 18);
    const defl = (fem.tipDeflection * 100).toFixed(1);
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 13px Inter';
    ctx.fillText(`翼端たわみ: ${defl} cm`, spanOx + spanPx - 150, spanOy - H * 0.34);
    ctx.restore();
  }

  // ── 下部: 翼断面 (応力コンター) ──────────────────────────────
  const scaleX2 = W * 0.38 / chord;
  const scaleY2 = H * 0.22 / chord;
  const ox2 = W * 0.08;
  const oy2 = H * 0.80;

  Renderer.drawSectionStress(ctx, airfoilData, fem.maxStress, fem.maxStress * 1.2, ox2, oy2, scaleX2, scaleY2);
  Renderer.drawAirfoil(ctx, airfoilData, ox2, oy2, scaleX2, scaleY2, {
    fillColor: 'transparent',
    strokeColor: 'rgba(100,255,150,0.6)',
    lineWidth: 1.5,
  });

  // 応力カラーバー
  Renderer.drawColorBar(ctx, W * 0.5, H * 0.60, 14, H * 0.32,
    0, (fem.maxStress / 1e6).toFixed(0), 'σ [MPa]', 'stress');

  // 安全率テキスト
  ctx.save();
  const sfColor = fem.minSF < 1.0 ? '#ff3344' : fem.minSF < 1.5 ? '#ffaa22' : '#44ff88';
  ctx.fillStyle = sfColor;
  ctx.font = `bold 14px Inter, sans-serif`;
  ctx.fillText(`最小安全率 SF = ${fem.minSF.toFixed(2)}`, ox2, oy2 + H * 0.14);
  ctx.fillStyle = 'rgba(200,255,220,0.7)';
  ctx.font = '12px Inter';
  const matObj = FEMEngine.LAYUP_PRESETS[params.layupKey];
  const matPrefix = matObj?.isMetal ? '材料' : '積層';
  ctx.fillText(`${matPrefix}: ${matObj?.name || ''}`, ox2, oy2 + H * 0.14 + 38);
  ctx.restore();
}

// -------------------------------------------------------
// KPIカード更新
// -------------------------------------------------------
function updateKPIs(result) {
  const s = result.summary;
  dom.kpiCl.textContent    = s.Cl.toFixed(3);
  dom.kpiCd.textContent    = s.Cd.toFixed(4);
  dom.kpiLift.textContent  = `${(s.liftN / 1000).toFixed(1)} kN`;
  if (dom.kpiWeight) {
    const wStr = (s.weightN >= 1000) ? `${(s.weightN / 1000).toFixed(2)} kN` : `${s.weightN.toFixed(0)} N`;
    dom.kpiWeight.textContent = `${wStr} (${s.massKg.toFixed(0)} kg)`;
  }

  // 翼重量試算パネルの更新
  if (dom.weightTotalMass) {
    const mass = s.massKg;
    const weightN = s.weightN;
    const wStr = (weightN >= 1000) ? `${(weightN / 1000).toFixed(2)} kN` : `${weightN.toFixed(0)} N`;
    dom.weightTotalMass.textContent = `${mass.toFixed(0)} kg`;
    dom.weightTotalForce.textContent = wStr;

    // 各部材の内訳 (45%, 35%, 15%, 5%)
    if (dom.weightSkin) dom.weightSkin.textContent = `${(mass * 0.45).toFixed(0)} kg`;
    if (dom.weightSpar) dom.weightSpar.textContent = `${(mass * 0.35).toFixed(0)} kg`;
    if (dom.weightRib)  dom.weightRib.textContent  = `${(mass * 0.15).toFixed(0)} kg`;
    if (dom.weightJoint) dom.weightJoint.textContent = `${(mass * 0.05).toFixed(0)} kg`;

    // 比較バッジ
    if (dom.weightCompareBadge) {
      const isMetal = result.material?.isMetal;
      if (isMetal) {
        dom.weightCompareBadge.style.background = 'rgba(255, 170, 0, 0.15)';
        dom.weightCompareBadge.style.color = '#ffaa00';
        dom.weightCompareBadge.style.borderColor = 'rgba(255, 170, 0, 0.3)';
        dom.weightCompareBadge.textContent = `⚙️ CFRP比: +${(mass * (1 - 1600/2810)).toFixed(0)} kg (約76% 重)`;
      } else {
        dom.weightCompareBadge.style.background = 'rgba(40, 230, 138, 0.15)';
        dom.weightCompareBadge.style.color = '#28e68a';
        dom.weightCompareBadge.style.borderColor = 'rgba(40, 230, 138, 0.3)';
        dom.weightCompareBadge.textContent = `✨ 超々ジュラルミン比: ▲${(mass * (2810/1600 - 1)).toFixed(0)} kg (約43% 軽量)`;
      }
    }
  }

  dom.kpiDrag.textContent  = `${(s.dragN / 1000).toFixed(2)} kN`;
  dom.kpiDefl.textContent  = `${(s.tipDeflectionM * 100).toFixed(1)} cm`;
  dom.kpiStress.textContent = `${s.maxStressMPa.toFixed(1)} MPa`;
  dom.kpiSF.textContent    = s.minSafetyFactor.toFixed(2);

  const { Vinf } = result.params;
  const Ma = (Vinf / 340).toFixed(3);
  dom.kpiMa.textContent = `Ma ${Ma}`;

  // KPIカードの色変化
  const sfEl = dom.kpiSF.closest('.kpi-card');
  if (sfEl) {
    sfEl.classList.remove('kpi-warn', 'kpi-danger');
    if (s.minSafetyFactor < 1.0) sfEl.classList.add('kpi-danger');
    else if (s.minSafetyFactor < 1.5) sfEl.classList.add('kpi-warn');
  }
}

// -------------------------------------------------------
// Chart.js グラフ更新
// -------------------------------------------------------
function initCharts() {
  // Cl-α曲線
  const ctxCl = document.getElementById('chartCl').getContext('2d');
  chartCl = new Chart(ctxCl, {
    type: 'line',
    data: { labels: [], datasets: [
      {
        label: 'Cl (揚力係数)',
        data: [],
        borderColor: '#00ccff',
        backgroundColor: 'rgba(0,200,255,0.10)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Cd × 10 (抗力係数)',
        data: [],
        borderColor: '#ff6644',
        backgroundColor: 'rgba(255,100,60,0.08)',
        borderWidth: 1.5,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      },
    ]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'α [°]', color: '#888' },
          ticks: { color: '#777', maxTicksLimit: 8 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: '#777' },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });

  // 応力-α曲線
  const ctxSt = document.getElementById('chartStress').getContext('2d');
  chartStress = new Chart(ctxSt, {
    type: 'line',
    data: { labels: [], datasets: [
      {
        label: '最大応力 [MPa]',
        data: [],
        borderColor: '#ff4488',
        backgroundColor: 'rgba(255,60,120,0.10)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        yAxisID: 'yStress',
      },
      {
        label: '翼端たわみ [cm]',
        data: [],
        borderColor: '#88ff44',
        borderWidth: 1.5,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        yAxisID: 'yDefl',
      },
    ]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'α [°]', color: '#888' },
          ticks: { color: '#777', maxTicksLimit: 8 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        yStress: {
          type: 'linear', position: 'left',
          title: { display: true, text: 'σ [MPa]', color: '#ff4488' },
          ticks: { color: '#ff4488' },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        yDefl: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'δ [cm]', color: '#88ff44' },
          ticks: { color: '#88ff44' },
          grid: { display: false },
        },
      },
    },
  });
}

function updateCharts(result) {
  const sw = result.stressVsAlpha;
  const labels = sw.map(d => d.alphaDeg.toFixed(1));

  chartCl.data.labels = labels;
  chartCl.data.datasets[0].data = sw.map(d => d.Cl);
  chartCl.data.datasets[1].data = sw.map(d => d.Cd * 10);

  // 現在の α に垂直線（annotation は複雑なので点で代用）
  chartCl.update();

  chartStress.data.labels = labels;
  chartStress.data.datasets[0].data = sw.map(d => d.maxStress / 1e6);
  chartStress.data.datasets[1].data = sw.map(d => Math.abs(d.tipDeflection) * 100);
  chartStress.update();
}

// -------------------------------------------------------
// ステータス更新
// -------------------------------------------------------
function updateStatus(result) {
  const s = result.summary;
  let badge = 'ok', msg = '✓ 正常範囲 — 構造安全';
  if (s.isDangerous) {
    badge = 'danger'; msg = '🚨 危険！ 安全率 < 1.0 — 破断リスク';
  } else if (s.isCritical) {
    badge = 'warn'; msg = '⚠ 要注意: 安全率 < 1.5';
  }
  if (s.isStalled) {
    badge = 'warn'; msg = (badge === 'danger' ? msg + ' / ' : '') + '⚠ 失速 (STALL) 検出';
  }
  dom.statusBadge.className = `status-badge ${badge}`;
  dom.statusMsg.textContent = msg;

  if (dom.gpuBadge) {
    if (result.cfd.usedGPU) {
      dom.gpuBadge.innerHTML = '⚡ WebGPU (512×256)';
      dom.gpuBadge.className = 'gpu-badge active';
      dom.gpuBadge.title = 'WebGPU Compute Shader による並列流体解析が有効です';
    } else {
      dom.gpuBadge.innerHTML = '🖥️ CPU Fallback (120×80)';
      dom.gpuBadge.className = 'gpu-badge fallback';
      dom.gpuBadge.title = 'CPU フォールバックモードで実行中です';
    }
  }
}

// -------------------------------------------------------
// サイドバートグル
// -------------------------------------------------------
function initSidebarToggle() {
  dom.btnToggleSidebar.addEventListener('click', () => {
    dom.sidebar.classList.toggle('collapsed');
    const isCollapsed = dom.sidebar.classList.contains('collapsed');
    dom.iconToggle.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
    if (window.lucide) lucide.createIcons();
  });
}

// -------------------------------------------------------
// キャンバスリサイズ対応
// -------------------------------------------------------
function resizeCanvases() {
  const containers = [dom.canvasCfd, dom.canvasFem].map(c => c?.parentElement);
  containers.forEach((cont, idx) => {
    if (!cont) return;
    const canvas = idx === 0 ? dom.canvasCfd : dom.canvasFem;
    canvas.width  = cont.clientWidth  || 700;
    canvas.height = cont.clientHeight || 380;
  });
  if (currentResult) renderAll(currentResult);
  else {
    [dom.canvasCfd, dom.canvasFem].forEach(c => {
      if (c) Renderer.drawStandby(c.getContext('2d'), c.width, c.height);
    });
  }
}

// -------------------------------------------------------
// ベクトル/コンター切り替えボタンの初期化
// -------------------------------------------------------
function initVectorToggles() {
  const cfdBtns = {
    streamlines: document.getElementById('btnCfdStream'),
    vectors: document.getElementById('btnCfdVectors'),
    velContour: document.getElementById('btnCfdVelContour'),
    cpContour: document.getElementById('btnCfdCpContour'),
  };

  function setCfdMode(mode) {
    cfdDisplayMode = mode;
    Object.keys(cfdBtns).forEach(k => {
      if (cfdBtns[k]) {
        if (k === mode) cfdBtns[k].classList.add('active');
        else cfdBtns[k].classList.remove('active');
      }
    });
    if (mode === 'streamlines') {
      if (!particleSystem && currentResult) {
        startParticleAnimation(currentResult, dom.canvasCfd, dom.canvasCfd.getContext('2d'), false);
      }
    } else {
      if (particleSystem) { particleSystem.stop(); particleSystem = null; }
    }
    if (currentResult) renderCFDCanvas(currentResult);
  }

  if (cfdBtns.streamlines) cfdBtns.streamlines.addEventListener('click', () => setCfdMode('streamlines'));
  if (cfdBtns.vectors) cfdBtns.vectors.addEventListener('click', () => setCfdMode('vectors'));
  if (cfdBtns.velContour) cfdBtns.velContour.addEventListener('click', () => setCfdMode('velContour'));
  if (cfdBtns.cpContour) cfdBtns.cpContour.addEventListener('click', () => setCfdMode('cpContour'));

  // 🏷️ 幾何ラベル表示切替ボタン
  if (dom.btnToggleLabels) {
    dom.btnToggleLabels.addEventListener('click', () => {
      showGeometryLabels = !showGeometryLabels;
      if (showGeometryLabels) dom.btnToggleLabels.classList.add('active');
      else dom.btnToggleLabels.classList.remove('active');
      if (currentResult) {
        if (cfdDisplayMode === 'streamlines') {
          // パーティクルアニメーション内でも描画フラグ参照
        } else {
          renderCFDCanvas(currentResult);
        }
      }
    });
  }

  // FEM: 応力コンター ↔ 変位ベクトル
  const btnFemStress  = document.getElementById('btnFemStress');
  const btnFemVectors = document.getElementById('btnFemVectors');
  if (btnFemStress && btnFemVectors) {
    btnFemStress.addEventListener('click', () => {
      femDisplayMode = 'stress';
      btnFemStress.classList.add('active');
      btnFemVectors.classList.remove('active');
      if (currentResult) renderFEMCanvas(currentResult);
    });
    btnFemVectors.addEventListener('click', () => {
      femDisplayMode = 'vectors';
      btnFemVectors.classList.add('active');
      btnFemStress.classList.remove('active');
      if (currentResult) renderFEMCanvas(currentResult);
    });
  }
}

// -------------------------------------------------------
// 初期化
// -------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  initDom();
  bindSliders();
  initSidebarToggle();
  initCharts();
  updateMaterialPanel();
  initVectorToggles();

  // WebGPU 初期化（非同期）
  if (typeof WebGPUEngine !== 'undefined') {
    try {
      await WebGPUEngine.init();
    } catch (err) {
      console.warn('[App] WebGPU initialization error:', err);
    }
  }

  // タブイベント（存在する場合のみ登録）
  if (dom.tabCfd) dom.tabCfd.addEventListener('click', () => setMode('cfd'));
  if (dom.tabFem) dom.tabFem.addEventListener('click', () => setMode('fem'));
  if (dom.tabCoupled) dom.tabCoupled.addEventListener('click', () => setMode('coupled'));

  // 解析ボタン
  dom.btnRun.addEventListener('click', runAnalysis);

  // 初期キャンバスサイズ
  setTimeout(resizeCanvases, 100);
  window.addEventListener('resize', resizeCanvases);

  // Lucide icons
  if (window.lucide) lucide.createIcons();

  // デフォルト: 初回自動実行
  setTimeout(() => runAnalysis(), 200);
});
