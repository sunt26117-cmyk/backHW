# P2 Phase 5 · BLDC 参数摄取与按需输入

## 目标
把“68 个 BLDC 参数一次性平铺填写”改成：核心输入 + 按 P002~P018 按需展开；器件规格书参数由 AI 尽可能完整提取后进入候选池，由工程师选择导入，绝不直接覆盖已有输入。

## 数据流

用户/资料 → AI Extraction JSON → Device Library raw → DeviceParameterCandidate[] → Engineer Review → IssueInput.measuredValues + measurementProvenance → P001~P018

## 来源规则
- USER_MEASURED：工程师手工输入，最高优先级。
- IMPORTED：波形/CSV 等实测导入。
- DATASHEET：规格书直接值；可满足 SPEC 类必填，但不冒充实测。
- CALCULATED：由其它数据推导出来的值，例如 Cgs ≈ Ciss - Crss。
- TEXT_INFERRED：从自由文本推断出的候选，只填空白字段，显示“请核实”。
- BENCHMARK：演示基准，不作为正式实测证据。

## 覆盖策略
1. AI/资料候选永远不能自动覆盖已有 USER_MEASURED / IMPORTED / DATASHEET 数据。
2. 文本抽取只填空白项。
3. 候选池显示 source、sourceType、conditions、sourceRef、confidence。
4. 曲线保留在器件库；工程输入需要单值时才生成明确的映射候选，并注明取点/推导方式。

## BLDC UI
- 默认展示 6 个核心输入：rpm、busVoltageNominalV、busVoltagePeakV、vdsRatingV、cBusUf、rotorInertiaKgm2。
- P002~P018 按模式折叠。
- “这次重点看”支持选择模式，选择后自动展开对应参数组。
- 自由文本失焦和“重新识别并回填”按钮触发文本候选抽取。

## MOSFET AI 提取模板 2.0
提取范围包括：
- 最大额定：VDS、ID、ID pulse、TJmax、PD、EAS、雪崩能力；
- 静态：RDS(on) 曲线、VGS(th) 曲线；
- 电容：Ciss/Coss/Crss 曲线及 Cgd direct；
- Gate charge：Qg/Qgs/Qgd/Qsw、平台电压与曲线；
- Switching：td(on)/tr/td(off)/tf、测试条件、dv/dt/di/dt capability；
- Thermal：RθJC/RθJA/ZθJC(t)；
- Body diode：Vf/Qrr/trr/Irrm；
- protection/robustness：短路耐受、Gate 电压上限、ESD；
- SOA 多脉宽曲线。

AI 明确禁止猜测；图表估读必须降低置信度并标记 DATASHEET_GRAPH_ESTIMATE。

## 使用方式
1. 在器件库复制“参数提取指令”和 JSON 模板给可用 AI。
2. 将完成后的 JSON 导入器件库。
3. 在器件条目点击“参数候选”。
4. 选择要进入当前工程的候选，点击“导入已选择到工程”。
5. 已有工程输入不会被覆盖；发生冲突时保留现值。

## 验证
新增 `scripts/verify-device-parameter-import.ts`，验证 VDS/RDS/Vth/Crss→Cgd/Ciss→Cgs、Qg、switching、thermal、Qrr、EAS 等候选映射。


## v1 review 后补强

本轮自审发现并修正四个治理问题：

1. 文本推断值虽然会回填 measuredValues，但不应直接进入 BLDC 确定性计算；新增 `isDecisionReadyValuePresent()`，`TEXT_INFERRED` / `BENCHMARK` / `ASSUMPTION` 不再满足确定性判据的输入就绪条件。
2. Trace 原先无法区分 DATASHEET / TEXT_INFERRED / DERIVED；现已扩展来源类型，Trace 中可看到“规格书 / 文本推断 / 推导值”，并将 TEXT_INFERRED 标记为降级依据。
3. P008/P014 等模式共享字段造成重复显示；BLDC 参数分组现在按首次归属去重，68 个字段不会重复渲染。
4. `Tjmax` 不能映射成当前工况 `junctionTempC`，Crss→Cgd / Ciss-Crss→Cgs 只能作为低置信度派生候选，不能伪装为 datasheet 直接值。

另有一项结构性限制保留在下一阶段：当前模板对同一参数的多个 typ/min/max、多个不同测试条件，仍主要依赖 `variants` / 原始 JSON 保留，工程候选导入目前只选一个主值；后续可把“多条件候选”做成独立选择器，不应在 AI 提取层丢失数据。

## v2 review（外部复核）：发现并修复一个未覆盖的证据等级闸门缺口

`bldcDeterministicEngine.ts` 早就改用 `isDecisionReadyValuePresent()`（排除 TEXT_INFERRED/BENCHMARK/ASSUMPTION 等低证据来源），但 `robotJointDeterministicEngine.ts` 和 `thermalCascadeEngine.ts` 仍在用旧的 `isMeasuredValuePresent()`（只看"有没有数字"，不看来源）。

风险不是假设性的：`ProjectContextView.inferMeasurementsFromIssueText()` 调用的 `extractMeasurementsFromText()`（`scenarioDomainEngine.ts`）是通用的、按 `resolveEngineeringDomain()` 的字段表逐个正则匹配，覆盖全部领域，不止 BLDC。实测复现：构造一个 ROBOT_JOINT 场景，`gearRatio` 只有 `TEXT_INFERRED` 来源（其余字段正常实测），`calculateRobotJointDeterministicCalculations` 的 `resonance` 判据在修复前会直接算出 `63.16`（状态 `CALCULATED`），而不是 `INSUFFICIENT_INPUT`；`thermalCascadeEngine` 对 `tAmbientC` 同样成立。也就是说，工程师在自由文本里写一句"减速比100"，系统会把这个未经证实的猜测当成已验证输入直接算出谐振裕量。

修复：
- `robotJointDeterministicEngine.ts` / `thermalCascadeEngine.ts` 全部改用 `isDecisionReadyValuePresent()`（各 3-4 处调用点，逐一替换）。
- 修正 `unifiedStateExtractor.ts` 里两处引用旧函数名的过期注释（原文档仍写"必须用 isMeasuredValuePresent()"，会误导下一次接手的人继续调错函数）。
- `scripts/verify-insufficient-input-guards.ts` 新增"证据等级闸门"一节：分别对关节谐振（`gearRatio`）、热级联（`tAmbientC`）构造"数值都在、但来源只是 TEXT_INFERRED"的场景，断言仍是 `INSUFFICIENT_INPUT` 且不产出数值；并加一条对照组确认真实实测时正常算出结果（防止闸门被焊死）。已验证：该测试在修复前会正确失败（`status=CALCULATED`），修复后通过。

已确认没有第三处遗漏：全项目 `isMeasuredValuePresent` 的调用点，现在只剩它自身的 `isDecisionReadyValuePresent()` 内部调用（合理，属于分层调用），以及 UI/文档性质的注释引用。
