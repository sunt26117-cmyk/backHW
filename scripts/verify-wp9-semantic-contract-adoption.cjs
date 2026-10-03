const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');


function stripCommentsAndLiterals(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ');
}

const coreViews = [
  'src/components/DecisionCockpitView.tsx',
  'src/components/AnalysisFactView.tsx',
  'src/components/BldcPatternEngineView.tsx',
  'src/components/FirstScreen10sView.tsx',
  'src/components/OptionsComparisonView.tsx',
  'src/components/RecommendationRaciView.tsx',
  'src/components/TraceAuditView.tsx',
  'src/components/SeniorEngineeringWorkbenchView.tsx',
];

for (const rel of coreViews) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const stripped = stripCommentsAndLiterals(text);
  if (!text.includes('selectAnalysisResultContract')) {
    throw new Error(`WP9 semantic contract missing in ${rel}`);
  }
  const importLines = text.split(/\r?\n/).filter((line) => line.includes("from '../utils/analysisResultSelectors'"));
  for (const line of importLines) {
    if (!line.includes('selectAnalysisResultContract')) {
      throw new Error(`WP9 direct slice-selector import remains in ${rel}: ${line.trim()}`);
    }
  }
  if (/\bselect(?:Action|CandidateActions|DecisionSnapshot|RiskSnapshot|CalculatedEvidence|DualTimeline|DeliverySnapshot|SafetySummary|TraceSummary|AnalysisBasis|MultiDomainLinks|TemplateNotice|BldcExtendedAnalysis|VerificationDecision|Facts|Judgment)\s*\(/.test(stripped)) {
    throw new Error(`WP9 direct result selector call remains in ${rel}`);
  }
}

const adapter = fs.readFileSync(path.join(root, 'src/adapters/analysisResultAdapter.ts'), 'utf8');
if (!/export interface AnalysisResultContract/.test(adapter)) throw new Error('WP9 semantic contract type missing');
if (!/export function readAnalysisResultContract/.test(adapter)) throw new Error('WP9 semantic contract reader missing');
const selectors = fs.readFileSync(path.join(root, 'src/utils/analysisResultSelectors.ts'), 'utf8');
if (!/export function selectAnalysisResultContract/.test(selectors)) throw new Error('WP9 semantic contract selector missing');
console.log(`WP9 semantic contract adoption PASS: ${coreViews.length} core workbenches consume one semantic result contract.`);
