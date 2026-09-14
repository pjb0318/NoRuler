import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { WORLD_SCALE, sceneLayout, displayValue } from './domain.ts';
import type { Dimensions, Preset, Product, Unit } from './domain.ts';

export type View = 'perspective' | 'front' | 'top';
export type MoveState = { moved: boolean; dragging: boolean };
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
  private content = new THREE.Group();
  private grid = new THREE.Group();
  private floor: THREE.Mesh;
  private resize: ResizeObserver;
  private frame = 0;
  private radius = 5;
  private bounds = new THREE.Box3();
  private layoutKey = '';
  private target = new THREE.Vector3();
  private view: View = 'perspective';
  private onContextLost: (event: Event) => void;
  private productModel: THREE.Group | null = null;
  private productPosition: THREE.Vector3 | null = null;
  private productHomeX = 0;
  private pickableMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPlane = new THREE.Plane();
  private dragStart = new THREE.Vector3();
  private dragOrigin = new THREE.Vector3();
  private dragPointer: number | null = null;
  private lastDragPointerEvent: PointerEvent | null = null;
  private handingOffTouch = false;
  private onMoveStateChange: (state: MoveState) => void;

  private host: HTMLDivElement;
  constructor(host: HTMLDivElement, onError: () => void, onMoveStateChange: (state: MoveState) => void = () => {}) {
    this.host = host;
    this.onMoveStateChange = onMoveStateChange;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#f4f6f9', 0);
    this.renderer.domElement.setAttribute('aria-label', '제품과 선택한 물건의 실제 비율 3D 비교');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('tabindex', '0');
    this.onContextLost = event => { event.preventDefault(); this.finishDrag(); onError(); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.labels.domElement.className = 'scene-labels';
    host.append(this.renderer.domElement, this.labels.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - .015;
    this.controls.minZoom = .15;
    this.controls.maxZoom = 12;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    // Capture object gestures before OrbitControls receives them. Empty-space
    // gestures and right-click/modified drags continue to control the camera.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    canvas.addEventListener('pointermove', this.onPointerMove, true);
    canvas.addEventListener('pointerup', this.onPointerEnd, true);
    canvas.addEventListener('pointercancel', this.onPointerEnd, true);
    canvas.addEventListener('lostpointercapture', this.onPointerEnd, true);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('blur', this.finishDrag);
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
  private updateRay(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.camera.updateMatrixWorld();
    this.content.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
  private hitProduct() {
    // Test the nearest visible mesh, so a preset in front cannot be grabbed through.
    const hit = this.raycaster.intersectObjects(this.pickableMeshes, false)[0];
    return hit?.object.parent === this.productModel ? hit : null;
  }
  private reportMoveState() {
    this.onMoveStateChange({ moved: this.productPosition !== null, dragging: this.dragPointer !== null });
  }
  private onPointerDown = (event: PointerEvent) => {
    if (this.handingOffTouch) return;
    if (this.dragPointer !== null) {
      if (event.pointerType === 'touch' && event.pointerId !== this.dragPointer && this.lastDragPointerEvent?.pointerType === 'touch') {
        const first = this.lastDragPointerEvent;
        this.finishDrag();
        // A second finger changes an object drag into a normal camera gesture.
        // Seed OrbitControls with the still-active first pointer before letting
        // this second pointer reach its regular listener.
        this.handingOffTouch = true;
        try {
          this.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, pointerId: first.pointerId, pointerType: 'touch', isPrimary: true,
            clientX: first.clientX, clientY: first.clientY, button: 0, buttons: 1,
          }));
        } finally { this.handingOffTouch = false; }
        return;
      }
      event.stopImmediatePropagation(); event.preventDefault(); return;
    }
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || !this.productModel) return;
    this.updateRay(event);
    if (!this.hitProduct()) return;
    // Settle residual orbit damping before calculating the grab point.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    this.updateRay(event);
    const hit = this.hitProduct();
    if (!hit) return;
    const normal = Math.abs(this.raycaster.ray.direction.y) < .15
      ? this.camera.getWorldDirection(new THREE.Vector3())
      : new THREE.Vector3(0, 1, 0);
    // Near a front view, a camera-facing plane avoids an unstable near-parallel
    // floor intersection. Ignoring Y keeps the box grounded (left/right motion).
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, hit.point);
    this.dragStart.copy(hit.point);
    this.dragOrigin.copy(this.productModel.position);
    this.dragPointer = event.pointerId;
    this.lastDragPointerEvent = event;
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
    this.reportMoveState();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  private onPointerMove = (event: PointerEvent) => {
    if (this.dragPointer !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.pointerId !== this.dragPointer || !this.productModel) return;
      this.lastDragPointerEvent = event;
      this.updateRay(event);
      const point = this.raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3());
      if (!point) return;
      const position = point.sub(this.dragStart).add(this.dragOrigin);
      position.y = 0;
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z) || position.distanceTo(this.productModel.position) < .000001) return;
      const firstMove = this.productPosition === null;
      this.productPosition = position;
      this.productModel.position.copy(position);
      if (firstMove) this.reportMoveState();
    } else if (event.pointerType !== 'touch' && event.buttons === 0) {
      this.updateRay(event);
      this.renderer.domElement.style.cursor = this.hitProduct() ? 'grab' : '';
    }
  };
  private onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== this.dragPointer) return;
    event.stopImmediatePropagation();
    this.finishDrag();
  };
  private onPointerLeave = () => {
    if (this.dragPointer === null) this.renderer.domElement.style.cursor = '';
  };
  private finishDrag = () => {
    if (this.dragPointer === null) return;
    const pointerId = this.dragPointer;
    this.dragPointer = null;
    this.lastDragPointerEvent = null;
    const canvas = this.renderer.domElement;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    this.controls.enabled = true;
    canvas.style.cursor = '';
    this.measureBounds();
    this.rebuildGrid();
    this.reportMoveState();
  };
  resetProductPosition() {
    this.finishDrag();
    this.productPosition = null;
    this.productModel?.position.set(this.productHomeX, 0, 0);
    this.reportMoveState();
    this.fit();
  }
  update(product: Product, presets: Preset[], unit: Unit, showDimensions: boolean, showGrid: boolean) {
    this.finishDrag();
    disposeGroup(this.content);
    this.pickableMeshes = [];
    const layout = sceneLayout(product, presets);
    for (const [index, item] of layout.entries()) {
      const model = createModel(item.object, index ? presets[index - 1] : undefined);
      model.position.x = item.x;
      if (index === 0) {
        this.productHomeX = item.x;
        this.productModel = model;
        if (this.productPosition) model.position.copy(this.productPosition);
      }
      model.traverse(object => { if (object instanceof THREE.Mesh) this.pickableMeshes.push(object); });
      const h = item.object.height * s;
      model.add(label(item.object.name, index ? 'object-label' : 'object-label product-label', new THREE.Vector3(0, h + .34, 0)));
      this.content.add(model);
      if (index === 0 && showDimensions) {
        const w = product.width * s, d = product.depth * s;
        const offset = Math.max(.25, Math.max(w, d, h) * .09);
        dimension(model, new THREE.Vector3(-w / 2, .025, d / 2 + offset), new THREE.Vector3(w / 2, .025, d / 2 + offset), `W ${displayValue(product.width, unit)} ${unit}`, 'w');
        dimension(model, new THREE.Vector3(w / 2 + offset, .025, -d / 2), new THREE.Vector3(w / 2 + offset, .025, d / 2), `D ${displayValue(product.depth, unit)} ${unit}`, 'd');
        dimension(model, new THREE.Vector3(-w / 2 - offset, 0, d / 2), new THREE.Vector3(-w / 2 - offset, h, d / 2), `H ${displayValue(product.height, unit)} ${unit}`, 'h');
      }
    }
    this.measureBounds();
    this.rebuildGrid();
    this.grid.visible = showGrid;
    const key = JSON.stringify([product.width, product.depth, product.height, presets.map(p => p.id)]);
    if (key !== this.layoutKey) { this.layoutKey = key; this.fit(); }
  }
  private measureBounds() {
    if (!this.content.children.length) return;
    const bounds = new THREE.Box3().setFromObject(this.content);
    const size = bounds.getSize(new THREE.Vector3());
    this.bounds.copy(bounds).expandByScalar(.3);
    this.target.copy(bounds.getCenter(new THREE.Vector3()));
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
  private resizeViewport() {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height || this.bounds.isEmpty()) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    const aspect = width / height;
    // Fit the projected scene bounds, keeping the same camera scale for every object.
    this.camera.updateMatrixWorld();
    const projected = new THREE.Box3();
    for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) {
      projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
    }
    const visibleSize = projected.getSize(new THREE.Vector3());
    const halfHeight = Math.max(visibleSize.y, visibleSize.x / aspect, .8) * .67;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
  fit() {
    this.measureBounds();
    this.rebuildGrid();
    this.camera.zoom = 1;
    this.controls.target.copy(this.target);
    this.setView(this.view);
    this.resizeViewport();
  }
  setView(view: View) {
    this.finishDrag();
    this.measureBounds();
    this.view = view;
    this.controls.target.copy(this.target);
    const direction = view === 'front' ? new THREE.Vector3(0, .001, 1) : view === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(1, .85, 1.5);
    this.camera.position.copy(this.controls.target).add(direction.normalize().multiplyScalar(this.radius * 4 + 10));
    this.controls.update();
    this.resizeViewport();
  }
  zoom(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .15, 12);
    this.camera.updateProjectionMatrix();
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
    window.removeEventListener('blur', this.finishDrag);
    disposeGroup(this.scene);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
