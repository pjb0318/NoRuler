import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createDeskModel } from './deskModel.ts';
import { createParametricModel } from './parametricModel.ts';
import { addEdgeLines, getModelAccent } from './modelPalette.ts';
import type { ModelAccent } from './modelPalette.ts';
import { WORLD_SCALE, PRESETS, displayValue } from './domain.ts';
import type { CameraState, ThemeMode } from './storage.ts';
import type { Pose, SceneInstance } from './workspace.ts';
import {
  findSupportTopY,
  overlaps,
  isRestingOnSupport,
  resolveFloorSnap,
  resolveHorizontalAlignment,
  resolvePlacement,
} from './placement.ts';
import type { AlignmentGuide, Placement } from './placement.ts';
import type { Dimensions, Preset, Product, Unit } from './domain.ts';

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
export type MoveState = {
  moved: boolean;
  dragging: boolean;
  selected: string | null;
  id?: string;
  heightMm?: number;
  restingOnObject?: boolean;
  yawDeg?: number;
  placementMessage?: string;
  snapStatus?: string;
  snapTone?: 'neutral' | 'snapped' | 'blocked';
  dragMode?: 'floor' | 'axis-x' | 'axis-y' | 'axis-z' | 'rotate' | null;
};
const s = WORLD_SCALE;
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: string, metalness = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function createModel(d: Dimensions & Pick<Product, 'deskShape' | 'parametricShape'>, preset?: Preset, accent?: ModelAccent): THREE.Group {
  if (d.deskShape) return createDeskModel(d, d.deskShape, accent);
  if (d.parametricShape) return createParametricModel(d, d.parametricShape, accent);
  const group = new THREE.Group();
  const w = d.width * s, h = d.height * s, depth = d.depth * s;
  if (!preset) {
    const resolved = accent ?? getModelAccent(0);
    const mesh = box(group, w, h, depth, 0, h / 2, 0, resolved.fill);
    addEdgeLines(mesh, resolved.edge, 0.78, 24);
  } else if (preset.id === 'bottle') {
    const profile = [[0, 0], [.37, 0], [.47, .018], [.5, .05], [.5, .68], [.47, .75], [.24, .86], [.22, .89], [.22, .96], [0, .96]];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * w, y * h)), 48), new THREE.MeshStandardMaterial({ color: '#84ccc0', metalness: 0.1, roughness: 0.35 }));
    mesh.castShadow = true;
    group.add(mesh);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(w * .5, w * .5, h * .27, 48), new THREE.MeshStandardMaterial({ color: '#2a877a', roughness: .68, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    label.position.y = h * .45;
    group.add(label);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * .25, w * .25, h * .055, 32), new THREE.MeshStandardMaterial({ color: '#e3efeb', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    cap.position.y = h * .9725;
    addEdgeLines(cap, '#46615d', 0.45, 32);
    group.add(cap);
  } else if (preset.id === 'phone') {
    const body = box(group, w, h, depth, 0, h / 2, 0, '#4f5d75', .35);
    addEdgeLines(body, '#94a8c7', 0.55, 24);
    // Decals are planes on the front surface so the external depth stays exact.
    for (const [pw, ph, y, color, layer] of [[w * .9, h * .94, h / 2, '#c4d6f5', -1], [w * .28, h * .024, h * .948, '#3a4357', -2], [w * .3, h * .008, h * .055, '#f5f6fc', -2]] as const) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ color, polygonOffset: true, polygonOffsetFactor: layer, polygonOffsetUnits: layer }));
      face.position.set(0, y, depth / 2);
      group.add(face);
    }
  } else if (preset.id === 'laptop') {
    const body = box(group, w, h, depth, 0, h / 2, 0, '#c7d0dd', .35);
    addEdgeLines(body, '#52627a', 0.5, 24);
    box(group, w * .98, .008, depth * .98, 0, h * .6, 0, '#4b576b');
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(w * .09, depth * .1), new THREE.MeshStandardMaterial({ color: '#8d98ab', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = h;
    group.add(mark);
  } else if (preset.id === 'keyboard') {
    const base = box(group, w, h * .6, depth, 0, h * .3, 0, '#5b6178');
    addEdgeLines(base, '#95a1bd', 0.4, 24);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 15; col++) {
      if (row === 4 && col > 3 && col < 10) continue;
      box(group, w / 17, h * .4, depth / 6.3, -w * .45 + col * w / 15.5, h * .8, -depth * .39 + row * depth / 5.2, '#e7e9f2');
    }
    box(group, w * .38, h * .4, depth / 6.3, -w * .03, h * .8, -depth * .39 + 4 * depth / 5.2, '#e7e9f2');
  } else if (preset.id === 'monitor') {
    box(group, w * .4, h * .025, depth, 0, h * .0125, 0, '#7c889c', .35);
    box(group, w * .065, h * .37, depth * .15, 0, h * .2, -depth * .18, '#7c889c', .3);
    const bezel = box(group, w, h * .78, depth * .17, 0, h * .61, -depth * .18, '#465369');
    addEdgeLines(bezel, '#8ea2bf', 0.5, 24);
    box(group, w * .96, h * .725, .003, 0, h * .62, -depth * .095 + .002, '#bad0ec');
  } else {
    const sheet = box(group, w, h, depth, 0, h / 2, 0, '#eef2f7');
    addEdgeLines(sheet, '#475975', 0.85, 24);
    // A4 stays exactly 210 × 297 × 0.1 mm; no visual thickness inflation.
  }
  return group;
}

function label(text: string, className: string, position: THREE.Vector3, accentColor?: string) {
  const el = document.createElement('div');
  el.className = className;
  if (accentColor) {
    el.style.setProperty('--accent', accentColor);
    const swatch = document.createElement('span');
    swatch.className = 'label-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    el.append(swatch);
  }
  el.append(document.createTextNode(text));
  const object = new CSS2DObject(el);
  object.position.copy(position);
  return object;
}
function dimension(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, text: string, axis: string, color = '#89b4fa') {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .85 });
  const tick = axis === 'h' ? new THREE.Vector3(.08, 0, 0) : new THREE.Vector3(0, .06, 0);
  const points = [from, to, from.clone().sub(tick), from.clone().add(tick), to.clone().sub(tick), to.clone().add(tick)];
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
  group.add(label(text, `dimension-label dimension-${axis}`, from.clone().lerp(to, .5)));
}
function disposeGroup(group: THREE.Object3D) {
  group.traverse(object => {
    if (object instanceof CSS2DObject) object.element.remove();
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
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
  private outline = new THREE.Box3Helper(new THREE.Box3(), '#f9e2af');
  private groundGuide = new THREE.Group();
  private groundFootprintFill: THREE.Mesh;
  private groundFootprintBorder: THREE.LineLoop;
  private elevationLines: THREE.LineSegments;
  private alignmentLines: THREE.LineSegments;
  private pivotHeight = 0;
  private content = new THREE.Group();
  private grid = new THREE.Group();
  private floor: THREE.Mesh;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private theme: ThemeMode = 'dark';
  private resize: ResizeObserver;
  private frame = 0;
  private radius = 5;
  private framing = { halfHeight: 5, aspect: 1 };
  private bounds = new THREE.Box3();
  private layoutKey = '';
  private view: View | null = 'perspective';
  private onContextLost: (event: Event) => void;
  private models = new Map<string, THREE.Group>();
  private groupIds: string[] = [];
  private groupMode = false;
  private onGroupChange: (ids: string[]) => void = () => {};
  private groupStart: Map<string, { position: THREE.Vector3; yaw: number }> | null = null;
  private onPosesCommit: (poses: { id: string; pose: Pose }[]) => void;
  private selectedId: string | null = null;
  private selectedName: string | null = null;
  private snapEnabled = true;
  private contactFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: '#a6e3a1', transparent: true, opacity: .45, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));
  private placementMessage = '';
  private snapStatus = '';
  private snapTone: MoveState['snapTone'] = 'neutral';
  private dragMode: MoveState['dragMode'] = null;
  private pendingSnapId: string | null = null;
  private pointerStart: { id: number; x: number; y: number; target: string | null } | null = null;
  private pickableMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPointer: number | null = null;
  private dragKind: 'gizmo' | 'body-translate' | 'body-rotate' | null = null;
  private dragActivated = false;
  private dragStart: { position: THREE.Vector3; yaw: number; clientX: number; clientY: number } | null = null;
  private dragPlane = new THREE.Plane();
  private dragPlaneStart = new THREE.Vector3();
  private dragSideAxis: THREE.Vector3 | null = null;
  private dragStartedOnSupport = false;
  private lastDragBlocked = false;
  private lastReportedKey = '';
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
  constructor(host: HTMLDivElement, onError: () => void, onMoveStateChange: (state: MoveState) => void, onViewChange: (view: View | null) => void, onPoseCommit: (id: string, pose: Pose) => void, onCamera: (camera: CameraState) => void, onPosesCommit: (poses: { id: string; pose: Pose }[]) => void) {
    this.host = host;
    this.onPosesCommit = onPosesCommit;
    this.onPoseCommit = onPoseCommit;
    this.onCamera = onCamera;
    this.onMoveStateChange = onMoveStateChange;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor('#1e1e2e', 0);
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
    this.transform.setColors('#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af');
    // Remove XYZ and vertical plane handles so drags stay anchored to floor/horizontal or explicit Y lift.
    const unwantedHandles: THREE.Object3D[] = [];
    this.transform.getHelper().traverse(child => {
      if (child.name === 'XYZ' || child.name === 'XY' || child.name === 'YZ') {
        unwantedHandles.push(child);
      }
    });
    for (const handle of unwantedHandles) {
      if (handle instanceof THREE.Mesh) handle.geometry.dispose();
      handle.removeFromParent();
    }
    this.transform.addEventListener('objectChange', this.onTransformChange);
    this.outline.visible = false;
    this.contactFace.visible = false;
    this.contactFace.renderOrder = 20;

    this.groundFootprintFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#f9e2af', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.groundFootprintFill.rotation.x = -Math.PI / 2;
    this.groundFootprintFill.position.y = 0.004;
    this.groundFootprintFill.renderOrder = 5;

    const borderGeom = new THREE.BufferGeometry();
    borderGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.groundFootprintBorder = new THREE.LineLoop(
      borderGeom,
      new THREE.LineBasicMaterial({ color: '#f9e2af', transparent: true, opacity: 0.85 }),
    );
    this.groundFootprintBorder.renderOrder = 6;

    const elevGeom = new THREE.BufferGeometry();
    elevGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    this.elevationLines = new THREE.LineSegments(
      elevGeom,
      new THREE.LineDashedMaterial({ color: '#f9e2af', dashSize: 0.14, gapSize: 0.09, transparent: true, opacity: 0.9 }),
    );
    this.elevationLines.renderOrder = 7;

    this.groundGuide.add(this.groundFootprintFill, this.groundFootprintBorder, this.elevationLines);
    this.groundGuide.visible = false;

    const alignGeom = new THREE.BufferGeometry();
    alignGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    alignGeom.setDrawRange(0, 0);
    this.alignmentLines = new THREE.LineSegments(
      alignGeom,
      new THREE.LineBasicMaterial({ color: '#89dceb', transparent: true, opacity: 0.92, depthTest: false }),
    );
    this.alignmentLines.renderOrder = 18;
    this.alignmentLines.visible = false;

    this.scene.add(this.pivot, this.outline, this.groundGuide, this.alignmentLines, this.contactFace, this.transform.getHelper());

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
    this.hemiLight = new THREE.HemisphereLight('#f2f6fc', '#495870', 0.95);
    this.scene.add(this.hemiLight);
    const key = new THREE.DirectionalLight('#fffaf2', 1.9);
    key.position.set(-10, 18, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20; key.shadow.camera.right = 20;
    key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = .02;
    this.keyLight = key;
    this.scene.add(key, key.target);
    this.rimLight = new THREE.DirectionalLight('#c8dcff', 0.55);
    this.rimLight.position.set(12, 9, -12);
    this.scene.add(this.rimLight);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ color: '#11111b', opacity: .45 }));
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
  private hitObject(touch = false): { id: string; point: THREE.Vector3 } | null {
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
      if (model === hit.object || model.getObjectById(hit.object.id)) {
        return { id, point: hit.point.clone() };
      }
    }
    return null;
  }
  private updateSelectionGuides(bounds: THREE.Box3 | null, tone: 'idle' | 'moving' | 'snapped' | 'blocked' = 'idle') {
    if (bounds && this.groupMode && this.groupIds.length > 1 && this.groupIds.includes(this.selectedId ?? '')) {
      bounds = bounds.clone();
      for (const id of this.groupIds) {
        const model = this.models.get(id);
        if (model) bounds.union(this.meshBounds(model));
      }
    }
    if (!bounds || bounds.isEmpty()) {
      this.outline.visible = false;
      this.groundGuide.visible = false;
      return;
    }
    const isLight = this.theme === 'light';
    const palette = (isLight
      ? { idle: '#df8e1d', moving: '#1e66f5', snapped: '#40a02b', blocked: '#d20f39' }
      : { idle: '#f9e2af', moving: '#89b4fa', snapped: '#a6e3a1', blocked: '#f38ba8' }
    )[tone];
    (this.outline.material as THREE.LineBasicMaterial).color.set(palette);
    this.outline.box.copy(bounds);
    this.outline.visible = true;

    const fillMat = this.groundFootprintFill.material as THREE.MeshBasicMaterial;
    const borderMat = this.groundFootprintBorder.material as THREE.LineBasicMaterial;
    const elevMat = this.elevationLines.material as THREE.LineDashedMaterial;
    fillMat.color.set(palette);
    fillMat.opacity = tone === 'blocked' ? (isLight ? 0.24 : 0.22) : (isLight ? 0.16 : 0.12);
    borderMat.color.set(palette);
    elevMat.color.set(palette);

    const width = Math.max(1e-4, bounds.max.x - bounds.min.x);
    const depth = Math.max(1e-4, bounds.max.z - bounds.min.z);
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cz = (bounds.min.z + bounds.max.z) / 2;
    this.groundFootprintFill.position.set(cx, 0.004, cz);
    this.groundFootprintFill.scale.set(width, depth, 1);

    const borderPos = this.groundFootprintBorder.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gy = 0.005;
    borderPos.setXYZ(0, bounds.min.x, gy, bounds.min.z);
    borderPos.setXYZ(1, bounds.max.x, gy, bounds.min.z);
    borderPos.setXYZ(2, bounds.max.x, gy, bounds.max.z);
    borderPos.setXYZ(3, bounds.min.x, gy, bounds.max.z);
    borderPos.needsUpdate = true;
    this.groundFootprintBorder.geometry.computeBoundingSphere();

    const floating = bounds.min.y > 0.5 * s;
    this.elevationLines.visible = floating;
    if (floating) {
      const elevPos = this.elevationLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const corners: [number, number][] = [
        [bounds.min.x, bounds.min.z],
        [bounds.max.x, bounds.min.z],
        [bounds.max.x, bounds.max.z],
        [bounds.min.x, bounds.max.z],
      ];
      for (let i = 0; i < 4; i++) {
        const [x, z] = corners[i];
        elevPos.setXYZ(i * 2, x, gy, z);
        elevPos.setXYZ(i * 2 + 1, x, bounds.min.y, z);
      }
      elevPos.needsUpdate = true;
      const dash = Math.max(0.04, Math.min(0.35, bounds.min.y * 0.12));
      elevMat.dashSize = dash;
      elevMat.gapSize = dash * 0.6;
      this.elevationLines.computeLineDistances();
      this.elevationLines.geometry.computeBoundingSphere();
    }
    this.groundGuide.visible = true;
  }
  private showAlignmentGuides(guides: AlignmentGuide[]) {
    const count = Math.min(4, guides.length);
    if (count === 0) {
      this.clearAlignmentGuides();
      return;
    }
    const pos = this.alignmentLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const y = 0.008;
    for (let i = 0; i < count; i++) {
      const g = guides[i];
      if (g.axis === 'x') {
        pos.setXYZ(i * 2, g.coord, y, g.from);
        pos.setXYZ(i * 2 + 1, g.coord, y, g.to);
      } else {
        pos.setXYZ(i * 2, g.from, y, g.coord);
        pos.setXYZ(i * 2 + 1, g.to, y, g.coord);
      }
    }
    pos.needsUpdate = true;
    this.alignmentLines.geometry.setDrawRange(0, count * 2);
    this.alignmentLines.geometry.computeBoundingSphere();
    this.alignmentLines.visible = true;
  }
  private clearAlignmentGuides() {
    this.alignmentLines.geometry.setDrawRange(0, 0);
    this.alignmentLines.visible = false;
  }
  setGroupSelection(ids: string[], onChange: (ids: string[]) => void, enabled: boolean) {
    this.groupMode = enabled;
    this.groupIds = ids.filter(id => this.models.has(id));
    this.onGroupChange = onChange;
    if (this.groupIds.length && !this.groupIds.includes(this.selectedId ?? '')) this.selectObject(this.groupIds.at(-1)!);
    else this.selectObject(this.selectedId);
  }
  private chooseObject(id: string | null) {
    if (!this.groupMode) { this.selectObject(id); return; }
    this.groupIds = id ? (this.groupIds.includes(id) ? this.groupIds.filter(other => other !== id) : [...this.groupIds, id]) : [];
    this.onGroupChange([...this.groupIds]);
    this.selectObject(this.groupIds.at(-1) ?? null);
  }
  private captureGroup() {
    return new Map(this.groupIds.filter(id => this.models.has(id)).map(id => {
      const model = this.models.get(id)!;
      return [id, { position: model.position.clone(), yaw: model.rotation.y }];
    }));
  }
  private restoreGroup(start: Map<string, { position: THREE.Vector3; yaw: number }>) {
    for (const [id, pose] of start) {
      const model = this.models.get(id);
      if (model) { model.position.copy(pose.position); model.rotation.y = pose.yaw; }
    }
  }
  private groupIsValid() {
    const external = [...this.models].filter(([id]) => !this.groupIds.includes(id)).map(([, model]) => this.meshBounds(model));
    return this.groupIds.every(id => {
      const model = this.models.get(id);
      if (!model) return false;
      const bounds = this.meshBounds(model);
      return bounds.min.y >= -1e-7 && !external.some(target => overlaps(bounds, target));
    });
  }
  private commitGroup(start: Map<string, { position: THREE.Vector3; yaw: number }>) {
    const poses = [...start].flatMap(([id, previous]) => {
      const model = this.models.get(id)!;
      if (model.position.distanceToSquared(previous.position) < 1e-12 && Math.abs(model.rotation.y - previous.yaw) < 1e-6) return [];
      return [{ id, pose: { positionMm: { x: model.position.x / s, y: model.position.y / s, z: model.position.z / s }, yawDeg: THREE.MathUtils.radToDeg(model.rotation.y) } }];
    });
    if (poses.length) this.onPosesCommit(poses);
  }
  private moveGroup(start: Map<string, { position: THREE.Vector3; yaw: number }>, position: THREE.Vector3, yaw: number) {
    const anchor = start.get(this.selectedId!)!;
    const angle = yaw - anchor.yaw;
    for (const [id, pose] of start) {
      const model = this.models.get(id)!;
      model.position.copy(pose.position).sub(anchor.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(position);
      model.rotation.y = pose.yaw + angle;
    }
    this.lastDragBlocked = !this.groupIsValid();
    this.snapStatus = this.lastDragBlocked ? '그룹이 다른 물건과 겹쳐요' : '그룹 이동';
    this.snapTone = this.lastDragBlocked ? 'blocked' : 'neutral';
    this.updateSelectionGuides(this.meshBounds(this.models.get(this.selectedId!)!), this.lastDragBlocked ? 'blocked' : 'moving');
    this.reportMoveState(true);
  }
  selectObject(id: string | null) {
    if (id !== this.selectedId) this.placementMessage = '';
    this.selectedId = id;
    const model = id ? this.models.get(id) : undefined;
    this.selectedName = model?.name ?? null;
    this.showObjectDimensions(model ?? this.models.get(this.defaultDimensionId ?? ''));
    if (model) {
      const bounds = this.meshBounds(model);
      this.pivotHeight = bounds.getSize(new THREE.Vector3()).y / 2;
      this.pivot.position.copy(model.position);
      this.pivot.position.y += this.pivotHeight;
      this.pivot.rotation.y = model.rotation.y;
      this.transform.minY = this.pivotHeight;
      this.transform.maxY = this.pivotHeight + 10000 * s;
      this.transform.attach(this.pivot);
      this.updateSelectionGuides(bounds, 'idle');
    } else {
      this.transform.detach();
      this.updateSelectionGuides(null);
    }
    this.clearAlignmentGuides();
    this.lastReportedKey = '';
    this.reportMoveState(true);
  }
  private reportMoveState(force = false) {
    const model = this.selectedId ? this.models.get(this.selectedId) : undefined;
    const dragging = this.dragPointer !== null && this.dragActivated;
    const heightMm = model ? model.position.y / s : undefined;
    const yawDeg = model ? THREE.MathUtils.radToDeg(model.rotation.y) : undefined;
    const payload: MoveState = {
      moved: this.models.size > 0,
      dragging,
      selected: this.selectedName,
      id: this.selectedId ?? undefined,
      heightMm,
      restingOnObject: !!model && isRestingOnSupport(this.meshBounds(model), this.otherTargetBounds(this.selectedId!), 0.01 * s),
      placementMessage: this.placementMessage,
      yawDeg,
      snapStatus: dragging ? this.snapStatus : '',
      snapTone: dragging ? this.snapTone : 'neutral',
      dragMode: dragging ? this.dragMode : null,
    };
    const key = `${payload.moved}|${payload.dragging}|${payload.id ?? ''}|${payload.selected ?? ''}|${heightMm !== undefined ? heightMm.toFixed(1) : ''}|${yawDeg !== undefined ? yawDeg.toFixed(1) : ''}|${payload.placementMessage ?? ''}|${payload.snapStatus ?? ''}|${payload.snapTone ?? ''}|${payload.dragMode ?? ''}`;
    if (!force && dragging && key === this.lastReportedKey) return;
    this.lastReportedKey = key;
    this.onMoveStateChange(payload);
  }
  // Three.js takes normalized device coordinates here, despite its PointerEvent type.
  private transformPointer(button: number) {
    return { x: this.pointer.x, y: this.pointer.y, button } as PointerEvent;
  }
  private beginDrag(kind: 'gizmo' | 'body-translate' | 'body-rotate', event: PointerEvent, model: THREE.Group, activated: boolean) {
    this.placementMessage = '';
    this.snapStatus = '';
    this.snapTone = 'neutral';
    this.lastDragBlocked = false;
    this.lastReportedKey = '';
    this.groupStart = this.groupMode && this.groupIds.length > 1 && this.groupIds.includes(this.selectedId ?? '') ? this.captureGroup() : null;
    this.dragStart = { position: model.position.clone(), yaw: model.rotation.y, clientX: event.clientX, clientY: event.clientY };
    this.dragStartedOnSupport = this.selectedId
      ? isRestingOnSupport(this.meshBounds(model), this.otherTargetBounds(this.selectedId), 2 * s)
      : false;
    this.dragPointer = event.pointerId;
    this.dragKind = kind;
    this.dragActivated = activated;
    this.pendingSnapId = this.selectedId;
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    if (activated) {
      this.renderer.domElement.style.cursor = 'grabbing';
      this.updateSelectionGuides(this.meshBounds(model), 'moving');
      this.reportMoveState(true);
    }
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
        const model = this.models.get(this.selectedId!)!;
        const mode = this.transform.mode;
        const axis = this.transform.axis;
        if (mode === 'rotate') this.dragMode = 'rotate';
        else if (axis === 'Y') this.dragMode = 'axis-y';
        else if (axis === 'X') this.dragMode = 'axis-x';
        else if (axis === 'Z') this.dragMode = 'axis-z';
        else this.dragMode = 'floor';
        this.dragSideAxis = null;
        this.beginDrag('gizmo', event, model, true);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    const hit = this.hitObject(event.pointerType === 'touch');
    if (hit && (hit.id === this.selectedId || this.groupMode && this.groupIds.includes(hit.id))) {
      if (hit.id !== this.selectedId) this.selectObject(hit.id);
      const model = this.models.get(hit.id);
      if (model) {
        if (this.transform.mode === 'translate') {
          const viewDir = new THREE.Vector3();
          this.camera.getWorldDirection(viewDir);
          if (Math.abs(viewDir.y) >= 0.18) {
            this.dragPlane.set(new THREE.Vector3(0, 1, 0), -hit.point.y);
            this.dragSideAxis = null;
            this.dragMode = 'floor';
          } else {
            this.dragPlane.setFromNormalAndCoplanarPoint(viewDir.clone().negate(), hit.point);
            this.dragSideAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewDir).normalize();
            this.dragMode = Math.abs(this.dragSideAxis.x) >= Math.abs(this.dragSideAxis.z) ? 'axis-x' : 'axis-z';
          }
          this.raycaster.setFromCamera(this.pointer, this.camera);
          if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneStart)) {
            this.dragPlaneStart.copy(hit.point);
          }
          this.beginDrag('body-translate', event, model, false);
        } else {
          this.dragSideAxis = null;
          this.dragMode = 'rotate';
          this.beginDrag('body-rotate', event, model, false);
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    this.cameraPointers.add(event.pointerId);
    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, target: hit?.id ?? null };
  };
  private onPointerMove = (event: PointerEvent) => {
    if (this.blockedTouches.has(event.pointerId)) {
      event.stopImmediatePropagation();
      return;
    }
    if (this.dragPointer !== null) {
      if (event.pointerId === this.dragPointer) {
        this.updatePointer(event);
        if (this.dragKind === 'gizmo') {
          this.transform.pointerMove(this.transformPointer(-1));
        } else if (this.dragKind === 'body-translate' || this.dragKind === 'body-rotate') {
          const id = this.selectedId;
          const model = id ? this.models.get(id) : undefined;
          if (id && model && this.dragStart) {
            if (!this.dragActivated) {
              if (Math.hypot(event.clientX - this.dragStart.clientX, event.clientY - this.dragStart.clientY) < 4) {
                event.stopImmediatePropagation();
                return;
              }
              this.dragActivated = true;
              this.renderer.domElement.style.cursor = 'grabbing';
            }
            if (this.dragKind === 'body-translate') {
              this.raycaster.setFromCamera(this.pointer, this.camera);
              const planeHit = new THREE.Vector3();
              if (this.raycaster.ray.intersectPlane(this.dragPlane, planeHit)) {
                const delta = planeHit.sub(this.dragPlaneStart);
                if (this.dragSideAxis) {
                  const proj = delta.dot(this.dragSideAxis);
                  delta.copy(this.dragSideAxis).multiplyScalar(proj);
                } else {
                  delta.y = 0;
                }
                const rawPosition = this.dragStart.position.clone().add(delta);
                const alignAxes: ('x' | 'z')[] = this.dragSideAxis
                  ? (Math.abs(this.dragSideAxis.x) >= Math.abs(this.dragSideAxis.z) ? ['x'] : ['z'])
                  : ['x', 'z'];
                this.applyLiveDrag(id, model, rawPosition, this.dragStart.yaw, 'horizontal', alignAxes);
                this.pivot.position.set(model.position.x, model.position.y + this.pivotHeight, model.position.z);
              }
            } else {
              const rawYaw = this.dragStart.yaw + (event.clientX - this.dragStart.clientX) * 0.012;
              this.applyLiveRotation(id, model, rawYaw);
              this.pivot.position.set(model.position.x, model.position.y + this.pivotHeight, model.position.z);
              this.pivot.rotation.y = model.rotation.y;
            }
          }
        }
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
      if (this.transform.axis) {
        this.renderer.domElement.style.cursor = 'grab';
      } else {
        const hit = this.hitObject();
        if (hit && hit.id === this.selectedId) {
          this.renderer.domElement.style.cursor = this.transform.mode === 'rotate' ? 'ew-resize' : 'move';
        } else {
          this.renderer.domElement.style.cursor = hit ? 'pointer' : '';
        }
      }
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
      this.chooseObject(start.target);
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
    if (!id || !model || this.dragKind !== 'gizmo') return;
    this.pendingSnapId = id;
    if (this.transform.mode === 'rotate') {
      this.applyLiveRotation(id, model, this.pivot.rotation.y);
      return;
    }
    const height = Math.max(0, this.pivot.position.y - this.pivotHeight);
    const rawPosition = new THREE.Vector3(this.pivot.position.x, height, this.pivot.position.z);
    const axis = this.transform.axis;
    if (axis === 'Y') {
      this.applyLiveDrag(id, model, rawPosition, model.rotation.y, 'vertical', []);
    } else if (axis === 'X') {
      this.applyLiveDrag(id, model, rawPosition, model.rotation.y, 'horizontal', ['x']);
    } else if (axis === 'Z') {
      this.applyLiveDrag(id, model, rawPosition, model.rotation.y, 'horizontal', ['z']);
    } else {
      this.applyLiveDrag(id, model, rawPosition, model.rotation.y, 'horizontal', ['x', 'z']);
    }
  };
  private finishDrag = (commit = false, retainCapture = false) => {
    if (this.dragPointer === null) return;
    const pointerId = this.dragPointer;
    const wasKind = this.dragKind;
    const wasActivated = this.dragActivated;
    const wasBlocked = this.lastDragBlocked;
    const start = this.dragStart;
    this.dragPointer = null;
    this.dragKind = null;
    this.dragActivated = false;
    this.dragMode = null;
    this.dragSideAxis = null;
    this.dragStartedOnSupport = false;
    this.lastDragBlocked = false;
    this.snapStatus = '';
    this.snapTone = 'neutral';
    this.lastReportedKey = '';
    this.transform.pointerUp(null);
    const canvas = this.renderer.domElement;
    if (!retainCapture && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    this.controls.enabled = true;
    canvas.style.cursor = '';
    this.contactFace.visible = false;
    this.clearAlignmentGuides();

    const id = this.pendingSnapId;
    const model = id ? this.models.get(id) : undefined;
    if (this.groupStart && id && model) {
      const groupStart = this.groupStart;
      this.groupStart = null;
      if (!commit || !wasActivated || wasBlocked || !this.groupIsValid()) {
        this.restoreGroup(groupStart);
        if (commit && wasActivated) this.placementMessage = '그룹을 놓을 공간이 없어 이전 배치로 돌아갔어요.';
      } else this.commitGroup(groupStart);
      this.pendingSnapId = null;
      this.dragStart = null;
      if (commit && !wasActivated) this.chooseObject(id);
      else this.selectObject(id);
      this.measureBounds();
      this.rebuildGrid();
      return;
    }
    if (id && model && ((!commit || (!wasActivated && wasKind !== 'gizmo')) && start)) {
      model.position.copy(start.position);
      model.rotation.y = start.yaw;
      this.pendingSnapId = null;
      if (this.groupMode && commit && !wasActivated) this.chooseObject(id);
      else this.selectObject(id);
    } else if (id && model && commit) {
      if (this.transform.mode === 'rotate' && !this.snapEnabled) {
        const quarterTurn = Math.PI / 2;
        const nearest = Math.round(model.rotation.y / quarterTurn) * quarterTurn;
        if (Math.abs(model.rotation.y - nearest) < THREE.MathUtils.degToRad(8)) model.rotation.y = nearest;
      }
      const targets = this.otherTargetBounds(id);
      const finalResult = resolvePlacement(this.meshBounds(model), targets, 0);
      if (wasBlocked || finalResult.kind === 'blocked') {
        if (start) {
          model.position.copy(start.position);
          model.rotation.y = start.yaw;
        }
        this.placementMessage = '겹침을 풀 공간이 없어 이전 배치로 돌아갔어요.';
      } else {
        if (finalResult.kind === 'contact') model.position.add(finalResult.offset);
        const changed = !start
          || model.position.distanceToSquared(start.position) > 1e-12
          || Math.abs(model.rotation.y - start.yaw) > 1e-5;
        if (changed) this.commitPose(id, model);
      }
      this.selectObject(id);
    } else {
      this.reportMoveState(true);
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
    this.placementMessage = '';
    if (this.groupMode && this.groupIds.length > 1 && this.groupIds.includes(this.selectedId ?? '')) {
      const start = this.captureGroup();
      this.moveGroup(start, new THREE.Vector3(model.position.x, heightMm * s, model.position.z), THREE.MathUtils.degToRad(yawDeg));
      if (this.groupIsValid()) this.commitGroup(start);
      else { this.restoreGroup(start); this.placementMessage = '그룹을 놓을 공간이 없어요.'; }
      this.selectObject(id);
      this.measureBounds(); this.rebuildGrid();
      return;
    }
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
  groundSelected() {
    this.finishDrag();
    const id = this.selectedId;
    const model = id ? this.models.get(id) : undefined;
    if (!id || !model) return;
    const previous = { position: model.position.clone(), yaw: model.rotation.y };
    this.placementMessage = '';
    if (this.groupMode && this.groupIds.length > 1 && this.groupIds.includes(this.selectedId ?? '')) {
      const start = this.captureGroup();
      const targets = [...this.models].filter(([other]) => !this.groupIds.includes(other)).map(([, other]) => this.meshBounds(other));
      let delta = -Infinity;
      for (const memberId of this.groupIds) {
        const bounds = this.meshBounds(this.models.get(memberId)!);
        delta = Math.max(delta, findSupportTopY(bounds, targets, bounds.min.y) - bounds.min.y);
      }
      for (const memberId of this.groupIds) this.models.get(memberId)!.position.y += delta;
      if (this.groupIsValid()) this.commitGroup(start);
      else { this.restoreGroup(start); this.placementMessage = '그룹을 내려놓을 공간이 없어요.'; }
      this.selectObject(id); this.measureBounds(); this.rebuildGrid();
      return;
    }
    const bounds = this.meshBounds(model);
    model.position.y += findSupportTopY(bounds, this.otherTargetBounds(id), bounds.min.y) - bounds.min.y;
    if (!this.otherTargetBounds(id).some(target => overlaps(this.meshBounds(model), target))) {
      if (model.position.distanceToSquared(previous.position) > 1e-12) {
        this.commitPose(id, model);
      }
    } else {
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

  private otherTargetBounds(excludeId: string) {
    return [...this.models]
      .filter(([otherId]) => otherId !== excludeId)
      .map(([, other]) => this.meshBounds(other))
      .filter(box => !box.isEmpty());
  }
  private dynamicSnapDistance() {
    const visibleHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
    const pxHeight = Math.max(1, this.renderer.domElement.clientHeight);
    return THREE.MathUtils.clamp((visibleHeight / pxHeight) * 14, 20 * s, 80 * s);
  }
  private placement(id: string, model: THREE.Group) {
    const bounds = this.meshBounds(model);
    const targets = this.otherTargetBounds(id);
    return { bounds, result: resolvePlacement(bounds, targets, this.snapEnabled ? 20 * s : 0) };
  }
  private showContactFace(placedBounds: THREE.Box3, result: Extract<Placement, { kind: 'contact' }>) {
    const { axis, side, target } = result;
    const patch = placedBounds.clone().intersect(target.clone().expandByScalar(1e-6));
    if (patch.isEmpty()) {
      this.contactFace.visible = false;
      return;
    }
    const center = patch.getCenter(new THREE.Vector3());
    const size = patch.getSize(new THREE.Vector3());
    const normal = new THREE.Vector3();
    normal[axis] = side === 'min' ? -1 : 1;
    this.contactFace.position.copy(center);
    this.contactFace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const width = axis === 'x' ? size.z : size.x;
    const height = axis === 'y' ? size.z : size.y;
    this.contactFace.scale.set(width, height, 1);
    this.contactFace.visible = true;
  }
  private applyLiveDrag(
    id: string,
    model: THREE.Group,
    rawPosition: THREE.Vector3,
    rawYaw: number,
    dragAxis: 'horizontal' | 'vertical',
    allowedAlignAxes: readonly ('x' | 'z')[],
  ) {
    if (this.groupStart) { this.moveGroup(this.groupStart, rawPosition, rawYaw); return; }
    model.position.copy(rawPosition);
    model.rotation.y = rawYaw;
    const targets = this.otherTargetBounds(id);
    const snapDist = this.snapEnabled ? this.dynamicSnapDistance() : 0;

    if (dragAxis === 'horizontal' && this.snapEnabled && this.dragStartedOnSupport) {
      model.position.y = findSupportTopY(this.meshBounds(model), targets, rawPosition.y + snapDist);
    }

    let bounds = this.meshBounds(model);
    const result = resolvePlacement(bounds, targets, snapDist);
    if (result.kind === 'blocked') {
      this.lastDragBlocked = true;
      this.contactFace.visible = false;
      this.clearAlignmentGuides();
      this.snapStatus = '겹치는 위치예요 — 빈 공간으로 옮기세요';
      this.snapTone = 'blocked';
      this.updateSelectionGuides(bounds, 'blocked');
      this.reportMoveState();
      return;
    }

    this.lastDragBlocked = false;
    if (result.kind === 'contact') {
      model.position.add(result.offset);
      bounds = this.meshBounds(model);
    }

    let snappedToFloor = false;
    if (dragAxis === 'vertical' && this.snapEnabled && result.kind === 'free') {
      const floorDelta = resolveFloorSnap(bounds, targets, snapDist);
      if (floorDelta !== null) {
        model.position.y = 0;
        bounds = this.meshBounds(model);
        snappedToFloor = true;
      }
    }

    let alignGuides: AlignmentGuide[] = [];
    if (dragAxis === 'horizontal' && this.snapEnabled && allowedAlignAxes.length > 0) {
      const lockedAxis = result.kind === 'contact' && (result.axis === 'x' || result.axis === 'z') ? result.axis : null;
      const axes = allowedAlignAxes.filter(a => a !== lockedAxis);
      if (axes.length > 0) {
        const align = resolveHorizontalAlignment(bounds, targets, Math.min(snapDist * 0.65, 35 * s), axes);
        if (align.guides.length > 0) {
          model.position.add(align.offset);
          bounds = this.meshBounds(model);
          alignGuides = align.guides;
        }
      }
    }
    this.showAlignmentGuides(alignGuides);

    if (result.kind === 'contact') {
      this.showContactFace(bounds, result);
      this.snapStatus = result.axis === 'y' ? '물건 위에 맞닿음' : '옆면에 맞닿음';
      this.snapTone = 'snapped';
    } else {
      this.contactFace.visible = false;
      if (snappedToFloor) {
        this.snapStatus = '바닥에 놓임';
        this.snapTone = 'snapped';
      } else if (alignGuides.length > 0) {
        this.snapStatus = '모서리 정렬됨';
        this.snapTone = 'snapped';
      } else {
        this.snapStatus = '';
        this.snapTone = 'neutral';
      }
    }

    this.updateSelectionGuides(bounds, this.snapTone === 'snapped' ? 'snapped' : 'moving');
    this.reportMoveState();
  }
  private applyLiveRotation(id: string, model: THREE.Group, rawYaw: number) {
    const yaw = this.snapEnabled
      ? THREE.MathUtils.degToRad(Math.round(THREE.MathUtils.radToDeg(rawYaw) / 15) * 15)
      : rawYaw;
    if (this.groupStart) { this.moveGroup(this.groupStart, this.groupStart.get(id)!.position, yaw); return; }
    if (this.dragStart) model.position.copy(this.dragStart.position);
    model.rotation.y = yaw;
    const targets = this.otherTargetBounds(id);
    const result = resolvePlacement(this.meshBounds(model), targets, 0);
    this.clearAlignmentGuides();
    if (result.kind === 'blocked') {
      this.lastDragBlocked = true;
      this.contactFace.visible = false;
      this.snapStatus = '회전할 공간이 부족해요 — 겹치지 않게 옮기세요';
      this.snapTone = 'blocked';
      this.updateSelectionGuides(this.meshBounds(model), 'blocked');
      this.reportMoveState();
      return;
    }
    this.lastDragBlocked = false;
    if (result.kind === 'contact') {
      model.position.add(result.offset);
      const bounds = this.meshBounds(model);
      this.showContactFace(bounds, result);
      this.snapStatus = '주변 물건에 맞게 비켜남';
      this.snapTone = 'snapped';
      this.updateSelectionGuides(bounds, 'snapped');
    } else {
      this.contactFace.visible = false;
      const bounds = this.meshBounds(model);
      this.snapStatus = this.snapEnabled ? '15° 단위 회전' : '';
      this.snapTone = this.snapEnabled ? 'snapped' : 'neutral';
      this.updateSelectionGuides(bounds, this.snapTone === 'snapped' ? 'snapped' : 'moving');
    }
    this.reportMoveState();
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
  clearSelection() { this.finishDrag(); this.chooseObject(null); }
  update(instances: SceneInstance[], unit: Unit, showDimensions: boolean, showGrid: boolean, colorIndices?: ReadonlyMap<string, number>) {
    this.finishDrag();
    this.dimensionGroup.removeFromParent();
    this.pickableMeshes = [];
    this.pointerStart = null;
    const previous = this.models;
    this.models = new Map();
    for (const { id, snapshot, shape, positionMm, yawDeg } of instances) {
      const preset = PRESETS.find(item => item.id === shape);
      const colorIndex = preset ? undefined : (colorIndices?.get(id) ?? 0);
      const accent = preset ? undefined : getModelAccent(colorIndex);
      let model = previous.get(id);
      if (model && model.userData.dimensions === snapshot && model.userData.shape === shape && model.userData.colorIndex === colorIndex) {
        previous.delete(id);
      } else {
        model = createModel(snapshot, preset, accent);
        model.name = snapshot.name;
        model.userData.dimensions = snapshot;
        model.userData.shape = shape;
        model.userData.colorIndex = colorIndex;
        const labelPosition = new THREE.Vector3(0, snapshot.height * s + .34, 0);
        model.add(label(snapshot.name, preset ? 'object-label' : 'object-label product-label', labelPosition, accent?.badge));
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

  setTheme(theme: ThemeMode) {
    this.theme = theme;
    const isLight = theme === 'light';
    const shadowMat = this.floor.material as THREE.ShadowMaterial;
    shadowMat.color.set(isLight ? '#4c4f69' : '#11111b');
    shadowMat.opacity = isLight ? 0.22 : 0.45;
    this.hemiLight.color.set(isLight ? '#eff1f5' : '#f2f6fc');
    this.hemiLight.groundColor.set(isLight ? '#9ca0b0' : '#495870');
    this.hemiLight.intensity = isLight ? 1.15 : 0.95;
    this.keyLight.color.set(isLight ? '#f5f2eb' : '#fffaf2');
    this.keyLight.intensity = isLight ? 1.75 : 1.9;
    this.rimLight.color.set(isLight ? '#bcc0cc' : '#c8dcff');
    this.rimLight.intensity = isLight ? 0.45 : 0.55;
    if (isLight) {
      this.transform.setColors('#d20f39', '#40a02b', '#1e66f5', '#df8e1d');
    } else {
      this.transform.setColors('#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af');
    }
    (this.contactFace.material as THREE.MeshBasicMaterial).color.set(isLight ? '#40a02b' : '#a6e3a1');
    (this.alignmentLines.material as THREE.LineBasicMaterial).color.set(isLight ? '#04a5e5' : '#89dceb');
    this.rebuildGrid();
    const selected = this.selectedId ? this.models.get(this.selectedId) : undefined;
    this.showObjectDimensions(selected ?? this.models.get(this.defaultDimensionId ?? ''));
    if (selected) {
      const tone = this.dragPointer !== null && this.dragActivated
        ? (this.snapTone === 'blocked' ? 'blocked' : this.snapTone === 'snapped' ? 'snapped' : 'moving')
        : 'idle';
      this.updateSelectionGuides(this.meshBounds(selected), tone);
    }
  }
  private showObjectDimensions(model: THREE.Group | undefined) {
    this.dimensionGroup.removeFromParent();
    disposeGroup(this.dimensionGroup);
    if (!model || !this.showDimensions) return;
    const snapshot = model.userData.dimensions as Dimensions;
    const w = snapshot.width * s, d = snapshot.depth * s, h = snapshot.height * s;
    const offset = Math.max(.25, Math.max(w, d, h) * .09);
    const unit = this.dimensionUnit;
    const dimColor = this.theme === 'light' ? '#1e66f5' : '#89b4fa';
    dimension(this.dimensionGroup, new THREE.Vector3(-w / 2, .025, d / 2 + offset), new THREE.Vector3(w / 2, .025, d / 2 + offset), `W ${displayValue(snapshot.width, unit)} ${unit}`, 'w', dimColor);
    dimension(this.dimensionGroup, new THREE.Vector3(w / 2 + offset, .025, -d / 2), new THREE.Vector3(w / 2 + offset, .025, d / 2), `D ${displayValue(snapshot.depth, unit)} ${unit}`, 'd', dimColor);
    dimension(this.dimensionGroup, new THREE.Vector3(-w / 2 - offset, 0, d / 2 + offset), new THREE.Vector3(-w / 2 - offset, h, d / 2 + offset), `H ${displayValue(snapshot.height, unit)} ${unit}`, 'h', dimColor);
    model.add(this.dimensionGroup);
  }
  private measureBounds() {
    const bounds = new THREE.Box3().setFromObject(this.content);
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    this.bounds.copy(bounds).expandByScalar(.3);
    this.radius = Math.max(size.length() / 2, .8);
    const halfExtent = Math.min(60, Math.max(4, size.length() * .85));
    const lightScale = Math.max(1, halfExtent / 12);
    this.keyLight.position.set(center.x - 10 * lightScale, center.y + 18 * lightScale, center.z + 12 * lightScale);
    this.keyLight.target.position.copy(center);
    this.keyLight.target.updateMatrixWorld();
    this.keyLight.shadow.camera.left = -halfExtent;
    this.keyLight.shadow.camera.right = halfExtent;
    this.keyLight.shadow.camera.top = halfExtent;
    this.keyLight.shadow.camera.bottom = -halfExtent;
    this.keyLight.shadow.camera.near = .5;
    this.keyLight.shadow.camera.far = Math.max(80, lightScale * 60);
    this.keyLight.shadow.camera.updateProjectionMatrix();
  }
  private rebuildGrid() {
    disposeGroup(this.grid);
    const extent = Math.max(Math.abs(this.bounds.min.x), Math.abs(this.bounds.max.x), Math.abs(this.bounds.min.z), Math.abs(this.bounds.max.z));
    const gridSize = Math.min(2000, Math.max(20, Math.ceil((extent * 2 + 10) / 10) * 10));
    // Grid always has 100 mm cells, independent of object dimensions.
    const [majorColor, minorColor] = this.theme === 'light' ? ['#9ca0b0', '#bcc0cc'] : ['#45475a', '#313244'];
    const grid = new THREE.GridHelper(gridSize, gridSize, majorColor, minorColor);
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
