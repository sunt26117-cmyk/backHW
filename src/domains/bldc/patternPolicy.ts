import type { PatternOutputItem, TraceInput, TraceNode } from '../../types';

export type BldcAnalysisStatus = 'READY' | 'ASSUMPTION_BASED' | 'INSUFFICIENT_INPUT';

function flatten(nodes: TraceNode[] = []): TraceNode[] {
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

function traceInputs(nodes: TraceNode[]): TraceInput[] {
  return flatten(nodes).flatMap((node) => node.inputs || []);
}

export function finalizeBldcPatternResult(result: PatternOutputItem): PatternOutputItem {
  if (result.patternKind === 'CHECKLIST') {
    return { ...result, analysisStatus: 'READY' };
  }

  const inputs = traceInputs(result.trace || []);
  const missingInputs = Array.from(new Set(
    inputs.filter((input) => typeof input.value === 'string' && /^(缺输入|未提供)$/.test(input.value))
      .map((input) => input.label),
  ));
  const assumedInputs = Array.from(new Set(
    inputs.filter((input) => input.source === 'ASSUMED_DEFAULT' || input.source === 'SPEC_CONSTANT' || input.source === 'TEXT_INFERRED')
      .map((input) => input.label),
  ));

  if (missingInputs.length > 0) {
    return {
      ...result,
      analysisStatus: 'INSUFFICIENT_INPUT',
      missingInputs,
      triggered: false,
      vetoTriggered: false,
      vetoReason: undefined,
      riskLevel: 'Low',
      confidence: 'LOW',
      evidenceType: 'UNKNOWN',
      calculatedValues: {
        ...result.calculatedValues,
        '分析状态': 'INSUFFICIENT_INPUT · 缺少形成确定性结论所需输入',
        '待补输入': missingInputs.join('、'),
      },
    };
  }

  if (assumedInputs.length > 0) {
    // B 策略：‘识别到模式’与‘证据足以确认风险/VETO’解耦。
    // ASSUMPTION_BASED 仍保留 pattern evaluator 原始 triggered 值，供候选方案/验证优先级使用；
    // 但任何 VETO 必须被压住，且证据等级降为 ENGINEERING_ASSUMPTION + LOW。
    return {
      ...result,
      analysisStatus: 'ASSUMPTION_BASED',
      missingInputs: undefined,
      vetoTriggered: false,
      vetoReason: undefined,
      confidence: 'LOW',
      evidenceType: 'ENGINEERING_ASSUMPTION',
      calculatedValues: {
        ...result.calculatedValues,
        '分析状态': 'ASSUMPTION_BASED · 当前结果含默认/推断输入；保留模式识别用于方案筛选/验证优先级，但不得作为已确认风险或 VETO',
        '假设/推断输入': assumedInputs.join('、'),
      },
    };
  }

  return { ...result, analysisStatus: 'READY', missingInputs: undefined };
}
