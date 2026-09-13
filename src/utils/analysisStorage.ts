import { CopilotAnalysisResult } from '../types';

const ANALYSIS_STORAGE_KEY = 'ecu_copilot_analysis_results_v1';

type AnalysisStore = Record<string, CopilotAnalysisResult>;

function readStore(): AnalysisStore {
  try {
    const raw = localStorage.getItem(ANALYSIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn('读取持久化分析结果失败:', err);
    return {};
  }
}

function writeStore(store: AnalysisStore): void {
  try {
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('持久化分析结果失败:', err);
  }
}

/**
 * 获取指定工况最近一次已经生成的分析结果。
 * 没有结果时返回 null，不触发任何新的 AI/专家引擎计算。
 */
export function loadAnalysisResult(scenarioId: string): CopilotAnalysisResult | null {
  if (!scenarioId) return null;
  const result = readStore()[scenarioId];
  return result && typeof result === 'object' ? result : null;
}

/**
 * 保存指定工况最近一次成功生成的分析结果。
 * 手动再次执行分析时会覆盖该工况之前的结果。
 */
export function saveAnalysisResult(
  scenarioId: string,
  result: CopilotAnalysisResult
): void {
  if (!scenarioId || !result) return;
  const store = readStore();
  store[scenarioId] = result;
  writeStore(store);
}

/**
 * 删除工况时同步删除对应分析结果，避免长期占用 localStorage。
 */
export function deleteAnalysisResult(scenarioId: string): void {
  if (!scenarioId) return;
  const store = readStore();
  if (!(scenarioId in store)) return;
  delete store[scenarioId];
  writeStore(store);
}
