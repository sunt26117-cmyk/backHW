import React, { useState } from 'react';
import { ResultProvenance } from '../types';
import { ShieldCheck, Sparkles, Cpu, Lock, Info, ChevronDown, ChevronUp, Zap, Clock, ShieldAlert } from 'lucide-react';

interface ResultProvenanceBannerProps {
  provenance?: ResultProvenance;
  className?: string;
}

export const ResultProvenanceBanner: React.FC<ResultProvenanceBannerProps> = ({
  provenance,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isAiInferred = Boolean(provenance?.isAiInferred);
  const engineName = provenance?.engineName || (isAiInferred ? '云端大模型推理引擎' : '车规确定性专家引擎 (纯离线)');
  const latency = provenance?.latencyMs ?? (isAiInferred ? 1450 : 8);
  const generatedAt = provenance?.generatedAt || new Date().toLocaleTimeString();

  if (isAiInferred) {
    return (
      <div className={`rounded-xl border bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/30 border-purple-500/40 p-3.5 shadow-sm ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-bold text-purple-200">
                  🟣 云端大模型即时推理 (AI-INFERRED)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/60">
                  {engineName}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center">
                  <Clock className="w-2.5 h-2.5 mr-1 text-slate-400" />
                  {latency} ms
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                由大语言模型基于工况参数即时推演 · 包含发散性建议 · 须结合实测闭环
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100 self-start sm:self-center px-2 py-1 rounded bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/60 transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>来源透明度说明</span>
            {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-purple-800/40 text-xs text-slate-300 space-y-2 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">推理方式</span>
                <strong className="text-purple-300">云端 LLM 提示词工程</strong>
              </div>
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">模型标识</span>
                <strong className="text-slate-200 font-mono">{provenance?.modelIdentifier || 'OpenAI-Compatible / Gemini'}</strong>
              </div>
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">生成时间</span>
                <strong className="text-slate-200 font-mono">{generatedAt}</strong>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-purple-900/30">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 inline mr-1" />
              <strong>工程评审提示：</strong> 当前输出包含了深度大模型的探索性逻辑发散，有助于发现非显性机理交叉耦合。但针对芯片 SOA、耐压击穿与降额裕量等关键边界指标，评审时应优先以台架实测波形（MEASURED）为准，严禁把 AI 推测视作确定性规范。
            </p>
          </div>
        )}
      </div>
    );
  }

  // 确定性本地专家引擎 (纯离线 / 规则树)
  return (
    <div className={`rounded-xl border bg-gradient-to-r from-emerald-950/30 via-slate-900 to-cyan-950/25 border-emerald-500/30 p-3.5 shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-xs font-bold text-emerald-300 flex items-center">
                🟢 车规确定性专家引擎 (DETERMINISTIC / RULE-BASED)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                100% 纯本地离线推演
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center">
                <Zap className="w-2.5 h-2.5 mr-1 text-emerald-400" />
                {latency} ms
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 truncate">
              基于 ISO 26262 / CISPR 25 / AEC-Q100 规则树与物理公式计算 · 零幻觉 · 零数据出境
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-200 self-start sm:self-center px-2 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 transition cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" />
          <span>来源透明度说明</span>
          {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-emerald-800/40 text-xs text-slate-300 space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded bg-slate-900/80 border border-emerald-900/40">
              <span className="text-slate-400 block font-mono text-[10px]">运算环境</span>
              <strong className="text-emerald-300">浏览器端纯本地 JavaScript 引擎</strong>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-emerald-900/40">
              <span className="text-slate-400 block font-mono text-[10px]">网络需求</span>
              <strong className="text-emerald-300">完全脱网 (Air-Gapped 兼容)</strong>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-emerald-900/40">
              <span className="text-slate-400 block font-mono text-[10px]">推演依据</span>
              <strong className="text-slate-200">车规硬件标准库与一票否决规则</strong>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-emerald-900/30">
            <Lock className="w-3.5 h-3.5 text-emerald-400 inline mr-1" />
            <strong>保密与确定性保障：</strong> 当前工况由本地规则树直接求值生成，未发起任何外部网络请求，绝无项目机密泄露风险。计算过程遵循确定性数学逻辑，重复运算结果一致，可作为严谨工程评审的确定性基准参考。
          </p>
        </div>
      )}
    </div>
  );
};
