const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const backup = fs.readFileSync(path.join(root, 'src', 'utils', 'backupRestore.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const checks = [
  ['backup format upgraded to 1.4', /version: '1\.4-automotive'/.test(backup)],
  ['export contains resultRecord', /resultRecord:\s*readAnalysisResultMetadata\(result\)\.analysisRecord/.test(backup)],
  ['import recomputes expected input hash', /buildAnalysisInputFingerprint\(parsed\.context, parsed\.issue\)/.test(backup)],
  ['import rejects result/input mismatch', /已拒绝恢复旧结论/.test(backup)],
  ['legacy backups are marked unknown-engine', /withLegacyImportedAnalysisRecord/.test(backup)],
  ['App accepts only current record metadata', /isCurrentAnalysisResultRecord\(importedRecord, expectedHash\)/.test(app)],
  ['old-engine import triggers current-engine recomputation', /旧分析引擎或旧输入/.test(app) && /runAnalysis\(imported\.context, imported\.issue/.test(app)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
console.log(`WP10 backup/restore contract PASS: ${checks.length}/${checks.length}`);
