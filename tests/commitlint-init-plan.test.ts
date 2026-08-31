import type { PackageManager } from '@/utils/package-manager'
import { describe, expect, it } from 'vitest'
import { patchPackageJSON, planSetup } from '@/scripts/commitlint-init'

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

  it('没有 linter 时应该只生成占位注释', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'none' }).lintStagedConfigFile
    expect(content).not.toMatch(/^\s*'\*':/m)
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

  it('非 czgit 时应该清理已有的 commitizen 配置和 cz 脚本', () => {
    const result = patchPackageJSON(
      {
        name: 'demo',
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-git' } },
      },
      {},
    )
    expect(result.config!.commitizen).toBeUndefined()
    expect(result.scripts!.cz).toBeUndefined()
  })

  it('非 czgit 时应该保留 config 下的其他字段', () => {
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x' }, other: 'keep' } },
      {},
    )
    expect(result.config!.other).toBe('keep')
  })
})
