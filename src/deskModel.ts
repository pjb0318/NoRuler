import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WORLD_SCALE } from './domain.ts';
import type { Dimensions } from './domain.ts';

export type DeskShape = { kind: 'desk-v1'; frontFlipped: boolean; clearanceRatio: number };
export const deskPreviewDimensions: Dimensions = { width: 1200, depth: 600, height: 740 };

export function makeDeskShape(clearanceMm: number | null | undefined, heightMm: number | null): DeskShape {
  const ratio = clearanceMm && heightMm ? clearanceMm / heightMm : 0;
  return { kind: 'desk-v1', frontFlipped: false, clearanceRatio: ratio >= .75 && ratio <= .97 ? ratio : 700 / 740 };
}

export function readDeskShape(value: unknown): DeskShape | undefined {
  const shape = value as Partial<DeskShape> | null;
  if (shape?.kind !== 'desk-v1' || typeof shape.frontFlipped !== 'boolean' ||
      typeof shape.clearanceRatio !== 'number' || !(shape.clearanceRatio >= .75 && shape.clearanceRatio <= .97)) return;
  return { kind: shape.kind, frontFlipped: shape.frontFlipped, clearanceRatio: shape.clearanceRatio };
}

export function createDeskModel(dimensions: Dimensions, shape: DeskShape) {
  const root = new THREE.Group();
  const desk = new THREE.Group();
  root.add(desk);
  desk.rotation.y = shape.frontFlipped ? Math.PI : 0;

  const w = dimensions.width * WORLD_SCALE, d = dimensions.depth * WORLD_SCALE, h = dimensions.height * WORLD_SCALE;
  const clearance = h * shape.clearanceRatio;
  const thickness = Math.min(.16, (h - clearance) * .4, w * .1, d * .1);
  const leg = Math.min(.32, w * .12, d * .12, h * .1);
  const frameHeight = h - thickness - clearance;
  const legX = w / 2 - leg * .97, legZ = d / 2 - leg * .88;
  const tabletop = new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: .7 });
  const frame = new THREE.MeshStandardMaterial({ color: '#e5e7e5', roughness: .52, metalness: .12 });
  const brace = new THREE.MeshStandardMaterial({ color: '#b3b8b6', roughness: .55, metalness: .15 });

  function part(name: string, material: THREE.Material, width: number, height: number, depth: number,
    x: number, y: number, z: number, radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(width, height, depth, 3, radius) : new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    desk.add(mesh);
    return mesh;
  }

  part('tabletop', tabletop, w, thickness, d, 0, h - thickness / 2, 0, Math.min(.06, thickness * .4));
  for (const x of [-legX, legX]) {
    for (const z of [-legZ, legZ]) {
      part('leg', frame, leg, h - thickness, leg, x, (h - thickness) / 2, z, leg * .04);
    }
    part('side-stretcher', frame, leg * .72, Math.min(leg, h * .05), 2 * legZ, x, h * .10, 0);
    part('upper-side-rail', frame, leg * .72, frameHeight, 2 * legZ, x, clearance + frameHeight / 2, 0);
  }
  for (const z of [-legZ, legZ]) {
    part('upper-long-rail', frame, 2 * legX, frameHeight, leg * .72, 0, clearance + frameHeight / 2, z);
  }
  for (const direction of [-1, 1]) {
    const rearZ = -legZ + leg * (.34 + direction * .06);
    const a = new THREE.Vector3(-legX, h * (direction > 0 ? .89 : .22), rearZ);
    const b = new THREE.Vector3(legX, h * (direction > 0 ? .22 : .89), rearZ);
    const center = a.clone().lerp(b, .5);
    const bar = part('rear-cross-brace', brace, leg * .25, a.distanceTo(b), leg * .09, center.x, center.y, center.z);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  }
  return root;
}
