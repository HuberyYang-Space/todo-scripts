/**
 * Expected artifacts, written out as literals on purpose.
 *
 * These deliberately do NOT import from `src/` — an E2E suite that derives its
 * expectations from the implementation drifts along with it and stops being an
 * acceptance test. If a change here is needed, that is the signal to look at
 * whether the behaviour change was intended.
 */

export type FakeLinter = 'eslint' | 'biome' | 'oxlint'

/** npm package name that makes each linter count as "installed" */
export const LINTER_PACKAGES: Record<FakeLinter, string> = {
  eslint: 'eslint',
  biome: '@biomejs/biome',
  oxlint: 'oxlint',
}

/** Always installed by `commitlint-init`; seeding these makes the install step a no-op */
export const BASE_PACKAGES = [
  '@commitlint/cli',
  '@commitlint/config-conventional',
  'husky',
  'lint-staged',
]

/** `planSetup` appends these when --czgit is passed; missing them triggers a real install */
export const CZGIT_PACKAGES = ['commitizen', 'cz-git']

export const LINT_STAGED_FILE = 'lint-staged.config.mjs'

/** Full expected content of the generated lint-staged config, per resolved linter */
export const LINT_STAGED_CONFIG: Record<FakeLinter | 'none', string> = {
  eslint: `export default {\n  '*': 'eslint --fix --no-error-on-unmatched-pattern',\n}\n`,
  biome: `export default {\n  '*': 'biome check --write --no-errors-on-unmatched',\n}\n`,
  oxlint: `export default {\n  '*': 'oxlint --fix --no-error-on-unmatched-pattern',\n}\n`,
  none: `export default {\n`
    + `  // No linter detected, and none selected — replace with your own rule, e.g.:\n`
    + `  // '*': 'eslint --fix --no-error-on-unmatched-pattern',\n`
    + `  '*': [],\n`
    + `}\n`,
}

/** Messages the CLI prints; asserted on to prove which branch ran */
export const MESSAGES = {
  noLinterNonInteractive: 'No linter detected, and no interactive terminal to ask',
  promptCancelled: 'Prompt cancelled — skipping the lint-staged rule.',
  unknownLinterPrefix: 'Unknown --linter value',
  noScript: 'Please use a script.',
  missingPackageJson: 'Cannot find package.json',
  lintRunning: 'lint running',
  lintDone: 'lint down!',
  gitInitChecking: 'git init checking...',
  gitInitDone: 'git init down!',
  processDone: 'Process Down',
} as const
