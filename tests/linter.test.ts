import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasDependencyMock = vi.fn((_pkg: string) => false)

vi.mock('@/utils', () => ({
  hasDependency: hasDependencyMock,
}))

const {
  detectLinter,
  getFixCommand,
  getLintStagedCommand,
  isLinterInstalled,
  isLinterKind,
  renderLintStagedConfig,
} = await import('@/utils/linter')

describe('isLinterKind', () => {
  it('应该认出 eslint/biome/oxlint 这三个合法值', () => {
    expect(isLinterKind('eslint')).toBe(true)
    expect(isLinterKind('biome')).toBe(true)
    expect(isLinterKind('oxlint')).toBe(true)
  })

  it('未知值应该返回 false', () => {
    expect(isLinterKind('prettier')).toBe(false)
  })
})

describe('isLinterInstalled', () => {
  beforeEach(() => {
    hasDependencyMock.mockReset()
  })

  it('eslint 检查的是 eslint 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint')
    expect(isLinterInstalled('eslint')).toBe(true)
    expect(isLinterInstalled('biome')).toBe(false)
  })

  it('biome 检查的是 @biomejs/biome 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === '@biomejs/biome')
    expect(isLinterInstalled('biome')).toBe(true)
    expect(isLinterInstalled('eslint')).toBe(false)
  })

  it('oxlint 检查的是 oxlint 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'oxlint')
    expect(isLinterInstalled('oxlint')).toBe(true)
  })
})

describe('detectLinter', () => {
  beforeEach(() => {
    hasDependencyMock.mockReset()
  })

  it('什么都没装时应该返回 undefined', () => {
    hasDependencyMock.mockReturnValue(false)
    expect(detectLinter()).toBeUndefined()
  })

  it('只装了 eslint 时应该返回 eslint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint')
    expect(detectLinter()).toBe('eslint')
  })

  it('只装了 biome 时应该返回 biome', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === '@biomejs/biome')
    expect(detectLinter()).toBe('biome')
  })

  it('只装了 oxlint 时应该返回 oxlint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'oxlint')
    expect(detectLinter()).toBe('oxlint')
  })

  it('eslint 和 biome 同时装了时应该优先 eslint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint' || pkg === '@biomejs/biome')
    expect(detectLinter()).toBe('eslint')
  })
})

describe('getLintStagedCommand', () => {
  it('应该按 linter 拼出对应命令', () => {
    expect(getLintStagedCommand('eslint')).toBe('eslint --fix --no-error-on-unmatched-pattern')
    expect(getLintStagedCommand('biome')).toBe('biome check --write --no-errors-on-unmatched')
    expect(getLintStagedCommand('oxlint')).toBe('oxlint --fix --no-error-on-unmatched-pattern')
  })
})

describe('getFixCommand', () => {
  it('应该把目标文件拼进命令里', () => {
    expect(getFixCommand('eslint', ['package.json', 'commitlint.config.ts'])).toBe(
      'eslint package.json commitlint.config.ts --fix',
    )
  })

  it('biome 的 bin 名带子命令，也应该正确拼接', () => {
    expect(getFixCommand('biome', ['package.json'])).toBe('biome check package.json --write')
  })
})

describe('renderLintStagedConfig', () => {
  it.each([
    ['eslint', `'*': 'eslint --fix --no-error-on-unmatched-pattern'`],
    ['biome', `'*': 'biome check --write --no-errors-on-unmatched'`],
    ['oxlint', `'*': 'oxlint --fix --no-error-on-unmatched-pattern'`],
  ] as const)('探测到 %s 时应该生成对应的 * 规则', (kind, expected) => {
    expect(renderLintStagedConfig(kind)).toContain(expected)
  })

  it('none 时应该只生成占位注释，不生成生效规则', () => {
    const content = renderLintStagedConfig('none')
    expect(content).toContain('export default')
    expect(content).not.toMatch(/^\s*'\*':/m)
  })
})
