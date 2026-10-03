const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const selector = fs.readFileSync(path.join(root,'src/utils/analysisResultSelectors.ts'),'utf8');
for (const name of ['selectFacts','selectJudgment','selectAction']) {
  if (!selector.includes(`export function ${name}`)) throw new Error(`missing ${name}`);
}
const first = fs.readFileSync(path.join(root,'src/components/FirstScreen10sView.tsx'),'utf8');
if (!first.includes('selectAnalysisResultContract')) throw new Error('FirstScreen missing semantic result contract');
if (/result\.decisionFrame|result\.next24HourPlan/.test(first)) throw new Error('FirstScreen still directly reads decisionFrame/next24HourPlan');
for (const name of ['selectFacts','selectJudgment','selectAction']) {
  if (!selector.includes(`export function ${name}`)) throw new Error(`missing ${name}`);
}
console.log('WP8b fact/judgment/action semantic contract PASS');
