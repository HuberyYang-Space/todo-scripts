import type { PackageManager } from '@/utils/package-manager'
import { describe, expect, it } from 'vitest'
import { COMMITLINT_CONFIG_FILES, findExistingConfig, LINT_STAGED_CONFIG_FILES, patchPackageJSON, planSetup, resolveHookContent } from '@/scripts/commitlint-init'

// Pure function tests: no need to mock the filesystem, subprocess, or spinner
const pm = {
  formatExec: (command: string) => `pnpm exec ${command}`,
} as PackageManager

describe('planSetup', () => {
  it('默认应该规划 4 个基础依赖', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
    ])
  })

  it('--czgit 时应该追加 commitizen 和 cz-git', () => {
    expect(planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
      'commitizen',
      'cz-git',
    ])
  })

  it('ts 项目的配置文件应该是 .ts', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.ts')
  })

  it('非 TS 项目的配置文件应该是 .js', () => {
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.js')
  })

  it('--czgit 时配置文件内容应该带 prompt 交互配置', () => {
    const { content } = planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).toContain('prompt')
    expect(content).toContain('cz-git')
  })

  it('默认配置文件内容不应该带 prompt 交互配置', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).not.toContain('prompt')
  })

  it('钩子内容应该用包管理器的 exec 前缀渲染', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).hooks).toEqual([
      { path: '.husky/pre-commit', content: 'pnpm exec lint-staged' },
      { path: '.husky/commit-msg', content: 'pnpm exec commitlint --edit "$1"' },
    ])
  })

  it('lint-staged 配置文件固定生成 lint-staged.config.mjs，不区分 ts/js 项目', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
  })
})

describe('planSetup 的 lint-staged 内容', () => {
  it('探测到 eslint 时应该生成 eslint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'eslint --fix --no-error-on-unmatched-pattern'`)
  })

  it('探测到 biome 时应该生成 biome 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'biome' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'biome check --write --no-errors-on-unmatched'`)
  })

  it('探测到 oxlint 时应该生成 oxlint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'oxlint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'oxlint --fix --no-error-on-unmatched-pattern'`)
  })

  it('没有 linter 时应该生成一条空任务的 * 规则（合法但不生效）', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'none' }).lintStagedConfigFile
    expect(content).toMatch(/'\*':\s*\[\]/)
  })
})

describe('patchPackageJSON', () => {
  it('应该写入 commitlint 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result.scripts!.commitlint).toBe('commitlint --edit')
  })

  it('lint-staged 配置已经改用独立文件，不应该再往 package.json 里注入默认值', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result['lint-staged']).toBeUndefined()
  })

  it('用户已有的 lint-staged 配置不应该被覆盖', () => {
    const result = patchPackageJSON(
      { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } },
      {},
    )
    expect(result['lint-staged']).toEqual({ '*.ts': 'my-own-linter' })
  })

  it('不应该修改传入的对象', () => {
    const original = { name: 'demo' }
    patchPackageJSON(original, { czgit: true })
    expect(original).toEqual({ name: 'demo' })
  })

  it('应该保留原有的其他字段和脚本', () => {
    const result = patchPackageJSON(
      { name: 'demo', version: '1.0.0', scripts: { build: 'vite build' } },
      {},
    )
    expect(result.name).toBe('demo')
    expect(result.version).toBe('1.0.0')
    expect(result.scripts!.build).toBe('vite build')
  })

  it('--czgit 时应该写入 commitizen 配置和 cz 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, { czgit: true })
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(result.scripts!.cz).toBe('git cz')
  })

  it('--czgit 时应该保留 commitizen 子对象里已有的配置', () => {
    // cz-git's config lives under config.commitizen (alongside path there's also
    // alias/types etc.) — merging only the outer layer would lose that inner data
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x', alias: { fd: 'docs: fix typos' } } } },
      { czgit: true },
    )
    expect(result.config!.commitizen).toEqual({
      path: 'node_modules/cz-git',
      alias: { fd: 'docs: fix typos' },
    })
  })

  it('--czgit 时应该保留 config 下已有的其他字段', () => {
    // Regression case: this used to overwrite config wholesale, dropping the user's other fields
    const result = patchPackageJSON(
      { name: 'demo', config: { other: 'keep-me' } },
      { czgit: true },
    )
    expect(result.config!.other).toBe('keep-me')
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
  })

  it('非 czgit 时不应该删除用户已有的 commitizen 配置和 cz 脚本', () => {
    // 不传 --czgit 表达的是「这次不配 czgit」，不是「请移除我的 commitizen」。
    // 用户的适配器也未必是 cz-git，删掉等于破坏一个本工具没参与配置的功能。
    const result = patchPackageJSON(
      {
        name: 'demo',
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-conventional-changelog' } },
      },
      {},
    )
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-conventional-changelog' })
    expect(result.scripts!.cz).toBe('git cz')
  })

  it('非 czgit 时应该保留 config 下的其他字段', () => {
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x' }, other: 'keep' } },
      {},
    )
    expect(result.config!.other).toBe('keep')
  })
})

describe('resolveHookContent', () => {
  const command = 'pnpm exec lint-staged'

  it('钩子不存在时应该直接写入命令', () => {
    expect(resolveHookContent(undefined, command)).toEqual({
      content: command,
      action: 'created',
    })
  })

  it('已有钩子不含该命令时应该追加而不是替换', () => {
    // 这是核心回归点：原来的实现把用户内容原样写回，导致 lint-staged 永远不会被触发
    const original = '#!/bin/sh\necho "my own check"\n'
    expect(resolveHookContent(original, command)).toEqual({
      content: `#!/bin/sh\necho "my own check"\n${command}\n`,
      action: 'appended',
    })
  })

  it('已有钩子缺末尾换行时追加前应该补上换行', () => {
    expect(resolveHookContent('echo hi', command)).toEqual({
      content: `echo hi\n${command}\n`,
      action: 'appended',
    })
  })

  it('已有钩子已经含该命令时应该原样保留', () => {
    const original = `#!/bin/sh\n${command}\n`
    expect(resolveHookContent(original, command)).toEqual({
      content: original,
      action: 'unchanged',
    })
  })

  it('比对命令时应该忽略行首尾空白', () => {
    const original = `#!/bin/sh\n  ${command}  \n`
    expect(resolveHookContent(original, command).action).toBe('unchanged')
  })

  it('命令只是某行的子串时不算已存在，应该追加', () => {
    // `pnpm exec lint-staged-extra` 不是我们要的命令，不能因为子串匹配就跳过
    const original = `#!/bin/sh\n${command}-extra\n`
    expect(resolveHookContent(original, command).action).toBe('appended')
  })
})

describe('findExistingConfig', () => {
  it('一个候选都不存在时应该返回 undefined', () => {
    expect(findExistingConfig(['a.js', 'b.js'], () => false)).toBeUndefined()
  })

  it('应该返回实际存在的那个候选文件名', () => {
    expect(findExistingConfig(['a.js', 'b.js'], f => f === 'b.js')).toBe('b.js')
  })

  it('多个候选同时存在时应该返回候选顺序里的第一个', () => {
    expect(findExistingConfig(['a.js', 'b.js'], () => true)).toBe('a.js')
  })
})

describe('配置文件候选清单', () => {
  it('commitlint 候选应该覆盖 rc 系与 config 系的各种扩展名', () => {
    // 回归点：原来只检查自己要写的那个文件名，导致已有 .commitlintrc 的项目被写入第二份配置
    for (const file of [
      'commitlint.config.ts',
      'commitlint.config.js',
      'commitlint.config.cjs',
      'commitlint.config.mjs',
      '.commitlintrc',
      '.commitlintrc.json',
      '.commitlintrc.js',
      '.commitlintrc.cjs',
      '.commitlintrc.mjs',
      '.commitlintrc.ts',
      '.commitlintrc.yml',
      '.commitlintrc.yaml',
    ])
      expect(COMMITLINT_CONFIG_FILES).toContain(file)
  })

  it('lint-staged 候选应该覆盖 rc 系与 config 系的各种扩展名', () => {
    for (const file of [
      'lint-staged.config.mjs',
      'lint-staged.config.js',
      'lint-staged.config.cjs',
      'lint-staged.config.ts',
      '.lintstagedrc',
      '.lintstagedrc.json',
      '.lintstagedrc.js',
      '.lintstagedrc.cjs',
      '.lintstagedrc.mjs',
      '.lintstagedrc.yml',
      '.lintstagedrc.yaml',
    ])
      expect(LINT_STAGED_CONFIG_FILES).toContain(file)
  })
})
