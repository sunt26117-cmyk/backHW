const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const types = fs.readFileSync(path.join(root, 'src', 'types.ts'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src', 'utils', 'analysisResultFieldCatalog.ts'), 'utf8');
const selector = fs.readFileSync(path.join(root, 'src', 'utils', 'analysisResultSelectors.ts'), 'utf8');

const start = types.indexOf('export interface CopilotAnalysisResult {');
if (start < 0) throw new Error('CopilotAnalysisResult interface not found');
const bodyStart = types.indexOf('{', start);
let depth = 0;
let end = -1;
for (let i = bodyStart; i < types.length; i++) {
  if (types[i] === '{') depth++;
  else if (types[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) throw new Error('CopilotAnalysisResult interface end not found');
const body = types.slice(bodyStart + 1, end);
const fieldNames = [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\??\s*:/gm)].map(m => m[1]);
const catalogNames = [...catalog.matchAll(/path: '([^']+)'/g)].map(m => m[1]);
const required = fieldNames.filter(n => !catalogNames.includes(n));
if (required.length) throw new Error(`Missing WP8 field catalog entries: ${required.join(', ')}`);
for (const key of ['selectCandidateActions','selectRecommendedAction','selectDecisionSnapshot','selectRiskSnapshot','selectCalculatedEvidence','selectDeliverySnapshot','selectTraceSummary']) {
  if (!selector.includes(`export function ${key}`)) throw new Error(`Missing selector ${key}`);
}
console.log(`WP8 field governance PASS: ${fieldNames.length} top-level fields cataloged; selectors present.`);
