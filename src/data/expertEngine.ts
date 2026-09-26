import { ProjectContext, IssueInput, CopilotAnalysisResult, CandidateAction } from '../types';
import { generateBldcMotorAnalysis } from './bldcMotorExpert';
import { generateRobotJointAnalysis, getRobotJointPillars } from './robotJointExpert';
import { applyScenarioDynamicLayer } from '../utils/scenarioDynamic';
import { calculateDomainMetrics, getDomainDataQuality, getDomainPhysics, getEngineeringDomainLabel, resolveEngineeringDomain, resolveEngineeringDomains } from '../utils/scenarioDomainEngine';
import { getCrossDomainCouplings } from '../utils/crossDomainCouplingMatrix';
import { calculateBldcDeterministicCalculations } from '../utils/bldcDeterministicEngine';
import { extractUnifiedEngineeringModel } from '../utils/unifiedStateExtractor';
import { runDeterministicPrecomputations } from '../utils/deterministicPrecomputation';

export function runExpertAnalysis(rawContext?: Partial<ProjectContext>, rawIssue?: Partial<IssueInput>): CopilotAnalysisResult {
  // 缺省上下文不得编造具体项目事实（客户/ECU型号/SOP日期/样品阶段等），
  // 一律用明确的"未提供"占位，避免把空表单渲染成一个看似真实的 DV 项目。
  const context: ProjectContext = {
    projectName: rawContext?.projectName || '待输入：项目名称未提供',
    productType: rawContext?.productType || '待输入：产品类型未提供',
    ecuType: rawContext?.ecuType || '待输入：ECU 类型未提供',
    projectPhase: rawContext?.projectPhase || 'DV',
    asilLevel: rawContext?.asilLevel || 'ASIL B',
    customer: rawContext?.customer || '未提供：客户信息缺失',
    sopDate: rawContext?.sopDate || '未提供：SOP 日期缺失',
    nextMilestone: rawContext?.nextMilestone || '待输入：下一里程碑未提供',
    daysRemaining: typeof rawContext?.daysRemaining === 'number' ? rawContext.daysRemaining : 14,
    costConstraint: rawContext?.costConstraint || '未提供',
    sampleStatus: rawContext?.sampleStatus || '待输入：样件状态未提供',
  };

  const measuredValues = rawIssue?.measuredValues && typeof rawIssue.measuredValues === 'object' ? rawIssue.measuredValues : {};
  const measuredSummary = Object.entries(measuredValues)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join('；');
  const issue: IssueInput = {
    issueCategories: Array.isArray(rawIssue?.issueCategories) && rawIssue.issueCategories.length > 0
      ? rawIssue.issueCategories
      : ['EMC'],
    requirement: rawIssue?.requirement || '待输入：客户/标准/设计规格尚未提供',
    actualMeasurement: [rawIssue?.actualMeasurement || '待输入：尚未提供实测结果', measuredSummary ? `【实测数值回填】${measuredSummary}` : ''].filter(Boolean).join('；'),
    testCondition: rawIssue?.testCondition || '待输入：供电、负载、开关频率及测试边界',
    environment: rawIssue?.environment || '待输入：温度、暗室/台架/产线及样件条件',
    failurePhenomenon: rawIssue?.failurePhenomenon || '待输入：失效现象与可重复条件尚未确认',
    engineeringConcern: rawIssue?.engineeringConcern || '待输入：项目节点、成本、质量或技术冲突尚未定义',
    notes: rawIssue?.notes || '',
    attachments: rawIssue?.attachments || [],
    measuredValues,
    measuredValueSource: rawIssue?.measuredValueSource || 'USER_MEASURED',
    measurementProvenance: rawIssue?.measurementProvenance || {},
  };

  const cats = issue.issueCategories;
  const req = (issue.requirement || '').toLowerCase();
  const phen = (issue.failurePhenomenon || '').toLowerCase();
  const concern = (issue.engineeringConcern || '').toLowerCase();
  const allText = `${req} ${phen} ${concern}`;

  const domain = resolveEngineeringDomain(issue);
  const isBldc = domain === 'BLDC';
  const isRobotJoint = domain === 'ROBOT_JOINT';
  const isEmc = domain === 'EMC_BCI' || domain === 'EMC_ESD' || domain === 'EMC_RE_CE';
  const isComponent = domain === 'COMPONENT';
  const isWcca = domain === 'WCCA' || domain === 'WCCA_EOL';
  const isCustomerSilence = domain === 'CUSTOMER' || domain === 'DEVIATION';
  const isThermal = domain === 'THERMAL';

  let result: CopilotAnalysisResult;
  if (isBldc) {
    result = generateBldcMotorAnalysis(context, issue);
  } else if (isRobotJoint) {
    result = generateRobotJointAnalysis(context, issue);
  } else {
    // 其余域统一由 applyScenarioDynamicLayer 依据当前工况动态重建候选方案/评分/文档，
    // 此处仅提供最小结构骨架（不再使用写死示例案例数字的 canned 生成器）。
    result = buildMinimalOfflineResult();
  }

  // 当前案例的 P0 支柱统一由 scenarioDynamic 基于当前 issue/context 重建。
  // 不再调用 decisionPillars.ts，避免历史模板数字/方案成为运行时事实来源。

  // 补全升级2：双层工程时间轴 (T+24h 应急临时遏制 vs 下一阶段永久纠正)

  // 多域基线：保留原有“主导域”规则，同时为所有涉及领域生成独立证据就绪度、计算结果与域级结论，供后续页面和 AI 决策消费。
  const domainList = resolveEngineeringDomains(issue);
  const primaryDomain = resolveEngineeringDomain(issue);
  const domainAssessments = domainList.map((domainKey) => {
    const quality = getDomainDataQuality({ ...issue, issueCategories: issue.issueCategories.filter((cat) => {
      const probe = resolveEngineeringDomain({ ...issue, issueCategories: [cat] });
      return probe === domainKey;
    }) });
    const domainProfile = getDomainPhysics({ ...issue, issueCategories: (() => {
      const cat = issue.issueCategories.find((c) => resolveEngineeringDomain({ ...issue, issueCategories: [c] }) === domainKey);
      return cat ? [cat] : issue.issueCategories;
    })() });
    return {
      domain: domainKey,
      role: domainKey === primaryDomain ? 'PRIMARY' as const : 'RELATED' as const,
      evidenceLevel: quality.complete ? 'HIGH' : quality.requiredDone > 0 ? 'MEDIUM' : 'LOW',
      knownFacts: Object.entries(issue.measuredValues || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `${k}=${v}`).slice(0, 12),
      evidenceGaps: quality.missingRequired,
      minimumValidation: domainProfile.tests[0] || '补齐该领域关键实测证据',
      domainConclusion: `${getEngineeringDomainLabel(domainKey)}：${quality.complete ? '关键必填证据基本齐备，可进入域级判断' : `证据不足，尚缺 ${quality.missingRequired.slice(0, 3).join('、') || '关键边界数据'}`}`,
      chain: domainProfile.chain,
      outputs: domainProfile.outputs,
    };
  });
  const crossDomainLinks = buildCrossDomainLinks(domainList, issue);
  const crossDomainVetoes = domainList.filter((d) => ['SAFETY', 'THERMAL', 'EMC_RE_CE', 'EMC_BCI', 'EMC_ESD'].includes(d)).map((d) => ({
    condition: `${getEngineeringDomainLabel(d)} 存在硬门限超限或功能失败证据`,
    blocks: ['下一工程门禁放行'],
    rationale: '跨域改善不能抵消该领域的硬门禁；需先完成该领域的合格证据闭环。',
  }));
  result.multiDomainAnalysis = {
    primaryDomain,
    relatedDomains: domainList.filter((d) => d !== primaryDomain),
    domainAssessments,
    crossDomainLinks,
    crossDomainVetoes,
  };
  const combinedMetrics = calculateDomainMetrics(issue, context);
  const precomputedFacts = runDeterministicPrecomputations(context, issue);
  const factsAsEvidence = precomputedFacts.map((fact) => ({
    id: fact.id,
    key: fact.parameter,
    title: fact.title,
    engine: 'deterministicPrecomputation',
    calculation: fact.title,
    formula: fact.formulaOrBasis,
    value: typeof fact.calculatedValue === 'number' ? fact.calculatedValue : Number(fact.calculatedValue) || 0,
    unit: fact.unit,
    inputs: fact.inputs || [],
    inputSources: fact.inputSources || {},
    missingInputs: fact.missingInputs || [],
    specThreshold: typeof fact.specThreshold === 'number' ? fact.specThreshold : (fact.specThreshold ? parseFloat(String(fact.specThreshold)) : undefined),
    safetyMargin: typeof fact.safetyMargin === 'number' ? fact.safetyMargin : (fact.safetyMargin ? parseFloat(String(fact.safetyMargin)) : undefined),
    complianceVerdict: fact.complianceVerdict,
    directiveForAi: fact.directiveForAi,
    status: (fact.status || 'CALCULATED') as 'CALCULATED' | 'INSUFFICIENT_INPUT',
  }));

  if (combinedMetrics.length || factsAsEvidence.length) {
    const calculatedEvidence = Array.from(
      new Map([
        ...(result.analysisBasis?.calculatedOutputEvidence || []),
        ...factsAsEvidence,
      ].map((item) => [item.id || item.key, item])).values()
    );
    result.analysisBasis = {
      ...(result.analysisBasis || { ruleInputs: [], measuredInputs: [], calculatedOutputs: [], assumptions: [], fixedTemplateFields: [] }),
      calculatedOutputs: Array.from(new Set([
        ...(result.analysisBasis?.calculatedOutputs || []),
        ...combinedMetrics.map((m) => `${m.label}=${m.value}`),
        ...factsAsEvidence.filter((e) => e.status === 'CALCULATED' && e.value !== undefined).map((e) => `${e.key}=${e.value} ${e.unit}; margin=${e.safetyMargin ?? 'N/A'}; verdict=${e.complianceVerdict ?? 'N/A'}`),
      ])),
      calculatedOutputEvidence: calculatedEvidence,
    };
  }

  // 补充一票否决类型与工程改动影响度评估 (Change Impact)
  if (result.candidateActions) {
    result.candidateActions = result.candidateActions.map((action) => {
      let veto_type = action.veto?.veto_type;
      if (action.veto?.rejection_veto && !veto_type) {
        if (action.veto.veto_reason?.includes('SOA') || action.veto.veto_reason?.includes('击穿') || action.veto.veto_reason?.includes('耐压')) {
          veto_type = 'SOA_BREACH';
        } else if (action.veto.veto_reason?.includes('安全') || action.veto.veto_reason?.includes('ASIL')) {
          veto_type = 'SAFETY_GOAL_BREACH';
        } else if (action.veto.veto_reason?.includes('延期') || action.veto.veto_reason?.includes('周期')) {
          veto_type = 'SCHEDULE_COLLAPSE';
        } else if (action.veto.veto_reason?.includes('法规') || action.veto.veto_reason?.includes('CISPR')) {
          veto_type = 'CUSTOMER_CSA_VETO';
        } else {
          veto_type = 'ABSOLUTE_MAX_VIOLATION';
        }
      }

      const categoryText = issue.issueCategories?.join(' / ') || 'Other';
      const problemText = issue.failurePhenomenon || issue.engineeringConcern || '当前工况关键问题';
      const domainLabel = domain === 'BLDC' ? 'BLDC / 功率级瞬态' :
        domain === 'EMC_BCI' ? 'EMC BCI / 共模耦合' :
        domain === 'EMC_ESD' ? 'EMC ESD / 放电回流' :
        domain === 'EMC_RE_CE' ? 'EMC RE/CE / 源-路径' :
        domain === 'COMPONENT' ? '器件电气 / SOA / 供应链' :
        domain === 'WCCA' || domain === 'WCCA_EOL' ? 'WCCA / 误差预算 / 量产' :
        domain === 'THERMAL' ? '热设计 / 结温' :
        domain === 'POWER_TRANSIENT' ? '车载电源瞬态' :
        domain === 'POWER' ? '电源完整性' :
        domain === 'SIGNAL' ? 'Signal Integrity / CAN-FD' : categoryText;
      const defaultChangeImpact = action.category === 'conservative'
        ? { costChange: '较高：需按当前工况重新核算 BOM Delta', scheduleLeadTime: `需重新评估打样周期（当前剩余 ${context.daysRemaining} 天）`, impedanceOrSignalImpact: `围绕${domainLabel}重新验证接口/寄生影响`, emcThermalRipple: `针对${domainLabel}重新核算改善量与副作用` }
        : action.category === 'balanced'
        ? { costChange: '中低：按当前工况候选方案核算', scheduleLeadTime: `优先选择不阻塞当前 ${context.nextMilestone} 的措施`, impedanceOrSignalImpact: `重点验证${domainLabel}边界，不采用跨域假设`, emcThermalRipple: `以当前实测与验证计划回填，禁止沿用其他工况固定值` }
        : { costChange: '低成本表面方案，但须核查残余风险', scheduleLeadTime: `必须与当前 ${context.daysRemaining} 天窗口比较`, impedanceOrSignalImpact: `当前工况 ${categoryText} 下的实际副作用待验证`, emcThermalRipple: `围绕“${problemText.slice(0, 70)}”重新判断是否满足门禁` };

      // 补充风险净跃迁标注 (riskDelta)
      let riskDelta = action.riskDelta;
      if (!riskDelta) {
        if (action.riskBefore && action.riskAfter) {
          const beforeShort = action.riskBefore.split('，')[0].split('。')[0].slice(0, 24);
          const afterShort = action.riskAfter.split('，')[0].split('。')[0].slice(0, 24);
          riskDelta = `${beforeShort} ➔ ${afterShort}`;
        } else {
          riskDelta = action.residualRisk === 'Low'
            ? '高风险隐患 ➔ 受控低残余风险 (满足门禁放行)'
            : action.residualRisk === 'Medium'
            ? '高不确定性 ➔ 中等受控风险 (需快速实验收敛)'
            : '潜在击穿/超差 ➔ 高残余风险 (触发一票否决或限期整改)';
        }
      }

      // 补充跨域物理耦合复核闭环 (crossDomainCouplingChecks)
      let crossDomainCouplingChecks = action.crossDomainCouplingChecks;
      if (!crossDomainCouplingChecks || crossDomainCouplingChecks.length === 0) {
        const pDom = resolveEngineeringDomain(issue);
        const rDoms = resolveEngineeringDomains(issue).filter((d) => d !== pDom);
        const couplings = getCrossDomainCouplings(pDom, rDoms);
        if (couplings.length > 0) {
          crossDomainCouplingChecks = couplings.map((c) => {
            if (action.veto?.rejection_veto) {
              return {
                rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
                addressed: false,
                note: `方案被一票否决：未满足${c.affectedDomain}门禁（${action.veto.veto_reason?.slice(0, 40) || '存在违约或法规硬性冲突'}）`,
              };
            }
            if (action.category === 'conservative' || action.id.includes('Option A')) {
              return {
                rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
                addressed: true,
                note: `已纳入本方案协同参数配置，${c.requiredRevalidation[0] || '参数处于车规安全工作区以内'}`,
              };
            }
            return {
              rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
              addressed: true,
              note: `已建立前置验证边界：${c.physicalTradeoff.slice(0, 45)}`,
            };
          });
        }
      }

      return {
        ...action,
        riskDelta,
        crossDomainCouplingChecks,
        veto: {
          ...action.veto,
          veto_type,
        },
        changeImpact: action.changeImpact || defaultChangeImpact,
      };
    });
  }

  result = applyScenarioDynamicLayer(result, context, issue);

  // 确保 candidateActions 中的 riskDelta、crossDomainCouplingChecks、veto 100% 完整具备
  if (result.candidateActions) {
    const pDom = resolveEngineeringDomain(issue);
    const rDoms = resolveEngineeringDomains(issue).filter((d) => d !== pDom);
    const couplings = getCrossDomainCouplings(pDom, rDoms);

    result.candidateActions = result.candidateActions.map((action) => {
      let riskDelta = action.riskDelta;
      if (!riskDelta) {
        if (action.riskBefore && action.riskAfter) {
          const beforeShort = action.riskBefore.split('，')[0].split('。')[0].slice(0, 24);
          const afterShort = action.riskAfter.split('，')[0].split('。')[0].slice(0, 24);
          riskDelta = `${beforeShort} ➔ ${afterShort}`;
        } else {
          riskDelta = action.residualRisk === 'Low'
            ? '高风险隐患 ➔ 受控低残余风险 (满足门禁放行)'
            : action.residualRisk === 'Medium'
            ? '高不确定性 ➔ 中等受控风险 (需快速实验收敛)'
            : '潜在击穿/超差 ➔ 高残余风险 (触发一票否决或限期整改)';
        }
      }

      let crossDomainCouplingChecks = action.crossDomainCouplingChecks;
      if (!crossDomainCouplingChecks || crossDomainCouplingChecks.length === 0) {
        if (couplings.length > 0) {
          crossDomainCouplingChecks = couplings.map((c) => {
            if (action.veto?.rejection_veto) {
              return {
                rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
                addressed: false,
                note: `方案被一票否决：未满足${c.affectedDomain}门禁（${action.veto.veto_reason?.slice(0, 40) || '存在违约或法规硬性冲突'}）`,
              };
            }
            if (action.category === 'conservative' || action.id.includes('Option A')) {
              return {
                rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
                addressed: true,
                note: `已纳入本方案协同参数配置，${c.requiredRevalidation[0] || '参数处于车规安全工作区以内'}`,
              };
            }
            return {
              rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
              addressed: true,
              note: `已建立前置验证边界：${c.physicalTradeoff.slice(0, 45)}`,
            };
          });
        }
      }

      let veto = action.veto || { rejection_veto: false };
      // 若是 Option C 纯临时措施且残余风险为 High，且涉及安全/法规/节点违约时，触发受控红牌警示
      if (action.id === 'Option C' && action.residualRisk === 'High' && (action.veto?.veto_reason || action.failureConsequence?.includes('失控') || action.name?.includes('滑行') || action.name?.includes('临时'))) {
        veto = {
          rejection_veto: true,
          veto_type: veto.veto_type || 'SAFETY_GOAL_BREACH',
          veto_reason: veto.veto_reason || '纯临时缓解措施未消除物理安全隐患，禁止作为永久方案直接放行！',
        };
      }

      return {
        ...action,
        riskDelta,
        crossDomainCouplingChecks: crossDomainCouplingChecks || [],
        veto,
      };
    });
  }
  result.source = 'deterministic-expert';
  result.provenance = result.provenance || {
    executionMode: 'PURE_OFFLINE_LOCAL',
    engineName: '车规离线专家推演引擎',
    isAiInferred: false,
    isDeterministicRule: true,
    generatedAt: new Date().toLocaleTimeString(),
    latencyMs: 8,
    modelIdentifier: 'Deterministic-RuleEngine',
    transparencyNote: '本结果由本地离线规则引擎生成，不联网、不上报。数值类模式结论以输入工况为准：缺少实测参数时会在对应预计算项标记 INSUFFICIENT_INPUT，引用参考案例的量化数字会被显式标注为假设，不作为当前项目事实。',
  };

  return result;
}

function buildCrossDomainLinks(domains: import('../utils/scenarioDomainEngine').EngineeringDomain[], issue: IssueInput) {
  const has = (d: string) => domains.includes(d as import('../utils/scenarioDomainEngine').EngineeringDomain);
  const links: Array<{ fromDomain: string; toDomain: string; mechanism: string; evidenceBasis: string; impact: string }> = [];
  const add = (a: string, b: string, mechanism: string, impact: string) => {
    if (has(a) && has(b)) links.push({ fromDomain: a, toDomain: b, mechanism, evidenceBasis: Object.keys(issue.measuredValues || {}).length ? 'MEASURED|CALCULATED' : 'ASSUMPTION', impact });
  };
  add('BLDC','EMC_RE_CE','高 dv/dt / di/dt 与寄生电容、线束共模电流耦合形成高频发射','可能改善/恶化 RE/CE，需用频谱+共模电流 A/B 证据判断');
  add('BLDC','THERMAL','开关与导通损耗进入结温，参数漂移反过来改变开关行为','Tj/SOA 是 BLDC 放行的独立硬门禁');
  add('BLDC','POWER_TRANSIENT','急停/再生能量转入 DC-Link，引起母线泵升','Vbus 峰值与器件耐压共同决定放行边界');
  add('BLDC','POWER','负载与换相瞬态通过寄生 L/C 形成过冲与跌落','电源轨/母线测点需与控制状态同步');
  add('EMC_BCI','SIGNAL','射频注入经共模路径转为差模/敏感节点扰动','通信/ADC 功能状态必须与注入窗口同步记录');
  add('EMC_ESD','SAFETY','ESD 瞬态可能造成复位、通信中断或潜在损伤并触发安全状态需求','功能安全不能只用“自动恢复”替代门禁证据');
  add('THERMAL','RELIABILITY','长期热应力提高参数漂移和老化损伤','寿命结论必须结合任务剖面而非单点 Tj');
  add('COMPONENT','EMC_RE_CE','Qgd / tr/tf / 寄生差异改变 dv/dt 与高频激励','替代料必须验证 EMC 不出现回归');
  add('COMPONENT','THERMAL','Rds(on) / switching loss 差异改变 Ptotal 与 Tj','Spec 等价不等于使用条件等价');
  add('WCCA','THERMAL','温漂与自热共同进入总误差预算','校准不能替代最坏热边界证据');
  return links;
}

/**
 * 最小离线结果骨架：供非 BLDC/非关节域在 applyScenarioDynamicLayer 动态重建前的结构占位。
 * 所有数值/文案均由动态层依据当前 issue/context 填充，此骨架不再内嵌任何写死的示例案例数字。
 */
function buildMinimalOfflineResult(): CopilotAnalysisResult {
  return {
    coreConclusion: { problemSummary: '', recommendedMeasure: '', reasonSummary: '' },
    riskRatings: {
      overallRisk: 'Medium', overallRiskScore: 55, technicalRisk: 'Medium', qualityRisk: 'Medium',
      scheduleRisk: 'Medium', costRisk: 'Medium', reliabilityRisk: 'Medium', functionalSafetyRisk: 'Medium',
    },
    knownFacts: [],
    assumptions: [],
    unknowns: [],
    physicalMechanism: { rootCauseAnalysis: '', keyPhysicalFactors: [] },
    dfmeaView: {
      failureMode: '', failureCause: '', localEffect: '', systemEffect: '', vehicleEffect: '',
      safetyImpact: false, regulatoryImpact: false, massProductionImpact: false,
    },
    candidateActions: [],
    finalRecommendation: {
      recommendedOptionId: '', recommendedOptionName: '', recommendationGrade: 'Caution',
      whyReason: [], immediateSteps: [], preconditions: [], unacceptableActions: [],
      stopConditions: [], reEvaluationTriggers: [], planB: '',
    },
    raciMatrix: [],
    containment: { shortTermMeasure: '', validityScope: '', responsibleParty: '', timeline: '' },
    capa: { rootCauseAction: '', preventiveMeasure: '', lessonsLearned: '', verificationTarget: '' },
    engineeringDocs: {} as unknown as CopilotAnalysisResult['engineeringDocs'],
  };
}
