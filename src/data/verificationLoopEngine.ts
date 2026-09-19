/**
 * Next Best Action + 验证闭环 + Value of Information (VOI) 引擎 (Section 8)
 * 严格遵照 V4 升级任务书：NOW/WHY/EXPECTED/PASS/FAIL/OWNER/DUE，VOI 性价比排序，闭环驱动风险与置信度重算
 */

import {
  NextBestActionItem,
  ProjectContext,
  IssueInput,
  CopilotAnalysisResult,
  ValueOfInformationTest,
  VerificationPlanItem,
  TestResultEntry,
  DecisionRecord,
  TransparentRiskScore,
  V4CandidateAction,
  EvidenceItem,
} from '../types';

export function generateNextBestAction(
  daysRemaining: number,
  context?: ProjectContext,
  issue?: IssueInput,
  result?: CopilotAnalysisResult | null
): NextBestActionItem {
  const problem = issue?.failurePhenomenon || issue?.engineeringConcern || '当前工程问题';
  const requirement = issue?.requirement || '当前需求门限';
  const rec = result?.finalRecommendation?.recommendedOptionName || '当前推荐方案';
  const risk = result?.riskRatings?.overallRisk || 'Medium';
  const category = issue?.issueCategories?.[0] || '工程验证';
  const project = context?.projectName || '当前工程';
  return {
    now: `立即针对【${project}】执行 ${category} 首轮证据采集：${problem.slice(0, 100)}`,
    why: `当前整体风险为 ${risk}，必须用实测证据验证“${requirement.slice(0, 70)}”，再决定是否执行【${rec.slice(0, 70)}】。`,
    expected: `获得当前典型工况的关键波形/测量值，并确认是否仍存在：${problem.slice(0, 80)}。`,
    passCriteria: `PASS: 实测结果满足当前需求门限，且关键风险项未触发一票否决；将结果回写为 MEASURED 证据。`,
    failCriteria: `FAIL: 任一关键实测值突破需求或绝对最大额定边界，立即停止放行，切换 Plan B / 工程升级路径。`,
    owner: '硬件负责人 & 验证测试工程师',
    due: `里程碑前完成首轮摸底（剩余 ${daysRemaining} 天）`,
  };
}

export function calculateVoiTestPriorities(context?: ProjectContext, issue?: IssueInput, result?: CopilotAnalysisResult | null): ValueOfInformationTest[] {
  const problem = issue?.failurePhenomenon || issue?.engineeringConcern || '当前工程问题';
  const category = issue?.issueCategories?.[0] || '工程验证';
  const candidates: Omit<ValueOfInformationTest, 'voiScore' | 'isTopPriority'>[] = [
    {
      testName: `T1: 当前工况关键参数实测 (${category})`,
      objective: `验证当前问题：${problem.slice(0, 90)}`,
      decisionImpactScore: 9.5,      // 极高：直接决定是否一票否决方案
      riskReductionScore: 9.0,       // 消除最致命的直通与过压炸机风险
      uncertaintyReductionScore: 8.5,// 将估算值转化为高置信度实测值
      costScore: 2.0,                // 极低：已有台架和探头，仅需少量工时
      timeHoursScore: 3.0,           // 快：4小时内出结果
      rationale: `针对 ${context?.projectName || '当前工程'}，优先消除当前问题的最大不确定性`,
    },
    {
      testName: `T2: 关键失效链路验证 (${category})`,
      objective: `确认物理机制与需求门限：${issue?.requirement || problem}`,
      decisionImpactScore: 8.5,
      riskReductionScore: 8.8,
      uncertaintyReductionScore: 8.0,
      costScore: 2.5,
      timeHoursScore: 3.5,
      rationale: '直接回答是否存在同桥臂瞬态直通击穿的根本隐患',
    },
    {
      testName: `T3: 环境/可靠性边界验证 (${context?.projectPhase || '当前阶段'})`,
      objective: `验证当前工程在 ${issue?.environment || '目标环境'} 下的边界裕量`,
      decisionImpactScore: 6.5,
      riskReductionScore: 7.0,
      uncertaintyReductionScore: 6.5,
      costScore: 4.5,
      timeHoursScore: 8.0,           // 需耗费温箱预热和稳态平衡时间
      rationale: '对当前紧急急停决策影响次要，可在方案确认后作为可靠性例行验证',
    },
    {
      testName: 'T4: 规格符合性/系统级回归验证',
      objective: `确认最终是否满足：${issue?.requirement || '项目需求与验证门禁'}`,
      decisionImpactScore: 6.0,
      riskReductionScore: 6.5,
      uncertaintyReductionScore: 7.0,
      costScore: 8.0,                // 昂贵：暗室租金与排期成本高
      timeHoursScore: 9.0,           // 需预约外部暗室
      rationale: '暗室成本高排期长，应在台架波形优化达标后再行进场，避免浪费暗室费用',
    },
  ];

  // VOI = (Decision Impact + Risk Reduction + Uncertainty Reduction) / (Cost + Time)
  const scored = candidates.map((item) => {
    const numerator = item.decisionImpactScore + item.riskReductionScore + item.uncertaintyReductionScore;
    const denominator = item.costScore + item.timeHoursScore;
    const voiScore = Number((numerator / denominator).toFixed(2));
    return {
      ...item,
      voiScore,
      isTopPriority: false,
    };
  });

  scored.sort((a, b) => b.voiScore - a.voiScore);
  if (scored.length > 0) {
    scored[0].isTopPriority = true;
  }
  return scored;
}

export function generateStructuredVerificationPlan(context?: ProjectContext, issue?: IssueInput, result?: CopilotAnalysisResult | null): VerificationPlanItem[] {
  const problem = issue?.failurePhenomenon || issue?.engineeringConcern || '当前工程问题';
  const requirement = issue?.requirement || '当前需求门限';
  const categories = issue?.issueCategories || [];
  const method = categories.includes('EMC')
    ? '标准暗室 + 近场/线束电流探头，建立超标频点与耦合路径对照'
    : categories.includes('Component Alternative')
    ? '主件/替代件 A-B 对比，覆盖静态参数、动态开关、热与保护时序'
    : categories.includes('WCCA')
    ? '全温区 WCCA 边界点 + Monte Carlo/实测样件交叉验证'
    : categories.includes('Thermal') || categories.includes('Power')
    ? '温箱 + 热像/热电偶，记录稳态与瞬态结温裕量'
    : categories.includes('Functional Safety')
    ? '故障注入 + 独立监测通道，确认安全状态切入时间与诊断覆盖'
    : '按当前典型工况执行目标参数实测，并与需求/规格逐项对照';
  return [
    {
      objective: `当前工况首要验证：${problem.slice(0, 80)}`,
      condition: issue?.testCondition || '按当前典型工况执行真实测试',
      method,
      instrumentation: 'Tektronix MSO 54 示波器 (1GHz 带宽) + IsoVu 光隔离差分探头 + 罗氏线圈电流探头',
      measurement: issue?.actualMeasurement || requirement,
      passCriteria: `满足需求：${requirement.slice(0, 100)}；并且不存在关键绝对最大额定值违规。`,
      failCriteria: `实测突破需求或出现当前问题的同类异常：${problem.slice(0, 80)}`,
      sampleSize: 5,
      owner: '张工 (硬件开发专家)',
      deadline: `${context?.projectPhase || '当前阶段'} / Day-1`,
    },
    {
      objective: `第二验证项：关键机理闭环｜${problem.slice(0, 70)}`,
      condition: issue?.testCondition || '按当前典型工况最不利组合执行',
      method,
      instrumentation: categories.includes('EMC') ? '频谱分析仪 + 近场探头 + 线束电流探头' : '示波器/数据采集 + 与当前问题匹配的传感器',
      measurement: issue?.actualMeasurement || requirement,
      passCriteria: `满足当前需求：${requirement.slice(0, 100)}；关键风险项不得突破绝对最大额定边界。`,
      failCriteria: `实测突破需求或复现异常：${problem.slice(0, 80)}`,
      sampleSize: 3,
      owner: '李工 (驱动与功率硬件工程师)',
      deadline: `${context?.projectPhase || '当前阶段'} / Day-2`,
    },
    {
      objective: `第三验证项：环境与次生风险｜${context ? `${context.productType} / ${context.projectPhase}` : '目标环境'}`,
      condition: issue?.environment || '目标环境 + 当前问题最不利条件',
      method,
      instrumentation: '频谱分析仪 + 近场 H-Field 磁场探头 + 接触式点温计',
      measurement: issue?.actualMeasurement || '关键异常指标与温升/频谱变化量',
      passCriteria: `达到当前需求与内部放行门限：${requirement.slice(0, 90)}`,
      failCriteria: `未满足需求或出现明显热/EMC/可靠性异常：${problem.slice(0, 80)}`,
      sampleSize: 5,
      owner: '王工 (EMC 整改工程师)',
      deadline: `${context?.projectPhase || '当前阶段'} / Day-3`,
    },
  ];
}

export function executeTestFeedbackLoop(
  currentRisk: TransparentRiskScore,
  testEntry: TestResultEntry
): {
  updatedRisk: TransparentRiskScore;
  evidenceUpdate: EvidenceItem;
  decisionUpdateMessage: string;
} {
  // 根据测试结果重新计算风险与置信度
  const isPass = testEntry.passFail === 'PASS';
  const updatedRisk: TransparentRiskScore = {
    ...currentRisk,
    overallRiskLevel: isPass ? 'Low' : 'High',
    overallScore: isPass ? 28 : 88,
    technicalRisk: isPass ? 'Low' : 'High',
    confidence: 'HIGH', // 实测数据更新后置信度变为 HIGH
    verificationGap: 'LOW', // 闭环补全
    uncertainty: 'LOW',
    majorRiskDriver: isPass ? '长期环境老化耐受度 (已消除急停炸机风险)' : '实测仍突破安全限值，必须切入硬件改板',
  };

  const evidenceUpdate: EvidenceItem = {
    id: `EVID-${Date.now()}`,
    claim: `实测 ${testEntry.measurement} 结果为 ${testEntry.result} (${testEntry.passFail})`,
    evidenceType: 'MEASURED',
    source: `台架实验报告 ${testEntry.testId} (测试人: ${testEntry.engineer})`,
    confidence: 'HIGH',
    confidenceReason: '使用 1GHz 示波器光隔离差分探头实测波形确认，数据具有最高工程证据效力',
    measuredValue: testEntry.result,
  };

  const decisionUpdateMessage = isPass
    ? '✅ 实测数据完全符合 Pass Criteria，母线瞬态与米勒尖峰均被成功压制至安全区，已具备正式推进放行条件，风险闭环关闭！'
    : '❌ 实测数据触发 Fail Criteria 警戒红线，当前软硬件参数仍不足以抵抗极端应力，决策引擎自动触发 Escalation 并切换至 Plan B 硬件改板！';

  return {
    updatedRisk,
    evidenceUpdate,
    decisionUpdateMessage,
  };
}
