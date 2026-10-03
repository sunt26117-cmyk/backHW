/**
 * 时间轴来源与文案的**运行时**契约（静态检查看不到）：
 * 1) 每个预设工况产出的 dualTimeline 必须带 provenance，且只能是三个枚举值之一；
 * 2) 预设流程里不得出现 AI_GENERATED —— 本地规则/派生时间轴被标成 AI 是假阳性来源标注；
 * 3) 正文里不得出现裸 token 'UNKNOWN'（缺值必须省略从句或写人话）。
 *
 * 背景：dualTimelineEngine 曾用 `existingTimeline.provenance || 'AI_GENERATED'` 兜底，
 * 而 scenarioDynamic / robotJointExpert 从不打标 —— 本地确定性时间轴因此被界面显示、
 * 并被写进 AI 提示词为"AI 时间轴"。
 */
import assert from 'node:assert/strict';
import { PRESET_SCENARIOS } from '../src/data/presetScenarios';
import { runExpertAnalysis } from '../src/data/expertEngine';
import { buildDualTimelinePlan, setDerivedTimelineEnabledForTest } from '../src/utils/dualTimelineEngine';

const ALLOWED = ['DERIVED_FROM_CANDIDATES', 'LEGACY_KNOWLEDGE_BASELINE', 'AI_GENERATED'];
let derivedCount = 0;
let legacyCount = 0;
let checks = 0;

for (const scenario of PRESET_SCENARIOS) {
  const issue = { ...scenario.issue, measuredValueSource: (scenario.issue as any).measuredValueSource || 'BENCHMARK' };
  const result = runExpertAnalysis(scenario.context, issue);

  setDerivedTimelineEnabledForTest(true);
  const forced = buildDualTimelinePlan(result, scenario.context, issue);
  setDerivedTimelineEnabledForTest(false);
  const byDefault = buildDualTimelinePlan(result, scenario.context, issue);

  for (const [mode, plan] of [['forced-derived', forced], ['default', byDefault]] as const) {
    const where = scenario.id + '（' + mode + '）';
    assert.ok(plan.provenance, where + '：dualTimeline 缺少 provenance');
    assert.ok(ALLOWED.includes(plan.provenance as string), where + '：provenance 取值非法：' + String(plan.provenance));
    assert.notEqual(plan.provenance, 'AI_GENERATED', where + '：本地/派生时间轴不得被标成 AI_GENERATED（假阳性来源标注）');
    assert.ok(!/UNKNOWN/.test(JSON.stringify(plan)), where + '：正文里出现裸 token UNKNOWN');
    checks += 2;
    if (plan.provenance === 'DERIVED_FROM_CANDIDATES') derivedCount += 1; else legacyCount += 1;
  }
}

// 反向控制：两类分支都必须真的出现过，否则上面的断言就是空转。
assert.ok(derivedCount > 0, '没有任何预设走派生分支：断言形同空转');
assert.ok(legacyCount > 0, '没有任何预设走知识基线分支：断言形同空转');

console.log('timeline-provenance-runtime: PASS（' + PRESET_SCENARIOS.length + ' 个预设 x 2 模式；派生 '
  + derivedCount + ' / 知识基线 ' + legacyCount + '；无 AI 假阳性、无裸 UNKNOWN；共 ' + checks + ' 项断言）');
