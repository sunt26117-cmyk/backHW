const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const expectations = {
  'FirstScreen10sView.tsx': ['selectAnalysisResultContract'],
  'DecisionCockpitView.tsx': ['selectAnalysisResultContract'],
  'OptionsComparisonView.tsx': ['selectAnalysisResultContract'],
  'VerificationLoopView.tsx': ['selectAnalysisResultContract'],
  'RecommendationRaciView.tsx': ['selectAnalysisResultContract'],
  'EngineeringDocsView.tsx': ['selectAnalysisResultContract'],
  'FunctionalSafetyReliabilityView.tsx': ['selectAnalysisResultContract'],
  'TraceAuditView.tsx': ['selectAnalysisResultContract'],
};
for (const [file, selectors] of Object.entries(expectations)) {
  const text = fs.readFileSync(path.join(root, 'src', 'components', file), 'utf8');
  for (const selector of selectors) {
    if (!text.includes(selector)) throw new Error(`${file} missing ${selector}`);
  }
}

const banned = [
  'result.candidateActions', 'result.finalRecommendation', 'result.riskRatings',
  'result.multiRiskBreakdown', 'result.whyNotComparison', 'result.next24HourPlan',
  'result.dualTimeline', 'result.raciMatrix', 'result.classifiedInfo',
  'result.dfmeaView', 'result.dfmeaItems', 'result.bldcExtendedAnalysis',
  'result.decisionFrame', 'result.coreConclusion', 'result.physicalMechanism',
  'result.knownFacts', 'result.assumptions', 'result.unknowns', 'result.context'
];
for (const file of Object.keys(expectations)) {
  const text = fs.readFileSync(path.join(root, 'src', 'components', file), 'utf8');
  for (const needle of banned) {
    if (text.includes(needle)) throw new Error(`${file} still directly reads ${needle}; use owner selector/upstream context.`);
  }
}
console.log(`WP6d selector migration PASS: ${Object.keys(expectations).length} core views use the single semantic result contract and no direct shared-result reads remain.`);

