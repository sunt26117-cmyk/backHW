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
import { DOMAIN_GUIDES, type DomainGuide } from '../content/domainGuides';
import { getDomainDataQuality, getEngineeringDomainLabel, resolveEngineeringDomain, resolveEngineeringDomains } from '../utils/scenarioDomainEngine';
import { selectMultiDomainLinks, selectAnalysisBasis, selectRiskSnapshot } from '../utils/analysisResultSelectors';

interface EngineeringWorkflowViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onNavigateTab: (tab: string) => void;
}



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
  const risk = selectRiskSnapshot(result);
  const crossDomainLinks = selectMultiDomainLinks(result);
  const analysisBasis = selectAnalysisBasis(result);
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
        {crossDomainLinks.length ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {crossDomainLinks.map((link, i) => (
              <div key={`${link.fromDomain}-${link.toDomain}-${i}`} className="rounded-lg bg-slate-950/50 border border-slate-800 p-2.5">
                <div className="text-[10px] font-semibold text-slate-300">{getEngineeringDomainLabel(link.fromDomain as any)} → {getEngineeringDomainLabel(link.toDomain as any)}</div>
                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{link.mechanism}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* WP6b：帮助抽屉只保留操作路径；问题事实/风险/证据详情分别回到 Facts / Pattern / Review 正式归属页。 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="text-xs font-semibold text-white mb-3">现在这一个工况怎么走</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">当前问题</div>
            <div className="text-xs text-slate-200 mt-1 line-clamp-3">{issue.failurePhenomenon || issue.engineeringConcern || '待填写工程问题'}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">当前缺口</div>
            <div className="text-xs text-amber-300 mt-1">{dataQuality.missingRequired.length ? dataQuality.missingRequired.join('、') : '关键必填证据已齐'}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">下一步入口</div>
            <div className="text-xs text-cyan-300 mt-1">先补事实与证据，再进入机理、方案与验证</div>
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
          {analysisBasis && <div className="mt-2 text-[10px] text-slate-500">规则字段 {analysisBasis.ruleInputs.length} · 实测 {analysisBasis.measuredInputs.length} · 计算输出 {analysisBasis.calculatedOutputs.length} · 固定模板骨架 {analysisBasis.fixedTemplateFields.length}</div>}
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
