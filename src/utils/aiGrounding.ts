import { CopilotAnalysisResult, IssueInput } from '../types';
import { PrecomputedFact } from './deterministicPrecomputation';
import { GOLD_STANDARD_CASES } from '../data/goldStandardCases';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[，。；：、“”‘’（）()【】\[\]{}<>《》,.;:!?！？\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTerms(text: string): string[] {
  const n = normalize(text);
  const terms = new Set<string>();
  const stopWords = new Set([
    '标准', '输出', '测试', '风险', '验证', '工程', '系统', '要求', '当前', '实测', '数据', '方案',
    '下一', '必须', '功能', '问题', '客户', '项目', '评估', '结论', '输入', '案例', '控制器', '驱动器',
  ]);
  for (const token of n.split(' ')) {
    if (token.length >= 3 || /\d/.test(token)) terms.add(token);
  }
  const chineseRuns = n.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const run of chineseRuns) {
    for (let size = 3; size <= 4; size++) {
      for (let i = 0; i <= run.length - size; i++) {
        const term = run.slice(i, i + size);
        if (!stopWords.has(term)) terms.add(term);
      }
    }
  }
  return [...terms];
}

type PhysicalDimension = 'voltage' | 'temperature' | 'current' | 'frequency' | 'speed' | 'time' | 'dvdt';

function dimensionForKey(key: string): PhysicalDimension | undefined {
  const k = key.toLowerCase();
  if (/dvdt|slew/.test(k)) return 'dvdt';
  if (/temp|tj|ambient/.test(k)) return 'temperature';
  if (/current|ma$|amp/.test(k)) return 'current';
  if (/rpm|speed/.test(k)) return 'speed';
  if (/freq|frequency|mhz|khz|hz/.test(k)) return 'frequency';
  if (/time|duration|response|recovery/.test(k)) return 'time';
  if (/voltage|vbus|vds|nodevoltage|ringingv|peakv/.test(k)) return 'voltage';
  return undefined;
}

function collectPhysicalInputs(values: Record<string, number | string | boolean> | undefined): Map<PhysicalDimension, number[]> {
  const out = new Map<PhysicalDimension, number[]>();
  for (const [key, raw] of Object.entries(values || {})) {
    const value = Number(raw);
    const dimension = dimensionForKey(key);
    if (!dimension || !Number.isFinite(value) || value === 0) continue;
    const valuesForDimension = out.get(dimension) || [];
    valuesForDimension.push(Math.abs(value));
    out.set(dimension, valuesForDimension);
  }
  return out;
}

function extractPhysicalInputs(issue: IssueInput): Map<PhysicalDimension, number[]> {
  return collectPhysicalInputs(issue.measuredValues);
}

function extractGoldPhysicalInputs(goldCase: (typeof GOLD_STANDARD_CASES)[number]): Map<PhysicalDimension, number[]> {
  const merged: Record<string, number | string> = {
    ...((goldCase.input.issue as unknown as { measuredValues?: Record<string, number | string> }).measuredValues || {}),
    ...(goldCase.expectedCalculation || {}),
  };
  return collectPhysicalInputs(merged);
}

function physicalSimilarity(issue: IssueInput, goldCase: (typeof GOLD_STANDARD_CASES)[number]): { ratioPenalty: number; hardReject: boolean } {
  const issueInputs = extractPhysicalInputs(issue);
  const caseInputs = extractGoldPhysicalInputs(goldCase);
  if (issueInputs.size === 0 || caseInputs.size === 0) return { ratioPenalty: 1, hardReject: false };
  let compared = 0;
  let worstRatio = 1;
  for (const [dimension, issueValues] of issueInputs) {
    const caseValues = caseInputs.get(dimension);
    if (!caseValues?.length) continue;
    for (const issueValue of issueValues) {
      const nearestCaseValue = caseValues.reduce((nearest, caseValue) => {
        const ratio = Math.max(issueValue, caseValue) / Math.min(issueValue, caseValue);
        return ratio < nearest.ratio ? { ratio, caseValue } : nearest;
      }, { ratio: Number.POSITIVE_INFINITY, caseValue: caseValues[0] });
      compared += 1;
      worstRatio = Math.max(worstRatio, nearestCaseValue.ratio);
    }
  }
  if (compared === 0) return { ratioPenalty: 1, hardReject: false };
  if (worstRatio >= 100) return { ratioPenalty: 0, hardReject: true };
  if (worstRatio >= 10) return { ratioPenalty: 0.25, hardReject: false };
  if (worstRatio >= 3) return { ratioPenalty: 0.7, hardReject: false };
  return { ratioPenalty: 1, hardReject: false };
}

function scoreCase(issueText: string, caseText: string, categoryMatch: boolean, physicalPenalty = 1): number {
  const issueNormalized = normalize(issueText);
  const terms = buildTerms(caseText);
  let score = 0;
  for (const term of terms) {
    if (issueNormalized.includes(term)) score += term.length >= 4 ? 3 : 1;
  }
  if (categoryMatch) score += 4;
  return score * physicalPenalty;
}

export function findSimilarGoldCases(issue: IssueInput, limit = 2) {
  const issueText = [
    ...(issue.issueCategories || []),
    issue.requirement,
    issue.actualMeasurement,
    issue.testCondition,
    issue.environment,
    issue.failurePhenomenon,
    issue.engineeringConcern,
    issue.notes,
  ].filter(Boolean).join(' ');

  const issueNormalized = normalize(issueText);
  const categoryLabels = new Set((issue.issueCategories || []).map((c) => normalize(c)));

  return GOLD_STANDARD_CASES
    .map((item) => {
      const caseText = [
        item.title,
        item.category,
        item.input.issue.failurePhenomenon,
        item.expectedNextBestAction,
        item.expectedVerification,
        item.expectedPattern,
      ].filter(Boolean).join(' ');
      const categoryMatch = [...categoryLabels].some((c) => c && normalize(item.category).includes(c.split(' ')[0]));
      const physical = physicalSimilarity(issue, item);
      return {
        item,
        score: physical.hardReject ? -Infinity : scoreCase(issueNormalized, caseText, categoryMatch, physical.ratioPenalty),
      };
    })
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}

export function buildGroundingText(
  baseline: CopilotAnalysisResult,
  precomputedFacts: PrecomputedFact[],
  similarGoldCases: ReturnType<typeof findSimilarGoldCases>
): { baselineText: string; precomputedText: string; goldCaseText: string } {
  const baselineOutputs = baseline.analysisBasis?.calculatedOutputs || [];
  const evidenceByKey = new Map((baseline.analysisBasis?.calculatedOutputEvidence || []).map((item) => [item.key, item]));
  const baselineText = baselineOutputs.length
    ? baselineOutputs
        .map((value) => `- baseline.analysisBasis.calculatedOutputs:${value}`)
        .join('\n')
    : '（本地专家基线未生成额外结构化计算输出）';

  const evidenceText = [...evidenceByKey.values()]
    .map((item) => {
      const valueText = item.status === 'CALCULATED' && item.value !== undefined ? `${item.value} ${item.unit}` : 'INSUFFICIENT_INPUT';
      const missing = item.missingInputs.length ? ` | 缺失输入: ${item.missingInputs.join(', ')}` : '';
      return `- ${item.key} | ${item.title} = ${valueText} | source=${item.engine} | calculation=${item.calculation} | inputs=${item.inputs.join(', ')}${missing}`;
    })
    .join('\n');

  const precomputedText = precomputedFacts.length
    ? precomputedFacts
        .map((f) =>
          `- precomputed.${f.id} | 【${f.title}】${f.parameter} = ${f.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : `${f.calculatedValue} ${f.unit}`} | 状态: ${f.status || 'CALCULATED'} | 门限: ${f.specThreshold || 'N/A'} | 裕量: ${f.safetyMargin || 'N/A'} | 判定: ${f.complianceVerdict}\n  依据: ${f.formulaOrBasis}${f.inputs?.length ? `\n  输入: ${f.inputs.join(', ')}` : ''}${f.inputSources ? `\n  输入来源: ${JSON.stringify(f.inputSources)}` : ''}\n  ★ ${f.directiveForAi}`
        )
        .join('\n')
    : '（当前工况没有满足输入门槛的离散物理预计算，不得凭默认值虚构计算事实）';

  const groundedEvidenceText = evidenceText || '（暂无结构化计算结果证据条目）';

  const goldCaseText = similarGoldCases.length
    ? similarGoldCases
        .map((c) => `【Pattern 参考 ${c.expectedPattern} · ${c.caseId}】\n- 关键计算结论: ${JSON.stringify(c.expectedCalculation)}\n- VETO: ${c.expectedVeto ? 'YES' : 'NO'}\n- expectedNextBestAction: ${c.expectedNextBestAction}`)
        .join('\n\n')
    : '（未匹配到足够相似的金标准 Pattern，不强行 few-shot）';

  return { baselineText: `${groundedEvidenceText}\n${baselineText}`, precomputedText, goldCaseText };
}
