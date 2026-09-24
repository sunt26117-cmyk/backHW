import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { IssueInput, PresetScenario, ProjectContext } from '../types';
import { PRESET_SCENARIOS } from '../data/presetScenarios';
import { loadCustomScenarios, saveCustomScenario, deleteCustomScenario } from '../utils/scenarioStorage';
import { orderScenarios, saveScenarioOrder, resetScenarioOrder } from '../utils/scenarioLibrary';

const CURRENT_SCENARIO_STORAGE_KEY = 'ecu_copilot_current_scenario_id';

type Toast = (text: string, type?: 'success' | 'info' | 'error') => void;

type ScenarioContextValue = {
  customScenarios: PresetScenario[];
  presetScenarios: PresetScenario[];
  currentScenarioId: string;
  currentScenario: PresetScenario | undefined;
  context: ProjectContext;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  issue: IssueInput;
  setIssue: React.Dispatch<React.SetStateAction<IssueInput>>;
  lastSavedAt: string | null;
  selectScenario: (scenarioId: string, customScenario?: PresetScenario) => PresetScenario | undefined;
  saveCurrentCustomScenario: () => void;
  saveAsCustomScenario: (title: string, ctx: ProjectContext, iss: IssueInput) => string;
  deleteCustom: (scenarioId: string) => string | undefined;
  reorder: (kind: 'presets' | 'custom', ids: string[]) => void;
  resetOrder: () => void;
};

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

function restoreInitialScenario() {
  const customs = loadCustomScenarios();
  const ordered = orderScenarios(PRESET_SCENARIOS, customs);
  let id = ordered.presets[0]?.id || PRESET_SCENARIOS[0].id;
  try {
    const savedId = localStorage.getItem(CURRENT_SCENARIO_STORAGE_KEY);
    if (savedId && [...ordered.custom, ...ordered.presets].some((s) => s.id === savedId)) id = savedId;
  } catch {}
  const found = ordered.custom.find((s) => s.id === id) || ordered.presets.find((s) => s.id === id) || ordered.presets[0];
  return { id, custom: ordered.custom, presets: ordered.presets, found: found! };
}

export function ScenarioProvider({ children, showToast }: { children: React.ReactNode; showToast?: Toast }) {
  const initial = useMemo(() => restoreInitialScenario(), []);
  const [customScenarios, setCustomScenarios] = useState<PresetScenario[]>(initial.custom);
  const [presetScenarios, setPresetScenarios] = useState<PresetScenario[]>(initial.presets);
  const [currentScenarioId, setCurrentScenarioId] = useState(initial.id);
  const [context, setContext] = useState<ProjectContext>(initial.found.context);
  const [issue, setIssue] = useState<IssueInput>(initial.found.issue);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(CURRENT_SCENARIO_STORAGE_KEY, currentScenarioId); } catch {}
  }, [currentScenarioId]);

  useEffect(() => {
    const isCustom = customScenarios.some((s) => s.id === currentScenarioId);
    if (!isCustom) return;
    const timer = setTimeout(() => {
      const target = customScenarios.find((s) => s.id === currentScenarioId);
      if (!target) return;
      const updated = saveCustomScenario({
        ...target,
        title: context.projectName || target.title,
        subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
        context,
        issue,
      });
      setCustomScenarios(updated);
      setLastSavedAt(new Date().toLocaleTimeString());
    }, 400);
    return () => clearTimeout(timer);
  }, [context, issue, currentScenarioId]);

  const selectScenario = (scenarioId: string, customScenario?: PresetScenario) => {
    const found = customScenario || customScenarios.find((s) => s.id === scenarioId) || presetScenarios.find((s) => s.id === scenarioId);
    if (!found) return undefined;
    setCurrentScenarioId(scenarioId);
    setContext(found.context);
    setIssue(customScenario ? found.issue : { ...found.issue, measuredValueSource: found.issue.measuredValueSource || 'BENCHMARK' });
    const freshCustoms = loadCustomScenarios();
    setCustomScenarios(orderScenarios(PRESET_SCENARIOS, freshCustoms).custom);
    return found;
  };

  const saveCurrentCustomScenario = () => {
    const target = customScenarios.find((s) => s.id === currentScenarioId);
    if (!target) return;
    const updatedItem = {
      ...target,
      title: context.projectName || target.title,
      subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
      context,
      issue,
    };
    const updatedList = saveCustomScenario(updatedItem);
    setCustomScenarios(updatedList);
    saveScenarioOrder('custom', updatedList.map((item) => item.id));
    const time = new Date().toLocaleTimeString();
    setLastSavedAt(time);
    showToast?.(`已成功保存当前工程【${updatedItem.title}】修改 (${time})`, 'success');
  };

  const saveAsCustomScenario = (title: string, ctx: ProjectContext, iss: IssueInput) => {
    const id = `custom_${Date.now()}`;
    const item: PresetScenario = { id, title, subtitle: `${ctx.projectPhase} 阶段 | ${ctx.asilLevel} | ${ctx.productType}`, icon: '⭐️', context: ctx, issue: iss, isCustom: true, createdAt: new Date().toISOString() };
    const updated = saveCustomScenario(item);
    saveScenarioOrder('custom', updated.map((x) => x.id));
    setCustomScenarios(updated);
    setCurrentScenarioId(id);
    setContext(ctx);
    setIssue(iss);
    setLastSavedAt(new Date().toLocaleTimeString());
    return id;
  };

  const deleteCustom = (scenarioId: string) => {
    const target = customScenarios.find((s) => s.id === scenarioId);
    const updated = deleteCustomScenario(scenarioId);
    setCustomScenarios(updated);
    if (currentScenarioId === scenarioId) {
      const fallback = presetScenarios[0];
      setCurrentScenarioId(fallback.id);
      setContext(fallback.context);
      setIssue(fallback.issue);
    }
    return target?.title;
  };

  const reorder = (kind: 'presets' | 'custom', ids: string[]) => {
    saveScenarioOrder(kind, ids);
    const ordered = orderScenarios(PRESET_SCENARIOS, customScenarios);
    setPresetScenarios(ordered.presets);
    setCustomScenarios(ordered.custom);
    showToast?.(kind === 'presets' ? '典型工况顺序已保存' : '我的工况顺序已保存', 'success');
  };

  const resetOrder = () => {
    resetScenarioOrder();
    const ordered = orderScenarios(PRESET_SCENARIOS, customScenarios);
    setPresetScenarios(ordered.presets);
    setCustomScenarios(ordered.custom);
    showToast?.('已恢复系统默认工况分类与顺序', 'info');
  };

  const value = {
    customScenarios, presetScenarios, currentScenarioId,
    currentScenario: customScenarios.find((s) => s.id === currentScenarioId) || presetScenarios.find((s) => s.id === currentScenarioId),
    context, setContext, issue, setIssue, lastSavedAt,
    selectScenario, saveCurrentCustomScenario, saveAsCustomScenario, deleteCustom, reorder, resetOrder,
  };
  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario() {
  const value = useContext(ScenarioContext);
  if (!value) throw new Error('useScenario must be used inside ScenarioProvider');
  return value;
}
