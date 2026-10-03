const fs = require('fs');
const types = fs.readFileSync('src/types.ts', 'utf8');
const engine = fs.readFileSync('src/utils/dualTimelineEngine.ts', 'utf8');
const ui = fs.readFileSync('src/components/RecommendationRaciView.tsx', 'utf8');
const scenarioDynamic = fs.readFileSync('src/utils/scenarioDynamic.ts', 'utf8');
const robotJoint = fs.readFileSync('src/data/robotJointExpert.ts', 'utf8');
const checks = [
  ['类型定义了时间轴来源', /DualTimelineProvenance/.test(types)],
  ['候选方案派生时间轴带 provenance', /provenance: 'DERIVED_FROM_CANDIDATES'/.test(engine)],
  ['legacy 时间轴带知识基线 provenance', /provenance: 'LEGACY_KNOWLEDGE_BASELINE'/.test(engine)],
  // 重定目标：本条原先断言的是 `provenance || 'AI_GENERATED'` —— 那正是"本地规则时间轴被标成 AI"的源头，
  // 现在反向断言：引擎不得再把"未标注"默认解释成 AI 生成。
  ['引擎不得把未标注时间轴默认成 AI_GENERATED', !/provenance \|\| 'AI_GENERATED'/.test(engine)],
  ['本地规则生产端自报知识基线（scenarioDynamic）', /provenance: 'LEGACY_KNOWLEDGE_BASELINE'/.test(scenarioDynamic)],
  ['本地规则生产端自报知识基线（robotJointExpert）', /provenance: 'LEGACY_KNOWLEDGE_BASELINE'/.test(robotJoint)],
  ['引擎正文不得拼裸 UNKNOWN', !/\?\?\s*'UNKNOWN'/.test(engine) && !/\|\|\s*'UNKNOWN'/.test(engine)],
  ['时间轴 UI 显式展示来源', /当前候选方案派生/.test(ui) && /知识基线 · 非当前事实/.test(ui)],
  ['导出记录包含时间轴来源', /【时间轴来源】：\$\{dualTimeline\.provenance/.test(ui)],
  ['导出记录不得把未标注默认成 AI', !/provenance \|\| 'AI_GENERATED'/.test(ui)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
console.log(`TIMELINE_PROVENANCE_CONTRACT_PASS ${checks.length}/${checks.length}`);
