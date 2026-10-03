const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const storage = fs.readFileSync(path.join(root, 'src', 'adapters', 'analysisStorageAdapter.ts'), 'utf8');
const facade = fs.readFileSync(path.join(root, 'src', 'utils', 'analysisStorage.ts'), 'utf8');
const checks = [
  ['storage envelope upgraded to v2', /const STORAGE_VERSION = 2/.test(storage)],
  ['legacy envelope v1 remains readable', /LEGACY_ENVELOPE_VERSION = 1/.test(storage) && /isEnvelopeV1/.test(storage)],
  ['new envelope carries record metadata', /record:\s*AnalysisResultRecordMetadata/.test(storage) && /record,\n\s*payload: value/.test(storage)],
  ['payload/envelope metadata must agree', /payloadRecord\.analysisId !== value\.record\.analysisId/.test(storage) && /payloadRecord\.inputHash !== value\.record\.inputHash/.test(storage)],
  ['new writes reject results without record metadata', /缺少 WP10 记录元数据/.test(storage)],
  ['public facade still delegates to storage adapter', /writePersistedAnalysis/.test(facade) && /readPersistedAnalysis/.test(facade)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
console.log(`WP10 persistence contract PASS: ${checks.length}/${checks.length}`);
