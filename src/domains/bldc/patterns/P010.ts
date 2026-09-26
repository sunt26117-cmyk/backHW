import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, makeLogicalTraceNode, makeTraceInput } from '../trace';

export function evaluateP010(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P010: 电流采样故障 (Section 4)
  // ----------------------------------------------------
  // [FIX-9，本次修复] 原来 triggered 无条件写死 true。现在改为：只有当(a)电流采样架构
  // 明确是依赖分流电阻+运放+ADC的方案(低边单电阻/三相低边独立/相线直串，隔离霍尔电流
  // 传感器不适用这条"虚焊/偏置漂移/ADC饱和"的具体失效链)，或(b)自由文本里有采样链路
  // 故障的具体症状描述时才触发。
  const p010ShuntBasedArchitectures: Array<NonNullable<BldcEvaluationInput['currentSenseArchitecture']>> = ['LOW_SIDE_SINGLE', 'THREE_PHASE_LOW_SIDE', 'INLINE_PHASE'];
  const p010UsesShuntSensing = input.currentSenseArchitecture !== undefined && p010ShuntBasedArchitectures.includes(input.currentSenseArchitecture);
  const p010ExplicitlyHallCurrentSensor = input.currentSenseArchitecture === 'HALL_SENSOR';
  const p010Triggered = (p010UsesShuntSensing || input.currentSenseFaultRiskIndicated === true) && !p010ExplicitlyHallCurrentSensor;
  const p010Trace = makeLogicalTraceNode({
    id: 'bldcPattern:P010.sensingFaultApplicability',
    title: '电流采样故障模式适用性 / 风险证据',
    value: p010Triggered ? 'TRIGGERED' : (p010ExplicitlyHallCurrentSensor ? 'NOT_APPLICABLE' : 'NO_EVIDENCE'),
    inputs: [
      makeTraceInput('currentSenseArchitecture', '电流采样架构', input.currentSenseArchitecture || '未提供', traceSource(input, 'currentSenseArchitecture', false), undefined, undefined, traceEvidenceId(input, 'currentSenseArchitecture')),
      makeTraceInput('currentSenseFaultRiskIndicated', '采样链故障症状指示', input.currentSenseFaultRiskIndicated === true ? '是' : '否', input.currentSenseFaultRiskIndicated === true ? traceSource(input, 'currentSenseFaultRiskIndicated') : 'USER_INPUT', undefined, undefined, traceEvidenceId(input, 'currentSenseFaultRiskIndicated')),
    ],
    formula: 'Triggered = (Shunt-based architecture OR specific sensing-fault evidence) AND architecture≠HALL_SENSOR',
    standardRef: '电流采样架构定义；ASIL诊断/故障注入需求',
    verdict: p010Triggered ? 'FAIL' : 'INFO',
  });
  return {
    id: 'P010',
    name: '电流采样硬件故障双重致命性 (Current Sensing Dual Failure: Control & Protection)',
    triggered: p010Triggered,
    patternKind: 'DETECTED_RISK',
    corePhysicalChain: '分流电阻虚焊/运放供电跌落/偏置漂移/ADC饱和 → 同时引发两大致命后果：① 闭环 FOC 电流环发散产生失控过流；② 硬件过流保护判据失效无法关断，造成灾难性炸机',
    trace: [p010Trace],
    calculatedValues: {
      '电流采样架构': input.currentSenseArchitecture ?? (input.currentSenseFaultRiskIndicated ? '未显式指定，由自由文本中的采样故障症状描述推断为分流电阻方案' : '未提供，无法判断本模式是否适用于当前工况'),
      '失效影响': '控制失效 + 保护失效 双重并发',
      '检测机制': '运放虚地偏置电压自检 (Vref/2) + 零电流采样窗口校准',
      '容错等级': '双通道交叉校验 (Dual Channel ADC Redundancy)',
      ...(p010ExplicitlyHallCurrentSensor ? { '⚠ 不适用说明': '电流采样架构已明确为隔离霍尔电流传感器，不存在分流电阻/运放/ADC这条具体失效链，本条不适用于当前工况(霍尔电流传感器有其自身的失效模式，需另行评估)' } : {}),
    },
    riskLevel: p010Triggered ? 'High' : 'Low',
    confidence: input.currentSenseArchitecture !== undefined ? 'HIGH' : (input.currentSenseFaultRiskIndicated ? 'MEDIUM' : 'LOW'),
    evidenceType: input.currentSenseArchitecture !== undefined ? 'SPECIFICATION' : (input.currentSenseFaultRiskIndicated ? 'AI_INFERENCE' : 'UNKNOWN'),
    vetoTriggered: false,
    candidateMeasures: [
      '在每次上电自检 (POST) 中检查运放静止偏置电压是否在 1.65V ± 50mV 窗口内',
      '增加独立的纯硬件过流比较器 (Hardware Comparator)，不依赖 MCU 软件与 ADC 转换',
    ],
    sideEffects: ['上电增加 15ms 自检时间；增加一颗双路高速比较器芯片增加 BOM 成本 $0.18'],
    verificationItems: ['在采样电阻输入端注入模拟偏置漂移信号，验证 MCU 诊断报文与故障切断响应'],
    unknownsToTest: ['采样电阻低温 -40℃ 与高温 125℃ 下的 TCR 温漂曲线 (典型 ±50ppm/℃)'],
  }
}
