import { PRESETS, isProduct, readSaved } from './domain.ts';
import type { SavedModel, Unit } from './domain.ts';
import { initialInstances } from './workspace.ts';
import type { Position, SceneInstance } from './workspace.ts';

export type CameraState = { positionMm: Position; targetMm: Position; zoom: number; halfHeight: number; aspect: number };
export type Preferences = { names: boolean; dimensions: boolean; grid: boolean; snap: boolean };
export type Workspace = {
  schemaVersion: 2;
  instances: SceneInstance[];
  library: SavedModel[];
  camera: CameraState | null;
  preferences: Preferences;
  unit: Unit;
};

const key = 'noruler-v2';
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

export function readWorkspace(): Workspace {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Workspace> | null;
    if (saved?.schemaVersion === 2 && Array.isArray(saved.instances) && Array.isArray(saved.library)) {
      const library = saved.library.filter(item => isProduct(item) && typeof item.id === 'string' &&
        item.id.startsWith('custom-') && (item.history === true || item.preset === true));
      const seen = new Set<string>();
      const instances = saved.instances.flatMap(item => {
        if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !isProduct(item.snapshot) ||
            !isPosition(item.positionMm) || item.positionMm.y < 0 || !Number.isFinite(item.yawDeg)) return [];
        seen.add(item.id);
        return [{
          ...item,
          assetId: item.assetId && (isShape(item.assetId) || library.some(model => model.id === item.assetId)) ? item.assetId : null,
          shape: item.shape && isShape(item.shape) ? item.shape : undefined,
        }];
      });
      return {
        schemaVersion: 2, instances, library, camera: validateCamera(saved.camera),
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
  const previous = readSaved();
  const presets = [...PRESETS, ...previous.library.filter(item => item.preset).map(item => ({ ...item, detail: '내 프리셋', color: '#89b2ff' }))];
  return {
    schemaVersion: 2, library: previous.library, unit: previous.unit, camera: null, preferences,
    instances: initialInstances(previous.product, presets.filter(item => previous.selected.includes(item.id))),
  };
}

export function writeWorkspace(workspace: Workspace) {
  localStorage.setItem(key, JSON.stringify(workspace));
}
