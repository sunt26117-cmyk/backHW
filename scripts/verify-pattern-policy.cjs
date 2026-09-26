const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/domains/bldc/patternPolicy.ts'), 'utf8');
const assumptionStart = source.indexOf("if (assumedInputs.length > 0) {");
assert.ok(assumptionStart >= 0, 'ASSUMPTION_BASED branch missing');
const assumptionBranch = source.slice(assumptionStart, source.indexOf('\n  return { ...result, analysisStatus: \'READY\'', assumptionStart));
const insufficientStart = source.indexOf("if (missingInputs.length > 0) {");
const insufficientBranch = source.slice(insufficientStart, assumptionStart);

// B-policy: assumption-based patterns stay discoverable, but cannot become VETO / confirmed evidence.
assert.match(assumptionBranch, /analysisStatus: 'ASSUMPTION_BASED'/);
assert.match(assumptionBranch, /vetoTriggered:\s*false/);
assert.doesNotMatch(assumptionBranch, /triggered:\s*false/);
assert.match(assumptionBranch, /evidenceType:\s*'ENGINEERING_ASSUMPTION'/);
assert.match(assumptionBranch, /confidence:\s*'LOW'/);

// Hard missing-input gate: no trigger and no VETO.
assert.match(insufficientBranch, /analysisStatus: 'INSUFFICIENT_INPUT'/);
assert.match(insufficientBranch, /triggered:\s*false/);
assert.match(insufficientBranch, /vetoTriggered:\s*false/);
assert.match(insufficientBranch, /evidenceType:\s*'UNKNOWN'/);

// Checklist patterns remain explicitly classified and independently handled.
assert.match(source, /patternKind === 'CHECKLIST'|patternKind === 'CHECKLIST'/);

console.log('PATTERN_POLICY_STATIC_PASS');
console.log('ASSUMPTION_BASED: preserve triggered, suppress VETO, downgrade evidence');
console.log('INSUFFICIENT_INPUT: suppress triggered + VETO');
