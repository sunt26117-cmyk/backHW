import { IssueInput, MeasurementSource, ProjectContext } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { calculateBusPumping, checkMillerRisk } from './motorPhysicsEngine';
import { extractUnifiedEngineeringModel } from './unifiedStateExtractor';

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

function sourceFor(issue: IssueInput, key: string, value: any): MeasurementSource | 'MISSING' {
  if (value === undefined || value === null) return 'MISSING';
  if (issue.measuredValues && issue.measuredValues[key] !== undefined && issue.measuredValues[key] !== '') {
    return issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'USER_MEASURED';
  }
  return 'TEXT_INFERRED' as any;
}

function buildBusPumping(issue: IssueInput, state: UnifiedEngineeringModel): BldcCalculationEvidence {
  const inputs = ['busVoltageNominalV', 'cBusUf', 'rotorInertiaKgm2', 'rpm', 'vdsRatingV'];
  
  const values: Record<string, number | undefined> = {
    busVoltageNominalV: state.electrical.vbusNominal || undefined,
    cBusUf: state.powerStage.cbusUf || undefined,
    rotorInertiaKgm2: state.motor.j || undefined,
    rpm: state.motor.maxRpm || undefined,
    vdsRatingV: state.powerStage.vdsRating || undefined,
  };

  const missingInputs = inputs.filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key, values[key])])) as BldcCalculationEvidence['inputSources'];

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
      inputs: inputs.map((key) => `state.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `state.${key}`),
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
    inputs: inputs.map((key) => `state.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: values.vdsRatingV,
    safetyMargin: pumping.voltageMarginV,
    complianceVerdict: pumping.isOverVoltage ? 'CRITICAL' : pumping.voltageMarginV < 3 ? 'MARGINAL' : 'PASS',
    directiveForAi: `BLDC 母线泵升理论峰值由本地 motorPhysicsEngine 计算为 ${pumping.V_bus_peak.toFixed(2)}V；耐压裕量 ${pumping.voltageMarginV.toFixed(2)}V。模型不得自行重算出另一套当前项目数值。`,
  };
}

function buildMiller(issue: IssueInput, state: UnifiedEngineeringModel): BldcCalculationEvidence {
  const inputs = ['dvdtVns', 'cgdPf', 'rgOffOhm', 'vthMinV'];
  
  const values: Record<string, number | undefined> = {
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: state.powerStage.cgdPf || (state.powerStage.qgdNc ? state.powerStage.qgdNc * 1000 / 12 : undefined),
    rgOffOhm: state.powerStage.rgOffOhm,
    vthMinV: state.powerStage.vthMinV,
  };

  const missingInputs = inputs.filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key, values[key])])) as BldcCalculationEvidence['inputSources'];

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
      inputs: inputs.map((key) => `state.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `state.${key}`),
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
    inputs: inputs.map((key) => `state.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: values.vthMinV,
    safetyMargin: miller.safetyMarginV,
    complianceVerdict: miller.isRiskOfShootThrough ? 'CRITICAL' : miller.safetyMarginV < 0.5 ? 'MARGINAL' : 'PASS',
    directiveForAi: `BLDC Miller 感应门极峰值由本地 motorPhysicsEngine 计算为 ${miller.vGateInducedV.toFixed(2)}V；Vth=${values.vthMinV}V，安全裕量 ${miller.safetyMarginV.toFixed(2)}V。不得自行重算出另一套当前项目数值。`,
  };
}

export function calculateBldcDeterministicCalculations(issue: IssueInput, state: UnifiedEngineeringModel): BldcCalculationEvidence[] {
  return [buildBusPumping(issue, state), buildMiller(issue, state)];
}
