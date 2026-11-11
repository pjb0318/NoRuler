import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { imageDimensionsMiddleware } from './server/imageDimensions';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GEMINI_');
  const analyze = imageDimensionsMiddleware(env.GEMINI_API_KEY);
  return {
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
