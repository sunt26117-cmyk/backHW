import { IssueInput, ProjectContext } from '../types';
import { resolveEngineeringDomain, resolveEngineeringDomains, EngineeringDomain } from './scenarioDomainEngine';

export interface DomainAdaptiveGuidance {
  domain: EngineeringDomain;
  title: string;
  physicsFormulas: string;
  componentSpecs: string;
  testProtocol: string;
  crossDisciplinaryImpact: string;
  prohibitedVagueness: string[];
}

/**
 * 根据输入的工况与实测问题，自适应匹配顶尖车规硬件 Chief Engineer 的专属专业约束与推演指导
 */
export function getDomainAdaptivePromptGuidance(
  issue: IssueInput,
  context: ProjectContext,
  forcedDomain?: EngineeringDomain
): DomainAdaptiveGuidance {
  const domain = forcedDomain || resolveEngineeringDomain(issue);

  switch (domain) {
    case 'EMC_RE_CE':
      return {
        domain: 'EMC_RE_CE',
        title: '车规 EMC 辐射发射 (RE) / 传导骚扰 (CE) [CISPR 25 Class 5]',
        physicsFormulas: `
- 共模电流辐射强度公式: E_cm = 1.26e-7 * (f * I_cm * L_cable) / d [μV/m] (线缆共模电流是辐射超标的头号源头)
- 差模环路辐射强度公式: E_dm = 1.316e-14 * (f^2 * I_dm * A_loop) / d [μV/m] (A_loop 为高频脉动电流回路面积)
- π型低通滤波器截止频率: f_c = 1 / (2 * π * sqrt(L_filter * C_eff)) (需使 f_c 低于骚扰基频至少 1 个十倍程，衰减斜率 -40dB/dec)
- 开关频率展频调制 (SSCG) 衰减增益: ΔA_dB ≈ 10 * log10(f_mod / Δf_dev) (通常可带来 6~12dB 峰值压降)
- 磁珠阻抗匹配原则: 必须使磁珠的峰值阻抗频率点 f_res 准确对齐超标频段，且在 DC 偏置工作电流下核算阻抗衰减曲线
        `.trim(),
        componentSpecs: `
- 滤波电感: 必须指明感量 (如 2.2μH ~ 10μH)、额定饱和电流 Isat (需高于峰值电流 30%)、自谐振频率 SRF (> 200MHz)，如 Coilcraft XAL 系列或 TDK SPM 系列；
- 铁氧体磁珠: 必须指定封装与高频阻抗 (如 120Ω @ 100MHz / 0805 或 1206，DC 阻抗 DCR < 25mΩ)，如 Murata BLM21PG 系列或 TDK MPZ 系列；
- 去耦与穿心滤波电容: 明确材质与耐压 (如 100nF + 10nF 50V X7R 0402/0603，高频谐振点分别对应 100MHz 和 300MHz 附近)，并联构成宽带低阻抗地路径；
- 共模扼流圈 (CMC): 标称共模阻抗 (如 500Ω ~ 1000Ω @ 100MHz，差模漏感需在可控范围内)，如 TDK ACT45B 系列。
        `.trim(),
        testProtocol: `
- 实验仪器: 依据 CISPR 25 标准的电波暗室 (ALSE) + EMI 接收机 (带峰值 Peak、准峰值 QP、平均值 Average 检波器) + 人工电源网络 (LISN 5μH / 50Ω)；
- 测点与配置: 接收天线（150kHz~30MHz 杆状天线 / 30MHz~200MHz 双锥天线 / 200MHz~1GHz 对数周期天线），水平/垂直双向极化扫描，测试距离 1.0m；
- 诊断手段: 使用高频近场磁场探头 (H-field probe) 沿 DC/DC 开关电感、MOSFET 桥臂、接插件 pin 口进行表面近场泄漏定位；
- 合格判据: 所有超标频段在代表性线束与真实负载下，峰值与平均值均需留有 ≥ 6dB 工程裕量 (Margin)。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件协同: 确认能否通过底层 MCU 寄存器开启主控开关时钟展频 (SSCG, ±2.5% 调制深度)，或修改 PWM 开关频率将谐波避开敏感无线电广播/通讯频段；
- 结构协同: 评估壳体搭铁阻抗 (要求 ECU 外壳到整车车身接地电阻 < 2mΩ)，屏蔽罩卡扣接触阻抗；
- PM 汇报: 改版 PCB 调整地回路通常需 20 天，若工期仅剩少于 14 天，优先通过线束磁环套管或贴片原位加大磁珠阻抗 + 软件展频联合闭环。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“加滤波电容/加磁珠”，必须写清容值、感量、封装及在超标频段的阻抗；',
          '严禁忽视 DC 偏置下的磁珠阻抗跌落事实；',
          '严禁在交付时间不足 14 天时直接建议 PCB 重新打样改版而未设工期一票否决。',
        ],
      };

    case 'EMC_BCI':
      return {
        domain: 'EMC_BCI',
        title: '车规 EMC 大电流注入 (BCI) / 抗扰度 [ISO 11452-4]',
        physicsFormulas: `
- 共模阻抗传递函数: Z_cm(f) = V_cm(f) / I_inj(f) (注入电流转换成内部敏感节点共模电压扰动)
- 采样敏感度响应比: S(f) = ΔV_sample_error / I_inj [mV/mA]
- 共模转差模不平衡度: Longitudinal Conversion Loss LCL = 20 * log10(V_cm / V_dm) (差分走线对称性被破坏时共模直接转差模噪声)
- 滤波吸收衰减: 针对敏感频点 (如 20MHz~80MHz)，RC 滤波截止频率 f_c 需压至扰动频段以下至少 1 个倍频程
        `.trim(),
        componentSpecs: `
- 共模扼流圈: 选用高阻抗磁芯共模电感 (如 1mH ~ 2.2mH，耐流满足整机最大工况)，在 1~100MHz 宽频带维持高共模插入损耗；
- 端口滤波电容: 1nF ~ 10nF 100V X7R 0603，严格对称布置于连接器入口正负端对地 (PGND)；
- TVS/双向钳位: 结电容 Cj < 15pF (若为通讯口) 或低动态内阻稳压管，防止注入大电流造成器件过压雪崩。
        `.trim(),
        testProtocol: `
- 仪器设备: 依据 ISO 11452-4 校准夹具 + 宽频带大功率功放 (100kHz~400MHz) + 注入电流钳 (FCC F-120-9A) + 监测探头；
- 测试方法: 替代法 (Substitution method) 或闭环法 (Closed-loop method)，注入电流 100mA / 200mA (Level IV)；
- 监测点: 实时通过 CAN-FD 报文回传、模拟量采样反馈及示波器光纤隔离探头抓取敏感节点（如运算放大器输入同相/反相端、ADC 采样引脚）；
- 合格判据: 注入等级达标期间 Class A（无任何误动作、无报文丢帧、模拟量偏差在规格公差内）。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件协同: 引入数字滤波加权移动平均滤波算法 (Moving Average) 或滑动中值滤波，软件层容忍单次异常跳变并延长容错确认时间 (debounce filter > 20ms)；
- 系统协同: 线束双绞节距由 20mm 缩密至 10mm 以提升差分对称性与抗感应能力。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“提高抗干扰能力”，必须指明敏感频点与注入电流强度；',
          '严禁忽视运放输入级内部寄生二极管对高频 RF 信号的整流检波效应 (RF Rectification)。',
        ],
      };

    case 'EMC_ESD':
      return {
        domain: 'EMC_ESD',
        title: '车规静电放电 (ESD) 防护 [ISO 10605 / IEC 61000-4-2]',
        physicsFormulas: `
- 放电瞬态电流峰值: I_peak ≈ 3.75 A/kV (在 330pF/2kΩ 或 150pF/330Ω 车规模型下，15kV 放电瞬态电流高达 56A)
- 第一峰上升时间: t_r = 0.7 ~ 1.0 ns (极高 di/dt 瞬态感抗 V = L * di/dt 产生数十伏瞬态感应电位差)
- 残压钳位公式: V_clamp_effective = V_clamp_tvs + L_trace * (di/dt) + I_peak * R_dyn
- 动态导通电阻: R_dyn = ΔV_clamp / ΔI_tvs (必须追求 mΩ 级别超低动态阻抗)
        `.trim(),
        componentSpecs: `
- 汽车级双向 ESD 保护器件: AEC-Q101 认证，击穿电压 Vbr (根据信号电平选 5V/12V/24V)，极低结电容 (高速信号口 Cj < 0.5pF，如 Nexperia PESD 系列 / Infineon ESD 系列)；
- 钳位能力: 8/20μs 脉冲峰值电流 Ipp ≥ 30A，TLP (传输线脉冲) 50A 测试下残压 < 25V；
- 串联限流电阻: 10Ω ~ 47Ω 0603 抗浪涌厚膜电阻，串接在 TVS 与敏感芯片引脚之间形成二次分压吸收拓扑。
        `.trim(),
        testProtocol: `
- 放电枪配置: 依据 ISO 10605 标准，接触放电 ±8kV，空气放电 ±15kV / ±25kV，放电间隔 1s，正负极性各 10 次；
- 放电点位: 外露金属外壳、连接器全部 Pin 脚、开关按键、线束端子；
- 示波器抓取: 使用 2GHz 以上高带宽示波器配合专用 ESD 靶衰减器 (ESD Target) 校准放电脉冲，监测内部 VCC/Reset/MCU 供电轨是否有反弹尖峰；
- 合格判据: Class A (放电中及放电后无复位、无锁死、电气参数无击穿漏电流退化)。
        `.trim(),
        crossDisciplinaryImpact: `
- 生产工艺: 产线防静电手环与工作台接地接地电阻点检；
- Layout 约束: ESD 器件必须紧贴连接器引脚放置，严禁打过孔，走线从 TVS 焊盘穿过后再进入系统内部 (Zero Stub 准则)。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“加 ESD 管”，必须写明器件动态内阻 Rdyn、结电容及 TLP 钳位残压；',
          '严禁忽略 TVS 地引脚到外壳大地的回路寄生电感。',
        ],
      };

    case 'SIGNAL':
      return {
        domain: 'SIGNAL',
        title: '高速信号完整性 (SI) 与车规车载通信 [CAN-FD / 100BASE-T1 / SPI]',
        physicsFormulas: `
- 传输线特征阻抗: Z_0 = sqrt(L_per_length / C_per_length) (微带线或差分走线必须保证连续性)
- 反射系数: Γ = (Z_L - Z_0) / (Z_L + Z_0) (阻抗失配会导致末端严重过冲与振铃)
- 单位间隔眼图裕量: Eye_width_margin = UI - T_jitter_pp - T_skew - T_setup/hold (CAN-FD 5Mbps 下 UI = 200ns)
- 差分对走线延迟匹配: Δt_skew = |t_delay_p - t_delay_n| ≤ 0.05 * UI (严格等长，控制在 10mil 以内)
- 分裂终端低通滤波频率: f_split = 1 / (2 * π * (R_term/2) * C_split) (R_term = 2x 60Ω, C_split = 4.7nF)
        `.trim(),
        componentSpecs: `
- 车规 CAN 收发器: 支持 CAN-FD 5Mbps (如 NXP TJA1051TK/3 或 TI TCAN1042-Q1)，具有对称显性/隐性转换延时；
- 差分共模电感 (CMC): 51μH 或 100μH @ 100kHz，车规级双线并绕 (如 TDK ACT45B-510-2P)，杂散差模电感 < 1μH；
- 终端匹配电阻: 2x 60.4Ω 1% 0805 低温漂金属薄膜电阻，耐脉冲功率；
- 中点电容: 4.7nF 50V X7R 0603，为高频共模噪声提供对地泄放回路。
        `.trim(),
        testProtocol: `
- 仪器设备: 带宽 ≥ 1GHz 示波器 + 差分探头 (输入电容 < 1pF) + CAN 网络报文分析仪 (如 Vector CANoe / VN1630)；
- 测点位置: ECU 连接器插头处 CAN_H、CAN_L 极间及收发器 RXD/TXD 引脚；
- 测试工况: 最短线束 (0.5m) 与最长线束 (15m)、单节点与满挂多节点 (如 8~16 节点)、极限高低温 (-40℃ ~ +105℃)；
- 关键指标: 隐性电平共模振铃幅值 (≤ 500mV)、显性差分电压 (1.5V ~ 3.0V)、位时间容差及总线错误帧计数 (Error Frame = 0)。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件配置: 优化 CAN 控制器位时序寄存器配置，微调采样点位置 (Sample Point 从 80% 调整为 75% 或 70%) 以避开传输线反射振铃区；
- 硬件规避: 严禁软件直接降速到 500kbps 传统 CAN 作为永久方案，必须彻底解决物理层硬件阻抗匹配。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“调整电阻/优化走线”，必须给出准确差分阻抗目标 (如 120Ω ± 10%)；',
          '严禁忽视连接器插针引起的阻抗不连续下陷 (Impedance Discontinuity Dip)。',
        ],
      };

    case 'WCCA':
    case 'WCCA_EOL':
      return {
        domain: 'WCCA',
        title: '车规最坏情况容差分析 (WCCA) / 传感器采样全温全生命周期精度',
        physicsFormulas: `
- 极值分析法 (Extreme Value Analysis EVA): Y_worst = f(X_i_nom ± ΔX_i_tol) (所有误差按同向最劣方向叠加，属于刚性门限准则)
- 均方根容差法 (Root-Sum-Square RSS): ΔY_RSS = sqrt( Σ ( (∂f/∂X_i * ΔX_i)^2 ) ) (针对统计独立随机分布)
- 全温漂移公式: ΔX_temp = X_nom * α_ppm * (T_max - T_nom) * 1e-6 (跨越 -40℃ ~ +125℃ 温区)
- EOL 寿命老化漂移: ΔX_aging (10 年 / 15 年 mission profile 下通常取 0.5% ~ 1.5% 经验加成)
- ADC 综合量化与器件误差: TUE = sqrt( INL^2 + DNL^2 + Offset^2 + Gain_err^2 + Vref_drift^2 )
        `.trim(),
        componentSpecs: `
- 采样分流电阻 (Shunt): 毫欧级开尔文 4 引脚贴片 (如 1mΩ ~ 10mΩ / 2512 或 3920 封装)，超低温漂 TCR < 15 ppm/℃ (如 Isabellenhütte 或 Vishay WSLP 系列)；
- 采样运算放大器: 零漂移斩波自稳零运放 (Chopper Zero-Drift, 如 TI INA240-Q1 或 ADI AD8418A)，失调电压 Vos < 25μV，失调温漂 dVos/dT < 0.1μV/℃，高共模抑制比 CMRR > 110dB；
- 基准电压源 (Vref): 低温漂车规基准源 (如 50 ppm/℃ 或 20 ppm/℃)，滤波电容采用低漏电 COG/NP0 或高质量 X7R。
        `.trim(),
        testProtocol: `
- 测试平台: 高低温环境试验箱 (-40℃, 25℃, 105℃, 125℃) + 6位半高精度数字万用表 (Keysight 34465A) + 精密可编程直流恒流负载；
- 测试样本: 抽取跨批次样件至少 N ≥ 30 pcs 进行初始精度分布标定，计算 Cpk 与正态分布分布参数；
- 验证手段: 注入阶跃电流，全温全电压工况下对比理论 EVA 边界与实际采样输出；
- 合格判据: 全温与老化包络线内的总残余误差必须稳定收敛于客户给定的规格限以内 (如 ≤ ±2.0%)。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件校准: 评估是否可在 EOL (End-of-Line) 产线测试环节注入单点零点与增益标定，将校准系数烧录入 EEPROM/Data Flash，消除初始元器件公差；
- 算法配合: 增加板载 NTC 温度补偿算法，实时查表补偿电阻温度漂移；
- 商务采购: 若现有 100ppm/℃ 采样电阻无法满足，给出更换为 15ppm/℃ 方案所带来的单板 BOM 增量成本 (如 +$0.18)。
        `.trim(),
        prohibitedVagueness: [
          '严禁将全温、老化、批次公差强行简单假设为正态分布而随意除以 3 (误用 3-sigma 覆盖绝对最坏工况)；',
          '严禁不写出运放 Vos、CMRR、PSRR 及分压网络对总精度的灵敏度矩阵 (Sensitivity Matrix)。',
        ],
      };

    case 'THERMAL':
      return {
        domain: 'THERMAL',
        title: '车规热设计极限 / 瞬态热阻网络 / 结温降额 [ISO 16750-4]',
        physicsFormulas: `
- 稳态结温计算公式: T_j = T_a + P_total * R_θJA (或 T_j = T_c + P_total * R_θJC)
- MOSFET 导通损耗: P_cond = I_rms^2 * R_DS(on)(T_j) (注意: 150℃ 时 R_DS(on) 约为 25℃ 时的 1.7 ~ 2.0 倍，必须迭代计算防止热失控)
- 开关损耗: P_sw = 0.5 * V_in * I_out * (t_rise + t_fall) * f_sw
- 瞬态热响应: T_j(t) = T_a + P_pulse * Z_θJC(t) (单脉冲大电流下必须查器件瞬态热阻曲线 Z_θ)
- 降额裕量判定: Margin_thermal = T_j_max_derated - T_j_measured (车规 AEC-Q 通常要求实测 T_j 距离 175℃ 至少保留 25℃~30℃ 裕量)
        `.trim(),
        componentSpecs: `
- 功率管热阻封装: 优先选用底部大裸焊盘封装 (如 Toll, D2PAK-7, 或 DirectFET)，封装热阻 R_θJC < 0.5 ℃/W；
- 导热界面材料 (TIM): 导热绝缘垫片或导热结构胶，导热系数 k ≥ 3.0 ~ 5.0 W/m·K，厚度受控在 0.5mm ~ 1.0mm，装配压缩率 20%~30%；
- PCB 散热铜箔与过孔: 功率管焊盘下方必须布置高密度散热过孔阵列 (Thermal Vias, 孔径 0.3mm，孔距 0.8mm，孔壁电镀铜厚 ≥ 25μm)，内层采用 2oz 重铜铺铜。
        `.trim(),
        testProtocol: `
- 测试装备: 密闭防爆环境试验箱 (温箱温度设定为整车极限舱温 +85℃ 或 +105℃) + 多通道热电偶记录仪 (K型细丝热电偶点焊于器件管壳焊接裸露引脚) + 红外热像仪 (需喷涂哑光漆校准发射率 ε = 0.95)；
- 稳态判定: 连续满载运行 ≥ 2 小时，当连续 15 分钟内温升斜率 < 0.2 ℃/10min 时方可判定达到热稳态；
- 极限工况: 堵转工况、低速大扭矩工况、输入高压上限跳变工况；
- 合格判据: 稳态实测换算结温 T_j ≤ 125℃ (降额标准)，瞬态峰值 T_j ≤ 150℃，TIM 材料无开裂或泵出效应 (Pump-out)。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件热保护: 设置多级软件降额策略 (如 T_pcb ≥ 95℃ 开启 80% 功率降额，T_pcb ≥ 110℃ 降为 50%，T_pcb ≥ 120℃ 停机保护)；
- 结构设计: 强化外壳散热筋翅片面积与导热凸台平面度公差 (平面度 ≤ 0.1mm，无毛刺)；
- 交付与成本: 加厚外壳和提高 TIM 等级会增加整机成本，若工期紧急，优先结合软件动态限流策略闭环。
        `.trim(),
        prohibitedVagueness: [
          '严禁将外壳表面温度 (T_case) 直接当做芯片内部半导体结温 (T_junction)；',
          '严禁忽略高温工况下半导体导通内阻的温度正反馈 (Thermal Positive Feedback Runaway)。',
        ],
      };

    case 'POWER_TRANSIENT':
      return {
        domain: 'POWER_TRANSIENT',
        title: '汽车电源瞬态过压与抛负载 [ISO 7637-2 / ISO 16750-2]',
        physicsFormulas: `
- 脉冲能量计算: E_pulse = ∫ (v(t) * i(t)) dt
- 抛负载瞬态 (ISO 16750-2 Pulse 5b): 集中式发电机抛负载脉冲峰值可达 +35V (针对 12V 乘用车) 或 +58V (针对 24V 商用车)，脉宽持续 40ms ~ 400ms，内阻 Ri = 0.5Ω ~ 4Ω
- 寄生回路线感尖峰: V_spike = L_loop * (di/dt) (瞬态大电流切断时产生的感应反电势)
- TVS 吸收功率核算: P_pp = V_clamp * I_peak (必须在持续脉宽下校验 TVS 额定能量承载能力，防止过热熔穿短路)
        `.trim(),
        componentSpecs: `
- 主电源防抛负载 TVS: 车规级高能量 TVS (如 Vishay SM8S 系列或 Littelfuse SLD 系列)，DO-218AB 封装，额定峰值脉冲功率 6600W (10/1000μs)，反向关断电压 Vrwm (12V 系统选 24V~28V，24V 系统选 36V)；
- 防反接保护: 理想二极管控制器 (如 TI LM5069 / LM74700-Q1) 配套背靠背 N-MOSFET，替代传统低效肖特基二极管；
- 储能与抗脉冲电解电容: 选用 63V / 100V 耐压高可靠性车载级固态铝电解或车规液体电解 (如 Nichicon / Rubycon，保证 125℃ 3000h 寿命)。
        `.trim(),
        testProtocol: `
- 仪器平台: 车载瞬态干扰模拟发生器 (如 EM TEST UCS 200N / AutoWave) + 示波器高压隔离探头；
- 试验用例: ISO 7637-2 脉冲 1 (-100V, 2ms)、脉冲 2a (+37V, 50μs)、脉冲 3a/3b (±150V, 100ns 脉冲串)；ISO 16750-2 脉冲 5b 抛负载；
- 监测目标: 测量 TVS 前端输入端与后端电源母线实际钳位残压波形，检查是否有器件雪崩、供电芯片下电复位；
- 合格判据: 满足 Status A (试验中及试验后功能均正常) 或 Status B (试验中瞬态功能降级但自动无损恢复)。
        `.trim(),
        crossDisciplinaryImpact: `
- 系统架构: 与整车厂电气工程师确认发电机是否有集中钳位功能 (Pulse 5a 还是 Pulse 5b)，核对源阻抗 Ri；
- 硬件防护: 严格区分整车蓄电池输入母线与 ECU 内部敏感 5V/3.3V/1.2V 核心供电轨。
        `.trim(),
        prohibitedVagueness: [
          '严禁混淆 Pulse 5a (未抑制高压可达 87V~100V) 与 Pulse 5b (抑制型 35V)，导致 TVS 功率选型严重不符；',
          '严禁不给出具体的 TVS 封装与脉冲功率承受瓦数。',
        ],
      };

    case 'COMPONENT':
      return {
        domain: 'COMPONENT',
        title: '车规元器件替代 / 停产与变更 [AEC-Q100 / AEC-Q101 / PCN / PPAP]',
        physicsFormulas: `
- Spec-to-Spec 关键电气参数匹配度: 严格核对耐压 Vds、稳态阻抗 Rds(on)、动态栅极电荷 Qg、栅漏反向传输电荷 Qgd 及输出电容 Coss
- 体二极管反向恢复电荷与时间: Qrr / trr (若替代料 Qrr 偏大，在桥臂高速换相时会导致对管产生致命的倍增开通瞬态损耗与严重高频辐射)
- 雪崩单脉冲耐受能量: Eas = 0.5 * L * I_AS^2 * (V_BR / (V_BR - V_DD))
- 安全工作区 (SOA): 在 10μs / 100μs / 1ms 瞬态大脉冲电流下核查 Vds-Id 曲线，确保处于 SOA 边界安全线以下
        `.trim(),
        componentSpecs: `
- 汽车级认证要求: 必须具备第三方 AEC-Q101 (分立器件) 或 AEC-Q100 (IC) Grade 1 (-40℃ ~ +125℃) 报告；
- 封装 Pin-to-Pin 匹配: 检查焊盘物理尺寸 (Footprint)、引脚公差、裸焊盘热阻与蠕变爬电距离 (Creepage and Clearance)；
- 供应链成熟度: 供应商必须承诺车规产品供货周期 ≥ 10 年，且提供正式变更说明 (PCN) 与完整的 PPAP Level 3 文件包。
        `.trim(),
        testProtocol: `
- 对比试验 (A/B Bench Testing): 相同测试台架同板原位替换，对比满载温升 (ΔT)、开关损耗 (Eon/Eoff)、门极驱动振铃 (Vgs ringing)；
- EMC 摸底对比: 原位更换后必须跑一次辐射发射与传导发射复测，确认高频开关谐波是否恶化超标；
- 可靠性验证: 高温栅极偏置 (HTGB)、高温反偏 (HTRB) 及温度循环实验数据核验；
- 合格判据: 电气与热指标达到或优于原设计，EMC 限值留有充分裕量，满足整车厂零件变更批准准则。
        `.trim(),
        crossDisciplinaryImpact: `
- 采购商务: 核实新料采购前置周期 (Lead Time) 与批量采购单价 (BOM Delta)；
- 质量体系: 启动工程变更请求 (ECR) 与整车厂客户 PPAP 会签放行，严禁私自未经批准偷换器件；
- 进度管控: 若替代料需要重新改版 PCB，严格与当前交付节点剩余天数对标。
        `.trim(),
        prohibitedVagueness: [
          '严禁仅凭“Pin-to-Pin 封装一样”就宣称可以免试直接替代；',
          '严禁忽视体二极管反向恢复特性 (Qrr/trr) 对半桥开关损耗与 EMI 的剧烈破坏作用。',
        ],
      };

    case 'SAFETY':
      return {
        domain: 'SAFETY',
        title: '车规功能安全 (Functional Safety) [ISO 26262 ASIL-B / ASIL-D]',
        physicsFormulas: `
- 故障容忍时间间隔: FTTI (Fault Tolerant Time Interval) ≥ T_detection + T_reaction + T_transition_to_safe_state (通常为 20ms ~ 100ms)
- 单点故障度量 (SPFM): ASIL B 要求 ≥ 90%，ASIL C 要求 ≥ 97%，ASIL D 要求 ≥ 99%
- 潜在故障度量 (LFM): ASIL B 要求 ≥ 60%，ASIL C 要求 ≥ 70%，ASIL D 要求 ≥ 90%
- 随机硬件失效率: PMHF (Probabilistic Metric for random Hardware Failures) ASIL B < 100 FIT，ASIL D < 10 FIT
        `.trim(),
        componentSpecs: `
- 功能安全基础芯片 (Safety SBC): 具备硬件看门狗 (Window Watchdog)、过压/欠压/过流全独立监控、安全状态输出引脚 (Safe State Output)；
- 冗余供电与采样隔离: 关键传感器供电采用独立低压降稳压器 (LDO) 并具有短路保护，主控与备用监控核独立时钟源；
- 阻燃与被动安全器件: 电阻电容采用防电弧开路设计，保险丝符合 AEC-Q200 汽车级过流切断特性。
        `.trim(),
        testProtocol: `
- 故障注入试验 (Fault Injection Testing): 针对电路引脚实施 Pin 开路 (Open)、邻脚短路 (Short to adjacent pin)、对地短路 (Short to GND)、对电源短路 (Short to VDD)；
- 示波器抓取时序: 触发故障后，通道 1 捕捉注入故障信号，通道 2 捕捉安全中断/关断信号，通道 3 捕捉执行机构断电波形，精确测量从注入到完全进入安全状态的耗时 (必须严格 < FTTI)；
- 安全状态确认: 确认发生故障后系统处于可控状态 (如电机自由停机、进入降级应急运行或点亮故障灯)；
- 合格判据: 故障在 FTTI 时间窗口内 100% 被捕获，无任何危险失控行为。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件架构: 编写安全机制诊断处理程序 (Safety Mechanism)，配合硬件定时喂狗与 RAM/ROM 自检；
- 系统工程师: 协同更新安全概念 (FSC) 与技术安全要求 (TSR)；
- 汇报红线: 若硬件修改导致原功能安全诊断时序破坏，必须立即启动 Safety Manager 联合评审。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“有安全保护”，必须明确指出具体的安全目标 (Safety Goal)、安全状态及 FTTI 预算数值；',
          '严禁把非独立共因失效 (Common Cause Failure) 当作双冗余安全设计。',
        ],
      };

    case 'DFM':
    case 'PRODUCTION':
      return {
        domain: 'DFM',
        title: '车规 PCBA 可制造性 (DFM) 与量产制程能力 [IPC-A-610G Class 3 / IATF 16949]',
        physicsFormulas: `
- 制程能力指数: Cpk = min( (USL - μ) / (3*σ), (μ - LSL) / (3*σ) ) (车规关键特性 CTQ 要求 Cpk ≥ 1.33，严苛项目要求 Cpk ≥ 1.67)
- 焊盘面积比 (Area Ratio): AR = Area_aperture / Area_walls ≥ 0.66 (确保锡膏下锡顺畅，防止少锡虚焊)
- 焊盘纵横比 (Aspect Ratio): W / T ≥ 1.5
- 潮湿敏感度与烘烤: MSL 3 级器件在温度 ≤ 30℃ / 湿度 ≤ 60%RH 下车间寿命 (Floor Life) 为 168 小时，超期必须进行 125℃ 48h 烘烤
        `.trim(),
        componentSpecs: `
- 焊盘封装设计: 符合 IPC-7351 规范，0402 及以下阻容必须严格对称设计阻焊桥与热平衡走线，防止表面张力失衡导致立碑 (Tombstoning)；
- BGA/QFN 焊接要求: QFN 底部散热焊盘设计开窗网格 (Window-pane stencil)，防止焊料回流气体排不出导致空洞率 (Void rate > 15% 报警)；
- 测点布置: 关键电源、总线、控制节点必须布置 ICT 测试点 (Testpoint 直径 ≥ 0.8mm，间距 ≥ 1.27mm)，禁止打在元器件引脚或过孔上。
        `.trim(),
        testProtocol: `
- 生产在线测试: 飞针/针床在线测试 (ICT) + 自动光学检查 (AOI) + 3D X-Ray 检查 (用于 BGA/QFN 空洞率及虚焊检测)；
- 物理切片与微裂纹检查: 对热冲击实验后的焊点进行金相切片分析 (Cross-sectioning)，检查 IMC 金属间化合物厚度 (正常为 1~4μm)；
- EOL 终检数据统计: 连续 3 批次统计参数分布直方图，排查双峰分布或异常离群值 (Outliers)；
- 合格判据: 焊点外观满足 IPC-A-610G 汽车 Class 3 级别，BGA/QFN 焊点空洞率 ≤ 15%，批次一次通过率 FPY ≥ 99.5%。
        `.trim(),
        crossDisciplinaryImpact: `
- 制造工艺工程师 (ME): 调整回流焊温区曲线 (TAL 60~90s，峰值温度 240~245℃，降温斜率 < 3℃/s 防止热冲击碎裂)；
- 质量管理: 锁定异常批次与追溯条码 (2D DataMatrix barcode)，隔离潜在风险物料；
- 成本控制: 优化测试点与拼板利用率 (V-Cut / 邮票孔)，减少治具返修成本。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“注意焊接质量”，必须给出空洞率指标、Cpk 数值及焊膏钢网厚度建议；',
          '严禁忽略汽车级严苛振动下的焊点机械疲劳寿命。',
        ],
      };

    // === 以下 ROBOT_JOINT 分支为合并两份修改时补充：backHW-main 分支原本没有这个 case
    // （因为 domainAdaptivePromptEngine.ts 只存在于 backHW-main），
    // SeniorEng-v1.6-RobotJoint-Extension 分支新增的 'Robot Joint Drive' 分类也从未接入这里，
    // 若不补上，选择该分类跑云端 AI 分析时会静默落到下面的 BLDC 默认分支。
    // 内容改写自 scenarioDomainEngine.ts 中已有的 ROBOT_JOINT 领域画像（formulas/tests/knownPitfalls），
    // 未引入原始文件之外的新工程结论。
    case 'ROBOT_JOINT':
      return {
        domain: 'ROBOT_JOINT',
        title: '机器人/协作臂关节机电系统层：背隙 / 编码器 / 谐振 / 力矩闭环 / STO / 总线周期',
        physicsFormulas: `
- 输出端运动学误差: θ_output_error ≈ backlash + T_out/K_stiffness (rad→arcmin)，背隙与扭转柔性叠加
- 机械谐振频率 (二质量系统): f_res = (1/2π)·√(K_stiffness·(1/J_motor + 1/(J_load/i²)))，i=减速比
- 连续再生平均功率: P_regen_avg ≈ P_regen_peak × duty_decel，需 < 泄放电阻额定连续功率
- 力矩闭环估算: Torque_est = Kt·Iq×i×η_gearbox，η_gearbox 随温度/转速漂移直接进入力矩误差
- 总线-本地环耦合比: cycle_ratio = t_bus_cycle / t_local_position_loop，比值过大且无本地插补 → 指令台阶化
        `.trim(),
        componentSpecs: `
- 谐波/RV 减速器: 明确背隙等级 (如 ≤3arcmin 高精度级 vs ≤6arcmin 标准级) 与额定/峰值扭矩，如 Harmonic Drive CSF/SHG 系列或 Nabtesco RV 系列；
- 绝对值编码器: 明确单圈/多圈、供电冗余方式 (电池 vs 无电池多圈)，需标注后备电池最低保数据电压门限；
- 泄放(制动)电阻: 明确额定连续功率与峰值功率双指标，需按连续往复占空比而非单次峰值选型，并核算散热路径；
- STO/安全模块: 明确实现方式为纯软件 PWM 禁止还是双通道硬件断使能 (如安全 MCU + 独立驱动使能引脚)，需对应 IEC 61800-5-2 / ISO 13849-1 性能等级。
        `.trim(),
        testProtocol: `
- 背隙/定位精度: 锁定输出端，电机侧正反向缓慢加载，激光跟踪仪或高精度外部编码器实测输出空程与重复定位精度；
- 谐振/带宽: 扫频或敲击法激励关节输出端，捕捉二质量谐振峰并与速度环带宽比较，评估陷波滤波器需求；
- 力矩闭环: 同时记录电流估算力矩与外置力矩传感器读数，覆盖全温区与全速度区间做误差带标定；
- 泄放热设计: 连续往复工况下用热电偶/红外记录泄放电阻与减速器温升曲线，覆盖真实典型作业节拍（而非单次脉冲）；
- STO/安全: 故障注入验证任一 STO 通道单独失效时另一通道仍可独立断转矩，示波器实测端到端响应时间；总线侧制造丢包/断线，验证降级策略（斜坡到零/保持/急停）。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件/控制协同: 确认速度环带宽设定是否已主动避开二质量谐振峰，力矩闭环阈值是否已按减速器效率漂移做温度补偿；
- 功能安全协同: STO/SS1 通道独立性与响应时间需第三方安全评审 Sign-off，不能仅凭软件互锁经验套用车规 ASIL 思路；
- PM/产线协同: 若需更换减速器背隙等级或加装第二编码器实现全闭环，通常涉及结构改动，需与车规 PCB 改版周期分开单独评估工期。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写"背隙有点大/精度不够"，必须给出实测背隙 arcmin 数值及扭转柔性折算后的总误差；',
          '严禁把电流环估算力矩直接当作力控/碰撞检测阈值，而不核算减速器效率随温度与速度的漂移；',
          '严禁把车规 ASIL 的软件互锁经验直接套用到 STO/SS1，忽略硬件通道独立性要求；',
          '严禁只用单次脉冲峰值功率评估泄放电阻选型，而不核算连续往复占空比下的平均功率。',
        ],
      };

    case 'BLDC':
    default:
      return {
        domain: 'BLDC',
        title: '车规 BLDC 电机驱动功率级与反电势过压泵升',
        physicsFormulas: `
- 电机反电势机械动能泵升能量: E_k = 0.5 * J * ω^2 (J为转子转动惯量 kg·m²，ω为角速度 rad/s)
- 母线电容压升估算: ΔV = sqrt( V_0^2 + (2 * E_k / C_bus) ) - V_0
- 功率管关断电压尖峰: V_spike = L_loop * (di/dt) (L_loop 为 DC-Link 高频去耦回路寄生电感)
- 主动短路 (ASC) 最大短路冲击电流: I_sc_peak = (sqrt(2) * E_bemf) / sqrt( R_s^2 + (ω * L_s)^2 )
- 门极米勒直通尖峰: V_gs_induced = ( C_gd / (C_gd + C_gs) ) * ΔV_ds (当 V_gs_induced > V_th 时引发致命上下桥臂直通短路)
        `.trim(),
        componentSpecs: `
- 母线高能 TVS 吸收管: DO-218AB 封装 6600W (如 Vishay SM8S36A 或 Littelfuse SLD 系列)，反向关断电压 Vrwm (24V~36V)，单体脉冲吸收能力强；
- DC-Link 去耦电容组合: 多个 10μF 100V X7R 1210 陶瓷贴片电容紧贴 H 桥 MOS 引脚，并联大容量低 ESR 车规固态铝电解 (如 470μF 63V)；
- 功率 MOSFET: 选用低内阻车规 MOS (如 Infineon OptiMOS 5 系列或 Nexperia TrenchMOS)，Vds 耐压预留充足降额 (48V 系统推荐选 80V/100V 耐压，12V 系统推荐 40V/60V 耐压)；
- 驱动栅极电阻: 采用不对称充放电驱动网络 (开通 Rg_on = 10Ω ~ 22Ω 抑制开关 dv/dt 辐射，关断 Rg_off = 2.2Ω ~ 4.7Ω 配反向二极管强化关断抗米勒直通)。
        `.trim(),
        testProtocol: `
- 示波器抓波规范: 带宽 ≥ 500MHz 示波器 + 高压差分探头或同轴接地弹簧探头 (严禁使用长鳄鱼接地夹)；
- 测点位置: Phase-U/V/W 开关节点相对功率地 PGND、下桥 MOSFET Gate-Source 极间、母线电容两端；
- 触发配置: 单次触发 (Single Trigger)，门限设为标称供电的 115%，采样率 ≥ 2.5GS/s，时基 500ns/div ~ 2μs/div；
- 极限测试工况: 全转速极限急停 (Coast/Brake switch)、相间短路、电机堵转与高温舱内反向拖动；
- 合格判据: 母线瞬态峰值绝对禁止超过 MOSFET 额定耐压的 90% (留出 10% 安全降额)，门极关断异常正尖峰必须 < Vth_min (通常 < 1.5V)。
        `.trim(),
        crossDisciplinaryImpact: `
- 软件控制标定: 协同电机算法工程师标定全下桥 ASC (Active Short Circuit) 刹车或采用斜坡减速 (Ramp-down braking)，将制动动能转化为电机定子铜损耗，避免回灌母线；
- 硬件工期决策: PCB 改版打样需 18~25 天，若离 DV 装车仅剩不足 14 天，优先通过原位并联高能 TVS + 软件注入减速算法闭环。
        `.trim(),
        prohibitedVagueness: [
          '严禁只写“加吸收电路”，必须写出 TVS 峰值功率、击穿电压区间及具体封装料号；',
          '严禁忽视米勒电容 Cgd 引起的高速开关直通风险。',
        ],
      };
  }
}

export function getMultiDomainAdaptivePromptGuidance(issue: IssueInput, context: ProjectContext): { primary: DomainAdaptiveGuidance; related: DomainAdaptiveGuidance[]; all: DomainAdaptiveGuidance[] } {
  const domains = resolveEngineeringDomains(issue);
  const primaryDomain = resolveEngineeringDomain(issue);
  const ordered = [primaryDomain, ...domains.filter(d => d !== primaryDomain)];
  const all = ordered.map(domain => getDomainAdaptivePromptGuidance(issue, context, domain));
  return {
    primary: all[0],
    related: all.slice(1),
    all,
  };
}
