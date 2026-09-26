import type { MillerRiskResult } from '../types/motorDrive';

/**
 * 米勒预警安全裕量阈值 (V)：门极开启安全裕量低于此值即判定为 WARNING 级临界预警。
 * 之前这个数字直接写死在下面 checkMillerRisk() 的字符串拼接里，不容易被别处复用/统一调整。
 */
export const MILLER_WARNING_MARGIN_V = 0.6;

/**
 * 2. 米勒感应直通风险评估 (Miller Cross-Conduction Check)
 * 物理原理：桥臂一侧对管高 dv/dt 开通时，处于关断态的管子由于 C_gd 米勒电容耦合位移电流 Im = C_gd * dv/dt，
 * 该电流流经门极关断下拉回路阻抗 Rg_pulldown，在栅极感应出正电压 Vg_induced。
 * 若 Vg_induced >= V_th_min，该关断管将发生假开通，引发母线对地同桥臂瞬时直通 (Shoot-through) 甚至炸管。
 */
export function checkMillerRisk(params: {
  V_th_min: number;              // 门极最小开启阈值电压 (V)，例如 2.0V
  C_gd_pF: number;               // 栅漏电容 / 米勒电容 (pF)，例如 35pF
  C_gs_pF?: number;              // 栅源输入电容 (pF)，用于容性分压界 Cgd/(Cgd+Cgs)·Vbus
  R_g_pulldown_ohm: number;      // 门极关断回路总有效阻抗 (Ω, 驱动下拉内阻 + 外置阻抗 + MOS内部Rg)
  dv_dt_V_per_ns: number;        // 开关节点反向对管开启导致的电压上升率 (V/ns)，例如 5~15 V/ns
  hasActiveMillerClamp?: boolean;// 是否启用了预驱芯片内置的有源米勒钳位 (Active Miller Clamp)
  // ---- [先进模型，由 bldcPatternEngine P003 提升而来] 以下均为可选；不提供时退化为原“阻性上界”行为，保证向后兼容 ----
  V_bus_V?: number;              // 母线电压 (V)，配合 C_gs_pF 启用容性分压界
  L_source_nH?: number;          // 源极寄生电感 (nH)
  di_dt_A_per_ns?: number;       // 开关电流变化率 (A/ns)，配合 L_source_nH 估算门极感应过冲
  V_gs_measured_V?: number;      // 示波器实测门极尖峰 (V)：有实测时优先于理论估算，因为实测涵盖模型未覆盖的寄生路径
}): MillerRiskResult {
  const {
    V_th_min,
    C_gd_pF,
    C_gs_pF,
    R_g_pulldown_ohm,
    dv_dt_V_per_ns,
    hasActiveMillerClamp = false,
    V_bus_V,
    L_source_nH,
    di_dt_A_per_ns,
    V_gs_measured_V,
  } = params;

  // dv/dt: 1 V/ns = 1e9 V/s
  // Im = C_gd * (dv/dt) = (C_gd * 1e-12) * (dv_dt * 1e9) = C_gd * dv_dt * 1e-3 (Amperes)
  const millerCurrentA = (C_gd_pF * dv_dt_V_per_ns) / 1000;

  // 界1 阻性上界：Vg = Im · Rg_pulldown
  let vGateInducedResistiveV = millerCurrentA * R_g_pulldown_ohm;
  // 若启用硬件有源米勒钳位，内部低阻 MOSFET (<0.5Ω) 强行钳位，大幅衰减感应电压 (衰减至约 15%)
  if (hasActiveMillerClamp) {
    vGateInducedResistiveV *= 0.15;
  }

  // 界2 容性分压界：Vg = Cgd/(Cgd+Cgs) · Vbus（仅在同时给出 Cgs 与母线电压时启用）
  const hasCapacitiveBound =
    typeof C_gs_pF === 'number' && Number.isFinite(C_gs_pF) && C_gs_pF > 0 &&
    typeof V_bus_V === 'number' && Number.isFinite(V_bus_V);
  const vGateInducedCapacitiveV = hasCapacitiveBound
    ? (C_gd_pF / (C_gd_pF + (C_gs_pF as number))) * (V_bus_V as number)
    : undefined;

  // 真实感应电压是两个界的较小值：开关沿很短时容性分压界更紧，阻性上界会显著高估。
  const vGateInducedV = vGateInducedCapacitiveV !== undefined
    ? Math.min(vGateInducedResistiveV, vGateInducedCapacitiveV)
    : vGateInducedResistiveV;

  // 源极寄生电感 di/dt 过冲：V_L = L_source(nH) · di/dt(A/ns) = V（量纲正好，无需换算）
  const inductiveOvershootV =
    (typeof L_source_nH === 'number' && Number.isFinite(L_source_nH) ? L_source_nH : 0) *
    (typeof di_dt_A_per_ns === 'number' && Number.isFinite(di_dt_A_per_ns) ? di_dt_A_per_ns : 0);
  const theoreticalVGateV = vGateInducedV + inductiveOvershootV;

  // 有示波器实测门极尖峰时优先采用实测值判定风险/裕量。
  const hasMeasured = typeof V_gs_measured_V === 'number' && Number.isFinite(V_gs_measured_V);
  const vGateInducedTotalV = hasMeasured ? (V_gs_measured_V as number) : theoreticalVGateV;

  const safetyMarginV = V_th_min - vGateInducedTotalV;
  const isRiskOfShootThrough = vGateInducedTotalV >= V_th_min;

  let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL_SHOOT_THROUGH' = 'SAFE';
  let recommendation = '门极米勒感应电压低于器件阈值，处于安全裕量范围内。';

  if (isRiskOfShootThrough) {
    riskLevel = 'CRITICAL_SHOOT_THROUGH';
    recommendation = `【极度危险：直通炸管隐患】门极感应电压 (${vGateInducedTotalV.toFixed(2)}V${hasMeasured ? '，示波器实测' : '，理论估算'}) 已经跨越门极开启阈值 (${V_th_min}V)！在高温时门极阈值进一步漂移下降，必发生同臂直通！建议：1. 开启驱动器有源米勒钳位；2. 增加门极外置抗拉电阻或关断反向并联二极管；3. 适当调大开通电阻以限制对管 dv/dt；4. 选用 C_gd/C_gs 比值更小的车规级 MOSFET。`;
  } else if (safetyMarginV < MILLER_WARNING_MARGIN_V) {
    riskLevel = 'WARNING';
    recommendation = `【临界预警】门极开启安全裕量仅 ${safetyMarginV.toFixed(2)}V (<${MILLER_WARNING_MARGIN_V}V)。汽车环境在 125℃~150℃ 时 V_th 会衰减 20%~30%，存在偶发微导通发热风险，建议优化门极关断回路。`;
  }

  return {
    millerCurrentA: Number(millerCurrentA.toFixed(3)),
    vGateInducedV: Number(vGateInducedTotalV.toFixed(2)),
    vThMinV: Number(V_th_min.toFixed(2)),
    safetyMarginV: Number(safetyMarginV.toFixed(2)),
    isRiskOfShootThrough,
    riskLevel,
    recommendation,
    vGateInducedResistiveV: Number(vGateInducedResistiveV.toFixed(2)),
    vGateInducedCapacitiveV: vGateInducedCapacitiveV !== undefined ? Number(vGateInducedCapacitiveV.toFixed(2)) : undefined,
    inductiveOvershootV: Number(inductiveOvershootV.toFixed(2)),
    theoreticalVGateV: Number(theoreticalVGateV.toFixed(2)),
    modelUsed: hasMeasured ? 'MEASURED' : 'THEORETICAL',
    hasCapacitiveBound,
  };
}
