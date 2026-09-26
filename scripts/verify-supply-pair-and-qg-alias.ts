/**
 * 治理断言：Qg 双 key 别名 + 器件库一键填入（一供 / 二供）。
 *
 * 1. Qg 有两个 key —— DEVICE_SPEC 的 gateChargeQgNc 与 COMPONENT 的 qgNc，是**同一个物理量**。
 *    此前互不相干：工程师在 COMPONENT 填的 Qg 永远进不了 P012 自举判据（它读 gateChargeQgNc），
 *    而 powerStage.qgNc 又只认 qgNc。这里钉死「谁填了都算填了，且优先于器件规格」。
 * 2. 一供/二供 8 个字段过去必须手抄（「不和规格书提取的参数关联，还要自己填写吗?」）。
 *    现在由 deviceSupplyPair.buildSupplyPairFill 从器件库填，rawPath 一律查 MOSFET_FIELD_TABLE，
 *    不得出现第三份 rawPath 副本。规格书给不了的量（实测项）绝不能被凭空填上。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { buildSupplyPairFill, readDeviceScalarAtTj, rawPathForTargetKey, MEASURED_ONLY_COMPONENT_FIELDS } from '../src/utils/deviceSupplyPair';
import { buildDeviceParameterCandidates } from '../src/utils/deviceParameterCandidates';
import { DEVICE_SPEC_FIELDS } from '../src/utils/deviceSpecificationSchema';
import { deriveBldcEvaluationInput } from '../src/utils/scenarioDerived';
import { extractUnifiedEngineeringModel } from '../src/utils/unifiedStateExtractor';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const eq = (name: string, got: unknown, expected: unknown) => {
  if (got !== expected) throw new Error(`${name}: got ${String(got)}, expected ${String(expected)}`);
};
const ok_ = (cond: boolean, message: string) => { if (!cond) throw new Error(message); };
const near = (name: string, got: unknown, expected: number, tol = 1e-9) => {
  if (typeof got !== 'number' || !Number.isFinite(got) || Math.abs(got - expected) > tol) {
    throw new Error(`${name}: got ${String(got)}, expected ≈${expected}`);
  }
};
const makeIssue = (measuredValues: Record<string, unknown>) => ({
  issueCategories: ['BLDC Motor Drive'], requirement: '', actualMeasurement: '', testCondition: '',
  environment: '', failurePhenomenon: '', engineeringConcern: '', notes: '',
  measuredValues, measurementProvenance: {}, measuredValueSource: 'USER_MEASURED',
}) as any;

const mosfet = (partNumber: string, extra: Record<string, unknown>) => {
  const imported = importDeviceFromJson(JSON.stringify({
    deviceType: 'MOSFET', manufacturer: 'T', package: 'QFN',
    maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
    ...extra,
    partNumber,
  }));
  if (!imported.device) throw new Error(imported.error || `${partNumber} import failed`);
  saveDevice(imported.device);
  return imported.device;
};

const primary = mosfet('SUPPLY-PRIMARY', {
  staticParams: { rdsOn: { value: 4.9 }, vth: { points: [{ x: 25, y: 1.45 }, { x: 175, y: 0.7 }], variants: [{ value: 2.1, unit: 'V', stat: 'MAX' }] } },
  gateCharge: { qg: { value: 26 }, qgd: { value: 12 } },
  thermalParams: { rthJc: { value: 2.14 } },
  bodyDiode: { qrr: { value: 17 } },
});
const secondary = mosfet('SUPPLY-SECONDARY', {
  staticParams: { rdsOn: { value: 6.2 } },
  gateCharge: { qg: { value: 30 }, qgd: { value: 14 } },
  thermalParams: { rthJc: { value: 2.5 } },
  bodyDiode: { qrr: { value: 20 } },
});
const curveOnly = mosfet('SUPPLY-CURVE-ONLY', {
  staticParams: { rdsOn: { value: null, points: [{ x: 25, y: 6 }, { x: 125, y: 11 }, { x: 175, y: 15 }] } },
});
const ctx = (deviceId?: string) => ({ selectedDeviceId: deviceId, productType: '12V BLDC', projectPhase: 'DV' }) as any;

// ----------------------------------------------------- 1) Qg 双 key 别名
const qgFromComponentKey = deriveBldcEvaluationInput(ctx(primary.id), makeIssue({ busVoltageNominalV: 13.5, qgNc: 52 }));
near('别名·COMPONENT 的 qgNc 必须被 P012 用到', qgFromComponentKey.gateChargeQgNc, 52);
// Trace 词表把 USER_MEASURED 映射为 MEASURED；关键是它认得 qgNc 这个别名而非退化成 DATASHEET
eq('别名·来源按实际填写的 key 标注', qgFromComponentKey.traceSources?.gateChargeQgNc, 'MEASURED');
const qgFromDeviceKey = deriveBldcEvaluationInput(ctx(primary.id), makeIssue({ busVoltageNominalV: 13.5, gateChargeQgNc: 26 }));
near('别名·DEVICE_SPEC 的 gateChargeQgNc 照旧', qgFromDeviceKey.gateChargeQgNc, 26);
const qgFromDevice = deriveBldcEvaluationInput(ctx(primary.id), makeIssue({ busVoltageNominalV: 13.5 }));
near('别名·两边都没填才回落到器件规格', qgFromDevice.gateChargeQgNc, 26);
eq('别名·器件规格来源=DATASHEET', qgFromDevice.traceSources?.gateChargeQgNc, 'DATASHEET');
near('别名·统一状态 powerStage.qgNc 认 DEVICE_SPEC 的 key',
  extractUnifiedEngineeringModel(ctx(primary.id), makeIssue({ gateChargeQgNc: 33 })).powerStage.qgNc, 33);
near('别名·统一状态 powerStage.qgNc 认 COMPONENT 的 key',
  extractUnifiedEngineeringModel(ctx(primary.id), makeIssue({ qgNc: 52 })).powerStage.qgNc, 52);

// ----------------------------------------------------- 2) 器件库一键填入
// rawPath 必须来自器件字段表（不得出现第三份副本）
eq('映射单一来源·rdsOn', rawPathForTargetKey('rdsOnMilliOhm'), 'staticParams.rdsOn');
eq('映射单一来源·qg', rawPathForTargetKey('gateChargeQgNc'), 'gateCharge.qg');
eq('映射单一来源·qrr', rawPathForTargetKey('qrrNc'), 'bodyDiode.qrr');
eq('映射单一来源·rthJc', rawPathForTargetKey('rthJcCPerW'), 'thermalParams.rthJc');
eq('映射单一来源·vds', rawPathForTargetKey('vdsRatingV'), 'maxRatings.vds');

const fill = buildSupplyPairFill(primary, secondary);
const expectedPairs: Array<[string, number | string]> = [
  ['primaryRdsOnMilliOhm', 4.9], ['secondaryRdsOnMilliOhm', 6.2],
  ['primaryQgNc', 26], ['secondaryQgNc', 30],
  ['primaryQrrNc', 17], ['secondaryQrrNc', 20],
  ['primaryRthJcCPerW', 2.14], ['secondaryRthJcCPerW', 2.5],
  // COMPONENT 页里属于当前器件的字段也一并继承
  ['rdsOnMilliOhm', 4.9], ['qgNc', 26], ['qgdNc', 12], ['vdsRatingV', 40],
  // VGS(th) 最小/最大都要带出来（datasheet 给 min/typ/max；125℃ 插值 = 1.45 + (0.7-1.45)*100/150 = 0.95）
  ['vthMinV', 0.95], ['vthMaxV', 2.1],
  // 文本字段：器件型号取二供（PCN/替代目标器件），供应商取同一颗的制造商
  ['componentPartNumber', 'SUPPLY-SECONDARY'], ['supplierName', 'T'],
];
for (const [key, value] of expectedPairs) {
  // 文本字段（器件型号/供应商）用相等比较，数值字段用容差比较
  if (typeof value === 'string') eq(`一键填入·${key}`, fill.values[key], value);
  else near(`一键填入·${key}`, fill.values[key], value);
}
eq('一键填入·项数', Object.keys(fill.values).length, expectedPairs.length);
eq('一键填入·无缺失', fill.missing.length, 0);
for (const key of Object.keys(fill.values)) eq(`一键填入·${key} 来源=DATASHEET`, fill.sources[key], 'DATASHEET');
for (const measuredOnly of MEASURED_ONLY_COMPONENT_FIELDS) {
  eq(`一键填入·实测项 ${measuredOnly} 不得被凭空填`, fill.values[measuredOnly], undefined);
}

// 只选一供、未选二供：二供 4 项必须进 missing，且不得写出任何 secondary* 键
const oneSide = buildSupplyPairFill(primary, undefined);
eq('一键填入·缺二供时的缺失项数', oneSide.missing.filter((m) => m.includes('二供')).length, 4);
eq('一键填入·缺二供时不得写 secondary* 键', Object.keys(oneSide.values).some((k) => k.startsWith('secondary')), false);
near('一键填入·一供仍照常填', oneSide.values.primaryQgNc, 26);

// 规格只给 Rds(on) 曲线（无标量）：取 125℃ 曲线点，并在 note 里写明取点
eq('曲线回落·取点温度来源', readDeviceScalarAtTj(curveOnly, 'rdsOnMilliOhm').from, 'CURVE_AT_TJ');
near('曲线回落·125℃ 插值', readDeviceScalarAtTj(curveOnly, 'rdsOnMilliOhm').value, 11);
const curveFill = buildSupplyPairFill(curveOnly, undefined);
near('曲线回落·一键填入值', curveFill.values.primaryRdsOnMilliOhm, 11);
if (!String(curveFill.notes.primaryRdsOnMilliOhm || '').includes('125')) {
  throw new Error('曲线回落·取点说明未写明 125℃：' + String(curveFill.notes.primaryRdsOnMilliOhm));
}
eq('曲线回落·曲线器件缺 Qg 时必须如实报缺',
  curveFill.missing.some((m) => m.includes('Qg')), true);

// ----------------------------------------------------- 3) 真实器件形态：单点曲线必须认
// 现场故障：BUK9M6R0-40H 的 staticParams.rdsOn 是 { points:[{x:25,y:4.9}] }（单点、无 value、单位用 yUnit），
// 此前要求「曲线 >=2 点才认」-> 直接判"未提供 Rds(on)"，一键填入少 3 项。
const realShape = mosfet('REAL-SINGLE-POINT', {
  staticParams: {
    rdsOn: { xAxis: 'tj', yUnit: 'mΩ', stat: 'TYP', points: [{ x: 25, y: 4.9 }], sourceType: 'DATASHEET_DIRECT' },
    vth: { xAxis: 'tj', yUnit: 'V', stat: 'MIN', points: [{ x: 25, y: 1.45 }], variants: [{ value: 2.1, unit: 'V', stat: 'MAX' }], sourceType: 'DATASHEET_DIRECT' },
  },
  gateCharge: { qg: { value: 26 } },
  thermalParams: { rthJc: { value: 2.14 } },
  bodyDiode: { qrr: { value: 17 } },
});
const realFill = buildSupplyPairFill(realShape, undefined);
near('真实形态·单点 Rds(on) 必须认（此前被 >=2 点门槛丢弃）', realFill.values.primaryRdsOnMilliOhm, 4.9);
near('真实形态·单点 Vth 最小值必须认', realFill.values.vthMinV, 1.45);
near('真实形态·Vth 最大值从 variants 恢复', realFill.values.vthMaxV, 2.1);
eq('真实形态·器件型号（文本字段）', realFill.values.componentPartNumber, 'REAL-SINGLE-POINT');
eq('真实形态·供应商（文本字段）', realFill.values.supplierName, 'T');
eq('真实形态·单点来源说明写明未做温漂外推',
  String(realFill.notes.primaryRdsOnMilliOhm || '').includes('未做温漂外推'), true);
// 器件规格候选侧：Vth 最大值也要生成候选
const realCandidates = buildDeviceParameterCandidates(realShape, new Set([...DEVICE_SPEC_FIELDS.map(f => f.key)]));
const vthMaxCandidate = realCandidates.find((c) => c.targetKey === 'vthMaxV');
ok_(!!vthMaxCandidate, 'Vth 最大值必须生成候选');
near('Vth 最大值候选值', vthMaxCandidate!.value, 2.1);

console.log('supply-pair-and-qg-alias: PASS');
