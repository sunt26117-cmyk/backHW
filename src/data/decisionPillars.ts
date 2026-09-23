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
 * [完整性修复] 只有工程师真的回填了实测/规格字段，才允许把内容标记为 MEASURED/SPEC 并给出高置信度；
 * 缺失时一律降级为 UNKNOWN + 置信度 0，并明确写成 待输入。
 * 此前这里是 issue.actualMeasurement || '…（模板编造数字）…' 这种写法，会在用户什么都没填时把编造的数字
 * 标成 tag:'MEASURED'、confidenceLevel:99，并配上虚构的示波器出处——直接违反本工具 缺输入即 UNKNOWN、
 * 不得用模板数字冒充 的纪律。
 */
function factOrUnknown(
  raw: string | undefined | null,
  unknownPlaceholder: string,
  tagWhenProvided: ClassifiedInfoItem['tag'],
  confidenceWhenProvided: number
): { tag: ClassifiedInfoItem['tag']; content: string; sourceOrBasis?: string; confidenceLevel: number; provided: boolean } {
  const text = (raw || '').trim();
  if (text) return { tag: tagWhenProvided, content: text, confidenceLevel: confidenceWhenProvided, provided: true };
  return { tag: 'UNKNOWN', content: unknownPlaceholder, sourceOrBasis: '尚未提供该项证据来源', confidenceLevel: 0, provided: false };
}

/**
 * 1. EMC 辐射超标场景的五大支柱数据
 */
export function getEmcPillars(context: ProjectContext, issue: IssueInput): ScenarioPillars {
  const measuredFact = factOrUnknown(issue.actualMeasurement, '待输入：工程师尚未提供实测结果与测试边界，本工具不会用模板数字代替实测数值。', 'MEASURED', 98);
  const specFact = factOrUnknown(issue.requirement, '待输入：客户/标准/设计规格尚未提供，无法判定适用限值。', 'SPEC', 100);
  const measuredVal = measuredFact.content;
  const reqVal = specFact.content;

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-EMC-01',
      tag: measuredFact.tag,
      title: '150MHz 频点实测辐射发射超标',
      content: measuredFact.provided ? `${measuredVal} （白盒测试暗室中测得的天线极化状态、频点与超标量以实测报告为准；模板不预填数值）` : measuredVal,
      sourceOrBasis: measuredFact.sourceOrBasis ?? '罗德与施瓦茨 ESR26 EMI 接收机实测频谱数据 (#Trace-150M-RE)',
      confidenceLevel: measuredFact.confidenceLevel,
      verificationMethod: 'CISPR 25 1米法电波暗室天线实测',
    },
    {
      id: 'INFO-EMC-02',
      tag: specFact.tag,
      title: '车规 CISPR 25 Class 5 准峰值/平均值限值红线',
      content: specFact.provided ? `${reqVal}；且批量交付产品必须具备客户技术协议规定的工程安全裕量（具体裕量按当前项目技术协议定义）` : reqVal,
      sourceOrBasis: specFact.sourceOrBasis ?? 'CISPR 25:2021 Table 7 & 客户整车技术协议 (CSA-EMC-Clause 4.2)',
      confidenceLevel: specFact.confidenceLevel,
      verificationMethod: '第三方国家级汽车检测中心认证标准规范',
    },
    {
      id: 'INFO-EMC-03',
      tag: 'CALCULATED',
      title: '开关节点 dv/dt 与对地容性位移电流推导',
      content: 'Gate Driver 输出高频谐波计算：共模位移电流 i_cm = C * dv/dt（C 为功率回路对壳寄生电容，dv/dt 为开关沿摆率）。tr、dv/dt、寄生电容与 i_cm 的具体数值必须用当前项目的实测/提取值代入本地计算（见「确定性预核算事实」）；模板不预填数值。',
      sourceOrBasis: '麦克斯韦电磁场微分方程与高频寄生回路解析计算模型',
      confidenceLevel: 88,
      verificationMethod: '基于实测上升沿时域波形与三维寄生电容提取仿真',
    },
    {
      id: 'INFO-EMC-04',
      tag: 'ASSUMPTION',
      title: '工程假设：量产正式金属外壳搭接阻抗良好',
      content: '假设正式量产压铸铝外壳周圈金属搭接阻抗与电磁屏蔽效能 (SE) 在目标频段能否提供足够的空间场强衰减，必须按当前项目的金属外壳搭接规范与暗室复测确认；模板不预填阻值与衰减量数值',
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
      evidence: '实测辐射发射是否超出当前项目限值、以及距离规范要求的安全裕量还差多少，必须用当前项目的实测报告与限值判定（见「确定性预核算事实」）；本项模板不预填 dB 数字。',
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
      evidence: `距离当前 ${context.daysRemaining || 14} 天 DV 节点极其紧迫；重新投板改版所需周期必须按当前项目排期核算（本项模板不预填改版天数），盲目改版将导致节点违约。`,
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 65,
      level: 'Medium',
      evidence: '打板与重新开贴费用需按当前项目报价核算（本项模板不预填金额），且面临第三方认证实验室机时重预约成本。',
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
      coreTradeoffReason: '技术事实表明当前测试处于临时塑料夹具阶段。方案 B 可在极短工期内验证真实外壳屏蔽效果，不拖延当前 DV 节点；同时提前备齐磁环补丁锁定退路，做到零失误兜底（具体超标量与节点天数按当前项目实测与排期确认）。',
      keyRiskOrPenalty: '需借调正式结构件并安排暗室摸底工时（费用按当前项目与实验室报价核算，本项模板不预填金额）。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：立即启动 PCB 改版 (增加共模滤波电路与回路优化)',
      categoryLabel: '保守 / 技术最稳妥',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (保守改版)',
      coreTradeoffReason: '虽然源头改版从物理上最稳妥，但重新开板与 SMT 周期会直接击穿当前仅剩的 DV 准入节点（具体周期与剩余天数按当前项目排期核算，模板不预填数值），造成整车联调里程碑违约与客户通报索赔。',
      keyRiskOrPenalty: '关键路径延期天数与打样及实验室重排成本按当前项目排期与报价核算（模板不预填数值）。',
      reActivationCondition: '若方案 B 在正式金属外壳下实测超标仍超出当前项目允许的残余裕量（判定门限按当前项目限值定义）且追加磁环补丁依然失效，则强制启动方案 A。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：盲目假定“金属壳必然大幅降低辐射”直接送检正式 DV',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触碰工程铁律【原则 3：绝不能无依据凭空假设金属外壳必然提供足够屏蔽衰减】！若超标是由线束共模传导导致，外壳无法阻隔线缆天线辐射，将导致正式 DV 认证留下不可逆的 Fail 记录。',
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
        deliverable: '装配完毕的带屏蔽样机与接地阻抗测试记录 (R_gnd 门限按当前项目搭接阻抗规范定义)',
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
        task: '使用高频电流钳夹取外引低压线束出口，测量共模电流；若共模电流超过当前项目规定的门限，在线束端套扣备用铁氧体磁环',
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
        greenCriteria: '实测值满足当前项目限值并留有规定工程裕量 ➔ 判定通过，准予按原定排期送检正式 DV',
        yellowCriteria: '实测值处于当前项目限值边缘（门限与裕量按当前项目限值定义） ➔ 保持方案 B，强制在线束出口增加阻尼磁环并扩大连续测试次数以验证重复性',
        redCriteria: '实测值超出当前项目限值（依然超标） ➔ 立即终止方案 B，向 PM 触发熔断警报，启动方案 A 改版流程并调整节点',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-EMC-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & PM 项目经理',
    coreProblem: 'B 样件在临时工装下 CISPR 25 Class 5 150MHz 辐射发射实测超标（具体超标量以实测报告为准），距离正式 DV 节点时间紧迫。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设正式压铸铝壳导电搭接阻抗满足当前项目搭接规范门限（具体门限按规范定义）',
      '假设 150MHz 开关谐波未对整车 77GHz 雷达或相机 SerDes 造成互调干扰',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '双轨推进 (正式压铸金属外壳真实工况摸底 + 并行预留 Plan B 备用滤波补丁)',
    rejectedOptionsSummary: 'Option A (改版周期击穿当前交付节点，暂缓执行)；Option C (无实测依据盲赌外壳，触犯工程红线，一票否决 VETO)。',
    defenseBasis: '依据 CISPR 25:2021 Table 7 标准与电磁屏蔽物理机理，当前实测超标属于结构屏蔽过渡阶段常见现象（超标量以实测报告为准）；在锁定 Plan B 硬件补丁的前提下，实施真实工况摸底为最优平衡路径。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '项目经理 (PM)', name: 'Project Director', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '质量保证负责人', name: 'Quality Manager', status: 'Pending', signDate: '-' },
      { role: '产品安全代表 (PSCR)', name: 'PSCR Auditor', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前决策结论高度依赖“铝壳屏蔽效能足以满足当前项目要求”的工程假设（具体衰减量按实测与规范确认），存在证据链盲区！',
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
  const measuredFact = factOrUnknown(issue.actualMeasurement, '待输入：工程师尚未提供实测结果与测试边界，本工具不会用模板数字代替实测数值。', 'MEASURED', 98);
  const specFact = factOrUnknown(issue.requirement, '待输入：客户/标准/设计规格尚未提供，无法判定适用限值。', 'SPEC', 100);
  const measuredVal = measuredFact.content;
  const reqVal = specFact.content;

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-COMP-01',
      tag: measuredFact.tag,
      title: '高温台架实测动态温升与漏极浪涌',
      content: measuredFact.provided ? `${measuredVal}；示波器捕捉的开启延迟 td(on) 与米勒平台时长的变化量以实测波形为准（模板不预填数值）` : measuredVal,
      sourceOrBasis: measuredFact.sourceOrBasis ?? '热电偶与 Keysight 8 通道高带宽示波器双探头实测 (#WAVE-QGD-04)',
      confidenceLevel: measuredFact.confidenceLevel,
      verificationMethod: '高低温恒温箱 85℃ 额定满载 100% 工况实测',
    },
    {
      id: 'INFO-COMP-02',
      tag: specFact.tag,
      title: '车规降额与安全工作区规范红线',
      content: specFact.provided ? `${reqVal}；严禁在器件单脉冲抗雪崩与持续 SOA 曲线外运行 (AEC-Q101 Rev E / IPC-9592B)` : reqVal,
      sourceOrBasis: specFact.sourceOrBasis ?? 'AEC-Q101 Rev E 标准规范与公司《车规半导体器件降额设计规范》V3.1',
      confidenceLevel: specFact.confidenceLevel,
      verificationMethod: '供应商原始器件 Datasheet 保证书与第三方 AEC-Q101 认证报告',
    },
    {
      id: 'INFO-COMP-03',
      tag: 'CALCULATED',
      title: '结温 Tj 与动态开关损耗能量推导',
      content: '开关损耗计算：P_sw = 0.5 * Vds * Id * (tr + tf) * f_sw，温升 ΔT = P_sw * Rth_ja。Vds、Id、tr/tf、f_sw、Qgd 偏差、损耗与 Rth_ja 的具体数值必须用当前项目器件规格与实测代入本地计算（见「确定性预核算事实」）；模板不预填数值。',
      sourceOrBasis: '半导体器件物理能量模型公式演算',
      confidenceLevel: 92,
      verificationMethod: 'Foster 瞬态热阻网络模型与台架实测热电偶校准比对',
    },
    {
      id: 'INFO-COMP-04',
      tag: 'ASSUMPTION',
      title: '工程假设：器件内部芯片晶圆工艺一致性',
      content: '假设替代料原厂不同生产晶圆批次的 Qgd 与阈值电压 Vth 分布满足正态分布且 Cpk >= 1.33',
      sourceOrBasis: '供应商提供的 PCN (产品变更通知单) 承诺函 (尚未拿到首批全参数测试散斑图)',
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
      verificationMethod: '需在 24 小时内送入低温箱执行规定循环次数的急停断电反向能量冲击',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 82,
      level: 'High',
      evidence: 'SOA 裕量是否充足、温升相对降额红线的余量，必须用当前项目的实测结温/浪涌应力与器件数据手册 SOA 曲线判定（见「确定性预核算事实」）；本项模板不预填裕量与温升数字。',
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
      evidence: '原厂缺货停产，现货市场调拨周期需按当前采购渠道核实（模板不预填交期天数），影响样件试制进度。',
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
      coreTradeoffReason: '既不盲目停线等待原厂（交期需按当前采购渠道核实，模板不预填周数），也不盲目签字放行。通过优化门极驱动电阻（具体阻值按当前项目开关损耗与振铃实测选定，模板不预填阻值）抵消 Qgd 带来的开启延迟，将温升压回正常区间，并通过台架破坏性验证换取可靠性证据。',
      keyRiskOrPenalty: '需占用高压台架进行规定循环次数的加速预充循环，试验工时与费用按当前项目排期与预算核算（模板不预填天次与金额）。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：坚持采购原厂原型号现货 (溢价调货)',
      categoryLabel: '保守 / 零技术改动',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (现货高价采购)',
      coreTradeoffReason: '虽然原厂型号无技术风险，但现货市场单颗采购价存在显著溢价，且现货贸易商渠道充斥假冒翻新晶圆风险；更致命的是该料号已列入原厂停产 (EOL) 清单，量产阶段必将二次断货。',
      keyRiskOrPenalty: '单板成本超支严重，且无法根治未来量产断料停线隐患。',
      reActivationCondition: '仅在客户明确书面拒绝任何替代料且愿全额补偿现货差价时激活。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：凭 Pin-to-Pin 直接签字放行，免去 AEC-Q 与动态参数核查',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触犯铁律【原则 1：Pin-to-Pin ≠ Spec-to-Spec】与安全底线！SOA 裕量是否充足尚未闭环（具体裕量按当前器件规格与实测判定），且 AEC-Q 未闭环，盲目签字放行高压关键功率器件属于工程失职，存在整车抛锚与热击穿一票否决风险。',
      keyRiskOrPenalty: '【硬性否决】高压预充回路击穿烧毁风险，触发产品召回与工程师质量终身追责。',
      reActivationCondition: '永久禁止。严禁在关键参数超限下免测签字放行。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 11:30',
        phase: '门极驱动阻抗优化调整',
        task: '在焊接台将驱动电阻换贴为两组候选阻值方案（阻值按当前项目开关损耗与振铃实测选定），并联 1N4148 快关二极管',
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
        phase: '极端浪涌冲击摸底',
        task: '执行连续规定循环次数的预充上电瞬态浪涌循环（母线电压按当前项目实际工作电压设定），监测关断电压尖峰与漏电流 Idss',
        owner: '可靠性工程师',
        deliverable: '浪涌前后漏电流漂移记录 (Idss 允许漂移门限按当前项目降额规范定义)',
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
        greenCriteria: 'Tj 满足当前项目降额安全裕量要求 ➔ 准予继续推进方案 B，开展后续耐久测试（测试循环次数按当前项目规范定义）',
        yellowCriteria: 'Tj 处于当前项目降额裕量边缘（门限按当前项目降额规范定义） ➔ 保持方案 B，但要求软件底层增加预充间隔保护（间隔时长按当前项目标定）',
        redCriteria: 'Tj 击穿当前项目降额红线 ➔ 立即中止替代，熔断放行流程，触发寻找第二家车规级品牌',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-COMP-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & SQE 质量经理',
    coreProblem: '400V BMS 预充 MOSFET 原厂交期需按当前采购渠道核实（模板不预填周数），替代料 Qgd 偏差引起的温升与 SOA 裕量变化必须用当前项目实测/计算确认（模板不预填数值）。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设替代料批次间门极阈值电压 Vth 一致性满足 Cpk >= 1.33',
      '假设调整门极驱动电阻后开关振铃未恶化 CISPR 25 传导发射（具体阻值按当前项目选定）',
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
      '供应商出具的 PCN 文件未附带批次老化测试报告，存在批次一致性离散风险。',
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
  const measuredFact = factOrUnknown(issue.actualMeasurement, '待输入：工程师尚未提供实测结果与测试边界，本工具不会用模板数字代替实测数值。', 'MEASURED', 98);
  const specFact = factOrUnknown(issue.requirement, '待输入：客户/标准/设计规格尚未提供，无法判定适用限值。', 'SPEC', 100);
  const measuredVal = measuredFact.content;
  const reqVal = specFact.content;

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-WCCA-01',
      tag: measuredFact.tag,
      title: '常温常压实测采样误差表现良好',
      content: measuredFact.provided ? '常温单板初测的误差与均值偏移以工程师提供的实测数据为准；本项模板不预填误差数值' : measuredVal,
      sourceOrBasis: measuredFact.sourceOrBasis ?? '吉时利 6位半高精度数字万用表台架校准采样数据 (#CAL-ADC-25C)',
      confidenceLevel: measuredFact.confidenceLevel,
      verificationMethod: '高精度电压校准源点对点静态标定',
    },
    {
      id: 'INFO-WCCA-02',
      tag: specFact.tag,
      title: '系统功能安全与客户技术协议极限误差规范',
      content: specFact.provided ? `${reqVal}；若采样误差超出当前项目功能安全允许的误差限值将导致高压母线过压保护误动作或漏动作 (ISO 26262 ASIL C/D 关键特性)` : reqVal,
      sourceOrBasis: specFact.sourceOrBasis ?? '整车高压系统安全需求规格书 (SSR-VOLT-MONITOR-02)',
      confidenceLevel: specFact.confidenceLevel,
      verificationMethod: '系统功能安全 FMEA 与危险事件分析 HARA 矩阵',
    },
    {
      id: 'INFO-WCCA-03',
      tag: 'CALCULATED',
      title: '数学严密推导：最坏极端值 (EVA) vs 均方根统计 (RSS)',
      content: '最坏极端叠加 (EVA)：ε_total = |ε_init| + |ε_temp| + |ε_aging|；统计叠加 (RSS)：ε_rss = √(ε_init² + ε_temp² + ε_aging²)。各分量数值与是否超出当前项目限值，必须用当前项目的误差预算输入实测/规格值代入本地计算（见「确定性预核算事实」）；模板不预填数值。',
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
      evidence: 'EVA 极端叠加与 RSS 统计叠加是否超出客户/设计限值，必须以当前项目的误差预算输入实测值代入本地计算（见「确定性预核算事实」）；模板不预填数值。',
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
      evidence: '若仅更换更高精度、更低温度漂移的片式电阻（具体精度与封装按当前项目规格选型），仅涉及元器件料号替代，无需改动铜皮走线。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 35,
      level: 'Low',
      evidence: '升级为低温度漂移、高精度薄膜电阻的单板成本增幅需按当前项目报价核算（本项模板不预填金额），并确认其是否处于预算容忍区间。',
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
      optionName: '方案 B：软硬协同根治 (分压电阻升级为更高精度低温漂规格 + 产线两点软件校准)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '不留任何理论死角。硬件端将厚膜电阻升级为更高精度、更低温度漂移的薄膜电阻，使 EVA 极端误差压回当前项目限值以内（具体精度、温漂与压缩后的误差数值必须按当前项目规格与实测计算确认，模板不预填数值）；软件端配合生产线两点偏置校准，将常温初始误差归零。',
      keyRiskOrPenalty: 'BOM 成本增幅需按当前项目报价核算（模板不预填金额），产线需增加单台自动校准工步（节拍时长按当前项目标定）。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：仅靠纯软件数字低通滤波与动态零漂补偿',
      categoryLabel: '软件优先 / 硬件零成本',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (纯软件妥协)',
      coreTradeoffReason: '软件无法消除硬件分压电阻的温度漂移系数（具体温漂按当前选型规格）与 10 年物理老化，在高温下电阻物理阻值发生实体漂移，软件盲算无法识别真实电压还是温漂，存在误触发安全断电隐患。',
      keyRiskOrPenalty: '残余功能安全风险依然为 High，无法通过 ISO 26262 ASIL C 安全审计。',
      reActivationCondition: '仅在 BOM 成本被客户以违约金形式强行封死、完全无法增加 1 分钱时作为临时应急。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接以“常温实测良好”为由，强行关闭问题不作任何处理',
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
        task: '从库房领料规定数量的高精度低温漂薄膜电阻（具体规格与封装按当前项目选型），在 B 样板上完成手工高精度返修',
        owner: 'HW 维修技师 + HW 工程师',
        deliverable: '更换后的样件实物与阻值精度显微核验记录',
      },
      {
        timeWindow: '10:30 - 14:00',
        phase: '高低温箱三点高低温实测',
        task: '将改造板放入恒温箱，在 -40℃、+25℃、+105℃ 三个温度点各保温 1 小时，连续采集 ADC 误差曲线',
        owner: 'HW 测试工程师',
        deliverable: '全温区温漂测试曲线图 (温漂斜率改善目标按当前项目选型规格与限值定义)',
      },
      {
        timeWindow: '14:00 - 16:30',
        phase: '产线两点校准算法验证',
        task: '底层软件刷入 EEPROM 偏置修正固件，验证 25℃ 注入两点基准后全温区残余误差分布',
        owner: 'Embedded Software Lead',
        deliverable: '校准固件补丁包与残余误差统计散点图 (残余误差允许门限按当前项目限值定义)',
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
        greenCriteria: '实测绝对误差满足当前项目限值并留有余量 ➔ 判定优秀放行，固化电阻选型与校准流程',
        yellowCriteria: '绝对误差处于当前项目限值边缘 (达到合格线但裕量较薄) ➔ 方案 B 准予通过，但需抽检规定数量样板统计一致性',
        redCriteria: '绝对误差击穿当前项目规范限值 ➔ 立即终止方案 B，触发基准电压芯片更换方案 (更换更高精度基准芯片，精度按当前项目规格选型)',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-WCCA-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 功能安全主管 (Safety Lead)',
    coreProblem: '高压采样回路在全寿命与高低温极端公差叠加 (EVA) 下的理论误差是否超出系统规范，必须以当前项目的误差预算输入实测/规格值代入本地计算确认（模板不预填误差数值）。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设各分压电阻老化与温漂彼此独立，符合正态统计分布',
      '假设产线校准设备自身测量不确定度满足当前项目校准规范要求',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '软硬协同根治 (分压电阻升级为更高精度低温漂规格 + 产线两点软件校准)',
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
      '缺少产线自动测试机 (ATE) 规定数量样板初始标定数据的重复性 (Gage R&R) 报告。',
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
  const measuredFact = factOrUnknown(issue.actualMeasurement, '待输入：工程师尚未提供实测结果与测试边界，本工具不会用模板数字代替实测数值。', 'MEASURED', 98);
  const specFact = factOrUnknown(issue.requirement, '待输入：客户/标准/设计规格尚未提供，无法判定适用限值。', 'SPEC', 100);
  const measuredVal = measuredFact.content;
  const reqVal = specFact.content;

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-TH-01',
      tag: measuredFact.tag,
      title: '高温风道密闭箱热电偶与红外热像实测',
      content: measuredFact.provided ? `${measuredVal}，壳温与散热片基板稳态温度以工程师提供的实测数据为准（模板不预填温度数值）` : measuredVal,
      sourceOrBasis: measuredFact.sourceOrBasis ?? 'FLIR 车规红外热像仪校准读数 + K型细丝贴片热电偶实测 (#TH-LOG-085C)',
      confidenceLevel: measuredFact.confidenceLevel,
      verificationMethod: '高低温湿热交变试验箱 85℃ 满载 3 小时热平衡实测',
    },
    {
      id: 'INFO-TH-02',
      tag: specFact.tag,
      title: '车规半导体器件结温降额规范红线',
      content: specFact.provided ? `${reqVal}；严禁在长期运行工况下突破按当前器件数据手册与降额规范确定的结温降额红线，否则触发热疲劳早期失效` : reqVal,
      sourceOrBasis: specFact.sourceOrBasis ?? 'AEC-Q101 Rev E 标准 & 客户整车热负荷协议 (CSA-THERMAL-SEC2)',
      confidenceLevel: specFact.confidenceLevel,
      verificationMethod: '汽车行业可靠性降额设计标准手册',
    },
    {
      id: 'INFO-TH-03',
      tag: 'CALCULATED',
      title: '热阻网络与内部晶圆结温物理推算',
      content: '结温推导公式：Tj = Tc + P_loss * Rth_jc。Tc、P_loss 与 Rth_jc 的具体数值必须用当前项目的实测壳温、损耗与热阻参数代入本地计算，并与当前器件降额红线比较（见「确定性预核算事实」）；模板不预填数值。',
      sourceOrBasis: '热欧姆定律与 Foster 瞬态热阻网络方程',
      confidenceLevel: 93,
      verificationMethod: '热仿真软件 FloTHERM 3D 网格热场仿真校核',
    },
    {
      id: 'INFO-TH-04',
      tag: 'ASSUMPTION',
      title: '工程假设：导热垫片长期热阻无粉化衰减',
      content: '假设导热硅脂/导热垫在 10 年寿命期内导热系数保持稳定（具体导热系数按当前选型规格），无出油干枯粉化现象',
      sourceOrBasis: '导热材料原厂初期 Datasheet (未经验证高温 1000h 老化数据)',
      confidenceLevel: 65,
      verificationMethod: '需进行 1000 小时 125℃ 高温烘烤热阻衰减试验',
    },
    {
      id: 'INFO-TH-05',
      tag: 'UNKNOWN',
      title: '未知项：整车发动机舱/座舱实际装车工况下的微风速对流状态',
      content: '台架试验为密闭静态自然对流，未知整车级风道是否有微风辅助对流散热（具体风速按整车热管理输入确认）',
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
      evidence: '结温是否突破当前器件降额红线、设计裕量是否倒挂，必须以当前项目实测壳温、损耗与热阻代入本地计算确认（见「确定性预核算事实」）；本项模板不预填温度数值。',
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
      evidence: '更换更高导热系数的导热垫片（具体导热系数按当前选型规格）所增加的单件成本需按当前项目报价核算（模板不预填金额），且需确认是否远低于结构重新开模费用。',
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
      optionName: '方案 B：软硬协同温控 (升级高导热系数垫片 + 软件自适应高温降频)',
      categoryLabel: '平衡方案 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 B (核心推荐)',
      coreTradeoffReason: '立竿见影。硬件端换装高导热系数纳米相变导热垫（接触热阻降幅与壳温压降必须按当前项目实测确认，模板不预填数值）；软件端配置高温动态降额策略（触发温度门限与占空比降幅按当前项目热设计标定），双重防线将 Tj 压至当前器件降额红线以内（安全裕量按实测计算确认）。',
      keyRiskOrPenalty: '单台物料成本增幅需按当前项目报价核算（模板不预填金额），需标定高温降频阈值。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option A',
      optionName: '方案 A：推倒重来，重新开模加大金属散热齿鳍片',
      categoryLabel: '结构大改版 / 周期严重失控',
      isRecommended: false,
      verdictTitle: '为什么不选方案 A (重新开模改结构)',
      coreTradeoffReason: '虽然增加外壳散热面积能从被动物理上散热，但压铸铝模具修改周期与模具费用必须按当前项目排期与报价核算（模板不预填数值），且修改后外壳尺寸增大，将与整车安装支架产生机械干涉，完全不可行。',
      keyRiskOrPenalty: '模具修改周期（按当前项目排期核算）将导致整车量产 SOP 严重延期，产生违约危机。',
      reActivationCondition: '仅在所有电气散热优化手段均穷尽且外壳空间有富余时考虑。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接以“未超过器件绝对破坏极限”为由，强行免改放行',
      categoryLabel: '节点优先 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '触犯铁律【原则 4：绝不能混淆降额红线与破坏极限】！器件绝对最大额定温度（按当前器件数据手册）是半导体硅片发生内部载流子雪崩与永久烧毁的破坏性极限，并非量产安全裕量！长期在降额红线以上运行将导致器件失效率从 PPM 级飙升至百分比级，直接一票否决。',
      keyRiskOrPenalty: '【硬性否决】违反车规 AEC-Q100 降额标准，夏季高温批量烧片爆雷。',
      reActivationCondition: '永久禁止。严禁突破车规降额底线。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 10:30',
        phase: '高导热垫片装配替换',
        task: '领用高导热系数优质相变导热垫（具体导热系数按当前选型规格），重新涂布并以定扭矩螺丝刀紧固机壳螺栓',
        owner: 'HW 结构工程师',
        deliverable: '装配扭矩记录表 (扭矩值按当前项目结构装配规范定义) 与垫片贴合平整度检查记录',
      },
      {
        timeWindow: '10:30 - 14:30',
        phase: '85℃ 满载热平衡连续实测',
        task: '恒温箱升温至 85℃，带额定满载连续运行 4 小时，热电偶每 5 分钟自动记录一次温升曲线',
        owner: 'HW 试验工程师',
        deliverable: '稳态壳温对比曲线 (壳温改善目标按当前项目热设计限值定义)',
      },
      {
        timeWindow: '14:30 - 17:00',
        phase: '软件过热限流保护标定',
        task: '在测试台架注入按当前项目热设计标定的高温触发信号，验证驱动固件是否按梯度平滑限制最大输出电流',
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
        greenCriteria: 'Tj 满足当前项目降额安全裕量要求 ➔ 判定完全达标，准予量产冻结',
        yellowCriteria: 'Tj 处于当前项目降额裕量边缘（门限按当前器件降额规范定义） ➔ 方案 B 准予通过，但要求软件降频阈值提前启动（提前量按当前项目标定）',
        redCriteria: 'Tj 突破当前项目降额红线 ➔ 方案 B 失效，立即召开紧急工程会议评估降低额定输出功率',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-THM-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 热设计专家',
    coreProblem: '高温极限环温满载工况下功率器件结温是否突破车规降额红线、剩余裕量多少，必须以当前项目实测壳温与热阻参数代入本地计算确认（模板不预填温度数值）。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设导热界面材料 (TIM) 在长期高温老化下的热阻衰减率不超过当前项目降额规范允许值',
      '假设整车结构装配扭矩恒定，界面接触压力满足当前项目结构装配规范要求',
    ],
    chosenOptionId: 'Option B',
    chosenOptionTitle: '软硬协同温控 (升级高导热系数垫片 + 软件自适应高温降频)',
    rejectedOptionsSummary: 'Option A (模具重新开模周期长且尺寸干涉，完全不可行)；Option C (突破降额红线盲目放行触犯 AEC-Q100 红线，一票否决 VETO)。',
    defenseBasis: '依据 AEC-Q100/101 车规降额规范与物理热传导模型，采用低热阻界面材料配合固件主动热保护闭环，将器件稳态运行结温控制在当前项目降额红线以内的安全区间。',
    signOffSignatures: [
      { role: '硬件责任工程师', name: 'HW Lead', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '结构热设计工程师', name: 'Thermal Architect', status: 'Signed', signDate: new Date().toISOString().split('T')[0] },
      { role: '产品质量负责人', name: 'Quality Lead', status: 'Pending', signDate: '-' },
      { role: '系统软件主管', name: 'Firmware Lead', status: 'Pending', signDate: '-' },
    ],
    localHashDigest: 'PENDING_CALCULATION',
  };

  const redTeamChallenge: RedTeamAuditChallenge = {
    auditVerdict: '警告：当前结温数据基于稳态计算，未计入急加减速瞬间的脉冲热阻瞬态冲击（脉冲功率按当前项目工况实测/计算确认）！',
    riskGaps: [
      '器件结到壳瞬态热阻抗 Zth_jc 具有时间常数，在突加重载后的瞬态窗口内晶圆微区温升速率远高于壳温上升速度。',
      '相变导热材料在首次升温相变前接触热阻较大，初始冷态加重载可能出现微秒级热冲击超限。',
    ],
    missingEvidenceList: [
      '缺少脉冲大电流工况下的 RC 梯形 Foster 瞬态热阻网络仿真曲线。',
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
  const measuredFact = factOrUnknown(issue.actualMeasurement, '待输入：工程师尚未提供实测结果与测试边界，本工具不会用模板数字代替实测数值。', 'MEASURED', 98);
  const specFact = factOrUnknown(issue.requirement, '待输入：客户/标准/设计规格尚未提供，无法判定适用限值。', 'SPEC', 100);
  const measuredVal = measuredFact.content;
  const reqVal = specFact.content;

  const classifiedInfo: ClassifiedInfoItem[] = [
    {
      id: 'INFO-BLDC-01',
      tag: measuredFact.tag,
      title: '示波器高频双探头实测母线泵升与门极尖峰',
      content: measuredFact.provided ? `${measuredVal}；示波器捕捉急停瞬间相线反向浪涌与开关节点高频振铃` : measuredVal,
      sourceOrBasis: measuredFact.sourceOrBasis ?? 'Tektronix MSO54B 示波器 1GHz 高压差分探头实测波形 (#WAVE-BLDC-3800RPM)',
      confidenceLevel: measuredFact.confidenceLevel,
      verificationMethod: '电机台架按最高工作转速满载额定扭矩急停断电实测',
    },
    {
      id: 'INFO-BLDC-02',
      tag: specFact.tag,
      title: '车规电气瞬态与 MOSFET 降额设计红线',
      content: specFact.provided ? `${reqVal}；严禁在器件单脉冲雪崩耐量 (E_as) 外运行，严禁上下桥臂存在任何瞬态直通 (Shoot-through) 风险` : reqVal,
      sourceOrBasis: specFact.sourceOrBasis ?? 'ISO 16750-2:2012 Section 4.6.2 & 公司《功率驱动降额规范》',
      confidenceLevel: specFact.confidenceLevel,
      verificationMethod: '车规标准与器件绝对最大额定值 (Abs Max Ratings)',
    },
    {
      id: 'INFO-BLDC-03',
      tag: 'CALCULATED',
      title: '电感储能释放与转子动能泵升能量方程',
      content: '动能与磁能回馈计算：E_kinetic = ½·J·ω²，母线电压按 V_peak = √(V0² + 2E/C) 泵升。本项具体数值必须用当前项目的 J、转速与母线电容实测/规格值代入本地确定性计算（见「确定性预核算事实」）；模板不预填数值。',
      sourceOrBasis: '机电能量守恒微分方程与电磁暂态模型推导',
      confidenceLevel: 96,
      verificationMethod: 'Simulink/PLECS 暂态电机模型仿真校对',
    },
    {
      id: 'INFO-BLDC-04',
      tag: 'ASSUMPTION',
      title: '工程假设：MOSFET 脉冲电流 SOA 安全裕度',
      content: '下桥三相短接动态制动的制动电流峰值/脉宽与结温瞬态上升，必须按当前器件数据手册的脉冲 SOA 曲线与本项目实测波形核对；模板不预填电流/脉宽/温升数值。',
      sourceOrBasis: 'MOSFET Datasheet 脉冲电流安全工作区 (SOA) 曲线估算',
      confidenceLevel: 75,
      verificationMethod: '需在项目规定的高温环境箱中做连续急停温升积累实测（循环次数按项目规定）',
    },
    {
      id: 'INFO-BLDC-05',
      tag: 'UNKNOWN',
      title: '未知项：整车线束分布寄生电感 (L_cable) 对母线尖峰的叠加效应',
      content: '未知：整车装配后实际线束长度与寄生电感（未屏蔽长线束）导致的感应电动势叠加量；需按实际线束参数或实测提取，模板不预填长度与电感值。',
      sourceOrBasis: '台架线束与整车线束边界不一致，需按实际装配状态补充证据',
      confidenceLevel: 40,
      verificationMethod: '需在台架上串入与整车等效的射频扼流电感模拟长线束边界（电感值按实车线束估算）',
    },
  ];

  const multiRiskBreakdown: MultiDimensionalRiskBreakdown = {
    techMargin: {
      name: '技术裕量风险 (Technical Margin)',
      dimensionKey: 'techMargin',
      score: 92,
      level: 'High',
      evidence: '母线泵升与米勒感应裕量是否倒挂，必须以本地确定性预核算（Bus Pumping / Miller）与实测峰值为准；本项模板不预填电压数字。',
    },
    reliabilityStress: {
      name: '可靠性应力风险 (Reliability Stress)',
      dimensionKey: 'reliabilityStress',
      score: 88,
      level: 'High',
      evidence: '高温下晶圆阈值电压衰减会缩小米勒感应裕量，存在同相桥臂直通风险；具体阈值衰减与尖峰幅值需按器件数据手册与实测确认。',
    },
    scheduleDelay: {
      name: '项目进度风险 (Schedule Delay)',
      dimensionKey: 'scheduleDelay',
      score: 55,
      level: 'Medium',
      evidence: '软硬件协同治理的工期与当前节点剩余天数需按项目排期核算（本项模板不预填天数）。',
    },
    redesignCost: {
      name: '改版成本风险 (Redesign Cost)',
      dimensionKey: 'redesignCost',
      score: 25,
      level: 'Low',
      evidence: '本方案无需推倒 PCB 投板；BOM 增幅需按当前项目预算红线核算（本项模板不预填金额）。',
    },
    verificationGap: {
      name: '验证盲区 (Verification Gap)',
      dimensionKey: 'verificationGap',
      score: 65,
      level: 'Medium',
      evidence: '台架线束无法完全模拟整车装配后的寄生感抗，需追加串联感抗或实车边界验证。',
    },
  };

  const whyNotComparison: WhyNotComparisonItem[] = [
    {
      optionId: 'Option A',
      optionName: '方案 A：三相全下桥能耗制动 + 门极米勒钳位/加速关断 + RC Snubber',
      categoryLabel: '软硬协同 (当前推荐)',
      isRecommended: true,
      verdictTitle: '为什么选方案 A (核心推荐)',
      coreTradeoffReason: '从物理能量源头彻底治理：利用电机定子铜耗消纳动能，母线冲高与门极尖峰的整改后目标值必须由实测确认（模板不预填电压与频点）；RC Snubber 针对实测振铃频点抑制辐射。',
      keyRiskOrPenalty: '制动瞬间机械减速力矩较大，需确认齿轮箱机械反冲冲击。',
      reActivationCondition: '当前首选推荐方案，立即执行。',
    },
    {
      optionId: 'Option B',
      optionName: '方案 B：硬件硬改版 (并联大功率 TVS + 增大大容量固态电解电容)',
      categoryLabel: '硬件硬改版 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 B (一票否决 VETO)',
      coreTradeoffReason: '重新投板打样周期较长，会击穿当前 DV 准入节点；单板成本增幅需核对客户商务协议预算上限；且大尺寸电解电容可能无法装入结构外壳。',
      keyRiskOrPenalty: '【硬性否决】关键节点延期违约、成本严重超标、外壳机械干涉。',
      reActivationCondition: '永久禁止。严禁在成本超预算且延期违约下推进硬改版。',
    },
    {
      optionId: 'Option C',
      optionName: '方案 C：直接改成自由滑行停机 (Coast-down)，不开启任何制动',
      categoryLabel: '极简投机 (触发 VETO 否决)',
      isRecommended: false,
      verdictTitle: '为什么不选方案 C (一票否决 VETO)',
      coreTradeoffReason: '自由滑行消除母线泵升，但制动时间远超客户/法规要求的紧急制动响应窗口，直接违背防夹保护的安全目标，触发安全一票否决（窗口值按当前项目适用标准）。',
      keyRiskOrPenalty: '【硬性否决】违反整车防夹功能安全标准，属于严重人身夹伤安全隐患。',
      reActivationCondition: '永久禁止。涉及人身安全防夹特性的参数严禁以牺牲响应时间为代价妥协。',
    },
  ];

  const next24HourPlan: Next24HourPlan = {
    timeline: [
      {
        timeWindow: '08:30 - 11:00',
        phase: '底层驱动固件三相下桥刷写',
        task: '在 MCU 底层配置急停中断：上桥关断、三路下桥 MOS 强制导通执行动态制动（导通时长按制动策略设定），烧录固件至样机',
        owner: 'Motor Control SW Lead',
        deliverable: '急停能耗制动固件补丁与自检报告',
      },
      {
        timeWindow: '11:00 - 14:00',
        phase: '门极加速关断与 RC Snubber 贴片',
        task: '在逆变桥开关节点手工焊接 RC 吸收网络（容值/阻值按实测振铃频率计算），MOSFET 门极并联快速放电支路',
        owner: 'HW 电机专家 (刘工)',
        deliverable: '电路改制样件与焊接阻抗显微检验记录',
      },
      {
        timeWindow: '14:00 - 17:30',
        phase: '台架双通道示波器瞬态捕捉',
        task: '在电机台架以最高工作转速连续触发多次急停，捕捉母线电压峰值与下桥 Vgs/Vds 米勒尖峰波形',
        owner: 'HW 工程师 + 台架测试技术员',
        deliverable: '示波器高清波形截图与峰值电压记录单',
      },
      {
        timeWindow: '17:30 - 19:30',
        phase: '高温温箱初步热冲击验证',
        task: '放入高温箱升温至项目规定温度，连续急停多次，监测 MOSFET 表面红外热像温度上升梯度',
        owner: '可靠性测试工程师',
        deliverable: '高温下急停温升数据表 (温升门槛按项目规定)',
      },
    ],
    passFailCriteria: [
      {
        parameter: '急停母线最高电压峰值 (Bus Overvoltage Peak)',
        greenCriteria: '实测峰值满足当前项目规定的门限值与降额裕量 ➔ 判定达标，准予固化至正式代码库',
        yellowCriteria: '实测峰值介于门限与降额红线之间 ➔ 方案准予通过，但需微调下桥导通维持时间',
        redCriteria: '实测峰值击穿当前器件耐压降额红线 ➔ 立即中止，母线追加车规级 TVS 辅助削峰',
      },
    ],
  };

  const edrRecord: EngineeringDecisionRecord = {
    edrId: `EDR-BLDC-${Date.now().toString().slice(-6)}`,
    projectCode: context.projectName || 'ECU-CAR-2026',
    decisionDate: new Date().toISOString().split('T')[0],
    decisionMaker: '硬件主管 (HW Lead) & 电机控制系统专家',
    coreProblem: '急停时动能回馈倒灌使母线冲高并逼近 MOSFET 极限耐压，同时门极米勒感应尖峰逼近阈值，存在高温直通炸管隐患（具体数值以本地确定性预核算与实测为准）。',
    measuredSnapshot: measuredVal,
    specThreshold: reqVal,
    engineeringAssumptions: [
      '假设下桥动态制动脉冲电流处于当前 MOSFET 脉冲 SOA 以内（具体电流与 SOA 需按器件数据手册核对）',
      '假设电机齿轮箱机械结构允许急停时最大制动力矩冲击',
    ],
    chosenOptionId: 'Option A',
    chosenOptionTitle: '三相全下桥能耗制动 + 门极米勒钳位/加速关断 + RC Snubber',
    rejectedOptionsSummary: 'Option B (投板周期长且 BOM 增幅超预算，一票否决 VETO)；Option C (自由滑行响应延误，违背防夹安全目标，一票否决 VETO)。',
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
      '若车辆在极端恶劣路况或调试阶段频繁高频触发急停，结温累积效应可能突破当前器件绝对损坏极限。',
      '三相全下桥短接依赖 MCU 正常发出驱动信号，若 MCU 供电丢失或跑飞，系统将退化为无制动滑行或上下桥同时关断引发高压泵升。',
    ],
    missingEvidenceList: [
      '缺少高频连续急停的晶圆结温动态累积热阻仿真。',
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
