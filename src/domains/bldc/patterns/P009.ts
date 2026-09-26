import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, makeLogicalTraceNode, makeTraceInput } from '../trace';

export function evaluateP009(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P009: 霍尔故障 (Section 4)
  // ----------------------------------------------------
  // [FIX-8，本次修复] 原来 triggered 无条件写死 true，不管当前电机是否用霍尔传感器、
  // 也不管case内容跟霍尔有没有关系都会命中。现在改为：只有当(a)明确指定电机位置传感器
  // 类型为HALL，或(b)自由文本里有霍尔信号故障的具体症状描述时才触发；如果明确指定了
  // 非霍尔方案(编码器/旋变/无感)，则直接判定为不适用。未提供任何证据时不触发，但该模式
  // 仍保留在"全部模式"列表中供工程师主动查阅参考内容。
  const p009SensorType = input.motorSensorType;
  const p009ExplicitlyNotHall = p009SensorType !== undefined && p009SensorType !== 'HALL';
  const p009HallImplied = p009SensorType === 'HALL' || input.hallFaultRiskIndicated === true;
  const p009Triggered = p009HallImplied && !p009ExplicitlyNotHall;
  const p009SensorTypeKnown = p009SensorType !== undefined;
  const p009Trace = makeLogicalTraceNode({
    id: 'bldcPattern:P009.hallApplicability',
    title: '霍尔故障模式适用性 / 风险证据',
    value: p009Triggered ? 'TRIGGERED' : (p009ExplicitlyNotHall ? 'NOT_APPLICABLE' : 'NO_EVIDENCE'),
    inputs: [
      makeTraceInput('motorSensorType', '电机位置传感器类型', p009SensorType || '未提供', traceSource(input, 'motorSensorType', false), undefined, undefined, traceEvidenceId(input, 'motorSensorType')),
      makeTraceInput('hallFaultRiskIndicated', '霍尔故障症状指示', input.hallFaultRiskIndicated === true ? '是' : '否', input.hallFaultRiskIndicated === true ? traceSource(input, 'hallFaultRiskIndicated') : 'USER_INPUT', undefined, undefined, traceEvidenceId(input, 'hallFaultRiskIndicated')),
    ],
    formula: 'Triggered = (SensorType=HALL OR HallFaultSymptom=true) AND SensorType≠explicit non-HALL',
    standardRef: '位置传感器架构定义；故障注入/诊断需求',
    verdict: p009Triggered ? 'FAIL' : 'INFO',
  });
  return {
    id: 'P009',
    name: '霍尔传感器故障与容错退避 (Hall Sensor Hardware Failure & Degradation)',
    triggered: p009Triggered,
    patternKind: 'DETECTED_RISK',
    corePhysicalChain: '霍尔线缆断线/虚焊/短路/强磁干扰 → 产生非法编码 (000/111) 或状态跳变卡死 → MCU换相失步 → 电机失步停转、强烈抖动或反转风险 → 触发整车功能降级',
    trace: [p009Trace],
    calculatedValues: {
      '电机位置传感器类型': p009SensorTypeKnown ? p009SensorType! : (input.hallFaultRiskIndicated ? '未显式指定，由自由文本中的霍尔故障症状描述推断为霍尔方案' : '未提供，无法判断本模式是否适用于当前电机方案'),
      '支持诊断的物理失效模式': '开路 / 高钳位 / 低钳位 / 卡死 / 非法状态 / 高频抖动噪声',
      '失效检测响应时间 (ms)': '< 2.5 ms (1个PWM控制周期内锁定)',
      '整车危害等级': 'ASIL B (防失控飞车与意外反转)',
      ...(p009ExplicitlyNotHall ? { '⚠ 不适用说明': `电机位置传感器已明确为 ${p009SensorType}，不存在霍尔硬件故障这一物理模式，本条不适用于当前工况` } : {}),
    },
    riskLevel: p009Triggered ? 'Medium-High' : 'Low',
    confidence: p009SensorTypeKnown ? 'HIGH' : (input.hallFaultRiskIndicated ? 'MEDIUM' : 'LOW'),
    evidenceType: p009SensorTypeKnown ? 'SPECIFICATION' : (input.hallFaultRiskIndicated ? 'AI_INFERENCE' : 'UNKNOWN'),
    vetoTriggered: false,
    candidateMeasures: [
      '双霍尔容错估计算法 (2-Hall Fault Tolerant Logic)：单霍尔损坏时利用剩余两相推算换相角',
      '无位置传感器反电动势重构 (Sensorless BEMF Observer)：转速高于 600rpm 时无缝切换无感模式',
    ],
    sideEffects: ['双霍尔降级运行时转矩脉动增加 15%，低速平顺性受轻微影响'],
    verificationItems: ['故障注入仪在电机满载运转中人为切断 H1 信号线，验证系统是否平滑切入降级保护'],
    unknownsToTest: ['零速重载启动工况下无感反电动势无法建立时的开环强拖可靠性'],
  }
}
