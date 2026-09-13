/**
 * coupler3D.js - 鉄道自動連結器（柴田式/並形）精密3Dモデル生成 & FEM応力カラーシェーダー
 * 図面を正確にトレースした本体凹凸リブ、ナックル、錠、解放てこ、つりリンク、緩衝器スプリング
 */

import * as THREE from 'three';
import { FEMEngine } from './fem.js';

export class Coupler3D {
  constructor(scene) {
    this.scene = scene;
    this.femMode = false;       // FEM応力コンター表示フラグ
    this.xrayMode = false;      // 内部透視クリッピングモード

    // マテリアル定義 (PBR メタリック & 鋳鋼質感)
    this.matSteelCast = new THREE.MeshStandardMaterial({
      color: 0x6a7b8c,
      metalness: 0.75,
      roughness: 0.38,
      bumpScale: 0.05
    });

    this.matSteelKnuckle = new THREE.MeshStandardMaterial({
      color: 0x8a7050, // 図面の黄銅〜鋳鋼ブラウン色調
      metalness: 0.65,
      roughness: 0.35
    });

    this.matSteelLock = new THREE.MeshStandardMaterial({
      color: 0x404850,
      metalness: 0.85,
      roughness: 0.25
    });

    this.matSpring = new THREE.MeshStandardMaterial({
      color: 0x5070a0,
      metalness: 0.8,
      roughness: 0.3
    });

    this.matLever = new THREE.MeshStandardMaterial({
      color: 0x90a0b0,
      metalness: 0.85,
      roughness: 0.25
    });

    this.matFrame = new THREE.MeshStandardMaterial({
      color: 0x30363d,
      metalness: 0.6,
      roughness: 0.6
    });

    // FEM頂点カラー表示用マテリアル
    this.matFEM = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.3
    });

    // 連結器A (自車) および 連結器B (相手車) のオブジェクト階層
    this.couplerA = this.buildCouplerAssembly(false); // isOpposite = false
    this.couplerB = this.buildCouplerAssembly(true);  // isOpposite = true

    this.scene.add(this.couplerA.root);
    this.scene.add(this.couplerB.root);

    // 破断エフェクト用フラグ
    this.isBroken = false;
  }

  /**
   * 連結器アセンブリ一式を構築
   */
  buildCouplerAssembly(isOpposite = false) {
    const root = new THREE.Group();
    root.name = isOpposite ? 'CouplerAssembly_B' : 'CouplerAssembly_A';

    // 向き (相手車は反転 180度)
    if (isOpposite) {
      root.rotation.y = Math.PI;
      root.position.x = 0.0;
    } else {
      root.position.x = -1.8;
    }

    // 1. 車端梁・車台枠ブラケット (Car End Sill & Draft Frame)
    const frameGroup = new THREE.Group();
    const sillGeo = new THREE.BoxGeometry(0.5, 0.28, 1.4);
    const sillMesh = new THREE.Mesh(sillGeo, this.matFrame);
    sillMesh.position.set(-0.85, 0.12, 0);
    sillMesh.castShadow = true;
    frameGroup.add(sillMesh);

    // 緩衝器ガイドポケット (コの字型枠)
    const pocketGeo = new THREE.BoxGeometry(0.7, 0.22, 0.38);
    const pocketMesh = new THREE.Mesh(pocketGeo, this.matFrame);
    pocketMesh.position.set(-0.55, 0, 0);
    frameGroup.add(pocketMesh);
    root.add(frameGroup);

    // 2. 緩衝器アセンブリ (Draft Gear: スプリングとフォロワー)
    const draftGroup = new THREE.Group();
    
    // コイルスプリング (両サイドまたは軸上)
    const springRadius = 0.07;
    const springTube = 0.016;
    const springTurns = 6.5;
    const springLength = 0.32;
    const springMesh1 = this.createCoilSpring(springRadius, springTube, springTurns, springLength);
    springMesh1.position.set(-0.55, 0, 0.10);
    springMesh1.rotation.z = Math.PI / 2;
    draftGroup.add(springMesh1);

    const springMesh2 = this.createCoilSpring(springRadius, springTube, springTurns, springLength);
    springMesh2.position.set(-0.55, 0, -0.10);
    springMesh2.rotation.z = Math.PI / 2;
    draftGroup.add(springMesh2);

    // フォロワープレート (前部押さえ板)
    const followerGeo = new THREE.BoxGeometry(0.04, 0.20, 0.34);
    const followerMesh = new THREE.Mesh(followerGeo, this.matSteelLock);
    followerMesh.position.set(-0.38, 0, 0);
    draftGroup.add(followerMesh);
    root.add(draftGroup);

    // 3. 連結器本体 (Coupler Head & Shank) - 緩衝器によって前後スライド
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(-0.36, 0, 0);

    // (A) シャンク (角型胴体部)
    const shankGeo = new THREE.BoxGeometry(0.55, 0.16, 0.18);
    this.prepareVertexColors(shankGeo);
    const shankMesh = new THREE.Mesh(shankGeo, this.matSteelCast);
    shankMesh.position.set(0.20, 0, 0);
    shankMesh.castShadow = true;
    bodyGroup.add(shankMesh);

    // (B) 連結器頭部 (Coupler Head / 顎部 & ポケット)
    const headGroup = new THREE.Group();
    headGroup.position.set(0.52, 0, 0);

    // 頭部本体ブロック (ExtrudeGeometryで特有の顎部形状をトレース)
    const headMesh = this.createCouplerHeadMesh();
    headGroup.add(headMesh);

    // (C) 側面の3条補強リブ凹凸 (図面の特徴的リブを忠実再現)
    const ribsGroup = this.createSideRibs();
    ribsGroup.position.set(0.05, 0, 0.125);
    headGroup.add(ribsGroup);

    // (D) ナックル回転ピン
    const pinGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.30, 24);
    this.prepareVertexColors(pinGeo);
    const pinMesh = new THREE.Mesh(pinGeo, this.matSteelLock);
    pinMesh.position.set(0.14, 0, -0.11);
    headGroup.add(pinMesh);

    // (E) 錠 (Lock Block)
    const lockGroup = new THREE.Group();
    const lockGeo = new THREE.BoxGeometry(0.055, 0.18, 0.075);
    this.prepareVertexColors(lockGeo);
    const lockMesh = new THREE.Mesh(lockGeo, this.matSteelLock);
    lockMesh.position.set(0, 0, 0);
    lockGroup.add(lockMesh);

    // 錠の上部アイ (つりリンク接続環)
    const eyeGeo = new THREE.TorusGeometry(0.022, 0.007, 12, 24);
    const eyeMesh = new THREE.Mesh(eyeGeo, this.matSteelLock);
    eyeMesh.position.set(0, 0.10, 0);
    eyeMesh.rotation.y = Math.PI / 2;
    lockGroup.add(eyeMesh);

    lockGroup.position.set(0.08, 0.02, -0.02); // 案内溝位置
    headGroup.add(lockGroup);

    // (F) ナックル (可動部・鉤爪)
    const knuckleGroup = new THREE.Group();
    knuckleGroup.position.set(0.14, 0, -0.11); // ピン軸中心

    const knuckleMesh = this.createKnuckleMesh();
    knuckleGroup.add(knuckleMesh);
    headGroup.add(knuckleGroup);

    bodyGroup.add(headGroup);
    root.add(bodyGroup);

    // 4. 解放てこ & つりリンク (Uncoupling Lever & Lift Link)
    const leverGroup = this.createUncouplingLeverAssembly(isOpposite);
    root.add(leverGroup);

    return {
      root,
      bodyGroup,
      headGroup,
      knuckleGroup,
      knuckleMesh,
      lockGroup,
      leverGroup,
      spring1: springMesh1,
      spring2: springMesh2,
      follower: followerMesh,
      meshesForFEM: [shankMesh, headMesh, knuckleMesh, pinMesh, lockMesh]
    };
  }

  /**
   * 連結器頭部形状 (柴田式/並形の特徴的な顎部形状)
   */
  createCouplerHeadMesh() {
    const shape = new THREE.Shape();
    // 2D平面投影 (XY平面)
    shape.moveTo(-0.10, -0.14);
    shape.lineTo(0.12, -0.14);
    // ガードアーム (突き出た突起)
    shape.bezierCurveTo(0.25, -0.14, 0.28, 0.02, 0.22, 0.12);
    shape.bezierCurveTo(0.16, 0.18, 0.08, 0.15, 0.02, 0.12);
    // ナックル受部ポケット
    shape.lineTo(-0.06, 0.10);
    shape.lineTo(-0.10, 0.04);
    shape.closePath();

    const extrudeSettings = {
      steps: 2,
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 4
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // 向きを調整: XZ平面に寝かせる
    geo.rotateX(-Math.PI / 2);
    geo.center();

    this.prepareVertexColors(geo);
    const mesh = new THREE.Mesh(geo, this.matSteelCast);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 側面の3条補強リブ凹凸 (図面の立体造形トレース)
   */
  createSideRibs() {
    const group = new THREE.Group();
    const ribMat = this.matSteelCast;

    for (let i = -1; i <= 1; i++) {
      const ribGeo = new THREE.CylinderGeometry(0.018, 0.016, 0.22, 16);
      ribGeo.scale(1, 0.6, 1.4); // 扁平リブ
      const ribMesh = new THREE.Mesh(ribGeo, ribMat);
      ribMesh.rotation.z = Math.PI / 2 + 0.15;
      ribMesh.rotation.y = 0.2;
      ribMesh.position.set(-0.02, i * 0.055, 0.01);
      group.add(ribMesh);
    }
    return group;
  }

  /**
   * ナックル (鉤爪可動部) 3Dモデリング
   */
  createKnuckleMesh() {
    const shape = new THREE.Shape();
    // ピン中心を (0,0) とした断面
    shape.moveTo(0, 0);
    // ピンボス外周
    shape.absarc(0, 0, 0.06, -Math.PI / 2, Math.PI / 2, false);
    // 鉤爪ノーズ
    shape.bezierCurveTo(0.08, 0.10, 0.18, 0.12, 0.20, 0.02);
    shape.bezierCurveTo(0.22, -0.06, 0.16, -0.12, 0.09, -0.14);
    // テール (錠係合部)
    shape.lineTo(-0.08, -0.12);
    shape.lineTo(-0.08, -0.04);
    shape.closePath();

    const extrudeSettings = {
      steps: 2,
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 4
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 0);

    this.prepareVertexColors(geo);
    const mesh = new THREE.Mesh(geo, this.matSteelKnuckle);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * 解放てこ & つりリンク
   */
  createUncouplingLeverAssembly(isOpposite) {
    const group = new THREE.Group();

    // 屈曲パイプレバー (TubeGeometry)
    const curvePoints = [
      new THREE.Vector3(-0.95, 0.35, 0.70),  // 側端操作ハンドル
      new THREE.Vector3(-0.85, 0.32, 0.65),
      new THREE.Vector3(-0.85, 0.32, 0.20),  // 水平主軸
      new THREE.Vector3(-0.85, 0.32, -0.05),
      new THREE.Vector3(-0.55, 0.34, -0.05)  // クランク先端 (錠直上)
    ];
    const leverCurve = new THREE.CatmullRomCurve3(curvePoints);
    const leverGeo = new THREE.TubeGeometry(leverCurve, 32, 0.014, 12, false);
    const leverMesh = new THREE.Mesh(leverGeo, this.matLever);
    leverMesh.castShadow = true;
    group.add(leverMesh);

    // つりリンク (クランク先端と錠をつなぐチェーンリング)
    const linkGeo = new THREE.TorusGeometry(0.045, 0.008, 12, 24);
    const linkMesh = new THREE.Mesh(linkGeo, this.matLever);
    linkMesh.position.set(-0.52, 0.24, -0.05);
    linkMesh.rotation.x = Math.PI / 2;
    group.add(linkMesh);

    group.name = 'UncouplingLever';
    return group;
  }

  /**
   * 螺旋コイルスプリング生成
   */
  createCoilSpring(radius, tubeRadius, turns, length) {
    const points = [];
    const segments = turns * 40;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * turns * 2 * Math.PI;
      const x = (i / segments) * length - length / 2;
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);
      points.push(new THREE.Vector3(x, y, z));
    }
    const path = new THREE.CatmullRomCurve3(points);
    const springGeo = new THREE.TubeGeometry(path, segments, tubeRadius, 10, false);
    const mesh = new THREE.Mesh(springGeo, this.matSpring);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * FEMカラーマッピング用の頂点カラーバッファを準備
   */
  prepareVertexColors(geometry) {
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3 + 0] = 0.2;
      colors[i * 3 + 1] = 0.4;
      colors[i * 3 + 2] = 0.8;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * 物理・ダイナミクス状態の3D姿勢へのリアルタイム反映
   */
  update(physData, femData = null, materialEngine = null) {
    // 1. 車両Aの位置・緩衝器変位・振動
    const ca = this.couplerA;
    ca.root.position.x = physData.posA;
    ca.root.position.y = physData.vibA.y;
    ca.root.position.z = physData.vibA.z;
    ca.root.rotation.x = physData.vibA.pitch;
    ca.root.rotation.y = physData.vibA.yaw;
    ca.root.rotation.z = physData.vibA.roll;

    // 緩衝器ストローク (本体が車台枠に対してスライド)
    ca.bodyGroup.position.x = -0.36 + physData.draftStrokeA;
    // スプリング伸縮
    const scaleA = Math.max(0.4, 1.0 - (physData.draftStrokeA / 0.082) * 0.4);
    ca.spring1.scale.x = scaleA;
    ca.spring2.scale.x = scaleA;

    // ナックル回転角
    const radA = (physData.knuckleAngleA * Math.PI) / 180.0;
    ca.knuckleGroup.rotation.y = radA;

    // 錠の上下位置 (落下=0, 上昇=0.12m)
    ca.lockGroup.position.y = 0.02 + physData.lockHeightA * 0.11;

    // 解放てこの回転
    ca.leverGroup.rotation.z = physData.uncoupleLever * 0.45;

    // 2. 相手車両Bの位置・緩衝器変位・振動
    const cb = this.couplerB;
    cb.root.position.x = physData.posB;
    cb.root.position.y = physData.vibB.y;
    cb.root.position.z = physData.vibB.z;
    cb.root.rotation.x = -physData.vibB.pitch;
    cb.root.rotation.y = Math.PI - physData.vibB.yaw;
    cb.root.rotation.z = -physData.vibB.roll;

    cb.bodyGroup.position.x = -0.36 + physData.draftStrokeB;
    const scaleB = Math.max(0.4, 1.0 - (physData.draftStrokeB / 0.082) * 0.4);
    cb.spring1.scale.x = scaleB;
    cb.spring2.scale.x = scaleB;

    const radB = (physData.knuckleAngleB * Math.PI) / 180.0;
    cb.knuckleGroup.rotation.y = radB;
    cb.lockGroup.position.y = 0.02 + physData.lockHeightB * 0.11;

    // 3. 破断エフェクト
    if (materialEngine && materialEngine.isFractured && !this.isBroken) {
      this.isBroken = true;
      // ナックルが吹き飛び・傾く
      ca.knuckleGroup.rotation.z = 0.6;
      ca.knuckleGroup.rotation.x = 0.4;
      ca.knuckleGroup.position.y -= 0.08;
    } else if (materialEngine && !materialEngine.isFractured && this.isBroken) {
      this.isBroken = false;
      ca.knuckleGroup.rotation.z = 0;
      ca.knuckleGroup.rotation.x = 0;
      ca.knuckleGroup.position.y = 0;
    }

    // 4. FEMモード頂点カラーの更新
    if (this.femMode && femData) {
      this.applyFEMColors(ca, femData);
      this.applyFEMColors(cb, femData);
    }
  }

  /**
   * FEM応力解析結果からメッシュの頂点カラーを計算して着色
   */
  applyFEMColors(couplerAssembly, femData) {
    const yieldStress = 275e6; // 基準降伏応力
    for (const mesh of couplerAssembly.meshesForFEM) {
      if (mesh.material !== this.matFEM) {
        mesh.material = this.matFEM;
      }
      const geo = mesh.geometry;
      const posAttr = geo.attributes.position;
      const colAttr = geo.attributes.color;
      if (!posAttr || !colAttr) continue;

      const nodeStress = femData.maxGlobalStress || 1e5;
      const ratio = Math.min(2.0, nodeStress / yieldStress);
      const c = FEMEngine.getStressColor(ratio);

      for (let i = 0; i < posAttr.count; i++) {
        // 先端や付け根の座標に応じて応力勾配をつける
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const grad = 0.8 + 0.4 * Math.sin(y * 10 + z * 8);
        const localRatio = Math.min(2.0, ratio * grad);
        const lc = FEMEngine.getStressColor(localRatio);

        colAttr.setXYZ(i, lc.r, lc.g, lc.b);
      }
      colAttr.needsUpdate = true;
    }
  }

  /**
   * FEM表示モードの切り替え
   */
  setFEMMode(enabled) {
    this.femMode = enabled;
    const targetMatA = enabled ? this.matFEM : this.matSteelCast;
    for (const mesh of this.couplerA.meshesForFEM) {
      mesh.material = (mesh === this.couplerA.knuckleMesh && !enabled) ? this.matSteelKnuckle : targetMatA;
    }
    for (const mesh of this.couplerB.meshesForFEM) {
      mesh.material = (mesh === this.couplerB.knuckleMesh && !enabled) ? this.matSteelKnuckle : targetMatA;
    }
  }
}