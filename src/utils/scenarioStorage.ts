import { PresetScenario, ProjectContext, IssueInput } from '../types';

const STORAGE_KEY = 'ecu_copilot_custom_scenarios';

/**
 * 从本地 localStorage 获取用户自建工况列表
 */
export function loadCustomScenarios(): PresetScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((item) => ({
        ...item,
        isCustom: true,
      }));
    }
  } catch (err) {
    console.error('加载本地自定义工况失败:', err);
  }
  return [];
}

/**
 * 保存或更新一个自定义工况到本地
 */
export function saveCustomScenario(scenario: PresetScenario): PresetScenario[] {
  const current = loadCustomScenarios();
  const existsIndex = current.findIndex((s) => s.id === scenario.id);

  const updatedItem: PresetScenario = {
    ...scenario,
    isCustom: true,
    createdAt: scenario.createdAt || new Date().toISOString(),
  };

  let newList: PresetScenario[];
  if (existsIndex >= 0) {
    newList = [...current];
    newList[existsIndex] = updatedItem;
  } else {
    newList = [updatedItem, ...current];
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  } catch (err) {
    console.error('持久化保存自定义工况失败:', err);
  }

  return newList;
}

/**
 * 从本地删除指定自定义工况
 */
export function deleteCustomScenario(scenarioId: string): PresetScenario[] {
  const current = loadCustomScenarios();
  const filtered = current.filter((s) => s.id !== scenarioId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('删除自定义工况失败:', err);
  }
  return filtered;
}

/**
 * 快速创建初始空白工况模板
 */
export function createBlankScenarioTemplate(
  title: string = '新硬件问题工况',
  archetype: 'BLDC' | 'MCU' | 'POWER' | 'CUSTOM' = 'CUSTOM'
): PresetScenario {
  const id = `custom_${Date.now()}`;

  let context: ProjectContext;
  let issue: IssueInput;

  if (archetype === 'BLDC') {
    context = {
      projectName: title,
      productType: '车载 BLDC 执行器控制器 (智能座舱/底盘)',
      ecuType: 'BLDC Motor Controller',
      projectPhase: 'DV',
      asilLevel: 'ASIL B',
      customer: '主机厂车身及底盘电子部',
      sopDate: '2026-Q4',
      nextMilestone: 'DV 试验验收',
      daysRemaining: 15,
      costConstraint: '单板 BOM 增幅上限 +$0.30',
      sampleStatus: 'B 样功能样机在长线束台架测试',
      hwLeadStyle: 'AGILE_DELIVERY',
      customerSpecialAgreements: [
        {
          id: 'CSA-01',
          parameter: '急停制动响应时间',
          requiredValue: '<= 250ms (法规防夹红线)',
          isMandatoryVeto: true,
        },
      ],
    };
    issue = {
      issueCategories: ['BLDC Motor Drive', 'Reliability', 'EMC'],
      requirement: '急停工况母线电压 <= 36V，开关节点振铃满足 CISPR 25 Class 5',
      actualMeasurement: '3800rpm 急停时母线电压冲高至 38.5V，开关节点振铃 +12V',
      testCondition: '85℃ 发泡棉密封高温仓，14V 供电，全速急停',
      environment: '座舱密闭温区 (85℃)',
      failurePhenomenon: '电机急停时偶发预驱芯片过压保护锁死；下桥管在高速开通时发热异常',
      engineeringConcern: '距离 DV 仅剩 15 天，急需在不改版或仅微调阻容前提下彻底抑制过压与米勒直通隐患',
      recurrenceCount: 0,
      notes: '请基于第一性原理评估下桥能耗制动、米勒钳位阻抗与 Snubber 吸收网络。',
    };
  } else if (archetype === 'MCU') {
    context = {
      projectName: title,
      productType: '车身域控制器 BCM / 区域控制器 ZCU',
      ecuType: 'Zone Controller Unit',
      projectPhase: 'DV',
      asilLevel: 'ASIL B',
      customer: '主机厂整车电子电气部',
      sopDate: '2026-Q4',
      nextMilestone: 'DV 环境耐受性试验',
      daysRemaining: 18,
      costConstraint: 'BOM 成本零增加，维持现有焊盘',
      sampleStatus: 'DV 环境可靠性试验仓样件',
      hwLeadStyle: 'CONSERVATIVE',
      customerSpecialAgreements: [],
    };
    issue = {
      issueCategories: ['WCCA', 'Power', 'Reliability'],
      requirement: '复位引脚在高低温极限下电平裕量 >= 0.5V，防偶发掉电复位',
      actualMeasurement: '-40℃ 低温启动瞬间复位脚电平探底 0.85V，逼近 0.80V 门限',
      testCondition: '-40℃ ~ 105℃ 高低温交变环境仓',
      environment: '乘员舱前装仪表板内部 (-40℃ ~ 105℃)',
      failurePhenomenon: '低温冷启动上电偶发 MCU 持续卡在复位态或反复重启',
      engineeringConcern: '样件已在试验仓，无法变更 PCB 走线，急需最快容差治理方案',
      recurrenceCount: 1,
      notes: '评估上拉阻抗公差、滤波电容温漂与灌电流极限。',
    };
  } else {
    // 纯通用空白工况
    context = {
      projectName: title,
      productType: '车载域控制器 / ECU 模块',
      ecuType: 'ECU',
      projectPhase: 'DV',
      asilLevel: 'ASIL B',
      customer: '汽车主机厂',
      sopDate: '2026-Q4',
      nextMilestone: '阶段设计评审',
      daysRemaining: 20,
      costConstraint: 'BOM 成本需严格控制在预算范围内',
      sampleStatus: '当前样件处于测试验证阶段',
      hwLeadStyle: 'AGILE_DELIVERY',
      customerSpecialAgreements: [],
    };
    issue = {
      issueCategories: ['Power', 'Reliability'],
      requirement: '输入标准技术规范指标或客户协议要求 (例如: 电压纹波 <= 50mV, 结温 <= 125℃)',
      actualMeasurement: '输入实测技术数据 (例如: 峰峰值达 110mV, 极限温升 138℃)',
      testCondition: '输入具体试验边界条件 (例如: 12V 供电、最高温环境、满载连续工作)',
      environment: '车载试验环境 (例如: 发动机舱 / 座舱 / 底盘)',
      failurePhenomenon: '简要描述失效现象或实测异常特征',
      engineeringConcern: '团队当前核心顾虑 (例如: 投板周期长可能违约、器件应力贴线跑存在召回隐患)',
      recurrenceCount: 0,
      notes: '可备注物理机理假设、关联元器件型号或需要重点校核的公式准则。',
    };
  }

  return {
    id,
    title,
    subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
    icon: '⚙️',
    context,
    issue,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
}
