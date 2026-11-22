import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { createServer } from 'vite';
import playwrightConfig from '../playwright.config.ts';
import { normalizeImageAnalysis } from '../src/imageDimensions.ts';

const outputDir = new URL('../docs/images/', import.meta.url);
const fixture = (name: string) => new URL(`./fixtures/${name}.svg`, import.meta.url);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const reading = (mm: number, evidence = '사양표 전체 치수') => ({ mm, evidence, needsReview: false });
const measurement = (axis: string, mm: number, axisLabel?: string) => ({
  axis, mm, sourceId: 'photo', scope: 'overall',
  location: axisLabel ? '사양표 크기 행' : '치수선',
  quote: axisLabel ? `${axisLabel} ${mm} mm` : `${mm} mm`,
  basis: axisLabel ? 'label' : 'dimension_line',
});

const standAnalysis = normalizeImageAnalysis({ subjects: [{
  label: '모니터 받침대',
  shapeEvidence: {
    readiness: 'ready', kind: 'other', parts: ['other'], view: '앞쪽 사선', unseen: '뒷면 세부 구조',
    parametric: {
      builder: 'box-parts', ratio: { width: 5, depth: 2, height: 0.82 },
      parts: [
        { kind: 'box', x0: 0, x1: 1, y0: 0.72, y1: 1, z0: 0, z1: 1, color: '#e7d4b4', radius: 0.12 },
        { kind: 'box', x0: 0.04, x1: 0.14, y0: 0, y1: 0.72, z0: 0.08, z1: 0.92, color: '#6b7486', radius: 0 },
        { kind: 'box', x0: 0.86, x1: 0.96, y0: 0, y1: 0.72, z0: 0.08, z1: 0.92, color: '#6b7486', radius: 0 },
      ],
    },
  },
  options: [{
    label: '기본형',
    dimensions: { width: reading(500), depth: reading(200), height: reading(82) },
    measurements: [measurement('width', 500), measurement('height', 82)],
    embeddedSpecs: [measurement('width', 510, '가로'), measurement('depth', 200, '깊이'), measurement('height', 82, '높이')],
  }],
}] });

const deskAnalysis = normalizeImageAnalysis({ subjects: [{
  label: '흰색 책상',
  shapeEvidence: {
    readiness: 'ready', kind: 'cross-braced-desk', view: '앞쪽 사선', unseen: '상판 두께',
    parts: ['tabletop', 'fourSquareLegs', 'sideStretchers', 'rearCrossBrace'],
  },
  options: [[800, 500], [1000, 600], [1200, 600]].map(([width, depth]) => ({
    label: String(width),
    dimensions: { width: reading(width), depth: reading(depth), height: reading(740) },
    clearance: reading(700, '하부 여유 높이'),
  })),
}] });

async function openApp(browser: Browser, url: string, mobile = false) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 1 : 2,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.goto(url);
  await expect(page.locator('.scene canvas')).toBeVisible();
  return page;
}

async function showAnalysis(page: Page, name: string, image: Buffer, analysis: ReturnType<typeof normalizeImageAnalysis>) {
  await page.route('**/api/image-dimensions', route => route.fulfill({ json: analysis }));
  await page.locator('#measurement-image').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: image });
  await button(page, '이미지 분석').click();
  await expect(page.getByText(/^선택한 상품 ·/)).toBeVisible();
}

async function capture(page: Page, target: Page | Locator = page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.stage-toast')).toHaveCount(0);
  await page.mouse.move(2, 2);
  return target.screenshot({ animations: 'disabled' });
}

async function takeScreenshots(browser: Browser, url: string) {
  const assets = await browser.newPage({ viewport: { width: 900, height: 570 } });
  await assets.goto(fixture('monitor-stand').href);
  const standImage = await assets.locator('svg').screenshot();
  await assets.goto(fixture('desk').href);
  const deskImage = await assets.locator('svg').screenshot();
  await assets.close();

  const hero = await openApp(browser, url);
  await button(hero, '예시 도면 써보기').click();
  await button(hero, '책상을 비교 공간에 추가').click();
  await button(hero, '놓인 물건').click();
  await expect(hero.locator('.object-row').filter({ hasText: '흰색 책상' })).toContainText('800 × 500 × 740 mm');
  await button(hero, '내가 궁금한 상자 공간에서 제거').click();
  await button(hero, '전체 맞춤').click();
  await button(hero, '제품 추가').click();
  await hero.locator('.drawer-body').evaluate(element => { element.scrollTop = 0; });
  const heroImage = await capture(hero);
  await button(hero, '다크 모드로 전환').click();
  await expect(hero.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkImage = await capture(hero);
  await hero.close();

  const review = await openApp(browser, url);
  await showAnalysis(review, 'monitor-stand-demo', standImage, standAnalysis);
  await expect(review.getByText('상품 사진 · 치수선 · 500 mm')).toBeVisible();
  await expect(review.getByText('상품 사진 · 사양표 크기 행 · 가로 510 mm')).toBeVisible();
  await review.locator('.measurement-evidence').scrollIntoViewIfNeeded();
  const reviewImage = await capture(review, review.locator('.dimension-form'));
  await button(review, '500 mm 사용').click();
  await button(review, '3D 모델을 비교 공간에 추가').click();
  await button(review, '놓인 물건').click();
  await button(review, '내가 궁금한 상자 공간에서 제거').click();
  await button(review, '전체 맞춤').click();
  await button(review, '제품 추가').click();
  await review.locator('.drawer-body').evaluate(element => { element.scrollTop = 0; });
  const parametricImage = await capture(review);
  await review.close();

  const comparison = await openApp(browser, url);
  await showAnalysis(comparison, 'desk-demo', deskImage, deskAnalysis);
  await comparison.getByRole('radio', { name: /^1200 / }).check();
  await expect(comparison.locator('.desk-preview canvas')).toBeVisible();
  await expect(comparison.locator('#width')).toHaveValue('1200');
  const deskPreview = await capture(comparison, comparison.locator('.review-stage-grid'));

  await button(comparison, '책상을 비교 공간에 추가').click();
  await button(comparison, '프리셋').click();
  await button(comparison, '27인치 모니터 공간에 추가').click();
  await button(comparison, '키보드 공간에 추가').click();
  await button(comparison, '놓인 물건').click();
  for (const name of ['내가 궁금한 상자', '500mL 물병', '스마트폰']) {
    await button(comparison, `${name} 공간에서 제거`).click();
  }
  await button(comparison, '전체 맞춤').click();
  const dimensions = button(comparison, '치수 표시');
  if (await dimensions.getAttribute('aria-pressed') !== 'true') await dimensions.click();
  await expect(comparison.locator('.dimension-label').first()).toBeVisible();
  const sceneImage = await capture(comparison, comparison.getByRole('region', { name: '3D 비교 공간' }));
  await button(comparison, '내 모델').click();
  await button(comparison, '프리셋 등록').click();
  const libraryImage = await capture(comparison, comparison.getByRole('region', { name: '내 모델 관리' }));
  await comparison.close();

  const mobile = await openApp(browser, url, true);
  await expect(button(mobile, '제품 추가')).toBeVisible();
  await button(mobile, '제품 추가').click();
  await expect(mobile.getByRole('complementary', { name: '도구 패널' })).toBeVisible();
  const mobileImage = await capture(mobile);
  await mobile.close();

  return {
    'hero.png': heroImage,
    'dark.png': darkImage,
    'parametric.png': parametricImage,
    'scene.png': sceneImage,
    'review.png': reviewImage,
    'desk.png': deskPreview,
    'mobile.png': mobileImage,
    'library.png': libraryImage,
  };
}

// Vite gives process environment variables priority over .env.local.
process.env.GEMINI_API_KEY = '';
const server = await createServer({ server: { host: '127.0.0.1', port: 5179 } });
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite did not expose a local URL');
  const launchOptions = playwrightConfig.use?.launchOptions;
  const browser = await chromium.launch({
    ...launchOptions,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    args: [...(launchOptions?.args ?? []), '--enable-unsafe-swiftshader'],
  });
  try {
    const screenshots = Object.entries(await takeScreenshots(browser, url));
    for (const [name, image] of screenshots) {
      if (image.length >= 3_000_000) throw new Error(`${name} exceeds the 3 MB screenshot limit`);
    }
    await mkdir(outputDir, { recursive: true });
    await Promise.all(screenshots.map(([name, image]) => writeFile(new URL(name, outputDir), image)));
    console.log(`Captured ${screenshots.length} screenshots in ${fileURLToPath(outputDir)}`);
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
