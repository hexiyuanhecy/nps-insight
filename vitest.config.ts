import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 仅运行 src 目录下的单元测试，避免与 Playwright E2E 测试冲突
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
});
