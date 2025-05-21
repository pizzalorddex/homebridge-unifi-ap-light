import { defineConfig } from 'vitest/config'

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
				'src/index.ts',         // top-level
				'src/**/index.ts',      // all subfolders
				'**/src/index.ts',      // absolute/relative path quirks
				'**/src/**/index.ts',   // absolute/relative path quirks
				'dist/**',
				'.eslintrc.js',
			],
		},
		include: ['tests/**/*.spec.ts'],
	},
})
