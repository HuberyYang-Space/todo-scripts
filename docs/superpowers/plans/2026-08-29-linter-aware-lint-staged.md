# lint-staged 感知项目实际 linter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `hubery commitlint-init` 生成的 `lint-staged.config.mjs` 感知目标项目实际安装的 linter（ESLint/Biome/Oxlint），探测不到时提供一次性交互式兜底，而不是永远硬编码 `eslint --fix`。

**Architecture:** 新增两个纯/隔离模块——`src/utils/linter.ts`（探测 + 命令/配置内容生成，表驱动，仿照 `package-manager.ts` 的 `SPECS` 模式）和 `src/utils/prompt.ts`（唯一引入 `@clack/prompts` 的地方）。`planSetup()` 保持纯函数，只多一个 `env.linter` 字段；新函数 `resolveLinterChoice()` 承担所有副作用（flag 解析、探测、交互提示、非交互兜底），在 `init()` 里于调用 `planSetup` 之前解出最终值。

**Tech Stack:** TypeScript, Vitest, pnpm, ESLint（antfu config）, `@clack/prompts`

**Spec:** `docs/superpowers/specs/2026-08-29-linter-aware-lint-staged-design.md`

## Global Constraints

- 探测优先级固定为 `eslint > biome > oxlint`（多个同时安装时，eslint 最可能是存量配置，biome 是完整替代品很少与 eslint 有意义共存，oxlint 常作为补充快速检查）
- 只有自动探测不到任何已知 linter 时才弹交互提示；不做"每次都问一遍"或"多选工具"
- lint-staged 规则统一用宽通配符 `'*'` + 对应 linter 的"不匹配不报错"标志（ESLint: `--no-error-on-unmatched-pattern`；Biome: `--no-errors-on-unmatched`；Oxlint: `--no-error-on-unmatched-pattern`），不做按扩展名分组——这几个具体标志名已在设计阶段核实过 ESLint 的一个，Biome/Oxlint 的两个在真正接入某个真实项目验证前仍标记为"高置信但未 100% 实测"，如果实现过程中发现某个标志在目标版本不存在，以该工具当前 `--help`/文档为准调整，不要死守本计划里的字面值
- 本轮明确不做 pre-push `tsc --noEmit` 钩子——不设计、不留桩代码，只记入待办
- 直接面向用户的交互提示文案用双语（中文 / English），日常 spinner 状态文字保持纯英文，与现有 czgit 提示的风格一致
- 提交语言用英文，遵循 Conventional Commits；本项目最近提交历史全是英文，commit message 不加协作者信息
- 每个任务改完必须跑对应测试文件确认通过，再进入下一个任务

---

### Task 1: 新增 `src/utils/linter.ts`（探测 + 内容生成）

**Files:**
- Create: `src/utils/linter.ts`
- Create: `tests/linter.test.ts`

**Interfaces:**
- Consumes：`hasDependency(pkg: string): boolean`（来自 `@/utils`，已存在）
- Produces：`LinterKind`（`'eslint' | 'biome' | 'oxlint'`）、`detectLinter(): LinterKind | undefined`、`isLinterInstalled(kind: LinterKind): boolean`、`isLinterKind(value: string): value is LinterKind`、`getLintStagedCommand(kind: LinterKind): string`、`getFixCommand(kind: LinterKind, targets: string[]): string`、`renderLintStagedConfig(choice: LinterKind | 'none'): string`——Task 4/5 都要 import 这些

- [ ] **Step 1: 写测试文件 `tests/linter.test.ts`（先写完整测试，此时全部会失败）**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasDependencyMock = vi.fn((_pkg: string) => false)

vi.mock('@/utils', () => ({
  hasDependency: hasDependencyMock,
}))

const {
  detectLinter,
  getFixCommand,
  getLintStagedCommand,
  isLinterInstalled,
  isLinterKind,
  renderLintStagedConfig,
} = await import('@/utils/linter')

describe('isLinterKind', () => {
  it('应该认出 eslint/biome/oxlint 这三个合法值', () => {
    expect(isLinterKind('eslint')).toBe(true)
    expect(isLinterKind('biome')).toBe(true)
    expect(isLinterKind('oxlint')).toBe(true)
  })

  it('未知值应该返回 false', () => {
    expect(isLinterKind('prettier')).toBe(false)
  })
})

describe('isLinterInstalled', () => {
  beforeEach(() => {
    hasDependencyMock.mockReset()
  })

  it('eslint 检查的是 eslint 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint')
    expect(isLinterInstalled('eslint')).toBe(true)
    expect(isLinterInstalled('biome')).toBe(false)
  })

  it('biome 检查的是 @biomejs/biome 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === '@biomejs/biome')
    expect(isLinterInstalled('biome')).toBe(true)
    expect(isLinterInstalled('eslint')).toBe(false)
  })

  it('oxlint 检查的是 oxlint 包', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'oxlint')
    expect(isLinterInstalled('oxlint')).toBe(true)
  })
})

describe('detectLinter', () => {
  beforeEach(() => {
    hasDependencyMock.mockReset()
  })

  it('什么都没装时应该返回 undefined', () => {
    hasDependencyMock.mockReturnValue(false)
    expect(detectLinter()).toBeUndefined()
  })

  it('只装了 eslint 时应该返回 eslint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint')
    expect(detectLinter()).toBe('eslint')
  })

  it('只装了 biome 时应该返回 biome', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === '@biomejs/biome')
    expect(detectLinter()).toBe('biome')
  })

  it('只装了 oxlint 时应该返回 oxlint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'oxlint')
    expect(detectLinter()).toBe('oxlint')
  })

  it('eslint 和 biome 同时装了时应该优先 eslint', () => {
    hasDependencyMock.mockImplementation(pkg => pkg === 'eslint' || pkg === '@biomejs/biome')
    expect(detectLinter()).toBe('eslint')
  })
})

describe('getLintStagedCommand', () => {
  it('应该按 linter 拼出对应命令', () => {
    expect(getLintStagedCommand('eslint')).toBe('eslint --fix --no-error-on-unmatched-pattern')
    expect(getLintStagedCommand('biome')).toBe('biome check --write --no-errors-on-unmatched')
    expect(getLintStagedCommand('oxlint')).toBe('oxlint --fix --no-error-on-unmatched-pattern')
  })
})

describe('getFixCommand', () => {
  it('应该把目标文件拼进命令里', () => {
    expect(getFixCommand('eslint', ['package.json', 'commitlint.config.ts'])).toBe(
      'eslint package.json commitlint.config.ts --fix',
    )
  })

  it('biome 的 bin 名带子命令，也应该正确拼接', () => {
    expect(getFixCommand('biome', ['package.json'])).toBe('biome check package.json --write')
  })
})

describe('renderLintStagedConfig', () => {
  it.each([
    ['eslint', `'*': 'eslint --fix --no-error-on-unmatched-pattern'`],
    ['biome', `'*': 'biome check --write --no-errors-on-unmatched'`],
    ['oxlint', `'*': 'oxlint --fix --no-error-on-unmatched-pattern'`],
  ] as const)('探测到 %s 时应该生成对应的 * 规则', (kind, expected) => {
    expect(renderLintStagedConfig(kind)).toContain(expected)
  })

  it('none 时应该只生成占位注释，不生成生效规则', () => {
    const content = renderLintStagedConfig('none')
    expect(content).toContain('export default')
    expect(content).not.toMatch(/^\s*'\*':/m)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/linter.test.ts`
Expected: FAIL——`Cannot find module '@/utils/linter'`（文件还不存在）

- [ ] **Step 3: 实现 `src/utils/linter.ts`**

```ts
import { hasDependency } from '@/utils'

export type LinterKind = 'eslint' | 'biome' | 'oxlint'

interface LinterSpec {
  /** npm package name(s) that indicate this linter is installed */
  packages: string[]
  bin: string
  fixFlag: string
  /** stops the linter erroring when lint-staged hands it a file it doesn't own
   * (e.g. a .vue file under a plain eslint project) */
  noErrorOnUnmatchedFlag: string
}

const PRIORITY: LinterKind[] = ['eslint', 'biome', 'oxlint']

const LINTER_SPECS: Record<LinterKind, LinterSpec> = {
  eslint: {
    packages: ['eslint'],
    bin: 'eslint',
    fixFlag: '--fix',
    noErrorOnUnmatchedFlag: '--no-error-on-unmatched-pattern',
  },
  biome: {
    packages: ['@biomejs/biome'],
    bin: 'biome check',
    fixFlag: '--write',
    noErrorOnUnmatchedFlag: '--no-errors-on-unmatched',
  },
  oxlint: {
    packages: ['oxlint'],
    bin: 'oxlint',
    fixFlag: '--fix',
    noErrorOnUnmatchedFlag: '--no-error-on-unmatched-pattern',
  },
}

export function isLinterKind(value: string): value is LinterKind {
  return value in LINTER_SPECS
}

export function isLinterInstalled(kind: LinterKind): boolean {
  return LINTER_SPECS[kind].packages.some(pkg => hasDependency(pkg))
}

export function detectLinter(): LinterKind | undefined {
  return PRIORITY.find(isLinterInstalled)
}

export function getLintStagedCommand(kind: LinterKind): string {
  const spec = LINTER_SPECS[kind]
  return `${spec.bin} ${spec.fixFlag} ${spec.noErrorOnUnmatchedFlag}`
}

export function getFixCommand(kind: LinterKind, targets: string[]): string {
  const spec = LINTER_SPECS[kind]
  return `${spec.bin} ${targets.join(' ')} ${spec.fixFlag}`
}

export function renderLintStagedConfig(choice: LinterKind | 'none'): string {
  if (choice === 'none') {
    return `export default {
  // No linter detected, and none selected — add your own rule here, e.g.:
  // '*': 'eslint --fix --no-error-on-unmatched-pattern',
}
`
  }

  return `export default {
  '*': '${getLintStagedCommand(choice)}',
}
`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/linter.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: typecheck + lint**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add src/utils/linter.ts tests/linter.test.ts
git commit -m "$(cat <<'EOF'
feat: add linter detection module

Adds src/utils/linter.ts, a SPECS-table-driven module (mirroring
package-manager.ts) that detects whether a project uses ESLint, Biome,
or Oxlint, and renders the matching lint-staged rule / fix command.
Not yet wired into commitlint-init.
EOF
)"
```

---

### Task 2: 新增 `src/utils/prompt.ts` + `@clack/prompts` 依赖

**Files:**
- Modify: `package.json`（新增 devDependency）
- Create: `src/utils/prompt.ts`
- Create: `tests/prompt.test.ts`

**Interfaces:**
- Consumes：`LinterKind`（Task 1 产出，来自 `@/utils/linter`）
- Produces：`promptLinterChoice(): Promise<LinterKind | 'none' | undefined>`——Task 5 要用它

- [ ] **Step 1: 安装依赖**

```bash
pnpm add -D @clack/prompts
```

- [ ] **Step 2: 写测试文件 `tests/prompt.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'

const selectMock = vi.fn()
const isCancelMock = vi.fn(() => false)
const cancelMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  select: selectMock,
  isCancel: isCancelMock,
  cancel: cancelMock,
}))

const { promptLinterChoice } = await import('@/utils/prompt')

describe('promptLinterChoice', () => {
  it('应该把 select 的结果原样返回', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    expect(await promptLinterChoice()).toBe('eslint')
  })

  it('选择 none 时应该返回 none', async () => {
    selectMock.mockResolvedValue('none')
    isCancelMock.mockReturnValue(false)
    expect(await promptLinterChoice()).toBe('none')
  })

  it('用户取消时应该返回 undefined，并调用 cancel 提示', async () => {
    const cancelSymbol = Symbol('cancel')
    selectMock.mockResolvedValue(cancelSymbol)
    isCancelMock.mockImplementation(value => value === cancelSymbol)
    expect(await promptLinterChoice()).toBeUndefined()
    expect(cancelMock).toHaveBeenCalled()
  })

  it('提示的可选项里应该包含 none（跳过）', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    await promptLinterChoice()
    const call = selectMock.mock.calls[0][0]
    expect(call.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'none' })]),
    )
  })

  it('提示文案应该是中英双语', async () => {
    selectMock.mockResolvedValue('eslint')
    isCancelMock.mockReturnValue(false)
    await promptLinterChoice()
    const call = selectMock.mock.calls[0][0]
    expect(call.message).toContain('未检测到已知的 linter')
    expect(call.message).toMatch(/no known linter/i)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run tests/prompt.test.ts`
Expected: FAIL——`Cannot find module '@/utils/prompt'`

- [ ] **Step 4: 实现 `src/utils/prompt.ts`**

```ts
import type { LinterKind } from '@/utils/linter'
import { cancel, isCancel, select } from '@clack/prompts'

export async function promptLinterChoice(): Promise<LinterKind | 'none' | undefined> {
  const answer = await select({
    message: '未检测到已知的 linter，用于 lint-staged 的检查工具是？/ No known linter detected — which one drives lint-staged?',
    options: [
      { value: 'eslint', label: 'ESLint' },
      { value: 'biome', label: 'Biome' },
      { value: 'oxlint', label: 'Oxlint' },
      { value: 'none', label: '跳过 — 我自己配置 / None — I will configure lint-staged myself' },
    ],
  })

  if (isCancel(answer)) {
    cancel('已取消 / Cancelled.')
    return undefined
  }

  return answer as LinterKind | 'none'
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run tests/prompt.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: typecheck + lint**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: 无报错（`@clack/prompts` 的 `select` 返回类型是 `string | symbol`，`isCancel` 是类型守卫，`answer as LinterKind | 'none'` 这里的显式断言是必要的——如果 typecheck 提示别的类型问题，对照 `@clack/prompts` 当前版本的 `.d.ts` 调整,不要用 `any` 绕过）

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/utils/prompt.ts tests/prompt.test.ts
git commit -m "$(cat <<'EOF'
feat: add interactive linter prompt

Adds src/utils/prompt.ts, isolating the new @clack/prompts dependency
behind promptLinterChoice() — a single-select fallback for when no
known linter is auto-detected. Not yet wired into commitlint-init.
EOF
)"
```

---

### Task 3: `src/utils/index.ts` 新增 `isInteractive()` 与 `ArgvOptions.linter`

**Files:**
- Modify: `src/utils/index.ts:16-20`（`ArgvOptions`）、约第 80 行后新增 `isInteractive`
- Test: `tests/utils.test.ts`

**Interfaces:**
- Produces：`isInteractive(): boolean`、`ArgvOptions.linter?: string`——Task 5 要用

- [ ] **Step 1: 在 `tests/utils.test.ts` 里加测试**

在文件顶部的 import 列表里把 `resolveBannerMode` 后面加上 `isInteractive`（改成如下形式，其余 import 不变）：

```ts
import {
  execCommand,
  getPackageJSON,
  hasDependency,
  isInteractive,
  isMonorepo,
  isRootFileExist,
  isTsProject,
  printErr,
  printWarn,
  resolveBannerMode,
  ScriptError,
  writePackageJSON,
} from '@/utils'
```

在 `resolveBannerMode` 的 `describe` 块之后（第 236 行 `})` 之后）插入新 `describe` 块：

```ts
// ========================================
// isInteractive - whether stdin is a real interactive terminal
// ========================================
describe('isInteractive', () => {
  const originalIsTTY = process.stdin.isTTY
  const originalCI = process.env.CI

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    if (originalCI === undefined)
      delete process.env.CI
    else
      process.env.CI = originalCI
  })

  it('TTY 且没有 CI 环境变量时应该返回 true', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    delete process.env.CI
    expect(isInteractive()).toBe(true)
  })

  it('非 TTY 时应该返回 false', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    delete process.env.CI
    expect(isInteractive()).toBe(false)
  })

  it('即便是 TTY，设置了 CI 环境变量时也应该返回 false', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    process.env.CI = 'true'
    expect(isInteractive()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/utils.test.ts`
Expected: FAIL——`isInteractive` 未从 `@/utils` 导出

- [ ] **Step 3: 实现改动**

`src/utils/index.ts:16-20` 改成：

```ts
export interface ArgvOptions {
  clear?: boolean
  czgit?: boolean
  help?: boolean
  linter?: string
}
```

在 `resolveBannerMode` 函数定义之后、`banner()` 函数之前插入：

```ts
/**
 * Whether this is a real interactive terminal — never true in CI or when
 * stdin isn't a TTY (piped input, non-interactive test runners)
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/utils.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: typecheck + lint**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add src/utils/index.ts tests/utils.test.ts
git commit -m "$(cat <<'EOF'
feat: add isInteractive() and ArgvOptions.linter

Lays the groundwork for the linter-choice flow: isInteractive() lets
callers detect a non-TTY/CI environment before attempting a prompt,
and ArgvOptions.linter reserves the --linter flag's raw value. Neither
is wired into commitlint-init yet.
EOF
)"
```

---

### Task 4: `commitlint-init.ts` 纯决策层——`planSetup` 接入 `renderLintStagedConfig`

**Files:**
- Modify: `src/constants/index.ts:103-108`（删除 `CONFIG_LINT_STAGED`）
- Modify: `src/scripts/commitlint-init.ts:1-58`（imports、`planSetup`）
- Modify: `tests/commitlint-init-plan.test.ts`

**Interfaces:**
- Consumes：`renderLintStagedConfig(choice: LinterKind | 'none'): string`、`LinterKind`（Task 1）
- Produces：`planSetup(options, env: { isTsProject, pm, linter: LinterKind | 'none' })`——Task 5 要传入 `linter` 字段

- [ ] **Step 1: 改测试，给所有现有 `planSetup` 调用点补 `linter` 字段，并新增内容用例**

`tests/commitlint-init-plan.test.ts` 里，把文件顶部的共享 `pm` 常量下面加一个共享 env 帮助函数，同时把所有 `{ isTsProject: X, pm }` 替换成 `{ isTsProject: X, pm, linter: 'eslint' as const }`（这里用 `'eslint'` 只是保持这些既有用例的行为不变——它们本来就不关心 lint-staged 具体内容）。完整替换后的文件：

```ts
import type { PackageManager } from '@/utils/package-manager'
import { describe, expect, it } from 'vitest'
import { patchPackageJSON, planSetup } from '@/scripts/commitlint-init'

// Pure function tests: no need to mock the filesystem, subprocess, or spinner
const pm = {
  formatExec: (command: string) => `pnpm exec ${command}`,
} as PackageManager

describe('planSetup', () => {
  it('默认应该规划 4 个基础依赖', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
    ])
  })

  it('--czgit 时应该追加 commitizen 和 cz-git', () => {
    expect(planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
      'commitizen',
      'cz-git',
    ])
  })

  it('ts 项目的配置文件应该是 .ts', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.ts')
  })

  it('非 TS 项目的配置文件应该是 .js', () => {
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.js')
  })

  it('--czgit 时配置文件内容应该带 prompt 交互配置', () => {
    const { content } = planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).toContain('prompt')
    expect(content).toContain('cz-git')
  })

  it('默认配置文件内容不应该带 prompt 交互配置', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).not.toContain('prompt')
  })

  it('钩子内容应该用包管理器的 exec 前缀渲染', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).hooks).toEqual([
      { path: '.husky/pre-commit', content: 'pnpm exec lint-staged' },
      { path: '.husky/commit-msg', content: 'pnpm exec commitlint --edit "$1"' },
    ])
  })

  it('lint-staged 配置文件固定生成 lint-staged.config.mjs，不区分 ts/js 项目', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
  })
})

describe('planSetup 的 lint-staged 内容', () => {
  it('探测到 eslint 时应该生成 eslint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'eslint --fix --no-error-on-unmatched-pattern'`)
  })

  it('探测到 biome 时应该生成 biome 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'biome' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'biome check --write --no-errors-on-unmatched'`)
  })

  it('探测到 oxlint 时应该生成 oxlint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'oxlint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'oxlint --fix --no-error-on-unmatched-pattern'`)
  })

  it('没有 linter 时应该只生成占位注释', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'none' }).lintStagedConfigFile
    expect(content).not.toMatch(/^\s*'\*':/m)
  })
})

describe('patchPackageJSON', () => {
  it('应该写入 commitlint 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result.scripts!.commitlint).toBe('commitlint --edit')
  })

  it('lint-staged 配置已经改用独立文件，不应该再往 package.json 里注入默认值', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result['lint-staged']).toBeUndefined()
  })

  it('用户已有的 lint-staged 配置不应该被覆盖', () => {
    const result = patchPackageJSON(
      { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } },
      {},
    )
    expect(result['lint-staged']).toEqual({ '*.ts': 'my-own-linter' })
  })

  it('不应该修改传入的对象', () => {
    const original = { name: 'demo' }
    patchPackageJSON(original, { czgit: true })
    expect(original).toEqual({ name: 'demo' })
  })

  it('应该保留原有的其他字段和脚本', () => {
    const result = patchPackageJSON(
      { name: 'demo', version: '1.0.0', scripts: { build: 'vite build' } },
      {},
    )
    expect(result.name).toBe('demo')
    expect(result.version).toBe('1.0.0')
    expect(result.scripts!.build).toBe('vite build')
  })

  it('--czgit 时应该写入 commitizen 配置和 cz 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, { czgit: true })
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(result.scripts!.cz).toBe('git cz')
  })

  it('--czgit 时应该保留 commitizen 子对象里已有的配置', () => {
    // cz-git's config lives under config.commitizen (alongside path there's also
    // alias/types etc.) — merging only the outer layer would lose that inner data
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x', alias: { fd: 'docs: fix typos' } } } },
      { czgit: true },
    )
    expect(result.config!.commitizen).toEqual({
      path: 'node_modules/cz-git',
      alias: { fd: 'docs: fix typos' },
    })
  })

  it('--czgit 时应该保留 config 下已有的其他字段', () => {
    // Regression case: this used to overwrite config wholesale, dropping the user's other fields
    const result = patchPackageJSON(
      { name: 'demo', config: { other: 'keep-me' } },
      { czgit: true },
    )
    expect(result.config!.other).toBe('keep-me')
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
  })

  it('非 czgit 时应该清理已有的 commitizen 配置和 cz 脚本', () => {
    const result = patchPackageJSON(
      {
        name: 'demo',
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-git' } },
      },
      {},
    )
    expect(result.config!.commitizen).toBeUndefined()
    expect(result.scripts!.cz).toBeUndefined()
  })

  it('非 czgit 时应该保留 config 下的其他字段', () => {
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x' }, other: 'keep' } },
      {},
    )
    expect(result.config!.other).toBe('keep')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/commitlint-init-plan.test.ts`
Expected: FAIL——类型错误（`env` 缺少 `linter` 字段编译不过）或断言失败

- [ ] **Step 3: 修改 `src/constants/index.ts`，删除 `CONFIG_LINT_STAGED`**

删除第 103-108 行：

```ts
export const CONFIG_LINT_STAGED
  = `export default {
  // '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
  '*': 'eslint --fix',
}
`

```

（删除后紧接着的 `export const DEFAULT_PKG_NAME = ...` 和 `export const REPO_URL = ...` 保留不动。）

- [ ] **Step 4: 修改 `src/scripts/commitlint-init.ts` 的 imports 与 `planSetup`**

第 1-10 行的 import 块改成（`isInteractive`/`detectLinter`/`getFixCommand`/`isLinterInstalled`/`isLinterKind`/`promptLinterChoice` 是 Task 5 才会用到的，本 Task 先不加，避免 `tsc` 的 `noUnusedLocals` 在中间状态报错；`hasDependency` 暂时保留——`init()` 里那处硬编码的 `if (hasDependency('eslint'))` 要到 Task 5 才改，本 Task 只动 `planSetup`）：

```ts
import type { ArgvOptions, PackageJsonLike } from '@/utils'
import type { LinterKind } from '@/utils/linter'
import type { PackageManager } from '@/utils/package-manager'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile as w } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import yoctoSpinner from 'yocto-spinner'
import { CONFIG_COMMITLINT, CONFIG_COMMITLINT_CZGIT } from '@/constants'
import { execCommand, getPackageJSON, hasDependency, isTsProject, printWarn, writePackageJSON } from '@/utils'
import { renderLintStagedConfig } from '@/utils/linter'
import { createPackageManager } from '@/utils/package-manager'
```

`planSetup` 函数签名与 `lintStagedConfigFile` 那一行（原第 35-51 行）改成：

```ts
export function planSetup(
  options: ArgvOptions,
  env: { isTsProject: boolean, pm: PackageManager, linter: LinterKind | 'none' },
): SetupPlan {
  const useCZGit = Boolean(options.czgit)
  const packages = ['@commitlint/cli', '@commitlint/config-conventional', 'husky', 'lint-staged']
  if (useCZGit)
    packages.push('commitizen', 'cz-git')

  return {
    packages,
    configFile: {
      name: env.isTsProject ? 'commitlint.config.ts' : 'commitlint.config.js',
      content: useCZGit ? CONFIG_COMMITLINT_CZGIT : CONFIG_COMMITLINT,
    },
    // Always .mjs: it's ESM regardless of the target project's package.json "type" field
    lintStagedConfigFile: { name: 'lint-staged.config.mjs', content: renderLintStagedConfig(env.linter) },
```

（`hooks` 数组那部分不变。）

`init()` 函数里第一处调用 `planSetup` 的地方（`const plan = planSetup(options, { isTsProject: isTsProject(), pm })`）**本 Task 先不改**——留给 Task 5 一起改，因为那里需要 `resolveLinterChoice()` 提供 `linter` 的值。本 Task 结束时这一行会临时编译不过（`env` 缺少必填的 `linter` 字段），这是预期的、跨两个 commit 的中间状态；**Step 5 的 typecheck 允许失败**，正常 typecheck 通过要等 Task 5 完成。

- [ ] **Step 5: 只跑 `commitlint-init-plan.test.ts`（不跑全量 typecheck）**

Run: `pnpm vitest run tests/commitlint-init-plan.test.ts`
Expected: 全部 PASS（这个测试文件只测 `planSetup`/`patchPackageJSON`，不会触发 `init()` 里那处还没改完的调用点）

- [ ] **Step 6: Commit**

```bash
git add src/constants/index.ts src/scripts/commitlint-init.ts tests/commitlint-init-plan.test.ts
git commit -m "$(cat <<'EOF'
refactor: make planSetup's lint-staged content linter-aware

planSetup now takes env.linter and renders lint-staged.config.mjs via
the new renderLintStagedConfig() instead of the removed
CONFIG_LINT_STAGED constant. init()'s call site is intentionally left
unwired here — it's completed in the next commit alongside
resolveLinterChoice(), since that's what actually supplies env.linter.
EOF
)"
```

---

### Task 5: `commitlint-init.ts` 副作用层——`resolveLinterChoice()` 与 `init()` 接线

**Files:**
- Modify: `src/scripts/commitlint-init.ts`（imports、新增 `resolveLinterChoice`、`init()`）
- Modify: `tests/commitlint-init.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `detectLinter`/`isLinterInstalled`/`isLinterKind`/`getFixCommand`、Task 2 的 `promptLinterChoice`、Task 3 的 `isInteractive`
- Produces：`resolveLinterChoice(options: ArgvOptions): Promise<LinterKind | 'none'>`（模块内部函数，不导出，仅 `init()` 内部使用）

- [ ] **Step 1: 改写 `tests/commitlint-init.test.ts` 的 mock 设置**

把文件顶部到 `describe('commitlint-init init()'` 之前的部分整体替换成：

```ts
import type { PackageJsonLike } from '@/utils'
import type { LinterKind } from '@/utils/linter'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => {}),
}))

const ensureInstalledMock = vi.fn(async (_pkgs: string[], _options?: { dev?: boolean }) => {})
const execCommandMock = vi.fn(async () => {})
const pmExecMock = vi.fn(async (_command: string, _options?: { allowFailure?: boolean }) => {})
const isTsProjectMock = vi.fn(() => true)
const isInteractiveMock = vi.fn(() => false)
const printWarnMock = vi.fn()
const writePackageJSONMock = vi.fn(async (_data: PackageJsonLike) => {})
let pkgState: PackageJsonLike
const getPackageJSONMock = vi.fn((): PackageJsonLike => pkgState)

vi.mock('@/utils', () => ({
  execCommand: execCommandMock,
  getPackageJSON: getPackageJSONMock,
  isInteractive: isInteractiveMock,
  isTsProject: isTsProjectMock,
  printWarn: printWarnMock,
  writePackageJSON: writePackageJSONMock,
}))

const detectLinterMock = vi.fn((): LinterKind | undefined => undefined)
const isLinterInstalledMock = vi.fn((_kind: LinterKind) => false)
const isLinterKindMock = vi.fn((value: string): value is LinterKind =>
  (['eslint', 'biome', 'oxlint'] as string[]).includes(value))
const getFixCommandMock = vi.fn((kind: LinterKind, targets: string[]) => `${kind} ${targets.join(' ')} --fix`)
const renderLintStagedConfigMock = vi.fn((choice: LinterKind | 'none') =>
  choice === 'none' ? 'export default {}\n' : `export default { '*': '${choice}-fix-command' }\n`)

vi.mock('@/utils/linter', () => ({
  detectLinter: detectLinterMock,
  getFixCommand: getFixCommandMock,
  isLinterInstalled: isLinterInstalledMock,
  isLinterKind: isLinterKindMock,
  renderLintStagedConfig: renderLintStagedConfigMock,
}))

const promptLinterChoiceMock = vi.fn(async (): Promise<LinterKind | 'none' | undefined> => 'none')

vi.mock('@/utils/prompt', () => ({
  promptLinterChoice: promptLinterChoiceMock,
}))

// The one and only package manager seam: the script only talks to npm/pnpm/yarn through this
vi.mock('@/utils/package-manager', () => ({
  createPackageManager: () => ({
    name: 'pnpm',
    ensureInstalled: ensureInstalledMock,
    exec: pmExecMock,
    formatExec: (command: string) => `pnpm exec ${command}`,
    uninstall: vi.fn(),
  }),
}))

vi.mock('yocto-spinner', () => ({
  default: () => ({ start: vi.fn(), success: vi.fn(), stop: vi.fn() }),
}))

const { init } = await import('@/scripts/commitlint-init')

// resolve() returns backslash paths on windows; normalize to posix before asserting so both platforms match
function toPosix(p: unknown): string {
  return String(p).replaceAll('\\', '/')
}

describe('commitlint-init init()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    pkgState = { name: 'demo' }
    // resetAllMocks clears implementations, so re-establish each mock's default behavior here
    getPackageJSONMock.mockImplementation(() => pkgState)
    ensureInstalledMock.mockResolvedValue(undefined)
    pmExecMock.mockResolvedValue(undefined)
    writePackageJSONMock.mockResolvedValue(undefined)
    isTsProjectMock.mockReturnValue(true)
    isInteractiveMock.mockReturnValue(false)
    detectLinterMock.mockReturnValue(undefined)
    isLinterInstalledMock.mockReturnValue(false)
    isLinterKindMock.mockImplementation((value: string): value is LinterKind =>
      (['eslint', 'biome', 'oxlint'] as string[]).includes(value))
    getFixCommandMock.mockImplementation((kind: LinterKind, targets: string[]) => `${kind} ${targets.join(' ')} --fix`)
    renderLintStagedConfigMock.mockImplementation((choice: LinterKind | 'none') =>
      choice === 'none' ? 'export default {}\n' : `export default { '*': '${choice}-fix-command' }\n`)
    promptLinterChoiceMock.mockResolvedValue('none')
    vi.mocked(existsSync).mockReturnValue(false)
  })
```

（`describe` 块内部原有的每一个 `it` 保持不动地跟在这个新 `beforeEach` 后面——下面几步再对其中依赖 `hasDependencyMock` 的用例做针对性修改，其余用例原样保留。）

- [ ] **Step 2: 改写依赖 `hasDependencyMock` 的既有用例**

把原来这四个用例替换成：

```ts
  it('lint-staged 配置文件不存在时应该写入 lint-staged.config.mjs', async () => {
    detectLinterMock.mockReturnValue('eslint')
    await init({})
    expect(writeFile).toHaveBeenCalledWith('lint-staged.config.mjs', expect.stringContaining('eslint-fix-command'))
  })
```

```ts
  it('检测到 eslint 时应该直接执行本地 eslint，且允许失败', async () => {
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    expect(pmExecMock).toHaveBeenCalledWith(
      'eslint package.json commitlint.config.ts lint-staged.config.mjs --fix',
      { allowFailure: true },
    )
  })
```

```ts
  it('package.json 已有内联 lint-staged 字段时，收尾修复不应该引用未生成的配置文件', async () => {
    pkgState = { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } }
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    expect(pmExecMock).toHaveBeenCalledWith(
      'eslint package.json commitlint.config.ts --fix',
      { allowFailure: true },
    )
  })
```

```ts
  it('不应该再往 package.json 里写临时的 fix 脚本', async () => {
    detectLinterMock.mockReturnValue('eslint')
    isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
    await init({})
    // package.json is written exactly once, during the config-writing step; lint no longer causes an extra round trip
    expect(writePackageJSONMock).toHaveBeenCalledTimes(1)
    for (const [written] of writePackageJSONMock.mock.calls)
      expect(written.scripts!['__hubery__:fix']).toBeUndefined()
  })
```

```ts
  it('未检测到任何 linter 时不应该运行 lint', async () => {
    detectLinterMock.mockReturnValue(undefined)
    isInteractiveMock.mockReturnValue(false)
    await init({})
    expect(pmExecMock).not.toHaveBeenCalledWith(
      expect.stringContaining('--fix'),
      expect.anything(),
    )
  })
```

（原测试名分别是"lint-staged 配置文件不存在时应该写入 lint-staged.config.mjs"、"检测到 eslint 时应该直接执行本地 eslint，且允许失败"、"package.json 已有内联 lint-staged 字段时，eslint --fix 不应该引用未生成的配置文件"、"不应该再往 package.json 里写临时的 fix 脚本"、"未检测到 eslint 时不应该运行 lint"——按原文件里出现的顺序原地替换，其余用例不动。）

- [ ] **Step 3: 在文件末尾（`describe('commitlint-init init()'` 的收尾 `})` 之前）新增 `linter 选择` 用例组**

```ts
  describe('linter 选择', () => {
    it('--linter=none 时应该跳过 lint 相关规则和收尾修复', async () => {
      await init({ linter: 'none' })
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
      expect(detectLinterMock).not.toHaveBeenCalled()
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
    })

    it('--linter=biome 应该绕开自动探测，直接使用 biome', async () => {
      isLinterInstalledMock.mockImplementation(kind => kind === 'biome')
      await init({ linter: 'biome' })
      expect(detectLinterMock).not.toHaveBeenCalled()
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('biome'), { allowFailure: true })
    })

    it('--linter=biome 但项目其实没装 biome 时不应该执行收尾修复', async () => {
      isLinterInstalledMock.mockReturnValue(false)
      await init({ linter: 'biome' })
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
    })

    it('无法识别的 --linter 值应该给出警告并回退到自动探测', async () => {
      detectLinterMock.mockReturnValue('eslint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'eslint')
      await init({ linter: 'not-a-real-linter' })
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('not-a-real-linter'))
      expect(detectLinterMock).toHaveBeenCalled()
    })

    it('探测不到任何 linter 且处于交互环境时应该弹出提示', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(true)
      promptLinterChoiceMock.mockResolvedValue('oxlint')
      isLinterInstalledMock.mockImplementation(kind => kind === 'oxlint')
      await init({})
      expect(promptLinterChoiceMock).toHaveBeenCalledTimes(1)
      expect(pmExecMock).toHaveBeenCalledWith(expect.stringContaining('oxlint'), { allowFailure: true })
    })

    it('探测不到任何 linter 且非交互环境时应该跳过并给出警告，不弹出提示', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(false)
      await init({})
      expect(promptLinterChoiceMock).not.toHaveBeenCalled()
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('No linter detected'))
    })

    it('交互提示被取消时应该跳过并给出警告', async () => {
      detectLinterMock.mockReturnValue(undefined)
      isInteractiveMock.mockReturnValue(true)
      promptLinterChoiceMock.mockResolvedValue(undefined)
      await init({})
      expect(printWarnMock).toHaveBeenCalledWith(expect.stringContaining('cancelled'))
      expect(pmExecMock).not.toHaveBeenCalledWith(expect.stringContaining('--fix'), expect.anything())
    })
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run tests/commitlint-init.test.ts`
Expected: FAIL（`resolveLinterChoice` 还不存在，`init()` 还没接线）

- [ ] **Step 5: 完成 `src/scripts/commitlint-init.ts` 的 imports**

把 Task 4 里的 import 块换成最终版本：

```ts
import type { ArgvOptions, PackageJsonLike } from '@/utils'
import type { LinterKind } from '@/utils/linter'
import type { PackageManager } from '@/utils/package-manager'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile as w } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import yoctoSpinner from 'yocto-spinner'
import { CONFIG_COMMITLINT, CONFIG_COMMITLINT_CZGIT } from '@/constants'
import { execCommand, getPackageJSON, isInteractive, isTsProject, printWarn, writePackageJSON } from '@/utils'
import { detectLinter, getFixCommand, isLinterInstalled, isLinterKind, renderLintStagedConfig } from '@/utils/linter'
import { createPackageManager } from '@/utils/package-manager'
import { promptLinterChoice } from '@/utils/prompt'
```

（`hasDependency` 从 `@/utils` 的 import 里去掉——收尾修复步骤改用 `isLinterInstalled` 之后，这个文件不再直接用到它。）

- [ ] **Step 6: 新增 `resolveLinterChoice`，紧跟在 `snapshotExistingHooks` 函数之后、`init()` 之前**

```ts
async function resolveLinterChoice(options: ArgvOptions): Promise<LinterKind | 'none'> {
  const flag = options.linter?.toLowerCase()
  if (flag === 'none')
    return 'none'
  if (flag && isLinterKind(flag))
    return flag
  if (flag)
    printWarn(`Unknown --linter value "${options.linter}"; falling back to auto-detect.`)

  const detected = detectLinter()
  if (detected)
    return detected

  if (!isInteractive()) {
    printWarn('No linter detected, and no interactive terminal to ask — skipping the lint-staged rule; edit lint-staged.config.mjs yourself.')
    return 'none'
  }

  const answer = await promptLinterChoice()
  if (answer === undefined) {
    printWarn('Prompt cancelled — skipping the lint-staged rule.')
    return 'none'
  }
  return answer
}
```

- [ ] **Step 7: 接线 `init()`**

把 `const pm = createPackageManager()` 和 `const plan = planSetup(...)` 这两行改成：

```ts
  const pm = createPackageManager()
  const linterChoice = await resolveLinterChoice(options)
  const plan = planSetup(options, { isTsProject: isTsProject(), pm, linter: linterChoice })
```

把文件末尾的收尾修复块：

```ts
  if (hasDependency('eslint')) {
    spinner.start('lint running')
    // Run the project's local eslint directly instead of stashing a temp script into
    // package.json; a formatting failure here doesn't affect setup, the config files are
    // already written by this point
    const lintTargets = ['package.json', name]
    if (lintStagedFilePresent)
      lintTargets.push(lintStagedName)
    await pm.exec(`eslint ${lintTargets.join(' ')} --fix`, { allowFailure: true })
    spinner.success('lint down!')
  }
}
```

改成：

```ts
  if (linterChoice !== 'none' && isLinterInstalled(linterChoice)) {
    spinner.start('lint running')
    // Run the project's local linter directly instead of stashing a temp script into
    // package.json; a formatting failure here doesn't affect setup, the config files are
    // already written by this point
    const lintTargets = ['package.json', name]
    if (lintStagedFilePresent)
      lintTargets.push(lintStagedName)
    await pm.exec(getFixCommand(linterChoice, lintTargets), { allowFailure: true })
    spinner.success('lint down!')
  }
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm vitest run tests/commitlint-init.test.ts tests/commitlint-init-plan.test.ts`
Expected: 全部 PASS

- [ ] **Step 9: 全量 typecheck + lint + test**

Run: `pnpm typecheck && pnpm lint:fix && pnpm test`
Expected: 全部通过（这一步应该第一次在本功能分支上全绿——Task 4 结束时故意留下的编译失败到这里解决）

- [ ] **Step 10: Commit**

```bash
git add src/scripts/commitlint-init.ts tests/commitlint-init.test.ts
git commit -m "$(cat <<'EOF'
feat: wire linter detection and prompt into commitlint-init

Adds resolveLinterChoice(), which resolves --linter, auto-detection,
the interactive prompt, and the non-interactive fallback into a single
LinterKind | 'none' value before planSetup runs. The post-hoc "fix the
generated files" step now drives off the same choice instead of being
hardcoded to eslint.
EOF
)"
```

---

### Task 6: CLI flag 接线——`main.ts` + `registry.ts`

**Files:**
- Modify: `src/scripts/main.ts:25-28`
- Modify: `src/registry.ts:53-57`
- Modify: `tests/main.test.ts`
- Modify: `tests/registry.test.ts`

**Interfaces:**
- Consumes：`ArgvOptions.linter`（Task 3）
- Produces：无（终端用户可见的 CLI 行为，无下游任务消费）

- [ ] **Step 1: 改测试**

`tests/main.test.ts`：在文件末尾、`describe('main'` 收尾 `})` 之前新增：

```ts
  it('--linter=biome 应该被解析成字符串，而不是被强转成布尔值', async () => {
    process.argv = ['node', 'hubery', 'commitlint-init', '--linter=biome']
    await main()
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ linter: 'biome' }))
  })
```

`tests/registry.test.ts`：把 `应该包含所有参数说明` 那个用例改成：

```ts
  it('应该包含所有参数说明', () => {
    const help = renderHelp()
    expect(help).toContain('--help')
    expect(help).toContain('--clear')
    expect(help).toContain('--czgit')
    expect(help).toContain('--linter')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/main.test.ts tests/registry.test.ts`
Expected: FAIL——`--linter=biome` 被 `mri` 当成布尔值（`initMock` 收到的 `linter` 是 `true` 不是 `'biome'`），且帮助文本里没有 `--linter`

- [ ] **Step 3: 修改 `src/scripts/main.ts`**

第 25-28 行改成：

```ts
  const options = mri<ArgvOptions>(process.argv.slice(2), {
    boolean: ['clear', 'czgit', 'help'],
    string: ['linter'],
    alias: { h: 'help' },
  })
```

- [ ] **Step 4: 修改 `src/registry.ts`**

第 53-57 行（`renderHelp` 里的参数说明部分）改成：

```ts
参数 / Options:
  -h, --help                            查看帮助 / show help
  --clear                               清洁执行 - 执行完脚本后卸载模块 / uninstall the module after running
  --czgit                               配置 cz-git / enable cz-git
  --linter=<eslint|biome|oxlint|none>   指定 lint-staged 检查工具，跳过自动探测和交互询问 / specify the linter for lint-staged, skipping auto-detect and the prompt
`
```

（这是模板字符串内部的文本，注意保留原本每行开头的两个空格缩进；只是把已有三行的对齐宽度统一加宽了几格，好让新加的这行也基本对齐，不必做到像表格一样绝对整齐。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run tests/main.test.ts tests/registry.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 全量验证**

Run: `pnpm typecheck && pnpm lint:fix && pnpm test`
Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/scripts/main.ts src/registry.ts tests/main.test.ts tests/registry.test.ts
git commit -m "$(cat <<'EOF'
feat: expose --linter flag on the CLI

Wires ArgvOptions.linter through mri (as a string, not a boolean) and
documents it in --help, so --linter=<eslint|biome|oxlint|none> can
bypass auto-detection/the prompt from the command line.
EOF
)"
```

---

### Task 7: 文档收尾 + 全量验证

**Files:**
- Modify: `README.md:155-161`
- Modify: `README.md:85-87`
- Modify: `README.en.md:155-161`
- Modify: `README.en.md:85-87`

**Interfaces:**
- Consumes：无（纯文档）
- Produces：无（本计划最后一个任务）

- [ ] **Step 1: 更新 `README.md` 的 lint-staged 示例段落**

把第 155-161 行：

```
`lint-staged.config.mjs` 的默认内容：

```js
export default {
  // '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': 'eslint --fix',
  '*': 'eslint --fix',
}
```
```

改成：

```
脚本会自动探测项目已安装的 ESLint / Biome / Oxlint，生成对应的 `lint-staged.config.mjs` 规则；什么都探测不到时，交互式终端里会询问你想用哪一个（或者跳过自己配置），非交互环境（CI、管道输入等）下会直接跳过并给出提示。也可以用 `--linter=<eslint|biome|oxlint|none>` 显式指定，绕开探测和询问。

以探测到 ESLint 为例，`lint-staged.config.mjs` 的内容：

```js
export default {
  '*': 'eslint --fix --no-error-on-unmatched-pattern',
}
```
```

- [ ] **Step 2: 更新 `README.md` 的参数说明列表**

把第 85-87 行：

```
- `-h, --help` 查看帮助
- `--clear` 清洁执行 - 执行完脚本后卸载模块
- `--czgit` 配置[cz-git](https://github.com/Zhengqbbb/cz-git)支持
```

改成：

```
- `-h, --help` 查看帮助
- `--clear` 清洁执行 - 执行完脚本后卸载模块
- `--czgit` 配置[cz-git](https://github.com/Zhengqbbb/cz-git)支持
- `--linter=<eslint|biome|oxlint|none>` 指定 lint-staged 使用的检查工具，跳过自动探测和交互询问
```

- [ ] **Step 3: 对 `README.en.md` 做同样的两处改动**

第 155-161 行改成：

```
The script auto-detects whether the project has ESLint, Biome, or Oxlint installed and generates the matching `lint-staged.config.mjs` rule. If none is detected, an interactive terminal will prompt you to pick one (or skip and configure it yourself); a non-interactive environment (CI, piped input, etc.) skips the prompt and prints a warning instead. You can also pass `--linter=<eslint|biome|oxlint|none>` to bypass detection and the prompt entirely.

Assuming ESLint is detected, the content of `lint-staged.config.mjs`:

```js
export default {
  '*': 'eslint --fix --no-error-on-unmatched-pattern',
}
```
```

第 85-87 行改成：

```
- `-h, --help` Show help
- `--clear` Clean run — uninstall the module after execution
- `--czgit` Configure [cz-git](https://github.com/Zhengqbbb/cz-git) support
- `--linter=<eslint|biome|oxlint|none>` Specify which linter drives lint-staged, skipping auto-detection and the prompt
```

- [ ] **Step 4: 校对**

Run: `grep -n "linter" README.md README.en.md`
Expected: 每个文件各命中两处新增内容，用词、`--linter=<...>` 拼写在两份文档里保持一致

- [ ] **Step 5: 全量验证门禁**

Run: `pnpm typecheck && pnpm lint:fix && pnpm test && pnpm build`
Expected: 全部通过——这是本功能自 Task 1 以来第一次连 `pnpm build` 也跑一遍，确认 tsdown 打包没有因为新模块/新依赖出问题

- [ ] **Step 6: dogfood 验证（手动，不写进自动化测试）**

Run: `pnpm preview`（本仓库已经装了 ESLint，走的正是"自动探测到 eslint"这条路径）
Expected: 命令跑完不报错；如果 `.git`、`commitlint.config.ts`、`lint-staged.config.mjs`、`.husky/*` 都已存在（本仓库自己已经跑过一次），应该看到对应的 `already exists, skipped/kept your version` 提示，而不是报错退出

之后可以额外验证"暂存一个非 `.ts` 文件和一个 `.ts` 文件一起提交"这条 `--no-error-on-unmatched-pattern` 的核心场景（例如 `touch scratch.md && git add scratch.md src/utils/linter.ts && git commit -m "test"`——测完用 `git reset` 撤销这次试探性 commit，不要真的留下这条记录），确认 `lint-staged` 不会因为 flat config 报 "No files matching the pattern"。

- [ ] **Step 7: Commit**

```bash
git add README.md README.en.md
git commit -m "$(cat <<'EOF'
docs: document linter auto-detection and the --linter flag

Replaces the fixed ESLint-only lint-staged sample with a description
of the detect → prompt → non-interactive-fallback behavior, and adds
--linter to both READMEs' options list.
EOF
)"
```

## 待办（本计划范围之外）

- **pre-push 钩子跑 `tsc --noEmit`**：本轮明确推迟，作为独立功能后续再做（见 spec 文档"待办 / 后续"章节）。下次要做时，先重新走一遍 brainstorming（bounded 或 architectural 取决于届时范围），不要直接照抄本计划的任务粒度。
