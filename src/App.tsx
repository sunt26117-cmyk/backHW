import React, { Component, useState, useEffect } from 'react';
import { ProjectContext, IssueInput, CopilotAnalysisResult, AppTheme, ModelApiConfig, PresetScenario } from './types';
import { PRESET_SCENARIOS } from './data/presetScenarios';
import { runExpertAnalysis } from './data/expertEngine';
import { exportBackupJson, importBackupJson, exportMarkdownReport } from './utils/backupRestore';
import { loadCustomScenarios, saveCustomScenario, deleteCustomScenario } from './utils/scenarioStorage';
import { loadAnalysisResult, saveAnalysisResult, deleteAnalysisResult } from './utils/analysisStorage';
import { orderScenarios, saveScenarioOrder, resetScenarioOrder } from './utils/scenarioLibrary';
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

interface PageErrorBoundaryProps {
  children: React.ReactNode;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
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

const CURRENT_SCENARIO_STORAGE_KEY = 'ecu_copilot_current_scenario_id';

export default function App() {
  const [customScenarios, setCustomScenarios] = useState<PresetScenario[]>(() => orderScenarios(PRESET_SCENARIOS, loadCustomScenarios()).custom);
  const [presetScenarios, setPresetScenarios] = useState<PresetScenario[]>(() => orderScenarios(PRESET_SCENARIOS, loadCustomScenarios()).presets);
  
  // Restore current scenario ID from localStorage on mount
  const [currentScenarioId, setCurrentScenarioId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(CURRENT_SCENARIO_STORAGE_KEY);
      if (savedId) {
        const customs = loadCustomScenarios();
        const all = [...customs, ...orderScenarios(PRESET_SCENARIOS, customs).presets];
        if (all.some((s) => s.id === savedId)) return savedId;
      }
    } catch {}
    return orderScenarios(PRESET_SCENARIOS, loadCustomScenarios()).presets[0]?.id || PRESET_SCENARIOS[0].id;
  });

  // Restore context matching the selected scenario
  const [context, setContext] = useState<ProjectContext>(() => {
    try {
      const savedId = localStorage.getItem(CURRENT_SCENARIO_STORAGE_KEY);
      if (savedId) {
        const customs = loadCustomScenarios();
        const ordered = orderScenarios(PRESET_SCENARIOS, customs);
        const found = ordered.custom.find((s) => s.id === savedId) || ordered.presets.find((s) => s.id === savedId);
        if (found) return found.context;
      }
    } catch {}
    return orderScenarios(PRESET_SCENARIOS, loadCustomScenarios()).presets[0]?.context || PRESET_SCENARIOS[0].context;
  });

  // Restore issue matching the selected scenario
  const [issue, setIssue] = useState<IssueInput>(() => {
    try {
      const savedId = localStorage.getItem(CURRENT_SCENARIO_STORAGE_KEY);
      if (savedId) {
        const customs = loadCustomScenarios();
        const ordered = orderScenarios(PRESET_SCENARIOS, customs);
        const found = ordered.custom.find((s) => s.id === savedId) || ordered.presets.find((s) => s.id === savedId);
        if (found) return found.issue;
      }
    } catch {}
    return orderScenarios(PRESET_SCENARIOS, loadCustomScenarios()).presets[0]?.issue || PRESET_SCENARIOS[0].issue;
  });

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const analysisRunId = React.useRef(0);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isScenarioManageOpen, setIsScenarioManageOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(false);

  // Auto-sync custom scenario edits to localStorage so content is never lost on refresh or switch
  useEffect(() => {
    const isCustom = customScenarios.some((s) => s.id === currentScenarioId);
    if (!isCustom) return;

    const timer = setTimeout(() => {
      const target = customScenarios.find((s) => s.id === currentScenarioId);
      if (target) {
        const updatedItem: PresetScenario = {
          ...target,
          title: context.projectName || target.title,
          subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
          context,
          issue,
        };
        const updatedList = saveCustomScenario(updatedItem);
        setCustomScenarios(updatedList);
        setLastSavedAt(new Date().toLocaleTimeString());
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [context, issue, currentScenarioId]);

  // Persist current scenario ID whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_SCENARIO_STORAGE_KEY, currentScenarioId);
    } catch {}
  }, [currentScenarioId]);

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

  // Restore the last completed analysis for the current scenario.
  // Only generate a new analysis when this scenario truly has no persisted result.
  useEffect(() => {
    const savedResult = loadAnalysisResult(currentScenarioId);
    if (savedResult) {
      setResult(savedResult);
      return;
    }
    runAnalysis(context, issue);
  }, []);

  const handleReorderScenarios = (kind: 'presets' | 'custom', ids: string[]) => {
    saveScenarioOrder(kind, ids);
    const ordered = orderScenarios(PRESET_SCENARIOS, customScenarios);
    setPresetScenarios(ordered.presets);
    setCustomScenarios(ordered.custom);
    showToast(kind === 'presets' ? '典型工况顺序已保存' : '我的工况顺序已保存', 'success');
  };

  const handleResetScenarioOrder = () => {
    resetScenarioOrder();
    const ordered = orderScenarios(PRESET_SCENARIOS, customScenarios);
    setPresetScenarios(ordered.presets);
    setCustomScenarios(ordered.custom);
    showToast('已恢复系统默认工况分类与顺序', 'info');
  };

  const handleSelectScenario = (scenarioId: string, customScenario?: PresetScenario) => {
    // Before switching, if currently editing a custom scenario, sync its latest state immediately
    const isCurrentCustom = customScenarios.some((s) => s.id === currentScenarioId);
    if (isCurrentCustom) {
      const existing = customScenarios.find((s) => s.id === currentScenarioId);
      if (existing) {
        saveCustomScenario({
          ...existing,
          title: context.projectName || existing.title,
          subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
          context,
          issue,
        });
      }
    }

    setCurrentScenarioId(scenarioId);
    try {
      localStorage.setItem(CURRENT_SCENARIO_STORAGE_KEY, scenarioId);
    } catch {}

    const freshCustoms = loadCustomScenarios();
    setCustomScenarios(orderScenarios(PRESET_SCENARIOS, freshCustoms).custom);

    const found =
      customScenario ||
      freshCustoms.find((sc) => sc.id === scenarioId) ||
      presetScenarios.find((sc) => sc.id === scenarioId);
    if (found) {
      setContext(found.context);
      const scenarioIssue = customScenario ? found.issue : { ...found.issue, measuredValueSource: found.issue.measuredValueSource || 'BENCHMARK' };
      setIssue(scenarioIssue);

      const savedResult = loadAnalysisResult(found.id);
      if (savedResult) {
        setResult(savedResult);
        showToast(`已恢复工程案例及上次分析结果：${found.title}`, 'info');
      } else {
        setResult(null);
        runAnalysis(found.context, scenarioIssue, found.id);
        showToast(`已成功载入工程案例：${found.title}`, 'info');
      }
    }
  };

  const handleManualSaveCustomScenario = () => {
    const isCustom = customScenarios.some((s) => s.id === currentScenarioId);
    if (isCustom) {
      const target = customScenarios.find((s) => s.id === currentScenarioId);
      if (target) {
        const updatedItem: PresetScenario = {
          ...target,
          title: context.projectName || target.title,
          subtitle: `${context.projectPhase} 阶段 | ${context.asilLevel} | ${context.productType}`,
          context,
          issue,
        };
        const updatedList = saveCustomScenario(updatedItem);
        setCustomScenarios(updatedList);
        saveScenarioOrder('custom', customScenarios.map((item) => item.id));
        const timeStr = new Date().toLocaleTimeString();
        setLastSavedAt(timeStr);
        showToast(`已成功保存当前工程【${updatedItem.title}】修改 (${timeStr})`, 'success');
      }
    } else {
      // If currently on a preset, prompt to save as custom
      handleSaveAsCustomScenario(
        context.projectName ? `${context.projectName} (自建工程)` : '我的自建工程',
        context,
        issue
      );
    }
  };

  const handleLoadSection14 = () => {
    const bldcScenario = presetScenarios.find((s) => s.id === 'bldc-motor-drive') || presetScenarios[0];
    setCurrentScenarioId(bldcScenario.id);
    setContext(bldcScenario.context);
    const benchmarkIssue = { ...bldcScenario.issue, measuredValueSource: bldcScenario.issue.measuredValueSource || 'BENCHMARK' };
    setIssue(benchmarkIssue);
    runAnalysis(bldcScenario.context, benchmarkIssue, bldcScenario.id);
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
    saveScenarioOrder('custom', updated.map((item) => item.id));
    setCustomScenarios(updated);
    setCurrentScenarioId(id);
    try {
      localStorage.setItem(CURRENT_SCENARIO_STORAGE_KEY, id);
    } catch {}
    setContext(ctx);
    setIssue(iss);
    setLastSavedAt(new Date().toLocaleTimeString());
    runAnalysis(ctx, iss, id);
    showToast(`已成功保存并切换为自定义工况【${title}】`, 'success');
  };

  const handleDeleteCustomScenario = (scenarioId: string) => {
    const target = customScenarios.find((s) => s.id === scenarioId);
    const targetTitle = target?.title || '自定义工程';
    const updated = deleteCustomScenario(scenarioId);
    deleteAnalysisResult(scenarioId);
    setCustomScenarios(updated);
    if (currentScenarioId === scenarioId) {
      const fallback = presetScenarios[0];
      setCurrentScenarioId(fallback.id);
      try {
        localStorage.setItem(CURRENT_SCENARIO_STORAGE_KEY, fallback.id);
      } catch {}
      setContext(fallback.context);
      setIssue(fallback.issue);
      runAnalysis(fallback.context, fallback.issue, fallback.id);
    }
    showToast(`已删除工程【${targetTitle}】`, 'info');
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
        saveAnalysisResult(currentScenarioId, imported.result);
      } else if (imported.context && imported.issue) {
        runAnalysis(imported.context, imported.issue, currentScenarioId);
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

  const runAnalysis = async (ctx = context, iss = issue, scenarioId = currentScenarioId) => {
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
        if (runId === analysisRunId.current) {
          setResult(localResult);
          saveAnalysisResult(scenarioId, localResult);
        }
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
          if (runId === analysisRunId.current) {
            setResult(finalResult);
            saveAnalysisResult(scenarioId, finalResult);
          }
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
      if (runId === analysisRunId.current) {
        setResult(localResult);
        saveAnalysisResult(scenarioId, localResult);
      }
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
      if (runId === analysisRunId.current) {
        setResult(localResult);
        saveAnalysisResult(scenarioId, localResult);
      }
    } finally {
      if (runId === analysisRunId.current) setIsAnalyzing(false);
    }
  };

  const currentScenario =
    customScenarios.find((s) => s.id === currentScenarioId) ||
    presetScenarios.find((s) => s.id === currentScenarioId);

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
        presetScenarios={presetScenarios}
        onOpenScenarioManage={() => setIsScenarioManageOpen(true)}
        isAnalyzing={isAnalyzing}
        onRunAnalysis={() => runAnalysis(context, issue)}
        onDeleteCustomScenario={(id) => handleDeleteCustomScenario(id)}
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
            onSaveCustomScenario={handleManualSaveCustomScenario}
            onDeleteCustomScenario={() => handleDeleteCustomScenario(currentScenarioId)}
            lastSavedAt={lastSavedAt}
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
        presetScenarios={presetScenarios}
        onReorderScenarios={handleReorderScenarios}
        onResetScenarioOrder={handleResetScenarioOrder}
        currentScenarioId={currentScenarioId}
        onSelectScenario={(id, customSc) => handleSelectScenario(id, customSc)}
        onSaveAsCustomScenario={handleSaveAsCustomScenario}
        onDeleteCustomScenario={handleDeleteCustomScenario}
      />
    </div>
  );
}
