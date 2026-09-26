/**
 * 端到端验证：COMPONENT 工况 + 导入 MOSFET 规格书后，
 *   ① 主导域（COMPONENT）能自动填的是否都填了；
 *   ② 器件规格（DEVICE_SPEC）能映射的是否都映射了。
 * 并如实记录"没填"的原因（安全闸拦下 vs 本来就该实测 vs key 别名）。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { buildDeviceParameterCandidates } from '../src/utils/deviceParameterCandidates';
import { buildDeviceCandidateImportPayload, getAutoImportCandidateIds } from '../src/utils/deviceCandidateImport';
import { getDomainMeasurementFields, resolveFieldDisplayKey } from '../src/utils/scenarioDomainEngine';
import { DEVICE_SPEC_FIELDS } from '../src/utils/deviceSpecificationSchema';

const eq = (n: string, a: unknown, b: unknown) => { if (a !== b) throw new Error(`${n}: got ${String(a)}, expected ${String(b)}`); };
const ok_ = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

// 一份典型 MOSFET 规格书提取结果（标量为主 + 一条 Crss 曲线）
const datasheet = {
  deviceType: 'MOSFET', partNumber: 'BUK9M6R0-40H', manufacturer: 'Nexperia', package: 'LFPAK33',
  maxRatings: { vds: { value: 40 }, id: { value: 100 }, idPulse: { value: 400 }, tjMax: { value: 175 }, powerDissipation: { value: 100 }, easPulse: { value: 100 }, easCurrent: { value: 30 } },
  staticParams: { rdsOn: { value: 6.0, conditions: { vgs: '10 V' } }, vth: { value: 1.45, conditions: { tj: '25 C' } }, vbrDss: { value: 40 }, idss: { value: 1 }, igss: { value: 100 }, gateResistance: { value: 1.0 } },
  capacitanceParams: { ciss: { value: 1764, conditions: { vds: '25 V' } }, coss: { value: 280, conditions: { vds: '25 V' } }, crss: { points: [{ x: 10, y: 400 }, { x: 25, y: 200 }, { x: 100, y: 60 }] } },
  gateCharge: { qg: { value: 26 }, qgs: { value: 5 }, qgd: { value: 6 }, qsw: { value: 10 }, gatePlateauV: { value: 2.5 } },
  switchingParams: { tdOn: { value: 10 }, tr: { value: 8 }, tdOff: { value: 20 }, tf: { value: 15 }, dvdtCapability: { value: 50 }, didtCapability: { value: 200 } },
  thermalParams: { rthJc: { value: 2.14 }, rthJa: { value: 40 } },
  bodyDiode: { vf: { value: 0.85 }, qrr: { value: 17 }, trr: { value: 23 }, irrM: { value: 5 } },
  protectionAndRobustness: { shortCircuitTime: { value: 5 }, gateVoltageMax: { value: 20, variants: [{ value: -20, unit: 'V', stat: 'MIN' }] }, esdRating: { value: 2 } },
};
const imported = importDeviceFromJson(JSON.stringify(datasheet));
if (!imported.device) throw new Error(imported.error || 'import failed');
const device = imported.device;
saveDevice(device);

const componentFields = getDomainMeasurementFields({ issueCategories: ['Component Alternative'] } as any);
const allKeys = new Set([...DEVICE_SPEC_FIELDS.map(f => f.key), ...componentFields.map(f => f.key)]);
const candidates = buildDeviceParameterCandidates(device, allKeys);
const autoIds = getAutoImportCandidateIds(candidates, {});
const payload = buildDeviceCandidateImportPayload(candidates, autoIds, {}, device.partNumber, undefined, new Set(), {}, 'USER_MEASURED');
const measuredValues: Record<string, any> = { ...payload.values };
const issue = { issueCategories: ['Component Alternative'], measuredValues, measurementProvenance: { ...payload.provenance }, measuredValueSource: 'IMPORTED' } as any;

// 打印真相
const specFilled = DEVICE_SPEC_FIELDS.filter(f => measuredValues[f.key] !== undefined);
console.log('\n【器件规格 DEVICE_SPEC】自动映射 ' + specFilled.length + '/' + DEVICE_SPEC_FIELDS.length);
console.log('  未映射: ' + DEVICE_SPEC_FIELDS.filter(f => measuredValues[f.key] === undefined).map(f => f.key).join(', '));
const compFilled = componentFields.filter(f => measuredValues[f.key] !== undefined);
console.log('\n【COMPONENT 主导域】直接命中 ' + compFilled.length + '/' + componentFields.length + ' -> ' + compFilled.map(f => f.key).join(', '));
const aliased = componentFields.filter(f => measuredValues[f.key] === undefined && resolveFieldDisplayKey(measuredValues, f.key).aliased);
console.log('  经别名回退显示: ' + (aliased.length ? aliased.map(f => f.key + '<-' + resolveFieldDisplayKey(measuredValues, f.key).valueKey).join(', ') : '(无)'));
const stillEmpty = componentFields.filter(f => resolveFieldDisplayKey(measuredValues, f.key).aliased === false && measuredValues[f.key] === undefined);
console.log('  仍为空: ' + stillEmpty.map(f => f.key).join(', '));
for (const key of ['rdsOnMilliOhm', 'vthMinV', 'cgdPf', 'cgsPf', 'rthJaCPerW']) {
  const c = candidates.find(x => x.targetKey === key);
  if (c) console.log(`  [安全闸] ${key}: kind=${c.candidateKind} sourceType=${c.sourceType} conf=${c.confidence} importable=${c.importable} auto=${autoIds.has(c.id)}`);
}

// ---- 断言 ①：器件规格"能映射的都映射了" ----
ok_(specFilled.length >= 30, '器件规格自动映射数量偏低：' + specFilled.length);
for (const key of ['vdsRatingV', 'gateChargeQgNc', 'qgdNc', 'tjMaxC', 'rthJcCPerW', 'cissPf', 'cossPf', 'qrrNc', 'turnOffDelayNs', 'idRatingA']) {
  ok_(measuredValues[key] !== undefined, '器件规格未映射：' + key);
}
eq('器件规格·Vds', measuredValues.vdsRatingV, 40);
eq('器件规格·Qg', measuredValues.gateChargeQgNc, 26);
eq('器件规格·RthJC', measuredValues.rthJcCPerW, 2.14);

// ---- 断言 ②：主导域 key 与器件规格 key 重合的字段直接命中 ----
for (const key of ['vdsRatingV', 'qgdNc']) ok_(measuredValues[key] !== undefined, '主导域应直接命中：' + key);

// ---- 断言 ③：别名回退（qgNc 显示器件规格填的 gateChargeQgNc） ----
const aliasRead = resolveFieldDisplayKey(measuredValues, 'qgNc');
eq('qgNc 别名回退到', aliasRead.valueKey, 'gateChargeQgNc');
eq('qgNc 别名命中', aliasRead.aliased, true);
const ownWins = resolveFieldDisplayKey({ qgNc: 52, gateChargeQgNc: 26 }, 'qgNc');
eq('本 key 有值时优先本 key', ownWins.valueKey, 'qgNc');
eq('本 key 有值时不标别名', ownWins.aliased, false);
eq('反向别名（器件规格框显示 COMPONENT 填的 Qg）', resolveFieldDisplayKey({ qgNc: 52 }, 'gateChargeQgNc').valueKey, 'qgNc');

// ---- 断言 ④：实测项绝不能被凭空填 ----
for (const key of ['switchDelayNs', 'junctionTempC', 'soaMarginPct']) {
  eq('实测项不得被自动填：' + key, measuredValues[key], undefined);
}
// ---- 断言 ⑤：一供/二供对比字段需专用按钮（不属器件规格自动映射） ----
for (const key of ['primaryRdsOnMilliOhm', 'secondaryRdsOnMilliOhm', 'primaryQgNc', 'secondaryQgNc', 'primaryQrrNc', 'secondaryQrrNc', 'primaryRthJcCPerW', 'secondaryRthJcCPerW']) {
  eq('一供/二供字段不由规格自动映射：' + key, measuredValues[key], undefined);
}
// ---- 断言 ⑥：曲线类字段给成"表格单值"时必须生成候选（可见 + 可一键确认），但不自动导入 ----
for (const key of ['rdsOnMilliOhm', 'vthMinV']) {
  const cand = candidates.find(c => c.targetKey === key);
  ok_(!!cand, '曲线类字段给成单值时必须生成候选（此前直接丢弃）：' + key);
  eq('候选应为需确认的估计候选：' + key, cand!.candidateKind, 'DERIVED_OR_ESTIMATE');
  eq('候选应处于已映射：' + key, cand!.mappingStatus, 'mapped');
  eq('未经确认不得自动导入：' + key, autoIds.has(cand!.id), false);
}
// 一键确认后必须真的写进工程输入（否则"可见"没有意义）
const confirmIds = new Set(candidates.filter(c => ['rdsOnMilliOhm', 'vthMinV'].includes(String(c.targetKey))).map(c => c.id));
const confirmedPayload = buildDeviceCandidateImportPayload(candidates, confirmIds, {}, device.partNumber, undefined, new Set(confirmIds), {}, 'USER_MEASURED');
eq('确认导入·Rds(on)', confirmedPayload.values.rdsOnMilliOhm, 6);
eq('确认导入·VGS(th)', confirmedPayload.values.vthMinV, 1.45);

// ---- 断言 ⑦：安全闸仍拦住派生/低置信度（这些连确认入口都应保持"不可直导"） ----
for (const key of ['cgdPf', 'cgsPf', 'rthJaCPerW']) {
  eq('安全闸应拦住（自动导入）：' + key, measuredValues[key], undefined);
}

console.log('\ncomponent-domain-autofill: PASS');
