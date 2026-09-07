import type { Fixture } from './fixture'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { execaSync } from 'execa'
import { BIN_PATH } from './cli'

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url))
const DRIVER = resolve(HELPERS_DIR, 'pty-driver.py')

/** clack 的 select 提示能识别的按键 */
export const KEY = {
  down: '\x1B[B',
  up: '\x1B[A',
  enter: '\r',
  ctrlC: '\x03',
} as const

let availability: { ok: true } | { ok: false, reason: string } | undefined

/**
 * 当前环境能不能驱动 pty。返回原因而不是抛错，这样交互用例会带着说明被跳过，
 * 而不是在一台根本跑不了它们的机器上让整套测试失败。
 */
export function ptyAvailability(): { ok: true } | { ok: false, reason: string } {
  if (availability)
    return availability

  if (process.env.E2E_SKIP_PTY === '1')
    return (availability = { ok: false, reason: 'E2E_SKIP_PTY=1' })

  if (process.platform === 'win32')
    return (availability = { ok: false, reason: 'pty driver requires a POSIX platform' })

  if (!existsSync(DRIVER))
    return (availability = { ok: false, reason: `missing driver at ${DRIVER}` })

  try {
    // 需要 3.9+，driver 用到了 os.waitstatus_to_exitcode
    execaSync('python3', ['-c', 'import sys, pty; assert sys.version_info >= (3, 9)'])
    return (availability = { ok: true })
  }
  catch (error) {
    return (availability = {
      ok: false,
      reason: `python3 with the pty module is unavailable: ${(error as Error).message}`,
    })
  }
}

export interface PtySession {
  /** 子进程到目前为止写出的全部内容，已去掉 ANSI 转义 */
  output: () => string
  /** 输出满足断言条件时 resolve；超时则 reject */
  waitFor: (predicate: (output: string) => boolean, label: string, timeout?: number) => Promise<void>
  write: (keys: string) => void
  /** resolve 出子进程的退出码 */
  done: () => Promise<number>
}

export interface RunInPtyOptions {
  rows?: number
  cols?: number
  packageManager?: string
  env?: Record<string, string | undefined>
}

/**
 * 在真实 pty 上、针对某个 fixture 运行 CLI。
 *
 * 环境变量用的是和 runCli 相同的白名单，去掉 CI 并给一个真实的 TERM ——
 * isInteractive() 的两半都为真，提示才会出现。
 */
export function runCliInPty(
  fixture: Fixture,
  args: string[],
  options: RunInPtyOptions = {},
): PtySession {
  const { rows = 50, cols = 200, packageManager = 'npm' } = options

  const env: Record<string, string | undefined> = {
    PATH: [dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    SHELL: '/bin/sh',
    LANG: 'en_US.UTF-8',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    // 一个真实的终端类型，并且刻意「不」设 CI —— isInteractive() 两个条件都要
    TERM: 'xterm-256color',
    npm_config_user_agent: `${packageManager}/10.9.2 npm/? node/${process.version} ${process.platform} ${process.arch}`,
    ...options.env,
  }

  const child = spawn(
    'python3',
    [DRIVER, String(rows), String(cols), process.execPath, BIN_PATH, ...args],
    {
      cwd: fixture.dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.fromEntries(
        Object.entries(env).filter(([, value]) => value !== undefined),
      ) as Record<string, string>,
    },
  )

  let raw = ''
  function collect(chunk: { toString: () => string }): void {
    raw += chunk.toString()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const exited = new Promise<number>((resolvePromise) => {
    child.on('exit', code => resolvePromise(code ?? 0))
  })

  function output(): string {
    return stripVTControlCharacters(raw)
  }

  return {
    output,
    async waitFor(predicate, label, timeout = 20_000) {
      const deadline = Date.now() + timeout
      // 用轮询而不是固定 sleep：提示的渲染耗时随机器负载浮动，
      // 而一个长到足够保险的 sleep 会让每个用例都变慢
      while (Date.now() < deadline) {
        if (predicate(output()))
          return
        await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
      }
      child.kill()
      throw new Error(
        `Timed out after ${timeout}ms waiting for: ${label}\n`
        + `fixture: ${fixture.dir}\n`
        + `--- output so far ---\n${output()}`,
      )
    },
    write(keys: string) {
      child.stdin.write(keys)
    },
    done: () => exited,
  }
}
