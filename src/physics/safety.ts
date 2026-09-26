/**
 * 6. 功能安全链路时间预算与采样双通道核验 (Functional Safety Chain Timing)
 * ISO 26262-5 要求：故障检测时间 + 故障处理时间 <= 故障容许时间间隔 (FHTI)
 */
export function evaluateSafetyChainTiming(params: {
  fhtiBudgetMs?: number;
  wdgTimeoutWindowMs?: number;
  safeStateTransitionMs?: number;
  currentSenseDeviationPct?: number;
}): {
  currentSenseStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL';
  currentSenseDiagnosis: string;
  timingCompliance: 'PASS' | 'CRITICAL';
  marginMs: number;
  detail: string;
} {
  const {
    fhtiBudgetMs = 10.0,
    wdgTimeoutWindowMs = 4.0,
    safeStateTransitionMs = 2.2,
    currentSenseDeviationPct = 3.2,
  } = params;

  // 总反应时间 = 看门狗超时检测 + 安全状态切换执行
  const totalResponseTimeMs = wdgTimeoutWindowMs + safeStateTransitionMs;
  const marginMs = Number((fhtiBudgetMs - totalResponseTimeMs).toFixed(2));
  const timingCompliance = marginMs >= 0 ? 'PASS' : 'CRITICAL';

  let currentSenseStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL' = 'COMPLIANT';
  let currentSenseDiagnosis = '双通道采样偏差 < 5%，满足主监控通道冗余比对标准。';

  if (currentSenseDeviationPct >= 10.0) {
    currentSenseStatus = 'CRITICAL';
    currentSenseDiagnosis = `双通道采样偏差达 ${currentSenseDeviationPct}% (>=10%)！超出安全门限，可能因偏置温漂或运放失调导致误判。`;
  } else if (currentSenseDeviationPct >= 5.0) {
    currentSenseStatus = 'WARNING';
    currentSenseDiagnosis = `双通道采样偏差为 ${currentSenseDeviationPct}% (5%~10% 预警区)，需在软件滤波中追加容差消抖。`;
  }

  const detail =
    timingCompliance === 'PASS'
      ? `看门狗窗口 (${wdgTimeoutWindowMs}ms) + 安全状态转换 (${safeStateTransitionMs}ms) = ${totalResponseTimeMs.toFixed(1)}ms <= FHTI (${fhtiBudgetMs}ms)，裕量 ${marginMs}ms 充裕。`
      : `【严重违背安全准则】总故障切换时间 (${totalResponseTimeMs.toFixed(1)}ms) 击穿 FHTI 时间预算 (${fhtiBudgetMs}ms)！`;

  return {
    currentSenseStatus,
    currentSenseDiagnosis,
    timingCompliance,
    marginMs,
    detail,
  };
}
