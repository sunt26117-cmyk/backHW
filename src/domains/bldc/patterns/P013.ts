import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP013(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P013: 母线电容不足 (Section 4)
  // ----------------------------------------------------
  const p013Assumptions: string[] = [];
  const cbusUf013 = input.cbusUf && input.cbusUf > 0 ? input.cbusUf : 470;
  const iPeak013 = input.currentPeakA !== undefined ? input.currentPeakA : 25;
  const hasProvidedPeakCurrent013 = input.currentPeakA !== undefined;
  if (!hasProvidedPeakCurrent013) p013Assumptions.push('电流峰值 I_peak 未提供，假设为25A——这是纹波电流估算的主导变量，据此算出的纹波电流数值仅供参考，不应单独作为一票否决依据');
  const modIdx013 = input.modulationIndex !== undefined ? input.modulationIndex : 0.9;
  const pf013 = input.powerFactorCosPhi !== undefined ? input.powerFactorCosPhi : 0.9;
  // 三相逆变器直流侧电容纹波电流闭式解（Kolar/Evans近似），替代原来固定的 ×0.45
  const rippleCurrentEst = iPeak013 * Math.sqrt(
    Math.max(0, 2 * modIdx013 * (Math.sqrt(3) / (4 * Math.PI) + Math.pow(pf013, 2) * (Math.sqrt(3) / Math.PI - (9 * modIdx013) / 16)))
  );
  const capRippleRatingA = input.capRatedRippleCurrentA;
  const p013VetoBase = capRippleRatingA !== undefined && rippleCurrentEst > capRippleRatingA;
  const p013Veto = hasProvidedPeakCurrent013 ? p013VetoBase : false;
  // [FIX] 缺母线电容实测值时 cbusUf013 缺省 470μF，天然 <600μF 阈值，会让几乎所有未填电容的
  // case 都触发。现在只有当工程师显式提供了母线电容实测值(Number.isFinite 且 >0)且确实偏小时
  // 才触发，与 P009~P018 的"缺证据不触发"口径一致。
  const p013Triggered = Number.isFinite(input.cbusUf) && input.cbusUf > 0 && Number.isFinite(capRippleRatingA) && rippleCurrentEst > (capRippleRatingA as number);
  // [FIX] 把原来笼统的 0.75 拆成三个独立、可查的因子，而不是一个数吃掉所有降额
  const initTolPct = input.capInitialTolerancePct !== undefined ? input.capInitialTolerancePct : 20;
  const eolDeratingPct = input.capEolDeratingPct !== undefined ? input.capEolDeratingPct : 20;
  const lowTempDeratingPct = input.capLowTempDeratingPct !== undefined ? input.capLowTempDeratingPct : 30;
  if (input.capInitialTolerancePct === undefined || input.capEolDeratingPct === undefined || input.capLowTempDeratingPct === undefined) {
    p013Assumptions.push('电容初始容差/寿命末期降额/低温降额未分别提供，假设分别为20%/20%/30%(电解电容典型量级，务必用datasheet核实，尤其低温降额差异很大)');
  }
  const combinedDeratingFactor = (1 - initTolPct / 100) * (1 - eolDeratingPct / 100) * (1 - lowTempDeratingPct / 100);
  const minEffectiveCapUf = cbusUf013 * combinedDeratingFactor;

  // 电解电容寿命 Arrhenius 估算（10℃ 规则：L = L0 · 2^((T0 - T_use)/10)，寿命每降 10℃ 翻倍）
  const capRatedLifeHours = input.capRatedLifeHours;
  const capRatedTempC = input.capRatedTempC;
  const capUseTempC = Number.isFinite(input.tAmbientC) ? input.tAmbientC : undefined;
  const capLifeHours = capRatedLifeHours !== undefined && capRatedTempC !== undefined && capUseTempC !== undefined
    ? capRatedLifeHours * Math.pow(2, (capRatedTempC - capUseTempC) / 10)
    : undefined;
  const capLifeYears = capLifeHours !== undefined ? capLifeHours / (24 * 365) : undefined;
  if (capRippleRatingA === undefined) p013Assumptions.push('电容允许纹波电流未提供，无法形成与器件额定能力的确定性比较');
  if (capLifeHours === undefined) p013Assumptions.push('电容额定寿命/额定温度/使用温度信息不完整，寿命不作确定性判断');

  const p013CalculatedValues: Record<string, string | number> = {
    '母线电容标称容量 (μF)': cbusUf013,
    '初始容差降额 (%)': initTolPct,
    '寿命末期(EOL)降额 (%)': eolDeratingPct,
    '低温降额 (%，电解电容在-40℃附近通常是三者中最大的一项)': lowTempDeratingPct,
    '三项降额后最小有效容量 (μF)': Number(minEffectiveCapUf.toFixed(0)),
    '高频纹波电流估算 I_ripple_rms (A，按调制比/功率因数闭式解)': Number(rippleCurrentEst.toFixed(1)),
    '电容额定允许纹波电流 (A)': capRippleRatingA ?? '缺输入',
    ...(capLifeHours !== undefined ? { '电容寿命 Arrhenius 估算 (h，10℃规则，未计纹波自热)': Number(capLifeHours.toFixed(0)), '折算寿命年限 (年)': Number(capLifeYears!.toFixed(1)) } : {}),
  };
  pushAssumptionNote(p013CalculatedValues, p013Assumptions);

  const p013Trace = makeTraceNode({
    id: 'bldcPattern:P013.rippleAndCapacity',
    title: 'DC-Link 有效容量与纹波电流',
    value: traceValue(rippleCurrentEst),
    unit: 'A RMS',
    inputs: [
      makeTraceInput('cbusUf', '母线电容标称容量', cbusUf013, traceSource(input, 'cbusUf', !(Number.isFinite(input.cbusUf) && input.cbusUf > 0)), 'μF', !(Number.isFinite(input.cbusUf) && input.cbusUf > 0) ? '未提供/无效，假设470μF；该假设不作为触发依据' : undefined, traceEvidenceId(input, 'cbusUf')),
      makeTraceInput('currentPeakA', '相电流峰值', iPeak013, traceSource(input, 'currentPeakA', !hasProvidedPeakCurrent013), 'A', !hasProvidedPeakCurrent013 ? '未提供，假设25A' : undefined, traceEvidenceId(input, 'currentPeakA')),
      makeTraceInput('modulationIndex', '调制比 m', modIdx013, traceSource(input, 'modulationIndex', input.modulationIndex === undefined), undefined, input.modulationIndex === undefined ? '未提供，假设0.9' : undefined, traceEvidenceId(input, 'modulationIndex')),
      makeTraceInput('powerFactorCosPhi', '功率因数 cosφ', pf013, traceSource(input, 'powerFactorCosPhi', input.powerFactorCosPhi === undefined), undefined, input.powerFactorCosPhi === undefined ? '未提供，假设0.9' : undefined, traceEvidenceId(input, 'powerFactorCosPhi')),
      makeTraceInput('capInitialTolerancePct', '初始容差降额', initTolPct, traceSource(input, 'capInitialTolerancePct', input.capInitialTolerancePct === undefined), '%', input.capInitialTolerancePct === undefined ? '未提供，假设20%' : undefined, traceEvidenceId(input, 'capInitialTolerancePct')),
      makeTraceInput('capEolDeratingPct', 'EOL降额', eolDeratingPct, traceSource(input, 'capEolDeratingPct', input.capEolDeratingPct === undefined), '%', input.capEolDeratingPct === undefined ? '未提供，假设20%' : undefined, traceEvidenceId(input, 'capEolDeratingPct')),
      makeTraceInput('capLowTempDeratingPct', '低温降额', lowTempDeratingPct, traceSource(input, 'capLowTempDeratingPct', input.capLowTempDeratingPct === undefined), '%', input.capLowTempDeratingPct === undefined ? '未提供，假设30%' : undefined, traceEvidenceId(input, 'capLowTempDeratingPct')),
      makeTraceInput('capRatedRippleCurrentA', '电容额定允许纹波电流', capRippleRatingA ?? '缺输入', traceSource(input, 'capRatedRippleCurrentA', capRippleRatingA === undefined), 'A RMS', capRippleRatingA === undefined ? '未提供电容 datasheet 允许纹波电流，无法形成确定性比较' : undefined, traceEvidenceId(input, 'capRatedRippleCurrentA')),
      makeTraceInput('capRatedLifeHours', '电容额定寿命', capRatedLifeHours ?? '缺输入', traceSource(input, 'capRatedLifeHours', capRatedLifeHours === undefined), 'h', capRatedLifeHours === undefined ? '未提供电容额定寿命' : undefined, traceEvidenceId(input, 'capRatedLifeHours')),
      makeTraceInput('capRatedTempC', '电容额定寿命测试温度', capRatedTempC ?? '缺输入', traceSource(input, 'capRatedTempC', capRatedTempC === undefined), '℃', capRatedTempC === undefined ? '未提供电容额定温度' : undefined, traceEvidenceId(input, 'capRatedTempC')),
      makeTraceInput('capUseTempC', '电容使用温度', capUseTempC ?? '缺输入', traceSource(input, 'tAmbientC', capUseTempC === undefined), '℃', capUseTempC === undefined ? '未提供使用温度' : undefined, traceEvidenceId(input, 'tAmbientC')),
    ],
    formula: 'I_ripple = I_peak·√[2m(√3/(4π)+pf²(√3/π−9m/16))]；C_eff=C_nom·(1−tol)·(1−EOL)·(1−lowTemp)',
    standardRef: 'DC-Link capacitor ripple-current rating；具体电容 datasheet 与项目寿命/低温要求',
    threshold: { value: capRippleRatingA ?? 0, unit: 'A RMS', label: '当前电容 datasheet 允许纹波电流' },
    verdict: p013Veto ? 'CRITICAL' : (capRippleRatingA !== undefined && rippleCurrentEst > capRippleRatingA ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P013',
    name: '母线去耦电容容量与纹波电流耐受评估 (DC-Link Capacitor Margins & Aging)',
    triggered: p013Triggered,
    corePhysicalChain: '逆变器三相高频开关 → 抽取大脉冲高频纹波电流 → DC-Link电容自发热升温与电解液干涸 → 电容老化失效与母线瞬态吸收能力丧失',
    calculatedValues: p013CalculatedValues,
    trace: [p013Trace],
    riskLevel: capRippleRatingA !== undefined && rippleCurrentEst > capRippleRatingA ? 'High' : 'Medium',
    confidence: p013Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p013Veto,
    vetoReason: p013Veto
      ? '母线电容纹波电流严重超出器件最大额定值，存在内部过热爆浆与失火风险！'
      : (p013VetoBase ? '电流峰值为假设值，按当前假设纹波电流已严重超标——强烈建议尽快提供实测电流以确认结论' : undefined),
    candidateMeasures: [
      '选用耐高温车规固液混合铝电解电容或车规级贴片薄膜电容',
      '在电解电容旁近距离并联多颗 X7R 陶瓷电容分担高频纹波电流',
    ],
    sideEffects: ['增加混合固态电容单板增加 BOM 成本 $0.35'],
    verificationItems: ['宽带电流探头卡在电容支路，在几个不同调制比/负载下取一个基波周期的RMS，核实闭式解估算值；热电偶实测长期满载下电解电容中心防爆阀表面温升不超过环境 +15℃'],
    unknownsToTest: ['电容 ESR 随运行年限增长的倍率变化曲线 (典型 10 年后增加 2~3 倍)'],
  }
}
