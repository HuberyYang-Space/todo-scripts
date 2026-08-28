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
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--czgit'))
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
})
