import { ProjectContext, IssueInput, CopilotAnalysisResult, ComponentChangeImpactItem } from '../types';
import { BldcEvaluationInput } from '../domains/bldc';
import { FmedaRow, FtaNode, SafetyTraceabilityNode, PhaseCheckItem, WorstCaseCombination } from '../types';
import { SAMPLE_FMEDA_ROWS, SAMPLE_FTA_TREE, SAMPLE_SAFETY_TRACEABILITY_CHAIN } from '../data/safetyReliabilityEngine';
import { getPhaseReviewChecklist } from '../data/designReviewEngine';
import { resolveEngineeringDomain, getDomainPhysics } from './scenarioDomainEngine';
import { loadDevices, getDeviceCurve, linearInterp } from './deviceLibrary';
import { readMeasuredNumber } from './unifiedStateExtractor';
import { mapMeasurementSourceToTraceSource } from './trace';
import { TraceInputSource } from '../types';

const allText = (issue: IssueInput) => [
  ...(issue.issueCategories || []),
  issue.requirement,
  issue.actualMeasurement,
  issue.testCondition,
  issue.environment,
  issue.failurePhenomenon,
  issue.engineeringConcern,
  issue.notes || '',
].join(' ');

function firstNumber(text: string, patterns: RegExp[], fallback: number) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

// ── 这一层是「第二套判断」，和确定性引擎的 isMeasuredValuePresent() 不是一回事，别互相假设 ──
// BLDC 确定性计算只认结构化 measuredValues；自由文本若需要转成候选数据，必须先经过
// extractMeasurementsFromText / extractTextInferredMeasurements 写回结构化输入，并保留 TEXT_INFERRED 来源。
// 这里用 NaN（而不是 undefined / 0 哨兵）表达缺失，避免 Number('') === 0 误把空值当成有效测量。
// BENCHMARK 是唯一允许的演示场景默认值，正式项目不会自动从 issue 文本猜数。
function measuredNumber(issue: IssueInput, key: string): number {
  const value = readMeasuredNumber(issue.measuredValues, key);
  return value === undefined ? NaN : value;
}

function preferMeasured(issue: IssueInput, key: string, parsed: number): number {
  const direct = measuredNumber(issue, key);
  return Number.isFinite(direct) ? direct : parsed;
}

function optMeas(issue: IssueInput, key: string): number | undefined {
  const v = measuredNumber(issue, key);
  return Number.isFinite(v) ? v : undefined;
}

function rawMeas(issue: IssueInput, key: string): number | string | undefined {
  const v = issue.measuredValues?.[key];
  return v === '' || v === null || v === undefined ? undefined : v;
}

type DeviceSpecKey =
  | 'vdsRatingV' | 'rdsOnMilliOhm' | 'cissPf' | 'cgsPf' | 'cossPf' | 'qgsNc' | 'qswNc' | 'gatePlateauV'
  | 'turnOnDelayNs' | 'riseTimeNs' | 'turnOffDelayNs' | 'fallTimeNs' | 'trrNs' | 'irrPeakA'
  | 'rthJcCPerW' | 'rthJaCPerW' | 'tjMaxC' | 'easEnergyMj'
  | 'gateVoltageMaxV' | 'gateVoltageMinV' | 'esdRatingKv' | 'gateResistanceOhm' | 'idssUa' | 'igssNa'
  | 'idRatingA' | 'idPulseRatingA' | 'pdMaxW' | 'vbrDssMinV' | 'easCurrentA'
  | 'diodeForwardVoltageV' | 'qrrNc' | 'gateChargeQgNc' | 'cgdDirectPf';

function readDeviceSpecNumber(device: ReturnType<typeof loadDevices>[number] | undefined, key: DeviceSpecKey): number | undefined {
  if (!device) return undefined;
  const raw = device.raw as any;
  const paths: Record<DeviceSpecKey, string[]> = {
    vdsRatingV: ['maxRatings.vds.value'],
    rdsOnMilliOhm: ['staticParams.rdsOn.value'],
    cissPf: ['capacitanceParams.ciss.value'],
    cgsPf: ['capacitanceParams.cgsDirect.value'],
    cossPf: ['capacitanceParams.coss.value'],
    qgsNc: ['gateCharge.qgs.value'],
    qswNc: ['gateCharge.qsw.value'],
    gatePlateauV: ['gateCharge.gatePlateauV.value'],
    turnOnDelayNs: ['switchingParams.tdOn.value'],
    riseTimeNs: ['switchingParams.tr.value'],
    turnOffDelayNs: ['switchingParams.tdOff.value'],
    fallTimeNs: ['switchingParams.tf.value'],
    trrNs: ['bodyDiode.trr.value'],
    irrPeakA: ['bodyDiode.irrM.value'],
    rthJcCPerW: ['thermalParams.rthJc.value'],
    rthJaCPerW: ['thermalParams.rthJa.value'],
    tjMaxC: ['maxRatings.tjMax.value'],
    easEnergyMj: ['maxRatings.easPulse.value'],
    gateVoltageMaxV: ['protectionAndRobustness.gateVoltageMax.value'],
    gateVoltageMinV: [],
    esdRatingKv: ['protectionAndRobustness.esdRating.value'],
    gateResistanceOhm: ['staticParams.gateResistance.value'],
    idssUa: ['staticParams.idss.value'],
    igssNa: ['staticParams.igss.value'],
    idRatingA: ['maxRatings.id.value'],
    idPulseRatingA: ['maxRatings.idPulse.value'],
    pdMaxW: ['maxRatings.powerDissipation.value'],
    vbrDssMinV: ['staticParams.vbrDss.value'],
    easCurrentA: ['maxRatings.easCurrent.value'],
    diodeForwardVoltageV: ['bodyDiode.vf.value'],
    qrrNc: ['bodyDiode.qrr.value'],
    gateChargeQgNc: ['gateCharge.qg.value'],
    cgdDirectPf: ['capacitanceParams.cgdDirect.value'],
  };
  const readPath = (path: string): number | undefined => {
    const value = path.split('.').reduce((node: any, part) => node == null ? undefined : node[part], raw);
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  for (const path of paths[key]) {
    const value = readPath(path);
    if (value !== undefined) return value;
  }
  if (key === 'gateVoltageMinV') {
    const variants = raw?.protectionAndRobustness?.gateVoltageMax?.variants;
    if (Array.isArray(variants)) {
      const mins = variants
        .map((v: any) => Number(v?.value))
        .filter((v: number) => Number.isFinite(v) && v < 0);
      if (mins.length) return Math.min(...mins);
    }
  }
  return undefined;
}

export function deriveBldcEvaluationInput(context: ProjectContext, issue: IssueInput): BldcEvaluationInput {
  const text = allText(issue);
  const isEmc = issue.issueCategories?.includes('EMC');
  const isComponent = issue.issueCategories?.includes('Component Alternative');
  const isWcca = issue.issueCategories?.includes('WCCA');
  const isThermal = issue.issueCategories?.includes('Thermal') || issue.issueCategories?.includes('Power');
  const isBenchmark = issue.measuredValueSource === 'BENCHMARK';

  let vbusMeasuredPeak = optMeas(issue, 'busVoltagePeakV') ?? NaN;

  let vbusNominal = optMeas(issue, 'busVoltageNominalV') ?? optMeas(issue, 'inputVoltageV') ?? (isBenchmark ? (context.productType.toLowerCase().includes('400v') ? 400 : 13.5) : NaN);

  let rpm = optMeas(issue, 'rpm') ?? (isBenchmark ? (isEmc ? 3000 : isComponent ? 1500 : isWcca ? 800 : isThermal ? 2200 : 3800) : NaN);

  // Vds 额定耐压是器件规格，不允许从自由文本猜测；优先读取结构化输入，之后由绑定器件 Datasheet 投影补全。
  let vdsRating = optMeas(issue, 'vdsRatingV') ?? (isBenchmark ? (context.productType.toLowerCase().includes('400v') ? 650 : 40) : NaN);

  let cbusUf = optMeas(issue, 'cBusUf') ?? (isBenchmark ? 470 : NaN);

  let tAmbientC = optMeas(issue, 'ambientTempC') ?? (isBenchmark ? (context.projectPhase === 'DVT' || context.projectPhase === 'DV' ? 85 : 25) : NaN);

  let currentPeakA = optMeas(issue, 'currentPeakA') ?? optMeas(issue, 'loadCurrentA') ?? (isBenchmark ? 25 : NaN);

  let harnessLengthM = optMeas(issue, 'harnessLengthM') ?? (isBenchmark ? 1.8 : NaN);

  let deadTimeNs = optMeas(issue, 'deadTimeNs') ?? (isBenchmark ? 120 : NaN);

  let rgOffOhm = optMeas(issue, 'rgOffOhm') ?? (isBenchmark ? 4.7 : NaN);

  let cgdPf = optMeas(issue, 'cgdPf') ?? (isBenchmark ? 45 : NaN);

  // dv/dt 同样只接受结构化输入；EMC / RE_CE 的字段键统一为 dvdtVns。
  let dvDtVns = optMeas(issue, 'dvdtVns') ?? (isBenchmark ? 8.0 : NaN);

  let vthMinV = optMeas(issue, 'vthMinV') ?? (isBenchmark ? 2.0 : NaN);

  let keVkrpm = optMeas(issue, 'keVkrpm') ?? (isBenchmark ? 4.2 : NaN);

  let rthJc = isBenchmark ? 1.8 : NaN;
  const rthJcSpec = optMeas(issue, 'rthJcCPerW');
  const rthJcLegacy = optMeas(issue, 'thermalResistanceCPerW');
  rthJc = rthJcSpec ?? rthJcLegacy ?? rthJc;

  let rdsOnMilliOhm = optMeas(issue, 'rdsOnMilliOhm') ?? (isBenchmark ? 3.5 : NaN);

  // [输入驱动] 不再用转速反推惯量（0.00015·(rpm/3800)^0.15 是无出处的自造公式）；
  // 缺 rotorInertiaKgm2 时保持 NaN，交由引擎按“缺输入”处理，而不是伪造一个惯量值。
  const jInertia = preferMeasured(issue, 'rotorInertiaKgm2', NaN);

  // 从器件库读取当前选中器件，提取曲线用于按工况插值（无选中器件时退回写死默认值）
  const selectedDeviceId = (context as any).selectedDeviceId;
  const selectedDevice = selectedDeviceId ? loadDevices().find((d) => d.id === selectedDeviceId) : undefined;
  let rdsOnCurve: Array<{ x: number; y: number }> | undefined;
  let crssCurve: Array<{ x: number; y: number }> | undefined;
  let vthCurve: Array<{ x: number; y: number }> | undefined;
  if (selectedDevice) {
    rdsOnCurve = getDeviceCurve(selectedDevice, 'rdsOn');
    crssCurve = getDeviceCurve(selectedDevice, 'crss');
    vthCurve = getDeviceCurve(selectedDevice, 'vth');
  }

  // 器件规格层是第二数据源：工程师已有结构化输入优先；空白时直接从当前绑定器件库
  // 继承可安全投影的 datasheet 单值。这样“设为当前器件”不再要求手工逐项映射。
  const deviceSpec = <K extends DeviceSpecKey>(key: K): number | undefined => readDeviceSpecNumber(selectedDevice, key);
  const effectiveSpec = (issueKey: string, deviceKey: DeviceSpecKey): number | undefined =>
    optMeas(issue, issueKey) ?? deviceSpec(deviceKey);
  let easEnergyMj: number | undefined;

  vdsRating = effectiveSpec('vdsRatingV', 'vdsRatingV') ?? vdsRating;
  if (!Number.isFinite(optMeas(issue, 'vthMinV')) && vthCurve?.length) {
    const vth25 = vthCurve.find((point) => point.x === 25) || vthCurve[0];
    if (Number.isFinite(vth25?.y)) vthMinV = vth25.y;
  }
  const cgdDirect = deviceSpec('cgdDirectPf');
  if (!Number.isFinite(optMeas(issue, 'cgdPf')) && cgdDirect !== undefined) cgdPf = cgdDirect;

  // Device Specification 层自动提供 Cgs：优先直接值；没有直接 Cgs 时，使用同一 VDS 点的 Ciss-Crss 派生。
  // 该值只进入确定性计算，不回写为“用户实测输入”，并在 Trace 中明确标成 DERIVED。
  let deviceCgsDerived: number | undefined;
  const deviceCgsDirect = deviceSpec('cgsPf');
  if (deviceCgsDirect !== undefined) {
    deviceCgsDerived = deviceCgsDirect;
  } else {
    const ciss = deviceSpec('cissPf');
    if (ciss !== undefined && crssCurve && crssCurve.length >= 1) {
      const crssAtVbus = linearInterp(crssCurve, vbusNominal).value;
      const derived = ciss - crssAtVbus;
      if (Number.isFinite(derived) && derived > 0) deviceCgsDerived = derived;
    }
  }
  const effectiveCgsPf = optMeas(issue, 'cgsPf') ?? deviceCgsDerived;
  rthJc = effectiveSpec('rthJcCPerW', 'rthJcCPerW') ?? rthJc;
  rdsOnMilliOhm = effectiveSpec('rdsOnMilliOhm', 'rdsOnMilliOhm') ?? rdsOnMilliOhm;
  easEnergyMj = effectiveSpec('easEnergyMj', 'easEnergyMj');

  // ----------------------------------------------------------------
  // Trace provenance：把统一工程输入中的逐字段来源一路带到 Pattern Engine。
  // 规则：结构化 provenance > 工程级 measuredValueSource > 自由文本解析(USER_INPUT) > BENCHMARK假设。
  const traceSources: Record<string, TraceInputSource> = {};
  const traceEvidenceIds: Record<string, string> = {};
  const registerTraceSource = (targetKey: string, sourceKeys: string[], parsedValue: number | undefined) => {
    const directKey = sourceKeys.find((key) => readMeasuredNumber(issue.measuredValues, key) !== undefined);
    const provenance = directKey ? issue.measurementProvenance?.[directKey] : undefined;
    if (provenance?.source) {
      traceSources[targetKey] = mapMeasurementSourceToTraceSource(provenance.source);
      if (provenance.evidenceId) traceEvidenceIds[targetKey] = provenance.evidenceId;
      return;
    }
    if (directKey) {
      traceSources[targetKey] = mapMeasurementSourceToTraceSource(issue.measuredValueSource);
      return;
    }
    if (Number.isFinite(parsedValue)) {
      traceSources[targetKey] = isBenchmark ? 'ASSUMED_DEFAULT' : 'USER_INPUT';
      return;
    }
    traceSources[targetKey] = isBenchmark ? 'ASSUMED_DEFAULT' : 'USER_INPUT';
  };

  registerTraceSource('vbusNominal', ['busVoltageNominalV', 'inputVoltageV'], vbusNominal);
  registerTraceSource('busVoltagePeakV', ['busVoltagePeakV'], vbusMeasuredPeak);
  registerTraceSource('vdsRating', ['vdsRatingV'], vdsRating);
  registerTraceSource('rpm', ['rpm'], rpm);
  registerTraceSource('rotorInertiaKgm2', ['rotorInertiaKgm2'], jInertia);
  registerTraceSource('cbusUf', ['cBusUf'], cbusUf);
  registerTraceSource('ambientTempC', ['ambientTempC'], tAmbientC);
  registerTraceSource('currentPeakA', ['currentPeakA', 'loadCurrentA'], currentPeakA);
  registerTraceSource('stallCurrentThresholdA', ['stallCurrentThresholdA'], optMeas(issue, 'stallCurrentThresholdA'));
  registerTraceSource('stallRpmThreshold', ['stallRpmThreshold'], optMeas(issue, 'stallRpmThreshold'));
  registerTraceSource('stallLevel1TimeMs', ['stallLevel1TimeMs'], optMeas(issue, 'stallLevel1TimeMs'));
  registerTraceSource('stallLevel2TimeMs', ['stallLevel2TimeMs'], optMeas(issue, 'stallLevel2TimeMs'));
  registerTraceSource('stallLevel3TimeMs', ['stallLevel3TimeMs'], optMeas(issue, 'stallLevel3TimeMs'));
  registerTraceSource('stallLockoutCountN', ['stallLockoutCountN'], optMeas(issue, 'stallLockoutCountN'));
  registerTraceSource('harnessLengthM', ['harnessLengthM'], harnessLengthM);
  registerTraceSource('deadTimeNs', ['deadTimeNs'], deadTimeNs);
  registerTraceSource('rgOffOhm', ['rgOffOhm'], rgOffOhm);
  registerTraceSource('cgdPf', ['cgdPf'], cgdPf);
  registerTraceSource('dvdtVns', ['dvdtVns'], dvDtVns);
  registerTraceSource('vthMinV', ['vthMinV'], vthMinV);
  registerTraceSource('keVkrpm', ['keVkrpm'], keVkrpm);
  registerTraceSource('rthJcCPerW', ['rthJcCPerW', 'thermalResistanceCPerW'], rthJc);
  registerTraceSource('thermalResistanceCPerW', ['thermalResistanceCPerW'], rthJc);
  registerTraceSource('rdsOnMilliOhm', ['rdsOnMilliOhm', 'rdsOn'], rdsOnMilliOhm);
  ['senseDelayNs','compDelayNs','digitalFilterDelayNs','driverPropDelayNs','gateTurnOffDelayNs','currentFallDelayNs','soaShortCircuitTimeUs'].forEach((key) => {
    const v = optMeas(issue, key);
    registerTraceSource(key, [key], v);
  });
  registerTraceSource('gateSpikeV', ['gateSpikeV'], optMeas(issue, 'gateSpikeV'));
  ['loopInductanceNh','diDtANs','cgsPf','sourceInductanceNh','magnetLowTempFluxUpliftPct','pwmSwitchingFreqHz','diodeForwardVoltageV','modulationIndex','rthCaOrJa','switchingTimeNs','qrrNc','powerFactorCosPhi','pulseDurationS','thermalTauS','deratingBasisC','uvloTypicalV','uvloMinV','gateChargeQgNc','bootRefreshWindowUs','bootChargeLoopOhm','capInitialTolerancePct','capEolDeratingPct','capLowTempDeratingPct','easEnergyMj'].forEach((key) => {
    const v = optMeas(issue, key);
    if (v !== undefined) registerTraceSource(key, [key], v);
  });

  const markDeviceSpecTrace = (targetKey: string, issueKey: string, deviceKey: DeviceSpecKey) => {
    if (optMeas(issue, issueKey) === undefined && deviceSpec(deviceKey) !== undefined) {
      traceSources[targetKey] = 'DATASHEET';
    }
  };
  markDeviceSpecTrace('vdsRating', 'vdsRatingV', 'vdsRatingV');
  markDeviceSpecTrace('rthJcCPerW', 'rthJcCPerW', 'rthJcCPerW');
  markDeviceSpecTrace('rdsOnMilliOhm', 'rdsOnMilliOhm', 'rdsOnMilliOhm');
  markDeviceSpecTrace('turnOffDelayNs', 'turnOffDelayNs', 'turnOffDelayNs');
  markDeviceSpecTrace('fallTimeNs', 'fallTimeNs', 'fallTimeNs');
  markDeviceSpecTrace('diodeForwardVoltageV', 'diodeForwardVoltageV', 'diodeForwardVoltageV');
  markDeviceSpecTrace('qrrNc', 'qrrNc', 'qrrNc');
  markDeviceSpecTrace('gateChargeQgNc', 'gateChargeQgNc', 'gateChargeQgNc');
  markDeviceSpecTrace('rthJaCPerW', 'rthJaCPerW', 'rthJaCPerW');
  markDeviceSpecTrace('tjMaxC', 'tjMaxC', 'tjMaxC');
  if (optMeas(issue, 'cgsPf') === undefined && effectiveCgsPf !== undefined) {
    traceSources.cgsPf = deviceCgsDirect !== undefined ? 'DATASHEET' : 'DERIVED';
  }
  markDeviceSpecTrace('easEnergyMj', 'easEnergyMj', 'easEnergyMj');
  if (optMeas(issue, 'vthMinV') === undefined && vthCurve?.length) traceSources.vthMinV = 'DATASHEET';
  if (optMeas(issue, 'cgdPf') === undefined && cgdDirect !== undefined) traceSources.cgdPf = 'DATASHEET';

  // ----------------------------------------------------------------
  // P009/P010/P011/P018 的“是否适用当前 case”属于故障症状/架构证据层。
  // 自由文本可以在这里识别“是否存在某类症状”，但数值型物理量（V/A/rpm/nH/V/ns…）
  // 仍必须来自结构化 measuredValues；文本数字不会直接进入 BLDC 确定性公式。
  // ----------------------------------------------------------------

  // P009: 电机位置传感器类型 + 霍尔信号故障的具体症状描述
  // 关键词命中"霍尔/hall/H1|H2|H3信号线"，且同时出现典型故障症状词，才判定为"文本证据"；
  // 仅提到霍尔但没有故障症状(例如只是选型对比)不应算作"检测到故障"。
  const hallKeywordHit = /霍尔|hall\s*sensor|\bH[123]\b/i.test(text);
  const hallFaultSymptomHit = /(开路|断线|失效|故障|卡死|干扰|跳变|非法状态|失步|虚焊|抖动)/i.test(text);
  const hallFaultRiskIndicated = hallKeywordHit && hallFaultSymptomHit;
  let motorSensorType: BldcEvaluationInput['motorSensorType'];
  if (/sensorless|无(?:位置)?(?:传感器)?感|反电动势观测|BEMF\s*observer/i.test(text)) motorSensorType = 'SENSORLESS';
  else if (/编码器|encoder/i.test(text)) motorSensorType = 'ENCODER';
  else if (/旋变|resolver/i.test(text)) motorSensorType = 'RESOLVER';
  else if (hallKeywordHit) motorSensorType = 'HALL';

  // P010: 电流采样架构 + 采样链路(分流电阻/运放/ADC)故障的具体症状描述
  const currentSenseFaultRiskIndicated = /(分流电阻|采样电阻|运放|电流采样|电流检测|ADC)[^。\n]{0,15}(虚焊|漂移|饱和|失效|故障|偏置|跌落|异常|丢失采样窗口)/i.test(text);
  let currentSenseArchitecture: BldcEvaluationInput['currentSenseArchitecture'];
  if (/低边单电阻|单电阻采样|single[\s-]?low[\s-]?side/i.test(text)) currentSenseArchitecture = 'LOW_SIDE_SINGLE';
  else if (/三相低边独立采样|相电流独立采样|three[\s-]?phase[\s-]?low[\s-]?side/i.test(text)) currentSenseArchitecture = 'THREE_PHASE_LOW_SIDE';
  else if (/相线直串|inline[\s-]?phase/i.test(text)) currentSenseArchitecture = 'INLINE_PHASE';
  else if (/霍尔电流传感器|hall[\s-]?current[\s-]?sensor/i.test(text)) currentSenseArchitecture = 'HALL_SENSOR';

  // P011: 预期最低供电电压(如冷启动跌落曲线) + 升压稳压兜底 + 预驱死锁/UVLO文本症状
  const vbusMinExpectedV = optMeas(issue, 'vbusMinExpectedV');
  const boostRaw = measuredNumber(issue, 'hasSupplyBoostRegulation');
  const hasSupplyBoostRegulation = Number.isFinite(boostRaw)
    ? boostRaw !== 0
    : (/升压稳压|boost\s*regulat/i.test(text) ? true : undefined);
  const driverLockupRiskIndicated = /(预驱|驱动芯片|gate\s*driver)[^。\n]{0,10}(死锁|锁死|锁定|死机)|UVLO|欠压锁定/i.test(text);

  // P018: 堵转/机械卡滞的具体症状描述
  const stallRiskIndicated = /堵转|卡死|卡滞|locked\s*rotor|抱死|机械死锁/i.test(text);

  // 用户结构化输入优先于自由文本推断。这样新增的 BLDC 输入窗口真正进入 P001~P018，
  // 而不是只停留在 UI 层。
  const measuredKeConvention = rawMeas(issue, 'keConvention');
  const keConvention = measuredKeConvention === 'PHASE_RMS_SINUSOIDAL' || measuredKeConvention === 'LINE_PEAK_DIRECT'
    ? measuredKeConvention : undefined;
  const measuredMotorSensorType = rawMeas(issue, 'motorSensorType');
  if (measuredMotorSensorType === 'HALL' || measuredMotorSensorType === 'ENCODER' || measuredMotorSensorType === 'RESOLVER' || measuredMotorSensorType === 'SENSORLESS') motorSensorType = measuredMotorSensorType;
  const measuredSenseArchitecture = rawMeas(issue, 'currentSenseArchitecture');
  if (measuredSenseArchitecture === 'LOW_SIDE_SINGLE' || measuredSenseArchitecture === 'THREE_PHASE_LOW_SIDE' || measuredSenseArchitecture === 'INLINE_PHASE' || measuredSenseArchitecture === 'HALL_SENSOR') currentSenseArchitecture = measuredSenseArchitecture;
  const boolValue = (key: string): boolean | undefined => {
    const raw = rawMeas(issue, key);
    if (raw === undefined) return undefined;
    return raw === 1 || raw === '1';
  };
  const structuredHallFault = boolValue('hallFaultRiskIndicated');
  const structuredSenseFault = boolValue('currentSenseFaultRiskIndicated');
  const structuredBoost = boolValue('hasSupplyBoostRegulation');
  const structuredDriverLockup = boolValue('driverLockupRiskIndicated');
  const structuredStall = boolValue('stallRiskIndicated');

  return {
    vbusNominal,
    vbusMeasuredPeak: Number.isFinite(vbusMeasuredPeak) ? vbusMeasuredPeak : undefined,
    vdsRating,
    rpm,
    jInertia,
    cbusUf,
    tAmbientC,
    currentPeakA,
    harnessLengthM,
    deadTimeNs,
    rgOffOhm,
    cgdPf,
    dvDtVns,
    vthMinV,
    keVkrpm: Number.isFinite(keVkrpm) ? keVkrpm : undefined,
    keConvention,
    rthJc: Number.isFinite(rthJc) ? rthJc : undefined,
    rdsOnMilliOhm: Number.isFinite(rdsOnMilliOhm) ? rdsOnMilliOhm : undefined,
    gateSpikeMeasuredV: optMeas(issue, 'gateSpikeV'),
    turnOffDelayNs: effectiveSpec('turnOffDelayNs', 'turnOffDelayNs'),
    turnOffDelayMaxNs: optMeas(issue, 'turnOffDelayMaxNs'),
    fallTimeNs: effectiveSpec('fallTimeNs', 'fallTimeNs'),
    fallTimeMaxNs: optMeas(issue, 'fallTimeMaxNs'),
    driverPropMismatchNs: optMeas(issue, 'driverPropMismatchNs'),
    driverPropMismatchMaxNs: optMeas(issue, 'driverPropMismatchMaxNs'),
    pwmSwitchingFreqHz: optMeas(issue, 'pwmSwitchingFreqHz'),
    diodeForwardVoltageV: effectiveSpec('diodeForwardVoltageV', 'diodeForwardVoltageV'),
    modulationIndex: optMeas(issue, 'modulationIndex'),
    rthCaOrJa: optMeas(issue, 'rthCaOrJa'),
    rthJaTotal: effectiveSpec('rthJaCPerW', 'rthJaCPerW'),
    tjMaxC: effectiveSpec('tjMaxC', 'tjMaxC'),
    switchingTimeNs: optMeas(issue, 'switchingTimeNs'),
    qrrNc: effectiveSpec('qrrNc', 'qrrNc'),
    powerFactorCosPhi: optMeas(issue, 'powerFactorCosPhi'),
    pulseDurationS: optMeas(issue, 'pulseDurationS'),
    thermalTauS: optMeas(issue, 'thermalTauS'),
    deratingBasisC: optMeas(issue, 'deratingBasisC'),
    parasiticCapPf: optMeas(issue, 'parasiticCapPf'),
    senseDelayNsOverride: optMeas(issue, 'senseDelayNs'),
    compDelayNsOverride: optMeas(issue, 'compDelayNs'),
    digitalFilterDelayNsOverride: optMeas(issue, 'digitalFilterDelayNs'),
    driverPropDelayNsOverride: optMeas(issue, 'driverPropDelayNs'),
    gateTurnOffDelayNsOverride: optMeas(issue, 'gateTurnOffDelayNs'),
    currentFallDelayNsOverride: optMeas(issue, 'currentFallDelayNs'),
    soaShortCircuitTimeUsOverride: optMeas(issue, 'soaShortCircuitTimeUs'),
    sourceInductanceNh: optMeas(issue, 'sourceInductanceNh'),
    diDtANs: optMeas(issue, 'diDtANs'),
    loopInductanceNh: optMeas(issue, 'loopInductanceNh'),
    cgsPf: effectiveCgsPf,
    magnetLowTempFluxUpliftPct: optMeas(issue, 'magnetLowTempFluxUpliftPct'),
    gateChargeQgNc: effectiveSpec('gateChargeQgNc', 'gateChargeQgNc'),
    bootRefreshWindowUs: optMeas(issue, 'bootRefreshWindowUs'),
    bootChargeLoopOhm: optMeas(issue, 'bootChargeLoopOhm'),
    capInitialTolerancePct: optMeas(issue, 'capInitialTolerancePct'),
    capEolDeratingPct: optMeas(issue, 'capEolDeratingPct'),
    capLowTempDeratingPct: optMeas(issue, 'capLowTempDeratingPct'),
    capRatedRippleCurrentA: optMeas(issue, 'capRatedRippleCurrentA'),
    capRatedLifeHours: optMeas(issue, 'capRatedLifeHours'),
    capRatedTempC: optMeas(issue, 'capRatedTempC'),
    vbusMinExpectedV,
    uvloTypicalV: optMeas(issue, 'uvloTypicalV'),
    uvloMinV: optMeas(issue, 'uvloMinV'),
    easEnergyMj: easEnergyMj ?? optMeas(issue, 'easEnergyMj'),
    traceSources,
    traceEvidenceIds,
    rdsOnCurve,
    crssCurve,
    vthCurve,
    motorSensorType,
    hallFaultRiskIndicated: structuredHallFault ?? (hallFaultRiskIndicated || undefined),
    currentSenseArchitecture,
    currentSenseFaultRiskIndicated: structuredSenseFault ?? (currentSenseFaultRiskIndicated || undefined),
    hasSupplyBoostRegulation: structuredBoost ?? hasSupplyBoostRegulation,
    driverLockupRiskIndicated: structuredDriverLockup ?? (driverLockupRiskIndicated || undefined),
    stallRiskIndicated: structuredStall ?? (stallRiskIndicated || undefined),
    stallCurrentThresholdA: optMeas(issue, 'stallCurrentThresholdA'),
    stallRpmThreshold: optMeas(issue, 'stallRpmThreshold'),
    stallLevel1TimeMs: optMeas(issue, 'stallLevel1TimeMs'),
    stallLevel2TimeMs: optMeas(issue, 'stallLevel2TimeMs'),
    stallLevel3TimeMs: optMeas(issue, 'stallLevel3TimeMs'),
    stallLockoutCountN: optMeas(issue, 'stallLockoutCountN'),
  };
}

export function deriveVerificationRisk(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null) {
  const overall = result?.riskRatings.overallRiskScore ?? 60;
  const level = result?.riskRatings.overallRisk ?? 'Medium';
  const mainRisk = result?.physicalMechanism.rootCauseAnalysis || issue.engineeringConcern || issue.failurePhenomenon;
  const confidence = result?.unknowns?.length && result.unknowns.length <= 1 ? 'MEDIUM' : 'LOW';
  return {
    overallScore: overall,
    overallRiskLevel: level,
    technicalRisk: result?.riskRatings.technicalRisk ?? level,
    thermalRisk: result?.riskRatings.reliabilityRisk ?? level,
    emcRisk: result?.riskRatings.qualityRisk ?? level,
    reliabilityRisk: result?.riskRatings.reliabilityRisk ?? level,
    safetyRisk: result?.riskRatings.functionalSafetyRisk ?? 'Medium',
    scheduleRisk: result?.riskRatings.scheduleRisk ?? (context.daysRemaining <= 14 ? 'High' : 'Medium'),
    verificationGap: result?.unknowns?.length ? 'HIGH' : 'MEDIUM',
    uncertainty: result?.unknowns?.length ? 'HIGH' : 'MEDIUM',
    majorRiskDriver: mainRisk,
    secondaryRiskDriver: issue.engineeringConcern || context.nextMilestone || '暂无次要风险驱动项',
    confidence,
  };
}

export function deriveSafetyTraceability(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null): SafetyTraceabilityNode[] {
  const failure = issue.failurePhenomenon || result?.dfmeaView.failureMode || '当前工况失效现象待确认';
  const mechanism = result?.physicalMechanism.rootCauseAnalysis || issue.engineeringConcern || '需要通过工程验证确定主要物理机制';
  const requirement = issue.requirement || '当前工况关键安全需求待确认';
  const asil = context.asilLevel;
  const domain = resolveEngineeringDomain(issue);
  const category = issue.issueCategories?.[0] || 'Other';
  const component = domain === 'COMPONENT' ? '当前变更器件 / 关键功率级' :
    domain.startsWith('EMC_') ? '连接器 / 屏蔽 / 滤波 / 敏感节点链路' :
    domain === 'WCCA' || domain === 'WCCA_EOL' ? '关键边界参数与容差链 / EOL校准链' :
    domain === 'THERMAL' ? '功率级 / 热路径 / 散热界面' :
    domain === 'POWER' || domain === 'POWER_TRANSIENT' ? '输入保护 / DC-DC / MCU电源轨' :
    domain === 'SIGNAL' ? 'CAN-FD收发器 / 线束 / 终端网络' :
    domain === 'BLDC' ? '三相逆变器 / Gate Driver / 电机执行机构' :
    '当前 ECU 关键硬件链路';
  const safeState = domain === 'SAFETY' || issue.issueCategories?.includes('Functional Safety') ? '进入经安全分析确认的最小风险安全状态，并保持独立硬件监控' :
    domain.startsWith('EMC_') ? '保持安全相关功能，必要时进入受控降级并验证恢复窗口' :
    '根据当前工况实施受控降级/关断，避免危险能量持续累积';
  return SAMPLE_SAFETY_TRACEABILITY_CHAIN.map((n, i) => ({
    ...n,
    asil,
    safetyGoal: [
      `防止${context.productType}在【${context.projectPhase}】发生${failure.slice(0, 58)}`,
      `保证${context.productType}在当前${domain}场景下进入可验证的安全状态`,
      `保证关键检测链路能够识别${domain}场景中的异常并触发受控处置`,
    ][i],
    fsr: `FSR-0${i + 1}: ${requirement.slice(0, 100)}；诊断/处置窗口需满足当前项目安全目标`,
    tsr: `TSR-0${i + 1}: 针对${domain}建立可测量的技术约束，并在${context.projectPhase}阶段完成证据闭环`,
    hsr: `HSR-0${i + 1}: ${component}必须具备独立监测、故障隔离与受控关断能力，禁止依赖单一软件假设`,
    failureMode: i === 0 ? failure : `${failure.slice(0, 60)}｜${mechanism.slice(0, 55)}`,
    hardwareComponent: component,
    detectionMechanism: `当前工况证据链：${mechanism.slice(0, 80)}；使用实测/计算证据完成确认`,
    diagnosticCoveragePct: Math.max(80, Math.min(99.5, n.diagnosticCoveragePct + (result?.riskRatings.overallRiskScore ?? 60) / 25 - 2 * i)),
    safeState,
    faultHandlingTimeIntervalMs: Math.max(5, Math.round((n.faultHandlingTimeIntervalMs * (context.asilLevel === 'ASIL D' ? 0.75 : 1)) * 10) / 10),
    evidence: result?.knownFacts?.length ? 'CALCULATED' : i === 0 ? 'SPECIFICATION' : n.evidence,
  }));
}

export function deriveFmedaRows(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null): FmedaRow[] {
  const score = result?.riskRatings.overallRiskScore ?? 60;
  const multiplier = 0.85 + score / 100 * 0.45;
  const category = issue.issueCategories?.[0] || 'Other';
  const adjusted = SAMPLE_FMEDA_ROWS.map((r, idx) => {
    const dangerousBias = 1 + (score / 100 - 0.6) * (idx + 1) * 0.08;
    return {
      ...r,
      component: idx === 0 ? `${r.component}｜${category}场景` : r.component,
      lambdaTotalFit: Number((r.lambdaTotalFit * multiplier).toFixed(2)),
      lambdaSafeFit: Number((r.lambdaSafeFit * multiplier).toFixed(2)),
      lambdaSpfFit: Number((r.lambdaSpfFit * dangerousBias).toFixed(2)),
      lambdaRfFit: Number((r.lambdaRfFit * dangerousBias).toFixed(2)),
      lambdaLfFit: Number((r.lambdaLfFit * (0.95 + score / 500)).toFixed(2)),
      evidenceSource: `${r.evidenceSource}｜本工况 ${context.projectName} / ${context.projectPhase} 场景化筛查`,
    };
  });
  return adjusted;
}

function cloneFta(node: FtaNode, failure: string, mechanism: string, rootName: string): FtaNode {
  return {
    ...node,
    name: node.id === 'TE-01' ? `Top Event: ${rootName}` : node.name,
    children: node.children?.map((child, idx) => {
      const cloned = cloneFta(child, failure, mechanism, rootName);
      if (child.id === 'GE-01') cloned.name = `Gate 1: 当前工况物理链路｜${failure.slice(0, 50)}`;
      if (child.id === 'BE-01') cloned.name = `场景证据：${mechanism.slice(0, 70)}`;
      if (child.id === 'BE-02') cloned.name = `输入失效：${failure.slice(0, 70)}`;
      if (idx === 0 && child.id === 'GE-02') cloned.name = `Gate 2: ${node.name.includes('BLDC') ? '控制/时序异常' : '控制与检测失效'}`;
      return cloned;
    }),
  };
}

export function deriveFtaTree(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null): FtaNode {
  const failure = issue.failurePhenomenon || '当前工况关键失效模式';
  const rootName = `${context.productType} 在【${context.projectPhase}】${failure.slice(0, 55)}`;
  return cloneFta(SAMPLE_FTA_TREE, failure, result?.physicalMechanism.rootCauseAnalysis || issue.engineeringConcern, rootName);
}

export function deriveSafetyCollateral(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null) {
  const category = issue.issueCategories?.[0] || 'Other';
  const domain = resolveEngineeringDomain(issue);
  const text = `${issue.testCondition} ${issue.environment} ${issue.actualMeasurement} ${issue.requirement}`;
  const explicitVoltage = measuredNumber(issue, 'busVoltageNominalV');
  const voltage = Number.isFinite(explicitVoltage) ? explicitVoltage : firstNumber(text, [/(?:标称|供电|输入)[^0-9]{0,24}(\d+(?:\.\d+)?)\s*V/i, /(400|800)\s*V/i], NaN);
  const current = firstNumber(text, [/(?:峰值电流|peak current|current)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*A/i], 20);
  const tempMatches = [...text.matchAll(/(\+?-?\d+(?:\.\d+)?)\s*(?:℃|°C)/gi)].map(m => Number(m[1])).filter(Number.isFinite);
  const hotValues = tempMatches.filter(v => v <= 125);
  const explicitHot = measuredNumber(issue, 'ambientTempC');
  const hot = Number.isFinite(explicitHot) ? explicitHot : (hotValues.length ? Math.max(...hotValues) : NaN);
  const primary = domain === 'COMPONENT' ? '当前原器件（主供）' : `${context.productType} 主关键器件`;
  const secondary = domain === 'COMPONENT' ? '当前推荐替代器件（二供）' : `${context.productType} 备用料号/二供`;
  const rdsDelta = Number((2 + (result?.riskRatings.overallRiskScore ?? 60) / 18).toFixed(1));
  return {
    capacitor: {
      nominalHours: 5000,
      ratedTempC: 105,
      operatingTempC: Number.isFinite(hot) ? Math.max(-40, Math.min(125, hot)) : 85,
      rippleOperatingA: Number.isFinite(current) ? Math.max(0.5, Math.min(10, current / 8)) : 1,
      rippleRatedA: Number.isFinite(current) ? Math.max(4.5, Math.min(12, current / 6 + 1)) : 5,
    },
    secondSource: { primary, secondary, rdsDelta },
    pcn: {
      changeType: domain === 'COMPONENT' ? 'LOT_PROCESS_CHANGE' : domain.startsWith('EMC_') ? 'PACKAGE_CHANGE' : 'WAFER_FAB',
      component: `${context.productType} / 当前关键器件`,
    },
    esd: {
      tvsModel: Number.isFinite(voltage) && voltage >= 200 ? '高压输入级 TVS / 放电回路（按当前器件规格确认）' : '车规级 TVS（按当前输入标称电压选择）',
      clampingVoltageV: Number.isFinite(voltage) ? Number((voltage * 2.9).toFixed(1)) : NaN,
      chassisCapacitancePf: domain.startsWith('EMC_') ? 2200 : 1800,
      status: result?.riskRatings.qualityRisk === 'High' ? 'ATTENTION' : 'PASS',
    },
    bci: {
      harnessCouplingLoopCm2: Number.isFinite(current) ? Number((30 + Math.min(80, current * 0.8)).toFixed(1)) : NaN,
      susceptibleBandMhz: domain.startsWith('EMC_') ? '优先关注当前工况频段及共模谐振边界' : '根据当前开关频率、线束与负载阻抗识别敏感频段',
    },
    scenarioLabel: `${context.projectName} / ${context.projectPhase} / ${context.asilLevel}`,
  };
}

export function deriveComponentChangeImpact(
  context: ProjectContext,
  issue: IssueInput,
  result?: CopilotAnalysisResult | null,
  forcedCategory?: ComponentChangeImpactItem['componentCategory']
): ComponentChangeImpactItem {
  const domain = resolveEngineeringDomain(issue);
  const category = forcedCategory || (domain === 'COMPONENT' ? 'MOSFET'
    : domain === 'BLDC' ? 'GATE_DRIVER'
    : domain.startsWith('EMC_') ? (domain === 'EMC_BCI' || domain === 'EMC_ESD' ? 'TVS' : 'SNUBBER')
    : domain === 'WCCA' || domain === 'WCCA_EOL' ? 'CURRENT_SENSOR'
    : domain === 'THERMAL' || domain === 'POWER' || domain === 'POWER_TRANSIENT' ? 'MOSFET'
    : 'MCU');
  const base = generateComponentImpact(category as any);
  const score = result?.riskRatings.overallRiskScore ?? 60;
  const problem = issue.failurePhenomenon || issue.engineeringConcern || '当前工况关键工程问题';
  const currentCondition = issue.testCondition || issue.environment || '当前典型工况';
  return {
    ...base,
    changeDescription: `当前工况【${context.projectName}】${base.changeDescription}；场景：${issue.issueCategories?.join(' / ') || 'Other'}`,
    electricalImpact: `${base.electricalImpact}；本工况边界：${currentCondition.slice(0, 90)}`,
    thermalImpact: `${base.thermalImpact}；当前综合风险评分 ${score}/100`,
    emcImpact: `${base.emcImpact}；当前失效现象：${problem.slice(0, 90)}`,
    safetyImpact: `${base.safetyImpact}；当前 ASIL：${context.asilLevel}`,
    reliabilityImpact: `${base.reliabilityImpact}；当前阶段：${context.projectPhase}`,
    controlImpact: `${base.controlImpact}；下一里程碑：${context.nextMilestone}`,
    mandatoryRetests: [
      `当前工况边界回归：${currentCondition.slice(0, 100)}（必须重做）`,
      ...base.mandatoryRetests.slice(0, 3),
    ],
  };
}

function generateComponentImpact(category: ComponentChangeImpactItem['componentCategory']): ComponentChangeImpactItem {
  // 复用原有确定性器件影响引擎，避免复制规则；该函数只负责把场景上下文注入。
  return evaluateComponentChangeImpactInternal(category);
}

function evaluateComponentChangeImpactInternal(category: ComponentChangeImpactItem['componentCategory']): ComponentChangeImpactItem {
  switch (category) {
    case 'MOSFET':
      return { componentCategory: 'MOSFET', changeDescription: '更换功率 MOSFET 芯片型号或跨厂商二供替换', electricalImpact: 'Rds(on)、Qg、Cgd 与额定电压变化会改变导通压降、开关损耗及米勒感应', thermalImpact: '热阻 Rth(jc)、封装与接触热阻变化影响高温结温', emcImpact: 'dv/dt、Qrr 与寄生参数变化会改变传导/辐射骚扰', safetyImpact: 'SOA、雪崩能量及短路耐受能力改变', reliabilityImpact: '封装与焊接工艺变化影响热疲劳寿命', controlImpact: '死区、栅极驱动与保护阈值需重新确认', mandatoryRetests: ['全温区电气应力与 SOA 验证', '关键开关波形 / 米勒尖峰示波器捕获', '高温满载温升与寿命摸底测试'] };
    case 'GATE_DRIVER':
      return { componentCategory: 'GATE_DRIVER', changeDescription: '更换 Gate Driver / 栅极预驱器件', electricalImpact: 'Source/Sink 驱动能力与 UVLO 阈值发生变化', thermalImpact: '驱动输出级功耗与热阻路径发生变化', emcImpact: '开关边沿和寄生振铃发生变化', safetyImpact: '硬件互锁、Fault 响应与诊断路径需重新证明', reliabilityImpact: '高低温传播延迟及绝缘耐受需要复核', controlImpact: '死区与 PWM 时序必须重新标定', mandatoryRetests: ['UVLO 与 Fault-to-Off 响应测试', '全温区死区与传播延迟测试', 'EMC 与开关节点波形回归'] };
    case 'CURRENT_SENSOR':
    case 'SHUNT_RESISTOR':
      return { componentCategory: category, changeDescription: '更换电流采样器件 / 分流电阻', electricalImpact: '阻值、增益、公差及寄生电感变化影响采样精度', thermalImpact: 'TCR 与功耗变化影响高温精度与寿命', emcImpact: '采样回路寄生参数改变高频抗扰特性', safetyImpact: '开路/短路诊断覆盖率需重新确认', reliabilityImpact: '脉冲热应力与焊点疲劳需重新评估', controlImpact: '电流环增益、滤波与保护阈值需重新标定', mandatoryRetests: ['全温区零点/增益误差测试', '大电流温升与阻值漂移测试', '故障注入与诊断覆盖率回归'] };
    case 'SNUBBER':
      return { componentCategory: 'SNUBBER', changeDescription: '更换 RC Snubber / 高频吸收网络参数', electricalImpact: 'R/C 参数改变开关节点阻尼与损耗', thermalImpact: '吸收网络功耗与局部热点发生变化', emcImpact: '重点影响当前超标频段的峰值与带宽', safetyImpact: '不能以 EMI 改善换取器件过热或过压风险', reliabilityImpact: '脉冲功耗与电容寿命需要实测', controlImpact: '需确认不会侵入驱动时序与边沿裕量', mandatoryRetests: ['目标频段 RE/CE 对比测试', 'Snubber 脉冲功耗与温升测试', '最不利开关节点 Vds / dv/dt 回归'] };
    default:
      return { componentCategory: category, changeDescription: `更换 ${category} 关键器件`, electricalImpact: '额定参数与公差范围变化', thermalImpact: '功耗和热路径变化', emcImpact: '高频寄生与耦合路径变化', safetyImpact: '诊断覆盖率和安全机制需重新评估', reliabilityImpact: '寿命模型需要按新器件复核', controlImpact: '软件滤波与控制参数需重新确认', mandatoryRetests: ['电气应力裕量回归', 'EMC 对比回归', '功能安全故障注入回归'] };
  }
}

export function derivePhaseChecklist(phase: 'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP', context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null): PhaseCheckItem[] {
  // 不再把 designReviewEngine 中的历史案例 checklist 当作当前工程事实。
  // 这里只借用条目数量/阶段结构，所有 checkpoint 与 notes 必须由当前场景重新生成。
  const base = getPhaseReviewChecklist(phase).map((item) => ({
    ...item,
    notes: '模板结构：当前工程证据待确认，不代表当前项目已完成该检查项。',
  }));
  const score = result?.riskRatings.overallRiskScore ?? 60;
  const domain = resolveEngineeringDomain(issue);
  const category = issue.issueCategories?.[0] || 'Other';
  const problem = issue.failurePhenomenon || issue.engineeringConcern || '当前工况关键问题';
  const riskTone = score >= 80 ? 'CRITICAL_RISK' : score >= 65 ? 'NEEDS_ATTENTION' : 'COMPLIANT';
  const scenarioCheckpoints: Record<string, string[]> = {
    EMC_BCI: ['逐频点 Iinj—敏感节点—功能状态三联测', '线束/连接器/参考地/滤波/屏蔽 A-B 隔离', '异常恢复时间与 CAN/ADC 功能门禁回归'],
    EMC_ESD: ['逐端口/等级放电路径与功能状态矩阵', 'TVS/壳体/参考地/回流路径 A-B', '放电后潜在损伤与恢复时间复测'],
    EMC_RE_CE: ['问题频点峰值/平均值与检波器类型可追溯', '源—路径—受扰体及共模/差模 A-B', '整改后的正式装配状态 RE/CE 回归'],
    WCCA_EOL: ['初始公差/温漂/老化/制造离散分项', 'EOL Calibration 前后残余误差与重复性', 'Cpk/Ppk 与现场窗口、老化后残余趋势关联'],
    WCCA: ['关键 contributor 的 min/max 与相关性假设', 'Extreme / RSS / Monte Carlo 与实测分布对照', '模型参数校准与样本量充分性复核'],
    POWER_TRANSIENT: ['源端与 ECU 端双测点捕获规定脉冲', '内部 DC/DC/MCU 电源轨峰值、跌落与恢复', '器件绝对最大额定值 + 功能/通信联合门禁'],
    SIGNAL: ['TDR/阻抗/回流路径与终端拓扑确认', '最坏线束/温度/节点数眼图与时序裕量', '错误帧与物理波形关联回归'],
    COMPONENT: ['Spec-to-Spec + Use-case-to-Use-case 等价性', '动态/热/SOA/EMC 全温回归', 'PPAP/PCN/批次与变更追溯'],
    THERMAL: ['功耗来源分解与热阻路径实测', '高温满载稳态/瞬态 Tj 与降额裕量', '设计/材料变更后的热—可靠性关联'],
    EMC: ['当前工况频段/谐振点与线束耦合路径验证', '滤波、屏蔽、接地变更后传导与辐射发射回归', '抗扰度注入下关键采样/通信链路功能保持'],
    'Component Alternative': ['替代器件额定值、Rds(on)、Qg/Qrr 与现设计边界等效性', '替代器件温升、SOA、短路/雪崩与栅极动态回归', '替代器件 EMC、功能安全诊断覆盖率与供应链追溯'],
    Thermal: ['当前热边界下功率器件结温与热路径裕量', '高温/高负载条件下稳态与瞬态温升实测', '散热结构或材料变化后的热阻/寿命模型回归'],
    Power: ['当前电源输入边界与瞬态能量路径安全裕量', '抛负载/欠压/峰值电流条件下功率级行为', '保护阈值、故障注入与恢复路径验证'],
    'Functional Safety': ['当前故障模式到 SG/FSR/TSR/HSR 的追溯完整性', '诊断覆盖率、故障容错时间与安全状态实测', '独立硬件安全机制与软件故障注入回归'],
  };
  const points = scenarioCheckpoints[domain] || scenarioCheckpoints[category] || [
    `针对当前问题“${problem.slice(0, 60)}”确认设计输入与验证边界`,
    `围绕${category}风险完成关键参数实测与回归`,
    `形成当前工况的证据链、门禁判据与变更追溯`,
  ];
  // 模板（designReviewEngine）是 BLDC 案例：只借用阶段与条目数量。
  // category / standardClause / status 一律由当前工况重新生成，禁止继承模板里的 MOSFET/门极/电流采样
  // 分类、半导体标准条款以及历史案例的 CRITICAL_RISK 判定。BLDC/机器人关节工况才保留模板分类与条款。
  const keepTemplateLabels = domain === 'BLDC' || domain === 'ROBOT_JOINT';
  const neutralCategories = ['设计输入与边界', '验证与回归', '证据链与追溯'];
  const clauseByDomain: Record<string, string> = {
    EMC_BCI: 'ISO 11452-4（BCI）/ 客户 EMC 规范',
    EMC_ESD: 'ISO 10605 / 客户 ESD 规范',
    EMC_RE_CE: 'CISPR 25 / 客户 EMC 规范',
    POWER_TRANSIENT: 'ISO 7637-2 / ISO 16750-2 / 客户电源规范',
    SIGNAL: 'ISO 11898-2（CAN/CAN FD 物理层）或对应总线规范',
    COMPONENT: 'AEC-Q100/Q101 + 器件规格书 + PCN/PPAP 要求',
    THERMAL: 'JESD51 系列热测试规范 + 器件规格书降额要求',
    WCCA: '客户/内部 WCCA 与降额规范（待确认）',
    WCCA_EOL: '客户/内部 WCCA 与 EOL 标定规范（待确认）',
    SAFETY: 'ISO 26262',
  };
  const clause = clauseByDomain[domain] || '依据当前项目适用标准与客户规范（待确认）';
  return base.map((item, idx) => ({
    ...item,
    category: keepTemplateLabels
      ? `${category}｜${item.category}`
      : `${category}｜${neutralCategories[idx % neutralCategories.length]}`,
    standardClause: keepTemplateLabels ? item.standardClause : clause,
    checkpoint: `${points[idx % points.length]}（${context.productType}）`,
    status: idx === 0 ? riskTone : (score >= 65 ? 'NEEDS_ATTENTION' : 'COMPLIANT'),
    notes: `当前工程 ${context.projectName}｜${context.projectPhase}｜${context.asilLevel}｜剩余 ${context.daysRemaining} 天。问题：${problem.slice(0, 90)}。${result?.unknowns?.[0] ? `首要未知项：${result.unknowns[0].slice(0, 70)}。` : ''}`,
  }));
}

export function deriveWorstCases(context: ProjectContext, issue: IssueInput, result?: CopilotAnalysisResult | null): WorstCaseCombination[] {
  const score = result?.riskRatings.overallRiskScore ?? 60;
  const problem = issue.failurePhenomenon || issue.engineeringConcern || '当前工况关键风险';
  const env = issue.environment || issue.testCondition || '目标验证环境';
  const deadline = `${context.projectPhase} / 剩余 ${context.daysRemaining} 天`;
  const baseA: WorstCaseCombination = {
    id: 'WC-SC-1',
    name: `当前工程最不利组合｜${context.productType}`,
    tag: 'CANDIDATE_UNVERIFIED',
    vbusCondition: issue.actualMeasurement || '以当前实测/规格中的最不利电气边界为基准',
    ambientTempCondition: env,
    currentCondition: problem.slice(0, 110),
    rpmCondition: issue.testCondition || '按当前测试条件施加最不利运行边界',
    componentToleranceCondition: `结合 ${context.asilLevel} 与当前风险评分 ${score}/100 识别关键公差项`,
    combinedPeakStress: `风险评分 ${score}/100；当前异常：${problem.slice(0, 100)}`,
    marginToAbsoluteMax: `必须依据当前器件规格与客户门限重新计算，不能沿用其他典型工况的固定电压/结温基准。`,
    verificationRequired: `验证窗口：${deadline}；优先验证当前问题的最大决策不确定性。`,
  };
  const baseB: WorstCaseCombination = {
    id: 'WC-SC-2',
    name: `当前工程边界回归组合｜${context.projectName}`,
    tag: 'CANDIDATE_UNVERIFIED',
    vbusCondition: issue.requirement || '当前工程需求边界待确认',
    ambientTempCondition: env,
    currentCondition: `风险维度：${result?.riskRatings.technicalRisk || 'Medium'} / ${result?.riskRatings.reliabilityRisk || 'Medium'}`,
    rpmCondition: context.nextMilestone || '下一里程碑前完成验证',
    componentToleranceCondition: issue.notes || '器件初始容差、温漂、老化与装配变异需纳入验证',
    combinedPeakStress: `场景化边界：${context.projectPhase}、${context.asilLevel}、${context.customer}；核心现象：${problem.slice(0, 95)}`,
    marginToAbsoluteMax: `当前工程尚未闭环的证据：${result?.unknowns?.[0] || '请补充关键实测数据'}`,
    verificationRequired: `以 ${context.nextMilestone} 为门禁，针对当前工况完成实测与回归。`,
  };
  return [baseA, baseB];
}
