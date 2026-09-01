import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initMock = vi.fn()
vi.mock('@/scripts/commitlint-init', () => ({ init: initMock }))

const uninstallMock = vi.fn()
const bannerMock = vi.fn()
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>()
  return {
    ...actual,
    banner: bannerMock,
  }
})

vi.mock('@/utils/package-manager', () => ({
  createPackageManager: () => ({ uninstall: uninstallMock }),
}))

vi.mock('yocto-spinner', () => ({
  default: () => ({ success: vi.fn(), start: vi.fn(), stop: vi.fn() }),
}))

const { ScriptError } = await import('@/utils')
const { main } = await import('@/scripts/main')

describe('main', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    initMock.mockReset()
    uninstallMock.mockReset()
    bannerMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('--help 时应该打印帮助信息，且不执行任何脚本', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--help']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('commitlint-init'))
    expect(initMock).not.toHaveBeenCalled()
  })

  it('不带脚本名的 hubery --help 也应该打印帮助信息', async () => {
    // Args are parsed starting from argv[2], so --help no longer needs to follow the script name
    process.argv = ['node', 'hubery', '--help']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('commitlint-init'))
    expect(initMock).not.toHaveBeenCalled()
  })

  it('-h 简写同样有效', async () => {
    process.argv = ['node', 'hubery', '-h']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--clear'))
  })

  it('传入已注册脚本名时应该调用该脚本的 init', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init']
    await main()
    expect(initMock).toHaveBeenCalledTimes(1)
  })

  it('传入未注册脚本名时应该抛出 ScriptError', async () => {
    process.argv = ['node', 'hubery', 'not-a-script']
    // main() itself never terminates the process; exiting is left to bin/index.js
    await expect(main()).rejects.toThrow(ScriptError)
    await expect(main()).rejects.toThrow('Please use a script.')
    expect(initMock).not.toHaveBeenCalled()
  })

  it('不传脚本名时应该抛出 ScriptError', async () => {
    process.argv = ['node', 'hubery']
    await expect(main()).rejects.toThrow('Please use a script.')
  })

  it('--clear 时应该在脚本执行完后卸载模块', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--clear']
    await main()
    expect(initMock).toHaveBeenCalledTimes(1)
    expect(uninstallMock).toHaveBeenCalledWith('@huberyyang/todo-scripts')
  })

  it('没有 --clear 时不应该卸载模块', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init']
    await main()
    expect(uninstallMock).not.toHaveBeenCalled()
  })

  it('每次调用都应该打印 banner', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--help']
    await main()
    expect(bannerMock).toHaveBeenCalledTimes(1)
  })

  it('--linter=biome 应该被解析成字符串，而不是被强转成布尔值', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--linter=biome']
    await main()
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ linter: 'biome' }))
  })
})

describe('子命令帮助', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    initMock.mockReset()
    bannerMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('hubery <script> --help 应该打印该子命令自己的参数', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--help']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--czgit'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--linter'))
    expect(initMock).not.toHaveBeenCalled()
  })

  it('不带子命令的 hubery --help 不应该混入子命令参数', async () => {
    process.argv = ['node', 'hubery', '--help']
    await main()
    const printed = vi.mocked(console.log).mock.calls.map(c => String(c[0])).join('\n')
    expect(printed).toContain('commitlint-init')
    expect(printed).not.toContain('--czgit')
  })
})

describe('未知参数校验', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    initMock.mockReset()
    bannerMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('拼错的参数应该报错而不是被静默忽略', async () => {
    // `--czgti` 原来会被 mri 悄悄吞掉，脚本照常按默认行为跑完
    process.argv = ['node', 'hubery', 'commitlint-init', '--czgti']
    await expect(main()).rejects.toThrow(ScriptError)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('报错信息里应该带上拼错的参数名', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--czgti']
    await expect(main()).rejects.toThrow(/czgti/)
  })

  it('合法的全局参数与子命令参数组合不应该报错', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--czgit', '--linter=biome']
    await main()
    expect(initMock).toHaveBeenCalledTimes(1)
  })

  it('已移除的 --force 应该被当成未知参数报错', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--force']
    await expect(main()).rejects.toThrow(/force/)
  })

  it('已移除的 --dry-run 应该被当成未知参数报错', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--dry-run']
    await expect(main()).rejects.toThrow(/dry-run/)
  })

  it('别名 -h 不应该被当成未知参数', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '-h']
    await main()
    expect(initMock).not.toHaveBeenCalled()
  })
})

describe('--version', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    initMock.mockReset()
    bannerMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('--version 应该打印版本号且不执行任何脚本', async () => {
    process.argv = ['node', 'hubery', '--version']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+/))
    expect(initMock).not.toHaveBeenCalled()
  })

  it('-v 简写同样有效', async () => {
    process.argv = ['node', 'hubery', '-v']
    await main()
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+/))
  })

  it('带子命令时 --version 也应该只打印版本，不跑脚本', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--version']
    await main()
    expect(initMock).not.toHaveBeenCalled()
  })
})
