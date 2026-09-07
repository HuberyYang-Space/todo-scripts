import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
import { LINT_STAGED_CONFIG, LINT_STAGED_FILE, MESSAGE_FOR, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

describe('--linter 显式指定', () => {
  // 每个用例预置的 linter 都和参数点名的那个「不一样」，所以只有当参数真的
  // 短路了探测流程时，用例才可能通过
  it('应该在 --linter=eslint 时无视探测结果直接用 eslint', async () => {
    const fixture = await useFixture({ linters: ['biome'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=eslint'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })

  it('应该在 --linter=biome 时无视探测结果直接用 biome', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=biome'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.biome)
  })

  it('应该在 --linter=oxlint 时无视探测结果直接用 oxlint', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=oxlint'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.oxlint)
  })

  it('应该在 --linter=none 时生成 lint-staged 合法的空规则并跳过收尾修复', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=none'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
    // spinner 的输出走 stderr；它没出现，就证明收尾的修复步骤被跳过了
    expect(result.stderr).not.toContain(MESSAGES.lintRunning)
  })

  it('应该忽略 --linter 取值的大小写', async () => {
    const fixture = await useFixture({ linters: ['biome'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=ESLint'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })

  it('应该在 --linter 取值无法识别时告警并回落到自动探测', async () => {
    const fixture = await useFixture({ linters: ['biome'] })

    const result = await runCli(fixture, ['commitlint-init', '--linter=prettier'])
    assertOk(result, fixture)

    // 整句断言：单独一个 'prettier' 在 stdout 里任何位置出现都算数
    expect(result.stdout).toContain(MESSAGE_FOR.unknownLinter('prettier'))
    // 回退到「探测」，而不是直接变成 none
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.biome)
  })

  it('应该在 --linter 取值无法识别且探测不到任何 linter 时最终落到空规则', async () => {
    const fixture = await useFixture()

    const result = await runCli(fixture, ['commitlint-init', '--linter=prettier'])
    assertOk(result, fixture)

    expect(result.stdout).toContain(MESSAGES.unknownLinterPrefix)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })

  it('应该在裸写 --linter 不带值时不崩溃、不告警并直接走自动探测', async () => {
    const fixture = await useFixture({ linters: ['oxlint'] })

    // 钉住提交 874d6fa 的回归：裸 --linter 从前会让一个非字符串走到 .toLowerCase()，
    // 直接抛 TypeError 崩掉。mri 现在把它交出来是 ''，是个假值，所以必须静默地落到下一步。
    const result = await runCli(fixture, ['commitlint-init', '--linter'])
    assertOk(result, fixture)

    expect(result.stdout).not.toContain(MESSAGES.unknownLinterPrefix)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.oxlint)
  })

  it('应该在 linter 被判定为已安装时进入收尾修复分支且失败不影响产物', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    // 这里明确写下快速层做的取舍：linter 是个没有可执行文件的桩，所以修复步骤是真的会失败。
    // 断言 spinner 跑过，证明确实进了那条分支；断言产物逐字节一致，证明 allowFailure
    // 把失败吞掉了，且过程中没有任何东西改动过文件。
    expect(result.stderr).toContain(MESSAGES.lintRunning)
    expect(result.stderr).toContain(MESSAGES.lintDone)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
    expect(() => fixture.readJson('package.json')).not.toThrow()
  })
})
