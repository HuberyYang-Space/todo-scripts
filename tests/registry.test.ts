import { describe, expect, it } from 'vitest'
import { findScript, renderHelp, SCRIPTS } from '@/registry'

describe('sCRIPTS 清单', () => {
  it('每个脚本都应该有名字和中英文说明', () => {
    for (const script of SCRIPTS) {
      expect(script.name).toBeTruthy()
      expect(script.summary).toBeTruthy()
      expect(script.summaryEn).toBeTruthy()
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

  it('应该包含所有参数说明', () => {
    const help = renderHelp()
    expect(help).toContain('--help')
    expect(help).toContain('--clear')
    expect(help).toContain('--czgit')
    expect(help).toContain('--linter')
  })
})
