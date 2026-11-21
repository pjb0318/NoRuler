import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDeskModel } from './deskModel';
import type { DeskShape } from './deskModel';
import type { Dimensions } from './domain';
import { getModelAccent } from './modelPalette';
import type { ModelAccent } from './modelPalette';
import { createParametricModel, parametricKindLabel } from './parametricModel';
import type { ParametricShape } from './parametricModel';
import type { ThemeMode } from './storage';

type PreviewScene = {
  scene: THREE.Scene;
  show: (direction: 'front' | 'back') => void;
  fit: (extent: number, centerY: number) => void;
  setTheme: (theme: ThemeMode) => void;
};

export default function DeskPreview({ dimensions, shape, complete, view, unseen, accent, theme = 'light', onFlip }: {
  dimensions: Dimensions;
  shape: DeskShape | ParametricShape;
  complete: boolean;
  view?: string;
  unseen?: string;
  accent?: ModelAccent;
  theme?: ThemeMode;
  onFlip: () => void;
}) {
  const isDesk = shape.kind === 'desk-v1';
  const title = isDesk ? '책상 3D 초안' : '3D 형태 초안';
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<PreviewScene | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor('#dce0e8');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '회전 가능한 3D 모델');
    element.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .001, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    const hemi = new THREE.HemisphereLight('#eff1f5', '#9ca0b0', 1.15);
    scene.add(hemi);
    const light = new THREE.DirectionalLight('#f5f2eb', 1.75);
    light.position.set(-3, 6, 4);
    scene.add(light);
    const rim = new THREE.DirectionalLight('#bcc0cc', 0.45);
    rim.position.set(4, 3, -4);
    scene.add(rim);

    let extent = 1;
    let initialized = false;
    const front = new THREE.Vector3(.45, .32, 1).normalize();
    const draw = () => renderer.render(scene, camera);
    const show: PreviewScene['show'] = direction => {
      camera.position.copy(front).multiplyScalar(extent * (direction === 'back' ? -1 : 1));
      camera.position.y = extent * front.y;
      camera.position.add(controls.target);
      controls.update();
      draw();
    };
    const setTheme: PreviewScene['setTheme'] = nextTheme => {
      const dark = nextTheme === 'dark';
      renderer.setClearColor(dark ? '#181825' : '#dce0e8');
      hemi.color.set(dark ? '#f2f6fc' : '#eff1f5');
      hemi.groundColor.set(dark ? '#495870' : '#9ca0b0');
      hemi.intensity = dark ? 0.95 : 1.15;
      light.color.set(dark ? '#fffaf2' : '#f5f2eb');
      light.intensity = dark ? 1.9 : 1.75;
      rim.color.set(dark ? '#c8dcff' : '#bcc0cc');
      rim.intensity = dark ? 0.55 : 0.45;
      draw();
    };
    preview.current = {
      scene, show, setTheme,
      fit(nextExtent, centerY) {
        const direction = camera.position.clone().sub(controls.target).normalize();
        extent = nextExtent;
        controls.target.set(0, centerY, 0);
        controls.minDistance = extent * .18;
        controls.maxDistance = extent * 4;
        if (!initialized) {
          initialized = true;
          show('front');
        } else {
          camera.position.copy(direction).multiplyScalar(extent).add(controls.target);
          controls.update();
          draw();
        }
      },
    };
    controls.addEventListener('change', draw);
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    return () => {
      preview.current = null;
      resize.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  const { width, depth, height } = dimensions;
  const resolvedAccent = accent ?? getModelAccent(0);
  useEffect(() => {
    const current = preview.current;
    if (!current) return;
    current.setTheme(theme);
    const model = shape.kind === 'desk-v1'
      ? createDeskModel({ width, depth, height }, shape, resolvedAccent)
      : createParametricModel({ width, depth, height }, shape, resolvedAccent);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const [majorColor, minorColor] = theme === 'dark' ? ['#45475a', '#313244'] : ['#9ca0b0', '#bcc0cc'];
    const grid = new THREE.GridHelper(Math.max(size.x, size.z, 0.5) * 1.8, 8, majorColor, minorColor);
    grid.position.y = -0.002;
    current.scene.add(grid, model);
    current.fit(size.length() * 1.7, size.y / 2);
    return () => {
      model.removeFromParent();
      grid.removeFromParent();
      const materials = new Set<THREE.Material>();
      const disposeObject = (root: THREE.Object3D) => {
        root.traverse(object => {
          if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
            object.geometry.dispose();
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              materials.add(material);
            }
          }
        });
      };
      disposeObject(model);
      disposeObject(grid);
      materials.forEach(material => material.dispose());
    };
  }, [width, depth, height, shape, resolvedAccent, theme]);

  return <section className="desk-preview" aria-label={title}>
    <div className="desk-preview-header">
      <strong>{title}</strong>
      <span className={complete ? 'draft-badge is-ready' : 'draft-badge is-pending'}>
        {complete ? '치수 확정됨' : '치수 미확정 · 미리보기 비율'}
      </span>
    </div>
    <div className="desk-preview-canvas" ref={host} hidden={unavailable} />
    {unavailable ? <p>이 브라우저에서 3D 미리보기를 열지 못했어요.</p> : <div className="desk-preview-actions">
      <button type="button" onClick={() => preview.current?.show('front')}>앞쪽 보기</button>
      <button type="button" onClick={() => preview.current?.show('back')}>뒤쪽 보기</button>
      <button type="button" aria-pressed={shape.frontFlipped} onClick={onFlip}>앞뒤 바꾸기</button>
    </div>}
    <div className="desk-preview-meta">
      {view && <small>사진 방향 · {view}</small>}
      {unseen && <small>사진에서 확인하기 어려운 부분 · {unseen}</small>}
      <small>{shape.kind === 'desk-v1'
        ? '상판 두께와 프레임 세부 치수는 추정값이에요.'
        : `${parametricKindLabel(shape)} 방식으로 만든 3D 초안이며 세부 형태는 추정값이에요.`}</small>
    </div>
  </section>;
}
