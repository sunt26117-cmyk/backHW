# Phase 5 — P001~P018 全量 Trace 化

本轮在既有 Phase 5 Trace 基础上，将 BLDC `P001 ~ P018` 18 个 Pattern 全部接入统一 `TraceNode` 链。没有为每个 Pattern 新造 UI 或独立 Trace 框架。

## 覆盖范围

| Pattern | Trace 主节点 | 类型 |
|---|---|---|
| P001 | 母线泵升峰值 | 数值计算 |
| P002 | BEMF 低温最坏峰值 | 数值计算 |
| P003 | 米勒耦合 Vgs | 数值计算 |
| P004 | 最坏死区裕量 | 数值计算 |
| P005 | 死区畸变占比 | 数值计算 |
| P006 | 热电正反馈结温 | 数值迭代 |
| P007 | 热安全综合裕量 | 数值计算 |
| P008 | 线束 LC 谐振频率 | 数值计算 |
| P009 | 霍尔故障适用性 | 逻辑判据 |
| P010 | 电流采样故障适用性 | 逻辑判据 |
| P011 | UVLO 裕量 | 数值/逻辑判据 |
| P012 | 自举刷新完成度 | 数值计算 |
| P013 | DC-Link 纹波/容量 | 数值计算 |
| P014 | 动态 VDS 峰值 | 数值计算 |
| P015 | 保护链独立性 | Checklist 参考链 |
| P016 | Fault-to-Off / SOA | 数值计算 |
| P017 | 电流采样架构 | Checklist 参考链 |
| P018 | 堵转证据适用性 | 逻辑判据 |

## Trace 原则

1. Trace 输入必须来自当前 Pattern 真正消费的参数；不从 UI 文案或 `calculatedValues` 反向伪造 Trace。
2. `ASSUMED_DEFAULT / SPEC_CONSTANT` 会让计算 Trace 自动降级；P015/P017 的规格性参考输入不是计算假设，因此显式保持 `degraded=false`。
3. 导入示波器数据继续通过 `evidenceId` 回链到已有 Waveform storage；本轮没有重新造波形存储。
4. P009/P010/P018 当前只有适用性/症状证据，因此 Trace 明确写成逻辑链，不伪造不存在的数值公式。
5. P007 复用 P006 的确定性热模型结果，不再复制另一套热计算。

## 验证

新增 `scripts/verify-all-pattern-traces.ts`，检查：

- 引擎仍输出恰好 P001~P018 18 个 Pattern；
- 每个 Pattern 都存在至少一个 TraceNode；
- Trace ID 与 Pattern 命名空间一致；
- 每个节点都具备真实输入、公式/逻辑、Verdict；
- P015/P017 Checklist 不会污染“待实测/假设计算”统计。

`package.json` 的 `npm test` 已把该校验置于现有回归链最前面。

## 本地执行

依赖安装完成后运行：

```bash
npm test
```

本次工作环境无法完成 `npm ci`：安装过程在沙箱网络层超时。因此本轮已完成源码级 TypeScript 检查及静态结构校验，但没有把“完整 npm test 通过”作为已验证事实。

> **后续状态（已在本仓库实测）**：依赖装齐后 `npm run lint` / `npm test` / `npm run build` 均通过（含 `ALL TRACE VERIFY PASS: 18/18 patterns traced` 与 `TRACE ASSUMPTION AUDIT PASS`）。此处「未跑/未验证」只描述当时那个无依赖的沙箱，**不代表当前状态**。
