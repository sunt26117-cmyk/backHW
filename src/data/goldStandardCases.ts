/**
 * 回归测试用例 (Gold Standard Cases 01 ~ 16) (Section 13)
 * 严格遵照 V4 升级任务书第 13 节规范，形成自动化基准测试与验证集
 */

import { GoldStandardCase, IssueInput, ProjectContext } from '../types';
import { evaluateAllBldcPatterns } from './bldcPatternEngine';
import { evaluateAllRobotJointPatterns, deriveRobotJointEvaluationInput } from './robotJointPatternEngine';
import { deriveBldcEvaluationInput } from '../utils/scenarioDerived';

const STUB_CONTEXT: ProjectContext = {
  projectName: '回归测试占位项目', projectPhase: 'DVT', customer: '内部', ecuType: '通用',
  asilLevel: 'QM', sopDate: '', nextMilestone: '',
} as ProjectContext;

const STUB_ISSUE: IssueInput = {
  issueCategories: [], failurePhenomenon: '', requirement: '', testCondition: '',
  actualMeasurement: '', engineeringConcern: '', notes: '', measuredValues: {},
} as unknown as IssueInput;

export const GOLD_STANDARD_CASES: GoldStandardCase[] = [
  {
    caseId: 'Case01',
    title: 'DC/DC 满载热风险与结温超限',
    category: 'Thermal & Stress',
    input: {
      context: { projectName: '车载 48V-12V DCDC 控制器', projectPhase: 'DVT' },
      issue: { failurePhenomenon: '满载 120A 持续输出 15 分钟后，MOSFET 焊盘温度达 138℃', measuredValues: { ambientTempC: 105, currentPeakA: 120, rdsOnMilliOhm: 4 } },
    },
    expectedPattern: 'P006',
    expectedCalculation: { '稳态结温 Tj (℃)': 145.2, '车规降额裕量 (℃)': -20.2 },
    expectedRisk: 'High',
    expectedVeto: false,
    expectedNextBestAction: '加装 2.5mm 导热硅胶垫并改用 2oz 厚铜 PCB 分流',
    expectedVerification: '温箱 85℃ 连续满载 2 小时记录真实温升曲线',
  },
  {
    caseId: 'Case02',
    title: 'BLDC 急停母线泵升过压 (Section 14 验收场景核心基准)',
    category: 'BLDC Motor Drive',
    input: {
      context: { projectName: '座椅大扭矩 BLDC 调节控制器', projectPhase: 'DVT' },
      issue: { failurePhenomenon: '3800rpm BLDC 急停时 VBUS 泵升至 37.8V，MOSFET 是 40V 耐压，目前只有 15 天' },
    },
    expectedPattern: 'P001',
    expectedCalculation: { '理论泵升峰值 Vbus_theo (V)': 39.1, '实测峰值 (V)': 37.8, '耐压裕量 (V)': 2.2 },
    expectedRisk: 'High',
    expectedVeto: false, // 37.8V < 40V 未完全穿透，但触发极高警戒
    expectedNextBestAction: '立即在台架连接高压光隔离探头捕获下桥短接制动瞬态波形',
    expectedVerification: '连续 30 次急停捕获，Vds 尖峰 <= 32.0V 判定 PASS',
  },
  {
    caseId: 'Case03',
    title: '高 dv/dt 门极米勒效应瞬态误导通',
    category: 'Power & Switching',
    input: {
      issue: { failurePhenomenon: '对管开通瞬间开关节点 dv/dt 达到 8.5V/ns，下管门极感应 2.15V 尖峰' },
    },
    expectedPattern: 'P003',
    expectedCalculation: { '门极感应瞬态抬升 Vgs_induced (V)': 2.15, '门极安全裕量 Margin (V)': -0.15 },
    expectedRisk: 'High',
    expectedVeto: true, // 直通风险必须一票否决！
    expectedNextBestAction: '启用驱动芯片有源米勒钳位 (Active Miller Clamp) 或加装反向低阻下拉',
    expectedVerification: '示波器高阻探头以最短接地弹簧捕获 Vgs 尖峰 <= 0.8V',
  },
  {
    caseId: 'Case04',
    title: '霍尔传感器断线与非法状态故障容错',
    category: 'Functional Safety & Sensors',
    input: {
      issue: { failurePhenomenon: '线束振动导致 H1 信号引脚间歇性开路，电机出现转矩丢失与抖动' },
    },
    expectedPattern: 'P009',
    expectedCalculation: { '检测响应时间 (ms)': 2.5, '整车危害等级': 'ASIL B' },
    expectedRisk: 'Medium-High',
    expectedVeto: false,
    expectedNextBestAction: '使能双霍尔容错估计算法并配置转矩平滑滤波',
    expectedVerification: '台架故障注入仪满载突切 H1，验证 2.5ms 内平滑切入降级保护',
  },
  {
    caseId: 'Case05',
    title: '48MHz 开关节点高频振铃与 CISPR 25 超标',
    category: 'EMC / Radiated & Conducted',
    input: {
      issue: { failurePhenomenon: 'CISPR 25 传导发射测试中，48.5MHz 频点超标 6.8dB' },
    },
    expectedPattern: 'P008',
    expectedCalculation: { '超标幅度 (dBμV)': '+6.8 dB', '振铃频率 (MHz)': 48.5 },
    expectedRisk: 'High',
    expectedVeto: false,
    expectedNextBestAction: '半桥中点并联 1360pF NPO + 4.7Ω 0805 RC Snubber 并在供电端加装磁环',
    expectedVerification: '标准电波暗室复测 CISPR 25 Class 5 传导发射',
  },
  {
    caseId: 'Case06',
    title: '短路保护响应时序 vs MOSFET SOA 窗口 (P016 重点)',
    category: 'Power & Protection Timing',
    input: {
      issue: { failurePhenomenon: '相间短路发生时，从电流上升到门极完全关断总耗时 2.8μs，MOSFET 短路耐受仅 2.5μs', measuredValues: { senseDelayNs: 500, compDelayNs: 500, digitalFilterDelayNs: 500, driverPropDelayNs: 300, gateTurnOffDelayNs: 300, currentFallDelayNs: 400, soaShortCircuitTimeUs: 2.0 } },
    },
    expectedPattern: 'P016',
    expectedCalculation: { '全关闭时间 Fault-to-Off (μs)': 0.85, 'SOA耐受时间 (μs)': 2.5, '时序裕量 (μs)': 1.65 },
    expectedRisk: 'Low',
    expectedVeto: false,
    expectedNextBestAction: '示波器同时使用 4 通道精确标定 5 级延迟实测值',
    expectedVerification: '硬短路冲击注入，验证保护在 1.5μs 内截断并锁存 Fault',
  },
  {
    caseId: 'Case07',
    title: '死区过长导致低转速换相畸变与转矩脉动',
    category: 'Motor Control & NVH',
    input: {
      issue: { failurePhenomenon: '将死区加大至 800ns 后，低速 200rpm 运转出现明显电磁嗡鸣与转矩纹波' },
    },
    expectedPattern: 'P005',
    expectedCalculation: { '死区占PWM周期比例 (%)': 1.6, '转矩脉动增加 (%)': 8.5 },
    expectedRisk: 'Medium',
    expectedVeto: false,
    expectedNextBestAction: '固件加入电流极性死区非线性补偿算法并微调死区至 250ns',
    expectedVerification: '电流钳捕获相电流正弦度 THD 与转矩传感器波形',
  },
  {
    caseId: 'Case08',
    title: '电流采样架构决策：低边单电阻 vs 相电流独立采样',
    category: 'System Architecture',
    input: {
      issue: { failurePhenomenon: '单电阻采样在急停与高占空比工况下丢失采样窗口，无法闭环' },
    },
    expectedPattern: 'P017',
    expectedCalculation: { '推荐架构': '相电流独立采样', '决策理由': '全占空比支持 + 单相独立故障诊断' },
    expectedRisk: 'Low',
    expectedVeto: false,
    expectedNextBestAction: '选定双路低边独立分流架构并完成差分检流运放打样',
    expectedVerification: '100% 满负荷下验证相电流采样精度与平衡度',
  },
  {
    caseId: 'Case09',
    title: '堵转保护四级复合判据 (P018 重点)',
    category: 'Motor Protection Rule Engine',
    input: {
      issue: { failurePhenomenon: '机械卡死堵转时仅依赖热敏电阻，在温度传感器滞后 3 秒期间电机炸机' },
    },
    expectedPattern: 'P018',
    expectedCalculation: { '判据逻辑': '电流>18A AND 转速<200rpm AND 持续300ms', '保护层级': 'L1软限幅 -> L2降额 -> L3停机 -> L4锁存' },
    expectedRisk: 'Medium',
    expectedVeto: false,
    expectedNextBestAction: '部署分级堵转状态机，严禁单纯依赖单一温度阈值',
    expectedVerification: '台架抱闸死锁，验证 300ms/800ms/1500ms 保护动作状态迁移',
  },
  {
    caseId: 'Case10',
    title: 'ESD 静电放电回路与敏感引脚防护',
    category: 'EMC / ESD Immunity',
    input: {
      issue: { failurePhenomenon: '连接器引脚接受 ISO 10605 ±15kV 空气放电时，预驱芯片死锁' },
    },
    expectedPattern: 'P011',
    expectedCalculation: { 'TVS钳位残压 (V)': 38.9, '敏感引脚耐受': '2kV HBM' },
    expectedRisk: 'Medium-High',
    expectedVeto: false,
    expectedNextBestAction: '优化连接器金属外壳搭铁弹片并增加进板二级 TVS 钳位',
    expectedVerification: '静电放电枪对 6 处引脚分别实施 ±8kV 接触放电各 20 次',
  },
  {
    caseId: 'Case11',
    title: 'BCI 大电流注入射频共模抗扰度',
    category: 'EMC / RF Immunity',
    input: {
      issue: { failurePhenomenon: 'ISO 11452-4 BCI 测试中，在 45MHz 注入 100mA 时相电流采样报异常超差' },
    },
    expectedPattern: 'P008',
    expectedCalculation: { '敏感频段': '20MHz ~ 80MHz', '注入点位置': '线束 150mm 处' },
    expectedRisk: 'Medium',
    expectedVeto: false,
    expectedNextBestAction: '运放采样差分信号线并联 100pF NPO 共模电容，并加装差模滤波网络',
    expectedVerification: 'BCI 严酷等级 Class A 闭环复测',
  },
  {
    caseId: 'Case12',
    title: '母线电解电容 Arrhenius 寿命加速模型估算',
    category: 'Reliability & Aging',
    input: {
      issue: { failurePhenomenon: '母线电解电容在 85℃ 环温与 3.5A 纹波下工作，需评估 15 年车规寿命', measuredValues: { cBusUf: 470, currentPeakA: 15, ambientTempC: 85 } },
    },
    expectedPattern: 'P013',
    expectedCalculation: { '估算寿命 (h)': 20000, '目标寿命 (h)': 15000, '寿命裕量 (h)': 5000 },
    expectedRisk: 'Low',
    expectedVeto: false,
    expectedNextBestAction: '选用 125℃ 耐高温固液混合电解电容，强制标注 MODEL ESTIMATE',
    expectedVerification: '高温高湿带电老化试验 (1000h @ 85℃/85%RH)',
  },
  {
    caseId: 'Case13',
    title: '急停动态尖峰 MOSFET VDS 耐压多层级裕量核查 (P014 重点)',
    category: 'Power & Switching',
    input: {
      issue: { failurePhenomenon: '急停后母线实测峰值 48V，而功率 MOSFET 额定耐压仅 40V，动态尖峰逼近击穿', measuredValues: { busVoltagePeakV: 48, vdsRatingV: 40 } },
    },
    expectedPattern: 'P014',
    expectedCalculation: { '动态浪涌过冲估算 Vds_peak (V)': 62.4, '器件额定耐压 Vds_rating (V)': 40, '耐压裕量 (V)': -22.4 },
    expectedRisk: 'Medium-High',
    expectedVeto: false,
    expectedNextBestAction: '选用更高耐压车规 MOSFET 拉开耐压裕量，并实测开关节点尖峰替换假设的 30% 过冲系数',
    expectedVerification: '示波器 1GHz 探头焊在引脚根部捕获极限开关尖峰，并测回路电感与 di/dt 替代假设的过冲系数',
  },
  {
    caseId: 'Case14',
    title: 'FMEDA 硬件架构安全指标可追溯度量 (SPFM/LFM)',
    category: 'Functional Safety ISO 26262',
    input: {
      issue: { failurePhenomenon: '需向主机厂客户提供逆变器功率级 ISO 26262 ASIL C FMEDA 报告' },
    },
    expectedPattern: 'P015',
    expectedCalculation: { 'SPFM 单点度量 (%)': 98.2, 'LFM 潜伏度量 (%)': 82.5, '标准合规': 'PASS' },
    expectedRisk: 'Low',
    expectedVeto: false,
    expectedNextBestAction: '固化完整 HARA -> SG -> FSR -> TSR -> HSR 链路，展示单点/潜伏失效贡献拆分',
    expectedVerification: '第三方车规功能安全机构独立 Safety Case 评审',
  },
  {
    caseId: 'Case15',
    title: '协作机器人肩关节谐波减速器背隙+扭转柔性超出客户定位精度规格 (J001 重点)',
    category: 'Robot Joint / Position Accuracy',
    input: {
      context: { projectName: '协作机器人六轴手臂 · 肩关节模组', projectPhase: 'DVT' },
      issue: { failurePhenomenon: '肩关节谐波减速器输出端实测背隙 4.5arcmin，35Nm额定扭矩工况下末端定位精度客户规格要求 ±3arcmin，产线抽检批量超差' },
    },
    expectedPattern: 'J001',
    expectedCalculation: { '背隙 (arcmin)': 4.5, '扭转柔性附加误差 (arcmin)': 8.02, '输出端运动学总误差估算 (arcmin)': 12.52, '规格要求 (arcmin)': 3.0, '精度裕量 (arcmin)': -9.52 },
    expectedRisk: 'High',
    expectedVeto: true, // 总误差已超出客户规格，一票否决！
    expectedNextBestAction: '关节输出端加装第二编码器实现全闭环消除背隙影响，同步评估更高背隙等级减速器型号',
    expectedVerification: '输出端激光跟踪仪实测重复定位精度，全闭环改造后连续 30 次正反向定位 ≤3arcmin 判定 PASS',
  },
  {
    caseId: 'Case16',
    title: '协作机器人腕关节 STO 仅软件禁止 PWM，未满足 PLd 硬件通道独立性 (J006 重点)',
    category: 'Robot Joint / Functional Safety (IEC 61800-5-2)',
    input: {
      context: { projectName: '协作机器人六轴手臂 · 腕关节驱动器', projectPhase: 'PVT' },
      issue: { failurePhenomenon: '产品安全需求要求腕关节驱动器达到 PLd，但现有 STO 功能仅通过主控 MCU 软件封锁 PWM 实现，未接入独立硬件断使能通道' },
    },
    expectedPattern: 'J006',
    expectedCalculation: { '当前 STO 实现方式': 'SOFTWARE_PWM_DISABLE_ONLY', '目标性能等级': 'PLd', 'STO响应时间 (ms)': 12, '要求响应时间上限 (ms)': 20 },
    expectedRisk: 'High',
    expectedVeto: true, // 通道独立性不满足，一票否决，不得进入人机共融现场！
    expectedNextBestAction: '改为双通道硬件 STO（预驱使能引脚 + 门极电源双重切断）或升级安全 MCU 方案，重新申请第三方安全认证',
    expectedVerification: '故障注入验证任一 STO 通道单独失效时另一通道仍可独立断转矩，示波器实测端到端响应时间',
  },
];

export function runGoldStandardCaseRegression(caseId: string): {
  caseInfo: GoldStandardCase;
  matchedPattern: string;
  isPatternMatch: boolean;
  status: 'PASS' | 'FAIL';
  summary: string;
} {
  const c = GOLD_STANDARD_CASES.find((item) => item.caseId === caseId) || GOLD_STANDARD_CASES[1];

  // 之前这个函数完全没有真的跑模式引擎——不管传进来什么caseId，永远把case自己的
  // expectedPattern原样抄回来当"匹配结果"，isPatternMatch/status也是硬编码true/PASS，
  // 等于这16个"回归测试用例"从来没有真正验证过任何东西，DesignReviewRegressionView.tsx
  // 展示的"16/16通过"是假的。这里改成真正调用 bldcPatternEngine / robotJointPatternEngine，
  // 用引擎的真实触发结果去跟 expectedPattern 比对。
  const issue: IssueInput = { ...STUB_ISSUE, ...(c.input.issue as Partial<IssueInput>) };
  const context: ProjectContext = { ...STUB_CONTEXT, ...(c.input.context as Partial<ProjectContext>) };
  const isRobotJointCase = c.expectedPattern.startsWith('J');

  let triggeredIds: string[] = [];
  try {
    if (isRobotJointCase) {
      const evalInput = deriveRobotJointEvaluationInput(issue);
      triggeredIds = evaluateAllRobotJointPatterns(evalInput).filter((p) => p.triggered).map((p) => p.id);
    } else {
      const evalInput = deriveBldcEvaluationInput(context, issue);
      triggeredIds = evaluateAllBldcPatterns(evalInput).filter((p) => p.triggered).map((p) => p.id);
    }
  } catch (err) {
    return {
      caseInfo: c,
      matchedPattern: '(引擎调用异常)',
      isPatternMatch: false,
      status: 'FAIL',
      summary: `自动化用例 ${c.caseId} [${c.title}] 校验失败：调用模式引擎时抛出异常 - ${(err as Error).message}`,
    };
  }

  const isPatternMatch = triggeredIds.includes(c.expectedPattern);
  const matchedPattern = triggeredIds.length > 0 ? triggeredIds.join('、') : '(未触发任何判据)';

  return {
    caseInfo: c,
    matchedPattern,
    isPatternMatch,
    status: isPatternMatch ? 'PASS' : 'FAIL',
    summary: isPatternMatch
      ? `自动化用例 ${c.caseId} [${c.title}] 校验通过：模式引擎实际触发 ${matchedPattern}，包含预期的 ${c.expectedPattern}。`
      : `自动化用例 ${c.caseId} [${c.title}] 校验失败：预期触发 ${c.expectedPattern}，模式引擎实际触发 ${matchedPattern}。`,
  };
}
