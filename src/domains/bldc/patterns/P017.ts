import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, makeLogicalTraceNode, makeTraceInput } from '../trace';

export function evaluateP017(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P017: 电流采样架构决策器 (重点新增模块 4.1)
  // ----------------------------------------------------
  const p017Trace = makeLogicalTraceNode({
    id: 'bldcPattern:P017.currentSensingArchitecture',
    title: '电流采样架构决策输入',
    value: input.currentSenseArchitecture || '未指定',
    inputs: [
      makeTraceInput('currentSenseArchitecture', '当前采样架构', input.currentSenseArchitecture || '未指定', traceSource(input, 'currentSenseArchitecture'), undefined, undefined, traceEvidenceId(input, 'currentSenseArchitecture')),
      makeTraceInput('currentSenseFaultRiskIndicated', '当前case是否有采样故障证据', input.currentSenseFaultRiskIndicated === true ? '是' : '否', traceSource(input, 'currentSenseFaultRiskIndicated'), undefined, undefined, traceEvidenceId(input, 'currentSenseFaultRiskIndicated')),
    ],
    formula: 'Architecture choice = accuracy/observability/protection/BOM/PCB complexity trade-off；本节点不伪造“测得优劣”',
    standardRef: 'FOC current sensing requirements；ISO 26262 fault observability/diagnostic design',
    verdict: 'INFO',
    degradedOverride: false,
  });

  return {
    id: 'P017',
    name: '电流采样架构决策矩阵 (Current Sensing Architecture Trade-Off)',
    triggered: true,
    // [FIX-11，本次修复] 同 P015，这是架构选型权衡参考表，标记为 CHECKLIST 与真实检测到
    // 的故障模式区分开，不计入"已触发风险"统计。
    patternKind: 'CHECKLIST',
    trace: [p017Trace],
    corePhysicalChain: '系统级权衡：低边单电阻 (Single Low-Side) vs 三相低边独立采样 (Three-Phase Low-Side) vs 相线直串采样 (Inline Phase) vs 霍尔电流传感器 (Hall Sensor)',
    calculatedValues: {
      '方案 A (相电流独立采样 - 推荐)': '高精度FOC支持、全占空比采样、支持单相开路短路独立诊断、PCB复杂度中等、BOM适中',
      '方案 B (低边单电阻 - 不推荐)': '无法支持高占空比或低调制比采样、死区盲区大、无法独立诊断下管直通、FOC转矩纹波显著增大',
      '方案 C (霍尔电流传感器 - 特殊高压)': '完全电气隔离、零分流电阻发热、成本高、体积庞大无法入壳、响应带宽受限',
      '显式决策理由': 'Why A: 平衡了 FOC 动态控制精度与 ASIL B 单相故障可观测性；Why not B: 无法满足急停与高速弱磁下的实时相电流闭环；Why not C: 成本与尺寸通常无法满足约束（具体BOM成本请按实际选型询价确认，此处不再给出编造的美元数字）。',
    },
    riskLevel: 'Low',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: ['采用双相或三相低边独立采样架构配合高共模抑制比专用检流放大器'],
    sideEffects: ['需精准调谐三路采样的对称性与差分布线一致性'],
    verificationItems: ['在 100% 满扭矩工况下测量三相采样电流的平衡度与总谐波畸变率 THD'],
    unknownsToTest: ['大电流走线对微弱检流信号焊盘的互感干扰 (Mutual Inductance) 抑制比'],
  }
}
