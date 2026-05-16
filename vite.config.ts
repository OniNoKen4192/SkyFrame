/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'client/public'),
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@client': resolve(__dirname, 'client'),
    },
  },
  test: {
    // Explicit include so test runs stay scoped to project-owned code. Vitest's
    // default `**/node_modules/**` exclude only matches the literal folder name
    // — sibling backup folders like `node_modules.bak/` would otherwise be
    // walked. Explicit include is the more robust guard.
    include: ['{client,server,shared}/**/*.test.ts'],
    exclude: ['node_modules/**', 'node_modules.bak/**', 'dist/**'],
  },
});
