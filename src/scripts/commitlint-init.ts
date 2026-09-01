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

/**
 * Reads the content of any hook files that already exist
 *
 * Must be called before husky init: husky 9's init unconditionally overwrites
 * `.husky/pre-commit` (no existence check in its source), so reading after it
 * runs would only see husky's generated `npm test` — the user's original hook
 * would already be gone
 */
function snapshotExistingHooks(cwd: string, hooks: HookFile[]): Map<string, string> {
  const snapshot = new Map<string, string>()
  for (const hook of hooks) {
    const target = resolve(cwd, hook.path)
    if (existsSync(target))
      snapshot.set(hook.path, readFileSync(target, 'utf-8'))
  }
  return snapshot
}

async function resolveLinterChoice(options: ArgvOptions): Promise<LinterKind | 'none'> {
  const flag = typeof options.linter === 'string' ? options.linter.toLowerCase() : undefined
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

export async function init(options: ArgvOptions) {
  const spinner = yoctoSpinner()
  // Package manager and monorepo detection resolve once here, reused by every command below
  const pm = createPackageManager()
  const linterChoice = await resolveLinterChoice(options)
  const plan = planSetup(options, { isTsProject: isTsProject(), pm, linter: linterChoice })

  const cwd = process.cwd()
  const path = resolve(cwd, '.git')
  if (!existsSync(path)) {
    spinner.start('git init checking...')
    await execCommand('git init')
    spinner.success('git init down!')
  }

  spinner.start('install running')
  await pm.ensureInstalled(plan.packages, { dev: true })
  spinner.success('install succeed!')

  spinner.start('commitlint config running...')
  const { name, content } = plan.configFile
  // Scan every filename commitlint understands, not just the one we would write —
  // otherwise a project with `.commitlintrc.json` ends up with two rival configs
  const existingCommitlintConfig = findExistingConfig(COMMITLINT_CONFIG_FILES, file => existsSync(resolve(cwd, file)))
    ?? (getPackageJSON().commitlint ? 'the package.json "commitlint" field' : undefined)
  if (existingCommitlintConfig) {
    spinner.stop()
    printWarn(`commitlint config already exists (${existingCommitlintConfig}), skipped.`)
  }
  else {
    await w(name, content)
    spinner.success('commitlint config succeed!')
  }

  spinner.start('lint-staged config running...')
  const { name: lintStagedName, content: lintStagedContent } = plan.lintStagedConfigFile
  let lintStagedFilePresent = existsSync(resolve(cwd, lintStagedName))
  // Any of lint-staged's own config filenames counts, plus the legacy inline
  // package.json field — all of them are a user config we must not overwrite
  const existingLintStagedConfig = findExistingConfig(LINT_STAGED_CONFIG_FILES, file => existsSync(resolve(cwd, file)))
    ?? (getPackageJSON()['lint-staged'] ? 'the package.json "lint-staged" field' : undefined)
  if (existingLintStagedConfig) {
    spinner.stop()
    printWarn(`lint-staged config already exists (${existingLintStagedConfig}), skipped.`)
  }
  else {
    await w(lintStagedName, lintStagedContent)
    lintStagedFilePresent = true
    spinner.success('lint-staged config succeed!')
  }

  spinner.start('husky config running...')
  const existingHooks = snapshotExistingHooks(cwd, plan.hooks)
  await pm.exec('husky init')
  for (const hook of plan.hooks) {
    // Restores the user's original content (husky init may have just clobbered it) and
    // appends our command, so their hook keeps working and ours actually runs
    const { content: hookContent, action } = resolveHookContent(existingHooks.get(hook.path), hook.content)
    await w(resolve(cwd, hook.path), hookContent)
    if (action === 'appended')
      printWarn(`${hook.path} already exists — appended \`${hook.content}\` to your version.`)
    else if (action === 'unchanged')
      printWarn(`${hook.path} already runs \`${hook.content}\`, left as is.`)
  }
  spinner.success('husky config succeed!')

  spinner.start('package.json writing...')
  // husky init may have just written scripts.prepare into package.json, so this must
  // re-read rather than reuse the snapshot from the lint-staged check above — otherwise
  // husky's write would get overwritten
  await writePackageJSON(patchPackageJSON(getPackageJSON(), options))
  spinner.success('package.json writing succeed!')

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
