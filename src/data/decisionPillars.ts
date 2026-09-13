import {
  ClassifiedInfoItem,
  MultiDimensionalRiskBreakdown,
  WhyNotComparisonItem,
  Next24HourPlan,
  EngineeringDecisionRecord,
  RedTeamAuditChallenge,
  ProjectContext,
  IssueInput,
} from '../types';

export interface ScenarioPillars {
  classifiedInfo: ClassifiedInfoItem[];
  multiRiskBreakdown: MultiDimensionalRiskBreakdown;
  whyNotComparison: WhyNotComparisonItem[];
  next24HourPlan: Next24HourPlan;
  edrRecord: EngineeringDecisionRecord;
  redTeamChallenge: RedTeamAuditChallenge;
}

/**
 * 1. EMC 辐射超标场景的五大支柱数据
 */
export function getEmcPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredVal = issue.actualMeasurement || '150MHz 频点超标 +3.0 dB';
  const reqVal = issue.requirement || '符合 CISPR 25 Class 5 辐射发射限值 (150MHz <= 28 dBuV/m)';

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-EMC-01',
      tag: 'MEASURED',
      title: '150MHz 频点实测辐射发射超标',
      content: `${measuredVal} (在白盒测试暗室中测得天线垂直极化 31.0 dBuV/m，超过限值 3.0 dB)`,
      sourceOrBasis: '罗德与施瓦茨 ESR26 EMI 接收机实测频谱数据 (#Trace-150M-RE)',
      confidenceLevel: 98,
      verificationMethod: 'CISPR 25 1米法电波暗室天线实测',
    },
    {
      id: 'INFO-EMC-02',
      tag: 'SPEC',
      title: '车规 CISPR 25 Class 5 准峰值/平均值限值红线',
      content: `${reqVal}；且客户技术协议要求批量交付产品必须具备 >= 6dB 的工程安全裕量`,
      sourceOrBasis: 'CISPR 25:2021 Table 7 & 客户整车技术协议 (CSA-EMC-Clause 4.2)',
      confidenceLevel: 100,
      verificationMethod: '第三方国家级汽车检测中心认证标准规范',
    },
    {
      id: 'INFO-EMC-03',
      tag: 'CALCULATED',
      title: '开关节点 dv/dt 与对地容性位移电流推导',
      content: 'Gate Driver 输出高频谐波计算：PWM 上升沿 tr=18ns, 摆率 dv/dt=1.2V/ns，通过 12pF 功率对壳寄生电容产生 i_cm = C * dv/dt = 14.4mA 共模位移电流',
      sourceOrBasis: '麦克斯韦电磁场微分方程与高频寄生回路解析计算模型',
      confidenceLevel: 88,
      verificationMethod: '基于实测上升沿时域波形与三维寄生电容提取仿真',
    },
    {
      id: 'INFO-EMC-04',
      tag: 'ASSUMPTION',
      title: '工程假设：量产正式金属外壳搭接阻抗良好',
      content: '假设正式量产压铸铝外壳周圈金属搭接阻抗 < 2.5mΩ，电磁屏蔽效能 (SE) 在 150MHz 频段可提供 >= 15dB 空间场强衰减',
      sourceOrBasis: '结构外壳供应商设计规范与过往同类型铝合金压铸机壳经验值 (当前样件为3D打印塑料件，未经验证)',
      confidenceLevel: 62,
      verificationMethod: '需在正式金属件出模后使用微欧计与暗室复测',
    },
    {
      id: 'INFO-EMC-05',
      tag: 'UNKNOWN',
      title: '未知项：未掌握线束共模电流外泄强度与极化方向',
      content: '尚未实测低压/高压复合线束根部 150MHz 共模电流大小，无法判定外辐射主导通道是空间近场还是线缆长导线天线效应',
      sourceOrBasis: '当前白盒测试仅放置了单板与天线，未接入全长标准车载线束与共模电流钳 (F-120-9B)',
      confidenceLevel: 35,
      verificationMethod: '需在 24 小时内加装共模电流探头 (Current Clamp) 进行扫频隔离测试',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 72,
      level: 'Medium-High',
      evidence: '实测超标 +3.0dB，且距离规范要求的 +6dB 安全裕量尚有 9dB 差距，技术裕量处于击穿边缘。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 30,
      level: 'Low',
      evidence: 'EMC 辐射未对功率器件造成电气过应力 (EOS)，主要涉及无线电干扰与公告合规。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 85,
      level: 'High',
      evidence: `距离当前 ${context.daysRemaining || 14} 天 DV 节点极其紧迫；若盲目重新投板改版 (需 21 天) 将导致直接违约。`,
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 65,
      level: 'Medium',
      evidence: '打板与重新开贴费用约 ¥35,000，且面临第三方认证实验室机时重预约成本。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 78,
      level: 'High',
      evidence: '临时塑料工装掩盖了真实屏蔽表现，同时缺少线束共模电流钳位实测，存在关键盲区。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option B',
      optionName: '方案 B：双轨推进 (正式压铸金属壳摸底 + 并行备用 Plan B 磁环/RC补丁)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '技术事实表明当前仅超标 3dB 且测试处于临时塑料夹具。方案 B 3天内即可验证真实外壳屏蔽效果，不拖延 14 天节点；同时提前备齐磁环补丁锁定退路，做到零失误兜底。',
      keyRiskOrPenalty: '需借调正式结构件并安排半天暗室摸底工时 (约 ¥6,000)。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：立即启动 PCB 改版 (增加共模滤波电路与回路优化)',
      categoryLabel: '保守 / 技术最稳妥',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (保守改版)',
      coreTradeoffReason: '虽然源头改版从物理上最稳妥，但重新开板与 SMT 周期至少需要 21 天，直接击穿当前仅剩的 14 天 DV 准入节点，造成整车联调里程碑违约与客户通报索赔。',
      keyRiskOrPenalty: '关键路径延期 7 天以上，打样及实验室重排成本 ¥35,000。',
      reActivationCondition: '若方案 B 在正式金属外壳下实测超标仍 > 2dB 且追加磁环补丁依然失效，则强制启动方案 A。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：盲目假定“金属壳必降 20dB”直接送检正式 DV',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触碰工程铁律【原则 3：绝不能无依据凭空假设外壳必降 20dB】！若超标是由线束共模传导导致，外壳无法阻隔线缆天线辐射，将导致正式 DV 认证留下不可逆的 Fail 记录。',
      keyRiskOrPenalty: '【硬性否决】正式第三方测试报告出具不合格，触发客户 Level 1 严重质量不符合项，门禁冻结。',
      reActivationCondition: '永久禁止。任何情况下均不得在无实测数据支撑下侥幸直接送检。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 10:30',
        phase: '样件与机壳调拨',
        task: '硬件组从结构实验室借调 1 套正式铝合金量产外壳与导电橡胶衬垫，完成单板紧固与接地螺钉装配',
        owner: 'HW 工程师 (张工)',
        deliverable: '装配完毕的带屏蔽样机与接地阻抗测试记录 (R_gnd < 2.5mΩ)',
      },
      {
        timeWindow: '10:30 - 13:00',
        phase: '暗室工况摸底',
        task: '进入暗室，对比测试“塑料工装”与“正式金属壳”两种状态下 150MHz 频点的空间辐射衰减幅值',
        owner: 'EMC 专项测试工程师',
        deliverable: '150MHz 频点对比频谱瀑布图与峰值衰减量 (dB)',
      },
      {
        timeWindow: '13:00 - 15:30',
        phase: '线束共模路径排查',
        task: '使用高频电流钳夹取外引低压线束出口，测量共模电流；若电流 > 10uA，在线束端套扣备用铁氧体磁环',
        owner: 'HW 工程师 + EMC 专家',
        deliverable: '线束共模电流谱线及磁环加装前后对比差值',
      },
      {
        timeWindow: '15:30 - 18:00',
        phase: '量化门禁决策会',
        task: '召集 PM、质量与系统负责人，根据 24 小时实测数据比对判定标准，签署方案放行决议',
        owner: 'PM + 硬件主管',
        deliverable: '《EMC 150MHz 摸底结论与 DV 准入放行单 (EDR)》',
      },
    ],
    passFailCriteria: [
      {
        parameter: '金属壳下 150MHz 辐射发射实测值 (RE Peak / Quasi-Peak)',
        greenCriteria: '实测值 <= 24.0 dBuV/m (留有 >= 4.0 dB 裕量) ➔ 判定通过，准予直接按原定排期送检正式 DV',
        yellowCriteria: '24.0 < 实测值 <= 28.0 dBuV/m (处于限值边缘) ➔ 保持方案 B，强制在线束出口增加阻尼磁环并扩大连续测试 5 次验证重复性',
        redCriteria: '实测值 > 28.0 dBuV/m (依然超标) ➔ 立即终止方案 B，向 PM 触发熔断警报，启动方案 A 改版流程并调整节点',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-EMC-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & PM 项目经理',
    coreProblem: 'B 样件在临时工装下 CISPR 25 Class 5 150MHz 辐射发射超标 +3.0dB，距离正式 DV 节点仅剩 14 天。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设正式压铸铝壳导电搭接阻抗 < 2.5mΩ',
      '假设 150MHz 开关谐波未对整车 77GHz 雷达或相机 SerDes 造成互调干扰',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '双轨推进 (正式压铸金属外壳真实工况摸底 + 并行预留 Plan B 备用滤波补丁)',
    rejectedOptionsSummary: 'Option A (改版周期 21 天击穿 14 天交付节点，暂缓执行)；Option C (无实测依据盲赌外壳，触犯工程红线，一票否决 VETO)。',
    defenseBasis: '依据 CISPR 25:2021 Table 7 标准与电磁屏蔽物理机理，当前超标 +3dB 属于结构屏蔽过渡阶段常见现象；在锁定 Plan B 硬件补丁的前提下，实施真实工况摸底为最优平衡路径。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '项目经理 (PM)', name: 'Project Director', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '质量保证负责人', name: 'Quality Manager', status: 'Pending', signDate: '-' },
      { role: '产品安全代表 (PSCR)', name: 'PSCR Auditor', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前决策结论高度依赖“铝壳屏蔽效能 >= 15dB”的工程假设，存在证据链盲区！',
    riskGaps: [
      '若超标源于线缆共模电流，金属机壳不仅无法屏蔽，反而可能因开孔缝隙形成偶极子谐振腔进一步恶化辐射。',
      '未对 150MHz 在电机满载工况下的频移做极限摸底，仅凭常温静态白盒测试不足以证明量产鲁棒性。',
    ],
    missingEvidenceList: [
      '缺少线束出口高频共模电流钳实测数据 (dBμA)。',
      '缺少正式压铸铝外壳周圈搭接阻抗实测数据 (mΩ)。',
      '缺少带高温环境箱 (-40℃ ~ 105℃) 下振荡频率温度漂移曲线。',
    ],
    confidenceScorePct: 68,
  };

  return {
    classifiedInfo,
    multiRiskBreakdown,
    whyNotComparison,
    next24HourPlan,
    edrRecord,
    redTeamChallenge,
  };
}

/**
 * 2. 器件替代 (Component Alternative / MOSFET / IC) 场景五大支柱数据
 */
export function getComponentPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredVal = issue.actualMeasurement || '替代料 Qgd 偏大 22%，高温台架实测温升增加 8.4℃，SOA 裕量剩余不足 15%';
  const reqVal = issue.requirement || 'Pin-to-Pin 且 Spec-to-Spec 完全满足，Tj 降额裕量 >= 15℃，通过完整 AEC-Q101';

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-COMP-01',
      tag: 'MEASURED',
      title: '高温台架实测动态温升与漏极浪涌',
      content: `${measuredVal}；示波器捕捉开启延迟 td(on) 增加 14ns，米勒平台加长 18ns`,
      sourceOrBasis: '热电偶与 Keysight 8 通道高带宽示波器双探头实测 (#WAVE-QGD-04)',
      confidenceLevel: 96,
      verificationMethod: '高低温恒温箱 85℃ 额定满载 100% 工况实测',
    },
    {
      id: 'INFO-COMP-02',
      tag: 'SPEC',
      title: '车规降额与安全工作区规范红线',
      content: `${reqVal}；严禁在器件单脉冲抗雪崩与持续 SOA 曲线外运行 (AEC-Q101 Rev E / IPC-9592B)`,
      sourceOrBasis: 'AEC-Q101 Rev E 标准规范与公司《车规半导体器件降额设计规范》V3.1',
      confidenceLevel: 100,
      verificationMethod: '供应商原始器件 Datasheet 保证书与第三方 AEC-Q101 认证报告',
    },
    {
      id: 'INFO-COMP-03',
      tag: 'CALCULATED',
      title: '结温 Tj 与动态开关损耗能量推导',
      content: '开关损耗计算：P_sw = 0.5 * Vds * Id * (tr + tf) * f_sw。由于 Qgd 增加 22%，开关损耗增加 0.85W，引起温升 ΔT = P_sw * Rth_ja = 0.85W * 9.8℃/W = 8.33℃',
      sourceOrBasis: '半导体器件物理能量模型公式演算',
      confidenceLevel: 92,
      verificationMethod: 'Foster 瞬态热阻网络模型与台架实测热电偶校准比对',
    },
    {
      id: 'INFO-COMP-04',
      tag: 'ASSUMPTION',
      title: '工程假设：器件内部芯片晶圆工艺一致性',
      content: '假设替代料原厂不同生产晶圆批次的 Qgd 与阈值电压 Vth 分布满足正态分布且 Cpk >= 1.33',
      sourceOrBasis: '供应商提供的 PCN (产品变更通知单) 承诺函 (尚未拿到首批 30 颗全参数测试散斑图)',
      confidenceLevel: 58,
      verificationMethod: '需 SQE 索取供应商出厂批次 CP/FT 生产测试数据报告',
    },
    {
      id: 'INFO-COMP-05',
      tag: 'UNKNOWN',
      title: '未知项：低温 -40℃ 冷启动峰值浪涌与雪崩耐量',
      content: '尚未在 -40℃ 极端低温下考核母线电感感应反向击穿能量 (E_as)，未知雪崩吸收能力是否劣化',
      sourceOrBasis: '现有台架仅完成了 +25℃ 与 +85℃ 测试，低温试验箱机时正在排队中',
      confidenceLevel: 40,
      verificationMethod: '需在 24 小时内送入低温箱执行 50 次急停断电反向能量冲击',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 82,
      level: 'High',
      evidence: 'SOA 裕量不足 15%，温升上升 8.4℃，逼近车规设计 15℃ 降额红线。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 80,
      level: 'High',
      evidence: '动态开关损耗增大导致晶圆内部微区热阻应力积聚，长期寿命可能折损。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 60,
      level: 'Medium',
      evidence: '原厂缺货停产，现货市场调拨需要 7~10 天，影响样件试制进度。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 40,
      level: 'Low',
      evidence: '通过微调外围驱动电阻即可解决，单板硬件改动成本可忽略不计。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 75,
      level: 'Medium-High',
      evidence: '缺少完整的 AEC-Q101 报告与低温极限雪崩实测，存在批次一致性质疑。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option B',
      optionName: '方案 B：受控条件放行 (微调驱动阻抗 + 台架极限浪涌考核 + SQE 索证)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '既不盲目停线等待原厂（需要52周交期），也不盲目签字放行。通过将门极驱动电阻由 10Ω 调小至 6.8Ω 抵消 Qgd 带来的开启延迟，将温升压回正常区间，并通过台架破坏性验证换取可靠性证据。',
      keyRiskOrPenalty: '需占用高压台架 5 天进行 1000 次加速预充循环，产生试验工时约 ¥12,000。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：坚持采购原厂原型号现货 (溢价 400% 调货)',
      categoryLabel: '保守 / 零技术改动',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (现货高价采购)',
      coreTradeoffReason: '虽然原厂型号无技术风险，但现货市场单颗采购价翻了 4 倍，且现货贸易商渠道充斥假冒翻新晶圆风险；更致命的是该料号已列入原厂停产 (EOL) 清单，量产阶段必将二次断货。',
      keyRiskOrPenalty: '单板成本超支严重，且无法根治未来量产断料停线隐患。',
      reActivationCondition: '仅在客户明确书面拒绝任何替代料且愿全额补偿现货差价时激活。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：凭 Pin-to-Pin 直接签字放行，免去 AEC-Q 与动态参数核查',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触犯铁律【原则 1：Pin-to-Pin ≠ Spec-to-Spec】与安全底线！SOA 裕量不足 15% 且 AEC-Q 未闭环，盲目签字放行高压关键功率器件属于工程失职，存在整车抛锚与热击穿一票否决风险。',
      keyRiskOrPenalty: '【硬性否决】高压预充回路击穿烧毁风险，触发产品召回与工程师质量终身追责。',
      reActivationCondition: '永久禁止。严禁在关键参数超限下免测签字放行。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 11:30',
        phase: '门极驱动阻抗优化调整',
        task: '在焊接台将驱动电阻从 10Ω 换贴为 6.8Ω/4.7Ω 两组方案，并联 1N4148 快关二极管',
        owner: 'HW 工程师 (李工)',
        deliverable: '焊接记录表与冷态静态阻抗检测合格记录',
      },
      {
        timeWindow: '11:30 - 15:30',
        phase: '台架动态波形捕捉与热成像',
        task: '样板接入高压测试台架，双探头测量开关沿 tr/tf，红外热像仪连续监测 2 小时稳态温升',
        owner: 'HW 工程师 + 台架技术员',
        deliverable: '优化前后结温 Tj 对比表与开关动态损耗示波器截图',
      },
      {
        timeWindow: '15:30 - 18:30',
        phase: '极端浪涌 200 次冲击摸底',
        task: '执行连续 200 次 400V 预充上电瞬态浪涌循环，监测关断电压尖峰与漏电流 Idss',
        owner: '可靠性工程师',
        deliverable: '200 次浪涌前后漏电流漂移记录 (要求 Idss 增加 < 5%)',
      },
      {
        timeWindow: '18:30 - 21:00',
        phase: 'SQE 认证合规会签',
        task: 'SQE 连线供应商原厂 FAE，核验 PPAP 提交时间表与 AEC-Q101 缺失条款补偿承诺书',
        owner: 'SQE 经理 + 采购代表',
        deliverable: '《替代器件技术偏差受控准入单》签署草案',
      },
    ],
    passFailCriteria: [
      {
        parameter: '驱动优化后器件稳态结温 Tj (85℃ 额定工况)',
        greenCriteria: 'Tj <= 115.0℃ (降额安全裕量 >= 35.0℃) ➔ 准予继续推进方案 B，开展后续 1000 次耐久测试',
        yellowCriteria: '115.0℃ < Tj <= 125.0℃ (降额裕量在 25℃~35℃ 之间) ➔ 保持方案 B，但要求软件底层增加 100ms 预充间隔保护',
        redCriteria: 'Tj > 125.0℃ (裕量 < 25℃，逼近红线) ➔ 立即中止替代，熔断放行流程，触发寻找第二家车规级品牌',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-COMP-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & SQE 质量经理',
    coreProblem: '400V BMS 预充 MOSFET 原厂交期 52 周，替代料 Qgd 偏大 22%，温升增加 8.4℃，SOA 裕量不足 15%。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设替代料批次间门极阈值电压 Vth 一致性满足 Cpk >= 1.33',
      '假设调整驱动电阻至 6.8Ω 后开关振铃未恶化 CISPR 25 传导发射',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '受控条件放行 (微调驱动阻抗 + 专项台架验证 + SQE 闭环)',
    rejectedOptionsSummary: 'Option A (采购现货溢价高昂且已列入 EOL 停产清单)；Option C (直接盲目签字放行违反 Pin≠Spec 铁律，一票否决 VETO)。',
    defenseBasis: '依据 AEC-Q101 Rev E 及 ISO 26262 硬件降额准则，通过硬件驱动优化弥补动态延迟，将结温拉回安全降额线以内；以破坏性台架实测数据作为受控偏差放行的工程证据。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '供应商品质工程师 (SQE)', name: 'SQE Manager', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '器件认证专家', name: 'Component Specialist', status: 'Pending', signDate: '-' },
      { role: '项目经理 (PM)', name: 'Project Director', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前决策虽通过驱动优化压降了温升，但对低温下雪崩击穿耐量的抗辩证据不足！',
    riskGaps: [
      '减小驱动电阻加快了关断速度，必然导致漏源极感应反向尖峰 V_peak = L_stray * di/dt 显著升高，若逼近击穿电压将诱发雪崩。',
      '供应商出具的 PCN 文件未附带 3 批次老化测试报告，存在批次一致性离散风险。',
    ],
    missingEvidenceList: [
      '缺少母线杂散寄生电感 L_stray 的实测或三维 Q3D 提取值。',
      '缺少 -40℃ 极端低温下整车电感性负载断开瞬间的反向浪涌吸收测试波形。',
      '缺少供应商晶圆批次间 Rds(on) 与 Qg 的 6-Sigma 分布直方图。',
    ],
    confidenceScorePct: 71,
  };

  return {
    classifiedInfo,
    multiRiskBreakdown,
    whyNotComparison,
    next24HourPlan,
    edrRecord,
    redTeamChallenge,
  };
}

/**
 * 3. WCCA 极端工况公差叠加场景五大支柱数据
 */
export function getWccaPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredVal = issue.actualMeasurement || 'Worst-Case 极端叠加下基准参考电压误差达到 ±4.2%，超出系统 ±2.0% 门槛';
  const reqVal = issue.requirement || '在全寿命全温区 (-40℃ ~ 125℃) 下模数转换 (ADC) 测量链路总误差 <= ±2.0%';

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-WCCA-01',
      tag: 'MEASURED',
      title: '常温常压实测采样误差表现良好',
      content: '常温 25℃ 单板初测误差仅 ±0.45%，均值偏移 +0.12%，无超差表现',
      sourceOrBasis: '吉时利 6位半高精度数字万用表台架校准采样数据 (#CAL-ADC-25C)',
      confidenceLevel: 99,
      verificationMethod: '高精度电压校准源点对点静态标定',
    },
    {
      id: 'INFO-WCCA-02',
      tag: 'SPEC',
      title: '系统功能安全与客户技术协议极限误差规范',
      content: `${reqVal}；若采样误差 > 2.5% 将导致高压母线过压保护误动作或漏动作 (ISO 26262 ASIL C/D 关键特性)`,
      sourceOrBasis: '整车高压系统安全需求规格书 (SSR-VOLT-MONITOR-02)',
      confidenceLevel: 100,
      verificationMethod: '系统功能安全 FMEA 与危险事件分析 HARA 矩阵',
    },
    {
      id: 'INFO-WCCA-03',
      tag: 'CALCULATED',
      title: '数学严密推导：最坏极端值 (EVA) vs 均方根统计 (RSS)',
      content: 'EVA 最坏极端叠加：ε_total = |ε_init| + |ε_temp| + |ε_aging| = 1.0% + 2.1% + 1.1% = ±4.2% (超标)；RSS 统计叠加：ε_rss = √(1.0² + 2.1² + 1.1²) = ±2.56% (仍超标)',
      sourceOrBasis: 'MathCAD WCCA 数学公差叠加模型分析脚本 (#WCCA-MTH-REV2)',
      confidenceLevel: 95,
      verificationMethod: '蒙特卡洛 100,000 次统计仿真拟合分布曲线',
    },
    {
      id: 'INFO-WCCA-04',
      tag: 'ASSUMPTION',
      title: '工程假设：各器件漂移参数相互独立且符合高斯分布',
      content: '假设基准源温漂与分压电阻老化漂移之间互不相关，协方差 Cov(X, Y) ≈ 0',
      sourceOrBasis: '国际经典 WCCA 行业通用工程假设准则 (AEC-Q200 标准推荐)',
      confidenceLevel: 80,
      verificationMethod: '基于同基板热耦合分布仿真验证相关系数',
    },
    {
      id: 'INFO-WCCA-05',
      tag: 'UNKNOWN',
      title: '未知项：量产产线常温两点校准能否完全消除初始偏置',
      content: '产线在 B 样及量产阶段是否具备高精度恒流源对每个 ECU 进行电擦写 (EEPROM) 偏差校准未知',
      sourceOrBasis: '制造工厂测试工艺规范 (ME 工艺文件尚在编制中)',
      confidenceLevel: 50,
      verificationMethod: '需在 24 小时内与生产制造工艺主管召开接口确认会',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 88,
      level: 'High',
      evidence: 'EVA 极端计算超标达 110% (4.2% vs 2.0%)，统计 RSS 亦超标 28%，裕量完全击穿。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 55,
      level: 'Medium',
      evidence: '长期 10 年 15 万公里老化漂移使电阻碳膜发生不可逆迁移，导致误报率随车龄攀升。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 50,
      level: 'Medium',
      evidence: '若仅更换 0.1% 0805 高精度低温漂电阻，仅涉及元器件料号替代，无需改动铜皮走线。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 35,
      level: 'Low',
      evidence: '升级为 25ppm 0.1% 薄膜电阻单板成本仅增加约 +¥0.45，处于预算容忍区间。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 65,
      level: 'Medium',
      evidence: '混淆“常温实测良好”与“全温寿命极端叠加”，误将实验室常温合格当成全生命周期达标。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option B',
      optionName: '方案 B：软硬协同根治 (分压电阻升级为 25ppm 0.1% + 产线两点软件校准)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '不留任何理论死角。硬件端将 100ppm 1% 厚膜电阻升级为 25ppm 0.1% 薄膜电阻，直接将 EVA 误差从 4.2% 压缩至 1.85% (全达标)；软件端配合生产线两点偏置校准，将常温初始误差归零。',
      keyRiskOrPenalty: 'BOM 增加约 +¥0.45，产线需增加 3 秒单台自动校准工步。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：仅靠纯软件数字低通滤波与动态零漂补偿',
      categoryLabel: '软件优先 / 硬件零成本',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (纯软件妥协)',
      coreTradeoffReason: '软件无法消除硬件分压电阻的温漂系数 (100ppm/℃) 与 10 年物理老化，在高温下电阻物理阻值发生实体漂移，软件盲算无法识别真实电压还是温漂，存在误触发安全断电隐患。',
      keyRiskOrPenalty: '残余功能安全风险依然为 High，无法通过 ISO 26262 ASIL C 安全审计。',
      reActivationCondition: '仅在 BOM 成本被客户以违约金形式强行封死、完全无法增加 1 分钱时作为临时应急。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接以“常温实测仅 0.45%”为由，强行关闭问题不作任何处理',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触犯铁律【原则 2：绝不把常温良品当成全温全寿命合格】！混淆极限 Worst-Case 与常温初测，一旦车辆在漠河极寒 (-40℃) 或吐鲁番暴晒 (85℃) 运行，电压误判将引发整车停机故障，属于原则性否决。',
      keyRiskOrPenalty: '【硬性否决】违反 ISO 26262 单点故障与容错时间要求，导致严重功能安全召回。',
      reActivationCondition: '永久禁止。严禁以常温常压测试数据掩盖 WCCA 理论超标。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 10:30',
        phase: '高精度薄膜电阻打样调件',
        task: '从库房领料 10 套 0.1% 25ppm 0805 薄膜电阻 (Susumu/KOA)，在 B 样板上完成手工高精度返修',
        owner: 'HW 维修技师 + HW 工程师',
        deliverable: '更换后的样件实物与阻值精度显微核验记录',
      },
      {
        timeWindow: '10:30 - 14:00',
        phase: '高低温箱三点高低温实测',
        task: '将改造板放入恒温箱，在 -40℃、+25℃、+105℃ 三个温度点各保温 1 小时，连续采集 ADC 误差曲线',
        owner: 'HW 测试工程师',
        deliverable: '全温区温漂测试曲线图 (要求温漂斜率由 80ppm/℃ 降至 < 20ppm/℃)',
      },
      {
        timeWindow: '14:00 - 16:30',
        phase: '产线两点校准算法验证',
        task: '底层软件刷入 EEPROM 偏置修正固件，验证 25℃ 注入两点基准后全温区残余误差分布',
        owner: 'Embedded Software Lead',
        deliverable: '校准固件补丁包与残余误差统计散点图 (全量 < ±0.9%)',
      },
      {
        timeWindow: '16:30 - 18:00',
        phase: 'WCCA 报告修正与签字',
        task: '将实测温漂数据回填入 MathCAD WCCA 分析模型，重新输出全达标报告，交由系统安全专家审核',
        owner: 'HW Lead + Functional Safety Lead',
        deliverable: '《闭环修正版 WCCA 计算分析报告 (Rev 2.0)》',
      },
    ],
    passFailCriteria: [
      {
        parameter: '全温区 (-40℃ ~ 105℃) 实测最大合成误差 (Max Full-Temp Error)',
        greenCriteria: '实测绝对误差 <= ±1.35% (留有 >= 0.65% 寿命裕量) ➔ 判定优秀放行，固化电阻选型与校准流程',
        yellowCriteria: '±1.35% < 绝对误差 <= ±1.85% (达到合格线但裕量较薄) ➔ 方案 B 准予通过，但需抽检 30 块样板统计一致性',
        redCriteria: '绝对误差 > ±2.0% (依然击穿规范限值) ➔ 立即终止方案 B，触发基准电压芯片更换方案 (换 0.05% 基准芯片)',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-WCCA-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 功能安全主管 (Safety Lead)',
    coreProblem: '高压采样回路在全寿命与高低温极端公差叠加 (EVA) 下理论误差达到 ±4.2%，超出系统规范 ±2.0%。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设各分压电阻老化与温漂彼此独立，符合正态统计分布',
      '假设产线校准设备自身测量不确定度优于 0.02%',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '软硬协同根治 (分压电阻升级为 25ppm 0.1% + 产线两点软件校准)',
    rejectedOptionsSummary: 'Option A (纯软件滤波无法阻断物理温漂，安全风险未除)；Option C (常温良品直接放行触犯全寿命公差红线，一票否决 VETO)。',
    defenseBasis: '依据 ISO 26262 Part 5 硬件架构指标与数学叠加理论，通过提升薄膜物理材料精度将系统 EVA 极限误差压降在规范以内，彻底规避极端工况下误报警隐患。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '系统安全主管 (ASIL C/D)', name: 'System Safety Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '生产制造工艺负责人', name: 'Manufacturing Lead', status: 'Pending', signDate: '-' },
      { role: '项目经理 (PM)', name: 'Project Director', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前计算假设了各电阻老化独立，若贴片相邻处于同一功率热源下，热耦合将破坏统计独立性！',
    riskGaps: [
      '高低边分压电阻若放置在紧邻高发热器件 (如 LDO) 处，局部热梯度会导致温漂同向放大而非相互抵消。',
      '产线两点校准增加了节拍工时，若制造工程因产能压力跳过校准工步，系统将退化为仅靠电阻精度兜底。',
    ],
    missingEvidenceList: [
      '缺少 PCB 版图上采样分压网络的热应力梯度分布仿真云图。',
      '缺少产线自动测试机 (ATE) 30 块样板初始标定数据的重复性 (Gage R&R) 报告。',
      '缺少 1000 小时 125℃ 高温工作寿命 (HTOL) 阻值漂移物理测试曲线。',
    ],
    confidenceScorePct: 74,
  };

  return {
    classifiedInfo,
    multiRiskBreakdown,
    whyNotComparison,
    next24HourPlan,
    edrRecord,
    redTeamChallenge,
  };
}

/**
 * 4. 其它场景通用支柱数据生成函数 (Thermal, Customer, General)
 */
export function getThermalPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredVal = issue.actualMeasurement || '85℃ 环温极限满载工况下 MOSFET 壳温实测 124℃，推算结温 Tj 达到 138.5℃ (裕量仅 11.5℃ < 15℃)';
  const reqVal = issue.requirement || '根据 AEC-Q100/101 与降额规范，结温 Tj_max <= 135℃ (保持相对 150℃ 绝对极限有 >= 15℃ 安全降额)';

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-TH-01',
      tag: 'MEASURED',
      title: '高温风道密闭箱热电偶与红外热像实测',
      content: `${measuredVal}，壳温稳态 124℃，散热片基板稳态 98℃`,
      sourceOrBasis: 'FLIR 车规红外热像仪校准读数 + K型细丝贴片热电偶实测 (#TH-LOG-085C)',
      confidenceLevel: 98,
      verificationMethod: '高低温湿热交变试验箱 85℃ 满载 3 小时热平衡实测',
    },
    {
      id: 'INFO-TH-02',
      tag: 'SPEC',
      title: '车规半导体器件结温降额规范红线',
      content: `${reqVal}；严禁在长期运行工况下突破 135℃ 降额红线，否则触发热疲劳早期失效`,
      sourceOrBasis: 'AEC-Q101 Rev E 标准 & 客户整车热负荷协议 (CSA-THERMAL-SEC2)',
      confidenceLevel: 100,
      verificationMethod: '汽车行业可靠性降额设计标准手册',
    },
    {
      id: 'INFO-TH-03',
      tag: 'CALCULATED',
      title: '热阻网络与内部晶圆结温物理推算',
      content: '结温推导公式：Tj = Tc + P_loss * Rth_jc = 124℃ + 3.45W * 4.2℃/W = 138.49℃，超出 135℃ 降额红线 3.5℃',
      sourceOrBasis: '热欧姆定律与 Foster 瞬态热阻网络方程',
      confidenceLevel: 93,
      verificationMethod: '热仿真软件 FloTHERM 3D 网格热场仿真校核',
    },
    {
      id: 'INFO-TH-04',
      tag: 'ASSUMPTION',
      title: '工程假设：导热垫片长期热阻无粉化衰减',
      content: '假设导热硅脂/导热垫在 10 年寿命期内导热系数稳定在 3.0 W/m·K，无出油干枯粉化现象',
      sourceOrBasis: '导热材料原厂初期 Datasheet (未经验证高温 1000h 老化数据)',
      confidenceLevel: 65,
      verificationMethod: '需进行 1000 小时 125℃ 高温烘烤热阻衰减试验',
    },
    {
      id: 'INFO-TH-05',
      tag: 'UNKNOWN',
      title: '未知项：整车发动机舱/座舱实际装车工况下的微风速对流状态',
      content: '台架试验为密闭静态自然对流，未知整车级风道是否有微风 (0.5m/s) 辅助对流散热',
      sourceOrBasis: '整车热管理团队仿真数据未冻结',
      confidenceLevel: 45,
      verificationMethod: '需协调整车热害试验工程师获取机舱 CFD 风速矢量场',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 79,
      level: 'High',
      evidence: '结温 138.5℃ 突破 135℃ 降额红线 3.5℃，设计裕量倒挂。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 85,
      level: 'High',
      evidence: '长期高温导致芯片封装键合线 (Bonding Wire) 焊料层发生热机械疲劳龟裂。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 45,
      level: 'Low',
      evidence: '优先通过软件降频限流或升级高导热垫片解决，无需推倒结构模具。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 30,
      level: 'Low',
      evidence: '更换 6.0 W/m·K 导热垫片仅增加单件 ¥1.20，远低于结构重新开模费用。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 70,
      level: 'Medium-High',
      evidence: '实测壳温推导结温依赖固化热阻 Rth_jc，缺少器件结温直接电学法 (Vsd 温敏参数法) 校核。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option B',
      optionName: '方案 B：软硬协同温控 (升级 6.0 W/m·K 高导热垫 + 软件自适应高温降频)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '立竿见影。硬件端换装 6.0 W/m·K 纳米相变导热垫，将接触热阻降低 50%，壳温压降 6.5℃；软件端配置高温动态降额策略（当感测温度 > 105℃ 时自适应降低 15% 占空比），双重防线彻底将 Tj 压至 126℃ (安全裕量 24℃)。',
      keyRiskOrPenalty: '单台物料增加 ¥1.20，需标定高温降频阈值。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：推倒重来，重新开模加大金属散热齿鳍片',
      categoryLabel: '结构大改版 / 周期严重失控',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (重新开模改结构)',
      coreTradeoffReason: '虽然增加外壳散热面积能从被动物理上散热，但压铸铝模具修改需要 45 天，模具费用高达 ¥80,000，且修改后外壳尺寸增大，将与整车安装支架产生机械干涉，完全不可行。',
      keyRiskOrPenalty: '模具周期 45 天导致整车量产 SOP 严重延期，产生违约危机。',
      reActivationCondition: '仅在所有电气散热优化手段均穷尽且外壳空间有富余时考虑。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接以“未超过 150℃ 绝对破坏极限”为由，强行免改放行',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触犯铁律【原则 4：绝不能混淆降额红线与破坏极限】！150℃ 是半导体硅片发生内部载流子雪崩与永久烧毁的破坏性极限，并非量产安全裕量！长期在 138℃ 运行将导致器件失效率从 PPM 级飙升至百分比级，直接一票否决。',
      keyRiskOrPenalty: '【硬性否决】违反车规 AEC-Q100 降额标准，夏季高温批量烧片爆雷。',
      reActivationCondition: '永久禁止。严禁突破车规降额底线。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 10:30',
        phase: '高导热垫片装配替换',
        task: '领用 6.0 W/m·K 优质相变导热垫 (Bergquist/Laird)，重新涂布并以定扭矩螺丝刀紧固机壳螺栓',
        owner: 'HW 结构工程师',
        deliverable: '装配扭矩记录表 (0.6 N·m) 与垫片贴合平整度检查记录',
      },
      {
        timeWindow: '10:30 - 14:30',
        phase: '85℃ 满载热平衡连续实测',
        task: '恒温箱升温至 85℃，带额定满载连续运行 4 小时，热电偶每 5 分钟自动记录一次温升曲线',
        owner: 'HW 试验工程师',
        deliverable: '稳态壳温对比曲线 (要求壳温由 124℃ 降至 <= 116℃)',
      },
      {
        timeWindow: '14:30 - 17:00',
        phase: '软件过热限流保护标定',
        task: '在测试台架注入 95℃ 与 105℃ 触发信号，验证驱动固件是否按梯度平滑限制最大输出电流',
        owner: 'Motor Control SW Lead',
        deliverable: '过热降额阶梯响应曲线图与故障码 DTC 记录',
      },
      {
        timeWindow: '17:00 - 18:30',
        phase: '热风险归档签署',
        task: '整理热阻测试数据，召开硬件与质量评审会，签署热降额合规决议',
        owner: 'HW Lead + QA Manager',
        deliverable: '《ECU 热降额合规判定报告与 EDR 归档单》',
      },
    ],
    passFailCriteria: [
      {
        parameter: '换装高导热垫后 85℃ 极限满载稳态结温 Tj (推算值)',
        greenCriteria: 'Tj <= 128.0℃ (安全降额裕量 >= 22.0℃) ➔ 判定完全达标，准予量产冻结',
        yellowCriteria: '128.0℃ < Tj <= 134.0℃ (裕量在 16℃~22℃ 之间) ➔ 方案 B 准予通过，但要求软件降频阈值提前 5℃ 启动',
        redCriteria: 'Tj > 135.0℃ (突破 135℃ 降额红线) ➔ 方案 B 失效，立即召开紧急工程会议评估降低额定输出功率',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-THM-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 热设计专家',
    coreProblem: '85℃ 极限环温满载工况下功率器件结温达到 138.5℃，突破 135℃ 车规降额红线 (裕量仅 11.5℃)。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设导热界面材料 (TIM) 在长期 1000h 高温老化下热阻衰减率 <= 15%',
      '假设整车结构装配扭矩恒定，界面接触压力 >= 30 psi',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '软硬协同温控 (升级 6.0 W/m·K 高导热垫 + 软件自适应高温降频)',
    rejectedOptionsSummary: 'Option A (模具重新开模需 45 天且尺寸干涉，完全不可行)；Option C (突破降额红线盲目放行触犯 AEC-Q100 红线，一票否决 VETO)。',
    defenseBasis: '依据 AEC-Q100/101 车规降额规范与物理热传导模型，采用低热阻界面材料配合固件主动热保护闭环，将器件稳态运行结温控制在 128℃ 安全区间以内。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '结构热设计工程师', name: 'Thermal Architect', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '产品质量负责人', name: 'Quality Lead', status: 'Pending', signDate: '-' },
      { role: '系统软件主管', name: 'Firmware Lead', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前结温数据基于稳态计算，未计入急加减速瞬间高达 25W 的脉冲热阻瞬态冲击！',
    riskGaps: [
      '器件结到壳瞬态热阻抗 Zth_jc 具有时间常数，在突加重载前 100ms 晶圆微区温升速率远高于壳温上升速度。',
      '相变导热材料在首次升温相变前接触热阻较大，初始冷态加重载可能出现微秒级热冲击超限。',
    ],
    missingEvidenceList: [
      '缺少 100ms 脉冲大电流工况下的 RC 梯形 Foster 瞬态热阻网络仿真曲线。',
      '缺少相变材料在 -40℃ 冷启动工况下的接触界面热阻实测数据。',
    ],
    confidenceScorePct: 76,
  };

  return {
    classifiedInfo,
    multiRiskBreakdown,
    whyNotComparison,
    next24HourPlan,
    edrRecord,
    redTeamChallenge,
  };
}

/**
 * 6. BLDC 电机驱动急停泵升与米勒直通场景五大支柱数据
 */
export function getBldcPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredVal = issue.actualMeasurement || '3800rpm 急停母线泵升实测 37.8V (逼近 40V 极限)，门极米勒尖峰 2.15V > 2.0V 阈值，48MHz 开关振铃传导超标';
  const reqVal = issue.requirement || '母线过压峰值 <= 34.0V (AEC-Q101 85% 降额线)，米勒感应尖峰 <= 1.0V，CISPR 25 Class 5 传导达标';

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-BLDC-01',
      tag: 'MEASURED',
      title: '示波器高频双探头实测母线泵升与门极尖峰',
      content: `${measuredVal}；示波器捕捉急停瞬间相线反向浪涌与开关节点 48MHz 高频振铃`,
      sourceOrBasis: 'Tektronix MSO54B 示波器 1GHz 高压差分探头实测波形 (#WAVE-BLDC-3800RPM)',
      confidenceLevel: 99,
      verificationMethod: '电机台架 3800rpm 满载额定扭矩急停断电实测',
    },
    {
      id: 'INFO-BLDC-02',
      tag: 'SPEC',
      title: '车规电气瞬态与 MOSFET 降额设计红线',
      content: `${reqVal}；严禁在器件单脉冲雪崩耐量 (E_as) 外运行，严禁上下桥臂存在任何瞬态直通 (Shoot-through) 风险`,
      sourceOrBasis: 'ISO 16750-2:2012 Section 4.6.2 & 公司《功率驱动降额规范》',
      confidenceLevel: 100,
      verificationMethod: '车规标准与器件绝对最大额定值 (Abs Max Ratings)',
    },
    {
      id: 'INFO-BLDC-03',
      tag: 'CALCULATED',
      title: '电感储能释放与转子动能泵升能量方程',
      content: '动能与磁能回馈计算：E_kinetic = 0.5 * J * ω² = 0.5 * 2.8e-4 * (397.9)² = 22.16 J；若母线仅靠 470uF 电解电容吸收，理论电压冲高至 √(2*E/C + V0²) = 307V，必须依靠能耗制动或主动钳位消纳！',
      sourceOrBasis: '机电能量守恒微分方程与电磁暂态模型推导',
      confidenceLevel: 96,
      verificationMethod: 'Simulink/PLECS 暂态电机模型仿真校对',
    },
    {
      id: 'INFO-BLDC-04',
      tag: 'ASSUMPTION',
      title: '工程假设：MOSFET 脉冲电流 SOA 安全裕度',
      content: '假设下桥三相短接动态制动瞬间产生 24A/200ms 制动电流，处于 MOSFET 55A 脉冲 SOA 安全区以内，结温瞬态上升 <= 12.5℃',
      sourceOrBasis: 'MOSFET Datasheet 脉冲电流安全工作区 (SOA) 曲线估算',
      confidenceLevel: 75,
      verificationMethod: '需在 85℃ 发泡温箱中做连续 1500 次急停温升积累实测',
    },
    {
      id: 'INFO-BLDC-05',
      tag: 'UNKNOWN',
      title: '未知项：整车线束分布寄生电感 (L_cable) 对母线尖峰的叠加效应',
      content: '未知当整车装车搭载长达 3.5 米未屏蔽线束时，线缆寄生电感 (约 3.5uH) 导致的感应电动势叠加量',
      sourceOrBasis: '当前台架采用 0.5m 短线束，整车长线束试制件下周到货',
      confidenceLevel: 40,
      verificationMethod: '需在 24 小时内串入 3.5uH 射频扼流电感模拟长线束边界',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 92,
      level: 'High',
      evidence: '母线泵升 37.8V 逼近 40V 绝对破坏极限，米勒感应 2.15V 击穿阈值，裕量严重倒挂。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 88,
      level: 'High',
      evidence: '高温下晶圆阈值电压降至 1.4V，2.15V 米勒尖峰将直接导致同相桥臂直通，引起炸机。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 55,
      level: 'Medium',
      evidence: '采用方案 A 软硬件协同治理仅需 2~3 天，完全适配 15 天 DV 节点。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 25,
      level: 'Low',
      evidence: '方案 A 单板 BOM 仅增加 $0.12 (满足 +$0.35 预算红线)，无需推倒 PCB 投板。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 65,
      level: 'Medium',
      evidence: '台架短线束无法完全模拟整车 3.5m 寄生感抗，需追加串联感抗验证。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option A',
      optionName: '方案 A：三相全下桥能耗制动 + 门极米勒钳位/加速关断 + 48MHz RC Snubber',
      categoryLabel: '软硬协同 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 A (核心推荐)',
      coreTradeoffReason: '从物理能量源头彻底治理。利用电机定子铜耗消纳动能，母线冲高直接由 37.8V 降至 16.5V (裕量 23.5V)；门极有源米勒钳位将尖峰压死至 0.32V；RC Snubber 解决 48MHz 振铃辐射，全面达标且 3 天内可完成。',
      keyRiskOrPenalty: '制动瞬间机械减速力矩较大，需确认齿轮箱机械反冲冲击。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option B',
      optionName: '方案 B：硬件硬改版 (并联 3 颗 1500W TVS + 1500uF 大固态电解电容)',
      categoryLabel: '硬件硬改版 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 B (一票否决 VETO)',
      coreTradeoffReason: '重新投板打样周期需要 21 天，直接击穿当前 15 天 DV 准入节点！单板成本增加 $1.45 严重击穿客户商务协议 +$0.35 预算上限 (超标 314%)，且大尺寸电解电容无法装入结构外壳。',
      keyRiskOrPenalty: '【硬性否决】关键节点延期违约、成本严重超标、外壳机械干涉。',
      reActivationCondition: '永久禁止。严禁在成本超标 300% 且延期违约下推进硬改版。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接改成自由滑行停机 (Coast-down)，不开启任何制动',
      categoryLabel: '极简投机 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '自由滑行消除母线泵升，但导致急停制动时间长达 1850ms，直接违背客户关于“紧急制动响应时间 <= 250ms 防夹保护”的法规安全目标 (ISO 26262 ASIL B)，直接触发安全一票否决！',
      keyRiskOrPenalty: '【硬性否决】违反整车防夹功能安全标准，属于严重人身夹伤安全隐患。',
      reActivationCondition: '永久禁止。涉及人身安全防夹特性的参数严禁以牺牲响应时间为代价妥协。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 11:00',
        phase: '底层驱动固件三相下桥刷写',
        task: '在 MCU 底层配置急停中断：上桥关断、三路下桥 MOS 强制导通 500ms 动态制动，烧录固件至 B 样测试样机',
        owner: 'Motor Control SW Lead',
        deliverable: '急停能耗制动固件补丁与自检报告',
      },
      {
        timeWindow: '11:00 - 14:00',
        phase: '门极加速关断与 RC Snubber 贴片',
        task: '在逆变桥开关节点手工焊接 1360pF NPO + 4.7Ω 0805 阻容，MOSFET 门极并联 1N4148+1.5Ω 加速放电支路',
        owner: 'HW 电机专家 (刘工)',
        deliverable: '电路改制样件与焊接阻抗显微检验记录',
      },
      {
        timeWindow: '14:00 - 17:30',
        phase: '台架双通道示波器瞬态捕捉',
        task: '在电机台架以 3800rpm 转速连续触发 10 次急停，捕捉母线电压峰值与下桥 Vgs/Vds 米勒尖峰波形',
        owner: 'HW 工程师 + 台架测试技术员',
        deliverable: '示波器高清波形截图与峰值电压记录单',
      },
      {
        timeWindow: '17:30 - 19:30',
        phase: '85℃ 高温温箱初步热冲击验证',
        task: '放入高温箱升温至 85℃，连续急停 50 次，监测 MOSFET 表面红外热像温度上升梯度',
        owner: '可靠性测试工程师',
        deliverable: '85℃ 高温下急停温升数据表 (要求温升上升 < 15℃)',
      },
    ],
    passFailCriteria: [
      {
        parameter: '3800rpm 急停母线最高电压峰值 (Bus Overvoltage Peak)',
        greenCriteria: '实测峰值 <= 20.0V (安全裕量 >= 20.0V) ➔ 判定完全达标，准予固化至正式代码库',
        yellowCriteria: '20.0V < 实测峰值 <= 32.0V (留有 8V 降额裕量) ➔ 方案 A 准予通过，但需微调下桥导通维持时间至 650ms',
        redCriteria: '实测峰值 > 34.0V (击穿 34V 车规降额红线) ➔ 立即中止，母线追加 SMCJ24CA 600W TVS 辅助削峰',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-BLDC-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 电机控制系统专家',
    coreProblem: '3800rpm 急停时动能回馈倒灌使母线冲高至 37.8V 逼近 40V 极限耐压，米勒感应 2.15V > 2.0V 存在高温直通炸管隐患。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设下桥动态制动脉冲电流 24A 处于 55A MOSFET 安全工作区以内',
      '假设电机齿轮箱机械结构允许急停时最大制动力矩冲击',
    ],
    chosenOptionId: 'Option A',
    chosenOptionTitle: '三相全下桥能耗制动 + 门极米勒钳位/加速关断 + 48MHz RC Snubber',
    rejectedOptionsSummary: 'Option B (周期 21 天违约且 BOM 超支 314%，一票否决 VETO)；Option C (自由滑行响应延误 1850ms 违背防夹安全目标，一票否决 VETO)。',
    defenseBasis: '依据机电能量守恒定律与 ISO 16750-2 车规暂态标准，通过下桥短接将回馈动能闭环转化为绕组铜耗，从根源消除母线泵升，兼顾功能安全与成本交付。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Motor Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '电机控制算法主管', name: 'Motor Control Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '功能安全代表 (ASIL B)', name: 'Safety Architect', status: 'Pending', signDate: '-' },
      { role: '项目经理 (PM)', name: 'Project Director', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前能耗制动方案将全部动能卸载在下桥 MOSFET 与电机相线绕组中，高频连续急停存在热击穿风险！',
    riskGaps: [
      '若车辆在极端恶劣路况或调试阶段频繁每隔 2 秒触发一次急停，结温累积效应可能突破 150℃ 绝对损坏极限。',
      '三相全下桥短接依赖 MCU 正常发出驱动信号，若 MCU 供电丢失或跑飞，系统将退化为无制动滑行或上下桥同时关断引发高压泵升。',
    ],
    missingEvidenceList: [
      '缺少 10 秒间隔连续 500 次急停的晶圆结温动态累积推导热阻仿真。',
      '缺少在 MCU 掉电死机状态下预驱芯片硬件级自主掉电短路保护 (Passive Braking) 的实测波形。',
    ],
    confidenceScorePct: 82,
  };

  return {
    classifiedInfo,
    multiRiskBreakdown,
    whyNotComparison,
    next24HourPlan,
    edrRecord,
    redTeamChallenge,
  };
}

/**
 * 5. 通用/默认场景五大支柱数据生成函数 (General Fallback)
 */
export function getGeneralPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  // 默认根据当前工程分类动态适配
  const isEmc = issue.issueCategories.includes('EMC');
  const isComponent = issue.issueCategories.includes('Component Alternative');
  const isWcca = issue.issueCategories.includes('WCCA');
  const isThermal = issue.issueCategories.includes('Thermal') || issue.issueCategories.includes('Power');

  if (isEmc) return getEmcPillars(context, issue);
  if (isComponent) return getComponentPillars(context, issue);
  if (isWcca) return getWccaPillars(context, issue);
  if (isThermal) return getThermalPillars(context, issue);

  // 默认兜底
  return getEmcPillars(context, issue);
}
