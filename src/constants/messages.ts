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
} as const
