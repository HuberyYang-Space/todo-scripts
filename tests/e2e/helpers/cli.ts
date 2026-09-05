import type { Fixture } from './fixture'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { execa } from 'execa'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const BIN_PATH = resolve(REPO_ROOT, 'bin/index.js')

/**
 * 本套件不覆盖 `--clear`：它会真的执行 `npm uninstall @huberyyang/todo-scripts`
 * —— 依赖网络、慢，而且会在运行途中重排 fixture 的 node_modules。那条分支由
 * tests/main.test.ts 覆盖，那里 pm.uninstall 是 mock 的。这个缺口是刻意留的。
 */

/**
 * 交给 CLI 的环境变量：一份白名单，绝不是当前进程的环境。
 *
 * 泄漏真实环境会悄无声息地毁掉整套测试的有效性：
 * - npm_config_local_prefix / npm_config_prefix 会把 `npx` 指向「本仓库」的
 *   node_modules/.bin，于是忘了预置某个包的 fixture 照样「通过」
 * - GIT_DIR / GIT_WORK_TREE 在 git 钩子里是被设置过的（本仓库经由 lint-staged 提交），
 *   它们会把 fixture 的 `git init` 和 husky 的 core.hooksPath 指到本仓库上
 * - HUSKY=0 会让 husky 直接短路，.husky/_ 根本不会出现
 * - PATH 上有全局的 eslint/biome 会让收尾的修复步骤真的跑起来；没有配置的 biome
 *   会按它自己的默认规则改写文件，把断言全搞坏
 */
function buildEnv(options: RunCliOptions): Record<string, string> {
  const pathDirs = [
    dirname(process.execPath),
    ...(options.extraPathDirs ?? []),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]

  const env: Record<string, string | undefined> = {
    PATH: pathDirs.join(':'),
    HOME: process.env.HOME,
    SHELL: '/bin/sh',
    TMPDIR: process.env.TMPDIR,
    LANG: 'en_US.UTF-8',
    // 把 git 与用户级/系统级配置隔离开（否则别人全局的 core.hooksPath
    // 会改变 husky 在这里的行为）
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    // 让输出保持确定，且不带转义序列
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    // isInteractive() 的另一半；走 pty 的用例会显式删掉它
    CI: '1',
    npm_config_user_agent: userAgentFor(options.packageManager ?? 'npm'),
  }

  if (options.packageManager === null)
    delete env.npm_config_user_agent

  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined)
      delete env[key]
    else
      env[key] = value
  }

  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  ) as Record<string, string>
}

function userAgentFor(pm: string): string {
  // getPkgManager() 先按第一个空格切，再按 "/" 切
  const withVersion = pm.includes('/') ? pm : `${pm}/10.9.2`
  return `${withVersion} npm/? node/${process.version} ${process.platform} ${process.arch}`
}

export interface CliResult {
  exitCode: number
  /** 已去掉 ANSI 转义，断言可以直接匹配纯文本子串 */
  stdout: string
  stderr: string
  /** stdout 与 stderr 交错在一起，已去掉 ANSI 转义 */
  all: string
  timedOut: boolean
}

export interface RunCliOptions {
  /** 用来驱动 npm_config_user_agent；传 null 则把它整个删掉 */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno' | (string & {}) | null
  /** 叠加在白名单之上的覆盖项；值为 undefined 表示删掉该变量 */
  env?: Record<string, string | undefined>
  /** 前置到 PATH 上，给需要真实 pnpm/yarn 可执行文件的用例用 */
  extraPathDirs?: string[]
  timeout?: number
}

/**
 * 在 fixture 上运行构建好的 CLI。
 *
 * cwd 是传给子进程的，而不是改当前进程的：vitest 的 worker 线程共享一个进程，
 * process.chdir() 会连累所有并行跑的用例。这些测试里永远不要调用 process.chdir()。
 */
export async function runCli(
  fixture: Fixture,
  args: string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const result = await execa(process.execPath, [BIN_PATH, ...args], {
    cwd: fixture.dir,
    env: buildEnv(options),
    extendEnv: false,
    reject: false,
    all: true,
    // stdin 不能是 TTY，否则 isInteractive() 会翻转，用例可能因此卡住
    stdin: 'ignore',
    // 比 vitest 的 60s 短，这样卡住时呈现的是一个带部分输出、可读的 timedOut 结果，
    // 而不是被 vitest 直接把 worker 杀掉
    timeout: options.timeout ?? 45_000,
  })

  return {
    exitCode: result.exitCode ?? 0,
    stdout: stripVTControlCharacters(result.stdout ?? ''),
    stderr: stripVTControlCharacters(result.stderr ?? ''),
    all: stripVTControlCharacters(result.all ?? ''),
    timedOut: result.timedOut ?? false,
  }
}

/** 抛错时带上 fixture 路径、目录树和完整输出 —— 排障需要的东西都在里面 */
export function assertOk(result: CliResult, fixture: Fixture): void {
  if (result.exitCode === 0)
    return

  throw new Error(
    `CLI exited ${result.exitCode} (expected 0)${result.timedOut ? ' [TIMED OUT]' : ''}\n`
    + `fixture: ${fixture.dir}\n`
    + `--- stdout ---\n${result.stdout}\n`
    + `--- stderr ---\n${result.stderr}\n`
    + `--- tree ---\n${fixture.tree().join('\n')}\n`,
  )
}
