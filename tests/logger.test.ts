import { describe, expect, it, vi } from 'vitest'
import { printErr, printInfo, printLine, printWarn } from '@/utils/logger'

// ========================================
// printLine —— stdout 直出的唯一出口
// ========================================
describe('printLine', () => {
  it('应该原样打印一行', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printLine('hello')
    expect(spy).toHaveBeenCalledWith('hello')
    spy.mockRestore()
  })
})

// ========================================
// printWarn / printErr —— 终端消息输出
// ========================================
describe('printWarn', () => {
  it('应该调用 console.log 输出警告信息', () => {
    // 用 vi.spyOn 观察 console.log 的调用
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printWarn('test warning')
    // printWarn 会调用 console.log 三次：空行、内容、空行
    expect(spy).toHaveBeenCalledTimes(3)
    // 第二次调用应该包含警告文本
    const output = spy.mock.calls[1][0] as string
    expect(output).toContain('test warning')
    // 断言带前后空格的色块标记本身，而不是裸的 'WARN'——后者是 'warning' 的子串，
    // 消息文案一旦改成含 WARNING 的大写字样，这条断言就会在标记丢失时照样通过
    expect(output).toContain(' WARN ')
    spy.mockRestore()
  })
})

describe('printErr', () => {
  it('应该调用 console.log 输出错误信息', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printErr('test error')
    expect(spy).toHaveBeenCalledTimes(3)
    const output = spy.mock.calls[1][0] as string
    expect(output).toContain('test error')
    expect(output).toContain(' ERROR ')
    spy.mockRestore()
  })
})

// printInfo - 中性提示，用于「一切正常」的告知
describe('printInfo', () => {
  it('应该打印带 INFO 标记的消息', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printInfo('test info')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(' INFO '))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test info'))
    spy.mockRestore()
  })

  it('不应该被渲染成 WARN', () => {
    // 「已有配置，沿用你的」是正常结果而不是警告，用黄色 WARN 渲染会让人以为出错了
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printInfo('test info')
    const printed = spy.mock.calls.map(c => String(c[0])).join('')
    expect(printed).not.toContain(' WARN ')
    spy.mockRestore()
  })
})
