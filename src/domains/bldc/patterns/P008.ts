import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP008(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P008: 长线束→EMI/振铃 (Section 4)
  // ----------------------------------------------------
  const p008Assumptions: string[] = [];
  const harnessLength = input.harnessLengthM !== undefined && input.harnessLengthM > 0 ? input.harnessLengthM : 1.8;
  if (!Number.isFinite(input.harnessLengthM) || input.harnessLengthM <= 0) p008Assumptions.push('线束长度未提供，假设1.8m');
  const harnessInductanceUh = harnessLength * 1.2; // 1.2uH/m，回路几何假设，需结合去回线间距核实
  // [FIX] 缺线束长度输入时 harnessLength 缺省 1.8m，天然 >=1.2m 阈值会让几乎所有未填线束的 case
  // 触发。现在只有当工程师显式提供了线束长度(Number.isFinite 且 >0)且确实 >=1.2m 时才触发，
  // 与 P013/P014 的"缺输入不触发"口径一致。
  const p008Triggered = Number.isFinite(input.harnessLengthM) && input.harnessLengthM > 0 && harnessLength >= 1.2;
  // [FIX-5] 谐振频率原来是与线束长度完全脱节的字面量(48.5MHz)。现在真正由估算电感
  // 与寄生电容算出：f = 1/(2π√(L·C))。寄生电容未知时给出典型量级假设并标注。
  const parasiticCapPf = input.parasiticCapPf !== undefined ? input.parasiticCapPf : 100;
  if (input.parasiticCapPf === undefined) p008Assumptions.push('回路寄生电容未提供，假设100pF(典型量级，实际取决于开关节点铜箔面积与布局)');
  const fRingHz = (1 / (2 * Math.PI * Math.sqrt(harnessInductanceUh * 1e-6 * parasiticCapPf * 1e-12)));
  const fRingMHz = fRingHz / 1e6;

  const p008CalculatedValues: Record<string, string | number> = {
    '线束总长度 (m)': harnessLength,
    '推算线束寄生电感 L_harness (μH，假设1.2μH/m回路几何)': Number(harnessInductanceUh.toFixed(2)),
    '回路寄生电容估算 (pF)': parasiticCapPf,
    '高频谐振频率估计 f_ring (MHz，由 L/C 计算得出，非固定值)': Number(fRingMHz.toFixed(1)),
    '48MHz频段传导骚扰超标幅度': '⚠ 需要实测/仿真频谱数据才能给出裕量，不提供编造的dB数字',
  };
  pushAssumptionNote(p008CalculatedValues, p008Assumptions);

  const p008Trace = makeTraceNode({
    id: 'bldcPattern:P008.resonanceFrequency',
    title: '线束寄生 LC 谐振频率',
    value: traceValue(fRingMHz),
    unit: 'MHz',
    inputs: [
      makeTraceInput('harnessLengthM', '线束总长度', harnessLength, traceSource(input, 'harnessLengthM', !Number.isFinite(input.harnessLengthM) || input.harnessLengthM <= 0), 'm', (!Number.isFinite(input.harnessLengthM) || input.harnessLengthM <= 0) ? '未提供，假设1.8m' : undefined, traceEvidenceId(input, 'harnessLengthM')),
      makeTraceInput('harnessInductancePerM', '单位长度回路电感', 1.2, 'ASSUMED_DEFAULT', 'μH/m', '当前模型的几何经验假设；应通过线束结构/实测校正'),
      makeTraceInput('parasiticCapPf', '回路寄生电容', parasiticCapPf, traceSource(input, 'parasiticCapPf', input.parasiticCapPf === undefined), 'pF', input.parasiticCapPf === undefined ? '未提供，假设100pF' : undefined, traceEvidenceId(input, 'parasiticCapPf')),
    ],
    formula: 'L_harness≈1.2μH/m·Length；f_ring=1/(2π√(L·C))',
    standardRef: 'CISPR 25 频谱预扫描；实际线束/PCB寄生参数应由结构与实测校正',
    threshold: { value: 1.2, unit: 'm', label: '当前 Pattern 适用性线束长度阈值' },
    verdict: p008Triggered ? 'MARGINAL' : 'INFO',
  });

  return {
    id: 'P008',
    name: '长线束→EMI高频谐振与辐射超标 (Harness Parasitic Inductance & Common-Mode EMI)',
    triggered: p008Triggered,
    corePhysicalChain: 'EMC Root Cause Tree: Source(开关节点高频dv/dt谐波) → Coupling(线束寄生电感L与对地杂散电容C) → Path(长供电线束成为发射天线) → Victim(车载FM/DAB天线CISPR 25 Class 5超标)',
    calculatedValues: p008CalculatedValues,
    trace: [p008Trace],
    riskLevel: p008Triggered ? 'Medium-High' : 'Low',
    confidence: p008Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '在电源线束根部卡装高性能纳米晶/镍锌共模磁环 (抑制 30MHz~100MHz 频段)',
      '功率开关节点并联 RC Snubber 抑制估算谐振频率附近的高频振铃，参数按 C_snub≈(3~5)×Coss、R=√(L_loop/C_snub) 计算而非直接套用固定值',
      '开启 MCU PWM 扩频调制 (Spread Spectrum Clock Generation, SSCG ±2.5%)',
    ],
    sideEffects: ['磁环增加结构装配工时与物料成本；RC Snubber 增加单相约 0.25W 静态吸收损耗'],
    verificationItems: [
      '近场探头+频谱仪先做预扫描，实测真实振铃频率，与本模型估算值核对，校正线束电感假设(1.2μH/m)与寄生电容假设(100pF)',
      '标准电波暗室中按 CISPR 25 Class 5 规范测试 150kHz~108MHz 人工电源网络传导发射，取得真实超标裕量后再评估对策',
    ],
    unknownsToTest: ['实车车身接地钣金与控制器金属外壳之间的搭铁接触阻抗 (< 5mΩ)', '开关节点实际铜箔面积对回路寄生电容的真实贡献'],
  }
}
