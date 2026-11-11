import { Box3, Vector3 } from 'three';

const axes = ['x', 'y', 'z'] as const;
const tolerance = 0.0000001;

function overlaps(a: Box3, b: Box3) {
  return axes.every(axis =>
    a.min[axis] < b.max[axis] - tolerance &&
    a.max[axis] > b.min[axis] + tolerance,
  );
}

export function findPlacementOffset(moving: Box3, targets: Box3[], snapDistance: number): Vector3 | null {
  const intersecting = targets.some(target => overlaps(moving, target));
  let best: Vector3 | null = null;

  for (const target of targets) {
    for (const axis of axes) {
      const otherAxesOverlap = axes.filter(otherAxis => otherAxis !== axis).every(otherAxis =>
        moving.min[otherAxis] < target.max[otherAxis] - tolerance &&
        moving.max[otherAxis] > target.min[otherAxis] + tolerance,
      );
      if (!otherAxesOverlap) continue;

      for (const distance of [
        target.min[axis] - moving.max[axis],
        target.max[axis] - moving.min[axis],
      ]) {
        // Always resolve above a surface, never through its underside.
        if (axis === 'y' && distance < 0) continue;
        if (!intersecting && Math.abs(distance) > snapDistance) continue;
        if (Math.abs(distance) < tolerance || (best && Math.abs(distance) >= best.length())) continue;

        const offset = new Vector3();
        offset[axis] = distance;
        const moved = moving.clone().translate(offset);
        if (targets.some(other => overlaps(moved, other))) continue;
        best = offset;
      }
    }
  }
  return best;
}
