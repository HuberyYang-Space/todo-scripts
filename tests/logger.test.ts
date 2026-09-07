import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpinner, printErr, printInfo, printLine, printWarn } from '@/utils/logger'

// vi.mock 会被提升到文件顶部，所以 stub 必须用 vi.hoisted 一起提上去，
// 否则工厂执行时它还在暂时性死区里
const spinnerStub = vi.hoisted(() => ({
  start: vi.fn(function (this: any) { return this }),
  success: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('yocto-spinner', () => ({ default: () => spinnerStub }))

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

// ========================================
// createSpinner —— 转圈的生命周期由封装保证，不再靠调用方自觉
// ========================================
describe('createSpinner', () => {
  beforeEach(() => {
    spinnerStub.start.mockClear()
    spinnerStub.success.mockClear()
    spinnerStub.stop.mockClear()
  })

  it('run 成功时应该按 start → success 收尾', async () => {
    const result = await createSpinner().run({ start: '装依赖', success: '装好了' }, async () => 42)
    expect(result).toBe(42)
    expect(spinnerStub.start).toHaveBeenCalledWith('装依赖')
    expect(spinnerStub.success).toHaveBeenCalledWith('装好了')
    expect(spinnerStub.stop).not.toHaveBeenCalled()
  })

  it('run 失败时应该先停掉转圈，再把原始错误抛出去', async () => {
    const boom = new Error('boom')
    // 转圈那行不停下来，会和紧随其后的报错抢同一行
    await expect(createSpinner().run({ start: '装依赖', success: '装好了' }, async () => {
      throw boom
    })).rejects.toBe(boom)
    expect(spinnerStub.stop).toHaveBeenCalled()
    expect(spinnerStub.success).not.toHaveBeenCalled()
  })
})
