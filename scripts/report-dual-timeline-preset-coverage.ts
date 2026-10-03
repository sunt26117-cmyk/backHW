import { PRESET_SCENARIOS } from '../src/data/presetScenarios';
import { runExpertAnalysis } from '../src/data/expertEngine';
import { deriveTimelineFromActions, setDerivedTimelineEnabledForTest, buildDualTimelinePlan } from '../src/utils/dualTimelineEngine';
import { resolveEngineeringDomain } from '../src/utils/scenarioDomainEngine';

setDerivedTimelineEnabledForTest(true);
const rows = PRESET_SCENARIOS.map((scenario) => {
  const issue = { ...scenario.issue, measuredValueSource: scenario.issue.measuredValueSource || 'BENCHMARK' };
  const result = runExpertAnalysis(scenario.context, issue);
  const derived = deriveTimelineFromActions(result, scenario.context, issue);
  const enabled = buildDualTimelinePlan(result, scenario.context, issue);
  return {
    id: scenario.id,
    domain: resolveEngineeringDomain(issue),
    actions: result.candidateActions?.length || 0,
    derived: Boolean(derived && derived.containmentPhase.actions.length && derived.permanentPhase.actions.length),
    vetoInPlan: Boolean(derived && JSON.stringify(derived).includes('一票否决')),
    enabledMatchesDerived: JSON.stringify(enabled) === JSON.stringify(derived),
    actionDetails: (result.candidateActions || []).map((a: any) => ({
      id: a.id, category: a.category, name: a.name, description: a.description, verificationMethod: a.verificationMethod, veto: a.veto,
      timeCost: a.timeCost, changeImpact: a.changeImpact,
    })),
  };
});
setDerivedTimelineEnabledForTest(false);

for (const r of rows) {
  console.log(`${r.domain}\t${r.id}\tactions=${r.actions}\tderived=${r.derived ? 'YES' : 'FALLBACK'}\tvetoInPlan=${r.vetoInPlan ? 'YES' : 'NO'}\tgate=${r.enabledMatchesDerived ? 'OK' : 'FAIL'}`);
  if (!r.derived) {
    for (const a of r.actionDetails) {
      console.log(`  ACTION\t${a.id}\t${a.category || ''}\t${a.name || ''}\t${a.description || ''}\tchangeImpact=${JSON.stringify(a.changeImpact || null)}`);
    }
  }
}
const failed = rows.filter((r) => r.vetoInPlan || !r.enabledMatchesDerived);
console.log(`coverage=${rows.filter(r => r.derived).length}/${rows.length}`);
if (failed.length) process.exitCode = 1;
