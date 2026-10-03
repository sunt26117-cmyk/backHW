import type { CopilotAnalysisResult } from '../types';
import {
  readAction,
  readAnalysisResultMetadata,
  readAnalysisResultContract,
  readAnalysisBasis,
  readBldcExtendedAnalysis,
  readCalculatedEvidence,
  readCandidateActions,
  readDecisionSnapshot,
  readDeliverySnapshot,
  readDualTimeline,
  readFacts,
  readJudgment,
  readMultiDomainLinks,
  readRecommendedAction,
  readRiskSnapshot,
  readSafetySummary,
  readTemplateNotice,
  readTraceSummary,
  readVerificationDecision,
  type ActionSnapshot,
  type AnalysisResultContract,
  type AnalysisBasisSnapshot,
  type DecisionSnapshot,
  type DeliverySnapshot,
  type FactSnapshot,
  type JudgmentSnapshot,
  type RiskSnapshot,
  type SafetySummarySnapshot,
  type TemplateNoticeSnapshot,
  type TraceSummarySnapshot,
  type VerificationDecisionSnapshot,
} from '../adapters/analysisResultAdapter';

/**
 * WP8e semantic selectors.
 *
 * These functions intentionally contain no legacy result field access. All
 * schema knowledge and compatibility mapping is owned by the adapter.
 */

export type {
  ActionSnapshot,
  AnalysisResultContract,
  AnalysisBasisSnapshot,
  DecisionSnapshot,
  DeliverySnapshot,
  FactSnapshot,
  JudgmentSnapshot,
  RiskSnapshot,
  SafetySummarySnapshot,
  TemplateNoticeSnapshot,
  TraceSummarySnapshot,
  VerificationDecisionSnapshot,
};

export function selectAnalysisResultContract(result: CopilotAnalysisResult | null | undefined): AnalysisResultContract { return readAnalysisResultContract(result); }
export function selectAnalysisResultMetadata(result: CopilotAnalysisResult | null | undefined) { return readAnalysisResultMetadata(result); }
export function selectCandidateActions(result: CopilotAnalysisResult | null | undefined) { return readCandidateActions(result); }
export function selectRecommendedAction(result: CopilotAnalysisResult | null | undefined) { return readRecommendedAction(result); }
export function selectDecisionSnapshot(result: CopilotAnalysisResult | null | undefined): DecisionSnapshot | null { return readDecisionSnapshot(result); }
export function selectRiskSnapshot(result: CopilotAnalysisResult | null | undefined): RiskSnapshot | null { return readRiskSnapshot(result); }
export function selectCalculatedEvidence(result: CopilotAnalysisResult | null | undefined) { return readCalculatedEvidence(result); }
export function selectDualTimeline(result: CopilotAnalysisResult | null | undefined) { return readDualTimeline(result); }
export function selectDeliverySnapshot(result: CopilotAnalysisResult | null | undefined): DeliverySnapshot | null { return readDeliverySnapshot(result); }
export function selectSafetySummary(result: CopilotAnalysisResult | null | undefined): SafetySummarySnapshot { return readSafetySummary(result); }
export function selectTraceSummary(result: CopilotAnalysisResult | null | undefined): TraceSummarySnapshot { return readTraceSummary(result); }
export function selectAnalysisBasis(result: CopilotAnalysisResult | null | undefined): AnalysisBasisSnapshot | null { return readAnalysisBasis(result); }
export function selectMultiDomainLinks(result: CopilotAnalysisResult | null | undefined) { return readMultiDomainLinks(result); }
export function selectTemplateNotice(result: CopilotAnalysisResult | null | undefined): TemplateNoticeSnapshot | null { return readTemplateNotice(result); }
export function selectBldcExtendedAnalysis(result: CopilotAnalysisResult | null | undefined) { return readBldcExtendedAnalysis(result); }
export function selectVerificationDecision(result: CopilotAnalysisResult | null | undefined, issue?: { engineeringConcern?: string }): VerificationDecisionSnapshot { return readVerificationDecision(result, issue); }
export function selectFacts(result: CopilotAnalysisResult | null | undefined): FactSnapshot | null { return readFacts(result); }
export function selectJudgment(result: CopilotAnalysisResult | null | undefined): JudgmentSnapshot | null { return readJudgment(result); }
export function selectAction(result: CopilotAnalysisResult | null | undefined): ActionSnapshot | null { return readAction(result); }

export type AnalysisResultSelectorInput = CopilotAnalysisResult | null | undefined;
