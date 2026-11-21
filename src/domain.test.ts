import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, LineSegments, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { AXES, DEFAULT_PRODUCT, PRESETS, WORLD_SCALE, displayValue, parseDimensions, sceneLayout } from './domain.ts';
import { createModel } from './scene.ts';
import { makeDeskShape } from './deskModel.ts';
import { getModelAccent } from './modelPalette.ts';
import { deskParts, exampleAnalysis, normalizeImageAnalysis, supportsDesk, supportsParametric } from './imageDimensions.ts';
import { parametricPreviewDimensions, readParametricShape } from './parametricModel.ts';
import {
  findSupportTopY,
  isRestingOnSupport,
  resolveFloorSnap,
  resolveHorizontalAlignment,
  resolvePlacement,
} from './placement.ts';
import { addInstance, changeScene, initialInstances, stepScene } from './workspace.ts';
import { readWorkspace, writeWorkspace } from './storage.ts';
import { computeResizeDimensions } from './imageUpload.ts';

test('cm and mm produce exactly the same physical dimensions', () => {
  assert.deepEqual(parseDimensions({ width: '24', depth: '18', height: '16' }, 'cm'), { width: 240, depth: 180, height: 160 });
  const mm = { width: '240', depth: '180', height: '160' };
  assert.deepEqual(parseDimensions(mm, 'mm'), parseDimensions({ width: '24', depth: '18', height: '16' }, 'cm'));
  for (const value of [.1, .25, 8, 147, 10000]) assert.equal(Number(displayValue(value, 'cm')) * 10, value);
});
test('rejects blank, non-finite, negative, zero and out-of-range dimensions', () => {
  for (const invalid of ['', ' ', 'NaN', 'Infinity', '-2', '0', '0.01', '10001']) {
    assert.equal(parseDimensions({ width: invalid, depth: '100', height: '100' }, 'mm'), null);
  }
  assert.ok(parseDimensions({ width: '.1', depth: '10000', height: '1' }, 'mm'));
});
test('every preset and product model has its declared bounds under one world scale', () => {
  for (const preset of [undefined, ...PRESETS]) {
    const object = preset ?? DEFAULT_PRODUCT;
    const model = createModel(object, preset);
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    for (const [axis, actual] of [['width', size.x], ['depth', size.z], ['height', size.y]] as const) {
      assert.ok(Math.abs(actual - object[axis] * WORLD_SCALE) < 0.00001, `${object.name} ${axis}: ${actual} vs ${object[axis] * WORLD_SCALE}`);
    }
    assert.ok(Math.abs(bounds.min.y) < .00001, `${object.name} must rest on the floor`);
  }
});
test('all six presets are separate, centered, and do not overlap the product', () => {
  const layout = sceneLayout(DEFAULT_PRODUCT, PRESETS);
  assert.equal(layout.length, 7);
  for (let i = 1; i < layout.length; i++) {
    const previous = layout[i - 1], current = layout[i];
    assert.ok(previous.x + previous.object.width * WORLD_SCALE / 2 < current.x - current.object.width * WORLD_SCALE / 2);
  }
  const left = layout[0].x - layout[0].object.width * WORLD_SCALE / 2;
  const last = layout.at(-1)!;
  assert.ok(Math.abs(left + last.x + last.object.width * WORLD_SCALE / 2) < .00001);
});
test('dimensions are not normalized individually, including very small and large products', () => {
  for (const size of [.1, 10000]) {
    const model = createModel({ width: size, depth: size, height: size });
    const bounds = new Box3().setFromObject(model).getSize(new Vector3());
    assert.ok(Math.abs(bounds.x - size * WORLD_SCALE) < .00001);
  }
  assert.equal(AXES.length, 3);
});

test('nearby objects land on top while the underside is never used', () => {
  const target = new Box3(new Vector3(0, 0, 0), new Vector3(6, 2, 6));
  const monitor = new Box3(new Vector3(2, 1.8, 2), new Vector3(4, 3.8, 4));
  const stacked = resolvePlacement(monitor, [target], 0);
  assert.equal(stacked.kind, 'contact');
  if (stacked.kind !== 'contact') return;
  assert.equal(stacked.axis, 'y');
  assert.equal(stacked.side, 'max');
  assert.equal(monitor.clone().translate(stacked.offset).min.y, 2);

  const hovering = monitor.clone().translate(new Vector3(0, .3, 0));
  const down = resolvePlacement(hovering, [target], .2);
  assert.equal(down.kind, 'contact');
  if (down.kind === 'contact') assert.ok(down.offset.y < 0);
  assert.equal(resolvePlacement(hovering, [target], 0).kind, 'free');

  const platform = target.clone().translate(new Vector3(0, 5, 0));
  const below = new Box3(new Vector3(2, 3.5, 2), new Vector3(4, 5.1, 4));
  const escape = resolvePlacement(below, [platform], .2);
  assert.equal(escape.kind, 'contact');
  if (escape.kind === 'contact') assert.notEqual(escape.side === 'min' && escape.axis === 'y', true);
});

test('rejects a drop when every candidate still intersects another object', () => {
  const moving = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
  const target = new Box3(new Vector3(-4, 0, -4), new Vector3(4, 4, 4));
  const obstacles = [
    target,
    ...[-5, 5].map(x => moving.clone().translate(new Vector3(x, 0, 0))),
    ...[-5, 5].map(z => moving.clone().translate(new Vector3(0, 0, z))),
    moving.clone().translate(new Vector3(0, 4, 0)),
  ];
  assert.equal(resolvePlacement(moving, obstacles, .2).kind, 'blocked');
});

test('copies a model independently and restores the whole action when undone', () => {
  const initial = initialInstances(DEFAULT_PRODUCT, []);
  const withCopy = changeScene({ past: [], present: initial, future: [] }, items => addInstance(items, DEFAULT_PRODUCT, null));
  const [original, copy] = withCopy.present;
  assert.notEqual(original.id, copy.id);
  assert.ok(copy.positionMm.x - original.positionMm.x > DEFAULT_PRODUCT.width);
  const moved = changeScene(withCopy, items => [items[0], { ...items[1], positionMm: { x: 400, y: 200, z: 0 }, yawDeg: 45 }]);
  const undone = stepScene(moved, 'undo');
  assert.deepEqual(undone.present, withCopy.present);
  assert.deepEqual(stepScene(undone, 'redo').present, moved.present);
  const removed = changeScene(undone, items => items.slice(1));
  assert.equal(removed.future.length, 0);
  assert.equal(removed.present[0].id, copy.id);
});

test('migrates an earlier workspace and restores duplicate placements, camera and preferences', () => {
  const values = new Map<string, string>();
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
  });
  try {
    const product = { ...DEFAULT_PRODUCT, name: '기존 제품', id: 'custom-existing' };
    const legacy = JSON.stringify({
      product, library: [{ ...product, history: true, preset: true }], unit: 'mm', selected: ['bottle', product.id],
    });
    values.set('noruler-v1', legacy);
    const migrated = readWorkspace();
    assert.equal(migrated.library[0].id, product.id);
    assert.equal(migrated.instances.length, 3);
    assert.equal(migrated.instances.filter(item => item.assetId === product.id).length, 2);
    const instances = addInstance(migrated.instances, product, product.id);
    instances[3] = { ...instances[3], positionMm: { x: 400, y: 210, z: 40 }, yawDeg: 45 };
    const camera = { positionMm: { x: 0, y: 600, z: 200 }, targetMm: { x: 0, y: 0, z: 0 }, zoom: 1.25, halfHeight: 5, aspect: 1.3 };
    const workspace = { ...migrated, instances, camera, preferences: { ...migrated.preferences, names: false } };
    writeWorkspace(workspace);
    assert.deepEqual(readWorkspace(), workspace);
    assert.equal(values.get('noruler-v1'), legacy);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('image analysis preserves shape readiness without dimensions and independent option measurements', () => {
  const shapeEvidence = {
    readiness: 'ready', kind: 'cross-braced-desk', parts: deskParts,
    region: { left: .1, top: .3, right: .9, bottom: .95 },
  };
  const reading = (mm: number) => ({ mm, evidence: '치수선', needsReview: false });
  const options = [[800, 500], [1000, 600], [1200, 600]].map(([w, d]) => ({
    label: String(w), dimensions: { width: reading(w), depth: reading(d), height: reading(740) },
    clearance: reading(700),
  }));
  const result = normalizeImageAnalysis({ subjects: [
    { label: '치수 없는 책상', shapeEvidence },
    { label: '옵션 책상', shapeEvidence: { readiness: 'needs_view' }, options },
  ] });
  assert.equal(result.subjectStatus, 'needs_selection');
  assert.ok(supportsDesk(result.subjects[0].shapeEvidence));
  assert.ok(!supportsDesk(result.subjects[1].shapeEvidence));
  assert.ok(AXES.every(axis => result.candidates[0].dimensions[axis].mm === null));
  assert.deepEqual(result.candidates.slice(1).map(option => AXES.map(axis => option.dimensions[axis].mm)),
    [[800, 500, 740], [1000, 600, 740], [1200, 600, 740]]);
  assert.equal(result.candidates[3].clearance?.mm, 700);
  assert.equal(result.candidates[3].subjectId, result.subjects[1].id);
});

test('desk geometry keeps exact exterior bounds and can flip the cross brace', () => {
  for (const [width, depth] of [[800, 500], [1000, 600], [1200, 600]]) {
    const deskShape = makeDeskShape(700, 740);
    for (const frontFlipped of [false, true]) {
      const desk = createModel({ width, depth, height: 740, deskShape: { ...deskShape, frontFlipped } });
      const bounds = new Box3().setFromObject(desk, true);
      const size = bounds.getSize(new Vector3()).multiplyScalar(1 / WORLD_SCALE);
      assert.deepEqual(size.toArray().map(mm => Math.round(mm * 1000) / 1000), [width, 740, depth]);
      assert.ok(Math.abs(bounds.min.y) < 1e-5);
      const braces = desk.getObjectsByProperty('name', 'rear-cross-brace');
      assert.equal(braces.length, 2);
      assert.ok(braces.every(part => frontFlipped === (part.getWorldPosition(new Vector3()).z > 0)));
    }
  }
});

test('restores desk shape in a v3 workspace and preserves the previous v2 workspace', () => {
  const values = new Map<string, string>();
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
  });
  try {
    const base = readWorkspace();
    const legacy = JSON.stringify({ ...base, schemaVersion: 2 });
    values.set('noruler-v2', legacy);
    const migrated = readWorkspace();
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.instances[1].shape, 'bottle');
    const desk = { name: '책상', width: 800, depth: 500, height: 740,
      deskShape: { ...makeDeskShape(700, 740), frontFlipped: true }, id: 'custom-desk',
      history: true, preset: false } as const;
    const instances = addInstance(addInstance(migrated.instances, desk, desk.id), desk, desk.id);
    assert.notEqual(instances.at(-1)?.snapshot.deskShape, instances.at(-2)?.snapshot.deskShape);
    const expected = { ...migrated, instances, library: [desk] };
    writeWorkspace(expected);
    assert.deepEqual(readWorkspace(), expected);
    assert.equal(values.get('noruler-v2'), legacy);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('keeps provenance, resolves matching unlabeled triples and rejects conflicting or non-product sizes', () => {
  const measure = (axis: string | null, mm: number, location: string, scope = 'overall', sourceId = 'photo') =>
    ({ sourceId, axis, mm, quote: `${mm} mm`, location, scope, basis: 'dimension_line' });
  const analyze = (measurements: unknown[]) => normalizeImageAnalysis({
    subjects: [{ label: '모니터 받침대', options: [{ measurements }] }],
    specRows: [
      { label: '포장 크기', measurements: [measure('width', 900, '포장', 'package', 'spec-image')] },
      { label: '받침대', measurements: [measure('width', 500, 'Overall size: 50 x 20 x 8.2 cm', 'overall', 'spec-image')] },
    ],
  }, ['photo', 'spec-image']);
  const arrows = [measure('width', 500, '사진 치수선'), measure('depth', 200, '사진 치수선'), measure('height', 82, '사진 치수선')];
  const table = [500, 200, 82].map(mm => measure(null, mm, '사양표'));
  const combined = analyze([...arrows, ...table, measure('height', 90, '포장', 'package'), measure('width', 700, '다른 자료', 'overall', 'unknown')]);
  const dimensions = combined.candidates[0].dimensions;
  assert.deepEqual(AXES.map(axis => dimensions[axis].mm), [500, 200, 82]);
  assert.equal(dimensions.width.measurements?.length, 2);
  assert.equal(dimensions.height.measurements?.length, 2);
  assert.equal(combined.specRows?.[0].measurements[0].scope, 'package');
  assert.equal(combined.specRows?.[1].measurements[0].axis, null);

  const conflicting = analyze([...arrows, measure('height', 90, '별도 표기')]);
  assert.equal(conflicting.candidates[0].dimensions.height.mm, null);
  assert.equal(conflicting.candidates[0].dimensions.height.needsReview, true);
  assert.deepEqual(conflicting.candidates[0].dimensions.height.measurements?.map(item => item.mm), [82, 90]);
  assert.equal(analyze(table).candidates[0].dimensions.width.mm, null);
});

test('built-in desk example provides three ready desk options with verified provenance', () => {
  assert.equal(exampleAnalysis.subjectStatus, 'identified');
  assert.equal(exampleAnalysis.subjects.length, 1);
  const subject = exampleAnalysis.subjects[0];
  assert.ok(supportsDesk(subject.shapeEvidence));
  const region = subject.shapeEvidence?.region;
  assert.ok(region && region.left >= 0 && region.left < region.right && region.right <= 1);
  assert.ok(region && region.top >= 0 && region.top < region.bottom && region.bottom <= 1);
  assert.deepEqual(exampleAnalysis.candidates.map(option => option.label), ['800', '1000', '1200']);
  assert.deepEqual(
    exampleAnalysis.candidates.map(option => AXES.map(axis => option.dimensions[axis].mm)),
    [[800, 500, 740], [1000, 600, 740], [1200, 600, 740]],
  );
  for (const option of exampleAnalysis.candidates) {
    assert.equal(option.clearance?.mm, 700);
    for (const axis of AXES) {
      assert.equal(option.dimensions[axis].needsReview, false);
      assert.equal(option.dimensions[axis].measurements?.length, 2);
    }
  }
});

test('parametric builders keep exact exterior bounds across box-parts, lathe, and extrude planes', () => {
  const boxParts = readParametricShape({
    builder: 'box-parts',
    ratio: { width: 5, depth: 2, height: 1 },
    parts: [
      { kind: 'box', x0: 0, x1: 1, y0: 0.72, y1: 1, z0: 0, z1: 1, color: '#456', radius: 0.2 },
      { kind: 'cylinder', x0: 0.05, x1: 0.17, y0: 0, y1: 0.72, z0: 0.1, z1: 0.9, color: '#2b394e', radius: 0 },
      { kind: 'cylinder', x0: 0.83, x1: 0.95, y0: 0, y1: 0.72, z0: 0.1, z1: 0.9, color: '#2b394e', radius: 0 },
    ],
  });
  const lathe = readParametricShape({
    builder: 'lathe',
    color: '#9ad3c8',
    ratio: { width: 1, depth: 1.2, height: 3 },
    profile: [{ r: 0.35, y: 0 }, { r: 0.5, y: 0.08 }, { r: 0.5, y: 0.7 }, { r: 0.22, y: 0.88 }, { r: 0.22, y: 1 }],
  });
  const extrudes = (['front', 'side', 'top'] as const).map(plane => readParametricShape({
    builder: 'extrude',
    color: '#6b94ee',
    plane,
    ratio: { width: 130, depth: 50, height: 35 },
    points: [
      { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0.55, v: 1 },
      { u: 0.55, v: 0.4 }, { u: 0.25, v: 0.4 }, { u: 0.25, v: 0.63 }, { u: 0, v: 0.63 },
    ],
  }));
  assert.ok(boxParts && lathe && extrudes.every(Boolean));

  const cases = [
    { shape: boxParts!, dims: { width: 500, depth: 200, height: 82 } },
    { shape: lathe!, dims: { width: 65, depth: 65, height: 210 } },
    { shape: lathe!, dims: { width: 80, depth: 60, height: 210 } },
    ...extrudes.map(shape => ({ shape: shape!, dims: { width: 130, depth: 50, height: 35 } })),
  ];
  for (const { shape, dims } of cases) {
    for (const frontFlipped of [false, true]) {
      const model = createModel({ ...dims, parametricShape: { ...shape, frontFlipped } });
      const bounds = new Box3().setFromObject(model, true);
      const size = bounds.getSize(new Vector3()).multiplyScalar(1 / WORLD_SCALE);
      const center = bounds.getCenter(new Vector3());
      assert.ok(Math.abs(size.x - dims.width) < 1e-3, `${shape.kind} width ${size.x} vs ${dims.width}`);
      assert.ok(Math.abs(size.y - dims.height) < 1e-3, `${shape.kind} height ${size.y} vs ${dims.height}`);
      assert.ok(Math.abs(size.z - dims.depth) < 1e-3, `${shape.kind} depth ${size.z} vs ${dims.depth}`);
      assert.ok(Math.abs(center.x) < 1e-5);
      assert.ok(Math.abs(center.z) < 1e-5);
      assert.ok(Math.abs(bounds.min.y) < 1e-5);
      assert.ok(Math.abs(model.children[0].rotation.y - (frontFlipped ? Math.PI : 0)) < 1e-6);
    }
  }
});

test('image analysis accepts valid parametric shapes, drops invalid geometry, and computes preview ratios', () => {
  const validParametric = {
    builder: 'extrude',
    color: '#3a6',
    plane: 'front',
    ratio: { width: 13, depth: 5, height: 3.5 },
    points: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 0.6 }],
  };
  const selfIntersecting = {
    builder: 'extrude',
    color: '#3a6',
    plane: 'front',
    ratio: { width: 1, depth: 1, height: 1 },
    points: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }, { u: 0, v: 1 }],
  };
  const result = normalizeImageAnalysis({
    subjects: [
      { label: '유효 모델', shapeEvidence: { readiness: 'ready', kind: 'other', parametric: validParametric } },
      { label: '교차 폴리곤', shapeEvidence: { readiness: 'ready', kind: 'other', parametric: selfIntersecting } },
      { label: '각도 부족', shapeEvidence: { readiness: 'needs_view', kind: 'other', parametric: validParametric } },
      { label: '책상 우선', shapeEvidence: { readiness: 'ready', kind: 'cross-braced-desk', parts: deskParts, parametric: validParametric } },
    ],
  });
  assert.ok(supportsParametric(result.subjects[0].shapeEvidence));
  assert.equal(result.subjects[0].shapeEvidence?.parametric?.kind, 'extrude-v1');
  if (result.subjects[0].shapeEvidence?.parametric?.kind === 'extrude-v1') {
    assert.equal(result.subjects[0].shapeEvidence.parametric.color, '#33aa66');
  }
  assert.ok(!supportsParametric(result.subjects[1].shapeEvidence));
  assert.ok(!supportsParametric(result.subjects[2].shapeEvidence));
  assert.ok(!supportsParametric(result.subjects[3].shapeEvidence));

  const shape = result.subjects[0].shapeEvidence!.parametric!;
  assert.deepEqual(
    parametricPreviewDimensions(shape, { width: '260', depth: '', height: '' }, 'mm'),
    { width: 260, depth: 100, height: 70 },
  );
  const blankPreview = parametricPreviewDimensions(shape, { width: '', depth: '', height: '' }, 'mm');
  assert.equal(blankPreview.width, 300);
  assert.ok(Math.abs(blankPreview.depth - 300 * (5 / 13)) < 1e-9);
  assert.ok(Math.abs(blankPreview.height - 300 * (3.5 / 13)) < 1e-9);
});

test('restores and deep-clones parametric shapes across v3 workspace storage and duplication', () => {
  const values = new Map<string, string>();
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
  });
  try {
    const base = readWorkspace();
    const parametricShape = readParametricShape({
      builder: 'box-parts',
      frontFlipped: true,
      ratio: { width: 5, depth: 2, height: 1 },
      parts: [{ kind: 'box', x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1, color: '#557799', radius: 0 }],
    })!;
    const stand = {
      name: '모니터 받침대',
      width: 500,
      depth: 200,
      height: 82,
      parametricShape,
      id: 'custom-stand' as const,
      history: true,
      preset: false,
    };
    const instances = addInstance(addInstance(base.instances, stand, stand.id), stand, stand.id);
    const firstShape = instances.at(-2)?.snapshot.parametricShape;
    const secondShape = instances.at(-1)?.snapshot.parametricShape;
    assert.notEqual(secondShape, firstShape);
    if (firstShape?.kind === 'box-parts-v1' && secondShape?.kind === 'box-parts-v1') {
      assert.notEqual(secondShape.parts, firstShape.parts);
    }
    const expected = { ...base, instances, library: [stand] };
    writeWorkspace(expected);
    assert.deepEqual(readWorkspace(), expected);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('assigns distinct accent colors and edge outlines while preserving exact exterior bounds', () => {
  const accent0 = getModelAccent(0);
  const accent1 = getModelAccent(1);
  const firstColorHex = (root: ReturnType<typeof createModel>) => {
    let hex = '';
    root.traverse(obj => {
      if (!hex && obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
        hex = obj.material.color.getHexString();
      }
    });
    return hex;
  };
  const edgeCount = (root: ReturnType<typeof createModel>) => {
    let count = 0;
    root.traverse(obj => { if (obj instanceof LineSegments) count += 1; });
    return count;
  };
  const expectSize = (root: ReturnType<typeof createModel>, expected: [number, number, number]) => {
    const size = new Box3().setFromObject(root, true).getSize(new Vector3()).multiplyScalar(1 / WORLD_SCALE);
    expected.forEach((mm, idx) => {
      assert.ok(Math.abs(size.getComponent(idx) - mm) < 1e-3, `axis ${idx}: ${size.getComponent(idx)} vs ${mm}`);
    });
  };

  const desk = { width: 800, depth: 500, height: 740, deskShape: makeDeskShape(700, 740) };
  const desk0 = createModel(desk, undefined, accent0);
  const desk1 = createModel(desk, undefined, accent1);
  assert.notEqual(firstColorHex(desk0), firstColorHex(desk1));
  assert.ok(edgeCount(desk0) > 0 && edgeCount(desk1) > 0);
  expectSize(desk0, [800, 740, 500]);
  expectSize(desk1, [800, 740, 500]);

  const box0 = createModel(DEFAULT_PRODUCT, undefined, accent0);
  const box1 = createModel(DEFAULT_PRODUCT, undefined, accent1);
  assert.notEqual(firstColorHex(box0), firstColorHex(box1));
  assert.ok(edgeCount(box0) > 0 && edgeCount(box1) > 0);
  expectSize(box0, [DEFAULT_PRODUCT.width, DEFAULT_PRODUCT.height, DEFAULT_PRODUCT.depth]);

  const whiteParametric = readParametricShape({
    builder: 'box-parts',
    ratio: { width: 3, depth: 2, height: 1 },
    parts: [{ kind: 'box', x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1, color: '#ffffff', radius: 0.1 }],
  })!;
  const param0 = createModel({ width: 300, depth: 200, height: 100, parametricShape: whiteParametric }, undefined, accent0);
  const param1 = createModel({ width: 300, depth: 200, height: 100, parametricShape: whiteParametric }, undefined, accent1);
  assert.notEqual(firstColorHex(param0), 'ffffff');
  assert.notEqual(firstColorHex(param0), firstColorHex(param1));
  assert.ok(edgeCount(param0) > 0 && edgeCount(param1) > 0);
  expectSize(param0, [300, 100, 200]);
  expectSize(param1, [300, 100, 200]);
});

test('resolves floor snapping, support detection, and horizontal edge alignment', () => {
  const obstacle = new Box3(new Vector3(0, 0, 0), new Vector3(4, 2, 4));
  const floatingClear = new Box3(new Vector3(5, 0.15, 0), new Vector3(7, 1.15, 2));
  assert.equal(resolveFloorSnap(floatingClear, [obstacle], 0.2), -0.15);
  assert.equal(resolveFloorSnap(floatingClear, [obstacle], 0.1), null);

  const tooHigh = new Box3(new Vector3(5, 0.5, 0), new Vector3(7, 1.5, 2));
  assert.equal(resolveFloorSnap(tooHigh, [obstacle], 0.2), null);

  const blockedAtFloor = new Box3(new Vector3(1, 2.05, 1), new Vector3(3, 3.05, 3));
  assert.equal(resolveFloorSnap(blockedAtFloor, [obstacle], 0.2), null);

  const onTop = new Box3(new Vector3(1, 2, 1), new Vector3(3, 3, 3));
  assert.equal(isRestingOnSupport(onTop, [obstacle], 0.02), true);
  assert.equal(findSupportTopY(onTop, [obstacle], 2.2), 2);

  const slidOff = new Box3(new Vector3(4.2, 2, 1), new Vector3(6.2, 3, 3));
  assert.equal(isRestingOnSupport(slidOff, [obstacle], 0.02), false);
  assert.equal(findSupportTopY(slidOff, [obstacle], 2.2), 0);

  const movingNearEdge = new Box3(new Vector3(5.05, 0, 0.12), new Vector3(7.05, 1, 2.12));
  const align = resolveHorizontalAlignment(movingNearEdge, [obstacle], 0.2, ['z']);
  assert.ok(Math.abs(align.offset.z - (-0.12)) < 1e-6);
  assert.equal(align.guides.length, 1);
  assert.equal(align.guides[0].axis, 'z');
  assert.equal(align.guides[0].coord, 0);

  const blockedAlign = new Box3(new Vector3(3.9, 0, 0.1), new Vector3(5.9, 1, 2.1));
  const noAlign = resolveHorizontalAlignment(blockedAlign, [obstacle], 0.2, ['x']);
  assert.equal(noAlign.guides.length, 0);
});

test('persists explicit theme preference while keeping unthemed workspaces compatible', () => {
  const values = new Map<string, string>();
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => values.get(k), setItem: (k: string, v: string) => values.set(k, v) },
  });
  try {
    const base = readWorkspace();
    assert.equal(base.preferences.theme, undefined);

    const darkWorkspace = { ...base, preferences: { ...base.preferences, theme: 'dark' as const } };
    writeWorkspace(darkWorkspace);
    assert.equal(readWorkspace().preferences.theme, 'dark');

    const lightWorkspace = { ...base, preferences: { ...base.preferences, theme: 'light' as const } };
    writeWorkspace(lightWorkspace);
    assert.equal(readWorkspace().preferences.theme, 'light');

    values.set('noruler-v3', JSON.stringify({
      ...base,
      preferences: { ...base.preferences, theme: 'invalid-value' },
    }));
    assert.equal(readWorkspace().preferences.theme, undefined);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('computeResizeDimensions shrinks 12MP photos while preserving desktop and tall spec screenshots', () => {
  const phone = computeResizeDimensions(4032, 3024);
  assert.equal(phone.resized, true);
  assert.ok(phone.width * phone.height <= 2_405_000);
  assert.ok(Math.abs(phone.width / phone.height - 4032 / 3024) < 0.01);

  const desktop = computeResizeDimensions(1920, 1080);
  assert.deepEqual(desktop, { width: 1920, height: 1080, resized: false });

  const tallSpec = computeResizeDimensions(860, 2200);
  assert.deepEqual(tallSpec, { width: 860, height: 2200, resized: false });

  const veryTallSpec = computeResizeDimensions(860, 3000);
  assert.equal(veryTallSpec.resized, true);
  assert.ok(veryTallSpec.width >= 820 && veryTallSpec.height >= 2850);

  const diagram = computeResizeDimensions(800, 600);
  assert.deepEqual(diagram, { width: 800, height: 600, resized: false });
});
