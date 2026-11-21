import { Box3, Vector3 } from 'three';

const axes = ['x', 'y', 'z'] as const;
const tolerance = 1e-7;
type Axis = typeof axes[number];

export function overlaps(a: Box3, b: Box3) {
  return axes.every(axis =>
    a.min[axis] < b.max[axis] - tolerance &&
    a.max[axis] > b.min[axis] + tolerance,
  );
}

export type Placement =
  | { kind: 'free' | 'blocked' }
  | { kind: 'contact'; offset: Vector3; target: Box3; axis: Axis; side: 'min' | 'max' };

export function resolvePlacement(moving: Box3, targets: Box3[], snapDistance: number): Placement {
  const intersecting = targets.some(target => overlaps(moving, target));
  let best: Extract<Placement, { kind: 'contact' }> | null = null;

  for (const target of targets) {
    if (intersecting && !overlaps(moving, target)) continue;
    for (const axis of axes) {
      const otherAxesOverlap = axes.filter(otherAxis => otherAxis !== axis).every(otherAxis =>
        moving.min[otherAxis] < target.max[otherAxis] - tolerance &&
        moving.max[otherAxis] > target.min[otherAxis] + tolerance,
      );
      if (!otherAxesOverlap) continue;

      for (const side of ['min', 'max'] as const) {
        if (axis === 'y' && side === 'min') continue;
        const distance = side === 'min' ? target.min[axis] - moving.max[axis] : target.max[axis] - moving.min[axis];
        if (!intersecting && (snapDistance <= 0 || Math.abs(distance) > snapDistance)) continue;
        if (best && Math.abs(distance) >= best.offset.length()) continue;

        const offset = new Vector3();
        offset[axis] = distance;
        const moved = moving.clone().translate(offset);
        if (moved.min.y < -tolerance || targets.some(other => overlaps(moved, other))) continue;
        best = { kind: 'contact', offset, target, axis, side };
      }
    }
  }
  if (best) return best;
  return { kind: intersecting ? 'blocked' : 'free' };
}

export type AlignmentGuide = { axis: 'x' | 'z'; coord: number; from: number; to: number };

function overlapsXZ(a: Box3, b: Box3) {
  return (
    a.min.x < b.max.x - tolerance &&
    a.max.x > b.min.x + tolerance &&
    a.min.z < b.max.z - tolerance &&
    a.max.z > b.min.z + tolerance
  );
}

export function resolveFloorSnap(moving: Box3, targets: Box3[], floorSnapDistance: number): number | null {
  if (floorSnapDistance <= 0 || moving.min.y <= tolerance || moving.min.y > floorSnapDistance) return null;
  const offsetY = -moving.min.y;
  const grounded = moving.clone().translate(new Vector3(0, offsetY, 0));
  if (targets.some(target => overlaps(grounded, target))) return null;
  return offsetY;
}

export function isRestingOnSupport(moving: Box3, targets: Box3[], toleranceY: number): boolean {
  if (moving.min.y <= toleranceY) return false;
  return targets.some(target =>
    overlapsXZ(moving, target) && Math.abs(target.max.y - moving.min.y) <= toleranceY,
  );
}

export function findSupportTopY(moving: Box3, targets: Box3[], maxY: number): number {
  let highest = 0;
  for (const target of targets) {
    if (!overlapsXZ(moving, target)) continue;
    if (target.max.y <= maxY + tolerance && target.max.y > highest) {
      highest = target.max.y;
    }
  }
  return highest;
}

function boxCoord(box: Box3, axis: 'x' | 'z', kind: 'min' | 'max' | 'center') {
  if (kind === 'min') return box.min[axis];
  if (kind === 'max') return box.max[axis];
  return (box.min[axis] + box.max[axis]) / 2;
}

export function resolveHorizontalAlignment(
  moving: Box3,
  targets: Box3[],
  snapDistance: number,
  allowedAxes: readonly ('x' | 'z')[] = ['x', 'z'],
): { offset: Vector3; guides: AlignmentGuide[] } {
  const offset = new Vector3();
  const guides: AlignmentGuide[] = [];
  if (snapDistance <= 0 || allowedAxes.length === 0) return { offset, guides };

  for (const axis of allowedAxes) {
    let bestDelta = Infinity;
    let bestTarget: Box3 | null = null;
    let bestCoord = 0;

    for (const target of targets) {
      for (const kind of ['min', 'max', 'center'] as const) {
        const targetCoord = boxCoord(target, axis, kind);
        const movingCoord = boxCoord(moving, axis, kind);
        const delta = targetCoord - movingCoord;
        if (Math.abs(delta) > snapDistance) continue;
        if (Math.abs(delta) < Math.abs(bestDelta)) {
          bestDelta = delta;
          bestTarget = target;
          bestCoord = targetCoord;
        }
      }
    }

    if (!bestTarget || !Number.isFinite(bestDelta)) continue;
    const candidateOffset = offset.clone();
    candidateOffset[axis] = bestDelta;
    const moved = moving.clone().translate(candidateOffset);
    if (targets.some(other => overlaps(moved, other))) continue;

    offset[axis] = bestDelta;
    const perpAxis = axis === 'x' ? 'z' : 'x';
    guides.push({
      axis,
      coord: bestCoord,
      from: Math.min(moved.min[perpAxis], bestTarget.min[perpAxis]),
      to: Math.max(moved.max[perpAxis], bestTarget.max[perpAxis]),
    });
  }

  return { offset, guides };
}
