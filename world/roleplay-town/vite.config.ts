import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('src/ui'),
  publicDir: resolve('public'),
  build: { outDir: resolve('dist-web'), emptyOutDir: true, rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
  server: { proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 8011}`, '/ws': { target: `ws://127.0.0.1:${process.env.PORT ?? 8011}`, ws: true } } },
});
