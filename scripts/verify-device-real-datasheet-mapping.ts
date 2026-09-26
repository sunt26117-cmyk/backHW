import { buildDeviceParameterCandidates } from '../src/utils/deviceParameterCandidates';
import { getAllEngineeringMeasurementFields } from '../src/utils/scenarioDomainEngine';
import { getAutoImportCandidateIds, buildDeviceCandidateImportPayload } from '../src/utils/deviceCandidateImport';
import type { DeviceEntry } from '../src/utils/deviceLibrary';

const raw = {
  schemaVersion: '2.0', deviceType: 'MOSFET', partNumber: 'BUK9M6R0-40H', manufacturer: 'Nexperia',
  maxRatings: {
    vds: { value: 40, unit: 'V', stat: 'MAX', source: 'Table 5', confidence: .99 },
    id: { value: 50, unit: 'A', stat: 'MAX', source: 'Table 5', confidence: .99 },
    idPulse: { value: 311, unit: 'A', stat: 'MAX', source: 'Table 5', confidence: .99 },
    tjMax: { value: 175, unit: '℃', stat: 'MAX', source: 'Table 5', confidence: .99 },
    powerDissipation: { value: 70, unit: 'W', stat: 'MAX', source: 'Table 5', confidence: .99 },
    easPulse: { value: null, unit: 'mJ', stat: 'MAX', source: null, confidence: null },
    easCurrent: { value: null, unit: 'A', stat: 'MAX', source: null, confidence: null },
  },
  staticParams: {
    rdsOn: { xAxis: 'tj', yUnit: 'mΩ', stat: 'TYP', confidence: .99, points: [{ x: 25, y: 4.9 }], sourceType: 'DATASHEET_DIRECT', source: 'Table 7' },
    vth: { xAxis: 'tj', yUnit: 'V', stat: 'MIN', confidence: .99, points: [{ x: 25, y: 1.45 }], sourceType: 'DATASHEET_DIRECT', source: 'Table 7' },
  },
  capacitanceParams: {
    ciss: { value: 1764, unit: 'pF', stat: 'TYP', source: 'Table 7', confidence: .99 },
    coss: { value: 452, unit: 'pF', stat: 'TYP', source: 'Table 7', confidence: .99 },
    crss: { points: [{ x: 25, y: 66 }], source: 'Fig. 15', sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: .75 },
    cgdDirect: { value: null, unit: 'pF' },
  },
  gateCharge: {
    qg: { value: 26, unit: 'nC', stat: 'TYP', source: 'Table 7', confidence: .99 },
    qgs: { value: 4.8, unit: 'nC', stat: 'TYP', source: 'Table 7', confidence: .99 },
    qgd: { value: 2.9, unit: 'nC', stat: 'TYP', source: 'Table 7', confidence: .99 },
  },
  switchingParams: {
    tr: { value: 25, unit: 'ns', stat: 'TYP', source: 'Table 7', confidence: .99 },
    tf: { value: 12, unit: 'ns', stat: 'TYP', source: 'Table 7', confidence: .95 },
    tdOn: { value: 18, unit: 'ns', stat: 'TYP', source: 'Table 7', confidence: .99 },
    tdOff: { value: 15, unit: 'ns', stat: 'TYP', source: 'Table 7', confidence: .99 },
  },
  thermalParams: {
    rthJc: { value: 2.14, unit: '℃/W', stat: 'MAX', source: 'Table 6', confidence: .99 },
    rthJa: { value: null, unit: '℃/W' },
  },
  bodyDiode: {
    vf: { value: .85, unit: 'V', stat: 'TYP', source: 'Table 7', confidence: .99 },
    qrr: { value: 17, unit: 'nC', stat: 'TYP', source: 'Table 7', confidence: .95 },
    trr: { value: 23, unit: 'ns', stat: 'TYP', source: 'Table 7', confidence: .99 },
  },
  soaCurve: {
    source: 'Fig. 3', sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: .75,
    curves: [{ pulseTimeUs: 10, xUnit: 'V', yUnit: 'A', points: [{ x: 10, y: 50 }, { x: 20, y: 30 }] }],
  },
  protectionAndRobustness: {
    shortCircuitTime: { value: null, unit: 'μs' },
    gateVoltageMax: { value: 20, unit: 'V', stat: 'MAX', source: 'Table 5', confidence: .99, variants: [{ value: -20, unit: 'V', stat: 'MIN', source: 'Table 5', confidence: .99 }] },
    esdRating: { value: null, unit: 'kV' },
  },
  extractionHints: {
    mapping: [
      { targetKey: 'vdsRatingV', sourcePath: 'maxRatings.vds' },
      { targetKey: 'rdsOnMilliOhm', sourcePath: 'staticParams.rdsOn' },
      { targetKey: 'vthMinV', sourcePath: 'staticParams.vth' },
      { targetKey: 'cgdPf', sourcePath: 'capacitanceParams.crss' },
      { targetKey: 'gateChargeQgNc', sourcePath: 'gateCharge.qg' },
      { targetKey: 'qgdNc', sourcePath: 'gateCharge.qgd' },
      { targetKey: 'qgsNc', sourcePath: 'gateCharge.qgs' },
      { targetKey: 'turnOffDelayNs', sourcePath: 'switchingParams.tdOff' },
      { targetKey: 'fallTimeNs', sourcePath: 'switchingParams.tf' },
      { targetKey: 'thermalResistanceCPerW', sourcePath: 'thermalParams.rthJc' },
      { targetKey: 'diodeForwardVoltageV', sourcePath: 'bodyDiode.vf' },
      { targetKey: 'qrrNc', sourcePath: 'bodyDiode.qrr' },
      { targetKey: 'trrNs', sourcePath: 'bodyDiode.trr' },
    ],
    unmappedImportantData: [
      { item: 'V(BR)DSS breakdown voltage', value: 'min 40V @ Tj=25℃; typ 40.5V @ Tj=-40℃; min 36V @ Tj=-55℃', source: 'Table 7' },
      { item: 'IDSS drain leakage current', value: 'typ 0.02μA max 5μA @ VDS=40V; typ 0.6μA max 10μA @ 125℃; typ 45μA max 500μA @ 175℃', source: 'Table 7' },
      { item: 'IGSS gate leakage current', value: 'typ 2nA max 100nA @ VGS=16V; typ 2nA max 100nA @ VGS=-16V', source: 'Table 7' },
      { item: 'RG gate resistance', value: 'min 0.3Ω, typ 0.8Ω, max 2Ω @ f=1MHz, Tj=25℃', source: 'Table 7' },
      { item: 'Package outline', value: 'LFPAK33 / SOT1210, 8 leads, 0.65 mm pitch', source: 'Fig. 17' },
    ],
  },
};

const device: DeviceEntry = {
  id: 'real_buk9m6r0', deviceType: 'MOSFET', partNumber: 'BUK9M6R0-40H', manufacturer: 'Nexperia',
  package: 'LFPAK33', aecqGrade: 'AEC-Q101', channelType: 'N-CH', candidateDecisions: {}, candidateRequests: {},
  createdAt: '', updatedAt: '', raw,
};
const schemaKeys = new Set(getAllEngineeringMeasurementFields().map(field => field.key));
const candidates = buildDeviceParameterCandidates(device, schemaKeys);
const expectMapped = [
  ['maxRatings.vds', 'vdsRatingV'], ['staticParams.rdsOn', 'rdsOnMilliOhm'], ['staticParams.vth', 'vthMinV'],
  ['gateCharge.qg', 'gateChargeQgNc'], ['gateCharge.qgs', 'qgsNc'], ['gateCharge.qgd', 'qgdNc'],
  ['switchingParams.tr', 'riseTimeNs'], ['switchingParams.tdOn', 'turnOnDelayNs'], ['switchingParams.tdOff', 'turnOffDelayNs'], ['switchingParams.tf', 'fallTimeNs'],
  ['capacitanceParams.ciss', 'cissPf'], ['capacitanceParams.coss', 'cossPf'], ['thermalParams.rthJc', 'rthJcCPerW'],
  ['bodyDiode.vf', 'diodeForwardVoltageV'], ['bodyDiode.qrr', 'qrrNc'], ['bodyDiode.trr', 'trrNs'],
  ['maxRatings.id', 'idRatingA'], ['maxRatings.idPulse', 'idPulseRatingA'], ['maxRatings.tjMax', 'tjMaxC'], ['maxRatings.powerDissipation', 'pdMaxW'],
  ['protectionAndRobustness.gateVoltageMax', 'gateVoltageMaxV'],
  ['protectionAndRobustness.gateVoltageMax|min-variant', 'gateVoltageMinV'],
  ['extractionHints.unmappedImportantData:legacy:vbrDssMinV', 'vbrDssMinV'], ['extractionHints.unmappedImportantData:legacy:idssUa', 'idssUa'],
  ['extractionHints.unmappedImportantData:legacy:igssNa', 'igssNa'], ['extractionHints.unmappedImportantData:legacy:gateResistanceOhm', 'gateResistanceOhm'],
] as const;
for (const [path, key] of expectMapped) {
  const c = candidates.find(candidate => candidate.rawPath === path);
  if (!c || c.targetKey !== key || c.mappingStatus !== 'mapped') throw new Error(`real JSON 自动映射失败: ${path} -> ${key}`);
}
const thermalCanonical = candidates.find(candidate => candidate.rawPath === 'thermalParams.rthJc');
if (!thermalCanonical || thermalCanonical.targetKey !== 'rthJcCPerW') throw new Error('历史 JSON 的 thermalResistanceCPerW 未自动迁移到 canonical rthJcCPerW');
const derivedCgd = candidates.find(c => c.rawPath === 'capacitanceParams.crss→cgdPf');
if (!derivedCgd || derivedCgd.sourceType !== 'DERIVED' || derivedCgd.mappingStatus !== 'mapped' || derivedCgd.importable) throw new Error('Crss→Cgd 应保持为已映射但需确认的 DERIVED 候选');
const soa = candidates.find(c => c.rawPath === 'soaCurve');
if (!soa || soa.mappingStatus !== 'unmapped' || soa.importable) throw new Error('SOA 曲线不应伪造为单值可导入字段');
const legacyDuplicate = candidates.filter(c => /V\(BR\)DSS|IDSS|IGSS/i.test(c.label) || c.targetKey === 'gateResistanceOhm');
if (legacyDuplicate.length !== 4) throw new Error(`legacy 参数出现重复/丢失候选：${legacyDuplicate.length}`);
const autoIds = getAutoImportCandidateIds(candidates, {});
const payload = buildDeviceCandidateImportPayload(candidates, autoIds, {}, device.partNumber);
if (payload.invalidCandidates.length || payload.importedIds.length < 18) throw new Error(`真实 JSON 可安全直导数量异常：${payload.importedIds.length}`);
if (payload.values.cgdPf !== undefined) throw new Error('DERIVED Cgd 不应被静默自动导入');
const confirmedDerived = buildDeviceCandidateImportPayload(candidates, new Set([derivedCgd!.id]), {}, device.partNumber, undefined, new Set([derivedCgd!.id]));
if (!confirmedDerived.importedIds.includes(derivedCgd!.id) || confirmedDerived.values.cgdPf !== 66) throw new Error('工程师明确确认后，DERIVED Cgd 仍不能导入');
if (payload.values.junctionTempC !== undefined) throw new Error('Tjmax 错误写入当前结温');
console.log(`real-datasheet-mapping: PASS (candidates=${candidates.length}, autoImport=${payload.importedIds.length}, unmapped=${candidates.filter(c => c.mappingStatus !== 'mapped').length})`);
