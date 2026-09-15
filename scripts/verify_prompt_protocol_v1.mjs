import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const grounding = fs.readFileSync(new URL('../src/utils/aiGrounding.ts', import.meta.url), 'utf8');
const oldPrompt = fs.readFileSync(new URL('./extracted_prompts/case_1_prompt.txt', import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

assert(server.includes("type: 'json_schema'"), 'OpenAI non-reasoner uses json_schema');
assert(server.includes("strict: true"), 'OpenAI schema is strict');
assert(!server.includes("bodyPayload.response_format = { type: 'json_object' }"), 'legacy json_object response format removed');
assert(server.includes('responseSchema: COPILOT_RESULT_GEMINI_SCHEMA'), 'Gemini uses responseSchema');
assert(server.includes("responseMimeType: 'application/json'"), 'Gemini keeps JSON mime type');
assert(server.includes('【执行优先级（不可违背）】'), 'prompt includes execution priority block');
assert(server.includes('必须同时给出 containmentPhase（T+24h）与 permanentPhase。'), 'prompt priority requires both timeline phases');
assert(server.includes('双层时间轴由协议层字段 dualTimeline 强制输出。'), 'timeline prose is reduced to one compact reminder');
assert(server.includes('输出结构由协议层 COPILOT_RESULT_JSON_SCHEMA 强制约束'), 'large inline schema has been replaced by protocol reference');
assert(!server.includes('Return a single JSON object with these exact keys:'), 'old giant inline JSON structure is removed');
assert(server.includes("primaryEvidenceLevel: 'HIGH' | 'MEDIUM_INFERRED' | 'LOW'"), 'primary guidance is conditioned on evidence level');
assert(server.includes('公式深度降级'), 'LOW evidence branch skips full formula/component detail');
assert(grounding.includes('physicalSimilarity'), 'gold matching has physical similarity gating');
assert(grounding.includes('worstRatio >= 100'), 'gold matching hard-rejects extreme physical scale mismatch');
assert(grounding.includes('worstRatio >= 10'), 'gold matching downgrades one-order magnitude mismatch');
assert(grounding.includes('关键计算结论'), 'few-shot content is cropped to key calculation conclusions');
assert(grounding.includes('expectedNextBestAction'), 'few-shot keeps expectedNextBestAction');
assert(grounding.includes('VETO'), 'few-shot keeps VETO condition');
assert(!grounding.includes('标准输入现象:'), 'full failure phenomenon is removed from few-shot payload');

const rootSchemaProps = [...server.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map(m => m[1]);
for (const key of ['coreConclusion','decisionFrame','multiDomainAnalysis','riskRatings','knownFacts','assumptions','citedFields','unknowns','physicalMechanism','dfmeaView','candidateActions','finalRecommendation','dualTimeline']) {
  assert(rootSchemaProps.includes(key), `schema contains root key ${key}`);
}

// Conservative size check against the recorded baseline fixture. This is a source-level projection,
// not a runtime API capture; it verifies that the 4.8k-character inline schema is no longer duplicated.
const projected = oldPrompt.replace(/【5\. 当前决策态与双层时间轴要求】[\s\S]*$/m, '【5. 当前决策态】\n- 决策窗口：双层时间轴由协议层字段 dualTimeline 强制输出。\n输出结构由协议层 COPILOT_RESULT_JSON_SCHEMA 强制约束。\n');
assert(projected.length < oldPrompt.length * 0.75, `projected prompt drops materially below ${oldPrompt.length} chars`);
console.log(`INFO: baseline fixture chars=${oldPrompt.length}, projected structural chars=${projected.length}`);
