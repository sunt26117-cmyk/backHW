# ECU Copilot Phase 5 — Device Specification / Auto-Mapping Finalization

## 本轮目标
把器件库 datasheet 参数从“候选字段列表”升级为独立的 Device Specification 层，并让可确定映射的数据自动进入工程；只有存在真实语义/物理风险的情况才要求人工确认。

## 已完成
- 新增 `deviceSpecificationSchema.ts`：Device Specification canonical schema。
- 新增 `mosfetFieldTable.ts`：42 项 MOSFET 声明式字段表。
- `deviceParameterCandidates.ts`：统一读取字段表 + `extractionHints.mapping` + 全工程 schema；历史 `thermalResistanceCPerW` 自动迁移到 canonical `rthJcCPerW`。
- `deviceCandidateImport.ts`：独立安全导入闸门，禁止 null/错误 key/重复目标/覆盖已有输入。
- `deviceCandidateAuxiliary.ts`：支持 variants、legacy 标量恢复、Gate VGS 负向额定恢复、Crss→Cgd / Ciss-Crss→Cgs 派生候选。
- `DeviceLibraryModal.tsx` / `DeviceCandidatePanel.tsx`：
  - 自动映射不再要求逐项重新选择。
  - “设为当前”自动带入高置信度 datasheet 直接值。
  - DERIVED 参数进入“已匹配但需确认”区，可一键确认导入。
  - 真正无安全映射的数据保留在未映射区。
- `scenarioDerived.ts`：确定性引擎从当前选中器件读取 Device Specification；Cgs 在缺少直接 Cgs 时按当前 VDS 从 Ciss-Crss 派生，并标记 DERIVED trace，不回写成实测输入。
- `scenarioDomainEngine.ts` / `ProjectContextView.tsx`：Device Specification 纳入统一工程 schema。
- `deviceLibrary.ts`：持久化 `candidateDecisions` / `candidateRequests`。
- 增强真实器件回归脚本：`verify-device-real-datasheet-mapping.ts`。

## BUK9M6R0-40H 实际专项结果
真实 JSON 结构专项回归：
- candidates = 36
- autoImport = 23
- unmapped = 8
- Crss→Cgd / Ciss-Crss→Cgs：已映射但不静默导入，明确要求一次工程确认。

## 验证结果
以下均实际执行并 PASS：
- `verify-device-parameter-import`
- `verify-device-candidate-governance`
- `verify-device-spec-projection`
- `verify-bldc-input-governance`
- `verify-device-real-datasheet-mapping`
- 9 个关键 TS/TSX 文件语法转译检查

核心编译命令使用本地 TypeScript，RC=0。

完整 `npm test` 未在当前环境宣称通过：该工作区缺少可用的本地 `tsx` 依赖，之前网络安装尝试超时。这里的结论仅基于实际执行的定向回归与本地 TypeScript 编译。
