import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  execCommand,
  getPackageJSON,
  hasDependency,
  isInteractive,
  isMonorepo,
  isRootFileExist,
  isTsProject,
  printErr,
  printInfo,
  printWarn,
  resolveBannerMode,
  ScriptError,
  writePackageJSON,
} from '@/utils'

// 为失败路径的用例准备：execa 和文件写入要能按需失败，spinner 也不能在测试输出里转圈
vi.mock('execa', async importOriginal => ({
  ...await importOriginal<typeof import('execa')>(),
  execa: vi.fn(async () => {}),
}))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(async () => {}) }))
vi.mock('yocto-spinner', () => ({
  default: () => ({ start: vi.fn(function (this: any) { return this }), success: vi.fn(), stop: vi.fn() }),
}))

// ========================================
// isRootFileExist —— 检查项目根目录下是否存在某个文件
// ========================================
describe('isRootFileExist', () => {
  it('文件存在时应该返回 true', () => {
    // 当前项目根目录下必然有 package.json
    expect(isRootFileExist('package.json')).toBe(true)
  })

  it('文件不存在时应该返回 false', () => {
    // 一个不可能存在的文件名
    expect(isRootFileExist('this-file-does-not-exist-12345.json')).toBe(false)
  })
})

// ========================================
// isTsProject —— 判断项目是不是 TypeScript 项目
// ========================================
describe('isTsProject', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('存在 tsconfig.json 时应该返回 true', () => {
    // 模拟一个包含 tsconfig.json 的目录
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'tsconfig.json', 'src'] as any)
    expect(isTsProject()).toBe(true)
  })

  it('存在 tsconfig.app.json 时应该返回 true', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'tsconfig.app.json'] as any)
    expect(isTsProject()).toBe(true)
  })

  it('存在 tsconfig.node.json 时应该返回 true', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'tsconfig.node.json'] as any)
    expect(isTsProject()).toBe(true)
  })

  it('存在 tsconfig.base.json 时应该返回 true', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'tsconfig.base.json'] as any)
    expect(isTsProject()).toBe(true)
  })

  it('存在 tsconfig.build.json 时应该返回 true', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'tsconfig.build.json'] as any)
    expect(isTsProject()).toBe(true)
  })

  it('不存在任何 tsconfig 文件时应该返回 false', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['package.json', 'index.js'] as any)
    expect(isTsProject()).toBe(false)
  })

  it('不应该误判名称相似但不匹配的文件', () => {
    // "mytsconfig.json" 不是以 tsconfig 开头的，不该被匹配到
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['mytsconfig.json', 'tsconfig-invalid'] as any)
    expect(isTsProject()).toBe(false)
  })
})

// ========================================
// isMonorepo —— 判断项目是不是 monorepo
// ========================================
describe('isMonorepo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pnpm-workspace.yaml 中声明了非空 packages 时应该返回 true', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (String(p).includes('pnpm-workspace.yaml'))
        return 'packages:\n  - packages/*\n'
      return JSON.stringify({ name: 'my-project' })
    })
    expect(isMonorepo()).toBe(true)
  })

  it('pnpm-workspace.yaml 存在但没有声明 packages 字段时应该返回 false', () => {
    // 复现本仓库自己的情况：pnpm-workspace.yaml 里只有配置项，没有 packages 字段
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (String(p).includes('pnpm-workspace.yaml'))
        return 'shellEmulator: true\n'
      return JSON.stringify({ name: 'my-project' })
    })
    expect(isMonorepo()).toBe(false)
  })

  it('package.json 中有 workspaces 字段时应该返回 true', () => {
    // 模拟 pnpm-workspace.yaml 不存在
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // pnpm-workspace.yaml 不在，但 package.json 在
      return !String(p).includes('pnpm-workspace.yaml')
    })
    // 模拟 package.json 里带有 workspaces 字段
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      name: 'my-monorepo',
      workspaces: ['packages/*'],
    }))
    expect(isMonorepo()).toBe(true)
  })

  it('既没有 pnpm-workspace.yaml 也没有 workspaces 时应该返回 false', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return !String(p).includes('pnpm-workspace.yaml')
    })
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      name: 'my-project',
    }))
    expect(isMonorepo()).toBe(false)
  })
})

// ========================================
// getPackageJSON —— 读取并解析 package.json
// ========================================
describe('getPackageJSON', () => {
  it('应该返回一个包含 name 字段的对象', () => {
    // 当前项目根目录有 package.json，所以这里直接读真实文件
    const pkg = getPackageJSON()
    expect(pkg).toBeDefined()
    expect(pkg!.name).toBe('@huberyyang/todo-scripts')
  })

  it('返回的对象应该包含 version 字段', () => {
    const pkg = getPackageJSON()
    // version 应该是一个 semver 格式的字符串
    expect(pkg!.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('当 package.json 不存在时应该抛出 ScriptError', () => {
    // 模拟文件不存在的情况：不再返回 undefined，所以调用方不用判空
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(() => getPackageJSON()).toThrow(ScriptError)
    expect(() => getPackageJSON()).toThrow('当前目录下找不到 package.json。')
    vi.restoreAllMocks()
  })

  it('当 package.json 内容非法时应该抛出 ScriptError', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{ not json')
    expect(() => getPackageJSON()).toThrow('解析 package.json 失败。')
    vi.restoreAllMocks()
  })
})

// ========================================
// printWarn / printErr —— 终端消息输出
// ========================================
describe('printWarn', () => {
  it('应该调用 console.log 输出警告信息', () => {
    // 用 vi.spyOn 观察 console.log 的调用
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printWarn('test warning')
    // printWarn 会调用 console.log 三次：空行、内容、空行
    expect(spy).toHaveBeenCalledTimes(3)
    // 第二次调用应该包含警告文本
    const output = spy.mock.calls[1][0] as string
    expect(output).toContain('test warning')
    // 断言带前后空格的色块标记本身，而不是裸的 'WARN'——后者是 'warning' 的子串，
    // 消息文案一旦改成含 WARNING 的大写字样，这条断言就会在标记丢失时照样通过
    expect(output).toContain(' WARN ')
    spy.mockRestore()
  })
})

describe('printErr', () => {
  it('应该调用 console.log 输出错误信息', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printErr('test error')
    expect(spy).toHaveBeenCalledTimes(3)
    const output = spy.mock.calls[1][0] as string
    expect(output).toContain('test error')
    expect(output).toContain(' ERROR ')
    spy.mockRestore()
  })
})

// ========================================
// resolveBannerMode —— 头部 banner 根据终端能力挑选渲染模式
// ========================================
describe('resolveBannerMode', () => {
  it('终端够宽且支持颜色时应该返回 gradient', () => {
    expect(resolveBannerMode(120, true)).toBe('gradient')
  })

  it('终端宽度不足以放下大字时应该返回 plain', () => {
    expect(resolveBannerMode(40, true)).toBe('plain')
  })

  it('终端不支持颜色时应该返回 plain（即便宽度足够）', () => {
    expect(resolveBannerMode(120, false)).toBe('plain')
  })

  it('宽度刚好等于阈值时应该返回 gradient', () => {
    expect(resolveBannerMode(90, true)).toBe('gradient')
  })

  it('宽度比阈值少 1 列时应该返回 plain', () => {
    expect(resolveBannerMode(89, true)).toBe('plain')
  })

  it('非 TTY 场景下 columns 为 0 时应该返回 plain', () => {
    // process.stdout.columns 为 undefined 时，banner() 传进来的是 0
    expect(resolveBannerMode(0, true)).toBe('plain')
  })
})

// ========================================
// isInteractive —— stdin 是不是一个真正的交互式终端
// ========================================
describe('isInteractive', () => {
  const originalIsTTY = process.stdin.isTTY
  const originalCI = process.env.CI

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    if (originalCI === undefined)
      delete process.env.CI
    else
      process.env.CI = originalCI
  })

  it('tTY 且没有 CI 环境变量时应该返回 true', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    delete process.env.CI
    expect(isInteractive()).toBe(true)
  })

  it('非 TTY 时应该返回 false', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    delete process.env.CI
    expect(isInteractive()).toBe(false)
  })

  it('即便是 TTY，设置了 CI 环境变量时也应该返回 false', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    process.env.CI = 'true'
    expect(isInteractive()).toBe(false)
  })
})

// ========================================
// hasDependency —— 项目是否已经有某个依赖
// ========================================
describe('hasDependency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** node_modules 和 package.json 都存在；package.json 的内容由入参决定 */
  function mockProject(pkgJson: object) {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(pkgJson))
  }

  it('装在 node_modules 且写进 devDependencies 时应该返回 true', () => {
    mockProject({ devDependencies: { husky: '^9.0.0' } })
    expect(hasDependency('husky')).toBe(true)
  })

  it('写在 dependencies 里同样算数', () => {
    mockProject({ dependencies: { husky: '^9.0.0' } })
    expect(hasDependency('husky')).toBe(true)
  })

  it('装在 node_modules 但没写进 package.json 时应该返回 false', () => {
    // 复现被提升上来的传递依赖：目录在，但这个依赖从没被声明过 ——
    // 只查目录会把它误判成已安装，从而跳过安装
    mockProject({ devDependencies: { '@commitlint/cli': '^21.0.0' } })
    expect(hasDependency('@commitlint/config-conventional')).toBe(false)
  })

  it('写进了 package.json 但 node_modules 下不存在时应该返回 false', () => {
    // resolve() 在 windows 上返回反斜杠路径；统一规范化成 posix 形式再比较，两个平台就都能对上
    vi.spyOn(fs, 'existsSync').mockImplementation(p => !String(p).replaceAll('\\', '/').endsWith('node_modules/husky'))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ devDependencies: { husky: '^9.0.0' } }))
    expect(hasDependency('husky')).toBe(false)
  })

  it('没有 package.json 时应该返回 false 而不是抛错', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(p => String(p).endsWith('node_modules/husky'))
    expect(() => hasDependency('husky')).not.toThrow()
    expect(hasDependency('husky')).toBe(false)
  })
})

// ========================================
// 失败路径 —— 叶子函数只抛 ScriptError，从不终止进程
// ========================================
describe('失败路径', () => {
  afterEach(() => {
    vi.mocked(execa).mockReset()
    vi.mocked(writeFile).mockReset()
    vi.restoreAllMocks()
  })

  it('execCommand 命令失败时应该抛出 ScriptError，并挂上原始错误', async () => {
    const raw = new Error('exit code 1')
    vi.mocked(execa).mockRejectedValue(raw)
    await expect(execCommand('git init')).rejects.toThrow(ScriptError)
    // 原始错误通过 cause 保留下来，排障时不会丢掉证据
    await expect(execCommand('git init')).rejects.toMatchObject({
      message: `执行 'git init' 失败。`,
      cause: raw,
    })
  })

  it('writePackageJSON 写入失败时应该抛出 ScriptError', async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error('EACCES'))
    await expect(writePackageJSON({ name: 'demo' })).rejects.toThrow('写入 package.json 失败。')
  })

  it('这些失败都不应该调用 process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.mocked(execa).mockRejectedValue(new Error('boom'))
    await expect(execCommand('whatever')).rejects.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})

// printInfo - 中性提示，用于「一切正常」的告知
describe('printInfo', () => {
  it('应该打印带 INFO 标记的消息', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printInfo('test info')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(' INFO '))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test info'))
    spy.mockRestore()
  })

  it('不应该被渲染成 WARN', () => {
    // 「已有配置，沿用你的」是正常结果而不是警告，用黄色 WARN 渲染会让人以为出错了
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printInfo('test info')
    const printed = spy.mock.calls.map(c => String(c[0])).join('')
    expect(printed).not.toContain(' WARN ')
    spy.mockRestore()
  })
})
