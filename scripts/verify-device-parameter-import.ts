import { applyCandidateDecisions, clearDeviceCandidateDecision, saveDevice, loadDevices, updateDeviceCandidateDecision, requestDeviceCandidateParameter } from '../src/utils/deviceLibrary';
import { buildDeviceParameterCandidates, MOSFET_FIELD_TABLE, getMosfetMappingOptions } from '../src/utils/deviceParameterCandidates';
import { buildDeviceCandidateImportPayload } from '../src/utils/deviceCandidateImport';
import { DeviceEntry } from '../src/utils/deviceLibrary';
import { MOSFET_PARAM_TEMPLATE } from '../src/data/deviceTemplate';
import { getAllEngineeringMeasurementFields } from '../src/utils/scenarioDomainEngine';

const device: DeviceEntry = {
  id: 'test_dev', deviceType: 'MOSFET', partNumber: 'TEST-40V', manufacturer: 'Test', package: 'QFN', aecqGrade: 'AEC-Q101', channelType: 'N-CH', candidateDecisions: {}, candidateRequests: {}, createdAt: '', updatedAt: '',
  raw: {
    maxRatings: {
      vds: { value: 40, unit: 'V', source: 'Table 3', conditions: { tj: 25 }, variants: [{ value: 42, unit: 'V', stat: 'MIN', source: 'Table 3A' }] },
      tjMax: { value: 175, unit: '℃', source: 'Table 3' },
      tstg: { minValue: -55, maxValue: 175, unit: '℃', source: 'Table 3' },
      easPulse: { value: 120, unit: 'mJ', source: 'Table 3' },
    },
    staticParams: {
      rdsOn: { points: [{x:25,y:2.8},{x:125,y:4.5}], source: 'Fig. 5', conditions: {vgs:10,id:20} },
      vth: { points: [{x:25,y:1.8},{x:125,y:1.5}], source: 'Fig. 7', conditions: {id:0.00025} },
    },
    capacitanceParams: {
      ciss: {value: 1200, source: 'Table 6', conditions:{vds:25,vgs:0,f:1000000}},
      crss: {points:[{x:10,y:100},{x:25,y:45},{x:50,y:25}], source:'Fig. 9', conditions:{vgs:0,f:1000000}},
    },
    gateCharge: {
      qg:{value:18,source:'Fig. 10',conditions:{vds:24,id:20,vgs:10}}, qgs:{value:4,source:'Fig.10'}, qgd:{value:7,source:'Fig.10'}
    },
    switchingParams: {
      tr:{value:8,source:'Table 8',conditions:{vdd:24,id:20,rg:4.7}}, tf:{value:10,source:'Table 8',conditions:{vdd:24,id:20,rg:4.7}}, tdOn:{value:12,source:'Table 8'}, tdOff:{value:20,source:'Table 8'}
    },
    thermalParams: { rthJc:{value:1.2,source:'Table 10'}, rthJa:{value:45,source:'Table 10'} },
    bodyDiode: { vf:{value:1.0,source:'Table 9'}, qrr:{value:35,source:'Table 9'}, trr:{value:80,source:'Table 9'} },
    extractionHints: {
      unmappedImportantData: [
        { key: 'uisEnergy', label: 'UIS 雪崩能量', value: 95, unit: 'mJ', stat: 'MAX', source: 'Table 4', sourceType: 'DATASHEET_DIRECT', confidence: 0.94, conditions: { tj: 25 } },
      ],
    },
  }
};

const candidates = buildDeviceParameterCandidates(device);

const thermalMapping = candidates.find(c => c.rawPath === 'thermalParams.rthJc');
if (!thermalMapping || thermalMapping.targetKey !== 'rthJcCPerW' || thermalMapping.mappingStatus !== 'mapped') {
  throw new Error('RθJC 未按新的器件规格层自动映射到 rthJcCPerW');
}
const qgdMapping = candidates.find(c => c.rawPath === 'gateCharge.qgd');
if (!qgdMapping || qgdMapping.targetKey !== 'qgdNc' || qgdMapping.mappingStatus !== 'mapped') {
  throw new Error('Qgd → qgdNc 自动映射失败');
}
const qgsMapping = candidates.find(c => c.rawPath === 'gateCharge.qgs');
if (!qgsMapping || qgsMapping.targetKey !== 'qgsNc' || qgsMapping.mappingStatus !== 'mapped') {
  throw new Error('Qgs → qgsNc 自动映射失败');
}
const keys = new Set(candidates.map(c => c.targetKey));
for (const required of ['vdsRatingV','rdsOnMilliOhm','vthMinV','cgdPf','cgsPf','gateChargeQgNc','turnOffDelayNs','fallTimeNs','qrrNc','easEnergyMj']) {
  if (!keys.has(required)) throw new Error(`缺候选映射: ${required}`);
}
const cgs = candidates.find(c => c.targetKey === 'cgsPf');
if (!cgs || Number(cgs.value) !== 1155) throw new Error('Cgs 推导失败');
if (keys.has('junctionTempC')) throw new Error('Tjmax 不应映射为当前工况 junctionTempC');

const hasPath = (root: unknown, path: string): boolean => {
  let current: any = root;
  for (const key of path.split('.')) {
    if (current === null || current === undefined || !(key in Object(current))) return false;
    current = current[key];
  }
  return true;
};
for (const spec of MOSFET_FIELD_TABLE) {
  if (!hasPath(MOSFET_PARAM_TEMPLATE, spec.rawPath)) throw new Error(`字段表路径不在 MOSFET 模板：${spec.rawPath}`);
}
const schemaKeys = new Set(getAllEngineeringMeasurementFields().map(field => field.key));
for (const spec of MOSFET_FIELD_TABLE) {
  if (spec.targetKey && !schemaKeys.has(spec.targetKey)) throw new Error(`候选映射 targetKey 不存在于工程 schema：${spec.targetKey}`);
}
const tstg = candidates.find(c => c.rawPath === 'maxRatings.tstg');
if (!tstg || tstg.mappingStatus !== 'unmapped' || !String(tstg.value).includes('Tstg -55 ~ 175')) {
  throw new Error('Tstg 未作为未映射资料候选保留');
}
const generic = candidates.find(c => c.rawPath === 'extractionHints.unmappedImportantData.uisEnergy');
if (!generic || generic.mappingStatus !== 'unmapped' || generic.importable) throw new Error('unmappedImportantData 未进入候选池');
const variants = candidates.find(c => c.rawPath === 'maxRatings.vds.variants');
if (!variants || variants.mappingStatus !== 'unmapped' || !String(variants.value).includes('MIN=42 V')) throw new Error('variants 口径没有在候选池显式保留');



const unmappedSpec = MOSFET_FIELD_TABLE.find(s => s.rawPath === 'gateCharge.qgd');
if (!unmappedSpec || unmappedSpec.targetKey !== 'qgdNc') throw new Error('字段表缺少 Qgd → qgdNc 映射声明');
const shortCircuitSpec = MOSFET_FIELD_TABLE.find(s => s.rawPath === 'protectionAndRobustness.shortCircuitTime');
if (!shortCircuitSpec || shortCircuitSpec.targetKey !== 'soaShortCircuitTimeUs') throw new Error('短路耐受时间没有映射到现有 P016 工程字段');

const unmappedCandidates = buildDeviceParameterCandidates(device, new Set(['vdsRatingV', 'rdsOnMilliOhm', 'vthMinV']));
const qgd = unmappedCandidates.find(c => c.rawPath === 'gateCharge.qgd');
if (!qgd || qgd.mappingStatus !== 'unmapped' || qgd.importable) {
  throw new Error('Qgd 在当前 schema 无输入时必须保留为 unmapped 且不可导入');
}

const unknownCandidates = buildDeviceParameterCandidates(device, new Set(['vdsRatingV']));
const unknown = unknownCandidates.find(c => c.rawPath === 'gateCharge.qgs');
if (!unknown || unknown.targetKey !== null || unknown.mappingStatus !== 'unmapped') {
  throw new Error('未开放工程字段没有正确进入 unmapped 状态');
}
const trr = unknownCandidates.find(c => c.rawPath === 'bodyDiode.trr');
if (!trr || trr.targetKey !== null || trr.mappingStatus !== 'unmapped') throw new Error('工程 schema 无 trrNs 时不能伪造映射');
const badUnitOptions = getMosfetMappingOptions(trr, [
  { key: 'qrrNc', label: 'Qrr', unit: 'nC', description: '', tag: 'MEASURED' },
  { key: 'diodeForwardVoltageV', label: 'Vf', unit: 'V', description: '', tag: 'SPEC' },
]);
if (badUnitOptions.length) throw new Error('人工映射下拉框允许跨单位错误映射');


const remapped = applyCandidateDecisions(
  [qgd],
  { 'gateCharge.qgd': { decision: 'mapped_to', mappedKey: 'gateChargeQgNc', decidedAt: '2026-09-25T00:00:00Z' } },
  new Set(['gateChargeQgNc']),
);
if (remapped[0].targetKey !== 'gateChargeQgNc' || remapped[0].mappingStatus !== 'mapped' || !remapped[0].importable) {
  throw new Error('mapped_to 决策未能在重新打开候选池时恢复人工映射');
}

const skipped = applyCandidateDecisions(
  [qgd],
  { 'gateCharge.qgd': { decision: 'skipped', decidedAt: '2026-09-25T00:00:00Z' } },
  new Set(['qgdNc']),
);
if (skipped[0].importable) throw new Error('skipped 决策未能阻止再次导入');

// 持久化生命周期：skip / mapped_to / request 都能写入，本地恢复后 clear 可撤销 skip。
const memoryStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => memoryStore.set(key, value),
  removeItem: (key: string) => memoryStore.delete(key),
};
saveDevice(device);
updateDeviceCandidateDecision(device.id, 'gateCharge.qgd', 'skipped');
requestDeviceCandidateParameter(device.id, 'gateCharge.qgd', 'Qgd', '栅极驱动');
const persisted = loadDevices().find(d => d.id === device.id);
if (persisted?.candidateDecisions?.['gateCharge.qgd']?.decision !== 'skipped') throw new Error('skip 决策未持久化');
if (!persisted?.candidateRequests?.['gateCharge.qgd']) throw new Error('创建参数待办未持久化');
clearDeviceCandidateDecision(device.id, 'gateCharge.qgd');
const cleared = loadDevices().find(d => d.id === device.id);
if (cleared?.candidateDecisions?.['gateCharge.qgd']) throw new Error('clear candidate decision 未清除 skip');

const contaminated = [{ ...qgd, targetKey: null as string | null, mappingStatus: 'unmapped' as const, importable: false }];
const safeApplied = applyCandidateDecisions(contaminated, undefined, new Set(['qgdNc']));
if (safeApplied[0].targetKey !== null || safeApplied[0].importable) {
  throw new Error('unmapped 候选不得被应用层改写为可导入字段');
}

console.log(`verify-device-parameter-import: PASS (table=${MOSFET_FIELD_TABLE.length}, candidates=${candidates.length}, unmapped=${unmappedCandidates.filter(c => c.mappingStatus === 'unmapped').length})`);


const directImport = candidates.find(c => c.targetKey === 'vdsRatingV')!;
const blockedUnmapped = { ...directImport, id: 'blocked-unmapped', targetKey: null, mappingStatus: 'unmapped' as const, importable: false };
const payload = buildDeviceCandidateImportPayload(
  [directImport, blockedUnmapped],
  new Set([directImport.id, blockedUnmapped.id]),
  {},
  'TEST-40V',
  '2026-09-25T00:00:00.000Z',
);
if (payload.values.vdsRatingV !== 40 || Object.keys(payload.values).some(key => key === 'null')) throw new Error('导入 payload 出现错误目标 key');
if (!payload.invalidCandidates.includes(blockedUnmapped.id)) throw new Error('unmapped 候选未在最终导入闸门被拦截');
if (payload.importedIds.length !== 1) throw new Error('导入 payload 没有只保留有效候选');

const duplicatePayload = buildDeviceCandidateImportPayload(
  [
    directImport,
    { ...directImport, id: 'same-target', rawPath: 'synthetic.sameTarget' },
  ],
  new Set([directImport.id, 'same-target']),
  {},
  'TEST-40V',
);
if (!duplicatePayload.duplicateTargets.some(item => item.targetKey === 'vdsRatingV')) throw new Error('重复 targetKey 未被导入闸门阻断');
if (duplicatePayload.importedIds.length !== 0 || Object.keys(duplicatePayload.values).length !== 0) throw new Error('重复 targetKey 不应产生任何工程写入');

const conflictPayload = buildDeviceCandidateImportPayload(
  [directImport],
  new Set([directImport.id]),
  { vdsRatingV: 48 },
  'TEST-40V',
);
if (conflictPayload.importedIds.length !== 0 || conflictPayload.conflicts.length !== 1 || conflictPayload.values.vdsRatingV !== undefined) {
  throw new Error('已有工程输入未能阻止器件资料覆盖');
}
