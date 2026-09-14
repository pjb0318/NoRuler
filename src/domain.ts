export type Unit = 'mm' | 'cm';
export type Dimensions = { width: number; depth: number; height: number };
export type Product = Dimensions & { name: string };
export type PresetId = 'a4' | 'bottle' | 'phone' | 'laptop' | 'keyboard' | 'monitor';
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
export function sceneLayout(product: Product, presets: Preset[]) {
  const objects = [product, ...presets];
  const gap = Math.max(35, Math.min(120, Math.max(...objects.map(o => o.width)) * 0.18));
  const totalWidth = objects.reduce((sum, o) => sum + o.width, 0) + gap * (objects.length - 1);
  let left = -totalWidth / 2;
  return objects.map(object => {
    const x = left + object.width / 2;
    left += object.width + gap;
    return { object, x: x * WORLD_SCALE };
  });
}
export function readSaved(): { product: Product; selected: PresetId[]; unit: Unit } {
  const fallback = { product: DEFAULT_PRODUCT, selected: ['bottle', 'phone'] as PresetId[], unit: 'cm' as Unit };
  try {
    const value = JSON.parse(localStorage.getItem('noruler-v1') || 'null');
    if (!value || typeof value.product?.name !== 'string' || value.product.name.length > 60 || !AXES.every(axis => typeof value.product[axis] === 'number' && Number.isFinite(value.product[axis]) && value.product[axis] >= 0.1 && value.product[axis] <= 10000)) return fallback;
    return { product: value.product, unit: value.unit === 'mm' ? 'mm' : 'cm', selected: Array.isArray(value.selected) ? [...new Set(value.selected.filter((id: PresetId) => PRESETS.some(p => p.id === id)))] as PresetId[] : fallback.selected };
  } catch { return fallback; }
}
