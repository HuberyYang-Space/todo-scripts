/**
 * changelogithub 配置：把 refactor / docs 也纳入 release notes
 *
 * 默认配置只把 feat / fix / perf 当作「显著变更」，其余类型一律折叠掉。
 * 本仓库大量改动是重构性质的（HB-01 ~ HB-11 有一半、HB-33 全部），
 * 按默认配置发版会得到一份写着「No significant changes」的说明，
 * 而那次改动恰恰是用户可见变化最大的一次。
 *
 * 分类标题用中文、条目内容是英文的 commit message —— 这是刻意的：
 * 标题给读 release 的人分类用，条目是提交历史本身，而 commit message
 * 按约定保持英文（见 CLAUDE.md 的 Conventions 一节）。
 */
export default {
  types: {
    feat: { title: '🚀 新功能' },
    fix: { title: '🐞 缺陷修复' },
    perf: { title: '🔥 性能' },
    refactor: { title: '💅 重构' },
    docs: { title: '📖 文档' },
  },
}
