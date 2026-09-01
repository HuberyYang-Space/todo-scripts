import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // An isolated worktree also has its own copy of the test files; without this
    // exclusion, running tests from the root repo would sweep those in too, where
    // mocks may not take effect — this has previously caused real yarn/pnpm add
    // calls against the actual filesystem
    //
    // tests/e2e is excluded for the same class of reason: those cases really build
    // dist/, really fork subprocesses and really write to disk. The pre-commit hook
    // runs this config, so keeping them out is what keeps commits fast. They have
    // their own driver — see vitest.e2e.config.ts and `pnpm test:e2e`
    exclude: [...configDefaults.exclude, '**/.worktrees/**', 'tests/e2e/**'],
  },
})
