import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
import { LINT_STAGED_CONFIG, LINT_STAGED_FILE, MESSAGE_FOR, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

describe('--linter 显式指定', () => {
  // Each of these seeds a DIFFERENT linter than the flag names, so passing only
  // happens if the flag genuinely short-circuits detection
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
    // Spinner output goes to stderr; its absence proves the fix step was skipped
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
    // Falls back to DETECTION, not straight to none
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

    // Regression pin for commit 874d6fa: a bare --linter used to reach
    // .toLowerCase() on a non-string and crash with a TypeError. mri hands it
    // through as '', which is falsy, so it must fall through silently.
    const result = await runCli(fixture, ['commitlint-init', '--linter'])
    assertOk(result, fixture)

    expect(result.stdout).not.toContain(MESSAGES.unknownLinterPrefix)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.oxlint)
  })

  it('应该在 linter 被判定为已安装时进入收尾修复分支且失败不影响产物', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    // This is the explicit contract for the fast tier's tradeoff: the linter is a
    // stub with no binary, so the fix step really fails. Asserting the spinner ran
    // proves the branch was entered, and asserting the artifact is byte-identical
    // proves allowFailure swallowed the failure without anything mutating files.
    expect(result.stderr).toContain(MESSAGES.lintRunning)
    expect(result.stderr).toContain(MESSAGES.lintDone)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
    expect(() => fixture.readJson('package.json')).not.toThrow()
  })
})
