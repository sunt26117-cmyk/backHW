import { NEW_CROSS_DOMAIN_CASE_1, NEW_CROSS_DOMAIN_CASE_2 } from './test_user_cross_domain_cases';
import { runExpertAnalysis } from '../src/data/expertEngine';
import { auditAiResult } from '../src/utils/aiResultAuditor';
import { assessInputIntegrity } from '../src/utils/inputIntegrityEngine';
import { buildDualTimelinePlan } from '../src/utils/dualTimelineEngine';
import { resolveEngineeringDomain, resolveEngineeringDomains } from '../src/utils/scenarioDomainEngine';
import { CopilotAnalysisResult } from '../src/types';

// =========================================================================
// AI 生成的答案 1：针对 Case 1 (48V e-Turbo 功率-瞬态-热-模拟采样跨域)
// =========================================================================
export const AI_ANSWER_CASE_1: any = {
  coreConclusion: {
    problemSummary: '在 ISO 21780 48V 动态过压脉冲 (68V, 200ms) 下，TVS 钳位残压 58V 叠加开关寄生电感尖峰致下桥 MOSFET Vds 达 63.4V 发生重复雪崩击穿 (突破 60V 标称耐压)；同时 90A 堵转时 0.5mΩ 锰铜分流器升温至 145℃ 产生 45μV 塞贝克热电势，叠加高共模 dv/dt 致相电流采样虚高 +6.8%，误触发 ASIL B 级过流停机。',
    recommendedMeasure: '采纳 Option B 硬件原位微调 + 算法热电补偿双轨策略：T+24h 关断电阻由 3.3Ω 增至 6.8Ω 并贴片并联 RC 缓冲吸收器 (1nF/100V + 3.3Ω/2W) 将 Vds 尖峰压降至 54.2V (<60V 耐压上限)，同时 FOC 固件加载分流器温度查表补偿并增加 30μs 动态消隐窗口 (0天PCB改版保住 14 天 DV 节点)；下一改版完成 80V 优化器件与对称 Kelvin 焊盘换版。',
    reasonSummary: '若直接换装 80V MOS 将因 Rds(on) 增大 35% 导致结温超标且 BOM 超标违背客户协议；单纯软件屏蔽过流则在真实短路时违反 ASIL B 保护安全法规。Option B 满足 14 天节点并彻底消除雪崩与误停机。',
  },
  decisionFrame: {
    decisionQuestion: '在距 ISO 21780 DV 签发仅剩 14 天窗口内，能否通过原位 RC 吸收与软件温漂补偿在不改版前提下闭环通过？',
    currentDecisionGate: 'ISO 21780 Overvoltage & Thermal Sign-off (DV 阶段)',
    decisionWindow: '剩余 14 天',
    bestNextAction: '在发动机舱 105℃ 台架复测调整关断电阻与贴装 RC Snubber 后的下桥 Vds 尖峰波形，确认是否压降至 55V 降额线以下。',
    minimumEvidenceToProceed: [
      '示波器高带宽差分探头实测 90A 极限堵转下 Vds 尖峰绝对值 <= 55V (耐压裕量 >= 5V)',
      '发动机舱 105℃ 满载台架连续运行 2 小时相电流采样误差收敛至 <= ±1.5% 且无异常脱扣',
    ],
    unknownsBlockingDecision: [
      '因缺少实测 ambientTempC 与 tjLimitC，当前 177.4℃ 稳态结温基于预计算推演，需热电偶实测确认',
      '锰铜分流器铜锰焊接界面局部温度梯度实测数据待热成像确认',
    ],
    reversalCriteria: [
      '若加贴 RC 吸收网络后吸收电阻在 200ms 脉冲下表面温度实测超过 140℃',
      '若 90A 堵转下 MOSFET 结温实测突破 150℃ 车规降额红线',
    ],
  },
  multiDomainAnalysis: {
    primaryDomain: 'COMPONENT',
    relatedDomains: ['POWER_TRANSIENT', 'THERMAL', 'SAFETY'],
    domainAssessments: [
      {
        domain: 'COMPONENT',
        role: 'PRIMARY',
        evidenceLevel: 'HIGH',
        knownFacts: ['vdsRatingV=60V', 'vdsSpikeV=63.4V', 'junctionTempC=145℃', 'currentPeakA=90A'],
        evidenceGaps: ['缺少实测 Rds(on) 高温实际曲线与雪崩单脉冲耐受能量 Eas'],
        minimumValidation: '90A 堵转下单板示波器 Vds 尖峰抓波与重复雪崩耐量核验',
        domainConclusion: '60V 耐压降额严重击穿，必须通过吸收网络与驱动降速压降至 55V 以下',
      },
      {
        domain: 'POWER_TRANSIENT',
        role: 'RELATED',
        evidenceLevel: 'MEDIUM_INFERRED',
        knownFacts: ['pulseVoltageV=68V', 'pulseDurationUs=200000μs', 'busVoltagePeakV=58V'],
        evidenceGaps: ['ECU内部敏感电源轨瞬态跌落与共模地弹跳'],
        minimumValidation: 'ISO 21780 脉冲发生器 + 双通道差分探头同步触发记录',
        domainConclusion: 'TVS 钳位残压 58V 合规，但与 60V MOS 耐压裕量仅 2V，需开关节点协同吸收',
      },
      {
        domain: 'THERMAL',
        role: 'RELATED',
        evidenceLevel: 'MEDIUM_INFERRED',
        knownFacts: ['junctionTempC=145℃', 'currentPeakA=90A'],
        evidenceGaps: ['缺少环境温度 (ambientTempC) 与 Tj允许上限 (tjLimitC) 实测参数'],
        minimumValidation: '密闭压铸铝壳连续堵转红外热成像与分流器温升热平衡实测',
        domainConclusion: '推演稳态结温 177.4℃ 击穿 150℃ 降额红线，需动态电流降额配合',
      },
      {
        domain: 'SAFETY',
        role: 'RELATED',
        evidenceLevel: 'HIGH',
        knownFacts: ['currentSenseErrorPct=6.8%', 'seebeckVoltageUv=45μV'],
        evidenceGaps: ['硬件过流比较器硬件消隐时钟常数'],
        minimumValidation: '注入真实短路电流验证 FTTI 故障安全响应时效',
        domainConclusion: '相电流采样虚高导致误停机，必须通过算法补偿与动态消隐隔离热电势',
      },
    ],
    crossDomainLinks: [
      {
        fromDomain: 'COMPONENT',
        toDomain: 'POWER_TRANSIENT',
        mechanism: 'MOSFET 耐压 60V 无法承受 TVS 钳位 58V 叠加的寄生尖峰，导致重复雪崩击穿',
        evidenceBasis: 'MEASURED',
        impact: '存在击穿短路炸管风险，严重阻断 DV 认证',
      },
      {
        fromDomain: 'THERMAL',
        toDomain: 'SAFETY',
        mechanism: '分流器 145℃ 高温产生 45μV 塞贝克热电势，导致 AFE 采样失真突破 ASIL B 门限',
        evidenceBasis: 'MEASURED',
        impact: '误切断 PWM 导致增压器失速降扭',
      },
    ],
    crossDomainVetoes: [
      {
        condition: 'MOSFET 瞬态 Vds 峰值 >= 60V (击穿器件标称耐压上限) 或稳态结温 Tj >= 150℃',
        blocks: ['DV_RELEASE'],
        rationale: '严重击穿汽车半导体 AEC-Q101 物理极限，存在着火与下电风险。',
      },
    ],
  },
  riskRatings: {
    overallRisk: 'High',
    overallRiskScore: 84,
    technicalRisk: 'High',
    qualityRisk: 'High',
    scheduleRisk: 'Medium-High',
    costRisk: 'Medium',
    reliabilityRisk: 'High',
    functionalSafetyRisk: 'High',
  },
  knownFacts: [
    '母线标称电压 48V，ISO 21780 脉冲注入峰值 68V/200ms，TVS 钳位残压 58V',
    '下桥 MOSFET 标称耐压 60V，实测开关尖峰达到 63.4V 发生雪崩',
    '相电流峰值 90A，分流器阻值 0.5mΩ，焊接端实测塞贝克热电势 45μV',
    '相电流采样误差达 +6.8% (规范要求 <= ±1.5%)，误触发过流停机',
    '急停母线倒灌理论泵升经预核算为 297.6V，稳态结温推演约为 177.4℃ (击穿 150℃ 降额线)',
  ],
  assumptions: [
    '因缺少实测 ambientTempC 与 tjLimitC，此处基于 105℃ 机舱环温与 150℃ 车规降额标准推导，属于待台架闭环确认项',
    '假设当前压铸壳体导热垫 TIM 接触热阻为 0.8 ℃/W，将在台架热阻测试中校准',
  ],
  unknowns: [
    '缺少实测环境温度 (ambientTempC)',
    '缺少实测 Tj 允许上限 (tjLimitC)',
    '缺少 MOSFET 实际雪崩单脉冲吸收能量极限 Eas',
    '缺少 FOC 控制器过流比较器硬件滤波电容实际容值公差',
  ],
  physicalMechanism: {
    rootCauseAnalysis: '1. 电气耐压击穿机理：48V 抛负载脉冲下 TVS 动作残压 58V 仅距 60V MOS 2V 裕量，下桥关断 di/dt (~4.5A/ns) 在 PCB 母线寄生电感 L_loop (~1.2nH) 上感应出 ΔV = L * (di/dt) = 5.4V 尖峰，叠后 Vds 达 63.4V 击穿雪崩；2. 采样虚高与误停机机理：90A 大电流通过 0.5mΩ 锰铜电阻产生 P = I^2 * R = 4.05W 集中热源，电阻两端铜焊盘因散热不对称产生 18℃ 温差，激发微伏级塞贝克热电势 (45μV)，在 45mV 采样微弱信号上产生 ~10% 初始偏置，叠加高频 dv/dt 位移电流，致相采样突跃 +6.8% 突破 FOC 阈值误报 ASIL B 停机。',
    keyPhysicalFactors: [
      { factor: '寄生电感瞬态过冲', description: 'PCB 回路寄生电感在 90A 高速关断下感应出 5.4V 附加尖峰，突破 60V 耐压上限' },
      { factor: '塞贝克温差热电势', description: '分流器两端焊盘 18℃ 温差产生 45μV 热电势，对 45mV 满量程采样造成叠加失真' },
      { factor: '稳态热积累超标', description: '推演稳态结温达 177.4℃，击穿车规 150℃ 降额红线，形成热阻恶性循环' },
    ],
  },
  dfmeaView: {
    failureMode: '下桥 MOSFET 雪崩击穿漏电与相电流采样失真误报过流停机',
    failureCause: '60V MOS 耐压裕量不足叠加关断尖峰；分流器不对称温差引发塞贝克效应',
    localEffect: '驱动器偶发 DESAT 报警，MOSFET 瞬态过热，增压器急加速突发断电',
    systemEffect: '发动机进气增压压力瞬间跌落，发动机控制单元报动力受限故障码',
    vehicleEffect: '车辆急加速超车时突发失速顿挫，无法通过 ISO 21780 认证',
    severity: 8,
    occurrence: 6,
    detection: 4,
    safetyImpact: true,
    regulatoryImpact: false,
    massProductionImpact: true,
  },
  candidateActions: [
    {
      id: 'Option A',
      category: 'conservative',
      categoryLabel: '硬件彻底改版',
      name: '全板改版升级 80V 车规 MOSFET + 换用对称四引线低热电势分流器',
      description: '重新投板制作 PCB，将 6 MOSFET 升级为 80V 耐压型号，并将采样电阻更换为热电势 < 1μV/℃ 的对称四端子锰镍合金分流器。',
      expectedBenefit: '耐压裕量增加至 22V (58V/80V=72.5% 完美符合降额规范)，彻底消除雪崩击穿；采样误差压减至 ±0.5% 以内。',
      scores: { T: 95, S: 40, C: 45, Q: 95, L: 95, total: 72.5 },
      veto: { rejection_veto: false },
      riskDelta: '极高风险 (雪崩击穿/误停机) ➔ 极低残余风险 (满足量产全部指标)',
      residualRisk: 'Low',
      residualRiskDetail: '硬件彻底根除物理根因，但投板制板打样贴片需 22~25 天，将直接导致当前 14 天 DV 试验节点违约。',
      sideEffects: 'BOM 成本增加 $1.20 (超出客户允许的 +$0.40 限额)，且必须重新走正式 VDA ECR 变更审批。',
      verificationCost: '改版打样费 1.5 万元 + 2 周实验室台架机时',
      timeCost: '22~25 天',
      failureConsequence: '若坚持走 Option A，将导致整车冬季试验延误 1 个月以上',
      preconditions: '获得客户与 PM 批准工期顺延 3 周与 BOM 成本放宽特批',
      verificationMethod: '新板台架 ISO 21780 脉冲注入抓波 + 全温 105℃ 满载堵转耐久',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: true, note: '80V MOS 需重新核算高温 Rds(on) 损耗' },
        { rule: '【EMC_RE_CE ➔ THERMAL】加装吸收网络热量', addressed: true, note: '新板优化寄生回路电感，无需大功率 Snubber' },
      ],
      planB: '若打样延期，启用 Option B 临时过渡。',
      decisionFit: '技术最完美，但工期与成本完全不适配当前 14 天交付节点。',
      fastestValidation: '打样回板后 3 天内拿到波形',
      latestDecisionPoint: '必须在第 2 天决定是否投板',
      rejectionReason: '工期 25 天远超剩余 14 天窗口，且 BOM 超标触碰商业否决线。',
    },
    {
      id: 'Option B',
      category: 'balanced',
      categoryLabel: '双轨协同推荐',
      name: '原位 RC Snubber + 门极关断降速 + 软件塞贝克热电查表补偿 (推荐采纳)',
      description: '【硬件零改动工期】：原位调大关断电阻至 6.8Ω，并在下桥 Drain-Source 并联贴装高频 RC 缓冲器 (1nF/100V + 3.3Ω/2W) 将尖峰吸收至 54.2V；【算法协同】：在 FOC 控制器增加分流器温升热电势软件动态查表补偿，并设置 30μs 动态消隐窗口。',
      expectedBenefit: '在 0 天 PCB 改版工期前提下，消除 63.4V 尖峰将其降至 54.2V (<60V 耐压安全区)；相电流采样误差压入 ±1.2% 以内，彻底消除误停机，保住 14 天 DV 准入！',
      scores: { T: 90, S: 95, C: 92, Q: 88, L: 85, total: 89.9 },
      veto: { rejection_veto: false },
      riskDelta: '极高风险 (雪崩/停机) ➔ 受控中低风险 (通过参数重构满足 DV 门禁)',
      residualRisk: 'Medium',
      residualRiskDetail: 'RC 缓冲吸收器单板引入 1.2W 损耗，需确保吸收电阻耐温及焊锡可靠性。',
      sideEffects: '开关关断时间轻微延长 12ns，关断损耗增加约 3.5%，结温轻微上升 2.2℃。',
      verificationCost: '台架手工飞线贴片改装 2 小时，测试验证费用低',
      timeCost: '1~2 天',
      failureConsequence: '若吸收效果不达标，立即启动全下桥制动保护',
      preconditions: '手工改装样件通过 105℃ 机舱高温振动与热循环摸底',
      verificationMethod: '示波器单次触发抓取 90A 关断下 Vds 尖峰绝对值 <= 55V；FOC 采样在 145℃ 满载下无脱扣',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: true, note: '已核算增加 3.5% 损耗后结温裕量，配合 115℃ 动态降额策略' },
        { rule: '【EMC_RE_CE ➔ THERMAL】加装吸收网络热量', addressed: true, note: '吸收电阻表面计算温升为 118℃ (<150℃ 额定限值)，安全受控' },
      ],
      planB: '若温升偏高，适当降低 PWM 斩波频率至 16kHz 减少开关损耗。',
      decisionFit: '0天PCB工期，成本增加仅 $0.15，最契合 AGILE_DELIVERY 交付风格与 14 天节点。',
      fastestValidation: '改件后 24 小时内即可拿到台架全温验证波形',
      latestDecisionPoint: '第 3 天完成全部闭环验证',
      rejectionReason: '',
    },
    {
      id: 'Option C',
      category: 'radical',
      categoryLabel: '违规放宽 (一票否决)',
      name: '仅在软件层放宽过流比较器门限至 130A 并屏蔽雪崩报警',
      description: '不改动任何硬件与吸收参数，直接在软件底层将相电流过流保护阈值由 100A 放宽至 130A，并延长故障消隐时间至 200μs。',
      expectedBenefit: '眼前消除过流误停机报错，表面上顺利跑完演示节拍。',
      scores: { T: 20, S: 98, C: 98, Q: 15, L: 10, total: 44.5 },
      veto: {
        rejection_veto: true,
        veto_type: 'SAFETY_GOAL_BREACH',
        veto_reason: '一票否决：该方案使 MOSFET 长期工作在 63.4V 重复雪崩击穿区，且在真实机械卡死或相对地短路时丧失 ASIL B 级硬件保护能力，极易引发起火与炸管，严重违反 ISO 26262 法规！',
      },
      riskDelta: '极高风险 ➔ 潜伏灾难性失效 (触发一票否决)',
      residualRisk: 'High',
      residualRiskDetail: 'MOSFET 硅片雪崩发热烧结短路，整车高压下电失效。',
      sideEffects: '破坏技术安全概念 (TSC) 与功能安全度量 (SPFM/LFM)。',
      verificationCost: '无',
      timeCost: '0 天',
      failureConsequence: '整车路试起火与质量索赔',
      preconditions: '无',
      verificationMethod: '不可接受',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: false, note: '直接击穿结温红线' },
      ],
      planB: '无',
      decisionFit: '不可接受',
      fastestValidation: '立即否决',
      latestDecisionPoint: '立即',
      rejectionReason: '触碰 ISO 26262 ASIL B 功能安全红线与器件绝对耐压上限。',
    },
  ],
  finalRecommendation: {
    recommendedOptionId: 'Option B',
    recommendedOptionName: '原位 RC Snubber + 门极关断降速 + 软件塞贝克热电查表补偿',
    recommendationGrade: 'Recommended',
    whyReason: [
      '彻底消除 63.4V 尖峰将其限制在 54.2V (<60V 耐压安全区)，彻底消除雪崩击穿隐患',
      '相电流采样误差由 +6.8% 收敛至 ±1.2% 以内，彻底消除误触发过流停机',
      '0天 PCB 改版工期，仅需原位飞线与电阻阻值微调，100% 契合当前剩余 14 天交付节点',
      '单件成本仅增加 $0.15，完全处于 +$0.40 成本预算约束以内',
    ],
    immediateSteps: [
      { step: 1, title: '关键实测波形补齐', action: '在 105℃ 台架实测下桥 Drain-Source 尖峰波形与分流器两端温差热成像数据', owner: 'HW', deadline: 'T+24h' },
      { step: 2, title: '手工改制与 RC 参数调校', action: '在 DV 样件焊装关断电阻 6.8Ω 与 RC 缓冲器 (1nF/100V + 3.3Ω/2W)', owner: 'HW', deadline: 'T+36h' },
      { step: 3, title: 'FOC 算法补丁刷写', action: '软件团队加载温度查表偏置补偿与 30μs 动态消隐滤波补丁', owner: 'SW', deadline: 'T+48h' },
      { step: 4, title: 'ISO 21780 极限脉冲全温复核', action: '在发动机舱 105℃ 环境下连续注入 68V/200ms 脉冲 10 次，验证无复位与无过流报错', owner: 'Test', deadline: 'T+4天' },
    ],
    preconditions: [
      '手工改制样件焊接必须符合 IPC-A-610 Class 3 车规工艺标准',
      '示波器实测关断延时增加不得超过 15ns，确保不影响高速 FOC 换相时序',
    ],
    unacceptableActions: [
      '严禁单方面关闭硬件过流保护或无限度调大比较器消隐时间',
      '严禁在未装配导热硅脂与压铸外壳工况下裸板跑 90A 持续堵转',
    ],
    stopConditions: [
      '若改制后在 105℃ 满载工况下 MOSFET 结温实测突破 150℃ 降额红线，立即停机',
      '若 RC 吸收电阻稳态表面温度突破 140℃，必须暂停试验并调整阻容参数',
    ],
    reEvaluationTriggers: [
      '客户主机厂修改 ISO 21780 抛负载持续时间要求 (如由 200ms 延长至 400ms)',
      '发动机舱最高允许环境温度规格由 105℃ 变更上调至 125℃',
    ],
    planB: '若 RC 吸收温升超标，降频至 16kHz PWM 斩波，并在 DV3 批次启动 Option A 投板改版。',
  },
  dualTimeline: {
    containmentPhase: {
      phaseTag: 'T_PLUS_24H_CONTAINMENT',
      timeWindow: 'T + 24h 应急临时遏制 (Containment)',
      title: '原位关断阻尼重构 + RC Snubber 贴片 + FOC 软件偏置查表补偿',
      objective: '在 0 天 PCB 改版工期前提下，将 Vds 尖峰压至 55V 以下并收敛相电流采样误差，确保 DV 试验正常推进',
      hardwareImpact: '仅替换 6 颗关断电阻贴片 (改 6.8Ω) 并跨接贴装 3 组 RC 吸收器，无需投板',
      responsibilityRole: '硬件主导实施，软件固件协同刷写',
      actions: [
        { step: '样件改装', detail: '改装 3 台 DV2 试验样件，贴焊关断电阻与 1nF+3.3Ω 吸收器', owner: 'HW Lead', duration: '4 小时', hardwareImpact: '原位元器件变更', deliverable: '改装样件 3 套' },
        { step: '尖峰抓波', detail: '高压差分探头实测 90A 堵转下 Vds 尖峰电压', owner: 'HW Engineer', duration: '6 小时', hardwareImpact: '无', deliverable: 'Vds 抓波报告 (确认 <=55V)' },
        { step: '固件热电补偿', detail: 'FOC 模块刷入分流器温度补偿表与 30μs 消隐时间', owner: 'SW Engineer', duration: '8 小时', hardwareImpact: '无', deliverable: '测试专用固件 v1.2.1' },
      ],
      verificationCriteria: 'ISO 21780 68V 脉冲注入下无 DESAT/OVP 告警，相电流采样误差 <= ±1.2%',
      exitCriteria: '连续 50 次抛负载脉冲测试 0 失效，DV 试验顺利准入',
    },
    permanentPhase: {
      phaseTag: 'NEXT_PHASE_PERMANENT',
      timeWindow: '下一版本永久纠正 / SOP 封样 (DV3/PV)',
      title: '优化 80V 低内阻 MOSFET 选型 + 对称 Kelvin 采样四端子走线重构',
      objective: '从源头将母线耐压裕量提升至 28% 以上，从物理走线上彻底消除铜锰热电势差',
      hardwareImpact: 'PCB 重新投板改版 (改版打样周期 20 天)，更新 BOM',
      responsibilityRole: '硬件架构师主导，采购/质量/结构协同会签',
      actions: [
        { step: 'BOM更新与选型', detail: '选定 AEC-Q101 Grade 1 80V 2.8mΩ 低内阻 MOSFET 与对角四端子分流器', owner: 'HW Specialist', duration: '5 天', hardwareImpact: '元器件变更', deliverable: '器件选型核算报告与 PPAP 文件' },
        { step: 'PCB Layout 重构', detail: '缩短 DC-Link 去耦电感回路至 <0.8nH，采用严格对称 Kelvin 走线', owner: 'Layout Engineer', duration: '7 天', hardwareImpact: 'PCB 改版', deliverable: 'Gerber Release' },
        { step: 'DV3 全项认证', detail: '在正式产线样件上完成全套 ISO 21780 与 -40℃~105℃ 极限环境耐久试验', owner: 'DV Test Lead', duration: '15 天', hardwareImpact: '模具与样板更新', deliverable: 'DV Sign-off 报告' },
      ],
      verificationCriteria: 'Vds 最大尖峰 <= 62V (<80V 的 78% 降额)，采样全温全寿命全误差 <= ±0.8%',
      exitCriteria: '通过主机厂审核并签署正式零件批准程序 (PPAP Level 3)',
    },
    strategicTradeoff: '当前面临 14 天严峻节点违约风险，采取 Option B 双轨并行策略：T+24h 依靠参数调优与算法补偿以 0 天工期抢占装车试验节点；下一版投板彻底根除物理根因，实现质量、交期与法规的黄金平衡。',
  },
  raciMatrix: [
    { role: '硬件负责人 (HW Lead)', r: '负责 RC 参数核算与样件改装', a: '签署硬件安全准入与尖峰波形核准', c: '协同软件标定消隐时限', i: '向 PM 汇报台架进展' },
    { role: '软件负责人 (SW Lead)', r: '实现分流器温度查表补偿算法与动态消隐', a: '核准固件发布与 FTTI 响应时效', c: '与硬件核对热电势转换系数', i: '向系统团队同步固件版本' },
    { role: '项目经理 (PM)', r: '协调发动机舱高温台架资源', a: '把控 14 天交付节点与客户沟通窗口', c: '评审 BOM 增量影响', i: '通报主机厂整车进度' },
    { role: '功能安全经理 (FSM)', r: '审查过流保护动态消隐时间对 ASIL B 诊断的影响', a: '批准临时应急方案安全符合性', c: '核算 SPFM/PMHF 指标', i: '向安全委员会备案' },
  ],
  engineeringDocs: {
    pmDecisionEmail: {
      subject: '【紧急决策直报】48V 电动增压器 ISO 21780 尖峰与采样偏置应急方案达成闭环',
      to: 'Project Management & Engineering Steering Committee',
      summary: '经团队推演核算，决定不进行 25 天周期的 PCB 改版，采纳 0 天工期的原位 RC Snubber 与软件塞贝克热电补偿方案，成功消除 63.4V 雪崩与过流误停机，确保 14 天后 DV 顺利签发。',
    },
    deviationPermit: {
      title: '48V eTurbo DV2 样件参数重构内部偏差特批放行单',
      deviationScope: '仅限于 DV2 阶段 10 台台架试验样件，加装 RC 吸收器并更新专用补丁固件。',
      expirationCondition: 'DV3 正式改版样品交付或 2026 年 12 月 30 日自然失效。',
    },
    meetingMinutes: {
      title: '48V 增压器高压抛负载与热电耦合跨专业联合评审纪要',
      decisions: '1. 硬件部立即改装 3 套验证样件；2. 软件部 24 小时内完成消隐算法刷写；3. 暂停 80V MOS 改版采购。',
    },
  },
};

// =========================================================================
// AI 生成的答案 2：针对 Case 2 (800V SiC 主驱与旋变解码高频共模干扰跨域)
// =========================================================================
export const AI_ANSWER_CASE_2: any = {
  coreConclusion: {
    problemSummary: '800V 高压母线、450A 大扭矩急加速工况下，SiC 功率模块超高 dv/dt (36V/ns) 通过电机定转子间 380pF 寄生杂散电容在机壳地流窜，在旋变 SIN/COS 差分信号上感应出 1.8Vpp 60MHz 衰减振铃共模噪声；致使旋变解码芯片 (RDC) 跟踪鉴相环瞬态失步，转子角度抖动达 5.2° (突破 ASIL D 3.8° 监控门限)，误触发 ASC 三相主动短路紧急制动，整车产生严重机械顿挫。',
    recommendedMeasure: '采纳 Option B 门极微调 + 高频共模扼流抑制 + RDC 锁相环自适应容错双轨策略：T+24h 关断电阻由 1.5Ω 微调至 2.2Ω (dv/dt 降至 28V/ns，结温微升 1.8℃ 仍在 125℃ 降额线内)，旋变信号线束加装纳米晶高频共模磁环 (60MHz 阻抗 > 450Ω) 并在 RDC 输入端优化差模 470pF/共模 100pF 滤波网络，软件微调失步容错窗口至 4.5ms (<5.0ms FTTI 刚性法规门限)；彻底消除 5.2° 虚假抖动并保证 ASIL D 合规。',
    reasonSummary: '若直接盲目加大门极电阻 Rg 则 SiC 开关损耗激增 45% 导致模块过热炸裂；若单纯放宽软件滤波时间则突破 5ms FTTI 法规红线触犯法律。Option B 在 0 天改版工期内兼顾热损耗、高频共模抑制与 ASIL D 绝对安全。',
  },
  decisionFrame: {
    decisionQuestion: '在距离整车冬季标定仅剩 10 天的极端倒计时下，能否通过线束共模扼流与滤波网络优化实现旋变角度抖动压降至 3.8° 以内？',
    currentDecisionGate: 'Vehicle Winter Calibration Sign-off (整车冬标节点)',
    decisionWindow: '剩余 10 天',
    bestNextAction: '在 800V 测功机台架实测加装纳米晶磁环与输入差模/共模 RC 滤波后的旋变 SIN/COS 差分眼图与 RDC 角度估算抖动。',
    minimumEvidenceToProceed: [
      '示波器差分抓波证实旋变 SIN/COS 线上 60MHz 振铃噪声由 1.8Vpp 压降至 <= 350mVpp',
      '450A 急踩电门急加速工况下，RDC 解码角度抖动峰值严格控制在 <= ±2.1° (远低于 3.8° 门限)',
      '实测旋变断线硬件注入试验，故障诊断与 ASC 响应时间为 4.4ms，100% 满足 <= 5.0ms FTTI',
    ],
    unknownsBlockingDecision: [
      '因缺少实测 emcPeakDb 与 testDistanceM，60MHz 辐射发射实际对整车天线敏感度影响待整车暗室复核',
      '电机壳体接地编织带在 -30℃ 极寒冰雪工况下的高频阻抗一致性待确认',
    ],
    reversalCriteria: [
      '若微调 Rg 后在连续急加速工况下 SiC 模块结温实测突破 150℃ 降额红线',
      '若软件滤波调整后旋变真实断线故障响应时间突破 5.0ms FTTI 法规上限',
    ],
  },
  multiDomainAnalysis: {
    primaryDomain: 'POWER',
    relatedDomains: ['EMC_RE_CE', 'SIGNAL', 'SAFETY'],
    domainAssessments: [
      {
        domain: 'POWER',
        role: 'PRIMARY',
        evidenceLevel: 'HIGH',
        knownFacts: ['busVoltageNominalV=800V', 'dvdtVns=36V/ns', 'currentPeakA=450A'],
        evidenceGaps: ['缺少负载突变正向过冲峰值 (powerOvershootPeakV) 与跌落最低值'],
        minimumValidation: '800V/450A 双脉冲测试实测开关损耗 Eon/Eoff 与关断 dv/dt',
        domainConclusion: '36V/ns 超高开关速度是共模电流位移激发的根本诱因，需微幅阻尼抑制',
      },
      {
        domain: 'EMC_RE_CE',
        role: 'RELATED',
        evidenceLevel: 'MEDIUM_INFERRED',
        knownFacts: ['strayCapacitancePf=380pF', 'commonModeNoiseVpp=1.8Vpp', 'noiseFrequencyMhz=60MHz'],
        evidenceGaps: ['缺少实测 EMC 辐射发射峰值 (emcPeakDb) 与限值 (emcLimitDb)'],
        minimumValidation: '整车高压线束共模电流钳实测 (60MHz 衰减振铃谱线分析)',
        domainConclusion: '380pF 寄生电容在高 dv/dt 下产生 i = C*dv/dt = 13.68A 瞬态共模电流，必须加装共模扼流',
      },
      {
        domain: 'SIGNAL',
        role: 'RELATED',
        evidenceLevel: 'HIGH',
        knownFacts: ['resolverAngleJitterDeg=5.2°', 'maxAllowedJitterDeg=3.8°'],
        evidenceGaps: ['缺少线束传输阻抗不连续点 TDR 实测'],
        minimumValidation: '旋变数字转换器 RDC 跟踪环误差电压差分抓波',
        domainConclusion: 'SIN/COS 正交模拟信号被 60MHz 振铃污染，需差模与共模双级低通滤波',
      },
      {
        domain: 'SAFETY',
        role: 'RELATED',
        evidenceLevel: 'HIGH',
        knownFacts: ['fttiLimitMs=5.0ms', 'actualTripTimeMs=4.2ms'],
        evidenceGaps: ['高低温角点下 ASIL D 锁相环脱扣概率分布'],
        minimumValidation: '旋变硬件断线与相间短路故障注入台架试验 (FTTI 验证)',
        domainConclusion: 'ASC 误触发严重影响整车行车安全，但安全机制 FTTI 必须严守 5.0ms',
      },
    ],
    crossDomainLinks: [
      {
        fromDomain: 'POWER',
        toDomain: 'EMC_RE_CE',
        mechanism: 'SiC 36V/ns 瞬变通过 380pF 寄生电容激发 13.68A 高频共模电流',
        evidenceBasis: 'MEASURED',
        impact: '共模电流通过外壳地回路耦合进入低压传感信号线',
      },
      {
        fromDomain: 'SIGNAL',
        toDomain: 'SAFETY',
        mechanism: '旋变信号受共模污染产生 5.2° 抖动，触发 ASIL D ASC 紧急制动',
        evidenceBasis: 'MEASURED',
        impact: '车辆高速行驶时突发剧烈顿挫，造成严重功能安全事故隐患',
      },
    ],
    crossDomainVetoes: [
      {
        condition: '安全机制端到端响应时间超过 5.0ms FTTI 上限，或在急踩电门工况误触发 ASC',
        blocks: ['DV_RELEASE'],
        rationale: '直接违反 ISO 26262 ASIL D 车辆防非预期减速安全目标。',
      },
    ],
  },
  riskRatings: {
    overallRisk: 'High',
    overallRiskScore: 88,
    technicalRisk: 'High',
    qualityRisk: 'High',
    scheduleRisk: 'High',
    costRisk: 'Low',
    reliabilityRisk: 'High',
    functionalSafetyRisk: 'High',
  },
  knownFacts: [
    '母线电压 800V，相电流 450A，SiC 开关 dv/dt 达到 36V/ns',
    '电机定转子寄生电容 380pF，在旋变差分线上感应出 1.8Vpp 60MHz 振铃共模噪声',
    'RDC 芯片解算角度抖动 5.2° (ASIL D 安全门限为 3.8°)',
    '控制器在 4.2ms 内紧急触发 ASC 主动短路，整车产生机械顿挫',
    'ISO 26262 规定 FTTI 容错时间间隔上限为 5.0ms，距冬标仅剩 10 天',
    '门极感应抬升理论核算为 16.2V，急停泵升理论核算为 297.6V',
  ],
  assumptions: [
    '因缺少实测 EMC 峰值与测试距离，基于台架 12mΩ 接地阻抗与 36V/ns 估算，属于待整车暗室闭环确认项',
    '假设 RDC 内部 Tracking Loop 鉴相带宽为 1.2kHz，可在固件寄存器中微调',
  ],
  unknowns: [
    '缺少实测 EMC 辐射发射 (emcPeakDb)',
    '缺少实测 EMC 限值 (emcLimitDb)',
    '缺少实测问题频点 (emcFrequencyMhz)',
    '缺少高低压线束在整车白车身通道内的实际空间物理间距',
  ],
  physicalMechanism: {
    rootCauseAnalysis: '1. 共模电流激发机理：800V SiC 开关以 36V/ns 超高速换相，高 dv/dt 通过电机绕组到转子/机壳的寄生电容 C_g (380pF) 产生高达 i_cm = C_g * (dv/dt) = 13.68A 的高频共模位移电流；2. 传导耦合机理：共模电流经电机壳体流回逆变器地时，由于 12mΩ 接地高频阻抗在 60MHz 谐振点产生地弹跳，通过旋变屏蔽层接地阻抗不连续点串入 SIN/COS 差分信号线，感应出 1.8Vpp 共模噪声；3. 解码失步机理：旋变输入端高频共模抑制比 (CMRR) 在 60MHz 衰减至不足 20dB，共模噪声转变为差模相位噪声，导致 RDC 锁相环鉴相器产生 5.2° 估算角度瞬态跳变；4. 安全误触发：安全监控逻辑检测到角度跳跃 > 3.8°，在 4.2ms (<5ms) 内判定为转子失步，强行切入三相主动短路 (ASC) 导致严重顿挫。',
    keyPhysicalFactors: [
      { factor: '高 dv/dt 位移电流', description: '36V/ns 开关瞬变激发 13.68A 共模高频电流，在机壳与屏蔽层流窜' },
      { factor: '60MHz 高频共模转差模', description: '旋变接收端高频 CMRR 劣化，共模振铃转化为 SIN/COS 相位偏差' },
      { factor: 'ASIL D 故障诊断阈值', description: '3.8° / 5ms 安全监控窗口在偶发高频毛刺下被误击穿' },
    ],
  },
  dfmeaView: {
    failureMode: '旋变角度信号受高 dv/dt 共模干扰失真误触发三相主动短路 (ASC)',
    failureCause: 'SiC 高频开关共模电流经寄生电容窜入旋变信号线，RDC 跟踪环失步',
    localEffect: '逆变器报旋变失步故障 DTC，切断正常扭矩输出，下桥全开切入 ASC',
    systemEffect: '电机进入强电制动状态，动力总成产生剧烈反向制动扭矩',
    vehicleEffect: '高速急加速过程中突发剧烈顿挫，存在后车追尾重大行车安全隐患',
    severity: 9,
    occurrence: 5,
    detection: 3,
    safetyImpact: true,
    regulatoryImpact: true,
    massProductionImpact: true,
  },
  candidateActions: [
    {
      id: 'Option A',
      category: 'conservative',
      categoryLabel: '全功率级硬件重构',
      name: '大幅加大门极电阻 Rg 至 8.2Ω + 更换双屏蔽铜箔旋变线缆',
      description: '将 SiC 关断电阻由 1.5Ω 增大到 8.2Ω 以将开关 dv/dt 强行压低至 12V/ns 以下，同时定制高压总成专用的内外双层独立屏蔽旋变电缆。',
      expectedBenefit: '彻底从源头压低共模电流，旋变感应噪声降至 100mVpp 以下，角度抖动降至 1.0°。',
      scores: { T: 92, S: 35, C: 40, Q: 90, L: 90, total: 68.5 },
      veto: { rejection_veto: false },
      riskDelta: '极高行车安全风险 ➔ 低残余风险 (源头彻底降噪)',
      residualRisk: 'Low',
      residualRiskDetail: 'SiC 开关损耗暴增 45%，导致逆变器满载连续输出功率由 220kW 缩水至 175kW，结温突破 155℃ 极限。',
      sideEffects: '结温严重超标，整车动力性能大打折扣，无法通过 OEM 动力加速指标验收。',
      verificationCost: '定制线束模具费 3 万元 + SiC 结温全面重评',
      timeCost: '18~20 天',
      failureConsequence: '导致 10 天后的整车冬标完全脱节延误',
      preconditions: 'OEM 降低电机额定峰值扭矩与加速性能指标',
      verificationMethod: '测功机 800V/450A 满载连续运行温升试验',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: false, note: '开关损耗暴增导致结温击穿 150℃ 降额红线，需强制降额' },
        { rule: '【EMC_RE_CE ➔ THERMAL】加装吸收网络热量', addressed: true, note: '开关速度减慢，EMC 收益良好' },
      ],
      planB: '若温升失控，必须缩短大扭矩持续时间。',
      decisionFit: '工期 20 天无法满足 10 天冬标要求，且动力性能牺牲过大。',
      fastestValidation: '线束打样需 12 天',
      latestDecisionPoint: '第 2 天必须决策',
      rejectionReason: '开关损耗过热击穿降额红线，且工期无法满足冬标节点。',
    },
    {
      id: 'Option B',
      category: 'balanced',
      categoryLabel: '跨域协同推荐',
      name: '门极阻尼微调 (2.2Ω) + 纳米晶共模磁环 + RDC 差共模滤波 + 锁相环容错 (推荐采纳)',
      description: '【硬件源头微调】：门极电阻仅微调至 2.2Ω (dv/dt 优化至 28V/ns，损耗仅微增 4% 结温在安全裕量内)；【传输路径扼流】：旋变低压线束近逆变器端套装高导磁纳米晶共模扼流磁环 (60MHz 阻抗 > 450Ω)；【接口滤波】：优化 RDC 输入端 RC 滤波 (差模 470pF，共模 100pF 100V)；【算法容错】：软件微调鉴相环故障判定积分窗口至 4.5ms (严格守住 <= 5.0ms FTTI 法规红线)。',
      expectedBenefit: '在 0 天 PCB 改版前提下，将 60MHz 共模噪声由 1.8Vpp 压减至 280mVpp；转子角度估算抖动由 5.2° 压紧至 1.8° (<3.8° 门限)；彻底消除急加速顿挫，100% 满足 5ms FTTI 法规，保住 10 天冬标大门！',
      scores: { T: 92, S: 96, C: 94, Q: 92, L: 90, total: 93.0 },
      veto: { rejection_veto: false },
      riskDelta: '极高安全风险 (高速顿挫) ➔ 受控极低风险 (多级防护彻底闭环)',
      residualRisk: 'Low',
      residualRiskDetail: '微调门极电阻损耗增加极微 (结温仅微升 1.8℃)，仍在 125℃ 优良降额区间。',
      sideEffects: 'BOM 增加一颗车规纳米晶磁环与 6 颗高精贴片电容 (总成本 +$0.32，完全在 +$0.50 预算内)。',
      verificationCost: '台架快速加装套磁环与滤波小板 3 小时',
      timeCost: '1~2 天',
      failureConsequence: '若仍偶发抖动，微调 RDC 锁相环数字滤波阻尼比',
      preconditions: '磁环装配卡扣满足整车 20G 机械振动与跌落规范',
      verificationMethod: '800V/450A 百公里急加速测功机台架抓波 + 旋变断线 4.5ms 注入脱扣试验',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: true, note: '结温微升 1.8℃，稳态结温 123.8℃ 远低于 150℃ 限值，无需降额' },
        { rule: '【EMC_RE_CE ➔ THERMAL】加装吸收网络热量', addressed: true, note: '磁环纯吸收共模位移电流，热量 <0.05W 无温升风险' },
      ],
      planB: '若个别频段仍有残余噪声，在线束两端实施 360 度金属压接接地环。',
      decisionFit: '工期 2 天，成本 $0.32，彻底兼顾冬标节点与免责合规 (PROCESS_DEFENSIVE 最佳契合)。',
      fastestValidation: '加装后 24 小时内即可完成台架急加速连续 100 次打脸验证',
      latestDecisionPoint: '第 2 天完成方案封样',
      rejectionReason: '',
    },
    {
      id: 'Option C',
      category: 'radical',
      categoryLabel: '违规放宽 (一票否决)',
      name: '仅在软件层强行将故障诊断时间窗口拉大至 20ms 并放宽角度门限至 10°',
      description: '不对硬件和高频共模做任何抑制，仅通过软件修改将角度容差放宽到 10°，并将故障确认延时拉长到 20ms 强行避开毛刺。',
      expectedBenefit: '眼前消除报错，不需要改动任何硬件。',
      scores: { T: 15, S: 98, C: 98, Q: 10, L: 5, total: 41.5 },
      veto: {
        rejection_veto: true,
        veto_type: 'SAFETY_GOAL_BREACH',
        veto_reason: '一票否决：ISO 26262 ASIL D 强制规定该安全目标 FTTI 必须 <= 5.0ms。拉大至 20ms 在真实发生旋变断线时将导致电机飞车失控失稳，严重违法且无法通过第三方认证机构功能安全审查！',
      },
      riskDelta: '极高安全风险 ➔ 潜伏致死性安全违章 (触碰 ASIL D 法律红线)',
      residualRisk: 'High',
      residualRiskDetail: '真实转子失步时逆变器无法在 FTTI 内切入安全状态，引发整车失控。',
      sideEffects: '直接导致整车无法上市并触犯汽车缺陷召回法规。',
      verificationCost: '无',
      timeCost: '0 天',
      failureConsequence: '功能安全认证被一票否决，无法销售',
      preconditions: '无',
      verificationMethod: '不可接受',
      crossDomainCouplingChecks: [
        { rule: '【THERMAL ➔ BLDC】维持全转矩不降额', addressed: false, note: '未解决硬件物理噪声' },
      ],
      planB: '无',
      decisionFit: '绝对不可接受',
      fastestValidation: '立即否决',
      latestDecisionPoint: '立即',
      rejectionReason: '直接击穿 ISO 26262 ASIL D 强制法定 FTTI (5.0ms) 限值。',
    },
  ],
  finalRecommendation: {
    recommendedOptionId: 'Option B',
    recommendedOptionName: '门极阻尼微调 (2.2Ω) + 纳米晶共模磁环 + RDC 差共模滤波 + 锁相环容错',
    recommendationGrade: 'Recommended',
    whyReason: [
      '将 60MHz 振铃共模噪声由 1.8Vpp 强力压降至 280mVpp，旋变角度估算抖动由 5.2° 压减至 1.8° (<3.8° 门限)',
      '彻底消除急踩电门急加速时的非预期主动短路 (ASC) 顿挫，保障车辆平顺性',
      '严格坚守 4.5ms 故障诊断响应时限，100% 满足 ISO 26262 ASIL D 5.0ms FTTI 法规红线',
      '0天 PCB 投板工期，工期仅需 1~2 天，确保 10 天后冬季整车标定大门准时开启',
      'BOM 增量仅 +$0.32，完全在 +$0.50 预算限额以内',
    ],
    immediateSteps: [
      { step: 1, title: '加装纳米晶磁环与滤波调试', action: '在样车旋变线束近逆变器端卡装 1 颗纳米晶高频共模磁环并在输入端并联滤波电容', owner: 'HW', deadline: 'T+12h' },
      { step: 2, title: '800V/450A 测功机台架急加速复测', action: '连续进行 50 次百公里大扭矩弹射急加速，记录 RDC 角度抖动峰值', owner: 'Test', deadline: 'T+24h' },
      { step: 3, title: 'ASIL D 故障注入时效闭环', action: '台架注入真实旋变 SIN/COS 断线故障，示波器确认 ASC 触发延时 <= 4.5ms', owner: 'FSM', deadline: 'T+36h' },
      { step: 4, title: '整车冬标样件封样出厂', action: '完成 4 台逆变器冬标样机封样并交付整车试验队发往黑河/牙克石', owner: 'PM', deadline: 'T+3天' },
    ],
    preconditions: [
      '磁环固定卡扣需耐受 -40℃~125℃ 冷热冲击与 20G 随机振动',
      '滤波电容需选用车规 AEC-Q200 NPO/COG 高精度电容，杜绝温漂影响相角',
    ],
    unacceptableActions: [
      '严禁将故障消隐时间拉长超过 5.0ms FTTI 红线',
      '严禁通过大幅增大门极电阻 Rg 牺牲 SiC 模块效率导致结温超标',
    ],
    stopConditions: [
      '若急加速工况下实测角度抖动仍超过 3.2°，必须暂停发运排查线束接地压接',
      '若真实故障注入下 ASC 触发时间超过 4.8ms，必须微调软件中断优先级',
    ],
    reEvaluationTriggers: [
      '整车高压线缆与旋变电缆布置间距在正式总装中被压缩小于 50mm',
      '电机转子偏心度或气隙在极寒工况下发生异常机械变形',
    ],
    planB: '若整车装配空间极端受限无法装配磁环，改用内部屏蔽铜套管压接接地方案。',
  },
  dualTimeline: {
    containmentPhase: {
      phaseTag: 'T_PLUS_24H_CONTAINMENT',
      timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
      title: '线束加装纳米晶高频磁环 + RDC 输入滤波优化 + 固件中断容错微调',
      objective: '在 0 天 PCB 工期前提下将角度抖动压减至 2.0° 以内，确保样车顺利启程参与 10 天后的冬季标定',
      hardwareImpact: '线束端卡装高导磁磁环，驱动板原位微调 1 颗电阻与 4 颗电容，0 天投板工期',
      responsibilityRole: '硬件与整车试验团队协同实施',
      actions: [
        { step: '磁环与滤波加装', detail: '在 4 台冬标样机旋变端口加装纳米晶磁环与 COG 滤波电容', owner: 'HW Specialist', duration: '3 小时', hardwareImpact: '原位线束改制', deliverable: '冬标样机 4 台' },
        { step: '台架极限弹射验证', detail: '800V/450A 极限大扭矩急加速 50 次，抓取 RDC 角度波动与相电流波形', owner: 'Test Lead', duration: '6 小时', hardwareImpact: '无', deliverable: '台架验证数据包 (抖动 <=1.8°)' },
        { step: 'FTTI 故障注入验证', detail: '模拟旋变物理断线，示波器双通道测量从断开到 ASC 触发端到端时间', owner: 'Safety Lead', duration: '4 小时', hardwareImpact: '无', deliverable: 'ASIL D 4.5ms 证明报告' },
      ],
      verificationCriteria: '450A 急加速角度抖动峰值 <= 2.2°，无 ASC 误动作；断线故障响应时间 <= 4.5ms',
      exitCriteria: '冬标样机通过整车厂技术审查，顺利装车发运极寒试验场',
    },
    permanentPhase: {
      phaseTag: 'NEXT_PHASE_PERMANENT',
      timeWindow: '下一版本永久纠正 / SOP 封样',
      title: 'PCB 单板集成三阶共模滤波网络 + 电机壳体高频低阻抗等电位接地重构',
      objective: '在单板 Layout 上原生集成高抑制比共模陷波器，消除外挂磁环，实现量产全自动化贴片',
      hardwareImpact: 'PCB 布局优化投板，模具壳体接地凸台优化',
      responsibilityRole: '硬件架构团队主导，机械结构与电机设计协同',
      actions: [
        { step: 'PCB 原生滤波设计', detail: '在 RDC 输入端布局三阶差分共模有源/无源滤波器，PCB 预留磁珠阵列', owner: 'HW Architect', duration: '10 天', hardwareImpact: 'PCB 改版', deliverable: '新版硬件设计图纸' },
        { step: '电机端子接地重构', detail: '优化逆变器底板与电机外壳贴合面，高频阻抗由 12mΩ 降至 <2mΩ', owner: 'Mechanical Lead', duration: '14 天', hardwareImpact: '壳体结构微调', deliverable: '高频接地阻抗测试报告' },
        { step: '第三方 ASIL D 认证', detail: '提交 TÜV 莱茵或南德完成 ISO 26262 功能安全最终封样审核', owner: 'FSM', duration: '20 天', hardwareImpact: '认证归档', deliverable: '正式 ASIL D 认证证书' },
      ],
      verificationCriteria: '单板原生 60MHz 共模衰减 > 40dB，角度抖动 <= 1.2°，全温全工况满足全部车规门禁',
      exitCriteria: 'SOP 量产封样，通过主机厂 PPAP Level 3 最终会签',
    },
    strategicTradeoff: '面对 10 天后严酷的整车冬标节点违约红线，无法等待 20 天的 PCB 改版周期。Option B 采用低成本线束扼流与原位元器件微调，既彻底解除了急加速顿挫安全隐患，又守住了 5ms FTTI 法规底线，为后续永久改版赢得了宝贵窗口。',
  },
  raciMatrix: [
    { role: '硬件负责人 (HW Lead)', r: '负责磁环选型、滤波网络设计与阻抗测试', a: '签署硬件接口噪声合规放行单', c: '协同电机工程师排查外壳接地', i: '向工程总监通报台架进展' },
    { role: '功能安全经理 (FSM)', r: '执行旋变断线故障注入与端到端 FTTI 延时抓波', a: '核准 4.5ms 安全监控时间窗口合法性', c: '审核安全机制失效率与诊断覆盖率', i: '向 OEM 功能安全团队出具备案函' },
    { role: '测试标定负责人 (Cal Lead)', r: '负责 800V/450A 大扭矩急加速弹射复测', a: '确认整车驾驶平顺性与无顿挫', c: '核对冬季试验工况剖面', i: '向整车试验队提交发运许可' },
    { role: '项目经理 (PM)', r: '跟踪 10 天冬标发运节点与样件改制交付', a: '把控跨专业博弈风险与 BOM 成本', c: '与客户沟通特采与技术放行', i: '统筹跨部门协同会议' },
  ],
  engineeringDocs: {
    pmDecisionEmail: {
      subject: '【急件】800V SiC 逆变器急加速旋变干扰与 ASC 顿挫闭环对策直报',
      to: 'EV Platform VP & Vehicle Calibration Director',
      summary: '通过线束加装纳米晶共模磁环与接口差共模滤波微调，已将 60MHz 噪声由 1.8Vpp 压减至 280mVpp，角度抖动收敛至 1.8°，彻底消除急加速顿挫，同时严格保证 4.5ms 响应时间满足 ASIL D 5ms FTTI 法规，4 台冬标样机准时发运。',
    },
    deviationPermit: {
      title: '800V 逆变器冬季标定样机旋变外部共模扼流改装放行书',
      deviationScope: '仅限于 2027 冬季标定试验 4 台样车逆变器，加装纳米晶磁环与 COG 滤波元件。',
      expirationCondition: '冬季标定结束 (2027年3月) 或 PV 正式改版投板回板后自然终止。',
    },
    meetingMinutes: {
      title: '800V SiC 主驱高频共模干扰与 ISO 26262 决策评审纪要',
      decisions: '1. 一票否决 Option C 软件拉长 FTTI 方案；2. 立即封样 Option B 样机发运黑河试验场；3. 永久改版纳入 PV 计划。',
    },
  },
};

// 验证主逻辑
async function testExecutionPipeline() {
  console.log(`\n========================================================================`);
  console.log(`🔍 验证执行管道与全页面渲染校验`);
  console.log(`========================================================================`);

  const cases = [
    { id: 'case_1', name: 'Case 1: MHEV 48V eTurbo 功率-瞬态-热-模拟采样跨域', data: NEW_CROSS_DOMAIN_CASE_1, answer: AI_ANSWER_CASE_1 },
    { id: 'case_2', name: 'Case 2: 800V SiC 主驱高频共模干扰与旋变 ASIL D 跨域', data: NEW_CROSS_DOMAIN_CASE_2, answer: AI_ANSWER_CASE_2 },
  ];

  for (const tc of cases) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`🧪 测试案例: ${tc.name}`);
    console.log(`------------------------------------------------------------------------`);

    // 1. 运行本地专家基线
    const baseline = runExpertAnalysis(tc.data.context, tc.data.issue);

    // 2. 运行车规级输入完整度审计
    const integrity = assessInputIntegrity(tc.data.context, tc.data.issue);
    console.log(`📊 输入完整度评估: ${integrity.gradeLabel} (${integrity.completenessScore}分), 必填缺失数: ${integrity.missingRequiredFields.length}`);

    // 3. 执行车规级 AI 结果全栈审计与防幻觉校准
    const { sanitizedResult, auditResult } = auditAiResult(
      tc.answer,
      baseline,
      tc.data.context,
      tc.data.issue,
      integrity
    );

    console.log(`\n【AI 结果审计与防幻觉校准报告】`);
    console.log(`- 审计状态: ${auditResult.overallStatus} (得分: ${auditResult.auditScore}/100)`);
    console.log(`- 审计命中规则数: ${auditResult.flags.length} 项`);
    auditResult.flags.forEach((f) => console.log(`  * [${f.level}] ${f.title}: ${f.message}`));
    console.log(`- 自动纠偏数: ${auditResult.autoFixSummary.length} 项`);
    auditResult.autoFixSummary.forEach((fix) => console.log(`  * [AutoFix] ${fix}`));

    // 4. 挂载 provenance 与 debugSnapshot
    sanitizedResult.provenance = {
      executionMode: 'ONLINE_AI_INFERRED',
      engineName: '云端大模型 (Gemini-2.5-Pro) 工况强定锚推理',
      isAiInferred: true,
      isDeterministicRule: false,
      generatedAt: new Date().toLocaleTimeString(),
      modelIdentifier: 'gemini-2.5-pro',
      inputIntegrity: integrity,
      aiAudit: auditResult,
      transparencyNote: `本分析由云端大模型严格限定在【${tc.data.context.projectName}】输入工况及实测数据推演生成。`,
    };

    sanitizedResult.debugSnapshot = {
      promptLength: 14000,
      promptSnippet: '你必须严格基于以下【输入工况】、【实测数据】与【本地确定性预核算事实】进行硬件工程决策推演...',
      modelIdentifier: 'gemini-2.5-pro',
      latencyMs: 1250,
      timestamp: new Date().toISOString(),
      precomputedFactsCount: 3,
      autoFixesCount: auditResult.autoFixSummary.length,
      auditedRuleHits: auditResult.flags.length,
      retryCount: 0,
    };

    // 5. 校验前端各页面渲染所需字段
    const pagesToVerify = [
      'FirstScreen10sView (第一屏10秒决策速览)',
      'AnalysisFactView (物理机理与事实底座)',
      'OptionsComparisonView (多方案对比与跨域复核)',
      'DecisionCockpitView (C-T-S-Q-L 决策驾驶舱)',
      'VerificationLoopView (实验验证闭环与 VOI 优先级)',
      'RecommendationRaciView (落地责任矩阵与双层时间轴)',
      'EngineeringDocsView (车规工程文档套件)',
      'ResultProvenanceBanner (车规溯源与调试快照横幅)',
    ];

    console.log(`\n【各核心页面 (View) 字段对齐与渲染预期检验】`);
    let allViewsOk = true;

    for (const pageName of pagesToVerify) {
      const fieldChecks = checkPageViewData(pageName, sanitizedResult);
      const passed = fieldChecks.every((c) => c.status === 'OK');
      if (!passed) allViewsOk = false;

      console.log(`\n📺 ${passed ? '✅' : '❌'} 页面: ${pageName}`);
      fieldChecks.forEach((c) => {
        console.log(`   [${c.status === 'OK' ? '✔' : '✘'}] ${c.field}: ${c.sampleValue || '(空或未对齐)'}`);
      });
    }

    console.log(`\n========================================================================`);
    console.log(`🏁 案例 [${tc.id}] 最终结论: ${allViewsOk ? '🎉 100% 达成预期，无任何“驴头不对马嘴”或字段断裂！' : '⚠️ 存在渲染字段未对齐缺陷，需修复代码'}`);
    console.log(`========================================================================`);
  }
}

function checkPageViewData(pageName: string, data: any) {
  const checks: { field: string; status: 'OK' | 'MISSING'; sampleValue?: string }[] = [];

  switch (pageName) {
    case 'FirstScreen10sView (第一屏10秒决策速览)': {
      const q1 = data.coreConclusion?.problemSummary;
      const q2 = data.physicalMechanism?.rootCauseAnalysis;
      const q3 = data.coreConclusion?.recommendedMeasure;
      const q4 = data.candidateActions?.[0]?.verificationMethod || data.finalRecommendation?.immediateSteps?.[0]?.action;
      const gate = data.decisionFrame?.currentDecisionGate;
      const win = data.decisionFrame?.decisionWindow;

      checks.push({ field: 'Q1: What is wrong? (问题定性)', status: q1 ? 'OK' : 'MISSING', sampleValue: q1?.slice(0, 45) + '...' });
      checks.push({ field: 'Q2: Why? (物理失效机理)', status: q2 ? 'OK' : 'MISSING', sampleValue: q2?.slice(0, 45) + '...' });
      checks.push({ field: 'Q3: What to do? (核心推荐措施)', status: q3 ? 'OK' : 'MISSING', sampleValue: q3?.slice(0, 45) + '...' });
      checks.push({ field: 'Q4: What proves it? (决定性判据)', status: q4 ? 'OK' : 'MISSING', sampleValue: q4?.slice(0, 45) + '...' });
      checks.push({ field: '工程门禁与决策窗口 (DecisionFrame)', status: gate && win ? 'OK' : 'MISSING', sampleValue: `${gate} | ${win}` });
      break;
    }

    case 'AnalysisFactView (物理机理与事实底座)': {
      const factors = data.physicalMechanism?.keyPhysicalFactors;
      const facts = data.knownFacts;
      const assumptions = data.assumptions;
      const unknowns = data.unknowns;
      const dfmea = data.dfmeaView;

      checks.push({ field: '关键物理影响因子清单 (keyPhysicalFactors)', status: Array.isArray(factors) && factors.length > 0 ? 'OK' : 'MISSING', sampleValue: `${factors?.length}个物理因子: ${factors?.map((f: any) => f.factor).join(', ')}` });
      checks.push({ field: '已知工程事实底线 (knownFacts)', status: Array.isArray(facts) && facts.length > 0 ? 'OK' : 'MISSING', sampleValue: `${facts?.length}条事实` });
      checks.push({ field: '关键工程假设 (assumptions)', status: Array.isArray(assumptions) && assumptions.length > 0 ? 'OK' : 'MISSING', sampleValue: `${assumptions?.length}条假设` });
      checks.push({ field: '阻塞决策的未知量清单 (unknowns)', status: Array.isArray(unknowns) && unknowns.length > 0 ? 'OK' : 'MISSING', sampleValue: `${unknowns?.length}条待确认项` });
      checks.push({ field: 'DFMEA 失效模式/严重度分析 (dfmeaView)', status: dfmea?.failureMode && dfmea?.severity ? 'OK' : 'MISSING', sampleValue: `模式: ${dfmea?.failureMode?.slice(0, 30)}..., S=${dfmea?.severity}, O=${dfmea?.occurrence}, D=${dfmea?.detection}` });
      break;
    }

    case 'OptionsComparisonView (多方案对比与跨域复核)': {
      const actions = data.candidateActions || [];
      const hasOptions = actions.length >= 3;
      const hasRiskDelta = actions.some((a: any) => Boolean(a.riskDelta));
      const hasCoupling = actions.some((a: any) => Array.isArray(a.crossDomainCouplingChecks) && a.crossDomainCouplingChecks.length > 0);
      const hasPlanB = actions.some((a: any) => Boolean(a.planB));
      const hasVeto = actions.some((a: any) => a.veto?.rejection_veto === true);

      checks.push({ field: '包含≥3个候选方案 (Option A/B/C)', status: hasOptions ? 'OK' : 'MISSING', sampleValue: `${actions.length}个方案: ${actions.map((a: any) => a.name).join(' | ')}` });
      checks.push({ field: '风险净变化跃迁标注 (riskDelta)', status: hasRiskDelta ? 'OK' : 'MISSING', sampleValue: actions[1]?.riskDelta });
      checks.push({ field: '跨域物理耦合复核闭环 (crossDomainCouplingChecks)', status: hasCoupling ? 'OK' : 'MISSING', sampleValue: `${actions.reduce((acc: number, cur: any) => acc + (cur.crossDomainCouplingChecks?.length || 0), 0)}条复核规则` });
      checks.push({ field: '工程退路后备方案 (planB)', status: hasPlanB ? 'OK' : 'MISSING', sampleValue: actions[1]?.planB });
      checks.push({ field: '一票否决红牌标识 (veto.rejection_veto)', status: hasVeto ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.veto?.rejection_veto)?.veto?.veto_reason?.slice(0, 45) });
      break;
    }

    case 'DecisionCockpitView (C-T-S-Q-L 决策驾驶舱)': {
      const actions = data.candidateActions || [];
      const allScored = actions.length > 0 && actions.every((a: any) => a.scores && typeof a.scores.total === 'number');
      const rec = data.finalRecommendation;

      checks.push({ field: '全方案 5 维量化雷达打分 (T/S/C/Q/L)', status: allScored ? 'OK' : 'MISSING', sampleValue: actions.map((a: any) => `${a.id}: ${a.scores?.total}分`).join(', ') });
      checks.push({ field: '系统最终采纳推荐结论 (finalRecommendation)', status: rec?.recommendedOptionId ? 'OK' : 'MISSING', sampleValue: `采纳 ${rec?.recommendedOptionId} (${rec?.recommendedOptionName})` });
      checks.push({ field: '即刻执行清单与负责人 (immediateSteps)', status: Array.isArray(rec?.immediateSteps) && rec.immediateSteps.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.immediateSteps?.length}步即刻动作` });
      break;
    }

    case 'VerificationLoopView (实验验证闭环与 VOI 优先级)': {
      const rec = data.finalRecommendation;
      const actions = data.candidateActions || [];
      const hasVerificationMethod = actions.some((a: any) => Boolean(a.verificationMethod));

      checks.push({ field: '验证方法与台架判据 (verificationMethod)', status: hasVerificationMethod ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.verificationMethod)?.verificationMethod?.slice(0, 45) });
      checks.push({ field: '方案准入先决条件 (preconditions)', status: rec?.preconditions?.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.preconditions?.length}条准入边界` });
      checks.push({ field: '终止/熔断回退条件 (stopConditions)', status: rec?.stopConditions?.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.stopConditions?.length}条熔断判据` });
      checks.push({ field: '重评估触发条件 (reEvaluationTriggers)', status: rec?.reEvaluationTriggers?.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.reEvaluationTriggers?.length}条触发条件` });
      break;
    }

    case 'RecommendationRaciView (落地责任矩阵与双层时间轴)': {
      const raci = data.raciMatrix;
      const timeline = data.dualTimeline;

      checks.push({ field: '跨职能 RACI 责任矩阵 (raciMatrix)', status: Array.isArray(raci) && raci.length > 0 ? 'OK' : 'MISSING', sampleValue: `${raci?.length}个角色` });
      checks.push({ field: 'T+24h 应急临时遏制时间轴 (containmentPhase)', status: Boolean(timeline?.containmentPhase?.title && timeline?.containmentPhase?.actions?.length) ? 'OK' : 'MISSING', sampleValue: timeline?.containmentPhase?.title });
      checks.push({ field: '下一阶段永久纠正时间轴 (permanentPhase)', status: Boolean(timeline?.permanentPhase?.title && timeline?.permanentPhase?.actions?.length) ? 'OK' : 'MISSING', sampleValue: timeline?.permanentPhase?.title });
      checks.push({ field: '战略权衡代价说明 (strategicTradeoff)', status: Boolean(timeline?.strategicTradeoff) ? 'OK' : 'MISSING', sampleValue: timeline?.strategicTradeoff?.slice(0, 45) });
      break;
    }

    case 'EngineeringDocsView (车规工程文档套件)': {
      const docs = data.engineeringDocs;
      const hasEmail = Boolean(docs?.pmDecisionEmail?.subject);
      const hasPermit = Boolean(docs?.deviationPermit?.title);
      const hasMeeting = Boolean(docs?.meetingMinutes?.title);

      checks.push({ field: 'PM 决策直报邮件模版 (pmDecisionEmail)', status: hasEmail ? 'OK' : 'MISSING', sampleValue: docs?.pmDecisionEmail?.subject });
      checks.push({ field: '工程偏差放行申请书 (deviationPermit)', status: hasPermit ? 'OK' : 'MISSING', sampleValue: docs?.deviationPermit?.title });
      checks.push({ field: '跨部门决策会议纪要 (meetingMinutes)', status: hasMeeting ? 'OK' : 'MISSING', sampleValue: docs?.meetingMinutes?.title });
      break;
    }

    case 'ResultProvenanceBanner (车规溯源与调试快照横幅)': {
      const prov = data.provenance;
      const debug = data.debugSnapshot || prov?.debugSnapshot;
      const integrity = prov?.inputIntegrity;

      checks.push({ field: '推理源标识与耗时 (provenance)', status: Boolean(prov?.engineName) ? 'OK' : 'MISSING', sampleValue: `${prov?.engineName} (${debug?.latencyMs}ms)` });
      checks.push({ field: '输入完整度评级徽标 (inputIntegrity)', status: Boolean(integrity?.gradeLabel) ? 'OK' : 'MISSING', sampleValue: `${integrity?.gradeLabel} (${integrity?.completenessScore}分)` });
      checks.push({ field: '调试快照 Prompt 文本与参数 (debugSnapshot)', status: Boolean(debug?.promptLength && debug?.promptSnippet) ? 'OK' : 'MISSING', sampleValue: `Prompt字符: ${debug?.promptLength}, 预计算事实: ${debug?.precomputedFactsCount}, 自动纠偏: ${debug?.autoFixesCount}` });
      break;
    }
  }

  return checks;
}

testExecutionPipeline().catch(console.error);
