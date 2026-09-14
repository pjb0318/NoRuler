import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { AXES, DEFAULT_PRODUCT, PRESETS, WORLD_SCALE, displayValue, parseDimensions, sceneLayout } from './domain.ts';
import { createModel } from './scene.ts';

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
