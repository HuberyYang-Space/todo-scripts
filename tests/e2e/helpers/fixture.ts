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

/** Prefix on every fixture dir, so strays are easy to spot: `ls $TMPDIR | grep hubery-e2e` */
const DIR_PREFIX = 'hubery-e2e-'

export interface FixtureSpec {
  /** Fixture project name; also the temp dir suffix */
  name?: string
  /** Linters to fake as installed: stub node_modules dir + package.json declaration */
  linters?: FakeLinter[]
  /** Declared in package.json but NOT present in node_modules (half of hasDependency) */
  declareOnly?: string[]
  /** Present in node_modules but NOT declared in package.json (the other half) */
  installOnly?: string[]
  /**
   * Pre-seed the four packages commitlint-init always installs. Default true.
   *
   * Turning this off makes the CLI run a REAL `npm install`, which hits the network
   * and takes minutes — it is refused unless E2E_ALLOW_INSTALL=1 is set.
   */
  seedBaseDeps?: boolean
  /** Also seed commitizen + cz-git — required for any --czgit case */
  czgit?: boolean
  /** Packages copied for real out of this repo's node_modules, with a .bin symlink */
  realPackages?: string[]
  /** Extra dependency declarations + stub dirs: name -> version */
  deps?: Record<string, string>
  /** Run `git init` up front. Default false, so the CLI's own git-init branch runs */
  git?: boolean
  /** Write a tsconfig.json, which makes isTsProject() true */
  typescript?: boolean
  /** Merged into the fixture's package.json */
  packageJson?: Record<string, unknown>
  /** Files written before the CLI runs: relative path -> content */
  files?: Record<string, string>
  /** Omit package.json entirely, to exercise the missing-manifest error path */
  noPackageJson?: boolean
}

export interface Fixture {
  /** Absolute, realpath-resolved root of the fixture project */
  readonly dir: string
  path: (...segments: string[]) => string
  exists: (relPath: string) => boolean
  read: (relPath: string) => string
  readJson: <T = Record<string, unknown>>(relPath: string) => T
  /** Sorted relative paths, excluding node_modules and .git internals */
  tree: () => string[]
  cleanup: () => Promise<void>
}

function stubPackageJson(name: string): string {
  return `${JSON.stringify({ name, version: '0.0.0-e2e' }, null, 2)}\n`
}

/**
 * Creates `node_modules/<pkg>/package.json`, which is all hasDependency() needs on
 * the filesystem side — it only calls existsSync on the directory.
 */
async function seedStubPackage(dir: string, pkg: string): Promise<void> {
  const target = join(dir, 'node_modules', pkg)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), stubPackageJson(pkg))
}

/**
 * Copies a real package out of this repo's node_modules and links its bin.
 *
 * husky is the one package that must genuinely work: commitlint-init runs
 * `husky init` without allowFailure, so a stub would fail the whole run. Copying
 * rather than symlinking keeps the fixture self-contained — pnpm's own
 * node_modules entry is itself a symlink into the store, and husky resolves paths
 * relative to its own file location.
 *
 * Resolution note: require.resolve('husky/package.json') throws, because husky's
 * "exports" is a bare string. Resolve the package entry and take its dirname.
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
      // Record .git's existence but not its churning internals
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

  // Both of these make hasDependency() return false for every package, so the CLI
  // runs a real `npm install` — network, minutes, and it writes a package.json of
  // its own, which silently changes what the rest of the run does.
  // noPackageJson is in here for a non-obvious reason: without a manifest there is
  // nothing for hasDependency to read, so seeding node_modules alone cannot save it.
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

  // realpath matters on macOS: tmpdir() is /var/folders/... which is a symlink to
  // /private/var/folders/..., and a child process reports the resolved path as its
  // cwd. Without this every path-equality assertion fails for no visible reason.
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
      // husky (and anything else in realPackages) is copied for real below
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
 * Preferred entry point. Same as createFixture, but registers cleanup with vitest:
 * the directory is removed when the test passes and KEPT when it fails, with its
 * path printed — for an E2E failure that surviving directory is the whole
 * investigation. E2E_KEEP=1 keeps it either way.
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
