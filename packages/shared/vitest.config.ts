import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@workspace/shared/lib': resolve('./src/lib'),
      '@workspace/shared/types': resolve('./src/types'),
      '@workspace/shared/config': resolve('./src/config'),
    },
  },
});
