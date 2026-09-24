import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CopilotAnalysisResult, IssueInput, ModelApiConfig, ProjectContext } from '../types';
import { runExpertAnalysis } from '../data/expertEngine';
import { loadAnalysisResult, saveAnalysisResult, deleteAnalysisResult } from '../utils/analysisStorage';

type AnalysisValue = { result: CopilotAnalysisResult | null; setResult: React.Dispatch<React.SetStateAction<CopilotAnalysisResult | null>>; isAnalyzing: boolean; runAnalysis: (ctx?: ProjectContext, iss?: IssueInput, scenarioId?: string) => Promise<void>; clearAnalysis: (scenarioId: string) => void; };
const AnalysisContext = createContext<AnalysisValue | null>(null);

export function AnalysisProvider({ children, context, issue, currentScenarioId, modelConfig, showToast, autoRestore = true }: { children: React.ReactNode; context: ProjectContext; issue: IssueInput; currentScenarioId: string; modelConfig: ModelApiConfig; showToast: (text: string, type?: 'success'|'info'|'error') => void; autoRestore?: boolean; }) {
  const [result, setResult] = useState<CopilotAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const runId = useRef(0);

  const runAnalysis = async (ctx = context, iss = issue, scenarioId = currentScenarioId) => {
    const id = ++runId.current; setResult(null); setIsAnalyzing(true); const start = Date.now();
    if (!modelConfig.enabled || modelConfig.provider === 'builtin') {
      try {
        const local = runExpertAnalysis(ctx, iss);
        local.provenance = { executionMode: 'PURE_OFFLINE_LOCAL', engineName: '车规确定性专家引擎 (100% 纯本地离线推演)', isAiInferred: false, isDeterministicRule: true, generatedAt: new Date().toLocaleTimeString(), latencyMs: Date.now()-start, modelIdentifier: 'ECU-Hardware-RuleEngine-Deterministic-v4.2', transparencyNote: '本报告由本地车规物理公式库与标准规则树严格推演生成，0 网络请求，0 数据出境，无幻觉。' };
        if (id === runId.current) { setResult(local); saveAnalysisResult(scenarioId, local); }
      } catch (e: any) { showToast(`本地专家引擎分析失败：${e?.message || '未知错误'}`, 'error'); }
      finally { if (id === runId.current) setIsAnalyzing(false); }
      return;
    }
    try {
      const response = await fetch('/api/copilot/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ context: ctx, issue: iss, modelConfig }) });
      if (response.ok) {
        const data = await response.json(); const finalResult = data.result || data.data;
        if (finalResult) {
          if (!finalResult.provenance) finalResult.provenance = { executionMode:'ONLINE_AI_INFERRED', engineName:`云端大模型 (${modelConfig.model || 'OpenAI-Compatible'}) 即时推理`, isAiInferred:true, isDeterministicRule:false, generatedAt:new Date().toLocaleTimeString(), latencyMs:Date.now()-start, modelIdentifier:modelConfig.model || 'Cloud-LLM', transparencyNote:`本分析由云端大模型 [${modelConfig.model || 'AI'}] 基于输入参数即时推理生成，包含针对车规工况的探索性建议，建议结合物理实测验证。` };
          if (id === runId.current) { setResult(finalResult); saveAnalysisResult(scenarioId, finalResult); }
          setIsAnalyzing(false); return;
        }
      }
      const local = runExpertAnalysis(ctx, iss); local.provenance = { executionMode:'PURE_OFFLINE_LOCAL', engineName:'车规确定性专家引擎 (云端未响应降级模式)', isAiInferred:false, isDeterministicRule:true, generatedAt:new Date().toLocaleTimeString(), latencyMs:Date.now()-start, modelIdentifier:'Deterministic-RuleEngine-Fallback', transparencyNote:'由于云端模型未响应或未配置有效密钥，系统已自动平滑降级至本地确定性专家引擎，确保决策分析不中断。' };
      if (id === runId.current) { setResult(local); saveAnalysisResult(scenarioId, local); } showToast('云端模型未响应，已自动平滑降级至本地确定性专家引擎', 'info');
    } catch (err) {
      const local = runExpertAnalysis(ctx, iss); local.provenance = { executionMode:'PURE_OFFLINE_LOCAL', engineName:'车规确定性专家引擎 (网络隔离保护)', isAiInferred:false, isDeterministicRule:true, generatedAt:new Date().toLocaleTimeString(), latencyMs:Date.now()-start, modelIdentifier:'Deterministic-RuleEngine-Local', transparencyNote:'当前网络无法访问云端大模型，已启动本地离线引擎保障分析。' };
      if (id === runId.current) { setResult(local); saveAnalysisResult(scenarioId, local); }
    } finally { if (id === runId.current) setIsAnalyzing(false); }
  };

  useEffect(() => {
    if (!autoRestore) return;
    const saved = loadAnalysisResult(currentScenarioId);
    if (saved) setResult(saved); else void runAnalysis(context, issue, currentScenarioId);
    return () => { runId.current += 1; };
  }, [currentScenarioId]);

  return <AnalysisContext.Provider value={{ result, setResult, isAnalyzing, runAnalysis, clearAnalysis: (id) => { deleteAnalysisResult(id); setResult(null); } }}>{children}</AnalysisContext.Provider>;
}
export function useAnalysis() { const value = useContext(AnalysisContext); if (!value) throw new Error('useAnalysis must be used inside AnalysisProvider'); return value; }
