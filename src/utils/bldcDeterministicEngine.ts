import { IssueInput, MeasurementSource, ProjectContext } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { calculateBusPumping, checkMillerRisk } from '../physics/motorPhysicsEngine';
import { extractUnifiedEngineeringModel, isDecisionReadyValuePresent } from './unifiedStateExtractor';

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

function sourceFor(issue: IssueInput, key: string): MeasurementSource | 'MISSING' {
  // 注意：这里必须核对 issue.measuredValues 原始输入，不能看 state 派生值——state 在结构化
  // 输入缺失时会被 unifiedStateExtractor.getNum() 用写死的经验默认值兜底，永远不是 undefined，
  // 用它来判定"缺不缺"会导致下面 missingInputs 检查永远查不出任何缺失字段。
  if (!isDecisionReadyValuePresent(issue, key)) return 'MISSING';
  return issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'USER_MEASURED';
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

  const missingInputs = inputs.filter((key) => !isDecisionReadyValuePresent(issue, key));
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
  
  // Cgd 允许用米勒电荷 Qgd 换算（Cgd ≈ Qgd / 假定电压摆幅12V），但前提是 cgdPf 或 qgdNc
  // 至少有一个是工程师真实填写的结构化输入——qgdNc 在 unifiedStateExtractor 里对未填写的情况
  // 也有写死的经验默认值（15nC），不能直接信任 state.powerStage.qgdNc 是否存在。
  const cgdPfIsReady = isDecisionReadyValuePresent(issue, 'cgdPf');
  const qgdNcIsReady = isDecisionReadyValuePresent(issue, 'qgdNc');
  const cgdPfPresent = cgdPfIsReady || qgdNcIsReady;

  const values: Record<string, number | undefined> = {
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: cgdPfPresent
      ? (cgdPfIsReady ? state.powerStage.cgdPf : (state.powerStage.qgdNc! * 1000) / 12)
      : undefined,
    rgOffOhm: state.powerStage.rgOffOhm,
    vthMinV: state.powerStage.vthMinV,
  };

  const missingInputs = inputs.filter((key) => {
    if (key === 'cgdPf') return !cgdPfPresent;
    return !isDecisionReadyValuePresent(issue, key);
  });
  const inputSources = Object.fromEntries(
    inputs.map((key) => [
      key,
      key === 'cgdPf'
        ? (cgdPfPresent ? (cgdPfIsReady ? sourceFor(issue, 'cgdPf') : sourceFor(issue, 'qgdNc')) : 'MISSING')
        : sourceFor(issue, key),
    ])
  ) as BldcCalculationEvidence['inputSources'];

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
