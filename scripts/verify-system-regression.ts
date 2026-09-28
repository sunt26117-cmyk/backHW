/**
 * 系统回归中心的 headless CI 校验。
 * 与 UI 中的 R01~R08 使用同一份 systemRegressionCases.ts，防止“页面能跑、CI 不测”。
 */
import assert from 'node:assert/strict';
import { SYSTEM_REGRESSION_CASES, runSystemRegressionCase } from '../src/data/systemRegressionCases';

let failures = 0;

console.log('\n=== System Regression Center：R01~R08 ===');
for (const c of SYSTEM_REGRESSION_CASES) {
  const r = runSystemRegressionCase(c.id);
  try {
    assert.equal(r.status, 'PASS', `${c.id} ${c.title}: ${r.summary}`);
    console.log(`  ✓ ${c.id} ${c.title}`);
  } catch (err) {
    failures += 1;
    console.log(`  ✗ ${c.id} ${c.title}\n    ${(err as Error).message}`);
  }
}

console.log(
  failures === 0
    ? `\n${SYSTEM_REGRESSION_CASES.length}/${SYSTEM_REGRESSION_CASES.length} 系统回归全部通过`
    : `\n${failures} 项系统回归失败`,
);
process.exit(failures === 0 ? 0 : 1);
