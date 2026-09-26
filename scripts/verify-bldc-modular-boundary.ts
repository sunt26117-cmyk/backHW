import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLDC_PATTERN_EVALUATORS } from '../src/domains/bldc';

const root = resolve(process.cwd(), 'src');
const bldcRoot = resolve(root, 'domains/bldc');
const patternRoot = resolve(bldcRoot, 'patterns');

assert.equal(BLDC_PATTERN_EVALUATORS.length, 18, 'BLDC Registry must contain exactly P001~P018');
assert.deepEqual(
  BLDC_PATTERN_EVALUATORS.map((fn) => fn.name),
  Array.from({ length: 18 }, (_, i) => `evaluateP${String(i + 1).padStart(3, '0')}`),
  'BLDC Registry order must remain P001~P018',
);
assert.ok(existsSync(resolve(root, 'physics/motorPhysicsEngine.ts')), 'Canonical Physics layer is missing');
assert.match(
  readFileSync(resolve(root, 'utils/motorPhysicsEngine.ts'), 'utf8'),
  /^\/\*\* Compatibility facade/m,
  'Legacy motorPhysicsEngine path must remain a thin compatibility facade',
);

const patternFiles = readdirSync(patternRoot).filter((name) => /^P\d{3}\.ts$/.test(name));
assert.equal(patternFiles.length, 18, 'There must be exactly 18 isolated BLDC Pattern modules');

for (const file of patternFiles) {
  const content = readFileSync(resolve(patternRoot, file), 'utf8');
  assert.doesNotMatch(content, /\/patterns\/P\d{3}|from ['"].*P\d{3}['"]/, `${file} must not import another Pattern`);
  assert.doesNotMatch(content, /from ['"].*(?:components|server|ai|scenarioDynamic|scenarioDerived)['"]/, `${file} must not couple to UI/AI/Scenario`);
}

console.log('BLDC MODULAR BOUNDARY PASS: 18 isolated patterns + stable registry + canonical physics layer');
