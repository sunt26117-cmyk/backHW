const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const workbench = read('src/components/SeniorEngineeringWorkbenchView.tsx');
const options = read('src/components/OptionsComparisonView.tsx');
const workflow = read('src/components/EngineeringWorkflowView.tsx');
const checks = [
  ['场景标签由工作台头部统一承载', /scenarioLabel = \(result as any\)\?\.__scenarioLabel \|\| context\.projectName/.test(workbench)],
  ['候选方案页不再重复场景横幅', !/当前典型工况/.test(options)],
  ['工作流页只保留操作路径语义', /只保留操作路径/.test(workflow) && /事实\/风险\/证据详情分别回到 Facts \/ Pattern \/ Review/.test(workflow)],
  ['工作流页不复制事实审计/证据说明', !/证据基础与未闭合缺口/.test(workflow) && !/多维度风险分解/.test(workflow)],
];

const ownership = read('src/content/workbenchOwnership.ts');
checks.push(['8 个核心事实面有唯一 ownership 清单', (ownership.match(/id: '/g) || []).length === 8]);
checks.push(['ownership 清单明确 7 个正式工作台 + Trace', /7 个正式工作台 \+ 1 个横切 Trace/.test(ownership)]);

const facts = read('src/components/AnalysisFactView.tsx');
checks.push(['Facts 页不重复持有推荐方案正文', !/推荐措施：\{coreConclusion\.recommendedMeasure\}/.test(facts) && /推荐方案以总览 \/ 方案决策页为准/.test(facts)]);
checks.push(['Facts 页不重复持有完整物理机理正文', !/Physical Mechanism Analysis/.test(facts) && /完整确定性机理归 physics \/ Pattern/.test(facts)]);
checks.push(['Facts 页保留 DFMEA 事实归属', /DFMEA 失效链条分析/.test(facts) && /DFMEA 失效链条/.test(ownership)]);

let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exit(1);
console.log(`PAGE_CONTENT_OWNERSHIP_PASS ${checks.length}/${checks.length}`);
