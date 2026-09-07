/**
 * changelogithub 配置：把 refactor / docs 也纳入 release notes
 *
 * 默认配置只把 feat / fix / perf 当作「显著变更」，其余类型一律折叠掉。
 * 本仓库大量改动是重构性质的（HB-01 ~ HB-11 有一半、HB-33 全部），
 * 按默认配置发版会得到一份写着「No significant changes」的说明，
 * 而那次改动恰恰是用户可见变化最大的一次。
 *
 * 分类标题保持英文。release notes 的条目就是 commit message 本身，而
 * commit message 按约定是英文（见 CLAUDE.md 的 Conventions 一节），标题
 * 若换成中文，整份说明会中英夹杂；而且 v1.4.0 之前的 release 都是按上游
 * 默认标题生成的，改标题等于让同一个仓库的历史说明前后长得不一样。
 * feat / fix / perf 三条与 changelogithub 15 的默认值逐字一致（含 emoji，
 * 注意 perf 是 🏎 不是 🔥），refactor / docs 上游没有默认值，沿用
 * changelogen 的写法。
 */
export default {
  types: {
    feat: { title: '🚀 Features' },
    fix: { title: '🐞 Bug Fixes' },
    perf: { title: '🏎 Performance' },
    refactor: { title: '💅 Refactors' },
    docs: { title: '📖 Documentation' },
  },
}
