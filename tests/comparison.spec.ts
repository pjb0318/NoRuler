import { test, expect } from '@playwright/test';

test('adds and edits one copy independently, and restores the scene after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const rows = page.locator('.object-row');
  await expect(page.locator('canvas')).toBeVisible();
  await button('500mL 물병 공간에 추가').click();
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
  await page.getByLabel('제품명', { exact: true }).fill('테스트 수납함');
  await button('3D로 크기 비교하기').click();
  await button('프리셋 등록').click();
  await button('꺼내기').first().click();
  const boxes = page.locator('.object-row').filter({ hasText: '테스트 수납함' });
  await expect(boxes).toHaveCount(2);
  await button('기록 삭제').click();
  await button('프리셋 삭제').click();
  await expect(boxes).toHaveCount(2);
  await expect(button('꺼내기')).toHaveCount(0);
});

test('reviews a diagram, preserves converted units, and requires confirmation of uncertain axes', async ({ page }) => {
  await page.goto('/');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('예시 도면 써보기').click();
  await page.getByRole('button', { name: /원본 확대/ }).click();
  await button('원본 더 확대').click();
  await expect(page.getByRole('dialog')).toContainText('150%');
  await button('닫기').click();
  await page.locator('#depth').fill('80');
  await button('3D로 크기 비교하기').click();
  await expect(page.getByRole('alert')).toContainText('확인 필요');
  await button('높이 치수 확인').click();
  await button('축 교환').click();
  await expect(page.locator('#width')).toHaveValue('80');
  await expect(page.locator('#depth')).toHaveValue('130');
  await button('가로 치수 확인').click();
  await button('깊이 치수 확인').click();
  await button('cm').click();
  await expect(page.locator('#width')).toHaveValue('8');
  await button('3D로 크기 비교하기').click();
  await expect(page.locator('.object-row').last()).toContainText('8 × 13 × 3.5 cm');
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
    await page.getByRole('button', { name: '내가 궁금한 상자 선택', exact: true }).click();
    await page.getByRole('button', { name: '정면', exact: true }).click();
    await page.getByRole('button', { name: '선택 맞춤', exact: true }).click();
    const canvas = page.locator('canvas');
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
  await expect(desks.last()).toContainText('820 × 500 × 740 mm');
  await page.getByRole('button', { name: '꺼내기' }).first().click();
  await expect(desks).toHaveCount(3);
  const shapes = await page.evaluate(() => JSON.parse(localStorage.getItem('noruler-v3')!).instances
    .map((instance: { snapshot: { deskShape?: { frontFlipped: boolean } } }) => instance.snapshot.deskShape)
    .filter(Boolean));
  expect(shapes).toHaveLength(3);
  expect(shapes.every((shape: { frontFlipped: boolean }) => shape.frontFlipped)).toBe(true);
});
