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
