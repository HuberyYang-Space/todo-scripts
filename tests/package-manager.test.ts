import fs from 'node:fs'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScriptError } from '@/utils'
import { createPackageManager, getPkgManager } from '@/utils/package-manager'

vi.mock('execa', async importOriginal => ({
  ...await importOriginal<typeof import('execa')>(),
  execa: vi.fn(async () => {}),
}))
/** 记录 spinner 收到的文案，好断言卸载过程的提示确实换成了中文 */
const spinnerText = vi.hoisted(() => ({
  initial: [] as (string | undefined)[],
  success: [] as (string | undefined)[],
}))

vi.mock('yocto-spinner', () => ({
  default: (options?: { text?: string }) => {
    spinnerText.initial.push(options?.text)
    return {
      start: vi.fn(function (this: any) { return this }),
      success: vi.fn((text?: string) => { spinnerText.success.push(text) }),
      stop: vi.fn(),
    }
  },
}))

const originalUserAgent = process.env.npm_config_user_agent

/** 模拟指定的包管理器 + 非 monorepo + 什么都还没装 */
function usePkgManager(userAgent: string | undefined) {
  if (userAgent === undefined)
    delete process.env.npm_config_user_agent
  else
    process.env.npm_config_user_agent = userAgent

  vi.spyOn(fs, 'existsSync').mockReturnValue(false)
  return createPackageManager()
}

afterEach(() => {
  if (originalUserAgent === undefined)
    delete process.env.npm_config_user_agent
  else
    process.env.npm_config_user_agent = originalUserAgent

  vi.mocked(execa).mockReset()
  vi.restoreAllMocks()
})

// ========================================
// getPkgManager —— 探测当前使用的包管理器
// ========================================
describe('getPkgManager', () => {
  it('应该正确解析 pnpm 的 user agent', () => {
    process.env.npm_config_user_agent = 'pnpm/10.33.0 npm/? node/v22.12.0'
    expect(getPkgManager()).toEqual({ name: 'pnpm', version: '10.33.0' })
  })

  it('应该正确解析 npm 的 user agent', () => {
    process.env.npm_config_user_agent = 'npm/10.2.0 node/v20.10.0'
    expect(getPkgManager()).toEqual({ name: 'npm', version: '10.2.0' })
  })

  it('应该正确解析 yarn 的 user agent', () => {
    process.env.npm_config_user_agent = 'yarn/1.22.19 npm/? node/v20.10.0'
    expect(getPkgManager()).toEqual({ name: 'yarn', version: '1.22.19' })
  })

  it('应该正确解析 bun 的 user agent', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 npm/? node/v20.10.0'
    expect(getPkgManager()).toEqual({ name: 'bun', version: '1.0.0' })
  })

  it('当 user agent 不存在时应该返回 undefined', () => {
    delete process.env.npm_config_user_agent
    expect(getPkgManager()).toBeUndefined()
  })
})

// ========================================
// ensureInstalled —— 各包管理器的安装命令
// ========================================
describe('ensureInstalled', () => {
  // npm / pnpm / yarn 三行是手工验证过的；bun / deno 照官方文档写
  it.each([
    ['npm/10.2.0 node/v20.10.0', 'npm install husky --save-dev'],
    ['pnpm/10.33.0 npm/? node/v22.12.0', 'pnpm add husky --save-dev'],
    ['yarn/1.22.19 npm/? node/v20.10.0', 'yarn add husky --dev'],
    ['bun/1.0.0 npm/? node/v20.10.0', 'bun add husky --dev'],
    ['deno/1.40.0 npm/? node/v20.10.0', 'deno add husky --dev'],
  ])('%s 应该生成 "%s"', async (userAgent, expected) => {
    const pm = usePkgManager(userAgent)
    await pm.ensureInstalled(['husky'], { dev: true })
    const [file, ...commandArguments] = expected.split(' ')
    expect(execa).toHaveBeenCalledWith(file, commandArguments)
  })

  it('yarn 不能用 install 子命令 —— yarn v1 会直接报错退出', async () => {
    const pm = usePkgManager('yarn/1.22.19 npm/? node/v20.10.0')
    await pm.ensureInstalled(['husky'], { dev: true })
    const commandArguments = vi.mocked(execa).mock.calls[0][1] as string[]
    expect(commandArguments).not.toContain('install')
    expect(commandArguments).not.toContain('--save-dev')
  })

  it('认不出的包管理器应该回退到 npm', async () => {
    const pm = usePkgManager(undefined)
    expect(pm.name).toBe('npm')
    await pm.ensureInstalled(['husky'], { dev: true })
    expect(execa).toHaveBeenCalledWith('npm', ['install', 'husky', '--save-dev'])
  })

  it('不传 dev 时不应该带开发依赖标志', async () => {
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    await pm.ensureInstalled(['husky'])
    expect(execa).toHaveBeenCalledWith('npm', ['install', 'husky'])
  })

  it('多个包应该合并成一条命令', async () => {
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    await pm.ensureInstalled(['husky', 'lint-staged'], { dev: true })
    expect(execa).toHaveBeenCalledTimes(1)
    expect(execa).toHaveBeenCalledWith('npm', ['install', 'husky', 'lint-staged', '--save-dev'])
  })

  it('全部已安装时不应该执行任何命令', async () => {
    process.env.npm_config_user_agent = 'npm/10.2.0 node/v20.10.0'
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const pm = createPackageManager()
    // 构造完之后，让 node_modules 解析成「什么都已经装好了」——
    // package.json 也必须一起 mock，否则这里会读到本仓库真实的依赖，
    // 用例通过就只是因为本仓库恰好装了 husky
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ devDependencies: { husky: '^9.1.7' } }))
    await pm.ensureInstalled(['husky'], { dev: true })
    expect(execa).not.toHaveBeenCalled()
  })

  it('pnpm monorepo 应该带上 -w', async () => {
    process.env.npm_config_user_agent = 'pnpm/10.33.0 npm/? node/v22.12.0'
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (String(p).includes('pnpm-workspace.yaml'))
        return 'packages:\n  - packages/*\n'
      return JSON.stringify({ name: 'test' })
    })
    const pm = createPackageManager()
    // node_modules 解析为不存在，于是真的会走安装流程
    vi.spyOn(fs, 'existsSync').mockImplementation(p => !String(p).includes('node_modules/'))
    await pm.ensureInstalled(['husky'], { dev: true })
    expect(execa).toHaveBeenCalledWith('pnpm', ['add', '-w', 'husky', '--save-dev'])
  })

  it('yarn monorepo 应该带上 -W', async () => {
    process.env.npm_config_user_agent = 'yarn/1.22.19 npm/? node/v20.10.0'
    vi.spyOn(fs, 'existsSync').mockImplementation(p => !String(p).includes('pnpm-workspace.yaml'))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ workspaces: ['packages/*'] }))
    const pm = createPackageManager()
    vi.spyOn(fs, 'existsSync').mockImplementation(p => !String(p).includes('node_modules/'))
    await pm.ensureInstalled(['husky'], { dev: true })
    expect(execa).toHaveBeenCalledWith('yarn', ['add', '-W', 'husky', '--dev'])
  })
})

// ========================================
// uninstall / exec / formatExec
// ========================================
describe('uninstall', () => {
  it.each([
    ['npm/10.2.0 node/v20.10.0', 'npm uninstall some-pkg'],
    ['pnpm/10.33.0 npm/? node/v22.12.0', 'pnpm remove some-pkg'],
    ['yarn/1.22.19 npm/? node/v20.10.0', 'yarn remove some-pkg'],
  ])('%s 应该生成 "%s"', async (userAgent, expected) => {
    const pm = usePkgManager(userAgent)
    await pm.uninstall('some-pkg')
    const [file, ...commandArguments] = expected.split(' ')
    expect(execa).toHaveBeenCalledWith(file, commandArguments)
  })

  it('卸载过程的 spinner 文案应该是中文', async () => {
    // 这两条文案走的是 yoctoSpinner({ text }) 和 s.success()，不是 spinner.start()，
    // 一直没有任何断言盯着 —— 改错了也不会有人发现
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    await pm.uninstall('some-pkg')
    expect(spinnerText.initial).toContain('正在卸载...')
    expect(spinnerText.success).toContain('已卸载 some-pkg！')
  })

  it('卸载失败时应该抛出 ScriptError', async () => {
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    vi.mocked(execa).mockRejectedValue(new Error('boom'))
    await expect(pm.uninstall('some-pkg')).rejects.toThrow(ScriptError)
    await expect(pm.uninstall('some-pkg')).rejects.toThrow('卸载 some-pkg 失败。')
  })
})

describe('exec / formatExec', () => {
  it.each([
    ['npm/10.2.0 node/v20.10.0', 'npx --no -- husky init'],
    ['pnpm/10.33.0 npm/? node/v22.12.0', 'pnpm exec husky init'],
    ['yarn/1.22.19 npm/? node/v20.10.0', 'yarn husky init'],
    ['bun/1.0.0 npm/? node/v20.10.0', 'bunx husky init'],
    // deno 的 npm: 前缀直接贴着 bin 名字，中间不能有空格
    ['deno/1.40.0 npm/? node/v20.10.0', 'deno run -A npm:husky init'],
  ])('%s 应该拼成 "%s"', async (userAgent, expected) => {
    const pm = usePkgManager(userAgent)
    expect(pm.formatExec('husky init')).toBe(expected)
    await pm.exec('husky init')
    const [file, ...commandArguments] = expected.split(' ')
    expect(execa).toHaveBeenCalledWith(file, commandArguments)
  })

  it('allowFailure 为真时，命令失败不应该抛错', async () => {
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    vi.mocked(execa).mockRejectedValue(new Error('lint failed'))
    await expect(pm.exec('eslint . --fix', { allowFailure: true })).resolves.toBeUndefined()
  })

  it('默认情况下命令失败仍然应该抛出 ScriptError', async () => {
    const pm = usePkgManager('npm/10.2.0 node/v20.10.0')
    vi.mocked(execa).mockRejectedValue(new Error('boom'))
    await expect(pm.exec('husky init')).rejects.toThrow(ScriptError)
  })

  it('认不出的包管理器拼出的命令不应该缺少空格', async () => {
    // 旧实现的默认分支返回的是 'npx'（少了个结尾空格），拼出来是 npxhusky
    const pm = usePkgManager('cnpm/1.0.0 node/v20.10.0')
    expect(pm.formatExec('husky init')).toBe('npx --no -- husky init')
  })
})

// ========================================
// 探测只发生一次 —— 构造之后不再重复读文件系统
// ========================================
describe('探测只发生一次', () => {
  beforeEach(() => {
    process.env.npm_config_user_agent = 'npm/10.2.0 node/v20.10.0'
  })

  it('构造之后，多次安装不应该重复做 monorepo 判定', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const pm = createPackageManager()
    const afterConstruct = existsSpy.mock.calls.length

    await pm.ensureInstalled(['a'], { dev: true })
    await pm.ensureInstalled(['b'], { dev: true })

    // 之后每个包只剩一次 node_modules 存在性检查 —— 不会重复读 pnpm-workspace.yaml
    const calls = existsSpy.mock.calls.slice(afterConstruct).map(c => String(c[0]))
    expect(calls).toHaveLength(2)
    expect(calls.every(p => p.includes('node_modules'))).toBe(true)
  })
})
