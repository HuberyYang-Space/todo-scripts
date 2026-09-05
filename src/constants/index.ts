/** 两份 commitlint 配置模板共用的标准 Conventional Commits 类型表 */
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

/** 渲染 type-enum 规则里的数组项文本；两份模板共用同一份类型表 */
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
      type: '选择你要提交的类型：',
      scope: '选择一个提交范围（可选）：',
      customScope: '请输入自定义的提交范围：',
      subject: '填写简短精炼的变更描述：\\n',
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行：\\n',
      breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行：\\n',
      footerPrefixesSelect: '选择关联 issue 前缀（可选）：',
      customFooterPrefix: '输入自定义 issue 前缀：',
      footer: '列举关联 issue（可选），例如 #31, #I3244：\\n',
      confirmCommit: '是否提交或修改 commit？',
    },
    types: [
      { value: 'feat', name: 'feat:     新增功能' },
      { value: 'fix', name: 'fix:      修复缺陷' },
      { value: 'docs', name: 'docs:     文档更新' },
      { value: 'style', name: 'style:    代码格式' },
      { value: 'refactor', name: 'refactor: 代码重构' },
      { value: 'perf', name: 'perf:     性能提升' },
      { value: 'test', name: 'test:     测试相关' },
      { value: 'build', name: 'build:    构建相关' },
      { value: 'ci', name: 'ci:       持续集成' },
      { value: 'revert', name: 'revert:   回退代码' },
      { value: 'chore', name: 'chore:    其他修改' },
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
      // 默认走 GitHub 风格；用 Gitee 的话把它换成 link / closed 前缀
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
