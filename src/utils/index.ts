/* eslint-disable regexp/no-unused-capturing-group */
import fs from 'node:fs'
import { writeFile as w } from 'node:fs/promises'
import path, { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa, parseCommandString } from 'execa'
import figlet from 'figlet'
import bannerFont from 'figlet/importable-fonts/ANSI Shadow.js'
import gradient from 'gradient-string'
import colors from 'picocolors'
import terminalLink from 'terminal-link'
import { parse as parseYaml } from 'yaml'
import { DEFAULT_PKG_NAME, REPO_URL } from '@/constants'
import { MSG, MSG_FOR } from '@/constants/messages'

export interface ArgvOptions {
  clear?: boolean
  czgit?: boolean
  help?: boolean
  version?: boolean
  linter?: string
}

export interface PackageJsonLike {
  'scripts'?: Record<string, string>
  'dependencies'?: Record<string, string>
  'devDependencies'?: Record<string, string>
  'lint-staged'?: Record<string, string>
  'config'?: {
    // cz-git also supports alias / messages / types / scopes etc. alongside path
    commitizen?: { path: string, [key: string]: any }
    [key: string]: any
  }
  [key: string]: any
}

const { bold, dim, bgYellow, bgRed, bgCyan, isColorSupported } = colors

const BRAND_NAME = 'TODO-SCRIPT'
const BANNER_FONT_NAME = 'todo-script-banner'
/** figlet's 'ANSI Shadow' font renders "TODO-SCRIPT" at a measured 85 columns wide; this leaves a safety margin */
const BANNER_MIN_WIDTH = 90
const BANNER_GRADIENT_COLORS = ['#00c6ff', '#a34dff']

let isBannerFontRegistered = false

/**
 * An expected failure during script execution
 *
 * Leaf functions only throw it — they never print or terminate the process;
 * that all happens in bin/index.js, the only place that calls process.exit.
 * Any error that isn't a ScriptError is treated as a real bug and left to
 * node's own full stack trace.
 */
export class ScriptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScriptError'
  }
}

export function printWarn(msg: string) {
  console.log(' ')
  console.log(`${bgYellow(' WARN ')} ${msg}`)
  console.log(' ')
}

/**
 * Neutral notice, for outcomes that are correct rather than concerning
 *
 * Skipping a config the project already has is the tool working as intended, not
 * a warning — rendering it in warning yellow reads as "something went wrong" and
 * trains people to ignore the messages that do matter.
 */
export function printInfo(msg: string) {
  console.log(' ')
  console.log(`${bgCyan(' INFO ')} ${msg}`)
  console.log(' ')
}

export function printErr(msg: string) {
  console.log(' ')
  console.log(`${bgRed(' ERROR ')} ${msg}`)
  console.log(' ')
}

/**
 * Decides whether the banner renders as a gradient wordmark or plain text,
 * based on terminal width and rendering capability
 *
 * Pure function that never touches process.stdout, so this decision logic stays unit-testable
 * @param columns - the terminal's available column width
 * @param canRenderGradient - true only when stdout is a real TTY that supports color
 */
export function resolveBannerMode(columns: number, canRenderGradient: boolean): 'gradient' | 'plain' {
  if (!canRenderGradient)
    return 'plain'
  if (columns < BANNER_MIN_WIDTH)
    return 'plain'
  return 'gradient'
}

/**
 * Whether this is a real interactive terminal — never true in CI or when
 * stdin isn't a TTY (piped input, non-interactive test runners)
 */
/** This CLI's own version, straight from its package.json */
export function getCliVersion(): string {
  return getPkgInfo().version ?? 'unknown'
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI
}

/**
 * Only renders the gradient wordmark when stdout is a real TTY, supports color,
 * and is wide enough. picocolors alone isn't sufficient on win32 — it reports
 * color support without checking TTY-ness — so isTTY is checked explicitly here
 * rather than inferred from columns being 0.
 */
export function banner() {
  const { version = '--', author = 'HuberyYang' } = getPkgInfo()
  const canRenderGradient = isColorSupported && Boolean(process.stdout.isTTY)
  const mode = resolveBannerMode(process.stdout.columns ?? 0, canRenderGradient)

  console.log('')
  if (mode === 'gradient') {
    if (!isBannerFontRegistered) {
      figlet.parseFont(BANNER_FONT_NAME, bannerFont)
      isBannerFontRegistered = true
    }
    const wordmark = figlet.textSync(BRAND_NAME, { font: BANNER_FONT_NAME })
    console.log(gradient(BANNER_GRADIENT_COLORS).multiline(wordmark))
  }
  else {
    console.log(bold(BRAND_NAME))
  }

  const isSupportLink = terminalLink.isSupported
  let versionText = dim(`v${version}`)
  const authorLabel = `${author}`
  const authorText = isSupportLink ? terminalLink(dim(authorLabel), REPO_URL) : dim(authorLabel)
  if (isSupportLink)
    versionText = terminalLink(versionText, `https://www.npmjs.com/package/${DEFAULT_PKG_NAME}`)

  console.log(`${versionText} ${dim('-')} ${authorText}`)
  if (!isSupportLink)
    console.log(dim(`(${REPO_URL})`))
  console.log('')
}

/**
 * Reads this CLI's own package.json
 *
 * Walks up from wherever this module ends up rather than using a fixed relative
 * path: the source sits at `src/utils/` but the build collapses it into `dist/`,
 * so any single `../` guess is wrong in one of the two layouts.
 */
function getPkgInfo() {
  let dirPath = path.dirname(fileURLToPath(import.meta.url))

  while (true) {
    try {
      return JSON.parse(fs.readFileSync(path.resolve(dirPath, 'package.json'), 'utf-8'))
    }
    catch {
      const parent = path.dirname(dirPath)
      if (parent === dirPath)
        return {}
      dirPath = parent
    }
  }
}

export async function execCommand(command: string) {
  const [file, ...commandArguments] = parseCommandString(command)
  try {
    await execa(file, commandArguments)
  }
  catch (e) {
    throw new ScriptError(MSG_FOR.execFailed(command), { cause: e })
  }
}

/**
 * Reads package.json, returning undefined if the file doesn't exist
 *
 * The only difference from getPackageJSON is that it swallows the "file
 * missing" case; a parse failure still throws — that's a real error and
 * shouldn't be silenced
 */
function tryReadPackageJSON(): PackageJsonLike | undefined {
  return isRootFileExist('package.json') ? getPackageJSON() : undefined
}

/**
 * Whether the project already has this dependency
 *
 * Both checks must pass: it exists under node_modules, and it's declared
 * in package.json. Checking node_modules alone can be fooled by a hoisted
 * transitive dependency — never written to package.json, yet judged
 * "installed" and skipped; checking only the declaration risks a package
 * that's declared but never actually installed.
 */
export function hasDependency(pkg: string): boolean {
  if (!isRootFileExist(`node_modules/${pkg}`))
    return false

  const json = tryReadPackageJSON()
  return Boolean(json?.dependencies?.[pkg] || json?.devDependencies?.[pkg])
}

/**
 * Checks whether a file exists in the project root
 */
export function isRootFileExist(file: string): boolean {
  const cwd = process.cwd()
  const path = resolve(cwd, file)
  return fs.existsSync(path)
}

/**
 * check whether the project is a monorepo
 * by detecting a non-empty `packages` field in pnpm-workspace.yaml
 * or a non-empty `workspaces` field in package.json
 */
export function isMonorepo(): boolean {
  // A predicate shouldn't halt the flow: treat a missing package.json as
  // "not a monorepo" rather than letting getPackageJSON's "file missing" error escape from here
  const pkg = tryReadPackageJSON()
  if (Array.isArray(pkg?.workspaces) && pkg.workspaces.length > 0)
    return true

  if (!isRootFileExist('pnpm-workspace.yaml'))
    return false

  try {
    const raw = fs.readFileSync(resolve(process.cwd(), 'pnpm-workspace.yaml'), 'utf-8')
    const data = parseYaml(raw) as { packages?: string[] } | undefined
    return Array.isArray(data?.packages) && data.packages.length > 0
  }
  catch {
    return false
  }
}

/**
 * check whether the project is a TypeScript project
 * by scanning for tsconfig*.json files in the project root
 */
export function isTsProject(): boolean {
  const cwd = process.cwd()
  const files = fs.readdirSync(cwd)
  return files.some(file => /^tsconfig(\..*)?\.json$/.test(file))
}

/**
 * get the package.json in object format
 *
 * Always throws if the file is missing or invalid, so callers get back a
 * valid object without needing a null check
 */
export function getPackageJSON(): PackageJsonLike {
  const cwd = process.cwd()
  const path = resolve(cwd, 'package.json')
  if (!isRootFileExist('package.json'))
    throw new ScriptError(MSG.cannotFindPackageJson)

  try {
    const raw = fs.readFileSync(path, 'utf-8')
    const data = JSON.parse(raw)
    return data
  }
  catch (e) {
    throw new ScriptError(MSG.parsePackageJsonFailed, { cause: e })
  }
}

export async function writePackageJSON(data: PackageJsonLike) {
  try {
    await w('package.json', `${JSON.stringify(data, null, 2)}\n`)
  }
  catch (e) {
    throw new ScriptError(MSG.writePackageJsonFailed, { cause: e })
  }
}
