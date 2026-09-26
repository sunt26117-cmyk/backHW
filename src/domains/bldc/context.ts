import type { BldcEvaluationInput } from './types';
import { calculateBldcBusPumping, type BldcBusPumpingCalculation } from './calculations/busPumping';
import { calculateBldcThermal, type BldcThermalCalculation } from './calculations/thermal';

export interface BldcPatternContext {
  /** Normalized case values shared by patterns. */
  readonly vbusNominalSafe: number;
  readonly vbusNominalWasAssumed: boolean;
  /** Shared physical calculations. Patterns consume, but do not own, these models. */
  readonly bus: BldcBusPumpingCalculation;
  readonly thermal: BldcThermalCalculation;
}

export function createBldcPatternContext(input: BldcEvaluationInput): BldcPatternContext {
  const vbusNominalWasAssumed = !Number.isFinite(input.vbusNominal);
  const vbusNominalSafe = Number.isFinite(input.vbusNominal) ? input.vbusNominal : 13.5;
  const base = { vbusNominalSafe, vbusNominalWasAssumed };
  return {
    ...base,
    bus: calculateBldcBusPumping(input, vbusNominalSafe, vbusNominalWasAssumed),
    thermal: calculateBldcThermal(input, vbusNominalSafe),
  };
}
