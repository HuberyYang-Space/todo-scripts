import colors from 'picocolors'
import yoctoSpinner from 'yocto-spinner'

const { bgYellow, bgRed, bgCyan } = colors

/**
 * 直接往 stdout 打一行
 *
 * 终端输出的唯一出口。散落各处的裸 console.log 是「哪条消息走哪个流」这类问题的
 * 温床 —— 收敛到这里之后，要改流向或者给所有输出加前缀，只有这一个地方要动。
 */
export function printLine(msg = '') {
  console.log(msg)
}

export function printWarn(msg: string) {
  printLine(' ')
  printLine(`${bgYellow(' WARN ')} ${msg}`)
  printLine(' ')
}

/**
 * 中性提示，用于「结果正确」而非「需要担心」的情况
 *
 * 跳过项目已有的配置是这个工具在正常工作，不是警告 —— 用警告黄渲染会让人读成
 * 「哪里出错了」，久而久之就学会了无视真正要紧的那些消息。
 */
export function printInfo(msg: string) {
  printLine(' ')
  printLine(`${bgCyan(' INFO ')} ${msg}`)
  printLine(' ')
}

export function printErr(msg: string) {
  printLine(' ')
  printLine(`${bgRed(' ERROR ')} ${msg}`)
  printLine(' ')
}

export interface TaskSpinner {
  start: (text?: string) => void
  success: (text?: string) => void
  stop: (text?: string) => void
  /**
   * 跑一段带转圈的任务
   *
   * 抛错时保证先把转圈停掉再把错误原样抛出去 —— 这条纪律原来靠每个调用点自己
   * 手写 try/catch 记着，漏一次，报错信息就会和转圈那行抢同一行。
   */
  run: <T>(texts: { start: string, success: string }, fn: () => Promise<T>) => Promise<T>
}

/**
 * 创建一个转圈提示
 *
 * yocto-spinner 只在这里出现一次，和 prompt.ts 只在一处 import @clack/prompts
 * 是同一个道理：依赖收在单一模块里，既好换也好 mock。
 */
export function createSpinner(): TaskSpinner {
  const s = yoctoSpinner()

  return {
    start: text => void s.start(text),
    success: text => void s.success(text),
    stop: text => void s.stop(text),
    async run({ start, success }, fn) {
      s.start(start)
      try {
        const result = await fn()
        s.success(success)
        return result
      }
      catch (e) {
        s.stop()
        throw e
      }
    },
  }
}
