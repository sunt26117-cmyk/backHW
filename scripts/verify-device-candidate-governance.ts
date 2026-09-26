import {
  MOSFET_FIELD_TABLE,
  MOSFET_TARGET_CATEGORY_BY_KEY,
  buildDeviceParameterCandidates,
  getMosfetMappingOptions,
} from '../src/utils/deviceParameterCandidates';
import { MOSFET_PARAM_TEMPLATE } from '../src/data/deviceTemplate';
import { buildDeviceCandidateImportPayload, getAutoImportCandidateIds } from '../src/utils/deviceCandidateImport';
import { getAllEngineeringMeasurementFields, getDeviceSpecificationMeasurementFields } from '../src/utils/scenarioDomainEngine';
import {
  importDeviceFromJson,
  saveDevice,
  loadDevices,
  updateDeviceCandidateDecision,
  clearDeviceCandidateDecision,
  requestDeviceCandidateParameter,
} from '../src/utils/deviceLibrary';

const getPath = (root: any, path: string) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], root);
const duplicateRaw = MOSFET_FIELD_TABLE.filter((spec, index) => MOSFET_FIELD_TABLE.findIndex(item => item.rawPath === spec.rawPath) !== index);
if (duplicateRaw.length) throw new Error('MOSFET_FIELD_TABLE rawPath 重复: ' + duplicateRaw.map(spec => spec.rawPath).join(', '));
const missingRaw = MOSFET_FIELD_TABLE.filter(spec => !spec.rawPath.includes('→') && getPath(MOSFET_PARAM_TEMPLATE, spec.rawPath) === undefined);
if (missingRaw.length) throw new Error('字段表路径不在 MOSFET 模板: ' + missingRaw.map(spec => spec.rawPath).join(', '));
const schemaKeys = new Set(getAllEngineeringMeasurementFields().map(field => field.key));
const deviceSpecKeys = new Set(getDeviceSpecificationMeasurementFields().map(field => field.key));
for (const key of ['vdsRatingV','rdsOnMilliOhm','vthMinV','cgdPf','cgsPf','gateChargeQgNc','qgdNc','turnOffDelayNs','fallTimeNs','diodeForwardVoltageV','qrrNc','soaShortCircuitTimeUs','easEnergyMj','idRatingA','idPulseRatingA','tjMaxC','vbrDssMinV','pdMaxW','cissPf','cossPf','qgsNc','qswNc','gatePlateauV','turnOnDelayNs','riseTimeNs','trrNs','irrPeakA','rthJcCPerW','rthJaCPerW','dvdtCapabilityVns','didtCapabilityANs','gateVoltageMaxV','gateVoltageMinV','esdRatingKv','gateResistanceOhm','idssUa','igssNa','easCurrentA']) {
  if (!deviceSpecKeys.has(key)) throw new Error(`缺失器件规格字段: ${key}`);
}
for (const spec of MOSFET_FIELD_TABLE) {
  if (spec.targetKey && !schemaKeys.has(spec.targetKey)) throw new Error(`targetKey 不存在于工程 schema: ${spec.targetKey}`);
  if (spec.targetKey && !MOSFET_TARGET_CATEGORY_BY_KEY[spec.targetKey]) throw new Error(`target category registry 缺少: ${spec.targetKey}`);
}
for (const key of Object.keys(MOSFET_TARGET_CATEGORY_BY_KEY)) {
  if (!schemaKeys.has(key)) throw new Error(`人工映射 registry 指向不存在字段: ${key}`);
}
if (MOSFET_FIELD_TABLE.some(spec => spec.targetKey === 'junctionTempC')) throw new Error('Tjmax 不得映射 junctionTempC');

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
const imported = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'GOV-TEST', manufacturer: 'T', package: 'QFN', aecqGrade: 'AEC-Q101', channelType: 'N-CH',
  maxRatings: { vds: { value: 40, source: 'T1', stat: 'MAX', variants: [{ value: 42, unit: 'V', stat: 'MIN', source: 'T1A' }] } },
  gateCharge: { qgd: { value: 7, source: 'T3', stat: 'TYP' } },
  extractionHints: { unmappedImportantData: [{ key: 'uis', label: 'UIS', value: 90, unit: 'mJ', source: 'T4', confidence: 0.95 }] },
}));
if (!imported.device) throw new Error(imported.error || 'import device failed');
saveDevice(imported.device);
const device = loadDevices()[0];
const expandedDevice = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'GOV-EXPANDED', manufacturer: 'T', package: 'QFN', aecqGrade: 'AEC-Q101', channelType: 'N-CH',
  maxRatings: { id: { value: 50, unit: 'A', stat: 'MAX' }, idPulse: { value: 200, unit: 'A', stat: 'MAX' }, tjMax: { value: 175, unit: '℃', stat: 'MAX' }, powerDissipation: { value: 70, unit: 'W', stat: 'MAX' }, easCurrent: { value: 30, unit: 'A', stat: 'MAX' } },
  staticParams: { vbrDss: { value: 40, unit: 'V', stat: 'MIN' }, idss: { value: 5, unit: 'μA', stat: 'MAX' }, igss: { value: 100, unit: 'nA', stat: 'MAX' }, gateResistance: { value: 0.8, unit: 'Ω', stat: 'TYP' } },
  capacitanceParams: { ciss: { value: 1764, unit: 'pF', stat: 'TYP' }, coss: { value: 452, unit: 'pF', stat: 'TYP' } },
  gateCharge: { qgs: { value: 4.8, unit: 'nC', stat: 'TYP' }, qsw: { value: 8, unit: 'nC', stat: 'TYP' }, gatePlateauV: { value: 3, unit: 'V', stat: 'TYP' } },
  switchingParams: { tr: { value: 25, unit: 'ns', stat: 'TYP' }, tdOn: { value: 18, unit: 'ns', stat: 'TYP' }, tdOff: { value: 15, unit: 'ns', stat: 'TYP' }, tf: { value: 12, unit: 'ns', stat: 'TYP' }, dvdtCapability: { value: 5, unit: 'V/ns', stat: 'MAX' }, didtCapability: { value: 2, unit: 'A/ns', stat: 'MAX' } },
  thermalParams: { rthJc: { value: 2.14, unit: '℃/W', stat: 'MAX' }, rthJa: { value: 30, unit: '℃/W', stat: 'TYP' } },
  bodyDiode: { trr: { value: 23, unit: 'ns', stat: 'TYP' }, irrM: { value: 10, unit: 'A', stat: 'TYP' } },
  protectionAndRobustness: { gateVoltageMax: { value: 20, unit: 'V', stat: 'MAX' }, esdRating: { value: 2, unit: 'kV', stat: 'MAX' } },
}));
if (!expandedDevice.device) throw new Error(expandedDevice.error || 'expanded device import failed');
const expanded = buildDeviceParameterCandidates(expandedDevice.device, schemaKeys);
for (const [path,key] of [['maxRatings.id','idRatingA'],['maxRatings.idPulse','idPulseRatingA'],['maxRatings.tjMax','tjMaxC'],['maxRatings.powerDissipation','pdMaxW'],['capacitanceParams.ciss','cissPf'],['capacitanceParams.coss','cossPf'],['gateCharge.qgs','qgsNc'],['gateCharge.qsw','qswNc'],['gateCharge.gatePlateauV','gatePlateauV'],['switchingParams.tr','riseTimeNs'],['switchingParams.tdOn','turnOnDelayNs'],['thermalParams.rthJc','rthJcCPerW'],['thermalParams.rthJa','rthJaCPerW'],['bodyDiode.trr','trrNs'],['bodyDiode.irrM','irrPeakA'],['protectionAndRobustness.gateVoltageMax','gateVoltageMaxV'],['protectionAndRobustness.esdRating','esdRatingKv']] as const) {
  const hit = expanded.find(candidate => candidate.rawPath === path);
  if (!hit || hit.targetKey !== key || hit.mappingStatus !== 'mapped' || !hit.importable) throw new Error(`自动映射失败: ${path} -> ${key}`);
}
const autoIds = getAutoImportCandidateIds(expanded, {});
const autoPayload = buildDeviceCandidateImportPayload(expanded, autoIds, {}, expandedDevice.device!.partNumber);
if (autoPayload.invalidCandidates.length || autoPayload.importedIds.length < 10) throw new Error(`高置信度自动导入数量异常: ${autoPayload.importedIds.length}`);
if (autoPayload.values['junctionTempC'] !== undefined) throw new Error('Tjmax 错误投影为 junctionTempC');
if (autoPayload.values['tjMaxC'] !== 175 || autoPayload.values['qgsNc'] !== 4.8) throw new Error('器件规格直接值未自动写入对应 schema');

const candidates = buildDeviceParameterCandidates(device, new Set(['qgdNc']));
const variant = candidates.find(candidate => candidate.rawPath === 'maxRatings.vds.variants');
const extra = candidates.find(candidate => candidate.rawPath === 'extractionHints.unmappedImportantData.uis');
if (!variant || variant.mappingStatus !== 'unmapped') throw new Error('variants 未进入 unmapped 候选');
if (!extra || extra.mappingStatus !== 'unmapped' || extra.importable) throw new Error('unmappedImportantData 未进入候选治理');

updateDeviceCandidateDecision(device.id, 'gateCharge.qgd', 'mapped_to', 'qgdNc');
requestDeviceCandidateParameter(device.id, 'gateCharge.qsw', 'Qsw', '栅极驱动');
let after = loadDevices().find(item => item.id === device.id)!;
const rebuilt = buildDeviceParameterCandidates(after, new Set(['qgdNc']));
const qgd = rebuilt.find(candidate => candidate.rawPath === 'gateCharge.qgd');
if (!qgd || qgd.targetKey !== 'qgdNc' || qgd.mappingStatus !== 'mapped' || !qgd.importable) throw new Error('mapped_to 决策重新加载后未恢复');
if (!after.candidateRequests['gateCharge.qsw']) throw new Error('参数创建待办未持久化');

clearDeviceCandidateDecision(device.id, 'gateCharge.qgd');
after = loadDevices().find(item => item.id === device.id)!;
if (after.candidateDecisions['gateCharge.qgd']) throw new Error('clear candidate decision 失败');
const trr = candidates.find(candidate => candidate.rawPath === 'bodyDiode.trr');
if (trr && getMosfetMappingOptions(trr, [{ key: 'qrrNc', label: 'Qrr', unit: 'nC', description: '', tag: 'MEASURED' }]).length) {
  throw new Error('单位不兼容的人工映射没有被过滤');
}

console.log(`device-candidate-governance-audit: PASS (table=${MOSFET_FIELD_TABLE.length}, schemaKeys=${schemaKeys.size})`);
