/**
 * 16 个黄金标准回归用例的无头（headless）校验，接入 npm test。
 *
 * 背景：DesignReviewRegressionView.tsx 的"运行全部 16 个回归测试"按钮已经改成真正调用
 * bldcPatternEngine / robotJointPatternEngine（见 engineeringGoldCases.ts 里 runEngineeringGoldCaseRegression
 * 的注释，记录了它之前是硬编码永远 PASS 的历史问题）。但那个校验只在浏览器里点按钮才跑，
 * 没有任何东西在 CI / `npm test` 里守住它——如果以后有人改坏了某个 Pattern 的触发条件，
 * 只有打开这个 Tab 肉眼看才会发现。这个脚本把同一个校验搬到命令行，纳入常规回归。
 *
 * 同时防两类"看起来在测、其实没测什么"的退化：
 *  1) 防止 ENGINEERING_GOLD_CASES 数组被误删到只剩几条（数量校验）；
 *  2) 防止 runEngineeringGoldCaseRegression 又退化回"永远原样抄 expectedPattern 当结果"
 *     （用一个刻意给错的 caseId 期望值验证它真的会 FAIL，而不是无条件 PASS）。
 */
import assert from 'node:assert/strict';
import { ENGINEERING_GOLD_CASES, runEngineeringGoldCaseRegression } from '../src/data/engineeringGoldCases';

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${label}`); }
  catch (err) { failures++; console.log(`  ✗ ${label}\n    ${(err as Error).message}`); }
}

console.log('\n=== 黄金标准回归用例 Case01~16：真实引擎触发结果必须命中预期模式 ===');

check('用例集合本身至少有 16 条（防止测试范围被悄悄清空）', () => {
  assert.ok(ENGINEERING_GOLD_CASES.length >= 16, `实际只有 ${ENGINEERING_GOLD_CASES.length} 条`);
});

for (const c of ENGINEERING_GOLD_CASES) {
  check(`${c.caseId} [${c.title}]：引擎实际触发结果包含预期模式 ${c.expectedPattern}`, () => {
    const r = runEngineeringGoldCaseRegression(c.caseId);
    assert.equal(r.status, 'PASS', `${r.summary}（实际触发：${r.triggeredPatterns.join('、') || '(无)'}）`);
    assert.ok(r.triggeredPatterns.includes(c.expectedPattern), `triggeredPatterns 未包含 ${c.expectedPattern}`);
    // calculatedValues 必须是引擎这次真算出来的东西，不能是空对象（空对象通常意味着没真正取到命中模式的输出）
    assert.ok(Object.keys(r.calculatedValues).length > 0, '引擎输出的 calculatedValues 为空，可能没有真正取到命中模式的物理量');
  });
}

check('反向验证：runEngineeringGoldCaseRegression 不是无条件 PASS —— 拿一个真实存在但明显错配的 case 会得到 FAIL', () => {
  // 构造一个"预期模式故意写错"的用例，直接调用同一份判定逻辑验证的核心比对（triggeredIds.includes(expectedPattern)）。
  // 用 Case02（BLDC 急停泵升，真实会触发 P001）但把 expectedPattern 偷换成一个它绝不会触发的 ID。
  const base = ENGINEERING_GOLD_CASES.find((c) => c.caseId === 'Case02')!;
  type GoldCase = (typeof ENGINEERING_GOLD_CASES)[number];
  // 故意写错的 expectedPattern 需要断言成合法模式 id 联合类型；这是"构造畸形用例"的固有代价，
  // 但判定逻辑仍然是调用真实函数，没有复制/重写。
  const spy = { ...base, caseId: '__spy__', expectedPattern: 'P099_不存在的模式' } as unknown as GoldCase;
  // 直接把 spy 用例塞进同一个数组末尾，跑一次真实函数（不复制/重写判定逻辑，避免"测试自己骗自己"）。
  const mutableCases = ENGINEERING_GOLD_CASES as unknown as GoldCase[];
  mutableCases.push(spy);
  try {
    const r = runEngineeringGoldCaseRegression('__spy__');
    assert.equal(r.status, 'FAIL', '预期模式故意写错时仍然 PASS，说明比对逻辑已经退化成无条件通过');
  } finally {
    mutableCases.pop();
  }
});

console.log(failures === 0 ? '\n16/16 黄金标准用例全部通过真实引擎校验' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
