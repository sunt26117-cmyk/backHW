import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, traceVerdict, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP002(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P002: 高转速→反电动势过压 (Section 4)
  // ----------------------------------------------------
  const p002Assumptions: string[] = [];
  const ke = input.keVkrpm !== undefined ? input.keVkrpm : 4.2; // V/krpm
  const hasProvidedKe = input.keVkrpm !== undefined;
  if (!hasProvidedKe) p002Assumptions.push('电机反电动势常数 Ke 未提供，假设为 4.2V/krpm（建议改用 Ke≈Vbus/n_空载 反推或实测）——这是最基础的电机参数，据此算出的反电动势数值仅供参考，不应单独作为一票否决依据');
  const keConvention = input.keConvention || 'PHASE_RMS_SINUSOIDAL';
  if (input.keConvention === undefined) {
    p002Assumptions.push('未声明 Ke 的约定(相RMS/线峰值)，默认假设为"相电压RMS、正弦反电势"，按此需要 ×√2×√3 才是线电压峰值，请与实测核对');
  }
  // [FIX-2] 若 Ke 是相电压RMS/krpm 且波形为正弦，线电压峰值 = 相RMS × √2(峰值) × √3(线电压)。
  // 原代码只乘了 √3，会把线电压峰值低估约41%。若调用方明确声明 Ke 本身已经是线电压峰值
  // 约定，则不再重复乘系数。
  const bemfMultiplier = keConvention === 'LINE_PEAK_DIRECT' ? 1 : Math.sqrt(2) * Math.sqrt(3);
  const backEmfPeak = (ke * input.rpm) / 1000 * bemfMultiplier;
  // 永磁体最坏情况通常在低温（磁通更高），而非常见直觉认为的高温衰减；两者都展示，
  // 但一票否决判据用低温工况（更保守）。
  const lowTempUpliftPct = input.magnetLowTempFluxUpliftPct !== undefined ? input.magnetLowTempFluxUpliftPct : 7;
  if (input.magnetLowTempFluxUpliftPct === undefined) p002Assumptions.push('低温磁通提升系数未提供，假设 -40℃ 相对 25℃ 提升 7%（NdFeB 典型量级，需实测标定）');
  const backEmfPeakLowTempWorstCase = backEmfPeak * (1 + lowTempUpliftPct / 100);
  if (ctx.vbusNominalWasAssumed) p002Assumptions.push('母线标称电压 vbusNominal 未提供，假设为 13.5V，本判据的电压裕量/riskLevel 判断据此计算，仅供参考');
  const voltageMargin = ctx.vbusNominalSafe - backEmfPeak;
  const p002Triggered = input.rpm >= 3000;
  const p002VetoBase = backEmfPeakLowTempWorstCase > input.vdsRating * 0.95;
  // 跟 P006 对 rthCaOrJa 的处理保持一致：Ke 是驱动这条判据的最基础参数，
  // 它本身是假设值时，不允许单独把结论升级成"一票否决"，只做风险提示。
  const p002Veto = hasProvidedKe ? p002VetoBase : false;

  const p002CalculatedValues: Record<string, string | number> = {
    '电机反电动势常数 Ke (V/krpm)': ke,
    'Ke 约定': keConvention === 'LINE_PEAK_DIRECT' ? '已声明为线电压峰值/krpm，直接使用' : '假设为相电压RMS/krpm、正弦波形，按 ×√2×√3 折算线电压峰值',
    '常温线反电动势峰值 BEMF_pk_25C (V)': Number(backEmfPeak.toFixed(1)),
    '低温最坏工况线反电动势峰值 BEMF_pk_lowT (V，用于一票否决)': Number(backEmfPeakLowTempWorstCase.toFixed(1)),
    '标称母线电压 Vbus_nom (V)': ctx.vbusNominalSafe,
    '弱磁调制前电压裕量(常温) Margin (V)': Number(voltageMargin.toFixed(1)),
  };
  pushAssumptionNote(p002CalculatedValues, p002Assumptions);

  const p002Trace = makeTraceNode({
    id: 'bldcPattern:P002.bemfLowTempPeak',
    title: '低温最坏反电动势峰值',
    value: traceValue(backEmfPeakLowTempWorstCase),
    unit: 'V',
    inputs: [
      makeTraceInput('keVkrpm', '反电动势常数 Ke', ke, traceSource(input, 'keVkrpm', !hasProvidedKe), 'V/krpm', !hasProvidedKe ? '未提供，按4.2V/krpm假设' : undefined, traceEvidenceId(input, 'keVkrpm')),
      makeTraceInput('rpm', '电机转速', traceValue(input.rpm), traceSource(input, 'rpm', !Number.isFinite(input.rpm)), 'rpm', undefined, traceEvidenceId(input, 'rpm')),
      makeTraceInput('keConvention', 'Ke 标定约定', keConvention, traceSource(input, 'keConvention', input.keConvention === undefined), undefined, input.keConvention === undefined ? '未声明，默认相电压 RMS / 正弦反电势约定' : undefined),
      makeTraceInput('magnetLowTempFluxUpliftPct', '低温磁通提升系数', lowTempUpliftPct, traceSource(input, 'magnetLowTempFluxUpliftPct', input.magnetLowTempFluxUpliftPct === undefined), '%', input.magnetLowTempFluxUpliftPct === undefined ? '未提供，按7%假设' : undefined, traceEvidenceId(input, 'magnetLowTempFluxUpliftPct')),
      makeTraceInput('vbusNominal', '母线标称电压', ctx.vbusNominalSafe, traceSource(input, 'vbusNominal', ctx.vbusNominalWasAssumed), 'V', ctx.vbusNominalWasAssumed ? '未提供，按13.5V假设，仅用于裕量计算' : undefined, traceEvidenceId(input, 'vbusNominal')),
    ],
    formula: 'BEMF_pk = Ke·rpm/1000·折算系数；低温最坏值=BEMF_pk·(1+磁通提升%)',
    standardRef: '电机 Ke 标定约定 + 功率器件 VDS 绝对最大额定值',
    threshold: { value: input.vdsRating * 0.95, unit: 'V', label: 'VDS 95% 安全红线' },
    verdict: traceVerdict(p002Veto, backEmfPeakLowTempWorstCase, input.vdsRating, 0.8),
  });

  return {
    id: 'P002',
    name: '高转速→反电动势过压与失控回馈风险 (Back-EMF Overvoltage)',
    triggered: p002Triggered,
    corePhysicalChain: '高转速RPM → 线圈反电动势Back-EMF超过母线电压 → PWM失控全开三相桥失步整流 → 母线失控反向泵升。永磁体退磁温度系数为负，最坏反电势工况通常出现在低温而非高温',
    calculatedValues: p002CalculatedValues,
    trace: [p002Trace],
    riskLevel: backEmfPeakLowTempWorstCase >= ctx.vbusNominalSafe ? 'Medium-High' : 'Low',
    confidence: p002Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p002Veto,
    vetoReason: p002Veto
      ? '电机低温最坏工况反电动势超出功率器件安全裕量，一旦驱动故障全关将导致三相反并联二极管续流击穿！'
      : (p002VetoBase ? 'Ke 为假设值，按当前假设已逼近一票否决红线——这不是可以忽略的风险提示，强烈建议尽快提供实测 Ke 以确认结论' : undefined),
    candidateMeasures: [
      '在 MCU FOC 算法中配置超前角与 Id<0 负向弱磁控制策略，抵消直轴磁通',
      '硬件设置超速硬切断安全窗口，软件底层实施最高机械转速硬件转速钳位',
    ],
    sideEffects: ['弱磁控制会增加电机无功电流 Id，导致定子铜损耗与发热增加 15%~25%'],
    verificationItems: [
      '拖动台架以 1.2 倍最高转速反拖电机，高压示波器开路测量三相端线反电势波形，同时确认波形是正弦还是梯形、Ke 到底是按相RMS/线峰值哪种约定标定的',
      '在 -40℃/25℃/125℃ 各测一次反电势，直接标定真实的磁通温度系数与最坏工况所在的温度点',
    ],
    unknownsToTest: ['永磁体低温 (-40℃) 磁通提升与高温 (125℃) 磁通衰减的真实系数，及各自对应的反电势修正'],
  }
}
