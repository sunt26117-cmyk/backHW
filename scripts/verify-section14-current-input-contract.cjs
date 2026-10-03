const fs = require('fs');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const start = app.indexOf('const handleLoadSection14');
if (start < 0) throw new Error('handleLoadSection14 not found');
const end = app.indexOf('\n  const handleExportBackup', start);
if (end < 0) throw new Error('Section14 handler boundary not found');
const block = app.slice(start, end);
const checks = [
  ['Section14 不再写死 3800rpm', !/3800rpm/.test(block)],
  ['Section14 不再写死 37.8V', !/37\.8V/.test(block)],
  ['Section14 不再写死 15天', !/15天/.test(block)],
  ['同工况重载先清旧结果', /analysis\.setResult\(null\)/.test(block) && /sameScenario/.test(block)],
  ['Toast 从当前验收工况派生', /bldc\.title/.test(block) && /bldc\.context\.daysRemaining/.test(block) && /bldc\.context\.projectPhase/.test(block)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if (failed) process.exit(1);
console.log(`SECTION14_CURRENT_INPUT_CONTRACT_PASS ${checks.length}/${checks.length}`);
