import type { CopilotAnalysisResult } from '../types';
import { isPersistedAnalysisResult } from '../adapters/analysisResultAdapter';
import {
  deletePersistedAnalysis,
  readPersistedAnalysis,
  writePersistedAnalysis,
} from '../adapters/analysisStorageAdapter';

/**
 * Compatibility facade kept for existing callers.
 * The persistence format itself lives under src/adapters and is intentionally
 * decoupled from the runtime result model.
 */
export function loadAnalysisResult(scenarioId: string): CopilotAnalysisResult | null {
  const value = readPersistedAnalysis(scenarioId);
  return isPersistedAnalysisResult(value) ? value : null;
}

export function saveAnalysisResult(scenarioId: string, result: CopilotAnalysisResult): void {
  writePersistedAnalysis(scenarioId, result);
}

export function deleteAnalysisResult(scenarioId: string): void {
  deletePersistedAnalysis(scenarioId);
}
