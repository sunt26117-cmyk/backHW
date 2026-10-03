const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');
const targetImport = "from '../data/systemRegressionCases'";

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(fullPath));
    else if (entry.isFile() && (/\.tsx?$/.test(entry.name))) files.push(fullPath);
  }
  return files;
}

const refs = collectSourceFiles(srcRoot)
  .flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => ({ file, line: index + 1, text: line })))
  .filter(({ text }) => text.includes(targetImport))
  // path.relative() 在 Windows 返回反斜杠，会让下一行的 'src/components/...' 判定失效（把合法引用误判为越界）。
  .map(({ file, line, text }) => `${path.relative(root, file).split(path.sep).join('/')}:${line}:${text.trim()}`);
const bad = refs.filter(line => !line.includes('src/components/DesignReviewRegressionView.tsx'));
if (bad.length) throw new Error(`systemRegressionCases imported outside review UI: ${bad.join('\n')}`);
const ai = fs.readFileSync(path.join(root, 'src', 'utils', 'aiGrounding.ts'), 'utf8');
if (ai.includes("systemRegressionCases")) throw new Error('AI grounding must not consume system regression fixtures');
console.log('WP7b runtime boundary PASS: regression fixtures stay out of AI/current-fact paths.');
