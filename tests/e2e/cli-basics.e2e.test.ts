import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli'
import { MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

describe('cLI 入口与错误路径', () => {
  it('应该在 --help 时打印帮助并以 0 退出', async () => {
    const fixture = await useFixture()
    const before = fixture.tree()

    const result = await runCli(fixture, ['--help'])

    expect(result.exitCode, result.all).toBe(0)
    expect(result.stdout).toContain('commitlint-init')
    expect(result.stdout).toContain('--linter')
    // --help must be inert: nothing scaffolded, nothing rewritten
    expect(fixture.tree()).toEqual(before)
  })

  it('应该在缺少子命令时报错并以 1 退出', async () => {
    const fixture = await useFixture()

    const result = await runCli(fixture, [])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(MESSAGES.noScript)
    // ScriptError is the expected-failure channel: one line, never a stack trace
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

    // Regression pin on mri's parsing: a string flag placed before the subcommand
    // consumes it as its value, leaving argv._ empty
    const result = await runCli(fixture, ['--linter', 'commitlint-init'])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(MESSAGES.noScript)
  })

  // Not covered here: the "Cannot find package.json" error path. It turns out to be
  // unreachable in this tier — without a manifest, hasDependency() is false for every
  // package, so ensureInstalled runs a real `npm install`, and npm creates a
  // package.json before the code that would have thrown is ever reached. Forcing the
  // case would mean a networked install per run. tests/utils.test.ts covers
  // getPackageJSON() throwing directly.
})
