import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        '**/fixtures/**',
        '**/index.ts',
        '.eslintrc.js',
      ],
    },
    include: ['tests/**/*.spec.ts'],
  },
});
