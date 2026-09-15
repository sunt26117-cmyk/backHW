import { IssueInput, MeasurementSource } from '../types';
import { calculateBusPumping, checkMillerRisk } from './motorPhysicsEngine';

export type DeterministicCalculationStatus = 'CALCULATED' | 'INSUFFICIENT_INPUT';

export interface BldcCalculationEvidence {
  id: string;
  key: string;
  title: string;
  status: DeterministicCalculationStatus;
  value?: number;
  unit: string;
  engine: 'motorPhysicsEngine';
  calculation: 'busPumping' | 'millerRisk';
  formula: string;
  inputs: string[];
  inputSources: Record<string, MeasurementSource | 'MISSING' | 'DEFAULT_FOR_NONENGINE_PARAMETER'>;
  missingInputs: string[];
  specThreshold?: number;
  safetyMargin?: number;
  complianceVerdict?: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL';
  directiveForAi: string;
}

function finiteNumber(issue: IssueInput, key: string): number | undefined {
  const raw = issue.measuredValues?.[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function sourceFor(issue: IssueInput, key: string): MeasurementSource | 'MISSING' {
  if (finiteNumber(issue, key) === undefined) return 'MISSING';
  return issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'UNKNOWN';
}

function buildBusPumping(issue: IssueInput): BldcCalculationEvidence {
  const inputs = ['busVoltageNominalV', 'cBusUf', 'rotorInertiaKgm2', 'rpm', 'vdsRatingV'];
  const values = Object.fromEntries(inputs.map((key) => [key, finiteNumber(issue, key)])) as Record<string, number | undefined>;
  const missingInputs = inputs.filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key)])) as BldcCalculationEvidence['inputSources'];

  if (missingInputs.length > 0) {
    return {
      id: 'BLDC_BUS_PUMPING',
      key: 'bldc.busPumpingPeakV',
      title: 'BLDC 母线泵升理论峰值',
      status: 'INSUFFICIENT_INPUT',
      unit: 'V',
      engine: 'motorPhysicsEngine',
      calculation: 'busPumping',
      formula: 'V_peak = sqrt(V_nom² + 2·E_regen/Cbus)，E_regen 基于 0.5·J·ω²',
      inputs: inputs.map((key) => `measuredValues.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `measuredValues.${key}`),
      directiveForAi: `当前 BLDC 母线泵升缺少结构化输入：${missingInputs.join(', ')}。不得输出确定性的泵升峰值；不得从自由文本或默认参数补齐。`,
    };
  }

  const pumping = calculateBusPumping({
    V_bus_nom: values.busVoltageNominalV!,
    V_bus_max_rating: values.vdsRatingV!,
    C_dc_uF: values.cBusUf!,
    J_kg_m2: values.rotorInertiaKgm2!,
    n_rpm: values.rpm!,
    regenEfficiency: 0.75,
  });

  return {
    id: 'BLDC_BUS_PUMPING',
    key: 'bldc.busPumpingPeakV',
    title: 'BLDC 母线泵升理论峰值',
    status: 'CALCULATED',
    value: pumping.V_bus_peak,
    unit: 'V',
    engine: 'motorPhysicsEngine',
    calculation: 'busPumping',
    formula: 'V_peak = sqrt(V_nom² + 2·E_regen/Cbus)，E_regen 基于 0.5·J·ω²',
    inputs: inputs.map((key) => `measuredValues.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: values.vdsRatingV,
    safetyMargin: pumping.voltageMarginV,
    complianceVerdict: pumping.isOverVoltage ? 'CRITICAL' : pumping.voltageMarginV < 3 ? 'MARGINAL' : 'PASS',
    directiveForAi: `BLDC 母线泵升理论峰值由本地 motorPhysicsEngine 计算为 ${pumping.V_bus_peak.toFixed(2)}V；耐压裕量 ${pumping.voltageMarginV.toFixed(2)}V。模型不得自行重算出另一套当前项目数值。`,
  };
}

function buildMiller(issue: IssueInput): BldcCalculationEvidence {
  const inputs = ['dvdtVns', 'cgdPf', 'rgOffOhm', 'vthMinV'];
  const values = Object.fromEntries(inputs.map((key) => [key, finiteNumber(issue, key)])) as Record<string, number | undefined>;
  const missingInputs = inputs.filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key)])) as BldcCalculationEvidence['inputSources'];

  if (missingInputs.length > 0) {
    return {
      id: 'BLDC_MILLER_RISK',
      key: 'bldc.miller.vGateInducedV',
      title: 'BLDC Miller 感应门极峰值',
      status: 'INSUFFICIENT_INPUT',
      unit: 'V',
      engine: 'motorPhysicsEngine',
      calculation: 'millerRisk',
      formula: 'Vgs_induced ≈ Cgd·dv/dt·Rg',
      inputs: inputs.map((key) => `measuredValues.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `measuredValues.${key}`),
      directiveForAi: `当前 BLDC Miller 计算缺少结构化输入：${missingInputs.join(', ')}。不得用自由文本或默认参数替代，也不得输出确定性的感应峰值。`,
    };
  }

  const miller = checkMillerRisk({
    V_th_min: values.vthMinV!,
    C_gd_pF: values.cgdPf!,
    R_g_pulldown_ohm: values.rgOffOhm!,
    dv_dt_V_per_ns: values.dvdtVns!,
  });

  return {
    id: 'BLDC_MILLER_RISK',
    key: 'bldc.miller.vGateInducedV',
    title: 'BLDC Miller 感应门极峰值',
    status: 'CALCULATED',
    value: miller.vGateInducedV,
    unit: 'V',
    engine: 'motorPhysicsEngine',
    calculation: 'millerRisk',
    formula: 'Vgs_induced ≈ Cgd·dv/dt·Rg',
    inputs: inputs.map((key) => `measuredValues.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: values.vthMinV,
    safetyMargin: miller.safetyMarginV,
    complianceVerdict: miller.isRiskOfShootThrough ? 'CRITICAL' : miller.safetyMarginV < 0.5 ? 'MARGINAL' : 'PASS',
    directiveForAi: `BLDC Miller 感应门极峰值由本地 motorPhysicsEngine 计算为 ${miller.vGateInducedV.toFixed(2)}V；Vth=${values.vthMinV}V，安全裕量 ${miller.safetyMarginV.toFixed(2)}V。不得自行重算出另一套当前项目数值。`,
  };
}

export function calculateBldcDeterministicCalculations(issue: IssueInput): BldcCalculationEvidence[] {
  return [buildBusPumping(issue), buildMiller(issue)];
}
