import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP004(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P004: 死区过短→直通 (Section 4)
  // ----------------------------------------------------
  const p004Assumptions: string[] = [];
  const need = (v: number | undefined, fb: number, label: string): number => {
    if (v === undefined) { p004Assumptions.push(label); return fb; }
    return v;
  };
  const turnOffDelayTyp = need(input.turnOffDelayNs, 35, 't_d(off)典型值未提供，假设35ns');
  const turnOffDelayMax = need(input.turnOffDelayMaxNs, turnOffDelayTyp * 1.5, 't_d(off)最坏值未提供，假设为典型值×1.5');
  const fallTimeTyp = need(input.fallTimeNs, 20, 't_f典型值未提供，假设20ns');
  const fallTimeMax = need(input.fallTimeMaxNs, fallTimeTyp * 1.6, 't_f最坏值未提供，假设为典型值×1.6');
  const driverPropMismatchTyp = need(input.driverPropMismatchNs, 25, '驱动传输延迟失配典型值未提供，假设25ns');
  const driverPropMismatchMax = need(input.driverPropMismatchMaxNs, driverPropMismatchTyp * 1.4, '驱动传输延迟失配最坏值未提供，假设为典型值×1.4');
  // [FIX] 对管在自己的 t_d(on) 结束前不会导通，严格判据应减去 t_d(on)；此处无该输入时不做减项，
  // 结果因此偏保守（比真实需求略高），已在说明中注明方向。
  const deadTimeRequiredTyp = turnOffDelayTyp + fallTimeTyp + driverPropMismatchTyp;
  const deadTimeRequiredWorst = turnOffDelayMax + fallTimeMax + driverPropMismatchMax;
  const deadTimeMarginTyp = input.deadTimeNs - deadTimeRequiredTyp;
  const deadTimeMarginWorst = input.deadTimeNs - deadTimeRequiredWorst;
  const p004Veto = deadTimeMarginWorst < 0;

  const p004CalculatedValues: Record<string, string | number> = {
    '当前设定死区时间 DeadTime (ns)': input.deadTimeNs,
    '典型所需最小死区 (典型值) (ns)': Number(deadTimeRequiredTyp.toFixed(0)),
    '最坏工况死区需求 (Worst-Case，未扣除t_d(on)，结果偏保守) (ns)': Number(deadTimeRequiredWorst.toFixed(0)),
    '典型死区裕量 Typical Margin (ns)': Number(deadTimeMarginTyp.toFixed(0)),
    '最坏工况死区裕量 Worst-Case Margin (ns)': Number(deadTimeMarginWorst.toFixed(0)),
  };
  pushAssumptionNote(p004CalculatedValues, p004Assumptions);

  const p004Trace = makeTraceNode({
    id: 'bldcPattern:P004.deadTimeMargin',
    title: '最坏工况所需死区与当前死区裕量',
    value: traceValue(deadTimeMarginWorst),
    unit: 'ns',
    inputs: [
      makeTraceInput('deadTimeNs', '当前设定死区时间', traceValue(input.deadTimeNs), traceSource(input, 'deadTimeNs'), 'ns', undefined, traceEvidenceId(input, 'deadTimeNs')),
      makeTraceInput('turnOffDelayMaxNs', '关断延迟最坏值', turnOffDelayMax, traceSource(input, 'turnOffDelayMaxNs', input.turnOffDelayMaxNs === undefined), 'ns', input.turnOffDelayMaxNs === undefined ? '未提供，假设典型值×1.5' : undefined, traceEvidenceId(input, 'turnOffDelayMaxNs')),
      makeTraceInput('fallTimeMaxNs', '下降时间最坏值', fallTimeMax, traceSource(input, 'fallTimeMaxNs', input.fallTimeMaxNs === undefined), 'ns', input.fallTimeMaxNs === undefined ? '未提供，假设典型值×1.6' : undefined, traceEvidenceId(input, 'fallTimeMaxNs')),
      makeTraceInput('driverPropMismatchMaxNs', '驱动传播延迟失配最坏值', driverPropMismatchMax, traceSource(input, 'driverPropMismatchMaxNs', input.driverPropMismatchMaxNs === undefined), 'ns', input.driverPropMismatchMaxNs === undefined ? '未提供，假设典型值×1.4' : undefined, traceEvidenceId(input, 'driverPropMismatchMaxNs')),
    ],
    formula: 'DeadTime Margin = DeadTime − (t_d(off,max) + t_f,max + PropagationMismatch,max)',
    standardRef: '驱动器传播延迟/功率MOSFET关断时序 datasheet；项目死区设计规范',
    threshold: { value: 0, unit: 'ns', label: '最坏死区裕量边界' },
    verdict: p004Veto && p004Assumptions.length === 0 ? 'CRITICAL' : (deadTimeMarginWorst < 40 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P004',
    name: '死区过短→桥臂瞬态直通风险 (Dead-Time Too Short: Shoot-Through)',
    triggered: input.deadTimeNs <= 200,
    corePhysicalChain: '死区设置过小 → 上下管关断延迟未完全结束即开启对管 → 半桥瞬态直通 → 脉冲短路电流击穿MOSFET',
    calculatedValues: p004CalculatedValues,
    trace: [p004Trace],
    riskLevel: p004Veto ? 'High' : (deadTimeMarginWorst < 40 ? 'Medium-High' : 'Low'),
    confidence: p004Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p004Veto && p004Assumptions.length === 0,
    vetoReason: p004Veto
      ? (p004Assumptions.length === 0
        ? `在高温 125℃ 及驱动传输延迟容差下，最坏死区需求 (${deadTimeRequiredWorst.toFixed(0)}ns) 已超过当前设定 (${input.deadTimeNs}ns)，存在硬直通炸机风险！`
        : `基于假设参数估算的最坏死区需求 (${deadTimeRequiredWorst.toFixed(0)}ns) 已超过当前设定 (${input.deadTimeNs}ns)，但关键时序参数为假设值而非实测/datasheet，暂不作为一票否决，请先补齐实测数据复核`)
      : undefined,
    candidateMeasures: [
      '在 MCU PWM 寄存器中将互补通道死区时间由 100ns 增大至 250ns~350ns',
      '优化门极驱动器开通/关断独立通道，减小功率管关断延迟',
      '实测 t_d(off)/t_f/驱动传输延迟失配在 -40~125℃ 全温区的真实值，替换本模型的假设参数',
    ],
    sideEffects: ['死区过大会引起低转速与过零点相电流畸变、转矩脉动增大及五次/七次谐波，参见P005'],
    verificationItems: ['示波器通道 1/2 分别接入上管与下管 Vgs 驱动信号，光隔离差分捕获死区过渡波形，在 -40/25/125℃ 各测一组，直接标定六个时序参数'],
    unknownsToTest: ['驱动芯片高低温全温区传播延迟匹配性 (Propagation Delay Mismatch Spec)'],
  }
}
