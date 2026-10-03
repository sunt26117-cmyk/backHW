import { readAnalysisResultRecord, withAnalysisResultRecord } from './analysisResultRecordAdapter';
import type { AnalysisResultRecordMetadata } from '../types';
import type {
  ResultProvenance,
  AiAuditResult,
  CandidateAction,
  ClassifiedInfoItem,
  CopilotAnalysisResult,
  DualTimelineActionPlan,
  FinalRecommendation,
  ProjectContext,
  RaciItem,
  RiskLevel,
} from '../types';

/**
 * WP8e legacy result boundary.
 *
 * All knowledge of the historical CopilotAnalysisResult field layout lives in
 * this adapter. Consumers receive typed semantic slices and never need to know
 * the legacy property names or nesting.
 */
export type LegacyAnalysisResult = CopilotAnalysisResult;
export type PartialLegacyAnalysisResult = Partial<CopilotAnalysisResult>;

export interface DecisionSnapshot {
  problemSummary: string;
  recommendedMeasure: string;
  reasonSummary: string;
  decisionQuestion: string;
  currentDecisionGate: string;
  decisionWindow: string;
  bestNextAction: string;
  blockingUnknowns: string[];
  reversalCriteria: string[];
}

export interface RiskSnapshot {
  overallRisk: RiskLevel;
  overallRiskScore: number;
  technicalRisk: RiskLevel;
  qualityRisk: RiskLevel;
  scheduleRisk: RiskLevel;
  costRisk: RiskLevel;
  reliabilityRisk: RiskLevel;
  functionalSafetyRisk: RiskLevel;
}

export interface DeliverySnapshot {
  recommendedOptionId: string;
  recommendedOptionName: string;
  recommendationGrade: string;
  raciCount: number;
  edrId?: string;
}

export interface FactSnapshot {
  knownFacts: string[];
  assumptions: string[];
  unknowns: string[];
  physicalMechanism: CopilotAnalysisResult['physicalMechanism'];
  dfmea: NonNullable<CopilotAnalysisResult['dfmeaItems']>;
  bldcExtendedAnalysis: CopilotAnalysisResult['bldcExtendedAnalysis'] | null;
  classifiedInfo: ClassifiedInfoItem[];
  analysisBasis: CopilotAnalysisResult['analysisBasis'] | null;
  inputIntegrity: CopilotAnalysisResult['inputIntegrity'] | null;
}

export interface JudgmentSnapshot {
  coreConclusion: CopilotAnalysisResult['coreConclusion'] | null;
  risk: RiskSnapshot | null;
  finalRecommendation: FinalRecommendation;
  decisionFrame: CopilotAnalysisResult['decisionFrame'] | null;
  multiRiskBreakdown: CopilotAnalysisResult['multiRiskBreakdown'] | null;
  whyNotComparison: CopilotAnalysisResult['whyNotComparison'];
  redTeamChallenge: CopilotAnalysisResult['redTeamChallenge'] | null;
  multiDomainAnalysis: CopilotAnalysisResult['multiDomainAnalysis'] | null;
}

export interface ActionSnapshot {
  candidateActions: CandidateAction[];
  recommendedAction: CandidateAction | null;
  containment: CopilotAnalysisResult['containment'] | null;
  capa: CopilotAnalysisResult['capa'] | null;
  next24HourPlan: CopilotAnalysisResult['next24HourPlan'] | null;
  dualTimeline: DualTimelineActionPlan | null;
  raciMatrix: RaciItem[];
  engineeringDocs: CopilotAnalysisResult['engineeringDocs'] | null;
  edrRecord: CopilotAnalysisResult['edrRecord'] | null;
}

export interface AnalysisBasisSnapshot {
  ruleInputs: unknown[];
  measuredInputs: unknown[];
  calculatedOutputs: unknown[];
  fixedTemplateFields: unknown[];
  calculatedOutputEvidence: NonNullable<CopilotAnalysisResult['analysisBasis']>['calculatedOutputEvidence'];
}

export interface AnalysisResultMetadataSnapshot {
  analysisInputFingerprint: string | null;
  provenance: ResultProvenance | null;
  analysisRecord: AnalysisResultRecordMetadata | null;
}

export function readAnalysisInputFingerprint(result: CopilotAnalysisResult | null | undefined): string | null {
  const record = readAnalysisResultRecord(result);
  if (record?.inputHash) return record.inputHash;
  const fingerprint = read(result).analysisInputFingerprint;
  return typeof fingerprint === 'string' && fingerprint.trim() ? fingerprint : null;
}

export function readAnalysisResultContract(result: CopilotAnalysisResult | null | undefined): AnalysisResultContract {
  return {
    decision: readDecisionSnapshot(result),
    risk: readRiskSnapshot(result),
    facts: readFacts(result),
    judgment: readJudgment(result),
    action: readAction(result),
    delivery: readDeliverySnapshot(result),
    safety: readSafetySummary(result),
    verification: readVerificationDecision(result),
    trace: readTraceSummary(result),
    basis: readAnalysisBasis(result),
    templateNotice: readTemplateNotice(result),
  };
}

export function readAnalysisResultMetadata(result: CopilotAnalysisResult | null | undefined): AnalysisResultMetadataSnapshot {
  const legacy = read(result);
  return {
    analysisInputFingerprint: readAnalysisInputFingerprint(result),
    provenance: legacy.provenance || null,
    analysisRecord: readAnalysisResultRecord(result),
  };
}

/** WP8g: all result metadata stamping stays behind the compatibility boundary. */
export function withAnalysisInputFingerprint(result: CopilotAnalysisResult, fingerprint: string): CopilotAnalysisResult {
  const existing = readAnalysisResultRecord(result);
  const stamped = withAnalysisResultRecord(result, fingerprint, existing);
  // Keep the old fingerprint only as a migration compatibility field.
  (stamped as CopilotAnalysisResult).analysisInputFingerprint = fingerprint;
  return stamped;
}

/** WP8g: immutable provenance replacement/override for orchestration code. */
export function withAnalysisProvenance(result: CopilotAnalysisResult, provenance: ResultProvenance): CopilotAnalysisResult {
  const updated = { ...result };
  const editor = createSemanticAnalysisResultEditor(updated);
  editor.metadata.provenance = provenance;
  return updated;
}

export interface AnalysisResultContract {
  decision: DecisionSnapshot | null;
  risk: RiskSnapshot | null;
  facts: FactSnapshot | null;
  judgment: JudgmentSnapshot | null;
  action: ActionSnapshot | null;
  delivery: DeliverySnapshot | null;
  safety: SafetySummarySnapshot;
  verification: VerificationDecisionSnapshot;
  trace: TraceSummarySnapshot;
  basis: AnalysisBasisSnapshot | null;
  templateNotice: TemplateNoticeSnapshot | null;
}

export interface TemplateNoticeSnapshot {
  blocks: string[];
  message: string;
}

export interface SafetySummarySnapshot {
  risk: RiskSnapshot | null;
  extended: CopilotAnalysisResult['bldcExtendedAnalysis'] | null;
  dfmea: NonNullable<CopilotAnalysisResult['dfmeaItems']>;
}

export interface TraceSummarySnapshot {
  calculatedEvidence: NonNullable<CopilotAnalysisResult['analysisBasis']>['calculatedOutputEvidence'];
  citedFields: string[];
  provenance: CopilotAnalysisResult['provenance'];
  inputIntegrity: CopilotAnalysisResult['inputIntegrity'] | null;
  aiAudit: AiAuditResult | null;
  debugSnapshot: CopilotAnalysisResult['debugSnapshot'] | null;
  source: CopilotAnalysisResult['source'];
  analysisRecord: CopilotAnalysisResult['analysisRecord'] | null;
}

export interface VerificationDecisionSnapshot {
  chosenOption: string;
  justification: string;
  verificationPlan: string;
}

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

function read<T extends PartialLegacyAnalysisResult | null | undefined>(result: T): PartialLegacyAnalysisResult {
  if (!result || typeof result !== 'object') return {};
  return result;
}

/** Read-only low-level compatibility view. New code should prefer semantic slice readers below. */
export function createLegacyResultReadView<T extends PartialLegacyAnalysisResult | null | undefined>(result: T): PartialLegacyAnalysisResult {
  return { ...read(result) };
}

/** Mutable compatibility hook used only by result producers/sanitizers during the migration. */
export function createLegacyResultMutableView<T extends PartialLegacyAnalysisResult>(result: T): T {
  return result;
}



export interface SemanticAnalysisResultEditor {
  facts: {
    knownFacts: CopilotAnalysisResult['knownFacts'];
    assumptions: CopilotAnalysisResult['assumptions'];
    unknowns: CopilotAnalysisResult['unknowns'];
    physicalMechanism: CopilotAnalysisResult['physicalMechanism'];
    dfmeaView: CopilotAnalysisResult['dfmeaView'];
    dfmeaItems: NonNullable<CopilotAnalysisResult['dfmeaItems']>;
    classifiedInfo: NonNullable<CopilotAnalysisResult['classifiedInfo']>;
    analysisBasis: CopilotAnalysisResult['analysisBasis'];
    citedFields: CopilotAnalysisResult['citedFields'];
  };
  judgment: {
    conclusion: CopilotAnalysisResult['coreConclusion'];
    risk: CopilotAnalysisResult['riskRatings'];
    recommendation: CopilotAnalysisResult['finalRecommendation'];
    frame: CopilotAnalysisResult['decisionFrame'];
    multiRiskBreakdown: CopilotAnalysisResult['multiRiskBreakdown'];
    whyNotComparison: CopilotAnalysisResult['whyNotComparison'];
    redTeamChallenge: CopilotAnalysisResult['redTeamChallenge'];
    multiDomainAnalysis: CopilotAnalysisResult['multiDomainAnalysis'];
  };
  action: {
    candidates: CopilotAnalysisResult['candidateActions'];
    containment: CopilotAnalysisResult['containment'];
    capa: CopilotAnalysisResult['capa'];
    next24HourPlan: CopilotAnalysisResult['next24HourPlan'];
    dualTimeline: CopilotAnalysisResult['dualTimeline'];
  };
  delivery: {
    raciMatrix: CopilotAnalysisResult['raciMatrix'];
    engineeringDocs: CopilotAnalysisResult['engineeringDocs'];
    edrRecord: CopilotAnalysisResult['edrRecord'];
  };
  metadata: {
    provenance: CopilotAnalysisResult['provenance'];
    source: CopilotAnalysisResult['source'];
    inputIntegrity: CopilotAnalysisResult['inputIntegrity'];
    aiAudit: CopilotAnalysisResult['aiAudit'];
    debugSnapshot: CopilotAnalysisResult['debugSnapshot'];
    analysisRecord: CopilotAnalysisResult['analysisRecord'];
  };
}

/**
 * Semantic mutable editor for producers/sanitizers. Legacy field names exist
 * only inside this adapter; callers operate on engineering concepts instead.
 */
export function createSemanticAnalysisResultEditor(result: CopilotAnalysisResult): SemanticAnalysisResultEditor {
  const target = result as any;
  const facts: any = {};
  const judgment: any = {};
  const action: any = {};
  const delivery: any = {};
  const metadata: any = {};
  const bind = (object: any, semantic: string, legacy: string) => Object.defineProperty(object, semantic, {
    enumerable: true, configurable: false, get: () => target[legacy], set: (value: any) => { target[legacy] = value; },
  });
  bind(facts, 'knownFacts', 'knownFacts');
  bind(facts, 'assumptions', 'assumptions');
  bind(facts, 'unknowns', 'unknowns');
  bind(facts, 'physicalMechanism', 'physicalMechanism');
  bind(facts, 'dfmeaView', 'dfmeaView');
  bind(facts, 'dfmeaItems', 'dfmeaItems');
  bind(facts, 'classifiedInfo', 'classifiedInfo');
  bind(facts, 'analysisBasis', 'analysisBasis');
  bind(facts, 'citedFields', 'citedFields');
  bind(judgment, 'conclusion', 'coreConclusion');
  bind(judgment, 'risk', 'riskRatings');
  bind(judgment, 'recommendation', 'finalRecommendation');
  bind(judgment, 'frame', 'decisionFrame');
  bind(judgment, 'multiRiskBreakdown', 'multiRiskBreakdown');
  bind(judgment, 'whyNotComparison', 'whyNotComparison');
  bind(judgment, 'redTeamChallenge', 'redTeamChallenge');
  bind(judgment, 'multiDomainAnalysis', 'multiDomainAnalysis');
  bind(action, 'candidates', 'candidateActions');
  bind(action, 'containment', 'containment');
  bind(action, 'capa', 'capa');
  bind(action, 'next24HourPlan', 'next24HourPlan');
  bind(action, 'dualTimeline', 'dualTimeline');
  bind(delivery, 'raciMatrix', 'raciMatrix');
  bind(delivery, 'engineeringDocs', 'engineeringDocs');
  bind(delivery, 'edrRecord', 'edrRecord');
  bind(metadata, 'provenance', 'provenance');
  bind(metadata, 'source', 'source');
  bind(metadata, 'inputIntegrity', 'inputIntegrity');
  bind(metadata, 'aiAudit', 'aiAudit');
  bind(metadata, 'debugSnapshot', 'debugSnapshot');
  bind(metadata, 'analysisRecord', 'analysisRecord');
  return { facts, judgment, action, delivery, metadata };
}

export function createEmptyLegacyAnalysisResult(): CopilotAnalysisResult {
  return {
    coreConclusion: { problemSummary: '', recommendedMeasure: '', reasonSummary: '' },
    riskRatings: {
      overallRisk: 'Medium', overallRiskScore: 55, technicalRisk: 'Medium', qualityRisk: 'Medium',
      scheduleRisk: 'Medium', costRisk: 'Medium', reliabilityRisk: 'Medium', functionalSafetyRisk: 'Medium',
    },
    knownFacts: [],
    assumptions: [],
    unknowns: [],
    physicalMechanism: { rootCauseAnalysis: '', keyPhysicalFactors: [] },
    dfmeaView: {
      failureMode: '', failureCause: '', localEffect: '', systemEffect: '', vehicleEffect: '',
      safetyImpact: false, regulatoryImpact: false, massProductionImpact: false,
    },
    candidateActions: [],
    finalRecommendation: {
      recommendedOptionId: '', recommendedOptionName: '', recommendationGrade: 'Caution',
      whyReason: [], immediateSteps: [], preconditions: [], unacceptableActions: [],
      stopConditions: [], reEvaluationTriggers: [], planB: '',
    },
    raciMatrix: [],
    containment: { shortTermMeasure: '', validityScope: '', responsibleParty: '', timeline: '' },
    capa: { rootCauseAction: '', preventiveMeasure: '', lessonsLearned: '', verificationTarget: '' },
    engineeringDocs: {} as unknown as CopilotAnalysisResult['engineeringDocs'],
    citedFields: [],
  };
}

export function isPersistedAnalysisResult(value: unknown): value is CopilotAnalysisResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.coreConclusion === 'object'
    && typeof candidate.riskRatings === 'object'
    && Array.isArray(candidate.candidateActions)
    && typeof candidate.finalRecommendation === 'object';
}

export function readCandidateActions(result: CopilotAnalysisResult | null | undefined): CandidateAction[] {
  const legacy = read(result);
  return Array.isArray(legacy.candidateActions) ? legacy.candidateActions : [];
}

export function readRecommendedAction(result: CopilotAnalysisResult | null | undefined): CandidateAction | null {
  const actions = readCandidateActions(result);
  const legacy = read(result);
  const id = legacy.finalRecommendation?.recommendedOptionId;
  return actions.find((action) => action.id === id) || actions[0] || null;
}

export function readDecisionSnapshot(result: CopilotAnalysisResult | null | undefined): DecisionSnapshot | null {
  if (!result) return null;
  const legacy = read(result);
  const decisionFrame = legacy.decisionFrame;
  return {
    problemSummary: legacy.coreConclusion?.problemSummary || '',
    recommendedMeasure: legacy.coreConclusion?.recommendedMeasure || '',
    reasonSummary: legacy.finalRecommendation?.reasonSummary || legacy.coreConclusion?.reasonSummary || '',
    decisionQuestion: decisionFrame?.decisionQuestion || '',
    currentDecisionGate: decisionFrame?.currentDecisionGate || '',
    decisionWindow: decisionFrame?.decisionWindow || '',
    bestNextAction: decisionFrame?.bestNextAction || legacy.finalRecommendation?.immediateSteps?.[0]?.action || '',
    blockingUnknowns: asStringArray(decisionFrame?.unknownsBlockingDecision),
    reversalCriteria: asStringArray(decisionFrame?.reversalCriteria),
  };
}

export function readRiskSnapshot(result: CopilotAnalysisResult | null | undefined): RiskSnapshot | null {
  const legacy = read(result);
  const risk = legacy.riskRatings;
  if (!risk) return null;
  return {
    overallRisk: risk.overallRisk,
    overallRiskScore: risk.overallRiskScore,
    technicalRisk: risk.technicalRisk,
    qualityRisk: risk.qualityRisk,
    scheduleRisk: risk.scheduleRisk,
    costRisk: risk.costRisk,
    reliabilityRisk: risk.reliabilityRisk,
    functionalSafetyRisk: risk.functionalSafetyRisk,
  };
}

export function readCalculatedEvidence(result: CopilotAnalysisResult | null | undefined) {
  const legacy = read(result);
  return Array.isArray(legacy.analysisBasis?.calculatedOutputEvidence)
    ? legacy.analysisBasis.calculatedOutputEvidence
    : [];
}

export function readDualTimeline(result: CopilotAnalysisResult | null | undefined): DualTimelineActionPlan | null {
  return read(result).dualTimeline || null;
}

export function readDeliverySnapshot(result: CopilotAnalysisResult | null | undefined): DeliverySnapshot | null {
  const legacy = read(result);
  const rec = legacy.finalRecommendation;
  if (!result || !rec) return null;
  return {
    recommendedOptionId: rec.recommendedOptionId || '',
    recommendedOptionName: rec.recommendedOptionName || '',
    recommendationGrade: rec.recommendationGrade || '',
    raciCount: Array.isArray(legacy.raciMatrix) ? legacy.raciMatrix.length : 0,
    edrId: legacy.edrRecord?.edrId,
  };
}

export function readSafetySummary(result: CopilotAnalysisResult | null | undefined): SafetySummarySnapshot {
  const legacy = read(result);
  return {
    risk: readRiskSnapshot(result),
    extended: legacy.bldcExtendedAnalysis || null,
    dfmea: legacy.dfmeaItems?.length ? legacy.dfmeaItems : legacy.dfmeaView ? [legacy.dfmeaView] : [],
  };
}

export function readTraceSummary(result: CopilotAnalysisResult | null | undefined): TraceSummarySnapshot {
  const legacy = read(result);
  return {
    calculatedEvidence: readCalculatedEvidence(result),
    citedFields: Array.isArray(legacy.citedFields) ? legacy.citedFields : [],
    provenance: legacy.provenance,
    inputIntegrity: legacy.inputIntegrity || null,
    aiAudit: legacy.aiAudit || null,
    debugSnapshot: legacy.debugSnapshot || null,
    source: legacy.source,
    analysisRecord: readAnalysisResultRecord(result),
  };
}

export function readAnalysisBasis(result: CopilotAnalysisResult | null | undefined): AnalysisBasisSnapshot | null {
  const legacy = read(result);
  const basis = legacy.analysisBasis;
  if (!basis) return null;
  return {
    ruleInputs: Array.isArray(basis.ruleInputs) ? basis.ruleInputs : [],
    measuredInputs: Array.isArray(basis.measuredInputs) ? basis.measuredInputs : [],
    calculatedOutputs: Array.isArray(basis.calculatedOutputs) ? basis.calculatedOutputs : [],
    fixedTemplateFields: Array.isArray(basis.fixedTemplateFields) ? basis.fixedTemplateFields : [],
    calculatedOutputEvidence: Array.isArray(basis.calculatedOutputEvidence) ? basis.calculatedOutputEvidence : [],
  };
}

export function readMultiDomainLinks(result: CopilotAnalysisResult | null | undefined) {
  const links = read(result).multiDomainAnalysis?.crossDomainLinks;
  return Array.isArray(links) ? links.slice(0, 4) : [];
}

export function readTemplateNotice(result: CopilotAnalysisResult | null | undefined): TemplateNoticeSnapshot | null {
  const notice = read(result).templateContentNotice;
  if (!notice) return null;
  return {
    blocks: Array.isArray(notice.blocks) ? notice.blocks.map(String) : [],
    message: String(notice.message || ''),
  };
}

export function readBldcExtendedAnalysis(result: CopilotAnalysisResult | null | undefined) {
  return read(result).bldcExtendedAnalysis || null;
}

export function readVerificationDecision(result: CopilotAnalysisResult | null | undefined, issue?: { engineeringConcern?: string }): VerificationDecisionSnapshot {
  const judgment = readJudgment(result);
  const recommendation = judgment?.finalRecommendation;
  const recommendedAction = readRecommendedAction(result);
  return {
    chosenOption: recommendation?.recommendedOptionName || recommendedAction?.name || '待当前工况分析结果确定',
    justification: recommendation?.reasonSummary || judgment?.coreConclusion?.reasonSummary || issue?.engineeringConcern || '等待当前工况的分析理由',
    verificationPlan: recommendation?.immediateSteps?.[0]?.action || recommendedAction?.verificationMethod || '针对当前工况验证：当前需求门限',
  };
}

export function readFacts(result: CopilotAnalysisResult | null | undefined): FactSnapshot | null {
  if (!result) return null;
  const legacy = read(result);
  return {
    knownFacts: Array.isArray(legacy.knownFacts) ? legacy.knownFacts : [],
    assumptions: Array.isArray(legacy.assumptions) ? legacy.assumptions : [],
    unknowns: Array.isArray(legacy.unknowns) ? legacy.unknowns : [],
    physicalMechanism: legacy.physicalMechanism!,
    dfmea: legacy.dfmeaItems?.length ? legacy.dfmeaItems : legacy.dfmeaView ? [legacy.dfmeaView] : [],
    bldcExtendedAnalysis: legacy.bldcExtendedAnalysis || null,
    classifiedInfo: Array.isArray(legacy.classifiedInfo) ? legacy.classifiedInfo : [],
    analysisBasis: legacy.analysisBasis || null,
    inputIntegrity: legacy.inputIntegrity || null,
  };
}

export function readJudgment(result: CopilotAnalysisResult | null | undefined): JudgmentSnapshot | null {
  if (!result) return null;
  const legacy = read(result);
  return {
    coreConclusion: legacy.coreConclusion || null,
    risk: readRiskSnapshot(result),
    finalRecommendation: legacy.finalRecommendation!,
    decisionFrame: legacy.decisionFrame || null,
    multiRiskBreakdown: legacy.multiRiskBreakdown || null,
    whyNotComparison: legacy.whyNotComparison,
    redTeamChallenge: legacy.redTeamChallenge || null,
    multiDomainAnalysis: legacy.multiDomainAnalysis || null,
  };
}

export function readAction(result: CopilotAnalysisResult | null | undefined): ActionSnapshot | null {
  if (!result) return null;
  const legacy = read(result);
  return {
    candidateActions: readCandidateActions(result),
    recommendedAction: readRecommendedAction(result),
    containment: legacy.containment || null,
    capa: legacy.capa || null,
    next24HourPlan: legacy.next24HourPlan || null,
    dualTimeline: readDualTimeline(result),
    raciMatrix: Array.isArray(legacy.raciMatrix) ? legacy.raciMatrix : [],
    engineeringDocs: legacy.engineeringDocs || null,
    edrRecord: legacy.edrRecord || null,
  };
}
