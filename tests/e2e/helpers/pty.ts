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

/** Keys understood by the clack select prompt */
export const KEY = {
  down: '\x1B[B',
  up: '\x1B[A',
  enter: '\r',
  ctrlC: '\x03',
} as const

let availability: { ok: true } | { ok: false, reason: string } | undefined

/**
 * Whether a pty can be driven here. Returns a reason instead of throwing, so the
 * interactive cases skip with an explanation rather than failing the suite on a
 * machine that simply cannot run them.
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
    // 3.9+ is required for os.waitstatus_to_exitcode, which the driver uses
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
  /** Everything the child has written so far, ANSI stripped */
  output: () => string
  /** Resolves once the output satisfies the predicate; rejects on timeout */
  waitFor: (predicate: (output: string) => boolean, label: string, timeout?: number) => Promise<void>
  write: (keys: string) => void
  /** Resolves with the child's exit code */
  done: () => Promise<number>
}

export interface RunInPtyOptions {
  rows?: number
  cols?: number
  packageManager?: string
  env?: Record<string, string | undefined>
}

/**
 * Runs the CLI on a real pty against a fixture.
 *
 * The environment is the same allowlist runCli uses, minus CI and with a real TERM —
 * both halves of isInteractive() have to be true for the prompt to appear at all.
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
    // A real terminal type, and deliberately NO CI — isInteractive() needs both
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
      // Polling rather than a fixed sleep: prompt render time varies with machine
      // load, and a sleep long enough to be safe makes every case slow
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
