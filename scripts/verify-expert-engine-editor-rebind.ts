/**
 * 回归守护：runExpertAnalysis 的语义编辑器必须在 applyScenarioDynamicLayer 之后重新绑定。
 *
 * 背景（真实安全缺陷）：applyScenarioDynamicLayer 用 structuredClone 返回**新对象**，
 * 而语义编辑器仍指向旧对象 —— 换对象之后的所有写入都落在被丢弃的旧对象上：
 *   - 结果顶层 source / provenance 丢失（界面上就无法区分"本地确定性规则"与"AI 推断"）；
 *   - bldc-stall-restart 的「Option C 纯临时缓解」本该 rejection_veto: true + SAFETY_GOAL_BREACH，
 *     实际变成 false —— "只做临时缓解"的方案不再被拦。
 * 该缺陷现有治理脚本发现不了：它们只做静态源码检查，不看运行时结果。
 *
 * 探针说明：编辑器的 metadata 是 adapter 用 defineProperty 建的视图，
 * metadata.provenance → result.provenance，metadata.source → result.source（顶层），
 * 因此这里断言的是顶层字段。
 */
import assert from 'node:assert/strict';
import { PRESET_SCENARIOS } from '../src/data/presetScenarios';
import { runExpertAnalysis } from '../src/data/expertEngine';

function run(id: string): any {
  const s = PRESET_SCENARIOS.find((x) => x.id === id);
  assert.ok(s, 'preset not found: ' + id);
  const issue = { ...s!.issue, measuredValueSource: (s!.issue as any).measuredValueSource || 'BENCHMARK' };
  return runExpertAnalysis(s!.context, issue);
}

for (const id of ['bldc-stall-restart', 'robot-joint-backlash-sto']) {
  const r = run(id);
  assert.equal(r.source, 'deterministic-expert', id + '：顶层 source 丢失（编辑器仍绑定在旧对象上）');
  assert.ok(r.provenance, id + '：顶层 provenance 丢失（编辑器仍绑定在旧对象上）');
  assert.equal(r.provenance.isAiInferred, false, id + '：本地规则结果不得被标为 AI 推断');
  assert.equal(r.provenance.isDeterministicRule, true, id + '：本地规则结果必须标记为确定性规则');
}

const bldc = run('bldc-stall-restart');
const optionC = (bldc.candidateActions || []).find((a: any) => a.id === 'Option C');
assert.ok(optionC, 'bldc-stall-restart 缺少 Option C');
assert.equal(optionC.veto?.rejection_veto, true, 'Option C（纯临时缓解）必须被否决：rejection_veto 应为 true');
assert.equal(optionC.veto?.veto_type, 'SAFETY_GOAL_BREACH', 'Option C 的否决类型必须是 SAFETY_GOAL_BREACH');
assert.ok(String(optionC.veto?.veto_reason || '').trim().length > 0, 'Option C 的否决必须带理由');

console.log('expert-engine editor rebind: PASS（顶层 source / provenance 与动态 VETO 均未被 structuredClone 吞掉）');
