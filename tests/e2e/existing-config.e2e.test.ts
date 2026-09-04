import type { PackageJsonLike } from './helpers/types'
import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
import { MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

/**
 * Regression suite for running against a project that is already configured.
 *
 * Every case here used to either silently disable the thing being installed, delete
 * a config the user owned, or write a second competing config file.
 */

describe('已有 husky 钩子', () => {
  it('已有 pre-commit 时应该追加 lint-staged 而不是原样保留', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      git: true,
      files: { '.husky/pre-commit': '#!/bin/sh\necho "my own check"\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    const hook = fixture.read('.husky/pre-commit')
    // The user's own line must survive...
    expect(hook).toContain('echo "my own check"')
    // ...and ours must actually be in there, or lint-staged never runs on commit
    expect(hook).toContain('lint-staged')
  })

  it('已有 commit-msg 时应该追加 commitlint 而不是原样保留', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      git: true,
      files: { '.husky/commit-msg': '#!/bin/sh\necho "my own msg check"\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    const hook = fixture.read('.husky/commit-msg')
    expect(hook).toContain('echo "my own msg check"')
    expect(hook).toContain('commitlint --edit')
  })

  it('已有钩子里已经含该命令时不应该重复追加', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      git: true,
      files: { '.husky/pre-commit': 'npx --no -- lint-staged\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'], { packageManager: 'npm' })
    assertOk(result, fixture)

    const occurrences = fixture.read('.husky/pre-commit').split('lint-staged').length - 1
    expect(occurrences).toBe(1)
  })
})

describe('已有 commitizen 配置', () => {
  it('不传 --czgit 时不应该删除用户已有的 commitizen 配置', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      packageJson: {
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-conventional-changelog' } },
      },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    const pkg = fixture.readJson<PackageJsonLike>('package.json')
    expect(pkg.config?.commitizen).toEqual({ path: 'node_modules/cz-conventional-changelog' })
    expect(pkg.scripts?.cz).toBe('git cz')
  })
})

describe('已有 commitlint / lint-staged 配置变体', () => {
  it('已有 .commitlintrc.json 时不应该再写一份 commitlint.config.ts', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      typescript: true,
      files: { '.commitlintrc.json': `{ "extends": ["@commitlint/config-conventional"] }\n` },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('commitlint.config.ts')).toBe(false)
    expect(fixture.read('.commitlintrc.json')).toContain('@commitlint/config-conventional')
  })

  it('已有 commitlint.config.cjs 时不应该再写一份 commitlint.config.js', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      typescript: false,
      files: { 'commitlint.config.cjs': `module.exports = { extends: ['@commitlint/config-conventional'] }\n` },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('commitlint.config.js')).toBe(false)
  })

  it('已有 .lintstagedrc.json 时不应该再写一份 lint-staged.config.mjs', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      files: { '.lintstagedrc.json': `{ "*.ts": "my-own-linter" }\n` },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('lint-staged.config.mjs')).toBe(false)
    expect(fixture.read('.lintstagedrc.json')).toContain('my-own-linter')
  })
})

describe('失败回滚', () => {
  it('husky init 失败时应该回滚已经写下的配置文件', async () => {
    // realPackages: [] 表示不真拷贝 husky，只留一个满足 hasDependency 的空壳，
    // 于是 `husky init` 会真的执行失败——正好用来验证中途失败的处理
    const fixture = await useFixture({ linters: ['eslint'], typescript: true, realPackages: [] })

    const result = await runCli(fixture, ['commitlint-init'])

    expect(result.exitCode).not.toBe(0)
    // 证明确实走到了写配置那一步、并且是被回滚掉的——否则本用例可能只是
    // 在更早的地方就失败了，那样它什么也没验证到
    // spinner 走 stderr，printWarn 走 stdout —— 两条断言必须各自挑对流
    expect(result.stderr).toContain(MESSAGES.commitlintConfigDone)
    expect(result.stdout).toContain(MESSAGES.rollbackDone)
    // ScriptError 一直带着 cause，但从前只打印 message，底层报错整个被丢掉，
    // 排障时只能看到「Failed to execute ...」这种没有信息量的一行
    expect(result.stdout).toContain(MESSAGES.causedBy)
    // 光有「Caused by:」还不够——真正要钉住的是它后面接了底层报错的内容，
    // 只断言标签的话，打印一个空 cause 也能通过
    expect(result.stdout).toMatch(/Caused by: \S/)
    // 配置文件在 husky 那一步之前就写好了，失败后必须被撤销，
    // 否则项目会停在「有 commitlint 配置但没有钩子」的半配置状态
    expect(fixture.exists('commitlint.config.ts')).toBe(false)
    expect(fixture.exists('lint-staged.config.mjs')).toBe(false)
  })
})
