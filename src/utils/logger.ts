import colors from 'picocolors'

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
