import {
  MOSFET_FIELD_TABLE,
  MOSFET_TARGET_CATEGORY_BY_KEY,
  buildDeviceParameterCandidates,
  getMosfetMappingOptions,
} from '../src/utils/deviceParameterCandidates';
import { MOSFET_PARAM_TEMPLATE, DIRECT_MAPPABLE_TARGET_KEYS, CONFIRM_REQUIRED_TARGET_KEYS, DEVICE_PARAM_PROMPT } from '../src/data/deviceTemplate';
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

// ---- Prompt / 字段表 / 候选分类 三边一致性：唯一规则 ----
// 本轮修过的 6 个漏项（idssUa/igssNa/gateResistanceOhm/dvdtCapabilityVns/didtCapabilityANs/
// soaShortCircuitTimeUs）就是"字段表比 Prompt 新"造成的。下面三条把它锁死。
for (const spec of MOSFET_FIELD_TABLE) {
  if (!spec.targetKey) continue;
  const isDirect = spec.defaultSourceType === 'DATASHEET_DIRECT' && !spec.valueKind;
  const inDirect = DIRECT_MAPPABLE_TARGET_KEYS.includes(spec.targetKey);
  const inConfirm = CONFIRM_REQUIRED_TARGET_KEYS.includes(spec.targetKey);
  if (!inDirect && !inConfirm) throw new Error(`字段表 targetKey 既不在可直接导入清单也不在需确认清单（Prompt 落后于字段表）: ${spec.targetKey}`);
  if (isDirect && !inDirect) throw new Error(`datasheet 直给的单值字段被误列为需确认: ${spec.targetKey}`);
  if (!isDirect && !inConfirm) throw new Error(`曲线/图估字段不得列入可直接导入清单: ${spec.targetKey}`);
  if (!DEVICE_PARAM_PROMPT.includes(spec.targetKey)) throw new Error(`Prompt 文本未包含该 targetKey: ${spec.targetKey}`);
}
// 派生-only / variants 恢复的字段必须出现在需确认清单（模板里没有直源）
for (const key of ['cgsPf', 'gateVoltageMinV']) {
  if (!CONFIRM_REQUIRED_TARGET_KEYS.includes(key)) throw new Error(`派生字段必须列入需确认清单: ${key}`);
  if (DIRECT_MAPPABLE_TARGET_KEYS.includes(key)) throw new Error(`派生字段不得列入可直接导入清单: ${key}`);
}
// Prompt 必须把 cgdPf 的双来源讲清楚（CgdDirect 直给 vs Crss 换算派生）
if (!/cgdDirect/.test(DEVICE_PARAM_PROMPT) || !/Crss/.test(DEVICE_PARAM_PROMPT)) throw new Error('Prompt 未区分 cgdPf 的直给来源与 Crss 派生来源');
// Prompt 必须写明 gateVoltageMinV 是从 gateVoltageMax 的负向 variant 恢复的
if (!/gateVoltageMinV/.test(DEVICE_PARAM_PROMPT) || !/variant/.test(DEVICE_PARAM_PROMPT)) throw new Error('Prompt 未说明 gateVoltageMinV 由 variants 恢复');
// 只写 note 不写 variants 会让"双向额定/Gate 负向额定"在工程侧不可用（真实器件曾如此），必须明确要求
if (!/gateVoltageMax\.variants/.test(DEVICE_PARAM_PROMPT) || !/负向额定/.test(DEVICE_PARAM_PROMPT)) {
  throw new Error('Prompt 未要求把 Gate 负向额定写入 gateVoltageMax.variants（只写 note 会导致 gateVoltageMinV 无候选）');
}
// 通用原则：note 只作补充，数值必须落到字段或 variants
if (!/不得只写在 note 里/.test(DEVICE_PARAM_PROMPT)) throw new Error('Prompt 缺少“数值不得只写在 note 里”的通用规则');
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
  staticParams: { vbrDss: { value: 40, unit: 'V', stat: 'MIN' }, idss: { value: 5, unit: 'μA', stat: 'MAX' }, igss: { value: 100, unit: 'nA', stat: 'MAX' }, gateResistance: { value: 0.8, unit: 'Ω', stat: 'TYP' }, rdsOn: { points: [{ x: 25, y: 3.2 }, { x: 125, y: 6.1 }], unit: 'mΩ', stat: 'TYP', source: 'Fig.5' } },
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

// 曲线选点（图估）必须归为「需确认」，不得自动导入
const rdsCurve = expanded.find(candidate => candidate.rawPath === 'staticParams.rdsOn');
if (!rdsCurve) throw new Error('曲线字段未生成候选');
if (rdsCurve.candidateKind !== 'DERIVED_OR_ESTIMATE' || rdsCurve.importable) {
  throw new Error(`曲线选点候选必须归为需确认且不可自动导入: kind=${rdsCurve.candidateKind} importable=${rdsCurve.importable}`);
}
// 分类与导入闸门必须一致（唯一规则）
for (const candidate of expanded) {
  if (candidate.candidateKind !== 'DIRECT_SCALAR' && candidate.importable) {
    throw new Error(`非 datasheet 直给候选不得自动导入: ${candidate.rawPath} kind=${candidate.candidateKind}`);
  }
  if (candidate.candidateKind === 'DIRECT_SCALAR' && candidate.mappingStatus === 'mapped' && !candidate.importable) {
    throw new Error(`datasheet 直给单值必须可自动导入: ${candidate.rawPath}`);
  }
  if (candidate.candidateKind === 'CURVE_ONLY' && typeof candidate.value === 'number') {
    throw new Error(`CURVE_ONLY 候选不应带单值: ${candidate.rawPath}`);
  }
}

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

console.log(`device-candidate-governance-audit: PASS (table=${MOSFET_FIELD_TABLE.length}, schemaKeys=${schemaKeys.size}, promptDirect=${DIRECT_MAPPABLE_TARGET_KEYS.length}, promptConfirm=${CONFIRM_REQUIRED_TARGET_KEYS.length})`);
