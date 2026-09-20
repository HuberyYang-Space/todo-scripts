# commitlint-init 默认值与行为修复设计

## 背景

对 `commitlint-init` 子命令做了一轮调研（参考业界标准：commitlint / husky v9 / lint-staged / cz-git 官方文档），发现当前生成的默认配置存在若干与官方推荐不符、或已知会在真实项目中触发失败的问题。本设计文档记录本轮要修复的范围、方案，以及明确排除的范围，供后续 `writing-plans` 生成可执行的实施计划。

调研报告全文见对话历史（已核对 husky 官方文档 typicode.github.io/husky、commitlint.js.org、lint-staged GitHub README、[lint-staged#1409](https://github.com/lint-staged/lint-staged/issues/1409)、cz-git 配置文档，2026-08 时间点）。

## 范围

本轮**只修复代码行为**，不涉及：
- bun/deno 真实环境验证
- 新增 yarn/bun/deno 端到端集成测试、monorepo 端到端集成测试、ESLint flat config 专项测试（测试覆盖缺口留到下一轮单独处理）
- 任何发版动作（版本号、CHANGELOG、`npm publish`/`pnpm release`）——发版另开会话/计划

本轮**需要同步**：为保持现有测试与新行为一致，`tests/commitlint-init-plan.test.ts`、`tests/commitlint-init.test.ts` 中断言了旧默认值的用例要跟着更新（这是维持现有测试有效，不是新增覆盖）。

## 修复项

### 1. lint-staged 默认规则改为按扩展名分组

**位置**：`src/constants/index.ts` 的 `CONFIG_LINT_STAGED`

**现状**：
```js
export default {
  '*': 'eslint --fix',
}
```

**问题**：lint-staged 官方推荐按扩展名区分 glob，裸 `'*'` 在 ESLint 9 flat config 下有已记录的 `No files matching the pattern was found` 报错（[lint-staged#1409](https://github.com/lint-staged/lint-staged/issues/1409)）。提交任何非 JS/TS 文件（README、yaml、图片等）都可能被 pre-commit 钩子拦下。

**修复**：
```js
export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
}
```
只覆盖标准 JS/TS 扩展名，不纳入 `.vue`/`.md` 等——工具本身不假设目标项目用什么框架，避免重新引入"猜测项目结构"的问题。

### 2. npm 场景的 npx 调用统一加 `--no --`

**位置**：`src/utils/package-manager.ts` 的 `SPECS.npm.exec`

**现状**：
```ts
const npmSpec = {
  add: 'install',
  devFlag: '--save-dev',
  remove: 'uninstall',
  exec: (command: string) => `npx ${command}`,
}
```

**问题**：commitlint 官方文档给出的标准 commit-msg 钩子是 `npx --no -- commitlint --edit $1`，当前生成的是 `npx commitlint --edit "$1"`（引号处理优于官方样板，保留）。缺少 `--no` 意味着 npx 在本地找不到命令时会尝试联网安装，行为不可控。

**修复**：`SPECS.npm.exec` 统一改为 `command => \`npx --no -- ${command}\``。这会同时影响 `.husky/commit-msg`（`commitlint --edit "$1"`）、`husky init`、`eslint --fix`（lint 收尾步骤）三处调用——三处调用发生时对应的包（commitlint/husky/eslint）都已经被 `ensureInstalled`/`hasDependency` 确认本地存在，`--no` 不会改变正常路径的行为，只是禁止 npx 兜底联网安装，让所有 npx 调用行为一致、更安全。

pnpm（`pnpm exec`）、yarn（`yarn`）、bun（`bunx`）、deno（`deno run -A npm:`）不做改动——它们的"命令未找到"处理机制与 npx 不同，不适用同一套 `--no --` 语义。

### 3. type-enum 统一 + issuePrefixes 中性化

**位置**：`src/constants/index.ts` 的 `CONFIG_COMMITLINT` / `CONFIG_COMMITLINT_CZGIT`

**现状**：两份 `type-enum` 顺序和成员不一致——非 czgit 版按字母序排列且多出 `merge`、`update`（不属于 Conventional Commits/Angular 规范的标准类型）；czgit 版是标准 11 类型。`CONFIG_COMMITLINT_CZGIT` 的 `issuePrefixes` 硬编码 Gitee 场景的 `link`/`closed`。

**修复**：
- 抽出一个共享的类型列表常量（标准 11 类型：feat/fix/docs/style/refactor/perf/test/build/ci/revert/chore），两份配置模板都从这个常量派生 `type-enum`，避免以后再次跑偏。
- `issuePrefixes` 改为中性/GitHub 风格：`[{ value: 'closes', name: 'closes:   关闭/解决一个 issue' }]`，并保留一行注释提示 Gitee 用户可自行替换为 `link`/`closed`。

### 4. README 同步

**位置**：`README.md`

- 目录结构图补上 `lint-staged.config.mjs`，去掉"lint-staged 写进 package.json 内联字段"的过时描述。
- "如需更改钩子命令，请修改 package.json 中 lint-staged 配置"的 NOTE 提示改成指向 `lint-staged.config.mjs`。
- "若项目中已存在 ESLint 配置文件"的表述改成准确描述：判断依据是 `hasDependency('eslint')`（`node_modules` + `package.json` 声明双重校验），不检测配置文件本身。

## 不改动的部分（供实施时参考，避免误改）

- `snapshotExistingHooks()`、`hasDependency()` 双重校验、包管理器不 pin 版本、npm/bun/deno 在 monorepo 场景不追加 rootFlag——这些在调研中确认符合行业实践，不动。
- pnpm/yarn/bun/deno 的 `exec` 实现不做本轮改动（`--no --` 只影响 npm）。

## 验收方式

`pnpm typecheck` + `pnpm lint` + `pnpm test`（含同步更新后的测试用例）+ `pnpm build` 全部通过。这是验证改动正确性，不是发版准备。
