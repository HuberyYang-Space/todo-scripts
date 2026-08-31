import { describe, expect, it } from 'vitest'
import { assertOk, runCli } from './helpers/cli'
import { LINT_STAGED_CONFIG, LINT_STAGED_FILE, MESSAGES } from './helpers/constants'
import { useFixture } from './helpers/fixture'

describe('linter 自动探测', () => {
  it('应该在只装了 eslint 时生成 eslint 的 lint-staged 规则', async () => {
    const fixture = await useFixture({ linters: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })

  it('应该在只装了 biome 时生成 biome 的 lint-staged 规则', async () => {
    const fixture = await useFixture({ linters: ['biome'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.biome)
  })

  it('应该在只装了 oxlint 时生成 oxlint 的 lint-staged 规则', async () => {
    const fixture = await useFixture({ linters: ['oxlint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.oxlint)
  })

  it('应该在三个 linter 都装了时按优先级选 eslint', async () => {
    const fixture = await useFixture({ linters: ['eslint', 'biome', 'oxlint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.eslint)
  })

  it('应该在同时装了 biome 和 oxlint 时选 biome', async () => {
    const fixture = await useFixture({ linters: ['biome', 'oxlint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.biome)
  })

  // The two half-satisfied cases below are this suite's biggest gain over the unit
  // tests: those mock hasDependency() wholesale, so the real two-condition semantics
  // (declared AND present on disk) can only be verified against a real filesystem.
  it('应该在只有 package.json 声明而 node_modules 里没有时判定为未安装', async () => {
    const fixture = await useFixture({ declareOnly: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(result.stdout).toContain(MESSAGES.noLinterNonInteractive)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })

  it('应该在只有 node_modules 目录而 package.json 未声明时判定为未安装', async () => {
    const fixture = await useFixture({ installOnly: ['eslint'] })

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(result.stdout).toContain(MESSAGES.noLinterNonInteractive)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })

  it('应该在未检测到 linter 且非交互时给出警告、生成可用的空规则且不挂起', async () => {
    const fixture = await useFixture()

    const result = await runCli(fixture, ['commitlint-init'])
    assertOk(result, fixture)

    expect(result.timedOut).toBe(false)
    expect(result.stdout).toContain(MESSAGES.noLinterNonInteractive)
    expect(fixture.read(LINT_STAGED_FILE)).toBe(LINT_STAGED_CONFIG.none)
  })
})
