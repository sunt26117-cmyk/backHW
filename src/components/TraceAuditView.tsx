import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Filter, GitBranch, ShieldAlert } from 'lucide-react';
import { CopilotAnalysisResult, IssueInput, ProjectContext, TraceNode } from '../types';
import { evaluateAllBldcPatterns } from '../data/bldcPatternEngine';
import { deriveBldcEvaluationInput } from '../utils/scenarioDerived';
import { readMeasuredNumber } from '../utils/unifiedStateExtractor';
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import TraceDrawer from './TraceDrawer';

interface TraceAuditViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
}

type AuditFilter = 'ALL' | 'DEGRADED' | 'CRITICAL_FAIL';
interface TraceAuditRow { patternId: string; patternName: string; node: TraceNode; }

const TraceAuditView: React.FC<TraceAuditViewProps> = ({ context, issue, result }) => {
  const [filter, setFilter] = useState<AuditFilter>('ALL');
  const [drawerTrace, setDrawerTrace] = useState<TraceNode[] | null>(null);
  const domain = resolveEngineeringDomain(issue);
  const isBldc = domain === 'BLDC';
  const input = useMemo(() => deriveBldcEvaluationInput(context, issue), [context, issue]);
  const usable = issue.measuredValueSource === 'BENCHMARK'
    || ['rpm', 'busVoltagePeakV', 'vdsRatingV', 'currentPeakA'].every((key) => readMeasuredNumber(issue.measuredValues, key) !== undefined)
    || /\b\d+(?:\.\d+)?\s*rpm/i.test(`${issue.testCondition} ${issue.actualMeasurement}`);
  const rows = useMemo<TraceAuditRow[]>(() => {
    if (!isBldc || !usable) return [];
    return evaluateAllBldcPatterns(input).flatMap((pattern) => (pattern.trace || []).map((node) => ({
      patternId: pattern.id, patternName: pattern.name, node,
    })));
  }, [input, isBldc, usable]);

  const filteredRows = useMemo(() => rows.filter(({ node }) => {
    if (filter === 'DEGRADED') return node.degraded;
    if (filter === 'CRITICAL_FAIL') return node.verdict === 'CRITICAL' || node.verdict === 'FAIL';
    return true;
  }), [rows, filter]);

  const degraded = rows.filter((r) => r.node.degraded).length;
  const criticalFail = rows.filter((r) => r.node.verdict === 'CRITICAL' || r.node.verdict === 'FAIL').length;
  const passed = rows.filter((r) => r.node.verdict === 'PASS').length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-cyan-800/50 bg-cyan-950/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300"><GitBranch className="h-4 w-4" /> Trace Audit · 确定性结论追溯</div>
            <h1 className="mt-1 text-lg font-bold text-white">输入 → 公式 → 结果 → 阈值 → Verdict</h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">这里审计的不是 LLM 文案，而是确定性 Pattern Engine 当前真正参与计算的 TraceNode。假设值、器件规格常量、导入波形证据和 FAIL/CRITICAL 均单独可见。</p>
          </div>
          <div className="text-right text-[10px] text-slate-500">当前工程 · {context.projectName}<div className="mt-1 text-slate-400">{domain} · {context.projectPhase}</div></div>
        </div>
      </div>

      {!isBldc ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">
          当前工况域为 <span className="font-mono text-cyan-300">{domain}</span>。本阶段 Trace Audit 先覆盖 BLDC P001/P002/P003/P014/P016 确定性模式，其它领域不伪造 Trace。
        </div>
      ) : !usable ? (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-5 text-xs text-amber-100">
          <div className="flex items-center gap-2 font-semibold text-amber-300"><AlertTriangle className="h-4 w-4" /> 当前输入不足，暂不计算 Pattern Trace</div>
          <div className="mt-2 leading-relaxed">至少需要转速、母线/供电边界、Vds 额定值、峰值电流等结构化输入或明确 benchmark 工况。这里宁可显示“缺输入”，也不把 UI 默认值包装成工程证据。</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Trace 节点" value={rows.length} tone="text-cyan-300" />
            <Stat label="PASS" value={passed} tone="text-emerald-300" icon={<CheckCircle2 className="h-4 w-4" />} />
            <Stat label="含假设/规格" value={degraded} tone="text-amber-300" icon={<AlertTriangle className="h-4 w-4" />} />
            <Stat label="FAIL / CRITICAL" value={criticalFail} tone="text-red-300" icon={<ShieldAlert className="h-4 w-4" />} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Filter className="h-3.5 w-3.5 text-blue-400" /> 审计筛选</div>
              <div className="flex flex-wrap gap-1.5">
                {([['ALL','全部'], ['DEGRADED','只看待确认'], ['CRITICAL_FAIL','只看 FAIL / CRITICAL']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-md border px-2.5 py-1.5 text-[10px] cursor-pointer ${filter === id ? 'border-blue-600/70 bg-blue-950/40 text-blue-300 font-semibold' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {filteredRows.map(({ patternId, patternName, node }) => (
              <button key={node.id} type="button" onClick={() => setDrawerTrace([node])} className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-slate-700 hover:bg-slate-800/70 cursor-pointer transition">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{patternId}</span>
                      <span className="text-xs font-medium text-white">{patternName}</span>
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-500 break-all">{node.id}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {node.degraded && <span className="rounded border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[9px] font-semibold text-amber-300">待实测/规格确认</span>}
                    <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[9px] font-semibold text-slate-300">{node.verdict || 'INFO'}</span>
                    <FileSearch className="h-4 w-4 text-cyan-400" />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <AuditCell label="结果" value={`${String(node.value)}${node.unit ? ` ${node.unit}` : ''}`} />
                  <AuditCell label="输入" value={`${node.inputs.length} 个`} />
                  <AuditCell label="判定边界" value={node.threshold ? `${node.threshold.value} ${node.threshold.unit}` : '未声明'} />
                </div>
              </button>
            ))}
            {!filteredRows.length && <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center text-xs text-slate-500">当前筛选条件没有 Trace 节点。</div>}
          </div>
        </>
      )}

      {result?.analysisBasis && <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-[10px] text-slate-500">Trace Audit 与 AI 分析是两条不同证据链：这里不把 AI 推理文字冒充为确定性计算输入。AI 的 calculatedOutputs 仍应回指其对应的本地计算证据。</div>}
      <TraceDrawer open={!!drawerTrace} traces={drawerTrace || []} title="Trace Audit · 节点详情" onClose={() => setDrawerTrace(null)} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone: string; icon?: React.ReactNode }> = ({ label, value, tone, icon }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <div className="text-[10px] text-slate-500">{label}</div>
    <div className={`mt-1 flex items-center gap-1.5 text-xl font-bold font-mono ${tone}`}>{icon}{value}</div>
  </div>
);

const AuditCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
    <div className="text-[9px] text-slate-500">{label}</div>
    <div className="mt-1 text-xs font-mono text-slate-200 break-words">{value}</div>
  </div>
);

export default TraceAuditView;
