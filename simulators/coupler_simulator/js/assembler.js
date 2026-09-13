// 柴田式・並形自動連結器 3Dパーツ手動組み立て調整ツール
// 複数パーツ一括選択・90度回転・XYZ微動ショートカットキー対応 (Null安全実装)

const PARTS_METADATA = [
  { id: 'body_b', name: 'Body_B (下部ベース)', file: 'models/body_b.stl', color: 0x94a3b8 },
  { id: 'body_a', name: 'Body_A (上部ボディ)', file: 'models/body_a.stl', color: 0x64748b },
  { id: 'knuckle', name: 'Knuckle (ナックル)', file: 'models/knuckle.stl', color: 0x38bdf8 },
  { id: 'pivot_pin', name: 'Knuckle Pin (主ピン)', file: 'models/pivot_pin.stl', color: 0xf59e0b },
  { id: 'top_cap', name: 'Top Cap (上部キャップ)', file: 'models/top_cap.stl', color: 0xa855f7 },
    { id: 'lock', name: 'Lock (錠)', file: 'models/lock.stl', color: 0x10b981 },
  { id: 'locklift', name: 'Locklift (錠揚)', file: 'models/locklift.stl', color: 0x06b6d4 },
  { id: 'thrower', name: 'Thrower (肘開ケ)', file: 'models/thrower.stl', color: 0xf43f5e }
];

class CouplerAssemblerApp {
  constructor() {
    this.parts = {};
    this.selectedIds = new Set(['body_b']);
    this.isLightMode = false;
    this.ghostOthers = true;
    this.gizmoMode = 'translate';

    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 80;

    this.initThree();
    this.loadAllParts();
    this.bindUI();
    this.bindKeyboardShortcuts();
    this.animate();
  }

  initThree() {
    const container = document.getElementById('viewport');
    if (!container) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d16);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1500);
    this.camera.position.set(120, 130, 180);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.orbit = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.target.set(0, 0, 0);

    // 複数選択用のピボットグループ
    this.selectionPivot = new THREE.Group();
    this.scene.add(this.selectionPivot);

    // TransformControls (移動/回転ギズモ)
    this.transform = new THREE.TransformControls(this.camera, this.renderer.domElement);
    this.transform.size = 0.75;
    this.transform.setTranslationSnap(1.0); // 1mmスナップ
    this.transform.setRotationSnap(Math.PI / 2); // 90度スナップ
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value;
      if (event.value === true) {
        this.pushHistoryState();
      }
    });
    this.transform.addEventListener('change', () => {
      this.syncGizmoDrag();
    });
    this.scene.add(this.transform);

    // ライティング
    const ambLight = new THREE.AmbientLight(0xffffff, 0.70);
    this.scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.90);
    dirLight1.position.set(200, 250, 180);
    dirLight1.castShadow = true;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90cdf4, 0.50);
    dirLight2.position.set(-180, 120, -180);
    this.scene.add(dirLight2);

    // グリッドと原点座標軸 (CAD単位: mm)
    this.grid = new THREE.GridHelper(300, 30, 0x38bdf8, 0x334155);
    this.grid.position.y = -0.1;
    this.scene.add(this.grid);

    this.axes = new THREE.AxesHelper(70);
    this.scene.add(this.axes);

    window.addEventListener('resize', () => {
      if (!container) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(nw, nh);
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    container.addEventListener('pointerdown', (e) => this.onPointerDown(e));
  }

  parseBase64STL(b64) {
    const binStr = atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const loader = new THREE.STLLoader();
    return loader.parse(bytes.buffer);
  }

  loadAllParts() {
    const loader = new THREE.STLLoader();
    let loadedCount = 0;
    const total = PARTS_METADATA.length;
    const statusEl = document.getElementById('loadStatus');

    this.assemblyGroup = new THREE.Group();
    this.scene.add(this.assemblyGroup);

    PARTS_METADATA.forEach((meta) => {
      const onGeo = (geo) => {
        geo.computeVertexNormals();
        geo.computeBoundingBox();

        const mat = new THREE.MeshStandardMaterial({
          color: meta.color,
          roughness: 0.35,
          metalness: 0.65,
          transparent: true,
          opacity: 1.0
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = meta.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
                        // ユーザーが手動で精密組み立てした完全正解の座標＆回転データ
        const userInit = {
          body_b:     { pos: [23, -0.5, 26],   rot: [-90, 0, 0] },
          body_a:     { pos: [23, 8.5, 26],    rot: [-90, 0, 0] },
          knuckle:    { pos: [-13, -12.5, 26], rot: [-90, 0, 0] },
          pivot_pin:  { pos: [-17, 14.5, 21],  rot: [90, 0, 0] },
          top_cap:    { pos: [-29, 10.5, 15],  rot: [-90, 0, 0] },
          lock:       { pos: [-4, 11.5, 3],    rot: [-90, 90, 0] },
          locklift:   { pos: [0, 8.5, 4],      rot: [-90, -90, 0] },
          thrower:    { pos: [-24, -2.5, 9],   rot: [-180, 0, -90] }
        };
        const u = userInit[meta.id] || { pos: [0,0,0], rot: [0,0,0] };
        mesh.position.set(...u.pos);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(u.rot[0]),
          THREE.MathUtils.degToRad(u.rot[1]),
          THREE.MathUtils.degToRad(u.rot[2])
        );

        this.assemblyGroup.add(mesh);

        this.parts[meta.id] = {
          meta,
          mesh,
          mat,
          visible: true,
          rotDeg: { x: 0, y: 0, z: 0 },
          bbox: geo.boundingBox
        };

        loadedCount++;
        if (statusEl) statusEl.textContent = `読込中 (${loadedCount}/${total})`;

        if (loadedCount === total) {
          if (statusEl) {
            statusEl.textContent = '全9パーツ読込完了';
            statusEl.style.color = '#22c55e';
          }
          this.buildPartListUI();
          this.updateSelectionVisuals();
          this.updateExport();
          this.pushHistoryState(); // 初期状態を履歴に保存
        }
      };

      if (window.CAD_MODELS_DATA && window.CAD_MODELS_DATA[meta.id]) {
        try {
          const geo = this.parseBase64STL(window.CAD_MODELS_DATA[meta.id]);
          if (geo) {
            onGeo(geo);
            return;
          }
        } catch (e) {
          console.warn('Base64 parse failed for ' + meta.id, e);
        }
      }

      loader.load(meta.file, onGeo, undefined, (err) => {
        console.error('Failed to load:', meta.file, err);
        if (statusEl) {
          statusEl.textContent = `エラー: ${meta.id}`;
          statusEl.style.color = '#ef4444';
        }
      });
    });
  }

  buildPartListUI() {
    const listEl = document.getElementById('partList');
    if (!listEl) return;
    listEl.innerHTML = '';

    PARTS_METADATA.forEach((meta) => {
      const isSelected = this.selectedIds.has(meta.id);
      const item = document.createElement('div');
      item.className = `part-item ${isSelected ? 'selected' : ''}`;
      item.id = `partItem_${meta.id}`;

      item.onclick = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.closest('.icon-btn')) return;
        this.handlePartClick(meta.id, e.shiftKey || e.ctrlKey);
      };

      const colorHex = '#' + meta.color.toString(16).padStart(6, '0');
      const colorDot = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${colorHex}; margin-right:4px;"></span>`;

      item.innerHTML = `
        <input type="checkbox" class="part-checkbox" id="chk_${meta.id}" ${isSelected ? 'checked' : ''} onchange="app.toggleSelectPart('${meta.id}', this.checked)">
        <div class="part-label">
          <div class="part-name">${colorDot}${meta.name}</div>
          <div class="part-file">${meta.file}</div>
        </div>
        <div class="part-toggles">
          <button class="icon-btn" title="表示/非表示" onclick="event.stopPropagation(); app.togglePartVisibility('${meta.id}')">
            <i class="ph-bold ph-eye" id="eye_${meta.id}"></i>
          </button>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  handlePartClick(id, isMulti) {
    if (isMulti) {
      if (this.selectedIds.has(id)) {
        if (this.selectedIds.size > 1) this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
    } else {
      this.selectedIds.clear();
      this.selectedIds.add(id);
    }
    this.updateSelectionVisuals();
  }

  toggleSelectPart(id, checked) {
    if (checked) {
      this.selectedIds.add(id);
    } else {
      if (this.selectedIds.size > 1) this.selectedIds.delete(id);
    }
    this.updateSelectionVisuals();
  }

  selectAllParts(select) {
    if (select) {
      PARTS_METADATA.forEach(m => this.selectedIds.add(m.id));
    } else {
      this.selectedIds.clear();
      this.selectedIds.add('body_b');
    }
    this.updateSelectionVisuals();
  }

  updateSelectionVisuals() {
    PARTS_METADATA.forEach(m => {
      const item = document.getElementById(`partItem_${m.id}`);
      const chk = document.getElementById(`chk_${m.id}`);
      const isSel = this.selectedIds.has(m.id);
      if (item) {
        if (isSel) item.classList.add('selected'); else item.classList.remove('selected');
      }
      if (chk) chk.checked = isSel;
    });

    const cnt = this.selectedIds.size;
    const countEl = document.getElementById('selectedCountText');
    if (countEl) countEl.textContent = `${cnt}個 選択中`;

    const titleEl = document.getElementById('selectedPartTitle');
    const dimsEl = document.getElementById('selectedPartDims');
    if (cnt === 1) {
      const id = Array.from(this.selectedIds)[0];
      const part = this.parts[id];
      if (titleEl && part) titleEl.textContent = part.meta.name;
      if (dimsEl && part && part.bbox) {
        const sz = new THREE.Vector3();
        part.bbox.getSize(sz);
        dimsEl.textContent = `${sz.x.toFixed(1)} x ${sz.y.toFixed(1)} x ${sz.z.toFixed(1)} mm`;
      }
    } else {
      if (titleEl) titleEl.textContent = `複数選択: ${cnt}個の部品`;
      if (dimsEl) dimsEl.textContent = '一括回転 / 平行移動';
    }

    if (cnt === 1) {
      const id = Array.from(this.selectedIds)[0];
      if (this.parts[id]) this.transform.attach(this.parts[id].mesh);
    } else if (cnt > 1) {
      const center = this.getSelectedCenter();
      this.selectionPivot.position.copy(center);
      this.selectionPivot.rotation.set(0, 0, 0);
      this.transform.attach(this.selectionPivot);
    } else {
      this.transform.detach();
    }

    this.syncTransformToUI();
    this.updateGhosting();
  }

  getSelectedCenter() {
    const center = new THREE.Vector3();
    let count = 0;
    this.selectedIds.forEach(id => {
      const p = this.parts[id];
      if (p) {
        center.add(p.mesh.position);
        count++;
      }
    });
    if (count > 0) center.divideScalar(count);
    return center;
  }

  syncTransformToUI() {
    const elX = document.getElementById('inPosX');
    const elY = document.getElementById('inPosY');
    const elZ = document.getElementById('inPosZ');

    if (this.selectedIds.size === 1) {
      const id = Array.from(this.selectedIds)[0];
      const part = this.parts[id];
      if (!part) return;

      if (elX) elX.value = part.mesh.position.x.toFixed(2);
      if (elY) elY.value = part.mesh.position.y.toFixed(2);
      if (elZ) elZ.value = part.mesh.position.z.toFixed(2);

      const rx = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.x));
      const ry = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.y));
      const rz = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.z));
      part.rotDeg = { x: rx, y: ry, z: rz };

      const statusEl = document.getElementById('statusCoords');
      if (statusEl) {
        statusEl.textContent = `選択: ${part.meta.id} | Pos: [${part.mesh.position.x.toFixed(1)}, ${part.mesh.position.y.toFixed(1)}, ${part.mesh.position.z.toFixed(1)}] mm | Rot: [${rx}°, ${ry}°, ${rz}°]`;
      }
    } else if (this.selectedIds.size > 1) {
      const c = this.getSelectedCenter();
      if (elX) elX.value = c.x.toFixed(2);
      if (elY) elY.value = c.y.toFixed(2);
      if (elZ) elZ.value = c.z.toFixed(2);

      const statusEl = document.getElementById('statusCoords');
      if (statusEl) {
        statusEl.textContent = `複数選択: ${this.selectedIds.size}個 | 重心Pos: [${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}] mm (矢印キーで微動・1/2/3で一括90°回転)`;
      }
    }
  }

  syncGizmoDrag() {
    this.syncTransformToUI();
    this.updateExport();
  }


  // ==================== UNDO / REDO 履歴管理 ====================
  getSnapshot() {
    const snap = {};
    Object.keys(this.parts).forEach(id => {
      const p = this.parts[id];
      if (p) {
        snap[id] = {
          pos: [p.mesh.position.x, p.mesh.position.y, p.mesh.position.z],
          rot: [p.mesh.rotation.x, p.mesh.rotation.y, p.mesh.rotation.z]
        };
      }
    });
    return snap;
  }

  pushHistoryState() {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(this.getSnapshot());
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.applySnapshot(this.history[this.historyIndex]);
      const statusEl = document.getElementById('statusCoords');
      if (statusEl) statusEl.textContent = `元に戻しました (履歴: ${this.historyIndex + 1}/${this.history.length})`;
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.applySnapshot(this.history[this.historyIndex]);
      const statusEl = document.getElementById('statusCoords');
      if (statusEl) statusEl.textContent = `やり直しました (履歴: ${this.historyIndex + 1}/${this.history.length})`;
    }
  }

  applySnapshot(snap) {
    if (!snap) return;
    Object.keys(snap).forEach(id => {
      const p = this.parts[id];
      if (p && snap[id]) {
        p.mesh.position.set(...snap[id].pos);
        p.mesh.rotation.set(...snap[id].rot);
      }
    });
    this.syncTransformToUI();
    this.updateSelectionVisuals();
    this.updateExport();
    this.updateUndoRedoButtons();
  }

  updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const canUndo = this.historyIndex > 0;
    const canRedo = this.historyIndex < this.history.length - 1;
    if (btnUndo) {
      btnUndo.disabled = !canUndo;
      btnUndo.style.opacity = canUndo ? '1.0' : '0.4';
      btnUndo.style.cursor = canUndo ? 'pointer' : 'not-allowed';
    }
    if (btnRedo) {
      btnRedo.disabled = !canRedo;
      btnRedo.style.opacity = canRedo ? '1.0' : '0.4';
      btnRedo.style.cursor = canRedo ? 'pointer' : 'not-allowed';
    }
  }

  rotateSelected(axis, deltaDeg) {
    this.pushHistoryState();
    if (this.selectedIds.size === 0) return;
    const rad = THREE.MathUtils.degToRad(deltaDeg);

    if (this.selectedIds.size === 1) {
      const id = Array.from(this.selectedIds)[0];
      const part = this.parts[id];
      if (!part) return;

      part.mesh.rotation[axis] += rad;
      const currentDeg = THREE.MathUtils.radToDeg(part.mesh.rotation[axis]);
      const snappedDeg = Math.round(currentDeg / 90) * 90;
      part.mesh.rotation[axis] = THREE.MathUtils.degToRad(snappedDeg);
    } else {
      const center = this.getSelectedCenter();
      const pivotGroup = new THREE.Group();
      pivotGroup.position.copy(center);
      this.scene.add(pivotGroup);

      const selectedMeshes = [];
      this.selectedIds.forEach(id => {
        const p = this.parts[id];
        if (p) selectedMeshes.push(p.mesh);
      });

      selectedMeshes.forEach(mesh => {
        pivotGroup.attach(mesh);
      });

      pivotGroup.rotation[axis] += rad;
      pivotGroup.updateMatrixWorld(true);

      selectedMeshes.forEach(mesh => {
        this.assemblyGroup.attach(mesh);
        ['x', 'y', 'z'].forEach(ax => {
          const deg = THREE.MathUtils.radToDeg(mesh.rotation[ax]);
          const snap = Math.round(deg / 90) * 90;
          mesh.rotation[ax] = THREE.MathUtils.degToRad(snap);
        });
      });

      this.scene.remove(pivotGroup);
    }

    this.syncTransformToUI();
    this.updateSelectionVisuals();
    this.updateExport();
  }

  resetSelectedRotation() {
    this.pushHistoryState();
    this.selectedIds.forEach(id => {
      const p = this.parts[id];
      if (p) p.mesh.rotation.set(0, 0, 0);
    });
    this.syncTransformToUI();
    this.updateExport();
  }

  stepSelected(axis, deltaMm) {
    this.pushHistoryState();
    if (this.selectedIds.size === 0) return;

    this.selectedIds.forEach(id => {
      const p = this.parts[id];
      if (p) p.mesh.position[axis] += deltaMm;
    });

    this.syncTransformToUI();
    this.updateExport();

    const statusEl = document.getElementById('statusCoords');
    if (statusEl) {
      statusEl.textContent = `微動実行: ${axis.toUpperCase()} ${deltaMm > 0 ? '+' : ''}${deltaMm} mm (対象: ${this.selectedIds.size}個)`;
    }
  }

  resetSelectedPosition() {
    this.pushHistoryState();
    this.selectedIds.forEach(id => {
      const p = this.parts[id];
      if (p) p.mesh.position.set(0, 0, 0);
    });
    this.syncTransformToUI();
    this.updateExport();
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+Z (Undo) / Ctrl+Y or Ctrl+Shift+Z (Redo)
      if (e.ctrlKey || e.metaKey) {
        if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
          e.preventDefault();
          this.undo();
          return;
        }
        if ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
          e.preventDefault();
          this.redo();
          return;
        }
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      let step = 1.0;
      if (e.shiftKey) step = 10.0;
      if (e.altKey) step = 0.1;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          this.stepSelected('x', step);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.stepSelected('x', -step);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.stepSelected('y', step);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.stepSelected('y', -step);
          break;
        case 'q':
        case 'Q':
        case 'PageUp':
          e.preventDefault();
          this.stepSelected('z', step);
          break;
        case 'e':
        case 'E':
        case 'PageDown':
          e.preventDefault();
          this.stepSelected('z', -step);
          break;
        case '1':
          e.preventDefault();
          this.rotateSelected('x', e.shiftKey ? -90 : 90);
          break;
        case '2':
          e.preventDefault();
          this.rotateSelected('y', e.shiftKey ? -90 : 90);
          break;
        case '3':
          e.preventDefault();
          this.rotateSelected('z', e.shiftKey ? -90 : 90);
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          this.setGizmoMode('translate');
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          this.setGizmoMode('rotate');
          break;
      }
    });
  }

  bindUI() {
    ['X', 'Y', 'Z'].forEach(axis => {
      const lower = axis.toLowerCase();
      const input = document.getElementById(`inPos${axis}`);
      if (!input) return;
      let lastVal = 0;
      input.addEventListener('focus', () => {
        lastVal = parseFloat(input.value) || 0;
      });
      input.addEventListener('change', () => {
        const newVal = parseFloat(input.value) || 0;
        const diff = newVal - lastVal;
        lastVal = newVal;
        this.stepSelected(lower, diff);
      });
    });

    const chkGhost = document.getElementById('chkGhostOthers');
    if (chkGhost) {
      chkGhost.addEventListener('change', (e) => {
        this.ghostOthers = e.target.checked;
        this.updateGhosting();
      });
    }

    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    const btnZero = document.getElementById('btnZeroSelected');
    if (btnZero) {
      btnZero.addEventListener('click', () => {
        this.resetSelectedPosition();
        this.resetSelectedRotation();
      });
    }

    const btnExplode = document.getElementById('btnExplode');
    if (btnExplode) {
      btnExplode.addEventListener('click', () => {
        this.explodeAssembly();
      });
    }
  }

  setGizmoMode(mode) {
    this.gizmoMode = mode;
    this.transform.setMode(mode);
    const btnT = document.getElementById('btnGizmoTranslate');
    const btnR = document.getElementById('btnGizmoRotate');
    if (btnT && btnR) {
      if (mode === 'translate') {
        btnT.classList.add('active'); btnR.classList.remove('active');
      } else {
        btnR.classList.add('active'); btnT.classList.remove('active');
      }
    }
  }

  setCameraView(view) {
    const dist = 200;
    switch (view) {
      case 'top':
        this.camera.position.set(0, dist * 1.2, 0);
        this.orbit.target.set(0, 0, 0);
        break;
      case 'front':
        this.camera.position.set(0, 0, dist);
        this.orbit.target.set(0, 0, 0);
        break;
      case 'side':
        this.camera.position.set(dist, 0, 0);
        this.orbit.target.set(0, 0, 0);
        break;
      case 'iso':
      default:
        this.camera.position.set(120, 130, 180);
        this.orbit.target.set(0, 0, 0);
        break;
    }
  }

  togglePartVisibility(id) {
    const part = this.parts[id];
    if (!part) return;
    part.visible = !part.visible;
    part.mesh.visible = part.visible;

    const eyeIcon = document.getElementById(`eye_${id}`);
    if (eyeIcon) {
      eyeIcon.className = part.visible ? 'ph-bold ph-eye' : 'ph-bold ph-eye-slash muted';
    }
  }

  updateGhosting() {
    Object.keys(this.parts).forEach(id => {
      const part = this.parts[id];
      if (this.ghostOthers && !this.selectedIds.has(id)) {
        part.mat.opacity = 0.28;
      } else {
        part.mat.opacity = 1.0;
      }
    });
  }

  explodeAssembly() {
    this.pushHistoryState();
    const offsets = {
      body_b:     { pos: [0, -30, 0], rot: [0, 0, 0] },
      body_a:     { pos: [0, 45, 0], rot: [0, 0, 0] },
      knuckle:    { pos: [-45, 5, 25], rot: [0, 0, 0] },
      pivot_pin:  { pos: [-50, 90, 0], rot: [0, 0, 0] },
      top_cap:    { pos: [-35, 90, 25], rot: [0, 0, 0] },
      knock_pins: { pos: [-15, 90, 35], rot: [0, 0, 0] },
      lock:       { pos: [35, 10, 0], rot: [0, 0, 0] },
      locklift:   { pos: [45, 70, 0], rot: [0, 0, 0] },
      thrower:    { pos: [25, -15, 35], rot: [0, 0, 0] }
    };

    Object.keys(offsets).forEach(id => {
      const part = this.parts[id];
      if (part) {
        part.mesh.position.set(...offsets[id].pos);
        part.mesh.rotation.set(...offsets[id].rot);
      }
    });

    this.syncTransformToUI();
    this.updateExport();
  }

  onPointerDown(event) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Object.values(this.parts).map(p => p.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !this.parts[hit.name]) {
        hit = hit.parent;
      }
      if (hit && this.parts[hit.name]) {
        this.handlePartClick(hit.name, event.shiftKey || event.ctrlKey);
      }
    }
  }

  toggleTheme() {
    this.isLightMode = !this.isLightMode;
    if (this.isLightMode) {
      this.scene.background.set(0xf1f5f9);
      this.grid.material.color.set(0x94a3b8);
    } else {
      this.scene.background.set(0x090d16);
      this.grid.material.color.set(0x38bdf8);
    }
  }

  updateExport() {
    const config = {};
    PARTS_METADATA.forEach(meta => {
      const part = this.parts[meta.id];
      if (part) {
        const rx = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.x));
        const ry = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.y));
        const rz = Math.round(THREE.MathUtils.radToDeg(part.mesh.rotation.z));
        config[meta.id] = {
          pos: [
            parseFloat(part.mesh.position.x.toFixed(2)),
            parseFloat(part.mesh.position.y.toFixed(2)),
            parseFloat(part.mesh.position.z.toFixed(2))
          ],
          rot: [rx, ry, rz]
        };
      }
    });

    const jsonStr = JSON.stringify(config, null, 2);
    const txtArea = document.getElementById('txtExport');
    if (txtArea) txtArea.value = jsonStr;
  }

  copyConfig() {
    const txtArea = document.getElementById('txtExport');
    if (!txtArea) return;
    const txt = txtArea.value;
    navigator.clipboard.writeText(txt).then(() => {
      alert('組み立て座標データ(JSON)をコピーしました！\nチャット欄に貼り付けてお渡しください。');
    }).catch(err => {
      alert('テキストエリアの内容を手動でコピーしてください。');
    });
  }

  applyJsonConfig() {
    try {
      const txtArea = document.getElementById('txtExport');
      if (!txtArea) return;
      const config = JSON.parse(txtArea.value);
      Object.keys(config).forEach(id => {
        const part = this.parts[id];
        if (part && config[id]) {
          const c = config[id];
          if (c.pos) part.mesh.position.set(c.pos[0], c.pos[1], c.pos[2]);
          if (c.rot) {
            part.mesh.rotation.set(
              THREE.MathUtils.degToRad(c.rot[0]),
              THREE.MathUtils.degToRad(c.rot[1]),
              THREE.MathUtils.degToRad(c.rot[2])
            );
          }
        }
      });
      this.syncTransformToUI();
      alert('組み立て座標を3Dシーンに適用しました！');
    } catch (e) {
      alert('JSON形式エラー: ' + e.message);
    }
  }


  // --- 機構連動テスト (解結・連結プレビュー) ---
  setKnuckleTestAngle(deg) {
    this.knuckleTestAngle = deg;
    const lbl = document.getElementById('lblKnuckleTest');
    const rng = document.getElementById('rngKnuckleTest');
    if (lbl) lbl.textContent = `${deg.toFixed(1)}° (${deg === 0 ? '完全閉鎖' : '解結開放'})`;
    if (rng) rng.value = deg;

    const knucklePart = this.parts['knuckle'];
    if (!knucklePart || !knucklePart.mesh) return;

    // 初期位置: pos: [-13, -12.5, 26], rot: [-90, 0, 0]
    // 主ピン軸: X = -17.0, Z = 21.0
    // ピボット周りに時計回り(-rad)に回転
    const rad = THREE.MathUtils.degToRad(-deg);
    const pivotX = -17.0;
    const pivotZ = 21.0;
    const initX = -13.0;
    const initZ = 26.0;

    const dx = initX - pivotX; // +4.0
    const dz = initZ - pivotZ; // +5.0

    // Y軸周り回転: x' = dx*cos(rad) + dz*sin(rad), z' = -dx*sin(rad) + dz*cos(rad)
    const rotX = dx * Math.cos(rad) + dz * Math.sin(rad);
    const rotZ = -dx * Math.sin(rad) + dz * Math.cos(rad);

    knucklePart.mesh.position.x = pivotX + rotX;
    knucklePart.mesh.position.z = pivotZ + rotZ;
    knucklePart.mesh.rotation.y = rad;
  }

  setLockLiftTestHeight(heightMm) {
    this.lockLiftTestHeight = heightMm;
    const lbl = document.getElementById('lblLockLiftTest');
    const rng = document.getElementById('rngLockLiftTest');
    if (lbl) lbl.textContent = `${heightMm.toFixed(1)}mm (${heightMm === 0 ? '施錠・通常位置' : '解錠引上'})`;
    if (rng) rng.value = heightMm;

    // locklift初期位置: Y=8.5, lock初期位置: Y=11.5
    const liftPart = this.parts['locklift'];
    if (liftPart && liftPart.mesh) {
      liftPart.mesh.position.y = 8.5 + heightMm;
    }
    const lockPart = this.parts['lock'];
    if (lockPart && lockPart.mesh) {
      lockPart.mesh.position.y = 11.5 + heightMm * 0.8;
    }
  }

  toggleMotionAnimation() {
    this.isMotionAnimating = !this.isMotionAnimating;
    const btn = document.getElementById('btnAutoPlay');
    if (btn) {
      btn.innerHTML = this.isMotionAnimating 
        ? '<i class="ph-bold ph-stop"></i> 停止' 
        : '<i class="ph-bold ph-play"></i> 動作再生';
      btn.className = this.isMotionAnimating ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
    }
  }

  updateMotionAnimation(dt) {
    if (!this.isMotionAnimating) return;
    this.motionAnimTime = (this.motionAnimTime || 0) + dt;
    const cycle = 4.0; // 4秒1サイクル
    const t = (this.motionAnimTime % cycle) / cycle;

    // 0.0〜0.3: 解錠てこ引上 (ロッド上昇 0 -> 7mm)
    // 0.2〜0.5: ナックル開放 (0 -> 32°)
    // 0.5〜0.7: 開放待機
    // 0.7〜0.9: ナックル閉塞 (32° -> 0°)
    // 0.9〜1.0: ロッド自重落下施錠 (7mm -> 0mm)
    let liftH = 0;
    let knkDeg = 0;

    if (t < 0.25) {
      const p = t / 0.25;
      liftH = p * 7.0;
      knkDeg = 0;
    } else if (t < 0.50) {
      const p = (t - 0.25) / 0.25;
      liftH = 7.0;
      knkDeg = p * 55.0;
    } else if (t < 0.70) {
      liftH = 7.0;
      knkDeg = 55.0;
    } else if (t < 0.90) {
      const p = (t - 0.70) / 0.20;
      liftH = 7.0 * (1.0 - p * 0.3);
      knkDeg = 55.0 * (1.0 - p);
    } else {
      const p = (t - 0.90) / 0.10;
      liftH = 7.0 * 0.7 * (1.0 - p);
      knkDeg = 0;
    }

    this.setKnuckleTestAngle(knkDeg);
    this.setLockLiftTestHeight(liftH);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.orbit) this.orbit.update();
    this.updateMotionAnimation(0.016);
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// グローバルに即座に登録
const app = new CouplerAssemblerApp();
window.app = app;