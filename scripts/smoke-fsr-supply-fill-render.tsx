/**
 * 渲染层冒烟：二供 / PCN 页新增的「从器件库一键填入」必须真的渲染出来，且器件下拉来自器件库。
 *
 * 纯逻辑（一键填入的取值）已由 verify-supply-pair-and-qg-alias.ts 覆盖；这里只保证 UI 层：
 *  1. 组件渲染不抛错（白屏回归）；
 *  2. 两个器件下拉真的列出了器件库里的料号；
 *  3. 一供默认跟随当前绑定器件（否则会填错器件，比不填更危险）。
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert/strict';
import { FunctionalSafetyReliabilityView } from '../src/components/FunctionalSafetyReliabilityView';
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { runExpertAnalysis } from '../src/data/expertEngine';
import type { IssueInput, ProjectContext } from '../src/types';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const imported = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'FSR-SMOKE-MOSFET', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
  staticParams: { rdsOn: { value: 4.9 } },
  gateCharge: { qg: { value: 26 } },
  thermalParams: { rthJc: { value: 2.14 } },
  bodyDiode: { qrr: { value: 17 } },
}));
if (!imported.device) throw new Error(imported.error || 'device import failed');
saveDevice(imported.device);

const context = {
  projectName: 'BLDC-12V 电动水泵', projectPhase: 'DV', customer: 'OEM', ecuType: 'BLDC Controller',
  asilLevel: 'QM', sopDate: '2026-06-30', nextMilestone: 'DV 台架', daysRemaining: 21,
  selectedDeviceId: imported.device.id,
} as unknown as ProjectContext;

const issue = {
  issueCategories: ['Component Alternative'], failurePhenomenon: '二供 MOSFET 替代评估',
  requirement: '二供 Rds(on) 不得超过一供 10%', testCondition: '25℃ / 10A',
  actualMeasurement: '', engineeringConcern: 'Qgd/Qg 比值差异可能改变米勒风险', notes: '',
  measuredValues: { primaryRdsOnMilliOhm: 4.9, secondaryRdsOnMilliOhm: 6.2 },
} as unknown as IssueInput;

const result = runExpertAnalysis(context, issue);
const html = renderToString(
  React.createElement(FunctionalSafetyReliabilityView, {
    context,
    issue,
    result,
    onApplyMeasuredValues: () => undefined,
    initialSubTab: 'SECOND_SOURCE_PCN',
  }),
);

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log('  ✓ ' + label); }
  catch (err) { failures++; console.log('  ✗ ' + label); console.log('    ' + (err as Error).message); }
}

console.log('\n=== 渲染冒烟：二供页「从器件库填入」===');

check('组件渲染不抛错（不白屏）', () => {
  assert.ok(html.length > 500, '渲染结果过短，可能没渲染出内容');
});
check('一键填入按钮渲染出来', () => {
  assert.ok(html.includes('从器件库填入'), '找不到「从器件库填入」按钮');
});
check('两个器件下拉都列出器件库料号', () => {
  const hits = html.split('FSR-SMOKE-MOSFET').length - 1;
  assert.ok(hits >= 2, `料号在下拉里出现 ${hits} 次，应至少 2 次（一供 + 二供两个 select）`);
});
check('一供默认选中当前绑定器件（防填错器件）', () => {
  assert.ok(html.includes('（当前器件）'), '一供下拉未标记当前绑定器件');
});
check('一供/二供八个单元格都在', () => {
  for (const label of ['一供 Rds(on)', '二供 Rds(on)', '一供 Qg', '二供 Qg', '一供 Qrr', '二供 Qrr', '一供 Rth(j-c)', '二供 Rth(j-c)']) {
    assert.ok(html.includes(label), `找不到单元格 ${label}`);
  }
});

if (failures > 0) {
  console.error(`\n有 ${failures} 项渲染冒烟未通过`);
  process.exit(1);
}
console.log('fsr-supply-fill-render: PASS');
