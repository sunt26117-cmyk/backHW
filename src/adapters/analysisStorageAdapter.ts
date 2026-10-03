import { readAnalysisResultRecord } from './analysisResultRecordAdapter';
import type { AnalysisResultRecordMetadata } from '../types';

/**
 * WP10 persistence boundary.
 *
 * The payload stays opaque to storage, while the envelope carries the same
 * immutable record identity used by the runtime result and backup/export flow.
 */
const ANALYSIS_STORAGE_KEY = 'ecu_copilot_analysis_results_v2';
const STORAGE_FORMAT = 'autohw.analysis-record';
const STORAGE_VERSION = 2 as const;
const LEGACY_ENVELOPE_VERSION = 1 as const;

type PersistedStore = Record<string, unknown>;

interface PersistedEnvelopeV2 {
  format: typeof STORAGE_FORMAT;
  version: typeof STORAGE_VERSION;
  savedAt: string;
  record: AnalysisResultRecordMetadata;
  payload: unknown;
}

interface PersistedEnvelopeV1 {
  format: typeof STORAGE_FORMAT;
  version: typeof LEGACY_ENVELOPE_VERSION;
  savedAt: string;
  payload: unknown;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readStore(): PersistedStore {
  try {
    const raw = storage()?.getItem(ANALYSIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PersistedStore
      : {};
  } catch (err) {
    console.warn('读取持久化分析结果失败:', err);
    return {};
  }
}

function readLegacyStore(): PersistedStore {
  try {
    const raw = storage()?.getItem('ecu_copilot_analysis_results_v1');
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PersistedStore
      : {};
  } catch (err) {
    console.warn('读取旧版分析结果失败:', err);
    return {};
  }
}

function writeStore(store: PersistedStore): void {
  try {
    storage()?.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('持久化分析结果失败:', err);
  }
}

function isEnvelopeV1(value: unknown): value is PersistedEnvelopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.format === STORAGE_FORMAT && candidate.version === LEGACY_ENVELOPE_VERSION && 'payload' in candidate;
}

function isEnvelopeV2(value: unknown): value is PersistedEnvelopeV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.format === STORAGE_FORMAT
    && candidate.version === STORAGE_VERSION
    && 'payload' in candidate
    && Boolean(candidate.record && typeof candidate.record === 'object');
}

function readEnvelopePayload(value: unknown): unknown {
  if (isEnvelopeV2(value)) {
    const payloadRecord = readAnalysisResultRecord(value.payload as any);
    if (!payloadRecord) return null;
    if (
      payloadRecord.analysisId !== value.record.analysisId ||
      payloadRecord.inputHash !== value.record.inputHash ||
      payloadRecord.engineVersion !== value.record.engineVersion ||
      payloadRecord.schemaVersion !== value.record.schemaVersion
    ) {
      console.error('持久化分析结果记录元数据与 payload 不一致，拒绝恢复');
      return null;
    }
    return value.payload;
  }
  if (isEnvelopeV1(value)) return value.payload;
  return value;
}

export function readPersistedAnalysis(scenarioId: string): unknown {
  if (!scenarioId) return null;
  const current = readStore();
  if (scenarioId in current) return readEnvelopePayload(current[scenarioId]);

  // One-way compatibility read for v1 installations. New writes always use
  // the v2 envelope and never recreate the legacy storage key.
  const legacy = readLegacyStore();
  return scenarioId in legacy ? readEnvelopePayload(legacy[scenarioId]) : null;
}

export function writePersistedAnalysis(scenarioId: string, value: unknown): void {
  if (!scenarioId || value === undefined || value === null) return;
  const record = readAnalysisResultRecord(value as any);
  if (!record) throw new Error('拒绝持久化：分析结果缺少 WP10 记录元数据 (analysisId/inputHash/engineVersion)');
  const store = readStore();
  const envelope: PersistedEnvelopeV2 = {
    format: STORAGE_FORMAT,
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    record,
    payload: value,
  };
  store[scenarioId] = envelope;
  writeStore(store);
}

export function deletePersistedAnalysis(scenarioId: string): void {
  if (!scenarioId) return;
  const store = readStore();
  if (!(scenarioId in store)) return;
  delete store[scenarioId];
  writeStore(store);
}

export const ANALYSIS_STORAGE_FORMAT = {
  key: ANALYSIS_STORAGE_KEY,
  format: STORAGE_FORMAT,
  version: STORAGE_VERSION,
  legacyEnvelopeVersion: LEGACY_ENVELOPE_VERSION,
} as const;
