import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, traceVerdict, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP001(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P001: 急停→母线泵升 (Section 4)
  // ----------------------------------------------------
  const p001 = ctx.bus;
  const p001Assumptions = p001.assumptions.slice();
  const kineticEnergy = p001.kineticEnergy;
  const electricalEnergyTypical = p001.electricalEnergyTypical;
  const electricalEnergyWorstCase = p001.electricalEnergyWorstCase;
  const theoreticalVbusPeakTypical = p001.theoreticalVbusPeakTypical;
  const theoreticalVbusPeakWorstCase = p001.theoreticalVbusPeakWorstCase;
  const hasMeasuredVbus = p001.hasMeasuredVbus;
  const measuredVbus = p001.measuredVbus;
  const deltaTheoretical = p001.deltaTheoretical;
  const diffFromMeasured = p001.diffFromMeasured;
  const p001Veto = p001.veto;
  const cbusUfEffective = p001.cbusUfEffective;
  const loopInductanceUh = p001.loopInductanceUh;

  const p001CalculatedValues: Record<string, string | number> = {
    '转子机械动能 E_mech (J)': Number(kineticEnergy.toFixed(2)),
    '回馈电能量(典型效率0.75) E_elec_typ (J)': Number(electricalEnergyTypical.toFixed(2)),
    '回馈电能量(最坏工况效率1.0，用于一票否决) E_elec_worst (J)': Number(electricalEnergyWorstCase.toFixed(2)),
    '理论泵升峰值(典型效率) Vbus_theo_typ (V)': Number(theoreticalVbusPeakTypical.toFixed(1)),
    '典型效率下相对标称电压的泵升幅度 ΔV (V)': Number(deltaTheoretical.toFixed(1)),
    '理论泵升峰值(最坏工况) Vbus_theo_worst (V)': Number(theoreticalVbusPeakWorstCase.toFixed(1)),
    [hasMeasuredVbus ? '台架实测峰值 Vbus_meas (V)' : '⚠ Vbus_meas：无实测数据，以理论最坏值顶替 (V)']: Number(measuredVbus.toFixed(1)),
    ...(diffFromMeasured !== undefined ? { '模型(典型效率)与实测差值 (V，用于反推真实η)': Number(diffFromMeasured.toFixed(1)) } : {}),
    'MOSFET额定耐压 Vds_rating (V)': input.vdsRating,
    '瞬态裕量(相对最坏工况理论值) Margin (V)': Number((input.vdsRating - theoreticalVbusPeakWorstCase).toFixed(1)),
  };
  pushAssumptionNote(p001CalculatedValues, p001Assumptions);

  const p001Trace = makeTraceNode({
    id: 'bldcPattern:P001.peak',
    title: '母线泵升最坏工况峰值',
    value: traceValue(theoreticalVbusPeakWorstCase),
    unit: 'V',
    inputs: [
      makeTraceInput('vbusNominal', '母线标称电压', ctx.vbusNominalSafe, traceSource(input, 'vbusNominal', ctx.vbusNominalWasAssumed), 'V', ctx.vbusNominalWasAssumed ? '未提供，按13.5V作为数量级参考；不是实测值' : undefined, traceEvidenceId(input, 'vbusNominal')),
      makeTraceInput('cbusUf', 'DC-Link 母线电容', cbusUfEffective, traceSource(input, 'cbusUf', !Number.isFinite(input.cbusUf) || input.cbusUf <= 0), 'μF', (!Number.isFinite(input.cbusUf) || input.cbusUf <= 0) ? '未提供，按470μF假设' : undefined, traceEvidenceId(input, 'cbusUf')),
      makeTraceInput('rotorInertiaKgm2', '转子等效惯量 J', traceValue(input.jInertia), traceSource(input, 'rotorInertiaKgm2', !Number.isFinite(input.jInertia)), 'kg·m²', !Number.isFinite(input.jInertia) ? '缺少惯量时共享公式无法形成有效理论泵升值' : undefined, traceEvidenceId(input, 'rotorInertiaKgm2')),
      makeTraceInput('rpm', '电机转速', traceValue(input.rpm), traceSource(input, 'rpm', !Number.isFinite(input.rpm)), 'rpm', undefined, traceEvidenceId(input, 'rpm')),
      makeTraceInput('currentPeakA', '峰值电流', Number.isFinite(input.currentPeakA) ? input.currentPeakA : 0, traceSource(input, 'currentPeakA', !Number.isFinite(input.currentPeakA)), 'A', !Number.isFinite(input.currentPeakA) ? '缺失时当前共享函数按0A防止NaN；会低估线束电感储能贡献' : undefined, traceEvidenceId(input, 'currentPeakA')),
      makeTraceInput('loopInductanceNh', '回路寄生电感', loopInductanceUh * 1000, traceSource(input, 'loopInductanceNh', loopInductanceUh === 0), 'nH', loopInductanceUh === 0 ? '未提供，未计入0.5·L·I²线束储能；该假设可能低估尖峰' : undefined, traceEvidenceId(input, 'loopInductanceNh')),
    ],
    formula: 'E_mech=0.5·J·ω²；E_elec=η·E_mech（最坏 η=1.0）；Vbus_peak 由 calculateBusPumping() 根据 Cbus 与可用能量求解',
    standardRef: '功率器件 VDS 绝对最大额定值（以实际器件数据手册为准）',
    threshold: { value: input.vdsRating, unit: 'V', label: 'MOSFET VDS 额定耐压' },
    verdict: traceVerdict(p001Veto, theoreticalVbusPeakWorstCase, input.vdsRating, 0.9),
  });

  return {
    id: 'P001',
    name: '急停→母线泵升 (DC-Link Overvoltage on E-Stop)',
    triggered: input.rpm >= 1500 && theoreticalVbusPeakTypical > ctx.vbusNominalSafe * 1.15,
    corePhysicalChain: '转子动能 E=½Jω² → 回馈制动电流 → DC-Link去耦电容充电 → 母线Vbus抬升 → MOSFET击穿与雪崩应力。注意：本模型未包含前端反向阻断路径判定（若无反灌路径，母线可能被电池钳位而非按此能量平衡自由泵升）与损耗项(ESR/导通/铜耗)，仅给出理论上界',
    calculatedValues: p001CalculatedValues,
    trace: [p001Trace],
    riskLevel: p001Veto ? 'High' : (input.vdsRating - theoreticalVbusPeakWorstCase < 5 ? 'Medium-High' : 'Low'),
    confidence: p001Assumptions.length > 0 ? 'LOW' : (hasMeasuredVbus ? 'HIGH' : 'MEDIUM'),
    evidenceType: hasMeasuredVbus ? 'MEASURED' : 'CALCULATED',
    vetoTriggered: p001Veto,
    vetoReason: p001Veto
      ? `母线瞬态泵升峰值最坏工况估算 (${theoreticalVbusPeakWorstCase.toFixed(1)}V)${hasMeasuredVbus ? `，台架实测 (${measuredVbus.toFixed(1)}V)` : ''} 突破或极度逼近 MOSFET 额定击穿电压 (${input.vdsRating}V)，触碰绝对最大额定值红线，一票否决！`
      : undefined,
    candidateMeasures: [
      '软件制动模式重构：触发急停时切入三相全下桥动态能耗短接制动，动能化为电机定子铜耗',
      '硬件被动吸收：母线侧并联 600W~1500W 车规级双向 TVS 阵列与 RC 吸收网络',
      '电容扩容：将 DC-Link 电解/薄膜电容由 470μF 升级至 1000μF 降低泵升 ΔV',
      '核实前端到电池之间是否存在反向阻断二极管：若无，母线可能被电池钳位在线反电势峰值附近而非自由泵升，需要用 P002 的 BEMF 结果与本模型的能量平衡结果取较小者复核',
    ],
    sideEffects: [
      '下桥三相短接急停会瞬间产生反向冲击力矩，需机械齿轮箱强度校核',
      '定子绕组承受瞬间大电流，需校核电机线包短时温升与退磁风险',
      '大幅增大电解电容体积导致无法放入密封铝壳，且拉长物料打样周期',
    ],
    verificationItems: [
      '电机转速台架在 3800rpm 下触发 Emergency Stop，高压差分探头持续捕获 Vbus 浪涌波形，并对 3 个以上转速点分别测量，用 (V_pk²−V0²)·C/2 对 ½Jω² 作图反推真实 η——斜率>1 说明模型漏了能量源，斜率随转速变化说明模型形式本身需要调整',
      '示波器捕获三相电流及下桥 MOSFET Vds 瞬态过冲峰值与振铃频率',
      '热像仪监测连续 50 次急停工况下电机绕组及功率管结温温升',
    ],
    unknownsToTest: [
      '电机转子实际转动惯量 J 的台架减速法标定值',
      '高压蓄电池或前端稳压源在反向倒灌时的真实吸收特性（含是否存在反向阻断二极管）',
      '示波器高压差分探头的高频带宽限制与地线环耦合失真',
    ],
  }
}
