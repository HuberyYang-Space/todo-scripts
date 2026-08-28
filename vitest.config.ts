import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // 隔离 worktree 里也有一份测试文件，不排除的话根仓库跑测试会把它们也扫进来，
    // mock 在那个上下文里可能不生效，曾经因此对真实文件系统发起过 yarn/pnpm add
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
})
