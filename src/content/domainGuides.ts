export type DomainGuide = {
  title: string;
  question: string;
  input: string[];
  mechanism: string[];
  evidence: string[];
  output: string[];
};

export const DOMAIN_GUIDES: Record<string, DomainGuide> = {
  BLDC: {
    title: 'BLDC / 电机驱动',
    question: '为什么急停、堵转、换相或高 dv/dt 会把电压/温升/EMC 推到边界？',
    input: ['转速、母线峰值、Vgs/Vds、dead-time', '线束长度/杂散电感、堵转电流、环境温度'],
    mechanism: ['动能回馈 → DC-Link 泵升', 'Cgd·dv/dt → 米勒位移电流 → 误导通', 'Psw/Pcond → Tj → 参数漂移'],
    evidence: ['示波器 VBUS/Vgs/Vds 波形', '温升/热像/堵转循环', 'CISPR 25 传导/辐射频谱'],
    output: ['母线抑制方案', 'Gate 阻抗/米勒钳位', 'Snubber 参数', 'FMEA/安全状态'],
  },
  EMC: {
    title: 'EMC / 辐射传导',
    question: '这个超标是“源头太强”还是“耦合路径太通”？',
    input: ['超标频点、幅度、限值', 'PWM/DC-DC 频率、线束、屏蔽、接地状态'],
    mechanism: ['边沿 dv/dt → 寄生 C → 共模电流', '回流路径/线束形成天线', '谐波/谐振叠加形成峰值'],
    evidence: ['RE/CE 原始频谱', '共模电流钳测', '屏蔽/接地/滤波 A-B 对比'],
    output: ['源头降噪', '回路/布局优化', 'CMC/RC/屏蔽组合', '回归频点清单'],
  },
  EMC_BCI: {
    title: 'EMC / BCI 抗扰度', question: '注入电流通过什么路径进入ECU，并在哪个敏感节点转化成功能异常？',
    input: ['BCI频点/注入电流、线束长度', 'CAN/ADC异常、恢复时间、屏蔽/参考地状态'],
    mechanism: ['Iinj → 线束共模 → 连接器/参考地', 'PCB回流 → 敏感节点 → 采样/通信异常'],
    evidence: ['逐频点 Iinj / Vnode / Function 三联表', 'CAN错误帧/ADC误差/Recovery Time', '线束/屏蔽/回流/TVS A-B'],
    output: ['敏感频点地图', '源-路径-受扰体证据', '硬件抑制方案', '功能安全门禁'],
  },
  EMC_ESD: {
    title: 'EMC / ESD 抗扰度', question: '放电路径如何进入 ECU，并是否造成复位、通信瞬断或潜在损伤？',
    input: ['放电等级、端口、接触/空气方式', '恢复时间、CAN/MCU/ADC行为'], mechanism: ['放电 → 连接器/壳体 → TVS/回流', '地弹 → 敏感节点 → 功能异常'],
    evidence: ['逐端口 ESD 矩阵', 'VBUS/IO/CAN同步波形', '放电后电性与功能复测'], output: ['放电路径', '保护器件裕量', '恢复门禁'],
  },
  WCCA_EOL: {
    title: 'WCCA + EOL Calibration', question: '哪些误差可以通过EOL校准消除，哪些温漂/老化误差仍会留在系统里？',
    input: ['初始误差、高温误差、标定残余', '样本数、Cpk/Ppk、寿命目标'], mechanism: ['公差/温漂/老化 → Extreme/RSS/MC', 'Calibration → Residual → 量产能力'], evidence: ['四温点扫描', 'Calibration前后重复性', 'Cpk/Ppk与老化后残余'], output: ['Residual Budget', 'EOL窗口', 'Control Plan'],
  },
  POWER_TRANSIENT: {
    title: '车载电源瞬态 / ISO 7637思路', question: '源端瞬态如何传到ECU内部电源轨，并触发保护/复位？',
    input: ['脉冲幅值/宽度、输入条件', 'ECU端峰值/最低值、保护器件'], mechanism: ['瞬态 → 源阻抗/寄生L/C', 'TVS/滤波 → DC/DC → MCU电源轨'], evidence: ['源端+ECU端双测点', '温度角点', 'TVS/滤波/补偿A-B'], output: ['保护链路', '电源轨裕量', '瞬态回归'],
  },
  EMC_RE_CE: {
    title: 'EMC / RE + CE 发射', question: '峰值来自开关源头、共模路径、差模路径还是夹具耦合？', input: ['频点、峰值/平均值、限值', 'PWM/DC-DC、共模电流、线束/屏蔽'], mechanism: ['dv/dt/di/dt → 寄生耦合', '共模/差模 → 线束/壳体辐射'], evidence: ['原始频谱', '共模电流', '源/路径 A-B'], output: ['频点级根因', '整改收益', '正式回归矩阵'],
  },
  COMPONENT: {
    title: '器件替代 / 缺料',
    question: 'Pin-to-Pin 之后，电气、热、SOA、EMC、质量体系是否真的等价？',
    input: ['Rds(on)、Qg/Qgd、tr/tf、SOA', 'AEC/PPAP/PCN、封装热阻、批次数据'],
    mechanism: ['参数差异 → 损耗差异', '损耗 → Tj → SOA/寿命', '寄生/驱动差异 → EMC/可靠性'],
    evidence: ['参数实测 + Datasheet', '高温满载 / SOA / 短路 / 雪崩', 'PPAP / PCN / 二供文件'],
    output: ['替代料准入判据', '差异清单', '验证矩阵', '受控放行/Plan B'],
  },
  WCCA: {
    title: 'WCCA / 精度 / 容差',
    question: '极端最坏、统计最坏和实际分布，分别告诉我们什么？',
    input: ['初始公差、温漂、偏置、老化', 'Spec、Mission Profile、样本统计'],
    mechanism: ['误差项 → 组合误差', 'Extreme / RSS / Monte Carlo → 不同置信边界', '标定 → 消除初始误差但不能凭空消除漂移'],
    evidence: ['全温扫描', '样本分布/Cpk', 'Monte Carlo 与实测交叉验证'],
    output: ['误差预算', '边界判定', '标定策略', '量产控制点'],
  },
  THERMAL: {
    title: 'Thermal / Power / 热设计',
    question: '温升为什么高？是损耗高、热阻高，还是两者形成正反馈？',
    input: ['Ta、I、V、频率、效率', 'RθJC/RθJA、铜厚、结构、气流'],
    mechanism: ['Pcond + Psw → Ptotal', 'Tj = Ta + P·Rθ', '高温参数漂移 → 损耗再次上升'],
    evidence: ['85℃/125℃ 热箱', '热像 + 结温估算', '铜厚/结构/控制策略 A-B'],
    output: ['热预算', '降额曲线', '结构/板级改进', '软件热管理'],
  },
  POWER: {
    title: 'Power / 电源完整性',
    question: '过冲、跌落、纹波到底来自能量、寄生参数还是控制环？',
    input: ['负载阶跃、输入电压、di/dt', 'L/C/ESR/ESL、保护阈值'],
    mechanism: ['ΔV ≈ L·di/dt', 'E = 1/2·L·I²', 'C·dV/dt = I'],
    evidence: ['最坏负载阶跃', '启动/关断/短路', '纹波频谱与输入阻抗扫描'],
    output: ['Bulk/Decoupling', 'Snubber/回路优化', '保护阈值', '瞬态验证'],
  },
  'FUNCTIONAL SAFETY': {
    title: 'Functional Safety / 功能安全',
    question: '故障发生后，能否在 FTTI 内被检测并进入安全状态？',
    input: ['Safety Goal、ASIL、FTTI', '诊断覆盖率、反应时间、失效模式'],
    mechanism: ['故障 → 诊断 → 判断 → 安全状态', '独立性/冗余 → 诊断覆盖 → 残余风险'],
    evidence: ['Fault Injection', '诊断覆盖率测试', '安全状态切换时间'],
    output: ['HARA/FSR/TSR 追踪', '安全机制缺口', '验证用例', '安全论证证据'],
  },
  'SIGNAL INTEGRITY': {
    title: 'Signal Integrity / 接口完整性',
    question: '信号失败来自阻抗、串扰、反射、地弹还是时序裕量？',
    input: ['速率、上升沿、阻抗', '走线长度、终端、电源/地参考'],
    mechanism: ['阻抗不连续 → 反射', '耦合 → 串扰/地弹', '时序/幅度裕量 → 采样失败'],
    evidence: ['TDR/示波器眼图', '串扰 A-B', '终端/布线长度敏感度'],
    output: ['终端策略', 'Layout 约束', '时序裕量', '接口回归矩阵'],
  },
  RELIABILITY: {
    title: 'Reliability / 可靠性',
    question: '这个问题是瞬时偶发，还是随任务剖面累计的寿命风险？',
    input: ['温度、循环、振动、湿度', '寿命目标、失效统计、降额'],
    mechanism: ['应力 → 损伤 → 参数漂移 → 失效概率', '热/机械/电应力叠加'],
    evidence: ['HALT/寿命试验', '失效统计/Weibull', '参数漂移趋势'],
    output: ['降额策略', '寿命边界', '试验计划', '批量质量控制'],
  },
  DFM: {
    title: 'DFM / 可制造性',
    question: '设计为什么在实验室成立、量产却容易失效或离散？',
    input: ['关键尺寸/参数、工艺能力', '装配窗口、焊接/压装/涂覆条件'],
    mechanism: ['设计公差 → 制程能力 → 参数分布', '工艺漂移 → 现场失效率'],
    evidence: ['Cpk/Ppk', '首件/巡检数据', '工艺窗口 DOE'],
    output: ['DFM 约束', 'SPC 控制点', 'Poka-Yoke', 'Control Plan'],
  },
  CUSTOMER: {
    title: 'Customer Requirement / 需求与偏差',
    question: '当前推进依据是什么？哪些是假设，哪些已经获得客户书面批准？',
    input: ['客户需求、澄清邮件', '接口定义、节点、商业红线'],
    mechanism: ['需求不确定 → 工程假设 → 设计变更风险', '节点压力 → 受控偏差 → 责任边界'],
    evidence: ['客户书面回复', '会议纪要/签核', 'ECR/Deviation/Concession'],
    output: ['需求基线', '假设清单', '截止期限', '变更触发条件'],
  },
  GENERAL: {
    title: '通用工程问题',
    question: '先把“事实—机制—风险—验证—决策”串成可追溯闭环。',
    input: ['Spec、实测、条件、环境', '现象、影响、节点'],
    mechanism: ['事实 → 因果假设 → 失效模式', '风险 → 验证证据'],
    evidence: ['原始测试数据', '最坏边界测试', '复现与回归'],
    output: ['决策门禁', '验证计划', '责任人', 'EDR'],
  },
};

