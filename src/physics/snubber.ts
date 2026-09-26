import type { SnubberCalcResult } from '../types/motorDrive';

/**
 * 3. 开关节点 RC Snubber 缓冲器最佳阻尼计算 (Snubber Calculator)
 * 物理原理：开关节点高频振铃由功率回路寄生杂散电感 L_loop 与 MOSFET 输出电容 C_oss 谐振引起：
 * f_ring = 1 / (2 * pi * sqrt(L_loop * C_oss))
 * 推荐吸收电容 C_snub = 2 ~ 3 * C_oss
 * 推荐吸收电阻（特征阻抗临界阻尼） R_snub = sqrt(L_loop / C_snub)
 */
export function calculateSnubberParams(params: {
  f_ring_MHz: number;    // 示波器实测振铃频率 (MHz)，例如 30~80MHz
  C_oss_pF: number;      // MOSFET 输出电容 (pF)，例如 500~1500pF
  V_bus_V?: number;      // 母线供电电压 (V)，例如 13.5V / 24V / 48V
  f_sw_kHz?: number;     // PWM 开关频率 (kHz)，例如 20kHz
}): SnubberCalcResult {
  const {
    f_ring_MHz,
    C_oss_pF,
    V_bus_V = 13.5,
    f_sw_kHz = 20,
  } = params;

  const f_ring_hz = Math.max(1, f_ring_MHz) * 1e6;
  const C_oss_farad = Math.max(10, C_oss_pF) * 1e-12;

  // 1. 反推环路寄生电感 L_loop = 1 / ( (2*pi*f)^2 * C_oss )
  const loopInductanceH = 1 / (Math.pow(2 * Math.PI * f_ring_hz, 2) * C_oss_farad);
  const loopInductanceNh = loopInductanceH * 1e9;

  // 2. 推荐 C_snub 取 2 倍 C_oss
  const recommendedCsnubPf = Math.round(C_oss_pF * 2);
  const C_snub_farad = recommendedCsnubPf * 1e-12;

  // 3. 推荐 R_snub 取特征阻抗阻尼 R = sqrt(L / C_snub)
  const recommendedRsnubOhm = Math.round(Math.sqrt(loopInductanceH / C_snub_farad) * 10) / 10;

  // 4. 单相 RC 吸收电阻功率损耗 P_snub = C_snub * V_bus^2 * f_sw
  const f_sw_hz = f_sw_kHz * 1e3;
  const snubberPowerDissipationW = C_snub_farad * Math.pow(V_bus_V, 2) * f_sw_hz;

  // 5. 预期 EMI 尖峰衰减 (典型可削减 6~14 dB 的高频谐波尖峰)
  const attenuationDbe = Math.min(16, Math.max(6, Math.round(8 + Math.log10(recommendedCsnubPf / 100) * 3)));

  return {
    loopInductanceNh: Number(loopInductanceNh.toFixed(1)),
    recommendedCsnubPf,
    recommendedRsnubOhm: Math.max(1, recommendedRsnubOhm),
    snubberPowerDissipationW: Number(snubberPowerDissipationW.toFixed(3)),
    dampingRatio: 0.707, // 临界阻尼设计
    attenuationDbe,
  };
}
