const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const registry = fs.readFileSync(path.join(root, 'src', 'data', 'caseLibraryRegistry.ts'), 'utf8');
const paths = ['presetScenarios.ts', 'engineeringGoldCases.ts', 'systemRegressionCases.ts'];
for (const file of paths) {
  if (!registry.includes(file)) throw new Error(`registry missing ${file}`);
}
if (!registry.includes('forbiddenAsCurrentFact: true')) throw new Error('libraries must be forbidden as current facts');
const presets = fs.readFileSync(path.join(root, 'src', 'data', 'presetScenarios.ts'), 'utf8');
const gold = fs.readFileSync(path.join(root, 'src', 'data', 'engineeringGoldCases.ts'), 'utf8');
const regression = fs.readFileSync(path.join(root, 'src', 'data', 'systemRegressionCases.ts'), 'utf8');
if (!presets.includes('PRESET_SCENARIOS')) throw new Error('preset library export missing');
if (!gold.includes('ENGINEERING_GOLD_CASES')) throw new Error('gold library export missing');
if (!regression.includes('SYSTEM_REGRESSION_CASES')) throw new Error('system regression library export missing');
console.log('WP7b case library boundary PASS: registry + exports verified.');
