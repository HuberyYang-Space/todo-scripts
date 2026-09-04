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

// For failure-path tests: execa and file writes must be able to fail on demand, and the spinner must not spin in test output
vi.mock('execa', async importOriginal => ({
  ...await importOriginal<typeof import('execa')>(),
  execa: vi.fn(async () => {}),
}))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(async () => {}) }))
vi.mock('yocto-spinner', () => ({
  default: () => ({ start: vi.fn(function (this: any) { return this }), success: vi.fn(), stop: vi.fn() }),
}))

// ========================================
// isRootFileExist - checks whether a file exists in the project root
// ========================================
describe('isRootFileExist', () => {
  it('文件存在时应该返回 true', () => {
    // package.json is guaranteed to exist in the current project root
    expect(isRootFileExist('package.json')).toBe(true)
  })

  it('文件不存在时应该返回 false', () => {
    // A filename that couldn't possibly exist
    expect(isRootFileExist('this-file-does-not-exist-12345.json')).toBe(false)
  })
})

// ========================================
// isTsProject - detects whether the project is a TypeScript project
// ========================================
describe('isTsProject', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('存在 tsconfig.json 时应该返回 true', () => {
    // Simulate a directory that contains tsconfig.json
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
    // "mytsconfig.json" doesn't start with tsconfig, so it shouldn't match
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['mytsconfig.json', 'tsconfig-invalid'] as any)
    expect(isTsProject()).toBe(false)
  })
})

// ========================================
// isMonorepo - detects whether the project is a monorepo
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
    // Reproduces this repo's own scenario: pnpm-workspace.yaml only holds settings, no packages field
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (String(p).includes('pnpm-workspace.yaml'))
        return 'shellEmulator: true\n'
      return JSON.stringify({ name: 'my-project' })
    })
    expect(isMonorepo()).toBe(false)
  })

  it('package.json 中有 workspaces 字段时应该返回 true', () => {
    // Simulate pnpm-workspace.yaml not existing
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // pnpm-workspace.yaml is absent, but package.json exists
      return !String(p).includes('pnpm-workspace.yaml')
    })
    // Simulate package.json containing a workspaces field
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
// getPackageJSON - reads and parses package.json
// ========================================
describe('getPackageJSON', () => {
  it('应该返回一个包含 name 字段的对象', () => {
    // The current project root has a package.json, so this reads the real file directly
    const pkg = getPackageJSON()
    expect(pkg).toBeDefined()
    expect(pkg!.name).toBe('@huberyyang/todo-scripts')
  })

  it('返回的对象应该包含 version 字段', () => {
    const pkg = getPackageJSON()
    // version should be a semver-formatted string
    expect(pkg!.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('当 package.json 不存在时应该抛出 ScriptError', () => {
    // Simulate the file-missing case: no longer returns undefined, so callers need no null check
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
// printWarn / printErr - terminal message output
// ========================================
describe('printWarn', () => {
  it('应该调用 console.log 输出警告信息', () => {
    // Use vi.spyOn to observe console.log calls
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printWarn('test warning')
    // printWarn calls console.log 3 times: blank line, content, blank line
    expect(spy).toHaveBeenCalledTimes(3)
    // The second call should contain the warning text
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
// resolveBannerMode - the header banner picks a render mode based on terminal capability
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
    // banner() passes in 0 when process.stdout.columns is undefined
    expect(resolveBannerMode(0, true)).toBe('plain')
  })
})

// ========================================
// isInteractive - whether stdin is a real interactive terminal
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
// hasDependency - whether the project already has a given dependency
// ========================================
describe('hasDependency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Both node_modules and package.json exist; the package.json content is driven by the argument */
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
    // Reproduces a hoisted transitive dependency: the directory exists, but the
    // dependency was never declared — checking the directory alone would
    // misjudge it as installed and skip the install
    mockProject({ devDependencies: { '@commitlint/cli': '^21.0.0' } })
    expect(hasDependency('@commitlint/config-conventional')).toBe(false)
  })

  it('写进了 package.json 但 node_modules 下不存在时应该返回 false', () => {
    // resolve() returns backslash paths on windows; compare against the posix-normalized string so both platforms match
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
// Failure paths - leaf functions only throw ScriptError, never terminate the process
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
    // The original error is preserved via cause, so debugging doesn't lose the evidence
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
