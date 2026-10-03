import assert from 'node:assert/strict';
import { PRESET_SCENARIOS } from '../src/data/presetScenarios';
import { runExpertAnalysis } from '../src/data/expertEngine';
import { buildDualTimelinePlan, DERIVED_TIMELINE_ENABLED_DOMAINS, resetDerivedTimelineModeForTest, setDerivedTimelineEnabledForTest } from '../src/utils/dualTimelineEngine';
import { resolveEngineeringDomain } from '../src/utils/scenarioDomainEngine';

const enabled = new Set<string>(DERIVED_TIMELINE_ENABLED_DOMAINS);
let checked = 0;
let derivedByDefault = 0;
let fallbackByDefault = 0;

for (const scenario of PRESET_SCENARIOS) {
  const domain = resolveEngineeringDomain(scenario.issue);
  const result = runExpertAnalysis(scenario.context, scenario.issue);
  const legacyPlan = (() => {
    setDerivedTimelineEnabledForTest(false);
    return buildDualTimelinePlan(result, scenario.context, scenario.issue);
  })();
  const forcedDerived = (() => {
    setDerivedTimelineEnabledForTest(true);
    return buildDualTimelinePlan(result, scenario.context, scenario.issue);
  })();
  resetDerivedTimelineModeForTest();
  const defaultPlan = buildDualTimelinePlan(result, scenario.context, scenario.issue);

  assert.ok(defaultPlan?.containmentPhase && defaultPlan?.permanentPhase, `${scenario.id}: 默认双时间轴结构缺失`);
  checked += 1;

  if (enabled.has(domain)) {
    assert.ok(forcedDerived, `${scenario.id}/${domain}: 已进入 WP4d allowlist，但 candidateActions 无法形成双时间轴，应先从 allowlist 移除或补齐候选方案`);
    assert.deepEqual(defaultPlan, forcedDerived, `${scenario.id}/${domain}: allowlist 域默认结果没有真正启用派生`);
    derivedByDefault += 1;
  } else {
    assert.deepEqual(defaultPlan, legacyPlan, `${scenario.id}/${domain}: 未确认域发生了默认行为变化`);
    fallbackByDefault += 1;
  }

  console.log(`${domain}\t${scenario.id}\tdefault=${enabled.has(domain) ? 'DERIVED' : 'LEGACY/FALLBACK'}\tforcedDerived=${forcedDerived ? 'YES' : 'NO'}`);
}

resetDerivedTimelineModeForTest();
console.log(`WP4D_DOMAIN_GATES_PASS checked=${checked} derivedByDefault=${derivedByDefault} fallbackByDefault=${fallbackByDefault}`);
