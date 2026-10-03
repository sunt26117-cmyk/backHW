const fs = require('fs');
const src = fs.readFileSync('src/contexts/AnalysisContext.tsx', 'utf8');
const checks = [
  ['恢复时计算当前输入指纹', /const currentFingerprint = buildAnalysisInputFingerprint\(context, issue\)/.test(src)],
  ['仅恢复与当前输入匹配的保存结果', /savedMatchesCurrentInput/.test(src) && /setResult\(saved\)/.test(src)],
  ['保存结果不匹配时清空并重算', /setResult\(null\)/.test(src) && /void runAnalysis\(context, issue, currentScenarioId\)/.test(src)],
  ['显式解释 context/issue 变化不能盲恢复', /context \/ issue 可能已经被导入、编辑或器件更新/.test(src)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exit(1);
console.log(`ANALYSIS_RESTORE_FINGERPRINT_PASS ${checks.length}/${checks.length}`);
