/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Front on 5273, proxies /api → localhost backend (5275).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    proxy: {
      '/api': 'http://127.0.0.1:5275',
    },
  },
  preview: { port: 5273 },
  // Unit tests live in src/; Playwright e2e/ runs separately via `npm run e2e`.
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
