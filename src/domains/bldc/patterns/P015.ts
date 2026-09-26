import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { makeLogicalTraceNode, makeTraceInput } from '../trace';

export function evaluateP015(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P015: MCU依赖型保护 (Section 4)
  // ----------------------------------------------------
  const p015Trace = makeLogicalTraceNode({
    id: 'bldcPattern:P015.protectionIndependence',
    title: '保护链独立性分类',
    value: 'CHECKLIST',
    inputs: [
      makeTraceInput('softwareDependentProtection', '软件依赖保护类别', '过温降额 / 堵转 / 弱磁限速 / 相平衡诊断', 'SPEC_CONSTANT'),
      makeTraceInput('hardwareIndependentProtection', '硬件独立保护类别', '硬件过流截流 / UVLO / 硬件超温', 'SPEC_CONSTANT'),
      makeTraceInput('mixedProtection', '混合保护类别', '外置高速比较器直连驱动SD + MCU告警', 'SPEC_CONSTANT'),
    ],
    formula: 'Fault → Detection → Decision → Protection → Actuation → Confirmation；识别是否经过MCU软件路径',
    standardRef: 'ISO 26262 hardware/software independence；项目安全架构定义',
    verdict: 'INFO',
    degradedOverride: false,
  });

  return {
    id: 'P015',
    name: 'MCU依赖型保护独立性评估 (Protection Independence Taxonomy)',
    triggered: true,
    // [FIX-11，本次修复] 本条是"保护链分类参考清单"，不是针对某个具体case测出来的故障，
    // 标记为 CHECKLIST 后 UI/统计口径会把它从"已触发风险"列表中分离，避免跟P009/P010等
    // 真实测出来的故障模式混在一起、让人误以为这也是本次分析新发现的问题。
    patternKind: 'CHECKLIST',
    trace: [p015Trace],
    corePhysicalChain: '保护链分类：Fault → Detection → Decision → Protection → Actuation → Confirmation；区分软件依赖与硬件独立断路',
    calculatedValues: {
      '软件依赖保护 (Software-Dependent)': '过温降额、堵转停机、弱磁限速、相平衡诊断',
      '硬件独立保护 (Hardware-Independent)': '预驱逐周期峰值过流硬件截流、门极UVLO硬关断、硬件超温关断',
      '混合保护 (Partially-Independent)': '外置高速比较器输出直连驱动芯片SD引脚，同时上报MCU中断',
    },
    riskLevel: 'Medium',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: ['确保致命破坏级故障（如短路与直通）100% 走纯硬件独立保护链路，不经过 MCU 代码执行'],
    sideEffects: ['纯硬件保护缺少软件灵活性，需严格调谐硬件滤波延时防止误触发'],
    verificationItems: ['在 MCU 死机或陷入死循环状态下故意触发过流，验证硬件保护是否依然能在 2μs 内切断'],
    unknownsToTest: ['MCU 锁相环 (PLL) 失锁时 PWM 输出引脚的默认上下拉电气状态'],
  }
}
