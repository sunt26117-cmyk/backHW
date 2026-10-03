/**
 * 文案去重治理：同一段中文方案文字不得在两个文件里各写一份。
 *
 * 背景：dualTimelineEngine 与 robotJointExpert 曾逐字复制 23 条方案文案（改一处漏一处，
 * 还复制过 "约 约三周" 这类错字）。现统一放到 src/content/robotJointText.ts。
 *
 * 规则：
 *  - 硬门禁 1：src/content/ 里已有的文案，不得在其它文件再写一遍字面量。
 *  - 硬门禁 2：上述两个文件之间不得再出现逐字相同的 ≥18 字中文字面量。
 *  - 全仓扫描仅作报告（列出其它文件对之间的重复，供后续逐步治理），不失败。
 * 用 TypeScript AST 取字符串值，不受引号风格/转义影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const MIN_LEN = 18;

function literalsOf(file: string): Set<string> {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  const out = new Set<string>();
  const visit = (n: ts.Node) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.length >= MIN_LEN && /[一-鿿]/.test(n.text)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(path.join(ROOT, 'src'));
const CONTENT_DIR = path.join(ROOT, 'src/content') + path.sep;
const contentFiles = files.filter((f) => f.startsWith(CONTENT_DIR));
const otherFiles = files.filter((f) => !f.startsWith(CONTENT_DIR));

// 硬门禁 1：src/content/ 是静态文案的唯一定义处 —— 其中已有的文案不得在别处再写一遍字面量，
// 必须 import 引用常量。（只比较两个旧文件不够：去重之后重复会出现在 "某文件 ↔ content" 之间。）
const contentLits = new Map<string, string>();
for (const f of contentFiles) for (const t of literalsOf(f)) contentLits.set(t, path.relative(ROOT, f));
const violations: string[] = [];
for (const f of otherFiles) for (const t of literalsOf(f)) {
  if (contentLits.has(t)) violations.push(`${path.relative(ROOT, f)} 重复了 ${contentLits.get(t)} 里的文案: ${t.slice(0, 36)}…`);
}
if (violations.length) {
  console.error(`发现 ${violations.length} 处文案在 src/content/ 之外被重复书写（应改为 import 常量）:`);
  violations.slice(0, 8).forEach((v) => console.error('  -', v));
  process.exit(1);
}

// 硬门禁 2：历史重灾区，两个文件之间不得出现逐字相同的文案
const la = literalsOf(path.join(ROOT, 'src/utils/dualTimelineEngine.ts'));
const lb = literalsOf(path.join(ROOT, 'src/data/robotJointExpert.ts'));
const shared = [...la].filter((t) => lb.has(t));
if (shared.length) {
  console.error(`dualTimelineEngine ↔ robotJointExpert 仍有 ${shared.length} 条逐字重复文案，请提到 src/content/ 共享:`);
  shared.slice(0, 5).forEach((t) => console.error('  -', t.slice(0, 40)));
  process.exit(1);
}

// 全仓报告（不失败）
const owners = new Map<string, Set<string>>();
for (const f of files) for (const t of literalsOf(f)) { if (!owners.has(t)) owners.set(t, new Set()); owners.get(t)!.add(path.relative(ROOT, f)); }
const dup = [...owners.entries()].filter(([, s]) => s.size > 1);
console.log(`duplicate-copy: PASS（content 外无重复书写；关节文案重复 0 条）；全仓其它跨文件重复 ${dup.length} 条（仅报告）`);
