const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'src', 'adapters', 'analysisResultAdapter.ts'), 'utf8');
if (!/withAnalysisInputFingerprint/.test(adapter)) throw new Error('missing fingerprint write boundary');
if (!/withAnalysisProvenance/.test(adapter)) throw new Error('missing provenance write boundary');

// These are orchestration/result-owning files. They may mutate a result only
// through the semantic editor or adapter helpers, never through top-level
// CopilotAnalysisResult legacy fields.
const files = [
  'src/App.tsx',
  'src/contexts/AnalysisContext.tsx',
  'src/data/expertEngine.ts',
  'src/utils/aiProtocol.ts',
  'src/utils/aiResultAuditor.ts',
  'src/utils/scenarioDynamic.ts',
];
const banned = /\b(?:local|finalResult|imported\.result|result|saved|stamped)\.(?:analysisInputFingerprint|provenance|coreConclusion|riskRatings|knownFacts|assumptions|unknowns|physicalMechanism|dfmeaView|dfmeaItems|candidateActions|finalRecommendation|raciMatrix|containment|capa|engineeringDocs|dualTimeline|bldcExtendedAnalysis|classifiedInfo|multiRiskBreakdown|whyNotComparison|next24HourPlan|edrRecord|redTeamChallenge|analysisBasis|multiDomainAnalysis|decisionFrame|inputIntegrity|aiAudit|debugSnapshot|source)\s*(?:=|\?\.)/g;
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');
  const hits = [...stripped.matchAll(banned)];
  if (hits.length) {
    throw new Error(`WP8 producer boundary bypass in ${rel}: ${hits.map(m => m[0].trim()).join(', ')}`);
  }
}

const expert = fs.readFileSync(path.join(root, 'src', 'data', 'expertEngine.ts'), 'utf8');
if (/Number\([^)]*calculatedValue[^)]*\)\s*\|\|\s*0/.test(expert)) {
  throw new Error('expertEngine still coerces missing calculatedValue to zero');
}

const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
if (!app.includes('withAnalysisInputFingerprint(')) throw new Error('App must use fingerprint boundary helper');
const analysis = fs.readFileSync(path.join(root, 'src', 'contexts', 'AnalysisContext.tsx'), 'utf8');
for (const token of ['readAnalysisInputFingerprint(', 'withAnalysisInputFingerprint(', 'withAnalysisProvenance(']) {
  if (!analysis.includes(token)) throw new Error(`AnalysisContext missing ${token}`);
}
console.log('WP8 producer boundary PASS: result metadata/schema writes stay behind semantic adapter; missing numeric facts are not coerced to zero.');
