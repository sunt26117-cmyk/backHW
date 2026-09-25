# Phase 5 交接：结论可追溯（Trace） + 判断流程图

> 面向接手的另一个 AI / 工程师。本文档是唯一入口：先读"已完成"确认起点，再按"待做"顺序实现。
> 每一步都给了要改的文件、函数签名、验收标准。**不要一次改完再测试**——每完成一小步就跑 `npm test`。

## 已完成（本阶段，不在你的任务范围）

示波器导入的算法修正与波形可视化已经做完并测试通过，与本交接无关，不要重复劳动：
- `src/utils/oscilloscopeImport.ts`：dv/dt 改 20%–80% 边沿法、振铃频率改用主边沿后的峰间隔、标称电压改用触发前基线中位数、通道角色映射修掉了"后选通道静默覆盖前一个"和"置信度固定 90%"的问题。
- `src/components/WaveformPlot.tsx`：纯 SVG 波形图，标出峰值/基线/20-80%边沿/振铃峰，保尖峰降采样。
- `src/utils/waveformStorage.ts`：导入后的波形留存在 localStorage，供之后的 Trace 侧栏引用（见下面任务 3）。
- 测试：`scripts/verify-waveform.ts`（合成波形已知答案）、`scripts/smoke-waveform-render.tsx`（SSR 渲染）。已接入 `npm test`。

## 背景：为什么做这个

用户原话："其实我就怕输出的不对"。这个项目的每个 Tab 输出的数字，背后可能是：真实测量值、用户手填、引擎在缺输入时"假设"出来的默认值。目前 UI 不区分这三种，用户没法一眼判断一条结论能不能信。Phase 5 要做的就是让**每一条数值结论都能点开看到：用了哪些输入、这些输入各自的来源可信度、套了什么公式、和什么标准/阈值比较、结论是什么**。

---

## 任务 1：统一 Trace 结构（先做这个，是任务 2/3 的地基）

### 1.1 现状

`src/types.ts` 里已经有 `analysisBasis.calculatedOutputEvidence`（第 671 行附近），字段包括 `formula` / `inputs` / `inputSources` / `missingInputs` / `specThreshold` / `complianceVerdict` 等。**但这个结构目前只被 AI 报告（`analysisBasis`）用了，覆盖面很窄**（母线泵升、米勒平台等个别项）。

`src/data/bldcPatternEngine.ts` 里的 18 种模式判断（`evaluateAllBldcPatterns`，第 173 行起）完全没有走这个结构。每个判据（P001、P002…）在代码里内联判断，缺输入时会像这样兜底假设值：

```ts
const vbusNominalWasAssumed = !Number.isFinite(input.vbusNominal);
const vbusNominalSafe = Number.isFinite(input.vbusNominal) ? input.vbusNominal : 13.5;
...
if (vbusNominalWasAssumed) {
  p001Assumptions.push('母线标称电压 vbusNominal 未提供...假设为 13.5V...');
}
```

这类"假设值参与计算，最后在某个字符串数组里提一句"的写法，正是用户担心"输出不对"的根源——假设值和实测值在 UI 上长得一样。

### 1.2 要做的事

**第一步**，在 `src/types.ts` 新增一个比 `calculatedOutputEvidence` 更通用、覆盖全部输出（不只是 AI 报告）的类型：

```ts
export type TraceInputSource = 'MEASURED' | 'IMPORTED' | 'USER_INPUT' | 'ASSUMED_DEFAULT' | 'SPEC_CONSTANT';

export interface TraceInput {
  key: string;            // 对应 ProjectContext / IssueInput 的字段名，或常量名
  label: string;          // 人话，例如"母线标称电压"
  value: number | string;
  unit?: string;
  source: TraceInputSource;
  note?: string;          // 例如"未提供，假设为典型车规12V系统充电态标称电压"
}

export interface TraceNode {
  id: string;             // 全局唯一，建议 `${engine}:${outputKey}`，例如 'bldcPattern:P001.buspumpV'
  title: string;          // "母线泵升峰值"
  value: number | string;
  unit?: string;
  inputs: TraceInput[];
  formula?: string;       // 人类可读，例如 "Vpeak = Vbus + L * di/dt / (C * ...)"
  standardRef?: string;   // "AEC-Q101 Rev E" 之类，没有就留空
  threshold?: { value: number; unit: string; label: string }; // 用于比较的阈值
  verdict?: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL' | 'INFO';
  /** 关键：只要 inputs 里有一项 source 是 ASSUMED_DEFAULT 或 SPEC_CONSTANT 且直接影响 verdict，
   *  degraded 必须为 true。UI 侧要把这类结论显式标"待实测确认"，不能和实测结论同等展示。 */
  degraded: boolean;
  children?: TraceNode[]; // 子依据，用于层层展开（例如"米勒平台"依赖"母线泵升"的结果）
}
```

放在 `src/types.ts` 里 `PatternOutputItem`（`src/types/v4Models.ts` 第 190 行）附近，并给 `PatternOutputItem` 加一个可选字段：

```ts
export interface PatternOutputItem {
  ...
  trace?: TraceNode[]; // 新增，可选——先不填不影响现有调用方
}
```

**第二步**，写一个小的构造 helper，放在新文件 `src/utils/trace.ts`：

```ts
export function makeTraceInput(key: string, label: string, value: number | string, source: TraceInputSource, unit?: string, note?: string): TraceInput { ... }
export function anyAssumed(inputs: TraceInput[]): boolean {
  return inputs.some(i => i.source === 'ASSUMED_DEFAULT' || i.source === 'SPEC_CONSTANT');
}
export function makeTraceNode(partial: Omit<TraceNode, 'degraded'>): TraceNode {
  return { ...partial, degraded: anyAssumed(partial.inputs) };
}
```

这样后面每个判据只要老老实实把用到的输入传进 `makeTraceInput`，`degraded` 自动算，不用每个判据自己记一遍"是不是用了假设值"。

**第三步（改造引擎，工作量最大，按判据逐个来，不要一次性重写整个文件）**：

以 `bldcPatternEngine.ts` 的 P001（母线泵升，第 185 行起）为例，现在的写法大致是：

```ts
if (vbusNominalWasAssumed) { p001Assumptions.push('...'); }
const peak = calculateBusPumping(vbusNominalSafe, ...); // 来自 motorPhysicsEngine
patterns.push({ id: 'P001', ..., calculatedValues: { peak }, ... });
```

改造成：

```ts
const vbusInput = makeTraceInput('vbusNominal', '母线标称电压', vbusNominalSafe, vbusNominalWasAssumed ? 'ASSUMED_DEFAULT' : 'MEASURED', 'V',
  vbusNominalWasAssumed ? '未提供，假设为典型车规12V系统充电态标称电压' : undefined);
const peak = calculateBusPumping(vbusNominalSafe, ...);
const trace = makeTraceNode({
  id: 'bldcPattern:P001.peak', title: '母线泵升峰值', value: peak, unit: 'V',
  inputs: [vbusInput /* ...其余输入同样包一层 */],
  formula: 'Vpeak = calculateBusPumping(vbusNominal, L, di/dt, C)（见 motorPhysicsEngine.ts）',
  verdict: peak > someThreshold ? 'CRITICAL' : 'PASS',
});
patterns.push({ id: 'P001', ..., trace: [trace], ... });
```

**做的顺序建议**：先做 P001（已经示范），再挑 2-3 个用户最常用的判据（问 `PRESET_SCENARIOS` 里哪些工况最常被测），验证模式跑通后再铺开到全部 18 个。**不要求一次做完全部 18 个模式**——先做出可用的模式，把 UI（任务 2）和测试跑通，剩下的判据按同样套路补，工作量是重复劳动而不是设计难题。

**验收标准**：
- `evaluateAllBldcPatterns` 返回的至少 3 个 `PatternOutputItem` 带 `trace` 字段，且 `trace[].degraded` 在假设值参与时正确为 `true`。
- 新增 `scripts/verify-trace.ts`：对这几个已改造的判据，构造"输入齐全"和"输入缺失"两组场景，断言 `degraded` 分别为 `false` / `true`，断言 `verdict` 和手算结果一致。参考 `scripts/verify-waveform.ts` 的写法（已知合成输入 → 断言精确输出）。

---

## 任务 2：依据侧栏 + 审计视图（依赖任务 1）

### 2.1 侧栏组件

新建 `src/components/TraceDrawer.tsx`：接收 `TraceNode[]`，从右侧滑出，按"输入 → 公式 → 阈值 → 结论"竖向展示：

```
母线泵升峰值：38.2 V           [CRITICAL]
├─ 输入
│   母线标称电压 13.5V  [假设值 ⚠ 未提供，假设为典型车规12V系统充电态标称电压]
│   电感 L = 220µH      [用户输入]
│   电流变化率 di/dt     [导入自示波器 CH1，见下方波形]
├─ 公式
│   Vpeak = calculateBusPumping(vbusNominal, L, di/dt, C)
├─ 阈值
│   器件耐压 40V（AEC-Q101 Rev E）
└─ 结论：CRITICAL —— 裕量不足 5%
```

- 有假设值的输入项用醒目颜色（参考项目里其它警告用的 amber-400）标出，整条 `trace` 顶部加"待实测确认"徽标（`degraded === true` 时）。
- 如果 `TraceInput.source === 'IMPORTED'` 且能在 `loadWaveforms()`（`src/utils/waveformStorage.ts`，任务 0 已完成）里按 `evidenceId` 找到对应波形，直接嵌入 `WaveformPlot` 显示那段波形——这是"从数字点回波形"的关键体验，别漏。
- `children` 递归渲染成可展开的下一层。

### 2.2 每条输出旁边的触发点

在渲染 `PatternOutputItem` 的地方（`src/components/BldcPatternEngineView.tsx`，看 `calculatedValues` 是怎么展示的），每条数值旁加一个小图标按钮，点击时把对应 `trace` 传给 `TraceDrawer` 并打开。

同样的模式套用到设计评审（`src/components/DesignReviewRegressionView.tsx`）、验证闭环（`VerificationLoopView.tsx`）等页面——但**先不要求全覆盖**，先把 Pattern 页面做完，UI 交互模式定下来了，其它页面照抄。

### 2.3 审计视图（新 Tab）

新建 `src/components/TraceAuditView.tsx`：汇总当前分析结果里所有 `trace`（遍历 `result.patterns[].trace`、以后可能还有其它引擎产出的 trace），做成一个可过滤的列表：
- 按 `degraded` 过滤："只看用了假设值的结论"。
- 按 `verdict` 过滤："只看 CRITICAL/FAIL"。

接入方式：
- `src/contexts/UIContext.tsx` 里 Tab 类型加一个 `'audit'`。
- `src/components/AppTabRouter.tsx` 第 162 行 `calc` 附近加一段 `{activeTab === 'audit' && <TraceAuditView ... />}`。
- `src/components/Navbar.tsx` 加对应的 Tab 按钮。

### 2.4 降级规则联动

项目已有 `src/utils/inputIntegrityEngine.ts`（第 0 步没细读，接手时先看一遍）做类似"输入完整性分级"。**不要重新发明一套，去看它现在的分级规则是什么，让 `TraceNode.degraded` 的判定逻辑和它对齐或复用它的常量**，避免同一个概念在代码里有两套不一致的实现。

### 2.5 AI 报告接线

`PatternOutputItem`（走确定性引擎）和 `analysisBasis.calculatedOutputEvidence`（走 AI 报告）现在是两套并行的结构。**这次不要求合并成一套**——工作量太大且有风险。只要求：`citedFields`（`src/types.ts` 里，AI 引用了哪些数值）里如果引用了某个 `traceId`，`ResultProvenanceBanner.tsx` 显示时能跳到对应 Trace（没有就不显示跳转，不强求）。

**验收标准**：
- Pattern 页面每条触发结论能点开 Trace 侧栏。
- 用假设值算出的结论，侧栏和列表页都有肉眼可见的"待实测确认"标记。
- 新 Tab 能按"只看假设值结论"过滤出正确的子集（写 1-2 条 `scripts/verify-trace.ts` 里的断言覆盖这个过滤逻辑，不需要测 UI 渲染）。

---

## 任务 3：判断流程图（依赖任务 1，但可以和任务 2 并行）

### 3.1 静态管线图（一次性，成本低）

新建 `docs/pipeline.md`，用 Mermaid（GitHub/大多数 Markdown 渲染器原生支持，不需要额外依赖）画一张图：输入 → 域识别（哪个文件做的，先搜 `resolveEngineeringDomain` 或类似命名） → 输入完整性检查（`inputIntegrityEngine.ts`） → 确定性预计算 → `bldcPatternEngine`/其它领域引擎 → （可选）AI 报告 → 审计器 → 展示。这是给人看的文档，不接入代码。

### 3.2 单次判断的动态流程图（核心功能，依赖任务 1）

新建 `src/components/TraceFlowDiagram.tsx`：输入一个 `TraceNode`，渲染成竖向流程图：
```
[输入: 母线标称电压=13.5V(假设)] ─┐
[输入: L=220µH(用户输入)]      ─┼─→ [公式: calculateBusPumping] ─→ [结果: 38.2V] ─→ [阈值: 40V] ─→ [CRITICAL]
[输入: di/dt=...(导入)]        ─┘
```
用纯 SVG 或简单的 flex 布局画（不要引入图表库——参考 `WaveformPlot.tsx` 纯 SVG 的做法，这个项目所有可视化都不依赖第三方库，因为要支持离线单文件导出）。`children` 存在时，递归画成多级链条（每一级一整行）。

这个组件其实就是 `TraceNode` 的另一种渲染方式，和任务 2 的 `TraceDrawer` 共享同一份数据，只是布局不同——建议 `TraceDrawer` 内部提供"列表视图 / 流程图视图"切换，而不是做两个独立入口。

### 3.3 What-if 面板（可选，时间不够可以跳过）

新建 `src/components/WhatIfPanel.tsx`：允许用户改一个 `TraceInput` 的数值，重新调用对应引擎函数（因为引擎是纯函数，直接传新参数即可），实时显示新的 `TraceNode`（新旧对比）。这一步依赖任务 1 的判据必须是"純函数、输入输出明确"，如果时间不够可以先跳过，不影响任务 1/2 的验收。

**验收标准**：
- `docs/pipeline.md` 存在且能正确反映当前代码里的实际调用顺序（不是凭空画的，要对照 `src/App.tsx`／`AnalysisContext.tsx` 里 `runAnalysis` 的真实调用链）。
- 至少一个 Pattern 结论能以流程图形式展开，图上的每个框对应 `TraceNode.inputs`/`formula`/`threshold`/`verdict` 里的真实数据，不是写死的示意图。

---

## 总体验收 Checklist

- [ ] `npm run lint` 通过
- [ ] `npm test` 通过（含新增的 `scripts/verify-trace.ts`）
- [ ] `npm run build` 通过，离线 HTML 能正常打开
- [ ] 手动过一遍：切一个 BLDC 工况 → Pattern 页面 → 点开一条有假设值参与的结论 → 侧栏正确标"待实测确认"并显示假设原因 → 切到流程图视图 → 链条和侧栏数据一致
- [ ] 审计 Tab 能过滤出"只用了假设值"的结论列表

## 参考文件清单（开工前建议通读一遍）

| 文件 | 作用 |
|---|---|
| `src/types.ts` | `analysisBasis.calculatedOutputEvidence` 现有结构，新增 `TraceNode` 放这里 |
| `src/types/v4Models.ts` | `PatternOutputItem` 定义 |
| `src/data/bldcPatternEngine.ts` | 18 种判据主体，任务 1 主要改这里 |
| `src/utils/motorPhysicsEngine.ts`（未细读，接手时看一遍） | 共享物理公式核心 |
| `src/utils/inputIntegrityEngine.ts` | 已有的输入完整性分级，任务 2.4 要对齐它 |
| `src/components/BldcPatternEngineView.tsx` | Pattern 结果的现有渲染，任务 2.2 改这里 |
| `src/components/ResultProvenanceBanner.tsx` | AI 结果来源标注，任务 2.5 参考 |
| `src/utils/waveformStorage.ts` | 波形留存（本阶段已完成），任务 2.1 侧栏要用它读回波形 |
| `src/components/WaveformPlot.tsx` | 纯 SVG 绘图范式，任务 3.2 流程图照此风格 |
| `scripts/verify-engines.ts` / `scripts/verify-waveform.ts` | 现有测试写法范式 |
| `src/contexts/UIContext.tsx` / `AppTabRouter.tsx` / `Navbar.tsx` | Tab 接线三件套 |
