const fs = require('fs');
const src = fs.readFileSync('src/utils/domainAdaptivePromptEngine.ts', 'utf8');
const checks = [
  ['EMC 工期文案使用当前 daysRemaining', /当前项目剩余 \$\{context\.daysRemaining\} 天/.test(src)],
  ['BLDC 工期文案使用当前 daysRemaining', /当前项目剩余 \$\{context\.daysRemaining\} 天/.test(src) && /18~25 天属于历史经验范围/.test(src)],
  ['禁止把 14 天经验值当当前门禁', /必须使用 context\.daysRemaining 与项目实际 lead time 判断/.test(src)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exit(1);
console.log(`DOMAIN_PROMPT_SCHEDULE_CONTRACT_PASS ${checks.length}/${checks.length}`);
