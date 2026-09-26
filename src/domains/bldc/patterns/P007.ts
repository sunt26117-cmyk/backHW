import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP007(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P007: 高温→热失控风险 (Section 4)
  // ----------------------------------------------------
  const { tjEstimated, pTotal, rthCaOrJa } = ctx.thermal;
  const p007Assumptions: string[] = [];
  const deratingBasisC = input.deratingBasisC !== undefined ? input.deratingBasisC : 125;
  const tjMaxC = input.tjMaxC !== undefined ? input.tjMaxC : 150;
  if (input.deratingBasisC === undefined) p007Assumptions.push('车规降额基准温度未提供，假设125℃');
  if (input.tjMaxC === undefined) p007Assumptions.push('器件绝对最大结温 Tjmax 未提供，假设150℃');
  const steadyMargin = tjMaxC - tjEstimated;
  let transientMargin: number;
  let transientMarginNote: string;
  if (input.pulseDurationS !== undefined && input.thermalTauS !== undefined && input.thermalTauS > 0) {
    const deltaTjPulse = pTotal * rthCaOrJa * (1 - Math.exp(-input.pulseDurationS / input.thermalTauS));
    transientMargin = steadyMargin - deltaTjPulse;
    transientMarginNote = `按 ΔTj=P·Rth·(1-e^(-t/τ)) 估算，t=${input.pulseDurationS}s, τ=${input.thermalTauS}s`;
  } else {
    transientMargin = steadyMargin - 15.0;
    transientMarginNote = '未提供脉冲时长与热时间常数，沿用固定假设：瞬态温升较稳态多15℃(仅供参考)';
    p007Assumptions.push('脉冲时长/热时间常数未提供，瞬态裕量按固定假设(稳态-15℃)估算');
  }
  const deratingMargin = deratingBasisC - tjEstimated;

  const p007CalculatedValues: Record<string, string | number> = {
    '稳态结温裕量 Steady Margin (℃)': Number(steadyMargin.toFixed(1)),
    '瞬态脉冲结温裕量 Transient Margin (℃)': Number(transientMargin.toFixed(1)),
    '瞬态裕量估算方法': transientMarginNote,
    [`器件绝对 Tjmax 裕量 (Tjmax=${tjMaxC}℃) (℃)`]: Number(steadyMargin.toFixed(1)),
    [`车规降额裕量 (基准${deratingBasisC}℃) Derating Margin (℃)`]: Number(deratingMargin.toFixed(1)),
  };
  if (input.thermalTauS !== undefined) {
    p007CalculatedValues['热阻热容热时间常数 Tau (s，壳/散热器侧，非结到壳)'] = input.thermalTauS;
  } else {
    p007CalculatedValues['⚠ 数据缺口'] = '未提供真实热时间常数，无法准确估算瞬态温升，Zth(t)曲线建议从datasheet获取';
  }
  pushAssumptionNote(p007CalculatedValues, p007Assumptions);

  const p007Trace = makeTraceNode({
    id: 'bldcPattern:P007.thermalMargins',
    title: '热安全综合裕量',
    value: traceValue(deratingMargin),
    unit: '℃',
    inputs: [
      makeTraceInput('tjEstimated', 'P006 迭代结温', traceValue(tjEstimated), traceSource(input, 'tjEstimated'), '℃', '由同一确定性热模型计算，不重复造一套热公式'),
      makeTraceInput('tjMaxC', '器件绝对最大结温 Tjmax', tjMaxC, traceSource(input, 'tjMaxC', input.tjMaxC === undefined), '℃', input.tjMaxC === undefined ? '未提供，假设150℃' : undefined, traceEvidenceId(input, 'tjMaxC')),
      makeTraceInput('deratingBasisC', '车规降额基准温度', deratingBasisC, traceSource(input, 'deratingBasisC', input.deratingBasisC === undefined), '℃', input.deratingBasisC === undefined ? '未提供，假设125℃' : undefined, traceEvidenceId(input, 'deratingBasisC')), 
      makeTraceInput('pulseDurationS', '脉冲持续时间', traceValue(input.pulseDurationS), traceSource(input, 'pulseDurationS', input.pulseDurationS === undefined), 's', input.pulseDurationS === undefined ? '未提供，瞬态裕量退化为稳态-15℃假设' : undefined, traceEvidenceId(input, 'pulseDurationS')),
      makeTraceInput('thermalTauS', '热时间常数', traceValue(input.thermalTauS), traceSource(input, 'thermalTauS', input.thermalTauS === undefined), 's', input.thermalTauS === undefined ? '未提供，无法用真实Zth(t)核验脉冲温升' : undefined, traceEvidenceId(input, 'thermalTauS')),
    ],
    formula: 'Steady Margin=Tj_max(datasheet)−Tj；Transient Margin=Steady Margin−P·Rth·(1−e^(−t/τ))（缺t/τ时采用明确标注的15℃参考假设）；Derating Margin=T_derating−Tj',
    standardRef: '器件绝对最大结温；项目车规降额温度窗口；器件 Zth(t) datasheet',
    threshold: { value: 0, unit: '℃', label: '降额裕量边界' },
    verdict: deratingMargin < 0 ? 'MARGINAL' : (deratingMargin < 15 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P007',
    name: '高温→多工况热安全综合裕量 (Multi-Domain Thermal Safety Margins)',
    triggered: Number.isFinite(tjEstimated) && tjEstimated >= 90,
    corePhysicalChain: '不能仅判断 Tj < TjMax 绝对值，必须综合评估稳态、脉冲瞬态、SOA与车规长期降额裕量',
    calculatedValues: p007CalculatedValues,
    trace: [p007Trace],
    riskLevel: deratingMargin < 0 ? 'Medium-High' : 'Low',
    confidence: p007Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: ['建立热降额保护表，严格执行未超绝对最大额定值不等于安全的车规理念', '实测 Zth(t) 瞬态热阻曲线替代固定假设的瞬态温升系数'],
    sideEffects: ['过早降额会影响极端高温下整车动力输出性能与用户体验'],
    verificationItems: ['热冲击试验箱 (-40℃ ~ 125℃) 1000 循环热应力疲劳测试', '瞬态热阻抗测试：施加已知功率阶跃，记录壳温响应曲线拟合真实 τ'],
    unknownsToTest: ['焊点空洞率对瞬态热阻 Rth(t) 的非均匀发热热点放大效应'],
  }
}
