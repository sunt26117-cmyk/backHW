import type { DeviceEntry } from './deviceLibrary';
import { buildVariantSummaryCandidates, buildGenericUnmappedCandidates } from './deviceCandidateAuxiliary';
import type { DomainMeasurementField } from './scenarioDomainEngine';

export type CandidateSourceType = 'DATASHEET_DIRECT' | 'DATASHEET_GRAPH_ESTIMATE' | 'DERIVED';
export type CandidateValueType = 'TYP' | 'MIN' | 'MAX' | 'NOMINAL' | 'ESTIMATE';
export type MappingStatus = 'mapped' | 'unmapped' | 'ambiguous' | 'rejected';

export type DeviceParameterCategory =
  | '功率级'
  | '静态'
  | '电容'
  | '栅极驱动'
  | '动态'
  | '热'
  | '二极管'
  | '保护/可靠性'
  | 'SOA'
  | '其它';

export interface DeviceParameterCandidate {
  id: string;
  rawPath: string;
  targetKey: string | null;
  label: string;
  unit?: string;
  value: number | string;
  sourceType: CandidateSourceType;
  valueType: CandidateValueType;
  confidence: number;
  sourceRef?: string;
  conditions?: Record<string, unknown>;
  evidence?: string;
  note?: string;
  importable: boolean;
  mappingStatus: MappingStatus;
  category: DeviceParameterCategory;
}

export interface FieldSpec {
  rawPath: string;
  label: string;
  unit?: string;
  targetKey: string | null;
  category: DeviceParameterCategory;
  defaultSourceType: CandidateSourceType;
  defaultConfidence: number;
  valueType: CandidateValueType;
  /** 曲线/数组字段没有单值工程输入，只生成“已提取”信息候选。 */
  valueKind?: 'scalar' | 'curve' | 'collection';
  evidence?: string;
  note?: string;
}

/**
 * 当前 MOSFET 候选允许人工映射到哪些工程输入，以及这些字段的物理大类。
 * UI 不再维护第二份硬编码 key 列表；实际是否存在仍以当前 scenario schema 为准。
 */
export const MOSFET_TARGET_CATEGORY_BY_KEY: Record<string, DeviceParameterCategory> = {
  vdsRatingV: '功率级',
  easEnergyMj: '功率级',
  rdsOnMilliOhm: '静态',
  vthMinV: '静态',
  cgdPf: '电容',
  cgsPf: '电容',
  gateChargeQgNc: '栅极驱动',
  qgdNc: '栅极驱动',
  turnOffDelayNs: '动态',
  fallTimeNs: '动态',
  thermalResistanceCPerW: '热',
  rthCaOrJa: '热',
  diodeForwardVoltageV: '二极管',
  qrrNc: '二极管',
  soaShortCircuitTimeUs: '保护/可靠性',
};

const normalizeUnit = (unit?: string) => String(unit || '').replace(/μ/g, 'u').replace(/Ω/g, 'ohm').replace(/℃/g, 'C').replace(/\s+/g, '').toLowerCase();

export function getMosfetMappingOptions(
  candidate: Pick<DeviceParameterCandidate, 'category' | 'targetKey' | 'unit'>,
  currentFields: DomainMeasurementField[],
): DomainMeasurementField[] {
  const candidateUnit = normalizeUnit(candidate.unit);
  return currentFields.filter((field) => {
    if (field.key === candidate.targetKey || MOSFET_TARGET_CATEGORY_BY_KEY[field.key] !== candidate.category) return false;
    const fieldUnit = normalizeUnit(field.unit);
    return Boolean(candidateUnit && fieldUnit && candidateUnit === fieldUnit);
  });
}

export const MOSFET_FIELD_TABLE: FieldSpec[] = [
  { rawPath: 'maxRatings.vds', label: 'Vds 额定耐压', unit: 'V', targetKey: 'vdsRatingV', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'MaxRatings.VDS' },
  { rawPath: 'maxRatings.id', label: '连续漏极电流 ID', unit: 'A', targetKey: null, category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.ID' },
  { rawPath: 'maxRatings.idPulse', label: '脉冲漏极电流 ID(pulse)', unit: 'A', targetKey: null, category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.ID(pulse)' },
  { rawPath: 'maxRatings.tjMax', label: '最大结温 Tjmax', unit: '℃', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'MaxRatings.TJmax', note: '不得映射为当前工况 junctionTempC；它是器件能力边界。' },
  { rawPath: 'maxRatings.tstg', label: '存储温度 Tstg', unit: '℃', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', valueKind: 'collection', evidence: 'MaxRatings.Tstg', note: '保留绝对存储温度边界，不映射当前工况温度。' },
  { rawPath: 'maxRatings.powerDissipation', label: '最大耗散功率 PD', unit: 'W', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.PD' },
  { rawPath: 'maxRatings.easPulse', label: '单脉冲雪崩能量 EAS', unit: 'mJ', targetKey: 'easEnergyMj', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.96, valueType: 'MAX', evidence: 'MaxRatings.EAS' },
  { rawPath: 'maxRatings.easCurrent', label: '雪崩电流 EAS current', unit: 'A', targetKey: null, category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'MaxRatings.EAS current' },
  { rawPath: 'soaCurve', label: 'SOA 安全工作区曲线', targetKey: null, category: 'SOA', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'collection', evidence: 'SOA curves', note: '完整 SOA 曲线保留在器件库；当前工程没有单值字段可直接承载。' },

  { rawPath: 'staticParams.rdsOn', label: 'Rds(on)（曲线选点）', unit: 'mΩ', targetKey: 'rdsOnMilliOhm', category: '静态', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.82, valueType: 'TYP', valueKind: 'curve', evidence: 'Rds(on) vs Tj 曲线选点', note: '当前工程字段是单值，完整曲线继续保留在器件库。' },
  { rawPath: 'staticParams.vth', label: 'Vgs 阈值 Vth（曲线选点）', unit: 'V', targetKey: 'vthMinV', category: '静态', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.82, valueType: 'MIN', valueKind: 'curve', evidence: 'Vth vs Tj 曲线选点', note: '曲线估读不得冒充保证值。' },
  { rawPath: 'staticParams.bodyChannelCurrent', label: '体沟道电流能力', unit: 'A', targetKey: null, category: '静态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.90, valueType: 'TYP', evidence: 'Static body-channel current' },

  { rawPath: 'capacitanceParams.ciss', label: '输入电容 Ciss', unit: 'pF', targetKey: null, category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Ciss' },
  { rawPath: 'capacitanceParams.coss', label: '输出电容 Coss', unit: 'pF', targetKey: null, category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Coss' },
  { rawPath: 'capacitanceParams.crss', label: '反向传输电容 Crss（曲线）', unit: 'pF', targetKey: null, category: '电容', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'TYP', valueKind: 'curve', evidence: 'Capacitance Crss curve', note: '保留原始 Crss 名称，不自动伪装成 Cgd。' },
  { rawPath: 'capacitanceParams.cgdDirect', label: '直接给出的 Cgd', unit: 'pF', targetKey: 'cgdPf', category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Cgd' },

  { rawPath: 'gateCharge.qg', label: '总栅电荷 Qg', unit: 'nC', targetKey: 'gateChargeQgNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.96, valueType: 'TYP', evidence: 'Gate charge Qg' },
  { rawPath: 'gateCharge.qgs', label: '栅源电荷 Qgs', unit: 'nC', targetKey: null, category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Gate charge Qgs' },
  { rawPath: 'gateCharge.qgd', label: '米勒电荷 Qgd', unit: 'nC', targetKey: 'qgdNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Gate charge Qgd' },
  { rawPath: 'gateCharge.qsw', label: '开关电荷 Qsw', unit: 'nC', targetKey: null, category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Gate charge Qsw' },
  { rawPath: 'gateCharge.gatePlateauV', label: '栅极平台电压', unit: 'V', targetKey: null, category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Gate plateau voltage' },
  { rawPath: 'gateCharge.gateChargeCurve', label: '栅极电荷曲线', targetKey: null, category: '栅极驱动', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'curve', evidence: 'Gate charge curve', note: '完整曲线保留在器件库。' },

  { rawPath: 'switchingParams.tr', label: '上升时间 tr', unit: 'ns', targetKey: null, category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tdOn', label: '开通延迟 td(on)', unit: 'ns', targetKey: null, category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tdOff', label: '关断延迟 td(off)', unit: 'ns', targetKey: 'turnOffDelayNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tf', label: '下降时间 tf', unit: 'ns', targetKey: 'fallTimeNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.dvdtCapability', label: 'dv/dt 能力', unit: 'V/ns', targetKey: null, category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'dv/dt capability' },
  { rawPath: 'switchingParams.didtCapability', label: 'di/dt 能力', unit: 'A/ns', targetKey: null, category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'di/dt capability' },

  { rawPath: 'thermalParams.rthJc', label: 'RθJC', unit: '℃/W', targetKey: 'thermalResistanceCPerW', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.90, valueType: 'MAX', evidence: 'Thermal resistance junction-to-case' },
  { rawPath: 'thermalParams.rthJa', label: 'RθJA', unit: '℃/W', targetKey: 'rthCaOrJa', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.80, valueType: 'TYP', evidence: 'Thermal resistance junction-to-ambient', note: '强依赖 PCB/铜箔/散热条件，不能直接等同任意 ECU 装配状态。' },
  { rawPath: 'thermalParams.zthJc', label: 'ZθJC(t) 瞬态热阻曲线', unit: '℃/W', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'curve', evidence: 'Transient thermal impedance curve', note: '完整瞬态热阻曲线保留在器件库。' },

  { rawPath: 'bodyDiode.vf', label: '体二极管 Vf', unit: 'V', targetKey: 'diodeForwardVoltageV', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode forward voltage' },
  { rawPath: 'bodyDiode.qrr', label: '反向恢复电荷 Qrr', unit: 'nC', targetKey: 'qrrNc', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode reverse recovery charge' },
  { rawPath: 'bodyDiode.trr', label: '反向恢复时间 trr', unit: 'ns', targetKey: null, category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode reverse recovery time' },
  { rawPath: 'bodyDiode.irrM', label: '反向恢复峰值电流 IrrM', unit: 'A', targetKey: null, category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Body diode reverse recovery current' },

  { rawPath: 'protectionAndRobustness.shortCircuitTime', label: '短路耐受时间', unit: 'μs', targetKey: 'soaShortCircuitTimeUs', category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'Short-circuit withstand', note: '可映射到 P016 的 SOA/短路耐受时间；仍须核对 datasheet 测试 VDS/VGS/Tj 条件。' },
  { rawPath: 'protectionAndRobustness.gateVoltageMax', label: 'Gate 电压上限', unit: 'V', targetKey: null, category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'Gate voltage maximum' },
  { rawPath: 'protectionAndRobustness.esdRating', label: 'ESD 等级', unit: 'kV', targetKey: null, category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'ESD rating' },
];

const finiteNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const asSourceType = (v: unknown, fallback: CandidateSourceType): CandidateSourceType =>
  v === 'DATASHEET_DIRECT' || v === 'DATASHEET_GRAPH_ESTIMATE' || v === 'DERIVED' ? v : fallback;

const asValueType = (v: unknown, fallback: CandidateValueType): CandidateValueType => {
  const normalized = String(v ?? '').toUpperCase();
  return normalized === 'TYP' || normalized === 'MIN' || normalized === 'MAX' || normalized === 'NOMINAL' || normalized === 'ESTIMATE'
    ? normalized as CandidateValueType
    : fallback;
};

function rawPath(raw: unknown, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), raw);
}

function objectMeta(obj: any, spec: FieldSpec) {
  return {
    sourceType: asSourceType(obj?.sourceType, spec.defaultSourceType),
    valueType: asValueType(obj?.stat, spec.valueType),
    source: typeof obj?.source === 'string' ? obj.source : undefined,
    conditions: obj?.conditions && typeof obj.conditions === 'object' ? obj.conditions as Record<string, unknown> : undefined,
    confidence: finiteNumber(obj?.confidence) ?? spec.defaultConfidence,
    note: typeof obj?.note === 'string' ? obj.note : spec.note,
  };
}

function valueForSpec(raw: unknown, spec: FieldSpec): { value?: number | string; meta?: ReturnType<typeof objectMeta>; evidence?: string } {
  const obj: any = rawPath(raw, spec.rawPath);
  if (obj == null) return {};

  const meta = objectMeta(obj, spec);
  if (spec.valueKind === 'curve') {
    const points = Array.isArray(obj?.points) ? obj.points : [];
    if (points.length === 0) return {};
    if (spec.rawPath === 'staticParams.rdsOn' || spec.rawPath === 'staticParams.vth') {
      const point = points.find((p: any) => Number(p?.x) === 25) || points[0];
      const y = finiteNumber(point?.y);
      return y === undefined ? {} : { value: y, meta: { ...meta, conditions: { ...(meta.conditions || {}), tj: point?.x } }, evidence: spec.evidence };
    }
    return {
      value: `曲线已提取 · ${points.length} 点`,
      meta,
      evidence: spec.evidence,
    };
  }
  if (spec.valueKind === 'collection') {
    if (spec.rawPath === 'maxRatings.tstg') {
      const min = finiteNumber(obj?.minValue);
      const max = finiteNumber(obj?.maxValue);
      if (min === undefined && max === undefined) return {};
      const value = min !== undefined && max !== undefined ? `${min} ~ ${max}` : `${min ?? max}`;
      return { value: `Tstg ${value}`, meta, evidence: spec.evidence };
    }
    const curves = Array.isArray(obj?.curves) ? obj.curves : [];
    if (curves.length === 0) return {};
    const pointCount = curves.reduce((n: number, c: any) => n + (Array.isArray(c?.points) ? c.points.length : 0), 0);
    return { value: `SOA 已提取 · ${curves.length} 条曲线 / ${pointCount} 点`, meta, evidence: spec.evidence };
  }
  const value = finiteNumber(obj?.value);
  return value === undefined ? {} : { value, meta, evidence: spec.evidence };
}

function makeCandidate(
  device: DeviceEntry,
  spec: FieldSpec,
  extracted: { value: number | string; meta?: ReturnType<typeof objectMeta>; evidence?: string },
  currentFieldKeys?: ReadonlySet<string>,
): DeviceParameterCandidate {
  const targetKey = spec.targetKey;
  const mappingStatus: MappingStatus =
    targetKey === null
      ? 'unmapped'
      : currentFieldKeys
        ? (currentFieldKeys.has(targetKey) ? 'mapped' : 'unmapped')
        : 'mapped';
  const importable = targetKey !== null
    && mappingStatus === 'mapped'
    && typeof extracted.value === 'number';

  const rawConfidence = extracted.meta?.confidence ?? spec.defaultConfidence;
  const safeConfidence = Math.max(
    0,
    Math.min(
      extracted.meta?.sourceType === 'DATASHEET_GRAPH_ESTIMATE' ? 0.85 : 1,
      rawConfidence,
    ),
  );

  return {
    id: `${device.id}:${spec.rawPath}:${extracted.meta?.source || 'value'}:${String(extracted.value)}`,
    rawPath: spec.rawPath,
    targetKey,
    label: spec.label,
    unit: spec.unit,
    value: extracted.value,
    sourceType: extracted.meta?.sourceType || spec.defaultSourceType,
    valueType: extracted.meta?.valueType || spec.valueType,
    confidence: safeConfidence,
    sourceRef: extracted.meta?.source,
    conditions: extracted.meta?.conditions,
    evidence: extracted.evidence || spec.evidence,
    note: extracted.meta?.note,
    importable,
    mappingStatus,
    category: spec.category,
  };
}

function deriveCgdFromCrss(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate | null {
  const cgdSpec = MOSFET_FIELD_TABLE.find(s => s.rawPath === 'capacitanceParams.cgdDirect');
  if (!cgdSpec) return null;
  const cgdDirect = rawPath(device.raw, cgdSpec.rawPath) as any;
  if (finiteNumber(cgdDirect?.value) !== undefined) return null;

  const crss = rawPath(device.raw, 'capacitanceParams.crss') as any;
  const points = Array.isArray(crss?.points) ? crss.points : [];
  const point = points.find((p: any) => Number(p?.x) === 25) || points[0];
  const value = finiteNumber(point?.y);
  if (value === undefined) return null;

  const mappingStatus: MappingStatus = currentFieldKeys?.has('cgdPf') ? 'mapped' : currentFieldKeys ? 'unmapped' : 'mapped';
  return {
    id: `${device.id}:capacitanceParams.crss→cgdPf:${crss?.source || 'derived'}:${value}`,
    rawPath: 'capacitanceParams.crss→cgdPf',
    targetKey: 'cgdPf',
    label: 'Cgd 候选（由 Crss 近似）',
    unit: 'pF',
    value,
    sourceType: 'DERIVED',
    valueType: 'ESTIMATE',
    confidence: 0.72,
    sourceRef: typeof crss?.source === 'string' ? crss.source : undefined,
    conditions: { ...(crss?.conditions || {}), vds: point?.x },
    evidence: 'Crss 曲线选点 → Cgd 工程近似候选',
    note: '这是工程近似，不是 datasheet 直接 Cgd；必须由工程师确认后再进入工程输入。',
    importable: mappingStatus === 'mapped',
    mappingStatus,
    category: '电容',
  };
}

function deriveCgs(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate | null {
  const ciss = rawPath(device.raw, 'capacitanceParams.ciss') as any;
  const crss = rawPath(device.raw, 'capacitanceParams.crss') as any;
  const cissValue = finiteNumber(ciss?.value);
  const points = Array.isArray(crss?.points) ? crss.points : [];
  const point = points.find((p: any) => Number(p?.x) === 25) || points[0];
  const crssValue = finiteNumber(point?.y);
  if (cissValue === undefined || crssValue === undefined || cissValue <= crssValue) return null;

  const mappingStatus: MappingStatus = currentFieldKeys?.has('cgsPf') ? 'mapped' : currentFieldKeys ? 'unmapped' : 'mapped';
  return {
    id: `${device.id}:capacitanceParams.ciss-crss→cgsPf:${cissValue}:${crssValue}`,
    rawPath: 'capacitanceParams.ciss-crss→cgsPf',
    targetKey: 'cgsPf',
    label: 'Cgs（Ciss - Crss 派生）',
    unit: 'pF',
    value: cissValue - crssValue,
    sourceType: 'DERIVED',
    valueType: 'ESTIMATE',
    confidence: 0.70,
    sourceRef: ciss?.source || crss?.source,
    conditions: { ...(ciss?.conditions || {}), vds: point?.x },
    evidence: 'Ciss - Crss 派生候选',
    note: '仅作为工程近似候选，不是 datasheet 直接 Cgs。',
    importable: mappingStatus === 'mapped',
    mappingStatus,
    category: '电容',
  };
}

export function buildDeviceParameterCandidates(
  device: DeviceEntry,
  currentFieldKeys?: ReadonlySet<string>,
): DeviceParameterCandidate[] {
  const candidates: DeviceParameterCandidate[] = [];

  for (const spec of MOSFET_FIELD_TABLE) {
    const extracted = valueForSpec(device.raw, spec);
    if (!extracted.value && extracted.value !== 0) continue;
    candidates.push(makeCandidate(device, spec, extracted as { value: number | string; meta?: ReturnType<typeof objectMeta>; evidence?: string }, currentFieldKeys));
  }

  const cgd = deriveCgdFromCrss(device, currentFieldKeys);
  if (cgd) candidates.push(cgd);

  const cgs = deriveCgs(device, currentFieldKeys);
  if (cgs) candidates.push(cgs);

  candidates.push(...buildVariantSummaryCandidates(device, MOSFET_FIELD_TABLE));
  candidates.push(...buildGenericUnmappedCandidates(device));
  return candidates;
}

export function getCandidateSummary(candidates: DeviceParameterCandidate[]): {
  total: number;
  highConfidence: number;
  importable: number;
  mapped: number;
  unmapped: number;
} {
  return {
    total: candidates.length,
    highConfidence: candidates.filter(c => c.confidence >= 0.9).length,
    importable: candidates.filter(c => c.importable).length,
    mapped: candidates.filter(c => c.mappingStatus === 'mapped').length,
    unmapped: candidates.filter(c => c.mappingStatus !== 'mapped').length,
  };
}
