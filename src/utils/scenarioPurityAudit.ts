import { ProjectContext, IssueInput } from '../types';

export type ScenarioEvidenceSource = 'MEASURED' | 'SPEC' | 'CALCULATED' | 'CONTEXT' | 'ASSUMPTION' | 'REFERENCE' | 'UNKNOWN';

/**
 * 已知“历史案例指纹”：只收录足以唯一指向某个历史案例的内容（专属数值组合、人名、记录编号）。
 * 不收录 40V / 105℃ / 150℃ / 48MHz 这类任何工程都可能合法出现的通用数值——
 * 那样会把正常输入误报成泄漏，导致审计被迫放宽甚至被关掉。
 */
export const LEGACY_CASE_PATTERNS: RegExp[] = [
  /\b3800\s*rpm\b/i,          // BLDC 急停案例转速
  /\b37\.8\s*V\b/i,           // BLDC 急停母线泵升实测
  /\b41\.2\s*V\b/i,           // BLDC Worst Case 理论泵升
  /\b148\.5\s*℃/,             // BLDC Worst Case 结温
  /\b22\.16\s*J\b/i,          // TemplateContentNotice 模板示例能量
  /\b1360\s*pF\b/i,           // 模板示例电容
  /张工|李工|王工/,            // 历史案例中的固定责任人
  /REC-001/,                  // 历史决策记录编号
  /急停母线|急停.*泵升|泵升.*急停/, // BLDC 急停案例叙述
];

const toText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? ''));

/**
 * 在 value 中查找历史案例指纹。
 * 若传入 currentInput（当前 context + issue），则“当前输入里本来就有”的指纹不算泄漏——
 * 用户自己输入了 3800rpm，输出复述它是正常的；输出里凭空出现才是泄漏。
 */
export function findLegacyScenarioLeaks(value: unknown, currentInput?: unknown): string[] {
  const text = toText(value);
  const inputText = currentInput === undefined ? '' : toText(currentInput);
  return LEGACY_CASE_PATTERNS
    .filter((pattern) => pattern.test(text) && !(inputText && pattern.test(inputText)))
    .map(String);
}

export function assertCurrentScenarioEvidence(
  value: unknown,
  context: ProjectContext,
  issue: IssueInput,
): { clean: boolean; leaks: string[]; note: string } {
  const leaks = findLegacyScenarioLeaks(value, [context, issue]);
  const category = issue.issueCategories?.join('/') || '当前场景';
  return {
    clean: leaks.length === 0,
    leaks,
    note: leaks.length
      ? `检测到可能的历史案例痕迹。当前场景=${category}，项目=${context.projectName}；这些内容必须降级为 REFERENCE，不能作为当前事实。`
      : `当前输出未检测到已知历史案例指纹。当前场景=${category}。`,
  };
}
