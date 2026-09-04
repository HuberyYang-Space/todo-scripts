# 全面中文化设计文档

**日期**：2026-09-04
**状态**：待评审
**ROADMAP 条目**：HB-33（v1.4.0 首条，排在 HB-12 之前）

## 背景与动机

`@huberyyang/todo-scripts` 的目标用户正在收窄为中文前端开发者，下一步要在 gitee 等中文社区推广。当前的输出语言与这个定位对不上：

- **运行时消息全是英文**：`install succeed!`、`Kept your commitlint config — X already exists.`、`Setup failed — the files this script had written were rolled back.`
- **help 与交互 prompt 是「中文 / English」双语并排**：每一行都被英文撑成两倍宽，中文用户读到的是一半噪音
- **`CONFIG_COMMITLINT_CZGIT` 模板双语**：这份内容会写进用户仓库，用户每次 `git cz` 都要在双语选单里挑
- **源码注释 277 行几乎全英文**（仅 `bin/index.js` 3 行是中文）

项目 CLAUDE.md 现有约定写的是「Code comments: English. Commit messages: English. ... this project is public and promoted across platforms」。本次**主动推翻其中的注释部分**，commit message 部分保留。这是一个**可逆的阶段性决定**：先中文化方便自己迭代，等工具成熟后再整体转回英文面向国际受众。因此本设计的一个硬要求是——**转回英文的成本必须集中在一个文件里**，而不是再来一次全仓扫荡。

顺带还掉一笔小债：现有 spinner 文案 `git init down!` / `install succeed!` / `lint down!` 是中式英语，中文化过程中一并重写。

## 目标 / 非目标

**目标：**

1. 全部面向用户的运行时文案中文化——7 条 `ScriptError`、14 条 spinner、11 条 `print*`/消息片段、`main.ts` 的流程提示与 `bin/index.js` 的 `Caused by`，逐条列在下文「文案对照表」里，那张表就是执行时的检查清单
2. 文案集中到新建的 `src/constants/messages.ts`，转回英文时只改这一个文件
3. help 与交互 prompt 砍成纯中文：删除 `FlagSpec.summaryEn` / `Script.summaryEn` 字段
4. `CONFIG_COMMITLINT_CZGIT` 模板砍成纯中文
5. `renderLintStagedConfig` 的 `none` 分支注释（写进用户仓库）改中文
6. `src/` + `bin/` 的 277 行注释、`tests/` 的 373 行注释全部中文化
7. 测试同步改中文，**且保持 HB-31 立下的断言收窄标准**
8. 同步更新项目 CLAUDE.md 的语言约定与 ROADMAP

**非目标（本轮明确不做）：**

- **commit message 保持英文**。changelogithub 生成的 GitHub Release notes 因此继续是英文，与 v1.3.0 之前的历史保持一致
- **`WARN` / `INFO` / `ERROR` 色块标签保持英文**。理由见下节
- **不做 i18n / `--lang` 运行时语言切换**。用户的需求是「先中文，成熟后转英文」，是一次性切换而非运行时双轨；集中到 messages.ts 已经满足，再造 i18n 框架属于过度设计
- **README 不动**。已经是中文主 + `README.en.md` 副的结构
- **gitee 推广不在本轮**。镜像仓库、同步 CI、README 徽章、czgit 的 gitee 风格 `issuePrefixes` 单独作为 ROADMAP 条目
- **不顺手重构**。HB-12 ~ HB-16 的功能改动不在本轮；本轮只改语言，源码逻辑零变更

## 为什么日志级别标签保持英文

`printWarn` / `printInfo` / `printErr` 渲染的 ` WARN ` / ` INFO ` / ` ERROR ` 色块**不是句子，是级别标记**——npm、pnpm、ESLint 全部这么标，中文开发者的理解成本为零。

更实际的一条理由：`tests/utils.test.ts:371` 有一条 `expect(printed).not.toContain(' WARN ')` 的**对比度断言**，它证明的是「HB-10 引入的 `printInfo` 没有被渲染成警告黄」。标签改中文后，这条断言要跟着改成 `not.toContain(' 警告 ')`，而 `警告` 二字极可能出现在正常的中文消息文本里（例如「已跳过警告检查」），断言会从「结构性保证」退化成「文案巧合」。保留英文标签让这条断言继续成立。

## 架构与组件

### 新增：`src/constants/messages.ts`

**不并入现有的 `src/constants/index.ts`**——那个文件已经 105 行，HB-20（模板外置）待办正是要给它减负，再塞几十条文案是火上浇油。

依赖方向：

```
src/constants/messages.ts        ← 零 import，纯数据 + 纯函数
        ↑ 被 import
src/utils/*.ts   src/scripts/*.ts   src/registry.ts
```

`src/constants/index.ts` 目前零 import，新文件同样零 import，**不存在循环依赖风险**。

文件内部分两块：

```ts
/** 固定文案 */
export const MSG = { ... } as const

/** 需要嵌入文件名/取值的文案，写成函数 */
export const MSG_FOR = { ... } as const
```

带参数的一律写成函数而非模板拼接，这样**调用点必须显式提供那个变量**——照抄 `tests/e2e/helpers/constants.ts` 里 `MESSAGE_FOR` 的既有做法（HB-31 的产物），两边形状一致，读起来也对得上。

### 接口变更：删除 `summaryEn`

`src/registry.ts` 的 `FlagSpec` 与 `Script` 各自删掉 `summaryEn: string` 字段，`renderFlagLines()` / `renderHelp()` / `renderScriptHelp()` 里所有 `${x.summary} / ${x.summaryEn}` 的拼接与 `用法 / Usage:`、`可用指令 / Available commands:`、`全局参数 / Global options:` 这类双语小标题一并改成纯中文。

本包是 **bin-only**（`package.json` 无 `types` / `exports` 字段，无对外库 API），所以这不构成对使用者的破坏性变更。

`tests/registry.test.ts` 有 2 处 `expect(x.summaryEn).toBeTruthy()` 断言随字段一起删除。

### 文案对照表（执行时的检查清单）

**`src/utils/index.ts`**

| 现有英文 | 中文 |
|:--|:--|
| `Failed to execute '${command}'.` | `执行 '${command}' 失败。` |
| `Cannot find package.json in the current directory.` | `当前目录下找不到 package.json。` |
| `Failed to parse package.json.` | `解析 package.json 失败。` |
| `Failed to write in package.json.` | `写入 package.json 失败。` |

**`src/utils/package-manager.ts`**

| 现有英文 | 中文 |
|:--|:--|
| `Failed to uninstall ${pkg}.` | `卸载 ${pkg} 失败。` |

**`src/scripts/main.ts`**

| 现有英文 | 中文 |
|:--|:--|
| `Please use a script.` | `请指定一个要执行的脚本。` |
| `Unknown option${s}: ${list}. Run \`hubery ${name} --help\` to see what is supported.` | `未知参数：${list}。运行 \`hubery ${name} --help\` 查看支持的参数。` |
| `⚡️ Process Start` | `⚡️ 流程开始` |
| `✨ Process Down in ${t}s` | `✨ 流程结束，耗时 ${t}s` |
| `clear down!` | `清理完成！` |

> 注：`Unknown option` 原本用 `${unknown.length > 1 ? 's' : ''}` 处理英文单复数，中文没有这个语法负担，该三元表达式直接删除。

**`src/scripts/commitlint-init.ts`**

| 现有英文 | 中文 |
|:--|:--|
| `Unknown --linter value "${v}"; falling back to auto-detect.` | `无法识别的 --linter 取值 "${v}"，改用自动探测。` |
| `No linter detected, and no interactive terminal to ask — skipping the lint-staged rule; edit lint-staged.config.mjs yourself.` | `未探测到 linter，当前也不是交互式终端无法询问 —— 已跳过 lint-staged 规则，请自行编辑 lint-staged.config.mjs。` |
| `Prompt cancelled — skipping the lint-staged rule.` | `已取消选择 —— 跳过 lint-staged 规则。` |
| `Setup failed — the files this script had written were rolled back.` | `配置失败 —— 本次写入的文件已全部回滚。` |
| `Found husky v4 config in ${src}, which husky 9 does not read — those hooks are not running.${detail} Migrate them into .husky/ and delete the old config.` | `在 ${src} 发现 husky v4 配置，husky 9 不会读取它 —— 这些钩子实际没有在跑。${detail} 请把它们迁移到 .husky/ 目录后删除旧配置。` |
| ` It defines: ${name} -> ${cmd}.` | ` 其中定义了：${name} -> ${cmd}。` |
| `Kept your commitlint config — ${reason}.` | `已保留你的 commitlint 配置 —— ${reason}。` |
| `Kept your lint-staged config — ${reason}.` | `已保留你的 lint-staged 配置 —— ${reason}。` |
| `${hook} already exists — appended our command to your version.` | `${hook} 已存在 —— 已把我们的命令追加到你的内容之后。` |
| `${hook} already runs our command, left as is.` | `${hook} 已经在跑我们的命令，保持原样。` |
| `${existing} already exists`（reason 片段） | `${existing} 已存在` |
| `the package.json "commitlint" field` | `package.json 的 "commitlint" 字段` |
| `the package.json "lint-staged" field` | `package.json 的 "lint-staged" 字段` |
| `the package.json "husky" field` | `package.json 的 "husky" 字段` |

**spinner（`src/scripts/commitlint-init.ts`，14 条）**

| 现有英文 | 中文 |
|:--|:--|
| `git init checking...` | `检查 git 仓库...` |
| `git init down!` | `git 仓库就绪！` |
| `install running` | `安装依赖...` |
| `install succeed!` | `依赖安装完成！` |
| `commitlint config running...` | `生成 commitlint 配置...` |
| `commitlint config succeed!` | `commitlint 配置完成！` |
| `lint-staged config running...` | `生成 lint-staged 配置...` |
| `lint-staged config succeed!` | `lint-staged 配置完成！` |
| `husky config running...` | `配置 husky 钩子...` |
| `husky config succeed!` | `husky 钩子配置完成！` |
| `package.json writing...` | `写入 package.json...` |
| `package.json writing succeed!` | `package.json 写入完成！` |
| `lint running` | `格式化生成的文件...` |
| `lint down!` | `格式化完成！` |

**`bin/index.js`**

| 现有英文 | 中文 |
|:--|:--|
| `Caused by: ${...}` | `底层原因：${...}` |

**`src/utils/linter.ts`（写进用户仓库的模板注释）**

| 现有英文 | 中文 |
|:--|:--|
| `// No linter detected, and none selected — replace with your own rule, e.g.:` | `// 未探测到 linter，也没有选择 —— 请替换成你自己的规则，例如：` |

**`src/utils/prompt.ts`**：`message` 与 4 个 `label`、`cancel()` 文案全部去掉英文半句。

**`src/registry.ts`**：3 组 `summary`（1 个命令 + 2 个命令级 flag）保留中文原值，3 个 `GLOBAL_FLAGS` 的 `summary` 同理；所有 `summaryEn` 删除；help 模板里的双语小标题改纯中文。

**`src/constants/index.ts`**：`CONFIG_COMMITLINT_CZGIT` 的 10 条 `messages`、11 条 `types[].name`、1 条 `issuePrefixes[].name` 去掉英文半句；`alias: { fd: 'docs: fix typos' }` 保持不变（那是 commit message 内容本身，不是提示文案）。

## 测试策略

### E2E 消息表：改字面量，绝不 import 源码

`tests/e2e/helpers/constants.ts` 头部的注释写得很明白：

> These deliberately do NOT import from `src/` — an E2E suite that derives its expectations from the implementation drifts along with it and stops being an acceptance test.

这是 HB-31 的产物。中文化时把 `MESSAGES` / `MESSAGE_FOR` / `PKG_FIELD` 的**值逐条改写成中文字面量**，那段注释本身翻译成中文保留。

**绝对禁止**改成 `import { MSG } from '@/constants/messages'`——那样文案写错时 E2E 照样全绿，HB-31 的整轮审计等于白做。这是本次改动最容易图省事踩进去的坑。

### 单测断言

`tests/commitlint-init.test.ts`、`tests/main.test.ts`、`tests/utils.test.ts` 里绑定英文文案的断言（如 `expect.stringContaining('already exists')`、`rejects.toThrow('Please use a script.')`）同步改中文，并**保持 HB-31 的收窄标准**：断言完整句子而非片段。

`tests/registry.test.ts` 删除 2 处 `summaryEn` 断言。

与语言无关的断言（`toBe('commitlint --edit')`、`toBe('npx --no -- husky init')`、lint-staged 命令串等）**不动**——它们断言的是命令，不是文案。

### 注释中文化的保真要求

`src/` 的 277 行注释里有大量「为什么这么写」的踩坑记录（husky 9 会无条件覆盖 pre-commit、`hasDependency` 为何必须双重检查、mri 会静默吞未知 flag、npm 的 `--no` 为何存在……）。这些是本仓库最有价值的部分，**逐条保真翻译，不做删减、不做概括**。翻译后信息量少于原文的，视为改坏了。

## 验证方式

1. `pnpm typecheck` —— 删除 `summaryEn` 后类型必须干净
2. `pnpm lint` —— @antfu/eslint-config 通过
3. `pnpm test` —— 单测 227 条全绿
4. `pnpm test:e2e` —— E2E 57 条全绿
5. **`pnpm preview` 真实跑一遍**，肉眼核对终端输出确实全中文、无残留英文句子（级别标签除外），并把输出贴进汇报

第 5 条不可省：前四条只能证明「测试和实现一致」，证明不了「输出对人类读起来是对的」。

## 收尾同步

- **项目 CLAUDE.md**：「Conventions」一节改为「代码注释：中文；commit message：英文（保持不变）」，并写明这是阶段性决定及其原因，避免下个会话按旧约定写回英文
- **ROADMAP.md**：新增 HB-33 到 v1.4.0 首条并标 🚧 → 完成后标 ✅、时间轴补一行；gitee 推广作为 HB-34 追加进候选池

## 实现前需核实

- `src/constants/index.ts` 的 czgit 模板是**字符串字面量**，里面的引号与 `\\n` 转义在改中文时容易破。改完必须用 `pnpm preview` 生成一份真实配置文件，确认它是合法 JS 且 `git cz` 能跑起来
- `tests/constants.test.ts` 有针对模板内容的断言，czgit 模板改动后需核对该文件的期望值
- 删除 `summaryEn` 会影响 `renderFlagLines()` 里的 `padEnd(38)` 对齐宽度——纯中文后描述变短，需实际跑一次 `hubery --help` 看对齐效果，必要时调整这个数字
