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
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
})
