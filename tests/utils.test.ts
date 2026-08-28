import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  execCommand,
  getPackageJSON,
  hasDependency,
  isMonorepo,
  isRootFileExist,
  isTsProject,
  printErr,
  printWarn,
  resolveBannerMode,
  ScriptError,
  writePackageJSON,
} from '@/utils'

// 失败路径用：execa 与写文件都要能按需失败，spinner 不能在测试输出里转
vi.mock('execa', async importOriginal => ({
  ...await importOriginal<typeof import('execa')>(),
  execa: vi.fn(async () => {}),
}))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(async () => {}) }))
vi.mock('yocto-spinner', () => ({
  default: () => ({ start: vi.fn(function (this: any) { return this }), success: vi.fn(), stop: vi.fn() }),
}))

// ========================================
// isRootFileExist - 检查项目根目录文件是否存在
// ========================================
describe('isRootFileExist', () => {
  it('文件存在时应该返回 true', () => {
    // package.json 在当前项目根目录中一定存在
    expect(isRootFileExist('package.json')).toBe(true)
  })

  it('文件不存在时应该返回 false', () => {
    // 一个不可能存在的文件名
    expect(isRootFileExist('this-file-does-not-exist-12345.json')).toBe(false)
  })
})

// ========================================
// isTsProject - 检测是否为 TypeScript 项目
// ========================================
describe('isTsProject', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('存在 tsconfig.json 时应该返回 true', () => {
    // 模拟目录中包含 tsconfig.json
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
    // "mytsconfig.json" 不以 tsconfig 开头，不应匹配
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['mytsconfig.json', 'tsconfig-invalid'] as any)
    expect(isTsProject()).toBe(false)
  })
})

// ========================================
// isMonorepo - 检测是否为 monorepo 项目
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
    // 复现本仓库自身的场景：pnpm-workspace.yaml 只放配置，没有 packages 字段
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
      // pnpm-workspace.yaml 不存在，但 package.json 存在
      return !String(p).includes('pnpm-workspace.yaml')
    })
    // 模拟 package.json 包含 workspaces 字段
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
// getPackageJSON - 读取并解析 package.json
// ========================================
describe('getPackageJSON', () => {
  it('应该返回一个包含 name 字段的对象', () => {
    // 当前项目根目录有 package.json，直接读取真实文件
    const pkg = getPackageJSON()
    expect(pkg).toBeDefined()
    expect(pkg!.name).toBe('@huberyyang/todo-scripts')
  })

  it('返回的对象应该包含 version 字段', () => {
    const pkg = getPackageJSON()
    // version 应该是一个语义化版本格式的字符串
    expect(pkg!.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('当 package.json 不存在时应该抛出 ScriptError', () => {
    // 模拟文件不存在的场景：不再返回 undefined，调用方因此无需判空
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(() => getPackageJSON()).toThrow(ScriptError)
    expect(() => getPackageJSON()).toThrow('Cannot find package.json')
    vi.restoreAllMocks()
  })

  it('当 package.json 内容非法时应该抛出 ScriptError', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{ not json')
    expect(() => getPackageJSON()).toThrow('Failed to parse package.json.')
    vi.restoreAllMocks()
  })
})

// ========================================
// printWarn / printErr - 终端信息输出
// ========================================
describe('printWarn', () => {
  it('应该调用 console.log 输出警告信息', () => {
    // 使用 vi.spyOn 监听 console.log 的调用
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printWarn('test warning')
    // printWarn 会调用 3 次 console.log：空行、内容、空行
    expect(spy).toHaveBeenCalledTimes(3)
    // 第二次调用应该包含警告文本
    const output = spy.mock.calls[1][0] as string
    expect(output).toContain('test warning')
    expect(output).toContain('WARN')
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
    expect(output).toContain('ERROR')
    spy.mockRestore()
  })
})

// ========================================
// resolveBannerMode - 头部横幅按终端能力选择渲染模式
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
    // banner() 在 process.stdout.columns 为 undefined 时会传 0 进来
    expect(resolveBannerMode(0, true)).toBe('plain')
  })
})

// ========================================
// hasDependency - 项目是否已具备某个依赖
// ========================================
describe('hasDependency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** node_modules 与 package.json 都存在，package.json 内容由参数决定 */
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
    // 复现被提升的传递依赖场景：目录在，但依赖并没有被声明过，
    // 只看目录会误判为已装从而跳过安装
    mockProject({ devDependencies: { '@commitlint/cli': '^21.0.0' } })
    expect(hasDependency('@commitlint/config-conventional')).toBe(false)
  })

  it('写进了 package.json 但 node_modules 下不存在时应该返回 false', () => {
    // resolve() 在 windows 上返回反斜杠路径，用 posix 化后的字符串比较，两个平台都能命中
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
// 失败路径 - 叶子函数只抛 ScriptError，不结束进程
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
    // 原始错误通过 cause 保留下来，排查时不会丢现场
    await expect(execCommand('git init')).rejects.toMatchObject({
      message: `Failed to execute 'git init'.`,
      cause: raw,
    })
  })

  it('writePackageJSON 写入失败时应该抛出 ScriptError', async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error('EACCES'))
    await expect(writePackageJSON({ name: 'demo' })).rejects.toThrow('Failed to write in package.json.')
  })

  it('这些失败都不应该调用 process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.mocked(execa).mockRejectedValue(new Error('boom'))
    await expect(execCommand('whatever')).rejects.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
