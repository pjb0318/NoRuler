import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AXES, WORLD_SCALE } from './domain.ts';
import type { Dimensions, Unit } from './domain.ts';
import { addEdgeLines, resolveParametricSurfaceColor } from './modelPalette.ts';
import type { ModelAccent } from './modelPalette.ts';

export type BoxPart = {
  kind: 'box' | 'cylinder';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  color: string;
  radius: number;
};

export type LathePoint = { r: number; y: number };
export type ExtrudePoint = { u: number; v: number };
export type ExtrudePlane = 'front' | 'side' | 'top';
export type PreviewRatio = { width: number; depth: number; height: number };

export type ParametricShape =
  | { kind: 'box-parts-v1'; frontFlipped: boolean; ratio: PreviewRatio; parts: BoxPart[] }
  | { kind: 'lathe-v1'; frontFlipped: boolean; ratio: PreviewRatio; color: string; profile: LathePoint[] }
  | { kind: 'extrude-v1'; frontFlipped: boolean; ratio: PreviewRatio; color: string; plane: ExtrudePlane; points: ExtrudePoint[] };

const defaultColor = '#9eb2cf';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const isUnitNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function cleanColor(value: unknown): string {
  if (typeof value !== 'string') return defaultColor;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : defaultColor;
}

function readRatio(value: unknown): PreviewRatio {
  const ratio = asRecord(value);
  if (!ratio) return { width: 1, depth: 1, height: 1 };
  const valid = AXES.every(axis => {
    const num = ratio[axis];
    return typeof num === 'number' && Number.isFinite(num) && num >= 0.05 && num <= 50;
  });
  return valid
    ? { width: ratio.width as number, depth: ratio.depth as number, height: ratio.height as number }
    : { width: 1, depth: 1, height: 1 };
}

function readBoxParts(value: unknown): BoxPart[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: BoxPart[] = [];
  for (const raw of value.slice(0, 24)) {
    const item = asRecord(raw);
    if (!item) return null;
    if (item.kind !== 'box' && item.kind !== 'cylinder') return null;
    const { x0, x1, y0, y1, z0, z1, radius, color } = item;
    if (![x0, x1, y0, y1, z0, z1].every(isUnitNumber)) return null;
    const nX0 = x0 as number, nX1 = x1 as number, nY0 = y0 as number, nY1 = y1 as number, nZ0 = z0 as number, nZ1 = z1 as number;
    if (nX1 - nX0 < 0.005 || nY1 - nY0 < 0.005 || nZ1 - nZ0 < 0.005) return null;
    const cleanRadius = typeof radius === 'number' && Number.isFinite(radius) ? clamp(radius, 0, 0.5) : 0;
    parts.push({ kind: item.kind, x0: nX0, x1: nX1, y0: nY0, y1: nY1, z0: nZ0, z1: nZ1, color: cleanColor(color), radius: cleanRadius });
  }
  const minX = Math.min(...parts.map(p => p.x0)), maxX = Math.max(...parts.map(p => p.x1));
  const minY = Math.min(...parts.map(p => p.y0)), maxY = Math.max(...parts.map(p => p.y1));
  const minZ = Math.min(...parts.map(p => p.z0)), maxZ = Math.max(...parts.map(p => p.z1));
  if (maxX - minX < 0.05 || maxY - minY < 0.05 || maxZ - minZ < 0.05) return null;
  return parts;
}

function readLatheProfile(value: unknown): LathePoint[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const rawPoints: LathePoint[] = [];
  for (const raw of value.slice(0, 32)) {
    const item = asRecord(raw);
    if (!item || !isUnitNumber(item.r) || !isUnitNumber(item.y)) return null;
    rawPoints.push({ r: item.r, y: item.y });
  }
  rawPoints.sort((a, b) => a.y - b.y);
  const profile: LathePoint[] = [];
  for (const point of rawPoints) {
    const prev = profile.at(-1);
    if (prev && Math.hypot(point.r - prev.r, point.y - prev.y) < 1e-4) continue;
    profile.push(point);
  }
  if (profile.length < 3) return null;
  const spanY = profile.at(-1)!.y - profile[0].y;
  const maxR = Math.max(...profile.map(p => p.r));
  if (spanY < 0.05 || maxR < 0.02) return null;
  return profile;
}

const orient = (a: ExtrudePoint, b: ExtrudePoint, c: ExtrudePoint) =>
  (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);

const onSegment = (a: ExtrudePoint, b: ExtrudePoint, p: ExtrudePoint) =>
  Math.min(a.u, b.u) - 1e-9 <= p.u && p.u <= Math.max(a.u, b.u) + 1e-9 &&
  Math.min(a.v, b.v) - 1e-9 <= p.v && p.v <= Math.max(a.v, b.v) + 1e-9;

function segmentsIntersect(a1: ExtrudePoint, a2: ExtrudePoint, b1: ExtrudePoint, b2: ExtrudePoint): boolean {
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  if (((o1 > 1e-9 && o2 < -1e-9) || (o1 < -1e-9 && o2 > 1e-9)) &&
      ((o3 > 1e-9 && o4 < -1e-9) || (o3 < -1e-9 && o4 > 1e-9))) return true;
  if (Math.abs(o1) <= 1e-9 && onSegment(a1, a2, b1)) return true;
  if (Math.abs(o2) <= 1e-9 && onSegment(a1, a2, b2)) return true;
  if (Math.abs(o3) <= 1e-9 && onSegment(b1, b2, a1)) return true;
  if (Math.abs(o4) <= 1e-9 && onSegment(b1, b2, a2)) return true;
  return false;
}

function readExtrudePoints(value: unknown): ExtrudePoint[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points: ExtrudePoint[] = [];
  for (const raw of value.slice(0, 32)) {
    const item = asRecord(raw);
    if (!item || !isUnitNumber(item.u) || !isUnitNumber(item.v)) return null;
    const prev = points.at(-1);
    if (prev && Math.hypot(item.u - prev.u, item.v - prev.v) < 1e-4) continue;
    points.push({ u: item.u, v: item.v });
  }
  if (points.length > 1 && Math.hypot(points[0].u - points.at(-1)!.u, points[0].v - points.at(-1)!.v) < 1e-4) {
    points.pop();
  }
  if (points.length < 3) return null;
  const minU = Math.min(...points.map(p => p.u)), maxU = Math.max(...points.map(p => p.u));
  const minV = Math.min(...points.map(p => p.v)), maxV = Math.max(...points.map(p => p.v));
  if (maxU - minU < 0.05 || maxV - minV < 0.05) return null;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.u * b.v - b.u * a.v;
  }
  if (Math.abs(area) * 0.5 < 1e-4) return null;

  for (let i = 0; i < points.length; i++) {
    const a1 = points[i], a2 = points[(i + 1) % points.length];
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(a1, a2, points[j], points[(j + 1) % points.length])) return null;
    }
  }
  return points;
}

export function readParametricShape(value: unknown): ParametricShape | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const kind = raw.kind === 'box-parts-v1' || raw.builder === 'box-parts'
    ? 'box-parts-v1'
    : raw.kind === 'lathe-v1' || raw.builder === 'lathe'
      ? 'lathe-v1'
      : raw.kind === 'extrude-v1' || raw.builder === 'extrude'
        ? 'extrude-v1'
        : null;
  if (!kind) return undefined;

  const frontFlipped = raw.frontFlipped === true;
  const ratio = readRatio(raw.ratio);

  if (kind === 'box-parts-v1') {
    const parts = readBoxParts(raw.parts);
    return parts ? { kind, frontFlipped, ratio, parts } : undefined;
  }
  if (kind === 'lathe-v1') {
    const profile = readLatheProfile(raw.profile);
    return profile ? { kind, frontFlipped, ratio, color: cleanColor(raw.color), profile } : undefined;
  }
  if (raw.plane !== 'front' && raw.plane !== 'side' && raw.plane !== 'top') return undefined;
  const points = readExtrudePoints(raw.points);
  return points ? { kind, frontFlipped, ratio, color: cleanColor(raw.color), plane: raw.plane, points } : undefined;
}

export function cloneParametricShape(shape: ParametricShape): ParametricShape {
  const ratio = { ...shape.ratio };
  if (shape.kind === 'box-parts-v1') {
    return { ...shape, ratio, parts: shape.parts.map(part => ({ ...part })) };
  }
  if (shape.kind === 'lathe-v1') {
    return { ...shape, ratio, profile: shape.profile.map(point => ({ ...point })) };
  }
  return { ...shape, ratio, points: shape.points.map(point => ({ ...point })) };
}

export function sameParametricShape(a?: ParametricShape, b?: ParametricShape): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind || a.frontFlipped !== b.frontFlipped) return false;
  if (AXES.some(axis => a.ratio[axis] !== b.ratio[axis])) return false;
  if (a.kind === 'box-parts-v1' && b.kind === 'box-parts-v1') {
    return a.parts.length === b.parts.length && a.parts.every((p, i) => {
      const q = b.parts[i];
      return p.kind === q.kind && p.x0 === q.x0 && p.x1 === q.x1 && p.y0 === q.y0 && p.y1 === q.y1 &&
        p.z0 === q.z0 && p.z1 === q.z1 && p.color === q.color && p.radius === q.radius;
    });
  }
  if (a.kind === 'lathe-v1' && b.kind === 'lathe-v1') {
    return a.color === b.color && a.profile.length === b.profile.length &&
      a.profile.every((p, i) => p.r === b.profile[i].r && p.y === b.profile[i].y);
  }
  if (a.kind === 'extrude-v1' && b.kind === 'extrude-v1') {
    return a.color === b.color && a.plane === b.plane && a.points.length === b.points.length &&
      a.points.every((p, i) => p.u === b.points[i].u && p.v === b.points[i].v);
  }
  return false;
}

export function parametricKindLabel(shape: ParametricShape): string {
  return shape.kind === 'box-parts-v1' ? '부품 조합' : shape.kind === 'lathe-v1' ? '회전체' : '윤곽 돌출';
}

export function parametricPreviewDimensions(
  shape: ParametricShape,
  draft: Record<keyof Dimensions, string>,
  unit: Unit,
): Dimensions {
  const factor = unit === 'cm' ? 10 : 1;
  const valid: Partial<Dimensions> = {};
  for (const axis of AXES) {
    const raw = draft[axis].trim();
    const mm = Number(draft[axis]) * factor;
    if (raw !== '' && Number.isFinite(mm) && mm >= 0.1 && mm <= 10000) valid[axis] = mm;
  }
  const known = AXES.filter(axis => valid[axis] !== undefined);
  if (known.length === AXES.length) return valid as Dimensions;
  const scale = known.length
    ? known.reduce((sum, axis) => sum + valid[axis]! / shape.ratio[axis], 0) / known.length
    : 300 / Math.max(shape.ratio.width, shape.ratio.depth, shape.ratio.height);
  return Object.fromEntries(AXES.map(axis => [
    axis,
    valid[axis] ?? clamp(shape.ratio[axis] * scale, 10, 5000),
  ])) as Dimensions;
}

function makeMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

function addPartMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  edge: string,
  edgeOpacity: number,
  threshold = 24,
) {
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdgeLines(mesh, edge, edgeOpacity, threshold);
  parent.add(mesh);
  return mesh;
}

export function createParametricModel(dimensions: Dimensions, shape: ParametricShape, accent?: ModelAccent): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.rotation.y = shape.frontFlipped ? Math.PI : 0;

  const w = dimensions.width * WORLD_SCALE;
  const d = dimensions.depth * WORLD_SCALE;
  const h = dimensions.height * WORLD_SCALE;

  if (shape.kind === 'box-parts-v1') {
    const minX = Math.min(...shape.parts.map(p => p.x0)), maxX = Math.max(...shape.parts.map(p => p.x1));
    const minY = Math.min(...shape.parts.map(p => p.y0)), maxY = Math.max(...shape.parts.map(p => p.y1));
    const minZ = Math.min(...shape.parts.map(p => p.z0)), maxZ = Math.max(...shape.parts.map(p => p.z1));
    const spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;
    const materials = new Map<string, THREE.Material>();

    for (const part of shape.parts) {
      const pw = ((part.x1 - part.x0) / spanX) * w;
      const ph = ((part.y1 - part.y0) / spanY) * h;
      const pd = ((part.z1 - part.z0) / spanZ) * d;
      const cx = (((part.x0 + part.x1) / 2 - minX) / spanX - 0.5) * w;
      const cy = (((part.y0 + part.y1) / 2 - minY) / spanY) * h;
      const cz = (((part.z0 + part.z1) / 2 - minZ) / spanZ - 0.5) * d;

      const resolved = resolveParametricSurfaceColor(part.color, accent);
      let material = materials.get(resolved.fill);
      if (!material) {
        material = makeMaterial(resolved.fill);
        materials.set(resolved.fill, material);
      }

      let geometry: THREE.BufferGeometry;
      if (part.kind === 'cylinder') {
        geometry = new THREE.CylinderGeometry(pw / 2, pw / 2, ph, 32);
        if (Math.abs(pd - pw) > 1e-6) {
          geometry.scale(1, 1, pd / pw);
          geometry.computeVertexNormals();
        }
      } else {
        const radius = Math.min(pw, ph, pd) * Math.min(part.radius, 0.45) * 0.5;
        geometry = radius >= 1e-4
          ? new RoundedBoxGeometry(pw, ph, pd, 3, radius)
          : new THREE.BoxGeometry(pw, ph, pd);
      }
      const mesh = addPartMesh(body, geometry, material, resolved.edge, resolved.edgeOpacity, part.kind === 'cylinder' ? 30 : 24);
      mesh.position.set(cx, cy, cz);
    }
    return root;
  }

  const resolved = resolveParametricSurfaceColor(shape.color, accent);
  const material = makeMaterial(resolved.fill);

  if (shape.kind === 'lathe-v1') {
    const minY = shape.profile[0].y;
    const spanY = shape.profile.at(-1)!.y - minY;
    const maxR = Math.max(...shape.profile.map(p => p.r));
    const vectors = shape.profile.map(p => new THREE.Vector2((p.r / maxR) * (w / 2), ((p.y - minY) / spanY) * h));
    if (vectors[0].x > 1e-4) vectors.unshift(new THREE.Vector2(0, 0));
    if (vectors.at(-1)!.x > 1e-4) vectors.push(new THREE.Vector2(0, h));

    const geometry = new THREE.LatheGeometry(vectors, 48);
    if (Math.abs(d - w) > 1e-6) {
      geometry.scale(1, 1, d / w);
      geometry.computeVertexNormals();
    }
    addPartMesh(body, geometry, material, resolved.edge, resolved.edgeOpacity, 30);
    return root;
  }

  const minU = Math.min(...shape.points.map(p => p.u)), maxU = Math.max(...shape.points.map(p => p.u));
  const minV = Math.min(...shape.points.map(p => p.v)), maxV = Math.max(...shape.points.map(p => p.v));
  const spanU = maxU - minU, spanV = maxV - minV;

  const polygon = shape.points.map(p => {
    const un = (p.u - minU) / spanU;
    const vn = (p.v - minV) / spanV;
    if (shape.plane === 'front') return new THREE.Vector2((un - 0.5) * w, vn * h);
    if (shape.plane === 'side') return new THREE.Vector2((un - 0.5) * d, vn * h);
    return new THREE.Vector2((un - 0.5) * w, (0.5 - vn) * d);
  });

  let area2d = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    area2d += a.x * b.y - b.x * a.y;
  }
  if (area2d < 0) polygon.reverse();

  const shape2d = new THREE.Shape(polygon);
  const depth = shape.plane === 'front' ? d : shape.plane === 'side' ? w : h;
  const geometry = new THREE.ExtrudeGeometry(shape2d, { depth, bevelEnabled: false, curveSegments: 12 });
  if (shape.plane === 'front') {
    geometry.translate(0, 0, -d / 2);
  } else if (shape.plane === 'side') {
    geometry.translate(0, 0, -w / 2);
    geometry.rotateY(-Math.PI / 2);
  } else {
    geometry.rotateX(-Math.PI / 2);
  }
  geometry.computeVertexNormals();
  addPartMesh(body, geometry, material, resolved.edge, resolved.edgeOpacity, 24);
  return root;
}
