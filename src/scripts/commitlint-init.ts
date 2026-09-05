import type { ArgvOptions, PackageJsonLike } from '@/utils'
import type { LinterKind } from '@/utils/linter'
import type { PackageManager } from '@/utils/package-manager'
import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile as w } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import yoctoSpinner from 'yocto-spinner'
import { CONFIG_COMMITLINT, CONFIG_COMMITLINT_CZGIT } from '@/constants'
import { MSG, MSG_FOR } from '@/constants/messages'
import { execCommand, getPackageJSON, isInteractive, isTsProject, printInfo, printWarn, writePackageJSON } from '@/utils'
import { detectLinter, getFixCommand, isLinterInstalled, isLinterKind, renderLintStagedConfig } from '@/utils/linter'
import { createPackageManager } from '@/utils/package-manager'
import { promptLinterChoice } from '@/utils/prompt'

interface HookFile {
  path: string
  content: string
}

export interface SetupPlan {
  /** 需要安装的包 */
  packages: string[]
  /** 要生成的 commitlint 配置文件 */
  configFile: { name: string, content: string }
  /** 要生成的 lint-staged 配置文件 */
  lintStagedConfigFile: { name: string, content: string }
  /** 要写入的 husky 钩子 */
  hooks: HookFile[]
}

/**
 * commitlint 会读取的全部文件名，顺序照搬 cosmiconfig 自己的查找顺序
 *
 * 只检查我们即将写入的那一个文件名，会漏掉项目里已有的 `.commitlintrc`
 * （或它的 `.cjs` 变体），留下两份互相打架的配置，其中一份会悄无声息地失效。
 */
export const COMMITLINT_CONFIG_FILES = [
  'commitlint.config.ts',
  'commitlint.config.js',
  'commitlint.config.cjs',
  'commitlint.config.mjs',
  '.commitlintrc',
  '.commitlintrc.json',
  '.commitlintrc.js',
  '.commitlintrc.cjs',
  '.commitlintrc.mjs',
  '.commitlintrc.ts',
  '.commitlintrc.yml',
  '.commitlintrc.yaml',
]

/** lint-staged 同理。package.json 里的 `lint-staged` 字段单独检查。 */
export const LINT_STAGED_CONFIG_FILES = [
  'lint-staged.config.mjs',
  'lint-staged.config.js',
  'lint-staged.config.cjs',
  'lint-staged.config.ts',
  '.lintstagedrc',
  '.lintstagedrc.json',
  '.lintstagedrc.js',
  '.lintstagedrc.cjs',
  '.lintstagedrc.mjs',
  '.lintstagedrc.yml',
  '.lintstagedrc.yaml',
]

/**
 * husky v4 自己的配置文件位置，顺序照搬 cosmiconfig 的查找顺序
 *
 * husky 9 完全不读这些文件。原地升级上来的项目会把它们留在那儿，于是它们定义的
 * 钩子在某个时间点悄悄停止运行了 —— 这件事值得明说，而不是默不作声地在旁边
 * 再搭一套能跑的配置。
 */
export const HUSKY_V4_CONFIG_FILES = [
  '.huskyrc',
  '.huskyrc.json',
  '.huskyrc.js',
  '.huskyrc.cjs',
  '.huskyrc.yml',
  '.huskyrc.yaml',
  'husky.config.js',
  'husky.config.cjs',
]

/** 残留的 husky v4 配置（如果有）—— 纯函数，文件是否存在与 manifest 都由外部注入 */
export function detectHuskyV4(
  exists: (file: string) => boolean,
  pkg: PackageJsonLike,
): { source: string, hooks: Record<string, string> } | undefined {
  const file = findExistingConfig(HUSKY_V4_CONFIG_FILES, exists)
  if (file)
    return { source: file, hooks: {} }

  const field = pkg.husky as { hooks?: Record<string, string> } | undefined
  if (field)
    return { source: MSG.pkgFieldHusky, hooks: field.hooks ?? {} }

  return undefined
}

/**
 * 返回第一个存在的候选文件 —— 纯函数，「是否存在」由外部注入
 */
export function findExistingConfig(
  candidates: string[],
  exists: (file: string) => boolean,
): string | undefined {
  return candidates.find(file => exists(file))
}

/**
 * 决定要生成什么 —— 纯函数，从不碰文件系统，也不执行命令
 *
 * 这里只覆盖能提前算出来的决定。husky 钩子的写入要不要跳过不算在内：那取决于
 * `husky init` 执行后的副作用，所以只能留在 init() 里。
 */
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
    // 固定用 .mjs：不管目标项目 package.json 的 "type" 字段写的是什么，它都是 ESM
    lintStagedConfigFile: { name: 'lint-staged.config.mjs', content: renderLintStagedConfig(env.linter) },
    hooks: [
      // 钩子是 shell 脚本 —— 这里写的是命令字符串而不是执行它，所以用 formatExec
      { path: '.husky/pre-commit', content: env.pm.formatExec('lint-staged') },
      { path: '.husky/commit-msg', content: env.pm.formatExec('commitlint --edit "$1"') },
    ],
  }
}

/**
 * 算出打过补丁的 package.json —— 纯函数，从不修改入参
 */
export function patchPackageJSON(pkg: PackageJsonLike, options: ArgvOptions): PackageJsonLike {
  const scripts: Record<string, string> = { ...pkg.scripts, commitlint: 'commitlint --edit' }
  const patched: PackageJsonLike = {
    ...pkg,
    scripts,
  }

  // 只增不删：不传 --czgit 的意思是「这次不配置 czgit」，不是「把我已有的 commitizen
  // 配置删掉」—— 何况用户用的适配器未必就是 cz-git。
  if (options.czgit) {
    scripts.cz = 'git cz'
    // 往里多合并一层而不是直接覆盖：cz-git 的配置挂在 config.commitizen 下，
    // 那里除了 path 还有 alias/messages/types/scopes 等，只合并外层会丢掉这些数据
    patched.config = {
      ...pkg.config,
      commitizen: { ...pkg.config?.commitizen, path: 'node_modules/cz-git' },
    }
  }

  return patched
}

/** 要么是我们准备生成的配置，要么是「沿用项目自己那份」的理由 */
function planConfigWrite(existing: string | undefined): { write: boolean, reason?: string } {
  return existing ? { write: false, reason: MSG_FOR.configExists(existing) } : { write: true }
}

/**
 * 决定一个钩子文件最终应该包含什么 —— 纯函数
 *
 * husky 9 的 init 会无条件覆盖 `.husky/pre-commit`，所以 init() 必须先把用户的
 * 原内容快照下来。而把快照原样写回去，会让我们的命令根本没进钩子：配置过程报告
 * 成功，可提交时 lint-staged 从来没跑过。所以是追加，不是替换。
 */
export function resolveHookContent(
  original: string | undefined,
  command: string,
): { content: string, action: 'created' | 'appended' | 'unchanged' } {
  if (original === undefined)
    return { content: command, action: 'created' }

  // 按行精确匹配，不是子串判断：`lint-staged-extra` 不是我们的命令
  if (original.split('\n').some(line => line.trim() === command))
    return { content: original, action: 'unchanged' }

  const separator = original.endsWith('\n') ? '' : '\n'
  return { content: `${original}${separator}${command}\n`, action: 'appended' }
}

export interface FileJournal {
  /** 在我们动某个文件之前记住它的状态。每次写入前都要调用。 */
  capture: (path: string) => void
  /** 把每个记录过的文件恢复原样 */
  rollback: () => Promise<void>
}

/**
 * 这个脚本写入文件的撤销日志
 *
 * 从前跑到一半失败会给项目留下一个配了一半的状态 —— 包装好了、配置写了几个、
 * 钩子一个没有。IO 由外部注入，好让它不碰真实文件系统也能测。
 *
 * 刻意「不」回滚的两件事：依赖安装（卸载可能把项目本来就想要的包一并删掉）、
 * 以及 `git init`（初始化过的仓库无害，而删 .git 这个风险任何时候都不值得冒）。
 */
export function createFileJournal(io: {
  exists: (path: string) => boolean
  read: (path: string) => string
  write: (path: string, content: string) => Promise<void>
  remove: (path: string) => Promise<void>
}): FileJournal {
  // null 表示「之前并不存在」，所以回滚时是删除而不是还原
  const before = new Map<string, string | null>()

  return {
    capture(path) {
      if (before.has(path))
        return
      before.set(path, io.exists(path) ? io.read(path) : null)
    },
    async rollback() {
      for (const [path, content] of before) {
        if (content === null) {
          if (io.exists(path))
            await io.remove(path)
        }
        else {
          await io.write(path, content)
        }
      }
    },
  }
}

export interface ProjectSurvey {
  needsGitInit: boolean
  /** husky 9 已经不再读取的 husky v4 残留配置 */
  huskyV4?: { source: string, hooks: Record<string, string> }
  commitlint: { write: boolean, reason?: string }
  lintStaged: { write: boolean, reason?: string }
  hooks: { path: string, content: string, action: 'created' | 'appended' | 'unchanged' }[]
}

/**
 * 把 init() 需要做的判断全部算出来，过程中不改动任何东西
 *
 * 纯函数 —— 文件系统和 package.json 都经由 `env` 传进来。把所有决定集中在这里
 * （而不是散在各处写入操作之间），既让它们脱离文件系统也能测，也给将来的 `doctor`
 * 留了一个可以直接复用的地方。
 *
 * 钩子内容必须在这里读，也就是在 `husky init` 之前：husky 9 会无条件覆盖
 * `.husky/pre-commit`（它源码里根本没有存在性检查），之后再读就只能读到
 * husky 自己生成的那个桩了。
 */
export function surveyProject(
  plan: SetupPlan,
  env: {
    exists: (file: string) => boolean
    readHook: (path: string) => string | undefined
    pkg: PackageJsonLike
  },
): ProjectSurvey {
  const existingCommitlint = findExistingConfig(COMMITLINT_CONFIG_FILES, env.exists)
    ?? (env.pkg.commitlint ? MSG.pkgFieldCommitlint : undefined)
  const existingLintStaged = findExistingConfig(LINT_STAGED_CONFIG_FILES, env.exists)
    ?? (env.pkg['lint-staged'] ? MSG.pkgFieldLintStaged : undefined)

  return {
    needsGitInit: !env.exists('.git'),
    huskyV4: detectHuskyV4(env.exists, env.pkg),
    commitlint: planConfigWrite(existingCommitlint),
    lintStaged: planConfigWrite(existingLintStaged),
    hooks: plan.hooks.map((hook) => {
      const { content, action } = resolveHookContent(env.readHook(hook.path), hook.content)
      return { path: hook.path, content, action }
    }),
  }
}

async function resolveLinterChoice(options: ArgvOptions): Promise<LinterKind | 'none'> {
  const flag = typeof options.linter === 'string' ? options.linter.toLowerCase() : undefined
  if (flag === 'none')
    return 'none'
  if (flag && isLinterKind(flag))
    return flag
  if (flag)
    printWarn(MSG_FOR.unknownLinter(String(options.linter)))

  const detected = detectLinter()
  if (detected)
    return detected

  if (!isInteractive()) {
    printWarn(MSG.noLinterNonInteractive)
    return 'none'
  }

  const answer = await promptLinterChoice()
  if (answer === undefined) {
    printWarn(MSG.promptCancelled)
    return 'none'
  }
  return answer
}

export async function init(options: ArgvOptions) {
  const spinner = yoctoSpinner()
  // 包管理器与 monorepo 判定在这里解析一次，下面每条命令都复用这个结果
  const pm = createPackageManager()
  const linterChoice = await resolveLinterChoice(options)
  const plan = planSetup(options, { isTsProject: isTsProject(), pm, linter: linterChoice })

  const cwd = process.cwd()
  const survey = surveyProject(plan, {
    exists: file => existsSync(resolve(cwd, file)),
    readHook: hookPath => existsSync(resolve(cwd, hookPath)) ? readFileSync(resolve(cwd, hookPath), 'utf-8') : undefined,
    pkg: getPackageJSON(),
  })

  const journal = createFileJournal({
    exists: file => existsSync(resolve(cwd, file)),
    read: file => readFileSync(resolve(cwd, file), 'utf-8'),
    write: (file, fileContent) => w(resolve(cwd, file), fileContent),
    remove: file => rm(resolve(cwd, file), { force: true }),
  })

  try {
    await runSetup({ options, plan, survey, pm, spinner, cwd, linterChoice, journal })
  }
  catch (error) {
    // 给项目留下一个配了一半的状态，比失败本身更糟
    await journal.rollback()
    printWarn(MSG.rollbackDone)
    throw error
  }
}

interface SetupContext {
  options: ArgvOptions
  plan: SetupPlan
  survey: ProjectSurvey
  pm: PackageManager
  spinner: ReturnType<typeof yoctoSpinner>
  cwd: string
  linterChoice: LinterKind | 'none'
  journal: FileJournal
}

async function runSetup({ options, plan, survey, pm, spinner, cwd, linterChoice, journal }: SetupContext) {
  if (survey.huskyV4) {
    const hooks = Object.entries(survey.huskyV4.hooks)
    const detail = hooks.length
      ? MSG_FOR.huskyV4Detail(hooks.map(([name, command]) => `${name} -> ${command}`).join('；'))
      : ''
    printWarn(MSG_FOR.huskyV4Found(survey.huskyV4.source, detail))
  }

  if (survey.needsGitInit) {
    spinner.start(MSG.spinnerGitInitStart)
    await execCommand('git init')
    spinner.success(MSG.spinnerGitInitDone)
  }

  spinner.start(MSG.spinnerInstallStart)
  await pm.ensureInstalled(plan.packages, { dev: true })
  spinner.success(MSG.spinnerInstallDone)

  spinner.start(MSG.spinnerCommitlintStart)
  const { name, content } = plan.configFile
  if (!survey.commitlint.write) {
    spinner.stop()
    printInfo(MSG_FOR.keptCommitlint(survey.commitlint.reason!))
  }
  else {
    journal.capture(name)
    await w(name, content)
    spinner.success(MSG.spinnerCommitlintDone)
  }

  spinner.start(MSG.spinnerLintStagedStart)
  const { name: lintStagedName, content: lintStagedContent } = plan.lintStagedConfigFile
  if (!survey.lintStaged.write) {
    spinner.stop()
    printInfo(MSG_FOR.keptLintStaged(survey.lintStaged.reason!))
  }
  else {
    journal.capture(lintStagedName)
    await w(lintStagedName, lintStagedContent)
    spinner.success(MSG.spinnerLintStagedDone)
  }

  spinner.start(MSG.spinnerHuskyStart)
  for (const hook of survey.hooks)
    journal.capture(hook.path)
  await pm.exec('husky init')
  for (const hook of survey.hooks) {
    // 还原用户的原内容（husky init 可能刚把它冲掉了），并在后面追加我们的命令，
    // 这样他们的钩子照常工作，我们的也真的会跑
    await w(resolve(cwd, hook.path), hook.content)
    if (hook.action === 'appended')
      printWarn(MSG_FOR.hookAppended(hook.path))
    else if (hook.action === 'unchanged')
      printInfo(MSG_FOR.hookUnchanged(hook.path))
  }
  spinner.success(MSG.spinnerHuskyDone)

  spinner.start(MSG.spinnerPkgJsonStart)
  journal.capture('package.json')
  // husky init 可能刚往 package.json 里写了 scripts.prepare，所以这里必须重新读，
  // 不能复用上面 surveyProject 拿到的快照 —— 否则会把 husky 的写入覆盖掉
  await writePackageJSON(patchPackageJSON(getPackageJSON(), options))
  spinner.success(MSG.spinnerPkgJsonDone)

  if (linterChoice !== 'none' && isLinterInstalled(linterChoice)) {
    spinner.start(MSG.spinnerLintStart)
    // 直接跑项目本地的 linter，而不是往 package.json 里塞一个临时脚本；
    // 这里格式化失败不影响配置结果，配置文件到这一步已经写完了
    const lintTargets = ['package.json', name]
    if (survey.lintStaged.write || existsSync(resolve(cwd, lintStagedName)))
      lintTargets.push(lintStagedName)
    await pm.exec(getFixCommand(linterChoice, lintTargets), { allowFailure: true })
    spinner.success(MSG.spinnerLintDone)
  }
}
