import type { PackageJsonLike } from '@/utils'
import type { LinterKind } from '@/utils/linter'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => {}),
}))

const ensureInstalledMock = vi.fn(async (_pkgs: string[], _options?: { dev?: boolean }) => {})
const execCommandMock = vi.fn(async () => {})
const pmExecMock = vi.fn(async (_command: string, _options?: { allowFailure?: boolean }) => {})
const isTsProjectMock = vi.fn(() => true)
const isInteractiveMock = vi.fn(() => false)
const printWarnMock = vi.fn()
const writePackageJSONMock = vi.fn(async (_data: PackageJsonLike) => {})
let pkgState: PackageJsonLike
const getPackageJSONMock = vi.fn((): PackageJsonLike => pkgState)

vi.mock('@/utils', () => ({
  execCommand: execCommandMock,
  getPackageJSON: getPackageJSONMock,
  isInteractive: isInteractiveMock,
  isTsProject: isTsProjectMock,
  printWarn: printWarnMock,
  writePackageJSON: writePackageJSONMock,
}))

const detectLinterMock = vi.fn((): LinterKind | undefined => undefined)
const isLinterInstalledMock = vi.fn((_kind: LinterKind) => false)
const isLinterKindMock = vi.fn((value: string): value is LinterKind =>
  (['eslint', 'biome', 'oxlint'] as string[]).includes(value))
const getFixCommandMock = vi.fn((kind: LinterKind, targets: string[]) => `${kind} ${targets.join(' ')} --fix`)
const renderLintStagedConfigMock = vi.fn((choice: LinterKind | 'none') =>
  choice === 'none' ? 'export default {}\n' : `export default { '*': '${choice}-fix-command' }\n`)

vi.mock('@/utils/linter', () => ({
  detectLinter: detectLinterMock,
  getFixCommand: getFixCommandMock,
  isLinterInstalled: isLinterInstalledMock,
  isLinterKind: isLinterKindMock,
  renderLintStagedConfig: renderLintStagedConfigMock,
}))

const promptLinterChoiceMock = vi.fn(async (): Promise<LinterKind | 'none' | undefined> => 'none')

vi.mock('@/utils/prompt', () => ({
  promptLinterChoice: promptLinterChoiceMock,
}))

// The one and only package manager seam: the script only talks to npm/pnpm/yarn through this
vi.mock('@/utils/package-manager', () => ({
  createPackageManager: () => ({
    name: 'pnpm',
    ensureInstalled: ensureInstalledMock,
    exec: pmExecMock,
    formatExec: (command: string) => `pnpm exec ${command}`,
    uninstall: vi.fn(),
  }),
}))

vi.mock('yocto-spinner', () => ({
  default: () => ({ start: vi.fn(), success: vi.fn(), stop: vi.fn() }),
}))

const { init } = await import('@/scripts/commitlint-init')

// resolve() returns backslash paths on windows; normalize to posix before asserting so both platforms match
function toPosix(p: unknown): string {
  return String(p).replaceAll('\\', '/')
}

describe('commitlint-init init()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    pkgState = { name: 'demo' }
    // resetAllMocks clears implementations, so re-establish each mock's default behavior here
    getPackageJSONMock.mockImplementation(() => pkgState)
    ensureInstalledMock.mockResolvedValue(undefined)
    pmExecMock.mockResolvedValue(undefined)
    writePackageJSONMock.mockResolvedValue(undefined)
    isTsProjectMock.mockReturnValue(true)
    isInteractiveMock.mockReturnValue(false)
    detectLinterMock.mockReturnValue(undefined)
    isLinterInstalledMock.mockReturnValue(false)
    isLinterKindMock.mockImplementation((value: string): value is LinterKind =>
      (['eslint', 'biome', 'oxlint'] as string[]).includes(value))
    getFixCommandMock.mockImplementation((kind: LinterKind, targets: string[]) => `${kind} ${targets.join(' ')} --fix`)
    renderLintStagedConfigMock.mockImplementation((choice: LinterKind | 'none') =>
      choice === 'none' ? 'export default {}\n' : `export default { '*': '${choice}-fix-command' }\n`)
    promptLinterChoiceMock.mockResolvedValue('none')
    vi.mocked(existsSync).mockReturnValue(false)
  })

  it('.git 不存在时应该执行 git init', async () => {
    await init({})
    expect(execCommandMock).toHaveBeenCalledWith('git init')
  })

  it('.git 已存在时不应该重复执行 git init', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).endsWith('.git'))
    await init({})
    expect(execCommandMock).not.toHaveBeenCalledWith('git init')
  })

  it('默认（非 czgit）应该只安装 4 个基础依赖', async () => {
    await init({})
    // Installed in a single call, not serially package by package
    expect(ensureInstalledMock).toHaveBeenCalledTimes(1)
    expect(ensureInstalledMock).toHaveBeenCalledWith(
      ['@commitlint/cli', '@commitlint/config-conventional', 'husky', 'lint-staged'],
      { dev: true },
    )
  })

  it('--czgit 时应该额外安装 commitizen 和 cz-git', async () => {
    await init({ czgit: true })
    const [pkgs] = ensureInstalledMock.mock.calls[0]
    expect(pkgs).toContain('commitizen')
    expect(pkgs).toContain('cz-git')
  })

  it('是 TS 项目时应该写 commitlint.config.ts', async () => {
    isTsProjectMock.mockReturnValue(true)
    await init({})
    expect(writeFile).toHaveBeenCalledWith('commitlint.config.ts', expect.any(String))
  })

  it('非 TS 项目应该写 commitlint.config.js', async () => {
    isTsProjectMock.mockReturnValue(false)
    await init({})
    expect(writeFile).toHaveBeenCalledWith('commitlint.config.js', expect.any(String))
  })

  it('commitlint 配置文件已存在时应该跳过写入并给出警告', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('commitlint.config'))
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith(expect.stringContaining('commitlint.config'), expect.anything())
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('already exists'))
  })

  it('husky hooks 已存在时应该保留用户原内容并给出警告', async () => {
    // husky 9's init unconditionally overwrites .husky/pre-commit, so "do nothing"
    // isn't an option here — the content read before init must be written back,
    // otherwise the user's hook would be destroyed
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('.husky'))
    vi.mocked(readFileSync).mockReturnValue('# 用户自己手写的钩子')
    await init({})
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]pre-commit$/), '# 用户自己手写的钩子')
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]commit-msg$/), '# 用户自己手写的钩子')
    // Must not be overwritten with our own hook content
    expect(writeFile).not.toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]pre-commit$/), expect.stringContaining('lint-staged'))
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('.husky/pre-commit'))
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('.husky/commit-msg'))
  })

  it('lint-staged 配置文件不存在时应该写入 lint-staged.config.mjs', async () => {
    detectLinterMock.mockReturnValue('eslint')
    await init({})
    expect(writeFile).toHaveBeenCalledWith('lint-staged.config.mjs', expect.stringContaining('eslint-fix-command'))
  })

  it('lint-staged.config.mjs 已存在时应该跳过写入并给出警告', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('lint-staged.config.mjs'))
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith('lint-staged.config.mjs', expect.anything())
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('lint-staged'))
  })

  it('package.json 已有内联 lint-staged 字段时应该跳过写入并给出警告，且不清理该字段', async () => {
    pkgState = { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } }
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith('lint-staged.config.mjs', expect.anything())
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('lint-staged'))
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written['lint-staged']).toEqual({ '*.ts': 'my-own-linter' })
  })

  it('husky hooks 不存在时应该写入 pre-commit 和 commit-msg', async () => {
    await init({})
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]pre-commit$/), expect.stringContaining('lint-staged'))
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]commit-msg$/), expect.stringContaining('commitlint'))
  })

  it('husky init 自己创建的 pre-commit 不应该挡住我们的钩子', async () => {
    // Regression case: husky init generates a .husky/pre-commit whose content is `npm test`.
    // The existence check must happen before husky init runs, otherwise our hook never gets written.
    let huskyInitialized = false
    pmExecMock.mockImplementation(async (command: string) => {
      if (command === 'husky init')
        huskyInitialized = true
    })
    vi.mocked(existsSync).mockImplementation(p => huskyInitialized && toPosix(p).includes('.husky/pre-commit'))

    await init({})

    expect(huskyInitialized).toBe(true)
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.husky[\\/]pre-commit$/),
      expect.stringContaining('lint-staged'),
    )
    // This hook was never the user's to begin with, so no "already exists" warning should fire
    expect(printWarnMock).not.toHaveBeenCalledWith(expect.stringContaining('.husky/pre-commit'))
  })

  it('应该在 package.json 中写入 commitlint 脚本', async () => {
    await init({})
    expect(writePackageJSONMock).toHaveBeenCalled()
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written.scripts!.commitlint).toBe('commitlint --edit')
  })

  it('--czgit 时应该写入 commitizen 配置和 cz 脚本', async () => {
    await init({ czgit: true })
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(written.scripts!.cz).toBe('git cz')
  })

  it('非 czgit 时应该清理已有的 commitizen 配置和 cz 脚本', async () => {
    pkgState = {
      name: 'demo',
      scripts: { cz: 'git cz' },
      config: { commitizen: { path: 'node_modules/cz-git' } },
    }
    await init({})
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written.config!.commitizen).toBeUndefined()
    expect(written.scripts!.cz).toBeUndefined()
  })

  it('检测到 eslint 时应该直接执行本地 eslint，且允许失败', async () => {
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    expect(pmExecMock).toHaveBeenCalledWith(
      'eslint package.json commitlint.config.ts lint-staged.config.mjs --fix',
      { allowFailure: true },
    )
  })

  it('package.json 已有内联 lint-staged 字段时，收尾修复不应该引用未生成的配置文件', async () => {
    pkgState = { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } }
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    expect(pmExecMock).toHaveBeenCalledWith(
      'eslint package.json commitlint.config.ts --fix',
      { allowFailure: true },
    )
  })

  it('husky init 写入的 scripts.prepare 不应该被后续 package.json 写入覆盖掉', async () => {
    // Simulate the real side effect of husky init: unconditionally writes scripts.prepare into package.json
    pmExecMock.mockImplementation(async (command: string) => {
      if (command === 'husky init')
        pkgState = { ...pkgState, scripts: { ...pkgState.scripts, prepare: 'husky' } }
    })
    await init({})
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written.scripts!.prepare).toBe('husky')
  })

  it('不应该再往 package.json 里写临时的 fix 脚本', async () => {
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    // package.json is written exactly once, during the config-writing step; lint no longer causes an extra round trip
    expect(writePackageJSONMock).toHaveBeenCalledTimes(1)
    for (const [written] of writePackageJSONMock.mock.calls)
      expect(written.scripts!['__hubery__:fix']).toBeUndefined()
  })

  it('未检测到任何 linter 时不应该运行 lint', async () => {
    detectLinterMock.mockReturnValue(undefined)
    isInteractiveMock.mockReturnValue(false)
    await init({})
    expect(pmExecMock).not.toHaveBeenCalledWith(
      expect.stringContaining('--fix'),
      expect.anything(),
    )
  })

  describe('linter 选择', () => {
    it('--linter=none 时应该跳过 lint 相关规则和收尾修复', async () => {
      await init({ linter: 'none' })
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
      expect(detectLinterMock).not.toHaveBeenCalled()
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
    })

    it('--linter=biome 应该绕开自动探测，直接使用 biome', async () => {
      isLinterInstalledMock.mockImplementation(kind => kind === 'biome')
      await init({ linter: 'biome' })
      expect(detectLinterMock).not.toHaveBeenCalled()
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('biome'), { allowFailure: true })
    })

    it('--linter=biome 但项目其实没装 biome 时不应该执行收尾修复', async () => {
      isLinterInstalledMock.mockReturnValue(false)
      await init({ linter: 'biome' })
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
    })

    it('无法识别的 --linter 值应该给出警告并回退到自动探测', async () => {
      detectLinterMock.mockReturnValue('eslint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
      await init({ linter: 'not-a-real-linter' })
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('not-a-real-linter'))
      expect(detectLinterMock).toHaveBeenCalled()
    })

    it('探测不到任何 linter 且处于交互环境时应该弹出提示', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(true)
      promptLinterChoiceMock.mockResolvedValue('oxlint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'oxlint')
      await init({})
      expect(promptLinterChoiceMock).toHaveBeenCalledTimes(1)
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('oxlint'), { allowFailure: true })
    })

    it('探测不到任何 linter 且非交互环境时应该跳过并给出警告，不弹出提示', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(false)
      await init({})
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('No linter detected'))
    })

    it('交互提示被取消时应该跳过并给出警告', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(true)
      promptLinterChoiceMock.mockResolvedValue(undefined)
      await init({})
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('cancelled'))
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
    })

    it('裸 --linter（mri 解析为布尔值 true）不应该抛出异常，应回退到自动探测', async () => {
      // mri parses a bare `--linter` (no attached value) as boolean true, not a string,
      // since main.ts doesn't yet declare `linter` in its `string` array (that's Task 6's job).
      // resolveLinterChoice must defend against this at runtime despite ArgvOptions.linter's
      // static `string | undefined` type.
      detectLinterMock.mockReturnValue('eslint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
      await expect(init({ linter: true as any })).resolves.not.toThrow()
      expect(detectLinterMock).toHaveBeenCalled()
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('eslint'), { allowFailure: true })
    })
  })
})
