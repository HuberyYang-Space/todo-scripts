import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIST_ENTRY = resolve(REPO_ROOT, 'dist/main.js')

/**
 * 在任何 E2E worker 启动之前，构建一次 dist/。
 *
 * 放在 globalSetup 而不是 `pnpm build && vitest run` 这种脚本串联里，是因为
 * globalSetup 能覆盖所有入口 —— `pnpm test:e2e`、从 IDE 里跑单个文件、以及
 * `--watch`。脚本串联只覆盖第一种，剩下两种会默默地拿一个过期的 dist/ 去断言，
 * 而这正是 E2E 里最难被察觉的一类假结果。
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
