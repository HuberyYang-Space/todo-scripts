import type { FakeLinter } from './constants'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { onTestFinished } from 'vitest'
import { BASE_PACKAGES, CZGIT_PACKAGES, LINTER_PACKAGES } from './constants'

const require_ = createRequire(import.meta.url)

/** 每个 fixture 目录的前缀，方便发现漏删的：`ls $TMPDIR | grep hubery-e2e` */
const DIR_PREFIX = 'hubery-e2e-'

export interface FixtureSpec {
  /** fixture 项目名；同时作为临时目录的后缀 */
  name?: string
  /** 伪装成已安装的 linter：桩 node_modules 目录 + package.json 声明 */
  linters?: FakeLinter[]
  /** 在 package.json 里声明了、但 node_modules 里没有（hasDependency 的一半条件） */
  declareOnly?: string[]
  /** node_modules 里有、但 package.json 里没声明（另一半条件） */
  installOnly?: string[]
  /**
   * 预置 commitlint-init 必装的那四个包。默认 true。
   *
   * 关掉它会让 CLI 跑一次「真的」`npm install`，联网且要几分钟 ——
   * 除非设了 E2E_ALLOW_INSTALL=1，否则会被直接拒绝。
   */
  seedBaseDeps?: boolean
  /** 顺带预置 commitizen + cz-git —— 任何 --czgit 用例都需要 */
  czgit?: boolean
  /** 从本仓库 node_modules 里真实拷贝过来的包，并建好 .bin 软链 */
  realPackages?: string[]
  /** 额外的依赖声明 + 桩目录：包名 -> 版本 */
  deps?: Record<string, string>
  /** 提前执行 `git init`。默认 false，好让 CLI 自己那条 git-init 分支跑起来 */
  git?: boolean
  /** 写一个 tsconfig.json，让 isTsProject() 为 true */
  typescript?: boolean
  /** 合并进 fixture 的 package.json */
  packageJson?: Record<string, unknown>
  /** CLI 运行前先写好的文件：相对路径 -> 内容 */
  files?: Record<string, string>
  /** 完全不生成 package.json，用来走「缺少 manifest」的错误路径 */
  noPackageJson?: boolean
}

export interface Fixture {
  /** fixture 项目的绝对根路径，已做 realpath 解析 */
  readonly dir: string
  path: (...segments: string[]) => string
  exists: (relPath: string) => boolean
  read: (relPath: string) => string
  readJson: <T = Record<string, unknown>>(relPath: string) => T
  /** 排好序的相对路径，不含 node_modules 与 .git 内部文件 */
  tree: () => string[]
  cleanup: () => Promise<void>
}

function stubPackageJson(name: string): string {
  return `${JSON.stringify({ name, version: '0.0.0-e2e' }, null, 2)}\n`
}

/**
 * 创建 `node_modules/<pkg>/package.json`，这就是 hasDependency() 在文件系统这边
 * 需要的全部 —— 它只对目录调用 existsSync。
 */
async function seedStubPackage(dir: string, pkg: string): Promise<void> {
  const target = join(dir, 'node_modules', pkg)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), stubPackageJson(pkg))
}

/**
 * 从本仓库的 node_modules 里拷贝一个真实的包，并建好它的 bin 软链。
 *
 * husky 是唯一必须真能跑起来的包：commitlint-init 执行 `husky init` 时没有加
 * allowFailure，用桩会让整次运行失败。这里是拷贝而不是软链，好让 fixture 自成一体
 * —— pnpm 自己的 node_modules 条目本身就是指向 store 的软链，而 husky 解析路径时
 * 是相对它自己所在文件位置的。
 *
 * 解析上的一个坑：require.resolve('husky/package.json') 会抛错，因为 husky 的
 * "exports" 是个裸字符串。改成解析包入口再取它的 dirname。
 */
async function seedRealPackage(dir: string, pkg: string): Promise<void> {
  const source = dirname(require_.resolve(pkg))
  const target = join(dir, 'node_modules', pkg)
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, dereference: true })

  const binDir = join(dir, 'node_modules', '.bin')
  await mkdir(binDir, { recursive: true })
  const binEntry = join(binDir, pkg)
  if (!existsSync(binEntry))
    await symlink(join('..', pkg, 'bin.js'), binEntry)
}

function walk(root: string, current: string, out: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules')
      continue
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      // 记录 .git 的存在，但不记录它内部那些一直在变的东西
      if (entry.name === '.git') {
        out.push('.git/')
        continue
      }
      walk(root, full, out)
    }
    else {
      out.push(relative(root, full))
    }
  }
}

export async function createFixture(spec: FixtureSpec = {}): Promise<Fixture> {
  const {
    name = 'e2e-fixture',
    linters = [],
    declareOnly = [],
    installOnly = [],
    seedBaseDeps = true,
    czgit = false,
    realPackages = ['husky'],
    deps = {},
    git = false,
    typescript = false,
    packageJson = {},
    files = {},
    noPackageJson = false,
  } = spec

  // 这两种情况都会让 hasDependency() 对所有包返回 false，于是 CLI 会跑一次真实的
  // `npm install` —— 联网、要几分钟，而且它会自己写一个 package.json，悄悄改变
  // 这次运行后半程的行为。
  // noPackageJson 也在这里的理由不那么显然：没有 manifest，hasDependency 就没东西可读，
  // 光预置 node_modules 救不了它。
  if ((!seedBaseDeps || noPackageJson) && process.env.E2E_ALLOW_INSTALL !== '1') {
    throw new Error(
      `${!seedBaseDeps ? 'seedBaseDeps:false' : 'noPackageJson:true'} makes the CLI run a real \`npm install\` `
      + '(network access, minutes per case).\n'
      + 'Set E2E_ALLOW_INSTALL=1 if that is genuinely what this case needs.',
    )
  }

  const root = process.env.E2E_TMP_ROOT
    ? resolve(process.env.E2E_TMP_ROOT)
    : tmpdir()
  await mkdir(root, { recursive: true })

  // realpath 在 macOS 上很关键：tmpdir() 是 /var/folders/...，它是指向
  // /private/var/folders/... 的软链，而子进程报告的 cwd 是解析后的路径。
  // 少了这一步，所有路径相等的断言都会莫名其妙地失败。
  const dir = await realpath(await mkdtemp(join(root, `${DIR_PREFIX}${name}-`)))

  const declared: Record<string, string> = {}
  const toStub: string[] = []

  for (const linter of linters) {
    const pkg = LINTER_PACKAGES[linter]
    declared[pkg] = '*'
    toStub.push(pkg)
  }
  if (seedBaseDeps) {
    for (const pkg of BASE_PACKAGES) {
      declared[pkg] = '*'
      // husky（以及 realPackages 里的其他包）在下面会被真实拷贝一份
      if (!realPackages.includes(pkg))
        toStub.push(pkg)
    }
  }
  if (czgit) {
    for (const pkg of CZGIT_PACKAGES) {
      declared[pkg] = '*'
      toStub.push(pkg)
    }
  }
  for (const [pkg, version] of Object.entries(deps)) {
    declared[pkg] = version
    toStub.push(pkg)
  }
  for (const pkg of declareOnly)
    declared[pkg] = '*'
  for (const pkg of installOnly)
    toStub.push(pkg)

  if (!noPackageJson) {
    const manifest = {
      name,
      version: '1.0.0',
      type: 'module',
      ...packageJson,
      devDependencies: {
        ...declared,
        ...(packageJson.devDependencies as Record<string, string> | undefined),
      },
    }
    await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }

  for (const pkg of toStub)
    await seedStubPackage(dir, pkg)
  for (const pkg of realPackages)
    await seedRealPackage(dir, pkg)

  if (typescript)
    await writeFile(join(dir, 'tsconfig.json'), `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`)

  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content)
  }

  if (git) {
    const { execa } = await import('execa')
    await execa('git', ['init', '-q'], { cwd: dir })
  }

  return {
    dir,
    path: (...segments: string[]) => join(dir, ...segments),
    exists: (relPath: string) => existsSync(join(dir, relPath)),
    read: (relPath: string) => readFileSync(join(dir, relPath), 'utf-8'),
    readJson: <T = Record<string, unknown>>(relPath: string) =>
      JSON.parse(readFileSync(join(dir, relPath), 'utf-8')) as T,
    tree: () => {
      const out: string[] = []
      walk(dir, dir, out)
      return out.sort()
    },
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * 推荐的入口。与 createFixture 相同，但把清理注册给了 vitest：用例通过时删掉目录，
 * 失败时「保留」并打印它的路径 —— 对一次 E2E 失败来说，那个留下来的目录就是全部
 * 排查线索。设 E2E_KEEP=1 则无论如何都保留。
 */
export async function useFixture(spec: FixtureSpec = {}): Promise<Fixture> {
  const fixture = await createFixture(spec)

  onTestFinished(async (context) => {
    const failed = context.task.result?.state === 'fail'
    if (failed || process.env.E2E_KEEP === '1') {
      console.warn(`[e2e] fixture kept for inspection: ${fixture.dir}`)
      return
    }
    await fixture.cleanup()
  })

  return fixture
}
