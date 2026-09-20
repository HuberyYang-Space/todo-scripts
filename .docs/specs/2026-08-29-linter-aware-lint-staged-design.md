# lint-staged 感知项目实际 linter 设计文档

**日期**：2026-08-29
**状态**：待评审

## 背景与动机

`commitlint-init` 生成的 `lint-staged.config.mjs` 目前是写死的：

```js
export default {
  '*': 'eslint --fix',
}
```

这条规则不管目标项目实际用的是什么工具都会原样写入。用 Biome/Oxlint 的项目、或者压根没装任何 linter 的项目，拿到的都是一个要么摆设、要么直接执行失败的 pre-commit 钩子。现有的 `hasDependency('eslint')` 检查（`src/scripts/commitlint-init.ts`）只用来决定要不要对刚生成的文件跑一次收尾的 `eslint --fix`，并不影响 `lint-staged.config.mjs` 本身写了什么。

**历史包袱**：2026-08-15（`275b00a`）曾把规则改成按扩展名分组的 `'*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'`，为了绕开 ESLint 9 flat config 的已知崩溃（lint-staged/lint-staged#1409——收到不匹配任何已配置扩展名的文件时会抛 "No files matching the pattern were found"）。2026-08-28（`da83b18`）又改回了 `'*'`，原因是按扩展名列举永远列不全所有框架的文件类型（`.vue`、`.svelte`、`.astro`……），按扩展名分组会让这些文件被悄悄跳过、完全不做检查。

这次设计要一次性解决两件事：① 让生成的规则感知项目实际用的 linter；② 用 linter 自带的"不匹配文件不报错"标志代替按扩展名分组，同时保留宽通配符覆盖率，了结上面这段反复。

## 目标 / 非目标

**目标：**
- 自动探测目标项目已安装的 linter（ESLint / Biome / Oxlint），据此生成对应的 lint-staged 规则和收尾修复命令
- 探测不到任何已知 linter 时，提供一次性的交互式选择（含"跳过，自己配置"选项）
- 非交互环境（CI、管道输入等）下绝不卡住，安全降级为"跳过 + 警告"
- 提供 `--linter=<eslint|biome|oxlint|none>` 显式覆盖入口，绕开探测/交互

**非目标（本轮明确不做）：**
- pre-push 阶段跑 `tsc --noEmit` 的钩子——用户已确认推迟，作为独立功能之后再做，本设计不写任何桩代码
- 不做"多选工具""每次都问一遍"这类更复杂的交互设计
- 不修改包管理器探测、monorepo 探测等既有逻辑

## 架构与组件

### 新增：`src/utils/linter.ts`

沿用 `src/utils/package-manager.ts` 的 `SPECS` 表模式——本仓库上一轮架构改进（C2）已确立"N 种可互换工具实现的差异应收进一张表"，而不是散落成 if/else 分支。

职责：
- `LINTER_SPECS`：一张按 `LinterKind`（`'eslint' | 'biome' | 'oxlint'`）索引的规格表，每项含探测用的包名、bin 名、修复标志、"不匹配不报错"标志
- `detectLinter()`：按优先级探测已安装的 linter，纯函数（只读 fs，无副作用，和 `isTsProject`/`isMonorepo` 同一契约）
- `isLinterInstalled(kind)` / `isLinterKind(value)`：辅助判定
- `getLintStagedCommand(kind)` / `getFixCommand(kind, targets)` / `renderLintStagedConfig(choice)`：把规格表渲染成实际命令/配置文件内容

`CONFIG_LINT_STAGED`（目前在 `src/constants/index.ts`）随之删除、迁移进本模块——因为它现在依赖 `LINTER_SPECS`，继续留在 `constants` 会让"`utils` 单向 import `constants`"的现有依赖方向反过来。

> **实现前需核实**：ESLint 的 `--no-error-on-unmatched-pattern` 已确认是当前版本的真实标志；Biome 的 `--no-errors-on-unmatched`、Oxlint 是否支持按路径修复及其参数顺序，写计划/写代码时要对照各自当前文档核实一遍，不要直接照抄本文档里的写法。

### 新增：`src/utils/prompt.ts`

唯一引入新依赖 **`@clack/prompts`**（选最新稳定版）的地方，隔离方式与 `execCommand` 把 `execa` 整个包起来同一思路——测试时整体 mock 这个模块即可，不用戳 `@clack/prompts` 内部。

职责：`promptLinterChoice()`——弹出单选（ESLint / Biome / Oxlint / 跳过），处理用户取消（`Ctrl+C`）的情况，返回 `LinterKind | 'none' | undefined`（`undefined` 表示被取消）。

### 修改：`src/utils/index.ts`

- `ArgvOptions` 新增 `linter?: string`（原始字符串，运行时经 `isLinterKind` 校验，和脚本名靠 `findScript` 运行时校验、不做字面量联合类型是同一模式）
- 新增 `isInteractive()`：`Boolean(process.stdin.isTTY) && !process.env.CI`，与 `resolveBannerMode` 里判断 TTY+颜色支持同一思路

### 修改：`src/scripts/commitlint-init.ts`

- 新增 `resolveLinterChoice(options)`：串联"flag 覆盖 → 自动探测 → 交互提示 → 非交互兜底"，是本次改动里唯一有副作用（提示交互、`printWarn`）的新增函数，必须在调用 `planSetup()` 之前把 linter 选择解出来
- `planSetup` 的 `env` 参数新增必填字段 `linter: LinterKind | 'none'`，喂给 `renderLintStagedConfig`
- 收尾修复步骤从硬编码 `hasDependency('eslint') → eslint --fix` 改成走 `linterChoice` + `isLinterInstalled` 双重确认（`--linter=biome` 但项目其实没装 biome 时不会真的执行）

### 修改：`src/scripts/main.ts` / `src/registry.ts`

- `mri()` 调用加 `string: ['linter']`，避免 `--linter=xxx` 被当布尔值强转
- 帮助文本加一行双语 `--linter=<eslint|biome|oxlint|none>` 说明

## 探测优先级与理由

优先级：`eslint > biome > oxlint`。

- ESLint 最可能是项目里"真正在用"的存量配置
- Biome 是 ESLint 的完整替代品，两者很少有意义地共存（共存多半是迁移中间态，此时旧的 eslint 配置通常仍是权威来源）
- Oxlint 常作为 ESLint 之外的快速补充检查一起跑，而不是替代品，所以 ESLint 仍应优先

这是启发式规则，不是绝对正确；`--linter` flag 就是留给使用者纠正的逃生舱。

## 交互提示与非交互安全

```
resolveLinterChoice(options):
  若 --linter=none            → 'none'
  若 --linter=<合法值>        → 该值
  若 --linter=<非法值>        → printWarn 提示未知值，继续走下面的自动探测
  detectLinter() 命中          → 该值
  否则，非交互环境（isInteractive() = false）
                              → printWarn 提示跳过 + 生成占位注释，返回 'none'
  否则（交互环境），弹出 promptLinterChoice()
      用户选择                 → 该值
      用户取消（Ctrl+C）        → printWarn 提示已取消，返回 'none'
```

`'none'` 时生成的 `lint-staged.config.mjs` 只含一行注释示例，不含任何生效规则，避免在没有对应 linter 时留下一条必然失败的命令。

## 错误处理

- `resolveLinterChoice` 内部不抛错，所有分支最终都能落到一个合法的 `LinterKind | 'none'`，异常路径（未知 flag、无 TTY、用户取消）统一走 `printWarn` + 安全默认值，不中断 `init()` 的后续步骤
- 收尾修复步骤沿用现有 `allowFailure: true` 语义——修复失败不影响初始化结果本身

## 测试策略

- 新增 `tests/linter.test.ts`：纯函数测试，覆盖探测优先级、`renderLintStagedConfig`/`getFixCommand` 各分支
- 新增 `tests/prompt.test.ts`：mock `@clack/prompts`，覆盖选择/取消两条路径
- `tests/commitlint-init-plan.test.ts`：所有 `planSetup` 调用点补 `env.linter`；新增 eslint/biome/oxlint/none 四种内容用例
- `tests/commitlint-init.test.ts`：整体 mock `@/utils/linter`、`@/utils/prompt`；新增 `--linter` 覆盖、探测到但未安装、交互/非交互兜底、取消提示等用例
- `tests/utils.test.ts`：`isInteractive()` 的 TTY/CI 组合用例
- `tests/registry.test.ts` / `tests/main.test.ts`：帮助文本、`mri` 字符串解析的回归用例

## 备选方案与取舍

| 决策点 | 选定方案 | 备选 | 为什么不选备选 |
|---|---|---|---|
| 探测/生成逻辑位置 | 新建 `src/utils/linter.ts` | 塞进 `src/utils/index.ts` | `index.ts` 已有十几个导出，继续堆会重蹈"一个文件全塞"；且这是"N 种工具差异"的表驱动问题，与 `package-manager.ts` 同构 |
| 交互提示库 | `@clack/prompts` | `prompts`、`enquirer` | `@clack/prompts` 是当前 pnpm/astro/drizzle 一类现代 CLI 的事实标准，API 精简，维护活跃 |
| lint-staged 通配符策略 | 宽 `'*'` + `--no-error-on-unmatched-pattern` | 按扩展名分组 | 按扩展名列举永远列不全所有框架文件类型（已被 8/28 那次 revert 验证过） |
| 无 linter 时的行为 | 探测不到才交互，交互不到才兜底跳过 | 每次都强制交互 / 静默猜测装某个 linter | 用户已确认"自动探测为主，交互为兜底"；静默猜测风险是生成一条实际不存在的命令 |

## 待办 / 后续

- **pre-push 钩子跑 `tsc --noEmit`**：本轮明确推迟，作为独立功能后续再做（不在本次任何文件里留桩代码）
