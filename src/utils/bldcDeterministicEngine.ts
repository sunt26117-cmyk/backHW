import { IssueInput, MeasurementSource, ProjectContext } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { calculateBusPumping, checkMillerRisk } from '../physics/motorPhysicsEngine';
import { extractUnifiedEngineeringModel, isDecisionReadyValuePresent, readMeasuredNumber } from './unifiedStateExtractor';
import {
  ASSUMED_VBUS_FOR_CURVE_V,
  resolveCgsPf,
  resolveEffectiveCgdPf,
  resolveWorstCaseVthMinV,
} from './deviceCapacitance';
import { loadDevices } from './deviceLibrary';

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

function buildMiller(issue: IssueInput, state: UnifiedEngineeringModel, context?: ProjectContext): BldcCalculationEvidence {
  const inputs = ['dvdtVns', 'cgdPf', 'rgOffOhm', 'vthMinV'];
  
  // Cgd 的取值优先级与 path A（scenarioDerived→P003）**共用同一个函数**
  // （deviceCapacitance.resolveEffectiveCgdPf）：实测/导入 > 器件 Crss 曲线@工况Vbus > 规格直接 Cgd
  // > Qgd 换算。此前这里只有「实测 cgdPf 或 Qgd÷12」两条路、完全不看器件 Crss 曲线，而 P003 又让
  // 曲线压过实测值 —— 同一个器件在两条链路上会算出不同的米勒电流。
  //
  // qgdNc 在 unifiedStateExtractor 里对未填写的情况也有写死的经验默认值（15nC），
  // 因此不能直接信任 state.powerStage.qgdNc 是否存在，必须先用 isDecisionReadyValuePresent 判定。
  const cgdPfIsReady = isDecisionReadyValuePresent(issue, 'cgdPf');
  const qgdNcIsReady = isDecisionReadyValuePresent(issue, 'qgdNc');
  const device = context?.selectedDeviceId ? loadDevices().find((d) => d.id === context.selectedDeviceId) : undefined;
  const vbusProvided = isDecisionReadyValuePresent(issue, 'busVoltageNominalV');
  // 与 path A（P003 用 ctx.vbusNominalSafe）同一取点规则：实测 Vbus；未提供时用同一个假设电压。
  const vbusForMiller = Number.isFinite(state.electrical.vbusNominal)
    ? (vbusProvided ? state.electrical.vbusNominal : ASSUMED_VBUS_FOR_CURVE_V)
    : ASSUMED_VBUS_FOR_CURVE_V;
  const cgdResolved = resolveEffectiveCgdPf({
    measuredCgdPf: cgdPfIsReady ? state.powerStage.cgdPf : undefined,
    device,
    vdsV: vbusForMiller,
    vdsAssumed: !vbusProvided,
    qgdNc: qgdNcIsReady ? state.powerStage.qgdNc : undefined,
  });
  const cgdPfPresent = cgdResolved.value !== undefined;
  // 器件规格派生值绝不能伪装成工程师实测：来源按实际解析结果如实标注。
  const cgdSource: MeasurementSource | 'MISSING' = cgdResolved.from === 'MEASURED_INPUT'
    ? sourceFor(issue, 'cgdPf')
    : cgdResolved.from === 'QGD_DERIVED'
      // 与 path A 一致：Qgd→Cgd 是**换算**出来的近似值，不能标成工程师实测的 Cgd。
      ? 'DERIVED'
      : cgdResolved.from === 'NONE'
        ? 'MISSING'
        : 'DATASHEET';

  // Cgs：与 path A 同源同点 —— 实测 Cgs > 器件直接给出的 Cgs > **同一 Vds 点**的 Ciss − Crss。
  // Cgs 决定共享核心里的「容性分压界」（min(阻性界, 容性界)）；此前 path B 完全不传 Cgs，
  // 只能给阻性上界，于是同一个器件在两条链路上报出两个不同的感应电压。
  const cgsMeasured = readMeasuredNumber(issue.measuredValues, 'cgsPf');
  const cgsDevice = resolveCgsPf(device);
  const cgsPf = cgsMeasured !== undefined && cgsMeasured > 0 ? cgsMeasured : cgsDevice.value;
  const cgsSource: MeasurementSource | 'MISSING' = cgsMeasured !== undefined && cgsMeasured > 0
    ? sourceFor(issue, 'cgsPf')
    : cgsDevice.from === 'CGS_DIRECT'
      ? 'DATASHEET'
      : cgsDevice.from === 'CISS_MINUS_CRSS'
        ? 'DERIVED'
        : 'MISSING';

  // Vth：与 P003 共用最坏情况取点（Vth 最低 = 结温最高）。取点温度优先用工程师给出的 Tj_max，
  // 否则用器件绝对最大结温 / vth 曲线最高温点；不能用 25℃ 标量，否则会低估误导通风险。
  const vthResolved = resolveWorstCaseVthMinV({
    providedVthMinV: state.powerStage.vthMinV,
    device,
    tjMaxC: isDecisionReadyValuePresent(issue, 'tjMaxC') ? state.environment.tjMaxC : undefined,
  });
  const vthMinVEff = vthResolved.value ?? state.powerStage.vthMinV;

  const values: Record<string, number | undefined> = {
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: cgdResolved.value,
    rgOffOhm: state.powerStage.rgOffOhm,
    vthMinV: vthMinVEff,
  };

  const missingInputs = inputs.filter((key) => {
    if (key === 'cgdPf') return !cgdPfPresent;
    // 器件 vth 曲线@最坏高温点与工程师标量对判据是等效的：只要解析出有效阈值就不算缺输入。
    // 否则同一个器件在 pattern 层能算（P003 用曲线）、在确定性引擎层却报 INSUFFICIENT_INPUT。
    if (key === 'vthMinV') return vthMinVEff === undefined;
    return !isDecisionReadyValuePresent(issue, key);
  });
  const inputSources = Object.fromEntries(
    inputs.map((key) => [key, key === 'cgdPf' ? cgdSource : sourceFor(issue, key)])
  ) as BldcCalculationEvidence['inputSources'];
  // 模型额外取用的量（不是“必需输入”，但会改变结果）：如实披露来源，避免两条链路各算一个数却不说明。
  if (cgsPf !== undefined) inputSources.cgsPf = cgsSource;
  inputSources.busVoltageNominalV = vbusProvided ? sourceFor(issue, 'busVoltageNominalV') : 'ASSUMPTION';
  if (vthResolved.from === 'MIN_OF_PROVIDED_AND_CURVE' || vthResolved.from === 'CURVE_AT_HOT_TJ') {
    inputSources.vthMinV = 'DATASHEET';
  }

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
    // Cgs/Vbus 启用共享核心的「容性分压界」，与 P003 传入的是同一批数（同器件、同 Vbus、同点 Cgs）。
    C_gs_pF: cgsPf,
    V_bus_V: vbusForMiller,
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
    directiveForAi: `BLDC Miller 感应门极峰值由本地 motorPhysicsEngine 计算为 ${miller.vGateInducedV.toFixed(2)}V（Cgd=${cgdResolved.value}pF[${cgdResolved.from}]、Cgs=${cgsPf ?? '未提供'}pF[${cgsPf !== undefined ? cgsSource : 'MISSING'}]、Rg_off=${values.rgOffOhm}Ω、dv/dt=${values.dvdtVns}V/ns、Vbus=${vbusForMiller}V）；Vth_min=${values.vthMinV}V（${vthResolved.from}），安全裕量 ${miller.safetyMarginV.toFixed(2)}V。不得自行重算出另一套当前项目数值。`,
  };
}

export function calculateBldcDeterministicCalculations(
  issue: IssueInput,
  state: UnifiedEngineeringModel,
  context?: ProjectContext,
): BldcCalculationEvidence[] {
  return [buildBusPumping(issue, state), buildMiller(issue, state, context)];
}
