import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { traceSource, traceEvidenceId, traceValue, pushAssumptionNote, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP011(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P011: 驱动UVLO (Section 4)
  // ----------------------------------------------------
  const p011Assumptions: string[] = [];
  const uvloTyp = input.uvloTypicalV !== undefined ? input.uvloTypicalV : 8.2;
  const uvloMin = input.uvloMinV !== undefined ? input.uvloMinV : 7.8;
  if (input.uvloTypicalV === undefined || input.uvloMinV === undefined) {
    p011Assumptions.push('UVLO门限未指定具体驱动芯片型号，假设典型8.2V/最小7.8V，请替换为实际选型器件的datasheet值');
  }
  // [FIX-10，本次修复] 原来 triggered 无条件写死 true。现在改为两条独立证据路径，任一满足
  // 才触发：(a) 计算路径——提供了预期最低供电电压(如冷启动跌落曲线)，且没有升压稳压兜底，
  // 跌落值真的会侵入UVLO典型门限以内；(b) 文本路径——自由文本明确描述了预驱死锁/UVLO/
  // 驱动欠压锁定这类具体症状(例如ESD瞬态导致预驱芯片死锁，不一定是"电源慢跌落"这种狭义
  // UVLO物理过程，但同属"驱动芯片保护性锁死"这一类故障，仍应提示核查UVLO相关设计)。
  // 未提供预期最低供电电压时，不再用一个固定假设值(6.0V)直接顶替计算然后作为触发依据——
  // 那样等于换了个方式继续硬编码；假设值只用于展示裕量供参考，不据此单独触发。
  const p011VbusMinProvided = input.vbusMinExpectedV !== undefined;
  const p011VbusMinEffective = p011VbusMinProvided ? input.vbusMinExpectedV! : 6.0;
  if (!p011VbusMinProvided) {
    p011Assumptions.push('未提供预期最低供电电压(如ISO 16750-2冷启动跌落曲线)，以下跌落裕量按典型cranking最低值6.0V展示，仅供数量级参考，不作为触发依据');
  }
  const p011HasBoost = input.hasSupplyBoostRegulation === true;
  const p011MarginV = uvloTyp - p011VbusMinEffective;
  const p011ComputedRisk = p011VbusMinProvided && !p011HasBoost && p011VbusMinEffective < uvloTyp;
  const p011TextRisk = input.driverLockupRiskIndicated === true;
  const p011Triggered = p011ComputedRisk || p011TextRisk;

  const p011CalculatedValues: Record<string, string | number> = {
    '驱动芯片 UVLO 门限 (V)': `${uvloTyp}V (典型值) / ${uvloMin}V (最小值)`,
    [p011VbusMinProvided ? '预期最低供电电压 (V)' : '⚠ 预期最低供电电压：未提供，以下为按6.0V假设展示 (V)']: p011VbusMinEffective,
    '升压稳压兜底': p011HasBoost ? '已确认有升压稳压电路兜底' : (input.hasSupplyBoostRegulation === false ? '已确认无升压稳压电路' : '未提供'),
    '相对UVLO典型门限的裕量 (V，负值代表会侵入UVLO区间)': Number(p011MarginV.toFixed(2)),
    '全关断响应延迟 (ns)': '< 150 ns',
    '独立保护能力': '硬件独立硬关断，无需 MCU 软件干预',
    ...(p011TextRisk ? { '⚠ 文本证据': '自由文本描述了预驱死锁/驱动欠压锁定类具体症状，据此触发本模式' } : {}),
  };
  pushAssumptionNote(p011CalculatedValues, p011Assumptions);

  const p011Trace = makeTraceNode({
    id: 'bldcPattern:P011.uvloMargin',
    title: '驱动供电相对 UVLO 门限裕量',
    value: traceValue(p011MarginV),
    unit: 'V',
    inputs: [
      makeTraceInput('vbusMinExpectedV', '预期最低供电电压', p011VbusMinEffective, traceSource(input, 'vbusMinExpectedV', !p011VbusMinProvided), 'V', !p011VbusMinProvided ? '未提供，6.0V仅作展示参考，不作为触发依据' : undefined, traceEvidenceId(input, 'vbusMinExpectedV')),
      makeTraceInput('uvloTypicalV', 'UVLO典型门限', uvloTyp, traceSource(input, 'uvloTypicalV', input.uvloTypicalV === undefined), 'V', input.uvloTypicalV === undefined ? '未提供具体驱动型号，假设8.2V' : undefined, traceEvidenceId(input, 'uvloTypicalV')),
      makeTraceInput('uvloMinV', 'UVLO最小门限', uvloMin, traceSource(input, 'uvloMinV', input.uvloMinV === undefined), 'V', input.uvloMinV === undefined ? '未提供具体驱动型号，假设7.8V' : undefined, traceEvidenceId(input, 'uvloMinV')),
      makeTraceInput('hasSupplyBoostRegulation', '是否有升压稳压兜底', input.hasSupplyBoostRegulation === true ? '是' : (input.hasSupplyBoostRegulation === false ? '否' : '未提供'), traceSource(input, 'hasSupplyBoostRegulation'), undefined, traceEvidenceId(input, 'hasSupplyBoostRegulation')),
    ],
    formula: 'UVLO Margin = V_UVLO,typ − V_supply,min；若无升压且 V_supply,min < UVLO_typ，则计算路径触发',
    standardRef: '实际预驱 UVLO datasheet；ISO 16750-2 cranking profile（供电跌落工况）',
    threshold: { value: 0, unit: 'V', label: '进入 UVLO 典型区间的边界' },
    verdict: p011Triggered ? 'FAIL' : (p011MarginV < 0 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P011',
    name: '栅极驱动芯片欠压锁定 (Gate Driver Under-Voltage Lock-Out, UVLO)',
    triggered: p011Triggered,
    patternKind: 'DETECTED_RISK',
    trace: [p011Trace],
    corePhysicalChain: `驱动供电 Vcc 异常跌落至 ${uvloMin}V 以下 → 门极驱动输出电压不足 → MOSFET 进入高阻放大区而非饱和导通 → 导通压降 Vds 激增 → 芯片数毫秒内热击穿`,
    calculatedValues: p011CalculatedValues,
    riskLevel: p011Triggered ? 'Medium-High' : 'Low',
    confidence: (p011Assumptions.length > 0 && !p011TextRisk) ? 'LOW' : 'HIGH',
    evidenceType: p011TextRisk ? 'AI_INFERENCE' : (p011Assumptions.length > 0 ? 'CALCULATED' : 'DATASHEET'),
    vetoTriggered: false,
    candidateMeasures: [
      '选用集成硬件独立 UVLO 的车规预驱芯片，一旦欠压自动拉低所有门极输出并锁存 FAULT 引脚',
      '在驱动电源供电脚紧贴布置 10μF X7R + 0.1μF 去耦电容防止瞬间跌落',
    ],
    // [FIX] 原文混用了 ISO 7637-2 Pulse 4（瞬态脉冲）与 ISO 16750-2 冷启动跌落曲线（cranking）
    // 两个不同的标准/工况，这里分开陈述，避免签核文档里张冠李戴。
    sideEffects: ['汽车冷启动 (Cranking，参考 ISO 16750-2 跌落曲线，典型可至6V附近) 工况下若未做升压稳压，会触发 UVLO 导致电机短时停机；这与 ISO 7637-2 Pulse 4 (瞬态脉冲串扰) 是两个不同的标准工况，签核文档中不应混用'],
    verificationItems: ['以可编程电源人为将 12V 供电按 ISO 16750-2 冷启动跌落曲线跌落，监测 UVLO 触发阈值与半桥关断波形'],
    unknownsToTest: ['整车 12V 蓄电池在 -30℃ 冷启动时的极限跌落最低瞬态电压（ISO 16750-2 定义的cranking profile，与ISO 7637-2 Pulse 4 分开验证）'],
  }
}
