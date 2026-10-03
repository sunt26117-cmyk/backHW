const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = [
  'src/data/expertEngine.ts',
  'src/utils/scenarioDerived.ts',
  'src/utils/scenarioDynamic.ts',
  'src/utils/aiGrounding.ts',
  'src/utils/dualTimelineEngine.ts',
  'src/data/verificationLoopEngine.ts',
  'src/utils/aiResultAuditor.ts',
];

function stripCommentsAndLiterals(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    if (source.startsWith('//', i)) {
      const e = source.indexOf('\n', i + 2);
      i = e < 0 ? n : e;
      out += '\n';
      continue;
    }
    if (source.startsWith('/*', i)) {
      const e = source.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i += 1; break; }
        i += 1;
      }
      out += ' ';
      continue;
    }
    if (ch === '`') {
      i += 1;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '`') { i += 1; break; }
        i += 1;
      }
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const rawField = '(?:coreConclusion|riskRatings|candidateActions|finalRecommendation|decisionFrame|analysisBasis|multiDomainAnalysis|dualTimeline|raciMatrix|edrRecord|bldcExtendedAnalysis|dfmeaItems|dfmeaView)';
const forbiddenAccess = new RegExp(`\\b(?:result|baseline|parsed|sanitized|dynamic|analysisLegacy|legacy|baselineLegacy|sanitizedLegacy)\\s*\\.\\s*${rawField}\\b`);

for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const stripped = stripCommentsAndLiterals(text);
  if (forbiddenAccess.test(stripped)) throw new Error(`WP8f legacy schema access in ${rel}`);
  if (/PartialLegacyAnalysisResult/.test(stripped)) throw new Error(`WP8f legacy type leak in ${rel}`);
  if (/createLegacyResult(Read|Mutable)View/.test(stripped)) throw new Error(`WP8f legacy adapter bypass in ${rel}`);
}
const adapter = fs.readFileSync(path.join(root, 'src/adapters/analysisResultAdapter.ts'), 'utf8');
if (!/createSemanticAnalysisResultEditor/.test(adapter)) throw new Error('semantic editor missing from adapter');
if (!/createEmptyLegacyAnalysisResult/.test(adapter)) throw new Error('legacy empty-result builder missing from adapter');
console.log('WP8F LEGACY SCHEMA ISOLATION PASS');
