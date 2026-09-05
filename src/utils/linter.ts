import { hasDependency } from '@/utils'

export type LinterKind = 'eslint' | 'biome' | 'oxlint'

interface LinterSpec {
  /** npm package name(s) that indicate this linter is installed */
  packages: string[]
  bin: string
  fixFlag: string
  /**
   * stops the linter erroring when lint-staged hands it a file it doesn't own
   * (e.g. a .vue file under a plain eslint project)
   */
  noErrorOnUnmatchedFlag: string
}

const PRIORITY: LinterKind[] = ['eslint', 'biome', 'oxlint']

const LINTER_SPECS: Record<LinterKind, LinterSpec> = {
  eslint: {
    packages: ['eslint'],
    bin: 'eslint',
    fixFlag: '--fix',
    noErrorOnUnmatchedFlag: '--no-error-on-unmatched-pattern',
  },
  biome: {
    packages: ['@biomejs/biome'],
    bin: 'biome check',
    fixFlag: '--write',
    noErrorOnUnmatchedFlag: '--no-errors-on-unmatched',
  },
  oxlint: {
    packages: ['oxlint'],
    bin: 'oxlint',
    fixFlag: '--fix',
    noErrorOnUnmatchedFlag: '--no-error-on-unmatched-pattern',
  },
}

export function isLinterKind(value: string): value is LinterKind {
  return Object.hasOwn(LINTER_SPECS, value)
}

export function isLinterInstalled(kind: LinterKind): boolean {
  return LINTER_SPECS[kind].packages.some(pkg => hasDependency(pkg))
}

export function detectLinter(): LinterKind | undefined {
  return PRIORITY.find(isLinterInstalled)
}

export function getLintStagedCommand(kind: LinterKind): string {
  const spec = LINTER_SPECS[kind]
  return `${spec.bin} ${spec.fixFlag} ${spec.noErrorOnUnmatchedFlag}`
}

export function getFixCommand(kind: LinterKind, targets: string[]): string {
  const spec = LINTER_SPECS[kind]
  return `${spec.bin} ${targets.join(' ')} ${spec.fixFlag}`
}

export function renderLintStagedConfig(choice: LinterKind | 'none'): string {
  if (choice === 'none') {
    return `export default {
  // 未探测到 linter，也没有选择 —— 请替换成你自己的规则，例如：
  // '*': 'eslint --fix --no-error-on-unmatched-pattern',
  '*': [],
}
`
  }

  return `export default {
  '*': '${getLintStagedCommand(choice)}',
}
`
}
