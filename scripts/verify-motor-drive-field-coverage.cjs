const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const toolbox = read('src/components/MotorDriveToolbox.tsx');
const schema = read('src/domains/bldc/motorDriveInputSchema.ts');
const defaults = read('src/utils/motorDriveWhatIfDefaults.ts');

const schemaKeys = [...schema.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
const schemaSet = new Set(schemaKeys);
const used = [...toolbox.matchAll(/(?:pumping|miller|snubber|stall|commutation|sensor|safetyChain)Params\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
const usedSet = new Set(used);

const defaultBlocks = [...defaults.matchAll(/\n  ([A-Za-z][A-Za-z0-9_]*): \{([\s\S]*?)\n  \},/g)];
const defaultKeys = [];
for (const [, , block] of defaultBlocks) {
  for (const m of block.matchAll(/\n    ([A-Za-z][A-Za-z0-9_]*):/g)) defaultKeys.push(m[1]);
}
const defaultSet = new Set(defaultKeys);

const missingUsed = [...usedSet].filter((key) => !schemaSet.has(key));
const missingDefaults = [...defaultSet].filter((key) => !schemaSet.has(key));
if (missingUsed.length) throw new Error(`MotorDriveToolbox uses fields missing from formal schema: ${missingUsed.join(', ')}`);
if (missingDefaults.length) throw new Error(`MotorDriveToolbox What-if defaults missing from formal schema: ${missingDefaults.join(', ')}`);
if (!/source: previous\?\.source \|\| 'ASSUMPTION'/.test(schema)) throw new Error('Explicit What-if write-back must default provenance to ASSUMPTION');
if (/source:\s*previous\?\.source \|\| descriptor\.writeSource/.test(schema)) throw new Error('Explicit What-if write-back must not inherit CONTEXT/SPEC from descriptor.writeSource');

const entries = [...schema.matchAll(/\{ key: '([^']+)'([^\n]*)\}/g)].map((m) => ({ key: m[1], row: m[0] }));
for (const { key, row } of entries) {
  const whatIf = /binding: 'WHAT_IF_ONLY'/.test(row);
  const current = /binding: 'CURRENT_ISSUE'/.test(row);
  if (!whatIf && !current) throw new Error(`${key}: missing binding`);
  if (whatIf && !/sourceType: 'WHAT_IF'/.test(row)) throw new Error(`${key}: WHAT_IF_ONLY must expose sourceType WHAT_IF`);
  if (whatIf && !/provenancePolicy: 'NEVER_WRITE'/.test(row)) throw new Error(`${key}: WHAT_IF_ONLY must be NEVER_WRITE`);
  if (whatIf && /issueKey:/.test(row)) throw new Error(`${key}: WHAT_IF_ONLY must not have an IssueInput key`);
  if (current && !/issueKey:/.test(row)) throw new Error(`${key}: CURRENT_ISSUE must have issueKey`);
  if (current && /provenancePolicy: 'NEVER_WRITE'/.test(row)) throw new Error(`${key}: CURRENT_ISSUE cannot be NEVER_WRITE`);
}

console.log(`WP5d field coverage PASS: ${usedSet.size} Toolbox fields + ${defaultSet.size} default fields are formally described (${schemaKeys.length} schema entries).`);
