# P2 Phase 5 · Device Candidate Governance

## 本轮目标

把“规格书/AI 提取数据 → 当前工程输入”的链路从命令式硬编码改成可审计的候选治理机制，核心原则是：

> **AI 尽可能多提取；工程 schema 不支持的字段不丢失；工程师拥有最终导入权；任何候选都不能绕过映射闸门直接写入 measuredValues。**

## 已落地能力

### 1. 声明式 MOSFET 字段表

`src/utils/deviceParameterCandidates.ts` 使用 `MOSFET_FIELD_TABLE` 管理 MOSFET 提取字段，目前共 **38 项**。每项明确记录：

- `rawPath`
- `label / unit`
- `targetKey`
- `category`
- `defaultSourceType`
- `defaultConfidence`
- `valueType`
- `valueKind`
- `evidence / note`

目前没有安全工程字段的参数明确使用 `targetKey: null`，而不是通过“没有 push 分支”隐式丢失。

### 2. Mapping Status

候选统一使用：

`mapped | unmapped | ambiguous | rejected`

实际规则：

- `targetKey === null` → `unmapped`
- `targetKey` 不存在于当前工程输入 schema → `unmapped`
- 只有当前 schema 存在且数值有效时才进入 `mapped/importable`
- `ambiguous/rejected` 保留为接口状态，本轮不伪造判定逻辑

### 3. 不存在的工程字段不再伪造

已核对全工程 measurement schema。以下 datasheet 数据没有同语义、安全的工程字段，因此保持未映射：

- `gateCharge.qgs`
- `bodyDiode.trr`
- `maxRatings.tjMax`
- `maxRatings.tstg`
- SOA 曲线、Gate voltage limit、ESD 等

例如 `Tjmax` **禁止**映射到 `junctionTempC`：一个是器件绝对能力边界，一个是当前工况温度。

### 4. variants 显式进入候选池

规格书同一参数存在 typ/min/max 或不同条件时，原始 `variants[]` 继续完整保留。同时候选池生成“其它口径”摘要，避免工程师完全看不到这些数据。

本轮不自动从多个 variant 中替工程师选择一个值导入。

### 5. 模板之外的重要数据不会消失

`extractionHints.unmappedImportantData` 作为兜底承载，推荐结构：

```json
{
  "key": "stable_unique_key",
  "label": "参数名称",
  "value": 123,
  "unit": "V",
  "stat": "MAX",
  "conditions": {},
  "source": "Table/Fig/Page",
  "sourceType": "DATASHEET_DIRECT",
  "confidence": 0.95,
  "note": "..."
}
```

这类数据会自动生成 `unmapped` 候选，但不会自动写入工程输入。

### 6. 人工映射带物理约束

`getMosfetMappingOptions()` 不再只按“同类别”给下拉框，还检查单位兼容。

例如 `trr(ns)` 不会因为同属“二极管”就被允许映射到 `Qrr(nC)` 或 `Vf(V)`。

### 7. 唯一导入闸门

`src/utils/deviceCandidateImport.ts` 集中处理最终写入：

- 必须 `mappingStatus === mapped`
- 必须存在非空 `targetKey`
- 必须是有限数字
- 同一 `targetKey` 多候选 → 全部阻断
- 当前工程已有值 → **按来源分级**（v6 修正，此前是一刀切"绝不覆盖"）：
  - 逐字段来源为 `USER_MEASURED` / `IMPORTED`（工程师输入 / 波形实测）→ **保护，不覆盖**
  - 逐字段来源为 `DATASHEET` / `SPEC` / `BENCHMARK` / `TEXT_INFERRED` 等 → **可被当前器件覆盖**，并把原值、原来源记入 `overwritten` 由 UI 如实告知
  - 无逐字段来源：只有场景级 `measuredValueSource === 'BENCHMARK'`（演示数据）可覆盖；**来源不明一律保护**
  - 面板提供显式开关「强制覆盖已有输入（含实测/人工/来源不明的值）」；勾选后连实测值也可覆盖，但仍记录被覆盖来源
  - 原因：真实器件复核时面板出现过与当前器件不符的值（Vds 60 vs 40、Qgd 14.2 vs 2.9），它们没有逐字段 provenance，被"绝不覆盖"挡住后工程师点了导入也无效。既不能冲掉实测，也不该让演示值永远占位。
- `unmapped/skipped` → 永远不写入
- 不会生成 `values['null']`

### 8. 决策持久化

`src/utils/deviceLibrary.ts`：

`candidateDecisions[rawPath] = { decision, mappedKey?, decidedAt }`

支持：

- `skipped`
- `mapped_to`
- `imported`

另有 `candidateRequests` 记录“创建工程参数”待办。

`rawPath` 是决策键，不绑定某次具体数值，因此 datasheet 数值刷新后工程师决定仍然跟随字段。

并增加了“恢复使用”，可以撤销 skip。

### 9. 映射规则链（单一真源）

Prompt、字段表、候选分类、UI 分桶、导入闸门曾各自维护一份「哪些字段能映射」的说法，于是出现
「字段表已支持、Prompt 却没列出」的漏项（6 个：`idssUa`、`igssNa`、`gateResistanceOhm`、
`dvdtCapabilityVns`、`didtCapabilityANs`、`soaShortCircuitTimeUs`）。现在收敛成**一条链**，
上游一改必然传导到下游：

```
MOSFET_FIELD_TABLE                    ← 唯一声明源：rawPath / targetKey / valueKind / defaultSourceType
      │  （清单由代码生成，不手写）
      ├─ DIRECT_MAPPABLE_TARGET_KEYS    datasheet 直给 + 单值标量
      └─ CONFIRM_REQUIRED_TARGET_KEYS   曲线选点图估 + 派生 + variants 恢复
      │
DEVICE_PARAM_PROMPT                   ← 由上面两份清单 join 生成，结构上不可能落后于字段表
      │
makeCandidate() → candidateKind       ← 单一分类函数
      │
DeviceCandidatePanel 四桶（可直接导入 / 需确认 / 仅曲线 / 未映射）
      │
buildDeviceCandidateImportPayload()   ← 唯一写入口：只有 DIRECT_SCALAR 自动写入
```

| candidateKind | 判据 | 能否自动导入 |
|---|---|---|
| `DIRECT_SCALAR` | 字段表 `DATASHEET_DIRECT` 且非曲线/集合 | 可以 |
| `DERIVED_OR_ESTIMATE` | 派生值、曲线选点图估、由 variants 恢复 | 不可以，需工程师确认 |
| `CURVE_ONLY` | 有 targetKey，但只有曲线/多条件，拿不出单值 | 不可以 |
| `NO_MAPPING` | 没有安全且同语义的工程字段 | 不可以 |

**需确认清单目前 4 项，原因都写在 Prompt 里**：`cgsPf`（模板无直接 Cgs 字段，只能 `Ciss − Crss` 派生）、
`rdsOnMilliOhm` / `vthMinV`（曲线选点图估，不是规格书保证值）、`gateVoltageMinV`（无独立字段，
从 `protectionAndRobustness.gateVoltageMax` 的负向 variant 恢复）。

**可直接导入清单不在文档里复制**——复制即漂移。要看当前值：

```bash
npx tsx -e "import {DIRECT_MAPPABLE_TARGET_KEYS,CONFIRM_REQUIRED_TARGET_KEYS} from './src/data/deviceTemplate'; console.log(DIRECT_MAPPABLE_TARGET_KEYS); console.log(CONFIRM_REQUIRED_TARGET_KEYS);"
```

`scripts/verify-device-candidate-governance.ts` 负责让这条链不被破坏：字段表每个 `targetKey` 必须恰好
落在两份清单之一、分类必须与 `sourceType/valueKind` 一致、Prompt 文本必须包含两份清单的每个 key、
Prompt 必须写明 `cgdPf` 的直给/派生双来源与 `gateVoltageMinV` 的 variants 恢复规则，且
**非 `DIRECT_SCALAR` 一律不得 `importable`**。Prompt 再落后于字段表，测试会直接失败。

## 验证结果

### 定向运行时验证

```text
verify-device-parameter-import: PASS
(table=38, candidates=24, unmapped=21)

verify-bldc-input-governance: PASS
(14 device candidates; duplicate groups safely deduped)
```

### 静态/语法验证

以下本轮涉及文件均通过 TypeScript 转译语法检查：

- `src/components/DeviceLibraryModal.tsx`
- `src/utils/deviceParameterCandidates.ts`
- `src/utils/deviceCandidateImport.ts`
- `src/utils/deviceCandidateAuxiliary.ts`
- `src/utils/deviceLibrary.ts`
- `src/data/deviceTemplate.ts`
- `src/utils/scenarioDomainEngine.ts`
- `scripts/verify-device-parameter-import.ts`

### 文件规模

继续满足此前的单文件上限：

- `deviceParameterCandidates.ts`：352 行
- `DeviceLibraryModal.tsx`：400 行
- `deviceLibrary.ts`：276 行
- `deviceCandidateImport.ts`：67 行
- `deviceCandidateAuxiliary.ts`：71 行

### 全量测试环境限制

项目 `npm test` 当前无法在本执行环境启动，因为依赖安装未完整完成，`tsx` 可执行文件不存在；尝试 `npm ci` 时环境连接超时。当前结论因此分为两层：

- **本轮候选治理的定向测试：已实际执行并通过。**
- **项目完整 `npm test`：未能执行，不宣称全绿。**

## 当前边界

本轮只治理 MOSFET 候选链路，不新增动态工程 schema 字段，不让 AI 自动扩展 68 个工程输入，也不改变 P001~P018 的确定性物理公式。

下一阶段如要扩展电容、传感器、连接器等器件类型，可以复用同一“Field Table → Candidate → MappingStatus → Import Gate → Decision Persistence”模式，而无需重新设计一套逻辑。

### v3 自动映射修正

器件 JSON 的 `extractionHints.mapping` 现在作为显式映射提示参与候选生成：只要 `targetKey` 在整个工程 schema 中真实存在、单位兼容，且来源路径存在，就自动转为 `mapped`，不再要求工程师重复选择映射目标；工程师仍需要显式确认是否写入工程输入。

候选匹配使用整个工程 schema，而不是仅使用当前展开域。这样 `qgdNc`、`soaShortCircuitTimeUs` 等虽然当前页面未展开，但下游确定性引擎已有字段的参数，不会被误报成“未映射”。界面会标记“schema 已有·当前域未展开”。

`Crss → Cgd` 仍保持独立 DERIVED 路径，不会因为 AI 在 `extractionHints.mapping` 中给出 `cgdPf` 就把 Crss 冒充 datasheet 直接 Cgd。


### v4 为什么仍有少数参数不自动映射

“自动匹配”和“自动导入”是两个不同门槛。当前实现会自动采用 JSON `extractionHints.mapping`、字段表映射以及全工程 schema 中的唯一同单位字段；只有语义一致且工程字段真实存在时才进入 `mapped`。

> **更正（v5）**：上面这段列举的 `ID` / `ID pulse` / `PD` / `Tjmax` / `Ciss` / `Coss` /
> `Qgs` / `Qsw` / `tr` / `td(on)` / `trr` / `IrrM` / Gate 电压上限 / ESD 在本轮已由
> **Device Specification 层**提供 canonical 字段并**自动映射**（治理测试逐条断言），
> 因此它们**不是**未映射项。当前真正保持 `targetKey: null` 的是下面 6 项——这是物理语义隔离，
> 不是命名问题：`maxRatings.tstg`（存储温度，≠ 当前工况结温）、`soaCurve`（曲线，无标量字段可承载）、
> `staticParams.bodyChannelCurrent`（体沟道电流能力，≠ ID 额定）、`capacitanceParams.crss`（保留原始
> Crss，不冒充 Cgd）、`gateCharge.gateChargeCurve`（曲线）、`thermalParams.zthJc`（ZθJC(t) 瞬态曲线，
> 不能当成单个 RθJC）。

### v5 把五处说法收敛成一条链

- Prompt 的 targetKey 清单改为**从 `MOSFET_FIELD_TABLE` 生成**，修掉 6 个漏项；
- `rdsOnMilliOhm` / `vthMinV` / `gateVoltageMinV` 从「可直接导入」移入「需确认」，该器件夹具的
  `autoImport` 由 23 变为 20（确认后再导入的通道不变，仍有断言覆盖）；
- 新增 `candidateKind` 四分类与 UI 第 4 个区块「已识别，但只有曲线/多条件、无单值」，
  曲线候选不再和数值型派生候选挤在同一区；
- `cgdPf` 的直给/派生双来源、`gateVoltageMinV` 的 variants 恢复规则都写进了 Prompt。
