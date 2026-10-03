# WP7 · 三套案例库边界与体积

## 运行时职责

### `presetScenarios.ts`
用户可加载的典型工况。Scenario Manager、场景上下文恢复和部分验证工具直接依赖它。它是产品运行时数据，不是“当前工程事实”，当前 case 仍由用户选择的工况 context/issue 驱动。

### `engineeringGoldCases.ts`
工程 Gold Case。它同时服务 AI 相似案例检索和 P001~P018 相关回归，因此不能移到 `scripts/fixtures`，也不能被误当作当前 case 的事实源。

### `systemRegressionCases.ts`
系统级回归夹具。Design Review 页面直接使用，用来验证输入传递、场景切换、缺参门禁、VETO 和 AI Grounding 等行为是否被代码修改破坏。它不是工程案例库。

## 当前体积（源码）

| Library | 条目数 | TS 源码 | gzip-9 源码 |
|---|---:|---:|---:|
| presetScenarios | 15 | 34,816 B | 13,974 B |
| engineeringGoldCases | 16 | 19,081 B | 7,990 B |
| systemRegressionCases | 8 | 13,736 B | 4,797 B |
| 合计 | 39 | 67,633 B | 26,761 B |

仓库现有 `release/ecu-copilot-offline.html` 快照为 **1,817,889 B**。本轮没有为了“减体积”擅自改成动态 import，因为精确的单库 bundle contribution 应在标准 Linux `npm ci && npm run build` 下测量后再决定。

## 当前决策

本轮只做边界说明和体积测量，不迁出 `src/`，不改变运行时行为，不做未经测量的懒加载。
