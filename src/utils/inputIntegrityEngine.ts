import { ProjectContext, IssueInput, InputIntegrityAssessment, InputIntegrityGrade } from '../types';
import {
  resolveEngineeringDomain,
  getEngineeringDomainLabel,
  getDomainMeasurementFields,
  DomainMeasurementField,
} from './scenarioDomainEngine';

/**
 * 检查数值是否非空有效
 */
function isValueFilled(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val === 'string') return val.trim().length > 0;
  return true;
}

/**
 * 车规工程输入完整度校验引擎
 * 在 AI 推理或专家推演前，深度扫描工程工况与实测数据的完备性，
 * 给出车规量化评级 (Grade A / B / C / D)，防止模型在缺乏事实基础的情况下发散造假。
 */
export function assessInputIntegrity(
  context: ProjectContext | undefined,
  issue: IssueInput | undefined
): InputIntegrityAssessment {
  const domain = resolveEngineeringDomain(issue);
  const domainLabel = getEngineeringDomainLabel(domain);

  const missingContextFields: string[] = [];
  const missingIssueFields: string[] = [];
  const missingRequiredFields: string[] = [];
  const riskWarnings: string[] = [];
  const blockingReasons: string[] = [];
  const recommendedNextActions: string[] = [];
  const requiredAssumptions: string[] = [];

  // 1. 上下文检查 (总分权重 25)
  let contextScore = 0;
  const maxContextScore = 25;

  if (context?.projectName && context.projectName.trim().length > 1) {
    contextScore += 5;
  } else {
    missingContextFields.push('项目名称 (projectName)');
  }

  if (context?.ecuType) {
    contextScore += 5;
  } else {
    missingContextFields.push('ECU类型 (ecuType)');
  }

  if (context?.projectPhase) {
    contextScore += 5;
  } else {
    missingContextFields.push('开发阶段 (projectPhase)');
  }

  if (typeof context?.daysRemaining === 'number' && context.daysRemaining >= 0) {
    contextScore += 5;
  } else {
    missingContextFields.push('门禁剩余工期 (daysRemaining)');
    riskWarnings.push('未指定门禁倒计时工期，方案的时间成本可行性推演可能缺乏明确锚点');
  }

  if (context?.asilLevel) {
    contextScore += 5;
  } else {
    missingContextFields.push('功能安全等级 (asilLevel)');
    riskWarnings.push('未指定功能安全等级，默认按 QM / ASIL B 最低边界进行兜底核验');
  }

  // 2. 问题基础描述检查 (总分权重 35)
  let issueScore = 0;
  const maxIssueScore = 35;

  if (issue?.failurePhenomenon && issue.failurePhenomenon.trim().length >= 4) {
    issueScore += 10;
  } else {
    missingIssueFields.push('失效现象描述 (failurePhenomenon)');
    blockingReasons.push('未提供清晰的失效现象，无法确定故障形态');
  }

  if (issue?.requirement && issue.requirement.trim().length >= 4) {
    issueScore += 8;
  } else {
    missingIssueFields.push('设计规范/门槛要求 (requirement)');
    riskWarnings.push('缺少明确的设计规范要求，超标量判定将依赖车规通用行业基准');
  }

  if (issue?.actualMeasurement && issue.actualMeasurement.trim().length >= 4) {
    issueScore += 9;
  } else {
    missingIssueFields.push('实测定性/定量描述 (actualMeasurement)');
    riskWarnings.push('实测结果描述不详，难以准确计算裕量击穿程度');
  }

  if (issue?.testCondition && issue.testCondition.trim().length >= 4) {
    issueScore += 4;
  } else {
    missingIssueFields.push('测试边界与激励条件 (testCondition)');
    recommendedNextActions.push('补齐测试工况与激励边界（如电压/负载/温湿度）');
  }

  if (issue?.engineeringConcern && issue.engineeringConcern.trim().length >= 4) {
    issueScore += 4;
  } else {
    missingIssueFields.push('核心工程顾虑 (engineeringConcern)');
  }

  // 3. 领域实测参数字段核验 (总分权重 40)
  const expectedFields: DomainMeasurementField[] = getDomainMeasurementFields(issue);
  const measuredValues: Record<string, any> = issue?.measuredValues || {};

  let filledCount = 0;
  const requiredFields = expectedFields.filter((f) => f.required);
  let filledRequiredCount = 0;

  const provenance = issue?.measurementProvenance || {};
  const globalSource = issue?.measuredValueSource;
  const resolveSource = (field: DomainMeasurementField) =>
    provenance[field.key]?.source ||
    (globalSource === 'USER_MEASURED' || globalSource === 'IMPORTED' || globalSource === 'BENCHMARK' ? globalSource :
      field.tag === 'CALCULATED' ? 'CALCULATED' : field.tag === 'SPEC' ? 'SPEC' : field.tag === 'CONTEXT' ? 'CONTEXT' : 'UNKNOWN');
  const isTrustedEvidence = (source: string) => source === 'USER_MEASURED' || source === 'IMPORTED';

  for (const field of expectedFields) {
    const val = measuredValues[field.key];
    const filled = isValueFilled(val);
    const source = resolveSource(field);
    if (filled) {
      filledCount++;
      if (field.required && isTrustedEvidence(source)) {
        filledRequiredCount++;
      } else if (field.required && !isTrustedEvidence(source)) {
        missingRequiredFields.push(`${field.label} (${field.key}${field.unit ? ` [${field.unit}]` : ''}) · 证据来源=${source}`);
        requiredAssumptions.push(`字段【${field.label}】虽有数值 ${val}，但来源标记为 ${source}，不计入实测证据；必须由工程师实测或可追溯导入数据闭环`);
        riskWarnings.push(`【${field.label}】当前来源为 ${source}，存在数值但不具备可直接放行的实测证据等级`);
      }
    } else if (field.required) {
      missingRequiredFields.push(`${field.label} (${field.key}${field.unit ? ` [${field.unit}]` : ''})`);
      requiredAssumptions.push(`由于缺少实测【${field.label}】，该字段不能作为已验证事实，必须补充台架/量产可追溯证据`);
    }
  }

  let measurementScore = 0;
  if (expectedFields.length === 0) {
    measurementScore = 30; // 通用域无特定量化要求
  } else {
    const requiredWeight = 25;
    const optionalWeight = 15;

    const reqRatio = requiredFields.length > 0 ? filledRequiredCount / requiredFields.length : 1;
    const optFields = expectedFields.filter((f) => !f.required);
    const filledOptCount = optFields.filter((field) => isValueFilled(measuredValues[field.key]) && isTrustedEvidence(resolveSource(field))).length;
    const optRatio = optFields.length > 0 ? filledOptCount / optFields.length : 1;

    measurementScore = Math.round(reqRatio * requiredWeight + optRatio * optionalWeight);
  }

  // 综合总分 (0 - 100)
  const completenessScore = Math.min(100, Math.max(0, contextScore + issueScore + measurementScore));

  // 判定评级
  let grade: InputIntegrityGrade = 'GRADE_B_ACCEPTABLE';
  let gradeLabel = 'B级 · 工程可接受';
  let allowAiInference = true;

  if (blockingReasons.length > 0 || completenessScore < 35) {
    grade = 'GRADE_D_BLOCKING';
    gradeLabel = 'D级 · 严重缺失/阻断推演';
    allowAiInference = false;
    recommendedNextActions.unshift('请至少补充完整的失效现象和核心工况参数后再启动推演');
  } else if (completenessScore < 60 || missingRequiredFields.length >= 2) {
    grade = 'GRADE_C_INSUFFICIENT';
    gradeLabel = 'C级 · 关键证据欠缺';
    riskWarnings.push(`主导领域【${domainLabel}】有 ${missingRequiredFields.length} 个必填实测参数未提供，结论必须标注为待实测假设`);
    recommendedNextActions.push('在台架补齐缺失的关键电气/物理量测量后重新评审');
  } else if (completenessScore >= 85 && missingRequiredFields.length === 0) {
    grade = 'GRADE_A_RIGOROUS';
    gradeLabel = 'A级 · 车规高完整度';
  } else {
    grade = 'GRADE_B_ACCEPTABLE';
    gradeLabel = 'B级 · 工程基本完备';
  }

  return {
    grade,
    gradeLabel,
    completenessScore,
    domain,
    domainLabel,
    missingRequiredFields,
    missingContextFields,
    missingIssueFields,
    filledFieldsCount: filledCount,
    totalExpectedFieldsCount: expectedFields.length,
    riskWarnings,
    blockingReasons,
    recommendedNextActions,
    allowAiInference,
    requiredAssumptions,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * 根据输入完整度评估，生成注入到 AI 提示词中的强约束指令
 */
export function generatePromptIntegrityDirectives(assessment: InputIntegrityAssessment): string {
  const parts: string[] = [
    `【输入完整度车规审计等级】：${assessment.gradeLabel} (量化评分: ${assessment.completenessScore}/100)`,
  ];

  if (assessment.missingRequiredFields.length > 0) {
    parts.push(
      `⚠️ 严正警告：本次输入在【${assessment.domainLabel}】工程域缺少以下必填实测参数：\n${assessment.missingRequiredFields.map((f) => `  - ${f}`).join('\n')}`
    );
    parts.push(
      `【强制纪律】：你绝对禁止将上述未填写的参数虚构为“已实测数值”，在候选方案与物理机理推导中，必须显式标注“因缺少实测 [参数名]，此处基于车规工程假设推导，属于待台架闭环确认项”。`
    );
  } else {
    parts.push(`✅ 本次输入关键实测字段齐全，可直接展开高精度定量计算与方案决策。`);
  }

  if (assessment.grade === 'GRADE_C_INSUFFICIENT') {
    parts.push(
      `🔴【C级约束】：由于关键证据欠缺，你不得在 finalRecommendation 中宣称“根因已 100% 锁定”，必须在 immediateSteps 中将“补齐上述关键测点实测波形”列为第 1 优先级前置步骤。`
    );
  }

  return parts.join('\n\n');
}
