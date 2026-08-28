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

export interface ArgvOptions {
  clear?: boolean
  czgit?: boolean
  help?: boolean
}

export interface PackageJsonLike {
  'scripts'?: Record<string, string>
  'dependencies'?: Record<string, string>
  'devDependencies'?: Record<string, string>
  'lint-staged'?: Record<string, string>
  'config'?: {
    // cz-git 在 path 之外还支持 alias / messages / types / scopes 等字段
    commitizen?: { path: string, [key: string]: any }
    [key: string]: any
  }
  [key: string]: any
}

const { bold, dim, bgYellow, bgRed, isColorSupported } = colors

const BRAND_NAME = 'TODO-SCRIPT'
const BANNER_FONT_NAME = 'todo-script-banner'
/** figlet 'ANSI Shadow' 字体渲染 "TODO-SCRIPT" 的实测宽度是 85 列，留出安全边距 */
const BANNER_MIN_WIDTH = 90
const BANNER_GRADIENT_COLORS = ['#00c6ff', '#a34dff']

let isBannerFontRegistered = false

/**
 * 脚本执行过程中的预期内失败
 *
 * 叶子函数只负责抛出它，不负责打印、更不负责结束进程；
 * 收口在 bin/index.js —— 那里是唯一调用 process.exit 的地方。
 * 非 ScriptError 的错误视为真实 bug，交给 node 打完整堆栈。
 */
export class ScriptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScriptError'
  }
}

/**
 * print warning message
 */
export function printWarn(msg: string) {
  console.log(' ')
  console.log(`${bgYellow(' WARN ')} ${msg}`)
  console.log(' ')
}

/**
 * print error message
 */
export function printErr(msg: string) {
  console.log(' ')
  console.log(`${bgRed(' ERROR ')} ${msg}`)
  console.log(' ')
}

/**
 * 根据终端宽度与渲染能力，决定 banner 用渐变大字还是纯文本
 *
 * 纯函数，不碰 process.stdout，方便单测覆盖判定逻辑
 * @param {number} columns - 终端可用列宽
 * @param {boolean} canRenderGradient - 是否可以渲染渐变（真终端 TTY 且支持颜色）
 * @returns {'gradient' | 'plain'} - 渲染模式
 */
export function resolveBannerMode(columns: number, canRenderGradient: boolean): 'gradient' | 'plain' {
  if (!canRenderGradient)
    return 'plain'
  if (columns < BANNER_MIN_WIDTH)
    return 'plain'
  return 'gradient'
}

/**
 * print banner
 *
 * 只有真终端（TTY）+ 支持颜色 + 宽度足够时才渲染渐变大字：
 * picocolors 在 win32 上不看 TTY 直接判定支持颜色，
 * 所以这里显式带上 isTTY，不能只靠 columns 是否为 0 去间接判断
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
 * get package information
 */
function getPkgInfo() {
  const filePath = fileURLToPath(import.meta.url)
  const dirPath = path.dirname(filePath)
  const packageJsonPath = path.resolve(dirPath, '../package.json')

  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf-8')
    const data = JSON.parse(raw)
    return data
  }
  catch {
    return {}
  }
}

/**
 * execute command
 * @param {string} command - command to be executed
 */
export async function execCommand(command: string) {
  const [file, ...commandArguments] = parseCommandString(command)
  try {
    await execa(file, commandArguments)
  }
  catch (e) {
    throw new ScriptError(`Failed to execute '${command}'.`, { cause: e })
  }
}

/**
 * 读取 package.json，文件不存在时返回 undefined
 *
 * 与 getPackageJSON 的区别只在于吞掉「文件不存在」这一种情况；
 * 内容解析失败仍然抛错 —— 那是真实错误，不该被静默
 * @returns {PackageJsonLike | undefined} - package.json 内容
 */
function tryReadPackageJSON(): PackageJsonLike | undefined {
  return isRootFileExist('package.json') ? getPackageJSON() : undefined
}

/**
 * 项目是否已经具备这个依赖
 *
 * 需要同时满足：node_modules 下确实存在，且 package.json 里声明过。
 * 只看 node_modules 会被提升上来的传递依赖骗过 —— 依赖并没有写进
 * package.json，却被判定为「已安装」而跳过安装；只看声明则可能拿到
 * 一个没有真正装上的包。
 * @param {string} pkg - package name
 * @returns {boolean} - result
 */
export function hasDependency(pkg: string): boolean {
  if (!isRootFileExist(`node_modules/${pkg}`))
    return false

  const json = tryReadPackageJSON()
  return Boolean(json?.dependencies?.[pkg] || json?.devDependencies?.[pkg])
}

/**
 * check whether the package.json file exists
 * @returns {boolean} - result
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
 * @returns {boolean} - result
 */
export function isMonorepo(): boolean {
  // 谓词不应该终止流程：没有 package.json 时判定为非 monorepo，
  // 而不是让 getPackageJSON 的「文件不存在」错误从这里抛出去
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
 * @returns {boolean} - result
 */
export function isTsProject(): boolean {
  const cwd = process.cwd()
  const files = fs.readdirSync(cwd)
  return files.some(file => /^tsconfig(\..*)?\.json$/.test(file))
}

/**
 * get the package.json in object format
 *
 * 文件不存在或解析失败一律抛错，因此调用方拿到的一定是有效对象、无需再判空
 */
export function getPackageJSON(): PackageJsonLike {
  const cwd = process.cwd()
  const path = resolve(cwd, 'package.json')
  if (!isRootFileExist('package.json'))
    throw new ScriptError('Cannot find package.json in the current directory.')

  try {
    const raw = fs.readFileSync(path, 'utf-8')
    const data = JSON.parse(raw)
    return data
  }
  catch (e) {
    throw new ScriptError('Failed to parse package.json.', { cause: e })
  }
}

/**
 * write package.json
 * @param {PackageJsonLike} data - content
 */
export async function writePackageJSON(data: PackageJsonLike) {
  try {
    await w('package.json', `${JSON.stringify(data, null, 2)}\n`)
  }
  catch (e) {
    throw new ScriptError('Failed to write in package.json.', { cause: e })
  }
}
