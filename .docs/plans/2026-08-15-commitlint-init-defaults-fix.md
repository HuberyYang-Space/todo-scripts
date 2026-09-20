# commitlint-init 默认值与行为修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `commitlint-init` 生成的默认配置中，与 commitlint / husky v9 / lint-staged / cz-git 官方推荐不符、或已知会在真实项目中触发失败的行为，并同步过时的 README 描述。

**Architecture:** 所有改动集中在三处纯数据/纯函数层面（`src/constants/index.ts` 的配置模板字符串、`src/utils/package-manager.ts` 的 `SPECS.npm.exec`）以及两份 README 文档，不改变 `commitlint-init.ts` 的整体流程（规划/副作用分离、`snapshotExistingHooks` 保护逻辑保持不变）。每处改动都有对应的现有测试同步更新或新增断言锁定新行为。

**Tech Stack:** TypeScript, Vitest, pnpm, ESLint（antfu config）

**Spec:** [`2026-08-15-commitlint-init-defaults-fix-design.md`](../specs/2026-08-15-commitlint-init-defaults-fix-design.md)

## Global Constraints

- 本轮**只修复代码行为**，不做：bun/deno 真实环境验证、新增 yarn/bun/deno/monorepo/ESLint-flat-config 端到端测试、任何发版动作（版本号/CHANGELOG/`npm publish`/`pnpm release`）。
- `snapshotExistingHooks()`、`hasDependency()` 双重校验、包管理器不 pin 版本、npm/bun/deno 在 monorepo 场景不追加 rootFlag——这些已确认符合行业实践，**不要改动**。
- pnpm/yarn/bun/deno 的 `exec` 实现本轮**不做改动**，`--no --` 只影响 npm 一家。
- 每个任务改完必须跑对应测试文件确认通过，再进入下一个任务；不要跨任务合并提交。
- 提交语言用英文，遵循 Conventional Commits（仓库近期提交历史是英文）；提交者只有用户自己，**commit message 里不要加协作者信息**。

---

### Task 1: lint-staged 默认规则改为按扩展名分组

**Files:**
- Modify: `src/constants/index.ts:106-110`（`CONFIG_LINT_STAGED`）
- Modify: `tests/commitlint-init-plan.test.ts:62-66`

**Interfaces:**
- Consumes: 无（纯字符串常量，本任务是叶子改动）
- Produces: `CONFIG_LINT_STAGED` 导出内容变化，供 `src/scripts/commitlint-init.ts` 的 `planSetup()`（消费方，`CONFIG_LINT_STAGED` 被赋给 `lintStagedConfigFile.content`）后续任务/测试引用，格式不变（字符串导出）

- [ ] **Step 1: 改测试，锁定新的默认规则**

打开 `tests/commitlint-init-plan.test.ts`，把现有这个测试：

```ts
it('lint-staged 配置文件内容应该等价于默认规则', () => {
  const { content } = planSetup({}, { isTsProject: true, pm }).lintStagedConfigFile
  expect(content).toContain('export default')
  expect(content).toContain('eslint --fix')
})
```

替换为：

```ts
it('lint-staged 配置文件内容应该按扩展名分组，而不是匹配所有文件', () => {
  const { content } = planSetup({}, { isTsProject: true, pm }).lintStagedConfigFile
  expect(content).toContain('export default')
  expect(content).toContain(`'*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix'`)
  expect(content).not.toMatch(/'\*':\s*'eslint --fix'/)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/commitlint-init-plan.test.ts`
Expected: FAIL —— 新断言（`toContain` 的扩展名分组字符串、`not.toMatch` 裸 `'*'`）与当前 `CONFIG_LINT_STAGED` 的实际内容不符

- [ ] **Step 3: 修改 `CONFIG_LINT_STAGED`**

在 `src/constants/index.ts` 里，把：

```ts
export const CONFIG_LINT_STAGED
  = `export default {
  '*': 'eslint --fix',
}
`
```

改成：

```ts
export const CONFIG_LINT_STAGED
  = `export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
}
`
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/commitlint-init-plan.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/constants/index.ts tests/commitlint-init-plan.test.ts
git commit -m "fix: scope default lint-staged rule to js/ts extensions"
```

---

### Task 2: npm 场景的 npx 调用统一加 `--no --`

**Files:**
- Modify: `src/utils/package-manager.ts:47-53`（`SPECS.npm.exec`）
- Modify: `tests/package-manager.test.ts:174`、`tests/package-manager.test.ts:202`

**Interfaces:**
- Consumes: 无（`SPECS` 表内部实现细节）
- Produces: `createPackageManager()` 返回的 `PackageManager.exec` / `PackageManager.formatExec` 在 npm 场景下的渲染结果变化（`npx --no -- <command>` 而非 `npx <command>`），供 `src/scripts/commitlint-init.ts` 的 `planSetup()` 生成的 husky 钩子内容、`init()` 里的 `husky init`/`eslint --fix` 调用消费——这些调用点本身不用改，因为它们只是转调 `pm.formatExec`/`pm.exec`

- [ ] **Step 1: 改测试，锁定新的 npm exec 渲染结果**

打开 `tests/package-manager.test.ts`，在 `describe('exec / formatExec', ...)` 的 `it.each` 数组里，把：

```ts
    ['npm/10.2.0 node/v20.10.0', 'npx husky init'],
```

改成：

```ts
    ['npm/10.2.0 node/v20.10.0', 'npx --no -- husky init'],
```

再把同一个 `describe` 块里的这个测试：

```ts
it('认不出的包管理器拼出的命令不应该缺少空格', async () => {
  // 旧实现的 default 分支返回的是 'npx'（少一个结尾空格），会拼成 npxhusky
  const pm = usePkgManager('cnpm/1.0.0 node/v20.10.0')
  expect(pm.formatExec('husky init')).toBe('npx husky init')
})
```

改成：

```ts
it('认不出的包管理器拼出的命令不应该缺少空格', async () => {
  // 旧实现的 default 分支返回的是 'npx'（少一个结尾空格），会拼成 npxhusky
  const pm = usePkgManager('cnpm/1.0.0 node/v20.10.0')
  expect(pm.formatExec('husky init')).toBe('npx --no -- husky init')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/package-manager.test.ts`
Expected: FAIL —— 这两处断言期望 `npx --no -- husky init`，当前实现仍然产出 `npx husky init`

- [ ] **Step 3: 修改 `SPECS.npm.exec`**

在 `src/utils/package-manager.ts` 里，把：

```ts
  npm: {
    add: 'install',
    devFlag: '--save-dev',
    remove: 'uninstall',
    exec: command => `npx ${command}`,
  },
```

改成：

```ts
  npm: {
    add: 'install',
    devFlag: '--save-dev',
    remove: 'uninstall',
    // --no 阻止 npx 在本地找不到命令时联网安装；调用发生时对应的包
    // （husky/eslint/commitlint）都已经被 ensureInstalled/hasDependency 确认本地存在，
    // 不会改变正常路径的行为，只是让 npx 调用不再有兜底联网安装的不确定性
    exec: command => `npx --no -- ${command}`,
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/package-manager.test.ts`
Expected: PASS（全部用例，包括 `ensureInstalled`/`uninstall` 相关不受影响的用例）

也顺手跑一下 `commitlint-init.test.ts` 确认没有被间接影响（它 mock 死了 `formatExec` 为 `pnpm exec`，理论上不受影响）：

Run: `pnpm vitest run tests/commitlint-init.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/package-manager.ts tests/package-manager.test.ts
git commit -m "fix: pass --no -- to npx invocations to match commitlint's official hook"
```

---

### Task 3: type-enum 统一 + issuePrefixes 中性化

**Files:**
- Modify: `src/constants/index.ts:1-104`（`CONFIG_COMMITLINT` / `CONFIG_COMMITLINT_CZGIT`）
- Modify: `tests/constants.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `CONFIG_COMMITLINT` 和 `CONFIG_COMMITLINT_CZGIT` 的 `type-enum` 数组内容变为完全一致的标准 11 类型（feat/fix/docs/style/refactor/perf/test/build/ci/revert/chore，不含 `merge`/`update`）；`CONFIG_COMMITLINT_CZGIT` 的 `issuePrefixes` 不再包含 Gitee 专属的 `link`/`closed`

- [ ] **Step 1: 改测试，锁定新的 type-enum 一致性和 issuePrefixes 内容**

打开 `tests/constants.test.ts`，在文件末尾（`config_COMMITLINT_CZGIT` describe 块之后）追加：

```ts
describe('CONFIG_COMMITLINT 与 CONFIG_COMMITLINT_CZGIT 的 type-enum 应该一致', () => {
  function extractTypes(config: string): string[] {
    const match = config.match(/'type-enum': \[2, 'always', \[([\s\S]*?)\]\]/)
    const body = match?.[1] ?? ''
    return [...body.matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort()
  }

  it('两份配置的 type-enum 类型集合应该完全相同', () => {
    expect(extractTypes(CONFIG_COMMITLINT)).toEqual(extractTypes(CONFIG_COMMITLINT_CZGIT))
  })

  it('不应该包含非标准的 merge/update 类型', () => {
    expect(CONFIG_COMMITLINT).not.toContain(`'merge'`)
    expect(CONFIG_COMMITLINT).not.toContain(`'update'`)
  })
})

describe('CONFIG_COMMITLINT_CZGIT 的 issuePrefixes', () => {
  it('默认值应该是中性的 GitHub 风格，不再硬编码 Gitee', () => {
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain('link:')
    expect(CONFIG_COMMITLINT_CZGIT).not.toContain('closed:')
    expect(CONFIG_COMMITLINT_CZGIT).toContain(`{ value: 'closes'`)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/constants.test.ts`
Expected: FAIL —— 当前 `CONFIG_COMMITLINT` 含 `merge`/`update`，两份 type-enum 类型集合不一致；`CONFIG_COMMITLINT_CZGIT` 仍含 `link:`/`closed:`

- [ ] **Step 3a: 统一 type-enum —— 抽出共享类型列表并重写 `CONFIG_COMMITLINT`**

在 `src/constants/index.ts` 里，把整个 `CONFIG_COMMITLINT` 声明（从 `export const CONFIG_COMMITLINT` 到它结尾的反引号）：

```ts
export const CONFIG_COMMITLINT
  = `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'build',
      'ci',
      'docs',
      'feat',
      'merge',
      'fix',
      'perf',
      'refactor',
      'style',
      'test',
      'revert',
      'update',
      'chore',
    ]],
  },
}`
```

替换为（在它前面新增共享常量和渲染函数，同时重写数组部分）：

```ts
/** 两份 commitlint 配置模板共用的标准 Conventional Commits 类型列表 */
const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'revert',
  'chore',
]

/** 渲染成 type-enum 规则里的数组项文本，两份配置模板共用同一份类型列表 */
function renderTypeEnum(): string {
  return COMMIT_TYPES.map(type => `      '${type}',`).join('\n')
}

export const CONFIG_COMMITLINT
  = `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
${renderTypeEnum()}
    ]],
  },
}`
```

- [ ] **Step 3b: `CONFIG_COMMITLINT_CZGIT` 复用同一份类型列表**

在同一个文件里，把 `CONFIG_COMMITLINT_CZGIT` 内部的 type-enum 数组：

```ts
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'build',
      'ci',
      'revert',
      'chore',
    ]],
```

替换为：

```ts
    'type-enum': [2, 'always', [
${renderTypeEnum()}
    ]],
```

- [ ] **Step 3c: issuePrefixes 改为中性 GitHub 风格**

在同一个文件里，把：

```ts
    issuePrefixes: [
      // 如果使用 gitee 作为开发管理
      { value: 'link', name: 'link:     链接 ISSUES 进行中' },
      { value: 'closed', name: 'closed:   标记 ISSUES 已完成' },
    ],
```

替换为：

```ts
    issuePrefixes: [
      // 默认使用 GitHub 风格；如果使用 Gitee 作为开发管理，可自行替换为 link/closed 前缀
      { value: 'closes', name: 'closes:   关闭/解决一个 issue' },
    ],
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/constants.test.ts`
Expected: PASS（全部用例，包括本任务新增的和原有的）

再跑一遍全量测试，确认没有间接破坏其他文件（`commitlint-init-plan.test.ts` 里 `--czgit 时配置文件内容应该带 prompt 交互配置`等用例依赖 `CONFIG_COMMITLINT_CZGIT` 仍包含 `prompt`/`cz-git` 字样，本任务没有动这部分内容，理应仍然通过）：

Run: `pnpm test`
Expected: PASS（全部测试文件）

- [ ] **Step 5: Commit**

```bash
git add src/constants/index.ts tests/constants.test.ts
git commit -m "fix: unify commitlint type-enum and neutralize default issue prefixes"
```

---

### Task 4: README 同步（中英文两份）

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

**Interfaces:**
- Consumes: Task 1 的最终 `CONFIG_LINT_STAGED` 内容（文档里要展示的示例要与代码一致）
- Produces: 无（纯文档，无下游任务消费）

- [ ] **Step 1: 更新 `README.md` 的目录结构图和相关描述**

在 `README.md` 里，把「执行后生成的内容」这一段：

```
```
your-project/
├── .husky/
│   ├── pre-commit        # 每次 commit 前自动运行 lint-staged
│   └── commit-msg        # 自动校验 commit message 格式
├── commitlint.config.ts  # commitlint 配置（JS 项目则为 .js）
└── package.json          # 自动写入 lint-staged 配置和 commitlint 脚本
```
```

改成：

```
```
your-project/
├── .husky/
│   ├── pre-commit          # 每次 commit 前自动运行 lint-staged
│   └── commit-msg          # 自动校验 commit message 格式
├── commitlint.config.ts    # commitlint 配置（JS 项目则为 .js）
├── lint-staged.config.mjs  # lint-staged 规则（固定 .mjs，不受项目 type 字段影响）
└── package.json            # 自动写入 commitlint 脚本
```
```

紧接着，把 `package.json` 新增内容那一段：

````
`package.json` 中新增的内容：

```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  },
  "lint-staged": {
    "*": "eslint . --fix"
  }
}
```
````

改成：

````
`package.json` 中新增的内容：

```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  }
}
```

`lint-staged.config.mjs` 的默认内容：

```js
export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
}
```
````

- [ ] **Step 2: 更新 `README.md` 里过时的 NOTE 提示和 ESLint 检测描述**

把：

```
> [!NOTE]
> eslint 会在每次执行 commit 前自动执行，如需更改 commit 钩子执行前的命令，可自行修改 **package.json** 中 **lint-staged** 配置
```

改成：

```
> [!NOTE]
> eslint 会在每次执行 commit 前自动执行，如需更改 commit 钩子执行前的命令，可自行修改 **lint-staged.config.mjs**
```

把：

```
**🔍 自动集成 ESLint**
若项目中已存在 ESLint 配置文件，脚本在生成 `commitlint.config.*` 后会自动对其执行 lint fix，确保生成的配置文件符合项目代码风格，直接提交即可
```

改成：

```
**🔍 自动集成 ESLint**
若项目已安装 ESLint（`node_modules` 存在且 `package.json` 中声明了依赖），脚本在生成配置文件后会自动对其执行 lint fix，确保生成的配置文件符合项目代码风格，直接提交即可
```

- [ ] **Step 3: 对 `README.en.md` 做同样的三处同步**

把「Generated Files」段落：

```
```
your-project/
├── .husky/
│   ├── pre-commit        # Runs lint-staged before every commit
│   └── commit-msg        # Validates commit message format
├── commitlint.config.ts  # commitlint config (or .js for JS projects)
└── package.json          # lint-staged config and commitlint script added
```
```

改成：

```
```
your-project/
├── .husky/
│   ├── pre-commit          # Runs lint-staged before every commit
│   └── commit-msg          # Validates commit message format
├── commitlint.config.ts    # commitlint config (or .js for JS projects)
├── lint-staged.config.mjs  # lint-staged rules (always .mjs, unaffected by the project's type field)
└── package.json            # commitlint script added
```
```

把 `package.json` 新增内容段落：

````
```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  },
  "lint-staged": {
    "*": "eslint . --fix"
  }
}
```
````

改成：

````
```json
{
  "scripts": {
    "commitlint": "commitlint --edit"
  }
}
```

Default content of `lint-staged.config.mjs`:

```js
export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
}
```
````

把：

```
> [!NOTE]
> ESLint runs automatically before every commit. To change the pre-commit hook command, update the **lint-staged** config in **package.json**.
```

改成：

```
> [!NOTE]
> ESLint runs automatically before every commit. To change the pre-commit hook command, edit **lint-staged.config.mjs**.
```

把：

```
**🔍 Auto-integrate ESLint**
If an ESLint config file exists in the project, the script runs lint fix on the generated `commitlint.config.*` to ensure it matches the project's code style — ready to commit immediately.
```

改成：

```
**🔍 Auto-integrate ESLint**
If ESLint is installed in the project (present in `node_modules` and declared in `package.json`), the script runs lint fix on the generated config files to ensure they match the project's code style — ready to commit immediately.
```

- [ ] **Step 4: 校对**

Run: `pnpm exec eslint README.md README.en.md`
Expected: 无报错（这两个文件里的代码围栏都是 `json`/`js`/纯文本目录树，不会被当成待解析的顶层 JS/TS 程序）

通读改动后的两个文件，确认中英文内容对应一致、没有遗漏旧描述（可用 `git diff README.md README.en.md` 检查）。

- [ ] **Step 5: Commit**

```bash
git add README.md README.en.md
git commit -m "docs: sync README with lint-staged.config.mjs and hasDependency behavior"
```

---

### Task 5: 全量验收

**Files:** 无改动，仅验证

**Interfaces:** 无

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 无 lint 错误

- [ ] **Step 3: 全量测试**

Run: `pnpm test`
Expected: 所有测试文件通过，包括本计划新增/修改的用例

- [ ] **Step 4: 构建**

Run: `pnpm build`
Expected: 构建成功，`dist/` 产物正常生成

- [ ] **Step 5: 确认无遗留改动**

Run: `git status`
Expected: 工作区干净（除了本计划开始前就存在的、与本计划无关的 `package.json`/`tsdown.config.ts` 改动——如果这两个文件的改动不是本计划引入的，不要 stage 或 commit 它们）

不需要额外 commit——这一步只是确认前四个任务的成果组合起来仍然全绿，为后续"准备发版"的独立计划打好基础（发版本身不在本计划范围内）。
