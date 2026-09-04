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

/**
 * Messages the CLI prints; asserted on to prove which branch ran
 *
 * Every entry is long enough to identify exactly one branch. A short fragment
 * matches several unrelated lines and turns an assertion into a rubber stamp:
 * `already exists` alone appears both when a config file is kept and when a hook
 * is appended to, so a test asserting it proves neither.
 */
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
  commitlintConfigDone: 'commitlint config succeed',
  rollbackDone: 'Setup failed — the files this script had written were rolled back.',
  /** Printed by bin/index.js when a ScriptError carries a cause */
  causedBy: 'Caused by:',
} as const

/**
 * Builders for the messages that embed a filename or value
 *
 * Written as functions so the varying part has to be supplied at the call site —
 * asserting only the fixed prefix is what let two different test cases share one
 * assertion string and stop distinguishing the branches they exist to separate.
 */
export const MESSAGE_FOR = {
  /** A config file of ours was not written because the project already has one */
  keptCommitlint: (existing: string) => `Kept your commitlint config — ${existing} already exists.`,
  keptLintStaged: (existing: string) => `Kept your lint-staged config — ${existing} already exists.`,
  /** Our command was added to a hook the user already had */
  hookAppended: (hook: string) => `${hook} already exists — appended our command to your version.`,
  /** The hook already contains our command — the idempotency signal on a re-run */
  hookUnchanged: (hook: string) => `${hook} already runs our command, left as is.`,
  unknownLinter: (value: string) => `Unknown --linter value "${value}"; falling back to auto-detect.`,
  unknownOption: (flag: string) => `Unknown option: --${flag}.`,
} as const

/** How `planConfigWrite` names a config that lives in a package.json field */
export const PKG_FIELD = {
  lintStaged: 'the package.json "lint-staged" field',
  commitlint: 'the package.json "commitlint" field',
} as const
