/**
 * dryerModels.js
 * ReFa BEAUTECH ドライヤー 4機種の多角形3Dモデリング
 * - BEAUTECH DRYER BX (ラグジュアリー・大型クロームリアリング・太めボディ)
 * - BEAUTECH DRYER SMART W (スリムストレート円筒ヘッド・折りたたみジョイント)
 * - BEAUTECH DRYER S+ (マットブラック・後部スラッシュカット高空力)
 * - BEAUTECH DRYER SMART (ピンクゴールド・軽量スリム・スリットグリル)
 */

const DRYER_SPECS = {
  bx: {
    id: 'bx',
    name: 'BEAUTECH DRYER BX',
    tagline: '大風量×センシングの最上位フラッグシップ',
    maxAirflow: 1.4, // m³/min
    defaultTemp: 90, // ℃
    nozzleRadius: 0.35, // 3D単位 (実機ノズル内径 35mm相当)
    nozzleExitX: 1.35,
    color: '#ffffff',
    features: ['大型ファンモーター', 'ダブルセンシング', 'ハイドロイオン']
  },
  smartW: {
    id: 'smartW',
    name: 'BEAUTECH DRYER SMART W',
    tagline: '海外対応・超軽量ストレートスリムシリンダー',
    maxAirflow: 1.0, // m³/min (口径が細く高風速)
    defaultTemp: 85,
    nozzleRadius: 0.26, // 3D単位 (実機ノズル内径 26mm相当)
    nozzleExitX: 1.40,
    color: '#f0f4f8',
    features: ['マルチボルテージ', '高速ブラシレスHPDモーター', '折りたたみ式']
  },
  sPlus: {
    id: 'sPlus',
    name: 'BEAUTECH DRYER S+',
    tagline: 'マットブラック×スラッシュカットのハイパワーデザイン',
    maxAirflow: 1.2,
    defaultTemp: 88,
    nozzleRadius: 0.30, // 3D単位 (実機ノズル内径 30mm相当)
    nozzleExitX: 1.37,
    color: '#1a1b1d',
    features: ['エアロダイナミクス設計', 'プロセンシング', '高耐久構造']
  },
  smart: {
    id: 'smart',
    name: 'BEAUTECH DRYER SMART',
    tagline: '驚きの軽さと速乾性を両立したスリムモデル',
    maxAirflow: 0.9,
    defaultTemp: 85,
    nozzleRadius: 0.24, // 3D単位 (実機ノズル内径 24mm相当)
    nozzleExitX: 1.35,
    color: '#e8aba8',
    features: ['超軽量330g級', 'センシングプログラム', 'イオンオプティマイザ']
  }
};

class DryerModelFactory {
  constructor() {
    this.materials = {
      chrome: new THREE.MeshStandardMaterial({
        color: 0xf5f7fa,
        metalness: 0.95,
        roughness: 0.1
      }),
      darkChrome: new THREE.MeshStandardMaterial({
        color: 0x3a3f47,
        metalness: 0.9,
        roughness: 0.2
      }),
      pearlWhite: new THREE.MeshStandardMaterial({
        color: 0xfcfcfc,
        metalness: 0.15,
        roughness: 0.35
      }),
      matteBlack: new THREE.MeshStandardMaterial({
        color: 0x1a1a1c,
        metalness: 0.2,
        roughness: 0.8
      }),
      pinkGold: new THREE.MeshStandardMaterial({
        color: 0xdf9d9b,
        metalness: 0.65,
        roughness: 0.3
      }),
      nozzleBlack: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.5
      }),
      grillDark: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.7
      }),
      clearPlastic: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.7,
        opacity: 1,
        transparent: true,
        roughness: 0.1,
        ior: 1.5
      })
    };
  }

  createDryer(modelType = 'bx') {
    const root = new THREE.Group();
    root.name = 'DryerRoot';

    switch (modelType) {
      case 'bx':
        this._buildBX(root);
        break;
      case 'smartW':
        this._buildSmartW(root);
        break;
      case 'sPlus':
        this._buildSPlus(root);
        break;
      case 'smart':
        this._buildSmart(root);
        break;
      default:
        this._buildBX(root);
    }

    const nozzleMarker = new THREE.Object3D();
    nozzleMarker.name = 'NozzleExit';
    nozzleMarker.position.set(1.4, 0, 0);
    root.add(nozzleMarker);

    return root;
  }

  _buildBX(root) {
    const g = new THREE.Group();
    const { pearlWhite, chrome, nozzleBlack, grillDark } = this.materials;

    const lathePoints = [];
    lathePoints.push(new THREE.Vector2(0.48, -1.0));
    lathePoints.push(new THREE.Vector2(0.62, -0.7));
    lathePoints.push(new THREE.Vector2(0.68, -0.3));
    lathePoints.push(new THREE.Vector2(0.66, 0.2));
    lathePoints.push(new THREE.Vector2(0.55, 0.7));
    lathePoints.push(new THREE.Vector2(0.42, 1.1));
    lathePoints.push(new THREE.Vector2(0.38, 1.35));
    
    const barrelGeo = new THREE.LatheGeometry(lathePoints, 36);
    barrelGeo.rotateZ(-Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, pearlWhite);
    barrelMesh.castShadow = true;
    g.add(barrelMesh);

    const trimGeo = new THREE.TorusGeometry(0.66, 0.03, 16, 36);
    trimGeo.rotateY(Math.PI / 2);
    trimGeo.scale(1, 1, 0.3);
    const trimMesh = new THREE.Mesh(trimGeo, chrome);
    trimMesh.position.set(0.1, 0, 0);
    g.add(trimMesh);

    const ringGeo = new THREE.TorusGeometry(0.46, 0.06, 24, 40);
    ringGeo.rotateY(Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, chrome);
    ringMesh.position.set(-1.0, 0, 0);
    g.add(ringMesh);

    const capGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 32);
    capGeo.rotateZ(Math.PI / 2);
    const capMesh = new THREE.Mesh(capGeo, chrome);
    capMesh.position.set(-0.98, 0, 0);
    g.add(capMesh);

    const grillGeo = new THREE.RingGeometry(0.28, 0.46, 32);
    grillGeo.rotateY(Math.PI / 2);
    const grillMesh = new THREE.Mesh(grillGeo, grillDark);
    grillMesh.position.set(-0.99, 0, 0);
    g.add(grillMesh);

    const nozzleRingGeo = new THREE.TorusGeometry(0.38, 0.025, 16, 32);
    nozzleRingGeo.rotateY(Math.PI / 2);
    const nozzleRingMesh = new THREE.Mesh(nozzleRingGeo, chrome);
    nozzleRingMesh.position.set(1.35, 0, 0);
    g.add(nozzleRingMesh);

    const innerNozzleGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.05, 24);
    innerNozzleGeo.rotateZ(Math.PI / 2);
    const innerNozzleMesh = new THREE.Mesh(innerNozzleGeo, nozzleBlack);
    innerNozzleMesh.position.set(1.33, 0, 0);
    g.add(innerNozzleMesh);

    this._addHandle(g, {
      pos: [0.1, -1.1, 0],
      topRadius: 0.22,
      bottomRadius: 0.16,
      length: 1.5,
      material: pearlWhite,
      trimMaterial: chrome
    });

    root.add(g);
  }

  _buildSmartW(root) {
    const g = new THREE.Group();
    const { pearlWhite, chrome, clearPlastic, nozzleBlack } = this.materials;

    const barrelGeo = new THREE.CylinderGeometry(0.34, 0.35, 2.0, 36);
    barrelGeo.rotateZ(-Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, pearlWhite);
    barrelMesh.castShadow = true;
    g.add(barrelMesh);

    const nozzleGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.4, 32);
    nozzleGeo.rotateZ(-Math.PI / 2);
    const nozzleMesh = new THREE.Mesh(nozzleGeo, pearlWhite);
    nozzleMesh.position.set(1.2, 0, 0);
    g.add(nozzleMesh);

    const nRingGeo = new THREE.TorusGeometry(0.28, 0.02, 16, 32);
    nRingGeo.rotateY(Math.PI / 2);
    const nRingMesh = new THREE.Mesh(nRingGeo, chrome);
    nRingMesh.position.set(1.4, 0, 0);
    g.add(nRingMesh);

    const backCoverGeo = new THREE.CylinderGeometry(0.345, 0.345, 0.12, 32);
    backCoverGeo.rotateZ(Math.PI / 2);
    const backCoverMesh = new THREE.Mesh(backCoverGeo, clearPlastic);
    backCoverMesh.position.set(-1.05, 0, 0);
    g.add(backCoverMesh);

    const backRingGeo = new THREE.TorusGeometry(0.31, 0.03, 16, 32);
    backRingGeo.rotateY(Math.PI / 2);
    const backRingMesh = new THREE.Mesh(backRingGeo, chrome);
    backRingMesh.position.set(-1.06, 0, 0);
    g.add(backRingMesh);

    const hingeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 24);
    const hingeMesh = new THREE.Mesh(hingeGeo, chrome);
    hingeMesh.position.set(-0.2, -0.32, 0);
    g.add(hingeMesh);

    this._addHandle(g, {
      pos: [-0.2, -1.15, 0],
      topRadius: 0.18,
      bottomRadius: 0.14,
      length: 1.45,
      material: pearlWhite,
      trimMaterial: chrome
    });

    root.add(g);
  }

  _buildSPlus(root) {
    const g = new THREE.Group();
    const { matteBlack, darkChrome, chrome } = this.materials;

    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.40, 2.0, 36);
    barrelGeo.rotateZ(-Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, matteBlack);
    barrelMesh.castShadow = true;
    g.add(barrelMesh);

    const slashCowlGeo = new THREE.ConeGeometry(0.42, 0.4, 32);
    slashCowlGeo.rotateZ(Math.PI / 2 + 0.25);
    const slashCowlMesh = new THREE.Mesh(slashCowlGeo, matteBlack);
    slashCowlMesh.position.set(-1.15, 0.05, 0);
    g.add(slashCowlMesh);

    const backRingGeo = new THREE.TorusGeometry(0.36, 0.025, 16, 32);
    backRingGeo.rotateY(Math.PI / 2);
    const backRingMesh = new THREE.Mesh(backRingGeo, darkChrome);
    backRingMesh.position.set(-1.02, 0, 0);
    g.add(backRingMesh);

    const sideBarGeo = new THREE.BoxGeometry(1.4, 0.03, 0.02);
    const sideBarMesh = new THREE.Mesh(sideBarGeo, chrome);
    sideBarMesh.position.set(0.1, 0.35, 0);
    g.add(sideBarMesh);

    const nozzleGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.38, 32);
    nozzleGeo.rotateZ(-Math.PI / 2);
    const nozzleMesh = new THREE.Mesh(nozzleGeo, matteBlack);
    nozzleMesh.position.set(1.18, 0, 0);
    g.add(nozzleMesh);

    const nRing = new THREE.TorusGeometry(0.32, 0.02, 16, 32);
    nRing.rotateY(Math.PI / 2);
    const nRingMesh = new THREE.Mesh(nRing, darkChrome);
    nRingMesh.position.set(1.37, 0, 0);
    g.add(nRingMesh);

    this._addHandle(g, {
      pos: [-0.05, -1.15, 0],
      topRadius: 0.2,
      bottomRadius: 0.15,
      length: 1.5,
      material: matteBlack,
      trimMaterial: darkChrome
    });

    root.add(g);
  }

  _buildSmart(root) {
    const g = new THREE.Group();
    const { pinkGold, chrome } = this.materials;

    const barrelGeo = new THREE.CylinderGeometry(0.32, 0.34, 1.9, 36);
    barrelGeo.rotateZ(-Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, pinkGold);
    barrelMesh.castShadow = true;
    g.add(barrelMesh);

    const slitCoverGeo = new THREE.CylinderGeometry(0.345, 0.345, 0.45, 32);
    slitCoverGeo.rotateZ(-Math.PI / 2);
    const slitCover = new THREE.Mesh(slitCoverGeo, pinkGold);
    slitCover.position.set(-0.7, 0, 0);
    g.add(slitCover);

    const rearRingGeo = new THREE.TorusGeometry(0.33, 0.025, 16, 32);
    rearRingGeo.rotateY(Math.PI / 2);
    const rearRingMesh = new THREE.Mesh(rearRingGeo, chrome);
    rearRingMesh.position.set(-1.0, 0, 0);
    g.add(rearRingMesh);

    const nozzleGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.4, 32);
    nozzleGeo.rotateZ(-Math.PI / 2);
    const nozzleMesh = new THREE.Mesh(nozzleGeo, pinkGold);
    nozzleMesh.position.set(1.15, 0, 0);
    g.add(nozzleMesh);

    const nRing = new THREE.TorusGeometry(0.26, 0.018, 16, 32);
    nRing.rotateY(Math.PI / 2);
    const nRingMesh = new THREE.Mesh(nRing, chrome);
    nRingMesh.position.set(1.35, 0, 0);
    g.add(nRingMesh);

    this._addHandle(g, {
      pos: [-0.15, -1.1, 0],
      topRadius: 0.17,
      bottomRadius: 0.13,
      length: 1.4,
      material: pinkGold,
      trimMaterial: chrome
    });

    root.add(g);
  }

  _addHandle(group, options) {
    const { pos, topRadius, bottomRadius, length, material, trimMaterial } = options;
    const handleGroup = new THREE.Group();
    handleGroup.position.set(pos[0], pos[1], pos[2]);

    const gripGeo = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 24);
    const gripMesh = new THREE.Mesh(gripGeo, material);
    gripMesh.castShadow = true;
    handleGroup.add(gripMesh);

    const panelGeo = new THREE.BoxGeometry(0.06, length * 0.7, 0.08);
    const panelMesh = new THREE.Mesh(panelGeo, trimMaterial);
    panelMesh.position.set(-topRadius * 0.9, 0, 0);
    handleGroup.add(panelMesh);

    const switchGeo = new THREE.BoxGeometry(0.04, 0.12, 0.06);
    const switchMesh = new THREE.Mesh(switchGeo, this.materials.chrome);
    switchMesh.position.set(-topRadius * 1.1, 0.2, 0);
    handleGroup.add(switchMesh);

    const bushGeo = new THREE.CylinderGeometry(bottomRadius * 0.9, bottomRadius * 0.6, 0.3, 16);
    const bushMesh = new THREE.Mesh(bushGeo, material);
    bushMesh.position.set(0, -length / 2 - 0.15, 0);
    handleGroup.add(bushMesh);

    const loopGeo = new THREE.TorusGeometry(0.08, 0.02, 12, 24);
    const loopMesh = new THREE.Mesh(loopGeo, trimMaterial);
    loopMesh.position.set(-0.06, -length / 2 - 0.32, 0);
    handleGroup.add(loopMesh);

    group.add(handleGroup);
  }
}

window.DryerModelFactory = DryerModelFactory;
window.DRYER_SPECS = DRYER_SPECS;
