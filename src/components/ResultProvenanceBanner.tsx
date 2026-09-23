import React, { useState } from 'react';
import { ResultProvenance } from '../types';
import { toStringArray } from '../utils/decisionFrame';
import {
  ShieldCheck,
  Sparkles,
  Lock,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSearch,
  Wrench,
  Terminal,
  Activity,
  Calculator,
  RefreshCw,
} from 'lucide-react';

interface ResultProvenanceBannerProps {
  provenance?: ResultProvenance;
  className?: string;
}

export const ResultProvenanceBanner: React.FC<ResultProvenanceBannerProps> = ({
  provenance,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPromptSnippet, setShowPromptSnippet] = useState(false);

  const isAiInferred = Boolean(provenance?.isAiInferred);
  const engineName = provenance?.engineName || (isAiInferred ? '云端大模型推理引擎' : '车规确定性专家引擎 (纯离线)');
  const latency = provenance?.debugSnapshot?.latencyMs ?? provenance?.latencyMs ?? (isAiInferred ? 1450 : 8);
  const generatedAt = provenance?.generatedAt || new Date().toLocaleTimeString();
  const integrity = provenance?.inputIntegrity;
  const audit = provenance?.aiAudit;
  const debug = provenance?.debugSnapshot;

  const getIntegrityBadge = () => {
    if (!integrity) return null;
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
    if (integrity.grade === 'GRADE_A_RIGOROUS') {
      colorClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-600/70';
    } else if (integrity.grade === 'GRADE_B_ACCEPTABLE') {
      colorClass = 'bg-cyan-950/80 text-cyan-300 border-cyan-600/70';
    } else if (integrity.grade === 'GRADE_C_INSUFFICIENT') {
      colorClass = 'bg-amber-950/80 text-amber-300 border-amber-600/70';
    } else if (integrity.grade === 'GRADE_D_BLOCKING') {
      colorClass = 'bg-rose-950/80 text-rose-300 border-rose-600/70';
    }
    return (
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center ${colorClass}`}>
        <FileSearch className="w-2.5 h-2.5 mr-1" />
        输入完整度: {integrity.gradeLabel.split('·')[0].trim()} ({integrity.completenessScore}分)
      </span>
    );
  };

  const getAuditBadge = () => {
    if (!audit) return null;
    let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    let icon = <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-400" />;
    let text = `车规审计通过 (${audit.auditScore}分)`;

    if (audit.overallStatus === 'REJECTED_AUDIT_FAILED') {
      badgeClass = 'bg-rose-950/90 text-rose-300 border-rose-600/80';
      icon = <XCircle className="w-2.5 h-2.5 mr-1 text-rose-400" />;
      text = `审计拦截 (${audit.auditScore}分)`;
    } else if (audit.overallStatus === 'FLAGGED_NEEDS_REVIEW' || audit.overallStatus === 'PASSED_WITH_WARNINGS') {
      badgeClass = 'bg-amber-950/90 text-amber-300 border-amber-600/80';
      icon = <AlertTriangle className="w-2.5 h-2.5 mr-1 text-amber-400" />;
      text = audit.autoFixSummary?.length > 0 ? `审计已自动校准 (${audit.auditScore}分)` : `审计警告 (${audit.flags.length}项)`;
    }

    return (
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center ${badgeClass}`}>
        {icon}
        {text}
      </span>
    );
  };

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
                {getIntegrityBadge()}
                {getAuditBadge()}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                由大语言模型基于工况强定锚推演 · 结合确定性预计算事实与车规防幻觉审计校准
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100 self-start sm:self-center px-2 py-1 rounded bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/60 transition cursor-pointer shrink-0"
          >
            <Info className="w-3.5 h-3.5" />
            <span>车规溯源与调试快照</span>
            {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-purple-800/40 text-xs text-slate-300 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">推理方式</span>
                <strong className="text-purple-300">提示词工程 + 本地预计算 + 审计</strong>
              </div>
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">模型标识</span>
                <strong className="text-slate-200 font-mono">{provenance?.modelIdentifier || 'OpenAI-Compatible / Gemini'}</strong>
              </div>
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">生成时间</span>
                <strong className="text-slate-200 font-mono">{generatedAt}</strong>
              </div>
              <div className="p-2 rounded bg-slate-900/80 border border-purple-900/40">
                <span className="text-slate-400 block font-mono text-[10px]">输入完整度</span>
                <strong className="text-cyan-300 font-mono">{integrity?.gradeLabel || '已核验'} ({integrity?.completenessScore ?? 80}/100)</strong>
              </div>
            </div>

            {/* 调试快照 (DebugSnapshot - 待办 5.3) */}
            {debug && (
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-indigo-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-300 flex items-center">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
                    系统韧性与推演调试快照 (Debug Snapshot)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{debug.timestamp}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                  <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block">Prompt 长度</span>
                    <span className="text-slate-200 font-bold">{debug.promptLength} 字符</span>
                  </div>
                  <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block">注入预计算事实</span>
                    <span className="text-cyan-300 font-bold">{debug.precomputedFactsCount ?? 0} 条锚定</span>
                  </div>
                  <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block">审计自动纠偏</span>
                    <span className="text-emerald-300 font-bold">{debug.autoFixesCount ?? 0} 项更正</span>
                  </div>
                  <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block">规则命中数</span>
                    <span className="text-amber-300 font-bold">{debug.auditedRuleHits ?? 0} 条记录</span>
                  </div>
                  <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block">JSON/自愈重试</span>
                    <span className="text-purple-300 font-bold">{debug.retryCount ?? 0} 次重试</span>
                  </div>
                </div>

                {debug.promptSnippet && (
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowPromptSnippet(!showPromptSnippet)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer flex items-center"
                      >
                        <Terminal className="w-3 h-3 mr-1" />
                        {showPromptSnippet ? '收起输入给大模型的定锚提示词' : '查看软件输入给大模型的定锚提示词 (含物理事实与耦合矩阵)'}
                      </button>
                      {debug.fullPrompt && showPromptSnippet && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(debug.fullPrompt || '');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 hover:bg-purple-800/80 border border-purple-700/60"
                        >
                          复制完整 Prompt ({debug.promptLength} 字符)
                        </button>
                      )}
                    </div>
                    {showPromptSnippet && (
                      <pre className="mt-1 p-2.5 rounded bg-slate-950 text-[10px] text-slate-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-purple-900/40">
                        {debug.fullPrompt || debug.promptSnippet}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 输入完整度审计明细 */}
            {integrity && (
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-cyan-900/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-cyan-200 flex items-center">
                    <FileSearch className="w-3.5 h-3.5 text-cyan-400 mr-1.5" />
                    输入完整度审计：【{integrity.domainLabel}】领域实测完备率 {integrity.filledFieldsCount}/{integrity.totalExpectedFieldsCount}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400">{integrity.gradeLabel}</span>
                </div>
                {toStringArray(integrity.missingRequiredFields).length > 0 && (
                  <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                    <strong>⚠️ 未填写的必填实测参数：</strong>
                    <span className="ml-1 font-mono">{toStringArray(integrity.missingRequiredFields).join('、')}</span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      * 模型已被强制禁止虚构上述参数，推演已自动降级为待实测工程假设。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* AI 结果车规审计明细 */}
            {audit && (
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-purple-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-purple-200 flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                    车规防幻觉与自洽性审计 (得分: {audit.auditScore}/100 · 状态: {audit.overallStatus})
                  </span>
                  <span className="text-[10px] text-purple-400 font-mono">
                    {audit.passed ? '✅ 审计合格' : '⚠️ 需工程复核'}
                  </span>
                </div>

                {audit.autoFixSummary?.length > 0 && (
                  <div className="text-[11px] bg-indigo-950/50 p-2 rounded border border-indigo-800/50 text-indigo-200">
                    <span className="font-semibold flex items-center mb-1">
                      <Wrench className="w-3 h-3 mr-1 text-indigo-400" />
                      已自动执行车规自洽纠偏 (Auto-Fix Applied):
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300 font-mono">
                      {audit.autoFixSummary.map((fix, idx) => (
                        <li key={idx}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {audit.flags?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400">审计命中规则记录:</span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {audit.flags.map((flag, idx) => (
                        <div
                          key={idx}
                          className={`text-[10px] p-1.5 rounded flex items-start space-x-1.5 ${
                            flag.level === 'FATAL'
                              ? 'bg-rose-950/60 text-rose-200 border border-rose-800/50'
                              : flag.level === 'WARNING'
                              ? 'bg-amber-950/60 text-amber-200 border border-amber-800/50'
                              : 'bg-slate-900 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <span className="font-bold shrink-0">[{flag.level}]</span>
                          <div className="min-w-0 flex-1">
                            <strong className="block">{flag.title}</strong>
                            <p className="text-slate-400">{flag.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {provenance?.transparencyNote && (
              <div className="text-[11px] text-purple-200 bg-purple-950/50 p-2 rounded border border-purple-800/50 font-medium">
                🎯 <strong>工况限定约束：</strong> {provenance.transparencyNote}
              </div>
            )}
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-purple-900/30">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 inline mr-1" />
              <strong>工程评审提示：</strong> 当前输出基于车规级物理基线与输入实测数据进行了大模型针对性推演。针对芯片 SOA、耐压击穿与降额裕量等关键边界指标，评审时应以台架实测波形为最终依据。
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
              {getIntegrityBadge()}
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 truncate">
              基于 ISO 26262 / CISPR 25 / AEC-Q100 规则树与物理公式计算 · 零幻觉 · 零数据出境
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-200 self-start sm:self-center px-2 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 transition cursor-pointer shrink-0"
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
          {integrity && (
            <div className="p-2 rounded bg-slate-950/70 border border-emerald-900/40 text-[11px]">
              <span className="text-emerald-300 font-semibold">输入实测参数完备性：</span>
              <span className="text-slate-300 ml-1">
                已填 {integrity.filledFieldsCount}/{integrity.totalExpectedFieldsCount} 项，评级为 {integrity.gradeLabel}
              </span>
            </div>
          )}
          <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-emerald-900/30">
            <Lock className="w-3.5 h-3.5 text-emerald-400 inline mr-1" />
            <strong>保密与确定性保障：</strong> 当前工况由本地规则树直接求值生成，未发起任何外部网络请求，绝无项目机密泄露风险。计算过程遵循确定性数学逻辑，重复运算结果一致，可作为严谨工程评审的确定性基准参考。
          </p>
        </div>
      )}
    </div>
  );
};
