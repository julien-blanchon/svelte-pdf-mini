import { defineConfig } from '@playwright/test';

// Runs against the dev server (reused when `bun run dev` is already up), so
// there is no build step. `bun run test:e2e` = @smoke tests, `test:e2e:full` = all.
export default defineConfig({
	webServer: { command: 'bun run dev', port: 5173, reuseExistingServer: true, timeout: 120_000 },
	testMatch: '**/*.e2e.ts',
	use: { baseURL: 'http://localhost:5173' },
	timeout: 60_000,
	fullyParallel: true
});
