const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function fail(message) { throw new Error(`WP11 release closure FAIL: ${message}`); }

const packageJson = JSON.parse(read('package.json'));
const app = read('src/App.tsx');
const analysisContext = read('src/contexts/AnalysisContext.tsx');
const storageAdapter = read('src/adapters/analysisStorageAdapter.ts');
const recordAdapter = read('src/adapters/analysisResultRecordAdapter.ts');
const backup = read('src/utils/backupRestore.ts');
const selectors = read('src/utils/analysisResultSelectors.ts');
const offlineConfig = read('vite.config.offline.ts');

const coreViews = [
  'DecisionCockpitView.tsx',
  'AnalysisFactView.tsx',
  'BldcPatternEngineView.tsx',
  'FirstScreen10sView.tsx',
  'OptionsComparisonView.tsx',
  'RecommendationRaciView.tsx',
  'TraceAuditView.tsx',
  'SeniorEngineeringWorkbenchView.tsx',
];

for (const file of coreViews) {
  const source = read(`src/components/${file}`);
  if (!source.includes('selectAnalysisResultContract')) fail(`${file} bypasses the semantic result contract`);
  const selectorImports = source.split(/\r?\n/).filter((line) => line.includes("from '../utils/analysisResultSelectors'"));
  if (!selectorImports.some((line) => line.includes('selectAnalysisResultContract'))) fail(`${file} does not import the semantic result contract`);
  if (/\bselect(?:Action|CandidateActions|DecisionSnapshot|RiskSnapshot|CalculatedEvidence|DualTimeline|DeliverySnapshot|SafetySummary|TraceSummary|AnalysisBasis|MultiDomainLinks|TemplateNotice|BldcExtendedAnalysis|VerificationDecision|Facts|Judgment)\s*\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' '))) {
    fail(`${file} still calls a legacy slice selector directly`);
  }
}

if (!/saveAnalysisResult\(scenarioId, (?:local|finalResult)\)/.test(analysisContext)) {
  fail('analysis orchestration no longer persists only through the storage facade');
}
if (!/isCurrentAnalysisResultRecord\(savedRecord, currentFingerprint\)/.test(analysisContext)) {
  fail('restore freshness gate is missing inputHash + engineVersion validation');
}
if (!/analysisId|inputHash|engineVersion/.test(recordAdapter)) fail('analysis result identity fields missing');
if (!/ENGINE_VERSION/.test(recordAdapter)) fail('explicit engine version constant missing');

const directStorageRefs = [];
for (const rel of [
  'src/App.tsx',
  'src/contexts/AnalysisContext.tsx',
  'src/utils/scenarioManager.ts',
  'src/utils/deviceLibrary.ts',
  'src/utils/scenarioLibrary.ts',
]) {
  const source = read(rel);
  if (source.includes('ecu_copilot_analysis_results_v1') || source.includes('ecu_copilot_analysis_results_v2')) directStorageRefs.push(rel);
}
if (directStorageRefs.length) fail(`analysis storage keys leaked outside adapter: ${directStorageRefs.join(', ')}`);

if (!/withLegacyImportedAnalysisRecord/.test(backup)) fail('legacy backup migration marker missing');
if (!/isCurrentAnalysisResultRecord\(importedRecord, expectedHash\)/.test(app)) fail('backup restore bypasses current-engine acceptance gate');
if (!/runAnalysis\(imported\.context, imported\.issue/.test(app)) fail('stale/legacy backup does not force current-engine recomputation');
if (!/const ANALYSIS_STORAGE_KEY = 'ecu_copilot_analysis_results_v2'/.test(storageAdapter)) fail('v2 analysis storage is not canonical');
if (!/New writes always use.*v2|New writes always use/.test(storageAdapter.replace(/\n/g, ' ')) && !/never recreate the legacy storage key/.test(storageAdapter)) {
  fail('legacy storage is not one-way compatible');
}

if (!/selectAnalysisResultContract/.test(selectors)) fail('semantic contract selector missing');
if (!/vite build --config vite\.config\.offline\.ts/.test(packageJson.scripts.build)) fail('offline build path missing from release build');
if (!/dist-offline\/index\.html/.test(packageJson.scripts.build)) fail('offline single-file output copy missing');
if (!offlineConfig.includes('vite-plugin-singlefile')) fail('offline build is not single-file configured');
const testScript = packageJson.scripts.test;
const gateToken = 'node scripts/verify-wp11-release-closure.cjs';
if (!testScript.startsWith(gateToken + ' && ')) fail('WP11 closure gate must be the first npm test gate');
if (testScript.split(gateToken).length - 1 !== 1) fail('WP11 closure gate must be registered exactly once');

for (const file of fs.readdirSync(path.join(root, 'scripts')).filter((name) => name.endsWith('.cjs'))) {
  const source = read(`scripts/${file}`);
  if (/exec(File|FileSync)\(['"]grep['"]/.test(source) || /spawnSync\(['"]grep['"]/.test(source)) {
    fail(`non-portable external grep dependency remains in ${file}`);
  }
}

console.log(`WP11 release closure PASS: ${coreViews.length} core views + persistence + backup + offline build + portability boundaries verified.`);
