# P2 App.tsx 重构进度

## Phase 1 — 已完成
- `AppTabRouter.tsx`：抽离 13 个 Tab 分支
- `AppModals.tsx`：抽离 6 个 Modal
- `PageErrorBoundary.tsx`：独立页面错误边界
- `EngineeringContext.tsx` / `NavigationContext.tsx`：第一阶段过渡 Context

## Phase 2 — 已完成
真正把状态从 `App.tsx` 移到三个领域 Provider：

### `ScenarioContext.tsx`
负责：
- 当前工况
- preset/custom 工况列表
- `ProjectContext`
- `IssueInput`
- 工况切换
- 自定义工况保存/删除
- 工况排序
- 自动保存

### `AnalysisContext.tsx`
负责：
- `result`
- `isAnalyzing`
- `runAnalysis`
- 分析结果持久化/恢复
- 云端 AI / 本地确定性引擎 / fallback

### `UIContext.tsx`
负责：
- activeTab
- Modal 开关
- Toast
- Theme
- Model API config

## 当前架构

```text
App
└── UIProvider
    └── ScenarioProvider
        └── AnalysisProvider
            └── AppContent
                ├── Navbar
                ├── AppTabRouter
                └── AppModals
```

## 下一阶段
不要继续把所有东西塞进 Context。下一步应检查：
1. Tab 是否还存在重复 props
2. ScenarioContext 是否需要拆成 ScenarioLibrary + EngineeringCase
3. AnalysisContext 是否需要独立 `AnalysisRunner`
4. Navbar 是否应该独立成 AppShell/Navigation 层

## Phase 4.1 — 已完成
见 `P2_PHASE4_SCENARIO_PURITY.md` 末尾：历史案例泄漏修复、purity 审计接入 `npm test`、`AppTabRouter`/`AppModals` props 瘦身。`Navbar` props 已从 23 个降到 6 个。

## Phase 4.2 — 已完成；Phase 5 — 交接给下一个执行者
示波器波形显示与指标算法修正已完成（见 P2_PHASE4_SCENARIO_PURITY.md）。结论可追溯 + 判断流程图尚未开始，交接文档：`P2_PHASE5_TRACE_AND_DIAGRAM_HANDOFF.md`。
