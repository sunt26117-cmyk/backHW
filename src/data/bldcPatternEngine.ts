/**
 * BLDC Problem Pattern Engine (确定性物理与车规规则引擎，不靠关键词匹配)
 * 严格遵照 V4 升级任务书第 4 节与第 4.1 重点新增模块：P001 ~ P018
 *
 * ------------------------------------------------------------------
 * 变更记录（本次修复，详见配套审计报告，未逐条列出的次要项请参考报告自行排期）：
 * [FIX-1] P001：移除伪造的"实测母线电压"默认值 37.8V——原代码 `vbusMeasuredPeak || 37.8`
 *         会把一个编造的数字当成实测值喂给一票否决判据，且 P014 还把它的 evidenceType
 *         硬编码成 'MEASURED'。现在缺少实测值时明确用"理论计算值"顶替，并如实标注
 *         evidenceType/confidence，不再冒充实测。回馈效率 η 的一票否决路径改用保守值
 *         (η=1.0)，典型值(0.75)仅用于展示预期。
 * [FIX-2] P002：反电动势公式原来只乘 √3(相→线)，如果 keVkrpm 是"相电压RMS/krpm、正弦
 *         反电势"的常见约定，还应再乘 √2 才是线电压峰值，否则 BEMF 被低估约41%。现在
 *         通过 keConvention 显式声明约定；同时把最坏工况从"高温磁通衰减"改为同时评估
 *         "低温磁通升高"（永磁体最坏情况通常在低温而非高温）。
 * [FIX-3] P006：原来的 `rthJc + 12.0` 里，12.0℃/W (壳到环境热阻) 是一个没有出处、且
 *         在总热阻里占比最大(约87%)的硬编码常量，结温结论几乎完全由它决定。现在改为
 *         必须传入 rthCaOrJa，未提供时使用同一个默认值但明确标注为假设、下调置信度，
 *         且不允许仅凭这个假设值触发"结温超限"一票否决。同时把单次估算改为不动点迭代
 *         (真正体现"热电正反馈")，并新增体二极管反向恢复损耗与更合理的开关损耗估算。
 * [FIX-4] P004：把 35/20/25ns 与 1.5/1.6/1.4 这几个凭空的"典型值+最坏系数"改为可选
 *         输入，未提供时仍用同一批数字但标注为假设并下调置信度，不再悄悄冒充计算结果。
 * [FIX-5] P008：谐振频率 48.5MHz 与超标幅度 ±dB 原来是与线束长度计算完全脱节的字面量
 *         （改线束长度，这两个数纹丝不动）。现在谐振频率真正由估算电感与寄生电容算出；
 *         超标幅度在没有实测/仿真频谱时不再编数字，明确标注为"需要实测频谱数据"。
 * [FIX-6] P012：自举电容泄放只算了静态漏电流，漏掉了每次开关从自举电容抽走的栅极电荷
 *         这一项——在典型开关频率下，后者往往是主导项。现在两项都算，并显式核对
 *         "刷新窗口"与"自举回路时间常数"是否匹配，避免出现自相矛盾的两个默认值。
 * [FIX-7] P014：evidenceType 原来无条件写死为 'MEASURED'，即使 peakVds 是由假设的
 *         vbusMeasuredPeak 算出来的。现在按实际输入来源如实标注。过冲系数默认值从
 *         偏乐观的 1.05 上调到更贴近实测经验的区间，并支持用 L_loop·di/dt 直接算。
 * ------------------------------------------------------------------
 */

import {
  BldcPatternId,
  PatternOutputItem,
  UnifiedEngineeringModel,
  EvidenceType,
  ConfidenceLevel,
} from '../types';
import { linearInterp } from '../utils/deviceLibrary';

export interface BldcEvaluationInput {
  vbusNominal: number;      // V
  vbusMeasuredPeak?: number;// V
  vdsRating: number;        // V (MOSFET 击穿耐压)
  rpm: number;              // 电机转速
  jInertia: number;         // kg·m²
  cbusUf: number;           // μF
  tAmbientC: number;        // ℃
  currentPeakA: number;     // A
  harnessLengthM: number;   // 米
  deadTimeNs: number;       // ns
  rgOffOhm: number;         // Ω
  cgdPf: number;            // pF
  dvDtVns: number;          // V/ns
  vthMinV: number;          // V
  keVkrpm?: number;         // V/krpm
  rthJc?: number;           // ℃/W (结到壳)
  rdsOnMilliOhm?: number;   // mΩ

  // ---- 以下为本次修复新增的可选输入：用于把此前写死在公式里的经验假设变成
  // 显式、可核实的参数。全部保持可选，未提供时退化为原有默认值行为，但会在
  // calculatedValues 中如实标注"这是假设值"，并在其驱动一票否决时予以抑制。

  // P002
  keConvention?: 'PHASE_RMS_SINUSOIDAL' | 'LINE_PEAK_DIRECT'; // keVkrpm 的约定
  magnetLowTempFluxUpliftPct?: number; // 低温(-40℃)相对25℃的磁通提升 (%)，典型 NdFeB 约 5~10%

  // P003
  cgsPf?: number; // 栅源电容，用于容性分压界

  // P004
  turnOffDelayNs?: number;       // t_d(off) 典型值
  turnOffDelayMaxNs?: number;    // t_d(off) 最坏值(datasheet max)
  fallTimeNs?: number;           // t_f 典型值
  fallTimeMaxNs?: number;        // t_f 最坏值
  driverPropMismatchNs?: number; // 驱动传输延迟失配 典型值
  driverPropMismatchMaxNs?: number; // 驱动传输延迟失配 最坏值(datasheet Propagation Delay Matching)

  // P005
  pwmSwitchingFreqHz?: number;
  diodeForwardVoltageV?: number; // 体二极管正向压降
  modulationIndex?: number;      // 调制比 m，影响死区畸变相对基波电压的占比

  // P006
  rthCaOrJa?: number;      // 壳到环境(或结到环境)热阻 ℃/W —— 取代原来硬编码的 12.0
  switchingTimeNs?: number; // 开关重叠时间
  qrrNc?: number;           // 体二极管反向恢复电荷 nC
  powerFactorCosPhi?: number;

  // P007
  pulseDurationS?: number;
  thermalTauS?: number;    // 壳/散热器侧热时间常数
  deratingBasisC?: number; // 车规降额基准温度 ℃

  // P008
  parasiticCapPf?: number; // 回路寄生电容，用于计算真实谐振频率

  // P011
  uvloTypicalV?: number;
  uvloMinV?: number;

  // P012
  gateChargeQgNc?: number;      // 高边MOSFET总栅电荷
  bootRefreshWindowUs?: number; // 强制刷新窗口
  bootChargeLoopOhm?: number;   // 自举充电回路总电阻(R_boot+R_diode+Rdson_LS)

  // P013
  capInitialTolerancePct?: number;
  capEolDeratingPct?: number;
  capLowTempDeratingPct?: number;

  // P014
  loopInductanceNh?: number;
  diDtANs?: number;

  // P016（低压 MOSFET 通常不给短路耐受时间，此项默认值仅供参考，务必用 SOA 能量法复核）
  senseDelayNsOverride?: number;
  compDelayNsOverride?: number;
  digitalFilterDelayNsOverride?: number;
  driverPropDelayNsOverride?: number;
  gateTurnOffDelayNsOverride?: number;
  currentFallDelayNsOverride?: number;
  soaShortCircuitTimeUsOverride?: number;

  // 器件曲线（可选）：来自器件库，按当前工况插值，替代写死系数。
  rdsOnCurve?: Array<{ x: number; y: number }>;  // x=Tj(℃), y=Rds(on)(mΩ)
  crssCurve?: Array<{ x: number; y: number }>;   // x=Vds(V), y=Crss(pF)
  vthCurve?: Array<{ x: number; y: number }>;    // x=Tj(℃), y=Vth(V)
}

function pushAssumptionNote(
  calculatedValues: Record<string, string | number>,
  log: string[]
): void {
  if (log.length > 0) {
    calculatedValues['⚠ 使用的假设默认值(未提供实测/器件参数，仅供数量级参考，不应单独支撑一票否决)'] = log.join('；');
  }
}

export function evaluateAllBldcPatterns(input: BldcEvaluationInput): PatternOutputItem[] {
  const patterns: PatternOutputItem[] = [];

  // 母线标称电压缺失时的统一兜底：P001/P002/P005/P008/P016 都直接消费 input.vbusNominal，
  // 之前只有部分判据对它做了 NaN 防护，其余的会让 NaN 悄悄在计算链里传播、导致 triggered
  // 条件的比较永远为 false（NaN 参与任何 > < >= 比较都是 false），表现为"引擎识别不出这个
  // case"，但实际上是缺输入却没有任何提示的静默失效。这里统一兜底一次，所有判据共用同一个
  // 假设值，而不是各自独立猜一次。
  const vbusNominalWasAssumed = !Number.isFinite(input.vbusNominal);
  const vbusNominalSafe = Number.isFinite(input.vbusNominal) ? input.vbusNominal : 13.5;

  // ----------------------------------------------------
  // P001: 急停→母线泵升 (Section 4)
  // ----------------------------------------------------
  const p001Assumptions: string[] = [];
  if (vbusNominalWasAssumed) {
    p001Assumptions.push('母线标称电压 vbusNominal 未提供（自由文本里只给出了泵升后的峰值，没有说明泵升前的标称值），假设为 13.5V（典型车规12V系统充电态标称电压）——这是本条判据里置信度最低的一个假设，建议优先补充');
  }
  const omega = (2 * Math.PI * input.rpm) / 60;
  const kineticEnergy = 0.5 * input.jInertia * omega * omega; // J
  const regenEfficiencyTypical = 0.75; // 动能回馈电气转化经验系数（典型值，仅用于展示预期）
  const regenEfficiencyWorstCase = 1.0; // 一票否决判据必须用最坏工况(能量无损耗全部转化)，不能用典型值
  const electricalEnergyTypical = kineticEnergy * regenEfficiencyTypical;
  const electricalEnergyWorstCase = kineticEnergy * regenEfficiencyWorstCase;
  if (!input.cbusUf || input.cbusUf <= 0) p001Assumptions.push('母线电容 cbusUf 未提供，假设 470μF');
  const cFarads = (input.cbusUf && input.cbusUf > 0 ? input.cbusUf : 470) * 1e-6;
  const theoreticalVbusPeakTypical = Math.sqrt(
    Math.pow(vbusNominalSafe, 2) + (2 * electricalEnergyTypical) / cFarads
  );
  const theoreticalVbusPeakWorstCase = Math.sqrt(
    Math.pow(vbusNominalSafe, 2) + (2 * electricalEnergyWorstCase) / cFarads
  );
  // [FIX-1] 不再用编造的 37.8V 冒充"实测值"。有实测就用实测；没有实测就用理论最坏值
  // 顶替，并如实标注这是"未实测、按最坏工况理论计算"，而不是伪装成测量数据。
  const hasMeasuredVbus = input.vbusMeasuredPeak !== undefined && input.vbusMeasuredPeak !== null;
  const measuredVbus = hasMeasuredVbus ? input.vbusMeasuredPeak! : theoreticalVbusPeakWorstCase;
  if (!hasMeasuredVbus) p001Assumptions.push('无台架实测 Vbus 峰值，以下"Vbus_meas"实为理论最坏值代入，并非实测数据');
  const deltaTheoretical = theoreticalVbusPeakTypical - vbusNominalSafe; // 典型工况下理论泵升幅度，供展示
  const diffFromMeasured = hasMeasuredVbus ? Math.abs(theoreticalVbusPeakTypical - measuredVbus) : undefined; // 模型(典型效率)与实测的差值，越大说明η或能量路径假设需要修正
  const p001Veto = hasMeasuredVbus
    ? (theoreticalVbusPeakWorstCase >= input.vdsRating || measuredVbus >= input.vdsRating)
    : theoreticalVbusPeakWorstCase >= input.vdsRating; // 无实测时仅用理论最坏值判断，不重复计入自身

  const p001CalculatedValues: Record<string, string | number> = {
    '转子机械动能 E_mech (J)': Number(kineticEnergy.toFixed(2)),
    '回馈电能量(典型效率0.75) E_elec_typ (J)': Number(electricalEnergyTypical.toFixed(2)),
    '回馈电能量(最坏工况效率1.0，用于一票否决) E_elec_worst (J)': Number(electricalEnergyWorstCase.toFixed(2)),
    '理论泵升峰值(典型效率) Vbus_theo_typ (V)': Number(theoreticalVbusPeakTypical.toFixed(1)),
    '典型效率下相对标称电压的泵升幅度 ΔV (V)': Number(deltaTheoretical.toFixed(1)),
    '理论泵升峰值(最坏工况) Vbus_theo_worst (V)': Number(theoreticalVbusPeakWorstCase.toFixed(1)),
    [hasMeasuredVbus ? '台架实测峰值 Vbus_meas (V)' : '⚠ Vbus_meas：无实测数据，以理论最坏值顶替 (V)']: Number(measuredVbus.toFixed(1)),
    ...(diffFromMeasured !== undefined ? { '模型(典型效率)与实测差值 (V，用于反推真实η)': Number(diffFromMeasured.toFixed(1)) } : {}),
    'MOSFET额定耐压 Vds_rating (V)': input.vdsRating,
    '瞬态裕量(相对最坏工况理论值) Margin (V)': Number((input.vdsRating - theoreticalVbusPeakWorstCase).toFixed(1)),
  };
  pushAssumptionNote(p001CalculatedValues, p001Assumptions);

  patterns.push({
    id: 'P001',
    name: '急停→母线泵升 (DC-Link Overvoltage on E-Stop)',
    triggered: input.rpm >= 1500 && theoreticalVbusPeakTypical > vbusNominalSafe * 1.15,
    corePhysicalChain: '转子动能 E=½Jω² → 回馈制动电流 → DC-Link去耦电容充电 → 母线Vbus抬升 → MOSFET击穿与雪崩应力。注意：本模型未包含前端反向阻断路径判定（若无反灌路径，母线可能被电池钳位而非按此能量平衡自由泵升）与损耗项(ESR/导通/铜耗)，仅给出理论上界',
    calculatedValues: p001CalculatedValues,
    riskLevel: p001Veto ? 'High' : (input.vdsRating - theoreticalVbusPeakWorstCase < 5 ? 'Medium-High' : 'Low'),
    confidence: p001Assumptions.length > 0 ? 'LOW' : (hasMeasuredVbus ? 'HIGH' : 'MEDIUM'),
    evidenceType: hasMeasuredVbus ? 'MEASURED' : 'CALCULATED',
    vetoTriggered: p001Veto,
    vetoReason: p001Veto
      ? `母线瞬态泵升峰值最坏工况估算 (${theoreticalVbusPeakWorstCase.toFixed(1)}V)${hasMeasuredVbus ? `，台架实测 (${measuredVbus.toFixed(1)}V)` : ''} 突破或极度逼近 MOSFET 额定击穿电压 (${input.vdsRating}V)，触碰绝对最大额定值红线，一票否决！`
      : undefined,
    candidateMeasures: [
      '软件制动模式重构：触发急停时切入三相全下桥动态能耗短接制动，动能化为电机定子铜耗',
      '硬件被动吸收：母线侧并联 600W~1500W 车规级双向 TVS 阵列与 RC 吸收网络',
      '电容扩容：将 DC-Link 电解/薄膜电容由 470μF 升级至 1000μF 降低泵升 ΔV',
      '核实前端到电池之间是否存在反向阻断二极管：若无，母线可能被电池钳位在线反电势峰值附近而非自由泵升，需要用 P002 的 BEMF 结果与本模型的能量平衡结果取较小者复核',
    ],
    sideEffects: [
      '下桥三相短接急停会瞬间产生反向冲击力矩，需机械齿轮箱强度校核',
      '定子绕组承受瞬间大电流，需校核电机线包短时温升与退磁风险',
      '大幅增大电解电容体积导致无法放入密封铝壳，且拉长物料打样周期',
    ],
    verificationItems: [
      '电机转速台架在 3800rpm 下触发 Emergency Stop，高压差分探头持续捕获 Vbus 浪涌波形，并对 3 个以上转速点分别测量，用 (V_pk²−V0²)·C/2 对 ½Jω² 作图反推真实 η——斜率>1 说明模型漏了能量源，斜率随转速变化说明模型形式本身需要调整',
      '示波器捕获三相电流及下桥 MOSFET Vds 瞬态过冲峰值与振铃频率',
      '热像仪监测连续 50 次急停工况下电机绕组及功率管结温温升',
    ],
    unknownsToTest: [
      '电机转子实际转动惯量 J 的台架减速法标定值',
      '高压蓄电池或前端稳压源在反向倒灌时的真实吸收特性（含是否存在反向阻断二极管）',
      '示波器高压差分探头的高频带宽限制与地线环耦合失真',
    ],
  });

  // ----------------------------------------------------
  // P002: 高转速→反电动势过压 (Section 4)
  // ----------------------------------------------------
  const p002Assumptions: string[] = [];
  const ke = input.keVkrpm !== undefined ? input.keVkrpm : 4.2; // V/krpm
  const hasProvidedKe = input.keVkrpm !== undefined;
  if (!hasProvidedKe) p002Assumptions.push('电机反电动势常数 Ke 未提供，假设为 4.2V/krpm（建议改用 Ke≈Vbus/n_空载 反推或实测）——这是最基础的电机参数，据此算出的反电动势数值仅供参考，不应单独作为一票否决依据');
  const keConvention = input.keConvention || 'PHASE_RMS_SINUSOIDAL';
  if (input.keConvention === undefined) {
    p002Assumptions.push('未声明 Ke 的约定(相RMS/线峰值)，默认假设为"相电压RMS、正弦反电势"，按此需要 ×√2×√3 才是线电压峰值，请与实测核对');
  }
  // [FIX-2] 若 Ke 是相电压RMS/krpm 且波形为正弦，线电压峰值 = 相RMS × √2(峰值) × √3(线电压)。
  // 原代码只乘了 √3，会把线电压峰值低估约41%。若调用方明确声明 Ke 本身已经是线电压峰值
  // 约定，则不再重复乘系数。
  const bemfMultiplier = keConvention === 'LINE_PEAK_DIRECT' ? 1 : Math.sqrt(2) * Math.sqrt(3);
  const backEmfPeak = (ke * input.rpm) / 1000 * bemfMultiplier;
  // 永磁体最坏情况通常在低温（磁通更高），而非常见直觉认为的高温衰减；两者都展示，
  // 但一票否决判据用低温工况（更保守）。
  const lowTempUpliftPct = input.magnetLowTempFluxUpliftPct !== undefined ? input.magnetLowTempFluxUpliftPct : 7;
  if (input.magnetLowTempFluxUpliftPct === undefined) p002Assumptions.push('低温磁通提升系数未提供，假设 -40℃ 相对 25℃ 提升 7%（NdFeB 典型量级，需实测标定）');
  const backEmfPeakLowTempWorstCase = backEmfPeak * (1 + lowTempUpliftPct / 100);
  if (vbusNominalWasAssumed) p002Assumptions.push('母线标称电压 vbusNominal 未提供，假设为 13.5V，本判据的电压裕量/riskLevel 判断据此计算，仅供参考');
  const voltageMargin = vbusNominalSafe - backEmfPeak;
  const p002Triggered = input.rpm >= 3000;
  const p002VetoBase = backEmfPeakLowTempWorstCase > input.vdsRating * 0.95;
  // 跟 P006 对 rthCaOrJa 的处理保持一致：Ke 是驱动这条判据的最基础参数，
  // 它本身是假设值时，不允许单独把结论升级成"一票否决"，只做风险提示。
  const p002Veto = hasProvidedKe ? p002VetoBase : false;

  const p002CalculatedValues: Record<string, string | number> = {
    '电机反电动势常数 Ke (V/krpm)': ke,
    'Ke 约定': keConvention === 'LINE_PEAK_DIRECT' ? '已声明为线电压峰值/krpm，直接使用' : '假设为相电压RMS/krpm、正弦波形，按 ×√2×√3 折算线电压峰值',
    '常温线反电动势峰值 BEMF_pk_25C (V)': Number(backEmfPeak.toFixed(1)),
    '低温最坏工况线反电动势峰值 BEMF_pk_lowT (V，用于一票否决)': Number(backEmfPeakLowTempWorstCase.toFixed(1)),
    '标称母线电压 Vbus_nom (V)': vbusNominalSafe,
    '弱磁调制前电压裕量(常温) Margin (V)': Number(voltageMargin.toFixed(1)),
  };
  pushAssumptionNote(p002CalculatedValues, p002Assumptions);

  patterns.push({
    id: 'P002',
    name: '高转速→反电动势过压与失控回馈风险 (Back-EMF Overvoltage)',
    triggered: p002Triggered,
    corePhysicalChain: '高转速RPM → 线圈反电动势Back-EMF超过母线电压 → PWM失控全开三相桥失步整流 → 母线失控反向泵升。永磁体退磁温度系数为负，最坏反电势工况通常出现在低温而非高温',
    calculatedValues: p002CalculatedValues,
    riskLevel: backEmfPeakLowTempWorstCase >= vbusNominalSafe ? 'Medium-High' : 'Low',
    confidence: p002Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p002Veto,
    vetoReason: p002Veto
      ? '电机低温最坏工况反电动势超出功率器件安全裕量，一旦驱动故障全关将导致三相反并联二极管续流击穿！'
      : (p002VetoBase ? 'Ke 为假设值，按当前假设已逼近一票否决红线——这不是可以忽略的风险提示，强烈建议尽快提供实测 Ke 以确认结论' : undefined),
    candidateMeasures: [
      '在 MCU FOC 算法中配置超前角与 Id<0 负向弱磁控制策略，抵消直轴磁通',
      '硬件设置超速硬切断安全窗口，软件底层实施最高机械转速硬件转速钳位',
    ],
    sideEffects: ['弱磁控制会增加电机无功电流 Id，导致定子铜损耗与发热增加 15%~25%'],
    verificationItems: [
      '拖动台架以 1.2 倍最高转速反拖电机，高压示波器开路测量三相端线反电势波形，同时确认波形是正弦还是梯形、Ke 到底是按相RMS/线峰值哪种约定标定的',
      '在 -40℃/25℃/125℃ 各测一次反电势，直接标定真实的磁通温度系数与最坏工况所在的温度点',
    ],
    unknownsToTest: ['永磁体低温 (-40℃) 磁通提升与高温 (125℃) 磁通衰减的真实系数，及各自对应的反电势修正'],
  });

  // ----------------------------------------------------
  // P003: 高dv/dt→米勒误导通 (Section 4)
  // ----------------------------------------------------
  // 若器件库提供了 Crss@Vds / Vth@Tj 曲线，按当前工况插值替代写死标量
  const cgdPfEff = input.crssCurve && input.crssCurve.length >= 2
    ? linearInterp(input.crssCurve, vbusNominalSafe).value
    : input.cgdPf;
  const vthMinVEff = input.vthCurve && input.vthCurve.length >= 2
    ? linearInterp(input.vthCurve, 25).value
    : input.vthMinV;

  const imiller = (cgdPfEff * 1e-12) * (input.dvDtVns * 1e9); // A
  const vgateInducedResistiveBound = imiller * input.rgOffOhm; // V，阻性上界
  let vgateInducedCapacitiveBound: number | undefined;
  if (input.cgsPf !== undefined && input.cgsPf > 0) {
    vgateInducedCapacitiveBound = (cgdPfEff / (cgdPfEff + input.cgsPf)) * vbusNominalSafe;
  }
  // [FIX] 真实感应电压是两个界的较小值：开关沿很短时容性分压界更紧，阻性上界会显著高估。
  const vgateInduced = vgateInducedCapacitiveBound !== undefined
    ? Math.min(vgateInducedResistiveBound, vgateInducedCapacitiveBound)
    : vgateInducedResistiveBound;
  const millerMargin = vthMinVEff - vgateInduced;
  const p003ShootThroughRisk = vgateInduced >= vthMinVEff;

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
  p003CalculatedValues['门极安全裕量 Margin (V)'] = Number(millerMargin.toFixed(2));

  patterns.push({
    id: 'P003',
    name: '高dv/dt→门极米勒效应误导通 (Miller Effect Induced False Turn-On)',
    triggered: input.dvDtVns >= 4.0 || input.rgOffOhm >= 3.0,
    corePhysicalChain: '开关管对管开通 → 桥臂中点高dv/dt → 经Cgd耦合米勒位移电流 → 流经关断电阻Rg_off → 门极抬升Vgs > Vth → 同桥臂瞬态直通炸机。真实感应电压是阻性界与容性分压界中的较小值，仅算阻性界会在开关沿较短时高估',
    calculatedValues: p003CalculatedValues,
    riskLevel: p003ShootThroughRisk ? 'High' : (millerMargin < 0.5 ? 'Medium-High' : 'Low'),
    confidence: vgateInducedCapacitiveBound !== undefined ? 'HIGH' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p003ShootThroughRisk,
    vetoReason: p003ShootThroughRisk
      ? `高dv/dt感应门极抬升电压 (${vgateInduced.toFixed(2)}V) 已超出MOSFET阈值下限 (${input.vthMinV}V)，同桥臂直通 (Shoot-Through) 致命风险触发一票否决！`
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
  });

  // ----------------------------------------------------
  // P004: 死区过短→直通 (Section 4)
  // ----------------------------------------------------
  const p004Assumptions: string[] = [];
  const need = (v: number | undefined, fb: number, label: string): number => {
    if (v === undefined) { p004Assumptions.push(label); return fb; }
    return v;
  };
  const turnOffDelayTyp = need(input.turnOffDelayNs, 35, 't_d(off)典型值未提供，假设35ns');
  const turnOffDelayMax = need(input.turnOffDelayMaxNs, turnOffDelayTyp * 1.5, 't_d(off)最坏值未提供，假设为典型值×1.5');
  const fallTimeTyp = need(input.fallTimeNs, 20, 't_f典型值未提供，假设20ns');
  const fallTimeMax = need(input.fallTimeMaxNs, fallTimeTyp * 1.6, 't_f最坏值未提供，假设为典型值×1.6');
  const driverPropMismatchTyp = need(input.driverPropMismatchNs, 25, '驱动传输延迟失配典型值未提供，假设25ns');
  const driverPropMismatchMax = need(input.driverPropMismatchMaxNs, driverPropMismatchTyp * 1.4, '驱动传输延迟失配最坏值未提供，假设为典型值×1.4');
  // [FIX] 对管在自己的 t_d(on) 结束前不会导通，严格判据应减去 t_d(on)；此处无该输入时不做减项，
  // 结果因此偏保守（比真实需求略高），已在说明中注明方向。
  const deadTimeRequiredTyp = turnOffDelayTyp + fallTimeTyp + driverPropMismatchTyp;
  const deadTimeRequiredWorst = turnOffDelayMax + fallTimeMax + driverPropMismatchMax;
  const deadTimeMarginTyp = input.deadTimeNs - deadTimeRequiredTyp;
  const deadTimeMarginWorst = input.deadTimeNs - deadTimeRequiredWorst;
  const p004Veto = deadTimeMarginWorst < 0;

  const p004CalculatedValues: Record<string, string | number> = {
    '当前设定死区时间 DeadTime (ns)': input.deadTimeNs,
    '典型所需最小死区 (典型值) (ns)': Number(deadTimeRequiredTyp.toFixed(0)),
    '最坏工况死区需求 (Worst-Case，未扣除t_d(on)，结果偏保守) (ns)': Number(deadTimeRequiredWorst.toFixed(0)),
    '典型死区裕量 Typical Margin (ns)': Number(deadTimeMarginTyp.toFixed(0)),
    '最坏工况死区裕量 Worst-Case Margin (ns)': Number(deadTimeMarginWorst.toFixed(0)),
  };
  pushAssumptionNote(p004CalculatedValues, p004Assumptions);

  patterns.push({
    id: 'P004',
    name: '死区过短→桥臂瞬态直通风险 (Dead-Time Too Short: Shoot-Through)',
    triggered: input.deadTimeNs <= 200,
    corePhysicalChain: '死区设置过小 → 上下管关断延迟未完全结束即开启对管 → 半桥瞬态直通 → 脉冲短路电流击穿MOSFET',
    calculatedValues: p004CalculatedValues,
    riskLevel: p004Veto ? 'High' : (deadTimeMarginWorst < 40 ? 'Medium-High' : 'Low'),
    confidence: p004Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p004Veto && p004Assumptions.length === 0,
    vetoReason: p004Veto
      ? (p004Assumptions.length === 0
        ? `在高温 125℃ 及驱动传输延迟容差下，最坏死区需求 (${deadTimeRequiredWorst.toFixed(0)}ns) 已超过当前设定 (${input.deadTimeNs}ns)，存在硬直通炸机风险！`
        : `基于假设参数估算的最坏死区需求 (${deadTimeRequiredWorst.toFixed(0)}ns) 已超过当前设定 (${input.deadTimeNs}ns)，但关键时序参数为假设值而非实测/datasheet，暂不作为一票否决，请先补齐实测数据复核`)
      : undefined,
    candidateMeasures: [
      '在 MCU PWM 寄存器中将互补通道死区时间由 100ns 增大至 250ns~350ns',
      '优化门极驱动器开通/关断独立通道，减小功率管关断延迟',
      '实测 t_d(off)/t_f/驱动传输延迟失配在 -40~125℃ 全温区的真实值，替换本模型的假设参数',
    ],
    sideEffects: ['死区过大会引起低转速与过零点相电流畸变、转矩脉动增大及五次/七次谐波，参见P005'],
    verificationItems: ['示波器通道 1/2 分别接入上管与下管 Vgs 驱动信号，光隔离差分捕获死区过渡波形，在 -40/25/125℃ 各测一组，直接标定六个时序参数'],
    unknownsToTest: ['驱动芯片高低温全温区传播延迟匹配性 (Propagation Delay Mismatch Spec)'],
  });

  // ----------------------------------------------------
  // P005: 死区过长→换相畸变 (Section 4)
  // ----------------------------------------------------
  const p005Assumptions: string[] = [];
  const pwmFreqHz = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  if (input.pwmSwitchingFreqHz === undefined) p005Assumptions.push('PWM开关频率未提供，假设20kHz');
  const diodeVf = input.diodeForwardVoltageV !== undefined ? input.diodeForwardVoltageV : 1.0;
  if (input.diodeForwardVoltageV === undefined) p005Assumptions.push('体二极管压降未提供，假设1.0V');
  const modulationIndex = input.modulationIndex !== undefined ? input.modulationIndex : 1.0;
  if (input.modulationIndex === undefined) p005Assumptions.push('调制比m未提供，假设m=1.0（低速工况m更小，本估算在低速下会低估相对畸变占比）');
  const pwmPeriodNs = (1 / pwmFreqHz) * 1e9;
  const deadTimeRatio = (input.deadTimeNs / pwmPeriodNs) * 100;
  const p005Triggered = input.deadTimeNs >= 600 || deadTimeRatio >= 1.2;
  // [FIX] 用体二极管压降的加性项替代原来"1.2×比例×Vbus"这个说不出依据的乘性系数；
  // 并按调制比折算相对基波电压的占比（m越小，同样的ΔV占比越大，低速工况更严重）。
  const deadTimeVoltageErrorV = (input.deadTimeNs / pwmPeriodNs) * diodeVf;
  const fundamentalVoltageV = vbusNominalSafe * modulationIndex;
  const deadTimeErrorRelativePct = fundamentalVoltageV > 0 ? (deadTimeVoltageErrorV / fundamentalVoltageV) * 100 : 0;

  const p005CalculatedValues: Record<string, string | number> = {
    '死区占PWM周期比例 (%)': Number(deadTimeRatio.toFixed(2)),
    '死区引起的基波电压误差(加性项) ΔV (V)': Number(deadTimeVoltageErrorV.toFixed(3)),
    '当前调制比下的基波电压 (V)': Number(fundamentalVoltageV.toFixed(1)),
    'ΔV 相对基波电压占比 (%，低速/低调制比时该值会显著增大)': Number(deadTimeErrorRelativePct.toFixed(2)),
  };
  pushAssumptionNote(p005CalculatedValues, p005Assumptions);

  patterns.push({
    id: 'P005',
    name: '死区过长→低转速相电流与换相畸变 (Excessive Dead-Time Commutation Distortion)',
    triggered: p005Triggered,
    corePhysicalChain: '死区时间过大 → 寄生体二极管导通时间过长 → 输出相电压非线性压降误差 → 相对基波电压(随调制比/转速下降而减小)的占比在低速时被放大 → 低速过零畸变、转矩脉动与效率降低',
    calculatedValues: p005CalculatedValues,
    riskLevel: p005Triggered || deadTimeErrorRelativePct > 5 ? 'Medium' : 'Low',
    confidence: p005Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '实施死区非线性补偿算法 (Dead-time Compensation)，基于电流极性实时微调 PWM 占空比',
      '在兼顾直通安全的前提下将死区压缩至满足P004最坏工况裕量的最小值',
    ],
    sideEffects: ['补偿算法需要极高精度的相电流过零点极性检测，轻载时易发生噪声扰动误判'],
    verificationItems: ['电流钳捕获低转速(低调制比)稳态运行时的相电流正弦度 THD 与转矩纹波传感器波形，与本模型按不同调制比的估算值对比'],
    unknownsToTest: ['电机本体齿槽转矩与死区畸变转矩脉动的相位叠加效应'],
  });

  // ----------------------------------------------------
  // P006: 大电流→MOSFET过热与热电正反馈 (Section 4)
  // ----------------------------------------------------
  const p006Assumptions: string[] = [];
  const rdsOn25 = input.rdsOnMilliOhm !== undefined ? input.rdsOnMilliOhm : 3.5;
  if (input.rdsOnMilliOhm === undefined) p006Assumptions.push('Rds(on)@25℃未提供，假设3.5mΩ');
  const iPeak = input.currentPeakA !== undefined ? input.currentPeakA : 25;
  if (input.currentPeakA === undefined) p006Assumptions.push('相电流峰值未提供，假设25A');
  const rthJc = input.rthJc !== undefined ? input.rthJc : 1.8;
  if (input.rthJc === undefined) p006Assumptions.push('Rth(结-壳)未提供，假设1.8℃/W(按封装类型典型值)');
  // [FIX-3] 原来的 "+12.0" 是没有出处、且在总热阻中占比最大(约87%)的硬编码常量。
  // 现在要求显式传入 rthCaOrJa；未提供时仍用12.0兜底但明确标注为假设，且不允许
  // 仅凭这个假设值触发"结温超限"一票否决。
  const hasRthCa = input.rthCaOrJa !== undefined;
  if (!hasRthCa) p006Assumptions.push('壳到环境(或结到环境)热阻 rthCaOrJa 未提供，假设12.0℃/W——这是整条热阻链里占比最大的一项，强烈建议实测(温箱多功率点测壳温反推)');
  const rthCaOrJa = hasRthCa ? input.rthCaOrJa! : 12.0;
  const modIdx = input.modulationIndex !== undefined ? input.modulationIndex : 0.9;
  const pf = input.powerFactorCosPhi !== undefined ? input.powerFactorCosPhi : 0.9;
  const swFreq = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  const swTimeNs = input.switchingTimeNs !== undefined ? input.switchingTimeNs : 55;
  if (input.switchingTimeNs === undefined) p006Assumptions.push('开关重叠时间未提供，假设55ns');

  // 单管RMS电流：用三相逆变器闭式解（而非把相电流RMS直接当单管RMS，后者会高估）
  const iDeviceRms = iPeak * Math.sqrt(Math.max(0, 1 / 8 + (modIdx * pf) / (3 * Math.PI)));
  // 温度归一化 Rds(on)：迭代过程中按当前 Tj 估算而非固定按125℃
  function rdsOnAtTemp(tjC: number): number {
    // 若器件库提供了 Rds(on)@Tj 曲线，按当前结温插值；否则用写死的归一化近似（仅缺曲线时用）
    if (input.rdsOnCurve && input.rdsOnCurve.length >= 2) {
      return linearInterp(input.rdsOnCurve, tjC).value;
    }
    const normAt125 = 1.65;
    const normAt150 = 1.85;
    if (tjC <= 25) return rdsOn25;
    if (tjC <= 125) return rdsOn25 * (1 + (normAt125 - 1) * ((tjC - 25) / (125 - 25)));
    return rdsOn25 * (normAt125 + (normAt150 - normAt125) * ((tjC - 125) / (150 - 125)));
  }
  const avgCurrentForSwitching = (2 / Math.PI) * iPeak; // 正弦电流一周期内的平均值，而非直接用峰值
  const qrrLossW = input.qrrNc !== undefined ? 0.5 * input.qrrNc * 1e-9 * vbusNominalSafe * swFreq : 0;
  if (input.qrrNc === undefined) p006Assumptions.push('体二极管反向恢复电荷Qrr未提供，本次估算未计入Qrr损耗，实际损耗可能更高');

  // [FIX-3] 不动点迭代：Tj 反过来影响 Rds(on)，Rds(on) 影响损耗，损耗又影响 Tj——
  // 这才是"热电正反馈"应有的结构，原代码单次估算无法检出热失控(不收敛)这一现象。
  let tjIter = input.tAmbientC + 40; // 迭代初值
  let pCondFinal = 0;
  let pSwFinal = 0;
  let converged = false;
  for (let i = 0; i < 15; i++) {
    const rdsHot = rdsOnAtTemp(tjIter);
    pCondFinal = Math.pow(iDeviceRms, 2) * (rdsHot * 1e-3);
    pSwFinal = 0.5 * vbusNominalSafe * avgCurrentForSwitching * (swTimeNs * 1e-9) * swFreq + qrrLossW;
    const pTotalIter = pCondFinal + pSwFinal;
    const tjNext = input.tAmbientC + pTotalIter * (rthJc + rthCaOrJa);
    if (Math.abs(tjNext - tjIter) < 0.05) { tjIter = tjNext; converged = true; break; }
    tjIter = tjNext;
    if (tjIter > 400) break; // 明显发散，视为热失控
  }
  const tjEstimated = tjIter;
  const pTotal = pCondFinal + pSwFinal;
  const p006ThermalRunaway = Number.isFinite(tjEstimated) && (!converged || tjEstimated > 400);
  const p006Overheat = tjEstimated >= 140;
  const p006CriticalAssumption = !hasRthCa; // rthCaOrJa 是否为假设值，决定能否触发一票否决

  const p006CalculatedValues: Record<string, string | number> = {
    '单管等效RMS电流 I_device_rms (A，按三相逆变器闭式解，非直接用相电流RMS)': Number(iDeviceRms.toFixed(2)),
    '25℃基准 Rds(on) (mΩ)': rdsOn25,
    '迭代收敛结温下的 Rds(on) (mΩ)': Number(rdsOnAtTemp(tjEstimated).toFixed(2)),
    '单管导通损耗 P_cond (W)': Number(pCondFinal.toFixed(2)),
    '单管开关损耗(含Qrr) P_sw (W)': Number(pSwFinal.toFixed(2)),
    '单管总耗散功率 P_total (W)': Number(pTotal.toFixed(2)),
    'Rth(结-壳) (℃/W)': rthJc,
    'Rth(壳-环境) (℃/W)': rthCaOrJa,
    [p006ThermalRunaway ? '⚠ 结温迭代不收敛(热电正反馈失控)' : '迭代收敛结温 Tj (℃)']: p006ThermalRunaway ? '是——按当前假设参数，损耗-温度正反馈不收敛，属于热失控特征' : Number(tjEstimated.toFixed(1)),
    '车规芯片结温上限 Tj_max (℃)': 150,
  };
  pushAssumptionNote(p006CalculatedValues, p006Assumptions);

  patterns.push({
    id: 'P006',
    name: '大电流→MOSFET热电正反馈与结温过热 (MOSFET Thermal Runaway & Self-Heating)',
    triggered: tjEstimated >= 115 || p006ThermalRunaway,
    corePhysicalChain: '连续堵转或重载大电流 → 导通损耗增加 → 结温Tj上升 → 硅材料载流子迁移率下降使Rds(on)正温度系数增大 → 损耗进一步恶化。本模型用不动点迭代表达这一正反馈，不收敛即判定为热失控特征，而非只算一次就下结论',
    calculatedValues: p006CalculatedValues,
    riskLevel: p006ThermalRunaway ? 'High' : (p006Overheat ? 'High' : (tjEstimated >= 125 ? 'Medium-High' : 'Low')),
    confidence: p006Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    // [FIX-3] rthCaOrJa 是假设值时，不允许仅凭它把风险判成"确认超限"的一票否决，
    // 只在真正收敛异常(数值发散)或已提供实测热阻却仍超限时才触发。
    vetoTriggered: p006ThermalRunaway || (tjEstimated >= 150 && !p006CriticalAssumption),
    vetoReason: p006ThermalRunaway
      ? '按当前(部分为假设)参数迭代计算，损耗-结温正反馈不收敛，具备热失控特征，在补齐实测热阻/电流数据前不得判定为安全！'
      : (tjEstimated >= 150 && !p006CriticalAssumption
        ? '功率管理论最高结温突破绝对额定 150℃，存在硅结构永久热电击穿风险！'
        : undefined),
    candidateMeasures: [
      '将铝基板或 PCB 铜箔厚度由 1oz 提升至 2oz，并在漏极覆铜区布置 4x6 阵列散热过孔',
      '选用更低内阻车规 MOS (如 1.8mΩ PDFN56 封装) 或双管并联分流',
      '底层加入 NTC 结温观测器，超过 115℃ 自动线性限制最大相电流输出',
      '温箱实测2~3个功率点下的壳温，反推真实 Rth(壳-环境)，替换本模型的假设值——这是当前结论里不确定性最大的一项',
    ],
    sideEffects: ['增加铜厚与低内阻器件使 BOM 成本单板上升 $0.45~$0.80'],
    verificationItems: ['热电偶埋入功率管壳底，在 85℃ 环温箱中跑满载堵转 30 分钟记录真实温升曲线，并按 Rth_ca=(T_case-T_amb)/P_total 反推真实热阻'],
    unknownsToTest: ['铝外壳导热硅胶垫在长期振动与冷热冲击后的厚度压缩与热阻退化率', '器件间热耦合(6管共板互相加热)对单管独立热阻假设的偏离程度'],
  });

  // ----------------------------------------------------
  // P007: 高温→热失控风险 (Section 4)
  // ----------------------------------------------------
  const p007Assumptions: string[] = [];
  const deratingBasisC = input.deratingBasisC !== undefined ? input.deratingBasisC : 125;
  if (input.deratingBasisC === undefined) p007Assumptions.push('车规降额基准温度未提供，假设125℃');
  const steadyMargin = 150 - tjEstimated;
  let transientMargin: number;
  let transientMarginNote: string;
  if (input.pulseDurationS !== undefined && input.thermalTauS !== undefined && input.thermalTauS > 0) {
    // 用一阶热阻抗近似瞬态温升，而非固定减去15℃
    const deltaTjPulse = pTotal * rthCaOrJa * (1 - Math.exp(-input.pulseDurationS / input.thermalTauS));
    transientMargin = steadyMargin - deltaTjPulse;
    transientMarginNote = `按 ΔTj=P·Rth·(1-e^(-t/τ)) 估算，t=${input.pulseDurationS}s, τ=${input.thermalTauS}s`;
  } else {
    transientMargin = steadyMargin - 15.0;
    transientMarginNote = '未提供脉冲时长与热时间常数，沿用固定假设：瞬态温升较稳态多15℃(仅供参考)';
    p007Assumptions.push('脉冲时长/热时间常数未提供，瞬态裕量按固定假设(稳态-15℃)估算');
  }
  const deratingMargin = deratingBasisC - tjEstimated;

  const p007CalculatedValues: Record<string, string | number> = {
    '稳态结温裕量 Steady Margin (℃)': Number(steadyMargin.toFixed(1)),
    '瞬态脉冲结温裕量 Transient Margin (℃)': Number(transientMargin.toFixed(1)),
    '瞬态裕量估算方法': transientMarginNote,
    [`车规降额裕量 (基准${deratingBasisC}℃) Derating Margin (℃)`]: Number(deratingMargin.toFixed(1)),
  };
  if (input.thermalTauS !== undefined) {
    p007CalculatedValues['热阻热容热时间常数 Tau (s，壳/散热器侧，非结到壳)'] = input.thermalTauS;
  } else {
    p007CalculatedValues['⚠ 数据缺口'] = '未提供真实热时间常数，无法准确估算瞬态温升，Zth(t)曲线建议从datasheet获取';
  }
  pushAssumptionNote(p007CalculatedValues, p007Assumptions);

  patterns.push({
    id: 'P007',
    name: '高温→多工况热安全综合裕量 (Multi-Domain Thermal Safety Margins)',
    triggered: Number.isFinite(tjEstimated) && tjEstimated >= 90,
    corePhysicalChain: '不能仅判断 Tj < TjMax 绝对值，必须综合评估稳态、脉冲瞬态、SOA与车规长期降额裕量',
    calculatedValues: p007CalculatedValues,
    riskLevel: deratingMargin < 0 ? 'Medium-High' : 'Low',
    confidence: p007Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: ['建立热降额保护表，严格执行未超绝对最大额定值不等于安全的车规理念', '实测 Zth(t) 瞬态热阻曲线替代固定假设的瞬态温升系数'],
    sideEffects: ['过早降额会影响极端高温下整车动力输出性能与用户体验'],
    verificationItems: ['热冲击试验箱 (-40℃ ~ 125℃) 1000 循环热应力疲劳测试', '瞬态热阻抗测试：施加已知功率阶跃，记录壳温响应曲线拟合真实 τ'],
    unknownsToTest: ['焊点空洞率对瞬态热阻 Rth(t) 的非均匀发热热点放大效应'],
  });

  // ----------------------------------------------------
  // P008: 长线束→EMI/振铃 (Section 4)
  // ----------------------------------------------------
  const p008Assumptions: string[] = [];
  const harnessLength = input.harnessLengthM !== undefined && input.harnessLengthM > 0 ? input.harnessLengthM : 1.8;
  if (input.harnessLengthM === undefined || input.harnessLengthM <= 0) p008Assumptions.push('线束长度未提供，假设1.8m');
  const harnessInductanceUh = harnessLength * 1.2; // 1.2uH/m，回路几何假设，需结合去回线间距核实
  const p008Triggered = harnessLength >= 1.2;
  // [FIX-5] 谐振频率原来是与线束长度完全脱节的字面量(48.5MHz)。现在真正由估算电感
  // 与寄生电容算出：f = 1/(2π√(L·C))。寄生电容未知时给出典型量级假设并标注。
  const parasiticCapPf = input.parasiticCapPf !== undefined ? input.parasiticCapPf : 100;
  if (input.parasiticCapPf === undefined) p008Assumptions.push('回路寄生电容未提供，假设100pF(典型量级，实际取决于开关节点铜箔面积与布局)');
  const fRingHz = (1 / (2 * Math.PI * Math.sqrt(harnessInductanceUh * 1e-6 * parasiticCapPf * 1e-12)));
  const fRingMHz = fRingHz / 1e6;

  const p008CalculatedValues: Record<string, string | number> = {
    '线束总长度 (m)': harnessLength,
    '推算线束寄生电感 L_harness (μH，假设1.2μH/m回路几何)': Number(harnessInductanceUh.toFixed(2)),
    '回路寄生电容估算 (pF)': parasiticCapPf,
    '高频谐振频率估计 f_ring (MHz，由 L/C 计算得出，非固定值)': Number(fRingMHz.toFixed(1)),
    '48MHz频段传导骚扰超标幅度': '⚠ 需要实测/仿真频谱数据才能给出裕量，不提供编造的dB数字',
  };
  pushAssumptionNote(p008CalculatedValues, p008Assumptions);

  patterns.push({
    id: 'P008',
    name: '长线束→EMI高频谐振与辐射超标 (Harness Parasitic Inductance & Common-Mode EMI)',
    triggered: p008Triggered,
    corePhysicalChain: 'EMC Root Cause Tree: Source(开关节点高频dv/dt谐波) → Coupling(线束寄生电感L与对地杂散电容C) → Path(长供电线束成为发射天线) → Victim(车载FM/DAB天线CISPR 25 Class 5超标)',
    calculatedValues: p008CalculatedValues,
    riskLevel: p008Triggered ? 'Medium-High' : 'Low',
    confidence: p008Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '在电源线束根部卡装高性能纳米晶/镍锌共模磁环 (抑制 30MHz~100MHz 频段)',
      '功率开关节点并联 RC Snubber 抑制估算谐振频率附近的高频振铃，参数按 C_snub≈(3~5)×Coss、R=√(L_loop/C_snub) 计算而非直接套用固定值',
      '开启 MCU PWM 扩频调制 (Spread Spectrum Clock Generation, SSCG ±2.5%)',
    ],
    sideEffects: ['磁环增加结构装配工时与物料成本；RC Snubber 增加单相约 0.25W 静态吸收损耗'],
    verificationItems: [
      '近场探头+频谱仪先做预扫描，实测真实振铃频率，与本模型估算值核对，校正线束电感假设(1.2μH/m)与寄生电容假设(100pF)',
      '标准电波暗室中按 CISPR 25 Class 5 规范测试 150kHz~108MHz 人工电源网络传导发射，取得真实超标裕量后再评估对策',
    ],
    unknownsToTest: ['实车车身接地钣金与控制器金属外壳之间的搭铁接触阻抗 (< 5mΩ)', '开关节点实际铜箔面积对回路寄生电容的真实贡献'],
  });

  // ----------------------------------------------------
  // P009: 霍尔故障 (Section 4)
  // ----------------------------------------------------
  patterns.push({
    id: 'P009',
    name: '霍尔传感器故障与容错退避 (Hall Sensor Hardware Failure & Degradation)',
    triggered: true,
    corePhysicalChain: '霍尔线缆断线/虚焊/短路/强磁干扰 → 产生非法编码 (000/111) 或状态跳变卡死 → MCU换相失步 → 电机失步停转、强烈抖动或反转风险 → 触发整车功能降级',
    calculatedValues: {
      '支持诊断的物理失效模式': '开路 / 高钳位 / 低钳位 / 卡死 / 非法状态 / 高频抖动噪声',
      '失效检测响应时间 (ms)': '< 2.5 ms (1个PWM控制周期内锁定)',
      '整车危害等级': 'ASIL B (防失控飞车与意外反转)',
    },
    riskLevel: 'Medium-High',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: [
      '双霍尔容错估计算法 (2-Hall Fault Tolerant Logic)：单霍尔损坏时利用剩余两相推算换相角',
      '无位置传感器反电动势重构 (Sensorless BEMF Observer)：转速高于 600rpm 时无缝切换无感模式',
    ],
    sideEffects: ['双霍尔降级运行时转矩脉动增加 15%，低速平顺性受轻微影响'],
    verificationItems: ['故障注入仪在电机满载运转中人为切断 H1 信号线，验证系统是否平滑切入降级保护'],
    unknownsToTest: ['零速重载启动工况下无感反电动势无法建立时的开环强拖可靠性'],
  });

  // ----------------------------------------------------
  // P010: 电流采样故障 (Section 4)
  // ----------------------------------------------------
  patterns.push({
    id: 'P010',
    name: '电流采样硬件故障双重致命性 (Current Sensing Dual Failure: Control & Protection)',
    triggered: true,
    corePhysicalChain: '分流电阻虚焊/运放供电跌落/偏置漂移/ADC饱和 → 同时引发两大致命后果：① 闭环 FOC 电流环发散产生失控过流；② 硬件过流保护判据失效无法关断，造成灾难性炸机',
    calculatedValues: {
      '失效影响': '控制失效 + 保护失效 双重并发',
      '检测机制': '运放虚地偏置电压自检 (Vref/2) + 零电流采样窗口校准',
      '容错等级': '双通道交叉校验 (Dual Channel ADC Redundancy)',
    },
    riskLevel: 'High',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: [
      '在每次上电自检 (POST) 中检查运放静止偏置电压是否在 1.65V ± 50mV 窗口内',
      '增加独立的纯硬件过流比较器 (Hardware Comparator)，不依赖 MCU 软件与 ADC 转换',
    ],
    sideEffects: ['上电增加 15ms 自检时间；增加一颗双路高速比较器芯片增加 BOM 成本 $0.18'],
    verificationItems: ['在采样电阻输入端注入模拟偏置漂移信号，验证 MCU 诊断报文与故障切断响应'],
    unknownsToTest: ['采样电阻低温 -40℃ 与高温 125℃ 下的 TCR 温漂曲线 (典型 ±50ppm/℃)'],
  });

  // ----------------------------------------------------
  // P011: 驱动UVLO (Section 4)
  // ----------------------------------------------------
  const p011Assumptions: string[] = [];
  const uvloTyp = input.uvloTypicalV !== undefined ? input.uvloTypicalV : 8.2;
  const uvloMin = input.uvloMinV !== undefined ? input.uvloMinV : 7.8;
  if (input.uvloTypicalV === undefined || input.uvloMinV === undefined) {
    p011Assumptions.push('UVLO门限未指定具体驱动芯片型号，假设典型8.2V/最小7.8V，请替换为实际选型器件的datasheet值');
  }
  const p011CalculatedValues: Record<string, string | number> = {
    '驱动芯片 UVLO 门限 (V)': `${uvloTyp}V (典型值) / ${uvloMin}V (最小值)`,
    '全关断响应延迟 (ns)': '< 150 ns',
    '独立保护能力': '硬件独立硬关断，无需 MCU 软件干预',
  };
  pushAssumptionNote(p011CalculatedValues, p011Assumptions);

  patterns.push({
    id: 'P011',
    name: '栅极驱动芯片欠压锁定 (Gate Driver Under-Voltage Lock-Out, UVLO)',
    triggered: true,
    corePhysicalChain: `驱动供电 Vcc 异常跌落至 ${uvloMin}V 以下 → 门极驱动输出电压不足 → MOSFET 进入高阻放大区而非饱和导通 → 导通压降 Vds 激增 → 芯片数毫秒内热击穿`,
    calculatedValues: p011CalculatedValues,
    riskLevel: 'Medium',
    confidence: p011Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: p011Assumptions.length > 0 ? 'CALCULATED' : 'DATASHEET',
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
  });

  // ----------------------------------------------------
  // P012: 自举电压不足 (Section 4)
  // ----------------------------------------------------
  const p012Assumptions: string[] = [];
  const cBootNf = 220;
  const iLeakUa = 85;
  const qgNc = input.gateChargeQgNc !== undefined ? input.gateChargeQgNc : 30;
  if (input.gateChargeQgNc === undefined) p012Assumptions.push('高边MOSFET栅电荷Qg未提供，假设30nC');
  const swFreqForBoot = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  // [FIX-6] 原来只算了静态漏电流 I_leak，漏掉了每次开关从自举电容抽走的栅极电荷这一项：
  // 在开关频率下, I_eq_switching = Qg × f_sw，典型参数下这一项比静态漏电流大一个数量级，
  // 是被低估的主导项。
  const iSwitchingEquivalentUa = qgNc * 1e-9 * swFreqForBoot * 1e6; // 转换为 μA
  const iTotalUa = iLeakUa + iSwitchingEquivalentUa;
  const maxOnTimeMs = (cBootNf * 1e-9 * 1.6) / (iTotalUa * 1e-6) * 1000;

  const bootChargeLoopOhm = input.bootChargeLoopOhm;
  const refreshWindowUs = input.bootRefreshWindowUs !== undefined ? input.bootRefreshWindowUs : 1.5;
  let refreshFractionChargedPct: number | undefined;
  if (bootChargeLoopOhm !== undefined && bootChargeLoopOhm > 0) {
    const tauUs = (bootChargeLoopOhm * cBootNf * 1e-9) * 1e6;
    refreshFractionChargedPct = (1 - Math.exp(-refreshWindowUs / tauUs)) * 100;
  } else {
    p012Assumptions.push('自举充电回路总电阻(R_boot+R_diode+Rdson_LS)未提供，无法核验刷新窗口是否足够把自举电容充满');
  }
  const p012RefreshInsufficient = refreshFractionChargedPct !== undefined && refreshFractionChargedPct < 90;

  const p012CalculatedValues: Record<string, string | number> = {
    '自举电容容量 C_boot (nF)': cBootNf,
    '高边驱动静态偏置漏电流 (μA)': iLeakUa,
    '每次开关抽取的等效电流 Qg×fsw (μA)': Number(iSwitchingEquivalentUa.toFixed(1)),
    '合计等效泄放电流 (μA，此前版本遗漏了开关抽取项)': Number(iTotalUa.toFixed(1)),
    '计入开关抽取项后的最大允许持续上桥导通时间 (ms)': Number(maxOnTimeMs.toFixed(2)),
    '强制刷新窗口设定 (μs)': refreshWindowUs,
  };
  if (refreshFractionChargedPct !== undefined) {
    p012CalculatedValues['刷新窗口内自举电容充电完成度 (%)'] = Number(refreshFractionChargedPct.toFixed(0));
  }
  pushAssumptionNote(p012CalculatedValues, p012Assumptions);

  patterns.push({
    id: 'P012',
    name: '高边自举电路充电动能不足 (Bootstrap Voltage Margin & Refresh Strategy)',
    triggered: p012RefreshInsufficient,
    corePhysicalChain: 'PWM 占空比逼近 100% → 下桥导通时间极短 → 自举电容无法充满电 → 高边门极浮动电压缓慢跌落 → 上桥 MOSFET 进入线性放大区发热烧毁。泄放电流除静态漏电流外，每次开关从自举电容抽走的栅极电荷 (Qg×fsw) 往往是主导项',
    calculatedValues: p012CalculatedValues,
    riskLevel: p012RefreshInsufficient ? 'Medium-High' : 'Medium',
    confidence: p012Assumptions.length > 0 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p012RefreshInsufficient,
    vetoReason: p012RefreshInsufficient
      ? `按自举充电回路时间常数估算，${refreshWindowUs}μs 的刷新窗口只能把自举电容充到约${refreshFractionChargedPct?.toFixed(0)}%，与"占空比限制"的设计意图自相矛盾，需要加长刷新窗口或减小回路电阻/电容`
      : undefined,
    candidateMeasures: [
      `固件强制限制最大 PWM 占空比，保证每个周期下管开启时间足以把自举电容充到90%以上（当前假设参数下建议刷新窗口 ≥ ${bootChargeLoopOhm ? (bootChargeLoopOhm * cBootNf * 1e-9 * 1e6 * 2.3).toFixed(1) : '(需提供回路电阻后计算)'}μs）`,
      '或者高边采用电荷泵 (Charge Pump) 辅助电路维持 100% 占空比无限时开通',
    ],
    sideEffects: ['占空比上限会略微损失电机最高转速上限'],
    verificationItems: ['示波器高压隔离差分探头跨接在上管 VB-VS 引脚，观测持续重载时的自举电压跌落，实测 Qg×fsw 项与静态漏电流项的真实占比'],
    unknownsToTest: ['自举二极管高温反向漏电流 Ir 对自举电容电荷泄放的加速影响'],
  });

  // ----------------------------------------------------
  // P013: 母线电容不足 (Section 4)
  // ----------------------------------------------------
  const p013Assumptions: string[] = [];
  const cbusUf013 = input.cbusUf && input.cbusUf > 0 ? input.cbusUf : 470;
  const iPeak013 = input.currentPeakA !== undefined ? input.currentPeakA : 25;
  const hasProvidedPeakCurrent013 = input.currentPeakA !== undefined;
  if (!hasProvidedPeakCurrent013) p013Assumptions.push('电流峰值 I_peak 未提供，假设为25A——这是纹波电流估算的主导变量，据此算出的纹波电流数值仅供参考，不应单独作为一票否决依据');
  const modIdx013 = input.modulationIndex !== undefined ? input.modulationIndex : 0.9;
  const pf013 = input.powerFactorCosPhi !== undefined ? input.powerFactorCosPhi : 0.9;
  // 三相逆变器直流侧电容纹波电流闭式解（Kolar/Evans近似），替代原来固定的 ×0.45
  const rippleCurrentEst = iPeak013 * Math.sqrt(
    Math.max(0, 2 * modIdx013 * (Math.sqrt(3) / (4 * Math.PI) + Math.pow(pf013, 2) * (Math.sqrt(3) / Math.PI - (9 * modIdx013) / 16)))
  );
  const p013VetoBase = rippleCurrentEst > 6.0;
  const p013Veto = hasProvidedPeakCurrent013 ? p013VetoBase : false;
  const p013Triggered = cbusUf013 < 600;
  // [FIX] 把原来笼统的 0.75 拆成三个独立、可查的因子，而不是一个数吃掉所有降额
  const initTolPct = input.capInitialTolerancePct !== undefined ? input.capInitialTolerancePct : 20;
  const eolDeratingPct = input.capEolDeratingPct !== undefined ? input.capEolDeratingPct : 20;
  const lowTempDeratingPct = input.capLowTempDeratingPct !== undefined ? input.capLowTempDeratingPct : 30;
  if (input.capInitialTolerancePct === undefined || input.capEolDeratingPct === undefined || input.capLowTempDeratingPct === undefined) {
    p013Assumptions.push('电容初始容差/寿命末期降额/低温降额未分别提供，假设分别为20%/20%/30%(电解电容典型量级，务必用datasheet核实，尤其低温降额差异很大)');
  }
  const combinedDeratingFactor = (1 - initTolPct / 100) * (1 - eolDeratingPct / 100) * (1 - lowTempDeratingPct / 100);
  const minEffectiveCapUf = cbusUf013 * combinedDeratingFactor;

  const p013CalculatedValues: Record<string, string | number> = {
    '母线电容标称容量 (μF)': cbusUf013,
    '初始容差降额 (%)': initTolPct,
    '寿命末期(EOL)降额 (%)': eolDeratingPct,
    '低温降额 (%，电解电容在-40℃附近通常是三者中最大的一项)': lowTempDeratingPct,
    '三项降额后最小有效容量 (μF)': Number(minEffectiveCapUf.toFixed(0)),
    '高频纹波电流估算 I_ripple_rms (A，按调制比/功率因数闭式解)': Number(rippleCurrentEst.toFixed(1)),
    '电容额定允许纹波电流 @105C (A)': 4.5,
  };
  pushAssumptionNote(p013CalculatedValues, p013Assumptions);

  patterns.push({
    id: 'P013',
    name: '母线去耦电容容量与纹波电流耐受评估 (DC-Link Capacitor Margins & Aging)',
    triggered: p013Triggered,
    corePhysicalChain: '逆变器三相高频开关 → 抽取大脉冲高频纹波电流 → DC-Link电容自发热升温与电解液干涸 → 电容老化失效与母线瞬态吸收能力丧失',
    calculatedValues: p013CalculatedValues,
    riskLevel: rippleCurrentEst > 4.5 ? 'High' : 'Medium',
    confidence: p013Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p013Veto,
    vetoReason: p013Veto
      ? '母线电容纹波电流严重超出器件最大额定值，存在内部过热爆浆与失火风险！'
      : (p013VetoBase ? '电流峰值为假设值，按当前假设纹波电流已严重超标——强烈建议尽快提供实测电流以确认结论' : undefined),
    candidateMeasures: [
      '选用耐高温车规固液混合铝电解电容或车规级贴片薄膜电容',
      '在电解电容旁近距离并联多颗 X7R 陶瓷电容分担高频纹波电流',
    ],
    sideEffects: ['增加混合固态电容单板增加 BOM 成本 $0.35'],
    verificationItems: ['宽带电流探头卡在电容支路，在几个不同调制比/负载下取一个基波周期的RMS，核实闭式解估算值；热电偶实测长期满载下电解电容中心防爆阀表面温升不超过环境 +15℃'],
    unknownsToTest: ['电容 ESR 随运行年限增长的倍率变化曲线 (典型 10 年后增加 2~3 倍)'],
  });

  // ----------------------------------------------------
  // P014: MOSFET VDS裕量 (Section 4)
  // ----------------------------------------------------
  const p014Assumptions: string[] = [];
  let peakVds: number;
  let peakVdsMethod: string;
  if (input.loopInductanceNh !== undefined && input.diDtANs !== undefined) {
    const overshootV = input.loopInductanceNh * 1e-9 * (input.diDtANs * 1e9);
    peakVds = measuredVbus + overshootV;
    peakVdsMethod = `Vbus + L_loop·di/dt = ${measuredVbus.toFixed(1)}V + ${overshootV.toFixed(1)}V`;
  } else {
    // [FIX-7] 原来的 ×1.05 (仅5%过冲)对有回路寄生电感的硬开关逆变器明显偏乐观，
    // 实测中20%~60%过冲并不少见；在没有回路电感实测数据时，改用更保守的假设并如实标注。
    p014Assumptions.push('未提供回路电感与di/dt，改用固定假设的30%过冲系数(仍可能偏乐观，强烈建议实测)，而非原先偏乐观的5%');
    peakVds = measuredVbus * 1.3;
    peakVdsMethod = '未提供L_loop/di_dt，假设过冲=标称值×30%';
  }
  const vdsMargin = input.vdsRating - peakVds;
  const p014VetoBase = peakVds >= input.vdsRating;
  // 跟 P002/P006/P013 一样：如果过冲系数本身是假设值，或者它依赖的 measuredVbus 本身
  // 也是 P001 那边顶替的理论值而非实测，就不允许单独把结论升级成"一票否决"。
  const p014InputsAssumed = p014Assumptions.length > 0 || !hasMeasuredVbus;
  const p014Veto = p014InputsAssumed ? false : p014VetoBase;
  // [FIX-7] evidenceType 现在如实反映 peakVds 的真实来源，而不是无条件写 'MEASURED'。
  const p014EvidenceType: EvidenceType = (hasMeasuredVbus && input.loopInductanceNh !== undefined) ? 'MEASURED' : 'CALCULATED';

  const p014CalculatedValues: Record<string, string | number> = {
    '静态标称工作电压 Vds_nom (V)': vbusNominalSafe,
    '动态浪涌过冲估算方法': peakVdsMethod,
    '动态浪涌过冲估算 Vds_peak (V)': Number(peakVds.toFixed(1)),
    '器件绝对最大额定值 Vds_rating (V)': input.vdsRating,
    '绝对耐压裕量 (未降额) Margin (V)': Number(vdsMargin.toFixed(1)),
    '车规 80% 降额红线 (V)': Number((input.vdsRating * 0.8).toFixed(1)),
  };
  pushAssumptionNote(p014CalculatedValues, p014Assumptions);

  patterns.push({
    id: 'P014',
    name: 'MOSFET VDS多层级电压裕量核查 (VDS Stress vs Rating Hierarchy)',
    triggered: Number.isFinite(peakVds) && peakVds >= input.vdsRating * 0.75,
    corePhysicalChain: '区分：Vds_nominal / Vds_peak / Vds_repetitive_peak / Vds_absolute_maximum；若瞬态尖峰突破额定击穿电压，直接触发一票否决！',
    calculatedValues: p014CalculatedValues,
    riskLevel: p014Veto ? 'High' : (vdsMargin < input.vdsRating * 0.1 || peakVds > input.vdsRating * 0.8 ? 'Medium-High' : 'Low'),
    confidence: p014Assumptions.length > 0 ? 'LOW' : 'HIGH',
    evidenceType: p014EvidenceType,
    vetoTriggered: p014Veto,
    vetoReason: p014Veto
      ? `MOSFET 漏源动态尖峰估算 (${peakVds.toFixed(1)}V) 突破器件绝对耐压额定值 (${input.vdsRating}V)，触犯第一性原则，一票否决！`
      : (p014VetoBase ? `过冲系数或母线电压为假设值，按当前假设动态尖峰估算 (${peakVds.toFixed(1)}V) 已突破额定值 (${input.vdsRating}V)——强烈建议尽快提供回路电感/di-dt实测或母线实测以确认结论` : undefined),
    candidateMeasures: [
      '选用更高耐压车规低内阻 MOSFET，拉开耐压安全裕量',
      '增加高频贴片 RC Snubber 强行吸收开关瞬态反冲尖峰',
      '实测开关节点1GHz带宽下的真实过冲，替换本模型的过冲假设系数',
    ],
    sideEffects: ['更高耐压器件在相同芯片尺寸下 Rds(on) 会更高，需要增大芯片面积或优化散热'],
    verificationItems: ['示波器 1GHz 探头直接焊接在 MOSFET 引脚根部捕获最极限开关尖峰，并同时测回路电感(可用短路环法)与di/dt，替换假设的过冲系数'],
    unknownsToTest: ['汽车线束接插件插拔瞬态与抛负载 (Load Dump) 叠加时的综合浪涌'],
  });

  // ----------------------------------------------------
  // P015: MCU依赖型保护 (Section 4)
  // ----------------------------------------------------
  patterns.push({
    id: 'P015',
    name: 'MCU依赖型保护独立性评估 (Protection Independence Taxonomy)',
    triggered: true,
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
  });

  // ----------------------------------------------------
  // P016: 过流/短路保护响应时间 ↔ SOA (重点新增模块 4.1)
  // ----------------------------------------------------
  const p016Assumptions: string[] = [];
  const nsOrAssume = (v: number | undefined, fb: number, label: string): number => {
    if (v === undefined) { p016Assumptions.push(label); return fb; }
    return v;
  };
  const senseDelayNs = nsOrAssume(input.senseDelayNsOverride, 80, '电流检测延迟未提供，假设80ns');
  const compDelayNs = nsOrAssume(input.compDelayNsOverride, 120, '比较器响应时间未提供，假设120ns');
  const digitalFilterDelayNs = nsOrAssume(input.digitalFilterDelayNsOverride, 150, '数字滤波消抖时间未提供，假设150ns');
  const driverPropDelayNs = nsOrAssume(input.driverPropDelayNsOverride, 100, '预驱传播延迟未提供，假设100ns');
  const gateTurnOffDelayNs = nsOrAssume(input.gateTurnOffDelayNsOverride, 220, '门极关断延迟未提供，假设220ns');
  const currentFallDelayNs = nsOrAssume(input.currentFallDelayNsOverride, 180, '电流衰减时间未提供，假设180ns');
  const faultToOffTimeNs =
    senseDelayNs + compDelayNs + digitalFilterDelayNs + driverPropDelayNs + gateTurnOffDelayNs + currentFallDelayNs;
  const faultToOffTimeUs = faultToOffTimeNs / 1000;
  // [说明] 低压车规 MOSFET 的 datasheet 通常不给"短路耐受时间"这一指标(那是IGBT/SiC常见规格)；
  // 12~48V硬短路场景更严谨的判据是 SOA 曲线上的 Vds·Id·t 或雪崩能量 E_AS，这里的固定值
  // 仅作数量级参考，务必用实际器件的SOA曲线复核。
  const soaTimeAssumed = input.soaShortCircuitTimeUsOverride === undefined;
  if (soaTimeAssumed) p016Assumptions.push('MOSFET SOA短路耐受时间未提供且低压MOSFET datasheet通常不直接给出此参数，假设2.5μs仅供数量级参考，请改用SOA能量法(Vds·Id·t 或 E_AS)复核');
  const mosfetSoaShortCircuitTimeUs = input.soaShortCircuitTimeUsOverride !== undefined ? input.soaShortCircuitTimeUsOverride : 2.5;
  const timingMarginUs = mosfetSoaShortCircuitTimeUs - faultToOffTimeUs;
  const p016Veto = timingMarginUs <= 0;

  const p016CalculatedValues: Record<string, string | number> = {
    '电流检测与运放延迟 (ns)': senseDelayNs,
    '硬件比较器响应时间 (ns)': compDelayNs,
    '抗干扰数字滤波消抖时间 (ns)': digitalFilterDelayNs,
    '预驱芯片传播延迟 (ns)': driverPropDelayNs,
    '门极关断放电延迟 (ns)': gateTurnOffDelayNs,
    '电流完全衰减切断时间 (ns)': currentFallDelayNs,
    '整条保护链全关闭时间 Fault-to-Off Time (μs)': Number(faultToOffTimeUs.toFixed(3)),
    [soaTimeAssumed ? '⚠ MOSFET 短路耐受时间(假设值，低压器件通常无此datasheet指标) (μs)' : 'MOSFET SOA 额定极限短路耐受时间 (μs)']: mosfetSoaShortCircuitTimeUs,
    '时序安全裕量 Timing Margin (μs)': Number(timingMarginUs.toFixed(3)),
  };
  pushAssumptionNote(p016CalculatedValues, p016Assumptions);

  patterns.push({
    id: 'P016',
    name: '过流/短路保护响应时间时序 ↔ MOSFET SOA 安全区匹配 (Fault-to-Off Timing vs SOA)',
    triggered: timingMarginUs < 1.0 || p016Veto,
    corePhysicalChain: 'Fault occurs → Current rises → Sense delay → Comparator/ADC delay → Digital delay → Driver propagation delay → Gate turn-off → 电流衰减。低压MOSFET更严谨的判据是SOA曲线上的能量积分而非固定的"短路耐受时间"',
    calculatedValues: p016CalculatedValues,
    riskLevel: p016Veto ? 'High' : (timingMarginUs < 0.5 ? 'Medium-High' : 'Low'),
    confidence: p016Assumptions.length > 2 ? 'LOW' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: p016Veto && !soaTimeAssumed,
    vetoReason: p016Veto
      ? (soaTimeAssumed
        ? `按假设参数估算，全保护链关断时间 (${faultToOffTimeUs.toFixed(2)}μs) 可能超过SOA短路耐受时间假设值 (${mosfetSoaShortCircuitTimeUs}μs)，但该耐受时间是假设值而非实际器件SOA数据，暂不作为一票否决，请先用实际器件SOA曲线复核`
        : `全保护链关断时间 (${faultToOffTimeUs.toFixed(2)}μs) 超过器件 SOA 额定安全耐受时间 (${mosfetSoaShortCircuitTimeUs}μs)，短路时功率管将先于保护触发烧毁，触发致命一票否决！`)
      : undefined,
    candidateMeasures: [
      '减小门极关断回路消抖滤波时间，优化关断放电电阻 Rg_off 缩短关断延迟',
      '选用具有超高速硬件短路检测的专用车载预驱（低压MOSFET通常不用DESAT，那是IGBT/SiC技术，此处不适用）',
      '用实际器件的 SOA 曲线做 Vds·Id·t 能量积分复核，替代固定的"短路耐受时间"假设',
    ],
    sideEffects: ['过分缩短滤波时间可能导致在电机急加减速时将大容性充电尖峰误判为短路'],
    verificationItems: [
      '示波器同时使用 4 通道捕获：CH1: Vds, CH2: Id (电流探头), CH3: Gate 门极, CH4: 预驱 Fault 报警引脚，精确标定 6 级延迟实测值',
    ],
    unknownsToTest: ['高温 125℃ 下 MOSFET 短路耐受能量 (E_AS) 的严重衰减规律'],
  });

  // ----------------------------------------------------
  // P017: 电流采样架构决策器 (重点新增模块 4.1)
  // ----------------------------------------------------
  patterns.push({
    id: 'P017',
    name: '电流采样架构决策矩阵 (Current Sensing Architecture Trade-Off)',
    triggered: true,
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
  });

  // ----------------------------------------------------
  // P018: 堵转保护多级判据 (重点新增模块 4.1)
  // ----------------------------------------------------
  patterns.push({
    id: 'P018',
    name: '电机堵转保护多级复合联合判据 (Multi-Level Stall Protection Rule Engine)',
    triggered: true,
    corePhysicalChain: '联合判据：相电流 > I_stall_th AND 机械转速 < RPM_low_th AND 持续时间 > Time_window；严禁单纯使用温度阈值粗暴判断！四级阈值的结构具有普遍工程意义，但具体数值(电流/转速/时间窗)必须按电机额定电流与P006/P007给出的热时间常数标定，不应直接套用示例数字',
    calculatedValues: {
      'Level 1 (软限制，示例阈值，需按实际电机标定)': '电流 > I_stall_th 且 RPM < RPM_low_th 持续 t1 → 实施转矩限制',
      'Level 2 (PWM降额，示例阈值，需按实际电机标定)': '持续 t2 未恢复 → PWM 占空比阶梯降额，并上报 DTC 预警码',
      'Level 3 (安全停机，示例阈值，需按实际电机标定)': '持续 t3 仍未脱困 → 触发安全停机，关断三相逆变桥，进入低功耗怠速保护',
      'Level 4 (故障锁存，示例阈值，需按实际电机标定)': '单次点火循环内累计触发 N 次 Level 3 → 永久锁存故障码，禁止再次强拖点火',
      '⚠ 标定依据': 't1/t2/t3 时间窗应基于 P006/P007 给出的热时间常数标定(堵转保护延时的物理依据本质上是热)，而不是独立拍脑袋设定；电流阈值应基于电机连续/峰值电流规格',
    },
    riskLevel: 'Medium',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: ['实施四级递进式堵转闭环保护策略，兼顾机械卡滞脱困能力与电子器件防烧毁安全，时间窗与P006/P007的热模型联动标定'],
    sideEffects: ['频繁微小卡滞可能引起短暂停机，需针对机械机构调优延时滞回参数'],
    verificationItems: ['在机械端通过抱闸制动施加机械死锁，验证 4 级保护的状态转移时序与标定的热时间常数是否匹配'],
    unknownsToTest: ['零下 40℃ 润滑脂凝固导致的冷态假堵转与真实硬限位碰撞的区别特征提取'],
  });

  return patterns;
}
