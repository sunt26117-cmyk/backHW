export type ProjectPhase =
  | 'Concept'
  | 'A Sample'
  | 'B Sample'
  | 'C Sample'
  | 'EVT'
  | 'DVT'
  | 'PVT'
  | 'DV'
  | 'PV'
  | 'SOP'
  | 'Post-SOP';

export type AsilLevel = 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D';

export type HwLeadStyle = 'CONSERVATIVE' | 'AGILE_DELIVERY' | 'PROCESS_DEFENSIVE';

export interface CustomerSpecialAgreement {
  id: string;
  parameter: string;        // 如: "功率管降额安全系数", "急停制动响应时间", "BOM成本增幅上限"
  requiredValue: string;    // 如: ">= 1.30 (严于AEC-Q101 1.0)", "<= 250ms", "<= +$0.35"
  isMandatoryVeto: boolean; // 是否强制触发一票否决
}

export interface ProjectContext {
  projectName: string;
  productType: string;
  ecuType: string;
  projectPhase: ProjectPhase;
  asilLevel: AsilLevel;
  customer: string;
  sopDate: string;
  nextMilestone: string;
  daysRemaining: number;
  costConstraint: string;
  sampleStatus: string;
  hwLeadStyle?: HwLeadStyle; // 直属领导处理风格与态度倾向
  customerSpecialAgreements?: CustomerSpecialAgreement[]; // 客户特殊技术协议红线
  recurrenceCount?: number;
  selectedDeviceId?: string; // 当前分析绑定的器件库料号（用于物理引擎按工况插值）
}

export type IssueCategory =
  | 'Component Alternative'
  | 'WCCA'
  | 'EMC'
  | 'Thermal'
  | 'Power'
  | 'BLDC Motor Drive'
  | 'Robot Joint Drive'
  | 'Signal Integrity'
  | 'Reliability'
  | 'Functional Safety'
  | 'Customer Requirement'
  | 'DFM'
  | 'Production'
  | 'Cost Reduction'
  | 'Schedule Conflict'
  | 'Test Failure'
  | 'Design Deviation'
  | 'Other';

export type MeasurementSource = 'USER_MEASURED' | 'IMPORTED' | 'BENCHMARK' | 'SPEC' | 'DATASHEET' | 'TEXT_INFERRED' | 'CONTEXT' | 'CALCULATED' | 'DERIVED' | 'ASSUMPTION' | 'UNKNOWN';

export interface MeasurementProvenance {
  source: MeasurementSource;
  sourceLabel?: string;
  enteredAt?: string;
  evidenceId?: string;
  confidencePct?: number;
  note?: string;
}

export interface IssueInput {
  issueCategories: IssueCategory[];
  requirement: string;
  actualMeasurement: string;
  testCondition: string;
  environment: string;
  failurePhenomenon: string;
  engineeringConcern: string;
  recurrenceCount?: number; // 该失效模式/相似问题的历史复发次数 (用于Q维度非线性惩罚与领导免责漂移)
  notes?: string;
  attachments?: IssueAttachment[];
  /** 实测数值回填：键值由工程师输入，参与本地专家引擎与各页面的场景化计算 */
  measuredValues?: Record<string, number | string>;
  measuredValueSource?: 'USER_MEASURED' | 'BENCHMARK' | 'IMPORTED';
  /** 每个字段独立记录来源，避免整个工程被一个 source 标签绑死。 */
  measurementProvenance?: Record<string, MeasurementProvenance>;
}

export interface IssueAttachment {
  id: string;
  name: string;
  type: string;
  size: string;
  dataUrl?: string;
  textSample?: string;
  rowCount?: number;
  uploadedAt?: string;
}

export type RiskLevel = 'High' | 'Medium-High' | 'Medium' | 'Low';

export interface PhysicalFactor {
  factor: string;
  description: string;
}

export interface DFMEAView {
  failureMode: string;
  failureCause: string;
  localEffect: string;
  systemEffect: string;
  vehicleEffect: string;
  severity?: number;
  occurrence?: number;
  detection?: number;
  safetyImpact: boolean;
  regulatoryImpact: boolean;
  massProductionImpact: boolean;
  degradationAction?: string; // 降级或容错机制建议
}

export interface ReferencedStandard {
  standard: string; // 如 "ISO 26262-5", "AEC-Q100 Rev H", "ISO 16750-2", "CISPR 25"
  clause: string;   // 如 "Clause 7.4.3", "Table 2", "Section 4.6.2"
  relevance: string;// 如 "热降额判定依据与器件安全工作区", "辐射发射限值与传导骚扰"
}

export type InformationTag = 'MEASURED' | 'SPEC' | 'CALCULATED' | 'DERIVED' | 'ASSUMPTION' | 'UNKNOWN';

export interface ClassifiedInfoItem {
  id: string;
  tag: InformationTag;
  title: string;
  content: string;
  sourceOrBasis: string; // 证据来源或标准出处，例如 "示波器Tektronix实测波形 #CH1", "CISPR 25 Table 4", "Foster Rth 公式计算"
  confidenceLevel: number; // 0-100%
  verificationMethod?: string;
}

export interface RiskDimensionScore {
  name: string;
  dimensionKey: 'techMargin' | 'reliabilityStress' | 'scheduleDelay' | 'redesignCost' | 'verificationGap';
  score: number; // 0-100 (分数越高，风险越大)
  level: RiskLevel;
  evidence: string;
}

export interface MultiDimensionalRiskBreakdown {
  techMargin: RiskDimensionScore;
  reliabilityStress: RiskDimensionScore;
  scheduleDelay: RiskDimensionScore;
  redesignCost: RiskDimensionScore;
  verificationGap: RiskDimensionScore;
}

export interface WhyNotComparisonItem {
  optionId: string;
  optionName: string;
  categoryLabel: string;
  isRecommended: boolean;
  verdictTitle: string; // "为什么选它" 或 "为什么不选它"
  coreTradeoffReason: string; // 核心权衡理由
  keyRiskOrPenalty: string | string[];   // 关键风险或惩罚项（兼容历史/LLM返回的数组或单字符串）
  reActivationCondition: string; // 在何种极端条件下会重新考虑此方案
}

export interface HourlyActionItem {
  timeWindow: string; // e.g. "08:30 - 10:00"
  phase: string;
  task: string;
  owner: string;
  deliverable: string;
  taskTitle?: string;
  toolingOrEquip?: string;
  actionDetails?: string;
}

export interface PassFailCriteria {
  parameter: string;
  greenCriteria: string; // 放行准予推进区间
  yellowCriteria: string;// 警戒扩大样本区间
  redCriteria: string;   // 熔断触发 Plan B 区间
}

export interface Next24HourPlan {
  timeline: HourlyActionItem[];
  passFailCriteria: PassFailCriteria[];
}

export interface DualTimelineStep {
  step: string;
  detail: string;
  owner: string;
  duration: string;
  hardwareImpact: string;
  deliverable: string;
}

export interface DualTimelinePhase {
  phaseTag: 'T_PLUS_24H_CONTAINMENT' | 'NEXT_PHASE_PERMANENT';
  timeWindow: string;
  title: string;
  objective: string;
  hardwareImpact: string;
  actions: DualTimelineStep[];
  verificationCriteria: string;
  exitCriteria: string;
  responsibilityRole: string;
}

export interface DualTimelineActionPlan {
  containmentPhase: DualTimelinePhase;
  permanentPhase: DualTimelinePhase;
  strategicTradeoff: string;
}

export interface EngineeringDecisionRecord {
  edrId: string;
  projectCode: string;
  decisionDate: string;
  decisionMaker: string;
  coreProblem: string;
  measuredSnapshot: string;
  specThreshold: string;
  engineeringAssumptions: string[];
  chosenOptionId: string;
  chosenOptionTitle: string;
  rejectedOptionsSummary: string;
  defenseBasis: string;
  signOffSignatures: { role: string; name: string; status: 'Signed' | 'Pending'; signDate: string }[];
  localHashDigest: string;
  decisionStatus?: 'APPROVED' | 'VETOED' | 'CONDITIONALLY_APPROVED' | string;
  createdAt?: string;
  problemStatement?: string;
}

export interface RedTeamAuditChallenge {
  auditVerdict: string;
  riskGaps: string[];
  missingEvidenceList: string[];
  confidenceScorePct: number;
}

export interface CandidateAction {
  id: string; // 'Option A', 'Option B', 'Option C', 'Option D'
  category: 'conservative' | 'balanced' | 'schedule_priority' | 'alternative';
  categoryLabel: string;
  name: string;
  description: string;
  expectedBenefit: string;
  scores: {
    T: number; // 0-100 (weight 25%)
    S: number; // 0-100 (weight 25%)
    C: number; // 0-100 (weight 15%)
    Q: number; // 0-100 (weight 20%)
    L: number; // 0-100 (weight 15%)
    total: number;
  };
  veto: {
    rejection_veto: boolean;
    veto_reason?: string;
    veto_type?: 'SOA_BREACH' | 'ABSOLUTE_MAX_VIOLATION' | 'SAFETY_GOAL_BREACH' | 'SCHEDULE_COLLAPSE' | 'CUSTOMER_CSA_VETO' | 'UNVERIFIED_SPEC_GAMBLE' | 'NONE';
  };
  changeImpact?: {
    costChange: string;
    scheduleLeadTime: string;
    impedanceOrSignalImpact: string;
    emcThermalRipple: string;
    toolingLeadTimeWeeks?: number | string;
    bomCostDeltaUsd?: number | string;
    dvRequalificationRequired?: boolean;
    softwareCalibrationRequired?: boolean;
  };
  referenced_standards?: ReferencedStandard[]; // 可追溯的标准条款引用 (P1-3)
  customerVetoViolations?: string[];           // 击穿的客户特殊特性红线条目 (P1-1)
  riskBefore: string;
  riskAfter: string;
  riskDelta?: string; // 风险差值 (riskBefore -> riskAfter)
  residualRisk: RiskLevel;
  residualRiskDetail: string;
  sideEffects: string;
  verificationCost: string;
  timeCost: string;
  failureConsequence: string;
  preconditions: string;
  verificationMethod: string;
  planB: string;
  decisionFit?: string;
  fastestValidation?: string;
  latestDecisionPoint?: string;
  rejectionReason?: string;
  crossDomainCouplingChecks?: Array<{ rule: string; addressed: boolean; note: string }>; // 跨域耦合物理规则核对回填 (待办1)
  /** 关键数值结论的证据来源键：measuredValues.<key> / baseline.analysisBasis.calculatedOutputs:<label> / precomputed.<id> */
  citedFields?: string[];
}

export type RecommendationGrade =
  | 'Strongly Recommended'
  | 'Recommended'
  | 'Conditionally Recommended'
  | 'Caution'
  | 'Not Recommended';

export interface ImmediateStep {
  step: number;
  title: string;
  action: string;
  owner: string;
  deadline: string;
}

export interface FinalRecommendation {
  recommendedOptionId: string;
  recommendedOptionName: string;
  recommendationGrade: RecommendationGrade;
  whyReason: string[];
  immediateSteps: ImmediateStep[];
  preconditions: string[];
  unacceptableActions: string[];
  stopConditions: string[];
  reEvaluationTriggers: string[];
  planB: string;
  strategicSignificance?: string;
  containmentAction?: string;
  rootCauseAction?: string;
  verificationItems?: string[] | string;
  targetPhase?: string;
  costDeltaUsd?: number | string;
  reasonSummary?: string;
}

export interface RaciItem {
  role: 'HW' | 'System' | 'SW' | 'PM' | 'Quality' | 'Safety' | 'Sourcing' | 'SQE' | 'Customer' | 'PSCR' | 'PSCR (产品安全代表)' | string;
  raciType: 'R' | 'A' | 'C' | 'I' | 'Approval';
  owner: string;
  action: string;
  output: string;
  dueDate: string;
  decisionGate: string;
}

export interface InternalDeviationPermit {
  title: string;
  permitType: 'Internal Deviation (内部受限工程偏差单)';
  internalBatchScope: string;
  manufacturingSite: string;
  usageConstraint: string;
  technicalRootCause: string;
  riskEvaluation: string;
  containmentProtocol: string;
  expirationDate: string;
  mandatoryScrapProtocol: string;
  approvers: {
    hwLead: string;
    plantQuality: string;
    productionManager: string;
  };
}

export interface CustomerConcessionRequest {
  title: string;
  permitType: 'OEM Customer Concession (主机厂客户工程让步申请书)';
  vdaStandardRef: string;
  fiveWhyRootCause: string[];
  missionProfileRisk: string;
  capaPlan: string;
  cutoffPoint: string;
  commercialImpact: string;
  signOffRequired: {
    tier1ProgramDirector: string;
    oemChiefEngineer: string;
    oemCommodityBuyer: string;
  };
}

export interface PpapDeviationControlPlan {
  title: string;
  documentNumber: string;
  submissionLevel: string; // e.g. "PPAP Level 3 / Level 4"
  deviationCharacteristic: string;
  nominalSpecification: string;
  interimSpecification: string;
  processPhase: string;
  inspectionFrequency: string;
  containmentMethod: string;
  reactionPlan: string;
  effectiveBatchOrVinRange: string;
  closureTargetDate: string;
  standardReference: string;
  authorizedSignatures: {
    sqeManager: string;
    manufacturingQualityLead: string;
    programDirector: string;
  };
}

export interface SpecialCharacteristicsUpdate {
  title: string;
  ecrReferenceNumber: string;
  characteristicId: string;
  characteristicType: 'CC (Critical Characteristic / 安全关键特性)' | 'SC (Significant Characteristic / 重要功能特性)';
  parameterName: string;
  originalSpec: string;
  revisedSpec: string;
  classificationJustification: string;
  safetyOrComplianceImpact: string;
  processCapabilityRequirement: string; // e.g. "Cpk >= 1.67, Ppk >= 1.33"
  pokaYokeMethod: string;
  standardClauseRef: string;
  responsibleEngineers: {
    systemSafetyEngineer: string;
    hwArchitect: string;
    dfmeaModerator: string;
  };
}

export interface CustomerDeviationRequest {
  title: string;
  permitNumber: string;
  customerName: string;
  customerContactWindow: string; // 客户接口人 / 窗口姓名与岗位
  oemPartNumber: string;
  supplierPartNumber: string;
  standardClauses: string[]; // 涉及的标准条款 (原样带出)
  deviationDescription: string;
  rootCause5WhySummary: string;
  safetyAndEmcAssessment: string;
  qualityContainmentCommitment: string;
  impactOnVehicleAssembly: string;
  quantityOrDateLimit: string;
  customerAuthorizationSignOff: {
    oemCommodityBuyer: string;
    oemSystemEngineer: string;
    oemChiefQualityAuditor: string;
  };
}

export interface EngineeringDocs {
  pmDecisionEmail: {
    subject: string;
    technicalFact: string;
    currentSituation: string;
    risk: string;
    options: string;
    recommendedOption: string;
    costImpact: string;
    scheduleImpact: string;
    requiredDecision: string;
    decisionOwner: string;
    deadline: string;
    assumedProceeding: string;
    changeConsequence: string;
  };
  deviationPermit: {
    title: string;
    requirement: string;
    actualResult: string;
    deviationDetail: string;
    technicalCause: string;
    riskAnalysis: string;
    affectedScope: string;
    containment: string;
    temporaryValidity: string;
    approvalRoles: string;
    correctiveAction: string;
    verificationPlan: string;
    closureCriteria: string;
  };
  internalDeviationPermit?: InternalDeviationPermit;
  customerConcessionPermit?: CustomerConcessionRequest;
  ppapDeviationControlPlan?: PpapDeviationControlPlan;
  specialCharacteristicsUpdate?: SpecialCharacteristicsUpdate;
  customerDeviationRequest?: CustomerDeviationRequest;
  meetingMinutes: {
    title: string;
    attendees: string;
    discussionSummary: string;
    agreements: string[];
    actionItems: string[];
  };
  riskAcceptance: {
    riskId: string;
    description: string;
    residualRiskJustification: string;
    acceptingSignOff: string;
    expirationCondition: string;
  };
  dfmeaComment: {
    lineItem: string;
    recommendedAction: string;
    targetDate: string;
    owner: string;
  };
  ecrDescription: {
    ecrTitle: string;
    reasonForChange: string;
    proposedSolution: string;
    costEstimate: string;
    toolingLeadTime: string;
    impactAssessment: string;
  };
  edrRecord?: EngineeringDecisionRecord;
}

export interface BldcCommutationRisk {
  controlMode: 'sensorless_bemf' | 'hall_six_step' | 'foc_vector';
  controlModeLabel: string;
  speedRangeRpm: [number, number];
  speedOffsetDeg: number;
  torqueRippleEstimatePct: number;
  stallOutProbability: 'low' | 'medium' | 'high';
  stallOutReason: string;
  degradationAction: string;
}

export interface BldcPositionSensorDegradation {
  sensorType: 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless';
  sensorTypeLabel: string;
  redundancyAvailable: boolean;
  switchingLogic: string;
  performanceLoss: string;
  dtcTriggered: string;
  powerLimitMode: string;
  dfmeaSeverity: number;
  dfmeaOccurrence: number;
  dfmeaDetection: number;
}

export interface BldcFunctionalSafetyChain {
  currentSenseDualChannel: {
    mainChannel: string;
    monitorChannel: string;
    toleranceThresholdPct: number;
    responseTimeLimitUs: number;
    crossCheckStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL';
    diagnosisMechanism: string;
  };
  watchdogTiming: {
    fhtiBudgetMs: number;
    safeStateTransitionMs: number;
    wdgTimeoutWindowMs: number;
    marginMs: number;
    timingCompliance: 'PASS' | 'CRITICAL';
  };
  asilDecomposition: {
    overallLevel: AsilLevel;
    mcuSubsystem: string;        // e.g. "ASIL D(B)"
    gateDriverSubsystem: string; // e.g. "ASIL B"
    positionSensorSubsystem: string; // e.g. "ASIL B / QM(B)"
    decompositionProof: string;
  };
}

export interface BldcExtendedAnalysis {
  commutationRisk: BldcCommutationRisk;
  positionSensorDegradation: BldcPositionSensorDegradation;
  functionalSafetyChain: BldcFunctionalSafetyChain;
}

export interface LeaderDriftRule {
  trigger: string;
  driftTo: HwLeadStyle;
  driftStrength: number;
  reason: string;
}

export interface LeaderProfile {
  baseStyle: HwLeadStyle;
  driftRules: LeaderDriftRule[];
}

export interface DriftEvaluationResult {
  baseStyle: HwLeadStyle;
  effectiveStyle: HwLeadStyle;
  isDrifted: boolean;
  driftPrompt?: string;
  driftTrigger?: string;
  multiplier: number;
  acceptanceRatePercent: number;
  warningTag?: string;
  positiveTag?: string;
  reason: string;
}

export type DebateRole = 'HW' | 'SW' | 'PM' | 'System';

export interface DebateDialogueRound {
  round: number;
  role: DebateRole;
  roleLabel: string;
  objection: string;
  hiddenWorry: string;
  counterRebuttal: string;
  evidenceReference: string;
}

export interface DebateSimulationResult {
  optionId: string;
  optionName: string;
  activeRole: DebateRole;
  rounds: DebateDialogueRound[];
  summaryGuidance: string;
  disclaimer: string;
}

export type TraceInputSource = 'MEASURED' | 'IMPORTED' | 'USER_INPUT' | 'ASSUMED_DEFAULT' | 'SPEC_CONSTANT' | 'DATASHEET' | 'TEXT_INFERRED' | 'DERIVED';

export interface TraceInput {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  source: TraceInputSource;
  note?: string;
  /** 当 source=IMPORTED 时，可回链到 waveformStorage 中的 evidenceId。 */
  evidenceId?: string;
}

export interface TraceNode {
  id: string;
  title: string;
  value: number | string;
  unit?: string;
  inputs: TraceInput[];
  formula?: string;
  standardRef?: string;
  threshold?: { value: number; unit: string; label: string };
  verdict?: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL' | 'INFO';
  /** 只要直接参与该结论的输入中包含 ASSUMED_DEFAULT / SPEC_CONSTANT，就降级。 */
  degraded: boolean;
  children?: TraceNode[];
}

export interface CopilotAnalysisResult {
  coreConclusion: {
    problemSummary: string;
    recommendedMeasure: string;
    reasonSummary: string;
    coreRiskGrade?: string;
  };
  riskRatings: {
    overallRisk: RiskLevel;
    overallRiskScore: number;
    technicalRisk: RiskLevel;
    qualityRisk: RiskLevel;
    scheduleRisk: RiskLevel;
    costRisk: RiskLevel;
    reliabilityRisk: RiskLevel;
    functionalSafetyRisk: RiskLevel;
  };
  knownFacts: string[];
  assumptions: string[];
  unknowns: string[];
  physicalMechanism: {
    rootCauseAnalysis: string;
    keyPhysicalFactors: PhysicalFactor[];
  };
  dfmeaView: DFMEAView;
  dfmeaItems?: DFMEAView[]; // 支持多条目 DFMEA 映射 (如位置传感器失效独立条目)
  candidateActions: CandidateAction[];
  finalRecommendation: FinalRecommendation;
  raciMatrix: RaciItem[];
  containment: {
    shortTermMeasure: string;
    validityScope: string;
    responsibleParty: string;
    timeline: string;
  };
  capa: {
    rootCauseAction: string;
    preventiveMeasure: string;
    lessonsLearned: string;
    verificationTarget: string;
  };
  engineeringDocs: EngineeringDocs;
  dualTimeline?: DualTimelineActionPlan; // 双层工程时间轴：T+24h 应急临时遏制 vs 下一版本永久纠正
  bldcExtendedAnalysis?: BldcExtendedAnalysis; // BLDC 换相、传感器与功能安全链路扩展 (P0-1)
  classifiedInfo?: ClassifiedInfoItem[]; // 严格区分信息类型 (P0-1)
  multiRiskBreakdown?: MultiDimensionalRiskBreakdown; // 去黑箱化多维风险细分 (P0-2)
  whyNotComparison?: WhyNotComparisonItem[]; // 措施决策理由显性化三栏对比 (P0-3)
  next24HourPlan?: Next24HourPlan; // 未来24小时行动计划与量化标准 (P0-4)
  edrRecord?: EngineeringDecisionRecord; // 工程决策单 EDR 标准记录 (P0-5)
  redTeamChallenge?: RedTeamAuditChallenge; // 逆向质疑与盲区挑战 (P1)
  // [模板/参考内容显式标注] 历史通用模板仅保留在 data/legacy，运行时当前 case 由 scenarioDynamic 基于 issue/context 动态生成。
  // 这些字段不是当前 case 的确定性结论；UI 仍应保持模板/参考性质标识，禁止把历史示例数字当作当前事实。
  templateContentNotice?: { blocks: string[]; message: string };
  context?: ProjectContext;
  source?: 'deterministic-expert' | 'custom-llm' | string;
  provenance?: ResultProvenance; // 结果来源透明度标注：明确区分 AI 发散推理 vs 车规专家确定性模版/物理公式
  analysisBasis?: {
    ruleInputs: string[];
    measuredInputs: string[];
    calculatedOutputs: string[];
    assumptions: string[];
    fixedTemplateFields: string[];
    calculatedOutputEvidence?: Array<{
      id: string;
      key: string;
      title: string;
      status: 'CALCULATED' | 'INSUFFICIENT_INPUT';
      value?: number;
      unit: string;
      engine: string;
      calculation: string;
      formula: string;
      inputs: string[];
      inputSources: Record<string, string>;
      missingInputs: string[];
      specThreshold?: number;
      safetyMargin?: number;
      complianceVerdict?: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL';
      directiveForAi: string;
    }>;
  };
  /** AI 数值结论的集中引用索引，供审计器做来源存在性与一致性核对。 */
  citedFields?: string[];
  multiDomainAnalysis?: {
    primaryDomain: string;
    relatedDomains: string[];
    domainAssessments: Array<{
      domain: string;
      role: 'PRIMARY' | 'RELATED';
      evidenceLevel: string;
      knownFacts: string[];
      evidenceGaps: string[];
      minimumValidation: string;
      domainConclusion: string;
    }>;
    crossDomainLinks: Array<{
      fromDomain: string;
      toDomain: string;
      mechanism: string;
      evidenceBasis: string;
      impact: string;
    }>;
    crossDomainVetoes: Array<{
      condition: string;
      blocks: string[];
      rationale: string;
    }>;
  };
  decisionFrame?: {
    decisionQuestion: string;
    currentDecisionGate: string;
    decisionWindow: string;
    bestNextAction: string;
    minimumEvidenceToProceed: string[];
    unknownsBlockingDecision: string[];
    reversalCriteria: string[];
  };
  inputIntegrity?: InputIntegrityAssessment;
  aiAudit?: AiAuditResult;
  debugSnapshot?: DebugSnapshot;
}

export interface DebugSnapshot {
  promptLength?: number;
  promptSnippet?: string;
  fullPrompt?: string;
  modelIdentifier?: string;
  latencyMs?: number;
  timestamp?: string;
  precomputedFactsCount?: number;
  autoFixesCount?: number;
  auditedRuleHits?: number;
  retryCount?: number;
}

export type InputIntegrityGrade = 'GRADE_A_RIGOROUS' | 'GRADE_B_ACCEPTABLE' | 'GRADE_C_INSUFFICIENT' | 'GRADE_D_BLOCKING';

export interface InputIntegrityAssessment {
  grade: InputIntegrityGrade;
  gradeLabel: string;
  completenessScore: number; // 0 - 100
  domain: string;
  domainLabel: string;
  missingRequiredFields: string[];
  missingContextFields: string[];
  missingIssueFields: string[];
  filledFieldsCount: number;
  totalExpectedFieldsCount: number;
  riskWarnings: string[];
  blockingReasons: string[];
  recommendedNextActions: string[];
  allowAiInference: boolean;
  requiredAssumptions: string[];
  evaluatedAt?: string;
}

export type AiAuditFlagLevel = 'FATAL' | 'WARNING' | 'NOTICE';

export interface AiAuditFlag {
  level: AiAuditFlagLevel;
  ruleId: string;
  title: string;
  message: string;
  fieldPath?: string;
  autoFixApplied?: boolean;
}

export interface AiAuditResult {
  passed: boolean;
  auditScore: number; // 0 - 100
  overallStatus: 'APPROVED' | 'PASSED_WITH_WARNINGS' | 'FLAGGED_NEEDS_REVIEW' | 'REJECTED_AUDIT_FAILED';
  flags: AiAuditFlag[];
  autoFixSummary: string[];
  auditedAt: string;
  modelIdentifier?: string;
}

export interface ResultProvenance {
  executionMode: 'PURE_OFFLINE_LOCAL' | 'ONLINE_AI_INFERRED' | 'HYBRID_VERIFIED';
  engineName: string; // e.g. "车规确定性专家引擎 (纯离线运行)" 或 "DeepSeek-V3 云端大模型推理"
  isAiInferred: boolean; // 是否为大模型发散推演结果
  isDeterministicRule: boolean; // 是否为确定性专家规则/物理公式库计算结果
  generatedAt: string;
  latencyMs?: number;
  modelIdentifier?: string;
  transparencyNote: string;
  inputIntegrity?: InputIntegrityAssessment;
  aiAudit?: AiAuditResult;
  debugSnapshot?: DebugSnapshot;
}

export interface PresetScenario {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  context: ProjectContext;
  issue: IssueInput;
  isCustom?: boolean;
  createdAt?: string;
  category?: string;
}

export interface WccaComponent {
  name: string;
  nominal: number;
  initTolPercent: number;
  tempDriftPercent: number;
  agingPercent: number;
  distribution?: 'gaussian' | 'uniform';
}

export interface WccaCalcParams {
  components: WccaComponent[];
  targetErrorLimitPercent: number;
  iterations?: number;
}

export interface ThermalCalcParams {
  powerLossWatt: number;
  ambientTempC: number;
  rthJA: number;
  rthJC: number;
  tjMaxC: number;
  deratingMarginC: number;
}

export interface VoltageMarginParams {
  nominalVoltage: number;
  regulatorTolerancePercent: number;
  lineAndSwitchDropMv: number;
  transientDipMv: number;
  minAllowedVoltage: number;
}

export type AppTheme = 'dark' | 'light' | 'eyecare' | 'warm';

export type ModelProvider = 
  | 'builtin' 
  | 'gemini'
  | 'deepseek' 
  | 'qwen' 
  | 'zhipu' 
  | 'moonshot' 
  | 'siliconflow' 
  | 'custom';

export interface ModelApiConfig {
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  enabled: boolean;
}

export * from './types/motorDrive';
export * from './types/v4Models';

