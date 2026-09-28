import React from 'react';
import { X, GitBranch } from 'lucide-react';
import { useScenario } from '../contexts/ScenarioContext';
import { useAnalysis } from '../contexts/AnalysisContext';
import { useUI } from '../contexts/UIContext';
import TraceAuditView from './TraceAuditView';

const GlobalTraceAuditOverlay: React.FC = () => {
  const { traceAuditOpen, setTraceAuditOpen } = useUI();
  const { context, issue } = useScenario();
  const { result } = useAnalysis();
  if (!traceAuditOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="全局 Trace 审计">
      <div className="absolute inset-3 sm:inset-5 lg:inset-7 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><GitBranch className="h-4 w-4 text-cyan-400" /> 全局 Trace</div>
          <button type="button" onClick={() => setTraceAuditOpen(false)} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-300 hover:text-white cursor-pointer" aria-label="关闭 Trace"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5"><TraceAuditView context={context} issue={issue} result={result} /></div>
      </div>
    </div>
  );
};

export default GlobalTraceAuditOverlay;
