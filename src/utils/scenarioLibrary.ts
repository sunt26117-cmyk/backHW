import { PresetScenario } from '../types';

const ORDER_STORAGE_KEY = 'ecu_copilot_scenario_library_order_v2';

export const SCENARIO_CATEGORIES = [
  'EMC / ESD',
  '电源 / 瞬态',
  '功率 / 电机',
  '器件 / 可靠性',
  'WCCA / 精度',
  '信号完整性',
  '安全 / 项目',
  '机器人 / 机电',
  '通用',
] as const;

export type ScenarioCategory = typeof SCENARIO_CATEGORIES[number];

const DEFAULT_CATEGORY_BY_ID: Record<string, ScenarioCategory> = {
  'emc-150mhz': 'EMC / ESD',
  'emc-bci-immunity': 'EMC / ESD',
  'emc-esd-port-reset': 'EMC / ESD',
  'power-iso7637-transient': '电源 / 瞬态',
  'thermal-power-stage': '器件 / 可靠性',
  'mosfet-alternative': '器件 / 可靠性',
  'bldc-motor-drive': '功率 / 电机',
  'bldc-stall-restart': '功率 / 电机',
  'wcca-cost-conflict': 'WCCA / 精度',
  'wcca-production-calibration': 'WCCA / 精度',
  'wcca-sensor-chain': 'WCCA / 精度',
  'eol-current-sensor-drift': 'WCCA / 精度',
  'can-fd-signal-integrity': '信号完整性',
  'customer-silence': '安全 / 项目',
  'robot-joint-backlash-sto': '机器人 / 机电',
};

export function getScenarioCategory(scenario: PresetScenario): ScenarioCategory {
  if (scenario.category && SCENARIO_CATEGORIES.includes(scenario.category as ScenarioCategory)) {
    return scenario.category as ScenarioCategory;
  }
  const mapped = DEFAULT_CATEGORY_BY_ID[scenario.id];
  if (mapped) return mapped;
  const categories = scenario.issue.issueCategories || [];
  if (categories.some((item) => /EMC|ESD/i.test(item))) return 'EMC / ESD';
  if (categories.some((item) => /Power/i.test(item))) return '电源 / 瞬态';
  if (categories.some((item) => /BLDC|Motor/i.test(item))) return '功率 / 电机';
  if (categories.some((item) => /WCCA/i.test(item))) return 'WCCA / 精度';
  if (categories.some((item) => /CAN|Signal/i.test(item))) return '信号完整性';
  return '通用';
}

interface SavedOrder {
  presets?: string[];
  custom?: string[];
}

export function loadScenarioOrder(): SavedOrder {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      presets: Array.isArray(parsed?.presets) ? parsed.presets.filter((id: unknown): id is string => typeof id === 'string') : undefined,
      custom: Array.isArray(parsed?.custom) ? parsed.custom.filter((id: unknown): id is string => typeof id === 'string') : undefined,
    };
  } catch {
    return {};
  }
}

function applyOrder<T extends { id: string }>(items: T[], ids?: string[]): T[] {
  if (!ids || ids.length === 0) return items;
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const ai = rank.has(a.id) ? rank.get(a.id)! : ids.length + items.indexOf(a);
    const bi = rank.has(b.id) ? rank.get(b.id)! : ids.length + items.indexOf(b);
    return ai - bi;
  });
}

export function orderScenarios(
  presetScenarios: PresetScenario[],
  customScenarios: PresetScenario[],
): { presets: PresetScenario[]; custom: PresetScenario[] } {
  const saved = loadScenarioOrder();
  return {
    presets: applyOrder(presetScenarios, saved.presets),
    custom: applyOrder(customScenarios, saved.custom),
  };
}

export function saveScenarioOrder(kind: 'presets' | 'custom', ids: string[]): void {
  try {
    const current = loadScenarioOrder();
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ ...current, [kind]: ids }));
  } catch (err) {
    console.error('保存工况排列顺序失败:', err);
  }
}

export function resetScenarioOrder(): void {
  try {
    localStorage.removeItem(ORDER_STORAGE_KEY);
  } catch (err) {
    console.error('恢复默认工况顺序失败:', err);
  }
}
