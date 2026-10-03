import { buildDualTimelinePlan, deriveTimelineFromActions, setDerivedTimelineEnabledForTest } from '../src/utils/dualTimelineEngine';
import type { CopilotAnalysisResult, IssueInput, ProjectContext } from '../src/types';

const context: ProjectContext = {
  projectName: 'WP4-TEST', productType: 'ECU', ecuType: 'CAN', projectPhase: 'DV',
  asilLevel: 'QM', customer: 'TEST', sopDate: 'TBD', nextMilestone: 'DV Gate',
  daysRemaining: 9, costConstraint: '未提供', sampleStatus: 'B样',
};
const issue: IssueInput = {
  issueCategories: ['Signal Integrity'], requirement: '当前规格', actualMeasurement: '当前实测',
  testCondition: '当前测试', environment: '台架', failurePhenomenon: '边沿异常',
  engineeringConcern: '节点风险', notes: '', attachments: [], measuredValues: {}, measuredValueSource: 'USER_MEASURED', measurementProvenance: {},
};

const result = {
  candidateActions: [
    {
      id: 'Option A', category: 'balanced', categoryLabel: '证据优先', name: '当前参数约束与验证闭环',
      description: '仅基于当前工程输入执行参数约束与验证。', expectedBenefit: '降低当前不确定性。',
      scores: { T: 80, S: 90, C: 80, Q: 85, L: 80, total: 84 },
      veto: { rejection_veto: false }, riskBefore: '当前风险', riskAfter: '受控', residualRisk: 'Medium',
      residualRiskDetail: '待验证', sideEffects: '待验证', verificationCost: '按项目核算', timeCost: '2 天',
      failureConsequence: '影响门禁', preconditions: '输入有效', verificationMethod: 'A/B 验证并回填实测',
      planB: '升级硬件方案', changeImpact: { costChange: '中低', scheduleLeadTime: '2 天', impedanceOrSignalImpact: '保持当前接口', emcThermalRipple: '按当前输入复核', softwareCalibrationRequired: true },
    },
    {
      id: 'Option B', category: 'conservative', categoryLabel: '源头整改', name: 'PCB版图与物料正式修正',
      description: '根据当前问题对 PCB 和 BOM 做正式修正。', expectedBenefit: '从硬件路径降低根因风险。',
      scores: { T: 92, S: 55, C: 50, Q: 95, L: 95, total: 79 },
      veto: { rejection_veto: false }, riskBefore: '当前风险', riskAfter: '降低', residualRisk: 'Low',
      residualRiskDetail: '待验证', sideEffects: '改版周期', verificationCost: '按项目核算', timeCost: '10 天',
      failureConsequence: '影响门禁', preconditions: '输入有效', verificationMethod: '改版 A/B 验证并归档',
      planB: '保留当前受控措施', changeImpact: { costChange: 'BOM 变更', scheduleLeadTime: '10 天', impedanceOrSignalImpact: '重新复核接口', emcThermalRipple: '重新复核', bomCostDeltaUsd: 1 },
    },
    {
      id: 'Option C', category: 'schedule_priority', categoryLabel: 'VETO示例', name: '被否决方案',
      description: '不进入时间轴。', expectedBenefit: '不得作为当前工程结论。',
      scores: { T: 20, S: 98, C: 98, Q: 10, L: 10, total: 50 },
      veto: { rejection_veto: true, veto_reason: 'VETO' }, riskBefore: '高', riskAfter: '高', residualRisk: 'High',
      residualRiskDetail: 'VETO', sideEffects: 'VETO', verificationCost: '不可用', timeCost: '0 天',
      failureConsequence: '禁止', preconditions: '禁止', verificationMethod: '禁止', planB: '无',
    },
  ],
} as unknown as Partial<CopilotAnalysisResult>;

const derived = deriveTimelineFromActions(result, context, issue);
if (!derived) throw new Error('WP4 derivation should produce both containment and permanent phases');
if (!derived.containmentPhase.actions.length || !derived.permanentPhase.actions.length) throw new Error('Derived timeline must contain both phases');
if (JSON.stringify(derived).includes('被否决方案')) throw new Error('VETO action leaked into derived timeline');

setDerivedTimelineEnabledForTest(false);
const legacy = buildDualTimelinePlan(result, context, issue);
setDerivedTimelineEnabledForTest(true);
const enabled = buildDualTimelinePlan(result, context, issue);
setDerivedTimelineEnabledForTest(false);

if (JSON.stringify(enabled) !== JSON.stringify(derived)) throw new Error('USE_DERIVED_TIMELINE=true did not return deriveTimelineFromActions output');
if (JSON.stringify(legacy) === JSON.stringify(derived)) throw new Error('WP4 toggle comparison is not observable for the fixture');

console.log('WP4_DERIVED_TIMELINE_PASS');
console.log(`containment=${derived.containmentPhase.actions.length}; permanent=${derived.permanentPhase.actions.length}; vetoExcluded=true`);
