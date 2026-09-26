import type { BusPumpingResult, MillerRiskResult, SnubberCalcResult } from '../types/motorDrive';

/**
 * 车载/机器人 BLDC 电机驱动物理计算引擎 (Motor Physics Engine)
 * 纯确定性数学模型，无第三方依赖，严格对齐车规 ISO 16750-2 / CISPR 25 与功率半导体机理
 */

/**
 * 1. 急停与制动时电机机械动能向母线倒灌过压 (Bus Pumping Peak) 计算
 * 物理原理：制动瞬间若无下桥能耗制动或主动吸收，转子动能 Ek = 0.5 * J * w^2 将按转化效率倒灌至母线电容，
 * 电容电压从初始 V_bus_nom 泵升至 V_bus_peak。
 */
export function calculateBusPumping(params: {
  V_bus_nom: number;            // 标称母线电压 (V)，例如 12V / 24V / 48V
  V_bus_max_rating: number;     // 母线电容或 MOS 额定耐压 (V)，例如 40V / 60V / 100V
  C_dc_uF: number;              // 母线有效去耦滤波电容总和 (μF)
  J_kg_m2: number;              // 电机转子与折算负载总转动惯量 (kg·m²)
  n_rpm: number;                // 制动前电机最高转速 (rpm)
  regenEfficiency?: number;     // 动能转化为电能比例 (0~1, 默认 0.75，扣除机械摩擦与铜耗)
  L_harness_uH?: number;        // 线束寄生电感 (μH, 可选)
  I_phase_A?: number;           // 急停前相电流 (A, 可选)
}): BusPumpingResult {
  const {
    V_bus_nom,
    V_bus_max_rating,
    C_dc_uF,
    J_kg_m2,
    n_rpm,
    regenEfficiency = 0.75,
    L_harness_uH = 0,
    I_phase_A = 0,
  } = params;

  // 1. 计算角速度 omega = 2 * pi * n / 60 (rad/s)
  const omega = (2 * Math.PI * Math.max(0, n_rpm)) / 60;

  // 2. 机械转动总动能 Ek = 0.5 * J * omega^2 (Joules)
  const kineticEnergyJoules = 0.5 * Math.max(0, J_kg_m2) * Math.pow(omega, 2);

  // 3. 线束电感释放的电磁能量 EL = 0.5 * L * I^2 (Joules)
  const harnessEnergyJoules =
    0.5 * (Math.max(0, L_harness_uH) * 1e-6) * Math.pow(Math.max(0, I_phase_A), 2);

  // 4. 倒灌到母线电容的总能量
  const regenEnergyJoules =
    kineticEnergyJoules * Math.min(1, Math.max(0, regenEfficiency)) + harnessEnergyJoules;

  // 5. 母线电容初始储能 Ec0 = 0.5 * C * V_nom^2
  const C_farad = Math.max(1, C_dc_uF) * 1e-6;
  const initialCapEnergy = 0.5 * C_farad * Math.pow(V_bus_nom, 2);

  // 6. 最终总能量与泵升电压 V_bus_peak = sqrt(2 * (Ec0 + E_regen) / C)
  const totalEnergy = initialCapEnergy + regenEnergyJoules;
  const V_bus_peak = Math.sqrt((2 * totalEnergy) / C_farad);
  const voltageRise = V_bus_peak - V_bus_nom;
  const voltageMarginV = V_bus_max_rating - V_bus_peak;
  const isOverVoltage = V_bus_peak > V_bus_max_rating;

  let severity: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
  let recommendation = '母线电压在安全降额范围内，电容与MOS耐压满足降额规范。';

  if (isOverVoltage) {
    severity = 'CRITICAL';
    recommendation = `【严重超标】泵升电压 (${V_bus_peak.toFixed(1)}V) 突破器件额定耐压 (${V_bus_max_rating}V)！可能瞬间击穿电容或下桥MOS！建议：1. 软件急停改为三相全下桥短接动态能耗制动；2. 母线并联 TVS/大功率双向瞬变二极管；3. 增大母线电容至 ${(C_dc_uF * 2).toFixed(0)}μF 以上。`;
  } else if (voltageMarginV < V_bus_max_rating * 0.15) {
    severity = 'WARNING';
    recommendation = `【裕量偏紧】耐压安全裕量仅剩 ${voltageMarginV.toFixed(1)}V (<15%)。考虑冷车环境电解电容容量衰减与ESR升高，建议加大电容或在控制算法中加入减速斜坡限制。`;
  }

  return {
    kineticEnergyJoules: Number(kineticEnergyJoules.toFixed(3)),
    regenEnergyJoules: Number(regenEnergyJoules.toFixed(3)),
    V_bus_peak: Number(V_bus_peak.toFixed(2)),
    voltageRise: Number(voltageRise.toFixed(2)),
    isOverVoltage,
    voltageMarginV: Number(voltageMarginV.toFixed(2)),
    severity,
    recommendation,
  };
}
