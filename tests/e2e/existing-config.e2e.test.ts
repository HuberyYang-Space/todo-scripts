import type { PackageJsonLike } from './helpers/types'
import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
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
