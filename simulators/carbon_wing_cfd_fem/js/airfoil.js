/**
 * airfoil.js - NACA 4桁系翼型ジオメトリ生成モジュール
 * 薄翼理論 + パネル法用に上面・下面を離散化する
 */

'use strict';

const Airfoil = (() => {

  // -------------------------------------------------------
  // NACA翼型プリセット定義（薄翼〜超厚翼・対称翼〜強キャンバー翼）
  // -------------------------------------------------------
  const PRESETS = {
    'NACA0006': { m: 0,    p: 0,    t: 0.06, name: 'NACA 0006 (超薄翼/超音速機)', description: 'F-104・超音速ミサイル用 (厚さ6%)' },
    'NACA0012': { m: 0,    p: 0,    t: 0.12, name: 'NACA 0012 (標準対称翼)', description: '航空機尾翼・ヘリコプターブレード (厚さ12%)' },
    'NACA0024': { m: 0,    p: 0,    t: 0.24, name: 'NACA 0024 (超厚翼/高剛性)', description: '風力タービン根元・超大型機 (厚さ24%)' },
    'NACA2412': { m: 0.02, p: 0.4,  t: 0.12, name: 'NACA 2412 (汎用高揚力)', description: 'セスナ等小型機の標準主翼 (キャンバー2%, 厚さ12%)' },
    'NACA4412': { m: 0.04, p: 0.4,  t: 0.12, name: 'NACA 4412 (高揚力翼)', description: 'グライダー・短距離離着陸機 (キャンバー4%, 厚さ12%)' },
    'NACA6412': { m: 0.06, p: 0.4,  t: 0.12, name: 'NACA 6412 (強キャンバー)', description: '低速UAS・模型飛行機 (キャンバー6%, 厚さ12%)' },
    'NACA8418': { m: 0.08, p: 0.4,  t: 0.18, name: 'NACA 8418 (超高揚力・厚翼)', description: '巨大輸送機・極厚高揚力翼 (キャンバー8%, 厚さ18%)' },
    'NACA23012': { m: 0.02148, p: 0.3048, t: 0.12, name: 'NACA 23012 (高速巡航翼)', description: '前寄りキャンバー・低抗力旅客機型' },
  };

  /**
   * NACA 4桁系翼型の厚さ分布 (厚さ半値)
   * @param {number} x - 弦方向位置 [0,1]
   * @param {number} t - 最大厚さ比 (e.g. 0.12)
   * @returns {number} yt
   */
  function thickness(x, t) {
    return (t / 0.2) * (
       0.2969 * Math.sqrt(x)
      - 0.1260 * x
      - 0.3516 * x * x
      + 0.2843 * x * x * x
      - 0.1036 * x * x * x * x
    );
  }

  /**
   * NACA 4桁系のキャンバー線と傾き
   * @param {number} x
   * @param {number} m - 最大キャンバー
   * @param {number} p - 最大キャンバー位置
   * @returns {{ yc, dyc_dx }}
   */
  function camber(x, m, p) {
    if (m === 0 || p === 0) return { yc: 0, dyc_dx: 0 };
    if (x < p) {
      const yc = (m / (p * p)) * (2 * p * x - x * x);
      const dyc_dx = (2 * m / (p * p)) * (p - x);
      return { yc, dyc_dx };
    } else {
      const yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
      const dyc_dx = (2 * m / ((1 - p) * (1 - p))) * (p - x);
      return { yc, dyc_dx };
    }
  }

  /**
   * 翼型の上面・下面座標を生成する
   * @param {string} presetKey - プリセットキー
   * @param {number} N - パネル数 (偶数推奨)
   * @param {number} chord - 翼弦長 [m]
   * @returns {{ upper: [{x,y}], lower: [{x,y}], camberLine: [{x,y}], panelMidpoints: [{x,y,nx,ny,ds}] }}
   */
  function generate(presetKey, N = 200, chord = 1.0) {
    const preset = PRESETS[presetKey] || PRESETS['NACA2412'];
    const { m, p, t } = preset;

    const upper = [];
    const lower = [];
    const camberLine = [];

    // コサイン空間クラスタリング（前縁後縁を細かく）
    for (let i = 0; i <= N; i++) {
      const beta = (Math.PI * i) / N;
      const x = 0.5 * (1 - Math.cos(beta));
      const yt = thickness(x, t);
      const { yc, dyc_dx } = camber(x, m, p);
      const theta = Math.atan(dyc_dx);

      upper.push({
        x: (x - yt * Math.sin(theta)) * chord,
        y: (yc + yt * Math.cos(theta)) * chord,
      });
      lower.push({
        x: (x + yt * Math.sin(theta)) * chord,
        y: (yc - yt * Math.cos(theta)) * chord,
      });
      camberLine.push({ x: x * chord, y: yc * chord });
    }

    // パネル中点・法線ベクトルを計算（パネル法用）
    // 上面 N パネル + 下面 N パネル を前縁回りで結合
    const panelPts = [...upper.slice(0, N + 1), ...lower.slice(1, N + 1).reverse()];
    const panelMidpoints = [];
    for (let i = 0; i < panelPts.length - 1; i++) {
      const A = panelPts[i], B = panelPts[i + 1];
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      const dx = B.x - A.x, dy = B.y - A.y;
      const ds = Math.sqrt(dx * dx + dy * dy);
      // 外向き法線（パネル面積分用）
      panelMidpoints.push({ x: mx, y: my, nx: dy / ds, ny: -dx / ds, ds });
    }

    return { upper, lower, camberLine, panelMidpoints, preset, chord };
  }

  /**
   * 翼型の最大厚さ位置情報を取得（FEM断面特性計算用）
   * @param {string} presetKey
   * @returns {{ tMax, tMaxPos, area, Ixx }} 断面特性（弦長1として正規化）
   */
  function getSectionProperties(presetKey, layupKey) {
    const preset = PRESETS[presetKey] || PRESETS['NACA2412'];
    const { m, p, t } = preset;

    // 断面積（台形則で数値積分）
    const N = 200;
    let area = 0;
    let Ixx = 0;
    let zCentroid = 0;

    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const yt = thickness(x, t);
      const { yc } = camber(x, m, p);
      pts.push({ x, yUpper: yc + yt, yLower: yc - yt, h: 2 * yt, yc });
    }

    // 断面積
    for (let i = 0; i < N; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      area += 0.5 * (pts[i].h + pts[i + 1].h) * dx;
    }

    // 重心 (面積分: x重心, y重心)
    let xCentroid = 0;
    for (let i = 0; i < N; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const xMid = 0.5 * (pts[i].x + pts[i + 1].x);
      const hMid = 0.5 * (pts[i].h + pts[i + 1].h);
      const ycMid = 0.5 * (pts[i].yc + pts[i + 1].yc);
      xCentroid += xMid * hMid * dx;
      zCentroid += ycMid * hMid * dx;
    }
    xCentroid /= area;
    zCentroid /= area;

    // 断面2次モーメント（矩形近似）
    for (let i = 0; i < N; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const h = 0.5 * (pts[i].h + pts[i + 1].h);
      const yc = 0.5 * (pts[i].yc + pts[i + 1].yc) - zCentroid;
      // I = bh³/12 + bh·d²
      Ixx += ((dx * h * h * h) / 12) + (dx * h * yc * yc);
    }

    return { area, Ixx, xCentroid, zCentroid, tMax: t, chord: 1 };
  }

  return { PRESETS, generate, getSectionProperties };
})();
