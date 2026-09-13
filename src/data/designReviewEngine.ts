/**
 * Design Review Mode / Worst Case Engine / Component Change Impact (Section 10)
 * 严格遵照 V4 升级任务书第 10 节规范
 */

import {
  PhaseCheckItem,
  WorstCaseCombination,
  ComponentChangeImpactItem,
} from '../types';

export function getPhaseReviewChecklist(phase: 'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP'): PhaseCheckItem[] {
  switch (phase) {
    case 'Concept':
      return [
        {
          phase: 'Concept',
          category: '系统架构',
          checkpoint: '电机拓扑与三相驱动架构匹配性（分立 6-MOS vs 智能功率级 SPS）',
          standardClause: 'ISO 26262-4: Clause 6.4.2 系统架构设计原则',
          status: 'COMPLIANT',
          notes: '选用分立 6-MOS + 专用预驱芯片，兼顾大扭矩散热与诊断隔离。',
        },
        {
          phase: 'Concept',
          category: '功能安全',
          checkpoint: 'HARA 安全目标与 ASIL 等级分解可达性',
          standardClause: 'ISO 26262-3: HARA 危害分析与风险评估',
          status: 'COMPLIANT',
          notes: '已确立防意外全扭矩加速（ASIL C）与急停可控（ASIL B）。',
        },
        {
          phase: 'Concept',
          category: '需求明确性',
          checkpoint: '客户技术协议中车载瞬态脉冲（ISO 7637-2 / Pulse 5b 抛负载）吸收边界是否清晰',
          standardClause: 'ISO 16750-2: 电气负荷试验规范',
          status: 'NEEDS_ATTENTION',
          notes: '客户暂未提供集中式钳位二极管的抛负载残压确切限值，已标注 Requirement Unknown。',
        },
      ];

    case 'EVT':
      return [
        {
          phase: 'EVT',
          category: '电气应力',
          checkpoint: 'MOSFET Vds 标称与极端峰值电压是否在 80% 额定降额线以内',
          standardClause: 'AEC-Q101 Rev E / IPC-9592B 降额指南',
          status: 'CRITICAL_RISK',
          notes: '急停母线瞬态泵升实测达到 37.8V，严重逼近 40V 耐压上限，必须立即抑制！',
        },
        {
          phase: 'EVT',
          category: '门极驱动',
          checkpoint: '开关节点 dv/dt 对被关断管的米勒效应感应脉冲是否低于 Vth 阈值',
          standardClause: 'IEC 60747-8 半导体分立器件测试方法',
          status: 'CRITICAL_RISK',
          notes: '高 dv/dt 产生 2.15V 米勒尖峰，存在同桥臂直通起火风险，已强制一票否决未保护方案。',
        },
        {
          phase: 'EVT',
          category: '电流采样',
          checkpoint: '分流电阻开路/短路或虚焊时，系统是否具备防失控保护独立通道',
          standardClause: 'ISO 26262-5: Clause 7.4 硬件失效率度量',
          status: 'COMPLIANT',
          notes: '已增加独立硬件过流比较器直连预驱芯片硬件 ShutDown 引脚。',
        },
      ];

    case 'DVT':
      return [
        {
          phase: 'DVT',
          category: 'EMC 骚扰',
          checkpoint: 'CISPR 25 Class 5 传导发射 (150kHz ~ 108MHz) 高频谐振抑制',
          standardClause: 'CISPR 25: 保护车载接收机的无线电骚扰特性的限值和测量方法',
          status: 'NEEDS_ATTENTION',
          notes: '48MHz 频段在长线束下超标 6.8dB，已匹配 1360pF + 4.7Ω RC Snubber。',
        },
        {
          phase: 'DVT',
          category: '环境可靠性',
          checkpoint: '温度循环 (-40℃ ~ +125℃ 1000 循环) 功率器件焊点热疲劳',
          standardClause: 'AEC-Q100 / AEC-Q101 汽车电子应力测试认证',
          status: 'COMPLIANT',
          notes: '选用八引脚无铅剪薄 DFN 封装，底部大焊盘已完成 X-Ray 空洞率检测 (< 12%)。',
        },
        {
          phase: 'DVT',
          category: '故障注入',
          checkpoint: '霍尔传感器断线、高钳位及接地短路故障注入反应时间',
          standardClause: 'ISO 26262-5: 硬件集成与故障注入测试',
          status: 'COMPLIANT',
          notes: '双霍尔容错算法成功在 2.5ms 内平滑切入降级控制，无整车抖动。',
        },
      ];

    case 'PVT':
      return [
        {
          phase: 'PVT',
          category: '制造变异',
          checkpoint: 'PCB 铜厚公差 (1.8oz ~ 2.2oz) 与大电流走线温升一致性分布',
          standardClause: 'IPC-A-600J 印制板验收条件',
          status: 'COMPLIANT',
          notes: '量产 500 片试产样本温度分布正态分布良好，Cpk >= 1.67。',
        },
        {
          phase: 'PVT',
          category: '供应商与良率',
          checkpoint: 'MOSFET 与车规电解电容关键供货商二级产线质量审计',
          standardClause: 'IATF 16949: 汽车质量管理体系',
          status: 'COMPLIANT',
          notes: '首选供应商与备用二供均已完成 PPAP Level 3 签署与交样。',
        },
      ];

    case 'SOP':
      return [
        {
          phase: 'SOP',
          category: '残余风险',
          checkpoint: '是否有未受控或未获得主机厂客户书面签批的工程偏差单',
          standardClause: 'VDA 2 / PPAP 生产件批准程序',
          status: 'COMPLIANT',
          notes: '所有技术争议项已闭环，EDR 受控工程决策单与签章完整留痕。',
        },
        {
          phase: 'SOP',
          category: '变更追溯',
          checkpoint: 'PLM 电子料单 BOM 与生产线防错工位 (Poka-Yoke) 固件校验码一一对应',
          standardClause: 'ISO 26262-8: 变更管理与配置追溯',
          status: 'COMPLIANT',
          notes: '全制程序列号追溯系统已打通。',
        },
      ];
  }
}

export function generateWorstCaseCandidates(): WorstCaseCombination[] {
  return [
    {
      id: 'WC-01',
      name: '极限急停组合最坏情况 (Worst Case Candidate: E-Stop Thermal Overstress)',
      tag: 'CANDIDATE_UNVERIFIED', // 明确它是"候选"而非"已验证Worst Case"
      vbusCondition: '最高输入工作电压 16.0V (上公差上限)',
      ambientTempCondition: '最高舱内环境温度 +105℃ (极限边界)',
      currentCondition: '堵转峰值电流 28.5A (电机冷态小阻抗)',
      rpmCondition: '最高额定转速 4000 rpm (105% 标称超速)',
      componentToleranceCondition: 'Cbus 电解电容老化 -20% 容差 (376μF) + MOS 内阻高温上浮 +70%',
      combinedPeakStress: '理论推算瞬态母线泵升 41.2V，MOS 结温脉冲上升至 148.5℃',
      marginToAbsoluteMax: '距 40V 耐压穿透 -1.2V (违规)；距 150℃ 结温上限仅差 1.5℃',
      verificationRequired: '严禁仅凭理论判定安全，必须在极端温箱与超速台架上实测验证 (转入 Unknown → Test)！',
    },
    {
      id: 'WC-02',
      name: '低速重载死区与换相畸变最坏情况 (Worst Case Candidate: Low-Speed Ripple)',
      tag: 'CANDIDATE_UNVERIFIED',
      vbusCondition: '最低输入电压 9.0V (冷启动下限)',
      ambientTempCondition: '极低温 -40℃ (润滑脂粘度极大，摩擦阻力倍增)',
      currentCondition: '重载蠕行电流 22A',
      rpmCondition: '超低速 150 rpm',
      componentToleranceCondition: '驱动关断延迟低温缩短 + 采样运放温漂 +15mV',
      combinedPeakStress: '死区非线性引起的转矩纹波上升至 18.5%，产生人耳可闻低频轰鸣 NVH',
      marginToAbsoluteMax: '不涉及破坏性击穿，但严重影响客户感官品质体验',
      verificationRequired: '需在零下 40℃ 低温舱结合振动噪声传感器执行 NVH 标定测试。',
    },
  ];
}

export function evaluateComponentChangeImpact(
  componentCategory: ComponentChangeImpactItem['componentCategory']
): ComponentChangeImpactItem {
  switch (componentCategory) {
    case 'MOSFET':
      return {
        componentCategory: 'MOSFET',
        changeDescription: '更换功率 MOSFET 芯片型号或跨厂商二供替换 (如英飞凌换安森美/意法)',
        electricalImpact: 'Rds(on) 阻抗差异导致导通压降改变；Qg 与 Cgd 改变直接影响开关速度与米勒感应抬升',
        thermalImpact: '热阻 Rth(jc) 与封装接触热阻变化直接影响高温满载结温 Tj',
        emcImpact: '开关瞬态 dv/dt 与体二极管反向恢复电荷 Qrr 改变，导致 30MHz~100MHz 频段传导与辐射骚扰剧烈漂移',
        safetyImpact: '单脉冲雪崩能量 EAS 与短路耐受时间直接关系 ASIL 功能安全防护可靠性',
        reliabilityImpact: '邦定线工艺与焊盘引脚共面度影响 AEC-Q101 焊点热疲劳寿命',
        controlImpact: '死区裕量需要重新校准，避免高温击穿或低温畸变',
        mandatoryRetests: [
          'CISPR 25 Class 5 传导与辐射发射全项对比测试 (必须重做)',
          '3800rpm 急停母线泵升与门极米勒尖峰示波器捕获 (必须重做)',
          '105℃ 满载温箱连续堵转 100 次温升测试 (必须重做)',
          '短路关断保护响应时间 vs SOA 时序实测 (必须重做)',
        ],
      };

    case 'GATE_DRIVER':
      return {
        componentCategory: 'GATE_DRIVER',
        changeDescription: '更换栅极预驱芯片或更新芯片内部硬件版本',
        electricalImpact: '驱动 Source/Sink 峰值灌拉电流能力变化；UVLO 欠压锁定阈值公差漂移',
        thermalImpact: '内部电荷泵与输出级功耗改变影响预驱芯片自发热',
        emcImpact: '输出引脚高频开关边沿振铃特性改变',
        safetyImpact: '内部死区互锁硬件逻辑可靠性及 FAULT 报警引脚响应延迟是功能安全核心链路',
        reliabilityImpact: '高压相线负压耐受能力 (-5V ~ -10V 瞬态) 决定抗感性反冲耐受度',
        controlImpact: '上下管传播延迟匹配度 (Propagation Delay Mismatch) 直接决定死区设定极限',
        mandatoryRetests: [
          '驱动芯片 UVLO 静态与动态跌落响应测试 (必须重做)',
          '4 通道示波器实测 Fault-to-Off 延迟 (必须重做)',
          '高低温全温区驱动死区与输出波形抖动测试 (必须重做)',
        ],
      };

    case 'SHUNT_RESISTOR':
      return {
        componentCategory: 'SHUNT_RESISTOR',
        changeDescription: '更换低阻分流电阻阻值、生产厂商或封装尺寸 (如 2512 换 3920)',
        electricalImpact: '阻值公差、额定功率与等效串联寄生电感 ESL 改变',
        thermalImpact: 'TCR 温度系数 (ppm/℃) 直接影响高温下相电流采样的准确度',
        emcImpact: 'ESL 寄生电感在高频大电流下会产生虚假感应毛刺',
        safetyImpact: '虚焊或开路将导致过流保护完全失控，属于 ASIL C 关键监测路径',
        reliabilityImpact: '大脉冲浪涌电流下的热应力疲劳开裂风险',
        controlImpact: 'FOC 观测器增益与电流环 PID 参数必须重新标定',
        mandatoryRetests: [
          '全温区 (-40℃ ~ 125℃) 电流采样零点偏置与增益标定 (必须重做)',
          '大电流堵转下分流电阻温升与阻值漂移率测试 (必须重做)',
        ],
      };

    default:
      return {
        componentCategory,
        changeDescription: `更换 ${componentCategory} 关键料号器件`,
        electricalImpact: '额定参数与公差范围发生位移',
        thermalImpact: '自发热或散热通道特性改变',
        emcImpact: '高频寄生参数引起共模/差模骚扰特性变化',
        safetyImpact: '需评估是否影响硬件故障诊断覆盖率 (Diagnostic Coverage)',
        reliabilityImpact: '寿命模型需按照加速应力重新拟合',
        controlImpact: '需核对算法软件滤波与环路稳定性',
        mandatoryRetests: [
          '对应模块电气应力裕量实测 (必须重做)',
          'EMC 暗室对比验证 (根据影响程度按需评估)',
        ],
      };
  }
}
