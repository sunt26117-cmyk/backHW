import type { DeviceEntry } from './deviceLibrary';
import { buildVariantSummaryCandidates, buildGenericUnmappedCandidates, deriveCgdFromCrss, deriveCgs, deriveGateVoltageMin, deriveLegacyUnmappedCandidates } from './deviceCandidateAuxiliary';
import { getAllEngineeringMeasurementFields } from './scenarioDomainEngine';
import type { DomainMeasurementField } from './scenarioDomainEngine';
import { MOSFET_FIELD_TABLE, MOSFET_TARGET_CATEGORY_BY_KEY } from './mosfetFieldTable';
import { DEVICE_SPEC_FIELD_KEYS } from './deviceSpecificationSchema';
export { MOSFET_FIELD_TABLE, MOSFET_TARGET_CATEGORY_BY_KEY } from './mosfetFieldTable';

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

/**
 * 候选分类的单一规则（Prompt -> 字段表 -> MappingStatus -> UI 四边唯一依据）：
 *   DIRECT_SCALAR       datasheet 直给的单值标量        -> 可直接自动导入
 *   DERIVED_OR_ESTIMATE 派生值 / 曲线选点图估           -> 有数值，但必须工程师确认
 *   CURVE_ONLY          只有曲线或多条件，没有单值       -> 只算「已提取」，不可导入
 *   NO_MAPPING          没有安全的工程字段可承接         -> 保留为信息，不导入
 */
export type CandidateKind = 'DIRECT_SCALAR' | 'DERIVED_OR_ESTIMATE' | 'CURVE_ONLY' | 'NO_MAPPING';

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
  /** 工程师在候选面板里人工映射/确认过（用于同目标冲突时"以人的决定为准"）。 */
  manuallyDecided?: boolean;
  mappingStatus: MappingStatus;
  /** 分类结果：UI 分桶与导入闸门都只看它，不再各自判断 value 类型。 */
  candidateKind: CandidateKind;
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

const normalizeUnit = (unit?: string) => String(unit || '').replace(/μ/g, 'u').replace(/Ω/g, 'ohm').replace(/℃/g, 'C').replace(/\s+/g, '').toLowerCase();

interface ExplicitExtractionMapping {
  targetKey: string;
  sourcePath: string;
}

const ENGINEERING_FIELD_BY_KEY = new Map(getAllEngineeringMeasurementFields().map((field) => [field.key, field]));
const DEVICE_SPEC_KEY_SET = new Set<string>(DEVICE_SPEC_FIELD_KEYS);
const LEGACY_TARGET_ALIASES: Record<string, string> = {
  thermalResistanceCPerW: 'rthJcCPerW',
};

function getExplicitExtractionMappings(raw: unknown): ExplicitExtractionMapping[] {
  const mapping = rawPath(raw, 'extractionHints.mapping');
  if (!Array.isArray(mapping)) return [];
  return mapping.flatMap((item: any) => {
    const targetKey = typeof item?.targetKey === 'string' ? item.targetKey.trim() : '';
    const sourcePath = typeof item?.sourcePath === 'string' ? item.sourcePath.trim() : '';
    return targetKey && sourcePath ? [{ targetKey, sourcePath }] : [];
  });
}

function resolveTargetKey(raw: unknown, spec: FieldSpec, currentFieldKeys?: ReadonlySet<string>): string | null {
  let targetKey = spec.targetKey;
  const explicit = getExplicitExtractionMappings(raw).find((item) => item.sourcePath === spec.rawPath);

  // Crss→Cgd 仍必须走明确的 DERIVED 路径，不能把 Crss 伪装成 datasheet 直接 Cgd。
  const isCrssAsCgd = spec.rawPath === 'capacitanceParams.crss' && explicit?.targetKey === 'cgdPf';
  if (!isCrssAsCgd && explicit?.targetKey) {
    const explicitKey = LEGACY_TARGET_ALIASES[explicit.targetKey] || explicit.targetKey;
    // 新的 Device Specification 层拥有同语义的 canonical key 时，旧 extractionHints targetKey 自动迁移，
    // 避免历史 JSON 把 datasheet RθJC 再映射回“测量字段”。
    targetKey = spec.targetKey && DEVICE_SPEC_KEY_SET.has(spec.targetKey) && !DEVICE_SPEC_KEY_SET.has(explicitKey)
      && LEGACY_TARGET_ALIASES[explicitKey] === undefined
      ? spec.targetKey
      : explicitKey;
  }

  if (!targetKey) return null;
  const schemaField = ENGINEERING_FIELD_BY_KEY.get(targetKey);
  if (!schemaField) return null;
  if (spec.unit && schemaField.unit && normalizeUnit(spec.unit) !== normalizeUnit(schemaField.unit)) return null;
  if (currentFieldKeys && !currentFieldKeys.has(targetKey)) return null;
  return targetKey;
}

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
    if (points.length === 0) {
      // 规格书把 Rds(on)/Vth 给成**表格单值**而不是曲线，是完全正常的形态（真实 datasheet 通常两者都有，
      // 提取结果可能是任一种）。此前这里直接 return {}，导致该字段连候选都不生成 —— 面板永远填不上，
      // 工程师连"确认导入"的机会都没有（现场症状：RDS(on)/VGS(th) 一路空）。
      // 现在回落到读 value：仍是需要工程确认的估计候选（不自动导入），但至少可见、可一键确认。
      const scalar = finiteNumber(obj?.value);
      return scalar === undefined ? {} : { value: scalar, meta, evidence: spec.evidence };
    }
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
  const targetKey = resolveTargetKey(device.raw, spec, currentFieldKeys);
  const mappingStatus: MappingStatus =
    targetKey === null
      ? 'unmapped'
      : currentFieldKeys
        ? (currentFieldKeys.has(targetKey) ? 'mapped' : 'unmapped')
        : 'mapped';
  const sourceType = extracted.meta?.sourceType || spec.defaultSourceType;
  const valueKind = spec.valueKind || 'scalar';
  // 单一规则：先看有没有安全 target，再看有没有单值，最后看这个单值是不是"算出来的"。
  const candidateKind: CandidateKind =
    targetKey === null ? 'NO_MAPPING'
      : typeof extracted.value !== 'number' ? 'CURVE_ONLY'
        : (sourceType === 'DERIVED' || sourceType === 'DATASHEET_GRAPH_ESTIMATE' || valueKind === 'curve') ? 'DERIVED_OR_ESTIMATE'
          : 'DIRECT_SCALAR';
  // 只有 datasheet 直给的单值才允许自动写入；派生/图估必须工程师确认后才导入。
  const importable = candidateKind === 'DIRECT_SCALAR' && mappingStatus === 'mapped';

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
    sourceType,
    valueType: extracted.meta?.valueType || spec.valueType,
    confidence: safeConfidence,
    sourceRef: extracted.meta?.source,
    conditions: extracted.meta?.conditions,
    evidence: extracted.evidence || spec.evidence,
    note: extracted.meta?.note,
    importable,
    mappingStatus,
    candidateKind,
    category: spec.category,
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

  const gateMin = deriveGateVoltageMin(device, currentFieldKeys);
  if (gateMin) candidates.push(gateMin);

  const legacyCandidates = deriveLegacyUnmappedCandidates(device, currentFieldKeys);
  candidates.push(...legacyCandidates);
  candidates.push(...buildVariantSummaryCandidates(device, MOSFET_FIELD_TABLE));
  const genericCandidates = buildGenericUnmappedCandidates(device);
  const recoveredLabels = legacyCandidates.map(c => c.label);
  const duplicatePatterns = recoveredLabels.length ? [/V\(BR\)DSS/i, /IDSS/i, /IGSS/i, /gate\s+resistance|\bRG\b/i] : [];
  candidates.push(...genericCandidates.filter(c => !duplicatePatterns.some(pattern => pattern.test(c.label))));
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
