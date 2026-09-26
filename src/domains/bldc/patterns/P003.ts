import type { PatternOutputItem } from '../../../types';
import type { BldcEvaluationInput } from '../types';
import type { BldcPatternContext } from '../context';

import { linearInterp } from '../../../utils/deviceLibrary';
import { checkMillerRisk } from '../../../physics/motorPhysicsEngine';
import { traceSource, traceEvidenceId, traceValue, makeTraceInput, makeTraceNode } from '../trace';

export function evaluateP003(input: BldcEvaluationInput, ctx: BldcPatternContext): PatternOutputItem {
  // P003: 高dv/dt→米勒误导通 (Section 4)
  // ----------------------------------------------------
  // 若器件库提供了 Crss@Vds / Vth@Tj 曲线，按当前工况插值替代写死标量
  const cgdPfEff = input.crssCurve && input.crssCurve.length >= 2
    ? linearInterp(input.crssCurve, ctx.vbusNominalSafe).value
    : input.cgdPf;
  const vthMinVEff = input.vthCurve && input.vthCurve.length >= 2
    ? linearInterp(input.vthCurve, 25).value
    : input.vthMinV;

  // [统一共享核心] 原先这里是 P003 自己写的一份"阻性界 + 容性分压界 + 源极电感过冲 + 实测优先"
  // 米勒模型；现已把该模型提升进 motorPhysicsEngine.checkMillerRisk（共享核心），P003 与
  // bldcDeterministicEngine 走同一份实现，避免两处各自维护、各错一次。
  // 器件库的曲线插值仍留在本引擎（共享核心不应依赖器件库）。
  const millerShared = checkMillerRisk({
    V_th_min: vthMinVEff,
    C_gd_pF: cgdPfEff,
    C_gs_pF: input.cgsPf,
    R_g_pulldown_ohm: input.rgOffOhm,
    dv_dt_V_per_ns: input.dvDtVns,
    V_bus_V: ctx.vbusNominalSafe,
    L_source_nH: input.sourceInductanceNh,
    di_dt_A_per_ns: input.diDtANs,
    V_gs_measured_V: input.gateSpikeMeasuredV,
  });
  const imiller = millerShared.millerCurrentA; // A
  const vgateInducedResistiveBound = millerShared.vGateInducedResistiveV!; // V，阻性上界
  const vgateInducedCapacitiveBound = millerShared.vGateInducedCapacitiveV;
  const vgateInduced = vgateInducedCapacitiveBound !== undefined
    ? Math.min(vgateInducedResistiveBound, vgateInducedCapacitiveBound)
    : vgateInducedResistiveBound;
  const inductiveVgsSpike = millerShared.inductiveOvershootV!;
  const vgateInducedTheoreticalTotal = millerShared.theoreticalVGateV!;
  const hasGateSpikeMeasured = millerShared.modelUsed === 'MEASURED';
  const vgateInducedTotal = millerShared.vGateInducedV;
  const millerMargin = millerShared.safetyMarginV;
  const p003ShootThroughRisk = millerShared.isRiskOfShootThrough;

  const p003CalculatedValues: Record<string, string | number> = {
    '开关节点电压变化率 dv/dt (V/ns)': input.dvDtVns,
    'MOSFET栅漏米勒电容 Cgd (pF，注意应为 Crss 且随 Vds 变化，需标注取值电压点)': cgdPfEff,
    '米勒感应耦合电流 I_miller (A)': Number(imiller.toFixed(3)),
    '门极关断回路总阻抗 Rg_off (Ω，需含外部电阻+芯片内阻+驱动下拉内阻)': input.rgOffOhm,
    '阻性上界 Vgs_resistive (V)': Number(vgateInducedResistiveBound.toFixed(2)),
  };
  if (vgateInducedCapacitiveBound !== undefined) {
    p003CalculatedValues['容性分压界 Vgs_capacitive (V)'] = Number(vgateInducedCapacitiveBound.toFixed(2));
    p003CalculatedValues['取用值(两界较小者) Vgs_induced (V)'] = Number(vgateInduced.toFixed(2));
  } else {
    p003CalculatedValues['⚠ 数据缺口'] = '未提供 Cgs，暂只能给出阻性上界，开关沿较短时可能显著高估实际感应电压';
  }
  p003CalculatedValues['门极最小开通阈值 Vth_min (V，@25℃)'] = vthMinVEff;
  p003CalculatedValues['源极电感 di/dt 过冲项 ΔVgs_inductive (V)'] = Number(inductiveVgsSpike.toFixed(2));
  p003CalculatedValues['理论估算(米勒耦合+源极电感过冲) Vgs_theoretical (V)'] = Number(vgateInducedTheoreticalTotal.toFixed(2));
  if (hasGateSpikeMeasured) {
    p003CalculatedValues['示波器实测门极 Vgs 尖峰 Vgs_measured (V)'] = Number(input.gateSpikeMeasuredV!.toFixed(2));
    p003CalculatedValues['理论值与实测值差异 (V，越大说明模型假设需修正)'] = Number((vgateInducedTheoreticalTotal - input.gateSpikeMeasuredV!).toFixed(2));
  }
  p003CalculatedValues[hasGateSpikeMeasured ? '判据取用值(实测优先) Vgs_total (V)' : '判据取用值(无实测，用理论估算) Vgs_total (V)'] = Number(vgateInducedTotal.toFixed(2));
  p003CalculatedValues['门极安全裕量 Margin (V)'] = Number(millerMargin.toFixed(2));

  const p003Trace = makeTraceNode({
    id: 'bldcPattern:P003.vgsInduced',
    title: '米勒误导通判据取用 Vgs',
    value: traceValue(vgateInducedTotal),
    unit: 'V',
    inputs: [
      makeTraceInput('dvdtVns', '开关节点 dv/dt', traceValue(input.dvDtVns), traceSource(input, 'dvdtVns', !Number.isFinite(input.dvDtVns)), 'V/ns', undefined, traceEvidenceId(input, 'dvdtVns')),
      makeTraceInput('cgdPf', 'Cgd / Crss', traceValue(cgdPfEff), traceSource(input, 'cgdPf', Boolean(input.crssCurve?.length && input.crssCurve.length >= 2)), 'pF', input.crssCurve?.length && input.crssCurve.length >= 2 ? '由器件库 Crss 曲线按当前 Vbus 插值' : !Number.isFinite(input.cgdPf) ? '未提供，当前模型仅能给出缺输入保护' : undefined, traceEvidenceId(input, 'cgdPf')),
      ...(input.cgsPf !== undefined ? [makeTraceInput('cgsPf', '栅源电容 Cgs', input.cgsPf, traceSource(input, 'cgsPf'), 'pF', undefined, traceEvidenceId(input, 'cgsPf'))] : [makeTraceInput('cgsPf', '栅源电容 Cgs', '缺输入', 'ASSUMED_DEFAULT', 'pF', '未提供；当前只能使用阻性上界')]),
      makeTraceInput('rgOffOhm', '关断回路总电阻 Rg_off', traceValue(input.rgOffOhm), traceSource(input, 'rgOffOhm', !Number.isFinite(input.rgOffOhm)), 'Ω', undefined, traceEvidenceId(input, 'rgOffOhm')),
      makeTraceInput('vbusNominal', '母线电压', ctx.vbusNominalSafe, traceSource(input, 'vbusNominal', ctx.vbusNominalWasAssumed), 'V', ctx.vbusNominalWasAssumed ? '未提供，按13.5V假设' : undefined, traceEvidenceId(input, 'vbusNominal')),
      makeTraceInput('sourceInductanceNh', '源极寄生电感', traceValue(input.sourceInductanceNh), traceSource(input, 'sourceInductanceNh', input.sourceInductanceNh === undefined), 'nH', input.sourceInductanceNh === undefined ? '未提供，理论源极电感过冲项不可单独核实' : undefined, traceEvidenceId(input, 'sourceInductanceNh')),
      makeTraceInput('diDtANs', 'di/dt', traceValue(input.diDtANs), traceSource(input, 'diDtANs', input.diDtANs === undefined), 'A/ns', input.diDtANs === undefined ? '未提供，源极电感过冲项缺输入' : undefined, traceEvidenceId(input, 'diDtANs')),
      makeTraceInput('gateSpikeV', '门极 Vgs 实测尖峰', hasGateSpikeMeasured ? input.gateSpikeMeasuredV! : '未导入', hasGateSpikeMeasured ? traceSource(input, 'gateSpikeV') : 'USER_INPUT', 'V', hasGateSpikeMeasured ? undefined : '没有实测门极波形，判据取理论模型值', traceEvidenceId(input, 'gateSpikeV')),
      makeTraceInput('vthMinV', 'MOSFET Vth 最小值', vthMinVEff, traceSource(input, 'vthMinV', Boolean(input.vthCurve?.length && input.vthCurve.length >= 2)), 'V', input.vthCurve?.length && input.vthCurve.length >= 2 ? '由器件库 Vth 曲线 @25℃ 插值' : undefined, traceEvidenceId(input, 'vthMinV')),
    ],
    formula: 'I_miller=Cgd·dv/dt；Vgs_induced=min(阻性界, 容性分压界)+L_source·di/dt；有实测 Vgs 时以实测优先',
    standardRef: 'MOSFET 栅极驱动数据手册 / 实测 Vgs 过冲边界',
    threshold: { value: vthMinVEff, unit: 'V', label: 'Vth 最小开通阈值' },
    verdict: p003ShootThroughRisk ? 'CRITICAL' : (vgateInducedTotal >= vthMinVEff * 0.8 ? 'MARGINAL' : 'PASS'),
  });

  return {
    id: 'P003',
    name: '高dv/dt→门极米勒效应误导通 (Miller Effect Induced False Turn-On)',
    triggered: input.dvDtVns >= 4.0 || input.rgOffOhm >= 3.0 || p003ShootThroughRisk,
    corePhysicalChain: '开关管对管开通 → 桥臂中点高dv/dt → 经Cgd耦合米勒位移电流 → 流经关断电阻Rg_off → 门极抬升Vgs > Vth → 同桥臂瞬态直通炸机。真实感应电压是阻性界与容性分压界中的较小值，仅算阻性界会在开关沿较短时高估；有示波器实测Vgs尖峰时以实测为准',
    calculatedValues: p003CalculatedValues,
    trace: [p003Trace],
    riskLevel: p003ShootThroughRisk ? 'High' : (millerMargin < 0.5 ? 'Medium-High' : 'Low'),
    confidence: hasGateSpikeMeasured ? 'HIGH' : (vgateInducedCapacitiveBound !== undefined ? 'HIGH' : 'MEDIUM'),
    evidenceType: hasGateSpikeMeasured ? 'MEASURED' : 'CALCULATED',
    vetoTriggered: p003ShootThroughRisk,
    vetoReason: p003ShootThroughRisk
      ? `门极抬升电压 (${vgateInducedTotal.toFixed(2)}V${hasGateSpikeMeasured ? '，示波器实测' : '，理论估算'}) 已超出MOSFET阈值下限 (${input.vthMinV}V)，同桥臂直通 (Shoot-Through) 致命风险触发一票否决！`
      : undefined,
    candidateMeasures: [
      '门极回路增加有源米勒钳位电路 (Active Miller Clamp) 或门极对地反向二极管+低阻下拉',
      '减小关断电阻 Rg_off (如从 4.7Ω 降至 1.5Ω) 强行泄放位移电流（注意：这会同时缩短 P004 死区判据里的 t_f，两个 pattern 的结论需联动复核）',
      '驱动器负压关断设计 (-3V ~ -5V Vgs) 彻底拉大开通电压安全边界',
    ],
    sideEffects: [
      '减小关断电阻会加快关断瞬态 di/dt，导致源极寄生电感产生更高的感应反冲尖峰与 EMI',
      '增加负压电源需要额外电荷泵或隔离辅助电源，增加 BOM 成本 $0.25',
    ],
    verificationItems: [
      '使用双通道高阻有源探头同时捕获下管 Vgs 与中点开关节点 Vds 瞬态上升沿波形',
      '在 2~3 个不同 Rg_off 下分别测 Vgs：若随 Rg_off 线性增长则阻性模型成立；若很快饱和不再跟随则容性分压界主导，说明当前公式可能高估',
    ],
    unknownsToTest: ['高温 125℃ 工况下 MOSFET 阈值电压 Vth 的负温度漂移量 (典型 -3mV/℃，需按具体器件datasheet核实，部分沟槽器件温漂更大)'],
  }
}
