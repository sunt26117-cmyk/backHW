import type { DeviceEntry } from './deviceLibrary';
import type { CandidateSourceType, CandidateValueType, DeviceParameterCandidate, DeviceParameterCategory, FieldSpec, MappingStatus } from './deviceParameterCandidates';
import { MOSFET_FIELD_TABLE } from './mosfetFieldTable';

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


export function deriveCgdFromCrss(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate | null {
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
    // DERIVED 只能进入“需确认”区，不能静默写入工程。
    importable: false,
    mappingStatus,
    candidateKind: 'DERIVED_OR_ESTIMATE',
    category: '电容',
  };
}

export function deriveCgs(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate | null {
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
    // DERIVED 只能进入“需确认”区，不能静默写入工程。
    importable: false,
    mappingStatus,
    candidateKind: 'DERIVED_OR_ESTIMATE',
    category: '电容',
  };
}


export function deriveGateVoltageMin(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate | null {
  const obj = rawPath(device.raw, 'protectionAndRobustness.gateVoltageMax') as any;
  const variants = Array.isArray(obj?.variants) ? obj.variants : [];
  const negative = variants
    .map((variant: any) => ({ value: finiteNumber(variant?.value), source: variant?.source, confidence: finiteNumber(variant?.confidence) }))
    .filter((item: { value?: number }): item is { value: number; source?: unknown; confidence?: number } => item.value !== undefined && item.value < 0);
  if (!negative.length) return null;
  const selected = negative.reduce((a: { value: number; source?: unknown; confidence?: number }, b: { value: number; source?: unknown; confidence?: number }) => a.value < b.value ? a : b);
  const mappingStatus: MappingStatus = currentFieldKeys?.has('gateVoltageMinV') ? 'mapped' : currentFieldKeys ? 'unmapped' : 'mapped';
  return {
    id: `${device.id}:protectionAndRobustness.gateVoltageMax|min-variant:${selected.value}`,
    rawPath: 'protectionAndRobustness.gateVoltageMax|min-variant',
    targetKey: currentFieldKeys && !currentFieldKeys.has('gateVoltageMinV') ? null : 'gateVoltageMinV',
    label: 'Gate 电压最小值（负向额定）', unit: 'V', value: selected.value,
    sourceType: 'DATASHEET_DIRECT', valueType: 'MIN',
    confidence: Math.max(0.9, Math.min(1, selected.confidence ?? 0.98)),
    sourceRef: typeof selected.source === 'string' ? selected.source : undefined,
    conditions: obj?.conditions && typeof obj.conditions === 'object' ? obj.conditions : undefined,
    evidence: 'protectionAndRobustness.gateVoltageMax.variants MIN',
    note: '从 VGS 正向额定对象的负向 MIN variant 恢复；保留为独立 Gate 最小额定值，不与当前 Gate 驱动实测值混用。',
    // 这个值本身取自 datasheet（负向 variant），但工程 targetKey 是从 variants 恢复出来的派生映射，
    // 属于「需工程确认」，不能自动写入；字段不存在时退化为无安全映射。
    importable: false,
    mappingStatus,
    candidateKind: mappingStatus === 'mapped' ? 'DERIVED_OR_ESTIMATE' : 'NO_MAPPING',
    category: '保护/可靠性',
  };
}

export function deriveLegacyUnmappedCandidates(device: DeviceEntry, currentFieldKeys?: ReadonlySet<string>): DeviceParameterCandidate[] {
  const items = (device.raw as any)?.extractionHints?.unmappedImportantData;
  if (!Array.isArray(items)) return [];
  const structuredPresent: Record<string, string> = {
    vbrDssMinV: 'staticParams.vbrDss', idssUa: 'staticParams.idss', igssNa: 'staticParams.igss', gateResistanceOhm: 'staticParams.gateResistance',
  };
  const specs = [
    { match: /V\(BR\)DSS/i, key: 'vbrDssMinV', label: 'V(BR)DSS 最小击穿电压', unit: 'V', category: '功率级' as DeviceParameterCategory, stat: 'MIN' as CandidateValueType,
      parse: (text: string) => nums(text, /min\s*(\d+(?:\.\d+)?)\s*V/gi, Math.min), note: '从多条件文本恢复跨条件最小值；原始条件仍保留。' },
    { match: /IDSS/i, key: 'idssUa', label: 'IDSS 漏极漏电（跨条件最大值）', unit: 'μA', category: '静态' as DeviceParameterCategory, stat: 'MAX' as CandidateValueType,
      parse: (text: string) => nums(text, /max\s*(\d+(?:\.\d+)?)\s*(?:μA|uA)/gi, Math.max), note: '从多条件 MAX 中取最大值作为保守上界；完整条件仍保留。' },
    { match: /IGSS/i, key: 'igssNa', label: 'IGSS 栅极漏电（跨条件最大值）', unit: 'nA', category: '栅极驱动' as DeviceParameterCategory, stat: 'MAX' as CandidateValueType,
      parse: (text: string) => nums(text, /max\s*(\d+(?:\.\d+)?)\s*nA/gi, Math.max), note: '从多条件 MAX 中取最大值作为保守上界。' },
    { match: /RG\s+gate\s+resistance|gate resistance/i, key: 'gateResistanceOhm', label: '内部 Gate 电阻 RG(int)', unit: 'Ω', category: '栅极驱动' as DeviceParameterCategory, stat: 'TYP' as CandidateValueType,
      parse: (text: string) => { const m = text.match(/typ\s*(\d+(?:\.\d+)?)\s*Ω/i); return m ? Number(m[1]) : undefined; }, note: '从 extractionHints 文本恢复 TYP；完整 MIN/MAX 条件仍保留。' },
  ];
  return specs.flatMap((spec) => {
    if (rawPath(device.raw, structuredPresent[spec.key]) != null) return [];
    const item = items.find((entry: any) => spec.match.test(String(entry?.item || entry?.label || entry?.name || entry?.key || '')));
    if (!item) return [];
    const value = spec.parse(String(item?.value ?? ''));
    if (value === undefined) return [];
    const mapped = !currentFieldKeys || currentFieldKeys.has(spec.key);
    return [{
      id: `${device.id}:extractionHints.unmappedImportantData:legacy:${spec.key}:${value}`,
      rawPath: `extractionHints.unmappedImportantData:legacy:${spec.key}`, targetKey: mapped ? spec.key : null,
      label: spec.label, unit: spec.unit, value, sourceType: 'DATASHEET_DIRECT', valueType: spec.stat, confidence: 0.9,
      sourceRef: typeof item?.source === 'string' ? item.source : undefined,
      evidence: 'extractionHints.unmappedImportantData → legacy scalar recovery',
      note: `${spec.note}${item?.note ? ` ${String(item.note)}` : ''}`,
      importable: mapped, mappingStatus: mapped ? 'mapped' : 'unmapped', category: spec.category,
    } as DeviceParameterCandidate];
  });
}

function nums(text: string, pattern: RegExp, reducer: (a: number, b: number) => number): number | undefined {
  const values = [...text.matchAll(pattern)].map((m) => Number(m[1])).filter(Number.isFinite);
  return values.length ? values.reduce(reducer) : undefined;
}
