import type { DeskShape } from './deskModel.ts';

export type Unit = 'mm' | 'cm';
export type Dimensions = { width: number; depth: number; height: number };
export type Product = Dimensions & { name: string; deskShape?: DeskShape };
export type PresetId = 'a4' | 'bottle' | 'phone' | 'laptop' | 'keyboard' | 'monitor' | `custom-${string}`;
export type SavedModel = Product & { id: `custom-${string}`; history: boolean; preset: boolean };
export type ActiveProduct = Product & { id?: SavedModel["id"] };
export type Preset = Dimensions & { id: PresetId; name: string; detail: string; color: string };

// Canonical dimensions are millimetres. All geometry uses WORLD_SCALE uniformly.
export const WORLD_SCALE = 0.01; // 1 world unit = 100 mm
export const PRESETS: Preset[] = [
  { id: 'a4', name: 'A4 용지', detail: '평평하게 놓은 A4', width: 210, depth: 297, height: 0.1, color: '#a3aab6' },
  { id: 'bottle', name: '500mL 물병', detail: '일반적인 원형 물병', width: 65, depth: 65, height: 210, color: '#40a99a' },
  { id: 'phone', name: '스마트폰', detail: '세워 놓은 6.1형', width: 72, depth: 8, height: 147, color: '#64718e' },
  { id: 'laptop', name: '노트북', detail: '덮개를 닫은 13형', width: 304, depth: 215, height: 16, color: '#9a9ca6' },
  { id: 'keyboard', name: '키보드', detail: '텐키리스 키보드', width: 360, depth: 140, height: 30, color: '#8a809f' },
  { id: 'monitor', name: '27인치 모니터', detail: '스탠드를 포함한 외형', width: 615, depth: 200, height: 455, color: '#555f72' },
];
export const DEFAULT_PRODUCT: Product = { name: '내가 궁금한 상자', width: 240, depth: 180, height: 160 };
export const AXES = ['width', 'depth', 'height'] as const;
export const formatNumber = (value: number) => Number(value.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 });
export const displayValue = (mm: number, unit: Unit) => Number((mm / (unit === 'cm' ? 10 : 1)).toFixed(6)).toString();
export const dimensionText = (d: Dimensions, unit: Unit = 'mm') => AXES.map(axis => formatNumber(d[axis] / (unit === 'cm' ? 10 : 1))).join(' × ') + ` ${unit}`;
export function parseDimensions(values: Record<keyof Dimensions, string>, unit: Unit): Dimensions | null {
  const factor = unit === 'cm' ? 10 : 1;
  const dims = Object.fromEntries(AXES.map(axis => [axis, Number(values[axis]) * factor])) as Dimensions;
  return AXES.every(axis => values[axis].trim() !== '' && Number.isFinite(dims[axis]) && dims[axis] >= 0.1 && dims[axis] <= 10000) ? dims : null;
}
export function sceneLayout(product: Product | null, presets: Preset[]) {
  const objects = product ? [product, ...presets] : presets;
  if (!objects.length) return [];
  const gap = Math.max(35, Math.min(120, Math.max(...objects.map(o => o.width)) * 0.18));
  const totalWidth = objects.reduce((sum, o) => sum + o.width, 0) + gap * (objects.length - 1);
  let left = -totalWidth / 2;
  return objects.map(object => {
    const x = left + object.width / 2;
    left += object.width + gap;
    return { object, x: x * WORLD_SCALE };
  });
}
export function isProduct(value: unknown): value is ActiveProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<Product>;
  return typeof product.name === 'string' && product.name.trim() !== '' && product.name.length <= 60 &&
    AXES.every(axis => {
      const size = product[axis];
      return typeof size === 'number' && size >= 0.1 && size <= 10000;
    });
}

export function readSaved(): { product: ActiveProduct | null; selected: PresetId[]; unit: Unit; library: SavedModel[] } {
  const fallback = { product: DEFAULT_PRODUCT, selected: ['bottle', 'phone'] as PresetId[], unit: 'cm' as Unit, library: [] };
  try {
    const value = JSON.parse(localStorage.getItem('noruler-v1') || 'null');
    if (!value) return fallback;
    const library: SavedModel[] = Array.isArray(value.library) ? value.library.filter((item: SavedModel) =>
      isProduct(item) && typeof item.id === 'string' && item.id.startsWith('custom-') &&
      (item.history === true || item.preset === true),
    ) : [];
    let product = value.product === null ? null : isProduct(value.product) ? value.product : fallback.product;
    if (!Array.isArray(value.library) && product &&
        (product.name !== DEFAULT_PRODUCT.name || AXES.some(axis => product?.[axis] !== DEFAULT_PRODUCT[axis]))) {
      const previous: SavedModel = { ...product, id: 'custom-legacy', history: true, preset: false };
      library.push(previous);
      product = previous;
    }
    const allowed = [...PRESETS, ...library.filter(item => item.preset)].map(item => item.id);
    const selected = Array.isArray(value.selected)
      ? [...new Set<PresetId>(value.selected.filter((id: PresetId) => allowed.includes(id)))]
      : fallback.selected;
    return { product, library, selected, unit: value.unit === 'mm' ? 'mm' : 'cm' };
  } catch { return fallback; }
}
