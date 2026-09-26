/**
 * 治理断言：器件导入的「安全自动带入」闸 + 曲线候选的真实分类。
 *
 * 现场问题：导入器件 JSON 后 current issue 的 SPEC 输入框全是空的 —— 因为 handleImport 只
 * saveDevice、没写回 measuredValues（复用「设为当前」的安全闸已修）。这里把闸本身钉死：
 *  1. 只有「mapped && importable && DATASHEET_DIRECT && confidence>=0.9 的数字单值」才能自动进去；
 *  2. 曲线选点（Rds(on)/Vth 只有 points 无标量）与派生候选（Ciss−Crss 之类）绝不能被自动导入；
 *  3. 顺带记录曲线候选的真实 candidateKind，避免把「曲线候选」误说成「已映射的派生值」。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { buildDeviceParameterCandidates, getMosfetMappingOptions } from '../src/utils/deviceParameterCandidates';
import { buildDeviceCandidateImportPayload, getAutoImportCandidateIds } from '../src/utils/deviceCandidateImport';
import { DEVICE_SPEC_FIELDS } from '../src/utils/deviceSpecificationSchema';
const eq = (n: string, a: unknown, b: unknown) => { if (a !== b) throw new Error(`${n}: got ${String(a)}, expected ${String(b)}`); };
const ok_ = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const fieldKeys = DEVICE_SPEC_FIELDS.map((f) => f.key);

// 器件A：标量单值齐全（Vds/Qg/IDSS）+ 只给曲线的 Rds(on)（无 value）
const a = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'IMPORT-GATE-A', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 } },
  staticParams: { rdsOn: { value: null, points: [{ x: 25, y: 6 }, { x: 125, y: 11 }] }, idss: { value: 3.2 } },
  gateCharge: { qg: { value: 52 } },
}));
if (!a.device) throw new Error(a.error || 'A import failed');
saveDevice(a.device);
const candidatesA = buildDeviceParameterCandidates(a.device, new Set(fieldKeys));

const rdsOn = candidatesA.find((c) => c.targetKey === 'rdsOnMilliOhm');
// 曲线候选的真实分类是 DERIVED_OR_ESTIMATE（映射到了 rdsOnMilliOhm，但不是安全的 DATASHEET_DIRECT 单值）。
// 它由 UI 的「已匹配需工程确认」桶承接（candidateKind==='DERIVED_OR_ESTIMATE' && mappingStatus==='mapped'），
// 而不是「未映射」桶——这就是现场截图把曲线候选误看成「未映射」的视觉根源。
console.log('  (rdsOn 曲线候选 kind=' + String(rdsOn?.candidateKind) + ' mapping=' + String(rdsOn?.mappingStatus) + ')');
eq('A·rdsOn 曲线候选 → DERIVED_OR_ESTIMATE', rdsOn?.candidateKind, 'DERIVED_OR_ESTIMATE');
eq('A·rdsOn 曲线候选 → 不可自动导入', rdsOn?.importable, false);

const autoIdsA = getAutoImportCandidateIds(candidatesA, {});
const autoTargets = candidatesA.filter((c) => autoIdsA.has(c.id)).map((c) => c.targetKey);
// 自动进去的必须是可安全直导的数字单值
ok_(autoTargets.includes('vdsRatingV'), 'Vds 额定应可安全直导，实际=' + JSON.stringify(autoTargets));
ok_(autoTargets.includes('idssUa'), 'IDSS 标量应可安全直导，实际=' + JSON.stringify(autoTargets));
ok_(autoTargets.includes('gateChargeQgNc'), 'Qg 标量应可安全直导，实际=' + JSON.stringify(autoTargets));
// 曲线选点绝不能被自动导入
ok_(!autoTargets.includes('rdsOnMilliOhm'), '曲线选点的 rdsOn 严禁被自动导入');

// 器件B：只有派生关系（Ciss/Crss → cgsPf 必须同点派生），不得自动写 cgsPf
const b = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'IMPORT-GATE-B', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 } },
  capacitanceParams: { ciss: { value: 1764, conditions: { vds: '15 V' } }, crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] } },
}));
if (!b.device) throw new Error(b.error || 'B import failed');
saveDevice(b.device);
const candidatesB = buildDeviceParameterCandidates(b.device, new Set(fieldKeys));
const cgs = candidatesB.find((c) => c.targetKey === 'cgsPf');
eq('B·cgsPf 派生候选 → DERIVED_OR_ESTIMATE', cgs?.candidateKind, 'DERIVED_OR_ESTIMATE');
eq('B·cgsPf 派生候选 → 不可自动导入', cgs?.importable, false);
const autoIdsB = getAutoImportCandidateIds(candidatesB, {});
// B 的 Vds 额定是 DATASHEET_DIRECT 单值，允许安全直导；但 cgsPf 是 Ciss−Crss 派生候选，严禁自动导入。
ok_(candidatesB.filter((c) => autoIdsB.has(c.id)).some((c) => c.targetKey === 'vdsRatingV'), '器件 B 的 Vds 额定应可安全直导');
ok_(!autoIdsB.has(cgs?.id ?? '__none__'), 'cgsPf 派生候选严禁被自动导入');

// 已有实测输入时，自动带入不得覆盖（现有 verify-device-parameter-import.ts 也有此断言，这里再钉一次）
const issue = { measuredValues: { vdsRatingV: 60 }, measurementProvenance: { vdsRatingV: { source: 'USER_MEASURED' } }, measuredValueSource: 'USER_MEASURED' } as any;
const autoIdsProtected = getAutoImportCandidateIds(candidatesA, issue.measuredValues, issue.measurementProvenance, issue.measuredValueSource);
ok_(!autoIdsProtected.has('vdsRatingV'), '已实测/人工输入的 vdsRatingV 不得被器件资料覆盖');

console.log('device-import-auto-apply: PASS');
