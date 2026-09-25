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
- 当前工程已有值 → 不覆盖
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
