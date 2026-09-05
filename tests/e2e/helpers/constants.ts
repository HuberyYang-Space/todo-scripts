/**
 * 期望产物，刻意逐条写成字面量。
 *
 * 它们刻意「不」从 `src/` 导入 —— 一套 E2E 如果从实现里派生自己的期望，就会跟着
 * 实现一起漂移，不再是验收测试。这里需要改动，本身就是一个信号：该去确认那个
 * 行为变更是不是有意为之。
 */

export type FakeLinter = 'eslint' | 'biome' | 'oxlint'

/** 让每个 linter 被算作「已安装」的 npm 包名 */
export const LINTER_PACKAGES: Record<FakeLinter, string> = {
  eslint: 'eslint',
  biome: '@biomejs/biome',
  oxlint: 'oxlint',
}

/** `commitlint-init` 必装的包；预置好它们能让安装步骤变成空操作 */
export const BASE_PACKAGES = [
  '@commitlint/cli',
  '@commitlint/config-conventional',
  'husky',
  'lint-staged',
]

/** 传了 --czgit 时 `planSetup` 会追加这些；缺了它们会触发一次真实安装 */
export const CZGIT_PACKAGES = ['commitizen', 'cz-git']

export const LINT_STAGED_FILE = 'lint-staged.config.mjs'

/** 按解析出的 linter，逐一列出生成的 lint-staged 配置的完整期望内容 */
export const LINT_STAGED_CONFIG: Record<FakeLinter | 'none', string> = {
  eslint: `export default {\n  '*': 'eslint --fix --no-error-on-unmatched-pattern',\n}\n`,
  biome: `export default {\n  '*': 'biome check --write --no-errors-on-unmatched',\n}\n`,
  oxlint: `export default {\n  '*': 'oxlint --fix --no-error-on-unmatched-pattern',\n}\n`,
  none: `export default {\n`
    + `  // 未探测到 linter，也没有选择 —— 请替换成你自己的规则，例如：\n`
    + `  // '*': 'eslint --fix --no-error-on-unmatched-pattern',\n`
    + `  '*': [],\n`
    + `}\n`,
}

/**
 * CLI 打印的消息；用来断言究竟走了哪条分支
 *
 * 每一条都足够长，长到只能指认唯一一条分支。短片段会同时匹配上好几行不相干的
 * 输出，把断言变成橡皮图章：光一个「已存在」，在「沿用已有配置」和「往钩子里追加」
 * 两种情况下都会出现，断言它等于两边都没证明。
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
  /** ScriptError 带着 cause 时，由 bin/index.js 打印 */
  causedBy: '底层原因：',
} as const

/**
 * 那些嵌了文件名或取值的消息，写成构造函数
 *
 * 写成函数是为了逼调用点把变化的那部分交出来 —— 只断言固定前缀，正是当初让两个
 * 不同用例共用同一个断言串、从而不再能区分它们各自要分辨的分支的原因。
 */
export const MESSAGE_FOR = {
  /** 我们的某个配置文件没有被写入，因为项目里已经有一份了 */
  keptCommitlint: (existing: string) => `已保留你的 commitlint 配置 —— ${existing} 已存在。`,
  keptLintStaged: (existing: string) => `已保留你的 lint-staged 配置 —— ${existing} 已存在。`,
  /** 我们的命令被追加到了用户原本就有的钩子里 */
  hookAppended: (hook: string) => `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。`,
  /** 钩子里已经含有我们的命令 —— 重复运行时的幂等信号 */
  hookUnchanged: (hook: string) => `${hook} 已经在跑我们的命令，保持原样。`,
  unknownLinter: (value: string) => `无法识别的 --linter 取值 "${value}"，改用自动探测。`,
  unknownOption: (flag: string) => `未知参数：--${flag}。`,
} as const

/** `planConfigWrite` 如何称呼一份存在 package.json 字段里的配置 */
export const PKG_FIELD = {
  lintStaged: 'package.json 的 "lint-staged" 字段',
  commitlint: 'package.json 的 "commitlint" 字段',
} as const
