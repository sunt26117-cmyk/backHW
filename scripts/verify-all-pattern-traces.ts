import assert from 'node:assert/strict';
import { evaluateAllBldcPatterns, BldcEvaluationInput } from '../src/data/bldcPatternEngine';

const input: BldcEvaluationInput = {
  vbusNominal: 13.5,
  vdsRating: 40,
  rpm: 5000,
  jInertia: 0.00012,
  cbusUf: 470,
  tAmbientC: 25,
  currentPeakA: 25,
  harnessLengthM: 1.8,
  deadTimeNs: 250,
  rgOffOhm: 2.2,
  cgdPf: 420,
  dvDtVns: 6,
  vthMinV: 2.0,
  traceSources: {
    vbusNominal: 'MEASURED',
    currentPeakA: 'MEASURED',
    rpm: 'MEASURED',
    vdsRating: 'SPEC_CONSTANT',
    harnessLengthM: 'USER_INPUT',
  },
};

const expectedIds = Array.from({ length: 18 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);
const patterns = evaluateAllBldcPatterns(input);
assert.equal(patterns.length, 18, 'BLDC engine must expose exactly P001~P018');
assert.deepEqual(patterns.map((p) => p.id), expectedIds, 'Pattern order must remain P001~P018');

for (const pattern of patterns) {
  assert.ok(pattern.trace?.length, `${pattern.id} is missing Trace`);
  for (const node of pattern.trace ?? []) {
    assert.ok(node.id.startsWith(`bldcPattern:${pattern.id}.`), `${pattern.id} Trace id must be namespaced`);
    assert.ok(node.inputs.length > 0, `${pattern.id} Trace must expose at least one input`);
    assert.ok(node.formula, `${pattern.id} Trace must declare a deterministic formula/logic`);
    assert.ok(node.verdict, `${pattern.id} Trace must expose Verdict`);
  }
}

const checklists = new Set(['P015', 'P017']);
for (const pattern of patterns.filter((p) => checklists.has(p.id))) {
  assert.equal(pattern.trace?.[0]?.degraded, false, `${pattern.id} checklist reference Trace must not be treated as a degraded calculation`);
}

console.log(`ALL TRACE VERIFY PASS: ${patterns.filter((p) => p.trace?.length).length}/18 patterns traced`);
