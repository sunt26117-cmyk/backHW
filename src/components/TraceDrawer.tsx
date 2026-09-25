import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronRight, GitBranch, X, FileSearch, ExternalLink } from 'lucide-react';
import { TraceInput, TraceNode } from '../types';
import { loadWaveforms, StoredWaveform } from '../utils/waveformStorage';
import { traceSourceLabel, traceVerdictLabel } from '../utils/trace';
import { WaveformPlot } from './WaveformPlot';
import TraceFlowDiagram from './TraceFlowDiagram';

interface TraceDrawerProps {
  open: boolean;
  traces: TraceNode[];
  title?: string;
  onClose: () => void;
}

const sourceClass: Record<string, string> = {
  MEASURED: 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300',
  IMPORTED: 'border-cyan-700/50 bg-cyan-950/30 text-cyan-300',
  USER_INPUT: 'border-blue-700/50 bg-blue-950/30 text-blue-300',
  ASSUMED_DEFAULT: 'border-amber-700/60 bg-amber-950/35 text-amber-300',
  SPEC_CONSTANT: 'border-violet-700/50 bg-violet-950/30 text-violet-300',
  DATASHEET: 'border-fuchsia-700/50 bg-fuchsia-950/30 text-fuchsia-300',
  TEXT_INFERRED: 'border-orange-700/50 bg-orange-950/30 text-orange-300',
  DERIVED: 'border-sky-700/50 bg-sky-950/30 text-sky-300',
};

const verdictClass: Record<string, string> = {
  PASS: 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300',
  MARGINAL: 'border-amber-700/50 bg-amber-950/30 text-amber-300',
  FAIL: 'border-orange-700/50 bg-orange-950/30 text-orange-300',
  CRITICAL: 'border-red-700/60 bg-red-950/35 text-red-300',
  INFO: 'border-slate-700 bg-slate-900 text-slate-300',
};

const TraceInputRow: React.FC<{ input: TraceInput; waveform?: StoredWaveform }> = ({ input, waveform }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-200">{input.label}</div>
        <div className="mt-1 font-mono text-sm font-semibold text-cyan-300 break-all">
          {String(input.value)}{input.unit ? ` ${input.unit}` : ''}
        </div>
      </div>
      <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-medium ${sourceClass[input.source] || sourceClass.USER_INPUT}`}>
        {traceSourceLabel(input.source)}
      </span>
    </div>
    {input.note && <div className="mt-2 text-[10px] leading-relaxed text-slate-500">{input.note}</div>}
    {input.evidenceId && (
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-slate-500 break-all">
        <ExternalLink className="h-3 w-3 shrink-0 text-cyan-500" /> evidenceId: {input.evidenceId}
      </div>
    )}
    {waveform && (
      <div className="mt-3 rounded-lg border border-cyan-900/60 bg-slate-950 p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-cyan-300">
          <span className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> 原始导入波形回链</span>
          <span className="font-mono text-slate-500">{waveform.fileName} · {waveform.channelName}</span>
        </div>
        <WaveformPlot time={waveform.time} samples={waveform.samples} markers={waveform.markers} title={waveform.role || input.label} height={190} maxPoints={700} />
      </div>
    )}
  </div>
);

const TraceNodeCard: React.FC<{ node: TraceNode; waveforms: Map<string, StoredWaveform>; depth?: number }> = ({ node, waveforms, depth = 0 }) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const verdict = node.verdict ? verdictClass[node.verdict] : verdictClass.INFO;
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/90 ${depth > 0 ? 'ml-3 border-l-2' : ''}`}>
      <button
        type="button"
        className="w-full px-4 py-3 text-left hover:bg-slate-800/60 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
              <span className="text-sm font-semibold text-white">{node.title}</span>
            </div>
            <div className="mt-1 pl-6 text-[10px] font-mono text-slate-500 break-all">{node.id}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-cyan-300">{String(node.value)}{node.unit ? ` ${node.unit}` : ''}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${verdict}`}>{traceVerdictLabel(node.verdict)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-4 space-y-4">
          {node.degraded && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/25 p-3 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
              <div><b className="text-amber-300">待实测/规格确认：</b>该节点直接计算链包含假设默认值或规格常量。当前数值可用于工程筛查，但不应被当作实测证据。</div>
            </div>
          )}

          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Inputs · 输入来源</div>
            <div className="space-y-2">
              {node.inputs.map((input) => <TraceInputRow key={input.key} input={input} waveform={input.evidenceId ? waveforms.get(input.evidenceId) : undefined} />)}
            </div>
          </section>

          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Formula · 确定性公式</div>
            <div className="rounded-lg border border-blue-800/50 bg-blue-950/15 p-3 text-xs leading-relaxed text-blue-100 font-mono whitespace-pre-wrap break-words">
              {node.formula || '本节点未声明公式'}
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/15 p-3">
              <div className="text-[10px] text-slate-500">Calculation · 计算结果</div>
              <div className="mt-1 font-mono text-lg font-semibold text-cyan-300">{String(node.value)}{node.unit ? ` ${node.unit}` : ''}</div>
            </div>
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/15 p-3">
              <div className="text-[10px] text-slate-500">Threshold · 判定边界</div>
              <div className="mt-1 font-mono text-lg font-semibold text-amber-300">
                {node.threshold ? `${node.threshold.value} ${node.threshold.unit}` : '未声明'}
              </div>
              {node.threshold && <div className="mt-1 text-[10px] text-slate-500">{node.threshold.label}</div>}
            </div>
          </section>

          <section className={`rounded-lg border p-3 ${verdict}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Verdict · 工程判定</div>
            <div className="mt-1 text-sm font-semibold">{traceVerdictLabel(node.verdict)}</div>
            {node.standardRef && <div className="mt-1 text-[10px] leading-relaxed opacity-80">边界依据：{node.standardRef}</div>}
          </section>

          {node.children?.length ? (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Children · 子追溯节点</div>
              <div className="space-y-2">{node.children.map((child) => <TraceNodeCard key={child.id} node={child} waveforms={waveforms} depth={depth + 1} />)}</div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
};

const TraceDrawer: React.FC<TraceDrawerProps> = ({ open, traces, title = '结论可追溯 Trace', onClose }) => {
  const [mode, setMode] = useState<'DETAIL' | 'FLOW'>('DETAIL');
  const [activeId, setActiveId] = useState<string | null>(null);
  const waveforms = useMemo(() => new Map(loadWaveforms().map((w) => [w.id, w])), [open]);
  const flat = useMemo(() => {
    const out: TraceNode[] = [];
    const visit = (nodes: TraceNode[]) => nodes.forEach((n) => { out.push(n); if (n.children?.length) visit(n.children); });
    visit(traces);
    return out;
  }, [traces]);
  const degradedCount = flat.filter((n) => n.degraded).length;
  const criticalCount = flat.filter((n) => n.verdict === 'CRITICAL' || n.verdict === 'FAIL').length;
  const activeFlow = flat.find((n) => n.id === activeId) || traces[0];

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!activeId && traces[0]) setActiveId(traces[0].id);
  }, [open, activeId, traces]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/65 cursor-default" aria-label="关闭 Trace" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl border-l border-slate-700 bg-slate-950 shadow-2xl flex flex-col" aria-label="Trace Drawer">
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/95 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-cyan-400" /><h2 className="text-sm font-semibold text-white">{title}</h2></div>
              <div className="mt-1 text-[10px] text-slate-500">确定性计算 → 输入来源 → 公式 → 阈值 → Verdict</div>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer" aria-label="关闭 Trace"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">节点 {flat.length}</span>
            {degradedCount > 0 && <span className="rounded border border-amber-700/50 bg-amber-950/20 px-2 py-1 text-amber-300">待确认 {degradedCount}</span>}
            {criticalCount > 0 && <span className="rounded border border-red-700/50 bg-red-950/20 px-2 py-1 text-red-300">FAIL/CRITICAL {criticalCount}</span>}
          </div>
          <div className="mt-3 flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button type="button" className={`flex-1 rounded-md px-3 py-1.5 text-xs cursor-pointer ${mode === 'DETAIL' ? 'bg-blue-600/25 text-blue-300 font-semibold' : 'text-slate-400 hover:bg-slate-900'}`} onClick={() => setMode('DETAIL')}>逐项 Trace</button>
            <button type="button" className={`flex-1 rounded-md px-3 py-1.5 text-xs cursor-pointer ${mode === 'FLOW' ? 'bg-cyan-600/25 text-cyan-300 font-semibold' : 'text-slate-400 hover:bg-slate-900'}`} onClick={() => setMode('FLOW')}><span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />因果流程图</span></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {traces.length === 0 ? (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/15 p-4 text-xs text-amber-200">当前 Pattern 没有可追溯节点。不要用 UI 文案补造 Trace；应先在确定性 Pattern Engine 声明真实输入与公式。</div>
          ) : mode === 'DETAIL' ? (
            <div className="space-y-3">{traces.map((node) => <TraceNodeCard key={node.id} node={node} waveforms={waveforms} />)}</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {flat.map((node) => (
                  <button key={node.id} type="button" onClick={() => setActiveId(node.id)} className={`rounded-md border px-2 py-1 text-[10px] cursor-pointer ${activeId === node.id ? 'border-cyan-600/70 bg-cyan-950/30 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'}`}>{node.title}</button>
                ))}
              </div>
              {activeFlow && <TraceFlowDiagram node={activeFlow} />}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default TraceDrawer;
