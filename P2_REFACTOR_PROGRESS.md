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

## Phase 5 — WP9 Semantic Analysis Result Contract — 已完成

`CopilotAnalysisResult` 的核心消费面已从多个 slice selector 收敛为统一 `selectAnalysisResultContract()`；兼容层仍由 `analysisResultAdapter.ts` 持有。

当前核心结果消费分层：
```text
Legacy CopilotAnalysisResult
        │
        ▼
analysisResultAdapter
        │
        ▼
AnalysisResultContract
 ├─ decision / risk
 ├─ facts / judgment
 ├─ action / delivery
 ├─ safety / verification
 ├─ trace / basis
 └─ templateNotice
        │
        ▼
8 个核心工作台
```

WP9 门禁要求：核心工作台不得重新直接导入或调用旧 slice selector。


## Phase 5.1 — WP10 Result Lifecycle Governance — 已完成

分析结果在运行时、localStorage、JSON 备份恢复之间统一使用 `analysisId + inputHash + engineVersion` 记录元数据。

- `CopilotAnalysisResult.analysisRecord` 成为当前结果身份元数据。
- 恢复必须同时满足当前输入 hash 与当前分析引擎版本。
- localStorage 新格式升级为 v2 envelope；v1 只读兼容。
- JSON 备份升级到 `1.4-automotive`，并记录 `resultRecord`。
- 旧备份不会被标记成当前引擎结果；缺少版本记录的历史结果标记为 `LEGACY_IMPORT_UNKNOWN`，随后重新计算。
- 备份 payload 与 context/issue 不一致时拒绝恢复。

WP10 门禁：结果记录、持久化 envelope、备份恢复三套 contract；本轮 30 个 CJS 门禁全部通过，并完成 3 组反向违规测试。
