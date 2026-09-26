import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP016(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P016: 过流/短路保护响应时间 ↔ SOA (重点新增模块 4.1)
  // ----------------------------------------------------
  const p016Assumptions: string[] = [];
  const nsOrAssume = (v: number | undefined, fb: number, label: string): number => {
    if (v === undefined) { p016Assumptions.push(label); return fb; }
    return v;
  };
  const senseDelayNs = nsOrAssume(input.senseDelayNsOverride, 80, '电流检测延迟未提供，假设80ns');
  const compDelayNs = nsOrAssume(input.compDelayNsOverride, 120, '比较器响应时间未提供，假设120ns');
  const digitalFilterDelayNs = nsOrAssume(input.digitalFilterDelayNsOverride, 150, '数字滤波消抖时间未提供，假设150ns');
  const driverPropDelayNs = nsOrAssume(input.driverPropDelayNsOverride, 100, '预驱传播延迟未提供，假设100ns');
  const gateTurnOffDelayNs = nsOrAssume(input.gateTurnOffDelayNsOverride, 220, '门极关断延迟未提供，假设220ns');
  const currentFallDelayNs = nsOrAssume(input.currentFallDelayNsOverride, 180, '电流衰减时间未提供，假设180ns');
  const faultToOffTimeNs =
    senseDelayNs + compDelayNs + digitalFilterDelayNs + driverPropDelayNs + gateTurnOffDelayNs + currentFallDelayNs;
  const faultToOffTimeUs = faultToOffTimeNs / 1000;
  // [说明] 低压车规 MOSFET 的 datasheet 通常不给"短路耐受时间"这一指标(那是IGBT/SiC常见规格)；
  // 12~48V硬短路场景更严谨的判据是 SOA 曲线上的 Vds·Id·t 或雪崩能量 E_AS，这里的固定值
  // 仅作数量级参考，务必用实际器件的SOA曲线复核。
  const soaTimeAssumed = input.soaShortCircuitTimeUsOverride === undefined;
  if (soaTimeAssumed) p016Assumptions.push('MOSFET SOA短路耐受时间未提供且低压MOSFET datasheet通常不直接给出此参数，假设2.5μs仅供数量级参考，请改用SOA能量法(Vds·Id·t 或 E_AS)复核');
  const mosfetSoaShortCircuitTimeUs = input.soaShortCircuitTimeUsOverride !== undefined ? input.soaShortCircuitTimeUsOverride : 2.5;
  const timingMarginUs = mosfetSoaShortCircuitTimeUs - faultToOffTimeUs;
  const p016Veto = timingMarginUs <= 0;

  // 短路能量法复核（替代/补充假的"短路耐受时间"）：E_fault = Vbus · Id · t_fault
  // 注意：短路电流通常远高于运行峰值电流，此处用 currentPeakA 是能量下界估算，超了必然更危险。
  const p016ShortCircuitCurrentA = input.currentPeakA !== undefined && Number.isFinite(input.currentPeakA) ? input.currentPeakA : 25;
  const p016FaultEnergyMj = ctx.vbusNominalSafe * p016ShortCircuitCurrentA * faultToOffTimeUs / 1000; // V·A·μs/1000 = mJ
  const p016HasEas = input.easEnergyMj !== undefined && input.easEnergyMj > 0;
  const p016EnergyExceeds = p016HasEas && p016FaultEnergyMj > (input.easEnergyMj as number);

  const p016CalculatedValues: Record<string, string | number> = {
    '电流检测与运放延迟 (ns)': senseDelayNs,
    '硬件比较器响应时间 (ns)': compDelayNs,
    '抗干扰数字滤波消抖时间 (ns)': digitalFilterDelayNs,
    '预驱芯片传播延迟 (ns)': driverPropDelayNs,
    '门极关断放电延迟 (ns)': gateTurnOffDelayNs,
    '电流完全衰减切断时间 (ns)': currentFallDelayNs,
    '整条保护链全关闭时间 Fault-to-Off Time (μs)': Number(faultToOffTimeUs.toFixed(3)),
    [soaTimeAssumed ? '⚠ MOSFET 短路耐受时间(假设值，低压器件通常无此datasheet指标) (μs)' : 'MOSFET SOA 额定极限短路耐受时间 (μs)']: mosfetSoaShortCircuitTimeUs,
    '时序安全裕量 Timing Margin (μs)': Number(timingMarginUs.toFixed(3)),
    '短路能量估算 E_fault (mJ，能量下界，短路电流会更高)': Number(p016FaultEnergyMj.toFixed(3)),
    [p016HasEas ? '器件单脉冲雪崩能量 E_AS (mJ)' : '⚠ 数据缺口：器件未提供 E_AS']: p016HasEas ? (input.easEnergyMj as number) : '未提供，无法做能量预算复核',
  };
  pushAssumptionNote(p016CalculatedValues, p016Assumptions);

  const p016Trace = makeTraceNode({
    id: 'bldcPattern:P016.faultToOffTime',
    title: '保护链 Fault-to-Off 总时间',
    value: traceValue(faultToOffTimeUs),
    unit: 'μs',
    inputs: [
      makeTraceInput('senseDelayNs', '电流检测延迟', senseDelayNs, traceSource(input, 'senseDelayNs', input.senseDelayNsOverride === undefined), 'ns', input.senseDelayNsOverride === undefined ? '未提供，假设80ns' : undefined, traceEvidenceId(input, 'senseDelayNs')),
      makeTraceInput('compDelayNs', '比较器响应时间', compDelayNs, traceSource(input, 'compDelayNs', input.compDelayNsOverride === undefined), 'ns', input.compDelayNsOverride === undefined ? '未提供，假设120ns' : undefined, traceEvidenceId(input, 'compDelayNs')),
      makeTraceInput('digitalFilterDelayNs', '数字滤波消抖', digitalFilterDelayNs, traceSource(input, 'digitalFilterDelayNs', input.digitalFilterDelayNsOverride === undefined), 'ns', input.digitalFilterDelayNsOverride === undefined ? '未提供，假设150ns' : undefined, traceEvidenceId(input, 'digitalFilterDelayNs')),
      makeTraceInput('driverPropDelayNs', '预驱传播延迟', driverPropDelayNs, traceSource(input, 'driverPropDelayNs', input.driverPropDelayNsOverride === undefined), 'ns', input.driverPropDelayNsOverride === undefined ? '未提供，假设100ns' : undefined, traceEvidenceId(input, 'driverPropDelayNs')),
      makeTraceInput('gateTurnOffDelayNs', '门极关断延迟', gateTurnOffDelayNs, traceSource(input, 'gateTurnOffDelayNs', input.gateTurnOffDelayNsOverride === undefined), 'ns', input.gateTurnOffDelayNsOverride === undefined ? '未提供，假设220ns' : undefined, traceEvidenceId(input, 'gateTurnOffDelayNs')),
      makeTraceInput('currentFallDelayNs', '电流衰减时间', currentFallDelayNs, traceSource(input, 'currentFallDelayNs', input.currentFallDelayNsOverride === undefined), 'ns', input.currentFallDelayNsOverride === undefined ? '未提供，假设180ns' : undefined, traceEvidenceId(input, 'currentFallDelayNs')),
      makeTraceInput('soaShortCircuitTimeUs', 'MOSFET SOA 短路耐受时间', mosfetSoaShortCircuitTimeUs, traceSource(input, 'soaShortCircuitTimeUs', soaTimeAssumed), 'μs', soaTimeAssumed ? '低压 MOSFET 通常不直接给该指标；2.5μs仅为数量级假设，应回到实际 SOA 曲线' : undefined, traceEvidenceId(input, 'soaShortCircuitTimeUs')),
      makeTraceInput('vbusNominal', '母线标称电压', ctx.vbusNominalSafe, traceSource(input, 'vbusNominal', ctx.vbusNominalWasAssumed), 'V', ctx.vbusNominalWasAssumed ? '未提供，按13.5V假设用于能量下界' : undefined, traceEvidenceId(input, 'vbusNominal')),
      makeTraceInput('currentPeakA', '运行峰值电流（能量下界）', p016ShortCircuitCurrentA, traceSource(input, 'currentPeakA', !Number.isFinite(input.currentPeakA)), 'A', !Number.isFinite(input.currentPeakA) ? '缺失时按25A，仅作能量下界，不代表真实短路电流' : undefined, traceEvidenceId(input, 'currentPeakA')),
      ...(p016HasEas ? [makeTraceInput('easEnergyMj', '器件单脉冲雪崩能量 E_AS', input.easEnergyMj!, traceSource(input, 'easEnergyMj'), 'mJ', undefined, traceEvidenceId(input, 'easEnergyMj'))] : [makeTraceInput('easEnergyMj', '器件单脉冲雪崩能量 E_AS', '未提供', 'USER_INPUT', 'mJ', '没有 E_AS，无法完成能量预算复核')]),
    ],
    formula: 't_fault→off = t_sense+t_comp+t_filter+t_driver+t_gate+t_fall；E_fault≈Vbus·I·t',
    standardRef: '实际器件 SOA / E_AS 数据手册；保护链实测时序',
    threshold: { value: mosfetSoaShortCircuitTimeUs, unit: 'μs', label: 'SOA/短路耐受时间边界' },
    verdict: ((p016Veto && !soaTimeAssumed) || p016EnergyExceeds) ? 'CRITICAL' : (timingMarginUs < 1.0 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P016',
    name: '过流/短路保护响应时间时序 ↔ MOSFET SOA 安全区匹配 (Fault-to-Off Timing vs SOA)',
    triggered: timingMarginUs < 1.0 || p016Veto || p016EnergyExceeds,
    corePhysicalChain: 'Fault occurs → Current rises → Sense delay → Comparator/ADC delay → Digital delay → Driver propagation delay → Gate turn-off → 电流衰减。低压MOSFET更严谨的判据是SOA曲线上的能量积分而非固定的"短路耐受时间"',
    calculatedValues: p016CalculatedValues,
    trace: [p016Trace],
    riskLevel: p016Veto || p016EnergyExceeds ? 'High' : (timingMarginUs < 0.5 ? 'Medium-High' : 'Low'),
    confidence: p016Assumptions.length > 2 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: (p016Veto && !soaTimeAssumed) || p016EnergyExceeds,
    vetoReason: p016EnergyExceeds
      ? `短路能量下界估算 (${p016FaultEnergyMj.toFixed(2)}mJ) 已超过器件单脉冲雪崩能量 E_AS (${input.easEnergyMj}mJ)，且短路实际电流通常远高于运行峰值电流——短路时功率管极可能先于保护触发热失效，触发致命一票否决！`
      : p016Veto
        ? (soaTimeAssumed
          ? `按假设参数估算，全保护链关断时间 (${faultToOffTimeUs.toFixed(2)}μs) 可能超过SOA短路耐受时间假设值 (${mosfetSoaShortCircuitTimeUs}μs)，但该耐受时间是假设值而非实际器件SOA数据，暂不作为一票否决，请先用实际器件SOA曲线复核`
          : `全保护链关断时间 (${faultToOffTimeUs.toFixed(2)}μs) 超过器件 SOA 额定安全耐受时间 (${mosfetSoaShortCircuitTimeUs}μs)，短路时功率管将先于保护触发烧毁，触发致命一票否决！`)
        : undefined,
    candidateMeasures: [
      '减小门极关断回路消抖滤波时间，优化关断放电电阻 Rg_off 缩短关断延迟',
      '选用具有超高速硬件短路检测的专用车载预驱（低压MOSFET通常不用DESAT，那是IGBT/SiC技术，此处不适用）',
      '用实际器件的 SOA 曲线做 Vds·Id·t 能量积分复核，替代固定的"短路耐受时间"假设',
    ],
    sideEffects: ['过分缩短滤波时间可能导致在电机急加减速时将大容性充电尖峰误判为短路'],
    verificationItems: [
      '示波器同时使用 4 通道捕获：CH1: Vds, CH2: Id (电流探头), CH3: Gate 门极, CH4: 预驱 Fault 报警引脚，精确标定 6 级延迟实测值',
    ],
    unknownsToTest: ['高温 125℃ 下 MOSFET 短路耐受能量 (E_AS) 的严重衰减规律'],
  }
}
