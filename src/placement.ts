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
