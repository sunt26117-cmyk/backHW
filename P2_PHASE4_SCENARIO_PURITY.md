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

## Phase 4.2 — 示波器波形显示 + 指标算法修正（已完成）

见 `scripts/verify-waveform.ts` / `scripts/smoke-waveform-render.tsx`（已接入 `npm test`）。

- `dv/dt`：改为 20%–80% 边沿法（`oscilloscopeImport.ts: detectEdge`），旧的"相邻两点最大斜率"在有噪声时会显著偏大（合成测试：真实 0.8V/ns，旧算法算出 1.42V/ns），仅作为 `dvDtRawMaxVns` 保留对照。
- 振铃频率：改为只在主边沿之后的窗口内找振铃峰间隔（`detectRinging`），旧算法对整段波形数过零点，纯方波（无振铃）会被误判出一个虚假频率（合成测试：旧算法输出 75038Hz，实际应为 null）。
- 标称电压：改为触发前 10% 样本的中位数（`baselineLevel`），不再用波形谷值——谷值天然低于稳态标称值。
- 通道映射（`buildMeasurementsFromChannels`）：同时选 Vbus 与 Vds 时，母线峰值固定取 Vbus，不再被"后遍历到的通道"静默覆盖；置信度不再固定 90%，采样不足/基线不稳/回退算法时会明确降级并写明原因。
- 新增 `WaveformPlot.tsx`（纯 SVG，无第三方图表库，适配离线单文件导出）：标出峰值/基线/20-80%边沿/振铃峰，保尖峰降采样（min/max 分桶），支持缩放/平移/光标读数。
- 新增 `waveformStorage.ts`：导入后的波形（降采样后）留存在 localStorage，供后续"依据可查"功能回看原始波形，不止是几个数字。

## Phase 5 — 未做，交接见 `P2_PHASE5_TRACE_AND_DIAGRAM_HANDOFF.md`

结论可追溯（每条输出的公式/输入来源/阈值可查）+ 判断流程图，尚未开始。已定义好统一的 `TraceNode` 数据结构设计方案，具体实现见交接文档，包含分步骤指导、验收标准和参考文件清单。
