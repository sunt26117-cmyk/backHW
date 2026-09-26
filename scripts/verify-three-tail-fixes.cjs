const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 1. Legacy pillar implementation is physically quarantined and not imported by runtime code.
assert.ok(fs.existsSync(path.join(root, 'src/data/legacy/decisionPillars.ts')));
const sourceFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory() && name !== 'node_modules' && name !== 'dist') walk(full);
    else if (st.isFile() && /\.(ts|tsx)$/.test(name)) sourceFiles.push(full);
  }
}
walk(path.join(root, 'src'));
for (const full of sourceFiles) {
  const rel = path.relative(root, full).replaceAll(path.sep, '/');
  if (rel === 'src/data/decisionPillars.ts' || rel.startsWith('src/data/legacy/')) continue;
  const text = fs.readFileSync(full, 'utf8');
  assert.doesNotMatch(text, /from ['"].*(?:^|\/)decisionPillars['"]/m, `runtime import leak: ${rel}`);
}

// 2. No BLDC pattern imports another P file.
const patternDir = path.join(root, 'src/domains/bldc/patterns');
for (const name of fs.readdirSync(patternDir)) {
  if (!/^P\d+\.ts$/.test(name)) continue;
  const text = fs.readFileSync(path.join(patternDir, name), 'utf8');
  assert.doesNotMatch(text, /from ['"].*(?:\/?P\d+)['"]/, `cross-pattern import: ${name}`);
}

// 3. Deterministic BLDC physical inputs use structured keys in scenarioDerived.
const derived = read('src/utils/scenarioDerived.ts');
assert.match(derived, /optMeas\(issue, 'vdsRatingV'\)/);
assert.match(derived, /optMeas\(issue, 'dvdtVns'\)/);
assert.doesNotMatch(derived, /let\s+vdsRating\s*=\s*firstNumber\(/);
assert.doesNotMatch(derived, /let\s+dvDtVns\s*=\s*firstNumber\(/);

// 4. The unified BLDC policy separates "pattern identified" from "confirmed risk/VETO".
const policy = read('src/domains/bldc/patternPolicy.ts');
assert.match(policy, /analysisStatus: 'INSUFFICIENT_INPUT'/);
assert.match(policy, /analysisStatus: 'ASSUMPTION_BASED'/);
// Missing evidence must suppress trigger + VETO entirely.
assert.match(policy, /analysisStatus: 'INSUFFICIENT_INPUT'[\s\S]*?triggered: false/);
assert.match(policy, /analysisStatus: 'INSUFFICIENT_INPUT'[\s\S]*?vetoTriggered: false/);
// Assumption-based evidence must preserve the evaluator's trigger for candidate discovery,
// while veto is always suppressed. Do NOT regress to "triggered: false" in this branch.
const assumptionBranch = policy.split("if (assumedInputs.length > 0) {", 2)[1]?.split('return {', 2)[0] || '';
assert.doesNotMatch(assumptionBranch, /triggered\s*:\s*false/);
assert.match(policy, /analysisStatus: 'ASSUMPTION_BASED'[\s\S]*?vetoTriggered: false/);

// 5. Multi-domain UI uses getDomainMeasurementGroups and a shared field renderer.
const ui = read('src/components/ProjectContextView.tsx');
assert.match(ui, /const groups = getDomainMeasurementGroups\(issue\)/);
assert.match(ui, /const deviceSpecKeys = new Set\(/);
assert.match(ui, /group\.role === 'PRIMARY'/);

console.log('THREE_TAIL_FIXES_STATIC_PASS');
console.log('decisionPillars runtime isolation: PASS');
console.log('BLDC physical input governance: PASS');
console.log('multi-domain unified input rendering: PASS');
