/**
 * Propeller Shaft Torsion & Fracture Dynamics Visualizer
 * プロペラシャフトねじり・45°スパイラル破断・ねじり座屈（ペコ潰れ）・応力コンター描画
 */

class ShaftVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
    this.rotAngle = 0;
  }

  resize() {
    this.width = this.canvas.width = 1200;
    this.height = this.canvas.height = 580;
  }

  draw(shaftEngine, matEngine) {
    // 回転速度（破断時は停止）
    if (!shaftEngine.isFractured) {
      this.rotAngle += (shaftEngine.rpm / 60) * 0.05;
    }
    shaftEngine.updateFractureAnimation(0.016);

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. スタジオ背景
    this.drawStudioBackground(ctx, w, h);

    // 2. プロペラシャフト全体機構 ＆ 破断アニメーション (上部 y: 30〜360)
    this.drawPropellerShaftAssembly(ctx, shaftEngine, matEngine, 600, 195);

    // 3. 左下: モール円 ＆ 主応力解析 (x: 40〜440, y: 380〜550)
    this.drawMohrsCircle(ctx, shaftEngine, matEngine, 40, 380, 380, 175);

    // 4. 右下: トルク-応力 ＆ 破壊限界ゲージ (x: 440〜1160, y: 380〜550)
    this.drawStressLimitGauge(ctx, shaftEngine, matEngine, 440, 380, 720, 175);
  }

  drawStudioBackground(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.35, 50, w * 0.5, h * 0.35, 750);
    bgGrad.addColorStop(0, '#0c1322');
    bgGrad.addColorStop(0.6, '#070b14');
    bgGrad.addColorStop(1, '#030509');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // ─── 🚗 プロペラシャフト全体アセンブリ描画 ───
  drawPropellerShaftAssembly(ctx, shaftEngine, matEngine, cx, cy) {
    ctx.save();

    const shaftW = 760;
    const leftX = cx - shaftW / 2;
    const rightX = cx + shaftW / 2;
    const shaftR = (shaftEngine.outerDiameter / 75.0) * 26; // 表示半径 (約26px)

    // 1. 左側: トランスミッション側フランジ ＆ ユニバーサルジョイント
    this.drawUniversalJoint(ctx, leftX - 45, cy, true);

    // 2. 右側: ディファレンシャル側フランジ ＆ ユニバーサルジョイント
    this.drawUniversalJoint(ctx, rightX + 45, cy, false);

    // 3. センターベアリングサポート (中央の吊り下げブラケット)
    this.drawCenterSupportBearing(ctx, cx, cy, shaftR);

    // 4. プロペラシャフト中空本体（応力コンター ＆ 破断アニメーション）
    this.drawShaftTube(ctx, shaftEngine, matEngine, leftX, rightX, cy, shaftR);

    // 5. トルク矢印 ＆ 回転インジケーター
    this.drawTorqueVectors(ctx, leftX - 65, rightX + 65, cy, shaftEngine);

    ctx.restore();
  }

  // ユニバーサルジョイント（十字スパイダー＋ヨーク）
  drawUniversalJoint(ctx, x, y, isLeft) {
    ctx.save();
    const dir = isLeft ? -1 : 1;

    // 取り付けフランジ
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 12, y - 48, 24, 96, 4);
    ctx.fill();
    ctx.stroke();

    // フランジ締結ボルト
    [-30, 30].forEach(by => {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(x, y + by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    });

    // ジョイントヨーク（U字アーム）
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 24);
    ctx.lineTo(x + dir * 35, y - 32);
    ctx.lineTo(x + dir * 35, y + 32);
    ctx.lineTo(x, y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 十字スパイダーピン
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(x + dir * 30, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // センターベアリング
  drawCenterSupportBearing(ctx, x, y, r) {
    ctx.save();
    // ラバーマウントブラケット
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 22, y - r - 22, 44, r * 2 + 44, 8);
    ctx.fill();
    ctx.stroke();

    // ベアリングリング
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(x, y, r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ─── 💥 プロペラシャフト本体 ＆ 各種破壊モード描画 ───
  drawShaftTube(ctx, shaftEngine, matEngine, x1, x2, cy, r) {
    ctx.save();

    const mat = matEngine.currentMaterial;
    const len = x2 - x1;
    const midX = (x1 + x2) / 2;
    const isFractured = shaftEngine.isFractured;
    const fracType = shaftEngine.fractureType;
    const fracProgress = shaftEngine.fractureProgress;

    // 応力レベルに応じた発光色
    const stressRatio = Math.min(1.2, shaftEngine.vonMisesStress / Math.max(1, mat.sigma_u));
    const tubeGrad = ctx.createLinearGradient(0, cy - r, 0, cy + r);

    if (mat.id === 'cfrp') {
      // CFRP織目カーボン調
      tubeGrad.addColorStop(0, '#0f172a');
      tubeGrad.addColorStop(0.3, '#1e293b');
      tubeGrad.addColorStop(0.5, '#334155');
      tubeGrad.addColorStop(0.7, '#1e293b');
      tubeGrad.addColorStop(1, '#020617');
    } else {
      // 金属スチール調
      tubeGrad.addColorStop(0, '#1e293b');
      tubeGrad.addColorStop(0.3, '#475569');
      tubeGrad.addColorStop(0.5, '#94a3b8');
      tubeGrad.addColorStop(0.7, '#475569');
      tubeGrad.addColorStop(1, '#0f172a');
    }

    if (!isFractured) {
      // ─── 1. 健全・ねじり変形中シャフト ───
      ctx.fillStyle = tubeGrad;
      ctx.beginPath();
      ctx.roundRect(x1, cy - r, len, r * 2, 4);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // フォン・ミーゼス応力発光オーバーレイ
      if (stressRatio > 0.4) {
        const glowOpacity = Math.min(0.65, (stressRatio - 0.4) * 0.9);
        const glowColor = (stressRatio >= 1.0) ? `rgba(239, 68, 68, ${glowOpacity})` : `rgba(245, 158, 11, ${glowOpacity})`;
        ctx.fillStyle = glowColor;
        ctx.fillRect(x1, cy - r, len, r * 2);
      }

      // ねじりグリッド線 (回転 ＆ ねじれ変形アニメーション)
      ctx.strokeStyle = (mat.id === 'cfrp') ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;

      const twistTwist = (shaftEngine.twistAngleDeg * Math.PI) / 180;
      for (let i = 0; i < 16; i++) {
        const t = i / 16;
        const lineX = x1 + t * len;
        // シャフトに沿ってねじれるスパイラルストライプ
        const localAngle = this.rotAngle + t * twistTwist * 4;
        const sinA = Math.sin(localAngle);
        if (sinA > -0.2) {
          ctx.beginPath();
          ctx.moveTo(lineX, cy - r * sinA);
          ctx.lineTo(lineX + 25, cy + r * sinA);
          ctx.stroke();
        }
      }

    } else {
      // ─── 2. 破壊・破断モード別描画 ───
      if (fracType === 'spiral_shear') {
        // 🌀 【45°スパイラル螺旋引張/せん断破断】
        this.drawSpiralShearFracture(ctx, x1, x2, cy, r, fracProgress, tubeGrad);
      } else if (fracType === 'torsional_buckling') {
        // 🔶 【薄肉ねじり座屈 (ペコ潰れ・ダイヤモンド波形)】
        this.drawTorsionalBuckling(ctx, x1, x2, cy, r, fracProgress, tubeGrad);
      } else if (fracType === 'euler_buckling') {
        // 〰️ 【軸圧縮オイラー座屈破壊】
        this.drawEulerBuckling(ctx, x1, x2, cy, r, fracProgress, tubeGrad);
      } else {
        // 💥 【CFRPデラミネーション・層間剥離破断】
        this.drawCfrpDelamination(ctx, x1, x2, cy, r, fracProgress, tubeGrad);
      }
    }

    ctx.restore();
  }

  // 🌀 1. 45°スパイラル破断描画
  drawSpiralShearFracture(ctx, x1, x2, cy, r, prog, tubeGrad) {
    const midX = (x1 + x2) / 2;
    const gap = prog * 18;
    const crackAngle = Math.PI / 4; // 45°

    // 左側破断ピース (45°螺旋切断)
    ctx.save();
    ctx.fillStyle = tubeGrad;
    ctx.beginPath();
    ctx.moveTo(x1, cy - r);
    ctx.lineTo(midX - gap + r, cy - r);
    ctx.lineTo(midX - gap - r, cy + r);
    ctx.lineTo(x1, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // 破断面の金属露出
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(midX - gap + r, cy - r);
    ctx.lineTo(midX - gap - r, cy + r);
    ctx.lineWidth = 3;
    ctx.stroke();

    // 右側破断ピース
    ctx.fillStyle = tubeGrad;
    ctx.beginPath();
    ctx.moveTo(midX + gap + r, cy - r);
    ctx.lineTo(x2, cy - r);
    ctx.lineTo(x2, cy + r);
    ctx.lineTo(midX + gap - r, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 破断火花・破片
    this.drawFractureSparks(ctx, midX, cy, prog);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💥 純ねじり 45°スパイラル主応力破断', midX, cy - r - 25);
    ctx.restore();
  }

  // 🔶 2. 薄肉ねじり座屈 (ダイヤモンドペコ潰れ)
  drawTorsionalBuckling(ctx, x1, x2, cy, r, prog, tubeGrad) {
    const midX = (x1 + x2) / 2;
    const buckW = 200;
    const amp = prog * 14;

    ctx.save();
    ctx.fillStyle = tubeGrad;
    ctx.beginPath();
    ctx.moveTo(x1, cy - r);
    ctx.lineTo(midX - buckW / 2, cy - r);
    // 上側の凹み波形
    ctx.quadraticCurveTo(midX - buckW / 4, cy - r + amp, midX, cy - r - amp * 0.4);
    ctx.quadraticCurveTo(midX + buckW / 4, cy - r + amp, midX + buckW / 2, cy - r);
    ctx.lineTo(x2, cy - r);
    ctx.lineTo(x2, cy + r);
    ctx.lineTo(midX + buckW / 2, cy + r);
    // 下側の凹み波形
    ctx.quadraticCurveTo(midX + buckW / 4, cy + r - amp, midX, cy + r + amp * 0.4);
    ctx.quadraticCurveTo(midX - buckW / 4, cy + r - amp, midX - buckW / 2, cy + r);
    ctx.lineTo(x1, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ダイヤモンド状の折り目しわ線
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX - 60, cy - r + 5);
    ctx.lineTo(midX + 20, cy + r - 5);
    ctx.moveTo(midX - 20, cy - r + 5);
    ctx.lineTo(midX + 60, cy + r - 5);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ 薄肉中空管ねじり座屈 (ダイヤモンドペコ潰れ)', midX, cy - r - 25);
    ctx.restore();
  }

  // 〰️ 3. 軸圧縮オイラー座屈破壊
  drawEulerBuckling(ctx, x1, x2, cy, r, prog, tubeGrad) {
    const midX = (x1 + x2) / 2;
    const buckleDeflection = prog * 65;

    ctx.save();
    ctx.fillStyle = tubeGrad;
    ctx.beginPath();
    ctx.moveTo(x1, cy - r);
    ctx.quadraticCurveTo(midX, cy - r + buckleDeflection, x2, cy - r);
    ctx.lineTo(x2, cy + r);
    ctx.quadraticCurveTo(midX, cy + r + buckleDeflection, x1, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💥 軸圧縮オイラー座屈破壊 (大撓み)', midX, cy - r + buckleDeflection - 25);
    ctx.restore();
  }

  // 💥 4. CFRPデラミネーション（層間剥離・繊維破断）
  drawCfrpDelamination(ctx, x1, x2, cy, r, prog, tubeGrad) {
    const midX = (x1 + x2) / 2;
    const gap = prog * 20;

    ctx.save();
    ctx.fillStyle = tubeGrad;
    ctx.beginPath();
    ctx.roundRect(x1, cy - r, (midX - x1) - gap, r * 2, 2);
    ctx.roundRect(midX + gap, cy - r, (x2 - midX) - gap, r * 2, 2);
    ctx.fill();
    ctx.stroke();

    // 繊維の毛羽立ち・層間剥離クラック
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    for (let i = -r + 4; i <= r - 4; i += 6) {
      ctx.beginPath();
      ctx.moveTo(midX - gap, cy + i);
      ctx.lineTo(midX - gap + Math.random() * 25, cy + i + (Math.random() - 0.5) * 10);
      ctx.moveTo(midX + gap, cy + i);
      ctx.lineTo(midX + gap - Math.random() * 25, cy + i + (Math.random() - 0.5) * 10);
      ctx.stroke();
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💥 CFRP層間剥離 (Delamination) ＆ 繊維破断', midX, cy - r - 25);
    ctx.restore();
  }

  // 火花エフェクト
  drawFractureSparks(ctx, cx, cy, prog) {
    ctx.save();
    ctx.fillStyle = '#ffd700';
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = prog * 45 * (0.5 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // トルク・回転ベクトル
  drawTorqueVectors(ctx, x1, x2, cy, shaftEngine) {
    ctx.save();
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';

    // 左端トルク
    ctx.fillText(`入力トルク: ${shaftEngine.appliedTorque} N・m`, x1, cy + 70);
    ctx.fillText(`回転数: ${shaftEngine.rpm} rpm`, x1, cy + 86);

    // 右端反力トルク
    ctx.fillText(`反力トルク: -${shaftEngine.appliedTorque} N・m`, x2, cy + 70);
    ctx.fillText(`ねじれ角: ${shaftEngine.twistAngleDeg.toFixed(2)}°`, x2, cy + 86);

    ctx.restore();
  }

  // ─── 📐 左下: モール円 (Mohr's Stress Circle) ───
  drawMohrsCircle(ctx, shaftEngine, matEngine, gx, gy, gw, gh) {
    ctx.save();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('📐 モール円 (Mohr\'s Stress Circle) ＆ 主応力', gx + 12, gy + 18);

    const mcX = gx + gw / 2;
    const mcY = gy + gh / 2 + 8;
    const maxR = (gh - 45) / 2;

    // 座標軸
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx + 20, mcY);
    ctx.lineTo(gx + gw - 20, mcY);
    ctx.moveTo(mcX, gy + 26);
    ctx.lineTo(mcX, gy + gh - 12);
    ctx.stroke();

    // モール円半径 R = sqrt((sigma_z/2)^2 + tau^2)
    const tau = shaftEngine.shearStressTau;
    const sigma = shaftEngine.axialStressSigma;
    const sigmaCenter = sigma / 2.0;
    const circleR = Math.sqrt(Math.pow(sigmaCenter, 2) + Math.pow(tau, 2));

    const scale = Math.min(0.25, maxR / Math.max(100, circleR * 1.4));
    const plotCenterPx = mcX + sigmaCenter * scale;
    const plotRPx = Math.max(6, circleR * scale);

    // モール円
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(plotCenterPx, mcY, plotRPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(236, 72, 153, 0.1)';
    ctx.fill();

    // 主応力点 σ1, σ2
    const sigma1Px = plotCenterPx + plotRPx;
    const sigma2Px = plotCenterPx - plotRPx;

    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(sigma1Px, mcY, 4, 0, Math.PI * 2);
    ctx.arc(sigma2Px, mcY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '9px monospace';
    ctx.fillText(`σ1 = ${shaftEngine.maxPrincipalStress.toFixed(1)} MPa`, sigma1Px - 30, mcY - 10);
    ctx.fillText(`θp = ${((shaftEngine.principalAngleRad * 180) / Math.PI).toFixed(1)}°`, plotCenterPx - 15, mcY + plotRPx + 12);

    ctx.restore();
  }

  // ─── 📊 右下: トルク-応力 ＆ 破壊限界安全率ゲージ ───
  drawStressLimitGauge(ctx, shaftEngine, matEngine, gx, gy, gw, gh) {
    ctx.save();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "Noto Sans JP", sans-serif';
    ctx.fillText('📊 トルク負荷 ＆ 限界強度ゲージ (フォン・ミーゼス降伏 vs 45°せん断破断 vs ねじり座屈)', gx + 15, gy + 18);

    const barX = gx + 130;
    const barW = gw - 160;
    const maxT = Math.max(6000, shaftEngine.ultimateTorque * 1.25);

    const items = [
      { label: '印加トルク T', val: shaftEngine.appliedTorque, max: maxT, color: '#38bdf8', unit: 'N・m' },
      { label: 'ねじり座屈限界 Tcr', val: shaftEngine.bucklingTorque, max: maxT, color: '#f59e0b', unit: 'N・m' },
      { label: '降伏トルク Ty', val: shaftEngine.yieldTorque, max: maxT, color: '#ffd700', unit: 'N・m' },
      { label: '破断トルク Tu', val: shaftEngine.ultimateTorque, max: maxT, color: '#ef4444', unit: 'N・m' }
    ];

    items.forEach((it, idx) => {
      const by = gy + 36 + idx * 32;

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(it.label, barX - 10, by + 12);

      // 背景バー
      ctx.fillStyle = '#060a12';
      ctx.fillRect(barX, by, barW, 16);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeRect(barX, by, barW, 16);

      // 値バー
      const fillW = Math.min(barW, (Math.max(0, it.val) / maxT) * barW);
      ctx.fillStyle = it.color;
      ctx.fillRect(barX, by, fillW, 16);

      // 数値ラベル
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(it.val)} ${it.unit}`, barX + fillW + 8, by + 12);
    });

    ctx.restore();
  }
}

if (typeof window !== 'undefined') {
  window.ShaftVisualizer = ShaftVisualizer;
}
