/**
 * geometry.js - 流路形状・境界条件マスクジェネレーター
 * 
 * セルタイプ定義:
 *   0: FLUID  (通常流体セル)
 *   1: SOLID  (壁面 - No-slip 条件 u = 0, v = 0)
 *   2: INLET  (流入部 - 指定速度 u = 0, v = -v_in)
 *   3: OUTLET (流出部 - p = 0, du/dn = 0, dv/dn = 0)
 */

export const CELL_TYPE = {
  FLUID: 0,
  SOLID: 1,
  INLET: 2,
  OUTLET: 3
};

export const GEOMETRY_PRESETS = {
  nozzle_cavity: {
    id: 'nozzle_cavity',
    name: 'ノズル注入キャビティ (添付画像形状)',
    desc: '上部細管ノズルから流入し、テーパー状に広がる成形ダイ/キャビティ（添付画像再現）。'
  },
  sudden_contraction: {
    id: 'sudden_contraction',
    name: '4:1 急縮小・急拡大流路',
    desc: '非ニュートン流体の典型的なベンチマーク。角部での渦（Corner vortex）や圧力損失を観察。'
  },
  slit_obstacle: {
    id: 'slit_obstacle',
    name: 'スリット障害物流路',
    desc: '中央に円柱/矩形障害物を配置した流路。後流の剥離域や高せん断層の粘度変化を観察。'
  }
};

export class GeometryGenerator {
  /**
   * 指定解像度 (Nx, Ny) におけるセルタイプ配列 (Uint8Array) を生成
   */
  static generate(typeId, Nx, Ny) {
    const mask = new Uint8Array(Nx * Ny);

    switch (typeId) {
      case 'nozzle_cavity':
        this._generateNozzleCavity(mask, Nx, Ny);
        break;
      case 'sudden_contraction':
        this._generateSuddenContraction(mask, Nx, Ny);
        break;
      case 'slit_obstacle':
        this._generateSlitObstacle(mask, Nx, Ny);
        break;
      default:
        this._generateNozzleCavity(mask, Nx, Ny);
    }

    return mask;
  }

  /**
   * 添付画像形状: 上部ノズル + テーパーダイキャビティ
   * Y=0: 上部 (Top), Y=Ny-1: 下部 (Bottom)
   */
  static _generateNozzleCavity(mask, Nx, Ny) {
    // 全てSOLIDで初期化
    mask.fill(CELL_TYPE.SOLID);

    const cx = Nx / 2;
    const nozzleHalfW = Math.max(3, Math.floor(Nx * 0.025)); // ノズル半幅 (全体の約5%)
    const nozzleBottomY = Math.floor(Ny * 0.42);             // ノズル下端位置 (上から42%)
    const shoulderBottomY = Math.floor(Ny * 0.88);           // 裾広がり下端位置

    for (let j = 0; j < Ny; j++) {
      const yRel = j / Ny; // 0 (上) -> 1 (下)

      for (let i = 0; i < Nx; i++) {
        const idx = j * Nx + i;
        const distFromCenter = Math.abs(i - cx);

        // 1. ノズル部分 (j <= nozzleBottomY)
        if (j <= nozzleBottomY) {
          if (distFromCenter <= nozzleHalfW) {
            if (j === 0) {
              mask[idx] = CELL_TYPE.INLET; // ノズル最上端流入
            } else {
              mask[idx] = CELL_TYPE.FLUID;
            }
          }
        } 
        // 2. 裾広がりキャビティ部分 (j > nozzleBottomY)
        else {
          // 下に向かって幅が滑らかに広がるテーパー形状 (添付画像のプロファイルに合わせた曲線)
          // t: 0 (ノズル下端) -> 1 (キャビティ最下部)
          const t = (j - nozzleBottomY) / (Ny - 1 - nozzleBottomY);
          
          // 添付画像のように、ノズル根元からなだらかに下り、外側へ広がるドーム/三角屋根形状
          // 幅の許容値:
          // x_limit = nozzleHalfW + (Nx * 0.47 - nozzleHalfW) * pow(t, 0.75)
          const maxHalfW = Nx * 0.485;
          const currentHalfW = nozzleHalfW + (maxHalfW - nozzleHalfW) * Math.pow(t, 0.7);

          if (distFromCenter <= currentHalfW) {
            if (j === Ny - 1) {
              mask[idx] = CELL_TYPE.OUTLET; // 下部全面流出
            } else {
              mask[idx] = CELL_TYPE.FLUID;
            }
          }
        }
      }
    }
  }

  /**
   * 4:1 急縮小・急拡大流路
   */
  static _generateSuddenContraction(mask, Nx, Ny) {
    mask.fill(CELL_TYPE.SOLID);
    const wideHalfH = Math.floor(Ny * 0.42);
    const narrowHalfH = Math.floor(Ny * 0.12);
    const midY = Ny / 2;

    const x1 = Math.floor(Nx * 0.35);
    const x2 = Math.floor(Nx * 0.65);

    for (let j = 0; j < Ny; j++) {
      const distY = Math.abs(j - midY);
      for (let i = 0; i < Nx; i++) {
        const idx = j * Nx + i;

        let isFluid = false;
        if (i < x1 || i > x2) {
          isFluid = distY <= wideHalfH;
        } else {
          isFluid = distY <= narrowHalfH;
        }

        if (isFluid) {
          if (i === 0) {
            mask[idx] = CELL_TYPE.INLET; // 左から流入
          } else if (i === Nx - 1) {
            mask[idx] = CELL_TYPE.OUTLET; // 右へ流出
          } else {
            mask[idx] = CELL_TYPE.FLUID;
          }
        }
      }
    }
  }

  /**
   * スリット障害物流路
   */
  static _generateSlitObstacle(mask, Nx, Ny) {
    mask.fill(CELL_TYPE.SOLID);
    const channelHalfH = Math.floor(Ny * 0.38);
    const midY = Ny / 2;
    const cx = Nx * 0.4;
    const cy = midY;
    const radius = Ny * 0.16;

    for (let j = 0; j < Ny; j++) {
      const distY = Math.abs(j - midY);
      for (let i = 0; i < Nx; i++) {
        const idx = j * Nx + i;

        if (distY <= channelHalfH) {
          // 障害物
          const dx = i - cx;
          const dy = j - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            mask[idx] = CELL_TYPE.SOLID;
          } else {
            if (i === 0) {
              mask[idx] = CELL_TYPE.INLET;
            } else if (i === Nx - 1) {
              mask[idx] = CELL_TYPE.OUTLET;
            } else {
              mask[idx] = CELL_TYPE.FLUID;
            }
          }
        }
      }
    }
  }
}
