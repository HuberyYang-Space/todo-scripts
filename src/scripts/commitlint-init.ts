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
  /** Packages that need to be installed */
  packages: string[]
  /** The commitlint config file to generate */
  configFile: { name: string, content: string }
  /** The lint-staged config file to generate */
  lintStagedConfigFile: { name: string, content: string }
  /** The husky hooks to write */
  hooks: HookFile[]
}

/**
 * Every filename commitlint picks up, in cosmiconfig's own search order
 *
 * Checking only the one file we are about to write would miss an existing
 * `.commitlintrc` (or a `.cjs` variant) and leave the project with two competing
 * configs, one of which silently loses.
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

/** Same idea for lint-staged. The package.json `lint-staged` field is checked separately. */
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
 * husky v4's own config locations, in cosmiconfig's search order
 *
 * husky 9 ignores all of these. A project upgraded in place keeps the files, so
 * the hooks they define silently stopped running at some point — worth saying out
 * loud rather than quietly scaffolding a second, working setup beside them.
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

/** Leftover husky v4 config, if any — pure, existence and manifest are injected */
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
 * Returns the first candidate that exists — a pure function, existence is injected
 */
export function findExistingConfig(
  candidates: string[],
  exists: (file: string) => boolean,
): string | undefined {
  return candidates.find(file => exists(file))
}

/**
 * Decides what to generate — a pure function that never touches the filesystem or runs commands
 *
 * This only covers decisions that can be computed up front. Whether a husky hook
 * write gets skipped is not one of them: that depends on the side effects of
 * running `husky init`, so it has to stay in init().
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
    // Always .mjs: it's ESM regardless of the target project's package.json "type" field
    lintStagedConfigFile: { name: 'lint-staged.config.mjs', content: renderLintStagedConfig(env.linter) },
    hooks: [
      // Hooks are shell scripts — we write a command string here, not execute it, hence formatExec
      { path: '.husky/pre-commit', content: env.pm.formatExec('lint-staged') },
      { path: '.husky/commit-msg', content: env.pm.formatExec('commitlint --edit "$1"') },
    ],
  }
}

/**
 * Computes the patched package.json — a pure function that never mutates the input
 */
export function patchPackageJSON(pkg: PackageJsonLike, options: ArgvOptions): PackageJsonLike {
  const scripts: Record<string, string> = { ...pkg.scripts, commitlint: 'commitlint --edit' }
  const patched: PackageJsonLike = {
    ...pkg,
    scripts,
  }

  // Only ever adds czgit wiring, never removes it. Omitting --czgit means "don't set
  // czgit up this time", not "delete the commitizen setup I already have" — and the
  // user's adapter may not even be cz-git.
  if (options.czgit) {
    scripts.cz = 'git cz'
    // Merge one level deeper instead of overwriting: cz-git's config lives under
    // config.commitizen (alongside path there's also alias/messages/types/scopes etc.),
    // so merging only the outer layer would lose that inner data
    patched.config = {
      ...pkg.config,
      commitizen: { ...pkg.config?.commitizen, path: 'node_modules/cz-git' },
    }
  }

  return patched
}

/** A config we would generate, or the reason we are leaving the project's own alone */
function planConfigWrite(existing: string | undefined): { write: boolean, reason?: string } {
  return existing ? { write: false, reason: MSG_FOR.configExists(existing) } : { write: true }
}

/**
 * Decides what a hook file should end up containing — a pure function
 *
 * husky 9's init unconditionally overwrites `.husky/pre-commit`, so init() has to
 * snapshot the user's original content first. Writing that snapshot straight back
 * would leave our command out of the hook entirely: setup reports success while
 * lint-staged never actually runs on commit. So append instead of replacing.
 */
export function resolveHookContent(
  original: string | undefined,
  command: string,
): { content: string, action: 'created' | 'appended' | 'unchanged' } {
  if (original === undefined)
    return { content: command, action: 'created' }

  // Line-level exact match, not a substring test: `lint-staged-extra` is not our command
  if (original.split('\n').some(line => line.trim() === command))
    return { content: original, action: 'unchanged' }

  const separator = original.endsWith('\n') ? '' : '\n'
  return { content: `${original}${separator}${command}\n`, action: 'appended' }
}

export interface FileJournal {
  /** Remembers a file's state before we touch it. Call before every write. */
  capture: (path: string) => void
  /** Puts every captured file back the way it was */
  rollback: () => Promise<void>
}

/**
 * Undo log for the files this script writes
 *
 * A failure partway through used to leave the project half-configured — packages
 * installed, some configs written, no hooks. IO is injected so this stays testable
 * without touching a real filesystem.
 *
 * Deliberately NOT rolled back: the dependency install (uninstalling could remove
 * packages the project already wanted) and `git init` (an initialised repo is
 * harmless, and removing .git is never worth the risk).
 */
export function createFileJournal(io: {
  exists: (path: string) => boolean
  read: (path: string) => string
  write: (path: string, content: string) => Promise<void>
  remove: (path: string) => Promise<void>
}): FileJournal {
  // null means "did not exist before", so rollback deletes rather than restores
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
  /** Leftover husky v4 config that husky 9 no longer reads */
  huskyV4?: { source: string, hooks: Record<string, string> }
  commitlint: { write: boolean, reason?: string }
  lintStaged: { write: boolean, reason?: string }
  hooks: { path: string, content: string, action: 'created' | 'appended' | 'unchanged' }[]
}

/**
 * Works out everything init() needs to decide, without changing anything
 *
 * Pure — the filesystem and package.json arrive through `env`. Keeping every
 * decision here (rather than inline among the writes) is what makes them testable
 * without a filesystem, and gives a future `doctor` command one place to reuse.
 *
 * Hook contents must be read here, i.e. before `husky init`: husky 9 overwrites
 * `.husky/pre-commit` unconditionally (no existence check in its source), so
 * reading afterwards would only ever see husky's own generated stub.
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
  // Package manager and monorepo detection resolve once here, reused by every command below
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
    // Leaving a half-configured project behind is worse than the failure itself
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
    // Restores the user's original content (husky init may have just clobbered it)
    // with our command appended, so their hook keeps working and ours actually runs
    await w(resolve(cwd, hook.path), hook.content)
    if (hook.action === 'appended')
      printWarn(MSG_FOR.hookAppended(hook.path))
    else if (hook.action === 'unchanged')
      printInfo(MSG_FOR.hookUnchanged(hook.path))
  }
  spinner.success(MSG.spinnerHuskyDone)

  spinner.start(MSG.spinnerPkgJsonStart)
  journal.capture('package.json')
  // husky init may have just written scripts.prepare into package.json, so this must
  // re-read rather than reuse the snapshot taken by surveyProject above — otherwise
  // husky's write would get overwritten
  await writePackageJSON(patchPackageJSON(getPackageJSON(), options))
  spinner.success(MSG.spinnerPkgJsonDone)

  if (linterChoice !== 'none' && isLinterInstalled(linterChoice)) {
    spinner.start(MSG.spinnerLintStart)
    // Run the project's local linter directly instead of stashing a temp script into
    // package.json; a formatting failure here doesn't affect setup, the config files are
    // already written by this point
    const lintTargets = ['package.json', name]
    if (survey.lintStaged.write || existsSync(resolve(cwd, lintStagedName)))
      lintTargets.push(lintStagedName)
    await pm.exec(getFixCommand(linterChoice, lintTargets), { allowFailure: true })
    spinner.success(MSG.spinnerLintDone)
  }
}
