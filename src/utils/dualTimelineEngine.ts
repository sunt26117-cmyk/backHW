import { CopilotAnalysisResult, DualTimelineActionPlan, IssueInput, ProjectContext } from '../types';
import { resolveEngineeringDomain } from './scenarioDomainEngine';

/**
 * 车规硬件双层工程时间轴生成引擎 (Dual-Timeline Action Engine)
 * 严格拆分：
 * 1. T+24h 应急临时遏制 (Containment Phase)：0天板卡改版工期，快速闭环，遏制故障流出，满足节点装车与交样；
 * 2. 下一版本永久纠正 (Permanent Action Phase)：SOP 质量防错，重新投板/改模，彻底根除物理机理根因。
 */
export function buildDualTimelinePlan(
  analysis: Partial<CopilotAnalysisResult>,
  context: ProjectContext,
  issue: IssueInput
): DualTimelineActionPlan {
  // 如果分析结果中已经包含完整的 dualTimeline，则优先直接采用
  if (
    analysis?.dualTimeline?.containmentPhase?.actions?.length &&
    analysis?.dualTimeline?.permanentPhase?.actions?.length
  ) {
    return analysis.dualTimeline;
  }

  const domain = resolveEngineeringDomain(issue);
  const days = context?.daysRemaining ?? 14;
  const phase = context?.projectPhase ?? 'DV';

  switch (domain) {
    case 'EMC_RE_CE':
      return {
        containmentPhase: {
          phaseTag: 'T_PLUS_24H_CONTAINMENT',
          timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
          title: 'BOM 原位磁珠强化 + 线束共模磁扣 + 底层软件展频 (SSCG)',
          objective: '0 天板卡改版工期，立竿见影衰减高频骚扰 8~12dB，确保当前样件装车不发生无线电干扰，顺利通过当前交付节点。',
          hardwareImpact: '无需改版 PCB (0 天改版工期)，仅涉及样机外设线束夹扣与贴片原位物料替换。',
          responsibilityRole: '硬件负责人 (HW Lead) & 底层驱动工程师 (SW Lead)',
          actions: [
            {
              step: '1. 线束出口端套接高频铁氧体磁扣',
              detail: '在线束连接器输出 5cm 处加装车规分体式铁氧体共模磁扣 (如 Würth STAR-TEC 或 TDK ZCAT 系列，100MHz 阻抗 ≥ 150Ω)，就近掐死共模天线电流。',
              owner: '测试工程师 (TE)',
              duration: '2 小时',
              hardwareImpact: '外设套管，无硬件改版',
              deliverable: '改制线束样品 3 套',
            },
            {
              step: '2. 底层寄存器开启 PMIC 开关时钟展频 (SSCG)',
              detail: '通过底层 MCU 寄存器配置开启主供电芯片 ±2.5% 伪随机展频调制，将 108MHz 离散谐波尖峰打散至宽带底噪中，获得 6~10dB 峰值压降。',
              owner: '底层驱动工程师 (SW)',
              duration: '8 小时',
              hardwareImpact: '纯固件寄存器更新，零硬件成本',
              deliverable: 'SSCG 展频测试补丁固件 (V1.1-EMC-Patch)',
            },
            {
              step: '3. 电源输出滤波原位更换高频磁珠',
              detail: 'BOM 原位更换 Murata BLM21PG121SN1D 磁珠 (120Ω @ 100MHz, DCR < 25mΩ, 额定 3A)，并联 100nF + 10nF 50V X7R 0402 宽频去耦电容。',
              owner: '硬件工程师 (HW)',
              duration: '4 小时',
              hardwareImpact: '原位焊盘替换，无需打样',
              deliverable: '焊接完成样板 5 pcs',
            },
            {
              step: '4. 近场探头快速暗室扫描摸底',
              detail: '在简易电波暗室或屏蔽箱内，使用高频近场 H 探头对比改动前后 108MHz 频点辐射强度，确认抑制裕量。',
              owner: 'EMC 专职工程师',
              duration: '4 小时',
              hardwareImpact: '台架验证',
              deliverable: '《应急改制件近场 EMC 摸底对比数据表》',
            },
          ],
          verificationCriteria: '近场磁场探头扫描显示 108MHz 谐波峰值衰减 ≥ 10dB，在车机收音机 FM 频段无明显啸叫杂音。',
          exitCriteria: '取得 EMC 实验室摸底放行报告，准予装车参与当前阶段整车路试与台架功能验证。',
        },
        permanentPhase: {
          phaseTag: 'NEXT_PHASE_PERMANENT',
          timeWindow: `${phase === 'DV' ? '下一轮 C 样改版 / PV 模具样件' : '下一代硬件改版 / SOP 封样'}`,
          title: 'PCB 叠层地回路拓扑重构 + 固化车规共模扼流圈 (CMC)',
          objective: '从电磁场物理机理上消除高 di/dt 环路辐射，通过全套 CISPR 25 Class 5 正式电波暗室认证，达到量产质量放行要求。',
          hardwareImpact: '重新投板制作 PCB (需 18~25 天打样制板与贴片周期)，新增 1 颗共模扼流圈与内嵌屏蔽地层。',
          responsibilityRole: '硬件架构师 (HW Architect) & 质量经理 (QA Manager)',
          actions: [
            {
              step: '1. 原理图正式引入车规级共模扼流圈 (CMC)',
              detail: '在输入电源端口正式设计 $\\pi$ 型差模/共模两级滤波电路，选用 TDK ACT45B-510-2P (51μH) 或 Coilcraft 车规共模电感。',
              owner: '硬件架构师',
              duration: '3 天',
              hardwareImpact: '原理图版本升版至 Rev C',
              deliverable: '更新后原理图与 BOM 清单',
            },
            {
              step: '2. PCB Layout 环路面积与地平面重构',
              detail: '优化 DC/DC 开关回路，将高频脉动电流面积压减 50% 以上；开关节点下方第 2 层保证完整参考地；电源端口覆铜远离敏感高频走线。',
              owner: 'PCB Layout 工程师',
              duration: '7 天',
              hardwareImpact: '重新改版 Layout 出图投板',
              deliverable: 'Gerber 制造数据包与仿真报告',
            },
            {
              step: '3. 结构压铸铝屏蔽外壳导电搭铁固化',
              detail: '外壳接触面增加导电氧化工艺，接插件处预留导电衬垫槽，确保外壳对整车车身接地接触电阻 < 2mΩ。',
              owner: '结构工程师 (MD)',
              duration: '10 天',
              hardwareImpact: '结构模具局部修模优化',
              deliverable: '量产模具改模图与试模件',
            },
            {
              step: '4. 国家级权威电波暗室全项复测与 PPAP Level 3 归档',
              detail: '进行 CISPR 25 Class 5 辐射发射 (RE 150kHz~2.5GHz) 与传导发射 (CE) 全频段正式试验，保留至少 6.0dB 裕量。',
              owner: '质量负责人 & 硬件主管',
              duration: '5 天',
              hardwareImpact: '全套认证试验',
              deliverable: '《第三方权威 CISPR 25 Class 5 测试合格报告》及 PPAP 文件包',
            },
          ],
          verificationCriteria: '全频段无论水平还是垂直极化，峰值与平均值均留有 ≥ 6.0dB 的工程安全裕量 (Margin)。',
          exitCriteria: '主机厂签字批准 PPAP Level 3 文件，关闭工程变更单 (ECR/ECN)，准予量产 SOP。',
        },
        strategicTradeoff: `为什么必须双层时间轴协同？
距离交付节点仅剩【${days}天】。如果仅选择【永久纠正方案 (PCB 改版)】，重新投板打样、贴片调试需要至少 18~25 天，将导致当前交样里程碑直接延误并触发主机厂停线索赔；
反之，如果仅选择【临时应急围堵 (套磁环/展频)】，虽然能在 24h 内快速让样机跑起来，但外挂磁环会增加产线装配工时且无法通过主机厂正式 PPAP 审计，量产有重大质量隐患。
因此，必须以『T+24h 应急围堵保当前交付，下一版改版永久根治保量产质量』双轨闭环推进！`,
      };

    case 'SIGNAL':
      return {
        containmentPhase: {
          phaseTag: 'T_PLUS_24H_CONTAINMENT',
          timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
          title: '终端电阻改制为分裂终端 (Split Termination) + 优化采样点至 70%',
          objective: '0 天 PCB 工期，通过原位阻容改制与软件寄存器微调，消除 5Mbps 数据段共模振铃，使 CRC 错误帧降为 0。',
          hardwareImpact: '无需重新制板，仅在终端节点焊盘原位更换 2 颗电阻并飞线中点滤波电容。',
          responsibilityRole: '硬件工程师 (HW) & 通信协议栈工程师 (SW)',
          actions: [
            {
              step: '1. 终端节点原位改制分裂终端网络',
              detail: '将原单颗 120Ω 终端电阻原位拆解，替换为 2x 60.4Ω 1% 精度电阻，中心抽头通过 4.7nF 50V X7R 电容连接到参考地 PGND。',
              owner: '硬件调试工程师',
              duration: '3 小时',
              hardwareImpact: '手工改制 3 台样机，0天改版',
              deliverable: '改制终端节点样件',
            },
            {
              step: '2. CAN 控制器微调位时序采样点',
              detail: '修改 CAN 控制器时钟预分频器与时序寄存器，将 CAN-FD 5Mbps 数据段采样点由 80% 提前至 70%，完全躲开传输线反射振铃窗口。',
              owner: '底层软件工程师',
              duration: '4 小时',
              hardwareImpact: '纯配置参数更新',
              deliverable: '时序参数更新补丁',
            },
            {
              step: '3. 示波器眼图与 CANoe 报文连续抓取',
              detail: '使用高阻有源差分探头抓取 CAN_H/CAN_L 差分眼图，运行 CANoe 连续满载发送 100,000 帧报文，监测错误帧。',
              owner: '总线测试工程师',
              duration: '5 小时',
              hardwareImpact: '台架验证',
              deliverable: '《CAN-FD 10万帧零丢帧稳定性测试记录》',
            },
          ],
          verificationCriteria: '隐性电平共模振铃峰值由 820mV 压制至 ≤ 350mV，连续运行 100,000 帧无任何 CRC 错误帧与重传。',
          exitCriteria: '底盘整车台架通信无报警，具备出库路试放行准入资格。',
        },
        permanentPhase: {
          phaseTag: 'NEXT_PHASE_PERMANENT',
          timeWindow: '下一轮 PCB 改版 / PV 样件定型',
          title: '严格 120Ω 差分阻抗控制 + 固化车规共模电感 + 拓扑无残桩化',
          objective: '彻底消除长线束多节点传输线阻抗不连续下陷，建立全温度全拓扑稳健的物理层通信合规性。',
          hardwareImpact: '重新绘制 PCB 差分走线，固化车规双线并绕共模电感封装。',
          responsibilityRole: '硬件架构师 & SQE 负责人',
          actions: [
            {
              step: '1. PCB Layout 差分走线与阻抗严格对称化',
              detail: '设定微带差分走线阻抗为 120Ω ± 10%，线间距保持 2 倍线宽，全长严格等长 (时延差 ≤ 50ps)，节点分支短截线 (Stub) 限制在 5mm 以内。',
              owner: 'PCB Layout 工程师',
              duration: '5 天',
              hardwareImpact: 'PCB 改版投板',
              deliverable: '阻抗仿真报告与新版 Gerber',
            },
            {
              step: '2. 固化 TDK ACT45B-510-2P 车规共模扼流圈',
              detail: '正式导入车规级专用 CAN-FD 共模电感 (51μH @ 100kHz，杂散差模漏感 < 1μH)，兼顾差分信号完整性与抗 EMI 干扰。',
              owner: '硬件工程师',
              duration: '3 天',
              hardwareImpact: 'BOM 标准化料号引入',
              deliverable: 'AEC-Q200 认证报告与测试报告',
            },
            {
              step: '3. 完成 ISO 11898-2 物理层一致性测试 (C&S 认证)',
              detail: '将样件送至第三方实验室进行全项物理层一致性测试与互操作性认证，确保在 -40℃~105℃ 下均满足眼图裕量。',
              owner: '测试工程师',
              duration: '8 天',
              hardwareImpact: '第三方认证',
              deliverable: '《ISO 11898-2 物理层一致性测试认证报告》',
            },
          ],
          verificationCriteria: '极限线束 (15m, 16 节点满载) 下，眼图高度裕量 ≥ 1.2V，位时间抖动裕量 ≥ 40ns，满足客户通信规范。',
          exitCriteria: '通过主机厂电子电气部总线一致性签字放行，PPAP 通信分册签署。',
        },
        strategicTradeoff: `为什么必须双层时间轴协同？
总线振铃问题在长线束下容易偶发丢帧。
当前离路试仅剩【${days}天】，若重新开版投板打样必须消耗 20 天以上，项目路试节点将彻底瘫痪；
因此 T+24h 内必须依靠“原位分裂终端阻容 + 采样点软件移位”在 8 小时内稳住总线；
下一阶段改版再通过 PCB 差分阻抗控制和车规扼流圈从硬件物理层彻底固化，形成量产无死角的质量防线。`,
      };

    case 'WCCA':
    case 'WCCA_EOL':
      return {
        containmentPhase: {
          phaseTag: 'T_PLUS_24H_CONTAINMENT',
          timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
          title: 'EOL 产线单点增益标定 + 软件 NTC 多项式温度查表补偿',
          objective: '0 天硬件改版工期，通过产线校准系数注入与板载软件温度补偿算法，将全温采样误差从 +3.8% 强行收敛至 ±1.2% 以内。',
          hardwareImpact: '无 PCB 改版，仅需产线测试脚本与固件算法参数更新。',
          responsibilityRole: '算法工程师 (Algorithm Lead) & 制造测试工程师 (TE)',
          actions: [
            {
              step: '1. EOL 下线测试增加室温精密校准',
              detail: '在产线 EOL 测试台架注入 50A 精准直流标定电流，MCU 采集实际 ADC 读数，计算初始增益误差并在 EEPROM 烧录校准系数 (Cal_Gain)。',
              owner: '产线测试工程师',
              duration: '6 小时',
              hardwareImpact: '测试夹具脚本增加校准步序',
              deliverable: 'EOL 校准烧录固件与测试规范',
            },
            {
              step: '2. 软件固件植入分流电阻 NTC 温度补偿算法',
              detail: '读取分流电阻附近的板载 NTC 实时温度，按分流电阻实测 TCR 曲线 (75ppm/℃) 进行一次函数温度反向修正，消除自热与环温漂移。',
              owner: '嵌入式软件工程师',
              duration: '10 小时',
              hardwareImpact: '纯算法更新',
              deliverable: '温度补偿补丁固件 (V2.0-TempComp)',
            },
            {
              step: '3. 高低温箱抽检三点对比验证',
              detail: '将 5 台写入补偿固件的样品放入环境箱，在 -40℃, 25℃, 125℃ 进行注入电流回传对比，记录全温包络误差。',
              owner: 'DVT 验证工程师',
              duration: '8 小时',
              hardwareImpact: '环境箱测试',
              deliverable: '《三温全量程采样误差校准对比报告》',
            },
          ],
          verificationCriteria: '环境试验箱全温 (-40℃ ~ +125℃) 满载工况下，回传电流残差收敛于 ±1.2% 以内 (满足规格 ≤ ±1.5%)。',
          exitCriteria: '软件算法标定通过评审，样机满足交样精度要求，出具临时工程偏差放行单。',
        },
        permanentPhase: {
          phaseTag: 'NEXT_PHASE_PERMANENT',
          timeWindow: '下一批次生产改版 / PV 模具封样',
          title: '换型 4 端子开尔文超低温漂电阻 (15ppm) + 自稳零斩波运放',
          objective: '从硬件选型上消除对温度补偿算法的过度依赖，确保 15 年全寿命老化后最坏情况容差 (WCCA) 仍坚挺达标。',
          hardwareImpact: 'BOM 替换高规格器件，单板成本增加约 $0.22，焊盘微调为开尔文 4 引脚。',
          responsibilityRole: '硬件负责人 & 采购 Commodity Buyer',
          actions: [
            {
              step: '1. BOM 升级为 Vishay WSLP2512 纯合金分流电阻',
              detail: '选用 15ppm/℃ 车规纯合金电阻，采用独立开尔文引线连接至运放差分输入端，完全避开铜箔焊盘 3900ppm/℃ 的走线温漂。',
              owner: '硬件工程师',
              duration: '5 天',
              hardwareImpact: 'BOM 正式变更 (ECR)',
              deliverable: '新器件规格书与选型比对表',
            },
            {
              step: '2. 前端放大器升级为斩波自稳零运放 (INA240-Q1)',
              detail: '采用零漂移斩波运放，输入失调电压 Vos < 25μV，失调温漂 dVos/dT < 0.1μV/℃，高共模抑制比 CMRR > 110dB。',
              owner: '硬件工程师',
              duration: '5 天',
              hardwareImpact: '封装 Pin-to-Pin 替换',
              deliverable: '原理图升版与替代料认可书',
            },
            {
              step: '3. 正式发布 15 年全寿命 WCCA 数学仿真报告',
              detail: '采用 Mathcad / Python 执行极限极值法 (EVA) 与均方根容差法 (RSS) 分析，涵盖初始公差、全温温漂、1000h 老化及湿热漂移。',
              owner: '系统仿真工程师',
              duration: '7 天',
              hardwareImpact: '理论分析归档',
              deliverable: '《WCCA 全温全寿命周期精度可靠性分析报告》',
            },
          ],
          verificationCriteria: '在未开启软件温度补偿的纯硬件裸跑工况下，EVA 理论最劣误差 ≤ ±1.15%，RSS 综合误差 ≤ ±0.65%。',
          exitCriteria: '客户签署批准《WCCA 审查报告》，SOP 批量采购正式切换新料号。',
        },
        strategicTradeoff: `为什么必须双层时间轴协同？
如果现在去等 15ppm 超低温漂开尔文电阻和改版打样，采购订货周期至少需要 6~8 周，当前交样节点（剩余【${days}天】）将直接爆雷；
所以当前 T+24h 内必须用“EOL 校准 + 软件查表补偿”立竿见影将误差压入合格限；
但软件算法无法完全补偿元器件在 15 年后的物理老化退化，量产阶段必须换装高精合金开尔文电阻以确保 100% 免除召回风险。`,
      };

    case 'THERMAL':
      return {
        containmentPhase: {
          phaseTag: 'T_PLUS_24H_CONTAINMENT',
          timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
          title: '原位换装 5.0W/mK 绝缘导热垫 + 固件多级动态限流降额',
          objective: '0 天 PCB 打样工期，改善传热热阻并将瞬态功率分段打折，确保台架极端高温下器件结温绝不超过 140℃。',
          hardwareImpact: '无需开模或制板，仅在组装工位改用高导热衬垫并刷写温控保护固件。',
          responsibilityRole: '热设计工程师 (Thermal Lead) & 结构装配技师',
          actions: [
            {
              step: '1. 装配工位原位升级高导热绝缘垫 (TIM)',
              detail: '将原 1.5W/mK 导热垫原位替换为 5.0W/mK 绝缘导热硅胶垫 (如 Bergquist Gap Pad 5000S35)，装配压缩率控制在 25%，压低界面接触热阻。',
              owner: '结构工艺工程师',
              duration: '3 小时',
              hardwareImpact: '装配辅料更换，0天板卡工期',
              deliverable: '改制样机 5 台',
            },
            {
              step: '2. 固件注入阶梯式结温安全降额保护策略',
              detail: '板载热敏电阻温度达 95℃ 时限制最大扭矩/电流至 85%，达 110℃ 限制至 50%，达 125℃ 触发降级停机报警，杜绝热失控。',
              owner: '控制算法工程师',
              duration: '6 小时',
              hardwareImpact: '纯软件策略更新',
              deliverable: '热保护升级固件 (V1.2-Thermal-Limit)',
            },
            {
              step: '3. 密闭温箱满载堵转热电偶温升测试',
              detail: '在 +85℃ 环境试验箱中运行极限工况 2 小时，热电偶实时记录 MOS 管壳温升斜率，确认热稳态。',
              owner: 'DVT 测试工程师',
              duration: '6 小时',
              hardwareImpact: '台架验证',
              deliverable: '《应急改制件高温满载温升曲线记录》',
            },
          ],
          verificationCriteria: '高温舱内持续满载 2 小时，实测换算半导体结温 Tj ≤ 135℃，满足 ISO 16750-4 降额底线。',
          exitCriteria: '台架无过温烧毁迹象，满足装车测试安全要求，签发临时装车批复单。',
        },
        permanentPhase: {
          phaseTag: 'NEXT_PHASE_PERMANENT',
          timeWindow: '下一版本 PCB 投板 / 量产模具优化',
          title: '压铸外壳散热筋翅片优化 + PCB 高密度散热过孔阵列与 2oz 重铜',
          objective: '从物理传热第一性原理上降低系统总热阻 Rth(j-a) 40% 以上，取消软件深度限流，释放产品额定满负荷性能。',
          hardwareImpact: 'PCB 功率区采用 2oz 厚铜与 0.3mm 散热过孔矩阵，铝合金外壳模具修模加大散热筋。',
          responsibilityRole: '热仿真工程师 & 结构模具工程师',
          actions: [
            {
              step: '1. PCB 功率级重铜走线与热过孔矩阵设计',
              detail: 'MOSFET 裸焊盘下方布置 4x6 阵列散热过孔 (孔径 0.3mm，孔距 0.8mm，孔壁电镀铜厚 ≥ 25μm)，内层铺设 2oz 完整重铜扩展散热面。',
              owner: '硬件 Layout 工程师',
              duration: '7 天',
              hardwareImpact: 'PCB 重新打样制板',
              deliverable: '热流仿真报告与新版 Gerber',
            },
            {
              step: '2. 铝合金压铸外壳导热凸台平面度修模',
              detail: '外壳散热筋增加 15% 迎风表面积，与功率管贴合的凸台铣削平面度公差严格控制在 0.08mm 以内，消除装配气隙。',
              owner: '结构设计工程师',
              duration: '14 天',
              hardwareImpact: '模具修模与试模打样',
              deliverable: '模具修改评审单与首件测量报告',
            },
            {
              step: '3. 极端工况全寿命热循环试验 (1000 次 -40℃~125℃)',
              detail: '将量产工装件送入冷热冲击箱完成 1000 循环试验，焊点做切片微观金相分析，确保无裂纹与热疲劳脱焊。',
              owner: '可靠性工程师',
              duration: '15 天',
              hardwareImpact: '全套环境可靠性试验',
              deliverable: '《热冲击可靠性试验报告及切片金相分析》',
            },
          ],
          verificationCriteria: '满载额定功率稳态运行下，管壳温升不超过 35℃，换算结温 Tj ≤ 118℃，无需软件降额即可长期全额输出。',
          exitCriteria: '通过主机厂热负荷耐久试验评审，量产模具封样签字 (Tooling Sign-off)。',
        },
        strategicTradeoff: `为什么必须双层时间轴协同？
模具修模与 PCB 厚铜制板耗时至少 3 周，远超当前剩余【${days}天】交样窗口；
T+24h 内利用“5.0W/mK 绝缘垫 + 软件动态限流降额”可以在不花一天板卡工期的前提下保障装车样机不烧毁；
但在后续 SOP 阶段，必须通过散热筋与 PCB 散热过孔消除总热阻，彻底解除软件功率限额，才能向客户交付具备完整额定功率性能的合格产品。`,
      };

    case 'BLDC':
    default:
      return {
        containmentPhase: {
          phaseTag: 'T_PLUS_24H_CONTAINMENT',
          timeWindow: 'T + 24h 紧急应急围堵 (Containment)',
          title: '母线原位贴装 6600W 高能 TVS + 固件全下桥主动短路 (ASC) 刹车',
          objective: '0 天 PCB 改版工期，通过原位高能 TVS 吸收管和软件电机制动算法注入，将反电动势泵升电压钳制在 46V 以内，杜绝 MOSFET 击穿。',
          hardwareImpact: '无需重新制板，母线预留焊盘原位贴片 1 颗 DO-218AB TVS，固件刷写刹车补丁。',
          responsibilityRole: '电机控制软件工程师 (SW) & 硬件现场调试工程师 (HW)',
          actions: [
            {
              step: '1. 母线电容两端原位贴装 Vishay SM8S36A TVS',
              detail: '利用母线空置备用焊盘原位并联 DO-218AB 6600W 车规高能 TVS (反向关断电压 36V，击穿电压 40V~44V)，就近吸收瞬态泵升能量。',
              owner: '硬件调试技师',
              duration: '2 小时',
              hardwareImpact: '原位焊盘焊接，0天板卡工期',
              deliverable: '改制验证样机 3 台',
            },
            {
              step: '2. 电机控制固件注入全下桥主动短路 (ASC) 刹车算法',
              detail: '急停触发时，固件关闭全部上桥，强制导通全部三个下桥 MOSFET，将电机转子动能通过定子绕组内阻消耗，切断回灌母线电容路径。',
              owner: '电机控制算法工程师',
              duration: '8 小时',
              hardwareImpact: '纯固件逻辑升级',
              deliverable: 'ASC 刹车补丁固件 (V2.1-ASC-Patch)',
            },
            {
              step: '3. 示波器单次触发全转速极限急停抓波',
              detail: '示波器高压差分探头监控 Phase-U 及母线电压，单次触发 (门限 42V, 采样率 2.5GS/s)，连续执行 5 次高速全负荷急停。',
              owner: '系统测试工程师',
              duration: '4 小时',
              hardwareImpact: '台架验证',
              deliverable: '《急停母线过压抓波报告 (Peak ≤ 45.6V)》',
            },
          ],
          verificationCriteria: '示波器抓取母线最高峰值电压 ≤ 46V (MOSFET 耐压 60V 的 76% 降额线)，下桥门极米勒感应尖峰 < 1.2V。',
          exitCriteria: '通过 5 次连续急停冲击无损坏，样机贴具合格封签，放行参与 DV 装车试验。',
        },
        permanentPhase: {
          phaseTag: 'NEXT_PHASE_PERMANENT',
          timeWindow: '下一轮 PCB 改版 / C 样或量产定型',
          title: 'PCB DC-Link 低感母线重构 + 栅极米勒钳位电路 + 耐压裕量固化',
          objective: '从硬件电气拓扑上消除开关节点高 di/dt 尖峰，优化环路寄生电感，使功率级满足 15 年汽车全寿命耐受标准。',
          hardwareImpact: 'PCB 改版打样 (需 18~22 天周期)，优化母线陶瓷去耦电容与驱动回路。',
          responsibilityRole: '硬件架构师 & 产品安全代表 (PSCR)',
          actions: [
            {
              step: '1. PCB Layout 减小 DC-Link 换相高频回路寄生电感',
              detail: '在每个半桥 MOSFET 引脚最近处 (≤ 3mm) 并联 2x 10μF 100V X7R 1210 贴片陶瓷电容，将高频开关回路寄生电感压缩至 5nH 以内。',
              owner: 'PCB Layout 工程师',
              duration: '7 天',
              hardwareImpact: 'PCB 重新出图投板打样',
              deliverable: '新版 Gerber 文件及寄生参数抽取报告',
            },
            {
              step: '2. 驱动级增设硬件有源米勒钳位电路 (Active Miller Clamp)',
              detail: '栅极驱动芯片引入专用 Clamp 引脚或下桥反向推挽三极管，在关断时将栅极牢固拉低至地，彻底杜绝高 dv/dt 诱发上下桥直通。',
              owner: '硬件工程师',
              duration: '5 天',
              hardwareImpact: '原理图升级至 Rev C',
              deliverable: '更新后原理图与 BOM 清单',
            },
            {
              step: '3. 完成全寿命电机堵转与反拖抛负载极限破坏性试验',
              detail: '进行 10,000 次启停循环及电机反向高速强拖测试，校验 MOSFET 安全工作区 (SOA) 与结温温升。',
              owner: '可靠性测试工程师',
              duration: '10 天',
              hardwareImpact: '全套台架破坏性验证',
              deliverable: '《功率级极端可靠性及 SOA 验证报告》',
            },
          ],
          verificationCriteria: '开关节点电压振铃衰减周期 ≤ 2 个周期，稳态母线尖峰 ≤ 42V，全工况零米勒误导通风险。',
          exitCriteria: '功能安全 Safety Manager 与 PSCR 联合签字放行，PPAP 硬件归档完成。',
        },
        strategicTradeoff: `为什么必须双层时间轴协同？
当前距离交付里程碑仅剩【${days}天】。重新设计 PCB、出图制板、SMT 贴片调试至少需 18~22 天，如果坚持改版后再交样，项目必将严重延期并面临巨额索赔；
因此 T+24h 内利用“原位并联高能 TVS + 软件全下桥 ASC 刹车”是 24 小时内保住交付节点的唯一解；
但在后续量产改版中，必须重构 DC-Link 降低寄生电感并固化米勒钳位电路，才能形成不受软件 Bug 影响的硬件本质安全防线。`,
      };
  }
}
