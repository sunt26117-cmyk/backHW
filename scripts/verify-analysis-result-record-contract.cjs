const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const types = fs.readFileSync(path.join(root, 'src', 'types.ts'), 'utf8');
const record = fs.readFileSync(path.join(root, 'src', 'adapters', 'analysisResultRecordAdapter.ts'), 'utf8');
const resultAdapter = fs.readFileSync(path.join(root, 'src', 'adapters', 'analysisResultAdapter.ts'), 'utf8');
const context = fs.readFileSync(path.join(root, 'src', 'contexts', 'AnalysisContext.tsx'), 'utf8');
const selectors = fs.readFileSync(path.join(root, 'src', 'utils', 'analysisResultSelectors.ts'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src', 'utils', 'analysisResultFieldCatalog.ts'), 'utf8');

const checks = [
  ['CopilotAnalysisResult carries analysisRecord', /analysisRecord\?: AnalysisResultRecordMetadata/.test(types)],
  ['record schema version is explicit', /ANALYSIS_RESULT_RECORD_SCHEMA_VERSION = 1/.test(record)],
  ['engine version is explicit', /ANALYSIS_ENGINE_VERSION\s*=/.test(record)],
  ['record includes analysisId/inputHash/engineVersion/generatedAt', /analysisId:\s*string/.test(types) && /inputHash:\s*string/.test(types) && /engineVersion:\s*string/.test(types) && /generatedAt:\s*string/.test(types)],
  ['fresh results stamp record metadata', /withAnalysisResultRecord\(result, fingerprint/.test(resultAdapter)],
  ['restore checks inputHash and engineVersion', /isCurrentAnalysisResultRecord\(savedRecord, currentFingerprint\)/.test(context)],
  ['semantic selector exposes result metadata', /selectAnalysisResultMetadata/.test(selectors)],
  ['analysisRecord is cataloged', /path: 'analysisRecord'/.test(catalog)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
console.log(`WP10 result record contract PASS: ${checks.length}/${checks.length}`);
