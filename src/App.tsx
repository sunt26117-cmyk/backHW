import React, { useState, useEffect } from 'react';
import { ProjectContext, IssueInput, CopilotAnalysisResult, AppTheme, ModelApiConfig, PresetScenario } from './types';
import { PRESET_SCENARIOS } from './data/presetScenarios';
import { runExpertAnalysis } from './data/expertEngine';
import { exportBackupJson, importBackupJson, exportMarkdownReport } from './utils/backupRestore';
import { loadCustomScenarios, saveCustomScenario, deleteCustomScenario } from './utils/scenarioStorage';
import { Navbar } from './components/Navbar';
import { ProjectContextView } from './components/ProjectContextView';
import { AnalysisFactView } from './components/AnalysisFactView';
import { OptionsComparisonView } from './components/OptionsComparisonView';
import { DecisionCockpitView } from './components/DecisionCockpitView';
import { RecommendationRaciView } from './components/RecommendationRaciView';
import { EngineeringDocsView } from './components/EngineeringDocsView';
import { EngineeringCalculatorView } from './components/EngineeringCalculatorView';
import { FirstScreen10sView } from './components/FirstScreen10sView';
import { BldcPatternEngineView } from './components/BldcPatternEngineView';
import { FunctionalSafetyReliabilityView } from './components/FunctionalSafetyReliabilityView';
import { VerificationLoopView } from './components/VerificationLoopView';
import { DesignReviewRegressionView } from './components/DesignReviewRegressionView';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import { ScenarioManageModal } from './components/ScenarioManageModal';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { EngineeringWorkflowView } from './components/EngineeringWorkflowView';

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('ECU Copilot page render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl border border-red-500/40 bg-red-950/30 p-6 text-sm text-red-200">
          <div className="font-semibold text-red-300 mb-2">页面渲染异常，已阻止白屏</div>
          <div className="text-red-200/80 break-words">{this.state.message || '未知运行时异常'}</div>
          <button
            className="mt-4 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            重试当前页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_MODEL_CONFIG: ModelApiConfig = {
  provider: 'builtin',
  baseUrl: '',
  apiKey: '',
  model: '车规确定性专家引擎 (纯离线)',
  temperature: 0.2,
  enabled: false,
};

export default function App() {
  const [customScenarios, setCustomScenarios] = useState<PresetScenario[]>(() => loadCustomScenarios());
  const [currentScenarioId, setCurrentScenarioId] = useState<string>(PRESET_SCENARIOS[0].id);
  const [context, setContext] = useState<ProjectContext>(PRESET_SCENARIOS[0].context);
  const [issue, setIssue] = useState<IssueInput>(PRESET_SCENARIOS[0].issue);
  const [result, setResult] = useState<CopilotAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const analysisRunId = React.useRef(0);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isScenarioManageOpen, setIsScenarioManageOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Detect if already launched in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsPwaInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsPwaInstalled(true);
      setDeferredInstallPrompt(null);
      showToast('已成功安装为手机独立应用！', 'success');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) {
      showToast('请点击浏览器右上角三个点，选择「安装应用」或「添加到主屏幕」', 'info');
      return;
    }
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setIsPwaInstalled(true);
      setDeferredInstallPrompt(null);
    }
  };

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Theme management with localStorage persistence
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('ecu_copilot_theme');
      if (saved === 'light' || saved === 'eyecare' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('ecu_copilot_theme', newTheme);
    } catch {}
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Model API configuration with localStorage persistence
  const [modelConfig, setModelConfigState] = useState<ModelApiConfig>(() => {
    try {
      const saved = localStorage.getItem('ecu_copilot_model_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse saved model config', e);
    }
    return DEFAULT_MODEL_CONFIG;
  });

  const handleSaveModelConfig = (newConfig: ModelApiConfig) => {
    setModelConfigState(newConfig);
    try {
      localStorage.setItem('ecu_copilot_model_config', JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Failed to persist model config', e);
    }
  };

  // Load initial analysis on mount
  useEffect(() => {
    runAnalysis(PRESET_SCENARIOS[0].context, PRESET_SCENARIOS[0].issue);
  }, []);

  const handleSelectScenario = (scenarioId: string, customScenario?: PresetScenario) => {
    setCurrentScenarioId(scenarioId);
    const found =
      customScenario ||
      customScenarios.find((sc) => sc.id === scenarioId) ||
      PRESET_SCENARIOS.find((sc) => sc.id === scenarioId);
    if (found) {
      setResult(null);
      setContext(found.context);
      const scenarioIssue = customScenario ? found.issue : { ...found.issue, measuredValueSource: found.issue.measuredValueSource || 'BENCHMARK' };
      setIssue(scenarioIssue);
      runAnalysis(found.context, scenarioIssue);
      showToast(`已成功载入工程案例：${found.title}`, 'info');
    }
  };

  const handleLoadSection14 = () => {
    const bldcScenario = PRESET_SCENARIOS.find((s) => s.id === 'bldc-motor-drive') || PRESET_SCENARIOS[0];
    setCurrentScenarioId(bldcScenario.id);
    setContext(bldcScenario.context);
    const benchmarkIssue = { ...bldcScenario.issue, measuredValueSource: bldcScenario.issue.measuredValueSource || 'BENCHMARK' };
    setIssue(benchmarkIssue);
    runAnalysis(bldcScenario.context, benchmarkIssue);
    setActiveTab('overview');
    showToast('已载入 Section 14 验收工况 (3800rpm BLDC 急停母线泵升 37.8V ｜ 15天)', 'success');
  };

  const handleSaveAsCustomScenario = (title: string, ctx: ProjectContext, iss: IssueInput) => {
    const id = `custom_${Date.now()}`;
    const newScenario: PresetScenario = {
      id,
      title,
      subtitle: `${ctx.projectPhase} 阶段 | ${ctx.asilLevel} | ${ctx.productType}`,
      icon: '⭐️',
      context: ctx,
      issue: iss,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    const updated = saveCustomScenario(newScenario);
    setCustomScenarios(updated);
    setCurrentScenarioId(id);
    setContext(ctx);
    setIssue(iss);
    runAnalysis(ctx, iss);
    showToast(`已成功保存并切换为自定义工况【${title}】`, 'success');
  };

  const handleDeleteCustomScenario = (scenarioId: string) => {
    const updated = deleteCustomScenario(scenarioId);
    setCustomScenarios(updated);
    if (currentScenarioId === scenarioId) {
      const fallback = PRESET_SCENARIOS[0];
      setCurrentScenarioId(fallback.id);
      setContext(fallback.context);
      setIssue(fallback.issue);
      runAnalysis(fallback.context, fallback.issue);
    }
    showToast('已删除该自定义工况', 'info');
  };

  const handleExportBackup = () => {
    exportBackupJson(context, issue, result);
    showToast('本地完整工程备份已成功导出为 JSON 文件', 'success');
  };

  const handleImportBackup = async (file: File) => {
    try {
      const imported = await importBackupJson(file);
      if (imported.context) setContext(imported.context);
      if (imported.issue) setIssue(imported.issue);
      if (imported.result) {
        setResult(imported.result);
      } else if (imported.context && imported.issue) {
        runAnalysis(imported.context, imported.issue);
      }
      showToast(`已成功从本地备份文件恢复 (${file.name})`, 'success');
    } catch (err: any) {
      showToast(`恢复失败: ${err.message || '文件格式不正确'}`, 'error');
    }
  };

  const handleExportMarkdown = () => {
    if (!result) {
      showToast('请先生成工程分析结果后再导出评审纪要', 'info');
      return;
    }
    exportMarkdownReport(context, issue, result);
    showToast('工程决策评审纪要 (CDR) 已导出为 Markdown 文件', 'success');
  };

  const runAnalysis = async (ctx = context, iss = issue) => {
    const runId = ++analysisRunId.current;
    setResult(null);
    setIsAnalyzing(true);
    const startTime = Date.now();

    // 1. 纯本地离线模式：未启用外部大模型或选择车规确定性专家引擎时，100% 浏览器本地运算，零网络请求
    if (!modelConfig.enabled || modelConfig.provider === 'builtin') {
      try {
        const localResult = runExpertAnalysis(ctx, iss);
        localResult.provenance = {
          executionMode: 'PURE_OFFLINE_LOCAL',
          engineName: '车规确定性专家引擎 (100% 纯本地离线推演)',
          isAiInferred: false,
          isDeterministicRule: true,
          generatedAt: new Date().toLocaleTimeString(),
          latencyMs: Date.now() - startTime,
          modelIdentifier: 'ECU-Hardware-RuleEngine-Deterministic-v4.2',
          transparencyNote: '本报告由本地车规物理公式库与标准规则树严格推演生成，0 网络请求，0 数据出境，无幻觉。',
        };
        if (runId === analysisRunId.current) setResult(localResult);
      } catch (err: any) {
        console.error('Local expert engine execution failed:', err);
        showToast(`本地专家引擎分析失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        if (runId === analysisRunId.current) setIsAnalyzing(false);
      }
      return;
    }

    // 2. 云端大模型在线推理模式 (DeepSeek / Qwen / Zhipu / Gemini)
    try {
      const response = await fetch('/api/copilot/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctx, issue: iss, modelConfig }),
      });

      if (response.ok) {
        const data = await response.json();
        const finalResult = data.result || data.data;
        if (finalResult) {
          if (!finalResult.provenance) {
            finalResult.provenance = {
              executionMode: 'ONLINE_AI_INFERRED',
              engineName: `云端大模型 (${modelConfig.model || 'OpenAI-Compatible'}) 即时推理`,
              isAiInferred: true,
              isDeterministicRule: false,
              generatedAt: new Date().toLocaleTimeString(),
              latencyMs: Date.now() - startTime,
              modelIdentifier: modelConfig.model || 'Cloud-LLM',
              transparencyNote: `本分析由云端大模型 [${modelConfig.model || 'AI'}] 基于输入参数即时推理生成，包含针对车规工况的探索性建议，建议结合物理实测验证。`,
            };
          }
          if (runId === analysisRunId.current) setResult(finalResult);
          setIsAnalyzing(false);
          return;
        }
      }

      // If backend offline or missing API key, fallback to deterministic expert engine
      const localResult = runExpertAnalysis(ctx, iss);
      localResult.provenance = {
        executionMode: 'PURE_OFFLINE_LOCAL',
        engineName: '车规确定性专家引擎 (云端未响应降级模式)',
        isAiInferred: false,
        isDeterministicRule: true,
        generatedAt: new Date().toLocaleTimeString(),
        latencyMs: Date.now() - startTime,
        modelIdentifier: 'Deterministic-RuleEngine-Fallback',
        transparencyNote: '由于云端模型未响应或未配置有效密钥，系统已自动平滑降级至本地确定性专家引擎，确保决策分析不中断。',
      };
      if (runId === analysisRunId.current) setResult(localResult);
      showToast('云端模型未响应，已自动平滑降级至本地确定性专家引擎', 'info');
    } catch (err) {
      console.warn('API route fallback to expert engine:', err);
      const localResult = runExpertAnalysis(ctx, iss);
      localResult.provenance = {
        executionMode: 'PURE_OFFLINE_LOCAL',
        engineName: '车规确定性专家引擎 (网络隔离保护)',
        isAiInferred: false,
        isDeterministicRule: true,
        generatedAt: new Date().toLocaleTimeString(),
        latencyMs: Date.now() - startTime,
        modelIdentifier: 'Deterministic-RuleEngine-Local',
        transparencyNote: '当前网络无法访问云端大模型，已启动本地离线引擎保障分析。',
      };
      if (runId === analysisRunId.current) setResult(localResult);
    } finally {
      if (runId === analysisRunId.current) setIsAnalyzing(false);
    }
  };

  const currentScenario =
    customScenarios.find((s) => s.id === currentScenarioId) ||
    PRESET_SCENARIOS.find((s) => s.id === currentScenarioId);

  return (
    <div className="ecu-app-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium animate-in fade-in slide-in-from-top-4 duration-200 backdrop-blur-md bg-slate-900/95 border-slate-700 text-slate-100">
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toastMessage.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Navigation */}
      <Navbar
        currentScenarioId={currentScenarioId}
        onSelectScenario={(id) => handleSelectScenario(id)}
        customScenarios={customScenarios}
        onOpenScenarioManage={() => setIsScenarioManageOpen(true)}
        isAnalyzing={isAnalyzing}
        onRunAnalysis={() => runAnalysis(context, issue)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        setTheme={setTheme}
        modelConfig={modelConfig}
        onOpenModelSettings={() => setIsModelModalOpen(true)}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onExportMarkdown={handleExportMarkdown}
        onDownloadOfflineHtml={() => {
          showToast('正在下载纯离线单文件版 HTML，下载后双击即可直接使用！', 'success');
          const a = document.createElement('a');
          a.href = '/api/download/offline-html';
          a.download = 'ECU_Hardware_Copilot_Offline.html';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
      />

      {/* Mobile PWA Install Banner */}
      {!isPwaInstalled && deferredInstallPrompt && (
        <div id="pwa-install-banner" className="bg-gradient-to-r from-blue-900/90 via-indigo-950/90 to-slate-900/90 border-b border-blue-500/30 px-4 py-2.5 text-xs flex items-center justify-between text-blue-100 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-base">📲</span>
            <span>
              检测到您正在使用移动设备，可一键安装为<strong>全屏独立车载应用</strong>（无需浏览器边框）。
            </span>
          </div>
          <button
            id="install-pwa-banner-btn"
            onClick={handleInstallClick}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-md shadow-sm transition whitespace-nowrap ml-3 cursor-pointer shrink-0"
          >
            立即安装 App
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0 px-3 sm:px-5 lg:px-6 2xl:px-8 py-5">
        <PageErrorBoundary key={activeTab}>
        {activeTab === 'workflow' && (
          <EngineeringWorkflowView
            context={context}
            issue={issue}
            result={result}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'overview' && (
          <FirstScreen10sView
            context={context}
            issue={issue}
            result={result}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'input' && (
          <ProjectContextView
            context={context}
            setContext={setContext}
            issue={issue}
            setIssue={setIssue}
            onAnalyze={() => {
              runAnalysis(context, issue);
              setActiveTab('facts');
            }}
            isAnalyzing={isAnalyzing}
            currentScenarioTitle={currentScenario?.title}
            isCustomScenario={currentScenario?.isCustom}
            onOpenScenarioManage={() => setIsScenarioManageOpen(true)}
          />
        )}

        {activeTab === 'facts' && (
          <AnalysisFactView
            result={result}
            onGoToOptions={() => setActiveTab('options')}
          />
        )}

        {activeTab === 'patterns' && (
          <BldcPatternEngineView
            key={`patterns-${currentScenarioId}`}
            context={context}
            issue={issue}
            result={result}
            onGoToDecisions={() => setActiveTab('cockpit')}
          />
        )}

        {activeTab === 'options' && (
          <OptionsComparisonView
            result={result}
            onGoToCockpit={() => setActiveTab('cockpit')}
          />
        )}

        {activeTab === 'cockpit' && (
          <DecisionCockpitView
            key={`cockpit-${currentScenarioId}`}
            result={result}
            onGoToRecommendation={() => setActiveTab('recommendation')}
            hwLeadStyle={context.hwLeadStyle || 'AGILE_DELIVERY'}
            onLeadStyleChange={(style) => setContext({ ...context, hwLeadStyle: style })}
            recurrenceCount={context.recurrenceCount || 0}
            daysRemaining={context.daysRemaining}
          />
        )}

        {activeTab === 'verification' && (
          <VerificationLoopView
            key={`verification-${currentScenarioId}`}
            context={context}
            issue={issue}
            result={result}
            daysRemaining={context.daysRemaining}
          />
        )}

        {activeTab === 'safety' && (
          <FunctionalSafetyReliabilityView
            key={`safety-${currentScenarioId}`}
            context={context}
            issue={issue}
            result={result}
          />
        )}

        {activeTab === 'review' && (
          <DesignReviewRegressionView
            key={`review-${currentScenarioId}`}
            context={context}
            issue={issue}
            result={result}
            onLoadScenarioSection14={handleLoadSection14}
          />
        )}

        {activeTab === 'recommendation' && (
          <RecommendationRaciView
            context={context}
            issue={issue}
            result={result}
            onGoToDocs={() => setActiveTab('docs')}
          />
        )}

        {activeTab === 'docs' && (
          <EngineeringDocsView result={result} context={context} issue={issue} />
        )}

        {activeTab === 'calc' && (
          <EngineeringCalculatorView context={context} issue={issue} />
        )}
        </PageErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 transition-colors duration-200">
        <div className="w-full px-4 sm:px-6 lg:px-7 2xl:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ECU Hardware Risk & Decision Copilot · 车载电子硬件技术决策系统</span>
          <span>ISO 26262 · IATF 16949 · AEC-Q · CISPR 25 · C-T-S-Q-L Engine</span>
        </div>
      </footer>

      {/* Model API Settings Modal */}
      <ModelSettingsModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        config={modelConfig}
        onSaveConfig={handleSaveModelConfig}
      />

      {/* Scenario Manage Modal */}
      <ScenarioManageModal
        isOpen={isScenarioManageOpen}
        onClose={() => setIsScenarioManageOpen(false)}
        currentContext={context}
        currentIssue={issue}
        customScenarios={customScenarios}
        presetScenarios={PRESET_SCENARIOS}
        currentScenarioId={currentScenarioId}
        onSelectScenario={(id, customSc) => handleSelectScenario(id, customSc)}
        onSaveAsCustomScenario={handleSaveAsCustomScenario}
        onDeleteCustomScenario={handleDeleteCustomScenario}
      />
    </div>
  );
}
