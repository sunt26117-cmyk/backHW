import fetch from 'node-fetch';
import { NEW_CROSS_DOMAIN_CASE_1, NEW_CROSS_DOMAIN_CASE_2 } from './test_user_cross_domain_cases';
import { AI_ANSWER_CASE_1, AI_ANSWER_CASE_2 } from './test_user_pipeline_execution';

async function testLiveEndpoint() {
  console.log('Testing live /api/copilot/analyze endpoint with customAiResponse for both cross-domain cases...');

  // Case 1
  const resp1 = await fetch('http://localhost:3000/api/copilot/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: NEW_CROSS_DOMAIN_CASE_1.context,
      issue: NEW_CROSS_DOMAIN_CASE_1.issue,
      customAiResponse: AI_ANSWER_CASE_1,
    }),
  });

  if (!resp1.ok) {
    throw new Error(`Case 1 failed: ${resp1.status} ${await resp1.text()}`);
  }

  const json1: any = await resp1.json();
  console.log(`✅ Case 1 API response OK!`);
  console.log(`- Source: ${json1.source}`);
  console.log(`- Problem: ${json1.data.coreConclusion.problemSummary.slice(0, 50)}...`);
  console.log(`- Audit Score: ${json1.data.aiAudit?.auditScore}/100, Status: ${json1.data.aiAudit?.overallStatus}`);
  console.log(`- AutoFixes: ${json1.data.aiAudit?.autoFixSummary?.length || 0}`);

  // Case 2
  const resp2 = await fetch('http://localhost:3000/api/copilot/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: NEW_CROSS_DOMAIN_CASE_2.context,
      issue: NEW_CROSS_DOMAIN_CASE_2.issue,
      customAiResponse: AI_ANSWER_CASE_2,
    }),
  });

  if (!resp2.ok) {
    throw new Error(`Case 2 failed: ${resp2.status} ${await resp2.text()}`);
  }

  const json2: any = await resp2.json();
  console.log(`✅ Case 2 API response OK!`);
  console.log(`- Source: ${json2.source}`);
  console.log(`- Problem: ${json2.data.coreConclusion.problemSummary.slice(0, 50)}...`);
  console.log(`- Audit Score: ${json2.data.aiAudit?.auditScore}/100, Status: ${json2.data.aiAudit?.overallStatus}`);
  console.log(`- AutoFixes: ${json2.data.aiAudit?.autoFixSummary?.length || 0}`);
}

testLiveEndpoint().catch(console.error);
