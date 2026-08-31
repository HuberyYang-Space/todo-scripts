import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIST_ENTRY = resolve(REPO_ROOT, 'dist/main.js')

/**
 * Builds dist/ once, before any E2E worker starts.
 *
 * This lives in globalSetup rather than a `pnpm build && vitest run` script chain
 * because globalSetup covers every entry point — `pnpm test:e2e`, running a single
 * file from an IDE, and `--watch`. A script chain only covers the first, leaving the
 * others to silently assert against a stale dist/, which is the hardest class of
 * false result to notice in an E2E suite.
 */
export async function setup(): Promise<void> {
  if (process.env.E2E_SKIP_BUILD === '1') {
    if (!existsSync(DIST_ENTRY)) {
      throw new Error(
        `E2E_SKIP_BUILD=1 was set but ${DIST_ENTRY} does not exist.\n`
        + `Run \`pnpm build\` first, or unset E2E_SKIP_BUILD.`,
      )
    }
    return
  }

  const tsdown = resolve(REPO_ROOT, 'node_modules/.bin/tsdown')
  if (!existsSync(tsdown)) {
    throw new Error(
      `Cannot find ${tsdown}. Run \`pnpm install\` before running the E2E suite.`,
    )
  }

  await execa(tsdown, [], { cwd: REPO_ROOT, stdio: 'inherit' })

  if (!existsSync(DIST_ENTRY)) {
    throw new Error(`Build finished but ${DIST_ENTRY} is still missing.`)
  }
}
