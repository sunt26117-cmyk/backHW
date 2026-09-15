import { IssueInput, IssueCategory, ProjectContext, MeasurementSource } from '../types';
import { calculateBldcDeterministicCalculations } from './bldcDeterministicEngine';
import { calculateTwoMassResonance } from './robotJointResonance';

export type EngineeringDomain =
  | 'BLDC'
  | 'ROBOT_JOINT'
  | 'EMC_BCI'
  | 'EMC_RE_CE'
  | 'EMC_ESD'
  | 'COMPONENT'
  | 'WCCA_EOL'
  | 'WCCA'
  | 'THERMAL'
  | 'POWER'
  | 'POWER_TRANSIENT'
  | 'SIGNAL'
  | 'SAFETY'
  | 'RELIABILITY'
  | 'DFM'
  | 'PRODUCTION'
  | 'COST'
  | 'SCHEDULE'
  | 'TEST'
  | 'CUSTOMER'
  | 'DEVIATION'
  | 'GENERAL';

export interface DomainMeasurementField {
  key: string;
  label: string;
  unit?: string;
  description: string;
  tag: 'MEASURED' | 'SPEC' | 'CONTEXT' | 'CALCULATED' | 'BENCHMARK';
  required?: boolean;
}

export interface DomainProfile {
  key: EngineeringDomain;
  title: string;
  question: string;
  chain: string;
  formulas: string[];
  tests: string[];
  outputs: string[];
  measurements: DomainMeasurementField[];
  knownPitfalls: string[];
}

const P: Record<EngineeringDomain, DomainProfile> = {
  BLDC: {
    key: 'BLDC', title: 'BLDC 急停 / 泵升 / 米勒 / 堵转物理机理',
    question: '机械能、电能和开关瞬态如何转化成母线应力、门极异常与热应力？',
    chain: '转动动能/反电势 → DC-Link 泵升 → Vds 应力 → dv/dt / Cgd → Vgs 异常 → 保护时序 / SOA → 热与寿命',
    formulas: ['E = 1/2·J·ω²', 'Vbus,peak² = Vbus,nom² + 2E/Cbus', 'Igate,Miller ≈ Cgd·dv/dt', 'Tj ≈ Ta + Ptotal·Rθ', 'FTTI ≥ detection + reaction + transition'],
    tests: ['急停同时捕捉 VBUS/VDS/VGS/相电流', '米勒尖峰与振铃随 Rg、死区、dv/dt A/B', '堵转 / 重载温升与 SOA', '保护门限与实际硬件时序回归'],
    outputs: ['泵升裕量', '米勒直通风险', 'SOA / Tj 边界', '保护与回归门禁'],
    measurements: [
      {key:'rpm',label:'转速',unit:'rpm',description:'急停前转速',tag:'MEASURED',required:true},
      {key:'busVoltageNominalV',label:'母线标称',unit:'V',description:'实际供电/母线标称值',tag:'CONTEXT',required:true},
      {key:'busVoltagePeakV',label:'母线峰值',unit:'V',description:'急停实测峰值',tag:'MEASURED',required:true},
      {key:'gateSpikeV',label:'Gate/Vgs尖峰',unit:'V',description:'门极异常尖峰/负压',tag:'MEASURED'},
      {key:'currentPeakA',label:'峰值电流',unit:'A',description:'急停/堵转电流',tag:'MEASURED'},
      {key:'junctionTempC',label:'结温',unit:'℃',description:'实测或热模型校核点',tag:'MEASURED'},
      {key:'vdsRatingV',label:'Vds额定耐压',unit:'V',description:'器件数据手册额定值',tag:'SPEC',required:true},
      {key:'deadTimeNs',label:'死区',unit:'ns',description:'控制器实际配置',tag:'CONTEXT'},
      {key:'cBusUf',label:'母线电容 Cbus',unit:'μF',description:'DC-Link 总储能电容，用于泵升定量计算；缺失时确定性计算不可用',tag:'SPEC',required:true},
      {key:'rotorInertiaKgm2',label:'转子转动惯量 J',unit:'kg·m²',description:'电机转子与折算负载总惯量，用于 E=1/2·J·ω² 定量计算；缺失时确定性计算不可用',tag:'SPEC',required:true},
      {key:'rgOffOhm',label:'关断栅极电阻 Rg_off',unit:'Ω',description:'下桥MOSFET关断驱动电阻，影响米勒直通风险评估',tag:'SPEC'},
      {key:'cgdPf',label:'米勒电容 Cgd',unit:'pF',description:'MOSFET栅漏电容，用于米勒直通尖峰 Vgs_induced 计算',tag:'SPEC'},
      {key:'vthMinV',label:'Vgs开启阈值(最小值)',unit:'V',description:'器件数据手册最小开启阈值，用于判定米勒尖峰是否会误导通',tag:'SPEC'},
      {key:'dvdtVns',label:'dv/dt',unit:'V/ns',description:'开关节点电压变化率，用于 BLDC Miller 风险确定性计算',tag:'MEASURED'},
      {key:'keVkrpm',label:'反电动势常数 Ke',unit:'V/krpm',description:'电机反电动势系数，用于交叉核验实测泵升与理论泵升是否一致',tag:'SPEC'},
    ],
    knownPitfalls: ['不能用计算泵升峰值替代示波器实测峰值作为放行证据', 'RDS(on)/Qg/Qgd 不能只看室温 datasheet typ 值', 'Cbus/J/dvdt/Cgd/Rg/Vth 任一确定性计算关键输入缺失时，必须明确标记 INSUFFICIENT_INPUT，不得从自由文本或默认工程参数补齐'],
  },
  ROBOT_JOINT: {
    key: 'ROBOT_JOINT', title: '机器人/协作臂关节机电系统层：背隙 / 编码器 / 谐振 / 力矩闭环 / STO / 总线周期',
    question: '减速器与传感链的机械非理想特性、控制环带宽与谐振、以及功能安全与总线实时性，分别在哪个环节吃掉了关节的精度、稳定性与安全裕量？',
    chain: '谐波/RV减速器背隙与扭转柔性 → 输出侧运动学误差 → 位置/速度环带宽与二质量系统谐振 → 力矩闭环误差链(电流估算 vs 传感器) → 连续再生能量与泄放热设计 → STO/SS1安全通道独立性 → 总线周期与本地环路耦合',
    formulas: [
      'θ_output_error ≈ backlash + T_out/K_stiffness (rad→arcmin)',
      'f_res = (1/2π)·√(K_stiffness·(1/J_motor + 1/(J_load/i²)))，i=减速比',
      'P_regen_avg ≈ P_regen_peak × duty_decel，需 < 泄放电阻额定连续功率',
      'Torque_est = Kt·Iq×i×η_gearbox，η_gearbox 随温度/转速漂移直接进入力矩误差',
      'cycle_ratio = t_bus_cycle / t_local_position_loop，比值过大且无本地插补 → 指令台阶化',
    ],
    tests: [
      '锁定输出端，电机侧正反向缓慢加载，激光/高精度编码器测输出空程与背隙',
      '扫频/敲击法激励关节输出端，捕捉二质量谐振峰并与速度环带宽比较',
      '同时记录电流估算力矩与外置力矩传感器读数，覆盖全温区与全速度区间做误差带标定',
      '连续往复工况下用热电偶/红外记录泄放电阻与减速器温升曲线，覆盖典型作业节拍',
      '故意在总线侧制造丢包/断线，验证 STO/SS1 触发时间与本地降级策略（斜坡到零/保持/急停）',
    ],
    outputs: ['关节输出定位精度裕量', '谐振频率与环路带宽隔离度', '力矩闭环可信度', '泄放电阻连续热裕量', 'STO/SS1独立性判定', '总线周期耦合风险'],
    measurements: [
      {key:'gearRatio',label:'减速比',unit:'',description:'谐波/RV减速器传动比',tag:'CONTEXT',required:true},
      {key:'backlashArcmin',label:'背隙',unit:'arcmin',description:'减速器输出端实测回程间隙',tag:'MEASURED',required:true},
      {key:'requiredPositionAccuracyArcmin',label:'位置精度要求',unit:'arcmin',description:'客户/系统规格允许的关节输出定位误差',tag:'SPEC',required:true},
      {key:'torsionalStiffnessNmPerRad',label:'扭转刚度',unit:'Nm/rad',description:'减速器/关节输出扭转刚度',tag:'SPEC'},
      {key:'outputTorqueNm',label:'输出扭矩',unit:'Nm',description:'当前工况关节输出扭矩',tag:'MEASURED'},
      {key:'velocityLoopBandwidthHz',label:'速度环带宽',unit:'Hz',description:'控制器速度环设定带宽',tag:'CONTEXT'},
      {key:'motorInertiaKgm2',label:'电机转子惯量',unit:'kg·m²',description:'电机侧转动惯量',tag:'SPEC'},
      {key:'loadInertiaKgm2',label:'负载惯量(输出侧折算前)',unit:'kg·m²',description:'关节输出端连杆/负载惯量',tag:'CONTEXT'},
      {key:'regenPowerPeakW',label:'峰值回馈功率',unit:'W',description:'单次减速动能回馈母线峰值功率',tag:'MEASURED'},
      {key:'brakingResistorRatedContinuousW',label:'泄放电阻额定连续功率',unit:'W',description:'制动电阻器数据手册连续额定值',tag:'SPEC'},
      {key:'stoResponseTimeMs',label:'STO响应时间',unit:'ms',description:'安全扭矩关断实测/规格响应时间',tag:'MEASURED'},
      {key:'busCycleTimeUs',label:'总线周期',unit:'μs',description:'EtherCAT/CANopen等现场总线通信周期',tag:'CONTEXT'},
    ],
    knownPitfalls: [
      '背隙只在空载单方向标定，不代表带载换向时的真实运动学误差（弹性扭转会叠加放大）',
      '用电流环估算力矩直接当作力控/碰撞检测阈值，忽略减速器效率随温度与速度的漂移',
      '把车规 ASIL 的软件互锁经验直接套用到 STO/SS1，忽略 IEC 61800-5-2 / ISO 13849-1 要求硬件通道独立性',
      '只在单关节台架验证节拍与泄放功率，未考虑多关节联动时母线互相支援/叠加的真实工况',
      '总线丢包只做了"断线立即停"测试，没有验证高频抖动(jitter)累积对位置环平顺性的影响',
    ],
  },
  EMC_BCI: {
    key:'EMC_BCI', title:'EMC BCI 抗扰度 / 共模耦合物理机理',
    question:'注入电流通过什么路径进入 ECU，并在哪个敏感节点转化成功能异常？',
    chain:'BCI 注入 Iinj → 线束共模电流 → 连接器/屏蔽/参考地 → PCB 回流 → 敏感节点 → 采样/通信/控制异常 → 恢复',
    formulas:['Zcm(f)=Vcm(f)/Icm(f)','敏感度 S(f)=ΔVnode/Iinj','功能风险 ∝ 幅值 × 持续时间 × 安全影响','根因定位至少锁定 源 / 路径 / 受扰体 三要素中的两项'],
    tests:['1–400MHz逐频点扫描：Iinj / Vnode / 功能状态三联表','BCI 注入与 CAN-FD error frame / ADC error / recovery time 同步记录','线束、屏蔽、参考地、滤波、TVS A/B隔离','异常点重复 + 去软件掩蔽后的物理回归'],
    outputs:['敏感频点地图','共模回流路径','受扰节点证据','硬件抑制 + 功能安全门禁'],
    measurements:[
      {key:'bciInjectionMa',label:'BCI注入',unit:'mA',description:'注入电流设定/实测',tag:'MEASURED',required:true},
      {key:'bciSensitiveFreqMhz',label:'敏感频点',unit:'MHz',description:'出现功能异常的频点',tag:'MEASURED',required:true},
      {key:'currentSenseErrorPct',label:'采样误差',unit:'%',description:'BCI前后采样误差变化',tag:'MEASURED'},
      {key:'recoveryTimeMs',label:'恢复时间',unit:'ms',description:'撤除注入后的恢复时间',tag:'MEASURED'},
      {key:'harnessLengthM',label:'线束长度',unit:'m',description:'BCI实际线束长度',tag:'CONTEXT'},
      {key:'commonModeCurrentMa',label:'共模电流',unit:'mA',description:'ECU入口/回流实测',tag:'MEASURED'},
      {key:'bciNodeVoltageV',label:'受扰节点电压',unit:'V',description:'BCI敏感节点噪声/扰动幅值',tag:'MEASURED'},
      {key:'canErrorCount',label:'CAN错误帧',unit:'count',description:'测试窗口内错误帧数',tag:'MEASURED'},
    ],
    knownPitfalls:['BCI通过/失败必须以功能状态为门禁，不能只看注入电流或波形', '不能把软件滤波后的异常消失当作物理抗扰度闭环'],
  },
  EMC_RE_CE: {
    key:'EMC_RE_CE', title:'EMC 辐射 / 传导发射物理机理',
    question:'峰值超标来自源头谐波、共模路径、差模路径还是测试夹具耦合？',
    chain:'开关边沿 / PWM / DC-DC / 时钟 → 寄生耦合 → 共模/差模电流 → 线束/壳体辐射 → RE/CE超标',
    formulas:['Icm≈Cpar·dv/dt','ΔV≈L·di/dt','频点相关性：fpeak ↔ switching / clock harmonic','Margin = Limit - Measured'],
    tests:['RE/CE原始频谱保存峰值/平均值/检波器类型','目标频点源/路径 A-B','共模电流钳与线束布局 A-B','屏蔽/接地/滤波措施前后重复测试'],
    outputs:['频点级根因假设','源-路径-受扰体证据','A/B整改效果','正式测试回归矩阵'],
    measurements:[
      {key:'emcPeakDb',label:'EMC峰值',unit:'dBμV/m',description:'目标频点实测值',tag:'MEASURED',required:true},
      {key:'emcLimitDb',label:'EMC限值',unit:'dBμV/m',description:'对应标准/客户限值',tag:'SPEC',required:true},
      {key:'emcFrequencyMhz',label:'问题频点',unit:'MHz',description:'超标频点',tag:'MEASURED',required:true},
      {key:'commonModeCurrentMa',label:'共模电流',unit:'mA',description:'线束/端口实测',tag:'MEASURED'},
      {key:'dvdtVns',label:'dv/dt',unit:'V/ns',description:'开关节点边沿',tag:'MEASURED'},
      {key:'pwmFrequencyKhz',label:'PWM频率',unit:'kHz',description:'实际PWM频率',tag:'CONTEXT'},
      {key:'harnessLengthM',label:'线束长度',unit:'m',description:'测试线束',tag:'CONTEXT'},
      {key:'testDistanceM',label:'测试距离',unit:'m',description:'天线/探头到DUT的标定测试距离，直接影响限值对比是否有效',tag:'CONTEXT',required:true},
    ],
    knownPitfalls:['不能用“金属壳会压低很多dB”作为未经验证的假设', 'RE、CE和BCI是不同测试链路，不能混为一个EMC数字', 'emcPeakDb 必须注明是Peak/QP/Average哪种检波器结果，三者不可直接互相判定合格'],
  },
  EMC_ESD: {
    key:'EMC_ESD', title:'EMC ESD 抗扰度 / 放电路径与功能保持',
    question:'放电能量经过什么路径进入 ECU，并在哪个敏感节点转化成复位、通信或采样异常？',
    chain:'ESD 接触/空气放电 → 连接器/壳体 → TVS/共模路径 → GND/参考平面 → 敏感节点 → MCU/通信/采样 → 功能保持与恢复',
    formulas:['Vnode≈Iesd·Zpath（频域近似）','ΔV≈L·di/dt','风险不仅看峰值，还看功能状态、恢复时间和潜在损伤'],
    tests:['接触/空气放电按项目等级扫描','敏感端口逐口注入并同步记录 VBUS/IO/CAN/ADC','TVS、屏蔽、接地回流 A/B','放电后绝缘/漏电/功能与恢复时间复测'],
    outputs:['放电路径','敏感端口地图','保护器件裕量','功能/安全恢复门禁'],
    measurements:[
      {key:'esdLevelKv',label:'ESD电压',unit:'kV',description:'实际放电等级',tag:'MEASURED',required:true},
      {key:'esdPeakCurrentA',label:'放电峰值电流',unit:'A',description:'探头/估算峰值',tag:'MEASURED'},
      {key:'recoveryTimeMs',label:'恢复时间',unit:'ms',description:'异常后恢复时间',tag:'MEASURED'},
      {key:'canErrorCount',label:'CAN错误帧',unit:'count',description:'测试窗口错误帧数',tag:'MEASURED'},
      {key:'affectedPort',label:'受扰端口',description:'连接器/IO端口编号',tag:'CONTEXT'},
    ],
    knownPitfalls:['ESD 通过不代表没有潜在参数损伤，必须结合放电后电性与功能复测', '不能只根据 TVS 标称峰值判断系统级保护充分性'],
  },
  COMPONENT: {
    key:'COMPONENT', title:'替代料：电气 / 动态 / 热 / SOA / 质量等价性',
    question:'Pin-to-Pin 是否真的等价？动态参数差异会不会改变热、EMC、安全与寿命？',
    chain:'器件参数差异 → 开关/导通损耗 → Vds/Vgs瞬态 → Tj/SOA → EMC → 可靠性 → PPAP/PCN/供应风险',
    formulas:['Pcond=I²·Rds(on)','Psw≈f·Qg/Qgd 与 tr/tf 共同决定','Tj≈Ta+Ptotal·Rθ','验证要求 = Spec equivalence + Use-condition equivalence'],
    tests:['Rds(on)/Qg/Qgd/tr/tf多温点实测','预充/短路/雪崩/SOA边界','高温稳态与循环','AEC/PPAP/PCN与批次一致性'],
    outputs:['Spec-to-Spec矩阵','Use-case等效性','热/SOA/EMC回归','受控替代放行条件'],
    measurements:[
      {key:'rdsOnMilliOhm',label:'Rds(on)',unit:'mΩ',description:'实际温度/电流条件下',tag:'MEASURED'},
      {key:'qgNc',label:'Qg',unit:'nC',description:'总栅极电荷',tag:'MEASURED'},
      {key:'qgdNc',label:'Qgd',unit:'nC',description:'米勒平台电荷',tag:'MEASURED'},
      {key:'switchDelayNs',label:'开关延迟',unit:'ns',description:'实际驱动条件',tag:'MEASURED'},
      {key:'junctionTempC',label:'结温',unit:'℃',description:'实际工作/估算校核',tag:'MEASURED'},
      {key:'soaMarginPct',label:'SOA裕量',unit:'%',description:'最坏脉冲点裕量',tag:'MEASURED'},
      {key:'vdsRatingV',label:'Vds额定',unit:'V',description:'器件规格',tag:'SPEC',required:true},
    ],
    knownPitfalls:['typical值不等于保证值', 'Pin-to-Pin不等于驱动、热、SOA、EMC和质量流程完全等价'],
  },
  WCCA_EOL: {
    key:'WCCA_EOL', title:'WCCA → 实测分布 → EOL标定 → 量产闭环',
    question:'哪些误差可校准，哪些误差在温漂/老化/相关性下仍然不可消除？',
    chain:'初始公差 → 温漂 → 偏置/增益 → 老化 → 制造离散 → Extreme/RSS/MC → 实测分布 → EOL校准 → 残余误差 → Cpk/Ppk',
    formulas:['Extreme = Σ|Δi|','RSS = √Σσᵢ²（需独立性/统计假设）','Residual = Raw error - calibrated component','Cpk=min((USL-μ)/(3σ),(μ-LSL)/(3σ))'],
    tests:['-40/25/85/125℃误差扫描','Calibration前后误差与重复性','样本分布/Cpk/Ppk','老化后残余误差与EOL窗口验证'],
    outputs:['可校准/不可校准误差清单','Residual budget','EOL阈值','量产Control Plan与回归'],
    measurements:[
      {key:'accuracyErrorPct',label:'初始总误差',unit:'%',description:'未标定/标定前',tag:'MEASURED',required:true},
      {key:'accuracyErrorHotPct',label:'高温误差',unit:'%',description:'高温最坏误差',tag:'MEASURED'},
      {key:'calibrationResidualPct',label:'标定后残余',unit:'%',description:'EOL后残余误差',tag:'MEASURED'},
      {key:'sampleCount',label:'样本数',unit:'pcs',description:'有效样本数量',tag:'MEASURED'},
      {key:'cpk',label:'Cpk',description:'过程能力',tag:'MEASURED'},
      {key:'ppk',label:'Ppk',description:'过程绩效',tag:'MEASURED'},
      {key:'shuntTolerancePct',label:'Shunt公差贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'afeOffsetBudgetPct',label:'AFE Offset贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'adcRefDriftBudgetPct',label:'ADC Ref漂移贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'tempDriftBudgetPct',label:'温漂贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'agingDriftBudgetPct',label:'老化贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'tempSpanC',label:'温度跨度',unit:'℃',description:'覆盖温度范围',tag:'CONTEXT'},
      {key:'missionYears',label:'任务年限',unit:'year',description:'寿命预算',tag:'CONTEXT'},
      {key:'correlationFactor',label:'相关性敏感系数',description:'0~1，用于相关性敏感性分析，不替代协方差矩阵',tag:'CONTEXT'},
      {key:'sampleMeanPct',label:'样本均值',unit:'%',description:'量产/样件误差均值',tag:'MEASURED'},
      {key:'sampleSigmaPct',label:'样本σ',unit:'%',description:'量产/样件误差标准差',tag:'MEASURED'},
      {key:'calibrationCoveragePct',label:'可校准覆盖率',unit:'%',description:'误差预算中可通过EOL校准消除的比例',tag:'MEASURED'},
      {key:'specLimitPct',label:'客户/设计误差限值',unit:'%',description:'最终放行门限',tag:'SPEC',required:true},
    ],
    knownPitfalls:['不能用RSS/Monte Carlo替代绝对最坏边界的硬性安全门限', 'EOL标定不能替代温漂、老化和相关性证据'],
  },
  WCCA: {
    key:'WCCA', title:'WCCA 最坏情况 / 统计边界与实测相关性',
    question:'误差链在绝对最坏与实际分布之间差多少？模型假设是否有实测支撑？',
    chain:'公差 + 温漂 + 偏置 + 老化 → Extreme → RSS → Monte Carlo → 样件分布 → 客户限值',
    formulas:['Worst Case = Σ|Δi|','RSS = √Σσᵢ²','MC结果依赖输入分布与相关性','Margin = Spec - Predicted/Measured'],
    tests:['组件参数分布采样','全温误差扫描','相关性验证','模型 vs 实测误差分布'],
    outputs:['Worst Case边界','统计分布','模型可信度','验证缺口'],
    measurements:[
      {key:'accuracyErrorPct',label:'实际误差',unit:'%',description:'实测最坏或目标点',tag:'MEASURED',required:true},
      {key:'extremeWorstCasePct',label:'Extreme WCCA',unit:'%',description:'模型最坏值',tag:'CALCULATED'},
      {key:'rssErrorPct',label:'RSS',unit:'%',description:'统计合成结果',tag:'CALCULATED'},
      {key:'monteCarloPct',label:'Monte Carlo',unit:'%',description:'分布模拟结果',tag:'CALCULATED'},
      {key:'specLimitPct',label:'规格限值',unit:'%',description:'客户/设计要求',tag:'SPEC',required:true},
      {key:'shuntTolerancePct',label:'Shunt公差贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'afeOffsetBudgetPct',label:'AFE Offset贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'adcRefDriftBudgetPct',label:'ADC Ref漂移贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'tempDriftBudgetPct',label:'温漂贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'agingDriftBudgetPct',label:'老化贡献',unit:'%',description:'WCCA误差预算项',tag:'SPEC'},
      {key:'sampleCount',label:'样本数',unit:'pcs',description:'实测样本量',tag:'MEASURED'},
      {key:'tempSpanC',label:'温度跨度',unit:'℃',description:'验证温度范围',tag:'CONTEXT'},
      {key:'correlationFactor',label:'相关性敏感系数',description:'0~1，用于相关性敏感性分析，不替代协方差矩阵',tag:'CONTEXT'},
      {key:'sampleMeanPct',label:'样本均值',unit:'%',description:'量产/样件误差均值',tag:'MEASURED'},
      {key:'sampleSigmaPct',label:'样本σ',unit:'%',description:'量产/样件误差标准差',tag:'MEASURED'},
    ],
    knownPitfalls:['相关器件/同温漂来源不能被强行当成独立变量', '统计结果只能改变置信度表达，不能自动改变客户绝对门限'],
  },
  THERMAL: {
    key:'THERMAL', title:'热设计极限 / 热阻网络 / 正反馈机理',
    question:'功耗、热阻、环境和温度相关参数是否形成正反馈？',
    chain:'I/V/f → Pcond/Psw → 热阻网络 → Tj → Rds(on)/磁性参数变化 → 功耗再变化',
    formulas:['Tj=Ta+P·Rθ','Pcond=I²R(T)','总损耗 = 导通 + 开关 + 磁性 + 其他','Derating margin = Tj_limit - Tj'],
    tests:['85/105/125℃稳态温升','瞬态热响应与热像','最坏负载/密闭结构','2oz/散热片/控制降额A-B'],
    outputs:['Tj margin','热预算','热路径整改','软件热管理门槛'],
    measurements:[
      {key:'junctionTempC',label:'结温',unit:'℃',description:'实测/估算结温',tag:'MEASURED',required:true},
      {key:'ambientTempC',label:'环境温度',unit:'℃',description:'温箱/舱内环境',tag:'MEASURED',required:true},
      {key:'tjLimitC',label:'Tj允许上限',unit:'℃',description:'降额后的允许上限',tag:'SPEC',required:true},
      {key:'powerLossW',label:'功耗',unit:'W',description:'热源总功耗',tag:'MEASURED'},
      {key:'thermalResistanceCPerW',label:'热阻',unit:'℃/W',description:'实际热路径',tag:'MEASURED'},
      {key:'loadCurrentA',label:'负载电流',unit:'A',description:'最坏负载',tag:'MEASURED'},
      {key:'runTimeH',label:'稳态时间',unit:'h',description:'热稳态判定时间',tag:'CONTEXT'},
    ],
    knownPitfalls:['壳体/铜箔/界面材料改变会让热阻变化，不能只改一个Tj数字', '热设计必须验证稳态与瞬态，不要把表面温度直接等同结温'],
  },
  POWER: {
    key:'POWER', title:'电源完整性 / 瞬态能量路径', question:'负载突变如何通过寄生L/C转化成过冲、跌落与保护触发？', chain:'负载阶跃 → di/dt → 寄生L/C → ΔV / ringing → 保护门限 → 系统行为', formulas:['ΔV≈L·di/dt','E=1/2·LI²','I=C·dV/dt'], tests:['最坏负载阶跃','启动/关断/短路','输入阻抗扫描','电源/地回流A-B'], outputs:['去耦/阻尼方案','保护门限','瞬态回归'], measurements:[
    {key:'powerOvershootPeakV',label:'负载突变正向过冲峰值',unit:'V',description:'负载阶跃引起的正向过冲峰值（非电机泵升、非ISO7637脉冲，勿与其他域的母线峰值混填）',tag:'MEASURED'},
    {key:'powerUndershootMinV',label:'负载突变跌落最低值',unit:'V',description:'负载阶跃引起的电压跌落最低值',tag:'MEASURED'},
    {key:'loadStepA',label:'负载阶跃',unit:'A',description:'阶跃幅值',tag:'MEASURED'},
    {key:'riseTimeUs',label:'阶跃边沿',unit:'μs',description:'负载变化时间',tag:'MEASURED'},
    {key:'inputVoltageV',label:'输入电压',unit:'V',description:'标称输入',tag:'CONTEXT'},
  ], knownPitfalls:['输入端和负载端波形需区分，测点位置会改变结论'],
  },
  POWER_TRANSIENT: {
    key:'POWER_TRANSIENT', title:'车载电源瞬态 / ISO 7637 思路与保护链路',
    question:'输入脉冲、反接、load dump 或负载切换如何通过寄生 L/C 与保护器件传到 ECU 内部？',
    chain:'车辆电源瞬态 → 线束/源阻抗 → TVS/滤波/保险丝 → DC/DC → 内部电源轨 → MCU/Driver → 功能状态',
    formulas:['ΔV≈L·di/dt','TVS钳位裕量 = Vclamp_margin - 关键器件耐压边界','功能门禁 = 电源轨范围 + reset/communication behavior'],
    tests:['按项目脉冲族逐项覆盖并保存源端/ECU端双测点','冷/热/低压/高压角点','TVS/滤波器件 A/B','瞬态后功能、通讯、参数漂移与潜在损伤检查'],
    outputs:['脉冲—节点传递函数','保护器件裕量','电源轨门禁','回归矩阵'],
    measurements:[
      {key:'pulseVoltageV',label:'脉冲电压',unit:'V',description:'源端/ECU端脉冲幅值',tag:'MEASURED',required:true},
      {key:'pulseDurationUs',label:'脉冲宽度',unit:'μs',description:'实际脉冲宽度',tag:'MEASURED'},
      {key:'pulseEcuBusPeakV',label:'ISO7637脉冲下ECU端峰值',unit:'V',description:'车规电源脉冲注入下的关键电源轨峰值（勿与电机泵升/负载突变的母线峰值混填）',tag:'MEASURED'},
      {key:'pulseEcuBusMinV',label:'ISO7637脉冲下ECU端最低值',unit:'V',description:'车规电源脉冲注入下的关键电源轨跌落',tag:'MEASURED'},
      {key:'inputVoltageV',label:'标称输入',unit:'V',description:'车辆供电条件',tag:'CONTEXT'},
    ],
    knownPitfalls:['ISO 7637/用户脉冲波形定义必须与实际测试设备设置核对', '源端通过而ECU端不代表通过，内部节点仍可能越界'],
  },
  SIGNAL: {
    key:'SIGNAL', title:'Signal Integrity / CAN-FD / 阻抗与时序裕量', question:'阻抗不连续、回流与边沿速度如何侵蚀通信裕量？', chain:'驱动边沿 → 走线/连接器 → 反射/串扰/地弹 → 波形畸变 → 采样窗口 → CRC/ACK异常', formulas:['Γ=(ZL-Z0)/(ZL+Z0)','UI margin = UI - jitter - skew - setup/hold'], tests:['TDR / eye diagram','最坏线束与节点数','终端A-B','温度下边沿/误码复测'], outputs:['阻抗目标','终端策略','回流/layout规则','回归条件'], measurements:[
    {key:'busRateMbps',label:'总线速率',unit:'Mbps',description:'当前数据段速率',tag:'CONTEXT',required:true},
    {key:'harnessLengthM',label:'线束长度',unit:'m',description:'实际线束',tag:'CONTEXT'},
    {key:'overshootPct',label:'过冲',unit:'%',description:'示波器实测',tag:'MEASURED'},
    {key:'ringingV',label:'振铃',unit:'V',description:'末端振铃',tag:'MEASURED'},
    {key:'frameErrorRate',label:'错误帧率',description:'统计窗口',tag:'MEASURED'},
  ], knownPitfalls:['软件降速不能替代硬件SI根因闭环'],
  },
  SAFETY: {key:'SAFETY',title:'功能安全 / 故障 → 诊断 → FTTI → 安全状态',question:'当前硬件异常是否在规定时间内被检测并带入安全状态？',chain:'Fault → Detection → Reaction → Safe State → Residual Risk',formulas:['FTTI≥Detection+Reaction+Transition','Residual risk与诊断覆盖/独立性有关'],tests:['Fault Injection','DC/diagnostic coverage','安全状态切换时间'],outputs:['HARA/FSR/TSR约束','安全机制缺口','门禁用例'],measurements:[{key:'fttiBudgetMs',label:'FTTI预算',unit:'ms',description:'系统给定窗口',tag:'SPEC'},{key:'detectionTimeMs',label:'检测时间',unit:'ms',description:'实测/计算',tag:'MEASURED'},{key:'reactionTimeMs',label:'反应时间',unit:'ms',description:'实测',tag:'MEASURED'}],knownPitfalls:['不能用“有诊断”替代诊断时序和安全状态证据']},
  RELIABILITY: {key:'RELIABILITY',title:'可靠性 / 应力—损伤—寿命',question:'任务剖面下的温度、电应力与循环如何转化成寿命？',chain:'Mission profile → stress cycles → damage → drift → failure probability',formulas:['Arrhenius加速仅用于合适失效机理','温度循环/电应力需与失效机理匹配'],tests:['寿命/HTOL','热循环','参数漂移与失效统计'],outputs:['寿命边界','降额','关键特性控制'],measurements:[{key:'missionYears',label:'任务年限',unit:'year',description:'目标寿命',tag:'SPEC',required:true},{key:'missionHours',label:'任务小时',unit:'h',description:'任务剖面',tag:'CONTEXT'},{key:'maxStressC',label:'最高温度',unit:'℃',description:'任务最大应力',tag:'MEASURED',required:true}],knownPitfalls:['加速模型必须与实际失效机理对应']},
  DFM: {key:'DFM',title:'DFM / 制造窗口与设计鲁棒性',question:'设计窗口是否覆盖制造过程漂移？',chain:'Design tolerance → process variation → measured distribution → yield / field risk',formulas:['Cpk=min((USL-μ)/(3σ),(μ-LSL)/(3σ))'],tests:['DOE','Cpk/Ppk','首件/过程能力'],outputs:['CTQ','SPC','Control Plan'],measurements:[{key:'cpk',label:'Cpk',description:'过程能力',tag:'MEASURED'},{key:'ppk',label:'Ppk',description:'过程绩效',tag:'MEASURED'},{key:'sampleCount',label:'样本数',unit:'pcs',description:'样本',tag:'MEASURED'}],knownPitfalls:['不要把终检筛选能力当成设计本身鲁棒性']},
  PRODUCTION: {key:'PRODUCTION',title:'量产 / EOL / 异常批次闭环',question:'EOL筛查、过程能力与现场风险是否一致？',chain:'Process drift → parameter distribution → EOL screening → field behavior → containment',formulas:['False-NG与False-OK需分别评估','EOL阈值应由功能风险窗口反推'],tests:['批次追溯','EOL分布','现场回流关联'],outputs:['EOL阈值','反应计划','批次隔离'],measurements:[{key:'sampleCount',label:'样本数',unit:'pcs',description:'批次样本量',tag:'MEASURED'},{key:'falseNgPct',label:'False NG',unit:'%',description:'误判NG',tag:'MEASURED'},{key:'taktSec',label:'EOL节拍',unit:'s',description:'测试节拍',tag:'MEASURED'}],knownPitfalls:['放宽EOL阈值必须证明不会增加False-OK']},
  COST: {key:'COST',title:'降本 / 全生命周期 Cost-Risk',question:'BOM节省是否被验证、可靠性和质量暴露成本吃掉？',chain:'BOM Delta → design change → test/reliability/quality exposure → TCO',formulas:['TCO = BOM + tooling + validation + expected failure exposure'],tests:['A/B样机','热/EMC/寿命回归','供应链质量证据'],outputs:['TCO矩阵','VETO清单','受控降本'],measurements:[{key:'bomDelta',label:'BOM变化',unit:'$',description:'单机成本变化',tag:'MEASURED',required:true},{key:'annualVolume',label:'年产量',unit:'pcs',description:'规模',tag:'CONTEXT',required:true}],knownPitfalls:['只看BOM节省而不算质量/返工/索赔风险']},
  SCHEDULE: {key:'SCHEDULE',title:'节点冲突 / VOI / 最小信息试验',question:'剩余时间如何改变验证优先级，而不是放宽技术红线？',chain:'time remaining → uncertainty → VOI → minimum discriminating experiment → decision gate',formulas:['VOI = decision impact × uncertainty reduction / experiment time'],tests:['时间盒','并行A/B','Go/No-Go'],outputs:['24h行动计划','Plan B','门禁'],measurements:[{key:'daysRemaining',label:'剩余天数',unit:'day',description:'当前节点剩余时间',tag:'CONTEXT',required:true}],knownPitfalls:['时间紧不能证明技术风险变小']},
  TEST: {key:'TEST',title:'测试失败 / 复现—隔离—回归',question:'如何把“偶发失败”变成可重复、可反证的因果链？',chain:'failure → reproduce → isolate → hypothesis → counter-evidence → regression',formulas:['一次只改变关键变量','回归必须覆盖原失败窗口'],tests:['Repeatability','A/B','原窗口回归'],outputs:['复现矩阵','根因证据','回归标准'],measurements:[{key:'repeatCount',label:'复现次数',unit:'count',description:'有效重复次数',tag:'MEASURED'}],knownPitfalls:['没有失败原始条件就不能宣称根因已锁定']},
  CUSTOMER: {key:'CUSTOMER',title:'客户需求 / Interface Definition',question:'哪些信息必须形成书面基线，哪些只能作为Assumption？',chain:'customer request → assumption → design impact → written confirmation → controlled baseline',formulas:['沉默 ≠ 批准'],tests:['接口确认','书面回执','变更回归'],outputs:['Requirement baseline','Assumption log','ECR触发条件'],measurements:[],knownPitfalls:['口头确认不能当作正式需求基线']},
  DEVIATION: {key:'DEVIATION',title:'设计偏差 / 受控放行',question:'偏差的范围、期限、批次和关闭条件是什么？',chain:'spec deviation → risk assessment → temporary control → authorization → closure',formulas:['Deviation必须可测量、可追溯、可过期'],tests:['边界验证','授权签核','关闭复测'],outputs:['Deviation Permit','关闭条件'],measurements:[],knownPitfalls:['临时措施不能自动升级成永久设计']},
  GENERAL: {key:'GENERAL',title:'当前工程问题 / 因果与证据闭环',question:'当前问题缺的事实是什么？哪一个实验最能减少不确定性？',chain:'Fact → mechanism → alternative → evidence → decision → closure',formulas:['未知量必须转成可测量验证项'],tests:['边界测量','最坏组合','模型/实测交叉验证'],outputs:['Unknown list','验证优先级','受控结论'],measurements:[],knownPitfalls:['未知不能用默认数字填掉']},
};

export function resolveEngineeringDomain(issue: IssueInput): EngineeringDomain {
  const cats = issue.issueCategories || [];
  const text = `${cats.join(' ')} ${issue.requirement || ''} ${issue.actualMeasurement || ''} ${issue.failurePhenomenon || ''} ${issue.engineeringConcern || ''} ${issue.notes || ''}`;
  const has = (...values: typeof cats[number][]) => values.some(v => cats.includes(v));

  // Explicit category is authoritative. Multi-category issues are resolved by engineering
  // specificity: BCI/ESD subtype > BLDC / component / WCCA / thermal / power / signal > generic EMC.
  if (has('EMC') && /BCI|大电流注入|ISO\s*11452-4|注入电流|抗扰度/i.test(text)) return 'EMC_BCI';
  if (has('EMC') && /ESD|静电|ISO\s*10605|放电/i.test(text)) return 'EMC_ESD';
  if (has('Component Alternative')) return 'COMPONENT';
  // 机器人/协作臂关节的机电系统层问题（背隙、编码器、谐振、力矩闭环、STO、总线周期）
  // 与车规逆变桥电气物理问题（母线泵升、米勒、死区、热、EMI）属于不同工程层次，
  // 因此单独分域；若关节的逆变桥本体出问题，仍应勾选 'BLDC Motor Drive' 走 P001~P018。
  if (has('Robot Joint Drive')) return 'ROBOT_JOINT';
  if (has('BLDC Motor Drive')) return 'BLDC';
  if (has('WCCA')) return /EOL|标定|量产|Cpk|Ppk|残余|校准/i.test(text) ? 'WCCA_EOL' : 'WCCA';
  if (has('Thermal')) return 'THERMAL';
  if (has('Power')) return /ISO\s*7637|load dump|transient|脉冲1|脉冲2a|脉冲2b|脉冲3a|脉冲3b|反接|电源瞬态/i.test(text) ? 'POWER_TRANSIENT' : 'POWER';
  if (has('Signal Integrity')) return 'SIGNAL';
  if (has('EMC')) return 'EMC_RE_CE';
  if (has('Functional Safety')) return 'SAFETY';
  if (has('Reliability')) return 'RELIABILITY';
  if (has('DFM')) return 'DFM';
  if (has('Customer Requirement')) return 'CUSTOMER';
  if (has('Design Deviation')) return 'DEVIATION';
  if (has('Production')) return 'PRODUCTION';
  if (has('Cost Reduction')) return 'COST';
  if (has('Schedule Conflict')) return 'SCHEDULE';
  if (has('Test Failure')) return 'TEST';

  // Keyword fallback only when no explicit category resolves the problem.
  if (/BCI|大电流注入|ISO\s*11452-4|注入电流|抗扰度/i.test(text)) return 'EMC_BCI';
  if (/ESD|静电|ISO\s*10605|放电/i.test(text)) return 'EMC_ESD';
  if (/机器人关节|协作机器人|谐波减速|RV减速|背隙|回程间隙|力矩传感|EtherCAT|CANopen|STO|SS1|安全扭矩关断|关节模组/i.test(text)) return 'ROBOT_JOINT';
  if (/BLDC|泵升|米勒|换相|堵转/i.test(text)) return 'BLDC';
  if (/MOSFET|替代料|换料|停产|缺料|PPAP|PCN/i.test(text)) return 'COMPONENT';
  if (/WCCA|最坏情况|公差链|误差预算|温漂|Cpk|Ppk/i.test(text)) return 'WCCA';
  if (/热设计|温升|结温|散热|功耗/i.test(text)) return 'THERMAL';
  if (/ISO\s*7637|load dump|transient|脉冲1|脉冲2a|脉冲2b|脉冲3a|脉冲3b|反接|电源瞬态/i.test(text)) return 'POWER_TRANSIENT';
  if (/电源完整性|负载突变|过冲|跌落|纹波|di\/dt/i.test(text)) return 'POWER';
  if (/CAN-FD|信号完整性|串扰|反射|眼图|阻抗/i.test(text)) return 'SIGNAL';
  if (/EMC|CISPR|辐射|传导/i.test(text)) return 'EMC_RE_CE';
  if (/ASIL|功能安全|FTTI|安全目标/i.test(text)) return 'SAFETY';
  if (/可靠性|寿命|Weibull|老化/i.test(text)) return 'RELIABILITY';
  if (/DFM|制程|Cpk|Ppk/i.test(text)) return 'DFM';
  if (/客户|需求|接口定义/i.test(text)) return 'CUSTOMER';
  if (/偏差|让步|ECR|设计变更/i.test(text)) return 'DEVIATION';
  if (/量产|EOL|ICT|AOI|批次/i.test(text)) return 'PRODUCTION';
  if (/降本|成本|BOM/i.test(text)) return 'COST';
  if (/节点|延期|倒计时|剩余.*天/i.test(text)) return 'SCHEDULE';
  if (/测试失败|复现|再现/i.test(text)) return 'TEST';
  return 'GENERAL';
}

export function resolveEngineeringDomains(issue: IssueInput): EngineeringDomain[] {
  const categories = issue.issueCategories || [];
  const seen = new Set<EngineeringDomain>();
  const domains: EngineeringDomain[] = [];
  const add = (d: EngineeringDomain) => {
    if (!seen.has(d)) { seen.add(d); domains.push(d); }
  };

  // 每个显式分类独立解析一次，避免多分类被 resolveEngineeringDomain 的单一优先级吞掉。
  for (const category of categories) {
    const singleIssue: IssueInput = { ...issue, issueCategories: [category] };
    add(resolveEngineeringDomain(singleIssue));
  }

  // 文本识别只作为没有显式分类时的兜底；显式多分类不再额外制造噪声域。
  if (domains.length === 0) add(resolveEngineeringDomain(issue));
  return domains;
}

export function getEngineeringDomainLabel(domain: EngineeringDomain): string {
  const labels: Record<EngineeringDomain, string> = {
    BLDC:'BLDC / Motor Drive', ROBOT_JOINT:'Robot Joint', EMC_BCI:'EMC / BCI', EMC_RE_CE:'EMC / RE · CE', EMC_ESD:'EMC / ESD',
    COMPONENT:'Component', WCCA_EOL:'WCCA / EOL', WCCA:'WCCA', THERMAL:'Thermal', POWER:'Power Integrity', POWER_TRANSIENT:'Power Transient',
    SIGNAL:'Signal Integrity', SAFETY:'Functional Safety', RELIABILITY:'Reliability', DFM:'DFM', PRODUCTION:'Production', COST:'Cost', SCHEDULE:'Schedule', TEST:'Test Failure', CUSTOMER:'Customer Requirement', DEVIATION:'Design Deviation', GENERAL:'General',
  };
  return labels[domain] || domain;
}

export function getDomainRoleMap(issue: IssueInput): Array<{ domain: EngineeringDomain; role: 'PRIMARY' | 'RELATED' }> {
  const domains = resolveEngineeringDomains(issue);
  const primary = resolveEngineeringDomain(issue);
  return [primary, ...domains.filter(d => d !== primary)].map((domain, index) => ({
    domain,
    role: index === 0 ? 'PRIMARY' : 'RELATED',
  }));
}

export function getDomainMeasurementGroups(issue: IssueInput): Array<{ domain: EngineeringDomain; title: string; fields: DomainMeasurementField[] }> {
  return getDomainRoleMap(issue).map(({ domain }) => ({
    domain,
    title: P[domain].title,
    fields: P[domain].measurements,
  }));
}

export function getDomainPhysics(issue: IssueInput): DomainProfile {
  return P[resolveEngineeringDomain(issue)];
}

export function getDomainMeasurementFields(issue: IssueInput): DomainMeasurementField[] {
  const merged = new Map<string, DomainMeasurementField>();
  for (const group of getDomainMeasurementGroups(issue)) {
    for (const field of group.fields) {
      const existing = merged.get(field.key);
      if (!existing) {
        merged.set(field.key, { ...field });
      } else {
        merged.set(field.key, {
          ...existing,
          required: Boolean(existing.required || field.required),
          description: existing.description || field.description,
        });
      }
    }
  }
  return [...merged.values()];
}

export function getDomainDataQuality(issue: IssueInput) {
  const fields = getDomainMeasurementFields(issue);
  const values = issue.measuredValues || {};
  const provenance = issue.measurementProvenance || {};
  const required = fields.filter(f => f.required);
  const present = (field: DomainMeasurementField) => {
    const v = values[field.key];
    return v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  };
  const sourceFor = (field: DomainMeasurementField): MeasurementSource =>
    (provenance[field.key]?.source || (issue.measuredValueSource as MeasurementSource | undefined) ||
      (field.tag === 'CALCULATED' ? 'CALCULATED' : field.tag === 'SPEC' ? 'SPEC' : field.tag === 'CONTEXT' ? 'CONTEXT' : 'UNKNOWN')) as MeasurementSource;
  const trusted = (field: DomainMeasurementField) => sourceFor(field) === 'USER_MEASURED' || sourceFor(field) === 'IMPORTED';
  const requiredDone = required.filter((field) => present(field) && trusted(field)).length;
  const measured = fields.filter(f => (f.tag === 'MEASURED' || f.tag === 'SPEC' || f.tag === 'CONTEXT') && present(f) && trusted(f)).length;
  const sourceCounts = fields.reduce((acc, f) => {
    const v = values[f.key];
    if (v === undefined || v === null || v === '') return acc;
    const src = (provenance[f.key]?.source || (f.tag === 'CALCULATED' ? 'CALCULATED' : issue.measuredValueSource || f.tag || 'UNKNOWN')) as MeasurementSource;
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const benchmarkCount = sourceCounts.BENCHMARK || 0;
  const trustedInputCount = (sourceCounts.USER_MEASURED || 0) + (sourceCounts.IMPORTED || 0);
  return {
    requiredCount: required.length,
    requiredDone,
    complete: requiredDone === required.length,
    measuredPresent: measured,
    inputFieldCount: fields.filter(f => f.tag !== 'CALCULATED').length,
    missingRequired: required.filter(f => !present(f) || !trusted(f)).map(f => {
      const src = sourceFor(f);
      return `${f.label}${f.unit ? ` (${f.unit})` : ''}${present(f) && src !== 'USER_MEASURED' && src !== 'IMPORTED' ? ` · 证据来源=${src}` : ''}`;
    }),
    sourceCounts,
    benchmarkCount,
    trustedInputCount,
    confidencePct: fields.length ? Math.round((trustedInputCount / Math.max(1, fields.filter(f => f.tag !== 'CALCULATED').length)) * 100) : 100,
  };
}

export function extractMeasurementsFromText(issue: IssueInput, rawText: string): Record<string, number> {
  const domain = resolveEngineeringDomain(issue);
  const fields = getDomainMeasurementFields(issue);
  const out: Record<string, number> = {};
  const text = rawText.replace(/,/g, ' ');
  for (const f of fields) {
    const patterns: RegExp[] = [
      new RegExp(`${f.label.replace(/[.*+?^${}()|[\]\\]/g,'')}[^0-9+-]{0,30}([+-]?\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`${f.key.replace(/[.*+?^${}()|[\]\\]/g,'')}[^0-9+-]{0,20}([+-]?\\d+(?:\\.\\d+)?)`, 'i'),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) { out[f.key] = n; break; }
      }
    }
  }
  // Common aliases found in CSV exports.
  const aliases: Record<string,string[]> = {
    emcPeakDb:['peak','max','dbuv','dbµv','emc'], emcFrequencyMhz:['freq','frequency'],
    bciInjectionMa:['inject','iinj','mA'], bciSensitiveFreqMhz:['frequency','freq'], commonModeCurrentMa:['commonmode','icm'], bciNodeVoltageV:['nodevoltage','vnode'],
    currentSenseErrorPct:['error','deviation'], recoveryTimeMs:['recovery'],
    accuracyErrorPct:['error','totalerror'], accuracyErrorHotPct:['hoterror'], sampleCount:['n','samples'],
    junctionTempC:['tj','junction'], ambientTempC:['ambient','ta'], powerLossW:['loss','power'],
    busRateMbps:['rate','mbps'], overshootPct:['overshoot'], ringingV:['ringing'], frameErrorRate:['errorrate'],
    zeroMeanPct:['zeromean'], zero3SigmaPct:['3sigma'], agedZeroMeanPct:['aged'], falseNgPct:['falseng'], taktSec:['takt'],
  };
  for (const [key, words] of Object.entries(aliases)) {
    if (out[key] != null) continue;
    for (const w of words) {
      const re = new RegExp(`${w}[^0-9+-]{0,25}([+-]?\\d+(?:\\.\\d+)?)`, 'i');
      const m = text.match(re);
      if (m?.[1]) { const n = Number(m[1]); if (Number.isFinite(n)) { out[key] = n; break; } }
    }
  }
  return out;
}


export function buildSingleDomainPassFailCriteria(issue: IssueInput, context: ProjectContext, forcedDomain?: EngineeringDomain): Array<{parameter:string; greenCriteria:string; yellowCriteria:string; redCriteria:string}> {
  const d = forcedDomain || resolveEngineeringDomain(issue);
  const n = (k: string) => {
    const raw = issue.measuredValues?.[k];
    if (raw === undefined || raw === null || raw === '') return NaN;
    const v = Number(raw); return Number.isFinite(v) ? v : NaN;
  };
  const req = issue.requirement || '当前项目/客户规格';
  switch (d) {
    case 'BLDC':
      return [{parameter:'急停 / 米勒 / 热 / 保护联合门禁',greenCriteria:`母线峰值、Vgs尖峰、Tj与保护时序均满足规格：${req}`,yellowCriteria:'任何一项接近门限或证据不足，追加最坏边界与重复性验证，不直接放行',redCriteria:'任一硬性耐压、Vgs安全或Tj红线超限，立即停止放行并进入物理整改/Plan B'}];
    case 'ROBOT_JOINT':
      return [{parameter:`关节精度 / 谐振 / 力矩闭环 / STO / 总线联合门禁 ${req !== '当前项目/客户规格' ? `(${req})` : ''}`,greenCriteria:'输出定位误差、谐振裕量、力矩闭环误差带、泄放电阻连续热裕量均满足规格，STO/SS1 具备硬件独立通道且响应时间达标',yellowCriteria:'单项接近门限或缺少全温/全速度覆盖的实测证据（尤其力矩误差带、泄放电阻连续温升），需追加验证，不直接放行',redCriteria:'定位误差超客户规格、速度环带宽侵入谐振区、STO 仅靠软件禁止 PWM、或泄放电阻长期过载，立即停止放行并回到物理整改'}];
    case 'EMC_BCI':
      return [{parameter:`BCI ${Number.isFinite(n('bciSensitiveFreqMhz'))?n('bciSensitiveFreqMhz'):'目标'} MHz / ${Number.isFinite(n('bciInjectionMa'))?n('bciInjectionMa'):'目标'} mA 功能门禁`,greenCriteria:'注入窗口内关键功能保持，关键采样/通信无不可接受异常，撤除注入后在项目规定恢复窗口内恢复',yellowCriteria:'出现可重复但不影响安全的瞬态偏差，需补充源-路径-受扰体证据与边界验证',redCriteria:'功能失效、进入危险状态、通信持续丢失或恢复超出项目窗口，立即停止放行'}];
    case 'EMC_ESD':
      return [{parameter:`ESD ${Number.isFinite(n('esdLevelKv'))?n('esdLevelKv'):'目标'} kV / ${issue.requirement || '功能保持门限'}`,greenCriteria:'放电后功能保持正常，无不可接受通信/采样异常，且放电后电气参数无异常漂移',yellowCriteria:'瞬态异常但自动恢复，需补充恢复时间和端口保护证据',redCriteria:'锁死、复位后无法恢复、通信持续中断或放电后出现潜在损伤迹象，停止放行'}];
    case 'EMC_RE_CE':
      return [{parameter:`${Number.isFinite(n('emcFrequencyMhz'))?n('emcFrequencyMhz'):'目标频点'} 发射门禁`,greenCriteria:`峰值/平均值满足当前标准与客户限值：${req}`,yellowCriteria:'接近限值或整改收益未在代表性装配状态下重复确认，追加频点与A/B验证',redCriteria:'任一正式门限超限且无已批准偏差，禁止进入正式DV放行'}];
    case 'WCCA_EOL':
    case 'WCCA':
      return [{parameter:`WCCA / EOL 总误差门禁 ${Number.isFinite(n('specLimitPct'))?`±${n('specLimitPct')}%`:''}`,greenCriteria:`全温、寿命与制造窗口后的残余误差满足当前规格：${req}`,yellowCriteria:'模型满足但实测分布/相关性/高温或老化证据不足，追加样本与分布验证',redCriteria:'最坏边界或实测残余误差超过客户硬性门限，禁止用RSS/Monte Carlo单独替代放行'}];
    case 'THERMAL':
      return [{parameter:`Tj / 热裕量 ${Number.isFinite(n('tjLimitC'))?`上限 ${n('tjLimitC')}℃`:''}`,greenCriteria:'稳态与瞬态最坏负载下Tj均满足允许上限，并保留项目要求的降额裕量',yellowCriteria:'接近热限或热阻/功耗模型未与实测交叉验证，追加高温稳态与热路径A/B',redCriteria:'Tj超过允许上限、热失控趋势或保护阈值触发，立即停止放行'}];
    case 'COMPONENT':
      return [{parameter:'替代料电气 / 动态 / 热 / SOA 联合门禁',greenCriteria:'Spec-to-Spec + Use-case-to-Use-case 均等价，SOA/Tj/EMC/可靠性/PPAP证据完整',yellowCriteria:'存在单项参数等价但动态或质量证据缺口，必须完成针对性回归',redCriteria:'耐压、SOA、Tj、功能安全或合规红线不满足，禁止以Pin-to-Pin替代放行'}];
    case 'POWER_TRANSIENT':
      return [{parameter:'车载电源瞬态 / ECU内部电源轨门禁',greenCriteria:'所有规定脉冲下关键节点未越过器件与系统门限，功能/通信保持且无潜在损伤',yellowCriteria:'瞬态通过但内部节点裕量不足，追加双测点、角点温度与保护器件A/B',redCriteria:'任一器件耐压、MCU电源范围或功能安全门限越界，停止放行'}];
    case 'POWER':
      return [{parameter:'负载阶跃 / 电源轨瞬态门禁',greenCriteria:'过冲、跌落、纹波与恢复时间均满足当前规格',yellowCriteria:'接近保护门限或测点/阻抗不确定，追加源端/负载端双测点',redCriteria:'触发UVLO/OVP/Reset或超过硬性器件门限，停止放行'}];
    case 'SIGNAL':
      return [{parameter:'CAN-FD / Signal Integrity 功能门禁',greenCriteria:'最坏线束/节点/温度下眼图与时序裕量满足项目要求，错误帧为0或在批准范围',yellowCriteria:'存在过冲/振铃/采样裕量下降，追加TDR、终端A/B与温度验证',redCriteria:'错误帧持续、通信中断或安全相关报文失效，禁止用软件降速直接关闭根因'}];
    case 'SAFETY':
      return [{parameter:'故障检测 → 反应 → 安全状态门禁',greenCriteria:'FTTI与安全状态转换满足项目安全目标并有Fault Injection证据',yellowCriteria:'诊断覆盖或时序证据不完整，补充独立性/故障注入',redCriteria:'未在FTTI内进入安全状态或存在单点危险失效，停止放行'}];
    case 'RELIABILITY':
      return [{parameter:'任务剖面 / 寿命门禁',greenCriteria:'寿命与应力循环证据覆盖实际任务剖面，参数漂移受控',yellowCriteria:'加速模型或失效机理仍有未知项，追加验证',redCriteria:'预测寿命不足目标或已出现同机理重复失效，停止放行'}];
    case 'PRODUCTION':
      return [{parameter:'EOL / 过程能力 / 现场风险门禁',greenCriteria:'EOL阈值、Cpk/Ppk与现场窗口一致，False-OK风险受控',yellowCriteria:'False-NG上升或样本量不足，扩大样本并核对现场相关性',redCriteria:'False-OK风险无法排除或批次失控，立即隔离'}];
    default:
      return [{parameter:'当前工程关键指标',greenCriteria:`满足当前规格与客户要求：${req}`,yellowCriteria:'进入预警区或证据不足时追加最小验证，不直接放行',redCriteria:'硬门限超限、功能失效或安全红线触发，立即停止放行'}];
  }
}

export function buildScenarioPassFailCriteria(issue: IssueInput, context: ProjectContext): Array<{parameter:string; greenCriteria:string; yellowCriteria:string; redCriteria:string}> {
  const out: Array<{parameter:string; greenCriteria:string; yellowCriteria:string; redCriteria:string}> = [];
  for (const domain of resolveEngineeringDomains(issue)) {
    const rows = buildSingleDomainPassFailCriteria(issue, context, domain);
    for (const row of rows) out.push({ ...row, parameter: `${getEngineeringDomainLabel(domain)} · ${row.parameter}` });
  }
  return out;
}

export function calculateDomainMetrics(issue: IssueInput, context: ProjectContext) {
  const domains = resolveEngineeringDomains(issue);
  const all: ReturnType<typeof calculateSingleDomainMetrics> = [];
  for (const domain of domains) {
    const metrics = calculateSingleDomainMetrics(issue, context, domain);
    for (const metric of metrics) {
      const duplicate = all.some(m => m.label === metric.label && m.value === metric.value);
      if (!duplicate) all.push({ ...metric, note: `${domain} · ${metric.note}` });
    }
  }
  return all;
}

export function calculateSingleDomainMetrics(issue: IssueInput, context: ProjectContext, forcedDomain?: EngineeringDomain) {
  const n = (k: string) => {
    const raw = issue.measuredValues?.[k];
    if (raw === undefined || raw === null || raw === '') return NaN;
    const v = Number(raw);
    return Number.isFinite(v) ? v : NaN;
  };
  const finite = (v: number) => Number.isFinite(v);
  const d = forcedDomain || resolveEngineeringDomain(issue);
  const fieldSource = (key: string) => issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'MEASURED';
  const tagFor = (key: string): 'MEASURED'|'BENCHMARK' => fieldSource(key) === 'BENCHMARK' ? 'BENCHMARK' : 'MEASURED';
  const noteFor = (key: string) => tagFor(key) === 'BENCHMARK' ? 'BENCHMARK · 仅演示，请用实测/导入数据覆盖' : `${fieldSource(key)} · 当前输入`;
  const metrics: Array<{label:string; value:string; note:string; tag:'MEASURED'|'CALCULATED'|'SPEC'|'BENCHMARK'}> = [];
  if (d === 'BLDC') {
    const evidence = calculateBldcDeterministicCalculations(issue);
    evidence.forEach((item) => {
      if (item.status === 'CALCULATED' && item.value !== undefined) {
        metrics.push({
          label: item.key,
          value: `${item.value.toFixed(2)} ${item.unit}`,
          note: `CALCULATED · ${item.engine}.${item.calculation} · inputs=${item.inputs.join(', ')}`,
          tag: 'CALCULATED',
        });
        if (item.safetyMargin !== undefined) {
          metrics.push({
            label: `${item.key}.safetyMargin`,
            value: `${item.safetyMargin.toFixed(2)} ${item.unit}`,
            note: `CALCULATED · safety margin against ${item.specThreshold ?? 'threshold'}`,
            tag: 'CALCULATED',
          });
        }
      }
    });
  } else if (d === 'ROBOT_JOINT') {
    const backlash = n('backlashArcmin'), stiffness = n('torsionalStiffnessNmPerRad'), torque = n('outputTorqueNm'), reqAccuracy = n('requiredPositionAccuracyArcmin');
    if (finite(backlash)) metrics.push({label:'背隙',value:`${backlash} arcmin`,note:noteFor('backlashArcmin'),tag:tagFor('backlashArcmin')});
    if (finite(backlash) && finite(stiffness) && finite(torque) && stiffness > 0) {
      const windupArcmin = (torque / stiffness) * (180 / Math.PI) * 60;
      const totalErrorArcmin = backlash + windupArcmin;
      metrics.push({label:'扭转柔性附加误差',value:`${windupArcmin.toFixed(1)} arcmin`,note:'CALCULATED · T_out/K_stiffness 折算',tag:'CALCULATED'});
      metrics.push({label:'输出端运动学总误差(估算)',value:`${totalErrorArcmin.toFixed(1)} arcmin`,note:'CALCULATED · 背隙 + 扭转柔性，不含传感器与控制误差',tag:'CALCULATED'});
      if (finite(reqAccuracy)) metrics.push({label:'定位精度裕量',value:`${(reqAccuracy - totalErrorArcmin).toFixed(1)} arcmin`,note:'规格要求 - 估算总误差',tag:'CALCULATED'});
    }
    const jMotor = n('motorInertiaKgm2'), jLoad = n('loadInertiaKgm2'), gearRatio = n('gearRatio'), vBw = n('velocityLoopBandwidthHz');
    if (finite(stiffness) && finite(jMotor) && jMotor > 0 && finite(jLoad) && finite(gearRatio) && gearRatio > 0) {
      const res = calculateTwoMassResonance({
        torsionalStiffnessNmPerRad: stiffness,
        motorInertiaKgm2: jMotor,
        loadInertiaKgm2: jLoad,
        gearRatio,
        velocityLoopBandwidthHz: finite(vBw) && vBw > 0 ? vBw : undefined,
      });
      metrics.push({
        label: '估算机械谐振频率 f_res',
        value: `${res.resonanceFreqHz} Hz`,
        note: res.isPlausible ? 'CALCULATED · 二质量输出侧折算极点' : `CALCULATED · ${res.plausibilityWarning}`,
        tag: 'CALCULATED',
      });
      metrics.push({
        label: '输出端反谐振频率 f_ar',
        value: `${res.antiResonanceFreqHz} Hz`,
        note: 'CALCULATED · 输出端零点 sqrt(K/J_L)/(2π)',
        tag: 'CALCULATED',
      });
      metrics.push({
        label: '关节惯量比 (J_L_refl/J_m)',
        value: `${res.inertiaRatio} : 1`,
        note: res.inertiaRatio <= 10 ? 'CALCULATED · 惯量匹配良好 (<=10)' : 'CALCULATED · 惯量比偏大 (>10)，需加强控制鲁棒性',
        tag: 'CALCULATED',
      });
      if (finite(vBw) && vBw > 0) {
        metrics.push({
          label: '谐振/带宽隔离度',
          value: `${res.bandwidthIsolationRatio}×`,
          note: res.isBandwidthAboveResonance
            ? 'CALCULATED · 严重不稳定！速度环带宽已骑在或高于谐振频率，闭环必剧烈啸叫'
            : res.isBandwidthInvadingResonance
            ? 'CALCULATED · 侵入谐振区 (<3×)，必须配置陷波器 (Notch Filter) 或下调带宽'
            : 'CALCULATED · 隔离度良好 (>=3×)',
          tag: 'CALCULATED',
        });
      }
    }
    const regenPeak = n('regenPowerPeakW'), resistorRated = n('brakingResistorRatedContinuousW');
    if (finite(regenPeak) && finite(resistorRated) && resistorRated > 0) metrics.push({label:'峰值回馈/泄放电阻额定比',value:`${((regenPeak / resistorRated) * 100).toFixed(0)}%`,note:'CALCULATED · 需结合占空比看平均功率，非直接判据',tag:'CALCULATED'});
  } else if (d === 'EMC_BCI') {
    const inj=n('bciInjectionMa'), err=n('currentSenseErrorPct'), rec=n('recoveryTimeMs'), icm=n('commonModeCurrentMa'), vnode=n('bciNodeVoltageV');
    if (finite(inj)) metrics.push({label:'BCI注入',value:`${inj} mA`,note:noteFor('bciInjectionMa'),tag:tagFor('bciInjectionMa')});
    if (finite(inj)&&finite(err)&&inj>0) metrics.push({label:'采样敏感度',value:`${(err/inj).toFixed(4)} %/mA`,note:'CALCULATED · Δerror / Iinj，仅作频点比较',tag:'CALCULATED'});
    if (finite(icm)&&finite(inj)&&inj>0) metrics.push({label:'共模传递比',value:`${(icm/inj*100).toFixed(1)}%`,note:'CALCULATED · Icm / Iinj',tag:'CALCULATED'});
    if (finite(vnode)&&finite(icm)&&icm>0) metrics.push({label:'受扰节点等效 Zcm',value:`${(vnode/(icm/1000)).toFixed(2)} Ω`,note:'CALCULATED · Vnode/Icm 的简化工程指标，不替代频域阻抗测量',tag:'CALCULATED'});
    if (finite(rec)) metrics.push({label:'恢复时间',value:`${rec} ms`,note:`${noteFor('recoveryTimeMs')} · 与功能门禁比较`,tag:tagFor('recoveryTimeMs')});
  } else if (d === 'EMC_ESD') {
    const kv=n('esdLevelKv'), rec=n('recoveryTimeMs'), err=n('canErrorCount');
    if (finite(kv)) metrics.push({label:'ESD等级',value:`${kv} kV`,note:noteFor('esdLevelKv'),tag:tagFor('esdLevelKv')});
    if (finite(rec)) metrics.push({label:'恢复时间',value:`${rec} ms`,note:`${noteFor('recoveryTimeMs')} · 功能恢复证据`,tag:tagFor('recoveryTimeMs')});
    if (finite(err)) metrics.push({label:'错误帧',value:String(err),note:`${noteFor('canErrorCount')} · 测试窗口`,tag:tagFor('canErrorCount')});
  } else if (d === 'EMC_RE_CE') {
    const peak=n('emcPeakDb'), lim=n('emcLimitDb');
    if (finite(peak)) metrics.push({label:'EMC峰值',value:`${peak} dBμV/m`,note:noteFor('emcPeakDb'),tag:tagFor('emcPeakDb')});
    if (finite(peak)&&finite(lim)) metrics.push({label:'裕量',value:`${(lim-peak).toFixed(2)} dB`,note:'Limit - measured',tag:'CALCULATED'});
  } else if (d === 'WCCA' || d === 'WCCA_EOL') {
    const raw=n('accuracyErrorPct'), hot=n('accuracyErrorHotPct'), residual=n('calibrationResidualPct'), lim=n('specLimitPct');
    const budgetKeys=['shuntTolerancePct','afeOffsetBudgetPct','adcRefDriftBudgetPct','tempDriftBudgetPct','agingDriftBudgetPct'];
    const budget=budgetKeys.map(n).filter(finite);
    if (budget.length >= 2) {
      const sumSq = budget.reduce((a, b) => a + b * b, 0);
      const sumAbs = budget.reduce((a, b) => a + Math.abs(b), 0);
      const extreme = sumAbs;
      const rss = Math.sqrt(sumSq);
      const rho = n('correlationFactor');

      metrics.push({label:'WCCA Extreme(硬安全上界)',value:`±${extreme.toFixed(2)}%`,note:'CALCULATED · 预算项绝对值相加 (ρ=1 极端工况)',tag:'CALCULATED'});
      metrics.push({label:'WCCA RSS(统计下界)',value:`±${rss.toFixed(2)}%`,note:'CALCULATED · 独立同方差假设 (ρ=0 理想统计)',tag:'CALCULATED'});
      metrics.push({label:'WCCA 误差区间',value:`[±${rss.toFixed(2)}%, ±${extreme.toFixed(2)}%]`,note:'CALCULATED · 真实值落在区间内；硬安全门限必看 Extreme',tag:'CALCULATED'});

      if (finite(rho) && rho >= 0 && rho <= 1) {
        // 精确相关性合成式：Var = Σσᵢ² + ρ·((Σ|σᵢ|)² − Σσᵢ²)
        const rssCorr = Math.sqrt(sumSq + rho * (sumAbs * sumAbs - sumSq));
        metrics.push({
          label:'相关性修正误差限 (精确二次型)',
          value:`±${rssCorr.toFixed(2)}%`,
          note:`CALCULATED · ρ=${rho} 精确合成；单一标量仅作敏感性扫描，硬安全门限严禁用非1相关系数直接放行`,
          tag:'CALCULATED',
        });
      }

      // 系统性漂移 (同号偏置线性累加) vs 随机离散项分离
      const systematicKeys = ['tempDriftBudgetPct', 'agingDriftBudgetPct'];
      const randomKeys = ['shuntTolerancePct', 'afeOffsetBudgetPct', 'adcRefDriftBudgetPct'];
      const systematicTerms = systematicKeys.map(n).filter(finite);
      const randomTerms = randomKeys.map(n).filter(finite);
      if (systematicTerms.length > 0 && randomTerms.length > 0) {
        const sysBias = systematicTerms.reduce((a, b) => a + Math.abs(b), 0);
        const randSq = randomTerms.reduce((a, b) => a + b * b, 0);
        const randAbs = randomTerms.reduce((a, b) => a + Math.abs(b), 0);
        const randRss = Math.sqrt(randSq);
        const randCorr = finite(rho) && rho >= 0 && rho <= 1
          ? Math.sqrt(randSq + rho * (randAbs * randAbs - randSq))
          : randRss;
        const totalTripartite = sysBias + randCorr;
        metrics.push({
          label: '三段式综合误差限 (|ΣBias| + σ_rand)',
          value: `±${totalTripartite.toFixed(2)}%`,
          note: 'CALCULATED · 温漂/老化偏置线性累加 + 随机项合成，避免将同号系统性偏置错误平摊到RSS',
          tag: 'CALCULATED',
        });
      }
    }
    const mean=n('sampleMeanPct'), sigma=n('sampleSigmaPct');
    if (finite(mean)&&finite(sigma)&&finite(lim)&&sigma>0) {
      const cpk=Math.min((lim-mean)/(3*sigma),(lim+mean)/(3*sigma));
      metrics.push({label:'全样本制程能力 Ppk (常称Cpk)',value:cpk.toFixed(2),note:'CALCULATED · 基于全样本均值/σ；对称规格；小样本存在置信区间离散',tag:'CALCULATED'});
    }
    if (finite(raw)) metrics.push({label:'初始误差',value:`${raw}%`,note:noteFor('accuracyErrorPct'),tag:tagFor('accuracyErrorPct')});
    if (finite(hot)) metrics.push({label:'高温误差',value:`${hot}%`,note:noteFor('accuracyErrorHotPct'),tag:tagFor('accuracyErrorHotPct')});
    if (finite(residual)) metrics.push({label:'标定残余',value:`${residual}%`,note:noteFor('calibrationResidualPct'),tag:tagFor('calibrationResidualPct')});
    if (finite(hot)&&finite(lim)) metrics.push({label:'高温裕量',value:`${(lim-hot).toFixed(2)}%`,note:'Spec - hot error',tag:'CALCULATED'});
  } else if (d === 'THERMAL') {
    const tj=n('junctionTempC'), ta=n('ambientTempC'), lim=n('tjLimitC');
    if (finite(tj)&&finite(ta)) metrics.push({label:'ΔTj-Ta',value:`${(tj-ta).toFixed(1)} ℃`,note:'CALCULATED',tag:'CALCULATED'});
    if (finite(tj)&&finite(lim)) metrics.push({label:'Tj裕量',value:`${(lim-tj).toFixed(1)} ℃`,note:'Tj_limit - Tj',tag:'CALCULATED'});
  } else if (d === 'COMPONENT') {
    const qg=n('qgNc'), qgd=n('qgdNc'), soa=n('soaMarginPct');
    if (finite(qg)&&finite(qgd)&&qg>0) metrics.push({label:'Qgd/Qg',value:`${(qgd/qg*100).toFixed(1)}%`,note:'米勒电荷占比',tag:'CALCULATED'});
    if (finite(soa)) metrics.push({label:'SOA裕量',value:`${soa}%`,note:noteFor('soaMarginPct'),tag:tagFor('soaMarginPct')});
  } else if (d === 'POWER_TRANSIENT') {
    const peak=n('pulseEcuBusPeakV'), min=n('pulseEcuBusMinV'), pulse=n('pulseVoltageV');
    if (finite(pulse)) metrics.push({label:'脉冲源端',value:`${pulse} V`,note:noteFor('pulseVoltageV'),tag:tagFor('pulseVoltageV')});
    if (finite(peak)) metrics.push({label:'ECU端峰值',value:`${peak} V`,note:noteFor('pulseEcuBusPeakV'),tag:tagFor('pulseEcuBusPeakV')});
    if (finite(min)) metrics.push({label:'ECU端最低',value:`${min} V`,note:noteFor('pulseEcuBusMinV'),tag:tagFor('pulseEcuBusMinV')});
  } else if (d === 'SIGNAL') {
    const os=n('overshootPct'), er=n('frameErrorRate');
    if (finite(os)) metrics.push({label:'过冲',value:`${os}%`,note:noteFor('overshootPct'),tag:tagFor('overshootPct')});
    if (finite(er)) metrics.push({label:'错误帧率',value:String(er),note:noteFor('frameErrorRate'),tag:tagFor('frameErrorRate')});
  }
  metrics.push({label:'节点剩余',value:`${context.daysRemaining} 天`,note:'项目上下文',tag:'SPEC'});
  return metrics;
}
