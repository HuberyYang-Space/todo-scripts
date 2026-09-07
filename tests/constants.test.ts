import { describe, expect, it } from 'vitest'
import { DEFAULT_PKG_NAME, REPO_URL } from '@/constants'

describe('基础常量', () => {
  it('default_PKG_NAME 应该是正确的包名', () => {
    expect(DEFAULT_PKG_NAME).toBe('@huberyyang/todo-scripts')
  })

  it('repo_URL 应该是有效的 GitHub 仓库地址', () => {
    expect(REPO_URL).toContain('github.com')
    expect(REPO_URL).toContain('todo-scripts')
  })
})

// CONFIG_COMMITLINT —— 标准的 commitlint 配置模板
