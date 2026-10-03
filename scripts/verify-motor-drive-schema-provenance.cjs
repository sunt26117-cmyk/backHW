const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src', 'domains', 'bldc', 'motorDriveInputSchema.ts'), 'utf8');
const groups = [...schema.matchAll(/^  ([A-Za-z][A-Za-z0-9_]*): \[/gm)].map(m => m[1]);
if (!groups.length) throw new Error('MotorDrive schema groups not found');
for (const token of ['sourceType:', 'provenancePolicy:', 'valueType:', 'unit:', 'binding:']) {
  if (!schema.includes(token)) throw new Error(`MotorDrive field schema missing ${token}`);
}
const entries = [...schema.matchAll(/\{ key: '([^']+)'[^\n]*binding: '([^']+)'[^\n]*sourceType: '([^']+)'[^\n]*provenancePolicy: '([^']+)'[^\n]*valueType: '([^']+)'/g)];
if (entries.length < 20) throw new Error(`Too few formally described MotorDrive fields: ${entries.length}`);
for (const [, key, binding, sourceType, policy, valueType] of entries) {
  if (binding === 'CURRENT_ISSUE' && !schema.includes(`key: '${key}'`)) throw new Error(`Missing field ${key}`);
  if (binding === 'WHAT_IF_ONLY' && policy !== 'NEVER_WRITE') throw new Error(`${key}: WHAT_IF_ONLY must be NEVER_WRITE`);
  if (sourceType === 'WHAT_IF' && binding !== 'WHAT_IF_ONLY') throw new Error(`${key}: WHAT_IF sourceType cannot be current issue`);
  if (!['number','enum'].includes(valueType)) throw new Error(`${key}: unknown valueType ${valueType}`);
}
console.log(`WP5d MotorDrive schema provenance PASS: ${entries.length} formally described fields across ${groups.length} groups.`);
