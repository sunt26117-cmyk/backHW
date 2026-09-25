# Phase 5 Trace Fix Audit

## 本轮修正

### 1. `scripts/verify-trace.ts`
原先把“完整测试输入下所有 Trace 都必须不降级”当作全量约束。P001~P018 全量接入后，部分 Pattern 合理使用显式经验假设/规格常量，该断言已过时。

现在拆为两层门禁：

- P001 / P002 / P003 / P014 / P016 五个 priority Pattern：齐全输入下 Trace 必须 `degraded=false`。
- 其他降级节点：必须存在明确的 `ASSUMED_DEFAULT` 或 `SPEC_CONSTANT` 输入，并且每个导致降级的输入必须有明确字段名和说明性 `note`，避免把“降级”变成无依据的泛化状态。

同时增加 P012 回归断言：`value="无法计算"` 时 `verdict` 必须为 `INFO`，不得返回 `PASS`。

### 2. `src/data/bldcPatternEngine.ts`
P012 自举刷新窗口在缺少 `bootChargeLoopOhm` 时无法计算刷新完成度。原逻辑仍可能返回 `PASS`。

修正为：

- `<90%`：`CRITICAL`
- `90%~<95%`：`MARGINAL`
- `>=95%`：`PASS`
- 无法计算：`INFO`

这不会把“未知”伪装成“通过”。

### 3. `docs/pipeline.md`
同步为当前事实：Phase 5 已覆盖 `P001~P018` 全部 Pattern，并说明数值计算、逻辑证据链和 Checklist 参考链的不同 Trace 语义。

## 验证

- 全量 Trace：`18/18 patterns traced`
- Trace assumption audit：完整测试输入下发现的 8 个降级节点均可追溯到明确的假设/规格输入
- Trace 回归：通过
- Deterministic engine regression：16/16 金标准案例通过；其余既有 BLDC/Robot/纯净度审计通过
- `bldcPatternEngine.ts` 单文件 TypeScript 检查：通过
- P012 缺 `R_boot`：`value=无法计算` 且 `verdict=INFO`

完整 `npm test` 是否能在具体开发机执行仍取决于该机 `node_modules` 是否完整；本沙箱无法从 registry 完成依赖安装。
