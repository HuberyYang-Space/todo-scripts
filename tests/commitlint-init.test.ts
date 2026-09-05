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
const printInfoMock = vi.fn()
const writePackageJSONMock = vi.fn(async (_data: PackageJsonLike) => {})
let pkgState: PackageJsonLike
const getPackageJSONMock = vi.fn((): PackageJsonLike => pkgState)

vi.mock('@/utils', () => ({
  execCommand: execCommandMock,
  getPackageJSON: getPackageJSONMock,
  isInteractive: isInteractiveMock,
  isTsProject: isTsProjectMock,
  printInfo: printInfoMock,
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

// 包管理器唯一的接缝：脚本只经由它和 npm/pnpm/yarn 打交道
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

// resolve() 在 windows 上返回反斜杠路径；断言前统一规范化成 posix 形式，两个平台就都能对上
function toPosix(p: unknown): string {
  return String(p).replaceAll('\\', '/')
}

describe('commitlint-init init()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    pkgState = { name: 'demo' }
    // resetAllMocks 会清掉实现，所以在这里把每个 mock 的默认行为重新建立起来
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
    // 一次调用装完，而不是一个包一个包地串行装
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

  it('commitlint 配置文件已存在时应该跳过写入并给出中性提示', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('commitlint.config'))
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith(expect.stringContaining('commitlint.config'), expect.anything())
    expect(printInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('已保留你的 commitlint 配置 —— commitlint.config.ts 已存在。'),
    )
  })

  it('husky hooks 已存在时应该在保留用户原内容的基础上追加我们的命令', async () => {
    // husky 9 的 init 会无条件覆盖 .husky/pre-commit，所以必须把 init 之前读到的内容
    // 写回去。但「只」写回那份内容，会让我们的命令根本没进钩子 —— 配置看起来一切正常，
    // 可 lint-staged 从来没跑过。
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('.husky'))
    vi.mocked(readFileSync).mockReturnValue('# 用户自己手写的钩子')
    await init({})
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.husky[\\/]pre-commit$/),
      expect.stringContaining('# 用户自己手写的钩子'),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.husky[\\/]pre-commit$/),
      expect.stringContaining('lint-staged'),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.husky[\\/]commit-msg$/),
      expect.stringContaining('# 用户自己手写的钩子'),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.husky[\\/]commit-msg$/),
      expect.stringContaining('commitlint --edit'),
    )
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('.husky/pre-commit'))
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('.husky/commit-msg'))
  })

  it('lint-staged 配置文件不存在时应该写入 lint-staged.config.mjs', async () => {
    detectLinterMock.mockReturnValue('eslint')
    await init({})
    expect(writeFile).toHaveBeenCalledWith('lint-staged.config.mjs', expect.stringContaining('eslint-fix-command'))
  })

  it('lint-staged.config.mjs 已存在时应该跳过写入并给出中性提示', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('lint-staged.config.mjs'))
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith('lint-staged.config.mjs', expect.anything())
    expect(printInfoMock).toHaveBeenCalledWith(expect.stringContaining('lint-staged'))
  })

  it('package.json 已有内联 lint-staged 字段时应该跳过写入并给出中性提示，且不清理该字段', async () => {
    pkgState = { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } }
    await init({})
    expect(writeFile).not.toHaveBeenCalledWith('lint-staged.config.mjs', expect.anything())
    // 断言必须锚定到「沿用你的配置」这句本身：只匹配 'lint-staged' 会被
    // resolveLinterChoice 那条无关警告（…skipping the lint-staged rule）撞上而假通过
    expect(printInfoMock).toHaveBeenCalledWith(expect.stringContaining('package.json 的 "lint-staged" 字段'))
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written['lint-staged']).toEqual({ '*.ts': 'my-own-linter' })
  })

  it('husky hooks 不存在时应该写入 pre-commit 和 commit-msg', async () => {
    await init({})
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]pre-commit$/), expect.stringContaining('lint-staged'))
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.husky[\\/]commit-msg$/), expect.stringContaining('commitlint'))
  })

  it('husky init 自己创建的 pre-commit 不应该挡住我们的钩子', async () => {
    // 回归用例：husky init 会生成一个内容为 `npm test` 的 .husky/pre-commit。
    // 存在性检查必须发生在 husky init 之前，否则我们的钩子永远写不进去。
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
    // 这个钩子本来就不是用户的，所以不该冒出「已存在」这类警告
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

  it('非 czgit 时不应该删除用户已有的 commitizen 配置和 cz 脚本', async () => {
    // 不传 --czgit 意味着「这次不配 czgit」，而不是「删掉我已有的 commitizen」
    pkgState = {
      name: 'demo',
      scripts: { cz: 'git cz' },
      config: { commitizen: { path: 'node_modules/cz-git' } },
    }
    await init({})
    const written = writePackageJSONMock.mock.calls[0][0]
    expect(written.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(written.scripts!.cz).toBe('git cz')
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
    // 模拟 husky init 真实的副作用：无条件往 package.json 里写 scripts.prepare
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
    // package.json 只在写配置那一步被写入一次；收尾的 lint 不再引起额外的读写往返
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
      expect(printWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('未探测到 linter，当前也不是交互式终端无法询问'),
      )
    })

    it('交互提示被取消时应该跳过并给出警告', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(true)
      promptLinterChoiceMock.mockResolvedValue(undefined)
      await init({})
      expect(printWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('已取消选择 —— 跳过 lint-staged 规则。'),
      )
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
    })

    it('linter 拿到非字符串值时不应该抛出异常，应回退到自动探测', async () => {
      // registry 里 linter 声明成 type: 'string'，buildParserConfig 会把它派生进 mri 的
      // string 列表，所以走 CLI 时裸 --linter 已经不会被解析成布尔值了。但 init() 可以
      // 被直接调用（这个单测就是这么干的），而 ArgvOptions.linter 那个 `string | undefined`
      // 的静态类型挡不住运行时塞进来别的东西，所以 resolveLinterChoice 的运行时防御仍然要留。
      detectLinterMock.mockReturnValue('eslint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
      await expect(init({ linter: true as any })).resolves.not.toThrow()
      expect(detectLinterMock).toHaveBeenCalled()
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('eslint'), { allowFailure: true })
    })
  })
})

describe('提示分级', () => {
  it('跳过已有配置应该是中性提示，不是警告', async () => {
    // 「沿用你已有的配置」是正确结果而不是出错，用 WARN 渲染会让人以为哪里坏了
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('.commitlintrc.json'))
    await init({})
    const kept = '已保留你的 commitlint 配置 —— .commitlintrc.json 已存在。'
    expect(printInfoMock).toHaveBeenCalledWith(expect.stringContaining(kept))
    expect(printWarnMock).not.toHaveBeenCalledWith(expect.stringContaining(kept))
  })

  it('改动了用户的钩子文件仍然应该是警告', async () => {
    vi.mocked(existsSync).mockImplementation(p => String(p).includes('.husky'))
    vi.mocked(readFileSync).mockReturnValue('# 用户自己手写的钩子')
    await init({})
    expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('.husky/pre-commit'))
  })
})
