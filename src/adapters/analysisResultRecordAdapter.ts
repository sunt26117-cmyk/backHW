import type { AnalysisResultRecordMetadata, CopilotAnalysisResult } from '../types';

/**
 * WP10 · Stable analysis-result record metadata.
 *
 * Keep this separate from the legacy result field layout. A record identifies
 * exactly which input set and analysis engine produced the result, so restore,
 * persistence, export and A/B flows can make the same freshness decision.
 */
export const ANALYSIS_RESULT_RECORD_SCHEMA_VERSION = 1 as const;
export const ANALYSIS_ENGINE_VERSION = 'ECU-Hardware-Analysis-Engine-v5.0' as const;

function createAnalysisId(): string {
  try {
    const cryptoLike = globalThis.crypto as Crypto | undefined;
    if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  } catch {
    // Fall through to a local non-security identifier.
  }
  return `analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAnalysisResultRecord(inputHash: string, existing?: Partial<AnalysisResultRecordMetadata> | null): AnalysisResultRecordMetadata {
  return {
    schemaVersion: ANALYSIS_RESULT_RECORD_SCHEMA_VERSION,
    analysisId: existing?.analysisId || createAnalysisId(),
    inputHash,
    engineVersion: ANALYSIS_ENGINE_VERSION,
    generatedAt: existing?.generatedAt || new Date().toISOString(),
  };
}

export function readAnalysisResultRecord(result: CopilotAnalysisResult | null | undefined): AnalysisResultRecordMetadata | null {
  const value = result && typeof result === 'object'
    ? (result as CopilotAnalysisResult & { analysisRecord?: unknown }).analysisRecord
    : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as unknown as Record<string, unknown>;
  if (candidate.schemaVersion !== ANALYSIS_RESULT_RECORD_SCHEMA_VERSION) return null;
  if (typeof candidate.analysisId !== 'string' || !candidate.analysisId.trim()) return null;
  if (typeof candidate.inputHash !== 'string' || !candidate.inputHash.trim()) return null;
  if (typeof candidate.engineVersion !== 'string' || !candidate.engineVersion.trim()) return null;
  if (typeof candidate.generatedAt !== 'string' || !candidate.generatedAt.trim()) return null;
  return candidate as unknown as AnalysisResultRecordMetadata;
}

export function withAnalysisResultRecord(
  result: CopilotAnalysisResult,
  inputHash: string,
  existing?: AnalysisResultRecordMetadata | null,
): CopilotAnalysisResult {
  const updated = { ...result } as CopilotAnalysisResult & { analysisRecord?: AnalysisResultRecordMetadata };
  updated.analysisRecord = createAnalysisResultRecord(inputHash, existing);
  return updated;
}

export function withLegacyImportedAnalysisRecord(result: CopilotAnalysisResult, inputHash: string): CopilotAnalysisResult {
  const updated = { ...result } as CopilotAnalysisResult & { analysisRecord?: AnalysisResultRecordMetadata };
  updated.analysisRecord = {
    schemaVersion: ANALYSIS_RESULT_RECORD_SCHEMA_VERSION,
    analysisId: createAnalysisId(),
    inputHash,
    engineVersion: 'LEGACY_IMPORT_UNKNOWN',
    generatedAt: new Date().toISOString(),
  };
  return updated;
}

export function isCurrentAnalysisResultRecord(record: AnalysisResultRecordMetadata | null | undefined, inputHash: string): boolean {
  return Boolean(
    record &&
    record.schemaVersion === ANALYSIS_RESULT_RECORD_SCHEMA_VERSION &&
    record.engineVersion === ANALYSIS_ENGINE_VERSION &&
    record.inputHash === inputHash,
  );
}
