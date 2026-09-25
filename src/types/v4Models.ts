/**
 * ECU Hardware Engineering Decision Copilot — V4 数据模型
 * 遵循唯一权威原则：AI 文本/机理，Engine 物理计算，Engineer 决策，Test 闭环，History 知识沉淀
 */

import { AsilLevel, ProjectPhase, RiskLevel, TraceNode } from '../types';

// ==========================================
// 2. Evidence & Confidence 模型 (Section 2)
// ==========================================

export type EvidenceType =
  | 'MEASURED'
  | 'CALCULATED'
  | 'DATASHEET'
  | 'SPECIFICATION'
  | 'CUSTOMER_REQUIREMENT'
  | 'HISTORICAL'
  | 'ENGINEERING_ASSUMPTION'
  | 'AI_INFERENCE'
  | 'UNKNOWN';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvidenceItem {
  id: string;
  claim: string;
  evidenceType: EvidenceType;
  source: string;
  confidence: ConfidenceLevel;
  confidenceReason: string;
  measuredValue?: string | number;
  calculatedValue?: string | number;
  toleranceOrBandwidth?: string;
  verificationMethod?: string;
}

export interface TraceableClaim {
  id: string;
  claimText: string;
  evidence: EvidenceType;
  source: string;
  confidence: ConfidenceLevel;
  confidenceNote: string;
}

// ==========================================
// 3. 统一工程输入数据模型 (Section 3)
// ==========================================

export interface ProjectModel {
  projectName: string;
  projectPhase: ProjectPhase;
  customer: string;
  ecuType: string;
  motorType: string;
  asil: AsilLevel;
  sopDate: string;
  milestone: string;
}

export interface ElectricalModel {
  vbusNominal: number; // V
  vbusMin: number;     // V
  vbusMax: number;     // V
  currentNominal: number; // A
  currentPeak: number;    // A
  currentStall: number;   // A
  maxRpm: number;         // rpm
  pwmFrequencyKhz: number;// kHz
}

export interface MotorModel {
  motorType: 'BLDC_INNER_ROTOR' | 'BLDC_OUTER_ROTOR' | 'PMSM' | 'STEPPER' | 'DC_BRUSHED';
  polePairs: number;
  kv: number;       // RPM/V
  ke: number;       // V/krpm (Line-to-Line peak)
  j: number;        // kg·m² (转动惯量)
  ratedTorqueNm: number;
  peakTorqueNm: number;
  maxRpm: number;
  sensorType: 'HALL' | 'ENCODER' | 'RESOLVER' | 'SENSORLESS';
}

export interface PowerStageModel {
  mosfetPartNumber: string;
  vdsRating: number;   // V (额定击穿电压)
  rdsOnMilliOhm: number; // mΩ
  vthMinV?: number;    // V (门极阈值电压下限)
  dvdtVns?: number;    // V/ns (最大开关瞬态斜率)
  cgdPf?: number;      // pF (米勒电容，精确值)
  qgNc: number;        // nC
  qgdNc: number;       // nC
  qrrNc: number;       // nC
  gateDriverPartNumber: string;
  rgOnOhm: number;
  rgOffOhm: number;
  cbusUf: number;      // μF
  cbusEsrMilliOhm: number;
  tvsModel?: string;
  snubberR?: number;
  snubberC?: number;
}

export interface CurrentSenseModel {
  senseArchitecture: 'LOW_SIDE_SINGLE' | 'THREE_PHASE_LOW_SIDE' | 'INLINE_PHASE' | 'HALL_SENSOR';
  shuntResistanceMilliOhm: number;
  gain: number;
  offsetMv: number;
  bandwidthKhz: number;
  samplingFrequencyKhz: number;
  adcResolutionBits: number;
}

export interface EnvironmentModel {
  tAmbientC: number;
  tCaseC: number;
  tjMaxC: number;
  cooling: 'NATURAL_CONVECTION' | 'FORCED_AIR' | 'COLD_PLATE' | 'OIL_COOLED';
  harnessLengthMeters: number;
  connectorType: string;
}

export interface EngineeringIssueModel {
  failurePhenomenon: string;
  testCondition: string;
  measuredData: string;
  requirement: string;
  engineeringConcern: string;
  measuredValues?: Record<string, number | string>;
}

export interface MechanicalModel {
  gearRatio: number;
  backlashArcmin: number;
  torsionalStiffnessNmPerRad: number;
  loadInertiaKgm2: number;
  requiredPositionAccuracyArcmin?: number;
  velocityLoopBandwidthHz?: number;
  regenPowerPeakW?: number;
  brakingResistorRatedContinuousW?: number;
}

export interface UnifiedEngineeringModel {
  project: ProjectModel;
  electrical: ElectricalModel;
  motor: MotorModel;
  powerStage: PowerStageModel;
  currentSense: CurrentSenseModel;
  environment: EnvironmentModel;
  mechanical: MechanicalModel;
  issue: EngineeringIssueModel;
}

// ==========================================
// 4. BLDC Pattern Engine 数据结构 (Section 4 & 4.1)
// ==========================================

export type BldcPatternId =
  | 'P001' // 急停→母线泵升
  | 'P002' // 高转速→反电动势过压
  | 'P003' // 高dv/dt→米勒误导通
  | 'P004' // 死区过短→直通
  | 'P005' // 死区过长→换相畸变
  | 'P006' // 大电流→MOSFET过热
  | 'P007' // 高温→热失控风险
  | 'P008' // 长线束→EMI/振铃
  | 'P009' // 霍尔故障
  | 'P010' // 电流采样故障
  | 'P011' // 驱动UVLO
  | 'P012' // 自举电压不足
  | 'P013' // 母线电容不足
  | 'P014' // MOSFET VDS裕量
  | 'P015' // MCU依赖型保护
  | 'P016' // 过流/短路保护响应时间 ↔ SOA
  | 'P017' // 电流采样架构决策器
  | 'P018'; // 堵转保护多级判据

// 机器人/协作臂关节机电系统层专项判据 (与上面 P001~P018 车规逆变桥物理模式互补，
// 由 src/data/robotJointPatternEngine.ts 的 evaluateAllRobotJointPatterns() 产生)
export type RobotJointPatternId =
  | 'J001' // 谐波/RV减速器背隙+扭转柔性 → 输出定位精度
  | 'J002' // 多圈绝对值编码器电池/掉电 → 位置基准丢失
  | 'J003' // 机械谐振(二质量系统) → 速度环带宽/陷波滤波器
  | 'J004' // 连续往复再生能量 → 泄放电阻连续热过载
  | 'J005' // 电流估算力矩 vs 减速器效率漂移/力矩传感器
  | 'J006' // STO/SS1 安全扭矩关断通道独立性与响应时间
  | 'J007'; // 现场总线周期(EtherCAT/CANopen) 与本地控制环耦合

export interface PatternOutputItem {
  id: BldcPatternId;
  name: string;
  triggered: boolean;
  // 区分"实测/工况相关，检测到才报"的具体故障模式 (DETECTED_RISK，默认值，向后兼容未标注的旧数据)
  // 与"设计参考清单/架构权衡矩阵"类内容 (CHECKLIST，例如 P015/P017)。
  // CHECKLIST 类模式的 triggered 恒为 true 属于预期设计(供工程师随时查阅)，UI 与统计口径
  // 不应把它们和 DETECTED_RISK 的 triggered 混入同一条"已触发风险"列表，避免检查清单
  // 冒充成"这个具体case测出来的问题"。
  patternKind?: 'DETECTED_RISK' | 'CHECKLIST';
  corePhysicalChain: string;
  calculatedValues: Record<string, string | number>;
  riskLevel: RiskLevel;
  confidence: ConfidenceLevel;
  evidenceType: EvidenceType;
  vetoTriggered: boolean;
  vetoReason?: string;
  candidateMeasures: string[];
  sideEffects: string[];
  verificationItems: string[];
  unknownsToTest: string[];
  trace?: TraceNode[]; // Phase 5：确定性输出的输入→公式→阈值→Verdict 追溯链
}

// ==========================================
// 5. 功能安全深度模型 (Section 5)
// ==========================================

export interface SafetyTraceabilityNode {
  haraId: string;
  safetyGoal: string;
  asil: AsilLevel;
  fsr: string; // Functional Safety Requirement
  tsr: string; // Technical Safety Requirement
  hsr: string; // Hardware Safety Requirement
  failureMode: string;
  hardwareComponent: string;
  detectionMechanism: string;
  diagnosticCoveragePct: number;
  safeState: string;
  faultHandlingTimeIntervalMs: number;
  evidence: EvidenceType;
}

export interface FmedaRow {
  component: string;
  failureMode: string;
  lambdaTotalFit: number; // Failure In Time (10^-9/h)
  fractionSafePct: number;
  fractionDangerousPct: number;
  dcPct: number; // Diagnostic Coverage
  lambdaSafeFit: number;
  lambdaSpfFit: number; // Single Point Failure
  lambdaRfFit: number;  // Residual Failure
  lambdaLfFit: number;  // Latent Failure
  evidence: EvidenceType;
  evidenceSource: string;
}

export interface FmedaSummary {
  spfmPct: number; // Single Point Fault Metric (ASIL C >= 97%, D >= 99%)
  lfmPct: number;  // Latent Fault Metric (ASIL B/C >= 60%, D >= 90%)
  spfmTargetPct: number;
  lfmTargetPct: number;
  isCompliant: boolean;
  contributions: {
    safeFailurePct: number;
    detectedFailurePct: number;
    residualFailurePct: number;
    singlePointFailurePct: number;
  };
}

export interface FtaNode {
  id: string;
  name: string;
  gateType?: 'OR' | 'AND';
  children?: FtaNode[];
  component?: string;
  detection?: string;
  mitigation?: string;
}

// ==========================================
// 6. EMC / 可靠性 / 供应链模型 (Section 6)
// ==========================================

export interface EsdAnalysis {
  dischargePath: string;
  tvsModel: string;
  clampingVoltageV: number;
  connectorGroundReturn: string;
  chassisCapacitancePf: number;
  sensitiveIcExposed: string;
  testStandardRequirement: string; // 若无来源必须标 Requirement Unknown
  isRequirementUnknown: boolean;
  status: 'PASS' | 'WARNING' | 'CRITICAL';
}

export interface BciAnalysis {
  harnessCouplingLoopCm2: number;
  susceptibleBandMhz: string;
  injectionPointRecommended: string;
  measurementPointRecommended: string;
  filteringMeasures: string[];
  verificationMethod: string;
}

export interface CapacitorLifeEstimate {
  capacitorType: 'ALUMINUM_ELECTROLYTIC' | 'POLYMER_HYBRID' | 'CERAMIC_MLCC';
  nominalHours: number; // e.g. 5000h @ 105C
  ratedTemperatureC: number;
  operatingTemperatureC: number;
  hotSpotTemperatureC: number;
  operatingHoursTarget: number;
  rippleCurrentOperatingA: number;
  rippleCurrentRatedA: number;
  estimatedLifeHours: number;
  marginHours: number;
  temperatureSensitivity: string;
  rippleSensitivity: string;
  modelType: 'ARRHENIUS_ACCELERATED';
  confidenceTag: 'MODEL ESTIMATE'; // 必须标注 MODEL ESTIMATE
}

export interface SecondSourceComparison {
  primaryPart: string;
  secondSourcePart: string;
  isElectricalInputProvided?: boolean; // 是否真的填了器件电气参数（缺输入时 UI 不得显示定量差值）
  electricalEquivalence: {
    vdsMatch: boolean;
    idMatch: boolean;
    rdsOnDeltaPct: number;
    qgDeltaPct: number;
    qrrDeltaPct: number;
  };
  thermalEquivalence: {
    rthJcDeltaPct: number;
    tjMaxSame: boolean;
  };
  switchingEquivalence: {
    dvDtImpact: string;
    ringingRisk: string;
  };
  safetyEmcEquivalence: {
    emcRisk: string;
    functionalSafetyAecQ: string;
  };
  overallVerdict: 'PIN_TO_PIN_QUALIFIED' | 'DERIVATIVE_REGRESSION_REQUIRED' | 'INCOMPATIBLE';
  retestRequired: string[];
}

export interface PcnEvaluation {
  component: string;
  supplier: string;
  changeType: 'WAFER_FAB' | 'PACKAGE_FACILITY' | 'MASK_REVISION' | 'PROCESS_NODE' | 'ASSEMBLY_SITE';
  changeDescription: string;
  invalidatedPreviousTests: string[];
  regressionVerdict: 'Regression Required' | 'Partial Regression' | 'No Regression' | 'Engineering Review Required';
  recommendedActions: string[];
}

// ==========================================
// 7. 决策引擎升级 (Section 7)
// ==========================================

export interface SideEffectItem {
  measure: string;
  primaryBenefit: string;
  sideEffects: string[];
  mitigation: string;
}

export interface V4CandidateAction {
  id: string; // 'Option A', 'Option B', 'Option C'
  name: string;
  category: 'conservative' | 'balanced' | 'schedule_priority';
  categoryLabel: string;
  principle: string;
  riskReduction: string;
  technologyImpact: string;
  scheduleImpact: string;
  cost: string;
  quality: string;
  softwareImpact: string;
  pcbImpact: string;
  verificationWorkload: string;
  sideEffect: string;
  residualRisk: RiskLevel;
  applicability: string;
  stopCondition: string;
  longTermFix: string;
  scores: {
    T: number;
    S: number;
    C: number;
    Q: number;
    L: number;
    total: number;
  };
  veto: {
    rejection_veto: boolean;
    veto_type?: 'SOA_BREACH' | 'ABSOLUTE_MAX_VIOLATION' | 'SAFETY_GOAL_BREACH' | 'SCHEDULE_COLLAPSE' | 'CUSTOMER_CSA_VETO' | 'UNVERIFIED_SPEC_GAMBLE' | 'NONE';
    veto_reason?: string;
  };
}

export interface CounterfactualComparison {
  selectedOptionId: string;
  whyReasons: string[];
  whyNotReasons: Record<string, string>; // optionId -> string
  whatWasGivenUp: string; // 选当前方案放弃了什么
  residualRiskComparison: Record<string, string>; // optionId -> residual risk & schedule trade-off
}

export interface TransparentRiskScore {
  overallRiskLevel: RiskLevel;
  overallScore: number;
  technicalRisk: RiskLevel;
  thermalRisk: RiskLevel;
  emcRisk: RiskLevel;
  reliabilityRisk: RiskLevel;
  safetyRisk: RiskLevel;
  scheduleRisk: RiskLevel;
  verificationGap: 'HIGH' | 'MEDIUM' | 'LOW';
  uncertainty: 'HIGH' | 'MEDIUM' | 'LOW';
  majorRiskDriver: string;
  secondaryRiskDriver: string;
  confidence: ConfidenceLevel;
}

// ==========================================
// 8. Next Best Action & 验证闭环 (Section 8)
// ==========================================

export interface NextBestActionItem {
  now: string;
  why: string;
  expected: string;
  passCriteria: string;
  failCriteria: string;
  owner: string;
  due: string;
}

export interface ValueOfInformationTest {
  testName: string;
  objective: string;
  decisionImpactScore: number; // 1-10
  riskReductionScore: number;  // 1-10
  uncertaintyReductionScore: number; // 1-10
  costScore: number; // 1-10
  timeHoursScore: number; // 1-10
  voiScore: number; // (Decision Impact + Risk Reduction + Uncertainty Reduction) / (Cost + Time)
  rationale: string;
  isTopPriority: boolean;
}

export interface VerificationPlanItem {
  objective: string;
  condition: string;
  method: string;
  instrumentation: string;
  measurement: string;
  passCriteria: string;
  failCriteria: string;
  sampleSize: number;
  owner: string;
  deadline: string;
}

export interface TestResultEntry {
  testId: string;
  issueId: string;
  condition: string;
  instrument: string;
  measurement: string;
  result: string;
  passFail: 'PASS' | 'FAIL' | 'CONDITIONAL_PASS';
  evidence: EvidenceType;
  engineer: string;
  timestamp: string;
}

export interface DecisionRecord {
  decisionId: string;
  problem: string;
  facts: string[];
  assumptions: string[];
  unknowns: string[];
  evidence: EvidenceItem[];
  riskCalculation: TransparentRiskScore;
  candidateMeasures: V4CandidateAction[];
  decisionFactors: Record<string, number>;
  selectedOption: string;
  rejectedOptions: string[];
  reason: string;
  approver: string;
  verificationPlan: VerificationPlanItem[];
  testResults: TestResultEntry[];
  riskHistory: { timestamp: string; riskScore: number; status: string }[];
  finalStatus: 'OPEN' | 'IN_VERIFICATION' | 'CLOSED_VERIFIED' | 'ESCALATED';
  lessonsLearned: string;
  timestamp: string;
}

// ==========================================
// 10. Design Review Mode / Worst Case / Component Change Impact (Section 10)
// ==========================================

export interface PhaseCheckItem {
  phase: 'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP';
  category: string;
  checkpoint: string;
  standardClause: string;
  status: 'COMPLIANT' | 'NEEDS_ATTENTION' | 'CRITICAL_RISK';
  notes: string;
}

export interface WorstCaseCombination {
  id: string;
  name: string;
  tag: 'CANDIDATE_UNVERIFIED'; // 明确它是"候选"而非"已验证Worst Case"
  vbusCondition: string;
  ambientTempCondition: string;
  currentCondition: string;
  rpmCondition: string;
  componentToleranceCondition: string;
  combinedPeakStress: string;
  marginToAbsoluteMax: string;
  verificationRequired: string;
}

export interface ComponentChangeImpactItem {
  componentCategory: 'MOSFET' | 'GATE_DRIVER' | 'SHUNT_RESISTOR' | 'TVS' | 'CBUS' | 'SNUBBER' | 'MCU' | 'CURRENT_SENSOR' | 'HALL_IC';
  changeDescription: string;
  electricalImpact: string;
  thermalImpact: string;
  emcImpact: string;
  safetyImpact: string;
  reliabilityImpact: string;
  controlImpact: string;
  mandatoryRetests: string[];
}

// ==========================================
// 11. 领导视角：项目经济风险 (Section 11)
// ==========================================

export interface LeadershipEconomicRisk {
  warrantyCost: string; // 无真实数据标 Qualitative / Estimate / Unknown
  recallExposure: string;
  productionStopCost: string;
  delayCost: string;
  reworkCost: string;
  engineeringHours: string;
  businessImpactRating: 'HIGH' | 'MEDIUM' | 'LOW';
  decisionUrgency: 'URGENT_24H' | 'THIS_WEEK' | 'REGULAR';
  financialDataNotice: 'QUALITATIVE_ESTIMATE_ONLY'; // 严格遵守1.2节不伪造财务数据
}

// ==========================================
// 13. 回归测试用例模型 (Gold Standard Cases)
// ==========================================

export interface GoldStandardCase {
  caseId: string;
  title: string;
  category: string;
  input: {
    context?: Partial<ProjectModel>;
    issue: Partial<EngineeringIssueModel>;
    electrical?: Partial<ElectricalModel>;
    motor?: Partial<MotorModel>;
    powerStage?: Partial<PowerStageModel>;
  };
  expectedPattern: BldcPatternId | RobotJointPatternId;
  expectedCalculation: Record<string, string | number>;
  expectedRisk: RiskLevel;
  expectedVeto: boolean;
  expectedNextBestAction: string;
  expectedVerification: string;
}
