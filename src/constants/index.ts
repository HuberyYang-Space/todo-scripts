/** Standard Conventional Commits type list shared by both commitlint config templates */
const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'revert',
  'chore',
]

/** Renders the array-item text for the type-enum rule; both config templates share this same type list */
function renderTypeEnum(): string {
  return COMMIT_TYPES.map(type => `      '${type}',`).join('\n')
}

export const CONFIG_COMMITLINT
  = `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
${renderTypeEnum()}
    ]],
  },
}
`

export const CONFIG_COMMITLINT_CZGIT
  = `/** @type {import('cz-git').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
${renderTypeEnum()}
    ]],
  },
  prompt: {
    alias: { fd: 'docs: fix typos' },
    messages: {
      type: '选择你要提交的类型 / Select the type of change:',
      scope: '选择一个提交范围（可选）/ Select a scope (optional):',
      customScope: '请输入自定义的提交范围 / Enter a custom scope:',
      subject: '填写简短精炼的变更描述 / Write a short description:\\n',
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行 / Provide a longer description (optional). Use "|" for line breaks:\\n',
      breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行 / List breaking changes (optional). Use "|" for line breaks:\\n',
      footerPrefixesSelect: '选择关联issue前缀（可选）/ Select the issue prefix (optional):',
      customFooterPrefix: '输入自定义issue前缀 / Enter a custom issue prefix:',
      footer: '列举关联issue (可选) 例如: #31, #I3244 / List related issues (optional), e.g. #31, #I3244:\\n',
      confirmCommit: '是否提交或修改commit / Confirm the commit?',
    },
    types: [
      { value: 'feat', name: 'feat:     新增功能 | A new feature' },
      { value: 'fix', name: 'fix:      修复缺陷 | A bug fix' },
      { value: 'docs', name: 'docs:     文档更新 | Documentation only changes' },
      { value: 'style', name: 'style:    代码格式 | Changes that do not affect the meaning of the code' },
      { value: 'refactor', name: 'refactor: 代码重构 | A code change that neither fixes a bug nor adds a feature' },
      { value: 'perf', name: 'perf:     性能提升 | A code change that improves performance' },
      { value: 'test', name: 'test:     测试相关 | Adding missing tests or correcting existing tests' },
      { value: 'build', name: 'build:    构建相关 | Changes that affect the build system or external dependencies' },
      { value: 'ci', name: 'ci:       持续集成 | Changes to our CI configuration files and scripts' },
      { value: 'revert', name: 'revert:   回退代码 | Revert to a commit' },
      { value: 'chore', name: 'chore:    其他修改 | Other changes that do not modify src or test files' },
    ],
    useEmoji: false,
    emojiAlign: 'center',
    useAI: false,
    aiNumber: 1,
    themeColorCode: '',
    scopes: [],
    allowCustomScopes: true,
    allowEmptyScopes: true,
    customScopesAlign: 'bottom',
    customScopesAlias: 'custom',
    emptyScopesAlias: 'empty',
    upperCaseSubject: false,
    markBreakingChangeMode: false,
    allowBreakingChanges: ['feat', 'fix'],
    breaklineNumber: 100,
    breaklineChar: '|',
    skipQuestions: [],
    issuePrefixes: [
      // Defaults to GitHub style; replace with the link/closed prefix if using Gitee instead
      { value: 'closes', name: 'closes:   关闭/解决一个 issue' },
    ],
    customIssuePrefixAlign: 'top',
    emptyIssuePrefixAlias: 'skip',
    customIssuePrefixAlias: 'custom',
    allowCustomIssuePrefix: true,
    allowEmptyIssuePrefix: true,
    confirmColorize: true,
    scopeOverrides: undefined,
    defaultBody: '',
    defaultIssues: '',
    defaultScope: '',
    defaultSubject: '',
  },
}
`

export const DEFAULT_PKG_NAME = '@huberyyang/todo-scripts'
export const REPO_URL = 'https://github.com/HuberyYang-Space/todo-scripts'
