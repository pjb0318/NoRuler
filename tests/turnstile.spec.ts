import { test, expect } from '@playwright/test';

test('loads the deployed site key at runtime and sends fresh tokens on repeated analyses', async ({ page }) => {
  await page.route('**/api/analysis-config', route => route.fulfill({ json: {
    turnstileRequired: true, turnstileSiteKey: 'public-runtime-key',
  } }));
  await page.route('https://challenges.cloudflare.com/turnstile/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let options; let count = 0;
      window.turnstile = {
        render(container, config) {
          if (config.sitekey !== 'public-runtime-key') throw new Error('Wrong site key');
          if (config.action !== 'image-dimensions') throw new Error('Wrong action');
          options = config;
          setTimeout(() => options.callback('verified-' + ++count), 0);
          return 'widget';
        },
        reset() { setTimeout(() => options.callback('verified-' + ++count), 0); },
        remove() {}
      };`,
  }));
  const tokens: string[] = [];
  await page.route('**/api/image-dimensions', route => {
    tokens.push(route.request().headers()['x-turnstile-token']);
    return route.fulfill({ json: { candidates: [], subjects: [] } });
  });
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  const analyze = page.getByRole('button', { name: '이미지 분석', exact: true });
  await analyze.click();
  await expect.poll(() => tokens.length).toBe(1);
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect.poll(() => tokens.length).toBe(2);
  expect(tokens).toEqual(['verified-1', 'verified-2']);
});

test('explains missing deployed configuration without sending an unverified analysis', async ({ page }) => {
  await page.route('**/api/analysis-config', route => route.fulfill({ json: {
    turnstileRequired: true, turnstileSiteKey: '',
  } }));
  let requests = 0;
  await page.route('**/api/image-dimensions', route => {
    requests++;
    return route.fulfill({ json: { candidates: [] } });
  });
  await page.goto('/');
  await page.locator('#measurement-image').setInputFiles('public/measurement-example.png');
  await page.getByRole('button', { name: '이미지 분석', exact: true }).click();
  await expect(page.getByText('배포 서버의 보안 설정이 누락됐어요. 관리자에게 Turnstile Site Key 설정을 요청해 주세요.', { exact: true })).toBeVisible();
  expect(requests).toBe(0);
});
