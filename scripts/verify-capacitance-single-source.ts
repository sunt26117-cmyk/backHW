/**
 * 治理断言：电容 / 阈值取点的「单一来源」契约。
 *
 * 这里钉死三个此前真实存在的缺陷（都由真实器件复核发现）：
 *  1. Cgd 有两条链路各自解析 —— P003 让 Crss 曲线**压过**工程师实测值，确定性引擎则完全不看曲线，
 *     同一个器件会算出两个不同的米勒电流。现在两路共用 deviceCapacitance.resolveEffectiveCgdPf，
 *     优先级必须是：实测/导入 > Crss 曲线@工况Vbus > 规格直接 Cgd > Qgd 换算。
 *  2. Cgs 只能与 Ciss **同一个 Vds 点**相减（这里断言端到端结果；混点算法会得到 1764−Crss@13.5=1722.5）。
 *  3. Vth 必须取**最坏情况**（Vth 最低 = 结温最高），不能固定 25℃。
 *
 * 最关键的断言是 PATH_A_VS_PATH_B：同一个器件、同一份输入，pattern 层（P003）与确定性引擎层
 * （BLDC_MILLER_RISK）必须给出同一个感应峰值 / 同一个安全裕量 / 同一个 Vth 阈值。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { deriveBldcEvaluationInput } from '../src/utils/scenarioDerived';
import {
  resolveEffectiveCgdPf,
  resolveCgsPf,
  resolveWorstCaseVthMinV,
} from '../src/utils/deviceCapacitance';
import { extractUnifiedEngineeringModel } from '../src/utils/unifiedStateExtractor';
import { calculateBldcDeterministicCalculations } from '../src/utils/bldcDeterministicEngine';
import { evaluateP003 } from '../src/domains/bldc/patterns/P003';
import { createBldcPatternContext } from '../src/domains/bldc/context';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const eq = (name: string, got: unknown, expected: unknown) => {
  if (got !== expected) throw new Error(`${name}: got ${String(got)}, expected ${String(expected)}`);
};
const near = (name: string, got: unknown, expected: number, tol = 0.01) => {
  if (typeof got !== 'number' || !Number.isFinite(got) || Math.abs(got - expected) > tol) {
    throw new Error(`${name}: got ${String(got)}, expected ≈${expected} (±${tol})`);
  }
};
const pickNumber = (calculatedValues: Record<string, string | number>, needle: string): number => {
  const key = Object.keys(calculatedValues).find((k) => k.includes(needle));
  if (!key) throw new Error(`calculatedValues 里找不到包含「${needle}」的键`);
  const value = calculatedValues[key];
  if (typeof value !== 'number') throw new Error(`「${key}」不是数字：${String(value)}`);
  return value;
};
const makeIssue = (measuredValues: Record<string, unknown>) => ({
  issueCategories: ['BLDC Motor Drive'], requirement: '', actualMeasurement: '', testCondition: '',
  environment: '', failurePhenomenon: '', engineeringConcern: '', notes: '',
  measuredValues, measurementProvenance: {}, measuredValueSource: 'USER_MEASURED',
}) as any;

// ---------------------------------------------------------------- 夹具器件
// Crss 曲线：10V→45pF, 20V→35pF  ⇒ @13.5V = 41.5pF；同时给出 cgdDirect=30pF（优先级必须低于曲线）。
// Ciss：1764pF @15V  ⇒ 同点 Cgs = 1764 − Crss@15V(40) = 1724pF。
// Vth 曲线：25℃→1.45V, 175℃→0.7V；Tj_max=175℃ ⇒ 最坏情况取点 = 0.7V（不是 1.45V）。
const imported = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'CAP-SINGLE-SOURCE', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
  staticParams: { rdsOn: { value: 4.9 }, vth: { points: [{ x: 25, y: 1.45 }, { x: 175, y: 0.7 }] } },
  capacitanceParams: {
    ciss: { value: 1764, conditions: { vds: '15 V' } },
    crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] },
    cgdDirect: { value: 30 },
  },
}));
if (!imported.device) throw new Error(imported.error || 'device import failed');
const device = imported.device;
saveDevice(device);
const crssCurve = [{ x: 10, y: 45 }, { x: 20, y: 35 }];
const context = { selectedDeviceId: device.id, productType: '12V BLDC', projectPhase: 'DV' } as any;

// ------------------------------------------- 1) 解析器优先级（单一来源的唯一定义处）
near('优先级·曲线@13.5V', resolveEffectiveCgdPf({ device, vdsV: 13.5 }).value, 41.5);
eq('优先级·曲线来源', resolveEffectiveCgdPf({ device, vdsV: 13.5 }).from, 'CRSS_CURVE_AT_VBUS');
near('优先级·实测压过曲线(器件形态)', resolveEffectiveCgdPf({ measuredCgdPf: 115, device, vdsV: 13.5 }).value, 115);
eq('优先级·实测来源', resolveEffectiveCgdPf({ measuredCgdPf: 115, device, vdsV: 13.5 }).from, 'MEASURED_INPUT');
// path A 的调用形态（只有曲线、没有器件对象）必须与器件形态给出同一个数
near('优先级·实测压过曲线(P003形态)', resolveEffectiveCgdPf({ measuredCgdPf: 115, crssCurve, vdsV: 13.5 }).value, 115);
near('优先级·曲线两种形态一致', resolveEffectiveCgdPf({ crssCurve, vdsV: 13.5 }).value, 41.5);
near('优先级·Qgd 不得压过曲线', resolveEffectiveCgdPf({ device, vdsV: 13.5, qgdNc: 15 }).value, 41.5);
near('优先级·0pF 不是实测值(落到曲线)', resolveEffectiveCgdPf({ measuredCgdPf: 0, device, vdsV: 13.5 }).value, 41.5);
near('优先级·无曲线时用直接 Cgd', resolveEffectiveCgdPf({ measuredCgdPf: 0, device, vdsV: undefined }).value, 30);
near('优先级·最后才用 Qgd/12', resolveEffectiveCgdPf({ qgdNc: 15 }).value, 1250);
eq('优先级·全空 = NONE', resolveEffectiveCgdPf({}).from, 'NONE');
eq('优先级·全空无值', resolveEffectiveCgdPf({}).value, undefined);
// 同点 Cgs：15V 点的 Ciss − Crss = 1724（混点算法会得到 1764 − 41.5 = 1722.5）
near('Cgs 同点相减', resolveCgsPf(device).value, 1724);
eq('Cgs 同点来源', resolveCgsPf(device).from, 'CISS_MINUS_CRSS');
// Vth 最坏情况：175℃ 的 0.7V，而不是 25℃ 的 1.45V
near('Vth 最坏高温点', resolveWorstCaseVthMinV({ providedVthMinV: 1.45, device }).value, 0.7);
eq('Vth 取点温度', resolveWorstCaseVthMinV({ providedVthMinV: 1.45, device }).tjC, 175);
near('Vth 无标量时用曲线@高温', resolveWorstCaseVthMinV({ device }).value, 0.7);

// ------------------------------------------- 2) path A（scenarioDerived→P003）端到端
const baseValues = { busVoltageNominalV: 13.5, dvdtVns: 8.0, rgOffOhm: 2.2, vthMinV: 1.45 };
const derived = deriveBldcEvaluationInput(context, makeIssue(baseValues));
near('pathA·Cgd 取曲线@13.5V', derived.cgdPf, 41.5);
eq('pathA·Cgd 来源=DATASHEET', derived.traceSources?.cgdPf, 'DATASHEET');
near('pathA·Cgs 同点派生', derived.cgsPf, 1724);
if (!String(derived.cgdResolutionNote || '').includes('13.5')) {
  throw new Error('pathA·Cgd 取点说明未包含取点电压：' + String(derived.cgdResolutionNote));
}
// 实测 Cgd 必须压过器件曲线（此前会被曲线顶掉 —— 这是 Fix 1 的核心缺陷）
const derivedMeasured = deriveBldcEvaluationInput(context, makeIssue({ ...baseValues, cgdPf: 115 }));
near('pathA·实测 Cgd 不被曲线覆盖', derivedMeasured.cgdPf, 115);
if (derivedMeasured.traceSources?.cgdPf === 'DATASHEET') {
  throw new Error('pathA·实测 Cgd 被判成 DATASHEET（说明曲线又压过了实测）');
}

// ------------------------------------------- 3) 关键：path A 与 path B 必须算出同一套数
const issue = makeIssue(baseValues);
const state = extractUnifiedEngineeringModel(context, issue);
const evidence = calculateBldcDeterministicCalculations(issue, state, context);
const miller = evidence.find((item) => item.id === 'BLDC_MILLER_RISK');
if (!miller) throw new Error('pathB·未产出 BLDC_MILLER_RISK');
eq('pathB·状态=CALCULATED(器件曲线可满足 Cgd)', miller.status, 'CALCULATED');
eq('pathB·Cgd 来源=DATASHEET', miller.inputSources.cgdPf, 'DATASHEET');
eq('pathB·Cgs 来源=DERIVED(同点相减)', miller.inputSources.cgsPf, 'DERIVED');
eq('pathB·Vth 来源=DATASHEET(用到高温曲线)', miller.inputSources.vthMinV, 'DATASHEET');
eq('pathB·Vbus 来源=USER_MEASURED', miller.inputSources.busVoltageNominalV, 'USER_MEASURED');
near('pathB·Vth 阈值=最坏高温点', miller.specThreshold, 0.7);

const p003 = evaluateP003(derived, createBldcPatternContext(derived));
const p003Total = pickNumber(p003.calculatedValues, '判据取用值');
const p003Margin = pickNumber(p003.calculatedValues, '门极安全裕量');
const p003Vth = pickNumber(p003.calculatedValues, 'Vth_min');
// 阻性界 = 41.5pF·8V/ns·2.2Ω = 0.7304V；容性界 = 41.5/(41.5+1724)·13.5 = 0.3173V ⇒ 取较小者 0.32V
near('pathA·P003 感应峰值=两界较小者', p003Total, 0.32);
near('PATH_A_VS_PATH_B·感应峰值必须一致', miller.value!, p003Total);
near('PATH_A_VS_PATH_B·安全裕量必须一致', miller.safetyMargin!, p003Margin);
near('PATH_A_VS_PATH_B·Vth 阈值必须一致', miller.specThreshold!, p003Vth);
near('pathB·感应峰值', miller.value!, 0.32);

// 无实测 Vth 时，两条路仍必须取 0.7V（高温曲线点），而不是 25℃ 的 1.45V
const noVthIssue = makeIssue({ busVoltageNominalV: 13.5, dvdtVns: 8.0, rgOffOhm: 2.2 });
const noVthDerived = deriveBldcEvaluationInput(context, noVthIssue);
eq('pathA·无实测 Vth 仍取曲线', pickNumber(evaluateP003(noVthDerived, createBldcPatternContext(noVthDerived)).calculatedValues, 'Vth_min'), 0.7);
const noVthMiller = calculateBldcDeterministicCalculations(
  noVthIssue, extractUnifiedEngineeringModel(context, noVthIssue), context,
).find((item) => item.id === 'BLDC_MILLER_RISK')!;
eq('pathB·无实测 Vth 仍可计算(器件曲线等效)', noVthMiller.status, 'CALCULATED');
eq('pathB·无实测 Vth 来源=DATASHEET', noVthMiller.inputSources.vthMinV, 'DATASHEET');
near('pathB·无实测 Vth 仍取曲线', noVthMiller.specThreshold, 0.7);

// ------------------------------------------- 4) 无曲线器件：两路都只能落到 Qgd/12 换算
const qgdOnly = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'CAP-QGD-ONLY', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
  staticParams: { vth: { points: [{ x: 25, y: 1.45 }, { x: 175, y: 0.7 }] } },
}));
if (!qgdOnly.device) throw new Error(qgdOnly.error || 'qgd-only device import failed');
saveDevice(qgdOnly.device);
const qgdContext = { selectedDeviceId: qgdOnly.device.id, productType: '12V BLDC', projectPhase: 'DV' } as any;
const qgdIssue = makeIssue({ busVoltageNominalV: 13.5, dvdtVns: 8.0, rgOffOhm: 2.2, vthMinV: 1.45, qgdNc: 15 });
const qgdDerived = deriveBldcEvaluationInput(qgdContext, qgdIssue);
near('pathA·Qgd 换算 Cgd', qgdDerived.cgdPf, 1250);
eq('pathA·Qgd 换算来源=DERIVED', qgdDerived.traceSources?.cgdPf, 'DERIVED');
const qgdMiller = calculateBldcDeterministicCalculations(
  qgdIssue, extractUnifiedEngineeringModel(qgdContext, qgdIssue), qgdContext,
).find((item) => item.id === 'BLDC_MILLER_RISK')!;
eq('pathB·Qgd 换算来源=DERIVED', qgdMiller.inputSources.cgdPf, 'DERIVED');
eq('pathB·无 Cgs 时为阻性上界', qgdMiller.inputSources.cgsPf, undefined);
// 无 Cgs ⇒ 只用阻性界：1250pF·8V/ns·2.2Ω = 22.0V
near('pathB·阻性上界数值', qgdMiller.value!, 22.0);
near('PATH_A_VS_PATH_B·无 Cgs 时也必须一致', qgdMiller.value!,
  pickNumber(evaluateP003(qgdDerived, createBldcPatternContext(qgdDerived)).calculatedValues, '判据取用值'));

console.log('capacitance-single-source: PASS');
