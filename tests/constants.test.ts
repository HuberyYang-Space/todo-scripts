import { describe, expect, it } from 'vitest'
import {
  CONFIG_COMMITLINT,
  CONFIG_COMMITLINT_CZGIT,
  DEFAULT_PKG_NAME,
  REPO_URL,
} from '@/constants'

/**
 * The exact type list a config's `type-enum` rule declares
 *
 * Scoped to the rule body on purpose. Searching the whole template for `'test'`
 * also hits the type's own description text, so a type deleted from the rule but
 * still mentioned in prose would go unnoticed.
 */
function extractTypes(config: string): string[] {
  const match = config.match(/'type-enum': \[2, 'always', \[([\s\S]*?)\]\]/)
  const body = match?.[1] ?? ''
  return [...body.matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort()
}

/** Every commit type the two templates are expected to allow — no more, no less */
const REQUIRED_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'test',
  'chore',
  'perf',
  'ci',
  'build',
  'revert',
]

// DEFAULT_PKG_NAME / REPO_URL - basic constants
describe('基础常量', () => {
  it('default_PKG_NAME 应该是正确的包名', () => {
    expect(DEFAULT_PKG_NAME).toBe('@huberyyang/todo-scripts')
  })

  it('repo_URL 应该是有效的 GitHub 仓库地址', () => {
    expect(REPO_URL).toContain('github.com')
    expect(REPO_URL).toContain('todo-scripts')
  })
})

// CONFIG_COMMITLINT - the standard commitlint config template
describe('config_COMMITLINT', () => {
  it('应该是有效的 JavaScript 导出语句', () => {
    // The config template should start with export default
    expect(CONFIG_COMMITLINT).toMatch(/^export default/)
  })

  it('应该继承 @commitlint/config-conventional', () => {
    expect(CONFIG_COMMITLINT).toContain('@commitlint/config-conventional')
  })

  it('应该包含必要的 commit 类型，且不多不少', () => {
    // Set equality rather than eleven substring probes: the old form only proved
    // each type appeared *somewhere* in the template, so a stray extra type in the
    // rule — or a type matched only by its description text — still passed.
    expect(extractTypes(CONFIG_COMMITLINT)).toEqual([...REQUIRED_TYPES].sort())
  })
})

// CONFIG_COMMITLINT_CZGIT - the cz-git-enhanced config template
describe('config_COMMITLINT_CZGIT', () => {
  it('应该包含 cz-git 的类型声明注释', () => {
    expect(CONFIG_COMMITLINT_CZGIT).toContain('cz-git')
  })

  it('应该继承 @commitlint/config-conventional', () => {
    expect(CONFIG_COMMITLINT_CZGIT).toContain('@commitlint/config-conventional')
  })

  it('应该包含 prompt 交互配置', () => {
    // cz-git's core feature is interactive commits, which needs prompt config.
    // Assert the structural keys, not the bare words: 'prompt', 'messages' and
    // 'types' all occur in the template's prose and comments too, so matching
    // them alone would still pass with the config blocks deleted.
    expect(CONFIG_COMMITLINT_CZGIT).toContain('prompt: {')
    expect(CONFIG_COMMITLINT_CZGIT).toContain('messages: {')
    expect(CONFIG_COMMITLINT_CZGIT).toContain('types: [')
  })

  it('应该包含中文提示信息', () => {
    // This project targets Chinese-speaking users, so the prompt should include Chinese text
    expect(CONFIG_COMMITLINT_CZGIT).toContain('选择你要提交的类型')
    expect(CONFIG_COMMITLINT_CZGIT).toContain('填写简短精炼的变更描述')
  })

  it('types 数组中每项应该同时包含中英文说明', () => {
    // Every type should have a name in the "Chinese | English" format
    expect(CONFIG_COMMITLINT_CZGIT).toContain('新增功能 | A new feature')
    expect(CONFIG_COMMITLINT_CZGIT).toContain('修复缺陷 | A bug fix')
  })
})

describe('cONFIG_COMMITLINT 与 CONFIG_COMMITLINT_CZGIT 的 type-enum 应该一致', () => {
  it('两份配置的 type-enum 类型集合应该完全相同', () => {
    expect(extractTypes(CONFIG_COMMITLINT)).toEqual(extractTypes(CONFIG_COMMITLINT_CZGIT))
  })

  it('不应该包含非标准的 merge/update 类型', () => {
    // Checked against the rule body, not the whole file: the word could legitimately
    // appear in a description without being an allowed type
    expect(extractTypes(CONFIG_COMMITLINT)).not.toContain('merge')
    expect(extractTypes(CONFIG_COMMITLINT)).not.toContain('update')
  })
})

describe('cONFIG_COMMITLINT_CZGIT 的 issuePrefixes', () => {
  it('默认值应该是中性的 GitHub 风格，不再硬编码 Gitee', () => {
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain('link:')
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain('closed:')
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`{ value: 'closes'`)
  })
})

describe('两份模板的收尾格式', () => {
  it('两份模板都应该以换行结尾', () => {
    // 少一个末尾换行会被 linter 和 POSIX 工具挑刺，而且两份模板收尾风格不该不一致
    expect(CONFIG_COMMITLINT.endsWith('\n')).toBe(true)
    expect(CONFIG_COMMITLINT_CZGIT.endsWith('\n')).toBe(true)
  })
})
