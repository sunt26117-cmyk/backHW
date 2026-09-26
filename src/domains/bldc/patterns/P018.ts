import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, makeLogicalTraceNode, makeTraceInput } from '../trace';

export function evaluateP018(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P018: 堵转保护多级判据 (重点新增模块 4.1)
  // ----------------------------------------------------
  // [FIX-12，本次修复] 原来 triggered 无条件写死 true。堵转保护判据是否需要重点核查，
  // 取决于当前case是否真的存在堵转/机械卡滞相关的具体症状描述——不是每个case都在谈堵转，
  // 未提供证据时不触发。
  const p018Triggered = input.stallRiskIndicated === true;
  const stallCurrentThresholdA = input.stallCurrentThresholdA;
  const stallRpmThreshold = input.stallRpmThreshold;
  const stallLevel1TimeMs = input.stallLevel1TimeMs;
  const stallLevel2TimeMs = input.stallLevel2TimeMs;
  const stallLevel3TimeMs = input.stallLevel3TimeMs;
  const stallLockoutCountN = input.stallLockoutCountN;
  const stallCurrentExceeded = Number.isFinite(input.currentPeakA) && Number.isFinite(stallCurrentThresholdA)
    ? (input.currentPeakA as number) > (stallCurrentThresholdA as number) : undefined;
  const stallLowSpeedSatisfied = Number.isFinite(input.rpm) && Number.isFinite(stallRpmThreshold)
    ? (input.rpm as number) < (stallRpmThreshold as number) : undefined;
  const p018Trace = makeLogicalTraceNode({
    id: 'bldcPattern:P018.stallEvidence',
    title: '堵转/机械卡滞证据适用性',
    value: p018Triggered ? 'TRIGGERED' : 'NO_EVIDENCE',
    inputs: [
      makeTraceInput('stallRiskIndicated', '堵转/机械卡滞风险指示', p018Triggered ? '是' : '否', traceSource(input, 'stallRiskIndicated'), undefined, p018Triggered ? '当前case已提供相关症状/证据' : '当前case没有堵转证据，不以通用风险代替case证据', traceEvidenceId(input, 'stallRiskIndicated')),
      makeTraceInput('currentPeakA', '运行峰值电流（保护标定关联）', traceValue(input.currentPeakA), traceSource(input, 'currentPeakA', !Number.isFinite(input.currentPeakA)), 'A', !Number.isFinite(input.currentPeakA) ? '缺失；只能作为后续标定输入缺口' : undefined, traceEvidenceId(input, 'currentPeakA')),
      makeTraceInput('rpm', '当前转速（保护联合判据关联）', traceValue(input.rpm), traceSource(input, 'rpm', !Number.isFinite(input.rpm)), 'rpm', !Number.isFinite(input.rpm) ? '缺失；无法验证低速/停转条件' : undefined, traceEvidenceId(input, 'rpm')),
      makeTraceInput('stallCurrentThresholdA', '堵转电流阈值', traceValue(stallCurrentThresholdA), traceSource(input, 'stallCurrentThresholdA', !Number.isFinite(stallCurrentThresholdA)), 'A', !Number.isFinite(stallCurrentThresholdA) ? '缺失；无法形成 I>I_stall_th 定量判据' : undefined, traceEvidenceId(input, 'stallCurrentThresholdA')),
      makeTraceInput('stallRpmThreshold', '堵转低速阈值', traceValue(stallRpmThreshold), traceSource(input, 'stallRpmThreshold', !Number.isFinite(stallRpmThreshold)), 'rpm', !Number.isFinite(stallRpmThreshold) ? '缺失；无法形成 RPM<RPM_low_th 定量判据' : undefined, traceEvidenceId(input, 'stallRpmThreshold')),
      makeTraceInput('stallLevel1TimeMs', 'Level 1 时间窗', traceValue(stallLevel1TimeMs), traceSource(input, 'stallLevel1TimeMs', !Number.isFinite(stallLevel1TimeMs)), 'ms', !Number.isFinite(stallLevel1TimeMs) ? '缺失；需按热模型/控制策略标定' : undefined, traceEvidenceId(input, 'stallLevel1TimeMs')),
      makeTraceInput('stallLevel2TimeMs', 'Level 2 时间窗', traceValue(stallLevel2TimeMs), traceSource(input, 'stallLevel2TimeMs', !Number.isFinite(stallLevel2TimeMs)), 'ms', !Number.isFinite(stallLevel2TimeMs) ? '缺失；需按热模型/控制策略标定' : undefined, traceEvidenceId(input, 'stallLevel2TimeMs')),
      makeTraceInput('stallLevel3TimeMs', 'Level 3 时间窗', traceValue(stallLevel3TimeMs), traceSource(input, 'stallLevel3TimeMs', !Number.isFinite(stallLevel3TimeMs)), 'ms', !Number.isFinite(stallLevel3TimeMs) ? '缺失；需按热模型/控制策略标定' : undefined, traceEvidenceId(input, 'stallLevel3TimeMs')),
      makeTraceInput('stallLockoutCountN', 'Level 3 锁存累计次数', traceValue(stallLockoutCountN), traceSource(input, 'stallLockoutCountN', !Number.isFinite(stallLockoutCountN)), '次', !Number.isFinite(stallLockoutCountN) ? '缺失；需按故障锁存策略标定' : undefined, traceEvidenceId(input, 'stallLockoutCountN')),
    ],
    formula: '适用性先决条件：存在堵转/机械卡滞证据；真正保护判据应为 I>I_stall_th AND RPM<RPM_low_th AND t>window，不用温度单独代替',
    standardRef: '电机额定/峰值电流规格；P006/P007热时间常数；项目堵转保护需求',
    verdict: p018Triggered ? 'FAIL' : 'INFO',
  });
  return {
    id: 'P018',
    name: '电机堵转保护多级复合联合判据 (Multi-Level Stall Protection Rule Engine)',
    triggered: p018Triggered,
    patternKind: 'DETECTED_RISK',
    trace: [p018Trace],
    corePhysicalChain: '联合判据：相电流 > I_stall_th AND 机械转速 < RPM_low_th AND 持续时间 > Time_window；严禁单纯使用温度阈值粗暴判断！四级阈值的结构具有普遍工程意义，但具体数值(电流/转速/时间窗)必须按电机额定电流与P006/P007给出的热时间常数标定，不应直接套用示例数字',
    calculatedValues: {
      ...(p018Triggered ? {} : { '⚠ 适用性说明': '自由文本/工况输入中未发现堵转、机械卡滞相关的具体症状描述，本模式暂未判定为当前case的已触发风险，如设计确实存在堵转工况请补充描述' }),
      '堵转电流判据': stallCurrentExceeded === undefined ? '缺输入' : (stallCurrentExceeded ? 'I > I_stall_th' : 'I ≤ I_stall_th'),
      '低速判据': stallLowSpeedSatisfied === undefined ? '缺输入' : (stallLowSpeedSatisfied ? 'RPM < RPM_low_th' : 'RPM ≥ RPM_low_th'),
      'I_stall_th (A)': stallCurrentThresholdA ?? '缺输入',
      'RPM_low_th (rpm)': stallRpmThreshold ?? '缺输入',
      't1 (ms)': stallLevel1TimeMs ?? '缺输入',
      't2 (ms)': stallLevel2TimeMs ?? '缺输入',
      't3 (ms)': stallLevel3TimeMs ?? '缺输入',
      'N (次)': stallLockoutCountN ?? '缺输入',
      'Level 1 (软限制，示例阈值，需按实际电机标定)': '电流 > I_stall_th 且 RPM < RPM_low_th 持续 t1 → 实施转矩限制',
      'Level 2 (PWM降额，示例阈值，需按实际电机标定)': '持续 t2 未恢复 → PWM 占空比阶梯降额，并上报 DTC 预警码',
      'Level 3 (安全停机，示例阈值，需按实际电机标定)': '持续 t3 仍未脱困 → 触发安全停机，关断三相逆变桥，进入低功耗怠速保护',
      'Level 4 (故障锁存，示例阈值，需按实际电机标定)': '单次点火循环内累计触发 N 次 Level 3 → 永久锁存故障码，禁止再次强拖点火',
      '⚠ 标定依据': 't1/t2/t3 时间窗应基于 P006/P007 给出的热时间常数标定(堵转保护延时的物理依据本质上是热)，而不是独立拍脑袋设定；电流阈值应基于电机连续/峰值电流规格',
    },
    riskLevel: p018Triggered ? 'Medium' : 'Low',
    confidence: p018Triggered ? 'HIGH' : 'LOW',
    evidenceType: p018Triggered ? 'AI_INFERENCE' : 'UNKNOWN',
    vetoTriggered: false,
    candidateMeasures: ['实施四级递进式堵转闭环保护策略，兼顾机械卡滞脱困能力与电子器件防烧毁安全，时间窗与P006/P007的热模型联动标定'],
    sideEffects: ['频繁微小卡滞可能引起短暂停机，需针对机械机构调优延时滞回参数'],
    verificationItems: ['在机械端通过抱闸制动施加机械死锁，验证 4 级保护的状态转移时序与标定的热时间常数是否匹配'],
    unknownsToTest: ['零下 40℃ 润滑脂凝固导致的冷态假堵转与真实硬限位碰撞的区别特征提取'],
  }
}
