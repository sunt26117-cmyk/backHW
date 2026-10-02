import { runExpertAnalysis } from '../data/expertEngine';
import { assessInputIntegrity, generatePromptIntegrityDirectives } from './inputIntegrityEngine';
import { runDeterministicPrecomputations } from './deterministicPrecomputation';
import { findSimilarGoldCases, buildGroundingText } from './aiGrounding';
import { getDomainMeasurementFields, getDomainMeasurementGroups, resolveEngineeringDomain, resolveEngineeringDomains, getEngineeringDomainLabel } from './scenarioDomainEngine';
import { getMultiDomainAdaptivePromptGuidance } from './domainAdaptivePromptEngine';
import { getCrossDomainCouplings } from './crossDomainCouplingMatrix';
import { buildDualTimelinePlan } from './dualTimelineEngine';
import { auditAiResult } from './aiResultAuditor';
import { validateAiResultStructure } from './aiResultSchema';
import { normalizeDecisionFrame } from './decisionFrame';

// ---- 协议层（原 server.ts，现搬到前端共享，供在线/离线双模式复用） ----
const s = (description: string) => ({ type: 'string', description });
const n = (description: string) => ({ type: 'number', description });
const i = (description: string) => ({ type: 'integer', description });
const b = (description: string) => ({ type: 'boolean', description });
const arr = (items: Record<string, unknown>, description: string) => ({ type: 'array', items, description });
const obj = (properties: Record<string, Record<string, unknown>>, descriptions: string) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false, description: descriptions });

export const COPILOT_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['coreConclusion', 'decisionFrame', 'multiDomainAnalysis', 'riskRatings', 'knownFacts', 'assumptions', 'citedFields', 'unknowns', 'physicalMechanism', 'dfmeaView', 'candidateActions', 'finalRecommendation', 'dualTimeline'],
  properties: {
    coreConclusion: obj({ problemSummary: s('问题总结'), recommendedMeasure: s('推荐措施'), reasonSummary: s('推荐理由总结') }, '核心结论'),
    decisionFrame: obj({ decisionQuestion: s('明确回答当前是否继续推进、放行或改版'), currentDecisionGate: s('当前工程门禁'), decisionWindow: s('结合剩余天数给出的实际决策窗口'), bestNextAction: s('未来24小时最重要的一项动作'), minimumEvidenceToProceed: arr(s('最小必要证据'), '进入下一阶段前必须取得的最小证据'), unknownsBlockingDecision: arr(s('阻塞决策的未知量'), '当前阻塞决策的关键未知量'), reversalCriteria: arr(s('反转条件'), '出现这些证据时需要推翻当前建议') }, '决策框架'),
    multiDomainAnalysis: obj({ primaryDomain: s('主导工程域'), relatedDomains: arr(s('关联工程域'), '次级相关工程域'), domainAssessments: arr(obj({ domain: s('工程域'), role: s('PRIMARY 或 RELATED'), evidenceLevel: s('HIGH、MEDIUM_INFERRED 或 LOW'), knownFacts: arr(s('已知事实'), '该域已知事实'), evidenceGaps: arr(s('证据缺口'), '该域证据缺口'), minimumValidation: s('最小验证动作'), domainConclusion: s('域级结论') }, '单个工程域评估'), '各工程域证据评估'), crossDomainLinks: arr(obj({ fromDomain: s('起始工程域'), toDomain: s('目标工程域'), mechanism: s('跨域物理机制'), evidenceBasis: s('MEASURED、CALCULATED 或 ASSUMPTION'), impact: s('跨域影响') }, '跨域联系'), '跨工程域耦合关系'), crossDomainVetoes: arr(obj({ condition: s('否决条件'), blocks: arr(s('被阻断的发布门禁'), '被否决的流程动作'), rationale: s('否决理由') }, '跨域否决'), '跨域硬性否决条件') }, '多工程域分析'),
    riskRatings: obj({ overallRisk: s('High、Medium-High、Medium 或 Low'), overallRiskScore: n('综合风险分数'), technicalRisk: s('技术风险等级'), qualityRisk: s('质量风险等级'), scheduleRisk: s('进度风险等级'), costRisk: s('成本风险等级'), reliabilityRisk: s('可靠性风险等级'), functionalSafetyRisk: s('功能安全风险等级') }, '风险评级'),
    knownFacts: arr(s('已核实事实'), '当前工况的已知事实'),
    assumptions: arr(s('工程假设'), '必须显式标记、待验证的假设'),
    citedFields: arr(s('证据引用键，例如 measuredValues.xxx / baseline.analysisBasis.calculatedOutputs:xxx / precomputed.xxx'), '关键数值结论的证据引用'),
    unknowns: arr(s('未知项'), '尚未得到证据支持的工程未知量'),
    physicalMechanism: obj({ rootCauseAnalysis: s('根因分析'), keyPhysicalFactors: arr(obj({ factor: s('物理因子'), description: s('因子描述') }, '关键物理因子'), '关键物理影响因子') }, '物理失效机理'),
    dfmeaView: obj({ failureMode: s('失效模式'), failureCause: s('失效原因'), localEffect: s('局部效应'), systemEffect: s('系统效应'), vehicleEffect: s('整车效应'), severity: i('DFMEA 严重度'), occurrence: i('DFMEA 发生度'), detection: i('DFMEA 探测度'), safetyImpact: b('是否影响功能安全'), regulatoryImpact: b('是否影响法规/认证'), massProductionImpact: b('是否影响量产') }, 'DFMEA 视角'),
    candidateActions: arr(obj({ id: s('方案ID'), category: s('conservative、agile 或 radical'), categoryLabel: s('方案类型中文标签'), name: s('方案名称'), description: s('方案描述'), expectedBenefit: s('预期收益'), scores: obj({ T: n('技术维度分数'), S: n('进度维度分数'), C: n('成本维度分数'), Q: n('质量维度分数'), L: n('可靠性维度分数'), total: n('加权总分') }, '方案评分'), veto: obj({ rejection_veto: b('是否触发一票否决') }, '方案否决状态'), riskDelta: s('风险变化'), residualRisk: s('残余风险等级'), residualRiskDetail: s('残余风险说明'), sideEffects: s('副作用'), verificationCost: s('验证成本'), timeCost: s('时间成本'), failureConsequence: s('失败后果'), preconditions: s('前置条件'), verificationMethod: s('具体验证方法'), citedFields: arr(s('证据引用键'), '该候选方案涉及的数值证据引用'), crossDomainCouplingChecks: arr(obj({ rule: s('被复核的跨域规则'), addressed: b('是否已处理'), note: s('复核说明') }, '跨域复核项'), '逐条跨域复核'), planB: s('备选方案B'), decisionFit: s('与当前工期和门禁的匹配性'), fastestValidation: s('最快验证周期'), latestDecisionPoint: s('最晚切换决策点'), rejectionReason: s('不推荐时的主要拒绝原因') }, '候选方案'), '候选方案列表'),
    finalRecommendation: obj({ recommendedOptionId: s('最终推荐方案ID'), recommendedOptionName: s('最终推荐方案名称'), recommendationGrade: s('推荐等级'), whyReason: arr(s('推荐依据'), '选择该方案的理由'), immediateSteps: arr(obj({ step: i('步骤序号'), title: s('步骤标题'), action: s('动作'), owner: s('责任角色'), deadline: s('截止时间') }, '立即行动步骤'), '未来阶段的立即动作'), preconditions: arr(s('推荐方案前置条件'), '方案成立前置条件'), unacceptableActions: arr(s('不可接受动作'), '明确不能执行的动作'), stopConditions: arr(s('停止条件'), '必须停止当前方案的条件'), reEvaluationTriggers: arr(s('重新评估触发条件'), '触发重新评估的证据'), planB: s('方案B') }, '最终推荐'),
    dualTimeline: obj({ containmentPhase: obj({ phaseTag: s('T_PLUS_24H_CONTAINMENT'), timeWindow: s('T+24h 应急临时遏制窗口'), title: s('遏制标题'), objective: s('遏制目标'), hardwareImpact: s('硬件影响'), responsibilityRole: s('责任角色'), actions: arr(obj({ step: s('步骤'), detail: s('动作细节'), owner: s('责任人'), duration: s('预计耗时'), hardwareImpact: s('硬件影响'), deliverable: s('交付物') }, '遏制动作'), 'T+24h动作'), verificationCriteria: s('验证准则'), exitCriteria: s('退出准则') }, 'T+24h临时遏制'), permanentPhase: obj({ phaseTag: s('NEXT_PHASE_PERMANENT'), timeWindow: s('下一版永久纠正窗口'), title: s('永久纠正标题'), objective: s('永久纠正目标'), hardwareImpact: s('硬件影响'), responsibilityRole: s('责任角色'), actions: arr(obj({ step: s('步骤'), detail: s('动作细节'), owner: s('责任人'), duration: s('预计耗时'), hardwareImpact: s('硬件影响'), deliverable: s('交付物') }, '永久纠正动作'), '永久纠正动作列表'), verificationCriteria: s('验证准则'), exitCriteria: s('退出准则') }, '永久纠正'), strategicTradeoff: s('双时间轴的策略权衡') }, '双层时间轴'),
  },
};

function buildJsonFieldOutline(schema: any, indent = ''): string {
  if (!schema || typeof schema !== 'object') return '';
  if (schema.type === 'object' && schema.properties) {
    return Object.entries(schema.properties as Record<string, any>).map(([key, value]) => { const desc = value?.description ? ' — ' + value.description : ''; const nested = buildJsonFieldOutline(value, indent + '  '); return indent + '- ' + key + desc + (nested ? '\n' + nested : ''); }).join('\n');
  }
  if (schema.type === 'array' && schema.items) { return buildJsonFieldOutline(schema.items, indent); }
  return '';
}
export const COPILOT_RESULT_FIELD_OUTLINE = buildJsonFieldOutline(COPILOT_RESULT_JSON_SCHEMA);

export const HARDWARE_CHIEF_SYSTEM_PROMPT = [
  '你是汽车电子硬件工程的资深首席工程师，负责基于当前项目证据进行风险判断、物理机理解释、方案权衡、验证规划与决策支持。',
  '你的任务不是替代本地确定性工程引擎计算，而是在其事实边界之上进行工程推理。',
  '',
  '【证据优先级——必须严格遵守】',
  '1. 当前项目的结构化输入、实测值、规格/要求和带 provenance 的本地确定性计算结果，是本次分析的最高事实来源。',
  '2. 本地确定性计算已经给出的数值、Margin、Verdict、VETO 不得被模型重新计算、改写或用另一个未标注来源的数字覆盖。',
  '3. Gold Case 只用于识别 Pattern、验证思路和输出严谨度；绝不能把案例中的数值、工况、结论或推荐方案冒充当前项目事实。',
  '4. 通用工程知识和领域规则只能用于解释机制、提出验证方法或识别风险；如果需要一个当前项目没有提供的具体数值，必须写 UNKNOWN，而不是猜测。',
  '5. 当不同来源冲突时，优先级为：当前实测/规格与项目输入 > 本地确定性计算及其 provenance > 当前项目明确假设 > Gold Case > 通用知识。冲突必须进入 assumptions/unknowns。',
  '',
  '【模型职责边界】',
  '1. 本地引擎负责确定性计算、硬性门禁、物理量和可审计数值；你负责解释、因果推理、方案权衡、风险沟通和最小验证路径。',
  '2. 不得为了让答案完整而补齐缺失参数；缺失参数就是 UNKNOWN，并说明它阻塞什么判断以及最小验证动作。',
  '3. 不得把“看起来合理”的经验值写成 measured/spec/calculated；任何数值都必须能追溯到 citedFields。',
  '4. 不得把管理偏好、领导风格、心理博弈、攻心、甩锅、免责策略、Nash equilibrium 等作为技术依据，也不得据此改变方案评分或推荐。',
  '5. 不得输出与当前工程无关的产品宣传、软件介绍、泛泛而谈的工程鸡汤或“建议优化/加强/检查”类无验证条件空话。',
  '',
  '【方案判断规则】',
  '1. 每个候选方案必须说明：技术收益、工程代价、副作用、残余风险、验证方法、前置条件、停止条件和 Plan B。',
  '2. candidateActions 的 T/S/C/Q/L 只能依据当前项目的工程事实、确定性基线和明确的工程约束进行判断；不能依据人员偏好。',
  '3. scores.total 必须与给定权重一致；如果本地基线已有候选方案评分，优先以基线评分为锚，不得无依据重写。',
  '4. 本地确定性引擎触发的 VETO 必须保留；模型不得通过改写文字把 VETO 变成“可接受”。',
  '5. 对安全、可靠性、EMC、器件额定值等阈值，优先使用当前项目提供的规格和本地引擎结果；未提供时不得虚构项目阈值。',
  '',
  '【输出要求】',
  '1. 严格输出预定义 JSON Schema 的纯 JSON，不要 Markdown、前言或结语。',
  '2. knownFacts 只放有证据支持的当前项目事实；assumptions 明确标记推断；unknowns 明确列出证据缺口。',
  '3. citedFields 必须引用真实存在的 measuredValues.*、baseline.analysisBasis.calculatedOutputs:* 或 precomputed.* 键。',
  '4. 最终推荐必须说明为什么现在选择、为什么不选主要替代方案、下一步验证什么以及什么证据会推翻当前推荐。',
].join('\n');

export function healAndParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') { throw new Error('Raw response is empty or non-string'); }
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) { cleaned = cleaned.slice(firstBrace, lastBrace + 1); }
  try { return JSON.parse(cleaned); }
  catch (firstErr) {
    const fixedComma = cleaned.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' || match === '\r' || match === '\t' ? match : ''));
    return JSON.parse(fixedComma);
  }
}

export function validateAndEnrichAiResult(parsed: any, baseline: any, modelName: string, context: any, issue: any, integrityAssessment?: any): any {
  if (!parsed || typeof parsed !== 'object') { return baseline; }
  if (!parsed.coreConclusion || !parsed.coreConclusion.problemSummary) { parsed.coreConclusion = baseline.coreConclusion; }
  if (!parsed.physicalMechanism || !parsed.physicalMechanism.rootCauseAnalysis) { parsed.physicalMechanism = baseline.physicalMechanism; }
  if (!parsed.riskRatings || !parsed.riskRatings.overallRisk) { parsed.riskRatings = baseline.riskRatings; }
  if (!Array.isArray(parsed.candidateActions) || parsed.candidateActions.length === 0) { parsed.candidateActions = baseline.candidateActions; }
  if (!parsed.finalRecommendation || !parsed.finalRecommendation.recommendedOptionName) { parsed.finalRecommendation = baseline.finalRecommendation; }
  parsed.dfmeaView = parsed.dfmeaView || baseline.dfmeaView;
  parsed.containment = parsed.containment || baseline.containment;
  parsed.capa = parsed.capa || baseline.capa;
  parsed.raciMatrix = parsed.raciMatrix || baseline.raciMatrix;
  parsed.engineeringDocs = parsed.engineeringDocs || baseline.engineeringDocs;
  parsed.classifiedInfo = parsed.classifiedInfo || baseline.classifiedInfo;
  parsed.multiRiskBreakdown = parsed.multiRiskBreakdown || baseline.multiRiskBreakdown;
  parsed.whyNotComparison = parsed.whyNotComparison || baseline.whyNotComparison;
  parsed.next24HourPlan = parsed.next24HourPlan || baseline.next24HourPlan;
  parsed.edrRecord = parsed.edrRecord || baseline.edrRecord;
  parsed.redTeamChallenge = parsed.redTeamChallenge || baseline.redTeamChallenge;
  const md = parsed.multiDomainAnalysis;
  if (!md || typeof md !== 'object') {
    const primaryDomain = resolveEngineeringDomain(issue);
    const relatedDomains = resolveEngineeringDomains(issue).filter((d) => d !== primaryDomain);
    parsed.multiDomainAnalysis = { primaryDomain, relatedDomains, domainAssessments: [primaryDomain, ...relatedDomains].map((domain, index) => ({ domain, role: index === 0 ? 'PRIMARY' : 'RELATED', evidenceLevel: 'MEDIUM_INFERRED', knownFacts: [], evidenceGaps: ['当前分析未返回该域独立分层'], minimumValidation: '补齐该领域最小实测证据后重新核对', domainConclusion: '证据不足，需台架闭环' })), crossDomainLinks: [], crossDomainVetoes: [] };
  } else {
    md.primaryDomain = md.primaryDomain || resolveEngineeringDomain(issue);
    md.relatedDomains = Array.isArray(md.relatedDomains) ? md.relatedDomains : resolveEngineeringDomains(issue).filter((d) => d !== md.primaryDomain);
    md.domainAssessments = Array.isArray(md.domainAssessments) ? md.domainAssessments : [];
    md.crossDomainLinks = Array.isArray(md.crossDomainLinks) ? md.crossDomainLinks : [];
    md.crossDomainVetoes = Array.isArray(md.crossDomainVetoes) ? md.crossDomainVetoes : [];
  }
  parsed.dualTimeline = parsed.dualTimeline || baseline.dualTimeline || buildDualTimelinePlan(parsed, context, issue);
  const dfDefaults = {
    decisionQuestion: (context?.nextMilestone || '下一工程门禁') + ' 前是否具备继续推进的证据条件',
    currentDecisionGate: context?.nextMilestone || '当前工程门禁',
    decisionWindow: '剩余 ' + (context?.daysRemaining ?? 14) + ' 天',
    bestNextAction: parsed.finalRecommendation?.immediateSteps?.[0]?.action || '先完成当前关键未知量的最小验证',
    minimumEvidenceToProceed: [parsed.finalRecommendation?.preconditions?.[0] || '关键实测证据达到项目规范门槛'],
    unknownsBlockingDecision: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 5) : ['关键输入数据不足'],
    reversalCriteria: Array.isArray(parsed.finalRecommendation?.reEvaluationTriggers) ? parsed.finalRecommendation.reEvaluationTriggers.slice(0, 5) : ['关键实测证据与当前物理假设不一致'],
  };
  // [健壮性收口] AI 常把 string[] 字段回灌成单个字符串；在此统一归一化，
  // 否则前端 result.decisionFrame.reversalCriteria.slice(...).join() 会抛 join is not a function 而白屏。
  parsed.decisionFrame = normalizeDecisionFrame(parsed.decisionFrame, dfDefaults);
  parsed.provenance = { executionMode: 'ONLINE_AI_INFERRED', engineName: '云端大模型 (' + modelName + ') 工况强定锚推理', isAiInferred: true, isDeterministicRule: false, generatedAt: new Date().toLocaleTimeString(), modelIdentifier: modelName, transparencyNote: '本分析由云端大模型 [' + modelName + '] 严格限定在当前项目工况与实测数据下推演生成，严禁脱离实际作答。' };
  const { sanitizedResult } = auditAiResult(parsed, baseline, context, issue, integrityAssessment);
  return sanitizedResult;
}

export function buildAnalysisPrompt(context: any, issue: any, modelConfig?: any) {
  const integrityAssessment = assessInputIntegrity(context, issue);
  const integrityPromptDirectives = generatePromptIntegrityDirectives(integrityAssessment);
  const baseline = runExpertAnalysis(context, issue);
  if (baseline.provenance) baseline.provenance.inputIntegrity = integrityAssessment;
  const precomputedFacts = runDeterministicPrecomputations(context, issue);
  const similarGoldCases = findSimilarGoldCases(issue, 2);
  // 将离散预计算事实正式挂到 baseline.analysisBasis，保证 citedFields 在 AI 返回后仍可被 Auditor 反查。
  const precomputedEvidence = precomputedFacts.map((f) => ({
    id: f.id,
    key: `precomputed.${f.id}`,
    title: f.title,
    status: f.status || 'CALCULATED',
    ...(typeof f.calculatedValue === 'number' ? { value: f.calculatedValue } : {}),
    unit: f.unit,
    engine: 'deterministicPrecomputation',
    calculation: f.category,
    formula: f.formulaOrBasis,
    inputs: f.inputs || [],
    inputSources: f.inputSources || {},
    missingInputs: f.missingInputs || [],
    ...(typeof f.specThreshold === 'number' ? { specThreshold: f.specThreshold } : {}),
    ...(typeof f.safetyMargin === 'number' ? { safetyMargin: f.safetyMargin } : {}),
    complianceVerdict: f.complianceVerdict,
    directiveForAi: f.directiveForAi,
  }));
  baseline.analysisBasis = {
    ...(baseline.analysisBasis || { ruleInputs: [], measuredInputs: [], calculatedOutputs: [], assumptions: [], fixedTemplateFields: [] }),
    calculatedOutputs: Array.from(new Set([
      ...(baseline.analysisBasis?.calculatedOutputs || []),
      ...precomputedFacts
        .filter((f) => f.status !== 'INSUFFICIENT_INPUT')
        .map((f) => `precomputed.${f.id}=${f.calculatedValue}${f.unit ? ` ${f.unit}` : ''}; margin=${f.safetyMargin ?? 'N/A'}; verdict=${f.complianceVerdict}`),
    ])),
    calculatedOutputEvidence: [
      ...(baseline.analysisBasis?.calculatedOutputEvidence || []),
      ...precomputedEvidence,
    ],
  };
  const grounding = buildGroundingText(baseline, precomputedFacts, similarGoldCases);

  const primaryDomain = resolveEngineeringDomain(issue);
  const relatedDomains = resolveEngineeringDomains(issue).filter((d) => d !== primaryDomain);
  const multiDomainGuidance = getMultiDomainAdaptivePromptGuidance(issue, context);
  const primaryGuidance = multiDomainGuidance.primary;
  const primaryFields = getDomainMeasurementGroups(issue).find((g) => g.domain === primaryDomain)?.fields || [];
  const values = issue?.measuredValues || {};
  const isFilled = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  const missingRequired = primaryFields.filter((f) => f.required && !isFilled(values[f.key]));
  const coverage = primaryFields.length ? primaryFields.filter((f) => isFilled(values[f.key])).length / primaryFields.length : 1;
  const evidenceLevel = missingRequired.length || integrityAssessment.grade === 'GRADE_D_BLOCKING' || integrityAssessment.grade === 'GRADE_C_INSUFFICIENT'
    ? 'LOW' : coverage >= 0.8 ? 'HIGH' : 'MEDIUM_INFERRED';

  const primaryGuidanceText = evidenceLevel === 'LOW'
    ? `【主导工程域：${primaryGuidance.title}｜证据等级：LOW】\n- 当前仅允许使用硬性门禁/否决边界，不做未经验证的定量外推。\n- 必须补齐：${missingRequired.length ? missingRequired.map((f) => `${f.label}${f.unit ? ` (${f.unit})` : ''}`).join('、') : '输入完整度审计指出的关键缺口'}\n- 禁止：把经验值写成实测或规格值。`
    : `【主导工程域：${primaryGuidance.title}｜证据等级：${evidenceLevel}】\n- 物理机理与公式：${primaryGuidance.physicsFormulas}\n- 元器件/设计基准：${primaryGuidance.componentSpecs}\n- 测试与验证：${primaryGuidance.testProtocol}\n- 跨域影响：${primaryGuidance.crossDisciplinaryImpact}\n- 禁止空话：${primaryGuidance.prohibitedVagueness.join('；')}`;

  const relatedGuidanceText = multiDomainGuidance.related.length
    ? multiDomainGuidance.related.map((r) => `【关联域：${r.title}】\n- 只关注与主导域的物理耦合、影响和否决边界：${r.crossDisciplinaryImpact}`).join('\n\n')
    : '无关联工程域。';

  const couplings = getCrossDomainCouplings(primaryDomain, relatedDomains);
  const couplingText = couplings.length
    ? couplings.map((c) => `- ${c.fromDomain} → ${c.toDomain}：动作=${c.action}；物理变化=${c.physicalChange}；代价=${c.physicalTradeoff}；复核=${c.requiredRevalidation.join('; ')}${c.vetoCondition ? `；VETO=${c.vetoCondition}` : ''}`).join('\n')
    : '无已定义的跨域耦合规则。';

  const allExpectedFields = getDomainMeasurementFields(issue);
  const missingFields = allExpectedFields.filter((f) => !isFilled(values[f.key]));
  const missingFieldsText = missingFields.length
    ? missingFields.map((f) => `- ${f.key}（${f.label}${f.unit ? `，${f.unit}` : ''}，${f.tag}${f.required ? '，必填缺失' : ''}）`).join('\n')
    : '无缺失测量字段。';

  const domainEvidence = getDomainMeasurementGroups(issue).map((group, idx) => {
    const filled = group.fields.filter((f) => isFilled(values[f.key])).map((f) => `${f.key}=${values[f.key]}`);
    const missing = group.fields.filter((f) => !isFilled(values[f.key])).map((f) => f.key);
    return `【${idx === 0 ? '主导域' : '关联域'} ${getEngineeringDomainLabel(group.domain)}】已填=${filled.length ? filled.join(', ') : '无'}；缺失=${missing.length ? missing.join(', ') : '无'}`;
  }).join('\n');

  // 给模型一个“当前工程方案基线”，防止模型凭空创造候选方案分数。
  const baselineActions = (baseline.candidateActions || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    scores: a.scores,
    veto: a.veto,
    riskDelta: a.riskDelta,
    residualRisk: a.residualRisk,
    verificationCost: a.verificationCost,
    timeCost: a.timeCost,
    citedFields: a.citedFields,
  }));

  const userPrompt = `
【分析任务边界】
本次云端模型是“推理与决策层”，不是第二套计算引擎。你必须在以下当前工程事实之内工作。

【A. 当前项目上下文】
- 项目：${context?.projectName || '未提供'}
- ECU：${context?.ecuType || '未提供'} / ${context?.productType || '未提供'}
- 阶段：${context?.projectPhase || '未提供'}；样品：${context?.sampleStatus || '未提供'}
- ASIL：${context?.asilLevel || '未提供'}
- 下一门禁：${context?.nextMilestone || '未提供'}；剩余：${context?.daysRemaining ?? 'UNKNOWN'} 天
- 成本约束：${context?.costConstraint || '未提供'}

【B. 当前工程问题——最高事实层】
- 主导域：${getEngineeringDomainLabel(primaryDomain)}
- 关联域：${relatedDomains.map(getEngineeringDomainLabel).join(' / ') || '无'}
- 问题分类：${issue?.issueCategories?.join(', ') || '未提供'}
- 规范/要求：${issue?.requirement || 'UNKNOWN'}
- 实际测量：${issue?.actualMeasurement || 'UNKNOWN'}
- 测试条件：${issue?.testCondition || 'UNKNOWN'}
- 测试环境：${issue?.environment || 'UNKNOWN'}
- 失效现象：${issue?.failurePhenomenon || 'UNKNOWN'}
- 工程顾虑：${issue?.engineeringConcern || 'UNKNOWN'}
- 结构化实测值：${JSON.stringify(values, null, 2)}

【C. 本地确定性事实——NON-NEGOTIABLE】
${grounding.baselineText}
${grounding.precomputedText}

规则：这些事实中的 CALCULATED / measured / spec / VETO / Margin 是权威边界。不得重新计算出第二套数字。若发现冲突，只能在 assumptions/unknowns 中指出并要求复核。

【D. 当前方案基线——只作为本项目当前工程状态，不得凭空重造】
${JSON.stringify(baselineActions, null, 2)}
- 当前确定性风险：${baseline?.riskRatings?.overallRisk || 'UNKNOWN'}；当前确定性风险分数：${baseline?.riskRatings?.overallRiskScore ?? 'UNKNOWN'}
- 当前确定性问题：${baseline?.coreConclusion?.problemSummary || 'UNKNOWN'}
- 当前确定性物理机理：${baseline?.physicalMechanism?.rootCauseAnalysis || 'UNKNOWN'}

如果需要提出新方案，必须解释它相对于上述基线的变化、工程依据和验证条件；不能只因为“看起来更好”就改变评分。

【E. 输入完整度与 UNKNOWN 边界】
${integrityPromptDirectives}
未提供字段：
${missingFieldsText}
按工程域的证据浓度：
${domainEvidence}

【F. 主导域工程推理规则】
${primaryGuidanceText}

${relatedGuidanceText}

【G. 跨域耦合与 VETO 复核】
${couplingText}
候选方案必须逐条回填 crossDomainCouplingChecks；不得遗漏已经给出的 VETO 边界。

【H. Gold Case——仅用于 Pattern 参考】
${grounding.goldCaseText}
Gold Case 绝不是当前项目事实。禁止复制其中数值、结论、工况或推荐作为当前项目答案。

【I. 最终决策要求】
你必须回答：
1. 当前最可信的工程问题是什么？
2. 哪些是已证实事实，哪些只是推断，哪些未知？
3. 主导物理机理是什么？
4. 候选方案分别解决什么、付出什么代价、留下什么残余风险？
5. 当前为什么可以/不能继续推进？
6. 未来24小时最小且最有价值的验证动作是什么？
7. 什么证据出现后必须推翻当前建议？
8. 必须同时给出 T+24h containmentPhase 和下一版 permanentPhase。

【J. 禁止输出】
- 禁止领导风格、领导接受度、心理博弈、攻心、甩锅、免责概率、Nash equilibrium 等内容。
- 禁止软件功能介绍、AI 自我介绍、泛泛工程口号。
- 禁止把 UNKNOWN 写成确定事实。
- 禁止把 Gold Case 数值当当前项目数值。
- 禁止用未提供的默认参数完成计算。
- 禁止用新的未标注公式覆盖本地确定性计算。

【K. 输出协议】
严格输出预定义 JSON Schema 的纯 JSON；不得增加字段。所有带数值的关键结论必须能通过 citedFields 回溯到当前输入或本地确定性事实。
`;

  const finalUserPrompt = `${userPrompt}\n\n【输出JSON字段结构清单】\n${COPILOT_RESULT_FIELD_OUTLINE}`;
  return { systemPrompt: HARDWARE_CHIEF_SYSTEM_PROMPT, userPrompt: finalUserPrompt, baseline, integrityAssessment, precomputedFacts };
}

export function processImportedAiResult(aiContent: string, context: any, issue: any): { success: boolean; data?: any; aiAudit?: any; error?: string } {
  try {
    if (!aiContent || typeof aiContent !== 'string') { return { success: false, error: '缺少 AI 返回的 JSON 文本' }; }
    const built = buildAnalysisPrompt(context || {}, issue || {});
    const parsed = healAndParseJson(aiContent);
    const structureCheck = validateAiResultStructure(parsed);
    if (!structureCheck.valid) { return { success: false, error: 'AI 返回的 JSON 结构有问题：' + structureCheck.issues.map((it) => it.path + ' → ' + it.message).join('；') }; }
    const enriched = validateAndEnrichAiResult(parsed, built.baseline, 'offline-free-ai', context || {}, issue || {}, built.integrityAssessment);
    const audited = auditAiResult(enriched, built.baseline, context || {}, issue || {}, built.integrityAssessment);
    const finalData = audited.sanitizedResult;
    if (finalData && finalData.provenance) { finalData.provenance.inputIntegrity = built.integrityAssessment; finalData.provenance.aiAudit = audited.auditResult; }
    return { success: true, data: finalData, aiAudit: audited.auditResult };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

