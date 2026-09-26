import type { TraceInputSource, TraceInput, TraceNode } from '../../types';
import type { BldcEvaluationInput } from './types';
import { makeTraceInput, makeTraceNode } from '../../utils/trace';

export function traceSource(input: BldcEvaluationInput, key: string, assumed = false): TraceInputSource {
  return assumed ? 'ASSUMED_DEFAULT' : (input.traceSources?.[key] || 'USER_INPUT');
}

export function traceEvidenceId(input: BldcEvaluationInput, key: string): string | undefined {
  return input.traceEvidenceIds?.[key];
}

export function traceValue(value: number | undefined): number | string {
  return value !== undefined && Number.isFinite(value) ? value : '缺输入';
}

export function traceVerdict(
  critical: boolean,
  value: number | undefined,
  threshold: number | undefined,
  marginalRatio = 0.8,
): TraceNode['verdict'] {
  if (critical) return 'CRITICAL';
  if (Number.isFinite(value) && Number.isFinite(threshold) && (value as number) >= (threshold as number) * marginalRatio) return 'MARGINAL';
  return 'PASS';
}

export function pushAssumptionNote(
  calculatedValues: Record<string, string | number>,
  log: string[],
): void {
  if (log.length > 0) {
    calculatedValues['⚠ 使用的假设默认值(未提供实测/器件参数，仅供数量级参考，不应单独支撑一票否决)'] = log.join('；');
  }
}

export function makeLogicalTraceNode(args: {
  id: string;
  title: string;
  value: string;
  inputs: TraceInput[];
  formula: string;
  standardRef?: string;
  verdict: TraceNode['verdict'];
  degradedOverride?: boolean;
}): TraceNode {
  const node = makeTraceNode({
    id: args.id,
    title: args.title,
    value: args.value,
    inputs: args.inputs,
    formula: args.formula,
    standardRef: args.standardRef,
    verdict: args.verdict,
  });
  return args.degradedOverride === undefined ? node : { ...node, degraded: args.degradedOverride };
}

export { makeTraceInput, makeTraceNode };
