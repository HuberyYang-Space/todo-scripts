/**
 * 全部面向用户的终端文案
 *
 * 这个模块刻意零 import，也刻意不并进 constants/index.ts —— 后者已经 100 多行，
 * 而且 HB-20（模板外置）正打算给它减负。
 *
 * 集中在一处是为了「成熟后整体转回英文」这个已知需求：到时只改这一个文件，
 * 而不是再来一次全仓扫荡。
 *
 * 带参数的文案一律写成函数放进 MSG_FOR，而不是让调用点自己拼模板串 ——
 * 这样调用点必须显式把那个变量交出来，文案和它的参数不会走散。
 *
 * 不含 WARN / INFO / ERROR 这三个色块标签：它们是日志级别标记而不是句子，
 * 保持英文与 npm、pnpm、ESLint 一致，也让 printInfo 不该被渲染成 WARN 的
 * 那条对比度断言继续成立。
 */

/** 固定文案 */
export const MSG = {
  cannotFindPackageJson: '当前目录下找不到 package.json。',
  parsePackageJsonFailed: '解析 package.json 失败。',
  writePackageJsonFailed: '写入 package.json 失败。',

  // —— CLI 主流程 ——
  noScript: '请指定一个要执行的脚本。',
  processStart: '流程开始',
  clearDone: '清理完成！',

  // —— commitlint-init ——
  promptCancelled: '已取消选择 —— 跳过 lint-staged 规则。',
  noLinterNonInteractive:
    '未探测到 linter，当前也不是交互式终端无法询问 —— 已跳过 lint-staged 规则，请自行编辑 lint-staged.config.mjs。',
  rollbackDone: '配置失败 —— 本次写入的文件已全部回滚。',
  pkgFieldCommitlint: 'package.json 的 "commitlint" 字段',
  pkgFieldLintStaged: 'package.json 的 "lint-staged" 字段',
  pkgFieldHusky: 'package.json 的 "husky" 字段',

  // —— spinner 各阶段 ——
  spinnerGitInitStart: '检查 git 仓库...',
  spinnerGitInitDone: 'git 仓库就绪！',
  spinnerInstallStart: '安装依赖...',
  spinnerInstallDone: '依赖安装完成！',
  spinnerCommitlintStart: '生成 commitlint 配置...',
  spinnerCommitlintDone: 'commitlint 配置完成！',
  spinnerLintStagedStart: '生成 lint-staged 配置...',
  spinnerLintStagedDone: 'lint-staged 配置完成！',
  spinnerHuskyStart: '配置 husky 钩子...',
  spinnerHuskyDone: 'husky 钩子配置完成！',
  spinnerPkgJsonStart: '写入 package.json...',
  spinnerPkgJsonDone: 'package.json 写入完成！',
  spinnerLintStart: '格式化生成的文件...',
  spinnerLintDone: '格式化完成！',

  // —— 交互提示 ——
  promptLinterMessage: '未检测到已知的 linter，用于 lint-staged 的检查工具是？',
  promptLinterNone: '跳过 —— 我自己配置',
  promptCancelledLabel: '已取消。',
} as const

/** 需要嵌入文件名 / 取值的文案 */
export const MSG_FOR = {
  execFailed: (command: string) => `执行 '${command}' 失败。`,
  uninstallFailed: (pkg: string) => `卸载 ${pkg} 失败。`,

  /** 未知参数。中文没有单复数变化，原实现区分 option/options 的三元一并去掉 */
  unknownOption: (list: string, script: string) =>
    `未知参数：${list}。运行 \`hubery ${script} --help\` 查看支持的参数。`,
  processDone: (seconds: string) => `流程结束，耗时 ${seconds}s`,
  causedBy: (detail: string) => `底层原因：${detail}`,

  unknownLinter: (value: string) => `无法识别的 --linter 取值 "${value}"，改用自动探测。`,
  configExists: (file: string) => `${file} 已存在`,
  keptCommitlint: (reason: string) => `已保留你的 commitlint 配置 —— ${reason}。`,
  keptLintStaged: (reason: string) => `已保留你的 lint-staged 配置 —— ${reason}。`,
  hookAppended: (hook: string) => `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。`,
  hookUnchanged: (hook: string) => `${hook} 已经在跑我们的命令，保持原样。`,
  huskyV4Found: (source: string, detail: string) =>
    `在 ${source} 发现 husky v4 配置，husky 9 不会读取它 —— 这些钩子实际没有在跑。${detail} 请把它们迁移到 .husky/ 目录后删除旧配置。`,
  huskyV4Detail: (pairs: string) => ` 其中定义了：${pairs}。`,
} as const
