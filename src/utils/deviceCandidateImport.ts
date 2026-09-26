import type { DeviceParameterCandidate } from './deviceParameterCandidates';
import { getAllEngineeringMeasurementFields } from './scenarioDomainEngine';
import type { MeasurementProvenance, MeasurementSource } from '../types';

export interface DeviceCandidateImportPayload {
  values: Record<string, number | string>;
  provenance: Record<string, MeasurementProvenance>;
  importedIds: string[];
  /** 已有值属于"实测/工程师输入"，受保护、拒绝覆盖。 */
  conflicts: Array<{ targetKey: string; candidateId: string; label: string }>;
  /** 已有值不是实测/工程师输入，已被当前器件规格覆盖（原值一并带出，供 UI 如实告知）。 */
  overwritten: Array<{ targetKey: string; candidateId: string; label: string; previousValue: string; previousSource: string }>;
  duplicateTargets: Array<{ targetKey: string; candidateIds: string[] }>;
  /** 同一目标字段有多条候选、但工程师已人工指定其中一条：其余让位（不再阻塞导入）。 */
  superseded: Array<{ targetKey: string; candidateId: string; label: string; keptCandidateId: string }>;
  invalidCandidates: string[];
}

let cachedTextTargetKeys: Set<string> | undefined;
/** 文本型工程字段（无单位，如器件型号/供应商/PCN 描述）：允许导入字符串值。 */
function textTargetKeys(): Set<string> {
  if (!cachedTextTargetKeys) {
    cachedTextTargetKeys = new Set(getAllEngineeringMeasurementFields().filter((f) => !f.unit).map((f) => f.key));
  }
  return cachedTextTargetKeys;
}

/**
 * 唯一写入口的取值类型判定。
 * 数值字段只收有限数字；文本字段（器件型号等）另收非空字符串。
 * 此前这里硬要求 number，导致"器件型号"这类字段即使工程师手工映射并确认也永远被静默拒绝。
 */
function isImportableValue(candidate: DeviceParameterCandidate): boolean {
  if (typeof candidate.value === 'number') return Number.isFinite(candidate.value);
  if (typeof candidate.value === 'string') {
    return candidate.value.trim() !== '' && typeof candidate.targetKey === 'string' && textTargetKeys().has(candidate.targetKey);
  }
  return false;
}

/** 实测与工程师输入受保护：datasheet 导入不得替换它们。 */
const MEASUREMENT_PROTECTED_SOURCES: ReadonlyArray<MeasurementSource> = ['USER_MEASURED', 'IMPORTED'];

/**
 * 已有值能否被"当前器件的 datasheet 导入"替换。
 *
 * 规则：
 *   ① force=true（工程师显式勾选"强制覆盖"）-> 一律可覆盖
 *   ② 有逐字段来源：USER_MEASURED / IMPORTED 保护；其余（DATASHEET/BENCHMARK/SPEC/TEXT_INFERRED/…）可覆盖
 *   ③ 没有逐字段来源：只有**明确是基准/演示场景**（场景级 BENCHMARK）才可覆盖；
 *      来源不明 或 整个场景标为人工实测 -> 保护
 *
 * 第③条刻意保守：来源不明的已有值可能是工程师手填的，宁可让他显式点"强制覆盖"，
 * 也不能因为"探测不出来源"就把它冲掉。预设/演示数据（BENCHMARK）则属于明确可覆盖，
 * 否则工程师选了当前器件、点了导入，面板上仍混着上一个演示器件的数值。
 */
export function isImportOverwritable(
  perFieldSource?: MeasurementSource,
  scenarioSource?: MeasurementSource,
  force = false,
): boolean {
  if (force) return true;
  if (perFieldSource) return !MEASUREMENT_PROTECTED_SOURCES.includes(perFieldSource);
  return scenarioSource === 'BENCHMARK';
}

/** 唯一工程写入口：再次校验映射、数值、重复目标和已有值，阻止 null/错 key/覆盖。 */

/**
 * 返回“设为当前器件”时可以无人工选择直接带入的候选：
 * 仅允许高置信度、datasheet直接值、已有明确工程映射的数值参数；
 * 曲线估读/DERIVED/未映射参数继续要求人工确认；datasheet 直接标量即使来自曲线对象的明确表格点，也可自动带入，完整曲线仍保留。
 */
export function getAutoImportCandidateIds(
  candidates: DeviceParameterCandidate[],
  existingValues?: Record<string, number | string>,
  existingProvenance?: Record<string, MeasurementProvenance>,
  scenarioValueSource?: MeasurementSource,
  force = false,
): Set<string> {
  return new Set(
    candidates
      .filter((candidate) =>
        candidate.mappingStatus === 'mapped' &&
        candidate.importable &&
        candidate.sourceType === 'DATASHEET_DIRECT' &&
        candidate.valueType !== 'ESTIMATE' &&
        candidate.confidence >= 0.9 &&
        typeof candidate.targetKey === 'string' &&
        candidate.targetKey.length > 0 &&
        typeof candidate.value === 'number' &&
        Number.isFinite(candidate.value) &&
        (existingValues?.[candidate.targetKey] == null
          || isImportOverwritable(existingProvenance?.[candidate.targetKey]?.source, scenarioValueSource, force)),
      )
      .map((candidate) => candidate.id),
  );
}

export function buildDeviceCandidateImportPayload(
  candidates: DeviceParameterCandidate[],
  selectedIds: ReadonlySet<string>,
  existingValues: Record<string, number | string> | undefined,
  deviceLabel: string,
  enteredAt = new Date().toISOString(),
  confirmedReviewIds: ReadonlySet<string> = new Set(),
  existingProvenance?: Record<string, MeasurementProvenance>,
  scenarioValueSource?: MeasurementSource,
  forceOverwriteExisting = false,
): DeviceCandidateImportPayload {
  const selected = candidates.filter(candidate => selectedIds.has(candidate.id));
  const invalidCandidates: string[] = [];
  const valid = selected.filter(candidate => {
    const ok = candidate.mappingStatus === 'mapped' && (candidate.importable || confirmedReviewIds.has(candidate.id)) &&
      typeof candidate.targetKey === 'string' && candidate.targetKey.length > 0 &&
      isImportableValue(candidate);
    if (!ok) invalidCandidates.push(candidate.id);
    return ok;
  });

  const byTarget = new Map<string, DeviceParameterCandidate[]>();
  for (const candidate of valid) {
    const key = candidate.targetKey!;
    byTarget.set(key, [...(byTarget.get(key) || []), candidate]);
  }
  const duplicateTargets: DeviceCandidateImportPayload['duplicateTargets'] = [];
  const superseded: DeviceCandidateImportPayload['superseded'] = [];
  const skippedIds = new Set<string>();
  for (const [targetKey, bucket] of byTarget) {
    if (bucket.length <= 1) continue;
    // 同一目标字段有多条候选时，**以工程师的人工决定为准**：
    // 此前无条件把整组丢掉，于是"我在·已提取但当前没有工程映射·里手工映射了 RDS(on)，却死活导不进去"——
    // 字段表那条候选同样指向 rdsOnMilliOhm，两条互相顶掉，且面板只给一个含糊的失败提示。
    const decided = bucket.filter(c => c.manuallyDecided);
    if (decided.length === 1) {
      for (const c of bucket) {
        if (c.id === decided[0].id) continue;
        skippedIds.add(c.id);
        superseded.push({ targetKey, candidateId: c.id, label: c.label, keptCandidateId: decided[0].id });
      }
      continue;
    }
    duplicateTargets.push({ targetKey, candidateIds: bucket.map(c => c.id) });
    for (const c of bucket) skippedIds.add(c.id);
  }

  const values: Record<string, number | string> = {};
  const provenance: Record<string, MeasurementProvenance> = {};
  const conflicts: DeviceCandidateImportPayload['conflicts'] = [];
  const overwritten: DeviceCandidateImportPayload['overwritten'] = [];
  const importedIds: string[] = [];

  for (const candidate of valid) {
    if (skippedIds.has(candidate.id)) continue;
    const targetKey = candidate.targetKey!;
    const existing = existingValues?.[targetKey];
    if (existing !== undefined && existing !== null && existing !== '') {
      const perFieldSource = existingProvenance?.[targetKey]?.source;
      if (!isImportOverwritable(perFieldSource, scenarioValueSource, forceOverwriteExisting)) {
        conflicts.push({ targetKey, candidateId: candidate.id, label: candidate.label });
        continue;
      }
      // 非实测来源（datasheet/基准/无 provenance 的演示值）：工程师点了导入，就用当前器件的值，
      // 但必须把原值如实带出，让 UI 告知工程师"这一项被覆盖了"。
      overwritten.push({
        targetKey, candidateId: candidate.id, label: candidate.label,
        previousValue: String(existing),
        previousSource: perFieldSource || scenarioValueSource || 'UNKNOWN',
      });
    }
    values[targetKey] = candidate.value;
    provenance[targetKey] = {
      source: (candidate.sourceType === 'DERIVED' ? 'DERIVED' : 'DATASHEET') as MeasurementSource,
      sourceLabel: `${deviceLabel} · ${candidate.sourceRef || 'datasheet'}`,
      enteredAt,
      confidencePct: Math.round(candidate.confidence * 100),
      note: candidate.note || candidate.evidence || '规格书参数候选，工程师已选择导入。',
    };
    importedIds.push(candidate.id);
  }

  return { values, provenance, importedIds, conflicts, overwritten, duplicateTargets, superseded, invalidCandidates };
}
