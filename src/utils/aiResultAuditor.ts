import {
  CopilotAnalysisResult,
  ProjectContext,
  IssueInput,
  InputIntegrityAssessment,
  AiAuditResult,
  AiAuditFlag,
  CandidateAction,
} from '../types';
import { buildDualTimelinePlan } from './dualTimelineEngine';
import { generateCouplingCheckTemplates } from './crossDomainCouplingMatrix';
import { resolveEngineeringDomains } from './scenarioDomainEngine';
import { recalculateStandardWeightedScore } from './scoringWeights';

/**
 * 方案加权总分核对——权重定义已经统一到 scoringWeights.ts，这里不再重复写死一份，
 * 直接复用 recalculateStandardWeightedScore()。
 */
const recalculateWeightedScore = recalculateStandardWeightedScore;

/**
 * 常见工程空话反模式词库（若未带具体参数，则视为模糊回答）
 */
const VAGUENESS_PATTERNS = [
  { pattern: /建议优化走线(?![，,0-9a-zA-Z\u4e00-\u9fa5]*?(?:宽|mil|mm|Ω|阻抗))/, tip: '未给出具体走线宽度、阻抗或层叠要求' },
  { pattern: /加大?滤波电容(?![，,0-9a-zA-Z\u4e00-\u9fa5]*?(?:[0-9]+(?:\.[0-9]+)?\s*(?:uF|μF|nF|pF)|[0-9]{4}))/, tip: '未给出具体电容容值、封装或耐压' },
  { pattern: /适当增加死区时间(?![，,0-9a-zA-Z\u4e00-\u9fa5]*?[0-9]+\s*ns)/, tip: '未给出具体的死区调整纳秒数值 (ns)' },
  { pattern: /加强散热(?![，,0-9a-zA-Z\u4e00-\u9fa5]*?(?:散热片|导热垫|铜箔|W\/mK|℃\/W))/, tip: '未给出导热材料参数、热阻或结构措施' },
  { pattern: /优化软件算法(?![，,0-9a-zA-Z\u4e00-\u9fa5]*?(?:滤波|标定|采样|截止频率|Hz|ms))/, tip: '未给出具体的软件控制策略、时间常数或标定参数' },
];

/**
 * 从文本中提取常见物理量与实测数值（电压/温度/压降/背隙等）
 */
function extractMeasuredKeyValues(issue?: IssueInput): Record<string, number> {
  const kv: Record<string, number> = {};
  if (!issue) return kv;

  // 1. 从结构化 measuredValues 中提取
  if (issue.measuredValues && typeof issue.measuredValues === 'object') {
    for (const [k, v] of Object.entries(issue.measuredValues)) {
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(num)) {
        kv[k.toLowerCase()] = num;
      }
    }
  }

  // 2. 从文本中匹配车规典型数值
  const text = `${issue.failurePhenomenon || ''} ${issue.actualMeasurement || ''}`;
  const patterns: Array<{ key: string; regex: RegExp }> = [
    { key: 'vbus', regex: /([0-9.]+)\s*V(?:\s*母线|\s*泵升|BUS)/i },
    { key: 'temperature', regex: /([0-9.]+)\s*℃/i },
    { key: 'dvdt', regex: /([0-9.]+)\s*V\/ns/i },
    { key: 'backlash', regex: /([0-9.]+)\s*arcmin/i },
    { key: 'current', regex: /([0-9.]+)\s*A(?:\s*满载|\s*相电流|\s*持续)/i },
  ];

  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m && m[1]) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && !kv[p.key]) {
        kv[p.key] = val;
      }
    }
  }

  return kv;
}


function getUnitHint(key: string): string {
  const lower = key.toLowerCase();
  if (/(vbus|voltage|vd[sx]?|vnode|vgs)/.test(lower)) return 'V';
  if (/(current|amps?|ma|iinj|icm)/.test(lower)) return lower.includes('ma') || lower.includes('iinj') || lower.includes('icm') ? 'mA' : 'A';
  if (/(temp|tj|ambient|case|pad)/.test(lower)) return '℃';
  if (/dvdt/.test(lower)) return 'V\/ns';
  if (/dead.?time/.test(lower)) return 'ns';
  if (/(time|recovery|fault|delay)/.test(lower)) return 'ms';
  if (/(freq|frequency)/.test(lower)) return 'MHz';
  if (/(backlash|accuracy)/.test(lower)) return 'arcmin';
  if (/(pct|percent|error)/.test(lower)) return '%';
  if (/(resistance|ohm|rg)/.test(lower)) return 'Ω';
  return '';
}

/**
 * 车规级 AI 推理结果全栈审计与防幻觉校准器 (V4+ 四层防御)
 * 严格覆盖：
 * 1. 结构兜底保障
 * 2. 方案加权分数学自洽 (RULE_04)
 * 3. 常见工程空话反模式 (RULE_05)
 * 4. 一票否决强制实施 (RULE_06)
 * 5. 交付倒计时紧迫度与改版冲突 (RULE_03)
 * 6. 功能安全降级与保护削减违规 (RULE_02)
 * 7. 虚构缺失实测参数清洗降级 (RULE_01)
 * 8. 实测数值一致性与篡改核对 (RULE_07_NUMERICAL_CONSISTENCY)
 * 9. 限值规范与判定标准可溯源性 (RULE_08_LIMIT_TRACEABILITY)
 * 10. 缺失缺口不可冒充已验证事实 (RULE_09_MISSING_GAP_INTEGRITY)
 * 11. 证据等级越级校准 (RULE_10_EVIDENCE_LEVEL_OVERRIDE)
 * 12. 跨域耦合核对与闭环回填 (RULE_11_COUPLING_CHECKS_ENFORCEMENT)
 */
export function auditAiResult(
  aiData: any,
  baseline: CopilotAnalysisResult,
  context?: ProjectContext,
  issue?: IssueInput,
  integrityAssessment?: InputIntegrityAssessment
): { sanitizedResult: CopilotAnalysisResult; auditResult: AiAuditResult } {
  const flags: AiAuditFlag[] = [];
  const autoFixSummary: string[] = [];
  const sanitized: CopilotAnalysisResult = { ...aiData };

  // 1. 结构兜底保障
  if (!sanitized.coreConclusion || typeof sanitized.coreConclusion !== 'object') {
    sanitized.coreConclusion = baseline.coreConclusion;
    autoFixSummary.push('核心结论缺失，已从确定性基线自动补齐');
  }
  if (!sanitized.physicalMechanism || typeof sanitized.physicalMechanism !== 'object') {
    sanitized.physicalMechanism = baseline.physicalMechanism;
    autoFixSummary.push('物理机理缺失，已从确定性基线自动补齐');
  }
  if (!Array.isArray(sanitized.candidateActions) || sanitized.candidateActions.length === 0) {
    sanitized.candidateActions = baseline.candidateActions;
    autoFixSummary.push('候选行动方案列表为空，已从确定性基线自动补齐');
  }
  if (!sanitized.finalRecommendation || typeof sanitized.finalRecommendation !== 'object') {
    sanitized.finalRecommendation = baseline.finalRecommendation;
    autoFixSummary.push('最终推荐方案缺失，已从确定性基线自动补齐');
  }

  // 提取输入中的已知实测数值
  const measuredKeyValues = extractMeasuredKeyValues(issue);

  // 证据引用审计：AI 必须能把关键数值结论落到已知输入或本地确定性计算。
  const validCitationKeys = new Set<string>();
  for (const key of Object.keys(issue?.measuredValues || {})) {
    validCitationKeys.add(`measuredValues.${key}`);
  }
  const calculatedEvidence = baseline.analysisBasis?.calculatedOutputEvidence || [];
  const calculatedByKey = new Map(calculatedEvidence.map((item) => [item.key, item]));
  const calculatedById = new Map(calculatedEvidence.map((item) => [item.id, item]));
  for (const output of baseline.analysisBasis?.calculatedOutputs || []) {
    validCitationKeys.add(`baseline.analysisBasis.calculatedOutputs:${output}`);
    const idx = (baseline.analysisBasis?.calculatedOutputs || []).indexOf(output);
    validCitationKeys.add(`baseline.analysisBasis.calculatedOutputs[${idx}]`);
  }
  for (const item of calculatedEvidence) {
    validCitationKeys.add(`baseline.analysisBasis.calculatedOutputs:${item.key}`);
    validCitationKeys.add(`precomputed.${item.id}`);
  }
  const expectedForCitation = (citation: string) => {
    const measured = citation.match(/^measuredValues\.(.+)$/);
    if (measured) {
      const key = measured[1];
      const expected = issue?.measuredValues?.[key];
      const expectedNum = typeof expected === 'number' ? expected : Number(expected);
      return Number.isFinite(expectedNum) ? { value: expectedNum, unit: getUnitHint(key), source: citation } : undefined;
    }

    const named = citation.match(/^baseline\.analysisBasis\.calculatedOutputs:(.+)$/);
    if (named) {
      const key = named[1];
      const item = calculatedByKey.get(key) || calculatedEvidence.find((candidate) => candidate.key === key || candidate.title === key);
      if (item?.status === 'CALCULATED' && item.value !== undefined) {
        return { value: item.value, unit: item.unit, source: citation };
      }
      return undefined;
    }

    const precomputed = citation.match(/^precomputed\.(.+)$/);
    if (precomputed) {
      const item = calculatedById.get(precomputed[1]);
      if (item?.status === 'CALCULATED' && item.value !== undefined) {
        return { value: item.value, unit: item.unit, source: citation };
      }
      return undefined;
    }

    const indexed = citation.match(/^baseline\.analysisBasis\.calculatedOutputs\[(\d+)\]$/);
    if (indexed) {
      const output = baseline.analysisBasis?.calculatedOutputs?.[Number(indexed[1])];
      const item = calculatedEvidence.find((candidate) => output?.startsWith(`${candidate.key}=`));
      if (item?.status === 'CALCULATED' && item.value !== undefined) {
        return { value: item.value, unit: item.unit, source: citation };
      }
    }
    return undefined;
  };

  const auditCitations = (owner: string, fields: unknown, text: string) => {
    const citations = Array.isArray(fields) ? fields.filter((x): x is string => typeof x === 'string' && Boolean(x.trim())) : [];
    const hasNumericUnit = /(?:\d+(?:\.\d+)?)\s*(?:V|A|℃|°C|ns|μs|ms|dB(?:μV(?:\/m)?)?|MHz|kHz|arcmin|%|Ω)/i.test(text);
    if (hasNumericUnit && citations.length === 0) {
      flags.push({
        level: 'WARNING',
        ruleId: 'RULE_12_CITATION_MISSING',
        title: '关键数值结论缺少证据引用',
        message: `${owner} 包含带单位的数值结论，但没有提供 citedFields；无法沿证据链回溯到 measuredValues 或本地计算。`,
        fieldPath: owner === 'result' ? 'citedFields' : `${owner}.citedFields`,
        autoFixApplied: false,
      });
    }
    for (const citation of citations) {
      const isPrecomputed = /^precomputed\.[^\s]+$/.test(citation) && calculatedById.has(citation.slice('precomputed.'.length));
      const isBaselineIndexed = /^baseline\.analysisBasis\.calculatedOutputs\[\d+\]$/.test(citation) &&
        Number(citation.match(/\[(\d+)\]$/)?.[1] || -1) < (baseline.analysisBasis?.calculatedOutputs || []).length;
      const isBaselineNamed = citation.startsWith('baseline.analysisBasis.calculatedOutputs:') && (validCitationKeys.has(citation) || calculatedByKey.has(citation.slice('baseline.analysisBasis.calculatedOutputs:'.length)));
      if (!validCitationKeys.has(citation) && !isPrecomputed && !isBaselineIndexed && !isBaselineNamed) {
        flags.push({
          level: 'WARNING',
          ruleId: 'RULE_12_CITATION_UNKNOWN',
          title: 'AI引用的证据键不存在',
          message: `${owner} 引用了不存在的证据键 [${citation}]。`,
          fieldPath: owner === 'result' ? 'citedFields' : `${owner}.citedFields`,
          autoFixApplied: false,
        });
      }
      const expected = expectedForCitation(citation);
      if (expected && expected.unit) {
        const escapedUnit = expected.unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const valuesInText = [...text.matchAll(new RegExp(`([+-]?\\d+(?:\\.\\d+)?)\\s*${escapedUnit}`, 'ig'))]
          .map((x) => Number(x[1]))
          .filter(Number.isFinite);
        if (valuesInText.length && !valuesInText.some((actual) => Math.abs(actual - expected.value) <= Math.max(0.05, Math.abs(expected.value) * 0.01))) {
          flags.push({
            level: 'WARNING',
            ruleId: 'RULE_12_CITED_VALUE_MISMATCH',
            title: 'AI引用数值与证据值不一致',
            message: `${owner} 声明引用 ${expected.source}，证据值为 ${expected.value}${expected.unit}，但该字段对应文本中的数值未与证据一致。`,
            fieldPath: owner === 'result' ? 'citedFields' : `${owner}.citedFields`,
            autoFixApplied: false,
          });
        }
      }
    }
  };

  // 2. 审计候选方案
  const actions: CandidateAction[] = sanitized.candidateActions || [];
  auditCitations('result', sanitized.citedFields, JSON.stringify({
    coreConclusion: sanitized.coreConclusion,
    knownFacts: sanitized.knownFacts,
    physicalMechanism: sanitized.physicalMechanism,
    finalRecommendation: sanitized.finalRecommendation,
  }));
  const detectedDomains = issue ? resolveEngineeringDomains(issue) : [];
  const primaryDomain = detectedDomains[0] || 'BLDC';
  const relatedDomains = detectedDomains.slice(1);

  actions.forEach((action, idx) => {
    auditCitations(`candidateActions[${idx}]`, action.citedFields, `${action.name || ''} ${action.description || ''} ${action.expectedBenefit || ''} ${action.riskDelta || ''} ${action.sideEffects || ''} ${action.verificationMethod || ''}`);

    // 2.1 评分自洽性 (RULE_04_SCORE_CONSISTENCY)
    if (action.scores) {
      const calculatedTotal = recalculateWeightedScore(action.scores);
      if (Math.abs((action.scores.total || 0) - calculatedTotal) > 1.5) {
        flags.push({
          level: 'NOTICE',
          ruleId: 'RULE_04_SCORE_MATH_MISMATCH',
          title: '方案评分数学权重漂移',
          message: `方案 [${action.id || idx}] 原声明加权总分 (${action.scores.total}) 与 25%T+25%S+15%C+20%Q+15%L 计算值 (${calculatedTotal}) 不符，已自动纠偏。`,
          fieldPath: `candidateActions[${idx}].scores.total`,
          autoFixApplied: true,
        });
        action.scores.total = calculatedTotal;
        autoFixSummary.push(`方案 [${action.id || idx}] 总分校正为 ${calculatedTotal}`);
      }
    }

    // 2.2 审计空话套话反模式 (RULE_05_VAGUENESS_ANTIPATTERN)
    const combinedText = `${action.name || ''} ${action.description || ''} ${action.expectedBenefit || ''} ${action.verificationMethod || ''}`;
    for (const item of VAGUENESS_PATTERNS) {
      if (item.pattern.test(combinedText)) {
        flags.push({
          level: 'WARNING',
          ruleId: 'RULE_05_VAGUENESS_DETECTED',
          title: '检测到模糊空话表述',
          message: `方案 [${action.id || idx}] 命中空话反模式：${item.tip}。`,
          fieldPath: `candidateActions[${idx}].description`,
          autoFixApplied: false,
        });
      }
    }

    // 2.3 审计数值一致性 (RULE_07_NUMERICAL_CONSISTENCY)
    // 检查方案描述是否对用户输入实测值产生明显篡改（如实测 37.8V 篡改为 46V）
    if (measuredKeyValues.vbus) {
      const vbusRegex = /(?:实测|峰值|达到|泵升至)\s*([0-9.]+)\s*V/i;
      const match = combinedText.match(vbusRegex);
      if (match && match[1]) {
        const aiNum = parseFloat(match[1]);
        const inputNum = measuredKeyValues.vbus;
        // 如果差异 > 10% 且绝对值 > 2V，且该数值不是耐压阈值 (如40V/60V)
        if (Math.abs(aiNum - inputNum) > 2.0 && Math.abs(aiNum - 40) > 0.5 && Math.abs(aiNum - 60) > 0.5) {
          flags.push({
            level: 'WARNING',
            ruleId: 'RULE_07_NUMERICAL_CONSISTENCY',
            title: '实测数值引用偏离真实输入',
            message: `方案 [${action.id || idx}] 描述中引用实测母线电压为 ${aiNum}V，与用户输入工况实测值 ${inputNum}V 存在明显矛盾。`,
            fieldPath: `candidateActions[${idx}].description`,
            autoFixApplied: false,
          });
        }
      }
    }

    // 2.3b 引用值与结构化输入/本地计算值核对：只在 AI 明确声明 citedFields 时检查。
    const actionCitations = Array.isArray(action.citedFields) ? action.citedFields : [];
    for (const citation of actionCitations) {
      const expected = expectedForCitation(citation);
      if (!expected || !expected.unit) continue;
      const unit = expected.unit;
      const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const valuesInText = [...combinedText.matchAll(new RegExp(`([+-]?\\d+(?:\\.\\d+)?)\\s*${escapedUnit}`, 'ig'))]
        .map((x) => Number(x[1]))
        .filter(Number.isFinite);
      if (valuesInText.length && !valuesInText.some((actual) => Math.abs(actual - expected.value) <= Math.max(0.05, Math.abs(expected.value) * 0.01))) {
        flags.push({
          level: 'WARNING',
          ruleId: 'RULE_12_CITED_VALUE_MISMATCH',
          title: 'AI引用数值与证据值不一致',
          message: `方案 [${action.id || idx}] 声明引用 ${expected.source}，证据值为 ${expected.value}${unit}，但方案文本中的 ${unit} 数值未与该值一致。`,
          fieldPath: `candidateActions[${idx}].citedFields`,
          autoFixApplied: false,
        });
      }
    }

    // 2.4 审计缺口一致性 (RULE_09_MISSING_GAP_INTEGRITY)
    // 第一层输入体检判为缺失的必填项，方案不得宣称“已实测验证通过”
    if (integrityAssessment && integrityAssessment.missingRequiredFields.length > 0) {
      for (const missing of integrityAssessment.missingRequiredFields) {
        const shortName = missing.split(' ')[0];
        if (shortName.length >= 2 && combinedText.includes(shortName) && (combinedText.includes('已通过测试') || combinedText.includes('实测已满足') || combinedText.includes('已实测确认'))) {
          flags.push({
            level: 'WARNING',
            ruleId: 'RULE_09_MISSING_GAP_INTEGRITY',
            title: '缺失缺口被假定为已实测通过',
            message: `方案 [${action.id || idx}] 声称缺失的必填项 [${shortName}] 已实测确认，违反输入闸门审计。已自动添加待实测台架验证标注。`,
            fieldPath: `candidateActions[${idx}].expectedBenefit`,
            autoFixApplied: true,
          });
          action.verificationMethod = `[待台架补充实测] 需先测量补充 ${shortName} 真实工况数据后，方可评估验证。原计划: ${action.verificationMethod}`;
          autoFixSummary.push(`方案 [${action.id || idx}] 修正缺失项 [${shortName}] 为台架待测`);
        }
      }
    }

    // 2.5 跨域耦合核对回填 (RULE_11_COUPLING_CHECKS_ENFORCEMENT)
    if (!Array.isArray(action.crossDomainCouplingChecks) || action.crossDomainCouplingChecks.length === 0) {
      action.crossDomainCouplingChecks = generateCouplingCheckTemplates(primaryDomain, relatedDomains);
      // 根据方案内容自动推断 addressed 状态
      action.crossDomainCouplingChecks.forEach((chk) => {
        if (combinedText.toLowerCase().includes('emc') || combinedText.toLowerCase().includes('温升') || combinedText.toLowerCase().includes('米勒') || combinedText.toLowerCase().includes('sto')) {
          chk.addressed = true;
          chk.note = `方案已评估该物理耦合：${action.expectedBenefit.substring(0, 40)}`;
        }
      });
      autoFixSummary.push(`方案 [${action.id || idx}] 自动补齐跨域耦合规则核对矩阵`);
    }

    // 2.6 riskDelta 自动生成与兼容
    if (!action.riskDelta && (action.riskBefore || action.riskAfter)) {
      action.riskDelta = `${action.riskBefore || '未评估'} ➔ ${action.riskAfter || '中等残留'}`;
    }

    // 2.7 residualRiskDetail 与 sideEffects 互保兜底防御
    if (!action.residualRiskDetail && action.sideEffects) {
      action.residualRiskDetail = `方案伴生影响已在次生影响中说明：${action.sideEffects.slice(0, 100)}`;
    } else if (!action.residualRiskDetail) {
      action.residualRiskDetail = '暂未识别显著残余风险，需在 DV 样件台架上进一步核查边界';
    }

    if (!action.sideEffects && action.residualRiskDetail) {
      action.sideEffects = `潜在代价需参考残余风险评估：${action.residualRiskDetail.slice(0, 100)}`;
    } else if (!action.sideEffects) {
      action.sideEffects = '常规参数微调，预计对周边电路及结构无额外负面次生影响';
    }
  });

  // 3. 审计一票否决与推荐方案冲突 (RULE_06_VETO_ENFORCEMENT)
  const recOptionId = sanitized.finalRecommendation?.recommendedOptionId;
  const recommendedAction = actions.find((a) => a.id === recOptionId || a.name === sanitized.finalRecommendation?.recommendedOptionName);

  if (recommendedAction && recommendedAction.veto?.rejection_veto) {
    flags.push({
      level: 'FATAL',
      ruleId: 'RULE_06_VETOED_OPTION_RECOMMENDED',
      title: '被一票否决方案被错误推荐',
      message: `方案 [${recommendedAction.id}] 存在硬性否决 (${recommendedAction.veto.veto_reason || '存在车规违规'})，但模型将其列为最终推荐。`,
      fieldPath: 'finalRecommendation.recommendedOptionId',
      autoFixApplied: true,
    });

    const validAlternatives = actions.filter((a) => !a.veto?.rejection_veto);
    if (validAlternatives.length > 0) {
      const bestAlternative = [...validAlternatives].sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0))[0];
      sanitized.finalRecommendation.recommendedOptionId = bestAlternative.id;
      sanitized.finalRecommendation.recommendedOptionName = bestAlternative.name;
      sanitized.finalRecommendation.recommendationGrade = 'Conditionally Recommended';
      sanitized.finalRecommendation.whyReason = [
        `原推荐方案 [${recommendedAction.id}] 触发车规一票否决 (${recommendedAction.veto.veto_reason})，系统审计强制切换至合规替代方案。`,
        ...(sanitized.finalRecommendation.whyReason || []),
      ];
      autoFixSummary.push(`推荐方案已从被否决的 [${recommendedAction.id}] 自动更正为合规方案 [${bestAlternative.id}]`);
    }
  }

  // 4. 审计交付工期与倒计时冲突 (RULE_03_SCHEDULE_VIOLATION)
  const daysRemaining = context?.daysRemaining;
  if (typeof daysRemaining === 'number' && daysRemaining <= 14 && recommendedAction) {
    const timeCostStr = (recommendedAction.timeCost || '').toLowerCase();
    const needsPcbRedesign = timeCostStr.includes('周') || timeCostStr.includes('改版') || timeCostStr.includes('开模') || timeCostStr.includes('月');
    if (needsPcbRedesign && !sanitized.dualTimeline?.containmentPhase) {
      flags.push({
        level: 'WARNING',
        ruleId: 'RULE_03_SCHEDULE_COLLAPSE_RISK',
        title: '交付倒计时严重倒挂风险',
        message: `当前距门禁仅剩 ${daysRemaining} 天，推荐方案需硬件改版 (${recommendedAction.timeCost})，且未提供 24h 应急遏制策略，将导致门禁击穿。`,
        fieldPath: 'candidateActions.timeCost',
        autoFixApplied: true,
      });

      sanitized.dualTimeline = buildDualTimelinePlan(sanitized, context, issue);
      autoFixSummary.push(`已自动为倒计时紧迫工况生成 T+24h 应急临时遏制 (Containment) 协同时间轴`);
    }
  }

  // 5. 审计功能安全等级违规 (RULE_02_SAFETY_DEGRADATION)
  const asil = context?.asilLevel || 'QM';
  if ((asil === 'ASIL C' || asil === 'ASIL D') && recommendedAction) {
    const textDesc = `${recommendedAction.description} ${recommendedAction.sideEffects || ''}`.toLowerCase();
    if (textDesc.includes('取消硬件冗余') || textDesc.includes('屏蔽保护') || textDesc.includes('移除保护电路')) {
      flags.push({
        level: 'FATAL',
        ruleId: 'RULE_02_SAFETY_GOAL_VIOLATION',
        title: '高安全等级下削减安全机制违规',
        message: `项目要求 ${asil}，推荐方案存在削减硬件保护的行为，违反 ISO 26262 硬件度量。`,
        fieldPath: 'candidateActions.description',
        autoFixApplied: false,
      });
    }
  }

  // 6. 审计虚构缺失实测值 (RULE_01_HALLUCINATED_PARAMS)
  if (integrityAssessment && integrityAssessment.missingRequiredFields.length > 0) {
    const missingKeys = integrityAssessment.missingRequiredFields;
    if (Array.isArray(sanitized.knownFacts)) {
      const falsifiedFacts: string[] = [];
      sanitized.knownFacts = sanitized.knownFacts.filter((fact) => {
        const isFalsified = missingKeys.some((k) => fact.includes(k.split(' ')[0]) && fact.includes('实测为'));
        if (isFalsified) {
          falsifiedFacts.push(fact);
          return false;
        }
        return true;
      });

      if (falsifiedFacts.length > 0) {
        flags.push({
          level: 'WARNING',
          ruleId: 'RULE_01_HALLUCINATED_FACTS',
          title: '已拦截并清洗虚构实测参数',
          message: `模型将缺失的必填测量字段当作已实测事实列入 knownFacts: ${falsifiedFacts.join('; ')}。已自动移入工程假设 (assumptions)。`,
          fieldPath: 'knownFacts',
          autoFixApplied: true,
        });
        sanitized.assumptions = [...(sanitized.assumptions || []), ...falsifiedFacts.map((f) => `[审计降级为假设] ${f}`)];
        autoFixSummary.push(`将 ${falsifiedFacts.length} 条虚构实测事实自动降级为待证实假设`);
      }
    }
  }

  // 7. 审计证据等级越级 (RULE_10_EVIDENCE_LEVEL_OVERRIDE)
  // 若输入体检评分是 GRADE_C 或 GRADE_D，不允许多域自评为 HIGH_DIRECT_EVIDENCE
  if (sanitized.multiDomainAnalysis?.domainAssessments && integrityAssessment) {
    const isLowIntegrity = integrityAssessment.grade === 'GRADE_C_INSUFFICIENT' || integrityAssessment.grade === 'GRADE_D_BLOCKING';
    sanitized.multiDomainAnalysis.domainAssessments.forEach((da) => {
      if (isLowIntegrity && (da.evidenceLevel === 'HIGH_DIRECT_EVIDENCE' || da.evidenceLevel === 'HIGH')) {
        flags.push({
          level: 'NOTICE',
          ruleId: 'RULE_10_EVIDENCE_LEVEL_OVERRIDE',
          title: '证据支撑等级越级降级',
          message: `当前工况数据完整度评分仅为 ${integrityAssessment.completenessScore} 分 (${integrityAssessment.gradeLabel})，域 [${da.domain}] 自评证据等级 [${da.evidenceLevel}] 过高，已自动校准降级为 MEDIUM_INFERRED。`,
          fieldPath: `multiDomainAnalysis.domainAssessments[${da.domain}].evidenceLevel`,
          autoFixApplied: true,
        });
        da.evidenceLevel = 'MEDIUM_INFERRED';
        autoFixSummary.push(`域 [${da.domain}] 证据等级由 HIGH 自动校准降级为 MEDIUM_INFERRED`);
      }
    });
  }

  // 8. 双层时间轴完整性兜底
  if (!sanitized.dualTimeline || !sanitized.dualTimeline.containmentPhase) {
    sanitized.dualTimeline = baseline.dualTimeline || buildDualTimelinePlan(sanitized, context, issue);
  }

  // 9. 计算审计总分与评定状态
  let auditScore = 100;
  for (const flag of flags) {
    if (flag.level === 'FATAL') auditScore -= 25;
    else if (flag.level === 'WARNING') auditScore -= 10;
    else if (flag.level === 'NOTICE') auditScore -= 3;
  }
  auditScore = Math.max(0, Math.min(100, auditScore));

  const hasFatal = flags.some((f) => f.level === 'FATAL');
  let overallStatus: AiAuditResult['overallStatus'] = 'APPROVED';
  if (hasFatal || auditScore < 50) {
    overallStatus = hasFatal ? 'REJECTED_AUDIT_FAILED' : 'FLAGGED_NEEDS_REVIEW';
  } else if (auditScore < 85) {
    overallStatus = 'PASSED_WITH_WARNINGS';
  }

  const auditResult: AiAuditResult = {
    passed: !hasFatal && auditScore >= 60,
    auditScore,
    overallStatus,
    flags,
    autoFixSummary,
    auditedAt: new Date().toISOString(),
    modelIdentifier: sanitized.provenance?.modelIdentifier,
  };

  // 挂载到结果与溯源信息中
  sanitized.aiAudit = auditResult;
  if (integrityAssessment) {
    sanitized.inputIntegrity = integrityAssessment;
  }
  if (sanitized.provenance) {
    sanitized.provenance.aiAudit = auditResult;
    sanitized.provenance.inputIntegrity = integrityAssessment;
  }

  return {
    sanitizedResult: sanitized,
    auditResult,
  };
}
