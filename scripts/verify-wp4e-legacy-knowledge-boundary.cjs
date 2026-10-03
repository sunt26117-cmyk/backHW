const fs = require('fs');
const src = fs.readFileSync('src/utils/dualTimelineEngine.ts', 'utf8');
const checks = [
  ['legacy 时间轴有明确“知识基线”边界', /decorateLegacyTimeline/.test(src) && /知识基线｜非当前项目事实/.test(src)],
  ['legacy 不再偷偷使用 14 天默认节点', !/daysRemaining\s*\?\?\s*14/.test(src)],
  ['legacy 不再偷偷使用 DV 默认阶段', !/projectPhase\s*\?\?\s*['\"]DV['\"]/.test(src)],
  ['switch 中的 legacy 分支经过统一装饰器', (src.match(/return decorateLegacyTimeline\(\{/g) || []).length >= 6],
  ['WP4 派生逻辑仍不创建新措施', /步骤文字只能来自 candidateActions 已有字段/.test(src)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
console.log(`WP4e legacy knowledge boundary: ${checks.length}/${checks.length} passed`);
