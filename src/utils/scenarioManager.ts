import { PresetScenario, ProjectContext, IssueInput } from '../types';
import { PRESET_SCENARIOS } from '../data/presetScenarios';

const CUSTOM_SCENARIOS_STORAGE_KEY = 'ecu_copilot_custom_scenarios';

/**
 * 从本地存储读取所有用户自定义新建的工况
 */
export function getCustomScenarios(): PresetScenario[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SCENARIOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to read custom scenarios from localStorage', err);
  }
  return [];
}

/**
 * 保存或更新一个自定义工况
 */
export function saveCustomScenario(scenario: PresetScenario): PresetScenario[] {
  try {
    const list = getCustomScenarios();
    const existingIndex = list.findIndex((item) => item.id === scenario.id);
    const updatedScenario: PresetScenario = {
      ...scenario,
      isCustom: true,
      createdAt: scenario.createdAt || new Date().toISOString(),
    };

    let nextList: PresetScenario[];
    if (existingIndex >= 0) {
      nextList = [...list];
      nextList[existingIndex] = updatedScenario;
    } else {
      nextList = [updatedScenario, ...list];
    }

    localStorage.setItem(CUSTOM_SCENARIOS_STORAGE_KEY, JSON.stringify(nextList));
    return nextList;
  } catch (err) {
    console.error('Failed to save custom scenario to localStorage', err);
    return getCustomScenarios();
  }
}

/**
 * 删除指定的自定义工况
 */
export function deleteCustomScenario(scenarioId: string): PresetScenario[] {
  try {
    const list = getCustomScenarios();
    const nextList = list.filter((item) => item.id !== scenarioId);
    localStorage.setItem(CUSTOM_SCENARIOS_STORAGE_KEY, JSON.stringify(nextList));
    return nextList;
  } catch (err) {
    console.error('Failed to delete custom scenario from localStorage', err);
    return getCustomScenarios();
  }
}

/**
 * 创建一个全新空白的自定义 ECU 工程工况
 */
export function createBlankScenario(
  title = '我的新建工程工况',
  subtitle = '用户自定义空白工程案卷 / 待补充实测事实'
): PresetScenario {
  const uniqueId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const blankContext: ProjectContext = {
    projectName: 'New-ECU-Project-V1',
    productType: '车载电子控制单元 (ECU)',
    ecuType: '主控 MCU + 预驱 + 功率驱动拓扑',
    projectPhase: 'B Sample',
    asilLevel: 'ASIL B',
    customer: '目标整车主机厂',
    sopDate: '2027-06',
    nextMilestone: '正式 DV 台架测试与装车联调',
    daysRemaining: 21,
    costConstraint: '目标 BOM 增量 <= +$0.50',
    sampleStatus: 'B 样初期功能样件已打样',
    hwLeadStyle: 'AGILE_DELIVERY',
    customerSpecialAgreements: [
      {
        id: 'CSA-CUSTOM-01',
        parameter: 'DV 节点交付倒计时 (关键红线)',
        requiredValue: '<= 21 天',
        isMandatoryVeto: true,
      },
    ],
  };

  const blankIssue: IssueInput = {
    issueCategories: ['Design Deviation', 'Test Failure'],
    requirement: '【在此输入设计指标/客户规范】例如：母线瞬态电压极限、CISPR 25 限值、Tj 结温降额上限等',
    actualMeasurement: '【在此输入实测超标事实与数据】例如：实测超标 +3.5dB、温升达到 125℃、母线泵升至 38V 等',
    testCondition: '常温 25℃ 台架工况，额定供电 13.5V，负载持续运行',
    environment: '实验室台架 / 密闭控制器样箱环境',
    failurePhenomenon: '【在此简述失效或异常表现】例如：开关节点振铃严重、芯片保护自锁、波形毛刺超限等',
    engineeringConcern: '【在此简述工程困境与核心分歧】例如：距离节点仅剩 X 天，改版打样周期不足，团队对补丁措施与降额方案存在争议',
    recurrenceCount: 0,
    notes: '工程原则：必须基于物理机理与客观实测数据推导，严禁未经试验放宽保护门限。',
    attachments: [],
  };

  return {
    id: uniqueId,
    title,
    subtitle,
    icon: 'Layers',
    context: blankContext,
    issue: blankIssue,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 基于当前正在编辑的项目参数和实测问题，另存为一个新工况
 */
export function createClonedScenario(
  title: string,
  subtitle: string,
  currentContext: ProjectContext,
  currentIssue: IssueInput
): PresetScenario {
  const uniqueId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  return {
    id: uniqueId,
    title: title || `${currentContext.projectName || '未命名项目'} - 衍生工况`,
    subtitle: subtitle || `基于 ${currentContext.projectPhase} 阶段派生的工程工况`,
    icon: 'Copy',
    context: JSON.parse(JSON.stringify(currentContext)),
    issue: JSON.parse(JSON.stringify(currentIssue)),
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 领域快速模板定义
 */
export interface BlueprintTemplate {
  id: string;
  name: string;
  domain: string;
  description: string;
  category: string;
  context: Partial<ProjectContext>;
  issue: Partial<IssueInput>;
}

export const BLUEPRINT_TEMPLATES: BlueprintTemplate[] = [
  {
    id: 'tpl-emc-conducted',
    name: 'CISPR 25 传导发射 (CE) 超标工况',
    domain: 'EMC 骚扰抑制',
    description: '低频 150kHz~30MHz 传导骚扰毛刺超标，差模/共模扼流圈选型与 π 型滤波器优化',
    category: 'EMC',
    context: {
      productType: '车载 DC/DC 隔离电源模块',
      ecuType: 'High-Frequency Synchronous Buck Controller',
      projectPhase: 'B Sample',
      asilLevel: 'ASIL B',
      daysRemaining: 16,
      costConstraint: 'BOM Filter Cap +$0.40',
    },
    issue: {
      issueCategories: ['EMC', 'Power', 'Test Failure'],
      requirement: 'CISPR 25 Class 5 传导发射限值 (0.15MHz~30MHz 限额 66~46 dBuV)',
      actualMeasurement: '开关频率 400kHz 基频及其前 3 阶谐波处，LISN 测得传导尖峰超标 +6.2 dB',
      testCondition: 'LISN 50Ω/5μH，13.5V 供电，额定负载 8A 稳态输出',
      environment: 'EMC 传导屏蔽室，室温 25℃',
      failurePhenomenon: '低频差模纹波穿透输入级，共模扼流圈高频寄生电容旁路导致高频衰减失效',
      engineeringConcern: '离 DV 试验仅剩 2 周，结构不允许扩大 PCB 面积加装大尺寸屏蔽罩，需通过板级阻抗匹配与 Snubber 网络原位解决',
    },
  },
  {
    id: 'tpl-bldc-pumping',
    name: 'BLDC/PMSM 急停反电动势与高 dv/dt 泵升工况',
    domain: '电机驱动与功率拓扑',
    description: '大惯量负载紧急制动能量回馈倒灌超耐压、米勒直通尖峰与栅极阻抗优化',
    category: 'BLDC Motor Drive',
    context: {
      productType: '智能座舱/底盘执行器驱动器',
      ecuType: '32-bit MCU + 3-Phase Gate Driver + 6-MOSFET',
      projectPhase: 'B Sample',
      asilLevel: 'ASIL B',
      daysRemaining: 15,
      costConstraint: 'No Smart Power Stage, BOM Cap +$0.35',
    },
    issue: {
      issueCategories: ['BLDC Motor Drive', 'Power', 'Functional Safety', 'Reliability'],
      requirement: '1. 急停时母线瞬态电压必须严格低于 40V 耐压上限 (降额红线 34V)；2. 对管开启高 dv/dt 下门极米勒尖峰不得突破 Vth。',
      actualMeasurement: '3500 rpm 带载急停滑行时反电动势使 13.5V 母线冲至 36.5V；下桥栅极出现 2.2V 瞬态感应脉冲。',
      testCondition: '13.5V 供电，4.5m 贯穿线束，急停制动与机械硬堵转',
      environment: '座舱密闭温区 (85℃ 环境)',
      failurePhenomenon: '偶发过压保护 OVP 触发自锁；高低温下管温升偏高',
      engineeringConcern: '母线电容空间受限，下桥能耗制动时序需要与软件标定团队紧急协同对齐',
    },
  },
  {
    id: 'tpl-wcca-shunt',
    name: 'WCCA 采样电流精度与极端温度漂移冲突',
    domain: '最坏情况与公差闭环',
    description: '分流电阻温漂、运放失调 Vos 与 ADC 增益误差在全温区 15 年老化下的最坏叠加超标',
    category: 'WCCA',
    context: {
      productType: '高压电池管理系统 (BMS) / 转向助力 (EPS)',
      ecuType: 'High-Precision Current Shunt + Auto-Zero Op-Amp + ADC',
      projectPhase: 'B Sample',
      asilLevel: 'ASIL D',
      daysRemaining: 20,
      costConstraint: 'BOM increase strictly capped at +$0.80',
    },
    issue: {
      issueCategories: ['WCCA', 'Cost Reduction', 'Customer Requirement', 'Production'],
      requirement: '全温区 (-40℃ ~ 125℃) 与 15 年生命周期内电流采样综合误差 <= ±1.0%',
      actualMeasurement: '极值最坏情况分析 (Extreme Worst Case) 累计误差达 ±3.18%；蒙特卡洛 3-sigma 为 ±1.25%',
      testCondition: '分流电阻温漂 50ppm/℃，运放失调温漂 2μV/℃，ADC 内部基准温漂 30ppm/℃',
      environment: '发动机舱/底盘恶劣温区，8000 小时设计寿命',
      failurePhenomenon: '极端叠加下无法满足客户硬性 ±1.0% 指标，选用 0.05% 航天级低温漂器件导致成本超限',
      engineeringConcern: '是否通过硬件保留当前选型 + 产线 EOL 单点/两点标定偏置与增益消除初始公差来达成闭环',
    },
  },
  {
    id: 'tpl-thermal-dcdc',
    name: 'DC/DC 大电流电感与功率管结温过限工况',
    domain: '热设计与功率降额',
    description: '持续高温满载下结温逼近 Tj_max、散热覆铜面积受限且外壳无对流风扇',
    category: 'Thermal',
    context: {
      productType: '车身域控制器 (BDC) 电源子系统',
      ecuType: 'High-Power Synchronous Buck DC/DC',
      projectPhase: 'B Sample',
      asilLevel: 'ASIL B',
      daysRemaining: 18,
      costConstraint: 'No active fan or heavy heat pipe allowed',
    },
    issue: {
      issueCategories: ['Thermal', 'Power', 'Reliability', 'DFM'],
      requirement: '85℃ 环境下元件结温 Tj <= 125℃，降额安全裕量 >= 15℃ (Tj_max <= 110℃)',
      actualMeasurement: '持续 10A 满载 4 小时后，功率电感表面达 109℃，同步整流下管结温推算达 121℃ (裕量仅 4℃ 濒危)',
      testCondition: '13.5V 输入，5V/10A 恒流输出，密闭塑料机壳内无强制风冷',
      environment: '热仿真烘箱 85℃ 恒温干热',
      failurePhenomenon: '电感高温磁饱和加剧发热；MOSFET Rds(on) 呈正温度系数激增引发热恶性循环',
      engineeringConcern: '外壳空间不许加散热片。改 2oz 铜箔加板厚需 14 天打样；需评估动态降频与功耗平衡',
    },
  },
  {
    id: 'tpl-component-pcn',
    name: '芯片停产缺货换料与 AEC-Q/PPAP 流程脱节',
    domain: '器件替代与供应链变更',
    description: '采购紧急引入国产替代料，Pin-to-Pin 封装一致但动态参数/热阻/PCN 报告未齐',
    category: 'Component Alternative',
    context: {
      productType: '底盘电控系统 / 网关控制器',
      ecuType: 'Power Switch & Bus Transceiver',
      projectPhase: 'C Sample',
      asilLevel: 'ASIL C',
      daysRemaining: 25,
      costConstraint: 'Zero BOM increase',
    },
    issue: {
      issueCategories: ['Component Alternative', 'Reliability', 'Functional Safety', 'Production'],
      requirement: '通过 AEC-Q101/Q100 认证，PPAP Level 3 报告齐备，电气动态参数 100% 满足降额规范',
      actualMeasurement: '替代芯片 Qgd 偏大 25%，寄生电容偏高，高温下静态漏电流增加了 3 倍，原厂仅提供草版可靠性报告',
      testCondition: '双脉冲开关瞬态测试，-40℃ ~ 125℃ 温度循环 1000 次',
      environment: '高温高湿双 85 试验环境',
      failurePhenomenon: '开关损耗上升导致温升偏高 7℃；PCN 未提前 180 天通知客户可能引发主机厂稽核拒收',
      engineeringConcern: 'PM 与采购为保交付催促立即发料投产。硬件工程师发现其动态安全裕量不足，需要构建工程让步与台架对齐证据',
    },
  },
];
