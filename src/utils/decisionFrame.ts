/**
 * decisionFrame 边界归一化（健壮性收口）
 *
 * 背景：decisionFrame 的 minimumEvidenceToProceed / unknownsBlockingDecision / reversalCriteria
 * 在 schema 里声明为 string[]，但云端大模型或离线 AI 回灌的 JSON 经常把数组返回成一个字符串
 * （例如 "当母线电压超过 60V 且 dv/dt > 30V/ns 时"）。
 * 字符串有 .slice() 但没有 .join() / .map()，于是 UI 端一渲染就抛
 *   TypeError: xxx.reversalCriteria.slice(...).join is not a function
 * 导致整个分析结果页白屏。
 *
 * 这里把所有可能畸形的位置（AI 导入、服务端合并、缓存回读）统一在边界处归一化，
 * 保证任何进入 UI 的 decisionFrame 都满足 string[] 契约。
 */

/** 把任意值安全地规范成 string[]（字符串按中英文分号/换行拆分，空值→[]） */
export function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .flat(3)
      .map((v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        try { return JSON.stringify(v); } catch { return String(v); }
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    const parts = text.split(/[；;\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    return parts.length > 0 ? parts : [text];
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  try { return [JSON.stringify(value)]; } catch { return [String(value)]; }
}

export interface DecisionFrameShape {
  decisionQuestion: string;
  currentDecisionGate: string;
  decisionWindow: string;
  bestNextAction: string;
  minimumEvidenceToProceed: string[];
  unknownsBlockingDecision: string[];
  reversalCriteria: string[];
}

/** 取第一个非空数组，否则回落默认值 */
function nonEmptyArray(primary: string[], fallback: string[]): string[] {
  return primary.length > 0 ? primary : fallback;
}

function pickText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/**
 * 归一化 decisionFrame：
 *  - 整体非对象 → 用 defaults 整体兜底
 *  - 文本字段缺失/非字符串 → defaults
 *  - 三个数组字段：字符串→单元素数组（含分隔符则拆分）、非数组→数组、空数组→defaults
 *  - 对已经合规的对象幂等（可重复调用）
 */
export function normalizeDecisionFrame(raw: unknown, defaults: DecisionFrameShape): DecisionFrameShape {
  const df: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    decisionQuestion: pickText(df.decisionQuestion, defaults.decisionQuestion),
    currentDecisionGate: pickText(df.currentDecisionGate, defaults.currentDecisionGate),
    decisionWindow: pickText(df.decisionWindow, defaults.decisionWindow),
    bestNextAction: pickText(df.bestNextAction, defaults.bestNextAction),
    minimumEvidenceToProceed: nonEmptyArray(toStringArray(df.minimumEvidenceToProceed), defaults.minimumEvidenceToProceed),
    unknownsBlockingDecision: nonEmptyArray(toStringArray(df.unknownsBlockingDecision), defaults.unknownsBlockingDecision),
    reversalCriteria: nonEmptyArray(toStringArray(df.reversalCriteria), defaults.reversalCriteria),
  };
}
