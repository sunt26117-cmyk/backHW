import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { NEW_CROSS_DOMAIN_CASE_1, NEW_CROSS_DOMAIN_CASE_2 } from './test_user_cross_domain_cases';

async function extractPromptForCase(caseNumber: number, testCase: any) {
  console.log(`\n========================================================================`);
  console.log(`🚀 开始提取 Case ${caseNumber}: ${testCase.context.projectName}`);
  console.log(`========================================================================`);

  // 发送分析请求，使用模拟的 custom LLM 或通过 inspect 接口
  // 注意：在没有配置真实外部 key 的情况下，analyze 接口会调用本地规则，但 debugSnapshot.fullPrompt 会完整组装生成！
  const resp = await fetch('http://localhost:3000/api/copilot/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: testCase.context,
      issue: testCase.issue,
      modelConfig: {
        enabled: false, // 提取完整提示词与基线
        provider: 'builtin',
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`API Error: ${resp.status} ${await resp.text()}`);
  }

  const payload: any = await resp.json();
  const debugSnapshot = payload.data?.debugSnapshot || payload.debugSnapshot;

  console.log(`✅ 成功获取软件输出给 AI 的 Prompt:`);
  console.log(`- 提示词总字符数: ${debugSnapshot?.promptLength}`);
  console.log(`- 预计算事实条数: ${debugSnapshot?.precomputedFactsCount}`);

  const outputDir = path.join(process.cwd(), 'scripts', 'extracted_prompts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const promptFilePath = path.join(outputDir, `case_${caseNumber}_prompt.txt`);
  fs.writeFileSync(promptFilePath, debugSnapshot?.fullPrompt || 'PROMPT_NOT_FOUND', 'utf-8');
  console.log(`💾 软件输出给 AI 的完整内容已保存至: ${promptFilePath}`);

  return {
    fullPrompt: debugSnapshot?.fullPrompt,
    baseline: payload.data,
  };
}

async function main() {
  const c1 = await extractPromptForCase(1, NEW_CROSS_DOMAIN_CASE_1);
  const c2 = await extractPromptForCase(2, NEW_CROSS_DOMAIN_CASE_2);
  console.log('\n🎉 两组新跨域案例的 AI Prompt 提取完成！');
}

main().catch(console.error);
