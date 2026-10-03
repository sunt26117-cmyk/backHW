const fs = require('fs');
const types = fs.readFileSync('src/types.ts', 'utf8');
const engine = fs.readFileSync('src/utils/dualTimelineEngine.ts', 'utf8');
const ui = fs.readFileSync('src/components/RecommendationRaciView.tsx', 'utf8');
const checks = [
  ['类型定义了时间轴来源', /DualTimelineProvenance/.test(types)],
  ['候选方案派生时间轴带 provenance', /provenance: 'DERIVED_FROM_CANDIDATES'/.test(engine)],
  ['legacy 时间轴带知识基线 provenance', /provenance: 'LEGACY_KNOWLEDGE_BASELINE'/.test(engine)],
  ['AI 已有时间轴默认标记为 AI_GENERATED', /provenance \|\| 'AI_GENERATED'/.test(engine)],
  ['时间轴 UI 显式展示来源', /当前候选方案派生/.test(ui) && /知识基线 · 非当前事实/.test(ui)],
  ['导出记录包含时间轴来源', /【时间轴来源】：\$\{dualTimeline\.provenance/.test(ui)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exit(1);
console.log(`TIMELINE_PROVENANCE_CONTRACT_PASS ${checks.length}/${checks.length}`);
