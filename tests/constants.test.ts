import { Buffer } from 'node:buffer'
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

  it('types 数组每项应该是纯中文说明', () => {
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`name: 'feat:     新增功能'`)
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`name: 'fix:      修复缺陷'`)
    // 砍掉双语后不该再有 "中文 | English" 这种并排格式，
    // 断言分隔符本身而不是逐个列举英文词——后者漏一个就放过去了
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain(' | ')
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

/**
 * 把模板当成真正的模块跑一遍，而不是当字符串搜关键字
 *
 * 上面所有断言都是 toContain，只看子串在不在——模板要是被改成了语法不合法的
 * JS（少个引号、转义写坏），它们照样全绿，而用户拿到的是一份 import 就报错的
 * 配置文件。走 data: URL 求值，既真的执行了模板，又不用碰文件系统。
 */
async function evaluateTemplate(template: string) {
  const url = `data:text/javascript;base64,${Buffer.from(template).toString('base64')}`
  const mod = await import(/* @vite-ignore */ url)
  return mod.default
}

describe('模板本身应该是可执行的合法 ESM', () => {
  it('cONFIG_COMMITLINT 可以被 import 且结构完整', async () => {
    const config = await evaluateTemplate(CONFIG_COMMITLINT)
    expect(config.extends).toEqual(['@commitlint/config-conventional'])
    expect(config.rules['type-enum'][2]).toHaveLength(11)
  })

  it('cONFIG_COMMITLINT_CZGIT 可以被 import 且 prompt 配置完整', async () => {
    const config = await evaluateTemplate(CONFIG_COMMITLINT_CZGIT)
    expect(config.rules['type-enum'][2]).toHaveLength(11)
    expect(config.prompt.types).toHaveLength(11)
    expect(config.prompt.messages.type).toBe('选择你要提交的类型：')
    expect(config.prompt.types[0].name).toBe('feat:     新增功能')
  })

  it('czgit 模板里的换行转义应该原样传给 cz-git', async () => {
    // 模板源码里写的是 \\n（两层转义），求值后必须仍是「反斜杠 + n」在字符串里，
    // 也就是生成的配置文件里那个 \n 转义；一旦被写成真实换行，模板就破了
    const config = await evaluateTemplate(CONFIG_COMMITLINT_CZGIT)
    expect(config.prompt.messages.subject).toBe('填写简短精炼的变更描述：\n')
    expect(config.prompt.messages.subject.endsWith('\n')).toBe(true)
  })
})
