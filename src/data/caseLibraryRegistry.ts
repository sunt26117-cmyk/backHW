export type CaseLibraryId = 'PRESETS' | 'ENGINEERING_GOLD' | 'SYSTEM_REGRESSION';

export interface CaseLibraryBoundary {
  id: CaseLibraryId;
  sourcePath: string;
  runtimeRole: string;
  allowedConsumers: string[];
  forbiddenAsCurrentFact: boolean;
  productionRelevant: boolean;
}

export const CASE_LIBRARY_BOUNDARIES: readonly CaseLibraryBoundary[] = [
  {
    id: 'PRESETS', sourcePath: 'src/data/presetScenarios.ts',
    runtimeRole: '用户可加载的典型工况；提供 context/issue 起点，不等于当前事实。',
    allowedConsumers: ['ScenarioContext', 'scenarioManager', 'Navbar', 'ScenarioManageModal'],
    forbiddenAsCurrentFact: true, productionRelevant: true,
  },
  {
    id: 'ENGINEERING_GOLD', sourcePath: 'src/data/engineeringGoldCases.ts',
    runtimeRole: 'Gold Case 检索与确定性 Pattern 回归基准；用于相似案例，不得覆盖当前输入。',
    allowedConsumers: ['aiGrounding', 'engineering gold regression'],
    forbiddenAsCurrentFact: true, productionRelevant: true,
  },
  {
    id: 'SYSTEM_REGRESSION', sourcePath: 'src/data/systemRegressionCases.ts',
    runtimeRole: '系统行为回归夹具；验证代码修改不破坏输入门禁/场景/AI Grounding 等契约。',
    allowedConsumers: ['DesignReviewRegressionView', 'npm test'],
    forbiddenAsCurrentFact: true, productionRelevant: false,
  },
];

export function getCaseLibraryBoundary(id: CaseLibraryId) {
  return CASE_LIBRARY_BOUNDARIES.find((item) => item.id === id);
}
