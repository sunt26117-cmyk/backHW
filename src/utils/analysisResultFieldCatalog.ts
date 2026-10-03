export type AnalysisResultFieldRole = 'CORE_DECISION' | 'RISK' | 'EVIDENCE' | 'DECISION' | 'VERIFICATION' | 'SAFETY' | 'DELIVERY' | 'TRACE' | 'COMPATIBILITY';

export interface AnalysisResultFieldPolicy {
  path: string;
  role: AnalysisResultFieldRole;
  producer: string[];
  consumers: string[];
  derivable: boolean;
  compatibilityNote?: string;
}

/** WP8：CopilotAnalysisResult 顶层字段生产者/消费者/派生性清单。 */
export const ANALYSIS_RESULT_FIELD_CATALOG: readonly AnalysisResultFieldPolicy[] = [
  { path: 'context', role: 'TRACE', producer: ['AnalysisContext', 'expertEngine', 'aiProtocol'], consumers: ['ScenarioContext', 'AnalysisContext'], derivable: true, compatibilityNote: '兼容旧结果中的工程上下文快照；当前 context 由 ScenarioContext 持有。' },
  { path: 'coreConclusion', role: 'CORE_DECISION', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectDecisionSnapshot', 'selectJudgment'], derivable: false },
  { path: 'riskRatings', role: 'RISK', producer: ['expertEngine', 'aiResultAuditor'], consumers: ['selectRiskSnapshot', 'selectJudgment'], derivable: true, compatibilityNote: '总体/维度风险可由确定性指标汇总，但旧字段继续保留。' },
  { path: 'knownFacts', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: false },
  { path: 'assumptions', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: false },
  { path: 'unknowns', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts', 'selectDecisionSnapshot'], derivable: true },
  { path: 'physicalMechanism', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: false },
  { path: 'dfmeaView', role: 'SAFETY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: false },
  { path: 'dfmeaItems', role: 'SAFETY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: true, compatibilityNote: '为空时以 dfmeaView 单条兼容。' },
  { path: 'candidateActions', role: 'DECISION', producer: ['scenarioDynamic', 'expertEngine', 'aiProtocol'], consumers: ['selectAction'], derivable: false },
  { path: 'finalRecommendation', role: 'DECISION', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectJudgment', 'selectAction', 'selectDeliverySnapshot'], derivable: false },
  { path: 'raciMatrix', role: 'DELIVERY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectAction', 'selectDeliverySnapshot'], derivable: true },
  { path: 'containment', role: 'DECISION', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectAction'], derivable: true },
  { path: 'capa', role: 'DELIVERY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectAction'], derivable: true },
  { path: 'engineeringDocs', role: 'DELIVERY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectAction'], derivable: false },
  { path: 'dualTimeline', role: 'VERIFICATION', producer: ['dualTimelineEngine', 'aiProtocol'], consumers: ['selectAction'], derivable: true },
  { path: 'bldcExtendedAnalysis', role: 'SAFETY', producer: ['bldcMotorExpert', 'aiProtocol'], consumers: ['selectFacts'], derivable: true },
  { path: 'classifiedInfo', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: true },
  { path: 'multiRiskBreakdown', role: 'RISK', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectJudgment'], derivable: true },
  { path: 'whyNotComparison', role: 'DECISION', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectJudgment'], derivable: true },
  { path: 'next24HourPlan', role: 'VERIFICATION', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectJudgment', 'selectAction'], derivable: true },
  { path: 'edrRecord', role: 'DELIVERY', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectAction', 'selectDeliverySnapshot'], derivable: true },
  { path: 'redTeamChallenge', role: 'DECISION', producer: ['aiProtocol', 'aiResultAuditor'], consumers: ['selectJudgment'], derivable: false },
  { path: 'templateContentNotice', role: 'COMPATIBILITY', producer: ['expertEngine', 'scenarioDynamic'], consumers: ['SeniorEngineeringWorkbenchView', 'EngineeringDocsView'], derivable: false },
  { path: 'analysisInputFingerprint', role: 'TRACE', producer: ['AnalysisContext'], consumers: ['AnalysisContext'], derivable: true },
  { path: 'analysisBasis', role: 'TRACE', producer: ['expertEngine', 'aiProtocol', 'deterministicPrecomputation'], consumers: ['selectFacts', 'selectTraceSummary'], derivable: true },
  { path: 'multiDomainAnalysis', role: 'EVIDENCE', producer: ['expertEngine', 'aiProtocol'], consumers: ['selectJudgment'], derivable: true },
  { path: 'citedFields', role: 'TRACE', producer: ['aiProtocol', 'aiResultAuditor'], consumers: ['selectTraceSummary'], derivable: true },
  { path: 'provenance', role: 'TRACE', producer: ['AnalysisContext', 'aiProtocol'], consumers: ['selectTraceSummary', 'SeniorEngineeringWorkbenchView'], derivable: true },
  { path: 'decisionFrame', role: 'DECISION', producer: ['aiProtocol', 'decisionFrame'], consumers: ['selectDecisionSnapshot', 'selectJudgment'], derivable: true },
  { path: 'inputIntegrity', role: 'TRACE', producer: ['inputIntegrityEngine', 'aiProtocol'], consumers: ['selectFacts'], derivable: true },
  { path: 'aiAudit', role: 'TRACE', producer: ['aiResultAuditor'], consumers: ['selectTraceSummary'], derivable: true },
  { path: 'debugSnapshot', role: 'TRACE', producer: ['aiProtocol', 'AnalysisContext'], consumers: ['selectTraceSummary'], derivable: true },
  { path: 'analysisRecord', role: 'TRACE', producer: ['AnalysisContext', 'backupRestore'], consumers: ['selectTraceSummary', 'analysisStorage', 'backupRestore'], derivable: false },
  { path: 'source', role: 'COMPATIBILITY', producer: ['AnalysisContext', 'aiProtocol'], consumers: ['selectTraceSummary'], derivable: true },
];

export function getAnalysisResultFieldPolicy(path: string) {
  return ANALYSIS_RESULT_FIELD_CATALOG.find((field) => field.path === path);
}
