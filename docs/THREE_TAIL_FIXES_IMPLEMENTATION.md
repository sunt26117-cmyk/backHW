# Phase5 三项尾项优化落地说明

本次针对 ECU Copilot 完成三个收口，不改变既有 P001~P018 的外部调用接口。

## 1. 缺参不形成伪确定性结果

- BLDC 所有 Pattern 统一经过 `src/domains/bldc/patternPolicy.ts`。
- `READY`：证据链完整，可形成确定性结果。
- `ASSUMPTION_BASED`：存在默认值/推断值；保留 Pattern evaluator 的 `triggered` 用于候选方案与验证优先级，但不得作为已确认风险，也不得形成 `VETO`。
- `INSUFFICIENT_INPUT`：Trace 中关键输入缺失，禁止形成确定性风险/VETO。
- `scenarioDerived.ts` 的 BLDC 数值型物理输入不再从自由文本直接猜值；正式项目只读结构化 `measuredValues`，`BENCHMARK` 仅保留演示默认值。
- `vdsRatingV` 与 `dvdtVns` 均改为结构化读取；Vds 额定耐压继续支持绑定器件 Datasheet 自动投影。
- P006 的 Tjmax 改为当前输入/器件规格，移除历史写死的 150℃ 判据。
- P013 的电容允许纹波电流、额定寿命、额定温度进入统一输入与 Trace；不再写死 4.5A / 5000h@105℃。

## 2. `decisionPillars.ts` 历史模板隔离

- 历史实现移动至 `src/data/legacy/decisionPillars.ts`。
- `src/data/decisionPillars.ts` 仅保留兼容 shim。
- `expertEngine.ts` 已移除运行时对 legacy pillars 的调用；当前 case 的 P0 支柱由 `scenarioDynamic.ts` 根据当前 issue/context 动态生成。
- 增加静态回归检查，防止未来业务代码重新直接导入 legacy pillars。

## 3. 多域输入统一显示

- `getDomainMeasurementGroups()` 统一返回 PRIMARY/RELATED 域。
- `ProjectContextView` 使用同一个字段渲染器同时显示多个工程域输入。
- BLDC、EMC、Thermal 等多选域不再只显示一个域的参数。
- 公共字段去重；BLDC 的 Datasheet 字段与独立“器件规格”面板分离，避免重复显示。
- 保留后续分析使用的原始 `measuredValues` / `measurementProvenance` 契约。

## 验证

- 新增 `scripts/verify-three-tail-fixes.cjs`，验证 legacy runtime isolation、Pattern 间无交叉依赖、结构化物理输入以及多域 UI 接口。
- 本机无完整 `node_modules`，`npm ci` 在沙箱中超时，因此无法把完整 `npm test` 宣称为通过。
- TypeScript 语法/类型边界需以仓库依赖安装后的完整 `tsc` 为准；本次修复额外做无依赖静态检查。
- 三项尾项静态回归：PASS；并新增 ASSUMPTION_BASED 保留 `triggered`、禁止 VETO 的策略护栏。
