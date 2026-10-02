const fs = require('fs');

const ai = fs.readFileSync('src/utils/aiProtocol.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');

const mustContain = [
  ['确定性事实层', '本地确定性事实——NON-NEGOTIABLE'],
  ['证据优先级', '当前实测/规格与项目输入 > 本地确定性计算及其 provenance'],
  ['UNKNOWN 约束', '缺失参数就是 UNKNOWN'],
  ['Gold Case 隔离', 'Gold Case 绝不是当前项目事实'],
  ['方案基线', '当前方案基线'],
  ['证据引用', 'citedFields'],
  ['T+24h', 'T+24h containmentPhase'],
  ['永久纠正', 'permanentPhase'],
];

for (const [name, text] of mustContain) {
  if (!ai.includes(text)) throw new Error(`AI prompt contract missing: ${name}`);
}

const forbiddenActualPrompt = [
  '直属硬件领导风格:',
  '你的使命是协助硬件开发工程师进行技术攻关、防身免责与跨部门推演。',
  '深度洞察直属领导处理风格与汽车跨部门博弈生态',
  '在每个方案中给出针对 HW Lead, PM, SW, System 的具体心理预期与防身策略。',
];
for (const text of forbiddenActualPrompt) {
  if (ai.includes(text) || server.includes(text)) {
    throw new Error(`Forbidden legacy AI prompt content remains: ${text}`);
  }
}

if ((server.match(/function buildAnalysisPrompt\(/g) || []).length !== 0) {
  throw new Error('server.ts must not contain a second local buildAnalysisPrompt implementation');
}
if (!server.includes("import { buildAnalysisPrompt, HARDWARE_CHIEF_SYSTEM_PROMPT } from './src/utils/aiProtocol';")) {
  throw new Error('server.ts is not using the shared AI prompt builder');
}
if (!ai.includes('calculatedOutputEvidence:')) {
  throw new Error('precomputed evidence is not attached to baseline analysisBasis');
}

console.log('AI prompt contract: PASS');
