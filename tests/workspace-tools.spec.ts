import { test, expect, type Page } from '@playwright/test';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const seed = async (page: Page) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('noruler-v3')) return;
    localStorage.setItem('noruler-v3', JSON.stringify({
      schemaVersion: 3, library: [], camera: null, unit: 'mm',
      preferences: { names: true, dimensions: false, grid: true, snap: false },
      instances: [
        { id: 'base', assetId: null, snapshot: { name: '받침 상자', width: 500, depth: 500, height: 200 }, positionMm: { x: 0, y: 0, z: 0 }, yawDeg: 0 },
        { id: 'upper', assetId: null, snapshot: { name: '위쪽 상자', width: 100, depth: 100, height: 100 }, positionMm: { x: 0, y: 600, z: 0 }, yawDeg: 0 },
        { id: 'side', assetId: null, snapshot: { name: '옆 상자', width: 100, depth: 100, height: 100 }, positionMm: { x: 800, y: 600, z: 0 }, yawDeg: 0 },
      ],
    }));
  });
  await page.goto('/');
  await expect(page.locator('.scene canvas')).toBeVisible();
  await button(page, '놓인 물건').click();
};
const poses = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('noruler-v3')!).instances as { id: string; positionMm: { x: number; y: number; z: number }; yawDeg: number }[]);

test('lowers onto the highest support beneath without changing horizontal position, and persists undo/redo', async ({ page }) => {
  await seed(page);
  await button(page, '위쪽 상자 선택').click();
  await button(page, '바닥에 놓기').click();
  await expect(page.getByLabel('높이 (mm)')).toHaveValue('200');
  await expect(page.locator('.object-move-bar')).toContainText('물건 위에 놓여 있어요');
  await expect.poll(async () => (await poses(page)).find(item => item.id === 'upper')?.positionMm).toEqual({ x: 0, y: 200, z: 0 });
  await button(page, '실행 취소').click();
  await expect(page.getByLabel('높이 (mm)')).toHaveValue('600');
  await button(page, '다시 실행').click();
  await expect(page.getByLabel('높이 (mm)')).toHaveValue('200');
  await page.reload();
  await button(page, '놓인 물건').click();
  await button(page, '위쪽 상자 선택').click();
  await expect(page.getByLabel('높이 (mm)')).toHaveValue('200');
});

test('groups only while enabled, transforms rigidly, grounds onto support, and undoes in one step', async ({ page }) => {
  await seed(page);
  await button(page, '위쪽 상자 선택').click();
  await button(page, '옆 상자 선택').click();
  await expect(button(page, '위쪽 상자 선택')).toHaveAttribute('aria-pressed', 'false');
  await button(page, '그룹 묶기').click();
  await button(page, '위쪽 상자 선택').click();
  await expect(page.locator('.group-toggle')).toContainText('2개 선택');
  await button(page, '바닥에 놓기').click();
  await expect.poll(async () => (await poses(page)).filter(item => item.id !== 'base').map(item => item.positionMm.y)).toEqual([200, 200]);
  await button(page, '실행 취소').click();
  await expect.poll(async () => (await poses(page)).filter(item => item.id !== 'base').map(item => item.positionMm.y)).toEqual([600, 600]);

  await button(page, '+90°').click();
  await expect.poll(async () => (await poses(page)).filter(item => item.id !== 'base').map(item => Math.round(item.yawDeg))).toEqual([90, 90]);
  const rotated = await poses(page);
  expect(Math.round(rotated.find(item => item.id === 'side')!.positionMm.x)).toBe(0);
  expect(Math.abs(rotated.find(item => item.id === 'side')!.positionMm.z)).toBeCloseTo(800);
  await button(page, '실행 취소').click();
  await expect.poll(async () => (await poses(page)).find(item => item.id === 'side')!.positionMm).toEqual({ x: 800, y: 600, z: 0 });

  await page.getByLabel('높이 (mm)').fill('900');
  await button(page, '적용').click();
  await expect.poll(async () => (await poses(page)).filter(item => item.id !== 'base').map(item => item.positionMm.y)).toEqual([900, 900]);
  await page.locator('.group-toggle').click();
  await expect(page.locator('.group-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('높이 (mm)').fill('1000');
  await button(page, '적용').click();
  await expect.poll(async () => (await poses(page)).find(item => item.id === 'side')!.positionMm.y).toBe(900);
});

test('drags a group with fixed spacing, undoes once, and cancels without changing saved poses', async ({ page }) => {
  await seed(page);
  await button(page, '위쪽 상자 선택').click();
  await button(page, '그룹 묶기').click();
  await button(page, '옆 상자 선택').click();
  await button(page, '위에서').click();
  await button(page, '선택 맞춤').click();
  const canvas = page.locator('.scene canvas');
  const findBody = async () => {
    const box = (await canvas.boundingBox())!;
    for (const [dx, dy] of [[-35, 25], [-25, -35], [35, 25], [-55, 35], [55, -35], [-75, 50]]) {
      const x = box.x + box.width / 2 + dx;
      const y = box.y + box.height / 2 + dy;
      await page.mouse.move(x, y);
      if (await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor === 'move')) return { x, y };
    }
    throw new Error('No draggable object body found');
  };
  const before = await poses(page);
  const point = await findBody();
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y + 30, { steps: 10 });
  await expect(page.locator('.viewer')).toHaveClass(/is-moving-product/);
  await page.mouse.up();
  await expect.poll(async () => (await poses(page)).find(item => item.id === 'side')!.positionMm.x).not.toBe(800);
  const after = await poses(page);
  const upper = after.find(item => item.id === 'upper')!.positionMm;
  const side = after.find(item => item.id === 'side')!.positionMm;
  expect(side.x - upper.x).toBeCloseTo(800);
  expect(side.z - upper.z).toBeCloseTo(0);
  await button(page, '실행 취소').click();
  await expect.poll(() => poses(page)).toEqual(before);
  await button(page, '선택 맞춤').click();
  const second = await findBody();
  await page.mouse.down();
  await page.mouse.move(second.x + 60, second.y + 30, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.viewer')).not.toHaveClass(/is-moving-product/);
  expect(await poses(page)).toEqual(before);
  await expect(button(page, '실행 취소')).toBeDisabled();
});

test('resizes desktop panels with pointer and keyboard, preserving minimum panel and scene sizes', async ({ page }, testInfo) => {
  await seed(page);
  await button(page, '위쪽 상자 선택').click();
  const sidebar = page.getByRole('separator', { name: '사이드바 너비 조절' });
  const lower = page.getByRole('separator', { name: '하단 조작 영역 높이 조절' });
  const scene = page.locator('.viewer');
  const original = (await scene.boundingBox())!;
  const edge = (await sidebar.boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 100);
  await page.mouse.down();
  await page.mouse.move(edge.x - 100, edge.y + 100, { steps: 10 });
  await page.mouse.up();
  expect((await scene.boundingBox())!.width).toBeGreaterThan(original.width + 80);
  await sidebar.focus();
  await page.keyboard.press('Home');
  expect((await page.locator('.studio-drawer').boundingBox())!.width).toBe(300);
  await page.keyboard.press('End');
  expect((await scene.boundingBox())!.width).toBeGreaterThanOrEqual(330);

  const before = (await scene.boundingBox())!.height;
  const divider = (await lower.boundingBox())!;
  await page.mouse.move(divider.x + divider.width / 2, divider.y + 4);
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2, divider.y - 90, { steps: 10 });
  await page.mouse.up();
  expect((await scene.boundingBox())!.height).toBeLessThan(before - 60);
  await lower.focus();
  await page.keyboard.press('Home');
  expect((await page.locator('.move-controls').boundingBox())!.height).toBe(110);
  expect((await scene.boundingBox())!.height).toBeGreaterThanOrEqual(240);
  const closeBox = (await page.getByRole('button', { name: '물건 선택 해제', exact: true }).boundingBox())!;
  const controlsBox = (await page.locator('.move-controls').boundingBox())!;
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(controlsBox.y + controlsBox.height);
  await page.screenshot({ path: testInfo.outputPath('desktop-panels.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toBeHidden();
  await expect(lower).toBeHidden();
});

test('rejects a blocked group placement atomically and supports grouping on mobile', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const page = await context.newPage();
    await seed(page);
    await button(page, '위쪽 상자 선택').tap();
    await button(page, '패널 닫기').tap();
    await button(page, '그룹 묶기').tap();
    await button(page, '놓인 물건').tap();
    await button(page, '옆 상자 선택').tap();
    await button(page, '패널 닫기').tap();
    await page.getByLabel('높이 (mm)').fill('0');
    await button(page, '적용').tap();
    await expect(page.locator('.object-move-bar')).toContainText('그룹을 놓을 공간이 없어요');
    expect((await poses(page)).filter(item => item.id !== 'base').map(item => item.positionMm.y)).toEqual([600, 600]);
    await page.getByLabel('높이 (mm)').fill('900');
    await button(page, '적용').tap();
    await expect.poll(async () => (await poses(page)).filter(item => item.id !== 'base').map(item => item.positionMm.y)).toEqual([900, 900]);
    await expect(page.locator('.object-move-bar')).not.toContainText('그룹을 놓을 공간이 없어요');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('mobile-group.png') });
  } finally { await context.close(); }
});
