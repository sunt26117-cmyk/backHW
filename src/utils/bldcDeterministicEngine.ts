import { IssueInput, MeasurementSource, ProjectContext } from '../types';
import { UnifiedEngineeringModel, ConfidenceLevel } from '../types/v4Models';
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
  confidence?: ConfidenceLevel;
  confidenceReason?: string;
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
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: state.powerStage.cgdPf?.value || (state.powerStage.qgdNc ? state.powerStage.qgdNc * 1000 / 12 : undefined),
    cissPf: state.powerStage.cissPf?.value || (state.powerStage.qgNc ? state.powerStage.qgNc * 1000 / 12 : undefined),
    rgOffOhm: state.powerStage.rgOffOhm?.value,
    lsNh: state.powerStage.lsNh?.value || 5, // default 5nH
    vthMinV: state.powerStage.vthMinV,
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
  const inputs = ['dvdtVns', 'cgdPf', 'cissPf', 'rgOffOhm', 'lsNh', 'vthMinV'];
  
  const values: Record<string, number | undefined> = {
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: state.powerStage.cgdPf?.value || (state.powerStage.qgdNc ? state.powerStage.qgdNc * 1000 / 12 : undefined),
    rgOffOhm: state.powerStage.rgOffOhm?.value,
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
      formula: '二阶 RK4 微分: Cgs·dv/dt + i_R = Cgd·dv/dt, Lg·di_R/dt + Rg·i_R = v',
      inputs: inputs.map((key) => `state.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `state.${key}`),
      directiveForAi: `当前 BLDC Miller 计算缺少结构化输入：${missingInputs.join(', ')}。不得用自由文本或默认参数替代，也不得输出确定性的感应峰值。`,
    };
  }

  
  let confidence: ConfidenceLevel = 'HIGH';
  let confidenceReason = '';

  const cgdOrigin = state.powerStage.cgdPf?.origin;
  const rgOffOrigin = state.powerStage.rgOffOhm?.origin;

  if (cgdOrigin === 'DEFAULT' || rgOffOrigin === 'DEFAULT') {
    confidence = 'LOW';
    confidenceReason = 'Miller计算使用了兜底默认参数，计算置信度降级为估算 (ESTIMATED/INDICATIVE)。';
  } else if (cgdOrigin === 'DATASHEET' || rgOffOrigin === 'DATASHEET') {
    confidence = 'MEDIUM';
    confidenceReason = 'Miller计算基于数据手册参数。';
  } else {
    confidence = 'HIGH';
    confidenceReason = 'Miller计算基于实测参数。';
  }

  const miller = checkMillerRisk({
    V_th_min: values.vthMinV!,
    C_gd_pF: values.cgdPf!,
    C_iss_pF: values.cissPf!,
    R_g_pulldown_ohm: values.rgOffOhm!,
    L_g_nH: values.lsNh!,
    dv_dt_V_per_ns: values.dvdtVns!,
    vbus: state.electrical.vbusNominal || 12,
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
