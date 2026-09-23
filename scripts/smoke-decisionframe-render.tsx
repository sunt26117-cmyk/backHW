/**
 * 渲染层冒烟测试：外部 JSON（AI 回灌 / 离线导入 / 手工编辑）带来的畸形 decisionFrame
 * 不得让结果页白屏。
 *
 * 现场故障：result.decisionFrame.reversalCriteria 被写成字符串后，
 * FirstScreen10sView 里 `.slice(0, 2).join('；')` 抛
 *   TypeError: i.decisionFrame.reversalCriteria.slice(...).join is not a function
 * 整个 React 树崩溃 -> 用户看到白屏。
 *
 * 这个脚本用 react-dom/server 真的把组件渲染一遍（不是只测函数），
 * 保证「边界归一化 + 视图兜底」这套防线端到端有效。
 *
 * 用法：npm run test:render（已并入 npm test）
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert/strict';
import { FirstScreen10sView } from '../src/components/FirstScreen10sView';
import { runExpertAnalysis } from '../src/data/expertEngine';
import type { IssueInput, ProjectContext } from '../src/types';

const context = {
  projectName: 'BLDC-48V 电动水泵', projectPhase: 'EVT', customer: 'OEM', ecuType: 'BLDC Controller',
  asilLevel: 'QM', sopDate: '2026-06-30', nextMilestone: 'DV 台架', daysRemaining: 21,
} as ProjectContext;

const issue = {
  issueCategories: ['BLDC Motor Drive'], failurePhenomenon: '急停时母线电压泵升导致 MOSFET 过压',
  requirement: '母线尖峰 < 60V', testCondition: '48V 母线 / 3000rpm / 急停', actualMeasurement: '母线峰值 62.4V',
  engineeringConcern: '急停回馈能量泄放不足', notes: '',
  measuredValues: { busVoltageNominalV: 48, phaseCurrentPeakA: 30, rotorInertiaKgm2: 1.2e-5, cbusUf: 470, harnessLengthM: 1.8 },
} as unknown as IssueInput;

const base = runExpertAnalysis(context, issue);

// 把三个 string[] 字段都砸成**字符串**（模拟模型把数组拍平成一个句子）
const malformed = {
  ...base,
  analysisBasis: { ...(base.analysisBasis || {}), calculatedOutputEvidence: '整段证据被拍平成一个字符串' },
  multiDomainAnalysis: { ...(base.multiDomainAnalysis || {}), domainAssessments: '整段域评估被拍平成一个字符串' },
  decisionFrame: {
    decisionQuestion: '是否放行 DV',
    currentDecisionGate: 'DV 台架',
    decisionWindow: '剩余 21 天',
    bestNextAction: '先补测急停母线尖峰',
    minimumEvidenceToProceed: '至少要有一条实测证据',
    unknownsBlockingDecision: '母线峰值实测尚未复现',
    reversalCriteria: '母线峰值超过 60V；dv/dt 超过 30V/ns',
  },
} as unknown as typeof base;

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log('  ✓ ' + label); }
  catch (err) { failures++; console.log('  ✗ ' + label); console.log('    ' + (err as Error).message); }
}

console.log('\n=== 渲染层冒烟：畸形 decisionFrame 不得白屏 ===');

check('旧代码写法确实会崩（证明这个回归测试是有效的，不是空转）', () => {
  assert.throws(() => (('母线峰值超过 60V') as unknown as string[]).slice(0, 2).join('；'), TypeError);
});

check('FirstScreen10sView 渲染畸形 decisionFrame 不抛错，且字符串内容仍展示', () => {
  const html = renderToString(
    React.createElement(FirstScreen10sView, { context, issue, result: malformed, onNavigateTab: () => {} }),
  );
  assert.equal(html.includes('母线峰值超过 60V'), true, '反转条件应仍被渲染出来');
  assert.equal(html.includes('母线峰值实测尚未复现'), true, '阻塞未知量应仍被渲染出来');
});

check('FirstScreen10sView 渲染完全合规的 decisionFrame 不受影响', () => {
  const html = renderToString(
    React.createElement(FirstScreen10sView, { context, issue, result: base, onNavigateTab: () => {} }),
  );
  assert.equal(html.length > 500, true);
});

if (failures > 0) { console.log('\n渲染层冒烟测试失败 ' + failures + ' 条'); process.exit(1); }
console.log('\n全部通过');
