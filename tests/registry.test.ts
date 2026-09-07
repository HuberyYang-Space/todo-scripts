import { describe, expect, it } from 'vitest'
import { collectFlagNames, findScript, GLOBAL_FLAGS, renderHelp, renderScriptHelp, SCRIPTS } from '@/registry'

describe('sCRIPTS 清单', () => {
  it('每个脚本都应该有名字和中英文说明', () => {
    for (const script of SCRIPTS) {
      expect(script.name).toBeTruthy()
      expect(script.summary).toBeTruthy()
    }
  })

  it('应该包含 commitlint-init', () => {
    expect(SCRIPTS.map(s => s.name)).toContain('commitlint-init')
  })

  it('脚本名不应该重复', () => {
    const names = SCRIPTS.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('findScript', () => {
  it('应该能按名字找到脚本', () => {
    expect(findScript('commitlint-init')?.name).toBe('commitlint-init')
  })

  it('没注册的名字应该返回 undefined', () => {
    expect(findScript('not-a-script')).toBeUndefined()
  })

  it('名字为 undefined 时应该返回 undefined', () => {
    expect(findScript(undefined)).toBeUndefined()
  })
})

describe('renderHelp', () => {
  it('可用指令部分应该由 SCRIPTS 派生，不会漏掉任何一个', () => {
    const help = renderHelp()
    for (const script of SCRIPTS) {
      expect(help).toContain(script.name)
      expect(help).toContain(script.summary)
    }
  })

  it('应该包含全局参数说明', () => {
    const help = renderHelp()
    for (const flag of GLOBAL_FLAGS)
      expect(help).toContain(`--${flag.name}`)
  })

  it('不应该再把子命令的参数混进全局帮助里', () => {
    // 子命令参数放到 `hubery <script> --help` 下，否则命令一多全局帮助就没法读
    expect(renderHelp()).not.toContain('--czgit')
  })

  it('应该提示如何查看子命令的参数', () => {
    expect(renderHelp()).toContain('--help')
  })
})

describe('flag 元数据', () => {
  it('每个 flag 都应该有名字、类型和中英文说明', () => {
    for (const flag of [...GLOBAL_FLAGS, ...SCRIPTS.flatMap(s => s.flags ?? [])]) {
      expect(flag.name).toBeTruthy()
      expect(['boolean', 'string']).toContain(flag.type)
      expect(flag.summary).toBeTruthy()
    }
  })

  it('commitlint-init 应该声明 czgit 和 linter 两个参数', () => {
    const names = findScript('commitlint-init')!.flags!.map(f => f.name)
    expect(names).toContain('czgit')
    expect(names).toContain('linter')
  })

  it('不应该再暴露 --force / --dry-run', () => {
    // 覆盖是这个工具唯一的破坏性操作，删掉文件重跑即可，不值得为它开一个开关；
    // 预演的信息默认输出已经全给了，真要「只看不改」那是 doctor 的职责
    const names = findScript('commitlint-init')!.flags!.map(f => f.name)
    expect(names).not.toContain('force')
    expect(names).not.toContain('dry-run')
  })

  it('linter 应该是 string 类型，否则裸 --linter 会被强转成布尔值', () => {
    const linter = findScript('commitlint-init')!.flags!.find(f => f.name === 'linter')
    expect(linter!.type).toBe('string')
  })

  it('collectFlagNames 应该同时收集长名和短名', () => {
    const names = collectFlagNames([
      { name: 'help', type: 'boolean', alias: 'h', summary: '' },
      { name: 'linter', type: 'string', summary: '' },
    ])
    expect(names).toEqual(new Set(['help', 'h', 'linter']))
  })
})

describe('renderScriptHelp', () => {
  const script = findScript('commitlint-init')!

  it('应该包含脚本名和说明', () => {
    const help = renderScriptHelp(script)
    expect(help).toContain(script.name)
    expect(help).toContain(script.summary)
  })

  it('应该列出该脚本自己的全部参数', () => {
    const help = renderScriptHelp(script)
    for (const flag of script.flags ?? [])
      expect(help).toContain(`--${flag.name}`)
  })

  it('也应该列出全局参数，用户不必再翻一次全局帮助', () => {
    const help = renderScriptHelp(script)
    for (const flag of GLOBAL_FLAGS)
      expect(help).toContain(`--${flag.name}`)
  })
})

describe('全局参数清单', () => {
  it('应该包含 help / version / clear', () => {
    const names = GLOBAL_FLAGS.map(f => f.name)
    expect(names).toContain('help')
    expect(names).toContain('version')
    expect(names).toContain('clear')
  })
})
