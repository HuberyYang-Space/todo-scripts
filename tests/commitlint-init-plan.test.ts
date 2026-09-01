import type { PackageManager } from '@/utils/package-manager'
import { describe, expect, it } from 'vitest'
import { COMMITLINT_CONFIG_FILES, createFileJournal, detectHuskyV4, findExistingConfig, LINT_STAGED_CONFIG_FILES, patchPackageJSON, planSetup, resolveConfigWrite, resolveHookContent, surveyProject } from '@/scripts/commitlint-init'

// Pure function tests: no need to mock the filesystem, subprocess, or spinner
const pm = {
  formatExec: (command: string) => `pnpm exec ${command}`,
} as PackageManager

describe('planSetup', () => {
  it('默认应该规划 4 个基础依赖', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
    ])
  })

  it('--czgit 时应该追加 commitizen 和 cz-git', () => {
    expect(planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).packages).toEqual([
      '@commitlint/cli',
      '@commitlint/config-conventional',
      'husky',
      'lint-staged',
      'commitizen',
      'cz-git',
    ])
  })

  it('ts 项目的配置文件应该是 .ts', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.ts')
  })

  it('非 TS 项目的配置文件应该是 .js', () => {
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).configFile.name).toBe('commitlint.config.js')
  })

  it('--czgit 时配置文件内容应该带 prompt 交互配置', () => {
    const { content } = planSetup({ czgit: true }, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).toContain('prompt')
    expect(content).toContain('cz-git')
  })

  it('默认配置文件内容不应该带 prompt 交互配置', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).configFile
    expect(content).not.toContain('prompt')
  })

  it('钩子内容应该用包管理器的 exec 前缀渲染', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).hooks).toEqual([
      { path: '.husky/pre-commit', content: 'pnpm exec lint-staged' },
      { path: '.husky/commit-msg', content: 'pnpm exec commitlint --edit "$1"' },
    ])
  })

  it('lint-staged 配置文件固定生成 lint-staged.config.mjs，不区分 ts/js 项目', () => {
    expect(planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
    expect(planSetup({}, { isTsProject: false, pm, linter: 'eslint' }).lintStagedConfigFile.name).toBe('lint-staged.config.mjs')
  })
})

describe('planSetup 的 lint-staged 内容', () => {
  it('探测到 eslint 时应该生成 eslint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'eslint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'eslint --fix --no-error-on-unmatched-pattern'`)
  })

  it('探测到 biome 时应该生成 biome 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'biome' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'biome check --write --no-errors-on-unmatched'`)
  })

  it('探测到 oxlint 时应该生成 oxlint 规则', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'oxlint' }).lintStagedConfigFile
    expect(content).toContain(`'*': 'oxlint --fix --no-error-on-unmatched-pattern'`)
  })

  it('没有 linter 时应该生成一条空任务的 * 规则（合法但不生效）', () => {
    const { content } = planSetup({}, { isTsProject: true, pm, linter: 'none' }).lintStagedConfigFile
    expect(content).toMatch(/'\*':\s*\[\]/)
  })
})

describe('patchPackageJSON', () => {
  it('应该写入 commitlint 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result.scripts!.commitlint).toBe('commitlint --edit')
  })

  it('lint-staged 配置已经改用独立文件，不应该再往 package.json 里注入默认值', () => {
    const result = patchPackageJSON({ name: 'demo' }, {})
    expect(result['lint-staged']).toBeUndefined()
  })

  it('用户已有的 lint-staged 配置不应该被覆盖', () => {
    const result = patchPackageJSON(
      { 'name': 'demo', 'lint-staged': { '*.ts': 'my-own-linter' } },
      {},
    )
    expect(result['lint-staged']).toEqual({ '*.ts': 'my-own-linter' })
  })

  it('不应该修改传入的对象', () => {
    const original = { name: 'demo' }
    patchPackageJSON(original, { czgit: true })
    expect(original).toEqual({ name: 'demo' })
  })

  it('应该保留原有的其他字段和脚本', () => {
    const result = patchPackageJSON(
      { name: 'demo', version: '1.0.0', scripts: { build: 'vite build' } },
      {},
    )
    expect(result.name).toBe('demo')
    expect(result.version).toBe('1.0.0')
    expect(result.scripts!.build).toBe('vite build')
  })

  it('--czgit 时应该写入 commitizen 配置和 cz 脚本', () => {
    const result = patchPackageJSON({ name: 'demo' }, { czgit: true })
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
    expect(result.scripts!.cz).toBe('git cz')
  })

  it('--czgit 时应该保留 commitizen 子对象里已有的配置', () => {
    // cz-git's config lives under config.commitizen (alongside path there's also
    // alias/types etc.) — merging only the outer layer would lose that inner data
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x', alias: { fd: 'docs: fix typos' } } } },
      { czgit: true },
    )
    expect(result.config!.commitizen).toEqual({
      path: 'node_modules/cz-git',
      alias: { fd: 'docs: fix typos' },
    })
  })

  it('--czgit 时应该保留 config 下已有的其他字段', () => {
    // Regression case: this used to overwrite config wholesale, dropping the user's other fields
    const result = patchPackageJSON(
      { name: 'demo', config: { other: 'keep-me' } },
      { czgit: true },
    )
    expect(result.config!.other).toBe('keep-me')
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-git' })
  })

  it('非 czgit 时不应该删除用户已有的 commitizen 配置和 cz 脚本', () => {
    // 不传 --czgit 表达的是「这次不配 czgit」，不是「请移除我的 commitizen」。
    // 用户的适配器也未必是 cz-git，删掉等于破坏一个本工具没参与配置的功能。
    const result = patchPackageJSON(
      {
        name: 'demo',
        scripts: { cz: 'git cz' },
        config: { commitizen: { path: 'node_modules/cz-conventional-changelog' } },
      },
      {},
    )
    expect(result.config!.commitizen).toEqual({ path: 'node_modules/cz-conventional-changelog' })
    expect(result.scripts!.cz).toBe('git cz')
  })

  it('非 czgit 时应该保留 config 下的其他字段', () => {
    const result = patchPackageJSON(
      { name: 'demo', config: { commitizen: { path: 'x' }, other: 'keep' } },
      {},
    )
    expect(result.config!.other).toBe('keep')
  })
})

describe('resolveHookContent', () => {
  const command = 'pnpm exec lint-staged'

  it('钩子不存在时应该直接写入命令', () => {
    expect(resolveHookContent(undefined, command)).toEqual({
      content: command,
      action: 'created',
    })
  })

  it('已有钩子不含该命令时应该追加而不是替换', () => {
    // 这是核心回归点：原来的实现把用户内容原样写回，导致 lint-staged 永远不会被触发
    const original = '#!/bin/sh\necho "my own check"\n'
    expect(resolveHookContent(original, command)).toEqual({
      content: `#!/bin/sh\necho "my own check"\n${command}\n`,
      action: 'appended',
    })
  })

  it('已有钩子缺末尾换行时追加前应该补上换行', () => {
    expect(resolveHookContent('echo hi', command)).toEqual({
      content: `echo hi\n${command}\n`,
      action: 'appended',
    })
  })

  it('已有钩子已经含该命令时应该原样保留', () => {
    const original = `#!/bin/sh\n${command}\n`
    expect(resolveHookContent(original, command)).toEqual({
      content: original,
      action: 'unchanged',
    })
  })

  it('比对命令时应该忽略行首尾空白', () => {
    const original = `#!/bin/sh\n  ${command}  \n`
    expect(resolveHookContent(original, command).action).toBe('unchanged')
  })

  it('命令只是某行的子串时不算已存在，应该追加', () => {
    // `pnpm exec lint-staged-extra` 不是我们要的命令，不能因为子串匹配就跳过
    const original = `#!/bin/sh\n${command}-extra\n`
    expect(resolveHookContent(original, command).action).toBe('appended')
  })
})

describe('findExistingConfig', () => {
  it('一个候选都不存在时应该返回 undefined', () => {
    expect(findExistingConfig(['a.js', 'b.js'], () => false)).toBeUndefined()
  })

  it('应该返回实际存在的那个候选文件名', () => {
    expect(findExistingConfig(['a.js', 'b.js'], f => f === 'b.js')).toBe('b.js')
  })

  it('多个候选同时存在时应该返回候选顺序里的第一个', () => {
    expect(findExistingConfig(['a.js', 'b.js'], () => true)).toBe('a.js')
  })
})

describe('配置文件候选清单', () => {
  it('commitlint 候选应该覆盖 rc 系与 config 系的各种扩展名', () => {
    // 回归点：原来只检查自己要写的那个文件名，导致已有 .commitlintrc 的项目被写入第二份配置
    for (const file of [
      'commitlint.config.ts',
      'commitlint.config.js',
      'commitlint.config.cjs',
      'commitlint.config.mjs',
      '.commitlintrc',
      '.commitlintrc.json',
      '.commitlintrc.js',
      '.commitlintrc.cjs',
      '.commitlintrc.mjs',
      '.commitlintrc.ts',
      '.commitlintrc.yml',
      '.commitlintrc.yaml',
    ])
      expect(COMMITLINT_CONFIG_FILES).toContain(file)
  })

  it('lint-staged 候选应该覆盖 rc 系与 config 系的各种扩展名', () => {
    for (const file of [
      'lint-staged.config.mjs',
      'lint-staged.config.js',
      'lint-staged.config.cjs',
      'lint-staged.config.ts',
      '.lintstagedrc',
      '.lintstagedrc.json',
      '.lintstagedrc.js',
      '.lintstagedrc.cjs',
      '.lintstagedrc.mjs',
      '.lintstagedrc.yml',
      '.lintstagedrc.yaml',
    ])
      expect(LINT_STAGED_CONFIG_FILES).toContain(file)
  })
})

describe('resolveConfigWrite', () => {
  const target = 'commitlint.config.ts'

  it('没有任何已存在配置时应该写入', () => {
    expect(resolveConfigWrite(undefined, target, false).write).toBe(true)
  })

  it('已存在配置且没有 --force 时应该跳过', () => {
    expect(resolveConfigWrite('.commitlintrc.json', target, false).write).toBe(false)
  })

  it('--force 且已存在的就是我们要写的文件时应该覆盖', () => {
    expect(resolveConfigWrite(target, target, true).write).toBe(true)
  })

  it('--force 但已存在的是另一种文件名时仍然应该跳过', () => {
    // 覆盖不了 .commitlintrc.json，硬写 commitlint.config.ts 只会制造出两份打架的配置
    const result = resolveConfigWrite('.commitlintrc.json', target, true)
    expect(result.write).toBe(false)
    expect(result.reason).toContain('.commitlintrc.json')
  })

  it('跳过时应该给出可读的原因', () => {
    expect(resolveConfigWrite('.commitlintrc.json', target, false).reason).toBeTruthy()
  })
})

describe('resolveHookContent 的 --force 行为', () => {
  const command = 'pnpm exec lint-staged'

  it('--force 时应该用我们的内容覆盖用户已有的钩子', () => {
    const result = resolveHookContent('#!/bin/sh\necho mine\n', command, { force: true })
    expect(result.content).toBe(command)
    expect(result.action).toBe('replaced')
  })

  it('--force 对不存在的钩子仍然是新建', () => {
    expect(resolveHookContent(undefined, command, { force: true }).action).toBe('created')
  })
})

describe('surveyProject', () => {
  const plan = planSetup({}, { isTsProject: true, pm, linter: 'eslint' })
  const base = {
    exists: () => false,
    readHook: () => undefined,
    pkg: { name: 'demo' },
    force: false,
  }

  it('干净工程应该需要 git init，且两份配置都要写', () => {
    const survey = surveyProject(plan, base)
    expect(survey.needsGitInit).toBe(true)
    expect(survey.commitlint.write).toBe(true)
    expect(survey.lintStaged.write).toBe(true)
  })

  it('已有 .git 时不应该再 git init', () => {
    const survey = surveyProject(plan, { ...base, exists: f => f === '.git' })
    expect(survey.needsGitInit).toBe(false)
  })

  it('应该识别出任意变体的既有 commitlint 配置', () => {
    const survey = surveyProject(plan, { ...base, exists: f => f === '.commitlintrc.json' })
    expect(survey.commitlint.write).toBe(false)
    expect(survey.commitlint.reason).toContain('.commitlintrc.json')
  })

  it('应该把 package.json 里的 lint-staged 字段也算作既有配置', () => {
    const survey = surveyProject(plan, { ...base, pkg: { 'name': 'demo', 'lint-staged': { '*': 'x' } } })
    expect(survey.lintStaged.write).toBe(false)
  })

  it('钩子不存在时应该规划为新建', () => {
    const survey = surveyProject(plan, base)
    expect(survey.hooks.map(h => h.action)).toEqual(['created', 'created'])
  })

  it('钩子已存在且不含我们的命令时应该规划为追加', () => {
    const survey = surveyProject(plan, { ...base, readHook: () => 'echo mine\n' })
    expect(survey.hooks.every(h => h.action === 'appended')).toBe(true)
  })

  it('--force 时钩子应该规划为覆盖', () => {
    const survey = surveyProject(plan, { ...base, readHook: () => 'echo mine\n', force: true })
    expect(survey.hooks.every(h => h.action === 'replaced')).toBe(true)
  })

  it('survey 只做判断，返回的钩子内容应该带上最终要写入的文本', () => {
    const survey = surveyProject(plan, { ...base, readHook: () => 'echo mine\n' })
    expect(survey.hooks[0].content).toContain('echo mine')
    expect(survey.hooks[0].content).toContain('lint-staged')
  })
})

describe('detectHuskyV4', () => {
  it('没有 v4 残留时应该返回 undefined', () => {
    expect(detectHuskyV4(() => false, { name: 'demo' })).toBeUndefined()
  })

  it('应该识别出 .huskyrc 这类 v4 配置文件', () => {
    const found = detectHuskyV4(f => f === '.huskyrc', { name: 'demo' })
    expect(found!.source).toBe('.huskyrc')
  })

  it('应该识别出 package.json 里的 husky 字段', () => {
    const found = detectHuskyV4(() => false, { name: 'demo', husky: { hooks: { 'pre-commit': 'npm test' } } })
    expect(found!.source).toContain('package.json')
  })

  it('应该把 v4 里定义的钩子命令列出来，方便用户手动迁移', () => {
    const found = detectHuskyV4(() => false, {
      name: 'demo',
      husky: { hooks: { 'pre-commit': 'npm test', 'commit-msg': 'commitlint -E HUSKY_GIT_PARAMS' } },
    })
    expect(found!.hooks).toEqual({
      'pre-commit': 'npm test',
      'commit-msg': 'commitlint -E HUSKY_GIT_PARAMS',
    })
  })

  it('配置文件的优先级应该高于 package.json 字段', () => {
    // husky v4 走 cosmiconfig，独立文件优先
    const found = detectHuskyV4(f => f === '.huskyrc.json', { name: 'demo', husky: { hooks: {} } })
    expect(found!.source).toBe('.huskyrc.json')
  })

  it('只有 husky 字段但没有 hooks 时也应该报出来', () => {
    const found = detectHuskyV4(() => false, { name: 'demo', husky: {} })
    expect(found).toBeDefined()
    expect(found!.hooks).toEqual({})
  })
})

describe('createFileJournal', () => {
  function makeIo(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial))
    const removed: string[] = []
    return {
      files,
      removed,
      io: {
        exists: (path: string) => files.has(path),
        read: (path: string) => files.get(path)!,
        write: async (path: string, content: string) => { files.set(path, content) },
        remove: async (path: string) => {
          files.delete(path)
          removed.push(path)
        },
      },
    }
  }

  it('回滚时应该删掉本来不存在的文件', async () => {
    const { io, files, removed } = makeIo()
    const journal = createFileJournal(io)
    journal.capture('commitlint.config.ts')
    await io.write('commitlint.config.ts', '新写的内容')

    await journal.rollback()

    expect(removed).toContain('commitlint.config.ts')
    expect(files.has('commitlint.config.ts')).toBe(false)
  })

  it('回滚时应该把本来存在的文件还原成原内容', async () => {
    const { io, files } = makeIo({ 'package.json': '原始内容' })
    const journal = createFileJournal(io)
    journal.capture('package.json')
    await io.write('package.json', '被改过的内容')

    await journal.rollback()

    expect(files.get('package.json')).toBe('原始内容')
  })

  it('同一个文件重复 capture 只应该记住最早的状态', async () => {
    const { io, files } = makeIo({ 'a.txt': '第一版' })
    const journal = createFileJournal(io)
    journal.capture('a.txt')
    await io.write('a.txt', '第二版')
    journal.capture('a.txt')
    await io.write('a.txt', '第三版')

    await journal.rollback()

    expect(files.get('a.txt')).toBe('第一版')
  })

  it('没有 capture 过的文件不应该被回滚动到', async () => {
    const { io, files } = makeIo({ 'untouched.txt': '别动我' })
    const journal = createFileJournal(io)
    journal.capture('other.txt')

    await journal.rollback()

    expect(files.get('untouched.txt')).toBe('别动我')
  })

  it('什么都没 capture 时回滚应该是安全的空操作', async () => {
    const { io, removed } = makeIo()
    await createFileJournal(io).rollback()
    expect(removed).toEqual([])
  })
})
