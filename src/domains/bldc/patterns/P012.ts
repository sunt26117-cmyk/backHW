import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP012(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P012: 自举电压不足 (Section 4)
  // ----------------------------------------------------
  const p012Assumptions: string[] = [];
  const cBootNf = 220;
  const iLeakUa = 85;
  const qgNc = input.gateChargeQgNc !== undefined ? input.gateChargeQgNc : 30;
  if (input.gateChargeQgNc === undefined) p012Assumptions.push('高边MOSFET栅电荷Qg未提供，假设30nC');
  const swFreqForBoot = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  // [FIX-6] 原来只算了静态漏电流 I_leak，漏掉了每次开关从自举电容抽走的栅极电荷这一项：
  // 在开关频率下, I_eq_switching = Qg × f_sw，典型参数下这一项比静态漏电流大一个数量级，
  // 是被低估的主导项。
  const iSwitchingEquivalentUa = qgNc * 1e-9 * swFreqForBoot * 1e6; // 转换为 μA
  const iTotalUa = iLeakUa + iSwitchingEquivalentUa;
  const maxOnTimeMs = (cBootNf * 1e-9 * 1.6) / (iTotalUa * 1e-6) * 1000;

  const bootChargeLoopOhm = input.bootChargeLoopOhm;
  const refreshWindowUs = input.bootRefreshWindowUs !== undefined ? input.bootRefreshWindowUs : 1.5;
  let refreshFractionChargedPct: number | undefined;
  if (bootChargeLoopOhm !== undefined && bootChargeLoopOhm > 0) {
    const tauUs = (bootChargeLoopOhm * cBootNf * 1e-9) * 1e6;
    refreshFractionChargedPct = (1 - Math.exp(-refreshWindowUs / tauUs)) * 100;
  } else {
    p012Assumptions.push('自举充电回路总电阻(R_boot+R_diode+Rdson_LS)未提供，无法核验刷新窗口是否足够把自举电容充满');
  }
  const p012RefreshInsufficient = refreshFractionChargedPct !== undefined && refreshFractionChargedPct < 90;

  const p012CalculatedValues: Record<string, string | number> = {
    '自举电容容量 C_boot (nF)': cBootNf,
    '高边驱动静态偏置漏电流 (μA)': iLeakUa,
    '每次开关抽取的等效电流 Qg×fsw (μA)': Number(iSwitchingEquivalentUa.toFixed(1)),
    '合计等效泄放电流 (μA，此前版本遗漏了开关抽取项)': Number(iTotalUa.toFixed(1)),
    '计入开关抽取项后的最大允许持续上桥导通时间 (ms)': Number(maxOnTimeMs.toFixed(2)),
    '强制刷新窗口设定 (μs)': refreshWindowUs,
  };
  if (refreshFractionChargedPct !== undefined) {
    p012CalculatedValues['刷新窗口内自举电容充电完成度 (%)'] = Number(refreshFractionChargedPct.toFixed(0));
  }
  pushAssumptionNote(p012CalculatedValues, p012Assumptions);

  const p012Trace = makeTraceNode({
    id: 'bldcPattern:P012.bootstrapRefresh',
    title: '自举刷新窗口充电完成度',
    value: refreshFractionChargedPct !== undefined ? refreshFractionChargedPct : '无法计算',
    unit: refreshFractionChargedPct !== undefined ? '%' : undefined,
    inputs: [
      makeTraceInput('cBootNf', '自举电容 Cboot', cBootNf, 'SPEC_CONSTANT', 'nF', '当前模型固定220nF，应该用具体驱动/外围实测或BOM参数替换'),
      makeTraceInput('gateChargeQgNc', '高边 MOSFET 栅电荷 Qg', qgNc, traceSource(input, 'gateChargeQgNc', input.gateChargeQgNc === undefined), 'nC', input.gateChargeQgNc === undefined ? '未提供，假设30nC' : undefined, traceEvidenceId(input, 'gateChargeQgNc')),
      makeTraceInput('pwmSwitchingFreqHz', 'PWM频率', swFreqForBoot, traceSource(input, 'pwmSwitchingFreqHz', input.pwmSwitchingFreqHz === undefined), 'Hz', input.pwmSwitchingFreqHz === undefined ? '未提供，假设20kHz' : undefined, traceEvidenceId(input, 'pwmSwitchingFreqHz')),
      makeTraceInput('bootChargeLoopOhm', '自举充电回路总电阻', bootChargeLoopOhm !== undefined ? bootChargeLoopOhm : '缺输入', traceSource(input, 'bootChargeLoopOhm', bootChargeLoopOhm === undefined), 'Ω', bootChargeLoopOhm === undefined ? '未提供，无法验证刷新时间常数' : undefined, traceEvidenceId(input, 'bootChargeLoopOhm')),
      makeTraceInput('bootRefreshWindowUs', '强制刷新窗口', refreshWindowUs, traceSource(input, 'bootRefreshWindowUs', input.bootRefreshWindowUs === undefined), 'μs', input.bootRefreshWindowUs === undefined ? '未提供，假设1.5μs' : undefined, traceEvidenceId(input, 'bootRefreshWindowUs')),
    ],
    formula: 'I_eq=I_leak+Qg·fsw；τ=R_boot·C_boot；Charge%=1−e^(−t_refresh/τ)（若R_boot缺失则不可判定）',
    standardRef: '实际门极驱动 bootstrap design；驱动芯片 application note',
    threshold: { value: 90, unit: '%', label: '刷新窗口目标充电完成度' },
    verdict: p012RefreshInsufficient
      ? 'CRITICAL'
      : refreshFractionChargedPct === undefined
        ? 'INFO'
        : (refreshFractionChargedPct < 95 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P012',
    name: '高边自举电路充电动能不足 (Bootstrap Voltage Margin & Refresh Strategy)',
    triggered: p012RefreshInsufficient,
    corePhysicalChain: 'PWM 占空比逼近 100% → 下桥导通时间极短 → 自举电容无法充满电 → 高边门极浮动电压缓慢跌落 → 上桥 MOSFET 进入线性放大区发热烧毁。泄放电流除静态漏电流外，每次开关从自举电容抽走的栅极电荷 (Qg×fsw) 往往是主导项',
    calculatedValues: p012CalculatedValues,
    trace: [p012Trace],
    riskLevel: p012RefreshInsufficient ? 'Medium-High' : 'Medium',
    confidence: p012Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p012RefreshInsufficient,
    vetoReason: p012RefreshInsufficient
      ? `按自举充电回路时间常数估算，${refreshWindowUs}μs 的刷新窗口只能把自举电容充到约${refreshFractionChargedPct?.toFixed(0)}%，与"占空比限制"的设计意图自相矛盾，需要加长刷新窗口或减小回路电阻/电容`
      : undefined,
    candidateMeasures: [
      `固件强制限制最大 PWM 占空比，保证每个周期下管开启时间足以把自举电容充到90%以上（当前假设参数下建议刷新窗口 ≥ ${bootChargeLoopOhm ? (bootChargeLoopOhm * cBootNf * 1e-9 * 1e6 * 2.3).toFixed(1) : '(需提供回路电阻后计算)'}μs）`,
      '或者高边采用电荷泵 (Charge Pump) 辅助电路维持 100% 占空比无限时开通',
    ],
    sideEffects: ['占空比上限会略微损失电机最高转速上限'],
    verificationItems: ['示波器高压隔离差分探头跨接在上管 VB-VS 引脚，观测持续重载时的自举电压跌落，实测 Qg×fsw 项与静态漏电流项的真实占比'],
    unknownsToTest: ['自举二极管高温反向漏电流 Ir 对自举电容电荷泄放的加速影响'],
  }
}
