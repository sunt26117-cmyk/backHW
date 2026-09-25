import type { DeviceParameterCandidate } from './deviceParameterCandidates';
import type { MeasurementProvenance, MeasurementSource } from '../types';

export interface DeviceCandidateImportPayload {
  values: Record<string, number | string>;
  provenance: Record<string, MeasurementProvenance>;
  importedIds: string[];
  conflicts: Array<{ targetKey: string; candidateId: string; label: string }>;
  duplicateTargets: Array<{ targetKey: string; candidateIds: string[] }>;
  invalidCandidates: string[];
}

/** 唯一工程写入口：再次校验映射、数值、重复目标和已有值，阻止 null/错 key/覆盖。 */
export function buildDeviceCandidateImportPayload(
  candidates: DeviceParameterCandidate[],
  selectedIds: ReadonlySet<string>,
  existingValues: Record<string, number | string> | undefined,
  deviceLabel: string,
  enteredAt = new Date().toISOString(),
): DeviceCandidateImportPayload {
  const selected = candidates.filter(candidate => selectedIds.has(candidate.id));
  const invalidCandidates: string[] = [];
  const valid = selected.filter(candidate => {
    const ok = candidate.mappingStatus === 'mapped' && candidate.importable &&
      typeof candidate.targetKey === 'string' && candidate.targetKey.length > 0 &&
      typeof candidate.value === 'number' && Number.isFinite(candidate.value);
    if (!ok) invalidCandidates.push(candidate.id);
    return ok;
  });

  const byTarget = new Map<string, DeviceParameterCandidate[]>();
  for (const candidate of valid) {
    const key = candidate.targetKey!;
    byTarget.set(key, [...(byTarget.get(key) || []), candidate]);
  }
  const duplicateTargets: DeviceCandidateImportPayload['duplicateTargets'] = [];
  for (const [targetKey, bucket] of byTarget) {
    if (bucket.length > 1) duplicateTargets.push({ targetKey, candidateIds: bucket.map(c => c.id) });
  }
  const duplicateIds = new Set(duplicateTargets.flatMap(item => item.candidateIds));

  const values: Record<string, number | string> = {};
  const provenance: Record<string, MeasurementProvenance> = {};
  const conflicts: DeviceCandidateImportPayload['conflicts'] = [];
  const importedIds: string[] = [];

  for (const candidate of valid) {
    if (duplicateIds.has(candidate.id)) continue;
    const targetKey = candidate.targetKey!;
    const existing = existingValues?.[targetKey];
    if (existing !== undefined && existing !== null && existing !== '') {
      conflicts.push({ targetKey, candidateId: candidate.id, label: candidate.label });
      continue;
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

  return { values, provenance, importedIds, conflicts, duplicateTargets, invalidCandidates };
}
