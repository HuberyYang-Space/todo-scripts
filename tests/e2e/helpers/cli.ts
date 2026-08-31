import type { Fixture } from './fixture'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { execa } from 'execa'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const BIN_PATH = resolve(REPO_ROOT, 'bin/index.js')

/**
 * Not covered by this suite: `--clear`, which really runs
 * `npm uninstall @huberyyang/todo-scripts` — network-dependent, slow, and it
 * rearranges the fixture's node_modules mid-run. That branch is covered by
 * tests/main.test.ts, where pm.uninstall is mocked. This gap is deliberate.
 */

/**
 * Environment handed to the CLI: an allowlist, never the ambient environment.
 *
 * Leaking the real environment silently destroys the suite's validity:
 * - npm_config_local_prefix / npm_config_prefix redirect `npx` to THIS repo's
 *   node_modules/.bin, so a fixture that forgot to seed a package still "passes"
 * - GIT_DIR / GIT_WORK_TREE are set inside git hooks (this repo commits via
 *   lint-staged), which would point the fixture's `git init` and husky's
 *   core.hooksPath at this repo
 * - HUSKY=0 short-circuits husky, so .husky/_ never appears
 * - a global eslint/biome on PATH makes the post-setup fix step really run; biome
 *   with no config rewrites files by its own defaults and corrupts the assertions
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
    // Detach git from any user/system config (someone's global core.hooksPath
    // would otherwise change what husky does here)
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    // Keep output deterministic and free of escape codes
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    // The other half of isInteractive(); pty cases delete this explicitly
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
  // getPkgManager() splits on the first space, then on "/"
  const withVersion = pm.includes('/') ? pm : `${pm}/10.9.2`
  return `${withVersion} npm/? node/${process.version} ${process.platform} ${process.arch}`
}

export interface CliResult {
  exitCode: number
  /** ANSI stripped, so assertions can match plain substrings */
  stdout: string
  stderr: string
  /** stdout and stderr interleaved, ANSI stripped */
  all: string
  timedOut: boolean
}

export interface RunCliOptions {
  /** Drives npm_config_user_agent; null removes it entirely */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno' | (string & {}) | null
  /** Overrides on top of the allowlist; undefined deletes a variable */
  env?: Record<string, string | undefined>
  /** Prepended to PATH, for cases that need a real pnpm/yarn binary */
  extraPathDirs?: string[]
  timeout?: number
}

/**
 * Runs the built CLI against a fixture.
 *
 * cwd is passed to the child rather than changed in this process: vitest's worker
 * threads share a process, so process.chdir() would corrupt every case running
 * alongside this one. Never call process.chdir() in these tests.
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
    // stdin must not be a TTY, or isInteractive() would flip and a case could hang
    stdin: 'ignore',
    // Below vitest's 60s, so a hang surfaces as a readable timedOut result with
    // partial output rather than vitest killing the worker
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

/** Throws with the fixture path, tree and full output — everything needed to debug */
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
