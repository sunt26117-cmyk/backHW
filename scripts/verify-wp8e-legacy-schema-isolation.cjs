const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const adapterFile = path.join(root, 'src/adapters/analysisResultAdapter.ts');
const selectorFile = path.join(root, 'src/utils/analysisResultSelectors.ts');
const storageAdapterFile = path.join(root, 'src/adapters/analysisStorageAdapter.ts');
const storageFacadeFile = path.join(root, 'src/utils/analysisStorage.ts');

const legacyFields = [
  'coreConclusion', 'riskRatings', 'knownFacts', 'assumptions', 'unknowns',
  'physicalMechanism', 'dfmeaView', 'dfmeaItems', 'candidateActions',
  'finalRecommendation', 'raciMatrix', 'containment', 'capa', 'engineeringDocs',
  'dualTimeline', 'bldcExtendedAnalysis', 'classifiedInfo', 'multiRiskBreakdown',
  'whyNotComparison', 'next24HourPlan', 'edrRecord', 'redTeamChallenge',
  'templateContentNotice', 'analysisInputFingerprint', 'context', 'source',
  'provenance', 'analysisBasis', 'citedFields', 'multiDomainAnalysis',
  'decisionFrame', 'inputIntegrity', 'aiAudit', 'debugSnapshot',
];

function read(file) { return fs.readFileSync(file, 'utf8'); }
function ast(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function propertyNames(sourceFile) {
  const out = new Set();
  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) out.add(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return out;
}

for (const file of [adapterFile, selectorFile, storageAdapterFile, storageFacadeFile]) {
  if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(root, file)}`);
}

const adapterSource = read(adapterFile);
const selectorSource = read(selectorFile);
const selectorProps = propertyNames(ast(selectorFile));
const leaked = legacyFields.filter((field) => selectorProps.has(field));
if (leaked.length) throw new Error(`WP8e selector still knows legacy schema fields: ${leaked.join(', ')}`);
if (selectorSource.includes('createLegacyResultReadView') || selectorSource.includes('createLegacyResultMutableView')) {
  throw new Error('WP8e selector must consume semantic adapter slices, not legacy read/mutable views');
}
for (const fn of ['readFacts','readJudgment','readAction','readTraceSummary','readDecisionSnapshot','readRiskSnapshot','readDeliverySnapshot']) {
  if (!adapterSource.includes(`export function ${fn}`)) throw new Error(`adapter missing ${fn}`);
}
for (const field of ['candidateActions', 'finalRecommendation', 'riskRatings', 'analysisBasis', 'provenance']) {
  if (!adapterSource.includes(`.${field}`)) throw new Error(`adapter no longer owns legacy field ${field}`);
}

const storageAdapter = read(storageAdapterFile);
const storageFacade = read(storageFacadeFile);
if (!storageAdapter.includes('PersistedEnvelope') || !storageAdapter.includes('STORAGE_FORMAT')) throw new Error('storage adapter envelope missing');
if (!storageAdapter.includes('ecu_copilot_analysis_results_v1')) throw new Error('v1 compatibility read missing');
if (storageFacade.includes('ecu_copilot_analysis_results_v1') || storageFacade.includes('JSON.parse')) {
  throw new Error('analysisStorage.ts must remain an opaque compatibility facade');
}

console.log('AUTOHW CORE WP8E LEGACY SCHEMA ISOLATION PASS');
