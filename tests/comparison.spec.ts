import { test, expect } from '@playwright/test';

test('adds and edits one copy independently, and restores the scene after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const rows = page.locator('.object-row');
  await expect(page.locator('.scene canvas')).toBeVisible();
  await button('프리셋').click();
  await button('500mL 물병 공간에 추가').click();
  await button('놓인 물건').click();
  await expect(rows).toHaveCount(4);
  const bottles = rows.filter({ hasText: '500mL 물병' });
  await bottles.last().getByRole('button', { name: '500mL 물병 선택' }).click();
  const height = page.getByLabel('높이 (mm)');
  await height.fill('150');
  await button('적용').click();
  await expect(height).toHaveValue('150');
  await button('실행 취소').click();
  await expect(height).toHaveValue('0');
  await button('다시 실행').click();
  await expect(height).toHaveValue('150');
  await button('+90°').click();
  await expect(page.getByLabel('회전 (°)')).toHaveValue('90');
  await bottles.first().getByRole('button', { name: '500mL 물병 선택' }).click();
  await expect(height).toHaveValue('0');
  await button('오른쪽').click();
  await button('이름 표시').click();
  await page.reload();
  await expect(button('오른쪽')).toHaveAttribute('aria-pressed', 'true');
  await expect(button('이름 표시')).toHaveAttribute('aria-pressed', 'false');
  await button('놓인 물건').click();
  await bottles.last().getByRole('button', { name: '500mL 물병 선택' }).click();
  await expect(height).toHaveValue('150');
  await expect(page.getByLabel('회전 (°)')).toHaveValue('90');
  await bottles.last().getByRole('button', { name: '500mL 물병 공간에서 제거' }).click();
  await expect(bottles).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('keeps placed instances when their saved model is removed', async ({ page }) => {
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('치수 직접 입력').click();
  await page.getByLabel('제품명', { exact: true }).fill('테스트 수납함');
  await button('3D로 크기 비교하기').click();
  await button('내 모델').click();
  await button('프리셋 등록').click();
  await button('꺼내기').first().click();
  await button('놓인 물건').click();
  const boxes = page.locator('.object-row').filter({ hasText: '테스트 수납함' });
  await expect(boxes).toHaveCount(2);
  await button('내 모델').click();
  await button('기록 삭제').click();
  await button('프리셋 삭제').click();
  await expect(button('꺼내기')).toHaveCount(0);
  await button('놓인 물건').click();
  await expect(boxes).toHaveCount(2);
});

test('reviews the built-in desk example, switches options, swaps axes, and preserves converted units', async ({ page }) => {
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('예시 도면 써보기').click();
  const preview = page.getByRole('region', { name: '책상 3D 초안' });
  await expect(preview.locator('canvas')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^800 / })).toBeChecked();
  await expect(page.locator('#width')).toHaveValue('800');
  await expect(page.locator('#depth')).toHaveValue('500');
  await expect(page.locator('#height')).toHaveValue('740');
  await page.getByRole('radio', { name: /^1200 / }).check();
  await expect(page.locator('#width')).toHaveValue('1200');
  await expect(page.locator('#depth')).toHaveValue('600');
  await expect(page.locator('#height')).toHaveValue('740');
  await page.getByRole('button', { name: /원본 확대/ }).click();
  await expect(page.getByLabel('선택한 상품 영역')).toBeVisible();
  await button('원본 더 확대').click();
  await expect(page.getByRole('dialog')).toContainText('150%');
  await button('닫기').click();
  await button('축 교환').click();
  await expect(page.locator('#width')).toHaveValue('600');
  await expect(page.locator('#depth')).toHaveValue('1200');
  await expect(button('책상을 비교 공간에 추가')).toBeDisabled();
  await button('가로 치수 확인').click();
  await button('깊이 치수 확인').click();
  await expect(button('책상을 비교 공간에 추가')).toBeEnabled();
  await button('cm').click();
  await expect(page.locator('#width')).toHaveValue('60');
  await button('책상을 비교 공간에 추가').click();
  await button('놓인 물건').click();
  const lastRow = page.locator('.object-row').last();
  await expect(lastRow).toContainText('60 × 120 × 74 cm');
  await expect(lastRow).toContainText('사진에서 만든 책상');
});

test('requires confirmation of uncertain axes before adding a non-desk product', async ({ page }) => {
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    candidates: [{
      label: '예시 받침대',
      dimensions: {
        width: { mm: 130, evidence: '아래쪽 치수선', needsReview: false },
        depth: { mm: null, evidence: '표기 없음', needsReview: true },
        height: { mm: 35, evidence: '전체 높이 확인 필요', needsReview: true },
      },
    }],
  } }));
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await button('이미지 분석').click();
  await expect(page.locator('#width')).toHaveValue('130');
  await page.locator('#depth').fill('80');
  await button('3D로 크기 비교하기').click();
  await expect(page.locator('#input-error')).toContainText('확인 필요');
  await button('높이 치수 확인').click();
  await button('3D로 크기 비교하기').click();
  await button('놓인 물건').click();
  await expect(page.locator('.object-row').last()).toContainText('130 × 80 × 35 mm');
});

test('uses only the chosen option from a multiple-candidate response', async ({ page }) => {
  const reading = (mm: number) => ({ mm, evidence: '치수표', needsReview: false });
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    candidates: [
      { label: 'S', dimensions: { width: reading(100), depth: reading(80), height: reading(50) } },
      { label: 'L', dimensions: { width: reading(250), depth: reading(140), height: reading(80) } },
    ],
  } }));
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  const large = page.getByRole('radio', { name: /^L / });
  await large.check();
  await expect(page.getByRole('radio', { name: /^S / })).not.toBeChecked();
  await expect(page.locator('#width')).toHaveValue('250');
  await expect(page.locator('#depth')).toHaveValue('140');
  await expect(page.locator('#height')).toHaveValue('80');
});

test('cancels a touch handle drag when a second finger lands', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 420, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
    await page.getByRole('button', { name: '내가 궁금한 상자 선택', exact: true }).click();
    await page.getByRole('button', { name: '정면', exact: true }).click();
    await page.getByRole('button', { name: '선택 맞춤', exact: true }).click();
    const canvas = page.locator('.scene canvas');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = (await canvas.boundingBox())!;
    const x = Math.round(bounds.x + bounds.width / 2);
    let y = Math.round(bounds.y + bounds.height / 2) - 40;
    // Locate the Y handle without assuming its exact rendered length.
    for (const dy of [40, 30, 50, 20, 60]) {
      y = Math.round(bounds.y + bounds.height / 2) - dy;
      await page.mouse.move(x, y);
      if (await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor === 'grab')) break;
    }
    await expect(canvas).toHaveCSS('cursor', 'grab');
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchMove', [{ x, y: y - 35, id: 1 }]);
    await expect(page.locator('.viewer')).toHaveClass(/is-moving-product/);
    await touch('touchStart', [{ x, y: y - 35, id: 1 }, { x: x - 60, y, id: 2 }]);
    await expect(page.locator('.viewer')).not.toHaveClass(/is-moving-product/);
    await touch('touchEnd', []);
    await expect(page.getByLabel('높이 (mm)')).toHaveValue('0');
    await expect(page.getByRole('button', { name: '실행 취소' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '정면', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await context.close();
  }
});

test('puts a monitor on a platform and preserves overlap correction with snapping off', async ({ page }) => {
  await page.addInitScript(() => {
    const positionMm = { x: 0, y: 0, z: 0 };
    localStorage.setItem('noruler-v2', JSON.stringify({
      schemaVersion: 2, library: [], unit: 'mm',
      instances: [
        { id: 'platform', assetId: null, snapshot: { name: '받침대', width: 700, depth: 400, height: 100 }, positionMm, yawDeg: 0 },
        { id: 'monitor', assetId: 'monitor', shape: 'monitor', snapshot: { name: '모니터', width: 615, depth: 200, height: 455 }, positionMm: { ...positionMm, y: 150 }, yawDeg: 0 },
      ],
    }));
  });
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('놓인 물건').click();
  await button('모니터 선택').click();
  const height = page.getByLabel('높이 (mm)');
  await height.fill('110');
  await button('적용').click();
  await expect(height).toHaveValue('100');
  await button('자동 붙이기 켜짐').click();
  await height.fill('110');
  await button('적용').click();
  await expect(height).toHaveValue('110');
  await height.fill('90');
  await button('적용').click();
  await expect(height).toHaveValue('100');
});

const deskSubject = {
  id: 'desk', label: '흰색 책상',
  shapeEvidence: {
    readiness: 'ready', kind: 'cross-braced-desk',
    parts: ['tabletop', 'fourSquareLegs', 'sideStretchers', 'rearCrossBrace'],
  },
};
const imageReading = (mm: number | null) => ({ mm, evidence: mm === null ? '' : '치수선', needsReview: mm === null });
const deskOptions = [[800, 500], [1000, 600], [1200, 600]].map(([width, depth]) => ({
  id: String(width), subjectId: 'desk', label: String(width),
  dimensions: { width: imageReading(width), depth: imageReading(depth), height: imageReading(740) },
  clearance: imageReading(700),
}));

test('shows a desk draft with missing measurements and keeps edits per option', async ({ page }) => {
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    subjects: [deskSubject], candidates: deskOptions.map(option => option.id === '800' ? {
      ...option, dimensions: { width: imageReading(null), depth: imageReading(null), height: imageReading(null) },
    } : option),
  } }));
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  const choose = (option: number) => page.getByRole('radio', { name: new RegExp(`^${option} `) }).check();
  await choose(800);
  const preview = page.getByRole('region', { name: '책상 3D 초안' });
  await expect(preview.locator('canvas')).toBeVisible();
  await expect(preview).toContainText('치수 미확정');
  await expect(page.locator('#width')).toHaveValue('');
  await expect(page.locator('button[type=submit]')).toBeDisabled();
  await page.locator('#width').fill('810');
  await page.locator('#depth').fill('510');
  await page.locator('#height').fill('740');
  await preview.getByRole('button', { name: '앞뒤 바꾸기' }).click();
  await expect(preview.getByRole('button', { name: '앞뒤 바꾸기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[type=submit]')).toBeEnabled();
  await choose(1000);
  await expect(page.locator('#width')).toHaveValue('1000');
  await expect(page.locator('#depth')).toHaveValue('600');
  await choose(1200);
  await expect(page.locator('#width')).toHaveValue('1200');
  await choose(800);
  await expect(page.locator('#width')).toHaveValue('810');
  await expect(page.locator('#depth')).toHaveValue('510');
  await expect(preview.getByRole('button', { name: '앞뒤 바꾸기' })).toHaveAttribute('aria-pressed', 'true');
});

test('keeps the manual comparison path available for unsupported image shapes and failed analysis', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/image-dimensions', route => ++attempt === 1
    ? route.fulfill({ json: {
        subjects: [{ ...deskSubject, shapeEvidence: { ...deskSubject.shapeEvidence, kind: 'other' } }],
        candidates: [deskOptions[0]],
      } })
    : route.fulfill({ status: 502, json: { error: '분석 실패' } }));
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  const analyze = page.getByRole('button', { name: '이미지 분석' });
  await analyze.click();
  await expect(page.getByText('이 형태는 아직 3D 초안을 지원하지 않아요.', { exact: false })).toBeVisible();
  await expect(page.locator('#width')).toHaveValue('800');
  await analyze.click();
  await expect(page.getByRole('alert')).toContainText('분석 실패');
  await page.locator('#width').fill('800');
  await page.locator('#depth').fill('500');
  await page.locator('#height').fill('740');
  await expect(page.getByRole('button', { name: '3D로 크기 비교하기' })).toBeEnabled();
});

test('cancels a pending image analysis without applying its late result', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/image-dimensions', async route => {
    await pending;
    await route.fulfill({ json: { subjects: [deskSubject], candidates: [deskOptions[0]] } }).catch(() => {});
  });
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  await page.getByRole('button', { name: '분석 취소' }).click();
  release();
  await expect(page.getByRole('button', { name: '이미지 분석' })).toBeEnabled();
  await expect(page.getByRole('region', { name: '책상 3D 초안' })).toHaveCount(0);
});

test('keeps the desk shape through placement, duplication, edits, undo and reload', async ({ page }) => {
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    subjects: [deskSubject], candidates: [deskOptions[0]],
  } }));
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  await page.getByRole('button', { name: '앞뒤 바꾸기' }).click();
  await page.getByRole('button', { name: '책상을 비교 공간에 추가' }).click();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  const desks = page.locator('.object-row').filter({ hasText: '사진에서 만든 책상' });
  await expect(desks).toHaveCount(1);
  await expect(desks.first()).toContainText('800 × 500 × 740 mm');
  await desks.first().getByRole('button', { name: /복제/ }).click();
  await expect(desks).toHaveCount(2);
  await desks.last().getByRole('button', { name: '치수 수정' }).click();
  await page.locator('#width').fill('820');
  await page.getByRole('button', { name: '치수 수정 적용' }).click();
  await expect(desks.last()).toContainText('820 × 500 × 740 mm');
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(desks.last()).toContainText('800 × 500 × 740 mm');
  await page.getByRole('button', { name: '다시 실행' }).click();
  await page.reload();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  await expect(desks.last()).toContainText('820 × 500 × 740 mm');
  await page.getByRole('button', { name: '내 모델', exact: true }).click();
  await page.getByRole('button', { name: '꺼내기' }).first().click();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  await expect(desks).toHaveCount(3);
  const shapes = await page.evaluate(() => JSON.parse(localStorage.getItem('noruler-v3')!).instances
    .map((instance: { snapshot: { deskShape?: { frontFlipped: boolean } } }) => instance.snapshot.deskShape)
    .filter(Boolean));
  expect(shapes).toHaveLength(3);
  expect(shapes.every((shape: { frontFlipped: boolean }) => shape.frontFlipped)).toBe(true);
});

const measurement = (id: string, axis: string | null, mm: number, sourceId = 'photo', location = '치수선', scope = 'overall') =>
  ({ id, axis, mm, sourceId, location, scope, quote: `${mm} mm` });

test('reviews the product region and both sources in a composite image', async ({ page }) => {
  const size = [measurement('arrow', 'width', 500), measurement('table', 'width', 500, 'photo', '사양표 크기 행')];
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    subjects: [{ id: 'stand', label: '모니터 받침대', shapeEvidence: {
      readiness: 'ready', kind: 'other', parts: [], region: { left: .1, top: .2, right: .8, bottom: .7 },
    } }],
    candidates: [{ id: 'stand-1', subjectId: 'stand', label: '기본형',
      dimensions: { width: { ...imageReading(500), measurements: size }, depth: imageReading(200), height: imageReading(82) },
      measurements: size,
    }],
  } }));
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  await expect(page.getByLabel('제품명', { exact: true })).toHaveValue('모니터 받침대 · 기본형');
  await expect(page.locator('#height')).toHaveValue('82');
  await page.getByText('치수 출처 확인').click();
  await expect(page.getByText('상품 사진 · 치수선 · 500 mm')).toBeVisible();
  await expect(page.getByText('상품 사진 · 사양표 크기 행 · 500 mm')).toBeVisible();
  await page.getByRole('button', { name: /원본 확대/ }).click();
  const outline = page.getByLabel('선택한 상품 영역');
  await expect(outline).toBeVisible();
  const originalStyle = await outline.getAttribute('style');
  await page.getByRole('button', { name: '상품 영역 다시 지정' }).click();
  const image = await page.getByAltText('확대한 상품 사진').boundingBox();
  if (!image) throw new Error('Product image not visible');
  await page.mouse.move(image.x + image.width * .2, image.y + image.height * .3);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * .7, image.y + image.height * .6);
  await page.mouse.up();
  await expect(outline).not.toHaveAttribute('style', originalStyle!);
});

test('adds late specifications without resetting the draft and reviews conflicts', async ({ page }) => {
  const rows = [
    { id: 'wrong', label: '다른 모델', modelCode: 'B', optionCode: '', measurements: [measurement('w', 'width', 1000, 'spec-text')] },
    { id: 'package', label: '포장', modelCode: 'A', optionCode: '', measurements: [measurement('p', 'width', 1000, 'spec-text', '포장 치수', 'package')] },
    { id: 'match', label: '본체', modelCode: 'A', optionCode: '800', measurements: [
      measurement('w2', 'width', 805, 'spec-text'), measurement('h2', 'height', 750, 'spec-text'), measurement('d2', null, 510, 'spec-text'),
    ] },
  ];
  let requestCount = 0;
  await page.route('**/api/image-dimensions', route => {
    if (++requestCount === 1) return route.fulfill({ json: {
      subjects: [{ ...deskSubject, modelCode: 'A' }],
      candidates: [{ ...deskOptions[0], optionCode: '800', measurements: [measurement('w1', 'width', 800), measurement('h1', 'height', 740)],
        dimensions: { width: imageReading(800), height: imageReading(740), depth: imageReading(null) } }],
    } });
    expect(route.request().postData()).toContain('name="spec-text"');
    expect(route.request().postData()).not.toContain('name="photo"');
    return route.fulfill({ json: { subjects: [], candidates: [], specRows: rows } });
  });
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  await expect(page.locator('#width')).toHaveValue('800');
  await page.locator('#width').fill('810');
  await page.getByRole('button', { name: '앞뒤 바꾸기' }).click();
  await page.getByText('별도 치수 자료 추가').click();
  await page.getByLabel('치수 또는 사양 텍스트').fill('모델 A / 800');
  await page.getByRole('button', { name: '추가 사양 분석' }).click();
  await page.getByRole('radio', { name: /^다른 모델/ }).check();
  await expect(page.getByText('모델 번호 또는 옵션이 달라 연결할 수 없어요.')).toBeVisible();
  await page.getByRole('radio', { name: /^포장/ }).check();
  await expect(page.getByRole('button', { name: '선택한 사양 적용' })).toBeDisabled();
  await page.getByRole('radio', { name: /^본체 · 연결 후보/ }).check();
  await page.getByLabel(/510 mm · 입력한 사양/).selectOption('depth');
  await page.getByRole('button', { name: '선택한 사양 적용' }).click();
  await expect(page.locator('#width')).toHaveValue('810');
  await expect(page.locator('#depth')).toHaveValue('510');
  await expect(page.locator('#height')).toHaveValue('');
  await expect(page.getByRole('button', { name: '책상을 비교 공간에 추가' })).toBeDisabled();
  await page.getByRole('button', { name: '750 mm 사용' }).click();
  await expect(page.locator('#height')).toHaveValue('750');
  await expect(page.getByRole('button', { name: '앞뒤 바꾸기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '책상을 비교 공간에 추가' })).toBeEnabled();
});

test('sends a photo and separate specification capture together in initial analysis', async ({ page }) => {
  await page.route('**/api/image-dimensions', route => {
    expect(route.request().headers()['content-type']).toMatch(/^multipart\/form-data/);
    expect(route.request().postData()).toContain('name="photo"');
    expect(route.request().postData()).toContain('name="spec-image"');
    return route.fulfill({ json: { subjects: [deskSubject], candidates: [deskOptions[0]], specRows: [{
      id: 'table', label: '책상 사양표', modelCode: '', optionCode: '',
      measurements: [measurement('t1', 'width', 800, 'spec-image', '크기 행')],
    }] } });
  });
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByText('별도 치수 자료 추가').click();
  await page.locator('#spec-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();
  await page.getByRole('radio', { name: /^책상 사양표/ }).check();
  await page.getByRole('button', { name: '선택한 사양 적용' }).click();
  await expect(page.locator('#width')).toHaveValue('800');
});

test('builds, flips, places, duplicates, edits, and restores a parametric 3D model', async ({ page }) => {
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: {
    subjects: [{
      id: 'stand',
      label: '모니터 받침대',
      shapeEvidence: {
        readiness: 'ready',
        kind: 'other',
        view: '정면 사선',
        parts: ['other'],
        unseen: '뒷면 두께',
        nextView: '',
        parametric: {
          kind: 'box-parts-v1',
          frontFlipped: false,
          ratio: { width: 5, depth: 2, height: 0.82 },
          parts: [
            { kind: 'box', x0: 0, x1: 1, y0: 0.72, y1: 1, z0: 0, z1: 1, color: '#556987', radius: 0.15 },
            { kind: 'box', x0: 0.04, x1: 0.14, y0: 0, y1: 0.72, z0: 0.1, z1: 0.9, color: '#384b68', radius: 0 },
            { kind: 'box', x0: 0.86, x1: 0.96, y0: 0, y1: 0.72, z0: 0.1, z1: 0.9, color: '#384b68', radius: 0 },
          ],
        },
      },
    }],
    candidates: [{
      id: 'stand-1',
      subjectId: 'stand',
      label: '기본형',
      dimensions: {
        width: { mm: 500, evidence: '치수선', needsReview: false },
        depth: { mm: null, evidence: '', needsReview: true },
        height: { mm: 82, evidence: '치수선', needsReview: false },
      },
    }],
  } }));

  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석' }).click();

  const preview = page.getByRole('region', { name: '3D 형태 초안' });
  await expect(preview.locator('canvas')).toBeVisible();
  await expect(preview).toContainText('치수 미확정');
  await expect(preview).toContainText('부품 조합');
  const submit = page.getByRole('button', { name: '3D 모델을 비교 공간에 추가' });
  await expect(submit).toBeDisabled();

  await page.locator('#depth').fill('200');
  await preview.getByRole('button', { name: '앞뒤 바꾸기' }).click();
  await expect(preview.getByRole('button', { name: '앞뒤 바꾸기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();

  const models = page.locator('.object-row').filter({ hasText: '사진에서 만든 3D 모델' });
  await expect(models).toHaveCount(1);
  await expect(models.first()).toContainText('500 × 200 × 82 mm');

  await models.first().getByRole('button', { name: /복제/ }).click();
  await expect(models).toHaveCount(2);
  await models.last().getByRole('button', { name: '치수 수정' }).click();
  await page.locator('#width').fill('540');
  await page.getByRole('button', { name: '치수 수정 적용' }).click();
  await expect(models.last()).toContainText('540 × 200 × 82 mm');

  await page.reload();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  await expect(models.last()).toContainText('540 × 200 × 82 mm');
  const shapes = await page.evaluate(() => JSON.parse(localStorage.getItem('noruler-v3')!).instances
    .map((instance: { snapshot: { parametricShape?: { kind: string; frontFlipped: boolean } } }) => instance.snapshot.parametricShape)
    .filter(Boolean));
  expect(shapes).toHaveLength(2);
  expect(shapes.every((shape: { kind: string; frontFlipped: boolean }) => shape.kind === 'box-parts-v1' && shape.frontFlipped)).toBe(true);
});

test('supports going back from example drawing and uploaded image, and differentiates multiple generated models', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });

  await button('예시 도면 써보기').click();
  await expect(button('뒤로가기')).toBeVisible();
  await expect(button('예시 도면 써보기')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '책상 3D 초안' })).toBeVisible();

  await button('뒤로가기').click();
  await expect(page.getByRole('region', { name: '책상 3D 초안' })).toHaveCount(0);
  await expect(button('뒤로가기')).toHaveCount(0);
  await expect(button('예시 도면 써보기')).toBeVisible();
  await button('치수 직접 입력').click();
  await expect(page.getByLabel('제품명', { exact: true })).toHaveValue('내가 궁금한 상자');
  await expect(page.locator('#width')).toHaveValue('24');
  await expect(page.locator('#depth')).toHaveValue('18');
  await expect(page.locator('#height')).toHaveValue('16');
  await expect(button('cm')).toHaveAttribute('aria-pressed', 'true');
  await button('사진·도면으로 가져오기').click();

  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await expect(button('뒤로가기')).toBeVisible();
  await expect(page.getByRole('button', { name: /원본 확대/ })).toBeVisible();
  await button('뒤로가기').click();
  await expect(button('뒤로가기')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /원본 확대/ })).toHaveCount(0);

  await button('예시 도면 써보기').click();
  await button('사이드바 접기').click();
  await expect(page.locator('.studio-drawer')).toBeHidden();
  await expect(page.locator('.studio-shell')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.scene canvas')).toBeVisible();
  await button('사이드바 열기').click();
  await expect(page.locator('.studio-drawer')).toBeVisible();
  await expect(page.getByRole('region', { name: '책상 3D 초안' })).toBeVisible();

  await button('책상을 비교 공간에 추가').click();
  await page.getByRole('radio', { name: /^1200 / }).check();
  await button('책상을 비교 공간에 추가').click();
  await button('놓인 물건').click();

  const productIcons = page.locator('.object-row .object-icon.is-product');
  await expect(productIcons).toHaveCount(3);
  const accents = await productIcons.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).style.getPropertyValue('--accent')),
  );
  expect(accents.every(Boolean)).toBe(true);
  expect(new Set(accents).size).toBe(3);
  expect(errors).toEqual([]);
});

test('shows clear fallback guidance in DraftStatusPanel when 3D draft cannot be created', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/image-dimensions', route => {
    attempt += 1;
    if (attempt === 1) {
      return route.fulfill({ json: {
        subjects: [{
          id: 'shelf',
          label: '원목 선반',
          shapeEvidence: {
            readiness: 'needs_view',
            kind: 'other',
            view: '정면',
            parts: ['other'],
            unseen: '측면 깊이',
            nextView: '측면 또는 사선',
          },
        }],
        candidates: [{
          id: 'shelf-1',
          subjectId: 'shelf',
          label: '기본',
          dimensions: { width: imageReading(600), depth: imageReading(null), height: imageReading(900) },
        }],
      } });
    }
    if (attempt === 2) {
      return route.fulfill({ json: {
        subjects: [{
          id: 'chair',
          label: '접이식 의자',
          shapeEvidence: { readiness: 'ready', kind: 'other', view: '사선', parts: ['other'], unseen: '', nextView: '' },
        }],
        candidates: [{
          id: 'chair-1',
          subjectId: 'chair',
          label: '기본',
          dimensions: { width: imageReading(480), depth: imageReading(510), height: imageReading(780) },
        }],
      } });
    }
    return route.fulfill({ status: 502, json: { error: '분석 서버에 일시적 오류가 발생했어요.' } });
  });

  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  const analyze = page.getByRole('button', { name: '이미지 분석' });

  await analyze.click();
  const statusRegion = page.getByRole('region', { name: '3D 초안 상태' });
  await expect(statusRegion).toContainText('형태 초안을 만들려면 다른 각도 사진이 필요해요');
  await expect(statusRegion).toContainText('측면 또는 사선 사진이 있으면');
  await expect(statusRegion).toContainText('실제 외곽 크기의 3D 상자');

  await analyze.click();
  await expect(statusRegion).toContainText('이 형태는 아직 3D 초안을 지원하지 않아요.');
  await expect(statusRegion).toContainText('가로·깊이·높이 외곽 기준의 3D 상자');

  await analyze.click();
  await expect(statusRegion).toContainText('이미지를 자동으로 분석하지 못했어요');
  await expect(page.getByRole('alert')).toContainText('분석 서버에 일시적 오류가 발생했어요.');
  await page.getByLabel('제품명', { exact: true }).fill('직접 입력 수납함');
  await page.locator('#width').fill('320');
  await page.locator('#depth').fill('220');
  await page.locator('#height').fill('150');
  await page.getByRole('button', { name: '3D로 크기 비교하기' }).click();
  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  await expect(page.locator('.object-row').last()).toContainText('직접 입력 수납함');
  await expect(page.locator('.object-row').last()).toContainText('320 × 220 × 150 mm');
});

test('drags the selected object body directly on the floor without lifting it', async ({ page }) => {
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('놓인 물건').click();
  await button('내가 궁금한 상자 선택').click();
  await button('선택 맞춤').click();

  const canvas = page.locator('.scene canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  let dragX = cx - 75;
  let dragY = cy + 35;
  for (const [dx, dy] of [[-75, 35], [-90, 0], [75, 35], [-55, -45], [55, -45], [-110, 40], [0, 65]]) {
    const px = Math.round(cx + dx);
    const py = Math.round(cy + dy);
    await page.mouse.move(px, py);
    if (await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor === 'move')) {
      dragX = px;
      dragY = py;
      break;
    }
  }
  await expect(canvas).toHaveCSS('cursor', 'move');

  await page.mouse.down();
  await page.mouse.move(dragX + 90, dragY + 18, { steps: 10 });
  await expect(page.locator('.viewer')).toHaveClass(/is-moving-product/);
  await page.mouse.up();
  await expect(page.locator('.viewer')).not.toHaveClass(/is-moving-product/);

  await expect(page.getByLabel('높이 (mm)')).toHaveValue('0');
  const undo = button('실행 취소');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
});

test('drops a floating object straight to the floor with 바닥에 놓기', async ({ page }) => {
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('놓인 물건').click();
  await button('내가 궁금한 상자 선택').click();

  const ground = button('바닥에 놓기');
  await expect(ground).toBeDisabled();

  const height = page.getByLabel('높이 (mm)');
  await height.fill('120');
  await button('적용').click();
  await expect(height).toHaveValue('120');
  await expect(page.locator('.object-move-bar [role="status"]')).toContainText('120 mm 떠 있음');
  await expect(ground).toBeEnabled();

  await ground.click();
  await expect(height).toHaveValue('0');
  await expect(ground).toBeDisabled();
});

test('switches between Catppuccin Latte and Mocha themes with persistence and icon-only collapsed rail', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  const drawer = page.locator('.studio-drawer');
  const rail = page.locator('.studio-rail');
  const shell = page.locator('.studio-shell');

  const viewer = page.locator('.viewer');
  const scaleBadge = page.locator('.scale-badge');

  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(239, 241, 245)');
  await expect(drawer).toHaveCSS('background-color', 'rgb(230, 233, 239)');
  await expect(viewer).toHaveCSS('border-color', 'rgb(204, 208, 218)');
  await expect(scaleBadge).toHaveCSS('color', 'rgb(76, 79, 105)');
  const lightViewerBg = await viewer.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(lightViewerBg).toContain('230, 233, 239');

  await page.getByRole('button', { name: '다크 모드로 전환', exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 30, 46)');
  await expect(drawer).toHaveCSS('background-color', 'rgb(24, 24, 37)');
  await expect(viewer).toHaveCSS('border-color', 'rgb(49, 50, 68)');
  await expect(scaleBadge).toHaveCSS('color', 'rgb(205, 214, 244)');
  const darkViewerBg = await viewer.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(darkViewerBg).toContain('30, 30, 46');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 30, 46)');

  await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
  await expect(shell).toHaveClass(/is-collapsed/);
  await expect(drawer).not.toBeVisible();
  const railBox = await rail.boundingBox();
  expect(railBox?.width).toBeLessThanOrEqual(58);
  const labelBox = await rail.locator('.rail-label').first().boundingBox();
  expect(labelBox?.width ?? 0).toBeLessThanOrEqual(2);

  await page.getByRole('button', { name: '놓인 물건', exact: true }).click();
  await expect(shell).not.toHaveClass(/is-collapsed/);
  await expect(drawer).toBeVisible();
});

test('renders a mobile bottom-sheet app shell with zero horizontal overflow across narrow phone viewports', async ({ browser }) => {
  for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ hasTouch: true, viewport });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('.scene canvas')).toBeVisible();

      const button = (name: string) => page.getByRole('button', { name, exact: true });
      const assertNoOverflow = async () => {
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
      };

      await assertNoOverflow();
      await expect(page.locator('.sidebar-toggle-button')).toBeHidden();

      for (const selector of ['.theme-toggle-button', '.help-button']) {
        const box = await page.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      const drawer = page.locator('.studio-drawer');
      await expect(drawer).toBeHidden();

      const stageBox = (await page.locator('.studio-stage').boundingBox())!;
      const rail = page.locator('.studio-rail');
      const railBox = (await rail.boundingBox())!;
      expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(railBox.y + 1);
      expect(railBox.y + railBox.height).toBeLessThanOrEqual(viewport.height + 1);

      const labelBoxes = await rail.locator('.rail-label').evaluateAll(nodes =>
        nodes.map(node => node.getBoundingClientRect().width),
      );
      expect(labelBoxes).toHaveLength(4);
      for (const width of labelBoxes) {
        expect(width).toBeGreaterThan(10);
      }

      const viewerBox = (await page.locator('.viewer').boundingBox())!;
      for (const selector of ['.view-switch', '.object-move-bar', '.scale-badge', '.grid-caption', '.viewer-tools']) {
        const hudBox = (await page.locator(selector).boundingBox())!;
        expect(hudBox.x).toBeGreaterThanOrEqual(viewerBox.x - 1);
        expect(hudBox.y).toBeGreaterThanOrEqual(viewerBox.y - 1);
        expect(hudBox.x + hudBox.width).toBeLessThanOrEqual(viewerBox.x + viewerBox.width + 1);
        expect(hudBox.y + hudBox.height).toBeLessThanOrEqual(viewerBox.y + viewerBox.height + 1);
      }
      const captionBox = (await page.locator('.grid-caption').boundingBox())!;
      const toolsBox = (await page.locator('.viewer-tools').boundingBox())!;
      expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(toolsBox.x + 1);

      await button('제품 추가').click();
      await expect(drawer).toBeVisible();
      await assertNoOverflow();

      await button('패널 크게 보기').click();
      await expect(drawer).toHaveClass(/is-expanded/);
      await assertNoOverflow();
      await button('패널 기본 크기로').click();
      await expect(drawer).not.toHaveClass(/is-expanded/);
      await assertNoOverflow();

      await button('치수 직접 입력').click();
      await page.getByLabel('제품명', { exact: true }).fill('모바일 수납함');
      await button('3D로 크기 비교하기').click();
      await expect(drawer).toBeHidden();
      await assertNoOverflow();

      await button('프리셋').click();
      await expect(drawer).toBeVisible();
      await assertNoOverflow();

      await button('놓인 물건').click();
      await expect(drawer).toBeVisible();
      await assertNoOverflow();

      await button('모바일 수납함 선택').click();
      const moveControls = page.locator('.move-controls');
      await expect(moveControls).toBeVisible();
      const moveControlsBox = (await moveControls.boundingBox())!;
      expect(moveControlsBox.x).toBeGreaterThanOrEqual(0);
      expect(moveControlsBox.x + moveControlsBox.width).toBeLessThanOrEqual(viewport.width + 1);
      await assertNoOverflow();

      await button('내 모델').click();
      await expect(drawer).toBeVisible();
      await assertNoOverflow();
      await button('패널 크게 보기').click();
      await assertNoOverflow();

      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
