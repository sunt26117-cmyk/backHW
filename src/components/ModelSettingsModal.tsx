import React, { useState } from 'react';
import { ModelApiConfig, ModelProvider } from '../types';
import {
  X,
  Cpu,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
  Server,
  ShieldCheck,
  ExternalLink,
  Sliders,
} from 'lucide-react';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ModelApiConfig;
  onSaveConfig: (newConfig: ModelApiConfig) => void;
}

interface ProviderPreset {
  id: ModelProvider;
  name: string;
  badge: string;
  baseUrl: string;
  defaultModel: string;
  recommendedModels: string[];
  description: string;
  docsUrl: string;
  placeholderKey: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Gemini 2.5 Flash / Pro',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    recommendedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    description: '支持 Google Gemini 最新多模态与超长上下文模型，适合车载系统全场景推演。支持服务端环境变量 GEMINI_API_KEY 自动授权。',
    docsUrl: 'https://ai.google.dev',
    placeholderKey: 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (或留空使用服务端环境变量)',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (深度求索)',
    badge: '推荐 / 强逻辑',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
    description: '支持 DeepSeek-V3 核心架构及 R1 深度推导模型，针对复杂工程归因与 RACI 推演极佳。',
    docsUrl: 'https://platform.deepseek.com',
    placeholderKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    id: 'qwen',
    name: '阿里云通义千问 (DashScope)',
    badge: '阿里车规生态',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    recommendedModels: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-72b-instruct'],
    description: '阿里云 DashScope OpenAI 兼容规范，对中文车规术语、VDA 标准、主机厂要求具备深刻理解。',
    docsUrl: 'https://dashscope.console.aliyun.com',
    placeholderKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM-4)',
    badge: '清华自研模型',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    recommendedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
    description: '自研高精度推理模型，擅长工程文档归纳、特批报告生成及软硬件边界推演。',
    docsUrl: 'https://open.bigmodel.cn',
    placeholderKey: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxx',
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Moonshot / Kimi)',
    badge: '长文本长上下文',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    recommendedModels: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    description: '具备超强长上下文吞吐能力，适合大批量元器件规格书 (Datasheet) 联合分析。',
    docsUrl: 'https://platform.moonshot.cn',
    placeholderKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    badge: '聚合高速推理',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    recommendedModels: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    description: '国内高并发云端模型聚合托管平台，提供低延迟的 DeepSeek 和 Qwen 推理服务。',
    docsUrl: 'https://siliconflow.cn',
    placeholderKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容网关',
    badge: '企业内网 / 本地',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:14b',
    recommendedModels: ['qwen2.5:14b', 'deepseek-r1:14b', 'custom-llm'],
    description: '支持私有化部署的 Ollama / vLLM / FastChat 或企业内部合规私网大模型代理。',
    docsUrl: 'https://ollama.com',
    placeholderKey: '内网网关通常无需 key 或填写自定义 token',
  },
  {
    id: 'builtin',
    name: '100% 离线车规专家引擎',
    badge: '纯本地 / 免配 Key',
    baseUrl: '',
    defaultModel: '车规确定性专家引擎',
    recommendedModels: ['车规确定性专家引擎 (纯离线)', 'ISO 26262 专家规则'],
    description: '100% 本地纯离线运行的车规级专家系统，基于物理机理、ISO 26262、WCCA 与领导博弈矩阵，无需外网 API，零外泄风险。',
    docsUrl: '',
    placeholderKey: '系统内置 100% 离线运行，无需任何 API Key',
  },
];

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [activeProvider, setActiveProvider] = useState<ModelProvider>(config.provider);
  const [baseUrl, setBaseUrl] = useState<string>(config.baseUrl);
  const [apiKey, setApiKey] = useState<string>(config.apiKey);
  const [model, setModel] = useState<string>(config.model);
  const [temperature, setTemperature] = useState<number>(config.temperature ?? 0.2);
  const [enabled, setEnabled] = useState<boolean>(config.enabled ?? true);
  const [showKey, setShowKey] = useState<boolean>(false);

  // Test connection state
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message?: string;
    latency?: number;
  }>({ status: 'idle' });

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === activeProvider) || PROVIDER_PRESETS[0];

  const handleSelectProvider = (provId: ModelProvider) => {
    setActiveProvider(provId);
    const preset = PROVIDER_PRESETS.find((p) => p.id === provId);
    if (preset) {
      if (provId === 'builtin') {
        setBaseUrl('');
        setModel(preset.defaultModel);
      } else {
        setBaseUrl(preset.baseUrl);
        setModel(preset.defaultModel);
      }
    }
    setTestResult({ status: 'idle' });
  };

  const handleTestConnection = async () => {
    if (activeProvider === 'builtin') {
      setTestResult({
        status: 'success',
        message: '内置引擎就绪，包含双轨车规专家规则引擎保底防护。',
        latency: 12,
      });
      return;
    }

    if (activeProvider !== 'gemini' && (!baseUrl || !apiKey || !model)) {
      setTestResult({
        status: 'error',
        message: '请先填写完整的 Base URL、API Key 以及模型名称。',
      });
      return;
    }
    if (activeProvider === 'gemini' && !model) {
      setTestResult({
        status: 'error',
        message: '请指定 Gemini 模型名称 (如 gemini-2.5-flash)。',
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: 'idle' });

    try {
      const response = await fetch('/api/copilot/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          baseUrl,
          apiKey,
          model,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({
          status: 'success',
          message: data.message || `连接成功！响应: "${data.reply}"`,
          latency: data.latency,
        });
      } else {
        setTestResult({
          status: 'error',
          message: data.error || '连通性测试未通过，请检查 Key 或模型名称是否正确。',
          latency: data.latency,
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: `网络请求失败: ${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const newConfig: ModelApiConfig = {
      provider: activeProvider,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      temperature,
      enabled: activeProvider === 'builtin' ? false : enabled,
    };
    onSaveConfig(newConfig);
    onClose();
  };

  const handleResetToBuiltin = () => {
    handleSelectProvider('builtin');
    setApiKey('');
    setEnabled(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                模型 API 调用与自定义推理配置
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  支持中国本土模型
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                支持 DeepSeek、通义千问、智谱 GLM、Moonshot 及任意兼容 OpenAI 规范的私有化网关
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Provider Selection Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
              选择模型提供商 / 平台 (Provider)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = activeProvider === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectProvider(preset.id)}
                    className={`text-left p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-slate-100 shadow-md shadow-blue-900/20'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs truncate text-slate-100">{preset.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </div>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300 self-start border border-slate-600/50">
                      {preset.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Details & Inputs */}
          {activeProvider === 'builtin' ? (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 space-y-2">
              <div className="flex items-center text-blue-300 font-semibold gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                当前激活：系统内置引擎 (Gemini + 车规确定性专家引擎)
              </div>
              <p className="text-slate-400 leading-relaxed">
                无需配置任何第三方 API 密钥。如果遇到外网访问受限或配额限制，系统将无缝激活内置的
                <strong className="text-slate-200"> 车规硬件确定性规则引擎</strong>
                ，保障 WCCA、EMC、热仿真与 RACI 矩阵分析永远可用。
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/80">
              {/* Provider description banner */}
              <div className="flex items-start justify-between gap-2 text-xs text-slate-300 pb-2 border-b border-slate-700/60">
                <p className="text-slate-300 leading-relaxed">{currentPreset.description}</p>
                {currentPreset.docsUrl && (
                  <a
                    href={currentPreset.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium underline"
                  >
                    获取 Key <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  API 端点 (Base URL)
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  服务端会自动适配 <code className="text-slate-300">/chat/completions</code> 路由后缀。
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  API 密钥 (API Key)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={currentPreset.placeholderKey}
                    className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  密钥仅存储在您的本地浏览器端与本次会话代理中，绝不上传到任何外部不受信服务器。
                </p>
              </div>

              {/* Model Name & Quick Pick */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  模型名称 (Model Identifier)
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
                {currentPreset.recommendedModels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[11px] text-slate-400">快速填入推荐模型:</span>
                    {currentPreset.recommendedModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModel(m)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          model === m
                            ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Temperature & Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-700/60">
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-300 mb-1">
                    <span className="flex items-center gap-1">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      生成温度 (Temperature):
                    </span>
                    <span className="font-mono text-blue-400 font-bold">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    车规工程推荐 0.1~0.3，降低发散性，确保硬件判定的一致性。
                  </p>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-200">
                      启用此自定义模型接管分析请求
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1 ml-6">
                    勾选后，点击主界面“执行风险与决策分析”将直通此模型。
                  </p>
                </div>
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-2 border-t border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !apiKey}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-medium disabled:opacity-50 cursor-pointer transition"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>正在测试 API 连通性...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>测试 API 连通性与延迟</span>
                    </>
                  )}
                </button>

                {testResult.status !== 'idle' && (
                  <div
                    className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 max-w-full ${
                      testResult.status === 'success'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-red-500/10 text-red-300 border-red-500/30'
                    }`}
                  >
                    {testResult.status === 'success' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="truncate">{testResult.message}</span>
                    {testResult.latency !== undefined && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 font-mono">
                        {testResult.latency}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetToBuiltin}
            className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
          >
            恢复为系统内置引擎
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-900/30 cursor-pointer transition"
            >
              保存并应用模型配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
