import { ProjectContext, IssueInput, CopilotAnalysisResult, CandidateAction } from '../types';
import { calculateBldcDeterministicCalculations } from '../utils/bldcDeterministicEngine';
import { extractUnifiedEngineeringModel, readMeasuredNumber } from '../utils/unifiedStateExtractor';
import { recalculateStandardWeightedScore } from '../utils/scoringWeights';

function calculateCtsql(T: number, S: number, C: number, Q: number, L: number): number {
  return recalculateStandardWeightedScore({ T, S, C, Q, L });
}

export function generateBldcMotorAnalysis(context: ProjectContext, issue: IssueInput): CopilotAnalysisResult {
  const state = extractUnifiedEngineeringModel(context, issue);
  const deterministic = calculateBldcDeterministicCalculations(issue, state, context);
  const bus = deterministic.find((item) => item.id === 'BLDC_BUS_PUMPING');
  const miller = deterministic.find((item) => item.id === 'BLDC_MILLER_RISK');
  const mv = issue.measuredValues || {};
  // 走统一读数原语：以前这里自己 Number(mv[key])，''/null 会变成 0（把「没填」当成「量到 0」），
  // 而 vds 就参与 vds - bus.value 的裕量比较，等于凭空造出一个假的裕量结论。
  const n = (key: string) => readMeasuredNumber(mv, key);
  const busPeakMeasured = n('busVoltagePeakV');
  const rpm = n('rpm');
  const vth = n('vthMinV');
  const dvdt = n('dvdtVns');
  const cgd = n('cgdPf');
  const cBus = n('cBusUf');
  const j = n('rotorInertiaKgm2');
  const vds = n('vdsRatingV');
  const dynamicBus = bus?.status === 'CALCULATED' && bus.value !== undefined ? `${bus.value.toFixed(2)}V` : '当前输入不足，待补充结构化参数后计算';
  const dynamicMiller = miller?.status === 'CALCULATED' && miller.value !== undefined ? `${miller.value.toFixed(2)}V` : '当前输入不足，待补充结构化参数后计算';

  // 动态评分：技术(T)分随确定性计算出的泵升过压/米勒直通风险严重度变化，
  // 进度(S)分随剩余工期变化；成本/质量/可靠性保留方案内在画像(保守/激进结构特性)。
  const daysRemaining = context.daysRemaining;
  const busMarginV = bus?.status === 'CALCULATED' && bus.value !== undefined && vds !== undefined ? vds - bus.value : undefined;
  const millerMarginV = miller?.status === 'CALCULATED' && miller.value !== undefined && vth !== undefined ? vth - miller.value : undefined;
  let riskSeverity = 50;
  if (busMarginV !== undefined && busMarginV < 5) riskSeverity = Math.min(95, 60 + (5 - busMarginV) * 6);
  if (millerMarginV !== undefined && millerMarginV < 0.5) riskSeverity = Math.max(riskSeverity, 85);
  const daysFactor = typeof daysRemaining === 'number' && daysRemaining <= 7 ? 1 : 0;
  const clamp = (v: number) => Math.max(15, Math.min(98, Math.round(v)));
  const severityLevel = (s: number): 'Low' | 'Medium' | 'Medium-High' | 'High' => (s >= 85 ? 'High' : s >= 70 ? 'Medium-High' : s >= 50 ? 'Medium' : 'Low');
  const scoreA = { T: clamp(88 + (riskSeverity - 50) * 0.3), S: clamp(88 - daysFactor * 6), C: 80, Q: 90, L: 88 };
  const scoreB = { T: clamp(74 + (riskSeverity - 50) * 0.3), S: clamp(40 - daysFactor * 20), C: 40, Q: 80, L: 60 };
  const scoreC = { T: 35, S: clamp(96 + daysFactor * 2), C: 98, Q: 30, L: 30 };

  const candidateActions: CandidateAction[] = [
    {
      id: 'Option A',
      category: 'balanced',
      categoryLabel: '软硬协同 (推荐方案)',
      name: '三相全下桥能耗制动 + 门极有源米勒钳位/反向低阻通路 + 目标谐振频点 RC Snubber',
      description: '1. 固件改写制动逻辑：急停时关断三路上桥，开启三路下桥 MOSFET 实施短接动态制动，动能转化为线圈铜耗，消除母线泵升；2. 硬件启用驱动芯片 Active Miller Clamp 引脚或门极并联快速关断二极管+低阻下拉（阻值按门极回路与驱动能力核算）；3. 在三相逆变器半桥中点并联 RC Snubber 抑制高频振铃（容值/阻值必须按实测振铃频率与寄生参数计算，模板不预填）。',
      expectedBenefit: `当前项目整改前的确定性基线为 ${dynamicBus}；Miller 为 ${dynamicMiller}。整改后目标值属于待验证变量，不得用历史模板数字充当实测结果。`,
      scores: {
        T: scoreA.T,
        S: scoreA.S,
        C: scoreA.C,
        Q: scoreA.Q,
        L: scoreA.L,
        total: calculateCtsql(scoreA.T, scoreA.S, scoreA.C, scoreA.Q, scoreA.L),
      },
      veto: { rejection_veto: false },
      referenced_standards: [
        { standard: 'ISO 26262-5', clause: 'Clause 7.4.3', relevance: '硬件架构安全指标、单点故障度量 (SPFM) 与失效容限时间间隔 (FHTI) 要求' },
        { standard: 'ISO 16750-2', clause: 'Section 4.6.2', relevance: '车载供电瞬态过电压与反向电势倒灌冲击脉冲测试规范' },
        { standard: 'CISPR 25', clause: 'Class 5 Table 7', relevance: '车载接收机保护之传导与辐射骚扰限值 (目标谐振频点 谐振抑制)' },
        { standard: 'AEC-Q101', clause: 'Rev E / SOA Limit', relevance: '车规分立功率器件脉冲电流安全工作区与单脉冲抗雪崩能量' },
      ],
      riskBefore: `当前项目确定性计算：Bus Pumping=${dynamicBus}，Vds额定耐压=${vds ?? 'UNKNOWN'}V；Miller=${dynamicMiller}（输入完整性不足时不输出确定值）。EMC 高频振铃以实测频谱为准。`,
      riskAfter: '泵升峰值被下桥绕组短接消除，米勒感应压制在安全区，高频振铃被吸收。',
      residualRisk: 'Low',
      residualRiskDetail: '急停瞬间存在短暂脉冲制动电流；峰值/脉宽、MOSFET SOA 与结温瞬态需依据当前器件数据和实测波形确认，本轮不采用历史示例数字。',
      sideEffects: '电机急停时产生制动力矩突变，需系统团队校验机械齿轮箱反冲冲击。',
      verificationCost: '约为阻容贴片打样 + 示波器高频双探头实测工时（按当前项目资源核算）',
      timeCost: `约 3 天（剩余 ${daysRemaining} 天节点内，以当前项目门禁为准）`,
      failureConsequence: '若实测下桥制动发热偏大，可切换为分段斩波 PWM 能耗制动，技术路径平滑。',
      preconditions: 'MCU 驱动固件支持底层刹车中断，MOSFET 脉冲电流 SOA 需依据当前器件数据手册与实际制动电流确认（缺电流输入时保持 UNKNOWN，不预设 50A）。',
      verificationMethod: `在电机台架以 ${rpm !== undefined ? rpm : '目标/最高'}rpm 转速触发急停，高阻差分探头捕捉母线电压与 Vgs/Vds 瞬态波形。`,
      planB: '若整车超长线束反射仍偶发尖峰，在输入端预留一颗车规级双向 TVS（按当前母线电压等级与瞬态能量选型，不套用历史型号）作为二级兜底。',
    },
    {
      id: 'Option B',
      category: 'conservative',
      categoryLabel: '硬件硬改版 (周期严重超标)',
      name: '重新改版 PCB：堆叠大功率 TVS 阵列 + 更换大容量固态电解电容（具体颗数/功率/容量按当前母线电压、泵升能量与结构空间核算）',
      description: '在母线侧并联大功率车规双向 TVS 吸收反向泵升浪涌，并增大电解电容容量，同时适当减小门极电阻以压低感应电压（具体数值必须按当前泵升能量、结构空间与门极回路计算，模板不预填）。',
      expectedBenefit: '纯硬件被动吸收，不依赖底层软件制动算法。',
      scores: {
        T: scoreB.T,
        S: scoreB.S,
        C: scoreB.C,
        Q: scoreB.Q,
        L: scoreB.L,
        total: calculateCtsql(scoreB.T, scoreB.S, scoreB.C, scoreB.Q, scoreB.L),
      },
      veto: {
        rejection_veto: true,
        veto_reason: 'PCB 重新投板与打样周期需约三周，直接击穿当前 DV 节点；BOM 增幅需按当前项目预算红线核算，且大尺寸电容可能无法装入结构外壳。',
      },
      customerVetoViolations: [
        '客户技术协议条款 3.2：DV 样件改动周期不得突破节点日（当前方案预计超期，需按实际工期核算）',
        '客户商务协议条款 4.1：B 样至 SOP 阶段单板 BOM 增幅上限需核对当前项目商务协议（模板不预填金额与超标比例）',
      ],
      referenced_standards: [
        { standard: 'ISO 16750-2', clause: 'Section 4.6.4', relevance: '车载过电压吸收器件脉冲能量与热应力规范' },
        { standard: 'IPC-2221B', clause: 'Table 6-1', relevance: '高压大电流大焊盘电气间隙与爬电距离设计红线' },
      ],
      riskBefore: `当前项目确定性基线：Bus Pumping=${dynamicBus}；Miller=${dynamicMiller}。`,
      riskAfter: '强行通过被动元器件硬件吸收浪涌。',
      residualRisk: 'High',
      residualRiskDetail: '门极电阻过小导致开启 dv/dt 飙升，将严重恶化 CISPR 25 辐射发射，引发连锁失败。',
      sideEffects: '单板成本超支、空间干涉、EMC 恶化。',
      verificationCost: '约为 PCB 打样 + 贴片 + 模具修改评估（按当前项目资源核算）',
      timeCost: '约 约三周（需按当前项目 DV 门禁重新核算是否违约）',
      failureConsequence: '项目 DV 准入延期 1 个月，客户启动商务考核。',
      preconditions: '结构空间允许增大外壳尺寸，PM 批准超支与延期。',
      verificationMethod: '新样板打样后进暗室与台架重测。',
      planB: '无',
    },
    {
      id: 'Option C',
      category: 'schedule_priority',
      categoryLabel: '纯软件滑行 (功能安全违规)',
      name: '纯软件自由滑行停机 (Coast Stop / 6-MOS 全部高阻关断)',
      description: '急停触发时立即封锁所有 6 个 MOSFET 门极输出，使电机自由旋转靠机械摩擦力减速滑行停止。',
      expectedBenefit: '软件 0 代码改动，0 硬件成本，眼下不延期。',
      scores: {
        T: scoreC.T,
        S: scoreC.S,
        C: scoreC.C,
        Q: scoreC.Q,
        L: scoreC.L,
        total: calculateCtsql(scoreC.T, scoreC.S, scoreC.C, scoreC.Q, scoreC.L),
      },
      veto: {
        rejection_veto: true,
        veto_reason: '自由滑行停机的制动时间远长于座舱防夹与紧急制动所要求的响应窗口（具体窗口按当前项目适用法规/标准），构成安全目标违约，触发一票否决！',
      },
      customerVetoViolations: [
        '客户技术协议条款 2.1：紧急防夹与制动安全响应窗口必须满足当前项目适用法规/客户协议（本方案自由滑行远超该窗口）',
        '功能安全技术协议：必须实现安全状态 (Safe State) 主动钳位控制，禁止高阻悬空自由倒拖',
      ],
      referenced_standards: [
        { standard: 'ISO 26262-4', clause: 'Clause 6.4.4', relevance: '系统级安全机制与故障安全状态 (Safe State) 响应时间要求' },
        { standard: 'FMVSS 118', clause: 'S5 Safe Reversal', relevance: '汽车电动车窗与座舱智能执行机构防夹安全法规强制时限' },
      ],
      riskBefore: '母线泵升与米勒直通隐患。',
      riskAfter: '急停响应超时，且反拖时反电动势仍会通过体二极管失控倒灌。',
      residualRisk: 'High',
      residualRiskDetail: '无法通过防夹与安全响应验收，被主机厂一票否决。',
      sideEffects: '车辆座舱安全法规认证失败。',
      verificationCost: '¥0 眼前成本，但带来整车级法规通不过风险',
      timeCost: '0 天',
      failureConsequence: '整车下线测试不合格，被主机厂责令停线整改。',
      preconditions: '无',
      verificationMethod: '无',
      planB: '无',
    },
  ];

  return {
    source: 'deterministic-expert',
    analysisBasis: {
      ruleInputs: [],
      measuredInputs: Object.keys(issue.measuredValues || {}),
      calculatedOutputs: deterministic
        .filter((item) => item.status === 'CALCULATED' && item.value !== undefined)
        .map((item) => `${item.key}=${item.value} ${item.unit}; margin=${item.safetyMargin ?? 'N/A'}; verdict=${item.complianceVerdict ?? 'N/A'}`),
      assumptions: [],
      fixedTemplateFields: ['BLDC 车规风险判据', '急停泵升/米勒物理机理模板', 'bldcMotorExpert 历史/示例数字仅为模板，不是当前项目事实'],
      calculatedOutputEvidence: deterministic,
    },
    coreConclusion: {
      problemSummary: `BLDC 电机急停工况的确定性物理边界应以结构化输入和本地计算为准。当前结构化输入：rpm=${rpm ?? 'UNKNOWN'}，busVoltagePeakV=${busPeakMeasured ?? 'UNKNOWN'}V，Cbus=${cBus ?? 'UNKNOWN'}μF，J=${j ?? 'UNKNOWN'}kg·m²，VdsRating=${vds ?? 'UNKNOWN'}V；Bus Pumping 计算结果=${dynamicBus}；Miller 输入 dv/dt=${dvdt ?? 'UNKNOWN'}V/ns、Cgd=${cgd ?? 'UNKNOWN'}pF、Vth=${vth ?? 'UNKNOWN'}V，计算结果=${dynamicMiller}。任何缺失项不得用模板数字替代。`,
      recommendedMeasure: '优先采用已验证的能量消纳与门极瞬态抑制方案；具体器件值、目标值和整改后效果必须经过项目实测/本地确定性计算后再固化，不把历史模板数字当成当前项目事实。',
      reasonSummary: `本地确定性计算是当前 BLDC 数值锚点：${bus?.status === 'CALCULATED' ? `Bus Pumping=${dynamicBus}，耐压裕量=${bus.safetyMargin?.toFixed(2) ?? 'UNKNOWN'}V。` : `Bus Pumping=${bus?.directiveForAi || 'INSUFFICIENT_INPUT'} `}${miller?.status === 'CALCULATED' ? `Miller=${dynamicMiller}，阈值裕量=${miller.safetyMargin?.toFixed(2) ?? 'UNKNOWN'}V。` : `Miller=${miller?.directiveForAi || 'INSUFFICIENT_INPUT'}`}整改后的绝对数值必须由验证数据确认。`,
    },
    riskRatings: {
      overallRisk: severityLevel(riskSeverity),
      overallRiskScore: Math.round(riskSeverity),
      technicalRisk: severityLevel(riskSeverity),
      qualityRisk: 'Medium',
      scheduleRisk: daysRemaining <= 7 ? 'High' : daysRemaining <= 14 ? 'Medium-High' : 'Medium',
      costRisk: 'Low',
      reliabilityRisk: 'High',
      functionalSafetyRisk: 'High',
    },
    knownFacts: [
      `结构化输入：rpm=${rpm ?? 'UNKNOWN'}，busVoltagePeakV=${busPeakMeasured ?? 'UNKNOWN'}V，Cbus=${cBus ?? 'UNKNOWN'}μF，J=${j ?? 'UNKNOWN'}kg·m²，VdsRating=${vds ?? 'UNKNOWN'}V。`,
      `本地 Bus Pumping：${bus?.status === 'CALCULATED' ? `${dynamicBus}，耐压裕量 ${bus.safetyMargin?.toFixed(2) ?? 'UNKNOWN'}V` : 'INSUFFICIENT_INPUT，禁止用历史/默认数字替代。'}`,
      `结构化 Miller 输入：dv/dt=${dvdt ?? 'UNKNOWN'}V/ns，Cgd=${cgd ?? 'UNKNOWN'}pF，Rg_off=${n('rgOffOhm') ?? 'UNKNOWN'}Ω，Vth_min=${vth ?? 'UNKNOWN'}V。`,
      `本地 Miller：${miller?.status === 'CALCULATED' ? `${dynamicMiller}，阈值裕量 ${miller.safetyMargin?.toFixed(2) ?? 'UNKNOWN'}V` : 'INSUFFICIENT_INPUT，禁止用历史/默认数字替代。'}`,
      '整改后峰值、振铃频点、衰减量、BOM 与工期均属于方案/验证变量，必须通过实际项目证据确认。',
    ],
    assumptions: [
      '底层驱动软件具备对 3-Phase 逆变桥上/下桥独立 PWM 斩波与故障诊断逻辑的实时控制权限。',
      '当前 B 样预驱芯片具备门极有源米勒钳位 (Active Miller Clamp) 引脚或支持外置门极独立关断反并二极管焊盘。',
      '整车供电系统符合 ISO 16750-2 及基础 ISO 7637 瞬态保护浪涌抑制。',
    ],
    unknowns: [
      '在 -40℃ 极低温极端工况下，母线电解电容 ESR 激增与容量衰减对电压泵升吸收特性的影响。',
      '机械传动链在连续 10 万次急停循环后，机械摩擦阻尼变化对反拖能量比例的长期退化情况。',
    ],
    physicalMechanism: {
      rootCauseAnalysis: '急停瞬间转子机械动能 Ek=0.5*J*w^2 经三相逆变器续流二极管向母线电容倒灌产生能量泵升；同时开关节点反向管高速开通引起的极高 dv/dt 激发位移电流 Im=Cgd*(dv/dt) 涌入关断管门极阻抗，产生假导通尖峰。',
      keyPhysicalFactors: [
        { factor: '机械动能回馈与母线电容能量平衡', description: `当前项目应使用结构化 J=${j ?? 'UNKNOWN'}kg·m²、rpm=${rpm ?? 'UNKNOWN'}、Cbus=${cBus ?? 'UNKNOWN'}μF 进行本地 Bus Pumping 计算；结果=${dynamicBus}。` },
        { factor: '米勒电容位移感应效应', description: `当前项目应使用结构化 Cgd=${cgd ?? 'UNKNOWN'}pF、dv/dt=${dvdt ?? 'UNKNOWN'}V/ns、Rg=${n('rgOffOhm') ?? 'UNKNOWN'}Ω、Vth=${vth ?? 'UNKNOWN'}V 进行本地 Miller 计算；结果=${dynamicMiller}。` },
        { factor: '功率回路杂散电感高频谐振', description: '高频振铃需要以项目实际频谱/示波器波形和寄生参数实测结果为准；模板中的历史频点与寄生值不得视为当前项目事实。' },
        { factor: '瞬态热应力', description: '本轮不把 transientThermal/Foster 计算结果写成当前项目确定性事实；所需输入未齐全时必须保持 UNKNOWN。' },
      ],
    },
    dfmeaView: {
      failureMode: '急停反电动势过压击穿母线电容与MOSFET / 高速换向同桥臂米勒效应直通短路',
      failureCause: '未实施三相下桥能耗制动耗散动能；门极关断下拉回路阻抗偏大未配置有源米勒钳位；PCB 功率回路寄生杂散电感未吸收。',
      localEffect: 'MOSFET 与母线电解电容击穿烧毁，驱动板冒烟失效',
      systemEffect: '执行器失去驱动控制，座舱滑屏或座椅调节功能中断',
      vehicleEffect: '可能触发车身控制器过流熔断或整车急停防夹安全响应失效',
      severity: 8,
      occurrence: 7,
      detection: 4,
      safetyImpact: true,
      regulatoryImpact: true,
      massProductionImpact: true,
      degradationAction: '三相下桥能耗制动吸收能量，抑制母线过压；有源米勒钳位拉低关断阻抗。',
    },
    dfmeaItems: [
      {
        failureMode: '急停反电动势过压击穿母线电容与MOSFET / 高速换向同桥臂米勒效应直通短路',
        failureCause: '未实施三相下桥能耗制动耗散动能；门极关断下拉回路阻抗偏大未配置有源米勒钳位；PCB 功率回路寄生杂散电感未吸收。',
        localEffect: 'MOSFET 与母线电解电容击穿烧毁，驱动板冒烟失效',
        systemEffect: '执行器失去驱动控制，座舱滑屏或座椅调节功能中断',
        vehicleEffect: '可能触发车身控制器过流熔断或整车急停防夹安全响应失效',
        severity: 8,
        occurrence: 7,
        detection: 4,
        safetyImpact: true,
        regulatoryImpact: true,
        massProductionImpact: true,
        degradationAction: '三相下桥能耗制动吸收能量，抑制母线过压；有源米勒钳位拉低关断阻抗。',
      },
      {
        failureMode: '转子位置传感器 (霍尔元件) 信号单路断线或跳变异常',
        failureCause: '车身线束振动松脱、高温焊点疲劳断裂或霍尔 IC 内部放大器高温热击穿（具体温度点以本项目环境试验边界为准，模板不预填）',
        localEffect: '换相时序丢失正交跳变沿，逆变相电流畸变，电机发生高频抖动或啸叫',
        systemEffect: '执行器失步停转或反转卡死，座舱执行器无法平稳走完全行程',
        vehicleEffect: '座舱动作中断，整车控制器上报执行器故障码，中控屏提示功能受限',
        severity: 8,
        occurrence: 4,
        detection: 3,
        safetyImpact: true,
        regulatoryImpact: false,
        massProductionImpact: true,
        degradationAction: '触发 2-Hall 容错降级算法重构第三相；降级后的转速/电流限幅比例需按当前电机额定值与整车安全要求定义，并上报对应的转子位置传感器 DTC 进入跛行保底模式（模板不预填比例与 DTC 号）。',
      },
      {
        failureMode: '三相半桥开关节点 目标谐振频点 高频谐振骚扰发射超标',
        failureCause: 'PCB 功率开关回路杂散电感与功率管 Coss 结电容在高速开关瞬间发生欠阻尼振荡（回路杂散电感以 P008/回路电感输入或实测提取为准，模板不预填数值）',
        localEffect: '开关节点电压振铃峰峰值超标，对附近敏感线束形成近场耦合辐射（超标幅度必须以实测频谱为准，模板不预填）',
        systemEffect: '造成车载 FM 广播与钥匙无线接收天线 (RKE) 信噪比恶化',
        vehicleEffect: '违反整车 CISPR 25 Class 5 车规强制准入测试，导致车型公告延期',
        severity: 7,
        occurrence: 6,
        detection: 3,
        safetyImpact: false,
        regulatoryImpact: true,
        massProductionImpact: true,
        degradationAction: '在开关节点加装 RC Snubber 或等效阻尼网络，具体容值/阻值必须按实测振铃频率与寄生参数计算，衰减量以实测频谱确认（模板不预填数值）。',
      },
    ],
    bldcExtendedAnalysis: {
      commutationRisk: {
        controlMode: 'hall_six_step',
        controlModeLabel: '六步方波有感换相 (集成自适应前馈角补偿算法)',
        speedRangeRpm: rpm !== undefined ? [Math.round(rpm * 0.2), rpm] : [0, 0],
        speedOffsetDeg: rpm !== undefined ? 6.5 : 0,
        torqueRippleEstimatePct: rpm !== undefined ? 18.5 : 0,
        stallOutProbability: 'medium',
        stallOutReason: rpm !== undefined ? `高速 ${rpm}rpm 急刹重载时，由于传感器安装公差累积产生换相提前角与转矩纹波，座舱机械机构有微弱振颤风险（具体提前角/纹波数值需实测标定，不得沿用历史模板数字）。` : '缺转速输入(rpm)，无法评估高速换相失步风险；请补充结构化转速后重新评估。',
        degradationAction: rpm !== undefined ? `MCU 在线加载前馈角补偿 LUT 表；当转矩纹波过大时，平滑切入限速 ${Math.round(rpm * 0.6)}rpm 与限流保护。` : '待输入转速后给出限速与限流建议。',
      },
      positionSensorDegradation: {
        sensorType: 'hall_triple',
        sensorTypeLabel: '三路车规数字霍尔传感器 (120° 电角度空间分布)',
        redundancyAvailable: true,
        switchingLogic: '三路霍尔中若单路断线或卡死，MCU 状态机通过捕获剩余两路正交跳变沿并结合反电势积分实时重构丢失相信号 (2-Hall 容错算法)。',
        performanceLoss: '转矩纹波上升、急加速动态响应延迟增加，稳态转速按降级策略限幅（具体比例与时延需实测标定，模板不预填数值）。',
        dtcTriggered: '转子位置传感器故障 DTC（具体故障码按本项目诊断规范定义，模板不预填）',
        powerLimitMode: '激活 Limp-Home 限功率降级模式：按当前电机额定相电流设定峰值钳制比例，并禁用超高速档位（比例与额定值需按本项目电机参数填入，模板不预填）。',
        dfmeaSeverity: 8,
        dfmeaOccurrence: 4,
        dfmeaDetection: 3,
      },
      functionalSafetyChain: {
        currentSenseDualChannel: {
          mainChannel: '低端双采样电阻运算放大通道 (Phase A/B Shunt)',
          monitorChannel: '高压母线总电流监测芯片隔离差分通道',
          toleranceThresholdPct: 5.0,
          responseTimeLimitUs: 200,
          crossCheckStatus: 'COMPLIANT',
          diagnosisMechanism: '主监控通道执行周期性偏差交叉核验，偏差连续 3 个控制周期 (>200μs) 超过 5.0% 立即触发硬件比较器保护锁死。',
        },
        watchdogTiming: {
          fhtiBudgetMs: 10.0,
          safeStateTransitionMs: 2.2,
          wdgTimeoutWindowMs: 4.0,
          marginMs: 3.8,
          timingCompliance: 'PASS',
        },
        asilDecomposition: {
          overallLevel: context.asilLevel,
          mcuSubsystem: 'ASIL D(B) (具备硬双核锁步与硬件看门狗窗口)',
          gateDriverSubsystem: 'ASIL B (集成欠压保护、过流去饱和及门极米勒钳位)',
          positionSensorSubsystem: 'ASIL B / QM(B) (满足单点故障度量 SPFM > 90%)',
          decompositionProof: '依据 ISO 26262-5 第 7 章硬件架构度量要求，MCU 与预驱芯片独立切断供电桥臂构成双重独立关断冗余路径。',
        },
      },
    },
    candidateActions,
    finalRecommendation: {
      recommendedOptionId: 'Option A',
      recommendedOptionName: '实施方案 A：三相全下桥能耗制动 + 门极有源米勒钳位/反向低阻通路 + 目标谐振频点 RC Snubber',
      recommendationGrade: 'Strongly Recommended',
      whyReason: [
        `物理机理根治：用电机机电能量守恒原理在下桥循环消纳动能；当前 Bus Pumping 基线=${dynamicBus}，整改后绝对值必须通过实测/重新计算确认。`,
        `多维兼顾：当前 Miller 基线=${dynamicMiller}；高温裕量与整改后数值须由验证数据确认，RC Snubber 对 目标谐振频点 振铃的效果也必须以实测频谱确认。`,
        '时间与成本相对可控：改动集中在固件与样件级阻容改制，可在原有焊盘上验证；BOM 增幅与实际工期需按当前项目核算（模板不预填金额与天数）。',
      ],
      immediateSteps: [
        { step: 1, title: '底层固件三相下桥制动刷写', action: '电机控制软件工程师配置紧急制动函数：刹车中断触发时关断三路上桥 PWM，拉高三路下桥栅极信号进行动态制动（导通时长按制动策略与热校核设定）。', owner: 'Embedded SW Lead', deadline: 'Day 2 17:00' },
        { step: 2, title: '门极关断回路阻抗微调与米勒钳位使能', action: '硬件组在 Gate Driver 评估板上开启 Active Miller Clamp 寄存器功能，或在 MOS 门极并联快速关断二极管+低阻支路（阻值按门极回路核算，模板不预填）。', owner: 'HW Motor Specialist', deadline: 'Day 3 14:00' },
        { step: 3, title: '开关节点 RC Snubber 焊接与示波器验证', action: '在三相开关节点对地并联 RC 吸收网络（容值/阻值按实测振铃频率计算，模板不预填），示波器双通道抓取 Vds 与 Vgs 尖峰波形。', owner: 'HW Engineer', deadline: 'Day 4 18:00' },
        { step: 4, title: '高温环境箱急停极限疲劳复测', action: '将整套控制器放入项目规定的高温环境试验箱，以最高工作转速周期性触发急停，按项目规定的循环次数连续试验，监测母线电压与 MOS 结温。', owner: 'Test Lead', deadline: 'Day 7 12:00' },
      ],
      preconditions: [
        '下桥动态短路制动期间，电机相电流峰值不得突破当前 MOSFET 脉冲电流安全工作区 (SOA) ——具体额定电流/脉宽必须查当前器件数据手册，模板不预填。',
      ],
      unacceptableActions: [
        '严禁通过软件擅自调高预驱芯片 OVP 过压保护跳闸阈值来掩盖母线泵升故障！',
        '严禁在未验证高温下 Vth 衰减特性的情况下盲目放行米勒尖峰（温度点按器件数据手册）。',
      ],
      stopConditions: [
        '若高温急停测试中下桥 MOSFET 温度超过当前器件降额允许值，必须立即将三相短接时间改为分段斩波制动 (PWM Dynamic Braking)。',
      ],
      reEvaluationTriggers: [
        '完成项目规定次数的急停耐久试验与示波器波形确认归档之日。',
      ],
      planB: '若整车长线束在某些极端工况仍有感应反射，在母线电源入口临时追加车规级双向 TVS 辅助削峰（功率等级按当前母线瞬态能量选型，模板不预填）。',
    },
    raciMatrix: [
      { role: 'HW', raciType: 'R', owner: 'HW Motor Lead', action: '完成 RC Snubber 选型、门极米勒钳位电路验证及示波器波形抓取', output: 'BLDC 驱动电气尖峰整改与实测报告', dueDate: 'Day 4', decisionGate: '硬件门禁' },
      { role: 'SW', raciType: 'R', owner: 'Motor Control SW', action: '修改急停制动策略为三相全下桥动态能耗制动，并实施防夹超时自锁保护', output: '制动策略优化固件 V1.2', dueDate: 'Day 2', decisionGate: '软件门禁' },
      { role: 'System', raciType: 'C', owner: 'Cabin System Lead', action: '确认执行器紧急制动最大响应时间（按当前项目适用法规窗口）与防夹制动力矩', output: '机械阻尼与制动响应边界规范', dueDate: 'Day 2', decisionGate: '系统门禁' },
      { role: 'PM', raciType: 'A', owner: 'Project Manager', action: '管控 当前 DV 节点，协调座舱暗室与台架测试排期', output: 'DV 节点推进跟踪表', dueDate: 'Day 1', decisionGate: '项目里程碑' },
      { role: 'Quality', raciType: 'A', owner: 'QA Manager', action: '审核 MOS 结温降额裕量、急停寿命试验数据与 DFMEA 闭环', output: '质量审核报告', dueDate: 'Day 8', decisionGate: '质量门禁' },
      { role: 'Safety', raciType: 'C', owner: 'Safety Manager', action: '评估三相下桥制动策略在 MCU 异常失步时的失效安全 (Fail-safe) 机制', output: 'ASIL B 安全分析声明', dueDate: 'Day 5', decisionGate: '功能安全' },
      { role: 'Sourcing', raciType: 'I', owner: 'Buyer', action: '锁定整改所需的 RC 吸收网络与门极关断支路物料交期', output: 'BOM 成本与物料清单', dueDate: 'Day 3', decisionGate: '采购门禁' },
      { role: 'Customer', raciType: 'Approval', owner: 'OEM Mechatronics Rep', action: '审批急停测试数据报告与 DV 准入签核', output: '客户试验认可签核单', dueDate: 'Day 12', decisionGate: '客户门禁' },
    ],
    containment: {
      shortTermMeasure: '在当前批次的 B 样件上刷写三相下桥能耗制动固件，并在驱动板开关节点手工焊加 RC Snubber（批次台套数按当前样件状态）。',
      validityScope: '当前全部 B 样机电测试台架件与 DV 摸底样机。',
      responsibleParty: 'HW & SW Motor Team',
      timeline: '72 小时内全部完成改制与自检。',
    },
    capa: {
      rootCauseAction: '更新《车规 BLDC 功率级设计规范》：明确规定所有大惯量电机驱动方案必须标配下桥能耗制动或硬件主动泄放电路；米勒感应抑制必须保证高温下留有安全裕量（门槛按当前器件与项目规范定义）。',
      preventiveMeasure: '在方案设计评审 (PDR) 阶段，强制采用“BLDC 电机驱动物理核算工具箱”进行母线泵升与米勒感应直通数学建模校核。',
      lessonsLearned: '不能单纯按稳态供电 13.5V 选型 40V MOS，大转动惯量电机急停能量若未受控泄放，瞬态泵升电势极易击穿器件！',
      verificationTarget: `高温连续急停验证：母线峰值目标值与 Vds 耐压裕量需基于当前确定性基线（Bus Pumping=${dynamicBus}）及项目规格定义；Miller峰值目标值需结合当前基线（${dynamicMiller}）与门极阈值确定。`,
    },
    engineeringDocs: {
      pmDecisionEmail: {
        subject: `[Emergency Action Proposal] ${context.projectName} BLDC 急停母线泵升与米勒直通闭环治理方案`,
        technicalFact: `结构化输入与本地确定性计算：rpm=${rpm ?? 'UNKNOWN'}；Bus Pumping=${dynamicBus}；Vds额定耐压=${vds ?? 'UNKNOWN'}V；dv/dt=${dvdt ?? 'UNKNOWN'}V/ns；Miller=${dynamicMiller}。以上数值均不得由历史模板数字替代。`,
        currentSituation: `距离正式 DV 准入仅剩 ${daysRemaining} 天，传统重新投板改走大尺寸电解电容与大功率 TVS 周期需约三周且单板超支，将直接导致节点违约。`,
        risk: '若不做处理硬推测试，高温急停时必发生母线电容爆浆或同桥臂直通炸管严重事故。',
        options: '方案 A：三相下桥能耗制动 + 有源米勒钳位 + RC Snubber (推荐)；方案 B：大改硬件并联 3 颗 TVS 及 1500uF 电容；方案 C：自由滑行停机 (ASIL B违约)。',
        recommendedOption: `强烈建议采纳方案 A：软硬件协同就地消化能量。当前确定性基线为 Bus Pumping=${dynamicBus}、Miller=${dynamicMiller}；整改后电压/门极峰值、BOM 与工期必须经过项目验证后确认。`,
        costImpact: '单板 BOM 增幅需按当前项目预算控制红线核算（模板不预填金额）。',
        scheduleImpact: '对 当前 DV 节点 0 延期影响，4 天内完成工程自检闭环。',
        requiredDecision: '请 PM 及硬件总监签批批准方案 A 实施路径。',
        decisionOwner: 'Project Manager & Chief Engineer',
        deadline: '今日 18:00 前签批',
        assumedProceeding: '批准后立即启动固件刷写与样板 RC 网络改制。',
        changeConsequence: '若不批准，将触发样件报废重投与 DV 试验推迟 3 周。',
      },
      deviationPermit: {
        title: 'B 样阶段 BLDC 驱动急停母线过压与高频振铃受控改制许可',
        requirement: 'Bus Voltage Peak 与 Gate induced spike 限值必须按当前器件降额规范与项目规格定义（模板不预填）；CISPR 25 Class 5 以实测频谱判定。',
        actualResult: `整改前：以当前结构化输入计算的 Bus Pumping=${dynamicBus}、Miller=${dynamicMiller}；方案 A 实施后结果暂缺实测证据，禁止预填历史示例数字。`,
        deviationDetail: '允许在 B 样阶段采用贴片微调飞件与固件三相下桥制动组合措施通过 DV 摸底，并在 C 样量产投板时完全固化。',
        technicalCause: '急停动能回馈倒灌与寄生米勒电容高频耦合效应。',
        riskAnalysis: '实施方案 A 后，母线电压与结温均处于深度降额安全区间内，残余工程风险评级已降至极低。',
        affectedScope: '当前 B 样批次全部功能样件（台套数按实际试制批次）。',
        containment: 'MCU 内部固件增加过压与短路过流双重硬件比较器中断保护。',
        temporaryValidity: '有效期至 C 样量产 PCB 发布 (45 天有效)。',
        approvalRoles: 'HW Lead [Signed] / SW Lead [Signed] / Quality Director [Signed]',
        correctiveAction: '在 C 样原理图中正式固化 RC Snubber 电路、门极加速关断支路，并更新电机控制库。',
        verificationPlan: '进入项目规定的高温环境试验箱，按项目规定的循环次数执行全速制动实测。',
        closureCriteria: '母线峰值、Miller感应峰值及EMC频谱需以整改后实测证据闭环；不得使用模板数字代替测试结果。',
      },
      internalDeviationPermit: {
        title: '内部受限工程偏差单 (Internal Deviation Permit) - B 样 BLDC 能耗制动改制',
        permitType: 'Internal Deviation (内部受限工程偏差单)',
        internalBatchScope: '当前 B 样试制批次台架件（批次号与台套数按实际试制记录填写）',
        manufacturingSite: '域控制器第二试制车间 SMT 快速打样线',
        usageConstraint: '仅限用于台架白盒调试、高温环境箱急停寿命测试及 DV 摸底暗室；严禁直接装车路试。',
        technicalRootCause: '急停瞬间转子机械动能经三相逆变器反向泵升倒灌回母线电容，且开关瞬态 dv/dt 激发米勒效应尖峰。',
        riskEvaluation: `方案 A 的理论机理可降低母线泵升与 Miller 风险，但当前只能锚定整改前确定性基线 Bus Pumping=${dynamicBus}、Miller=${dynamicMiller}；整改后电压/门极峰值及热应力必须经验证确认。`,
        containmentProtocol: '每台样机在刷写固件 V1.2 后必须在台架经 100% 满负荷急停 5 次连续示波器复测合格方可放行。',
        expirationDate: 'C 样 OTS 硬件投板发布日（具体日期按项目计划填写）',
        mandatoryScrapProtocol: 'DV 摸底结束后，本批次样机统一加贴“受限报废”黄标，由质量部监督入库解体，严防混入量产件。',
        approvers: {
          hwLead: '林工 (Hardware Lead / 已签核)',
          plantQuality: '李经理 (Plant Quality / 已签核)',
          productionManager: '赵主管 (Pilot Production Lead / 已签核)',
        },
      },
      customerConcessionPermit: {
        title: 'OEM 客户工程让步申请书 (Customer Concession Request) - 急停能耗制动吸收',
        permitType: 'OEM Customer Concession (主机厂客户工程让步申请书)',
        vdaStandardRef: 'VDA Volume 2 / AIAG PPAP 4th Edition Section 3.2',
        fiveWhyRootCause: [
          `1. Why: rpm=${rpm ?? 'UNKNOWN'} 急停制动时母线泵升为何达到 ${dynamicBus}？ -> 转子机械动能经逆变器回灌母线的机理需要结合 J、Cbus 与效率确认。`,
          '2. Why: 动能为何向母线倒灌？ -> 传统自由滑行控制在上桥关断后下桥高阻，回馈电流经体二极管充入母线。',
          '3. Why: 为何不通过改版增加大功率 TVS？ -> 改版制板打样周期约三周，直接突破当前 DV 准入节点，且 BOM 增幅需按预算红线核算。',
          '4. Why: 下桥能耗制动为何能闭环？ -> 闭合下桥 MOSFET 构筑相绕组闭环环流回路，动能完全转化为绕组铜耗就地吸收。',
          '5. Why: 能否保证安全与可靠性？ -> 需要补充实际制动电流、SOA 与瞬态热证据；本轮不把历史示例电流/温升数字当作当前项目事实。',
        ],
        missionProfileRisk: '在整车 15 年 / 30 万公里生命周期中，急停工况占总启停寿命 <0.1%，热疲劳积累可忽略。',
        capaPlan: '在 C 样阶段将 RC 吸收网络与优化后的门极加速关断走线固化进量产 Gerber，更新 DFMEA 与测试用例。',
        cutoffPoint: '当前 B 样试制批次用于 DV 准入；C 样 OTS 件全面固化正式设计。',
        commercialImpact: '方案 A 单板 BOM 增幅与商务协议限额需按当前项目核算（模板不预填金额）；相较硬改版可避免因延期违约产生的试验延期索赔。',
        signOffRequired: {
          tier1ProgramDirector: '陈总 (Tier-1 项目研发总监 / 签核中)',
          oemChiefEngineer: '黄总工 (主机厂智能座舱机电系统主任工程师 / 待批准)',
          oemCommodityBuyer: '孙经理 (主机厂座舱采购商务负责人 / 备案)',
        },
      },
      ppapDeviationControlPlan: {
        title: 'PPAP 临时工程偏差控制计划 (PPAP Deviation Control Plan)',
        documentNumber: 'PPAP-DCP-（按项目文档编号规则填写）',
        submissionLevel: 'PPAP Level 3 (按主机厂体系要求提交全套PSW与实测报告)',
        deviationCharacteristic: '急停反拖机械动能由下桥循环能耗制动吸收替代大尺寸电解电容硬件硬吸收',
        nominalSpecification: '母线瞬态吸收电压限值按当前器件额定耐压与降额规范定义（模板不预填）',
        interimSpecification: `三相下桥制动后的母线峰值与 Miller 感应峰值目标需依据当前基线（Bus Pumping=${dynamicBus}；Miller=${dynamicMiller}）和项目规格定义，再由实测确认。`,
        processPhase: 'B 样试验件试制与 DV 试验准入批次',
        inspectionFrequency: '每批 100% 执行最高工作转速急停的示波器双通道波形抓取，数据直传 MES',
        containmentMethod: '刷写含过压与直通硬件比较器锁死的固件；加装 RC Snubber（容值/阻值按实测振铃频率计算）',
        reactionPlan: '若急停峰值或相电流突破当前项目规定的门限值，立即熔断停机并隔离待查（门限按实测基线与器件规格定义）',
        effectiveBatchOrVinRange: '当前 B 样试制批次（批次范围按实际试制记录填写）',
        closureTargetDate: 'C 样 OTS 模具板发布日前（具体日期按项目计划填写）',
        standardReference: 'AIAG PPAP 4th Edition / VDA 2 / ISO 26262-5 Clause 7.4.3',
        authorizedSignatures: {
          sqeManager: '张工 (Supplier Quality Assurance Lead)',
          manufacturingQualityLead: '李总监 (Plant Quality Director)',
          programDirector: '陈总 (Senior Program Director)',
        },
      },
      specialCharacteristicsUpdate: {
        title: '特殊特性清单 (SC/CC) 工程更新单',
        ecrReferenceNumber: 'ECR-（按项目变更编号规则填写）',
        characteristicId: 'CC-BLDC-02',
        characteristicType: 'CC (Critical Characteristic / 安全关键特性)',
        parameterName: '急停制动响应时间 & 功率管米勒抑制裕量',
        originalSpec: '停机时间 <= 300ms, Vgs感应未受控定义',
        revisedSpec: '急停制动时间与门极米勒感应毛刺限值按当前项目法规窗口与器件阈值裕量定义（模板不预填）',
        classificationJustification: '直接关联座舱防夹乘员人身安全 (ASIL B) 与驱动逆变桥防直通短路起火风险',
        safetyOrComplianceImpact: '防止电机失控反拖导致机械机构夹伤；杜绝高温直通引发单板热烧蚀',
        processCapabilityRequirement: 'Cpk >= 1.67, Ppk >= 1.33 (关键特性强制 100% 统计过程受控)',
        pokaYokeMethod: '测试工位自动化高阻示波器抓取，数据直连 MES 数据库，超出门极尖峰门禁（按项目定义）自动锁定治具',
        standardClauseRef: 'ISO 26262-5 Clause 7.4.3 / FMVSS 118 / AEC-Q101',
        responsibleEngineers: {
          systemSafetyEngineer: '王工 (Functional Safety Lead)',
          hwArchitect: '林工 (Principal HW Architect)',
          dfmeaModerator: '赵工 (DFMEA Facilitator)',
        },
      },
      customerDeviationRequest: {
        title: '主机厂客户正式工程偏差申请单 (Customer Deviation Request - CDR)',
        permitNumber: 'CDR-（按项目让步申请编号规则填写）',
        customerName: '国内头部新势力主机厂 (智能座舱研发中心)',
        customerContactWindow: '黄总工 (座舱机电系统主任工程师) / 孙经理 (采购质量窗口)',
        oemPartNumber: 'OEM-P/N: 8200-9941-B02',
        supplierPartNumber: 'SUP-P/N: CSA-G2-ECU-B03',
        standardClauses: [
          'ISO 26262-5:2018 Clause 7.4.3 (硬件架构指标与安全机制有效性)',
          'ISO 16750-2:2023 Section 4.6.2 (车载过电压与反向电动势冲击)',
          'CISPR 25:2021 Class 5 Table 7 (车载无线电接收保护限值)',
          'OEM-STD-E08 Seat Actuator Safe Reversal Spec (防夹制动响应限值)',
        ],
        deviationDescription: '在 B 样阶段允许使用三相全下桥动态能耗制动替代增加大功率 TVS 的硬件硬改版，并在原有样件焊盘上微调 RC Snubber（容值/阻值按实测振铃频率计算）进行交付。',
        rootCause5WhySummary: '1. Why母线过压? 急停动能倒灌 -> 2. Why倒灌? 传统停机上桥关闭下桥未导通 -> 3. Why不改版加大功率TVS? 投板周期约三周会击穿DV节点且BOM增幅需按预算红线核算 -> 4. Why可行? 电机反电势下桥循环消纳经物理建模完全闭环 -> 5. 结论: 软硬协同是兼顾安全与工期的最优车规解。',
        safetyAndEmcAssessment: `安全与EMC结论需以当前项目验证闭环；当前确定性基线为 Bus Pumping=${dynamicBus}、Miller=${dynamicMiller}，其余SOA、热与目标谐振频点频谱数据均不得用历史模板数字替代。`,
        qualityContainmentCommitment: '当前 B 样批次样机 100% 进行高温环境箱循环急停摸底（循环次数按项目规定）；每套出具 MES 追溯曲线；C 样模具件正式固化。',
        impactOnVehicleAssembly: '对外电气接口、线束插头、外壳装配尺寸与通信协议完全无变动，对整车流水线装配 0 影响。',
        quantityOrDateLimit: '限定用于当前 B 样批次及 DV 试验阶段（至 SOP 前 C 样更新完成，具体日期按项目计划）。',
        customerAuthorizationSignOff: {
          oemCommodityBuyer: '待签核 (OEM 智能座舱采购总监)',
          oemSystemEngineer: '待签核 (OEM 座舱机电总师)',
          oemChiefQualityAuditor: '待签核 (OEM 供应商质量审核专家)',
        },
      },
      meetingMinutes: {
        title: `${context.projectName} BLDC 驱动急停母线泵升与米勒直通工程攻坚评审纪要`,
        attendees: 'Hardware Lead, Motor Control Specialist, System Lead, Quality Manager, PM',
        discussionSummary: `动力学与物理模型表明急停动能回灌是母线泵升的重要机理；当前本地计算基线为 Bus Pumping=${dynamicBus}、Miller=${dynamicMiller}。RC Snubber 参数属于候选设计值，最终需通过波形/频谱验证。`,
        agreements: [
          '全员一致否决硬改版堆 TVS 方案 (耗时太长且成本超标)。',
          '一致同意采纳方案 A：软硬件协同三重防护，作为保住 当前 DV 节点的唯一破局路径。',
          'C 样阶段全面将 RC Snubber 与低寄生电感桥臂布线纳入 PCB 设计规则。',
        ],
        actionItems: [
          'SW：完成全下桥能耗制动底层代码并在电机台架上调试 - 责任人：SW Lead - 截止：第 2 天 17:00',
          'HW：焊接 RC Snubber（按实测振铃频率取值）并捕获高频示波器波形 - 责任人：HW Lead - 截止：第 3 天 18:00',
          'QA：监督高温环境箱耐久测试（循环次数按项目规定）并归档报告 - 责任人：Quality Lead - 截止：第 7 天 12:00',
        ],
      },
      riskAcceptance: {
        riskId: 'RISK-BLDC-2026-09-06',
        description: '在三相下桥制动瞬间，电机绕组存在瞬态制动电流；峰值与持续时间需通过当前项目波形和SOA验证，不预填历史24A/200ms数字。',
        residualRiskJustification: 'MOSFET 脉冲耐受电流、制动脉冲宽度与结温瞬态需要根据当前器件数据手册和实测波形确认；本轮不把历史55A/24A/200ms/12.5℃作为当前事实。',
        acceptingSignOff: 'Chief Technical Officer & Quality Director',
        expirationCondition: '项目规定次数的台架耐久测试无热损伤后正式闭环。',
      },
      dfmeaComment: {
        lineItem: 'DFMEA Item #108: Inverter Power Stage Bus Overvoltage & Shoot-Through Breakdown',
        recommendedAction: '将三相下桥能耗制动控制与门极米勒感应安全裕量（门槛按器件阈值定义）列为 BLDC 控制器必须符合的设计门禁准则。',
        targetDate: '2026-10-15',
        owner: 'Motor Drive Hardware Specialist',
      },
      ecrDescription: {
        ecrTitle: 'BLDC 逆变桥 RC Snubber 吸收电路固化与门极关断回路优化工程变更',
        reasonForChange: '彻底抑制开关节点 目标谐振频点 振铃、滤除门极米勒尖峰，配合底层下桥能耗制动消除急停母线泵升。',
        proposedSolution: '在三相半桥中点增加 RC Snubber（容值/耐压/阻值按实测振铃频率与开关节点电压计算），在门极增加快速关断二极管焊盘。',
        costEstimate: 'BOM 增幅按当前项目核算（模板不预填金额）。',
        toolingLeadTime: '纳入常规 C 样 PCB 改版投板。',
        impactAssessment: '大幅改善 CISPR 25 Class 5 传导发射与开关管可靠性，对机械结构无任何影响。',
      },
    },
  };
}
