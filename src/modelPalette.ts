import * as THREE from 'three';

export type ModelAccent = {
  id: string;
  fill: string;
  surface: string;
  frame: string;
  brace: string;
  edge: string;
  badge: string;
};

export const MODEL_PALETTE: readonly ModelAccent[] = [
  { id: 'cobalt', fill: '#6c9df2', surface: '#dce7f9', frame: '#648fd9', brace: '#40629e', edge: '#233c69', badge: '#4c86f0' },
  { id: 'amber', fill: '#e3a159', surface: '#f5e4cd', frame: '#cf8e4a', brace: '#945f26', edge: '#663c14', badge: '#e08b34' },
  { id: 'teal', fill: '#52b59c', surface: '#d6efe8', frame: '#49a68f', brace: '#2b7361', edge: '#18473b', badge: '#2ea88a' },
  { id: 'coral', fill: '#e0786c', surface: '#f7dedb', frame: '#d46c60', brace: '#964238', edge: '#66241d', badge: '#dc5d4f' },
  { id: 'violet', fill: '#9882eb', surface: '#e6e0fa', frame: '#8d78e0', brace: '#5e4aa8', edge: '#36266e', badge: '#846be3' },
  { id: 'olive', fill: '#8db55e', surface: '#e3f0d5', frame: '#7fa852', brace: '#53732f', edge: '#2f4716', badge: '#73a13f' },
];

export function getModelAccent(index = 0): ModelAccent {
  const safe = ((Math.trunc(index) % MODEL_PALETTE.length) + MODEL_PALETTE.length) % MODEL_PALETTE.length;
  return MODEL_PALETTE[safe];
}

export function addEdgeLines(
  mesh: THREE.Mesh,
  color: string,
  opacity = 0.65,
  thresholdAngle = 24,
): THREE.LineSegments {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, thresholdAngle),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  mesh.add(edges);
  return edges;
}

export function resolveParametricSurfaceColor(
  hexColor: string,
  accent?: ModelAccent,
): { fill: string; edge: string; edgeOpacity: number } {
  const effectiveAccent = accent ?? getModelAccent(0);
  const base = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl, THREE.SRGBColorSpace);

  if (hsl.l > 0.80 && hsl.s < 0.22) {
    base
      .lerp(new THREE.Color(effectiveAccent.surface), 0.72)
      .lerp(new THREE.Color(effectiveAccent.fill), 0.16);
  } else {
    if (hsl.l < 0.16) {
      base.setHSL(hsl.h, hsl.s, 0.18, THREE.SRGBColorSpace);
    }
    if (accent) {
      base.lerp(new THREE.Color(accent.fill), 0.22);
    }
  }

  const finalHsl = { h: 0, s: 0, l: 0 };
  base.getHSL(finalHsl, THREE.SRGBColorSpace);
  const fill = `#${base.getHexString(THREE.SRGBColorSpace)}`;
  const isLight = finalHsl.l >= 0.35;
  return {
    fill,
    edge: isLight ? effectiveAccent.edge : '#94a9c8',
    edgeOpacity: isLight ? 0.64 : 0.52,
  };
}
