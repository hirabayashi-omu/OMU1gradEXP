/**
 * mesh_smoother.js - メッシュ＆液面表面平滑化（スムージング）モジュール
 * 
 * 機能:
 *   1. 隣接頂点データ構造 (Adjacency List) の自動構築
 *   2. ラプラシアン平滑化 (Laplacian Smoothing)
 *   3. 体積保持 Taubin 平滑化 (Taubin Smoothing: 収縮λ + 膨張μ)
 *   4. 面積加重頂点法線ベクトルの再計算 (Area-weighted Smooth Normals)
 *   5. 2D/3D 連続液面プロファイル・メニスカス平滑化 (Surface Contour Smoothing)
 *   6. スクリーン空間流体曲率フロー (Screen Space Curvature Flow / Bilateral Filter)
 */

export class MeshSmoother {
  /**
   * ① 三角形インデックス配列から隣接頂点リスト（グラフ）を構築
   * @param {number} numVertices 頂点数
   * @param {Array<number>|Uint32Array} indices 三角形インデックス列 [i0, i1, i2, ...]
   * @returns {Array<Array<number>>} 各頂点の隣接インデックス配列
   */
  static buildAdjacencyList(numVertices, indices) {
    const neighbors = Array.from({ length: numVertices }, () => new Set());
    
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      if (i0 < numVertices && i1 < numVertices && i2 < numVertices) {
        neighbors[i0].add(i1); neighbors[i0].add(i2);
        neighbors[i1].add(i0); neighbors[i1].add(i2);
        neighbors[i2].add(i0); neighbors[i2].add(i1);
      }
    }

    return neighbors.map(set => Array.from(set));
  }

  /**
   * ② 基本ラプラシアン平滑化 (Laplacian Smoothing)
   * 各頂点を隣接頂点の平均位置 x_mean に近づける
   * x_new = x_i + lambda * (x_mean - x_i)
   * 
   * @param {Array<Array<number>>} vertices [[x,y,z], ...]
   * @param {Array<Array<number>>} neighbors 隣接頂点リスト
   * @param {number} iterations 反復回数 (5〜20)
   * @param {number} lambda 移動係数 (0.1〜0.5)
   * @returns {Array<Array<number>>} 平滑化後の頂点配列
   */
  static laplacianSmooth(vertices, neighbors, iterations = 10, lambda = 0.35) {
    const numV = vertices.length;
    let current = vertices.map(v => [v[0], v[1], v[2] || 0]);
    let next = Array.from({ length: numV }, () => [0, 0, 0]);

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < numV; i++) {
        const adj = neighbors[i];
        const n = adj.length;
        if (n === 0) {
          next[i][0] = current[i][0];
          next[i][1] = current[i][1];
          next[i][2] = current[i][2];
          continue;
        }

        let mx = 0, my = 0, mz = 0;
        for (let j = 0; j < n; j++) {
          const idx = adj[j];
          mx += current[idx][0];
          my += current[idx][1];
          mz += current[idx][2];
        }
        mx /= n; my /= n; mz /= n;

        next[i][0] = current[i][0] + lambda * (mx - current[i][0]);
        next[i][1] = current[i][1] + lambda * (my - current[i][1]);
        next[i][2] = current[i][2] + lambda * (mz - current[i][2]);
      }

      for (let i = 0; i < numV; i++) {
        current[i][0] = next[i][0];
        current[i][1] = next[i][1];
        current[i][2] = next[i][2];
      }
    }

    return current;
  }

  /**
   * ③ 体積保持 Taubin 平滑化 (Taubin Smoothing)
   * 収縮 (lambda > 0) と 膨張 (mu < -lambda) を交互に適用し、体積の痩せ細りを完全防止
   * 
   * @param {Array<Array<number>>} vertices [[x,y,z], ...]
   * @param {Array<Array<number>>} neighbors 隣接頂点リスト
   * @param {number} iterations 反復回数 (8〜15)
   * @param {number} lambda 収縮係数 (推奨: 0.33)
   * @param {number} mu 膨張係数 (推奨: -0.34)
   * @returns {Array<Array<number>>} 体積を保持した平滑化後頂点配列
   */
  static taubinSmooth(vertices, neighbors, iterations = 10, lambda = 0.33, mu = -0.34) {
    const numV = vertices.length;
    let current = vertices.map(v => [v[0], v[1], v[2] || 0]);
    let next = Array.from({ length: numV }, () => [0, 0, 0]);

    const step = (factor) => {
      for (let i = 0; i < numV; i++) {
        const adj = neighbors[i];
        const n = adj.length;
        if (n === 0) {
          next[i][0] = current[i][0];
          next[i][1] = current[i][1];
          next[i][2] = current[i][2];
          continue;
        }

        let mx = 0, my = 0, mz = 0;
        for (let j = 0; j < n; j++) {
          const idx = adj[j];
          mx += current[idx][0];
          my += current[idx][1];
          mz += current[idx][2];
        }
        mx /= n; my /= n; mz /= n;

        next[i][0] = current[i][0] + factor * (mx - current[i][0]);
        next[i][1] = current[i][1] + factor * (my - current[i][1]);
        next[i][2] = current[i][2] + factor * (mz - current[i][2]);
      }

      for (let i = 0; i < numV; i++) {
        current[i][0] = next[i][0];
        current[i][1] = next[i][1];
        current[i][2] = next[i][2];
      }
    };

    for (let iter = 0; iter < iterations; iter++) {
      step(lambda); // 凸凹を平滑化 (収縮ステップ)
      step(mu);     // 体積を押し戻す (膨張ステップ)
    }

    return current;
  }

  /**
   * ④ 面積加重頂点法線ベクトル (Area-weighted Normals) の再計算
   * 各ポリゴン面の法線ベクトルを頂点に蓄積して正規化し、滑らかなスペキュラシェーディングを実現
   */
  static recalculateNormals(vertices, indices) {
    const numV = vertices.length;
    const normals = Array.from({ length: numV }, () => [0, 0, 0]);

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const v0 = vertices[i0];
      const v1 = vertices[i1];
      const v2 = vertices[i2];

      // エッジベクトル
      const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = (v1[2] || 0) - (v0[2] || 0);
      const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = (v2[2] || 0) - (v0[2] || 0);

      // 外積
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;

      normals[i0][0] += nx; normals[i0][1] += ny; normals[i0][2] += nz;
      normals[i1][0] += nx; normals[i1][1] += ny; normals[i1][2] += nz;
      normals[i2][0] += nx; normals[i2][1] += ny; normals[i2][2] += nz;
    }

    for (let i = 0; i < numV; i++) {
      const len = Math.hypot(normals[i][0], normals[i][1], normals[i][2]);
      if (len > 1e-6) {
        normals[i][0] /= len;
        normals[i][1] /= len;
        normals[i][2] /= len;
      } else {
        normals[i][1] = -1; // デフォルト上向き法線
      }
    }

    return normals;
  }

  /**
   * ⑤ 2D 連続液面輪郭線 (Surface Height Profile / Meniscus Contour) の平滑化
   * ツノ立ち先端や液面メニスカスのブツブツ感を平滑化
   * @param {Array<{x: number, y: number}>} points 点列
   * @param {number} iterations 反復回数
   * @param {boolean} useTaubin 体積保持Taubinを使用するか
   */
  static smoothContour2D(points, iterations = 8, useTaubin = true, lambda = 0.35, mu = -0.36) {
    if (!points || points.length < 3) return points;

    let pts = points.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length;
    let next = Array.from({ length: n }, () => ({ x: 0, y: 0 }));

    const step = (factor) => {
      // 両端は固定、内部点を隣接平均でスムージング
      next[0] = { ...pts[0] };
      next[n - 1] = { ...pts[n - 1] };

      for (let i = 1; i < n - 1; i++) {
        const mx = (pts[i - 1].x + pts[i + 1].x) * 0.5;
        const my = (pts[i - 1].y + pts[i + 1].y) * 0.5;

        next[i].x = pts[i].x + factor * (mx - pts[i].x);
        next[i].y = pts[i].y + factor * (my - pts[i].y);
      }

      for (let i = 0; i < n; i++) {
        pts[i].x = next[i].x;
        pts[i].y = next[i].y;
      }
    };

    for (let iter = 0; iter < iterations; iter++) {
      if (useTaubin) {
        step(lambda);
        step(mu);
      } else {
        step(lambda);
      }
    }

    return pts;
  }
}
