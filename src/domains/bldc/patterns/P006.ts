import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP006(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P006: 大电流→MOSFET过热与热电正反馈 (Section 4)
  // ----------------------------------------------------
  const p006 = ctx.thermal;
  const p006Assumptions = p006.assumptions.slice();
  const tjMaxC = input.tjMaxC !== undefined ? input.tjMaxC : 150;
  if (input.tjMaxC === undefined) p006Assumptions.push('器件绝对最大结温 Tjmax 未提供，假设150℃；正式判定应使用当前器件 datasheet');
  const {
    rdsOn25, iPeak, rthJc, rthCaOrJa, hasRthCa, useRthJaTotal,
    swFreq, swTimeNs, iDeviceRms, pCondFinal, pSwFinal, pTotal,
    tjEstimated, thermalRunaway: p006ThermalRunaway, overheat: p006Overheat,
    criticalAssumption: p006CriticalAssumption, rdsOnAtEstimatedTemp,
  } = p006;

  const p006CalculatedValues: Record<string, string | number> = {
    '单管等效RMS电流 I_device_rms (A，按三相逆变器闭式解，非直接用相电流RMS)': Number(iDeviceRms.toFixed(2)),
    '25℃基准 Rds(on) (mΩ)': rdsOn25,
    '迭代收敛结温下的 Rds(on) (mΩ)': Number(rdsOnAtEstimatedTemp.toFixed(2)),
    '单管导通损耗 P_cond (W)': Number(pCondFinal.toFixed(2)),
    '单管开关损耗(含Qrr) P_sw (W)': Number(pSwFinal.toFixed(2)),
    '单管总耗散功率 P_total (W)': Number(pTotal.toFixed(2)),
    'Rth(结-壳) (℃/W)': rthJc,
    'Rth(壳-环境) (℃/W)': rthCaOrJa,
    ...(useRthJaTotal ? { 'Rth(结-环境) Datasheet RθJA (℃/W)': input.rthJaTotal! } : {}),
    [p006ThermalRunaway ? '⚠ 结温迭代不收敛(热电正反馈失控)' : '迭代收敛结温 Tj (℃)']: p006ThermalRunaway ? '是——按当前假设参数，损耗-温度正反馈不收敛，属于热失控特征' : Number(tjEstimated.toFixed(1)),
    '车规芯片结温上限 Tj_max (℃)': tjMaxC,
  };
  pushAssumptionNote(p006CalculatedValues, p006Assumptions);

  const p006Trace = makeTraceNode({
    id: 'bldcPattern:P006.tjSteady',
    title: '热电正反馈迭代后的结温 Tj',
    value: traceValue(tjEstimated),
    unit: '℃',
    inputs: [
      makeTraceInput('currentPeakA', '相电流峰值', iPeak, traceSource(input, 'currentPeakA', input.currentPeakA === undefined), 'A', input.currentPeakA === undefined ? '未提供，假设25A' : undefined, traceEvidenceId(input, 'currentPeakA')),
      makeTraceInput('rdsOnMilliOhm', '25℃ Rds(on)', rdsOn25, traceSource(input, 'rdsOnMilliOhm', input.rdsOnMilliOhm === undefined), 'mΩ', input.rdsOnMilliOhm === undefined ? '未提供，假设3.5mΩ' : undefined, traceEvidenceId(input, 'rdsOnMilliOhm')),
      makeTraceInput('rthJc', 'Rth(j-c)', rthJc, traceSource(input, 'rthJc', input.rthJc === undefined && !useRthJaTotal), '℃/W', input.rthJc === undefined && !useRthJaTotal ? '未提供，假设1.8℃/W' : undefined, traceEvidenceId(input, 'rthJc')),
      ...(useRthJaTotal ? [makeTraceInput('rthJaTotal', 'Datasheet RθJA 总热阻', input.rthJaTotal!, traceSource(input, 'rthJaTotal'), '℃/W', '条件化 datasheet RθJA，未做系统实装等效性假设', traceEvidenceId(input, 'rthJaTotal'))] : [makeTraceInput('rthCaOrJa', 'Rth(c-a / j-a)', rthCaOrJa, traceSource(input, 'rthCaOrJa', !hasRthCa), '℃/W', !hasRthCa ? '未提供，假设12.0℃/W；这是当前结论最大不确定源' : undefined, traceEvidenceId(input, 'rthCaOrJa'))]),
      makeTraceInput('tAmbientC', '环境温度', traceValue(input.tAmbientC), traceSource(input, 'tAmbientC'), '℃', undefined, traceEvidenceId(input, 'tAmbientC')),
      makeTraceInput('tjMaxC', '器件绝对最大结温 Tjmax', tjMaxC, traceSource(input, 'tjMaxC', input.tjMaxC === undefined), '℃', input.tjMaxC === undefined ? '未提供当前器件 Tjmax，假设150℃' : undefined, traceEvidenceId(input, 'tjMaxC')),
      makeTraceInput('pwmSwitchingFreqHz', 'PWM开关频率', swFreq, traceSource(input, 'pwmSwitchingFreqHz', input.pwmSwitchingFreqHz === undefined), 'Hz', input.pwmSwitchingFreqHz === undefined ? '未提供，假设20kHz' : undefined, traceEvidenceId(input, 'pwmSwitchingFreqHz')),
      makeTraceInput('switchingTimeNs', '开关重叠时间', swTimeNs, traceSource(input, 'switchingTimeNs', input.switchingTimeNs === undefined), 'ns', input.switchingTimeNs === undefined ? '未提供，假设55ns' : undefined, traceEvidenceId(input, 'switchingTimeNs')),
    ],
    formula: 'Pcond=Idevice,rms²·Rds(Tj)；Psw≈0.5·Vbus·Iavg·t_sw·fsw+P_Qrr；Tj=Ta+(Pcond+Psw)·(RthJC+RthCA)，迭代至收敛',
    standardRef: 'MOSFET Rds(on)(Tj) / thermal resistance datasheet；项目 Tj limit',
    threshold: { value: tjMaxC, unit: '℃', label: '当前器件绝对最大结温' },
    verdict: p006ThermalRunaway || (tjEstimated >= tjMaxC && !p006CriticalAssumption) ? 'CRITICAL' : (tjEstimated >= 125 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P006',
    name: '大电流→MOSFET热电正反馈与结温过热 (MOSFET Thermal Runaway & Self-Heating)',
    triggered: tjEstimated >= 115 || p006ThermalRunaway,
    corePhysicalChain: '连续堵转或重载大电流 → 导通损耗增加 → 结温Tj上升 → 硅材料载流子迁移率下降使Rds(on)正温度系数增大 → 损耗进一步恶化。本模型用不动点迭代表达这一正反馈，不收敛即判定为热失控特征，而非只算一次就下结论',
    calculatedValues: p006CalculatedValues,
    trace: [p006Trace],
    riskLevel: p006ThermalRunaway ? 'High' : (p006Overheat ? 'High' : (tjEstimated >= 125 ? 'Medium-High' : 'Low')),
    confidence: p006Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    // [FIX-3] rthCaOrJa 是假设值时，不允许仅凭它把风险判成"确认超限"的一票否决，
    // 只在真正收敛异常(数值发散)或已提供实测热阻却仍超限时才触发。
    vetoTriggered: p006ThermalRunaway || (tjEstimated >= tjMaxC && !p006CriticalAssumption),
    vetoReason: p006ThermalRunaway
      ? '按当前(部分为假设)参数迭代计算，损耗-结温正反馈不收敛，具备热失控特征，在补齐实测热阻/电流数据前不得判定为安全！'
      : (tjEstimated >= tjMaxC && !p006CriticalAssumption
        ? '功率管理论最高结温突破当前器件绝对额定 Tjmax，存在硅结构永久热电击穿风险！'
        : undefined),
    candidateMeasures: [
      '将铝基板或 PCB 铜箔厚度由 1oz 提升至 2oz，并在漏极覆铜区布置 4x6 阵列散热过孔',
      '选用更低内阻车规 MOS (如 1.8mΩ PDFN56 封装) 或双管并联分流',
      '底层加入 NTC 结温观测器，超过 115℃ 自动线性限制最大相电流输出',
      '温箱实测2~3个功率点下的壳温，反推真实 Rth(壳-环境)，替换本模型的假设值——这是当前结论里不确定性最大的一项',
    ],
    sideEffects: ['增加铜厚与低内阻器件使 BOM 成本单板上升 $0.45~$0.80'],
    verificationItems: ['热电偶埋入功率管壳底，在 85℃ 环温箱中跑满载堵转 30 分钟记录真实温升曲线，并按 Rth_ca=(T_case-T_amb)/P_total 反推真实热阻'],
    unknownsToTest: ['铝外壳导热硅胶垫在长期振动与冷热冲击后的厚度压缩与热阻退化率', '器件间热耦合(6管共板互相加热)对单管独立热阻假设的偏离程度'],
  }
}
