import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { imageDimensionsMiddleware } from './server/imageDimensions';

function readAppVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string };
    return pkg.version?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readCommitSha() {
  const envSha = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  if (envSha) return envSha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GEMINI_');
  const analyze = imageDimensionsMiddleware(env.GEMINI_API_KEY);
  return {
    define: {
      __APP_VERSION__: JSON.stringify(readAppVersion()),
      __APP_COMMIT__: JSON.stringify(readCommitSha()),
    },
    plugins: [
      react(),
      {
        name: 'image-dimensions-demo',
        configureServer(server) { server.middlewares.use(analyze); },
        configurePreviewServer(server) { server.middlewares.use(analyze); },
      },
    ],
  };
});
