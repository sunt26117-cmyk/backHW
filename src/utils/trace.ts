import { MeasurementSource, TraceInput, TraceInputSource, TraceNode } from '../types';

export function makeTraceInput(
  key: string,
  label: string,
  value: number | string,
  source: TraceInputSource,
  unit?: string,
  note?: string,
  evidenceId?: string,
): TraceInput {
  return { key, label, value, source, ...(unit ? { unit } : {}), ...(note ? { note } : {}), ...(evidenceId ? { evidenceId } : {}) };
}

export function anyAssumed(inputs: TraceInput[]): boolean {
  return inputs.some((i) => i.source === 'ASSUMED_DEFAULT' || i.source === 'SPEC_CONSTANT' || i.source === 'TEXT_INFERRED');
}

export function makeTraceNode(partial: Omit<TraceNode, 'degraded'>): TraceNode {
  return { ...partial, degraded: anyAssumed(partial.inputs) };
}

export function mapMeasurementSourceToTraceSource(source?: MeasurementSource): TraceInputSource {
  switch (source) {
    case 'IMPORTED': return 'IMPORTED';
    case 'SPEC': return 'SPEC_CONSTANT';
    case 'ASSUMPTION': return 'ASSUMED_DEFAULT';
    case 'USER_MEASURED': return 'MEASURED';
    case 'BENCHMARK': return 'ASSUMED_DEFAULT';
    case 'CONTEXT': return 'USER_INPUT';
    case 'CALCULATED': return 'USER_INPUT';
    case 'DERIVED': return 'DERIVED';
    case 'DATASHEET': return 'DATASHEET';
    case 'TEXT_INFERRED': return 'TEXT_INFERRED';
    default: return 'USER_INPUT';
  }
}

export function flattenTraceNodes(nodes: TraceNode[] = []): TraceNode[] {
  const out: TraceNode[] = [];
  const visit = (items: TraceNode[]) => {
    for (const node of items) {
      out.push(node);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(nodes);
  return out;
}

export function filterTraceNodes(
  nodes: TraceNode[],
  options: { degradedOnly?: boolean; verdicts?: TraceNode['verdict'][] } = {},
): TraceNode[] {
  const verdictSet = options.verdicts?.length ? new Set(options.verdicts) : undefined;
  return flattenTraceNodes(nodes).filter((node) => {
    if (options.degradedOnly && !node.degraded) return false;
    if (verdictSet && (!node.verdict || !verdictSet.has(node.verdict))) return false;
    return true;
  });
}

export function traceSourceLabel(source: TraceInputSource): string {
  switch (source) {
    case 'MEASURED': return '实测';
    case 'IMPORTED': return '导入';
    case 'USER_INPUT': return '用户输入';
    case 'ASSUMED_DEFAULT': return '假设值';
    case 'SPEC_CONSTANT': return '规格/常量';
    case 'DATASHEET': return '规格书';
    case 'TEXT_INFERRED': return '文本推断';
    case 'DERIVED': return '推导值';
  }
}

export function traceVerdictLabel(verdict?: TraceNode['verdict']): string {
  switch (verdict) {
    case 'PASS': return 'PASS';
    case 'MARGINAL': return '边界';
    case 'FAIL': return 'FAIL';
    case 'CRITICAL': return 'CRITICAL';
    case 'INFO': return '信息';
    default: return '未定义';
  }
}
