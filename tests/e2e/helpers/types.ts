/**
 * Shape of the package.json fields these tests assert on.
 *
 * Declared locally rather than imported from `src/` on purpose: the E2E suite
 * asserts against the CLI's observable output, so it must not share types with the
 * implementation it is checking.
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
