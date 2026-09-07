/**
 * CLI 层的参数类型
 *
 * 拆成三个而不是一个扁平 interface：子命令的签名只声明它自己接受的参数，
 * 读签名就知道这个命令认得哪些 flag。main / registry 拿到的仍是并集 ——
 * mri 在「知道用户要跑哪个子命令」之前就把 argv 解析完了，它本来也只能是并集。
 */

/** 不管跑哪个子命令都接受、且都在 main.ts 里处理的参数 */
export interface GlobalOptions {
  clear?: boolean
  help?: boolean
  version?: boolean
}

/** commitlint-init 自己的参数 */
export interface CommitlintInitOptions extends GlobalOptions {
  czgit?: boolean
  linter?: string
}

/**
 * mri 解析出来的东西：所有子命令 flag 的并集
 *
 * 因为每个字段都是可选的，接受并集的位置可以直接收下「只声明了自己那部分」的
 * 子命令 init，不需要把 Script 泛型化 —— SCRIPTS 是异构数组，泛型化只能退化成
 * Script<any>[]，等于没拆。加子命令时在这里补一个交叉类型即可。
 */
export type ParsedOptions = GlobalOptions & CommitlintInitOptions
