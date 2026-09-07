/**
 * targetModel.js
 * 受熱ターゲット（毛髪ヘッドモデル / サーモセンサープレート）
 * 表面温度ヒートマップの動的更新とセンシング温度の計測
 */

class TargetModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'TargetRoot';
    this.targetType = 'head'; // 'head' または 'plate'
    this.distance = 20; // cm (2.0 in 3D units)

    // 熱センサーグリッド (解像度 24x24)
    this.gridRes = 24;
    this.temperatures = new Float32Array(this.gridRes * this.gridRes);
    this.ambientTemp = 25.0; // ℃
    this.resetTemperatures();

    // 頂点カラーマテリアル
    this.heatMapMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    this._buildHeadModel();
    this._buildPlateModel();
    this.setTargetType('head');
    this.updatePosition(this.distance);
  }

  resetTemperatures() {
    for (let i = 0; i < this.temperatures.length; i++) {
      this.temperatures[i] = this.ambientTemp;
    }
  }

  setTargetType(type) {
    this.targetType = type;
    if (this.headMeshGroup) this.headMeshGroup.visible = (type === 'head');
    if (this.plateMesh) this.plateMesh.visible = (type === 'plate');
  }

  updatePosition(distanceCm) {
    this.distance = distanceCm;
    // 3D座標系: 吹出ノズル先端が (1.4, 0, 0)
    // distanceCm = 20cm => 3D unit = 1.4 + 20 * 0.1 = 3.4
    const xPos = 1.4 + distanceCm * 0.1;
    this.root.position.set(xPos, 0, 0);
  }

  // 1. ヘッド＆毛髪モデル
  // 1. ヘッド＆毛髪モデル (美容サロンマネキン)
  _buildHeadModel() {
    this.headMeshGroup = new THREE.Group();

    // 頭部本体（スキンカラーの頭骨・顔）
    const headGeo = new THREE.SphereGeometry(0.88, 32, 24);
    headGeo.scale(0.85, 1.08, 0.95);
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf3d2c1,
      roughness: 0.65,
      metalness: 0.05
    });
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    this.headMeshGroup.add(headMesh);

    // 鼻・フェイスディテール (ドライヤーの風向き -X に対面)
    const noseGeo = new THREE.ConeGeometry(0.08, 0.22, 16);
    noseGeo.rotateZ(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, skinMat);
    noseMesh.position.set(-0.76, 0.0, 0);
    this.headMeshGroup.add(noseMesh);

    // 毛髪受熱メッシュ（頭頂部から頭部全体にフィットするクリーンなショートヘア）
    // theta: 0(頭頂部) から Math.PI * 0.58 (耳上・側頭部) まで頭部にぴったり沿う
    const hairGeo = new THREE.SphereGeometry(0.90, this.gridRes, this.gridRes, 0, Math.PI * 2, 0, Math.PI * 0.58);
    hairGeo.scale(0.86, 1.09, 0.96);
    hairGeo.translate(0.01, 0.02, 0);

    // 頂点カラーの初期化
    const count = hairGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(0x382218); // ダークブラウンのナチュラルヘア
    for (let i = 0; i < count; i++) {
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }
    hairGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.hairMesh = new THREE.Mesh(hairGeo, this.heatMapMaterial);
    this.hairMesh.castShadow = true;
    this.hairMesh.receiveShadow = true;
    this.headMeshGroup.add(this.hairMesh);

    // 首・スタンド
    const neckGeo = new THREE.CylinderGeometry(0.28, 0.36, 0.8, 24);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.set(0, -1.2, 0);
    this.headMeshGroup.add(neckMesh);

    const baseGeo = new THREE.CylinderGeometry(0.8, 0.85, 0.15, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.8, roughness: 0.3 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, -1.65, 0);
    this.headMeshGroup.add(baseMesh);

    this.root.add(this.headMeshGroup);
  }

  // 2. サーモセンサープレート（平坦面での明瞭な等温ヒートマップ用）
  _buildPlateModel() {
    const plateGeo = new THREE.PlaneGeometry(2.4, 2.4, this.gridRes - 1, this.gridRes - 1);
    plateGeo.rotateY(-Math.PI / 2); // -X方向（ドライヤー向き）に対面

    const count = plateGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 0.15;
      colors[i * 3 + 1] = 0.2;
      colors[i * 3 + 2] = 0.3;
    }
    plateGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.plateMesh = new THREE.Mesh(plateGeo, this.heatMapMaterial);
    this.plateMesh.receiveShadow = true;

    // プレートのフレーム枠
    const frameGeo = new THREE.BoxGeometry(0.08, 2.5, 2.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(0.04, 0, 0);
    this.plateMesh.add(frameMesh);

    // スタンド脚
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 16);
    const poleMesh = new THREE.Mesh(poleGeo, frameMat);
    poleMesh.position.set(0.04, -1.6, 0);
    this.plateMesh.add(poleMesh);

    this.root.add(this.plateMesh);
  }

  /**
   * 衝突粒子データから表面温度を更新し、頂点カラーに反映
   * @param {Array<{dy: number, dz: number, temp: number, weight: number}>} hits
   * @param {number} dt
   */
  updateThermalImpact(hits, dt) {
    const decayRate = 1.2 * dt; // 外気（25℃）への放熱係数
    let maxT = this.ambientTemp;
    let avgT = 0;
    let hitCount = 0;

    // グリッドセル単位で熱流束を蓄積
    const gridCellHits = new Float32Array(this.gridRes * this.gridRes);
    const gridCellTemp = new Float32Array(this.gridRes * this.gridRes);

    const halfSpan = 1.2; // 2.4m / 2
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const gx = Math.floor(((h.dz + halfSpan) / (halfSpan * 2)) * this.gridRes);
      const gy = Math.floor(((h.dy + halfSpan) / (halfSpan * 2)) * this.gridRes);
      if (gx >= 0 && gx < this.gridRes && gy >= 0 && gy < this.gridRes) {
        const idx = gy * this.gridRes + gx;
        gridCellHits[idx] += 1;
        gridCellTemp[idx] += h.temp;
      }
    }

    // ターゲット温度の更新
    for (let i = 0; i < this.temperatures.length; i++) {
      if (gridCellHits[i] > 0) {
        const targetT = gridCellTemp[i] / gridCellHits[i];
        // 対流熱伝達 (受熱)
        const heatTransferCoeff = 4.0 * dt;
        this.temperatures[i] += (targetT - this.temperatures[i]) * Math.min(heatTransferCoeff, 0.8);
        hitCount += gridCellHits[i];
      } else {
        // 自然放熱
        this.temperatures[i] += (this.ambientTemp - this.temperatures[i]) * decayRate;
      }

      if (this.temperatures[i] > maxT) {
        maxT = this.temperatures[i];
      }
      avgT += this.temperatures[i];
    }
    avgT /= this.temperatures.length;

    // 頂点カラーに温度マップを反映
    const activeMesh = (this.targetType === 'head') ? this.hairMesh : this.plateMesh;
    if (activeMesh && activeMesh.geometry.attributes.color && activeMesh.geometry.attributes.position) {
      const colorAttr = activeMesh.geometry.attributes.color;
      const posAttr = activeMesh.geometry.attributes.position;
      const count = colorAttr.count;

      for (let i = 0; i < count; i++) {
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);
        const vx = posAttr.getX(i);

        const gx = Math.floor(((vz + halfSpan) / (halfSpan * 2)) * this.gridRes);
        const gy = Math.floor(((vy + halfSpan) / (halfSpan * 2)) * this.gridRes);
        let t = this.ambientTemp;

        if (gx >= 0 && gx < this.gridRes && gy >= 0 && gy < this.gridRes) {
          const gridIdx = gy * this.gridRes + gx;
          const gridT = this.temperatures[gridIdx];
          // 前面(-X)ほど強く受熱
          const exposure = (this.targetType === 'head') ? Math.max(0.15, Math.min(1.0, -vx * 1.1 + 0.3)) : 1.0;
          t = this.ambientTemp + (gridT - this.ambientTemp) * exposure;
        }

        const rgb = TargetModel.getThermalColor(t);
        
        if (this.targetType === 'head') {
          // 毛髪テクスチャ色と熱色をブレンド
          const blend = Math.min(1.0, Math.max(0.0, (t - 30) / 45));
          colorAttr.setXYZ(i, 
            0.22 * (1 - blend) + rgb.r * blend,
            0.13 * (1 - blend) + rgb.g * blend,
            0.09 * (1 - blend) + rgb.b * blend
          );
        } else {
          colorAttr.setXYZ(i, rgb.r, rgb.g, rgb.b);
        }
      }
      colorAttr.needsUpdate = true;
    }

    return { maxTemp: maxT, avgTemp: avgT, hitCount };
  }

  // 温度カラーマップ（青 20℃ -> 緑 50℃ -> 黄 60℃(ReFa境界) -> 赤 80℃+）
  static getThermalColor(temp) {
    // 20℃ ~ 90℃ の範囲を 0.0 ~ 1.0 に正規化
    const norm = Math.max(0, Math.min(1, (temp - 20) / 70));
    const r = Math.max(0, Math.min(1, 1.5 * norm - 0.5));
    const g = Math.max(0, Math.min(1, 1.0 - Math.abs(norm - 0.5) * 2));
    const b = Math.max(0, Math.min(1, 1.0 - 2.0 * norm));
    return { r, g, b };
  }
}

window.TargetModel = TargetModel;
