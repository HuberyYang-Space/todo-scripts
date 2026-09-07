import { describe, expect, it } from 'vitest'
import { LINT_STAGED_CONFIG, LINT_STAGED_FILE, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'
import { KEY, ptyAvailability, runCliInPty } from './helpers/pty'

const pty = ptyAvailability()

if (!pty.ok)
  console.warn(`[e2e] 交互提示用例已跳过：${pty.reason}`)

// 刻意用一个短锚点：提示语本身可能被改写或折行，而选项标签是稳定的
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
    // 提示一旦渲染出来，它的按键处理就已经就绪，pty 会按顺序把这些键送进去 ——
    // 下面生成的配置才是「方向键确实移动了选中项」的证据
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
    // 选择「跳过」和取消不是一回事，不能被当成取消来报告
    expect(session.output()).not.toContain(MESSAGES.promptCancelled)
  })

  it('应该在按下 Ctrl+C 时取消提示并回落到空规则', async () => {
    const fixture = await useFixture()
    const session = runCliInPty(fixture, ['commitlint-init'])

    await session.waitFor(PROMPT_VISIBLE, '选择提示出现')
    session.write(KEY.ctrlC)

    // 退出码是 0 而不是 130：raw 模式下 clack 是把 \x03 当数据收到并映射成取消的，
    // 并没有真的产生 SIGINT，所以这次运行是正常结束的
    expect(await session.done()).toBe(0)
    expect(session.output()).toContain(MESSAGES.promptCancelled)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })

  it('应该在已探测到 linter 时即使处于 TTY 也不弹出提示', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })
    const session = runCliInPty(fixture, ['commitlint-init'])

    // 全程不发任何按键；一旦真的弹出了提示，这里就会一直挂到超时
    expect(await session.done()).toBe(0)
    expect(session.output()).not.toContain('Oxlint')
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })
})
