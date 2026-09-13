import React, { useMemo } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  Gauge,
  GitBranch,
  HardDrive,
  Layers3,
  Microscope,
  ShieldCheck,
  Target,
  TestTube2,
} from 'lucide-react';
import { CopilotAnalysisResult, IssueCategory, IssueInput, ProjectContext } from '../types';
import { getDomainDataQuality, getEngineeringDomainLabel, resolveEngineeringDomain, resolveEngineeringDomains } from '../utils/scenarioDomainEngine';

interface EngineeringWorkflowViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onNavigateTab: (tab: string) => void;
}

type DomainGuide = {
  title: string;
  question: string;
  input: string[];
  mechanism: string[];
  evidence: string[];
  output: string[];
};

const DOMAIN_GUIDES: Record<string, DomainGuide> = {
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

function resolveDomain(categories: IssueCategory[], issue?: IssueInput): string {
  if (issue) return resolveEngineeringDomain(issue);
  const priority: Array<[IssueCategory | string, string]> = [['BLDC Motor Drive','BLDC'],['EMC','EMC'],['Component Alternative','COMPONENT'],['WCCA','WCCA'],['Thermal','THERMAL'],['Power','POWER'],['Functional Safety','FUNCTIONAL SAFETY'],['Signal Integrity','SIGNAL INTEGRITY'],['Reliability','RELIABILITY'],['DFM','DFM'],['Customer Requirement','CUSTOMER']];
  return priority.find(([cat]) => categories.includes(cat as IssueCategory))?.[1] || 'GENERAL';
}

const steps = [
  { n: '01', title: '事实输入', icon: Database, tab: 'input', desc: '工程背景、Spec、实测、测试条件、环境、失效现象、附件' },
  { n: '02', title: '事实分层', icon: ClipboardCheck, tab: 'facts', desc: 'MEASURED / SPEC / CALCULATED / ASSUMPTION 分离，避免把猜测当事实' },
  { n: '03', title: '物理机理', icon: Microscope, tab: 'patterns', desc: '识别主导物理链，给出关键变量、计算和验证优先级' },
  { n: '04', title: '候选方案', icon: GitBranch, tab: 'options', desc: '技术、时间、成本、质量、安全多维打分并识别 VETO' },
  { n: '05', title: '决策门禁', icon: Gauge, tab: 'cockpit', desc: 'C-T-S-Q-L 综合权衡，形成“现在能不能继续”的门禁' },
  { n: '06', title: '验证闭环', icon: TestTube2, tab: 'verification', desc: '把未知量转成试验，用 VOI 排优先级并设绿/黄/红标准' },
  { n: '07', title: '安全可靠性', icon: ShieldCheck, tab: 'safety', desc: '失效模式、诊断、寿命、二供、PCN 等影响闭环' },
  { n: '08', title: '评审回归', icon: FileCheck2, tab: 'review', desc: '按当前项目阶段生成评审清单、回归用例和变更影响' },
  { n: '09', title: '团队决策', icon: Layers3, tab: 'recommendation', desc: 'RACI、团队异议、领导博弈和责任边界' },
  { n: '10', title: '受控归档', icon: HardDrive, tab: 'docs', desc: 'EDR、偏差、客户让步、会议纪要、证据留痕' },
];

export const EngineeringWorkflowView: React.FC<EngineeringWorkflowViewProps> = ({ context, issue, result, onNavigateTab }) => {
  const domainKey = useMemo(() => resolveDomain(issue.issueCategories || [], issue), [issue]);
  const domain = DOMAIN_GUIDES[domainKey] || DOMAIN_GUIDES.GENERAL;
  const enteredMeasurements = Object.entries(issue.measuredValues || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const evidenceCount = (issue.attachments || []).length;
  const risk = result?.riskRatings;
  const dataQuality = getDomainDataQuality(issue);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-[11px] text-blue-300 font-semibold uppercase tracking-wider">0 · Engineering Operating System</div>
            <h1 className="text-xl font-bold text-white mt-1">工程问题闭环工作台：从“遇到问题”到“拿得出证据”</h1>
            <p className="text-xs text-slate-400 mt-2 max-w-3xl">这不是再做一套静态报告，而是把实际工作中的问题变成统一数据对象：事实 → 物理机制 → 方案 → 验证 → 决策 → 回归 → 受控文档。换工况只是换问题模板，真实实测才是最终裁决。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] text-slate-300">{context.projectName}</span>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-[11px] text-cyan-300">主领域：{domain.title}</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/60 text-[11px] text-amber-300">剩余 {context.daysRemaining} 天</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-cyan-300">本工况涉及多个工程域时，后续步骤统一消费同一份跨域事实包</span>
          <span className="text-[10px] text-slate-500">主导域用于根因排序，关联域用于副作用、验证与 VETO，不会丢参数。</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {resolveEngineeringDomains(issue).map((d, i) => (
            <span key={d} className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${d === resolveEngineeringDomain(issue) ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
              {i === 0 ? 'PRIMARY · ' : 'RELATED · '}{getEngineeringDomainLabel(d)}
            </span>
          ))}
        </div>
        {result?.multiDomainAnalysis?.crossDomainLinks?.length ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.multiDomainAnalysis.crossDomainLinks.slice(0, 4).map((link, i) => (
              <div key={`${link.fromDomain}-${link.toDomain}-${i}`} className="rounded-lg bg-slate-950/50 border border-slate-800 p-2.5">
                <div className="text-[10px] font-semibold text-slate-300">{getEngineeringDomainLabel(link.fromDomain as any)} → {getEngineeringDomainLabel(link.toDomain as any)}</div>
                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{link.mechanism}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-cyan-400" /> 当前工况到底要解决什么</div>
          <div className="text-sm text-slate-100 font-medium">{domain.question}</div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 rounded-lg border border-cyan-900/40 p-3"><div className="text-[10px] text-slate-500">领域</div><div className="text-cyan-300 font-mono text-sm mt-1">{domainKey}</div></div>
            <div className="bg-slate-950/70 rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500">必填证据</div><div className="text-cyan-300 font-mono text-sm mt-1">{dataQuality.requiredDone}/{dataQuality.requiredCount}</div><div className="text-[10px] text-slate-500 mt-1">{dataQuality.missingRequired.join('、') || '无缺失'}</div></div>
            <div className="bg-slate-950/70 rounded-lg border border-amber-900/40 p-3"><div className="text-[10px] text-slate-500">数据来源</div><div className="text-amber-300 text-sm mt-1">{issue.measuredValueSource || 'USER_MEASURED'}</div><div className="text-[10px] text-slate-500 mt-1">Benchmark仅作演示</div></div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-4">
            <div className="bg-slate-950/70 rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 mb-2">当前实测输入</div><div className="text-xs text-slate-300">{enteredMeasurements.length ? enteredMeasurements.map(([k,v]) => `${k}=${v}`).join('；') : '尚未回填结构化实测值'}</div></div>
            <div className="bg-slate-950/70 rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 mb-2">证据附件</div><div className="text-xs text-slate-300">{evidenceCount ? `${evidenceCount} 个原始数据/报告附件已挂接` : '尚无附件，建议上传原始波形/频谱/表格'}</div></div>
            <div className="bg-slate-950/70 rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 mb-2">当前风险</div><div className="text-xs text-slate-300">{risk ? `${risk.overallRisk} / ${risk.overallRiskScore}` : '待生成分析'}</div></div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-3">这个软件最适合解决的真实工作场景</div>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">⚠️ 测试失败：先判定“继续测 / 改板 / 放行 / 停线”</div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">🔧 器件替代：避免只看 Pin-to-Pin，强制检查 SOA / 热 / EMC / 质量体系</div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">📈 极限问题：把边界条件转成 WCCA / Thermal / EMC 的验证计划</div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">📝 项目争议：把“谁说了算”变成可追溯的证据与门禁</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-emerald-800/40 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-2">本次分析到底用了什么？</div>
          <div className="text-xs text-slate-300 leading-relaxed">基础知识来自内置车规规则/公式/模板；<b className="text-emerald-300">结论参数优先取当前工况输入与实测回填</b>。没有实测的数据只能标成 CALCULATED / ASSUMPTION / UNKNOWN，不应冒充实测。</div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
            {['MEASURED','SPEC','CALCULATED','ASSUMPTION','UNKNOWN'].map((x) => <span key={x} className="px-2 py-1 rounded border border-slate-700 bg-slate-950 text-slate-300">{x}</span>)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-2">工程上什么时候能相信结果？</div>
          <div className="space-y-1.5 text-xs text-slate-300"><div>① Spec 明确且来源可追溯</div><div>② 实测带工况/仪器/样件条件</div><div>③ 模型输入与实际硬件一致</div><div>④ 最关键未知量已经做过验证</div></div>
        </div>
        <div className="bg-slate-900 border border-amber-800/40 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-2">现在还缺什么？</div>
          <div className="text-xs text-slate-300">结构化实测值：<b className="text-amber-300">{enteredMeasurements.length}</b> 项；原始附件：<b className="text-amber-300">{evidenceCount}</b> 个。缺失项应进入 VOI，而不是由系统偷偷补数。</div>
          {result?.analysisBasis && <div className="mt-2 text-[10px] text-slate-500">规则字段 {result.analysisBasis.ruleInputs.length} · 实测 {result.analysisBasis.measuredInputs.length} · 计算输出 {result.analysisBasis.calculatedOutputs.length} · 固定模板骨架 {result.analysisBasis.fixedTemplateFields.length}</div>}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="text-xs font-semibold text-white mb-4">软件各模块之间的连接关系</div>
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
          {steps.slice(0, 5).map((step, i) => {
            const Icon = step.icon;
            return <React.Fragment key={step.n}>
              <button onClick={() => onNavigateTab(step.tab)} className="flex-1 text-left bg-slate-950 rounded-xl border border-slate-800 hover:border-blue-500/40 p-3 transition cursor-pointer">
                <div className="flex items-center gap-2"><span className="text-[10px] font-mono text-cyan-300">{step.n}</span><Icon className="w-4 h-4 text-blue-400" /><span className="text-xs font-semibold text-white">{step.title}</span></div>
                <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">{step.desc}</div>
              </button>
              {i < 4 && <ArrowRight className="hidden lg:block w-5 h-5 text-slate-700 self-center shrink-0" />}
            </React.Fragment>;
          })}
        </div>
        <div className="flex justify-center py-2"><ArrowDown className="w-5 h-5 text-slate-700" /></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {steps.slice(5).map((step) => { const Icon = step.icon; return <button key={step.n} onClick={() => onNavigateTab(step.tab)} className="text-left bg-slate-950 rounded-xl border border-slate-800 hover:border-blue-500/40 p-3 transition cursor-pointer"><div className="flex items-center gap-2"><span className="text-[10px] font-mono text-cyan-300">{step.n}</span><Icon className="w-4 h-4 text-emerald-400" /><span className="text-xs font-semibold text-white">{step.title}</span></div><div className="text-[10px] text-slate-500 mt-2 leading-relaxed">{step.desc}</div></button>; })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="text-xs font-semibold text-white mb-3">当前领域的“工程使用卡” · {domain.title}</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            ['必须输入', domain.input],
            ['物理机理', domain.mechanism],
            ['优先证据', domain.evidence],
            ['应该产出', domain.output],
          ].map(([title, items]) => (
            <div key={String(title)} className="bg-slate-950 rounded-xl border border-slate-800 p-4">
              <div className="text-[11px] text-slate-400 font-semibold mb-2">{title}</div>
              <div className="space-y-2">{(items as string[]).map((x, i) => <div key={i} className="text-xs text-slate-300 leading-relaxed">• {x}</div>)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-emerald-800/40 rounded-xl p-5">
        <div className="flex items-center gap-2"><Gauge className="w-4 h-4 text-emerald-400" /><div className="text-xs font-semibold text-white">以后你实际遇到问题时，建议固定这样用</div></div>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-2 mt-4 text-xs">
          {[
            '1. 建工况：项目/阶段/客户/节点',
            '2. 填事实：Spec + 实测 + 条件 + 现象',
            '3. 上传原始证据：Scope/EMC/WCCA/温箱/供应商资料',
            '4. 生成分析：先看事实，不急着接受结论',
            '5. 做验证：只验证最能降低不确定性的变量',
            '6. 关环：决策 + RACI + 回归 + EDR',
          ].map((x, i) => <div key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-300 leading-relaxed"><span className="text-emerald-400 font-mono mr-1">{i+1}.</span>{x.replace(/^\d+\. /,'')}</div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => onNavigateTab('input')} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer">现在去填真实工程数据</button>
          <button onClick={() => onNavigateTab('patterns')} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer">直接看当前物理机理</button>
          <button onClick={() => onNavigateTab('docs')} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer">看受控文档 / EDR</button>
        </div>
      </div>
    </div>
  );
};
