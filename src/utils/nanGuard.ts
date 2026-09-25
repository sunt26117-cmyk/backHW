/**
 * NaN 安全清洗（模式引擎返回值）
 *
 * 背景：输入派生层（deriveBldcEvaluationInput / deriveRobotJointEvaluationInput）在缺少实测/
 * 规格输入时，会把字段置为 NaN（而不是伪造一个默认值）。物理模式用这些 NaN 做加减乘除后，
 * 会在 calculatedValues / vetoReason 里产生 NaN 字符串，一旦渲染进 UI 或拼进 AI prompt，
 * 会让工程师误以为真有数值。本模块在引擎返回前统一清洗，把 NaN/Infinity 替换为明确的
 * 「缺输入」占位，同时保持 triggered / vetoTriggered 的布尔语义不变（NaN 参与比较天然为 false）。
 */

const UNKNOWN = '缺输入（未提供实测/规格，无法计算）';

function sanitizeText(v: string): string {
  return v.replace(/NaN/g, UNKNOWN).replace(/Infinity/g, UNKNOWN);
}

/**
 * 就地清洗单个模式输出：calculatedValues 里的非有限数字 → UNKNOWN；字符串里的 NaN/Infinity → UNKNOWN。
 * 返回原对象引用（原地修改），避免引入类型摩擦。
 */
export function sanitizePatternOutput<T>(p: T): T {
  const q = p as any;
  if (q && typeof q === 'object') {
    if (q.calculatedValues && typeof q.calculatedValues === 'object') {
      for (const k of Object.keys(q.calculatedValues)) {
        const v = q.calculatedValues[k];
        if (typeof v === 'number') {
          if (!Number.isFinite(v)) q.calculatedValues[k] = UNKNOWN;
        } else if (typeof v === 'string') {
          q.calculatedValues[k] = sanitizeText(v);
        }
      }
    }
    if (typeof q.vetoReason === 'string') q.vetoReason = sanitizeText(q.vetoReason);
    if (typeof q.corePhysicalChain === 'string') q.corePhysicalChain = sanitizeText(q.corePhysicalChain);
    if (Array.isArray(q.trace)) {
      const sanitizeTraceNode = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.value === 'number' && !Number.isFinite(node.value)) node.value = UNKNOWN;
        if (Array.isArray(node.inputs)) {
          node.inputs.forEach((input: any) => {
            if (typeof input?.value === 'number' && !Number.isFinite(input.value)) input.value = UNKNOWN;
            if (typeof input?.note === 'string') input.note = sanitizeText(input.note);
          });
        }
        if (Array.isArray(node.children)) node.children.forEach(sanitizeTraceNode);
      };
      q.trace.forEach(sanitizeTraceNode);
    }
  }
  return p;
}