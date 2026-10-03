const fs = require('fs');
const path = 'src/components/RecommendationRaciView.tsx';
const s = fs.readFileSync(path, 'utf8');
const forbidden = [
  '通关指数: 96%',
  '3天完成，15天节点绿灯保住',
  '降额回至42%',
  '因 28 天工期导致 15 天 DV 节点严重击穿',
  '因 94.5% 极端降额违约',
  '寄存器 <code>0x04 = 0x03</code>',
];
let failed = false;
for (const x of forbidden) {
  const ok = !s.includes(x);
  console.log(`${ok ? 'PASS' : 'FAIL'} fixed wargame literal removed: ${x}`);
  if (!ok) failed = true;
}
const required = [
  ['candidate timing binding', /wargameTiming/],
  ['milestone binding', /daysRemaining/],
  ['risk binding', /riskRatings\.overallRisk/],
  ['evidence binding', /insufficientEvidenceCount/],
];
for (const [name, re] of required) {
  const ok = re.test(s);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('WARGAME_CURRENT_INPUT_PASS');
