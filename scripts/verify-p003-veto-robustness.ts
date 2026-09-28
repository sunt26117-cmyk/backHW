/**
 * P003 米勒误导通：假设的母线电压不得悄悄把结论拉向"更安全"。
 *
 * 真实复现过的问题：checkMillerRisk 取 min(阻性界, 容性界)。容性界 = Cgd/(Cgd+Cgs)·Vbus 依赖母线电压，
 * 当 Vbus 只是缺省假设值时，这个未经确认的数会把不依赖任何假设的阻性界"拉低"（Case03 里 2.15V→1.7V），
 * 结论被推向安全侧。修复放在物理层：V_bus_is_assumed=true 时容性界只展示、不参与取用值。
 * 注意：不改 patternPolicy 的"含假设输入一律不出 VETO"硬规则（verify-pattern-policy.cjs 守着它）。
 * 因此一个"必须 VETO"的用例必须提供实测母线电压——Case03 已补 busVoltageNominalV。
 */
import assert from 'node:assert/strict';
import { ENGINEERING_GOLD_CASES, runEngineeringGoldCaseRegression } from '../src/data/engineeringGoldCases';
import { checkMillerRisk } from '../src/physics/miller';

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${label}`); }
  catch (err) { failures++; console.log(`  ✗ ${label}\n    ${(err as Error).message}`); }
}
const base = { V_th_min: 2, C_gd_pF: 10, C_gs_pF: 10, R_g_pulldown_ohm: 10, dv_dt_V_per_ns: 50, V_bus_V: 6 };

console.log('\n=== 米勒物理层：假设的 Vbus 不得压低判据取用值 ===');
check('Vbus 可信：取两界较小值（阻性5V、容性3V → 取3V），行为与原来一致', () => {
  const r = checkMillerRisk({ ...base });
  assert.equal(r.vGateInducedV, 3);
  assert.equal(r.capacitiveBoundSuppressedByAssumedVbus, false);
});
check('Vbus 是假设值：容性界仍返回展示(3V)，但取用值退回阻性界(5V)，并标记被抑制', () => {
  const r = checkMillerRisk({ ...base, V_bus_is_assumed: true });
  assert.equal(r.vGateInducedCapacitiveV, 3);
  assert.equal(r.vGateInducedV, 5);
  assert.equal(r.capacitiveBoundSuppressedByAssumedVbus, true);
});
check('未提供 Cgs/Vbus（本来就没有容性界）时，V_bus_is_assumed 不产生任何影响', () => {
  const r = checkMillerRisk({ V_th_min: 2, C_gd_pF: 10, R_g_pulldown_ohm: 10, dv_dt_V_per_ns: 50, V_bus_is_assumed: true });
  assert.equal(r.vGateInducedV, 5);
  assert.equal(r.capacitiveBoundSuppressedByAssumedVbus, false);
});
check('实测 Vgs 尖峰优先级不变：有实测时仍以实测为准', () => {
  const r = checkMillerRisk({ ...base, V_bus_is_assumed: true, V_gs_measured_V: 1.2 });
  assert.equal(r.vGateInducedV, 1.2);
});

console.log('\n=== Case03：证据充分时必须 VETO；Case13 与引擎判定一致 ===');
check('Case03（必须一票否决）：已提供实测母线电压，引擎必须给出 VETO', () => {
  const r = runEngineeringGoldCaseRegression('Case03');
  assert.equal(r.vetoTriggered, true);
  assert.equal(r.status, 'PASS');
});
check('黄金用例 PASS 现在同时要求 VETO 与预期一致：16 个用例逐个核对', () => {
  for (const c of ENGINEERING_GOLD_CASES) {
    const r = runEngineeringGoldCaseRegression(c.caseId);
    assert.equal(r.vetoTriggered, c.expectedVeto, `${c.caseId} VETO 不一致：预期 ${c.expectedVeto}，实际 ${r.vetoTriggered}`);
    assert.equal(r.status, 'PASS', `${c.caseId}: ${r.summary}`);
  }
});
check('反向验证：把 Case03 的 expectedVeto 故意改错，status 必须变 FAIL（VETO 校验没有退化成摆设）', () => {
  const c = ENGINEERING_GOLD_CASES.find((x) => x.caseId === 'Case03')!;
  const original = c.expectedVeto;
  (c as { expectedVeto: boolean }).expectedVeto = !original;
  try { assert.equal(runEngineeringGoldCaseRegression('Case03').status, 'FAIL'); }
  finally { (c as { expectedVeto: boolean }).expectedVeto = original; }
});
check('通用硬规则未动：含假设输入的结论仍不出 VETO（Case07 不含 VETO_ROBUST 之类例外状态）', () => {
  const s = String(runEngineeringGoldCaseRegression('Case07').calculatedValues['分析状态'] || '');
  assert.ok(!s.includes('ROBUST'));
});
console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
