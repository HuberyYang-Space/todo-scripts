import { describe, expect, it } from 'vitest'
import { LINT_STAGED_CONFIG, LINT_STAGED_FILE, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'
import { KEY, ptyAvailability, runCliInPty } from './helpers/pty'

const pty = ptyAvailability()

if (!pty.ok)
  console.warn(`[e2e] 交互提示用例已跳过：${pty.reason}`)

// Short anchor on purpose: the prompt's own message is a 90-character bilingual
// string that may be reworded or wrapped, while the option labels are stable
const PROMPT_VISIBLE = (output: string): boolean => output.includes('Oxlint')

describe.skipIf(!pty.ok)('交互式 linter 选择（需要 pty）', () => {
  it('应该在真实 TTY 且未检测到 linter 时弹出选择提示', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')

    expect(session.output()).toContain('ESLint')
    expect(session.output()).toContain('Biome')
    expect(session.output()).toContain('Oxlint')

    session.write(KEY.ctrlC)
    await session.done()
  })

  it('应该在直接回车时选中默认的 ESLint', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    session.write(KEY.enter)

    expect(await session.done()).toBe(0)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })

  it('应该在下移一次后选中 Biome', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    // Once the prompt has rendered its keypress handler is live, and the pty
    // delivers these in order — the generated config below is what proves the
    // arrow key actually moved the selection
    session.write(KEY.down)
    session.write(KEY.enter)

    expect(await session.done()).toBe(0)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.biome)
  })

  it('应该在下移两次后选中 Oxlint', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    session.write(KEY.down)
    session.write(KEY.down)
    session.write(KEY.enter)

    expect(await session.done()).toBe(0)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.oxlint)
  })

  it('应该在下移三次选中跳过项时生成空规则', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    session.write(KEY.down)
    session.write(KEY.down)
    session.write(KEY.down)
    session.write(KEY.enter)

    expect(await session.done()).toBe(0)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
    // Choosing "skip" is not the same as cancelling, and must not report as one
    expect(session.output()).not.toContain(MESSAGES.promptCancelled)
  })

  it('应该在按下 Ctrl+C 时取消提示并回落到空规则', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    session.write(KEY.ctrlC)

    // Exit 0, not 130: in raw mode clack receives \x03 as data and maps it to
    // cancel, so no SIGINT is raised and the run finishes normally
    expect(await session.done()).toBe(0)
    expect(session.output()).toContain(MESSAGES.promptCancelled)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })

  it('应该在已探测到 linter 时即使处于 TTY 也不弹出提示', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })
    const session = runCliInPty(fixture, ['commitlint-init'])

    // No keys are ever sent; if a prompt appeared this would hang until timeout
    expect(await session.done()).toBe(0)
    expect(session.output()).not.toContain('Oxlint')
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })
})
