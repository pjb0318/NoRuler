import { PRESETS, isProduct, readSaved } from './domain.ts';
import { readDeskShape } from './deskModel.ts';
import type { Product, SavedModel, Unit } from './domain.ts';
import { initialInstances } from './workspace.ts';
import type { Position, SceneInstance } from './workspace.ts';

export type CameraState = { positionMm: Position; targetMm: Position; zoom: number; halfHeight: number; aspect: number };
export type Preferences = { names: boolean; dimensions: boolean; grid: boolean; snap: boolean };
export type Workspace = {
  schemaVersion: 3;
  instances: SceneInstance[];
  library: SavedModel[];
  camera: CameraState | null;
  preferences: Preferences;
  unit: Unit;
};

const key = 'noruler-v3';
const preferences: Preferences = { names: true, dimensions: true, grid: true, snap: true };
const isPosition = (p: Position | undefined) => p && [p.x, p.y, p.z].every(Number.isFinite);
const isShape = (shape: string) => PRESETS.some(preset => preset.id === shape);

function validateCamera(camera: CameraState | null | undefined): CameraState | null {
  if (!camera || !isPosition(camera.positionMm) || !isPosition(camera.targetMm)) return null;
  const { positionMm: p, targetMm: t } = camera;
  if (Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z) < 1) return null;
  return camera.zoom >= .15 && camera.zoom <= 12 && Number.isFinite(camera.halfHeight) && camera.halfHeight > 0 &&
    Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera : null;
}

function restoreProduct<T extends Product>(value: T, hasDeskShapes: boolean): T {
  const { deskShape, ...rest } = value;
  const shape = hasDeskShapes ? readDeskShape(deskShape) : undefined;
  return { ...rest, ...(shape ? { deskShape: shape } : {}) } as T;
}

function readVersion(storageKey: string, version: 2 | 3): Workspace | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as
      (Omit<Partial<Workspace>, 'schemaVersion'> & { schemaVersion?: number }) | null;
    if (saved?.schemaVersion === version && Array.isArray(saved.instances) && Array.isArray(saved.library)) {
      const library = saved.library.filter(item => isProduct(item) && typeof item.id === 'string' &&
        item.id.startsWith('custom-') && (item.history === true || item.preset === true)).map(item => restoreProduct(item, version === 3));
      const seen = new Set<string>();
      const instances = saved.instances.flatMap(item => {
        if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !isProduct(item.snapshot) ||
            !isPosition(item.positionMm) || item.positionMm.y < 0 || !Number.isFinite(item.yawDeg)) return [];
        seen.add(item.id);
        return [{
          ...item,
          snapshot: restoreProduct(item.snapshot, version === 3 && !isShape(item.shape ?? '')),
          assetId: item.assetId && (isShape(item.assetId) || library.some(model => model.id === item.assetId)) ? item.assetId : null,
          shape: item.shape && isShape(item.shape) ? item.shape : undefined,
        }];
      });
      return {
        schemaVersion: 3, instances, library, camera: validateCamera(saved.camera),
        preferences: {
          names: saved.preferences?.names !== false,
          dimensions: saved.preferences?.dimensions !== false,
          grid: saved.preferences?.grid !== false,
          snap: saved.preferences?.snap !== false,
        },
        unit: saved.unit === 'mm' ? 'mm' : 'cm',
      };
    }
  } catch { /* Fall back to the earlier workspace. */ }
  return null;
}

export function readWorkspace(): Workspace {
  const saved = readVersion(key, 3) ?? readVersion('noruler-v2', 2);
  if (saved) return saved;
  const previous = readSaved();
  const library = previous.library.map(item => restoreProduct(item, false));
  const product = previous.product && restoreProduct(previous.product, false);
  const presets = [...PRESETS, ...library.filter(item => item.preset).map(item => ({ ...item, detail: '내 프리셋', color: '#89b2ff' }))];
  return {
    schemaVersion: 3, library, unit: previous.unit, camera: null, preferences,
    instances: initialInstances(product, presets.filter(item => previous.selected.includes(item.id))),
  };
}

export function writeWorkspace(workspace: Workspace) {
  localStorage.setItem(key, JSON.stringify(workspace));
}
