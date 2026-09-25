import type { DeviceEntry } from './deviceLibrary';
import type { CandidateSourceType, CandidateValueType, DeviceParameterCandidate, DeviceParameterCategory, FieldSpec } from './deviceParameterCandidates';

const finiteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const asSourceType = (value: unknown, fallback: CandidateSourceType): CandidateSourceType =>
  value === 'DATASHEET_DIRECT' || value === 'DATASHEET_GRAPH_ESTIMATE' || value === 'DERIVED' ? value : fallback;

const asValueType = (value: unknown, fallback: CandidateValueType): CandidateValueType => {
  const normalized = String(value ?? '').toUpperCase();
  return normalized === 'TYP' || normalized === 'MIN' || normalized === 'MAX' || normalized === 'NOMINAL' || normalized === 'ESTIMATE'
    ? normalized as CandidateValueType : fallback;
};

function rawPath(raw: unknown, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), raw);
}

const normalizeKey = (value: unknown, index: number) => {
  const slug = String(value ?? '').trim().replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || `item_${index + 1}`;
};

export function buildVariantSummaryCandidates(device: DeviceEntry, fieldTable: FieldSpec[]): DeviceParameterCandidate[] {
  const raw = device.raw as any;
  return fieldTable.flatMap(spec => {
    const obj: any = rawPath(raw, spec.rawPath);
    const variants = Array.isArray(obj?.variants) ? obj.variants.filter((v: any) => v && v.value !== null && v.value !== undefined) : [];
    if (!variants.length) return [];
    const summary = variants.map((v: any) => `${String(v.stat || 'VALUE')}=${String(v.value)}${v.unit ? ` ${v.unit}` : ''}`).join(' · ');
    return [{
      id: `${device.id}:${spec.rawPath}.variants:${variants.length}:${summary}`,
      rawPath: `${spec.rawPath}.variants`, targetKey: null, label: `${spec.label} · 其它口径`, unit: spec.unit, value: summary,
      sourceType: 'DATASHEET_DIRECT', valueType: 'ESTIMATE', confidence: Math.min(0.9, spec.defaultConfidence),
      sourceRef: variants.map((v: any) => v.source).filter(Boolean).join(' / ') || undefined, evidence: 'variants',
      note: '同一参数存在多个 typ/min/max/条件口径；仅展示摘要，原始 variants 全部保留，不自动选择某一口径导入。',
      importable: false, mappingStatus: 'unmapped', category: spec.category,
    } as DeviceParameterCandidate];
  });
}

export function buildGenericUnmappedCandidates(device: DeviceEntry): DeviceParameterCandidate[] {
  const items = (device.raw as any)?.extractionHints?.unmappedImportantData;
  if (!Array.isArray(items)) return [];
  const used = new Set<string>();
  return items.flatMap((item: any, index: number) => {
    if (!item || typeof item !== 'object') return [];
    const value = finiteNumber(item.value);
    const displayValue = value ?? (item.value == null ? undefined : String(item.value));
    if (displayValue === undefined || displayValue === '') return [];
    let rawKey = normalizeKey(item.key || item.name || item.label, index);
    if (used.has(rawKey)) rawKey = `${rawKey}_${index + 1}`;
    used.add(rawKey);
    const categoryNames: DeviceParameterCategory[] = ['功率级','静态','电容','栅极驱动','动态','热','二极管','保护/可靠性','SOA','其它'];
    return [{
      id: `${device.id}:extractionHints.unmappedImportantData.${rawKey}:${item.source || 'value'}:${String(displayValue)}`,
      rawPath: `extractionHints.unmappedImportantData.${rawKey}`, targetKey: null,
      label: String(item.label || item.name || item.key || '未映射资料参数'), unit: typeof item.unit === 'string' ? item.unit : undefined, value: displayValue,
      sourceType: asSourceType(item.sourceType, 'DATASHEET_DIRECT'), valueType: asValueType(item.stat, 'TYP'),
      confidence: Math.max(0, Math.min(1, finiteNumber(item.confidence) ?? 0.8)),
      sourceRef: typeof item.source === 'string' ? item.source : undefined,
      conditions: item.conditions && typeof item.conditions === 'object' ? item.conditions : undefined, evidence: 'extractionHints.unmappedImportantData',
      note: typeof item.note === 'string' ? item.note : 'AI 明确提取但当前模板/工程 schema 未提供安全映射。',
      importable: false, mappingStatus: 'unmapped', category: categoryNames.includes(item.category) ? item.category : '其它',
    } as DeviceParameterCandidate];
  });
}
