import type { PatternOutputItem, EvidenceType } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, traceVerdict, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP014(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P014: MOSFET VDS裕量 (Section 4)
  // ----------------------------------------------------
  const p014Bus = ctx.bus;
  const p014Assumptions: string[] = [];
  const hasMeasuredVbus = p014Bus.hasMeasuredVbus;
  const measuredVbus = p014Bus.measuredVbus;
  let peakVds: number;
  let peakVdsMethod: string;
  if (input.loopInductanceNh !== undefined && input.diDtANs !== undefined) {
    const overshootV = input.loopInductanceNh * 1e-9 * (input.diDtANs * 1e9);
    peakVds = measuredVbus + overshootV;
    peakVdsMethod = `Vbus + L_loop·di/dt = ${measuredVbus.toFixed(1)}V + ${overshootV.toFixed(1)}V`;
  } else {
    p014Assumptions.push('未提供回路电感与di/dt，改用固定假设的30%过冲系数(仍可能偏乐观，强烈建议实测)，而非原先偏乐观的5%');
    peakVds = measuredVbus * 1.3;
    peakVdsMethod = '未提供L_loop/di_dt，假设过冲=标称值×30%';
  }
  const vdsMargin = input.vdsRating - peakVds;
  const p014VetoBase = peakVds >= input.vdsRating;
  const p014InputsAssumed = p014Assumptions.length > 0 || !hasMeasuredVbus;
  const p014Veto = p014InputsAssumed ? false : p014VetoBase;
  const p014EvidenceType: EvidenceType = (hasMeasuredVbus && input.loopInductanceNh !== undefined) ? 'MEASURED' : 'CALCULATED';

  const p014CalculatedValues: Record<string, string | number> = {
    '静态标称工作电压 Vds_nom (V)': ctx.vbusNominalSafe,
    '动态浪涌过冲估算方法': peakVdsMethod,
    '动态浪涌过冲估算 Vds_peak (V)': Number(peakVds.toFixed(1)),
    '器件绝对最大额定值 Vds_rating (V)': input.vdsRating,
    '绝对耐压裕量 (未降额) Margin (V)': Number(vdsMargin.toFixed(1)),
    '车规 80% 降额红线 (V)': Number((input.vdsRating * 0.8).toFixed(1)),
  };
  pushAssumptionNote(p014CalculatedValues, p014Assumptions);

  const p014Trace = makeTraceNode({
    id: 'bldcPattern:P014.vdsPeak',
    title: 'MOSFET 动态 VDS 峰值',
    value: traceValue(peakVds),
    unit: 'V',
    inputs: [
      makeTraceInput('busVoltagePeakV', '母线瞬态峰值', measuredVbus, traceSource(input, 'busVoltagePeakV', !hasMeasuredVbus), 'V', !hasMeasuredVbus ? '没有台架实测，使用 P001 理论最坏值；不等同于实测 Vbus 峰值' : undefined, traceEvidenceId(input, 'busVoltagePeakV')),
      ...(input.loopInductanceNh !== undefined && Number.isFinite(input.loopInductanceNh) ? [makeTraceInput('loopInductanceNh', '回路寄生电感', input.loopInductanceNh, traceSource(input, 'loopInductanceNh'), 'nH', undefined, traceEvidenceId(input, 'loopInductanceNh'))] : [makeTraceInput('loopInductanceNh', '回路寄生电感', '缺输入', 'ASSUMED_DEFAULT', 'nH', 'L_loop 未提供，采用30%过冲假设')]),
      ...(input.diDtANs !== undefined && Number.isFinite(input.diDtANs) ? [makeTraceInput('diDtANs', '开关瞬态 di/dt', input.diDtANs, traceSource(input, 'diDtANs'), 'A/ns', undefined, traceEvidenceId(input, 'diDtANs'))] : [makeTraceInput('diDtANs', '开关瞬态 di/dt', '缺输入', 'ASSUMED_DEFAULT', 'A/ns', 'di/dt 未提供，采用30%过冲假设')]),
    ],
    formula: peakVdsMethod,
    standardRef: 'MOSFET VDS absolute maximum rating；项目定义的 VDS 车规降额边界',
    threshold: { value: input.vdsRating * 0.8, unit: 'V', label: '车规 80% 降额红线' },
    verdict: traceVerdict(p014Veto, peakVds, input.vdsRating * 0.8, 0.95),
  });

  return {
    id: 'P014',
    name: 'MOSFET VDS多层级电压裕量核查 (VDS Stress vs Rating Hierarchy)',
    // [FIX] 无实测母线峰值时 peakVds 会退化成"P001理论泵升 × 30%过冲假设"两层假设叠加，
    // 越过75%降额线导致"给不给实测数据结论都差不多"。现在只有当有实测母线峰值(hasMeasuredVbus)
    // 时才触发；veto 已有更严格的 p014InputsAssumed 守卫，此处把 triggered 与之一致化。
    triggered: hasMeasuredVbus && Number.isFinite(peakVds) && peakVds >= input.vdsRating * 0.75,
    corePhysicalChain: '区分：Vds_nominal / Vds_peak / Vds_repetitive_peak / Vds_absolute_maximum；若瞬态尖峰突破额定击穿电压，直接触发一票否决！',
    calculatedValues: p014CalculatedValues,
    trace: [p014Trace],
    riskLevel: p014Veto ? 'High' : (vdsMargin < input.vdsRating * 0.1 || peakVds > input.vdsRating * 0.8 ? 'Medium-High' : 'Low'),
    confidence: p014Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: p014EvidenceType,
    vetoTriggered: p014Veto,
    vetoReason: p014Veto
      ? `MOSFET 漏源动态尖峰估算 (${peakVds.toFixed(1)}V) 突破器件绝对耐压额定值 (${input.vdsRating}V)，触犯第一性原则，一票否决！`
      : (p014VetoBase ? `过冲系数或母线电压为假设值，按当前假设动态尖峰估算 (${peakVds.toFixed(1)}V) 已突破额定值 (${input.vdsRating}V)——强烈建议尽快提供回路电感/di-dt实测或母线实测以确认结论` : undefined),
    candidateMeasures: [
      '选用更高耐压车规低内阻 MOSFET，拉开耐压安全裕量',
      '增加高频贴片 RC Snubber 强行吸收开关瞬态反冲尖峰',
      '实测开关节点1GHz带宽下的真实过冲，替换本模型的过冲假设系数',
    ],
    sideEffects: ['更高耐压器件在相同芯片尺寸下 Rds(on) 会更高，需要增大芯片面积或优化散热'],
    verificationItems: ['示波器 1GHz 探头直接焊接在 MOSFET 引脚根部捕获最极限开关尖峰，并同时测回路电感(可用短路环法)与di/dt，替换假设的过冲系数'],
    unknownsToTest: ['汽车线束接插件插拔瞬态与抛负载 (Load Dump) 叠加时的综合浪涌'],
  }
}
