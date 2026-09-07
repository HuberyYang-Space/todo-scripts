import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli'
import { MESSAGE_FOR, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

describe('cLI 入口与错误路径', () => {
  it('应该在 --help 时打印帮助并以 0 退出', async () => {
    const fixture = await useFixture()
    const before = fixture.tree()

    const result = await runCli(fixture, ['--help'])

    expect(result.exitCode, result.all).toBe(0)
    expect(result.stdout).toContain('commitlint-init')
    // 顶层帮助只列指令和全局参数；各指令自己的参数放在 `hubery <script> --help` 下，
    // 否则指令一多这里就没法读了
    expect(result.stdout).toContain('--clear')
    expect(result.stdout).not.toContain('--czgit')
    // --help 必须是惰性的：不生成任何东西，也不改写任何东西
    expect(fixture.tree()).toEqual(before)
  })

  it('应该在 <script> --help 时打印该子命令自己的参数', async () => {
    const fixture = await useFixture()
    const before = fixture.tree()

    const result = await runCli(fixture, ['commitlint-init', '--help'])

    expect(result.exitCode, result.all).toBe(0)
    expect(result.stdout).toContain('--czgit')
    expect(result.stdout).toContain('--linter')
    expect(fixture.tree()).toEqual(before)
  })

  it('应该在参数拼错时报错退出，而不是按默认行为跑完', async () => {
    const fixture = await useFixture()
    const before = fixture.tree()

    const result = await runCli(fixture, ['commitlint-init', '--czgti'])

    expect(result.exitCode).not.toBe(0)
    // 整句断言：拼错的 flag 名会原样出现在别处（比如回显命令行），
    // 只找 'czgti' 三个字并不能证明走的是「未知参数」这条分支
    expect(result.stdout).toContain(MESSAGE_FOR.unknownOption('czgti'))
    expect(fixture.tree()).toEqual(before)
  })

  it('应该在缺少子命令时报错并以 1 退出', async () => {
    const fixture = await useFixture()

    const result = await runCli(fixture, [])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(MESSAGES.noScript)
    // ScriptError 是预期内失败的通道：只给一行，绝不打堆栈
    expect(result.all).not.toMatch(/^\s+at /m)
  })

  it('应该在子命令不存在时以 1 退出', async () => {
    const fixture = await useFixture()

    const result = await runCli(fixture, ['not-a-script'])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(MESSAGES.noScript)
  })

  it('应该在 --linter 写在子命令之前时把子命令吞掉并报错', async () => {
    const fixture = await useFixture()

    // 钉住 mri 的解析行为：字符串参数放在子命令前面，会把子命令当成它的值吃掉，
    // 于是 argv._ 是空的
    const result = await runCli(fixture, ['--linter', 'commitlint-init'])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(MESSAGES.noScript)
  })

  // 这一层不覆盖「找不到 package.json」这条错误路径。事实证明它在这一层根本走不到 ——
  // 没有 manifest 时 hasDependency() 对所有包都为 false，于是 ensureInstalled 会跑一次
  // 真实的 `npm install`，而 npm 会在那段本该抛错的代码被执行到之前就先建好 package.json。
  // 硬要构造这个用例，代价是每次运行都联网安装一遍。getPackageJSON() 直接抛错这件事
  // 由 tests/utils.test.ts 覆盖。
})
