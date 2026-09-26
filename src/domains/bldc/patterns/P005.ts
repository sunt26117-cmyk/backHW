import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP005(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P005: 死区过长→换相畸变 (Section 4)
  // ----------------------------------------------------
  const p005Assumptions: string[] = [];
  const pwmFreqHz = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  if (input.pwmSwitchingFreqHz === undefined) p005Assumptions.push('PWM开关频率未提供，假设20kHz');
  const diodeVf = input.diodeForwardVoltageV !== undefined ? input.diodeForwardVoltageV : 1.0;
  if (input.diodeForwardVoltageV === undefined) p005Assumptions.push('体二极管压降未提供，假设1.0V');
  const modulationIndex = input.modulationIndex !== undefined ? input.modulationIndex : 1.0;
  if (input.modulationIndex === undefined) p005Assumptions.push('调制比m未提供，假设m=1.0（低速工况m更小，本估算在低速下会低估相对畸变占比）');
  const pwmPeriodNs = (1 / pwmFreqHz) * 1e9;
  const deadTimeRatio = (input.deadTimeNs / pwmPeriodNs) * 100;
  const p005Triggered = input.deadTimeNs >= 600 || deadTimeRatio >= 1.2;
  // [FIX] 用体二极管压降的加性项替代原来"1.2×比例×Vbus"这个说不出依据的乘性系数；
  // 并按调制比折算相对基波电压的占比（m越小，同样的ΔV占比越大，低速工况更严重）。
  const deadTimeVoltageErrorV = (input.deadTimeNs / pwmPeriodNs) * diodeVf;
  const fundamentalVoltageV = ctx.vbusNominalSafe * modulationIndex;
  const deadTimeErrorRelativePct = fundamentalVoltageV > 0 ? (deadTimeVoltageErrorV / fundamentalVoltageV) * 100 : 0;

  const p005CalculatedValues: Record<string, string | number> = {
    '死区占PWM周期比例 (%)': Number(deadTimeRatio.toFixed(2)),
    '死区引起的基波电压误差(加性项) ΔV (V)': Number(deadTimeVoltageErrorV.toFixed(3)),
    '当前调制比下的基波电压 (V)': Number(fundamentalVoltageV.toFixed(1)),
    'ΔV 相对基波电压占比 (%，低速/低调制比时该值会显著增大)': Number(deadTimeErrorRelativePct.toFixed(2)),
  };
  pushAssumptionNote(p005CalculatedValues, p005Assumptions);

  const p005Trace = makeTraceNode({
    id: 'bldcPattern:P005.deadTimeDistortion',
    title: '死区引起的相电压误差占比',
    value: traceValue(deadTimeErrorRelativePct),
    unit: '%',
    inputs: [
      makeTraceInput('deadTimeNs', '死区时间', traceValue(input.deadTimeNs), traceSource(input, 'deadTimeNs'), 'ns', undefined, traceEvidenceId(input, 'deadTimeNs')),
      makeTraceInput('pwmSwitchingFreqHz', 'PWM开关频率', pwmFreqHz, traceSource(input, 'pwmSwitchingFreqHz', input.pwmSwitchingFreqHz === undefined), 'Hz', input.pwmSwitchingFreqHz === undefined ? '未提供，假设20kHz' : undefined, traceEvidenceId(input, 'pwmSwitchingFreqHz')),
      makeTraceInput('diodeForwardVoltageV', '体二极管正向压降', diodeVf, traceSource(input, 'diodeForwardVoltageV', input.diodeForwardVoltageV === undefined), 'V', input.diodeForwardVoltageV === undefined ? '未提供，假设1.0V' : undefined, traceEvidenceId(input, 'diodeForwardVoltageV')),
      makeTraceInput('vbusNominal', '母线标称电压', ctx.vbusNominalSafe, traceSource(input, 'vbusNominal', ctx.vbusNominalWasAssumed), 'V', ctx.vbusNominalWasAssumed ? '未提供，按13.5V假设' : undefined, traceEvidenceId(input, 'vbusNominal')),
      makeTraceInput('modulationIndex', '调制比 m', modulationIndex, traceSource(input, 'modulationIndex', input.modulationIndex === undefined), undefined, input.modulationIndex === undefined ? '未提供，假设m=1.0；低调制比时相对误差会被放大' : undefined, traceEvidenceId(input, 'modulationIndex')),
    ],
    formula: 'ΔV = (DeadTime / PWM Period)·Vf；Relative Error = ΔV / (Vbus·m)',
    standardRef: 'PWM dead-time compensation design；相电压非线性误差预算',
    threshold: { value: 5, unit: '%', label: '相对基波电压误差关注阈值' },
    verdict: deadTimeErrorRelativePct >= 5 ? 'MARGINAL' : 'PASS',
  });

  return {
    id: 'P005',
    name: '死区过长→低转速相电流与换相畸变 (Excessive Dead-Time Commutation Distortion)',
    triggered: p005Triggered,
    corePhysicalChain: '死区时间过大 → 寄生体二极管导通时间过长 → 输出相电压非线性压降误差 → 相对基波电压(随调制比/转速下降而减小)的占比在低速时被放大 → 低速过零畸变、转矩脉动与效率降低',
    calculatedValues: p005CalculatedValues,
    trace: [p005Trace],
    riskLevel: p005Triggered || deadTimeErrorRelativePct > 5 ? 'Medium' : 'Low',
    confidence: p005Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '实施死区非线性补偿算法 (Dead-time Compensation)，基于电流极性实时微调 PWM 占空比',
      '在兼顾直通安全的前提下将死区压缩至满足P004最坏工况裕量的最小值',
    ],
    sideEffects: ['补偿算法需要极高精度的相电流过零点极性检测，轻载时易发生噪声扰动误判'],
    verificationItems: ['电流钳捕获低转速(低调制比)稳态运行时的相电流正弦度 THD 与转矩纹波传感器波形，与本模型按不同调制比的估算值对比'],
    unknownsToTest: ['电机本体齿槽转矩与死区畸变转矩脉动的相位叠加效应'],
  }
}
