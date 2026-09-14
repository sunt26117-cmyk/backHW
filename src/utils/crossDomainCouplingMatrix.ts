import { EngineeringDomain } from './scenarioDomainEngine';

export interface CrossDomainCouplingItem {
  id: string;
  domainPair: [EngineeringDomain, EngineeringDomain];
  fromDomain: EngineeringDomain;
  toDomain: EngineeringDomain;
  trigger: string;
  action: string;
  physicalChange: string;
  affectedDomain: string;
  requiredRevalidation: string[];
  mechanism: string;
  physicalTradeoff: string;
  positiveCorrelation: boolean; // 是否正向加剧
  keyParameters: string[];
  standardReference?: string;
  vetoCondition?: string;
}

/**
 * 车规级与机器人关节显式跨工程域物理耦合矩阵
 * 严格按照「动作 → 物理量变化 → 受影响域 → 需要重新验证的项」闭环规范定义
 */
export const CROSS_DOMAIN_COUPLING_MATRIX: CrossDomainCouplingItem[] = [
  // 1. EMC ↔ BLDC 驱动：Rg / 死区 / 展频 / dv-dt 调整对辐射发射与米勒直通的双向影响
  {
    id: 'CP_BLDC_EMC_RG_MILLER',
    domainPair: ['BLDC', 'EMC_RE_CE'],
    fromDomain: 'BLDC',
    toDomain: 'EMC_RE_CE',
    trigger: '为抑制下桥门极米勒感应抬升 (Vgs_induced) 减小关断电阻 Rg_off 或加大死区',
    action: '减小 Rg_off（如 10Ω 降至 2.2Ω）或启用低阻下拉',
    physicalChange: '开关瞬态 dv/dt 和 di/dt 显著激增（>8V/ns），激发体二极管反向恢复震荡谐波',
    affectedDomain: 'EMC_RE_CE (CISPR 25 辐射发射与传导骚扰)',
    requiredRevalidation: [
      'CISPR 25 Class 5 30MHz-108MHz FM 频段全向天线辐射发射',
      '示波器高阻探头以接地弹簧实测开关节点真实 dv/dt 与 Vds 过冲峰值',
      '相线高频共模电流扼流圈发热与共模衰减度',
    ],
    mechanism: 'MOSFET 开关速度 (dv/dt, di/dt) 提高直接拓宽频谱包络并抬高 30MHz-108MHz 高频谐波能量',
    physicalTradeoff: '减小关断电阻 Rg 或加剧死区虽抑制米勒直通，但直接恶化 CISPR 25 辐射发射',
    positiveCorrelation: true,
    keyParameters: ['dv/dt', 'Rg_off', 'Trr', 'Qrr', 'CISPR 25 Class 5 限值'],
    standardReference: 'CISPR 25 / ISO 11452-2',
    vetoCondition: '若为解决米勒直通将 dv/dt 提高致使 FM 频段超限 > 10dBμV/m 且无屏蔽隔离，予以一票否决',
  },
  {
    id: 'CP_EMC_BLDC_SLOW_SWITCH',
    domainPair: ['EMC_RE_CE', 'BLDC'],
    fromDomain: 'EMC_RE_CE',
    toDomain: 'BLDC',
    trigger: '为通过 CISPR 25 Class 5 增大门极驱动电阻 Rg 或并联 G-S/D-S 电容',
    action: '增大 Rg_on / Rg_off（如由 4.7Ω 增大至 33Ω）或加大门极滤波容值',
    physicalChange: '开关交叠开通与关断时间 (tr, tf) 翻倍延长，密勒平台停留时间拉长',
    affectedDomain: 'BLDC 驱动 (开关损耗剧增、占空比有效传递失真与下桥米勒易感性)',
    requiredRevalidation: [
      '死区裕量重新校准（防止开关延时拉长导致对管微直通）',
      '重测全温区最差工况 MOSFET 交叠开关损耗 P_sw',
      'FOC 电流环低占空比死区非线性补偿表重标定',
    ],
    mechanism: '门极充放电时间常数 Tau=Rg*Ciss 增大，Vds/Id 交叠面积呈线性扩大',
    physicalTradeoff: 'EMC 高频谐波被滤除，但开关能量损耗 P_sw 成倍剧增，引发结温温升与控制精度恶化',
    positiveCorrelation: false,
    keyParameters: ['P_sw', 'tr', 'tf', 'Deadtime_margin', 'Vgs_miller_plateau'],
    standardReference: 'AEC-Q101 / CISPR 25',
    vetoCondition: 'Rg 过大导致开关延迟超过预设死区时间造成上下桥直通，予以绝对一票否决',
  },

  // 2. EMC ↔ 热：滤波元件、磁珠、缓冲电路引入的额外损耗与温升
  {
    id: 'CP_EMC_THERMAL_SNUBBER',
    domainPair: ['EMC_RE_CE', 'THERMAL'],
    fromDomain: 'EMC_RE_CE',
    toDomain: 'THERMAL',
    trigger: '为消除相线高频尖峰与振铃加装 RC 吸收电路 (Snubber) 或共模扼流磁珠',
    action: '在桥臂开关节点并联高频无感吸收网络 (如 1nF + 2.2Ω) 并串联铁氧体磁珠',
    physicalChange: '每个 PWM 周期吸收电容充放电能量转化为纯热量 P_snubber = C * V^2 * f_sw',
    affectedDomain: 'THERMAL (吸收电阻功耗、磁珠居里温度降额及周围焊盘温升)',
    requiredRevalidation: [
      '温箱 85℃ 额定工况下吸收电阻实测稳态温度 (< 125℃ 额定上限)',
      '核算磁珠额定直流偏置电流下的磁芯发热与居里点阻抗衰减',
      '最差输入母线电压 (如 32V 或 58V) 下的 Snubber 额定功耗耐量',
    ],
    mechanism: '吸收电路将高频电磁振荡无功功率通过电阻耗散为有功热能，高开关频率下热积聚明显',
    physicalTradeoff: '吸收尖峰抑制辐射骚扰 6~10dB，但单板引入 2~5W 集中热源',
    positiveCorrelation: true,
    keyParameters: ['P_snubber', 'f_sw', 'R_snubber_wattage', 'Ferrite_Curie_Temp'],
    standardReference: 'ISO 16750-4 / AEC-Q200',
    vetoCondition: '吸收电阻表面计算温升超过元器件额定降额温度上限 (150℃)，予以一票否决',
  },

  // 3. 热 ↔ BLDC：开关损耗 ↔ 结温 ↔ RDS(on) 正反馈、SOA 与降额边界
  {
    id: 'CP_THERMAL_BLDC_RUNAWAY',
    domainPair: ['THERMAL', 'BLDC'],
    fromDomain: 'THERMAL',
    toDomain: 'BLDC',
    trigger: '电机长期大扭矩重载或堵转工况下结温 Tj 逐步抬升',
    action: '未及时下调相电流限幅，维持全扭矩输出',
    physicalChange: '硅半导体高温下电子迁移率降低，Rds(on) 按约 0.6%/℃ 正温度系数剧增 (150℃ 时达常温 1.7~2.0 倍)',
    affectedDomain: 'BLDC 驱动 (导通损耗正反馈发散、SOA 热击穿裕量归零)',
    requiredRevalidation: [
      'Foster 热阻网络计算 150℃ 最高环温与最大相电流下的稳态 Tj',
      'SOA 安全工作区曲线降额校验 (确保在热瞬态工作点落在 DC/10ms 安全线内)',
      '电机堵转 3 秒硬件脱扣保护与结温峰值推演',
    ],
    mechanism: 'P_cond = I_rms^2 * Rds(on)(Tj) 形成正反馈温升，若散热热阻不足则发生热失控',
    physicalTradeoff: '追求全工况额定转矩不降额，导致 MOSFET 结温突破 175℃ 极限直接烧结',
    positiveCorrelation: true,
    keyParameters: ['Rds(on)@150C', 'P_cond', 'Rth_jc', 'Tj_est', 'SOA_Limit'],
    standardReference: 'AEC-Q101 / IEC 60747-8',
    vetoCondition: '最坏工况下 MOSFET 计算结温 Tj >= Tj_max - 10℃ (击穿降额红线)，予以绝对一票否决',
  },

  // 4. BLDC ↔ WCCA 寿命终期容差
  {
    id: 'CP_BLDC_WCCA_AGING',
    domainPair: ['BLDC', 'WCCA_EOL'],
    fromDomain: 'BLDC',
    toDomain: 'WCCA_EOL',
    trigger: '常温新鲜样件验证急停泵升吸收裕量满足 40V/60V 耐压要求',
    action: '采用小容量电解/固态电容且未做 10年/15万公里容差裕量分析',
    physicalChange: 'DC-Link 母线滤波吸收电容随高温时效电解液挥发与老化，Cbus 衰减 20%~30%，ESR 升高 2~3 倍',
    affectedDomain: 'WCCA_EOL (寿命终期母线瞬态吸收能力丧失，Vbus 突破击穿阈值)',
    requiredRevalidation: [
      '按 C_nom * 0.7 衰减模型重新核算急停动能倒灌泵升电压 V_bus_peak',
      '最差 ESR 下纹波电流引起的自温升与寿命折损推演',
      '下线 EOL 校准边界确认 (明确老化不可被下线标定消除)',
    ],
    mechanism: '电容容值随寿命衰减导致吸收同样制动动能时 Delta_V 泵升幅度成反比剧增',
    physicalTradeoff: '初期成本与体积最优，但在整车生命周期末期发生高概率批量爆容或击穿击穿',
    positiveCorrelation: false,
    keyParameters: ['Cbus_eol', 'ESR_max', 'Delta_Vbus_pump', 'Vds_breakdown'],
    standardReference: 'SAE J1211 / VW 80000',
    vetoCondition: '未核算 10年/15万公里 EOL 电容老化衰减即宣称耐压裕量充足，判定为不合规',
  },

  // 5. 机器人关节 ↔ 热：一体化紧凑空间热积累与减速机润滑脂劣化
  {
    id: 'CP_ROBOT_JOINT_THERMAL',
    domainPair: ['ROBOT_JOINT', 'THERMAL'],
    fromDomain: 'ROBOT_JOINT',
    toDomain: 'THERMAL',
    trigger: '一体化关节执行高频往复高负载工况（如 35Nm 连续摆动）',
    action: '提高驱动器斩波电流以追求更强动态加速响应',
    physicalChange: '电机定子发热与谐波减速机柔轮/刚轮齿面摩擦热叠加，密闭壳体内热通量暴增',
    affectedDomain: 'THERMAL (减速器润滑脂胶合变质、驱动器 PCB 烘烤环境温升)',
    requiredRevalidation: [
      '关节内部密闭腔体连续 2 小时额定工作热平衡红外/热电偶实测',
      '谐波减速器油脂额定工况接触面最高温度校验 (通常限值 85℃)',
      '驱动板贴片元件环境温升由 40℃ 抬升至 80℃ 后的热降额重算',
    ],
    mechanism: '密闭狭小空间缺乏对流换热，机械摩擦损耗与电气损耗热耦合积聚',
    physicalTradeoff: '提升瞬态峰值输出扭矩将使减速器密封润滑脂迅速劣变，降低机械精度与寿命',
    positiveCorrelation: true,
    keyParameters: ['Torque_peak', 'Lubricant_Temp_Limit', 'Driver_Tj', 'Joint_Heat_Flux'],
    standardReference: 'ISO 10218-1 / IEC 61800-5-1',
    vetoCondition: '减速机齿面持续工作温度超过润滑脂额定上限 (85℃)，触发机械热损伤否决',
  },

  // 6. 机器人关节 ↔ 安全 (STO)：背隙冲击与急停安全时间边界
  {
    id: 'CP_ROBOT_JOINT_SAFETY',
    domainPair: ['ROBOT_JOINT', 'SAFETY'],
    fromDomain: 'ROBOT_JOINT',
    toDomain: 'SAFETY',
    trigger: '为人身协作安全触发 STO (Safe Torque Off) 切除桥臂驱动使能',
    action: '采用纯单通道软件 MCU 封锁 PWM 或无双重硬件切断回路',
    physicalChange: '主控死机时单通道无法切断转矩；机械反冲在急停瞬间引发端部振荡',
    affectedDomain: 'SAFETY (IEC 61800-5-2 STO 硬件独立性与端到端响应时间)',
    requiredRevalidation: [
      '双通道硬件独立切断机制故障注入测试 (单通道失效时另一通道仍能 100% 断转矩)',
      '示波器实测 STO 输入光耦至门极电压归零端到端物理响应时间 (<= 20ms)',
      '机械抱闸动作时间与 STO 触发配合时序',
    ],
    mechanism: '纯软件逻辑无法抵御 MCU 单点失控，缺乏硬件独立性无法达到 PL d / SIL 2',
    physicalTradeoff: '省去独立硬件 STO 开关电路节约成本与面积，但直接违背人机协作安全合规准入',
    positiveCorrelation: false,
    keyParameters: ['STO_Reaction_Time_ms', 'Dual_Channel_Independence', 'PL_d_Compliance'],
    standardReference: 'IEC 61800-5-2 / ISO 13849-1',
    vetoCondition: 'STO 安全转矩断开硬件延时超过安全预算或无硬件双通道独立性，予以绝对一票否决',
  },

  // 7. EMC BCI ↔ 信号链路：大电流注入诱发相电流采样共模击穿
  {
    id: 'CP_EMC_BCI_SIGNAL',
    domainPair: ['EMC_BCI', 'SIGNAL'],
    fromDomain: 'EMC_BCI',
    toDomain: 'SIGNAL',
    trigger: 'ISO 11452-4 BCI 大电流注入 (20MHz-400MHz, 200mA) 注入相线线束',
    action: '在运放采样差分输入端增大 RC 滤波电容抑制共模转差模扰动',
    physicalChange: '运放差分通道群延时增大，相电流采样产生数微秒相位滞后',
    affectedDomain: 'SIGNAL & BLDC 控制 (FOC 电流环解耦发散、飞车或转矩脉动)',
    requiredRevalidation: [
      'Bode 图实测电流环相位裕量 (Phase Margin) 是否仍 >= 45 度',
      '高转速下采样延时引起的角度解算误差与弱磁失步风险',
      'BCI 注入频点下运放输出漂移与 DTC 误报阈值',
    ],
    mechanism: '分流电阻对地寄生不平衡将共模高频电流转化为差模输入电压，过度滤波牺牲控制带宽',
    physicalTradeoff: 'BCI 测试通过，但 FOC 控制动态响应劣化甚至引起电机控制发散',
    positiveCorrelation: false,
    keyParameters: ['BCI_200mA', 'CMRR@100MHz', 'Phase_Margin_Loss', 'Current_Loop_Bandwidth'],
    standardReference: 'ISO 11452-4 / ISO 26262',
    vetoCondition: '滤波延时导致电流闭环控制相位裕量小于 45 度触发系统不稳定，予以一票否决',
  },
];

/**
 * 根据当前主导域与相关域，过滤出适用的显式跨域物理耦合规则
 */
export function getCrossDomainCouplings(
  primaryDomain: EngineeringDomain,
  relatedDomains: EngineeringDomain[] = []
): CrossDomainCouplingItem[] {
  const allDomains = new Set<EngineeringDomain>([primaryDomain, ...relatedDomains]);
  return CROSS_DOMAIN_COUPLING_MATRIX.filter((item) => {
    // 双方域均在涉及范围内，或单侧为主导域且另一侧在涉及域内
    const hasFrom = allDomains.has(item.fromDomain);
    const hasTo = allDomains.has(item.toDomain);
    return hasFrom || hasTo;
  });
}

/**
 * 获取特定候选方案需要回填的耦合校验项清单骨架
 */
export function generateCouplingCheckTemplates(
  primaryDomain: EngineeringDomain,
  relatedDomains: EngineeringDomain[] = []
): Array<{ rule: string; addressed: boolean; note: string }> {
  const couplings = getCrossDomainCouplings(primaryDomain, relatedDomains);
  return couplings.map((c) => ({
    rule: `[${c.fromDomain}➔${c.toDomain}] ${c.action} ➔ ${c.physicalChange}`,
    addressed: false,
    note: `待评估：是否会恶化 ${c.affectedDomain}，重验项：${c.requiredRevalidation[0]}`,
  }));
}
