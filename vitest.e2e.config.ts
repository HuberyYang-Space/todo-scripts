import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // Only the .e2e.test.ts suffix, so helpers under tests/e2e/helpers are never
    // collected as test files
    include: ['tests/e2e/**/*.e2e.test.ts'],
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    // Builds dist/ before anything runs, so the suite can never assert against a
    // stale artifact — see tests/e2e/global-setup.ts for why this isn't a script chain
    globalSetup: ['tests/e2e/global-setup.ts'],
    // Every case spawns node + npx + git for real; the 5s default is nowhere near enough
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each case forks 2-3 node processes of its own; uncapped concurrency thrashes
    // low-core machines badly enough to push cases past their timeout
    maxWorkers: 4,
  },
})
