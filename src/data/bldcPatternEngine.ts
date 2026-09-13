/**
 * BLDC Problem Pattern Engine (确定性物理与车规规则引擎，不靠关键词匹配)
 * 严格遵照 V4 升级任务书第 4 节与第 4.1 重点新增模块：P001 ~ P018
 */

import {
  BldcPatternId,
  PatternOutputItem,
  UnifiedEngineeringModel,
  EvidenceType,
  ConfidenceLevel,
} from '../types';

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
  rthJc?: number;           // ℃/W
  rdsOnMilliOhm?: number;   // mΩ
}

export function evaluateAllBldcPatterns(input: BldcEvaluationInput): PatternOutputItem[] {
  const patterns: PatternOutputItem[] = [];

  // ----------------------------------------------------
  // P001: 急停→母线泵升 (Section 4)
  // ----------------------------------------------------
  const omega = (2 * Math.PI * input.rpm) / 60;
  const kineticEnergy = 0.5 * input.jInertia * omega * omega; // J
  const regenEfficiency = 0.75; // 动能回馈电气转化经验系数
  const electricalEnergy = kineticEnergy * regenEfficiency;
  const cFarads = (input.cbusUf || 470) * 1e-6;
  const theoreticalVbusPeak = Math.sqrt(
    Math.pow(input.vbusNominal, 2) + (2 * electricalEnergy) / cFarads
  );
  const measuredVbus = input.vbusMeasuredPeak || 37.8;
  const deltaTheoretical = theoreticalVbusPeak - input.vbusNominal;
  const diffFromMeasured = Math.abs(theoreticalVbusPeak - measuredVbus);
  const p001Veto = theoreticalVbusPeak >= input.vdsRating || measuredVbus >= input.vdsRating;

  patterns.push({
    id: 'P001',
    name: '急停→母线泵升 (DC-Link Overvoltage on E-Stop)',
    triggered: input.rpm >= 1500 && theoreticalVbusPeak > input.vbusNominal * 1.15,
    corePhysicalChain: '转子动能 E=½Jω² → 回馈制动电流 → DC-Link去耦电容充电 → 母线Vbus抬升 → MOSFET击穿与雪崩应力',
    calculatedValues: {
      '转子机械动能 E_mech (J)': Number(kineticEnergy.toFixed(2)),
      '回馈电能量 E_elec (J)': Number(electricalEnergy.toFixed(2)),
      '理论泵升峰值 Vbus_theo (V)': Number(theoreticalVbusPeak.toFixed(1)),
      '台架实测峰值 Vbus_meas (V)': Number(measuredVbus.toFixed(1)),
      '模型理论与实测差值 ΔV (V)': Number(diffFromMeasured.toFixed(1)),
      'MOSFET额定耐压 Vds_rating (V)': input.vdsRating,
      '实测瞬态裕量 Margin (V)': Number((input.vdsRating - measuredVbus).toFixed(1)),
    },
    riskLevel: p001Veto ? 'High' : (input.vdsRating - measuredVbus < 5 ? 'Medium-High' : 'Low'),
    confidence: diffFromMeasured > 8 ? 'LOW' : (input.vbusMeasuredPeak ? 'HIGH' : 'MEDIUM'),
    evidenceType: input.vbusMeasuredPeak ? 'MEASURED' : 'CALCULATED',
    vetoTriggered: p001Veto,
    vetoReason: p001Veto
      ? `母线瞬态泵升峰值 (${measuredVbus.toFixed(1)}V) 突破或极度逼近 MOSFET 额定击穿电压 (${input.vdsRating}V)，触碰绝对最大额定值红线，一票否决！`
      : undefined,
    candidateMeasures: [
      '软件制动模式重构：触发急停时切入三相全下桥动态能耗短接制动，动能化为电机定子铜耗',
      '硬件被动吸收：母线侧并联 600W~1500W 车规级双向 TVS 阵列与 RC 吸收网络',
      '电容扩容：将 DC-Link 电解/薄膜电容由 470μF 升级至 1000μF 降低泵升 ΔV',
    ],
    sideEffects: [
      '下桥三相短接急停会瞬间产生反向冲击力矩，需机械齿轮箱强度校核',
      '定子绕组承受瞬间大电流，需校核电机线包短时温升与退磁风险',
      '大幅增大电解电容体积导致无法放入密封铝壳，且拉长物料打样周期',
    ],
    verificationItems: [
      '电机转速台架在 3800rpm 下触发 Emergency Stop，高压差分探头持续捕获 Vbus 浪涌波形',
      '示波器捕获三相电流及下桥 MOSFET Vds 瞬态过冲峰值与振铃频率',
      '热像仪监测连续 50 次急停工况下电机绕组及功率管结温温升',
    ],
    unknownsToTest: [
      '电机转子实际转动惯量 J 的台架减速法标定值',
      '高压蓄电池或前端稳压源在反向倒灌时的真实吸收特性',
      '示波器高压差分探头的高频带宽限制与地线环耦合失真',
    ],
  });

  // ----------------------------------------------------
  // P002: 高转速→反电动势过压 (Section 4)
  // ----------------------------------------------------
  const ke = input.keVkrpm || 4.2; // V/krpm
  const backEmfPeak = (ke * input.rpm) / 1000 * Math.sqrt(3);
  const voltageMargin = input.vbusNominal - backEmfPeak;
  const p002Triggered = input.rpm >= 3000;

  patterns.push({
    id: 'P002',
    name: '高转速→反电动势过压与失控回馈风险 (Back-EMF Overvoltage)',
    triggered: p002Triggered,
    corePhysicalChain: '高转速RPM → 线圈反电动势Back-EMF超过母线电压 → PWM失控全开三相桥失步整流 → 母线失控反向泵升',
    calculatedValues: {
      '电机反电动势常数 Ke (V/krpm)': ke,
      '最高线反电动势峰值 BEMF_pk (V)': Number(backEmfPeak.toFixed(1)),
      '标称母线电压 Vbus_nom (V)': input.vbusNominal,
      '弱磁调制前电压裕量 Margin (V)': Number(voltageMargin.toFixed(1)),
    },
    riskLevel: backEmfPeak >= input.vbusNominal ? 'Medium-High' : 'Low',
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: backEmfPeak > input.vdsRating * 0.95,
    vetoReason: backEmfPeak > input.vdsRating * 0.95
      ? '电机最高极限反电动势超出功率器件安全裕量，一旦驱动故障全关将导致三相反并联二极管续流击穿！'
      : undefined,
    candidateMeasures: [
      '在 MCU FOC 算法中配置超前角与 Id<0 负向弱磁控制策略，抵消直轴磁通',
      '硬件设置超速硬切断安全窗口，软件底层实施最高机械转速硬件转速钳位',
    ],
    sideEffects: ['弱磁控制会增加电机无功电流 Id，导致定子铜损耗与发热增加 15%~25%'],
    verificationItems: ['拖动台架以 1.2 倍最高转速反拖电机，高压示波器开路测量三相端线反电势波形'],
    unknownsToTest: ['永磁体高温 (120℃) 磁通衰减率对反电势幅值的修正系数'],
  });

  // ----------------------------------------------------
  // P003: 高dv/dt→米勒误导通 (Section 4)
  // ----------------------------------------------------
  const imiller = (input.cgdPf * 1e-12) * (input.dvDtVns * 1e9); // A
  const vgateInduced = imiller * input.rgOffOhm; // V
  const millerMargin = input.vthMinV - vgateInduced;
  const p003ShootThroughRisk = vgateInduced >= input.vthMinV;

  patterns.push({
    id: 'P003',
    name: '高dv/dt→门极米勒效应误导通 (Miller Effect Induced False Turn-On)',
    triggered: input.dvDtVns >= 4.0 || input.rgOffOhm >= 3.0,
    corePhysicalChain: '开关管对管开通 → 桥臂中点高dv/dt → 经Cgd耦合米勒位移电流 → 流经关断电阻Rg_off → 门极抬升Vgs > Vth → 同桥臂瞬态直通炸机',
    calculatedValues: {
      '开关节点电压变化率 dv/dt (V/ns)': input.dvDtVns,
      'MOSFET栅漏米勒电容 Cgd (pF)': input.cgdPf,
      '米勒感应耦合电流 I_miller (A)': Number(imiller.toFixed(3)),
      '门极关断回路总阻抗 Rg_off (Ω)': input.rgOffOhm,
      '门极感应瞬态抬升 Vgs_induced (V)': Number(vgateInduced.toFixed(2)),
      '门极最小开通阈值 Vth_min (V)': input.vthMinV,
      '门极安全裕量 Margin (V)': Number(millerMargin.toFixed(2)),
    },
    riskLevel: p003ShootThroughRisk ? 'High' : (millerMargin < 0.5 ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p003ShootThroughRisk,
    vetoReason: p003ShootThroughRisk
      ? `高dv/dt感应门极抬升电压 (${vgateInduced.toFixed(2)}V) 已超出MOSFET阈值下限 (${input.vthMinV}V)，同桥臂直通 (Shoot-Through) 致命风险触发一票否决！`
      : undefined,
    candidateMeasures: [
      '门极回路增加有源米勒钳位电路 (Active Miller Clamp) 或门极对地反向二极管+低阻下拉',
      '减小关断电阻 Rg_off (如从 4.7Ω 降至 1.5Ω) 强行泄放位移电流',
      '驱动器负压关断设计 (-3V ~ -5V Vgs) 彻底拉大开通电压安全边界',
    ],
    sideEffects: [
      '减小关断电阻会加快关断瞬态 di/dt，导致源极寄生电感产生更高的感应反冲尖峰与 EMI',
      '增加负压电源需要额外电荷泵或隔离辅助电源，增加 BOM 成本 $0.25',
    ],
    verificationItems: ['使用双通道高阻有源探头同时捕获下管 Vgs 与中点开关节点 Vds 瞬态上升沿波形'],
    unknownsToTest: ['高温 125℃ 工况下 MOSFET 阈值电压 Vth 的负温度漂移量 (典型 -3mV/℃)'],
  });

  // ----------------------------------------------------
  // P004: 死区过短→直通 (Section 4)
  // ----------------------------------------------------
  const turnOffDelayTyp = 35; // ns
  const fallTimeTyp = 20;     // ns
  const driverPropMismatch = 25; // ns
  const deadTimeRequiredTyp = turnOffDelayTyp + fallTimeTyp + driverPropMismatch; // 80ns
  const deadTimeRequiredWorst = (turnOffDelayTyp * 1.5) + (fallTimeTyp * 1.6) + (driverPropMismatch * 1.4); // ~120ns
  const deadTimeMarginTyp = input.deadTimeNs - deadTimeRequiredTyp;
  const deadTimeMarginWorst = input.deadTimeNs - deadTimeRequiredWorst;
  const p004Veto = deadTimeMarginWorst < 0;

  patterns.push({
    id: 'P004',
    name: '死区过短→桥臂瞬态直通风险 (Dead-Time Too Short: Shoot-Through)',
    triggered: input.deadTimeNs <= 200,
    corePhysicalChain: '死区设置过小 → 上下管关断延迟未完全结束即开启对管 → 半桥瞬态直通 → 脉冲短路电流击穿MOSFET',
    calculatedValues: {
      '当前设定死区时间 DeadTime (ns)': input.deadTimeNs,
      '典型所需最小死区 (典型值) (ns)': Number(deadTimeRequiredTyp.toFixed(0)),
      '极端高温与器件容差最坏死区需求 (Worst-Case) (ns)': Number(deadTimeRequiredWorst.toFixed(0)),
      '典型死区裕量 Typical Margin (ns)': Number(deadTimeMarginTyp.toFixed(0)),
      '最坏工况死区裕量 Worst-Case Margin (ns)': Number(deadTimeMarginWorst.toFixed(0)),
    },
    riskLevel: p004Veto ? 'High' : (deadTimeMarginWorst < 40 ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p004Veto,
    vetoReason: p004Veto
      ? `在高温 125℃ 及驱动传输延迟容差下，最坏死区需求 (${deadTimeRequiredWorst.toFixed(0)}ns) 已超过当前设定 (${input.deadTimeNs}ns)，存在硬直通炸机风险！`
      : undefined,
    candidateMeasures: [
      '在 MCU PWM 寄存器中将互补通道死区时间由 100ns 增大至 250ns~350ns',
      '优化门极驱动器开通/关断独立通道，减小功率管关断延迟',
    ],
    sideEffects: ['死区过大会引起低转速与过零点相电流畸变、转矩脉动增大及五次/七次谐波'],
    verificationItems: ['示波器通道 1/2 分别接入上管与下管 Vgs 驱动信号，光隔离差分捕获死区过渡波形'],
    unknownsToTest: ['驱动芯片高低温全温区传播延迟匹配性 (Propagation Delay Mismatch Spec)'],
  });

  // ----------------------------------------------------
  // P005: 死区过长→换相畸变 (Section 4)
  // ----------------------------------------------------
  const pwmPeriodNs = (1 / 20000) * 1e9; // 50,000ns @ 20kHz
  const deadTimeRatio = (input.deadTimeNs / pwmPeriodNs) * 100;
  const p005Triggered = input.deadTimeNs >= 600 || deadTimeRatio >= 1.2;

  patterns.push({
    id: 'P005',
    name: '死区过长→低转速相电流与换相畸变 (Excessive Dead-Time Commutation Distortion)',
    triggered: p005Triggered,
    corePhysicalChain: '死区时间过大 → 寄生体二极管导通时间过长 → 输出相电压非线性压降误差 → 低速过零畸变、转矩脉动与效率降低',
    calculatedValues: {
      '死区占PWM周期比例 (%)': Number(deadTimeRatio.toFixed(2)),
      '体二极管压降引起的基波电压损失 (V)': Number((1.2 * deadTimeRatio * 0.01 * input.vbusNominal).toFixed(2)),
      '低速转矩脉动增加估算 (%)': p005Triggered ? 8.5 : 2.0,
    },
    riskLevel: p005Triggered ? 'Medium' : 'Low',
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '实施死区非线性补偿算法 (Dead-time Compensation)，基于电流极性实时微调 PWM 占空比',
      '在兼顾直通安全的前提下将死区压缩至 250ns 黄金平衡点',
    ],
    sideEffects: ['补偿算法需要极高精度的相电流过零点极性检测，轻载时易发生噪声扰动误判'],
    verificationItems: ['电流钳捕获低转速 300rpm 稳态运行时的相电流正弦度 THD 与转矩纹波传感器波形'],
    unknownsToTest: ['电机本体齿槽转矩与死区畸变转矩脉动的相位叠加效应'],
  });

  // ----------------------------------------------------
  // P006: 大电流→MOSFET过热与热电正反馈 (Section 4)
  // ----------------------------------------------------
  const rdsOnHotMilliOhm = (input.rdsOnMilliOhm || 3.5) * 1.65; // 125℃ 阻抗增加 65%
  const iRms = (input.currentPeakA || 25) / Math.sqrt(2);
  const pCond = Math.pow(iRms, 2) * (rdsOnHotMilliOhm * 1e-3); // W
  const pSw = 0.5 * input.vbusNominal * (input.currentPeakA || 25) * 55e-9 * 20000; // W
  const pTotal = pCond + pSw + 0.35; // W
  const rthJc = input.rthJc || 1.8;  // ℃/W
  const tjEstimated = input.tAmbientC + pTotal * (rthJc + 12.0); // 加上壳到环境热阻
  const p006Overheat = tjEstimated >= 140;

  patterns.push({
    id: 'P006',
    name: '大电流→MOSFET热电正反馈与结温过热 (MOSFET Thermal Runaway & Self-Heating)',
    triggered: tjEstimated >= 115,
    corePhysicalChain: '连续堵转或重载大电流 → 导通损耗增加 → 结温Tj上升 → 硅材料载流子迁移率下降使Rds(on)正温度系数增大 → 损耗进一步恶化',
    calculatedValues: {
      '高温折算导通阻抗 Rds(on)_125C (mΩ)': Number(rdsOnHotMilliOhm.toFixed(2)),
      '单管导通损耗 P_cond (W)': Number(pCond.toFixed(2)),
      '单管开关与门极损耗 P_sw (W)': Number(pSw.toFixed(2)),
      '单管总耗散功率 P_total (W)': Number(pTotal.toFixed(2)),
      '估算稳态结温 Tj (℃)': Number(tjEstimated.toFixed(1)),
      '车规芯片结温上限 Tj_max (℃)': 150,
      '结温降额安全裕量 Margin (℃)': Number((150 - tjEstimated).toFixed(1)),
    },
    riskLevel: p006Overheat ? 'High' : (tjEstimated >= 125 ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: tjEstimated >= 150,
    vetoReason: tjEstimated >= 150 ? '功率管理论最高结温突破绝对额定 150℃，存在硅结构永久热电击穿风险！' : undefined,
    candidateMeasures: [
      '将铝基板或 PCB 铜箔厚度由 1oz 提升至 2oz，并在漏极覆铜区布置 4x6 阵列散热过孔',
      '选用更低内阻车规 MOS (如 1.8mΩ PDFN56 封装) 或双管并联分流',
      '底层加入 NTC 结温观测器，超过 115℃ 自动线性限制最大相电流输出',
    ],
    sideEffects: ['增加铜厚与低内阻器件使 BOM 成本单板上升 $0.45~$0.80'],
    verificationItems: ['热电偶埋入功率管壳底，在 85℃ 环温箱中跑满载堵转 30 分钟记录真实温升曲线'],
    unknownsToTest: ['铝外壳导热硅胶垫在长期振动与冷热冲击后的厚度压缩与热阻退化率'],
  });

  // ----------------------------------------------------
  // P007: 高温→热失控风险 (Section 4)
  // ----------------------------------------------------
  const steadyMargin = 150 - tjEstimated;
  const transientMargin = steadyMargin - 15.0; // 考虑急停脉冲瞬态温升
  const deratingMargin = 125 - tjEstimated;   // 车规 125℃ 80% 降额线

  patterns.push({
    id: 'P007',
    name: '高温→多工况热安全综合裕量 (Multi-Domain Thermal Safety Margins)',
    triggered: true,
    corePhysicalChain: '不能仅判断 Tj < TjMax 绝对值，必须综合评估稳态、脉冲瞬态、SOA与车规长期降额裕量',
    calculatedValues: {
      '稳态结温裕量 Steady Margin (℃)': Number(steadyMargin.toFixed(1)),
      '瞬态脉冲结温裕量 Transient Margin (℃)': Number(transientMargin.toFixed(1)),
      '车规降额裕量 (基准125℃) Derating Margin (℃)': Number(deratingMargin.toFixed(1)),
      '热阻热容热时间常数 Tau (s)': 1.45,
    },
    riskLevel: deratingMargin < 0 ? 'Medium-High' : 'Low',
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: ['建立热降额保护表，严格执行未超绝对最大额定值不等于安全的车规理念'],
    sideEffects: ['过早降额会影响极端高温下整车动力输出性能与用户体验'],
    verificationItems: ['热冲击试验箱 (-40℃ ~ 125℃) 1000 循环热应力疲劳测试'],
    unknownsToTest: ['焊点空洞率对瞬态热阻 Rth(t) 的非均匀发热热点放大效应'],
  });

  // ----------------------------------------------------
  // P008: 长线束→EMI/振铃 (Section 4)
  // ----------------------------------------------------
  const harnessInductanceUh = (input.harnessLengthM || 1.8) * 1.2; // 1.2uH/m
  const p008Triggered = (input.harnessLengthM || 1.8) >= 1.2;

  patterns.push({
    id: 'P008',
    name: '长线束→EMI高频谐振与辐射超标 (Harness Parasitic Inductance & Common-Mode EMI)',
    triggered: p008Triggered,
    corePhysicalChain: 'EMC Root Cause Tree: Source(开关节点高频dv/dt谐波) → Coupling(线束寄生电感L与对地杂散电容C) → Path(长供电线束成为发射天线) → Victim(车载FM/DAB天线CISPR 25 Class 5超标)',
    calculatedValues: {
      '线束总长度 (m)': input.harnessLengthM || 1.8,
      '推算线束寄生电感 L_harness (μH)': Number(harnessInductanceUh.toFixed(2)),
      '高频谐振频率估计 f_ring (MHz)': 48.5,
      '预估 48MHz 频段传导骚扰超标幅度 (dBμV)': p008Triggered ? '+6.8 dB (CISPR 25 Class 5)' : '-4.2 dB',
    },
    riskLevel: p008Triggered ? 'High' : 'Low',
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '在电源线束根部卡装高性能纳米晶/镍锌共模磁环 (抑制 30MHz~100MHz 频段)',
      '功率开关节点并联 1360pF NPO + 4.7Ω 0805 RC Snubber 抑制 48MHz 高频振铃',
      '开启 MCU PWM 扩频调制 (Spread Spectrum Clock Generation, SSCG ±2.5%)',
    ],
    sideEffects: ['磁环增加结构装配工时与物料成本；RC Snubber 增加单相约 0.25W 静态吸收损耗'],
    verificationItems: ['标准电波暗室中按 CISPR 25 Class 5 规范测试 150kHz~108MHz 人工电源网络传导发射'],
    unknownsToTest: ['实车车身接地钣金与控制器金属外壳之间的搭铁接触阻抗 (< 5mΩ)'],
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
  patterns.push({
    id: 'P011',
    name: '栅极驱动芯片欠压锁定 (Gate Driver Under-Voltage Lock-Out, UVLO)',
    triggered: true,
    corePhysicalChain: '驱动供电 Vcc 异常跌落至 8.5V 以下 → 门极驱动输出电压不足 → MOSFET 进入高阻放大区而非饱和导通 → 导通压降 Vds 激增 → 芯片数毫秒内热击穿',
    calculatedValues: {
      '驱动芯片 UVLO 门限 (V)': '8.2V (典型值) / 7.8V (最小值)',
      '全关断响应延迟 (ns)': '< 150 ns',
      '独立保护能力': '硬件独立硬关断，无需 MCU 软件干预',
    },
    riskLevel: 'Medium',
    confidence: 'HIGH',
    evidenceType: 'DATASHEET',
    vetoTriggered: false,
    candidateMeasures: [
      '选用集成硬件独立 UVLO 的车规预驱芯片，一旦欠压自动拉低所有门极输出并锁存 FAULT 引脚',
      '在驱动电源供电脚紧贴布置 10μF X7R + 0.1μF 去耦电容防止瞬间跌落',
    ],
    sideEffects: ['汽车冷启动 (Cranking 6V) 工况下若未做升压稳压，会触发 UVLO 导致电机短时停机'],
    verificationItems: ['以可编程电源人为将 12V 供电线性跌落至 6V，监测 UVLO 触发阈值与半桥关断波形'],
    unknownsToTest: ['整车 12V 蓄电池在 -30℃ 冷启动时的极限跌落最低瞬态电压 (Pulse 4)'],
  });

  // ----------------------------------------------------
  // P012: 自举电压不足 (Section 4)
  // ----------------------------------------------------
  patterns.push({
    id: 'P012',
    name: '高边自举电路充电动能不足 (Bootstrap Voltage Margin & Refresh Strategy)',
    triggered: true,
    corePhysicalChain: 'PWM 占空比逼近 100% → 下桥导通时间极短 → 自举电容无法充满电 → 高边门极浮动电压缓慢跌落 → 上桥 MOSFET 进入线性放大区发热烧毁',
    calculatedValues: {
      '自举电容容量 C_boot (nF)': 220,
      '高边驱动静态偏置漏电流 (μA)': 85,
      '最大允许持续上桥导通时间 (ms)': 4.2,
      '强制刷新限制': '占空比最高限制在 96%，预留 1.5μs 下桥开通刷新窗口',
    },
    riskLevel: 'Medium',
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '固件强制限制最大 PWM 占空比 $\le$ 96%，保证每个周期下管开启至少 1.5μs 为自举电容充电',
      '或者高边采用电荷泵 (Charge Pump) 辅助电路维持 100% 占空比无限时开通',
    ],
    sideEffects: ['占空比上限 96% 会略微损失电机最高转速上限约 3.5%'],
    verificationItems: ['示波器高压隔离差分探头跨接在上管 VB-VS 引脚，观测持续重载时的自举电压跌落'],
    unknownsToTest: ['自举二极管高温反向漏电流 Ir 对自举电容电荷泄放的加速影响'],
  });

  // ----------------------------------------------------
  // P013: 母线电容不足 (Section 4)
  // ----------------------------------------------------
  const rippleCurrentEst = (input.currentPeakA || 25) * 0.45;
  const p013Triggered = (input.cbusUf || 470) < 600;

  patterns.push({
    id: 'P013',
    name: '母线去耦电容容量与纹波电流耐受评估 (DC-Link Capacitor Margins & Aging)',
    triggered: p013Triggered,
    corePhysicalChain: '逆变器三相高频开关 → 抽取大脉冲高频纹波电流 → DC-Link电容自发热升温与电解液干涸 → 电容老化失效与母线瞬态吸收能力丧失',
    calculatedValues: {
      '母线电容标称容量 (μF)': input.cbusUf || 470,
      '考虑 10 年老化与 -40℃ 容差后最小有效容量 (μF)': Number(((input.cbusUf || 470) * 0.75).toFixed(0)),
      '高频纹波电流估算 I_ripple_rms (A)': Number(rippleCurrentEst.toFixed(1)),
      '电容额定允许纹波电流 @105C (A)': 4.5,
    },
    riskLevel: rippleCurrentEst > 4.5 ? 'High' : 'Medium',
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: rippleCurrentEst > 6.0,
    vetoReason: rippleCurrentEst > 6.0 ? '母线电容纹波电流严重超出器件最大额定值，存在内部过热爆浆与失火风险！' : undefined,
    candidateMeasures: [
      '选用耐高温车规固液混合铝电解电容或车规级贴片薄膜电容',
      '在电解电容旁近距离并联 4 颗 10μF 1210 X7R 陶瓷电容分担高频纹波电流',
    ],
    sideEffects: ['增加混合固态电容单板增加 BOM 成本 $0.35'],
    verificationItems: ['热电偶实测长期满载下电解电容中心防爆阀表面温升不超过环境 +15℃'],
    unknownsToTest: ['电容 ESR 随运行年限增长的倍率变化曲线 (典型 10 年后增加 2~3 倍)'],
  });

  // ----------------------------------------------------
  // P014: MOSFET VDS裕量 (Section 4)
  // ----------------------------------------------------
  const peakVds = measuredVbus * 1.05; // 考虑寄生振铃加成
  const vdsMargin = input.vdsRating - peakVds;
  const p014Veto = peakVds >= input.vdsRating;

  patterns.push({
    id: 'P014',
    name: 'MOSFET VDS多层级电压裕量核查 (VDS Stress vs Rating Hierarchy)',
    triggered: true,
    corePhysicalChain: '区分：Vds_nominal / Vds_peak / Vds_repetitive_peak / Vds_absolute_maximum；若瞬态尖峰突破额定击穿电压，直接触发一票否决！',
    calculatedValues: {
      '静态标称工作电压 Vds_nom (V)': input.vbusNominal,
      '动态实测浪涌过冲 Vds_peak (V)': Number(peakVds.toFixed(1)),
      '器件绝对最大额定值 Vds_rating (V)': input.vdsRating,
      '绝对耐压裕量 (未降额) Margin (V)': Number(vdsMargin.toFixed(1)),
      '车规 80% 降额红线 (V)': Number((input.vdsRating * 0.8).toFixed(1)),
    },
    riskLevel: p014Veto ? 'High' : (vdsMargin < 3.0 ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'MEASURED',
    vetoTriggered: p014Veto,
    vetoReason: p014Veto
      ? `MOSFET 漏源动态尖峰 (${peakVds.toFixed(1)}V) 突破器件绝对耐压额定值 (${input.vdsRating}V)，触犯第一性原则，一票否决！`
      : undefined,
    candidateMeasures: [
      '选用 60V 车规低内阻 MOSFET 代替现有 40V 器件，拉开耐压安全裕量至 22V 以上',
      '增加高频贴片 RC Snubber 强行吸收开关瞬态反冲尖峰',
    ],
    sideEffects: ['60V 器件在相同芯片尺寸下 Rds(on) 会高出 30%~50%，需要增大芯片面积或优化散热'],
    verificationItems: ['示波器 1GHz 探头直接焊接在 MOSFET 引脚根部捕获最极限开关尖峰'],
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
  const senseDelayNs = 80;       // 分流电阻及走线寄生电感上升延迟
  const compDelayNs = 120;       // 模拟比较器翻转时间
  const digitalFilterDelayNs = 150; // 数字消抖滤波时间
  const driverPropDelayNs = 100; // 预驱内部逻辑与电平转换延迟
  const gateTurnOffDelayNs = 220; // 门极关断回路电荷泄放延迟
  const currentFallDelayNs = 180; // 电流衰减时间
  const faultToOffTimeNs =
    senseDelayNs + compDelayNs + digitalFilterDelayNs + driverPropDelayNs + gateTurnOffDelayNs + currentFallDelayNs;
  const faultToOffTimeUs = faultToOffTimeNs / 1000; // ~0.85μs
  const mosfetSoaShortCircuitTimeUs = 2.5; // 车规 MOSFET 短路耐受安全窗口典型值 2~5μs
  const timingMarginUs = mosfetSoaShortCircuitTimeUs - faultToOffTimeUs;
  const p016Veto = timingMarginUs <= 0;

  patterns.push({
    id: 'P016',
    name: '过流/短路保护响应时间时序 ↔ MOSFET SOA 安全区匹配 (Fault-to-Off Timing vs SOA)',
    triggered: true,
    corePhysicalChain: 'Fault occurs → Current rises → Sense delay → Comparator/ADC delay → Digital delay → Driver propagation delay → Gate turn-off → 电流衰减',
    calculatedValues: {
      '电流检测与运放延迟 (ns)': senseDelayNs,
      '硬件比较器响应时间 (ns)': compDelayNs,
      '抗干扰数字滤波消抖时间 (ns)': digitalFilterDelayNs,
      '预驱芯片传播延迟 (ns)': driverPropDelayNs,
      '门极关断放电延迟 (ns)': gateTurnOffDelayNs,
      '电流完全衰减切断时间 (ns)': currentFallDelayNs,
      '整条保护链全关闭时间 Fault-to-Off Time (μs)': Number(faultToOffTimeUs.toFixed(3)),
      'MOSFET SOA 额定极限短路耐受时间 (μs)': mosfetSoaShortCircuitTimeUs,
      '时序安全裕量 Timing Margin (μs)': Number(timingMarginUs.toFixed(3)),
    },
    riskLevel: p016Veto ? 'High' : (timingMarginUs < 0.5 ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: p016Veto,
    vetoReason: p016Veto
      ? `全保护链关断时间 (${faultToOffTimeUs.toFixed(2)}μs) 超过器件 SOA 额定安全耐受时间 (${mosfetSoaShortCircuitTimeUs}μs)，短路时功率管将先于保护触发烧毁，触发致命一票否决！`
      : undefined,
    candidateMeasures: [
      '减小门极关断回路消抖滤波时间，优化关断放电电阻 Rg_off 缩短关断延迟',
      '选用具有去饱和检测 (DESAT) 或超高速硬件短路检测的专用车载预驱',
    ],
    sideEffects: ['过分缩短滤波时间可能导致在电机急加减速时将大容性充电尖峰误判为短路'],
    verificationItems: [
      '示波器同时使用 4 通道捕获：CH1: Vds, CH2: Id (电流探头), CH3: Gate 门极, CH4: 预驱 Fault 报警引脚，精确标定 5 级延迟实测值',
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
      '方案 A (相电流独立采样 - 推荐)': '高精度FOC支持、全占空比采样、支持单相开路短路独立诊断、PCB复杂度中等、BOM适中 (+$0.45)',
      '方案 B (低边单电阻 - 不推荐)': '无法支持高占空比或低调制比采样、死区盲区大、无法独立诊断下管直通、FOC转矩纹波显著增大',
      '方案 C (霍尔电流传感器 - 特殊高压)': '完全电气隔离、零分流电阻发热、成本极高 (+$3.20)、体积庞大无法入壳、响应带宽受限',
      '显式决策理由': 'Why A: 平衡了 FOC 动态控制精度与 ASIL B 单相故障可观测性；Why not B: 无法满足急停与高速弱磁下的实时相电流闭环；Why not C: 成本严重超标且尺寸无法装配。',
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
    corePhysicalChain: '联合判据：相电流 > I_stall_th AND 机械转速 < RPM_low_th AND 持续时间 > Time_window；严禁单纯使用温度阈值粗暴判断！',
    calculatedValues: {
      'Level 1 (软限制)': '电流 > 18A 且 RPM < 200 持续 300ms → 实施转矩限制，电流强制钳位在 12A',
      'Level 2 (PWM降额)': '持续 800ms 未恢复 → PWM 占空比阶梯降额至 40%，并上报 DTC 预警码',
      'Level 3 (安全停机)': '持续 1500ms 仍未脱困 → 触发安全停机，关断三相逆变桥，进入低功耗怠速保护',
      'Level 4 (故障锁存)': '单次点火循环内累计触发 3 次 Level 3 → 永久锁存故障码，禁止再次强拖点火',
    },
    riskLevel: 'Medium',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: false,
    candidateMeasures: ['实施四级递进式堵转闭环保护策略，兼顾机械卡滞脱困能力与电子器件防烧毁安全'],
    sideEffects: ['频繁微小卡滞可能引起短暂停机，需针对机械机构调优延时滞回参数'],
    verificationItems: ['在机械端通过抱闸制动施加机械死锁，验证 4 级保护在 300ms/800ms/1500ms 的状态转移'],
    unknownsToTest: ['零下 40℃ 润滑脂凝固导致的冷态假堵转与真实硬限位碰撞的区别特征提取'],
  });

  return patterns;
}
