import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && !['node_modules', 'dist', 'dist-offline'].includes(ent.name)) walk(p);
    else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
}
walk(path.join(root, 'src'));

const suspicious = [];
const patterns = [
  /3800\s*rpm/i,
  /37\.8\s*V/i,
  /5V\/10A/i,
  /150MHz/i,
  /31\s*dBuV/i,
  /122℃/i,
];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (f.includes(`${path.sep}data${path.sep}`) || f.includes(`${path.sep}components${path.sep}`)) {
    for (const re of patterns) {
      if (re.test(text)) suspicious.push(`${path.relative(root, f)} :: ${re}`);
    }
  }
}
console.log(`Scanned ${files.length} TS/TSX files.`);
console.log(`Known benchmark-like literals remain in source: ${suspicious.length}`);
if (suspicious.length) {
  console.log('These are not automatically errors; they may belong to BENCHMARK fixtures or explicit demo content.');
  for (const x of suspicious.slice(0, 40)) console.log(` - ${x}`);
}
