/**
 * 这些测试所断言的那些 package.json 字段的形状。
 *
 * 刻意在本地声明而不是从 `src/` 导入：E2E 断言的是 CLI 对外可观察的输出，
 * 所以它不能和被它检查的那份实现共用类型。
 */
export interface PackageJsonLike {
  'name'?: string
  'version'?: string
  'scripts'?: Record<string, string>
  'dependencies'?: Record<string, string>
  'devDependencies'?: Record<string, string>
  'lint-staged'?: Record<string, unknown>
  'config'?: {
    commitizen?: { path: string, [key: string]: unknown }
    [key: string]: unknown
  }
  [key: string]: unknown
}
