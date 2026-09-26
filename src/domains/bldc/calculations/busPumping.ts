import { calculateBusPumping } from '../../../physics/motorPhysicsEngine';
import type { BldcEvaluationInput } from '../types';

export interface BldcBusPumpingCalculation {
  regenEfficiencyTypical: number;
  regenEfficiencyWorstCase: number;
  cbusUfEffective: number;
  loopInductanceUh: number;
  kineticEnergy: number;
  electricalEnergyTypical: number;
  electricalEnergyWorstCase: number;
  theoreticalVbusPeakTypical: number;
  theoreticalVbusPeakWorstCase: number;
  hasMeasuredVbus: boolean;
  measuredVbus: number;
  deltaTheoretical: number;
  diffFromMeasured?: number;
  assumptions: string[];
  veto: boolean;
}

/** Shared P001/P014 bus transient calculation. No UI, AI, or scenario dependencies. */
export function calculateBldcBusPumping(
  input: BldcEvaluationInput,
  vbusNominalSafe: number,
  vbusNominalWasAssumed: boolean,
): BldcBusPumpingCalculation {
  const assumptions: string[] = [];
  if (vbusNominalWasAssumed) {
    assumptions.push('母线标称电压 vbusNominal 未提供（自由文本里只给出了泵升后的峰值，没有说明泵升前的标称值），假设为 13.5V（典型车规12V系统充电态标称电压）——这是本条判据里置信度最低的一个假设，建议优先补充');
  }

  const regenEfficiencyTypical = 0.75;
  const regenEfficiencyWorstCase = 1.0;
  if (!input.cbusUf || input.cbusUf <= 0) assumptions.push('母线电容 cbusUf 未提供，假设 470μF');
  const cbusUfEffective = input.cbusUf && input.cbusUf > 0 ? input.cbusUf : 470;
  const loopInductanceUh = input.loopInductanceNh !== undefined && input.loopInductanceNh > 0
    ? input.loopInductanceNh / 1000
    : 0;
  if (loopInductanceUh === 0) {
    assumptions.push('未提供回路/线束寄生电感 loopInductanceNh，泵升计算未计入线束电感储能 0.5·L·I²（该项实际存在，会低估尖峰）');
  }

  const params = {
    V_bus_nom: vbusNominalSafe,
    V_bus_max_rating: input.vdsRating,
    C_dc_uF: cbusUfEffective,
    J_kg_m2: input.jInertia,
    n_rpm: input.rpm,
    L_harness_uH: loopInductanceUh,
    I_phase_A: Number.isFinite(input.currentPeakA) ? input.currentPeakA : 0,
  };

  const typical = calculateBusPumping({ ...params, regenEfficiency: regenEfficiencyTypical });
  const worst = calculateBusPumping({ ...params, regenEfficiency: regenEfficiencyWorstCase });
  const kineticEnergy = worst.kineticEnergyJoules;
  const hasMeasuredVbus = input.vbusMeasuredPeak !== undefined && Number.isFinite(input.vbusMeasuredPeak);
  const measuredVbus = hasMeasuredVbus ? input.vbusMeasuredPeak! : worst.V_bus_peak;
  if (!hasMeasuredVbus) assumptions.push('无台架实测 Vbus 峰值，以下"Vbus_meas"实为理论最坏值代入，并非实测数据');

  const theoreticalVbusPeakTypical = typical.V_bus_peak;
  const theoreticalVbusPeakWorstCase = worst.V_bus_peak;
  const diffFromMeasured = hasMeasuredVbus
    ? Math.abs(theoreticalVbusPeakTypical - measuredVbus)
    : undefined;

  return {
    regenEfficiencyTypical,
    regenEfficiencyWorstCase,
    cbusUfEffective,
    loopInductanceUh,
    kineticEnergy,
    electricalEnergyTypical: kineticEnergy * regenEfficiencyTypical,
    electricalEnergyWorstCase: kineticEnergy * regenEfficiencyWorstCase,
    theoreticalVbusPeakTypical,
    theoreticalVbusPeakWorstCase,
    hasMeasuredVbus,
    measuredVbus,
    deltaTheoretical: theoreticalVbusPeakTypical - vbusNominalSafe,
    diffFromMeasured,
    assumptions,
    veto: hasMeasuredVbus
      ? theoreticalVbusPeakWorstCase >= input.vdsRating || measuredVbus >= input.vdsRating
      : theoreticalVbusPeakWorstCase >= input.vdsRating,
  };
}
