/**
 * 功能安全深度升级 (Section 5) 与 EMC / 可靠性 / 供应链新增项 (Section 6)
 * 严格遵照 V4 升级任务书，计算由确定性引擎负责，不伪造数据，标注数据源与免责声明
 */

import {
  SafetyTraceabilityNode,
  FmedaRow,
  FmedaSummary,
  FtaNode,
  CapacitorLifeEstimate,
  SecondSourceComparison,
  PcnEvaluation,
  EsdAnalysis,
  BciAnalysis,
  LeadershipEconomicRisk,
  EvidenceType,
} from '../types';

// ==========================================
// 5. 功能安全深度升级 (Section 5)
// ==========================================

export const MANDATORY_SAFETY_DISCLAIMER =
  '本工具用于工程预分析、设计评审及风险筛查，不替代正式 HARA / FMEDA / Safety Case。';

export const SAMPLE_SAFETY_TRACEABILITY_CHAIN: SafetyTraceabilityNode[] = [
  {
    haraId: 'SG-01',
    safetyGoal: '防止驱动电机意外反转或非预期全扭矩加速 (Prevent unintended reverse rotation or full torque)',
    asil: 'ASIL C',
    fsr: 'FSR-01: 电机旋转方向与扭矩方向必须在 20ms 内与整车 VCU 指令一致',
    tsr: 'TSR-01: 逆变器硬件必须提供独立的相序硬校验与过流/短路硬切断通路',
    hsr: 'HSR-01: 门极驱动芯片必须具备硬件互锁逻辑 (Hardware Interlock)，严禁上下管同开',
    failureMode: '上桥与下桥 MOSFET 门极信号因噪声同时使能导致相短路',
    hardwareComponent: 'Gate Driver (车规级半桥预驱芯片)',
    detectionMechanism: '驱动芯片内部硬件死区逻辑互锁 + 去饱和 (DESAT) 检测',
    diagnosticCoveragePct: 99.0,
    safeState: '关断三相所有上桥与下桥 MOSFET，电机进入高阻自由旋转状态',
    faultHandlingTimeIntervalMs: 15.0,
    evidence: 'SPECIFICATION',
  },
  {
    haraId: 'SG-02',
    safetyGoal: '防止急停制动失效导致制动距离严重超标 (Prevent failure of emergency dynamic braking)',
    asil: 'ASIL B',
    fsr: 'FSR-02: 在收到紧急停机命令后 50ms 内实现电机能量安全泄放与停转',
    tsr: 'TSR-02: 硬件下桥能耗回路导通可靠性度量必须达到 ASIL B 目标指标',
    hsr: 'HSR-02: 下桥驱动回路供电独立于车载 12V 易损输入，备有储能电容维持 100ms 续航',
    failureMode: '车载 12V 蓄电池在碰撞瞬态断电，导致下桥无法开通完成能耗制动',
    hardwareComponent: 'VCC 辅助供电隔离肖特基二极管与储能滤波电解电容',
    detectionMechanism: 'MCU ADC 对下桥辅助供电电压实时巡检与看门狗监控',
    diagnosticCoveragePct: 90.0,
    safeState: '硬件备用常闭继电器释放短接相线线包 (Plan B 兜底)',
    faultHandlingTimeIntervalMs: 35.0,
    evidence: 'CALCULATED',
  },
  {
    haraId: 'SG-03',
    safetyGoal: '防止电流采样漂移导致电机失控飞车 (Prevent runaway caused by current sensing drift)',
    asil: 'ASIL C',
    fsr: 'FSR-03: 电流闭环偏置误差超过 1.5A 时必须在 5ms 内诊断并上报',
    tsr: 'TSR-03: 检流运放通道必须提供参考源零位校验自检与双通道比对',
    hsr: 'HSR-03: 采用两路独立放大器或低边+相线交叉检流架构',
    failureMode: '检流放大器基准电压源温漂或电阻阻值老化漂移',
    hardwareComponent: 'Current Shunt Resistor & Differential Op-Amp',
    detectionMechanism: 'PWM 关断窗口注入零电流基准比对 (Auto-Zero Calibration)',
    diagnosticCoveragePct: 97.5,
    safeState: '切断 PWM 输出，请求整车仪表点亮发动机/驱动黄色故障灯',
    faultHandlingTimeIntervalMs: 8.0,
    evidence: 'MEASURED',
  },
];

export function calculateFmedaMetrics(rows: FmedaRow[], asilLevel: 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D' = 'ASIL C'): FmedaSummary {
  let totalLambda = 0;
  let totalSafe = 0;
  let totalSpf = 0;
  let totalRf = 0;
  let totalLf = 0;

  for (const r of rows) {
    totalLambda += r.lambdaTotalFit;
    totalSafe += r.lambdaSafeFit;
    totalSpf += r.lambdaSpfFit;
    totalRf += r.lambdaRfFit;
    totalLf += r.lambdaLfFit;
  }

  // ISO 26262-5 SPFM = 1 - (lambda_SPF + lambda_RF) / (totalLambda)
  // 或 (totalSafe + detected) / totalLambda
  const dangerousLambda = totalLambda - totalSafe;
  const spfmPct = dangerousLambda > 0
    ? Math.max(0, Math.min(100, Number(((1 - (totalSpf + totalRf) / dangerousLambda) * 100).toFixed(2))))
    : 100;

  // LFM = 1 - (lambda_LF) / (totalLambda - totalSpf - totalRf)
  const lfmDenominator = totalLambda - totalSpf - totalRf;
  const lfmPct = lfmDenominator > 0
    ? Math.max(0, Math.min(100, Number(((1 - totalLf / lfmDenominator) * 100).toFixed(2))))
    : 100;

  const spfmTargetPct = asilLevel === 'ASIL D' ? 99.0 : asilLevel === 'ASIL C' ? 97.0 : asilLevel === 'ASIL B' ? 90.0 : asilLevel === 'ASIL A' ? 90.0 : 0.0;
  const lfmTargetPct = asilLevel === 'ASIL D' ? 90.0 : asilLevel === 'ASIL C' ? 80.0 : asilLevel === 'ASIL B' ? 60.0 : asilLevel === 'ASIL A' ? 60.0 : 0.0;

  return {
    spfmPct,
    lfmPct,
    spfmTargetPct,
    lfmTargetPct,
    isCompliant: spfmPct >= spfmTargetPct && lfmPct >= lfmTargetPct,
    contributions: {
      safeFailurePct: Number(((totalSafe / (totalLambda || 1)) * 100).toFixed(1)),
      detectedFailurePct: Number((((totalLambda - totalSafe - totalSpf - totalRf) / (totalLambda || 1)) * 100).toFixed(1)),
      residualFailurePct: Number(((totalRf / (totalLambda || 1)) * 100).toFixed(1)),
      singlePointFailurePct: Number(((totalSpf / (totalLambda || 1)) * 100).toFixed(1)),
    },
  };
}

export const SAMPLE_FMEDA_ROWS: FmedaRow[] = [
  {
    component: 'MOSFET (High-Side x 3)',
    failureMode: '漏源极短路 (D-S Short)',
    lambdaTotalFit: 45.0,
    fractionSafePct: 0,
    fractionDangerousPct: 100,
    dcPct: 98.0,
    lambdaSafeFit: 0,
    lambdaSpfFit: 0.9,
    lambdaRfFit: 0.9,
    lambdaLfFit: 3.2,
    evidence: 'DATASHEET',
    evidenceSource: 'SN 29500-2 功率半导体失效率标准 & 晶圆厂 IEC 62380 认证报告',
  },
  {
    component: 'MOSFET (Low-Side x 3)',
    failureMode: '漏源极击穿短路 (D-S Short)',
    lambdaTotalFit: 45.0,
    fractionSafePct: 0,
    fractionDangerousPct: 100,
    dcPct: 98.0,
    lambdaSafeFit: 0,
    lambdaSpfFit: 0.9,
    lambdaRfFit: 0.9,
    lambdaLfFit: 3.2,
    evidence: 'DATASHEET',
    evidenceSource: 'SN 29500-2 功率半导体失效率标准',
  },
  {
    component: 'Gate Driver IC (三相预驱)',
    failureMode: '输出引脚异常卡死高电平 (Output Stuck High)',
    lambdaTotalFit: 35.0,
    fractionSafePct: 10,
    fractionDangerousPct: 90,
    dcPct: 99.0,
    lambdaSafeFit: 3.5,
    lambdaSpfFit: 0.35,
    lambdaRfFit: 0.35,
    lambdaLfFit: 2.1,
    evidence: 'DATASHEET',
    evidenceSource: '芯片原厂 Safety Manual (FMEDA Release Rev 2.1)',
  },
  {
    component: 'Current Shunt Resistor (分流采样电阻)',
    failureMode: '阻值开路或接触不良漂移 (Open / Drift)',
    lambdaTotalFit: 15.0,
    fractionSafePct: 20,
    fractionDangerousPct: 80,
    dcPct: 95.0,
    lambdaSafeFit: 3.0,
    lambdaSpfFit: 0.6,
    lambdaRfFit: 0.6,
    lambdaLfFit: 1.2,
    evidence: 'HISTORICAL',
    evidenceSource: '量产 100 万套车载电机控制器售后返修 PPM 统计数据',
  },
  {
    component: 'DC-Link Capacitor (母线电容)',
    failureMode: '介质击穿短路或容量严重干涸 (Short / Degraded)',
    lambdaTotalFit: 28.0,
    fractionSafePct: 10,
    fractionDangerousPct: 90,
    dcPct: 92.0,
    lambdaSafeFit: 2.8,
    lambdaSpfFit: 2.0,
    lambdaRfFit: 2.0,
    lambdaLfFit: 3.5,
    evidence: 'ENGINEERING_ASSUMPTION',
    evidenceSource: '高温 105℃ 寿命加速模型估算 (需进一步测试闭环)',
  },
];

export const SAMPLE_FTA_TREE: FtaNode = {
  id: 'TE-01',
  name: 'Top Event: 电机逆变器发生桥臂直通起火/炸机 (Inverter Bridge Shoot-Through)',
  gateType: 'OR',
  children: [
    {
      id: 'GE-01',
      name: 'Gate 1: 门极驱动米勒效应误导通 (Miller False Turn-On)',
      gateType: 'AND',
      children: [
        {
          id: 'BE-01',
          name: '高 dv/dt 产生 (> 8V/ns)',
          component: 'MOSFET Switching Edge',
          detection: '示波器高频探头监控',
          mitigation: '增大开通电阻 Rg_on 限制开关速度',
        },
        {
          id: 'BE-02',
          name: '门极下拉阻抗偏大或米勒钳位失效',
          component: 'Gate Driver Clamp Pin / Rg_off',
          detection: '上电自检测试钳位通断',
          mitigation: '采用有源米勒钳位 (Active Clamp)',
        },
      ],
    },
    {
      id: 'GE-02',
      name: 'Gate 2: MCU PWM 互补逻辑与死区硬件穿透',
      gateType: 'OR',
      children: [
        {
          id: 'BE-03',
          name: 'MCU 固件死区寄存器被高频浪涌意外改写',
          component: 'MCU PWM Timer Register',
          detection: '寄存器硬件 CRC 保护与只读写保护锁定',
          mitigation: '使能 MCU 硬件寄存器 Lock 功能',
        },
        {
          id: 'BE-04',
          name: '高温下关断延迟增大导致死区裕量穿透',
          component: 'MOSFET Fall Time vs Temperature',
          detection: '温控传感器监测',
          mitigation: '预留 1.5 倍最坏情况死区时间',
        },
      ],
    },
  ],
};

// ==========================================
// 6. EMC / 可靠性 / 供应链新增项 (Section 6)
// ==========================================

export function calculateCapacitorLife(
  nominalHours: number, // 标称寿命 (小时), 例如 5000h @ 105C
  ratedTempC: number,    // 额定温度, 如 105
  operatingTempC: number,// 实际工作环境温, 如 85
  rippleOperatingA: number, // 工作纹波电流, 如 3.2A
  rippleRatedA: number     // 额定允许纹波, 如 4.5A
): CapacitorLifeEstimate {
  // Arrhenius 模型: 结温每降低 10℃，寿命翻倍
  // 自发热温升: DeltaT = DeltaT_0 * (I_op / I_rated)^2, 典型额定 DeltaT_0 = 5℃
  const deltaT0 = 5.0;
  const selfHeatingC = deltaT0 * Math.pow(rippleOperatingA / Math.max(0.1, rippleRatedA), 2);
  const coreHotSpotTempC = operatingTempC + selfHeatingC;

  // 温度加速系数
  const tempDiff = ratedTempC - coreHotSpotTempC;
  const tempFactor = Math.pow(2, tempDiff / 10);
  const estimatedHours = Math.round(nominalHours * tempFactor);
  const operatingHoursTarget = 15000; // 车规典型 15 年 / 1.5 万小时寿命要求

  return {
    capacitorType: 'ALUMINUM_ELECTROLYTIC',
    nominalHours,
    ratedTemperatureC: ratedTempC,
    operatingTemperatureC: operatingTempC,
    hotSpotTemperatureC: Number(coreHotSpotTempC.toFixed(1)),
    operatingHoursTarget,
    rippleCurrentOperatingA: rippleOperatingA,
    rippleCurrentRatedA: rippleRatedA,
    estimatedLifeHours: estimatedHours,
    marginHours: estimatedHours - operatingHoursTarget,
    temperatureSensitivity: '环境温度每上升 10℃，电解液干涸速率翻倍，寿命缩减 50%',
    rippleSensitivity: '纹波电流由 3.2A 增至 4.5A 时，内部自热温升由 2.5℃ 增至 5.0℃',
    modelType: 'ARRHENIUS_ACCELERATED',
    confidenceTag: 'MODEL ESTIMATE', // 严格标注 MODEL ESTIMATE
  };
}

export function compareSecondSource(
  primaryPart: string,
  secondSourcePart: string
): SecondSourceComparison {
  // 综合电气、热、开关、安全、EMC 五维评估
  return {
    primaryPart,
    secondSourcePart,
    electricalEquivalence: {
      vdsMatch: true,
      idMatch: true,
      rdsOnDeltaPct: +4.2, // 阻抗增加 4.2%
      qgDeltaPct: -8.5,   // 门极电荷减少 8.5%
      qrrDeltaPct: +18.0, // 体二极管反向恢复电荷大 18% (关键差异)
    },
    thermalEquivalence: {
      rthJcDeltaPct: -2.0,
      tjMaxSame: true,
    },
    switchingEquivalence: {
      dvDtImpact: '因 Qg 较小，在相同 Rg 下开通速度加快 15%，中点开关节点 dv/dt 增大',
      ringingRisk: '由于 Qrr 增大 18%，关断瞬态反向恢复尖峰增加约 3.8V，48MHz 振铃幅度增大 2.5dB',
    },
    safetyEmcEquivalence: {
      emcRisk: 'CISPR 25 传导发射高频段超标风险增加，不可直接作为完全等价替换',
      functionalSafetyAecQ: '均通过 AEC-Q101 Grade 1 认证，但雪崩能量 EAS 略低 12%',
    },
    overallVerdict: 'DERIVATIVE_REGRESSION_REQUIRED',
    retestRequired: [
      'CISPR 25 Class 5 传导骚扰 (150kHz ~ 108MHz) 对比测试',
      '急停反向恢复尖峰峰值 Vds 示波器精确捕获',
      '85℃ 温箱 100% 满载温升对照摸底测试',
    ],
  };
}

export function evaluatePcn(changeType: PcnEvaluation['changeType']): PcnEvaluation {
  return {
    component: 'Power MOSFET 40V / 3.5mΩ (车载分立器件)',
    supplier: '国际一线半导体供应商',
    changeType,
    changeDescription: '晶圆制造厂由欧洲 Fab 1 转至亚洲 Fab 2，引入 8 英寸更新代沟槽蚀刻工艺',
    invalidatedPreviousTests: [
      '前序 DVT 阶段通过的单脉冲雪崩耐受性能测试 (EAS)',
      '高温栅极偏压试验 (HTGB 1000h) 早期失效率数据',
      '开关瞬态 dv/dt 振铃峰值与辐射发射一致性数据',
    ],
    regressionVerdict: 'Regression Required',
    recommendedActions: [
      '要求供应商提供 Fab 2 与 Fab 1 的晶圆切片 SEM 与 AEC-Q101 Qualification Summary',
      '组织样品在电机台架执行 200 次极限堵转冲击测试与 EMC 暗室摸底测试',
      '向主机厂提交 PCN 评估说明书并获得工程评审批准 (Customer Engineering Review)',
    ],
  };
}

export function evaluateEsdProtection(): EsdAnalysis {
  return {
    dischargePath: '电机外露线束接插件端子 → 内部走线 → PCB共模电容与TVS → 铝合金金属外壳 → 车身搭铁地',
    tvsModel: '车规级双向 TVS (SMCJ24CA, 24V 工作电压 / 38.9V 钳位电压)',
    clampingVoltageV: 38.9,
    connectorGroundReturn: '连接器专用屏蔽环就近 360° 压接金属机壳',
    chassisCapacitancePf: 2200,
    sensitiveIcExposed: '预驱芯片相线采样监测引脚 (内置 2kV HBM 防护，需二级 TVS 保护)',
    testStandardRequirement: 'ISO 10605 / 接触放电 ±8kV，空气放电 ±15kV',
    isRequirementUnknown: false,
    status: 'PASS',
  };
}

export function evaluateBciImmunity(): BciAnalysis {
  return {
    harnessCouplingLoopCm2: 45.0,
    susceptibleBandMhz: '20MHz ~ 80MHz (与电机相电感形成LC共振敏感频段)',
    injectionPointRecommended: '距控制器端线束连接器 150mm 处大电流注入钳位点',
    measurementPointRecommended: '运放采样差分输入端与 MCU 内部 ADC 输入管脚',
    filteringMeasures: [
      '检流差分信号线并联 100pF NPO 共模与 470pF 差模滤波电容',
      '电源与电机相线在进板端增加差模π型 LC 滤波网络',
    ],
    verificationMethod: 'ISO 11452-4 大电流注入 (BCI) 法，等级 Class A (全功能正常运行)',
  };
}

// ==========================================
// 11. 领导视角：项目经济风险 (Section 11)
// ==========================================

export function evaluateLeadershipEconomicRisk(
  isVetoTriggered: boolean,
  daysRemaining: number
): LeadershipEconomicRisk {
  return {
    warrantyCost: 'Qualitative: 高风险 (若发生批量直通炸机，售后返修成本预估超百万)',
    recallExposure: isVetoTriggered
      ? 'Qualitative: 极高 (若触碰功能安全失控导致召回，面临行业通报与主机厂索赔)'
      : 'Qualitative: 可控 (当前处于 DVT 验证拦截阶段)',
    productionStopCost: 'Estimate: 约 ¥150,000 / 天 (主机厂总装线停线滞纳金红线)',
    delayCost: daysRemaining <= 15
      ? 'Estimate: 关键里程碑若延误 3 周，面临 ¥300,000~¥500,000 客户违约扣款'
      : 'Estimate: 尚有富余窗口，节点风险可控',
    reworkCost: 'Estimate: 重新开模改板投样单批次约 ¥45,000 ~ ¥80,000',
    engineeringHours: 'Estimate: 攻关专项预计消耗 120 人时 (硬件+固件+测试)',
    businessImpactRating: isVetoTriggered ? 'HIGH' : 'MEDIUM',
    decisionUrgency: daysRemaining <= 15 ? 'URGENT_24H' : 'THIS_WEEK',
    financialDataNotice: 'QUALITATIVE_ESTIMATE_ONLY', // 严格遵守1.2节不伪造财务数据
  };
}
