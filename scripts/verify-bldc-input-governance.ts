import { buildDeviceParameterCandidates } from '../src/utils/deviceParameterCandidates';
import { isDecisionReadyValuePresent } from '../src/utils/unifiedStateExtractor';
import { mapMeasurementSourceToTraceSource } from '../src/utils/trace';
import { getBldcParameterSections, BLDC_PARAMETER_GROUPS } from '../src/utils/scenarioDomainEngine';
import type { DeviceEntry } from '../src/utils/deviceLibrary';
import type { IssueInput } from '../src/types';

const fields = BLDC_PARAMETER_GROUPS.flatMap(g => g.keys);
const duplicates = fields.filter((k, i) => fields.indexOf(k) !== i);
if (duplicates.length === 0) throw new Error('治理测试需要验证原始分组存在重复键，避免测试失真');

const bldcFields = BLDC_PARAMETER_GROUPS.flatMap(g => g.keys);
const fakeFields = bldcFields.map(key => ({ key, label: key, description: '', tag: 'SPEC' as const }));
const sections = getBldcParameterSections(fakeFields);
const renderedKeys = sections.flatMap(s => s.fields.map(f => f.key));
if (new Set(renderedKeys).size !== renderedKeys.length) throw new Error('BLDC 参数分组仍存在重复显示');
if (new Set(renderedKeys).size !== new Set(bldcFields).size) throw new Error('BLDC 参数分组有字段丢失');

const baseIssue = {
  issueCategories: [], requirement: '', actualMeasurement: '', testCondition: '', environment: '',
  failurePhenomenon: '', engineeringConcern: '', notes: '', measuredValues: { cgdPf: 45 },
  measurementProvenance: { cgdPf: { source: 'TEXT_INFERRED' as const } }, measuredValueSource: 'IMPORTED' as const,
} as unknown as IssueInput;
if (isDecisionReadyValuePresent(baseIssue, 'cgdPf')) throw new Error('TEXT_INFERRED 不应进入确定性判据');
const approved = { ...baseIssue, measurementProvenance: { cgdPf: { source: 'DATASHEET' as const } } };
if (!isDecisionReadyValuePresent(approved, 'cgdPf')) throw new Error('DATASHEET 应可进入规格字段确定性判据');
if (mapMeasurementSourceToTraceSource('DATASHEET') !== 'DATASHEET') throw new Error('DATASHEET Trace 来源丢失');
if (mapMeasurementSourceToTraceSource('TEXT_INFERRED') !== 'TEXT_INFERRED') throw new Error('TEXT_INFERRED Trace 来源丢失');

const device: DeviceEntry = {
  id: 'governance_test', deviceType: 'MOSFET', partNumber: 'TEST', manufacturer: 'T', package: 'QFN', aecqGrade: '', channelType: 'N-CH', createdAt: '', updatedAt: '',
  raw: {
    maxRatings: { vds: { value: 40, stat: 'MAX', source: 'Table 1' }, easPulse: { value: 100, stat: 'MAX', source: 'Table 2' } },
    staticParams: { vth: { points: [{x:25,y:2}], stat: 'MIN', sourceType: 'DATASHEET_GRAPH_ESTIMATE', source: 'Fig. 1' } },
    capacitanceParams: { ciss: { value: 1000 }, crss: { points: [{x:25,y:45}], sourceType: 'DATASHEET_GRAPH_ESTIMATE', source: 'Fig. 2' } },
    gateCharge: { qg: { value: 20, stat: 'TYP', source: 'Table 3' } },
    switchingParams: { tdOff: { value: 20, stat: 'TYP', source: 'Table 4' }, tf: { value: 10, stat: 'TYP', source: 'Table 4' } },
    thermalParams: { rthJa: { value: 40, stat: 'TYP', source: 'Table 5' } },
    bodyDiode: { vf: { value: 1, stat: 'TYP', source: 'Table 6' }, qrr: { value: 30, stat: 'TYP', source: 'Table 6' } },
  },
};
const candidates = buildDeviceParameterCandidates(device);
const crssCandidate = candidates.find(c => c.targetKey === 'cgdPf');
if (!crssCandidate || crssCandidate.sourceType !== 'DERIVED' || crssCandidate.confidence > 0.85) throw new Error('Crss→Cgd 近似候选未被正确降级');
if (candidates.some(c => c.targetKey === 'junctionTempC')) throw new Error('Tjmax 不应映射为当前工况 junctionTempC');
console.log(`verify-bldc-input-governance: PASS (${candidates.length} device candidates; duplicate groups safely deduped)`);
