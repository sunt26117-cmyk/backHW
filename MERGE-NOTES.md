# backHW · WP1 + WP2 + WP3 合并包（已在合并结果上实测）

## 基线
- 来源：backHW-main (6).zip（221 条目 / 展开 200 个文件）
- 已含上一轮"提示词单一真源"：scripts/verify-ai-prompt-contract.cjs + src/utils/aiProtocol.ts
  → 与本仓库 main 的 3651501 同一基线；基线根目录没有多余副本（已核实）。

## 合并顺序与冲突处理（关键）
1. backHW-wp1 (1).zip —— WP1 错字 + 横幅唯一化
2. backHW-wp2 (1).zip —— WP2 Trace 口径说明 + 防误删门禁
3. backHW-wp3.zip     —— WP3 robotJoint ↔ dualTimeline 文案去重

wp1 与 wp2 各带一份 scripts/verify-7-workbench-architecture.ts。
git diff --numstat 实测：wp1（135 行）→ wp2（143 行）= +10 / -0，即 **wp2 是 wp1 的严格超集**，
故采用 wp2 版本不会丢失 WP1 断言（TemplateContentNotice ×3、ResultProvenanceBanner ×3 均在其中）。

## 合并后各文件来源
| 文件 | 来源 |
| --- | --- |
| src/data/bldcMotorExpert.ts | wp1 |
| src/components/AnalysisFactView.tsx | wp1 |
| src/components/DecisionCockpitView.tsx | wp1 |
| src/components/EngineeringDocsView.tsx | wp1 |
| src/components/FirstScreen10sView.tsx | wp1 |
| src/components/SeniorEngineeringWorkbenchView.tsx | wp1 |
| src/components/workbenchNavigation.ts | wp1 |
| src/components/TraceAuditView.tsx | wp2 |
| scripts/verify-7-workbench-architecture.ts | wp2（wp1 版的超集） |
| package.json | wp3 |
| scripts/verify-no-duplicate-copy.ts（新） | wp3 |
| src/content/robotJointText.ts（新） | wp3 |
| src/data/robotJointExpert.ts | wp3 |
| src/utils/dualTimelineEngine.ts | wp3 |
| src/utils/scenarioDynamic.ts | wp3 |

## 本机实测（就在本包内容上执行）
`	ext
npm install   -> exit 0
npm run lint  -> exit 0
npm test      -> exit 0（97 项 HONESTLY PASSED）
npm run build -> exit 0
`

验收证据：
- WP1：视图中的横幅调用点只剩 SeniorEngineeringWorkbenchView.tsx:218 / :220（各一处），
  其余命中均为组件自身文件（ResultProvenanceBanner.tsx、TemplateContentNotice.tsx）。
- WP2：门禁脚本已含 TraceDrawer 与审计页口径断言（wp2 版本）。
- WP3：scripts/verify-no-duplicate-copy.ts 输出
  "content 外无重复书写；关节文案重复 0 条；全仓其它跨文件重复 11 条（仅报告）"
  —— 关节文案重复 23 → 0 条。

## 未做的事
- 未改任何业务逻辑；仅含 WP1 / WP2 / WP3 的既定改动。
- WP4–WP8 未执行（指南要求先由工程师确认「域→可派生性」表等）。
- 未把本包合入 git 仓库（如需我合入 backHW 并按要求"一 WP 一提交"，说一声）。


## WP9 · Semantic Analysis Result Contract
- 基线：WP5d + WP6d + WP8。
- `analysisResultAdapter.ts` 增加统一 `AnalysisResultContract` / `readAnalysisResultContract()`。
- 核心工作台统一通过 `selectAnalysisResultContract()` 消费结果。
- 旧 selector migration 门禁已升级为 contract-aware，且保留无直接共享结果字段读取的断言。
- 仅架构边界变更，不调整业务 Pattern 阈值或物理公式。
