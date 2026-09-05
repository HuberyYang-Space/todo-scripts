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
    // cz-git 的 config.commitizen 下除了 path，还支持 alias / messages / types / scopes 等
    commitizen?: { path: string, [key: string]: any }
    [key: string]: any
  }
  [key: string]: any
}

const { bold, dim, bgYellow, bgRed, bgCyan, isColorSupported } = colors

const BRAND_NAME = 'TODO-SCRIPT'
const BANNER_FONT_NAME = 'todo-script-banner'
/** figlet 的 'ANSI Shadow' 字体渲染 "TODO-SCRIPT" 实测占 85 列宽，这里留一点余量 */
const BANNER_MIN_WIDTH = 90
const BANNER_GRADIENT_COLORS = ['#00c6ff', '#a34dff']

let isBannerFontRegistered = false

/**
 * 脚本执行过程中预期之内的失败
 *
 * 叶子函数只负责抛出它，从不打印、也不终止进程 —— 那些都发生在 bin/index.js，
 * 那里是唯一调用 process.exit 的地方。不是 ScriptError 的错误一律当成真正的
 * bug，交给 node 打完整堆栈。
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
 * 中性提示，用于「结果正确」而非「需要担心」的情况
 *
 * 跳过项目已有的配置是这个工具在正常工作，不是警告 —— 用警告黄渲染会让人读成
 * 「哪里出错了」，久而久之就学会了无视真正要紧的那些消息。
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
 * 根据终端宽度和渲染能力，决定 banner 用渐变字标还是纯文本
 *
 * 纯函数，从不碰 process.stdout，好让这段判断逻辑可以被单测覆盖
 * @param columns - 终端可用的列宽
 * @param canRenderGradient - 只有 stdout 是支持颜色的真实 TTY 时才为 true
 */
export function resolveBannerMode(columns: number, canRenderGradient: boolean): 'gradient' | 'plain' {
  if (!canRenderGradient)
    return 'plain'
  if (columns < BANNER_MIN_WIDTH)
    return 'plain'
  return 'gradient'
}

/** 这个 CLI 自己的版本号，直接取自它自己的 package.json */
export function getCliVersion(): string {
  return getPkgInfo().version ?? 'unknown'
}

/**
 * 当前是不是一个真正的交互式终端 —— 在 CI 里、或 stdin 不是 TTY 时
 * （管道输入、非交互的测试运行器）永远为 false
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI
}

/**
 * 只有当 stdout 是真实 TTY、支持颜色、且宽度足够时才渲染渐变字标。
 * 在 win32 上光靠 picocolors 不够 —— 它报告支持颜色时并不检查是不是 TTY ——
 * 所以这里显式检查 isTTY，而不是从 columns 为 0 反推。
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
 * 读取这个 CLI 自己的 package.json
 *
 * 从本模块的实际位置向上逐级查找，而不是写死一个相对路径：源码在 `src/utils/`，
 * 构建后会被压平到 `dist/`，任何一个写死的 `../` 在两种布局里必然有一种是错的。
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
 * 读取 package.json，文件不存在时返回 undefined
 *
 * 与 getPackageJSON 的唯一区别是它吞掉了「文件不存在」这种情况；解析失败照样抛，
 * 那是真正的错误，不该被静音
 */
function tryReadPackageJSON(): PackageJsonLike | undefined {
  return isRootFileExist('package.json') ? getPackageJSON() : undefined
}

/**
 * 项目是否已经有这个依赖
 *
 * 两个检查必须同时通过：node_modules 下存在，且 package.json 里有声明。
 * 只查 node_modules 会被提升上来的传递依赖骗到 —— 它从没被写进 package.json，
 * 却被判成「已安装」而跳过；只查声明则可能碰上声明了但实际没装的包。
 */
export function hasDependency(pkg: string): boolean {
  if (!isRootFileExist(`node_modules/${pkg}`))
    return false

  const json = tryReadPackageJSON()
  return Boolean(json?.dependencies?.[pkg] || json?.devDependencies?.[pkg])
}

/**
 * 检查项目根目录下是否存在某个文件
 */
export function isRootFileExist(file: string): boolean {
  const cwd = process.cwd()
  const path = resolve(cwd, file)
  return fs.existsSync(path)
}

/**
 * 判断项目是不是 monorepo
 * 依据是 pnpm-workspace.yaml 里有非空的 `packages` 字段，
 * 或 package.json 里有非空的 `workspaces` 字段
 */
export function isMonorepo(): boolean {
  // 判定函数不该中断流程：package.json 不存在时当成「不是 monorepo」，
  // 而不是让 getPackageJSON 的「文件不存在」错误从这里逃出去
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
 * 判断项目是不是 TypeScript 项目
 * 依据是扫描项目根目录下有没有 tsconfig*.json
 */
export function isTsProject(): boolean {
  const cwd = process.cwd()
  const files = fs.readdirSync(cwd)
  return files.some(file => /^tsconfig(\..*)?\.json$/.test(file))
}

/**
 * 以对象形式取得 package.json
 *
 * 文件缺失或非法时一律抛错，这样调用方拿到的一定是个有效对象，不用再判空
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
