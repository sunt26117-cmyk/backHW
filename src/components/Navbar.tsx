import React, { useState, useRef } from 'react';
import {
  ShieldAlert,
  Cpu,
  Sparkles,
  FolderOpen,
  RefreshCw,
  SlidersHorizontal,
  Moon,
  Sun,
  Leaf,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Save,
  Download,
  Upload,
  FileText,
  ShieldCheck,
  FolderPlus,
  Globe2,
} from 'lucide-react';

import { PRESET_SCENARIOS } from '../data/presetScenarios';
import { AppTheme, ModelApiConfig, PresetScenario } from '../types';

interface NavbarProps {
  currentScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  customScenarios?: PresetScenario[];
  onOpenScenarioManage: () => void;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  modelConfig: ModelApiConfig;
  onOpenModelSettings: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onExportMarkdown: () => void;
  onDownloadOfflineHtml?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScenarioId,
  onSelectScenario,
  customScenarios = [],
  onOpenScenarioManage,
  isAnalyzing,
  onRunAnalysis,
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  modelConfig,
  onOpenModelSettings,
  onExportBackup,
  onImportBackup,
  onExportMarkdown,
  onDownloadOfflineHtml,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const getModelBadge = () => {
    if (!modelConfig.enabled || modelConfig.provider === 'builtin') {
      return {
        label: '100% 本地离线车规专家引擎 (免配 Key / 无外泄 / 免管理员权限)',
        short: '100% 离线专家引擎',
        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        icon: '🛡️',
      };
    }
    switch (modelConfig.provider) {
      case 'deepseek':
        return {
          label: `DeepSeek: ${modelConfig.model}`,
          short: modelConfig.model.includes('reasoner') ? 'DeepSeek-R1' : 'DeepSeek-V3',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          icon: '⚡',
        };
      case 'qwen':
        return {
          label: `通义千问: ${modelConfig.model}`,
          short: '通义千问',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: '🌐',
        };
      case 'zhipu':
        return {
          label: `智谱 GLM: ${modelConfig.model}`,
          short: '智谱 GLM',
          color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          icon: '🧠',
        };
      case 'moonshot':
        return {
          label: `月之暗面: ${modelConfig.model}`,
          short: 'Moonshot',
          color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          icon: '🌙',
        };
      case 'siliconflow':
        return {
          label: `硅基流动: ${modelConfig.model}`,
          short: '硅基流动',
          color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          icon: '🚀',
        };
      case 'custom':
        return {
          label: `自定义 API: ${modelConfig.model}`,
          short: modelConfig.model,
          color: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
          icon: '🔌',
        };
      default:
        return {
          label: '100% 离线确定性引擎',
          short: '离线引擎',
          color: 'bg-slate-700 text-slate-300 border-slate-600',
          icon: '⚙️',
        };
    }
  };

  const badgeInfo = getModelBadge();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 transition-colors duration-200">
      <div className="w-full px-3 sm:px-5 lg:px-6 2xl:px-8 ecu-topbar-row">
        <div className="grid grid-cols-[minmax(250px,auto)_minmax(0,1fr)] 2xl:grid-cols-[minmax(290px,1fr)_minmax(420px,1.45fr)_auto] items-center min-h-16 gap-3">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-slate-100">ECU Copilot</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                  v1.5 Engineering OS
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono hidden sm:inline-block">
                  C-T-S-Q-L
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                车载硬件开发风险评估与工程决策系统
              </p>
            </div>
          </div>

          {/* Controls: Model Settings + Theme Switcher + Scenario + Primary CTA */}
          <div className="flex items-center justify-end gap-2 sm:gap-2.5 min-w-0 overflow-hidden">
            {/* Model Settings Trigger */}
            <button
              id="model-settings-btn"
              onClick={onOpenModelSettings}
              title={`当前模型配置: ${badgeInfo.label} (点击切换/配置模型 API)`}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${badgeInfo.color}`}
            >
              <span className="text-xs">{badgeInfo.icon}</span>
              <span className="hidden md:inline truncate max-w-[120px] lg:max-w-[160px]">
                {badgeInfo.short}
              </span>
              <SlidersHorizontal className="w-3.5 h-3.5 opacity-70 ml-0.5" />
            </button>

            {/* Theme Selector Popover */}
            <div className="relative">
              <button
                id="theme-selector-btn"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer"
                title="切换界面配色 (深色 / 浅色 / 护眼绿)"
              >
                {theme === 'dark' && <Moon className="w-3.5 h-3.5 text-blue-400" />}
                {theme === 'light' && <Sun className="w-3.5 h-3.5 text-amber-400" />}
                {theme === 'eyecare' && <Leaf className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline font-medium">
                  {theme === 'dark' && '曜石黑'}
                  {theme === 'light' && '纯净白'}
                  {theme === 'eyecare' && '豆沙绿'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showThemeMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowThemeMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-44 rounded-xl bg-slate-900 border border-slate-700 shadow-xl py-1 z-40 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      选择界面配色
                    </div>

                    {/* Dark */}
                    <button
                      onClick={() => {
                        setTheme('dark');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800 transition cursor-pointer ${
                        theme === 'dark' ? 'text-blue-400 font-semibold bg-slate-800/60' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Moon className="w-3.5 h-3.5 text-blue-400" />
                        <div>
                          <div>曜石黑科技 (深色)</div>
                          <div className="text-[10px] text-slate-500 font-normal">当前经典暗黑仪表台</div>
                        </div>
                      </div>
                      {theme === 'dark' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </button>

                    {/* Light */}
                    <button
                      onClick={() => {
                        setTheme('light');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800 transition cursor-pointer ${
                        theme === 'light' ? 'text-blue-400 font-semibold bg-slate-800/60' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <div>
                          <div>典雅工程白 (浅色)</div>
                          <div className="text-[10px] text-slate-500 font-normal">高清晰技术白皮书风格</div>
                        </div>
                      </div>
                      {theme === 'light' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </button>

                    {/* Eye-care */}
                    <button
                      onClick={() => {
                        setTheme('eyecare');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800 transition cursor-pointer ${
                        theme === 'eyecare' ? 'text-emerald-400 font-semibold bg-slate-800/60' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                        <div>
                          <div>柔和豆沙绿 (护眼)</div>
                          <div className="text-[10px] text-slate-500 font-normal">长时审图无眩光抗疲劳</div>
                        </div>
                      </div>
                      {theme === 'eyecare' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Scenario Dropdown and Manage Button */}
            <div className="flex items-center space-x-1.5 hidden sm:flex">
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0" />
                <span className="text-slate-400 mr-2 hidden lg:inline">工程工况:</span>
                <select
                  value={currentScenarioId}
                  onChange={(e) => onSelectScenario(e.target.value)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer pr-2 max-w-[130px] lg:max-w-[170px] truncate"
                >
                  {customScenarios.length > 0 && (
                    <optgroup label="⭐️ 我的自定义工况">
                      {customScenarios.map((sc) => (
                        <option key={sc.id} value={sc.id} className="bg-slate-900 text-emerald-300">
                          ⭐️ {sc.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="📋 系统典型工况">
                    {PRESET_SCENARIOS.map((sc) => (
                      <option key={sc.id} value={sc.id} className="bg-slate-900 text-slate-200">
                        {sc.title}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* New/Manage Scenario Button */}
              <button
                id="scenario-manage-btn"
                onClick={onOpenScenarioManage}
                title="新建空白工况、另存当前或管理自定义工况库"
                className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden xl:inline">新建/管理</span>
              </button>
            </div>

            {/* Hidden File Input for Importing Backup */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportBackup(file);
                  e.target.value = '';
                }
              }}
            />

            {/* Local Backup & Export Menu Popover */}
            <div className="relative">
              <button
                id="backup-menu-btn"
                onClick={() => setShowBackupMenu(!showBackupMenu)}
                className="flex items-center space-x-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-600/50 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
                title="保存当前分析到本地备份文件，或从本地文件恢复（无需联网，绝对数据安全）"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">本地备份/导出</span>
                <span className="sm:hidden">备份</span>
                <ChevronDown className="w-3 h-3 text-emerald-400/80" />
              </button>

              {showBackupMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowBackupMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-2 z-40 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                      <span>本地备份与离线归档</span>
                      <span className="text-[10px] text-emerald-400 flex items-center">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        100% 本地安全
                      </span>
                    </div>

                    {/* 1. 导出完整备份 JSON */}
                    <button
                      id="export-backup-json-btn"
                      onClick={() => {
                        onExportBackup();
                        setShowBackupMenu(false);
                      }}
                      className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-slate-800/80 transition cursor-pointer text-slate-200"
                    >
                      <Download className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-emerald-300">保存到本地备份 (.json)</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          打包导出当前项目参数、实测事实、C-T-S-Q-L评分与领导博弈矩阵，供随时回溯。
                        </div>
                      </div>
                    </button>

                    {/* 2. 导入本地备份 JSON */}
                    <button
                      id="import-backup-json-btn"
                      onClick={() => {
                        setShowBackupMenu(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-slate-800/80 transition cursor-pointer text-slate-200 border-t border-slate-800/60"
                    >
                      <Upload className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-blue-300">导入本地备份恢复 (.json)</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          从本地备份文件一键恢复所有上下文及推演结果，跨电脑协作零障碍。
                        </div>
                      </div>
                    </button>

                    {/* 3. 导出技术白皮书 Markdown */}
                    <button
                      id="export-markdown-report-btn"
                      onClick={() => {
                        onExportMarkdown();
                        setShowBackupMenu(false);
                      }}
                      className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-slate-800/80 transition cursor-pointer text-slate-200 border-t border-slate-800/60"
                    >
                      <FileText className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-purple-300">导出决策白皮书报告 (.md)</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          生成正式工程报告文档，含物理机理公式、RACI门禁、PM邮件与受控特批单。
                        </div>
                      </div>
                    </button>

                    {/* 4. 下载纯离线单文件 HTML (双击即用) */}
                    <a
                      id="download-offline-html-btn"
                      href="/api/download/offline-html"
                      download="ECU_Hardware_Copilot_Offline.html"
                      onClick={() => {
                        setShowBackupMenu(false);
                        if (onDownloadOfflineHtml) onDownloadOfflineHtml();
                      }}
                      className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-slate-800/80 transition cursor-pointer text-slate-200 border-t border-slate-800/60 bg-blue-950/20"
                    >
                      <Globe2 className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                          <span>下载纯离线单文件版 (.html)</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">断网双击即用</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          打包为单文件，拷到内网电脑或手机上直接双击打开，离线专家推演，联网自动用 AI。
                        </div>
                      </div>
                    </a>

                    {/* Clear SW Cache & Hard Reload */}
                    <button
                      id="clear-cache-reload-btn"
                      onClick={async () => {
                        setShowBackupMenu(false);
                        try {
                          if ('caches' in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map((k) => caches.delete(k)));
                          }
                          if ('serviceWorker' in navigator) {
                            const regs = await navigator.serviceWorker.getRegistrations();
                            await Promise.all(regs.map((r) => r.unregister()));
                          }
                        } catch (e) {
                          console.error(e);
                        }
                        window.location.reload();
                      }}
                      className="w-full px-3 py-2 flex items-start gap-2.5 text-left hover:bg-slate-800/80 transition cursor-pointer text-slate-200 border-t border-slate-800/60"
                    >
                      <RefreshCw className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-amber-300">清除浏览器缓存并强制更新</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          若手机端显示旧版内容，点击此项注销 Service Worker 并重载最新版本。
                        </div>
                      </div>
                    </button>


                    <div className="mt-1 pt-1.5 px-3 border-t border-slate-800 text-[9px] text-slate-500">
                      💡 提示：所有计算与备份均在浏览器本地内存完成，无需外部网络和管理员特权。
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Run Analysis CTA */}
            <button
              id="run-analysis-btn"
              onClick={onRunAnalysis}
              disabled={isAnalyzing}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg transition shadow-md shadow-blue-900/30 disabled:opacity-60 cursor-pointer shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">多维推理中...</span>
                  <span className="sm:hidden">推理中</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">执行风险与决策分析</span>
                  <span className="sm:hidden">执行决策</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Workflow Navigation Bar */}
        <div className="ecu-workflow-ribbon border-t border-slate-800/80 pt-1.5 pb-2">
          {/* Mobile Fast-Jump Dropdown (Especially useful for Samsung S23 Ultra / mobile screens) */}
          <div className="md:hidden flex items-center gap-2 mb-1.5 px-0.5">
            <span className="text-[11px] text-slate-400 font-semibold shrink-0">快捷选模块:</span>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 text-xs text-blue-300 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer shadow-inner"
            >
              {[
                { id: 'workflow', label: '0. 工程工作流' },
                { id: 'overview', label: '🌟 10秒第一屏决策' },
                { id: 'input', label: '1. 统一工程输入' },
                { id: 'facts', label: '2. 事实证据与追溯' },
                { id: 'patterns', label: '3. 物理机理 / 场景引擎' },
                { id: 'options', label: '4. 候选方案与残余风险' },
                { id: 'cockpit', label: '5. C-T-S-Q-L 决策驾驶舱' },
                { id: 'verification', label: '6. 验证闭环 & VOI' },
                { id: 'safety', label: '7. 功能安全 & 可靠性' },
                { id: 'review', label: '8. 评审与回归 (Case01~14)' },
                { id: 'recommendation', label: '9. 团队博弈推演 · RACI (团队隐秘担忧点+领导多方博弈)' },
                { id: 'docs', label: '10. 受控文档 & EDR' },
                { id: 'calc', label: '11. 确定性物理计算器' },
              ].map((tab) => (
                <option key={tab.id} value={tab.id} className="bg-slate-900 text-slate-200">
                  {tab.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop & Mobile Scrollable Nav Ribbon */}
          <div className="relative flex items-center gap-1 min-w-0">
            <button
              onClick={() => {
                if (navRef.current) navRef.current.scrollBy({ left: -220, behavior: 'smooth' });
              }}
              className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 cursor-pointer transition border border-slate-700"
              title="向左滚动模块"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <nav
              ref={navRef}
              className="flex-1 flex space-x-1 overflow-x-auto py-1 scrollbar-none text-xs scroll-smooth"
            >
              {[
                { id: 'workflow', label: '0. 工程工作流' },
                { id: 'overview', label: '🌟 10秒第一屏决策' },
                { id: 'input', label: '1. 统一工程输入' },
                { id: 'facts', label: '2. 事实证据与追溯' },
                { id: 'patterns', label: '3. 物理机理 / 场景引擎' },
                { id: 'options', label: '4. 候选方案与残余风险' },
                { id: 'cockpit', label: '5. C-T-S-Q-L 决策驾驶舱' },
                { id: 'verification', label: '6. 验证闭环 & VOI' },
                { id: 'safety', label: '7. 功能安全 & 可靠性' },
                { id: 'review', label: '8. 评审与回归 (Case01~14)' },
                { id: 'recommendation', label: '9. 团队博弈推演 · RACI' },
                { id: 'docs', label: '10. 受控文档 & EDR' },
                { id: 'calc', label: '11. 确定性物理计算器' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-btn-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-md whitespace-nowrap font-medium transition cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40 shadow-xs font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            <button
              onClick={() => {
                if (navRef.current) navRef.current.scrollBy({ left: 220, behavior: 'smooth' });
              }}
              className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 cursor-pointer transition border border-slate-700"
              title="向右滚动模块"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
