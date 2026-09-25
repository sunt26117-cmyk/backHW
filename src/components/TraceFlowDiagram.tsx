import React from 'react';
import { ArrowDown, CheckCircle2, AlertTriangle, CircleAlert, Info, Calculator, Gauge } from 'lucide-react';
import { TraceNode } from '../types';
import { traceSourceLabel, traceVerdictLabel } from '../utils/trace';

interface TraceFlowDiagramProps {
  node: TraceNode;
}

const verdictClass: Record<NonNullable<TraceNode['verdict']>, string> = {
  PASS: 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300',
  MARGINAL: 'border-amber-700/50 bg-amber-950/30 text-amber-300',
  FAIL: 'border-orange-700/50 bg-orange-950/30 text-orange-300',
  CRITICAL: 'border-red-700/60 bg-red-950/30 text-red-300',
  INFO: 'border-slate-700 bg-slate-900 text-slate-300',
};

const sourceClass: Record<string, string> = {
  MEASURED: 'border-emerald-700/50 bg-emerald-950/25 text-emerald-300',
  IMPORTED: 'border-cyan-700/50 bg-cyan-950/25 text-cyan-300',
  USER_INPUT: 'border-blue-700/50 bg-blue-950/25 text-blue-300',
  ASSUMED_DEFAULT: 'border-amber-700/60 bg-amber-950/30 text-amber-300',
  SPEC_CONSTANT: 'border-violet-700/50 bg-violet-950/25 text-violet-300',
};

const ValueBox: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`rounded-lg border border-slate-800 bg-slate-950/90 p-3 ${className}`}>
    <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
    <div className="mt-1 text-sm font-mono font-semibold text-white break-words">{value}</div>
  </div>
);

const TraceFlowDiagram: React.FC<TraceFlowDiagramProps> = ({ node }) => {
  const verdict = node.verdict ? verdictClass[node.verdict] : verdictClass.INFO;
  return (
    <div className="space-y-2">
      <div className={`rounded-xl border p-4 ${node.degraded ? 'border-amber-700/60 bg-amber-950/20' : 'border-cyan-700/50 bg-cyan-950/15'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">{node.title}</h3>
            </div>
            <div className="mt-1 text-[10px] font-mono text-slate-500">Trace ID · {node.id}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${verdict}`}>
              {traceVerdictLabel(node.verdict)}
            </span>
            {node.degraded && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                含假设/规格常量
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Gauge className="h-3.5 w-3.5 text-blue-400" /> 输入
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {node.inputs.map((input) => (
            <div key={input.key} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate-300">{input.label}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${sourceClass[input.source] || sourceClass.USER_INPUT}`}>
                  {traceSourceLabel(input.source)}
                </span>
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-cyan-300">
                {String(input.value)}{input.unit ? ` ${input.unit}` : ''}
              </div>
              {input.note && <div className="mt-1 text-[10px] leading-relaxed text-slate-500">{input.note}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      <ValueBox
        label="确定性公式 / 物理关系"
        value={node.formula || '本节点未声明公式'}
        className="border-blue-700/40 bg-blue-950/15"
      />

      <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      <div className="grid gap-2 md:grid-cols-2">
        <ValueBox
          label="计算结果"
          value={<>{String(node.value)}{node.unit ? ` ${node.unit}` : ''}</>}
          className="border-cyan-700/50"
        />
        {node.threshold ? (
          <ValueBox
            label={node.threshold.label}
            value={<>{node.threshold.value} {node.threshold.unit}</>}
            className="border-amber-700/50 bg-amber-950/15"
          />
        ) : (
          <ValueBox label="判定边界" value="未声明" className="border-slate-800" />
        )}
      </div>

      <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      <div className={`rounded-xl border p-4 ${verdict}`}>
        <div className="flex items-center gap-2 text-xs font-semibold">
          {node.verdict === 'CRITICAL' || node.verdict === 'FAIL' ? <CircleAlert className="h-4 w-4" /> : node.verdict === 'PASS' ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          判定 · {traceVerdictLabel(node.verdict)}
        </div>
        <div className="mt-1 text-[10px] leading-relaxed opacity-90">
          {node.standardRef || '未声明标准/器件边界，请回到具体工程规范或器件数据手册。'}
        </div>
      </div>

      {node.children?.map((child) => (
        <div key={child.id} className="ml-2 mt-3 border-l-2 border-slate-800 pl-3">
          <TraceFlowDiagram node={child} />
        </div>
      ))}
    </div>
  );
};

export default TraceFlowDiagram;
