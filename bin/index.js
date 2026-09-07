#!/usr/bin/env node

'use strict'
import process from 'node:process'
import { main, MSG_FOR, printErr, ScriptError } from '../dist/main.js'

main().catch((e) => {
  // 预期内的失败只给一行提示；其余的是 bug，原样抛出让 node 打完整堆栈
  if (!(e instanceof ScriptError))
    throw e
  printErr(e.message)
  // ScriptError 一路带着 cause，但从前只打 message，底层到底为什么失败被整个吞掉，
  // 用户只能看到「执行 'xxx' 失败」这种没有信息量的一行
  if (e.cause)
    printErr(MSG_FOR.causedBy(e.cause.shortMessage ?? e.cause.message ?? e.cause))
  process.exit(1)
})
