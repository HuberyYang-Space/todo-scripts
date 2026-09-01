import type { PackageJsonLike } from './helpers/types'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
import { LINT_STAGED_FILE, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

/** Resolves a real package-manager binary's directory, for the PATH allowlist */
async function binDirOf(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execa('which', [command])
    return stdout.trim().replace(/\/[^/]+$/, '')
  }
  catch {
    return undefined
  }
}

describe('git 初始化', () => {
  it('应该在没有 .git 时先执行 git init', async () => {
    const fixture = await useFixture({ linters: ['eslint'], git: false })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('.git')).toBe(true)
    expect(result.stderr).toContain(MESSAGES.gitInitDone)
    // husky only wires hooksPath once a repo exists, so this doubles as proof the
    // ordering is right: git init must happen before husky init
    expect(fixture.read('.git/config')).toContain('hooksPath = .husky/_')
  })

  it('应该在已有 .git 时跳过 git init', async () => {
    const fixture = await useFixture({ linters: ['eslint'], git: true })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(result.stderr).not.toContain(MESSAGES.gitInitChecking)
  })
})

describe('commitlint 配置文件', () => {
  it('应该在 JS 工程里生成 commitlint.config.js', async () => {
    const fixture = await useFixture({ linters: ['eslint'], typescript: false })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('commitlint.config.js')).toBe(true)
    expect(fixture.exists('commitlint.config.ts')).toBe(false)
    expect(fixture.read('commitlint.config.js')).toContain('@commitlint/config-conventional')
  })

  it('应该在 TS 工程里生成 commitlint.config.ts', async () => {
    const fixture = await useFixture({ linters: ['eslint'], typescript: true })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists('commitlint.config.ts')).toBe(true)
    expect(fixture.exists('commitlint.config.js')).toBe(false)
  })

  it('应该跳过已存在的 commitlint 配置文件', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      files: { 'commitlint.config.js': '// mine\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read('commitlint.config.js')).toBe('// mine\n')
    expect(result.stdout).toContain('Kept your commitlint config')
  })
})

describe('husky 钩子', () => {
  it('应该写出两个钩子并生成 .husky/_ 目录', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read('.husky/pre-commit')).toBe('npx --no -- lint-staged')
    expect(fixture.read('.husky/commit-msg')).toBe('npx --no -- commitlint --edit "$1"')
    expect(fixture.exists('.husky/_/h')).toBe(true)
    expect(fixture.read('.husky/_/.gitignore')).toBe('*')
  })

  it('应该在包管理器为 pnpm 时按 pnpm 渲染钩子命令', async () => {
    const pnpmDir = await binDirOf('pnpm')
    if (!pnpmDir) {
      console.warn('[e2e] pnpm not on PATH, skipping the pnpm rendering case')
      return
    }

    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'], {
      packageManager: 'pnpm',
      extraPathDirs: [pnpmDir],
    })
    assertOk(result, fixture)

    expect(fixture.read('.husky/pre-commit')).toBe('pnpm exec lint-staged')
    expect(fixture.read('.husky/commit-msg')).toBe('pnpm exec commitlint --edit "$1"')
  })

  it('应该在 user agent 无法识别时回落到 npm 渲染', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'], { packageManager: 'cnpm/1.0.0' })
    assertOk(result, fixture)

    expect(fixture.read('.husky/pre-commit')).toBe('npx --no -- lint-staged')
  })

  it('应该在完全没有 user agent 时回落到 npm 渲染', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'], { packageManager: null })
    assertOk(result, fixture)

    expect(fixture.read('.husky/pre-commit')).toBe('npx --no -- lint-staged')
  })

  it('应该保留用户已有的 husky 钩子内容并追加我们的命令', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      files: { '.husky/pre-commit': 'echo mine\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'], { packageManager: 'npm' })
    assertOk(result, fixture)

    // husky 9's init unconditionally overwrites .husky/pre-commit, so the user's line
    // surviving proves the content was snapshotted BEFORE husky init ran; our command
    // being there too proves we append rather than just restoring — restoring alone
    // left lint-staged wired to nothing.
    expect(fixture.read('.husky/pre-commit')).toBe('echo mine\nnpx --no -- lint-staged\n')
    expect(result.stdout).toContain('.husky/pre-commit already exists')
  })
})

describe('package.json 改写', () => {
  it('应该保留 husky 写入的 prepare 脚本并追加 commitlint 脚本', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    // husky init writes scripts.prepare into package.json partway through the run;
    // both surviving proves the manifest is re-read afterwards rather than an
    // earlier snapshot being written back over husky's change
    const pkg = fixture.readJson<PackageJsonLike>('package.json')
    expect(pkg.scripts?.prepare).toBe('husky')
    expect(pkg.scripts?.commitlint).toBe('commitlint --edit')
  })

  it('应该保留 package.json 里已有的其他脚本', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      packageJson: { scripts: { build: 'vite build' } },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.readJson<PackageJsonLike>('package.json').scripts?.build).toBe('vite build')
  })

  it('应该以两空格缩进并以换行结尾写回 package.json', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    const raw = fixture.read('package.json')
    expect(raw).toMatch(/\n {2}"/)
    expect(raw.endsWith('\n')).toBe(true)
  })
})

describe('--czgit', () => {
  it('应该在 --czgit 时写入 cz 脚本和 commitizen 配置', async () => {
    const fixture = await useFixture({ linters: ['eslint'], czgit: true })

    const result = await runCli(fixture, ['commitlint-init', '--czgit'])
    assertOk(result, fixture)

    const pkg = fixture.readJson<PackageJsonLike>('package.json')
    expect(pkg.scripts?.cz).toBe('git cz')
    expect(pkg.config?.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(fixture.read('commitlint.config.js')).toContain('prompt')
  })

  it('不带 --czgit 时应该原样保留已有的 commitizen 配置和同级其他字段', async () => {
    // 不传 --czgit 表达的是「这次不配 czgit」，不是「删掉我已有的 commitizen」
    const fixture = await useFixture({
      linters: ['eslint'],
      packageJson: {
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-git' }, other: 'keep-me' },
      },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    const pkg = fixture.readJson<PackageJsonLike>('package.json')
    expect(pkg.config?.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(pkg.config?.other).toBe('keep-me')
    expect(pkg.scripts?.cz).toBe('git cz')
  })
})

describe('lint-staged 既有配置', () => {
  it('应该跳过已存在的 lint-staged 配置文件', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      files: { [LINT_STAGED_FILE]: 'export default { \'*\': \'mine\' }\n' },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe('export default { \'*\': \'mine\' }\n')
    expect(result.stdout).toContain('Kept your lint-staged config')
  })

  it('应该在 package.json 里存在遗留 lint-staged 字段时也跳过生成', async () => {
    const fixture = await useFixture({
      linters: ['eslint'],
      packageJson: { 'lint-staged': { '*.ts': 'my-own-linter' } },
    })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.exists(LINT_STAGED_FILE)).toBe(false)
    expect(result.stdout).toContain('Kept your lint-staged config')
    // The legacy field must be left alone, not migrated or deleted
    expect(fixture.readJson<PackageJsonLike>('package.json')['lint-staged'])
      .toEqual({ '*.ts': 'my-own-linter' })
  })
})

describe('整体行为', () => {
  it('应该在成功结束时打印 Process Down', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(result.stdout).toContain(MESSAGES.processDone)
  })

  it('应该可以重复执行而不破坏第一次的产物', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const first = await runCli(fixture, ['commitlint-init'])
    assertOk(first, fixture)
    const afterFirst = {
      lintStaged: fixture.read(LINT_STAGED_FILE),
      commitlint: fixture.read('commitlint.config.js'),
      preCommit: fixture.read('.husky/pre-commit'),
    }

    const second = await runCli(fixture, ['commitlint-init'])
    assertOk(second, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(afterFirst.lintStaged)
    expect(fixture.read('commitlint.config.js')).toBe(afterFirst.commitlint)
    expect(fixture.read('.husky/pre-commit')).toBe(afterFirst.preCommit)
    expect(second.stdout).toContain('already exists')
  })
})
