import { IssueInput, ProjectContext } from '../types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) acc[key] = canonicalize(child);
        return acc;
      }, {});
  }
  return value;
}

/**
 * 生成当前工程 context + issue 的稳定指纹。
 * 目的不是安全哈希，而是可靠识别“结果是否仍对应当前输入”。
 */
export function buildAnalysisInputFingerprint(context: ProjectContext, issue: IssueInput): string {
  const payload = JSON.stringify({ context: canonicalize(context), issue: canonicalize(issue) });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
