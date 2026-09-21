import { runExpertAnalysis } from '../data/expertEngine';
import { assessInputIntegrity, generatePromptIntegrityDirectives } from './inputIntegrityEngine';
import { runDeterministicPrecomputations } from './deterministicPrecomputation';
import { findSimilarGoldCases, buildGroundingText } from './aiGrounding';
import { getDomainMeasurementFields, resolveEngineeringDomain, resolveEngineeringDomains } from './scenarioDomainEngine';
import { buildDualTimelinePlan } from './dualTimelineEngine';
import { auditAiResult } from './aiResultAuditor';
import { validateAiResultStructure } from './aiResultSchema';

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
  '你是一位在汽车国际顶级Tier-1拥有20年经验的首席硬件架构师，精通ISO 26262 (Part 5)、ASPICE 4.0 (HWE.1-4) 及IATF 16949体系。',
  '你的使命是协助硬件开发工程师进行技术攻关、防身免责与跨部门推演。',
  '',
  '【核心工作准则】',
  '1. 严禁和稀泥：方案必须给出鲜明的支持/否决倾向，必须揭示每一个方案的隐藏代价（Side Effects）。',
  '2. 绝对区分特采性质（根据 IATF 16949 Section 8.7）：内部样件特批（Internal Deviation）必须有台套数范围与物理隔离报废措施；主机厂外部让步（Customer Concession）涉及功能安全/降额击穿/EMC未达标/引脚变更，必须走正式VDA ECR流程，严禁建议工程师私下放行。',
  '3. 严格执行ISO 26262硬件度量判定：SPFM ASIL B>=90% / C>=97% / D>=99%；LFM ASIL B>=60% / C>=80% / D>=90%；PMHF ASIL D<10 FIT / C<100 FIT。任何削减硬件安全机制又无诊断补偿的方案必须标记 VETO_SAFETY_VIOLATION。',
  '4. 深度洞察直属领导风格 (hwLeadStyle)：CONSERVATIVE(技术求稳) / AGILE_DELIVERY(敏捷交付) / PROCESS_DEFENSIVE(流程免责)，每个方案给出针对 HW Lead/PM/SW/System 的防身策略。',
  '5. 语言必须极其专业：使用正规汽车工程语境（工况剖面Mission Profile、抛负载抑制度、寄生振荡、体二极管反向恢复损耗、AEC-Q Grade 1）。',
  '6. 【工况强定锚与防幻觉红线】：把输入的项目上下文与实测问题作为唯一最高事实依据；本地预核算事实必须严格直接引用其数值与裕量，严禁另造冲突数字；缺失参数视为 UNKNOWN 禁止默认值填充；绝对禁止脱离工况给通用套话。',
  '',
  '【输出格式强制要求】严格输出符合预定义JSON Schema的纯JSON文本，禁止任何Markdown代码块外壳，禁止任何前言和结语。',
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
  parsed.decisionFrame = parsed.decisionFrame || { decisionQuestion: (context?.nextMilestone || '下一工程门禁') + ' 前是否具备继续推进的证据条件', currentDecisionGate: context?.nextMilestone || '当前工程门禁', decisionWindow: '剩余 ' + (context?.daysRemaining ?? 14) + ' 天', bestNextAction: parsed.finalRecommendation?.immediateSteps?.[0]?.action || '先完成当前关键未知量的最小验证', minimumEvidenceToProceed: [parsed.finalRecommendation?.preconditions?.[0] || '关键实测证据达到项目规范门槛'], unknownsBlockingDecision: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 5) : ['关键输入数据不足'], reversalCriteria: Array.isArray(parsed.finalRecommendation?.reEvaluationTriggers) ? parsed.finalRecommendation.reEvaluationTriggers.slice(0, 5) : ['关键实测证据与当前物理假设不一致'] };
  parsed.provenance = { executionMode: 'ONLINE_AI_INFERRED', engineName: '云端大模型 (' + modelName + ') 工况强定锚推理', isAiInferred: true, isDeterministicRule: false, generatedAt: new Date().toLocaleTimeString(), modelIdentifier: modelName, transparencyNote: '本分析由云端大模型 [' + modelName + '] 严格限定在当前项目工况与实测数据下推演生成，严禁脱离实际作答。' };
  const { sanitizedResult } = auditAiResult(parsed, baseline, context, issue, integrityAssessment);
  return sanitizedResult;
}

export function buildAnalysisPrompt(context: any, issue: any) {
  const integrityAssessment = assessInputIntegrity(context, issue);
  const integrityPromptDirectives = generatePromptIntegrityDirectives(integrityAssessment);
  const baseline = runExpertAnalysis(context, issue);
  if (baseline.provenance) baseline.provenance.inputIntegrity = integrityAssessment;
  const precomputedFacts = runDeterministicPrecomputations(context, issue);
  const similarGoldCases = findSimilarGoldCases(issue, 2);
  const grounding = buildGroundingText(baseline, precomputedFacts, similarGoldCases);
  const allExpectedFields = getDomainMeasurementFields(issue);
  const isFilled = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  const missingFieldsList = allExpectedFields.filter((f) => !isFilled((issue?.measuredValues || {})[f.key]));
  const missingFieldsText = missingFieldsList.length ? missingFieldsList.map((f) => '- ' + f.key + '（' + f.label + (f.unit ? '，单位 ' + f.unit : '') + '，' + f.tag + (f.required ? '，必填缺失' : '') + '）').join('\n') : '（本次涉及的工程域测量字段均已填写）';
  const prompt = [
    '【执行优先级（不可违背）】',
    '1. 必须直接引用【本地确定性预核算事实】中的数值与裕量，严禁另造冲突数字。',
    '2. 缺失参数一律视为 UNKNOWN，禁止默认值填充。',
    '3. 输出必须是纯 JSON，无任何 Markdown 外壳。',
    '4. 必须同时给出 containmentPhase（T+24h）与 permanentPhase。',
    '5. 任何触及功能安全/降额击穿的方案必须显式标记 VETO。',
    '',
    '=============================================',
    '【1. 输入工程背景】',
    '- 项目名称: ' + (context?.projectName || '未提供'),
    '- ECU 类型: ' + (context?.ecuType || '未提供') + ' (' + (context?.productType || '未提供') + ')',
    '- 项目阶段: ' + (context?.projectPhase || 'DV') + ' | 样品状态: ' + (context?.sampleStatus || 'B样'),
    '- 功能安全等级: ' + (context?.asilLevel || 'ASIL B'),
    '- 交付倒计时: 距离【' + (context?.nextMilestone || '交付节点') + '】仅剩【' + (context?.daysRemaining ?? 14) + '天】',
    '- 成本约束: ' + (context?.costConstraint || '未提供'),
    '',
    '【2. 输入实测问题与工程顾虑】',
    '- 领域分类: ' + (issue?.issueCategories?.join(', ') || '硬件工程'),
    '- 规范要求: ' + (issue?.requirement || '未定义'),
    '- 实际测量结果: ' + (issue?.actualMeasurement || '未提供实测'),
    '- 测试条件: ' + (issue?.testCondition || '未提供测试边界'),
    '- 失效现象: ' + (issue?.failurePhenomenon || '未提供现象'),
    '- 核心工程顾虑: ' + (issue?.engineeringConcern || '未提供顾虑'),
    '- 关键实测数值: ' + JSON.stringify(issue?.measuredValues || {}, null, 2),
    '',
    '【3. 本地确定性工程事实层（NON-NEGOTIABLE FACTS）】',
    grounding.baselineText, '', grounding.precomputedText, '',
    '★ 事实边界：以上事实来自本地确定性规则或物理计算；同一工程量的结论直接沿用。若认为输入/模型/计算存在冲突，应在 assumptions/unknowns 中说明，不生成第二套未标注来源的数字。',
    '',
    '【4. 输入数据完整度车规审计】', integrityPromptDirectives, '',
    '【5. 本次未提供的工程参数（UNKNOWN 边界）】', missingFieldsText, '',
    '【6. 金标准参考案例（只作分析严谨度参考，不得把案例数值当当前项目事实）】', grounding.goldCaseText, '',
    '【7. 车规基准定锚】',
    '- 确定性问题定性: ' + (baseline?.coreConclusion?.problemSummary || ''),
    '- 综合风险评级基准: ' + (baseline?.riskRatings?.overallRisk || 'Medium-High') + ' (' + (baseline?.riskRatings?.overallRiskScore ?? 75) + '分)',
  ].join('\n');
  const userPrompt = prompt + '\n\n【输出JSON字段结构清单（必须严格按此结构输出完整 JSON，不得遗漏必填字段，不得新增字段）】\n' + COPILOT_RESULT_FIELD_OUTLINE;
  return { systemPrompt: HARDWARE_CHIEF_SYSTEM_PROMPT, userPrompt, baseline, integrityAssessment, precomputedFacts };
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

