# HB-33 全面中文化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@huberyyang/todo-scripts` 的终端输出、源码/测试注释、写进用户仓库的模板全部转为中文，文案集中进 `src/constants/messages.ts`，为中文社区推广做好准备。

**Architecture:** 新建零依赖的 `src/constants/messages.ts` 作为唯一文案源，`MSG`（固定文案）与 `MSG_FOR`（带参数的函数）两块。所有调用点从该模块 import。`bin/index.js` 是纯 JS、无法走 `@/` 别名，必须通过 `dist/main.js` 的 re-export 取文案。源码逻辑零变更——本轮只改语言。

**Tech Stack:** TypeScript / tsdown / vitest（单测 + E2E 双配置）/ @antfu/eslint-config

**Spec:** `docs/superpowers/specs/2026-09-04-chinese-localization-design.md`

## Global Constraints

以下约束适用于**每一个** Task，不再逐条重复：

1. **代码注释一律中文**（本计划推翻了项目 CLAUDE.md 原有的英文注释约定，Task 10 会同步更新该文件）。
2. **commit message 一律英文**，遵循 Conventional Commits。这是本轮明确的非目标，不要顺手改成中文。
3. **` WARN ` / ` INFO ` / ` ERROR ` 色块标签保持英文**，不要动 `src/utils/index.ts` 里这三个字符串。
4. **`tests/e2e/helpers/constants.ts` 绝不 import `src/`**。改的是字面量的**值**，不是数据来源。这条是 HB-31 审计立下的红线——一旦改成 import，文案写错时 E2E 照样全绿。
5. **注释翻译必须保真**。`src/` 里大量注释是「为什么这么写」的踩坑记录（husky 9 会无条件覆盖 pre-commit、mri 会静默吞未知 flag、`hasDependency` 为何双重检查……）。逐条翻译，不删减、不概括。翻译后信息量少于原文的视为改坏。
6. **提交用 `/commit` skill**，不要手写 `git add` + `git commit`（项目规则，已踩过两次坑）。
7. **红→绿检查点（本计划的核心方法）**：每个文案任务都先改测试断言为中文、跑测试、**必须亲眼看到它变红**，再改源码让它变绿。
   **若改完断言测试仍然是绿的 —— 停下**。那说明这条断言根本没在验证这条文案（HB-31 式的假通过），先把断言收窄到能红，再继续。这种发现要记录在最终汇报里。
8. 单测：`pnpm test`（或单文件 `pnpm vitest run tests/xxx.test.ts`）。E2E：`pnpm test:e2e`（约 20s，会真实构建 `dist/`；迭代时可用 `E2E_SKIP_BUILD=1` 复用现有 dist）。

---

## 文件结构

| 文件 | 责任 | Task |
|:--|:--|:--|
| `src/constants/messages.ts` | **新建**。唯一文案源，零 import | 1（建立）、2/4/5/6（追加条目） |
| `src/utils/index.ts` | 4 条 ScriptError 改用 MSG | 1 |
| `src/utils/package-manager.ts` | 1 条 ScriptError 改用 MSG_FOR | 1 |
| `src/scripts/main.ts` | 流程文案 + 错误 + re-export MSG_FOR 给 bin | 2 |
| `bin/index.js` | `Caused by:` 走 re-export | 2 |
| `src/registry.ts` | 删 `summaryEn` 字段、help 模板纯中文 | 3 |
| `src/scripts/commitlint-init.ts` | 14 条 spinner + 11 条 print\* + 消息片段 | 4 |
| `src/utils/prompt.ts` | 交互文案砍成纯中文 | 5 |
| `src/utils/linter.ts` | `none` 分支模板注释（写进用户仓库） | 6 |
| `src/constants/index.ts` | czgit 模板砍成纯中文 | 6 |
| `tests/e2e/helpers/constants.ts` | 期望消息表改中文字面量 | 2/4/6 |

---

### Task 1: 建立 messages 层，迁移 utils 与 package-manager 的错误文案

**Files:**
- Create: `src/constants/messages.ts`
- Modify: `src/utils/index.ts`（4 处 ScriptError）、`src/utils/package-manager.ts:162`
- Test: `tests/utils.test.ts:168,175,338,345`、`tests/package-manager.test.ts:173`

**Interfaces:**
- Produces: `MSG.cannotFindPackageJson` / `MSG.parsePackageJsonFailed` / `MSG.writePackageJsonFailed`（`string`），`MSG_FOR.execFailed(command: string): string` / `MSG_FOR.uninstallFailed(pkg: string): string`。后续所有 Task 都从 `@/constants/messages` import 这两个对象。

- [ ] **Step 1: 先改测试断言为中文**

`tests/utils.test.ts`：

```ts
// 第 168 行
expect(() => getPackageJSON()).toThrow('当前目录下找不到 package.json。')

// 第 175 行
expect(() => getPackageJSON()).toThrow('解析 package.json 失败。')

// 第 338 行（在 rejects.toMatchObject 的对象里）
message: `执行 'git init' 失败。`,

// 第 345 行
await expect(writePackageJSON({ name: 'demo' })).rejects.toThrow('写入 package.json 失败。')
```

`tests/package-manager.test.ts` 第 173 行：

```ts
await expect(pm.uninstall('some-pkg')).rejects.toThrow('卸载 some-pkg 失败。')
```

> 注意第 168 行原断言是 `toThrow('Cannot find package.json')`（片段，不含句号）。改中文时补成整句 `当前目录下找不到 package.json。`——顺手落实 Global Constraint 7 的收窄标准。

- [ ] **Step 2: 跑测试，确认变红**

```bash
pnpm vitest run tests/utils.test.ts tests/package-manager.test.ts
```

预期：5 条断言 FAIL，报错形如 `expected error message to include '当前目录下找不到 package.json。' but got 'Cannot find package.json in the current directory.'`。

**若有任何一条是绿的，停下排查**——说明那条断言没在验证文案。

- [ ] **Step 3: 创建 `src/constants/messages.ts`**

```ts
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
 */

/** 固定文案 */
export const MSG = {
  cannotFindPackageJson: '当前目录下找不到 package.json。',
  parsePackageJsonFailed: '解析 package.json 失败。',
  writePackageJsonFailed: '写入 package.json 失败。',
} as const

/** 需要嵌入文件名 / 取值的文案 */
export const MSG_FOR = {
  execFailed: (command: string) => `执行 '${command}' 失败。`,
  uninstallFailed: (pkg: string) => `卸载 ${pkg} 失败。`,
} as const
```

- [ ] **Step 4: 改 `src/utils/index.ts`**

顶部 import 加一行（放在 `import { DEFAULT_PKG_NAME, REPO_URL } from '@/constants'` 之后，保持 eslint 的 import 排序）：

```ts
import { MSG, MSG_FOR } from '@/constants/messages'
```

四处替换：

```ts
// execCommand 里
throw new ScriptError(MSG_FOR.execFailed(command), { cause: e })

// getPackageJSON 里
throw new ScriptError(MSG.cannotFindPackageJson)

// getPackageJSON 的 catch 里
throw new ScriptError(MSG.parsePackageJsonFailed, { cause: e })

// writePackageJSON 的 catch 里
throw new ScriptError(MSG.writePackageJsonFailed, { cause: e })
```

- [ ] **Step 5: 改 `src/utils/package-manager.ts`**

import 加 `import { MSG_FOR } from '@/constants/messages'`，第 162 行：

```ts
throw new ScriptError(MSG_FOR.uninstallFailed(pkg), { cause: e })
```

- [ ] **Step 6: 跑测试，确认转绿**

```bash
pnpm vitest run tests/utils.test.ts tests/package-manager.test.ts
pnpm typecheck
```

预期：全部 PASS，typecheck 无输出。

- [ ] **Step 7: 提交**

调用 `/commit` skill，建议 message：

```
refactor: centralise user-facing copy into a messages module
```

---

### Task 2: main.ts 与 bin/index.js 的流程文案

**Files:**
- Modify: `src/constants/messages.ts`（追加）、`src/scripts/main.ts`、`bin/index.js`
- Test: `tests/main.test.ts:74,80`、`tests/e2e/helpers/constants.ts:56,62,66,85`

**Interfaces:**
- Consumes: Task 1 的 `MSG` / `MSG_FOR`
- Produces: `MSG.noScript` / `MSG.processStart` / `MSG.clearDone`，`MSG_FOR.unknownOption(list: string, script: string): string` / `MSG_FOR.processDone(seconds: string): string` / `MSG_FOR.causedBy(detail: string): string`。
  **`src/scripts/main.ts` 新增 `export { MSG_FOR } from '@/constants/messages'`** —— Task 后续无人依赖，但 `bin/index.js` 依赖它。

> **关键技术约束**：`bin/index.js` 是纯 JS，从 `../dist/main.js` import。它**不能**写 `import { MSG_FOR } from '@/constants/messages'`——tsdown 把共享代码打进带 hash 的 chunk（如 `dist/constants-CaIpLqQE.js`），文件名每次构建都可能变。`dist/main.js` 是唯一稳定入口，所以文案必须由它 re-export。这与现有的 `export { printErr, ScriptError } from '@/utils'` 是同一个理由。

- [ ] **Step 1: 先改测试断言为中文**

`tests/main.test.ts` 第 74、80 行（两处相同）：

```ts
await expect(main()).rejects.toThrow('请指定一个要执行的脚本。')
```

`tests/e2e/helpers/constants.ts`：

```ts
  noScript: '请指定一个要执行的脚本。',
  processDone: '流程结束',
  causedBy: '底层原因：',
```

以及 `MESSAGE_FOR` 里：

```ts
  unknownOption: (flag: string) => `未知参数：--${flag}。`,
```

`tests/e2e/existing-config.e2e.test.ts` 第 142 行的正则跟着改：

```ts
expect(result.stdout).toMatch(/底层原因：\S/)
```

- [ ] **Step 2: 跑测试，确认变红**

```bash
pnpm vitest run tests/main.test.ts
pnpm test:e2e
```

预期：`main.test.ts` 2 条 FAIL；E2E 里 `cli-basics` / `existing-config` / `scaffold` 相关用例 FAIL。

- [ ] **Step 3: 往 `src/constants/messages.ts` 追加**

`MSG` 里加：

```ts
  noScript: '请指定一个要执行的脚本。',
  processStart: '流程开始',
  clearDone: '清理完成！',
```

`MSG_FOR` 里加：

```ts
  /** 未知参数。中文没有单复数变化，原实现那个 `${n > 1 ? 's' : ''}` 三元一并去掉 */
  unknownOption: (list: string, script: string) =>
    `未知参数：${list}。运行 \`hubery ${script} --help\` 查看支持的参数。`,
  processDone: (seconds: string) => `流程结束，耗时 ${seconds}s`,
  causedBy: (detail: string) => `底层原因：${detail}`,
```

- [ ] **Step 4: 改 `src/scripts/main.ts`**

import 加 `import { MSG, MSG_FOR } from '@/constants/messages'`。

在现有 re-export 那一行下面加一行，并把注释一并翻成中文：

```ts
/**
 * 供 bin/index.js 使用的 re-export
 *
 * bin 不能直接 import '@/utils'：tsdown 会把共享代码打进带 hash 的 chunk
 * （如 dist/constants-CaIpLqQE.js），文件名每次构建都可能变。dist/main.js 是
 * 唯一稳定的入口，所以由它把这些转出去。
 */
export { printErr, ScriptError } from '@/utils'
export { MSG_FOR } from '@/constants/messages'
```

四处文案替换：

```ts
// 未指定脚本
throw new ScriptError(MSG.noScript)

// 未知参数（注意：原来的 unknown.length > 1 ? 's' : '' 三元整个删掉）
const unknown = findUnknownFlags(options, script)
if (unknown.length) {
  const list = unknown.map(flag => `--${flag}`).join(', ')
  throw new ScriptError(MSG_FOR.unknownOption(list, script.name))
}

// 流程开始
console.log(`⚡️ ${bold(green(MSG.processStart))}\n`)

// 流程结束
console.log(`\n✨ ${green(bold(MSG_FOR.processDone(elapsedTime)))}\n`)

// clear
spinner().success(MSG.clearDone)
```

> 注意「流程结束」这行原本是 `green(bold('Process Down')) + bold(\` in ${elapsedTime}s\`)`——耗时部分在函数外面拼。改成由 `MSG_FOR.processDone(elapsedTime)` 返回整句、整句上色，样式更统一，也让文案在 messages.ts 里是完整可读的一句话。

- [ ] **Step 5: 改 `bin/index.js`**

```js
#!/usr/bin/env node

'use strict'
import process from 'node:process'
import { main, MSG_FOR, printErr, ScriptError } from '../dist/main.js'

main().catch((e) => {
  // 预期内的失败只给一行提示；其余的是 bug，原样抛出让 node 打完整堆栈
  if (!(e instanceof ScriptError))
    throw e
  printErr(e.message)
  // ScriptError 一路带着 cause，但从前只打 message，底层到底为什么失败被整个吞掉，
  // 用户只能看到「执行 'xxx' 失败」这种没有信息量的一行
  if (e.cause)
    printErr(MSG_FOR.causedBy(e.cause.shortMessage ?? e.cause.message ?? e.cause))
  process.exit(1)
})
```

- [ ] **Step 6: 跑测试，确认转绿**

```bash
pnpm vitest run tests/main.test.ts && pnpm test:e2e
```

预期：全部 PASS。E2E 会重新构建 dist，`bin/index.js` 的 re-export 若拼错这里就会炸。

- [ ] **Step 7: 提交**

`/commit` skill，建议 message：

```
refactor: translate CLI flow messages to Chinese
```

---

### Task 3: 删除 summaryEn，help 文本砍成纯中文

**Files:**
- Modify: `src/registry.ts`
- Test: `tests/registry.test.ts:9,67`（删断言）、`tests/main.test.ts`（help 断言核对）

**Interfaces:**
- Produces: `FlagSpec` 与 `Script` 接口不再有 `summaryEn` 字段。后续 Task 若新增 flag，只写 `summary`。

- [ ] **Step 1: 先改测试，删掉钉住 summaryEn 的断言**

`tests/registry.test.ts` 第 9 行与第 68 行各删一行：

```ts
expect(script.summaryEn).toBeTruthy()   // ← 删掉
expect(flag.summaryEn).toBeTruthy()     // ← 删掉
```

- [ ] **Step 2: 跑 typecheck，确认变红**

```bash
pnpm typecheck
```

此刻应仍是绿的（字段还在，只是没人断言了）。**这一步的红出现在 Step 4 之后**——本任务是接口删除，红绿信号来自 typecheck 而非断言。先记录当前 `pnpm vitest run tests/registry.test.ts` 是 PASS。

- [ ] **Step 3: 改 `src/registry.ts` 的接口与数据**

`FlagSpec` 删掉 `summaryEn: string`；`Script` 删掉 `summaryEn: string`。

`GLOBAL_FLAGS` 三项删掉各自的 `summaryEn`，`summary` 保持原中文值不变（`'查看帮助'` / `'查看版本号'` / `'清洁执行 - 执行完脚本后卸载模块'`）。

`SCRIPTS` 里 `commitlint-init` 及其两个 flag 同样只删 `summaryEn`。

- [ ] **Step 4: 改三个渲染函数**

```ts
/** `-h, --linter=<...>` 这种标签，右侧补空格让描述对齐 */
function renderFlagLines(flags: FlagSpec[]): string {
  return flags
    .map((flag) => {
      const short = flag.alias ? `-${flag.alias}, ` : ''
      const value = flag.placeholder ? `=${flag.placeholder}` : ''
      return `  ${`${short}--${flag.name}${value}`.padEnd(38)}${flag.summary}`
    })
    .join('\n')
}

/**
 * 渲染顶层帮助文本
 *
 * 可用指令一节由 SCRIPTS 派生，不会和实际支持的指令走散。各指令自己的参数
 * 刻意放在 renderScriptHelp 里 —— 一旦指令多于一个，把所有参数都堆在这里
 * 会让顶层帮助没法读。
 */
export function renderHelp(): string {
  const commands = SCRIPTS
    .map(({ name, summary }) => `  ${green(name)}\n      ${summary}`)
    .join('\n')

  return `\
一些帮助简化前端配置工程的通用脚本

用法：hubery <script> [参数]...

可用指令：
${commands}

全局参数：
${renderFlagLines(GLOBAL_FLAGS)}

查看某个指令自己的参数：
  hubery <script> --help
`
}

/** 渲染单个指令的帮助文本，含全局参数 */
export function renderScriptHelp(script: Script): string {
  const own = script.flags?.length
    ? `参数：\n${renderFlagLines(script.flags)}\n\n`
    : ''

  return `\
${green(script.name)}
  ${script.summary}

用法：hubery ${script.name} [参数]...

${own}全局参数：
${renderFlagLines(GLOBAL_FLAGS)}
`
}
```

- [ ] **Step 5: 跑 typecheck + 全部测试**

```bash
pnpm typecheck && pnpm test
```

预期：typecheck 干净（若还有地方引用 `summaryEn`，这里会报错，那就是遗漏点）；单测全绿。

- [ ] **Step 6: 肉眼核对 help 对齐**

```bash
pnpm build && node bin/index.js --help && node bin/index.js commitlint-init --help
```

砍掉英文后描述变短，检查 `padEnd(38)` 是否还合适。`--linter=<eslint|biome|oxlint|none>` 是最长的标签（约 34 字符），38 仍留有余量，**大概率不用改**；但如果输出看起来右边空太多，把 38 调小到 36 并在计划旁注明改了。

- [ ] **Step 7: 提交**

`/commit` skill，建议 message：

```
refactor!: drop bilingual help text in favour of Chinese only
```

---

### Task 4: commitlint-init.ts 全部文案

这是文案最集中的一个任务：14 条 spinner + 9 条 print\* + 4 段消息片段。

**Files:**
- Modify: `src/constants/messages.ts`（追加）、`src/scripts/commitlint-init.ts`
- Test: `tests/commitlint-init.test.ts:147,196,352`、`tests/e2e/helpers/constants.ts`

**Interfaces:**
- Consumes: Task 1 的 `MSG` / `MSG_FOR`
- Produces: `MSG.promptCancelled` / `MSG.noLinterNonInteractive` / `MSG.rollbackDone` / `MSG.spinner*`（14 条），`MSG_FOR.unknownLinter` / `MSG_FOR.keptCommitlint` / `MSG_FOR.keptLintStaged` / `MSG_FOR.hookAppended` / `MSG_FOR.hookUnchanged` / `MSG_FOR.configExists` / `MSG_FOR.huskyV4Found` / `MSG_FOR.huskyV4Detail` / `MSG.pkgField*`

- [ ] **Step 1: 先改 E2E 消息表**

`tests/e2e/helpers/constants.ts`，`MESSAGES` 中：

```ts
  noLinterNonInteractive: '未探测到 linter，当前也不是交互式终端无法询问',
  promptCancelled: '已取消选择 —— 跳过 lint-staged 规则。',
  unknownLinterPrefix: '无法识别的 --linter 取值',
  lintRunning: '格式化生成的文件...',
  lintDone: '格式化完成！',
  gitInitChecking: '检查 git 仓库...',
  gitInitDone: 'git 仓库就绪！',
  commitlintConfigDone: 'commitlint 配置完成！',
  rollbackDone: '配置失败 —— 本次写入的文件已全部回滚。',
```

`MESSAGE_FOR` 中：

```ts
  keptCommitlint: (existing: string) => `已保留你的 commitlint 配置 —— ${existing} 已存在。`,
  keptLintStaged: (existing: string) => `已保留你的 lint-staged 配置 —— ${existing} 已存在。`,
  hookAppended: (hook: string) => `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。`,
  hookUnchanged: (hook: string) => `${hook} 已经在跑我们的命令，保持原样。`,
  unknownLinter: (value: string) => `无法识别的 --linter 取值 "${value}"，改用自动探测。`,
```

`PKG_FIELD`：

```ts
export const PKG_FIELD = {
  lintStaged: 'package.json 的 "lint-staged" 字段',
  commitlint: 'package.json 的 "commitlint" 字段',
} as const
```

- [ ] **Step 2: 改单测断言**

`tests/commitlint-init.test.ts`：

```ts
// 第 147 行 —— 顺手收窄：原来只断言片段 'already exists'
expect(printInfoMock).toHaveBeenCalledWith(
  expect.stringContaining('已保留你的 commitlint 配置 —— commitlint.config.js 已存在。'),
)

// 第 196 行
expect(printInfoMock).toHaveBeenCalledWith(
  expect.stringContaining('package.json 的 "lint-staged" 字段'),
)

// 第 352 行
expect(printWarnMock).toHaveBeenCalledWith(
  expect.stringContaining('未探测到 linter，当前也不是交互式终端无法询问'),
)
```

> 第 147 行原断言 `stringContaining('already exists')` 是 HB-31 点名过的宽断言类型。改中文时一并收窄成整句。若不确定该用例里已存在的配置文件名是什么，先跑 `pnpm vitest run tests/commitlint-init.test.ts -t "已存在"` 看实际值再填。

- [ ] **Step 3: 跑测试，确认变红**

```bash
pnpm vitest run tests/commitlint-init.test.ts
pnpm test:e2e
```

预期：单测 3 条 FAIL，E2E 多条 FAIL。

- [ ] **Step 4: 往 `src/constants/messages.ts` 追加**

`MSG` 里加：

```ts
  // —— commitlint-init ——
  promptCancelled: '已取消选择 —— 跳过 lint-staged 规则。',
  noLinterNonInteractive:
    '未探测到 linter，当前也不是交互式终端无法询问 —— 已跳过 lint-staged 规则，请自行编辑 lint-staged.config.mjs。',
  rollbackDone: '配置失败 —— 本次写入的文件已全部回滚。',
  pkgFieldCommitlint: 'package.json 的 "commitlint" 字段',
  pkgFieldLintStaged: 'package.json 的 "lint-staged" 字段',
  pkgFieldHusky: 'package.json 的 "husky" 字段',

  // —— spinner ——
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
```

`MSG_FOR` 里加：

```ts
  unknownLinter: (value: string) => `无法识别的 --linter 取值 "${value}"，改用自动探测。`,
  configExists: (file: string) => `${file} 已存在`,
  keptCommitlint: (reason: string) => `已保留你的 commitlint 配置 —— ${reason}。`,
  keptLintStaged: (reason: string) => `已保留你的 lint-staged 配置 —— ${reason}。`,
  hookAppended: (hook: string) => `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。`,
  hookUnchanged: (hook: string) => `${hook} 已经在跑我们的命令，保持原样。`,
  huskyV4Found: (source: string, detail: string) =>
    `在 ${source} 发现 husky v4 配置，husky 9 不会读取它 —— 这些钩子实际没有在跑。${detail} 请把它们迁移到 .husky/ 目录后删除旧配置。`,
  huskyV4Detail: (pairs: string) => ` 其中定义了：${pairs}。`,
```

- [ ] **Step 5: 改 `src/scripts/commitlint-init.ts`**

import 加 `import { MSG, MSG_FOR } from '@/constants/messages'`。

替换点（按文件从上到下）：

```ts
// detectHuskyV4 里
return { source: MSG.pkgFieldHusky, hooks: field.hooks ?? {} }

// planConfigWrite 里
return existing ? { write: false, reason: MSG_FOR.configExists(existing) } : { write: true }

// surveyProject 里两处
?? (env.pkg.commitlint ? MSG.pkgFieldCommitlint : undefined)
?? (env.pkg['lint-staged'] ? MSG.pkgFieldLintStaged : undefined)

// resolveLinterChoice 里三处
printWarn(MSG_FOR.unknownLinter(String(options.linter)))
printWarn(MSG.noLinterNonInteractive)
printWarn(MSG.promptCancelled)

// init 的 catch 里
printWarn(MSG.rollbackDone)

// runSetup —— husky v4
const detail = hooks.length
  ? MSG_FOR.huskyV4Detail(hooks.map(([name, command]) => `${name} -> ${command}`).join('；'))
  : ''
printWarn(MSG_FOR.huskyV4Found(survey.huskyV4.source, detail))

// runSetup —— 两处 kept
printInfo(MSG_FOR.keptCommitlint(survey.commitlint.reason!))
printInfo(MSG_FOR.keptLintStaged(survey.lintStaged.reason!))

// runSetup —— 两处 hook
printWarn(MSG_FOR.hookAppended(hook.path))
printInfo(MSG_FOR.hookUnchanged(hook.path))
```

> husky v4 的多个钩子原本用 `'; '` 分隔，中文语境改用中文分号 `'；'`。

14 处 spinner 逐一替换：

```ts
spinner.start(MSG.spinnerGitInitStart)
spinner.success(MSG.spinnerGitInitDone)
spinner.start(MSG.spinnerInstallStart)
spinner.success(MSG.spinnerInstallDone)
spinner.start(MSG.spinnerCommitlintStart)
spinner.success(MSG.spinnerCommitlintDone)
spinner.start(MSG.spinnerLintStagedStart)
spinner.success(MSG.spinnerLintStagedDone)
spinner.start(MSG.spinnerHuskyStart)
spinner.success(MSG.spinnerHuskyDone)
spinner.start(MSG.spinnerPkgJsonStart)
spinner.success(MSG.spinnerPkgJsonDone)
spinner.start(MSG.spinnerLintStart)
spinner.success(MSG.spinnerLintDone)
```

- [ ] **Step 6: 跑测试，确认转绿**

```bash
pnpm vitest run tests/commitlint-init.test.ts tests/commitlint-init-plan.test.ts && pnpm test:e2e
```

预期：全绿。

- [ ] **Step 7: 提交**

`/commit` skill，建议 message：

```
refactor: translate commitlint-init output to Chinese
```

---

### Task 5: 交互 prompt 砍成纯中文

**Files:**
- Modify: `src/constants/messages.ts`（追加）、`src/utils/prompt.ts`
- Test: `tests/prompt.test.ts`（最后一条用例要改写）

**Interfaces:**
- Produces: `MSG.promptLinterMessage` / `MSG.promptLinterNone` / `MSG.promptCancelledLabel`

- [ ] **Step 1: 改写钉住双语的那条测试**

`tests/prompt.test.ts` 最后一条用例 `'提示文案应该是中英双语'` —— 它断言的正是本任务要移除的行为，整条改写：

```ts
it('提示文案应该是纯中文，不含英文', async () => {
  selectMock.mockResolvedValue('eslint')
  isCancelMock.mockReturnValue(false)
  await promptLinterChoice()
  const call = selectMock.mock.calls[0][0]
  expect(call.message).toContain('未检测到已知的 linter')
  // 砍掉双语并排后，提示里不该再出现整句英文。逐词排除会漏，
  // 直接断言不含 ASCII 单词序列 —— 但 linter / lint-staged 这类
  // 技术名词是保留的，所以只排除原双语句里那半句。
  expect(call.message).not.toMatch(/no known linter/i)
})
```

- [ ] **Step 2: 跑测试，确认变红**

```bash
pnpm vitest run tests/prompt.test.ts
```

预期：新用例 FAIL（当前 message 里确实有 `No known linter detected`）。

- [ ] **Step 3: 往 `src/constants/messages.ts` 追加**

```ts
  // —— 交互提示 ——
  promptLinterMessage: '未检测到已知的 linter，用于 lint-staged 的检查工具是？',
  promptLinterNone: '跳过 —— 我自己配置',
  promptCancelledLabel: '已取消。',
```

- [ ] **Step 4: 改 `src/utils/prompt.ts`**

```ts
import type { LinterKind } from '@/utils/linter'
import { cancel, isCancel, select } from '@clack/prompts'
import { MSG } from '@/constants/messages'

export async function promptLinterChoice(): Promise<LinterKind | 'none' | undefined> {
  const answer = await select({
    message: MSG.promptLinterMessage,
    options: [
      { value: 'eslint', label: 'ESLint' },
      { value: 'biome', label: 'Biome' },
      { value: 'oxlint', label: 'Oxlint' },
      { value: 'none', label: MSG.promptLinterNone },
    ],
  })

  if (isCancel(answer)) {
    cancel(MSG.promptCancelledLabel)
    return undefined
  }

  return answer as LinterKind | 'none'
}
```

> ESLint / Biome / Oxlint 三个 label 是产品名，保持原样不翻译。

- [ ] **Step 5: 跑测试，确认转绿**

```bash
pnpm vitest run tests/prompt.test.ts && pnpm test:e2e
```

预期：全绿。E2E 的 `prompt-pty.e2e.test.ts` 走真实 pty，若它断言了英文文案也要一并核对。

- [ ] **Step 6: 提交**

`/commit` skill，建议 message：

```
refactor: make the linter prompt Chinese-only
```

---

### Task 6: 写进用户仓库的两份模板中文化

这两处的输出会落进**别人的项目**，不是本工具的终端输出——改动性质与前几个任务不同，单独一个任务便于 review。

**Files:**
- Modify: `src/utils/linter.ts`（`renderLintStagedConfig` 的 `none` 分支）、`src/constants/index.ts`（`CONFIG_COMMITLINT_CZGIT`）
- Test: `tests/constants.test.ts`（一条用例要改写）、`tests/e2e/helpers/constants.ts:36-41`

- [ ] **Step 1: 改 E2E 的期望模板内容**

`tests/e2e/helpers/constants.ts` 的 `LINT_STAGED_CONFIG.none`：

```ts
  none: `export default {\n`
    + `  // 未探测到 linter，也没有选择 —— 请替换成你自己的规则，例如：\n`
    + `  // '*': 'eslint --fix --no-error-on-unmatched-pattern',\n`
    + `  '*': [],\n`
    + `}\n`,
```

- [ ] **Step 2: 改写 constants 里钉住双语的那条用例**

`tests/constants.test.ts` 的 `'types 数组中每项应该同时包含中英文说明'` —— 它钉的正是要移除的行为，整条改写：

```ts
  it('types 数组每项应该是纯中文说明', () => {
    // 砍掉双语后不该再有 "中文 | English" 这种并排格式
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`name: 'feat:     新增功能'`)
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`name: 'fix:      修复缺陷'`)
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain('A new feature')
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain(' | ')
  })
```

同一文件里 `'应该包含中文提示信息'` 那条断言 `'填写简短精炼的变更描述'` —— 注意**原模板写的是「精炼」**，保持这两个字不变，否则这条会连带变红。

- [ ] **Step 3: 跑测试，确认变红**

```bash
pnpm vitest run tests/constants.test.ts && pnpm test:e2e
```

预期：新用例 FAIL。

- [ ] **Step 4: 改 `src/utils/linter.ts`**

```ts
  if (choice === 'none') {
    return `export default {
  // 未探测到 linter，也没有选择 —— 请替换成你自己的规则，例如：
  // '*': 'eslint --fix --no-error-on-unmatched-pattern',
  '*': [],
}
`
  }
```

- [ ] **Step 5: 改 `src/constants/index.ts` 的 czgit 模板**

`messages` 十条去掉英文半句：

```
      type: '选择你要提交的类型：',
      scope: '选择一个提交范围（可选）：',
      customScope: '请输入自定义的提交范围：',
      subject: '填写简短精炼的变更描述：\\n',
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行：\\n',
      breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行：\\n',
      footerPrefixesSelect: '选择关联 issue 前缀（可选）：',
      customFooterPrefix: '输入自定义 issue 前缀：',
      footer: '列举关联 issue（可选），例如 #31, #I3244：\\n',
      confirmCommit: '是否提交或修改 commit？',
```

`types` 十一条去掉 ` | English` 部分：

```
      { value: 'feat', name: 'feat:     新增功能' },
      { value: 'fix', name: 'fix:      修复缺陷' },
      { value: 'docs', name: 'docs:     文档更新' },
      { value: 'style', name: 'style:    代码格式' },
      { value: 'refactor', name: 'refactor: 代码重构' },
      { value: 'perf', name: 'perf:     性能提升' },
      { value: 'test', name: 'test:     测试相关' },
      { value: 'build', name: 'build:    构建相关' },
      { value: 'ci', name: 'ci:       持续集成' },
      { value: 'revert', name: 'revert:   回退代码' },
      { value: 'chore', name: 'chore:    其他修改' },
```

`issuePrefixes` 那条本来就是纯中文，只把上面的英文注释翻掉：

```
    issuePrefixes: [
      // 默认走 GitHub 风格；用 Gitee 的话把它换成 link / closed 前缀
      { value: 'closes', name: 'closes:   关闭/解决一个 issue' },
    ],
```

`alias: { fd: 'docs: fix typos' }` **保持不变**——那是 commit message 的内容本身，不是提示文案。

顶部两条英文注释（`Standard Conventional Commits type list...` / `Renders the array-item text...`）一并翻成中文。

> ⚠️ 这是个字符串字面量模板，`\\n` 的双反斜杠转义和单引号极易改破。改完必须做 Step 6 的真实生成验证。

- [ ] **Step 6: 验证模板仍是合法 JS**

这是本任务最实在的风险：czgit 模板是个字符串字面量，里面的 `\\n` 转义和单引号极易改破，而**改破了单测照样绿**——`toContain` 只看子串，不看语法。

验证构建产物里的实际值（而不是源码文本），不联网、不依赖 CLI：

```bash
pnpm build
node --input-type=module -e "
import { readdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const chunk = readdirSync('dist').find(f => f.startsWith('constants-') && f.endsWith('.js'))
if (!chunk) throw new Error('没找到 constants chunk，检查 dist 是否构建成功')
const mod = await import(pathToFileURL('dist/' + chunk).href)
for (const [label, tpl] of [['CONFIG_COMMITLINT', mod.CONFIG_COMMITLINT], ['CONFIG_COMMITLINT_CZGIT', mod.CONFIG_COMMITLINT_CZGIT]]) {
  const f = '/tmp/check-' + label + '.mjs'
  writeFileSync(f, tpl)
  const cfg = await import(pathToFileURL(f).href)
  const types = cfg.default.rules['type-enum'][2]
  if (types.length !== 11) throw new Error(label + ' 的 type 数量是 ' + types.length + '，应为 11')
  console.log(label + ' 合法，type 数量 11')
}
console.log('czgit subject 文案 =', JSON.stringify((await import(pathToFileURL('/tmp/check-CONFIG_COMMITLINT_CZGIT.mjs').href)).default.prompt.messages.subject))
"
```

预期输出三行，最后一行形如 `czgit subject 文案 = "填写简短精炼的变更描述：\n"` —— 注意 `\n` 必须原样保留（那是给 cz-git 的换行符），若变成真实换行说明转义被改坏了。

`dist/constants-*.js` 这个 chunk 名前缀是 tsdown 的固定行为（hash 部分会变，前缀不会），所以用 `readdirSync` 找而不是写死文件名。

- [ ] **Step 7: 跑全部测试**

```bash
pnpm test && pnpm test:e2e
```

- [ ] **Step 8: 提交**

`/commit` skill，建议 message：

```
refactor: emit Chinese-only templates into consumer projects
```

---

### Task 7: `src/utils/`、`src/registry.ts`、`src/constants/`、`bin/` 的注释中文化

从这里开始不再有文案改动，只翻注释。**没有测试能证明注释翻对了**——验证靠 typecheck/lint/test 全绿证明没改坏代码，加上人工核对信息保真。

**Files:**
- Modify: `src/utils/index.ts`、`src/utils/package-manager.ts`、`src/utils/linter.ts`、`src/utils/prompt.ts`、`src/registry.ts`、`src/constants/index.ts`、`bin/index.js`

- [ ] **Step 1: 先记录基线**

```bash
pnpm test 2>&1 | tail -5
```

记下测试数量（应为 227 条左右），Step 4 要对比。

- [ ] **Step 2: 逐文件翻译注释**

按文件顺序处理，每个文件翻完立刻跑 `pnpm typecheck` 确认没把代码改坏。

高价值注释清单（**这些必须保真，不许概括**）：

- `src/utils/index.ts` — `ScriptError` 的类注释（谁抛、谁打印、谁 exit 的分工）、`resolveBannerMode` 的纯函数理由、`banner()` 里 win32 下 picocolors 不足以判断 TTY 的说明、`getPkgInfo` 为何要向上遍历而不用固定相对路径、`hasDependency` 为何必须双重检查（hoisted 传递依赖 vs 声明未安装）、`isMonorepo` 为何要真解析 yaml
- `src/utils/package-manager.ts` — `SPECS` 表的总注释（npm/pnpm/yarn 已手工验证，bun/deno 未本地验证）、npm `--no` 标志存在的理由、yarn v1 拒绝 `yarn install <pkg>` 的说明
- `src/utils/linter.ts` — `noErrorOnUnmatchedFlag` 为何存在
- `src/registry.ts` — `GLOBAL_FLAGS` / `SCRIPTS` 的作用说明、`renderHelp` 为何不列子命令参数（Task 3 已翻过一部分，核对剩余）
- `src/constants/index.ts` — Task 6 已翻，核对
- `bin/index.js` — 已是中文，只需核对 Task 2 改动后表述仍然准确

- [ ] **Step 3: 检查是否有漏网的英文注释**

```bash
grep -rn "^\s*\(//\|/\*\|\*\)" src bin --include='*.ts' --include='*.js' \
  | grep -v '[一-龥]' \
  | grep -viE "^\S+:\s*(\*/|/\*\*|\*\s*$|//\s*$)" \
  | grep -vE "@type|@param|@returns|eslint-disable"
```

预期：输出为空，或只剩纯符号行 / JSDoc 标签行 / `eslint-disable` 指令。逐条确认剩下的都不是真正的英文句子。

- [ ] **Step 4: 全量验证**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

预期：三项全绿，测试数量与 Step 1 记录的一致。

- [ ] **Step 5: 提交**

`/commit` skill，建议 message：

```
docs: translate shared-layer comments to Chinese
```

---

### Task 8: `src/scripts/` 的注释中文化

`commitlint-init.ts` 437 行、注释密度最高，且几乎每条都是踩坑记录，单独一个任务。

**Files:**
- Modify: `src/scripts/commitlint-init.ts`、`src/scripts/main.ts`

- [ ] **Step 1: 翻译 `commitlint-init.ts` 的注释**

**这些是本仓库最有价值的注释，逐条保真：**

- `COMMITLINT_CONFIG_FILES` — 为何要扫全部变体而不只是自己要写的那个（否则留下两份打架的配置）
- `LINT_STAGED_CONFIG_FILES` — 同理，且 package.json 字段单独检查
- `HUSKY_V4_CONFIG_FILES` — husky 9 不读这些；原地升级的项目会留着它们，钩子在某个时刻悄悄停跑了
- `planSetup` — 为何只覆盖能提前算出的决定，husky 钩子写入的跳过与否取决于 `husky init` 的副作用所以留在 `init()`
- `patchPackageJSON` — 只增不删的理由（HB-02）、为何要多合并一层（cz-git 的 config.commitizen 下还有 alias/messages/types/scopes）
- `resolveHookContent` — husky 9 无条件覆盖 pre-commit；把快照原样写回会让我们的命令根本没进钩子，于是「配置成功」但 lint-staged 从不运行（HB-01）；逐行精确匹配而非子串（`lint-staged-extra` 不是我们的命令）
- `createFileJournal` — 半途失败会留下半配置状态；IO 注入是为了可测；**刻意不回滚**依赖安装（卸载可能删掉项目本来就要的包）和 `git init`
- `surveyProject` — 为何决策集中在这里（可测 + 将来 doctor 复用）；钩子内容必须在 `husky init` 之前读
- `runSetup` 里的行内注释 — 钩子写的是命令字符串所以用 `formatExec`、lint-staged 配置固定 `.mjs` 的理由、`package.json` 必须重读（husky init 刚写过 scripts.prepare）、收尾 lint 用 `allowFailure`

`main.ts` 的注释（`buildParserConfig` 为何要从 registry 派生、`findUnknownFlags` 存在的理由、`--help` 为何在 missing-script 之前解析）同样逐条翻译。

- [ ] **Step 2: 检查漏网**

```bash
grep -rn "^\s*\(//\|/\*\|\*\)" src/scripts --include='*.ts' \
  | grep -v '[一-龥]' \
  | grep -vE "@type|@param|@returns|eslint-disable" \
  | grep -vE ":\s*(\*/|/\*\*|\*\s*)$"
```

预期：空。

- [ ] **Step 3: 全量验证**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

- [ ] **Step 4: 提交**

`/commit` skill，建议 message：

```
docs: translate commitlint-init comments to Chinese
```

---

### Task 9: `tests/` 的注释中文化

**Files:**
- Modify: `tests/` 下全部 `.ts`（373 行注释中约 337 行仍是英文）

- [ ] **Step 1: 翻译测试注释**

重点保真的几条：

- `tests/e2e/helpers/constants.ts` 顶部 — **「刻意不从 src/ 导入」那段必须完整保留语义**：E2E 一旦从实现派生期望就会跟着漂移，不再是验收测试
- 同文件 `MESSAGES` / `MESSAGE_FOR` 的注释 — 每条消息要长到能唯一指认一个分支；`already exists` 这种短片段同时匹配「保留配置」和「追加钩子」两种情况，断言它等于什么都没证明（改中文后举例改成对应的中文片段）
- `tests/utils.test.ts:193-194` — 为何断言带前后空格的 ` WARN ` 而不是裸 `WARN`（后者是 `warning` 的子串）
- `tests/utils.test.ts:367` — printInfo 不该被渲染成 WARN 的理由（HB-10）
- `tests/constants.test.ts` 的 `extractTypes` — 为何限定在规则体内匹配（搜全文会命中类型自己的描述文字）
- `tests/e2e/scaffold.e2e.test.ts:281-282` — HB-31 的核心发现：`already exists` 曾经代表所有情况，谁先打印就匹配谁，而钩子那条压根不含这个词

- [ ] **Step 2: 检查漏网**

```bash
grep -rn "^\s*\(//\|/\*\|\*\)" tests --include='*.ts' \
  | grep -v '[一-龥]' \
  | grep -vE "@type|@param|@returns|eslint-disable" \
  | grep -vE ":\s*(\*/|/\*\*|\*\s*)$"
```

- [ ] **Step 3: 全量验证**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

- [ ] **Step 4: 提交**

`/commit` skill，建议 message：

```
docs: translate test comments to Chinese
```

---

### Task 10: 真实运行验证 + 约定与 ROADMAP 同步

前九个任务只能证明「测试和实现一致」，证明不了「输出对人类读起来是对的」。这个任务补上这一环。

**Files:**
- Modify: `CLAUDE.md`（语言约定）、`ROADMAP.md`（HB-33 标 ✅ + 时间轴）

- [ ] **Step 1: 全量门禁**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

四项全绿才继续。把实际输出（测试条数）记下来，最终汇报要贴。

- [ ] **Step 2: 真实跑一遍，肉眼核对输出**

```bash
pnpm build
node bin/index.js --help
node bin/index.js commitlint-init --help
node bin/index.js --version
node bin/index.js nosuchscript          # 看错误提示
node bin/index.js commitlint-init --czgti   # 看未知参数提示
```

再在一个干净临时目录里跑完整流程：

```bash
TMP=$(mktemp -d) && cd "$TMP" && npm init -y >/dev/null
node /Users/hubery/Desktop/code/todo-scripts/bin/index.js commitlint-init --linter=none
cat commitlint.config.js lint-staged.config.mjs .husky/pre-commit .husky/commit-msg
```

核对清单：
- [ ] 所有句子都是中文，没有残留英文句子（` WARN ` / ` INFO ` / ` ERROR ` 标签除外，那是刻意保留的）
- [ ] help 的参数描述对齐正常，没有因中英混排导致的错位
- [ ] 生成的 `commitlint.config.js` 是合法 JS（`node --input-type=module -e "import('./commitlint.config.js')"` 不报错）
- [ ] spinner 行读起来通顺，不是机翻腔

再跑一次 `--czgit` 变体，确认 czgit 模板生成物合法：

```bash
cd "$TMP" && rm -f commitlint.config.js
node /Users/hubery/Desktop/code/todo-scripts/bin/index.js commitlint-init --czgit --linter=none
node --input-type=module -e "import('$TMP/commitlint.config.js').then(m => console.log('czgit 模板 import 成功，type 数量：', m.default.rules['type-enum'][2].length))"
```

预期输出 `czgit 模板 import 成功，type 数量： 11`。

- [ ] **Step 3: 更新项目 `CLAUDE.md` 的语言约定**

找到 `## Conventions` 一节，把现有的英文注释约定替换为：

```markdown
## Conventions

代码注释：**中文**。commit message：**英文**（Conventional Commits）。测试名（`it`/`describe` 的字符串）：中文。

注释的中文化是 HB-33（2026-09-05）的阶段性决定：工具正在向中文社区推广，中文注释便于自己快速迭代。等工具成熟、面向国际受众时会整体转回英文——届时终端文案只需改 `src/constants/messages.ts` 一个文件，注释则要再扫一遍全仓。

commit message 保持英文是刻意的：`changelogithub` 生成的 GitHub Release notes 由 commit message 直接构成，改中文会与 v1.3.0 之前的历史不一致。
```

同时在 `## Architecture` 的「Shared layers」小节补一句：

```markdown
- `src/constants/messages.ts` 是全部面向用户文案的唯一来源，零 import。`MSG` 放固定文案，`MSG_FOR` 放需要嵌入变量的函数。新增任何终端输出都必须先在这里定义，不要就地写字符串——集中在一处是为了将来能一次性转回英文。`bin/index.js` 是纯 JS 拿不到 `@/` 别名，它需要的文案由 `dist/main.js` re-export（与 `printErr`/`ScriptError` 同一个理由）。
```

- [ ] **Step 4: 更新 `ROADMAP.md`**

- HB-33 状态 🚧 → ✅
- 「当前状态 · 进行中」改回 `无`
- 时间轴追加一行：

```markdown
| 2026-09-05 | HB-33 完成 | 终端输出、源码/测试注释、czgit 与 lint-staged 模板全面中文化。文案集中进 `src/constants/messages.ts`（MSG + MSG_FOR），删除 `summaryEn` 字段。commit message 与 WARN/INFO/ERROR 级别标签按设计保持英文。单测 227、E2E 57 全绿，另做了真实运行核对 |
```

> 时间轴现有 15 行，加这行后 16 行，离规则 9 的 50 行拆分阈值还远。

- [ ] **Step 5: 提交**

`/commit` skill，建议 message：

```
docs: record the Chinese-localization convention
```

> 注意 `CLAUDE.md` 和 `ROADMAP.md` 都在 `.gitignore` 里（「个人维护，不进版本库」），**不会被提交也不该 `git add -f`**。这一步实际提交的只有可能的收尾修补；若工作区干净，跳过提交即可。

---

## 自审结果

**Spec 覆盖检查** —— spec 的每条目标都能指到任务：

| Spec 目标 | Task |
|:--|:--|
| 运行时文案全部中文化 | 1, 2, 4 |
| 文案集中进 messages.ts | 1（建立）+ 2/4/5（追加） |
| help 与 prompt 纯中文、删 summaryEn | 3, 5 |
| czgit 模板纯中文 | 6 |
| lint-staged `none` 分支注释中文 | 6 |
| src/bin 注释中文化 | 7, 8 |
| tests 注释中文化 | 9 |
| 测试同步且保持 HB-31 断言标准 | 每个任务的 Step 1-2（红→绿检查点）+ Global Constraint 4、7 |
| CLAUDE.md 与 ROADMAP 同步 | 10 |
| 真实运行验证 | 10 Step 2 |

**类型一致性** —— `MSG` / `MSG_FOR` 的键名在 Task 1/2/4/5 之间无重名、无冲突；Task 2 引入的 `main.ts` re-export 是 Task 中唯一的跨文件接口，`bin/index.js` 的消费点在同一 Task 内。

**自审中修掉的一处**：Task 6 Step 6 初稿给了三个候选的模板验证写法，其中两个是探索性的。已重写为单一确定方案——读构建产物里的实际常量值、写成 `.mjs` 再 import，不联网也不依赖 CLI，并顺带把 `CONFIG_COMMITLINT` 一起验了。
