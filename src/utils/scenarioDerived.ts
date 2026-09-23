import { ProjectContext, IssueInput, CopilotAnalysisResult, ComponentChangeImpactItem } from '../types';
import { BldcEvaluationInput } from '../data/bldcPatternEngine';
import { FmedaRow, FtaNode, SafetyTraceabilityNode, PhaseCheckItem, WorstCaseCombination } from '../types';
import { SAMPLE_FMEDA_ROWS, SAMPLE_FTA_TREE, SAMPLE_SAFETY_TRACEABILITY_CHAIN } from '../data/safetyReliabilityEngine';
import { generateWorstCaseCandidates, getPhaseReviewChecklist } from '../data/designReviewEngine';
import { resolveEngineeringDomain, getDomainPhysics } from './scenarioDomainEngine';
import { loadDevices, getDeviceCurve } from './deviceLibrary';

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

function measuredNumber(issue: IssueInput, key: string): number {
  const raw = issue.measuredValues?.[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function preferMeasured(issue: IssueInput, key: string, parsed: number): number {
  const direct = measuredNumber(issue, key);
  return Number.isFinite(direct) ? direct : parsed;
}

function optMeas(issue: IssueInput, key: string): number | undefined {
  const v = measuredNumber(issue, key);
  return Number.isFinite(v) ? v : undefined;
}

export function deriveBldcEvaluationInput(context: ProjectContext, issue: IssueInput): BldcEvaluationInput {
  const text = allText(issue);
  const isEmc = issue.issueCategories?.includes('EMC');
  const isComponent = issue.issueCategories?.includes('Component Alternative');
  const isWcca = issue.issueCategories?.includes('WCCA');
  const isThermal = issue.issueCategories?.includes('Thermal') || issue.issueCategories?.includes('Power');
  const isBenchmark = issue.measuredValueSource === 'BENCHMARK';

  let vbusMeasuredPeak = firstNumber(text, [
    /(?:实测|测量|measured)[^0-9]{0,32}(?:瞬态|泵升)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*V/i,
    /(?:母线|bus)[^0-9]{0,24}(?:瞬态|泵升)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*V/i,
    /(?:峰值电压|peak voltage)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*V/i,
  ], NaN);
  vbusMeasuredPeak = preferMeasured(issue, 'busVoltagePeakV', vbusMeasuredPeak);

  let vbusNominal = firstNumber(text, [
    /(\d+(?:\.\d+)?)\s*V\s*(?:输入|供电|input|supply)/i,
    /(?:标称|nominal)[^0-9]{0,24}(\d+(?:\.\d+)?)\s*V/i,
    /(?:供电|电源设置|supply)[^0-9]{0,16}(\d+(?:\.\d+)?)\s*V/i,
    /(400|800)\s*V/i,
    /(48|24|13\.5|12)\s*V/i,
  ], isBenchmark ? (context.productType.toLowerCase().includes('400v') ? 400 : 13.5) : NaN);
  vbusNominal = preferMeasured(issue, 'busVoltageNominalV', vbusNominal);
  vbusNominal = preferMeasured(issue, 'inputVoltageV', vbusNominal);

  let rpm = firstNumber(text, [
    /(\d+(?:\.\d+)?)\s*rpm/i,
    /转速[^0-9]{0,12}(\d+(?:\.\d+)?)/i,
  ], isBenchmark ? (isEmc ? 3000 : isComponent ? 1500 : isWcca ? 800 : isThermal ? 2200 : 3800) : NaN);
  rpm = preferMeasured(issue, 'rpm', rpm);

  let vdsRating = firstNumber(text, [
    /(?:MOSFET|功率管)[^。\n]{0,90}?(\d+(?:\.\d+)?)\s*V\s*(?:耐压|rating)/i,
    /(?:耐压上限|额定耐压|击穿电压)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*V/i,
    /(?:Vds(?:_rating)?)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*V/i,
    /(?:MOSFET|功率管)[^。\n]{0,25}?(\d+(?:\.\d+)?)\s*V(?:[,，\s]|$)/i,
  ], isBenchmark ? ((/(?:400V)/i.test(text)) ? 650 : 40) : NaN);
  vdsRating = preferMeasured(issue, 'vdsRatingV', vdsRating);

  let cbusUf = firstNumber(text, [
    /(?:Cbus|母线(?:去耦|电容|储能)[^0-9]{0,15})(\d+(?:\.\d+)?)\s*(?:μF|uF)/i,
    /(\d+(?:\.\d+)?)\s*(?:μF|uF)/i,
  ], isBenchmark ? 470 : NaN);
  cbusUf = preferMeasured(issue, 'cBusUf', cbusUf);

  let tAmbientC = firstNumber(text, [
    /(?:环温|环境温度|ambient|温箱)[^0-9+-]{0,20}(\+?-?\d+(?:\.\d+)?)\s*(?:℃|°C)/i,
    /(\+?\d+(?:\.\d+)?)\s*℃[^\n]{0,20}(?:高温|温升|堵转)/i,
  ], isBenchmark ? (context.projectPhase === 'DVT' || context.projectPhase === 'DV' ? 85 : 25) : NaN);
  tAmbientC = preferMeasured(issue, 'ambientTempC', tAmbientC);

  let currentPeakA = firstNumber(text, [
    /(?:峰值电流|peak current|current)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*A/i,
    /(\d+(?:\.\d+)?)\s*A[^\n]{0,20}(?:峰值|堵转|满载)/i,
  ], isBenchmark ? 25 : NaN);
  currentPeakA = preferMeasured(issue, 'currentPeakA', currentPeakA);
  currentPeakA = preferMeasured(issue, 'loadCurrentA', currentPeakA);

  let harnessLengthM = firstNumber(text, [
    /(?:线束|harness)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*m/i,
  ], isBenchmark ? 1.8 : NaN);
  harnessLengthM = preferMeasured(issue, 'harnessLengthM', harnessLengthM);

  let deadTimeNs = firstNumber(text, [
    /(?:DeadTime|死区(?:时间)?)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*ns/i,
  ], isBenchmark ? 120 : NaN);
  deadTimeNs = preferMeasured(issue, 'deadTimeNs', deadTimeNs);

  let rgOffOhm = firstNumber(text, [
    /(?:Rg_off|关断电阻)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*Ω?/i,
  ], isBenchmark ? 4.7 : NaN);
  rgOffOhm = preferMeasured(issue, 'rgOffOhm', rgOffOhm);

  let cgdPf = firstNumber(text, [
    /(?:Cgd|米勒电容)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*pF/i,
  ], isBenchmark ? 45 : NaN);
  cgdPf = preferMeasured(issue, 'cgdPf', cgdPf);

  let dvDtVns = firstNumber(text, [
    /(?:dv\/?dt|dv\/dt)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*V\/ns/i,
  ], isBenchmark ? 8.0 : NaN);
  dvDtVns = preferMeasured(issue, 'dvdtVns', dvDtVns);

  let vthMinV = firstNumber(text, [
    /(?:Vth|min.*?阈值|开启阈值)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*V/i,
  ], isBenchmark ? 2.0 : NaN);
  vthMinV = preferMeasured(issue, 'vthMinV', vthMinV);

  let keVkrpm = firstNumber(text, [
    /(?:Ke|反电动势常数)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*V\/?krpm/i,
  ], isBenchmark ? 4.2 : NaN);
  keVkrpm = preferMeasured(issue, 'keVkrpm', keVkrpm);

  let rthJc = firstNumber(text, [
    /(?:Rth(?:\(jc\))?|热阻)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*(?:℃\/W|K\/W)/i,
  ], isBenchmark ? 1.8 : NaN);
  rthJc = preferMeasured(issue, 'thermalResistanceCPerW', rthJc);

  let rdsOnMilliOhm = firstNumber(text, [
    /(?:Rds\(?on\)?|RDS\(on\)|导通电阻)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*mΩ/i,
    /(\d+(?:\.\d+)?)\s*mΩ[^\n]{0,25}(?:Rds|导通)/i,
  ], isBenchmark ? 3.5 : NaN);
  rdsOnMilliOhm = preferMeasured(issue, 'rdsOnMilliOhm', rdsOnMilliOhm);

  // [输入驱动] 不再用转速反推惯量（0.00015·(rpm/3800)^0.15 是无出处的自造公式）；
  // 缺 rotorInertiaKgm2 时保持 NaN，交由引擎按“缺输入”处理，而不是伪造一个惯量值。
  const jInertia = preferMeasured(issue, 'rotorInertiaKgm2', NaN);

  // 从器件库读取当前选中器件，提取曲线用于按工况插值（无选中器件时退回写死默认值）
  const selectedDeviceId = (context as any).selectedDeviceId;
  let rdsOnCurve: Array<{ x: number; y: number }> | undefined;
  let crssCurve: Array<{ x: number; y: number }> | undefined;
  let vthCurve: Array<{ x: number; y: number }> | undefined;
  let easEnergyMj: number | undefined;
  if (selectedDeviceId) {
    const dev = loadDevices().find((d) => d.id === selectedDeviceId);
    if (dev) {
      rdsOnCurve = getDeviceCurve(dev, 'rdsOn');
      crssCurve = getDeviceCurve(dev, 'crss');
      vthCurve = getDeviceCurve(dev, 'vth');
      const easPulse = (dev.raw as any)?.maxRatings?.easPulse;
      easEnergyMj = easPulse && easPulse.value != null ? Number(easPulse.value) : undefined;
    }
  }

  // ----------------------------------------------------------------
  // [本次修复新增] P009/P010/P011/P018 此前在引擎里是无条件 triggered:true 的硬编码，
  // 现在改为依据下面这些从自由文本/结构化实测值中抽取出的证据字段来判断是否适用于
  // 当前case。抽取不到证据时保持 undefined——引擎侧会据此不触发，而不是继续拍脑袋硬编码。
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
    rthJc: Number.isFinite(rthJc) ? rthJc : undefined,
    rdsOnMilliOhm: Number.isFinite(rdsOnMilliOhm) ? rdsOnMilliOhm : undefined,
    senseDelayNsOverride: optMeas(issue, 'senseDelayNs'),
    compDelayNsOverride: optMeas(issue, 'compDelayNs'),
    digitalFilterDelayNsOverride: optMeas(issue, 'digitalFilterDelayNs'),
    driverPropDelayNsOverride: optMeas(issue, 'driverPropDelayNs'),
    gateTurnOffDelayNsOverride: optMeas(issue, 'gateTurnOffDelayNs'),
    currentFallDelayNsOverride: optMeas(issue, 'currentFallDelayNs'),
    soaShortCircuitTimeUsOverride: optMeas(issue, 'soaShortCircuitTimeUs'),
    rdsOnCurve,
    crssCurve,
    vthCurve,
    easEnergyMj,
    gateSpikeMeasuredV: optMeas(issue, 'gateSpikeV'),
    motorSensorType,
    hallFaultRiskIndicated: hallFaultRiskIndicated || undefined,
    currentSenseArchitecture,
    currentSenseFaultRiskIndicated: currentSenseFaultRiskIndicated || undefined,
    vbusMinExpectedV,
    hasSupplyBoostRegulation,
    driverLockupRiskIndicated: driverLockupRiskIndicated || undefined,
    stallRiskIndicated: stallRiskIndicated || undefined,
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
  const base = getPhaseReviewChecklist(phase);
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
  return base.map((item, idx) => ({
    ...item,
    category: `${category}｜${item.category}`,
    checkpoint: `${points[idx % points.length]}（${context.productType}）`,
    status: idx === 0 ? riskTone : (score >= 70 && idx === 1 ? 'NEEDS_ATTENTION' : item.status),
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
    marginToAbsoluteMax: `必须依据当前器件规格与客户门限重新计算，不能沿用固定 40V/150℃ 基准。`,
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
