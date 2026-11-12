import { Box3, Vector3 } from 'three';
import { resolvePlacement } from './placement.ts';
import { PRESETS, WORLD_SCALE, sceneLayout } from './domain.ts';
import type { ActiveProduct, Preset, Product } from './domain.ts';

export type Position = { x: number; y: number; z: number };
export type Pose = { positionMm: Position; yawDeg: number };
export type SceneInstance = Pose & {
  id: string;
  assetId: string | null;
  snapshot: Product;
  shape?: Preset['id'];
};

export const restingPose = (x = 0): Pose => ({ positionMm: { x, y: 0, z: 0 }, yawDeg: 0 });

function copyProduct({ name, width, depth, height, deskShape }: Product): Product {
  return { name, width, depth, height, ...(deskShape ? { deskShape: { ...deskShape } } : {}) };
}

export function initialInstances(product: ActiveProduct | null, presets: Preset[]): SceneInstance[] {
  return sceneLayout(product, presets).map(({ object, x }, index) => {
    const preset = presets[index - (product ? 1 : 0)];
    return {
      id: preset ? `initial-${preset.id}` : 'initial-product',
      assetId: preset?.id ?? product?.id ?? null,
      snapshot: copyProduct(object),
      shape: preset && PRESETS.some(item => item.id === preset.id) ? preset.id : undefined,
      ...restingPose(x / WORLD_SCALE),
    };
  });
}

function instanceBounds(item: SceneInstance) {
  const { positionMm: { x, y, z }, snapshot, yawDeg } = item;
  const angle = yawDeg * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * snapshot.width + Math.abs(Math.sin(angle)) * snapshot.depth;
  const depth = Math.abs(Math.sin(angle)) * snapshot.width + Math.abs(Math.cos(angle)) * snapshot.depth;
  return new Box3(
    new Vector3(x - width / 2, y, z - depth / 2),
    new Vector3(x + width / 2, y + snapshot.height, z + depth / 2),
  );
}

export function placeInstance(candidate: SceneInstance, others: SceneInstance[]): SceneInstance | null {
  const result = resolvePlacement(instanceBounds(candidate), others.filter(item => item.id !== candidate.id).map(instanceBounds), 0);
  if (result.kind === 'blocked') return null;
  if (result.kind === 'free') return candidate;
  if (result.kind === 'contact') {
    const { positionMm: { x, y, z } } = candidate;
    return { ...candidate, positionMm: { x: x + result.offset.x, y: y + result.offset.y, z: z + result.offset.z } };
  }
  return null;
}

export function addInstance(instances: SceneInstance[], snapshot: Product, assetId: string | null, shape?: Preset['id']) {
  // Start beyond the rightmost object's rotated footprint.
  const right = instances.reduce((edge, item) => Math.max(edge, instanceBounds(item).max.x), -Infinity);
  const x = instances.length ? right + 50 + snapshot.width / 2 : 0;
  return [...instances, { id: crypto.randomUUID(), assetId, snapshot: copyProduct(snapshot), shape, ...restingPose(x) }];
}

export function resetLayout(instances: SceneInstance[]): SceneInstance[] {
  const layout = sceneLayout(null, instances.map(item => ({ ...item.snapshot, id: 'a4', color: '', detail: '' })));
  return instances.map((item, index) => ({ ...item, ...restingPose(layout[index].x / WORLD_SCALE) }));
}

export type SceneHistory = {
  past: SceneInstance[][];
  present: SceneInstance[];
  future: SceneInstance[][];
};

export function changeScene(history: SceneHistory, change: (items: SceneInstance[]) => SceneInstance[]): SceneHistory {
  const present = change(history.present);
  if (present === history.present) return history;
  return { past: [...history.past.slice(-49), history.present], present, future: [] };
}

export function stepScene(history: SceneHistory, direction: 'undo' | 'redo'): SceneHistory {
  if (direction === 'undo') {
    const present = history.past.at(-1);
    return present ? { past: history.past.slice(0, -1), present, future: [history.present, ...history.future] } : history;
  }
  const [present, ...future] = history.future;
  return present ? { past: [...history.past, history.present], present, future } : history;
}

export function updateSceneMetadata(history: SceneHistory, update: (item: SceneInstance) => SceneInstance): SceneHistory {
  return { past: history.past.map(items => items.map(update)), present: history.present.map(update), future: history.future.map(items => items.map(update)) };
}
