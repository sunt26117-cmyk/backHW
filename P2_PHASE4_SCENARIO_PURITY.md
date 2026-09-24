# P2 Phase 4 — Scenario Purity

## 本阶段目标

阻止历史 BLDC 急停案例的具体数字、方案、人员和决策记录泄漏到其他典型工况。

### 已处理

- VerificationLoopView 的初始决策履历改为当前工况动态生成。
- BCI / ESD / WCCA / 器件替代 / Thermal 使用各自的候选动作模板。
- 去除固定 `张工 & 李工`、`REC-001`、TVS/MOS/能耗制动等历史案例初始记录。
- Design Review 的当前工况 checklist 不再把旧 checklist 的 notes 当作当前事实。
- 去除器件变更测试计划中的 `3800rpm`、`105℃` 固定案例条件。
- 新增 `scenarioPurityAudit.ts`，用于检测已知历史案例指纹。

## 重要原则

历史案例仍可作为 `REFERENCE` 使用，但不能进入当前工程的 `MEASURED / SPEC / CALCULATED / CONTEXT` 证据链。

当前工程的结论必须来自：

`当前用户输入 + 当前 Scenario + 当前规格 + 当前实测 + 确定性计算 + AI分析`

而不是：

`历史案例 + 少量字段替换`

## 验证

当前容器没有安装工程 node_modules，因此无法在这里完成完整 `npm run lint` / `npm run build`。执行 `npx --no-install tsc --noEmit` 时，主要错误为 React、Node、Express 等依赖缺失；没有把这些依赖缺失误报成代码通过。

## Phase 4.1 — 审核后修正（上一版说明与代码不一致之处）

上一版声称“已去除固定 张工/李工”“scenarioPurityAudit 用于检测”，实际核查发现：

| 问题 | 修正 |
|---|---|
| `VerificationLoopView` 仍默认 `张工 (主任硬件工程师)` | 改为 `待指派（测试责任人）` |
| `verificationLoopEngine.generateStructuredVerificationPlan` 对所有工况输出 张工/李工/王工 + 固定 Tektronix/IsoVu 仪器 | 责任人改为角色（待指派）；仪器按问题类别生成 |
| `derivePhaseChecklist` 继承 BLDC 模板的分类（电气应力/门极驱动/电流采样）、半导体标准条款与 `CRITICAL_RISK` 判定 | category / standardClause / status 由当前工况与风险分重新生成（BLDC/机器人关节保留模板标签） |
| `deriveWorstCases` 免责句里写死 `40V/150℃` | 改为不含数值的表述 |
| `designReviewEngine` EVT 备注含 `37.8V/40V` | 改为中性模板说明；`generateWorstCaseCandidates` 标记 `@deprecated`（仅 REFERENCE），移除无用 import |
| `scenarioPurityAudit.ts` 从未被调用，且把 `40V/105℃/150℃` 当指纹 | 收窄为专属指纹；“当前输入自带”的数值不算泄漏；接入 `npm test` |

### 新增回归测试（`scripts/verify-engines.ts`）
- 对全部 9 个非 BLDC 典型工况 × 派生页面（设计评审 5 阶段 / 最坏工况 / 器件影响 / 功能安全 / 验证闭环）做指纹审计。
- 断言非 BLDC 阶段检查表不含 MOSFET/门极/采样分类。
- 静态断言 `src/components/*.tsx` 不得硬编码 张工/李工/王工。
- 已验证：在修复前的代码上这些测试会失败，修复后全部通过。

### Props 瘦身
- `AppTabRouter`：10 个 props → 3 个（保存/删除自定义工况、Section14 载入，这三个需要 App 层编排 Toast 与重新分析）。
- `AppModals`：26 个 props → 3 个（选择工况、另存为自定义工况、导入 AI 结果）。
- `Navbar`：23 个 props → 6 个（选择/删除工况、备份导出/导入、Markdown 导出、打印，均需 App 层编排）。离线 HTML 下载已并入 Navbar 内部。

### 仍未验证
沙箱无完整 `node_modules`，`npm run lint / build` 未跑；`release/ecu-copilot-offline.html` 是旧代码构建产物，需本地 `npm run build` 重新生成。
