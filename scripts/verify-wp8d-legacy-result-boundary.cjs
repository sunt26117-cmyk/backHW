const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const adapterPath = path.join(root, 'src/adapters/analysisResultAdapter.ts');
const consumerFiles = [
  'src/data/expertEngine.ts',
  'src/data/verificationLoopEngine.ts',
  'src/utils/scenarioDerived.ts',
  'src/utils/scenarioDynamic.ts',
  'src/utils/analysisStorage.ts',
  'src/utils/analysisResultSelectors.ts',
  'src/utils/aiProtocol.ts',
  'src/utils/aiGrounding.ts',
  'src/utils/aiResultAuditor.ts',
  'src/utils/dualTimelineEngine.ts',
].map((file) => path.join(root, file));

const legacyFields = new Set([
  'coreConclusion', 'riskRatings', 'knownFacts', 'assumptions', 'unknowns',
  'physicalMechanism', 'dfmeaView', 'dfmeaItems', 'candidateActions',
  'finalRecommendation', 'raciMatrix', 'containment', 'capa', 'engineeringDocs',
  'dualTimeline', 'bldcExtendedAnalysis', 'classifiedInfo', 'multiRiskBreakdown',
  'whyNotComparison', 'next24HourPlan', 'edrRecord', 'redTeamChallenge',
  'templateContentNotice', 'analysisInputFingerprint', 'context', 'source',
  'provenance', 'analysisBasis', 'citedFields', 'multiDomainAnalysis',
  'decisionFrame', 'inputIntegrity', 'aiAudit', 'debugSnapshot',
]);

const resultCarrierNames = new Set(['result', 'baseline', 'sanitized', 'analysis', 'parsed', 'dynamic', 'finalData']);
const adapterViewNames = new Set(['legacy', 'baselineLegacy', 'parsedLegacy', 'sanitizedLegacy', 'analysisLegacy', 'finalDataLegacy', 'dynamic']);
const offenders = [];

function visit(node, relFile, sourceFile) {
  if (ts.isPropertyAccessExpression(node)) {
    const name = node.name.text;
    const expression = node.expression;
    const variable = ts.isIdentifier(expression) ? expression.text : null;
    if (variable && resultCarrierNames.has(variable) && !adapterViewNames.has(variable) && legacyFields.has(name)) {
      offenders.push(`${relFile}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} direct ${variable}.${name}`);
    }
  }
  ts.forEachChild(node, (child) => visit(child, relFile, sourceFile));
}

for (const file of consumerFiles) {
  if (!fs.existsSync(file)) throw new Error(`missing boundary consumer: ${path.relative(root, file)}`);
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  visit(sourceFile, path.relative(root, file), sourceFile);
}

if (!fs.existsSync(adapterPath)) throw new Error('missing src/adapters/analysisResultAdapter.ts');
const adapter = fs.readFileSync(adapterPath, 'utf8');
if (!/createLegacyResult(Read|Mutable)View/.test(adapter)) throw new Error('legacy result adapter API missing');

if (offenders.length) {
  console.error('WP8D LEGACY RESULT BOUNDARY FAIL');
  for (const item of offenders) console.error(`- ${item}`);
  process.exit(1);
}

const storage = fs.readFileSync(path.join(root, 'src/utils/analysisStorage.ts'), 'utf8');
if (/ecu_copilot_analysis_results_v1/.test(storage)) throw new Error('analysisStorage.ts must not own the persistence storage key');
if (!/analysisStorageAdapter/.test(storage)) throw new Error('analysisStorage.ts must delegate persistence to adapter');

console.log('AUTOHW CORE WP8D LEGACY RESULT BOUNDARY PASS');
