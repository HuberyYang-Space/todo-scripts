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
  noLinterNonInteractive: '未探测到 linter，当前也不是交互式终端无法询问',
  promptCancelled: '已取消选择 —— 跳过 lint-staged 规则。',
  unknownLinterPrefix: '无法识别的 --linter 取值',
  noScript: '请指定一个要执行的脚本。',
  missingPackageJson: 'Cannot find package.json',
  lintRunning: '格式化生成的文件...',
  lintDone: '格式化完成！',
  gitInitChecking: '检查 git 仓库...',
  gitInitDone: 'git 仓库就绪！',
  processDone: '流程结束',
  commitlintConfigDone: 'commitlint 配置完成！',
  rollbackDone: '配置失败 —— 本次写入的文件已全部回滚。',
  /** Printed by bin/index.js when a ScriptError carries a cause */
  causedBy: '底层原因：',
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
  keptCommitlint: (existing: string) => `已保留你的 commitlint 配置 —— ${existing} 已存在。`,
  keptLintStaged: (existing: string) => `已保留你的 lint-staged 配置 —— ${existing} 已存在。`,
  /** Our command was added to a hook the user already had */
  hookAppended: (hook: string) => `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。`,
  /** The hook already contains our command — the idempotency signal on a re-run */
  hookUnchanged: (hook: string) => `${hook} 已经在跑我们的命令，保持原样。`,
  unknownLinter: (value: string) => `无法识别的 --linter 取值 "${value}"，改用自动探测。`,
  unknownOption: (flag: string) => `未知参数：--${flag}。`,
} as const

/** How `planConfigWrite` names a config that lives in a package.json field */
export const PKG_FIELD = {
  lintStaged: 'package.json 的 "lint-staged" 字段',
  commitlint: 'package.json 的 "commitlint" 字段',
} as const
