import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDeskModel } from './deskModel';
import type { DeskShape } from './deskModel';
import type { Dimensions } from './domain';

type PreviewScene = {
  scene: THREE.Scene;
  show: (direction: 'front' | 'back') => void;
  fit: (extent: number, centerY: number) => void;
};

export default function DeskPreview({ dimensions, shape, complete, view, unseen, onFlip }: {
  dimensions: Dimensions;
  shape: DeskShape;
  complete: boolean;
  view?: string;
  unseen?: string;
  onFlip: () => void;
}) {
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
    renderer.setClearColor('#edf2f7');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '회전 가능한 책상 모델');
    element.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .001, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8391a2, 2.2));
    const light = new THREE.DirectionalLight(0xfff9ed, 2.2);
    light.position.set(-2, 5, 3);
    scene.add(light);

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
    preview.current = {
      scene, show,
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
  const { frontFlipped, clearanceRatio } = shape;
  useEffect(() => {
    const current = preview.current;
    if (!current) return;
    const model = createDeskModel({ width, depth, height }, { kind: 'desk-v1', frontFlipped, clearanceRatio });
    current.scene.add(model);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    current.fit(size.length() * 1.7, size.y / 2);
    return () => {
      model.removeFromParent();
      const materials = new Set<THREE.Material>();
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        materials.add(object.material);
      });
      materials.forEach(material => material.dispose());
    };
  }, [width, depth, height, frontFlipped, clearanceRatio]);

  return <section className="desk-preview" aria-label="책상 3D 초안">
    <strong>책상 3D 초안</strong>
    {!complete && <small>치수 미확정 · 미리보기 비율</small>}
    <div className="desk-preview-canvas" ref={host} hidden={unavailable} />
    {unavailable ? <p>이 브라우저에서 3D 미리보기를 열지 못했어요.</p> : <div className="desk-preview-actions">
      <button type="button" onClick={() => preview.current?.show('front')}>앞쪽 보기</button>
      <button type="button" onClick={() => preview.current?.show('back')}>뒤쪽 보기</button>
      <button type="button" aria-pressed={frontFlipped} onClick={onFlip}>앞뒤 바꾸기</button>
    </div>}
    {view && <small>사진 방향 · {view}</small>}
    {unseen && <small>사진에서 확인하기 어려운 부분 · {unseen}</small>}
    <small>상판 두께와 프레임 세부 치수는 추정값이에요.</small>
  </section>;
}
