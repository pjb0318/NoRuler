import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { WORLD_SCALE, PRESETS, displayValue } from './domain.ts';
import type { CameraState } from './storage.ts';
import type { Pose, SceneInstance } from './workspace.ts';
import { resolvePlacement } from './placement.ts';
import type { Dimensions, Preset, Unit } from './domain.ts';

const viewDirections = {
  perspective: new THREE.Vector3(1, .85, 1.5).normalize(),
  front: new THREE.Vector3(0, 0, 1),
  right: new THREE.Vector3(1, 0, 0),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
};
export type View = keyof typeof viewDirections;
export type TransformMode = 'translate' | 'rotate';
export type MoveState = { moved: boolean; dragging: boolean; selected: string | null; id?: string; heightMm?: number; yawDeg?: number; placementMessage?: string };
const s = WORLD_SCALE;
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: string, metalness = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function createModel(d: Dimensions, preset?: Preset): THREE.Group {
  const group = new THREE.Group();
  const w = d.width * s, h = d.height * s, depth = d.depth * s;
  if (!preset) {
    const mesh = box(group, w, h, depth, 0, h / 2, 0, '#89b2ff');
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#3776df', transparent: true, opacity: 0.7 }));
    edges.position.copy(mesh.position);
    group.add(edges);
  } else if (preset.id === 'bottle') {
    const profile = [[0, 0], [.37, 0], [.47, .018], [.5, .05], [.5, .68], [.47, .75], [.24, .86], [.22, .89], [.22, .96], [0, .96]];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * w, y * h)), 48), new THREE.MeshStandardMaterial({ color: '#b2dcd4', metalness: 0.12, roughness: 0.3 }));
    mesh.castShadow = true;
    group.add(mesh);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(w * .5, w * .5, h * .27, 48), new THREE.MeshStandardMaterial({ color: '#479e91', roughness: .7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    label.position.y = h * .45;
    group.add(label);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * .25, w * .25, h * .055, 32), new THREE.MeshStandardMaterial({ color: '#eaf4ee' }));
    cap.position.y = h * .9725;
    group.add(cap);
  } else if (preset.id === 'phone') {
    box(group, w, h, depth, 0, h / 2, 0, '#3a4357', .35);
    // Decals are planes on the front surface so the external depth stays exact.
    for (const [pw, ph, y, color, layer] of [[w * .9, h * .94, h / 2, '#c4cfeb', -1], [w * .28, h * .024, h * .948, '#3a4357', -2], [w * .3, h * .008, h * .055, '#f5f6fc', -2]] as const) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ color, polygonOffset: true, polygonOffsetFactor: layer, polygonOffsetUnits: layer }));
      face.position.set(0, y, depth / 2);
      group.add(face);
    }
  } else if (preset.id === 'laptop') {
    box(group, w, h, depth, 0, h / 2, 0, '#bbc1cb', .45);
    box(group, w * .98, .008, depth * .98, 0, h * .6, 0, '#697384');
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(w * .09, depth * .1), new THREE.MeshStandardMaterial({ color: '#939caa', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = h;
    group.add(mark);
  } else if (preset.id === 'keyboard') {
    box(group, w, h * .6, depth, 0, h * .3, 0, '#6c697c');
    for (let row = 0; row < 5; row++) for (let col = 0; col < 15; col++) {
      if (row === 4 && col > 3 && col < 10) continue;
      box(group, w / 17, h * .4, depth / 6.3, -w * .45 + col * w / 15.5, h * .8, -depth * .39 + row * depth / 5.2, '#e1dfe8');
    }
    box(group, w * .38, h * .4, depth / 6.3, -w * .03, h * .8, -depth * .39 + 4 * depth / 5.2, '#e1dfe8');
  } else if (preset.id === 'monitor') {
    box(group, w * .4, h * .025, depth, 0, h * .0125, 0, '#6b7382', .35);
    box(group, w * .065, h * .37, depth * .15, 0, h * .2, -depth * .18, '#747e8d', .3);
    box(group, w, h * .78, depth * .17, 0, h * .61, -depth * .18, '#333c4c');
    box(group, w * .96, h * .725, .003, 0, h * .62, -depth * .095 + .002, '#bbcadc');
  } else {
    box(group, w, h, depth, 0, h / 2, 0, '#ffffff');
    // A4 stays exactly 210 × 297 × 0.1 mm; no visual thickness inflation.
  }
  return group;
}

function label(text: string, className: string, position: THREE.Vector3) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  const object = new CSS2DObject(el);
  object.position.copy(position);
  return object;
}
function dimension(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, text: string, axis: string) {
  const material = new THREE.LineBasicMaterial({ color: '#5481c9', transparent: true, opacity: .65 });
  const tick = axis === 'h' ? new THREE.Vector3(.08, 0, 0) : new THREE.Vector3(0, .06, 0);
  const points = [from, to, from.clone().sub(tick), from.clone().add(tick), to.clone().sub(tick), to.clone().add(tick)];
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
  group.add(label(text, `dimension-label dimension-${axis}`, from.clone().lerp(to, .5)));
}
function disposeGroup(group: THREE.Object3D) {
  group.traverse(object => {
    if (object instanceof CSS2DObject) object.element.remove();
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    }
  });
  group.clear();
}

export class ComparisonScene {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .01, 2000);
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private transform = new TransformControls(this.camera);
  private pivot = new THREE.Object3D();
  private outline = new THREE.Box3Helper(new THREE.Box3(), '#6b98ed');
  private pivotHeight = 0;
  private content = new THREE.Group();
  private grid = new THREE.Group();
  private floor: THREE.Mesh;
  private resize: ResizeObserver;
  private frame = 0;
  private radius = 5;
  private framing = { halfHeight: 5, aspect: 1 };
  private bounds = new THREE.Box3();
  private layoutKey = '';
  private view: View | null = 'perspective';
  private onContextLost: (event: Event) => void;
  private models = new Map<string, THREE.Group>();
  private selectedId: string | null = null;
  private selectedName: string | null = null;
  private snapEnabled = true;
  private contactFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: '#2c8c74', transparent: true, opacity: .38, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));
  private placementMessage = '';
  private pendingSnapId: string | null = null;
  private pointerStart: { id: number; x: number; y: number; target: string | null } | null = null;
  private pickableMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPointer: number | null = null;
  private dragStart: { position: THREE.Vector3; yaw: number } | null = null;
  private blockedTouches = new Set<number>();
  private cameraPointers = new Set<number>();
  private onMoveStateChange: (state: MoveState) => void;
  private onCamera: (camera: CameraState) => void;
  private onPoseCommit: (id: string, pose: Pose) => void;

  private commitPose(id: string, model: THREE.Group) {
    const { x, y, z } = model.position;
    this.onPoseCommit(id, {
      positionMm: { x: x / s, y: y / s, z: z / s },
      yawDeg: THREE.MathUtils.radToDeg(model.rotation.y),
    });
  }

  private host: HTMLDivElement;
  constructor(host: HTMLDivElement, onError: () => void, onMoveStateChange: (state: MoveState) => void, onViewChange: (view: View | null) => void, onPoseCommit: (id: string, pose: Pose) => void, onCamera: (camera: CameraState) => void) {
    this.host = host;
    this.onPoseCommit = onPoseCommit;
    this.onCamera = onCamera;
    this.onMoveStateChange = onMoveStateChange;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#f4f6f9', 0);
    this.renderer.domElement.setAttribute('aria-label', '제품과 선택한 물건의 실제 비율 3D 비교');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('tabindex', '0');
    this.onContextLost = event => { event.preventDefault(); this.finishDrag(false); onError(); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.labels.domElement.className = 'scene-labels';
    host.append(this.renderer.domElement, this.labels.domElement);
    this.camera.position.copy(viewDirections.perspective).multiplyScalar(12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minZoom = .15;
    this.controls.maxZoom = 12;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.addEventListener('change', () => {
      this.reportCamera();
      const direction = this.camera.position.clone().sub(this.controls.target).normalize();
      const view = (Object.keys(viewDirections) as View[]).find(key => direction.dot(viewDirections[key]) > 1 - 1e-8) ?? null;
      if (this.view === view) return;
      this.view = view;
      onViewChange(view);
    });
    this.pivot.rotation.order = 'YXZ';
    this.transform.setSpace('world');
    this.transform.setSize(.85);
    this.transform.addEventListener('objectChange', this.onTransformChange);
    this.outline.visible = false;
    this.contactFace.visible = false;
    this.contactFace.renderOrder = 20;
    this.scene.add(this.pivot, this.outline, this.contactFace, this.transform.getHelper());

    // Route handle gestures before OrbitControls receives them.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    canvas.addEventListener('pointermove', this.onPointerMove, true);
    canvas.addEventListener('pointerup', this.onPointerEnd, true);
    canvas.addEventListener('pointercancel', this.onPointerEnd, true);
    canvas.addEventListener('lostpointercapture', this.onPointerEnd, true);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKeyDown);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b6bfd0', 2.7));
    const key = new THREE.DirectionalLight('#fff9ef', 3.2);
    key.position.set(-8, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20; key.shadow.camera.right = 20;
    key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    key.shadow.normalBias = .02;
    this.scene.add(key);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: .1 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -.002;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor, this.content, this.grid);
    this.resize = new ResizeObserver(() => this.resizeViewport());
    this.resize.observe(host);
    const animate = () => {
      this.frame = requestAnimationFrame(animate);
      if (this.dragPointer === null) this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    };
    animate();
  }
  private updatePointer(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  }
  private hitObject(touch = false): string | null {
    this.camera.updateMatrixWorld();
    this.content.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let hit = this.raycaster.intersectObjects(this.pickableMeshes, false)[0];
    if (!hit && touch) {
      const canvas = this.renderer.domElement;
      for (const [dx, dy] of [[0, 6], [0, -6], [6, 0], [-6, 0]]) {
        const near = this.pointer.clone().add(new THREE.Vector2(dx * 2 / canvas.clientWidth, dy * 2 / canvas.clientHeight));
        this.raycaster.setFromCamera(near, this.camera);
        hit = this.raycaster.intersectObjects(this.pickableMeshes, false)[0];
        if (hit) break;
      }
    }
    if (!hit) return null;
    for (const [id, model] of this.models) {
      if (model === hit.object || model.getObjectById(hit.object.id)) return id;
    }
    return null;
  }
  selectObject(id: string | null) {
    if (id !== this.selectedId) this.placementMessage = '';
    this.selectedId = id;
    const model = id ? this.models.get(id) : undefined;
    this.selectedName = model?.name ?? null;
    this.showObjectDimensions(model ?? this.models.get(this.defaultDimensionId ?? ''));
    this.outline.visible = !!model;
    if (model) {
      const bounds = this.meshBounds(model);
      this.pivotHeight = bounds.getSize(new THREE.Vector3()).y / 2;
      this.pivot.position.copy(model.position);
      this.pivot.position.y += this.pivotHeight;
      this.pivot.rotation.y = model.rotation.y;
      this.transform.minY = this.pivotHeight;
      this.transform.maxY = this.pivotHeight + 10000 * s;
      this.transform.attach(this.pivot);
      this.outline.box.copy(bounds);
    } else {
      this.transform.detach();
    }
    this.reportMoveState();
  }
  private reportMoveState() {
    const model = this.selectedId ? this.models.get(this.selectedId) : undefined;
    this.onMoveStateChange({
      moved: this.models.size > 0,
      dragging: this.dragPointer !== null,
      selected: this.selectedName,
      id: this.selectedId ?? undefined,
      heightMm: model ? model.position.y / s : undefined,
      placementMessage: this.placementMessage,
      yawDeg: model ? THREE.MathUtils.radToDeg(model.rotation.y) : undefined,
    });
  }
  // Three.js takes normalized device coordinates here, despite its PointerEvent type.
  private transformPointer(button: number) {
    return { x: this.pointer.x, y: this.pointer.y, button } as PointerEvent;
  }
  private onPointerDown = (event: PointerEvent) => {
    if (this.blockedTouches.size || this.dragPointer !== null) {
      if (event.pointerType === 'touch') {
        if (this.dragPointer !== null) this.blockedTouches.add(this.dragPointer);
        this.blockedTouches.add(event.pointerId);
        this.finishDrag(false, true);
        this.renderer.domElement.setPointerCapture(event.pointerId);
      }
      event.stopImmediatePropagation();
      return;
    }
    const cameraBusy = this.cameraPointers.size > 0;
    if (cameraBusy || !event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      this.pointerStart = null;
      this.cameraPointers.add(event.pointerId);
      return;
    }
    this.updatePointer(event);
    const pointer = this.transformPointer(0);
    this.transform.getHelper().updateMatrixWorld(true);
    this.transform.pointerHover(pointer);
    if (this.transform.axis) {
      this.transform.getHelper().updateMatrixWorld(true);
      this.transform.pointerDown(pointer);
      if (this.transform.dragging) {
        this.placementMessage = '';
        const model = this.models.get(this.selectedId!)!;
        this.dragStart = { position: model.position.clone(), yaw: model.rotation.y };
        this.dragPointer = event.pointerId;
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture(event.pointerId);
        this.renderer.domElement.style.cursor = 'grabbing';
        this.reportMoveState();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    this.cameraPointers.add(event.pointerId);
    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, target: this.hitObject(event.pointerType === 'touch') };
  };
  private onPointerMove = (event: PointerEvent) => {
    if (this.blockedTouches.has(event.pointerId)) {
      event.stopImmediatePropagation();
      return;
    }
    if (this.dragPointer !== null) {
      if (event.pointerId === this.dragPointer) {
        this.updatePointer(event);
        this.transform.pointerMove(this.transformPointer(-1));
      }
      event.stopImmediatePropagation();
      return;
    }
    const start = this.pointerStart;
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
      this.pointerStart = null;
    }
    if (event.pointerType !== 'touch' && event.buttons === 0) {
      this.updatePointer(event);
      this.transform.pointerHover(this.transformPointer(-1));
      this.renderer.domElement.style.cursor = this.transform.axis ? 'grab' : this.hitObject() ? 'pointer' : '';
    }
  };
  private onPointerEnd = (event: PointerEvent) => {
    if (this.blockedTouches.delete(event.pointerId)) {
      event.stopImmediatePropagation();
      return;
    }
    this.cameraPointers.delete(event.pointerId);
    if (event.pointerId === this.dragPointer) {
      event.stopImmediatePropagation();
      this.finishDrag(event.type === 'pointerup');
      return;
    }
    const start = this.pointerStart;
    if (start?.id !== event.pointerId) return;
    this.pointerStart = null;
    if (event.type === 'pointerup' && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) {
      this.selectObject(start.target);
    }
  };
  private onPointerLeave = () => {
    if (this.dragPointer !== null) return;
    this.transform.axis = null;
    this.renderer.domElement.style.cursor = '';
  };
  private onBlur = () => {
    this.pointerStart = null;
    this.cameraPointers.clear();
    this.blockedTouches.clear();
    this.finishDrag(false);
  };
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.dragPointer !== null) {
      event.preventDefault();
      this.finishDrag(false);
    }
  };
  private onTransformChange = () => {
    const id = this.selectedId;
    const model = id ? this.models.get(id) : undefined;
    if (!id || !model) return;
    const height = Math.max(0, this.pivot.position.y - this.pivotHeight);
    model.position.set(this.pivot.position.x, height, this.pivot.position.z);
    model.rotation.y = this.pivot.rotation.y;
    this.outline.box.copy(this.meshBounds(model));
    this.pendingSnapId = id;
    this.previewPlacement(id, model);
  };
  private finishDrag = (commit = false, retainCapture = false) => {
    if (this.dragPointer === null) return;
    const pointerId = this.dragPointer;
    this.dragPointer = null;
    this.transform.pointerUp(null);
    const canvas = this.renderer.domElement;
    if (!retainCapture && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    this.controls.enabled = true;
    canvas.style.cursor = '';
    this.contactFace.visible = false;

    const id = this.pendingSnapId;
    const model = id ? this.models.get(id) : undefined;
    if (id && model && !commit && this.dragStart) {
      model.position.copy(this.dragStart.position);
      model.rotation.y = this.dragStart.yaw;
      this.pendingSnapId = null;
      this.selectObject(id);
    } else if (id && model && commit) {
      if (this.transform.mode === 'rotate') {
        const quarterTurn = Math.PI / 2;
        const nearest = Math.round(model.rotation.y / quarterTurn) * quarterTurn;
        if (Math.abs(model.rotation.y - nearest) < THREE.MathUtils.degToRad(8)) model.rotation.y = nearest;
      }
      if (this.applyPlacement(id, model)) this.commitPose(id, model);
      else if (this.dragStart) {
        model.position.copy(this.dragStart.position);
        model.rotation.y = this.dragStart.yaw;
      }
      this.selectObject(id);
    } else {
      this.reportMoveState();
    }
    this.pendingSnapId = null;
    this.dragStart = null;
    this.measureBounds();
    this.rebuildGrid();
  };
  setSelectedPose(heightMm: number, yawDeg: number) {
    this.finishDrag();
    const id = this.selectedId;
    const model = id ? this.models.get(id) : undefined;
    if (!id || !model || !Number.isFinite(heightMm) || heightMm < 0 || heightMm > 10000 || !Number.isFinite(yawDeg)) return;
    const previous = { position: model.position.clone(), yaw: model.rotation.y };
    this.placementMessage = '';
    model.position.y = heightMm * s;
    model.rotation.y = THREE.MathUtils.degToRad(yawDeg % 360);
    if (this.applyPlacement(id, model)) this.commitPose(id, model);
    else {
      model.position.copy(previous.position);
      model.rotation.y = previous.yaw;
    }
    this.selectObject(id);
    this.measureBounds();
    this.rebuildGrid();
  }
  fitSelected() {
    this.finishDrag();
    const model = this.selectedId ? this.models.get(this.selectedId) : undefined;
    if (model) this.fitBounds(this.meshBounds(model).expandByScalar(.15));
  }
  setTransformMode(mode: TransformMode) {
    this.finishDrag();
    this.transform.axis = null;
    this.transform.setMode(mode);
    this.transform.showX = mode === 'translate';
    this.transform.showZ = mode === 'translate';
  }
  private meshBounds(model: THREE.Group) {
    // Exclude labels and dimension lines from contact and selection bounds.
    model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) {
        bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return bounds;
  }
  setSnapEnabled(enabled: boolean) { this.snapEnabled = enabled; }

  private placement(id: string, model: THREE.Group) {
    const bounds = this.meshBounds(model);
    const targets = [...this.models]
      .filter(([otherId]) => otherId !== id)
      .map(([, other]) => this.meshBounds(other))
      .filter(box => !box.isEmpty());
    return { bounds, result: resolvePlacement(bounds, targets, this.snapEnabled ? 20 * s : 0) };
  }
  private previewPlacement(id: string, model: THREE.Group) {
    const { bounds, result } = this.placement(id, model);
    this.contactFace.visible = result.kind === 'contact';
    if (result.kind !== 'contact') return;
    const { axis, side, offset, target } = result;
    const patch = bounds.translate(offset).intersect(target.clone().expandByScalar(1e-6));
    const center = patch.getCenter(new THREE.Vector3());
    const size = patch.getSize(new THREE.Vector3());
    const normal = new THREE.Vector3();
    normal[axis] = side === 'min' ? -1 : 1;
    this.contactFace.position.copy(center);
    this.contactFace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const width = axis === 'x' ? size.z : size.x;
    const height = axis === 'y' ? size.z : size.y;
    this.contactFace.scale.set(width, height, 1);
  }
  private applyPlacement(id: string, model: THREE.Group) {
    const { result } = this.placement(id, model);
    if (result.kind === 'blocked') {
      this.placementMessage = '겹침을 풀 공간이 없어 이전 배치로 돌아갔어요.';
      return false;
    }
    if (result.kind === 'contact') model.position.add(result.offset);
    return true;
  }
  clearSelection() { this.finishDrag(); this.selectObject(null); }
  update(instances: SceneInstance[], unit: Unit, showDimensions: boolean, showGrid: boolean) {
    this.finishDrag();
    this.dimensionGroup.removeFromParent();
    this.pickableMeshes = [];
    this.pointerStart = null;
    const previous = this.models;
    this.models = new Map();
    for (const { id, snapshot, shape, positionMm, yawDeg } of instances) {
      let model = previous.get(id);
      if (model && model.userData.dimensions === snapshot && model.userData.shape === shape) {
        previous.delete(id);
      } else {
        const preset = PRESETS.find(item => item.id === shape);
        model = createModel(snapshot, preset);
        model.name = snapshot.name;
        model.userData.dimensions = snapshot;
        model.userData.shape = shape;
        const labelPosition = new THREE.Vector3(0, snapshot.height * s + .34, 0);
        model.add(label(snapshot.name, preset ? 'object-label' : 'object-label product-label', labelPosition));
        this.content.add(model);
      }
      model.position.set(positionMm.x * s, positionMm.y * s, positionMm.z * s);
      model.rotation.y = THREE.MathUtils.degToRad(yawDeg);
      this.models.set(id, model);
      model.traverse(object => { if (object instanceof THREE.Mesh) this.pickableMeshes.push(object); });
    }
    for (const retired of previous.values()) {
      retired.removeFromParent();
      disposeGroup(retired);
    }
    this.defaultDimensionId = instances.find(item => !item.shape)?.id ?? null;
    this.dimensionUnit = unit;
    this.showDimensions = showDimensions;
    this.selectObject(this.selectedId && this.models.has(this.selectedId) ? this.selectedId : null);
    this.measureBounds();
    this.rebuildGrid();
    this.grid.visible = showGrid;
    const key = instances.map(item => item.id).join(',');
    if (key !== this.layoutKey) { this.layoutKey = key; this.fit(); }
  }
  private defaultDimensionId: string | null = null;
  private dimensionGroup = new THREE.Group();
  private dimensionUnit: Unit = 'mm';
  private showDimensions = true;

  private showObjectDimensions(model: THREE.Group | undefined) {
    this.dimensionGroup.removeFromParent();
    disposeGroup(this.dimensionGroup);
    if (!model || !this.showDimensions) return;
    const snapshot = model.userData.dimensions as Dimensions;
    const w = snapshot.width * s, d = snapshot.depth * s, h = snapshot.height * s;
    const offset = Math.max(.25, Math.max(w, d, h) * .09);
    const unit = this.dimensionUnit;
    dimension(this.dimensionGroup, new THREE.Vector3(-w / 2, .025, d / 2 + offset), new THREE.Vector3(w / 2, .025, d / 2 + offset), `W ${displayValue(snapshot.width, unit)} ${unit}`, 'w');
    dimension(this.dimensionGroup, new THREE.Vector3(w / 2 + offset, .025, -d / 2), new THREE.Vector3(w / 2 + offset, .025, d / 2), `D ${displayValue(snapshot.depth, unit)} ${unit}`, 'd');
    dimension(this.dimensionGroup, new THREE.Vector3(-w / 2 - offset, 0, d / 2 + offset), new THREE.Vector3(-w / 2 - offset, h, d / 2 + offset), `H ${displayValue(snapshot.height, unit)} ${unit}`, 'h');
    model.add(this.dimensionGroup);
  }
  private measureBounds() {
    const bounds = new THREE.Box3().setFromObject(this.content);
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const size = bounds.getSize(new THREE.Vector3());
    this.bounds.copy(bounds).expandByScalar(.3);
    this.radius = Math.max(size.length() / 2, .8);
  }
  private rebuildGrid() {
    disposeGroup(this.grid);
    const extent = Math.max(Math.abs(this.bounds.min.x), Math.abs(this.bounds.max.x), Math.abs(this.bounds.min.z), Math.abs(this.bounds.max.z));
    const gridSize = Math.min(2000, Math.max(20, Math.ceil((extent * 2 + 10) / 10) * 10));
    // Grid always has 100 mm cells, independent of object dimensions.
    const grid = new THREE.GridHelper(gridSize, gridSize, '#dce2eb', '#e2e6ed');
    grid.position.y = -.003;
    this.grid.add(grid);
  }
  private resizeViewport(bounds?: THREE.Box3) {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    const aspect = width / height;
    if (bounds) {
      this.camera.updateMatrixWorld();
      const projected = new THREE.Box3();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
      }
      const size = projected.getSize(new THREE.Vector3());
      this.framing = { halfHeight: Math.max(size.y, size.x / aspect, .8) * .67, aspect };
    }
    const halfHeight = this.framing.halfHeight * Math.max(1, this.framing.aspect / aspect);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
  private reportCamera() {
    const toMm = ({ x, y, z }: THREE.Vector3) => ({ x: x / s, y: y / s, z: z / s });
    this.onCamera({
      positionMm: toMm(this.camera.position), targetMm: toMm(this.controls.target),
      zoom: this.camera.zoom, ...this.framing,
    });
  }
  restoreCamera(state: CameraState) {
    this.framing = { halfHeight: state.halfHeight, aspect: state.aspect };
    this.camera.position.set(state.positionMm.x * s, state.positionMm.y * s, state.positionMm.z * s);
    this.controls.target.set(state.targetMm.x * s, state.targetMm.y * s, state.targetMm.z * s);
    this.camera.zoom = state.zoom;
    this.controls.update();
    this.resizeViewport();
    this.reportCamera();
  }
  fit() {
    this.finishDrag();
    this.measureBounds();
    this.rebuildGrid();
    this.fitBounds(this.bounds);
  }
  private fitBounds(bounds: THREE.Box3) {
    this.camera.zoom = 1;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const center = bounds.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, this.radius * 4 + 10);
    this.controls.update();
    this.resizeViewport(bounds);
    this.reportCamera();
  }
  setView(view: View) {
    this.finishDrag();
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const zoom = this.camera.zoom;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update(); // Flush residual orbit and pan before reorienting.
    this.controls.target.copy(target);
    this.camera.zoom = zoom;
    this.camera.position.copy(target).addScaledVector(viewDirections[view], distance);
    this.controls.update();
    this.camera.updateProjectionMatrix();
    this.controls.enableDamping = damping;
    this.reportCamera();
  }
  zoom(factor: number) {
    this.finishDrag();
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .15, 12);
    this.camera.updateProjectionMatrix();
    this.reportCamera();
  }
  destroy() {
    this.finishDrag();
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown, true);
    canvas.removeEventListener('pointermove', this.onPointerMove, true);
    canvas.removeEventListener('pointerup', this.onPointerEnd, true);
    canvas.removeEventListener('pointercancel', this.onPointerEnd, true);
    canvas.removeEventListener('lostpointercapture', this.onPointerEnd, true);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKeyDown);
    this.dimensionGroup.removeFromParent();
    disposeGroup(this.dimensionGroup);
    this.transform.getHelper().removeFromParent();
    this.transform.getHelper().dispose();
    this.outline.removeFromParent();
    this.outline.dispose();
    disposeGroup(this.scene);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
