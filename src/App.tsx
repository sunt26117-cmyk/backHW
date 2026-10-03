import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { AppTabRouter } from './components/AppTabRouter';
import { AppModals } from './components/AppModals';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import GlobalTraceAuditOverlay from './components/GlobalTraceAuditOverlay';
import { ScenarioProvider, useScenario } from './contexts/ScenarioContext';
import { AnalysisProvider, useAnalysis } from './contexts/AnalysisContext';
import { UIProvider, useUI } from './contexts/UIContext';
import { exportBackupJson, importBackupJson, exportMarkdownReport, exportHtmlReport } from './utils/backupRestore';
import { saveAnalysisResult } from './utils/analysisStorage';
import { readAnalysisResultMetadata, withAnalysisInputFingerprint } from './adapters/analysisResultAdapter';
import { buildAnalysisInputFingerprint } from './utils/analysisInputFingerprint';
import { isCurrentAnalysisResultRecord } from './adapters/analysisResultRecordAdapter';
import { PresetScenario } from './types';

function AppContent() {
  const scenario = useScenario();
  const ui = useUI();
  const analysis = useAnalysis();
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) setIsPwaInstalled(true);
    const handleBeforeInstallPrompt = (e: Event) => { e.preventDefault(); setDeferredInstallPrompt(e); };
    const handleInstalled = () => { setIsPwaInstalled(true); setDeferredInstallPrompt(null); ui.showToast('已成功安装为手机独立应用！', 'success'); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); window.removeEventListener('appinstalled', handleInstalled); };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) { ui.showToast('请点击浏览器右上角三个点，选择「安装应用」或「添加到主屏幕」', 'info'); return; }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') { setIsPwaInstalled(true); setDeferredInstallPrompt(null); }
  };

  const handleSelectScenario = (id: string, customScenario?: PresetScenario) => {
    const found = scenario.selectScenario(id, customScenario);
    if (!found) return;
    // 工况切换后的恢复/计算统一交给 AnalysisProvider[currentScenarioId] effect。
    // 这里先清掉旧 result，避免旧工况结论在新工况首帧短暂残留，也避免重复启动第二次分析。
    analysis.setResult(null);
    ui.showToast(`已切换工程案例：${found.title}，正在恢复/生成当前工况分析`, 'info');
  };

  const handleDeleteScenario = (id: string) => {
    const title = scenario.deleteCustom(id);
    if (title) ui.showToast(`已删除工程【${title}】`, 'info');
    if (scenario.currentScenarioId === id) {
      const fallback = scenario.presetScenarios[0];
      if (fallback) void analysis.runAnalysis(fallback.context, fallback.issue, fallback.id);
    }
  };

  const handleLoadSection14 = () => {
    const bldc = scenario.presetScenarios.find((s) => s.id === 'bldc-motor-drive') || scenario.presetScenarios[0];
    if (!bldc) return;
    const sameScenario = scenario.currentScenarioId === bldc.id;
    scenario.selectScenario(bldc.id);
    // 同一 scenario 重载时 currentScenarioId 不会变化，因此由这里执行唯一一次显式分析；
    // 同时先清空旧结果，避免“同工况重载”时旧结论继续显示。
    analysis.setResult(null);
    if (sameScenario) {
      void analysis.runAnalysis(
        bldc.context,
        { ...bldc.issue, measuredValueSource: bldc.issue.measuredValueSource || 'BENCHMARK' },
        bldc.id
      );
    }
    ui.setActiveTab('overview');
    ui.showToast(`已载入验收工况：${bldc.title} · ${bldc.context.projectPhase} · 剩余 ${bldc.context.daysRemaining} 天`, 'success');
  };

  const handleExportBackup = () => { exportBackupJson(scenario.context, scenario.issue, analysis.result); ui.showToast('本地完整工程备份已成功导出为 JSON 文件', 'success'); };
  const handleImportBackup = async (file: File) => {
    try {
      const imported = await importBackupJson(file);
      if (imported.context) scenario.setContext(imported.context);
      if (imported.issue) scenario.setIssue(imported.issue);
      if (imported.result) {
        const importedRecord = readAnalysisResultMetadata(imported.result).analysisRecord;
        const expectedHash = imported.resultRecord?.inputHash || '';
        if (isCurrentAnalysisResultRecord(importedRecord, expectedHash)) {
          analysis.setResult(imported.result);
          saveAnalysisResult(scenario.currentScenarioId, imported.result);
          ui.showToast(`已成功从本地备份文件恢复当前分析结果 (${file.name})`, 'success');
        } else {
          analysis.setResult(null);
          if (imported.context && imported.issue) void analysis.runAnalysis(imported.context, imported.issue, scenario.currentScenarioId);
          ui.showToast(`备份中的结果来自旧分析引擎或旧输入，工程数据已恢复并已按当前引擎重新计算 (${file.name})`, 'info');
        }
      }
      else if (imported.context && imported.issue) {
        analysis.setResult(null);
        void analysis.runAnalysis(imported.context, imported.issue, scenario.currentScenarioId);
        ui.showToast(`工程输入已从本地备份恢复，正在生成当前引擎结果 (${file.name})`, 'info');
      }
      else {
        ui.showToast(`已恢复备份，但没有可用于当前分析的结果 (${file.name})`, 'info');
      }
    } catch (err: any) { ui.showToast(`恢复失败: ${err.message || '文件格式不正确'}`, 'error'); }
  };
  const handleExportMarkdown = () => { if (!analysis.result) { ui.showToast('请先生成工程分析结果后再导出评审纪要', 'info'); return; } exportMarkdownReport(scenario.context, scenario.issue, analysis.result); ui.showToast('工程决策评审纪要 (CDR) 已导出为 Markdown 文件', 'success'); };
  const handlePrintReport = () => { if (!analysis.result) { ui.showToast('请先生成工程分析结果后再导出报告', 'info'); return; } exportHtmlReport(scenario.context, scenario.issue, analysis.result); };
  const handleSaveCustom = () => {
    const isCustom = scenario.customScenarios.some((s) => s.id === scenario.currentScenarioId);
    if (isCustom) scenario.saveCurrentCustomScenario();
    else {
      const title = scenario.context.projectName ? `${scenario.context.projectName} (自建工程)` : '我的自建工程';
      scenario.saveAsCustomScenario(title, scenario.context, scenario.issue);
      ui.showToast(`已成功保存并切换为自定义工况【${title}】`, 'success');
    }
  };
  const handleSaveAsCustom = (title: string, ctx: typeof scenario.context, iss: typeof scenario.issue) => {
    scenario.saveAsCustomScenario(title, ctx, iss);
    ui.showToast(`已成功保存并切换为自定义工况【${title}】`, 'success');
  };

  return (
    <div className="ecu-app-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {ui.toast && <div className="fixed top-5 right-5 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium animate-in fade-in slide-in-from-top-4 duration-200 backdrop-blur-md bg-slate-900/95 border-slate-700 text-slate-100">
        {ui.toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {ui.toast.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
        {ui.toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
        <span>{ui.toast.text}</span><button onClick={ui.clearToast} className="ml-2 text-slate-400 hover:text-slate-200 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
      </div>}

      <Navbar
        onSelectScenario={handleSelectScenario}
        onDeleteCustomScenario={handleDeleteScenario}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onExportMarkdown={handleExportMarkdown}
        onPrintReport={handlePrintReport}
      />

      {!isPwaInstalled && deferredInstallPrompt && <div id="pwa-install-banner" className="bg-gradient-to-r from-blue-900/90 via-indigo-950/90 to-slate-900/90 border-b border-blue-500/30 px-4 py-2.5 text-xs flex items-center justify-between text-blue-100 shadow-lg"><div className="flex items-center gap-2"><span className="text-base">📲</span><span>检测到您正在使用移动设备，可一键安装为<strong>全屏独立车载应用</strong>（无需浏览器边框）。</span></div><button id="install-pwa-banner-btn" onClick={handleInstallClick} className="px-3 py-1 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-md shadow-sm transition whitespace-nowrap ml-3 cursor-pointer shrink-0">立即安装 App</button></div>}

      <main className="flex-1 w-full min-w-0 px-3 sm:px-5 lg:px-6 2xl:px-8 py-5"><PageErrorBoundary key={ui.activeTab}><AppTabRouter onSaveCustomScenario={handleSaveCustom} onDeleteCustomScenario={() => handleDeleteScenario(scenario.currentScenarioId)} onLoadScenarioSection14={handleLoadSection14} /></PageErrorBoundary></main>

      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 transition-colors duration-200"><div className="w-full px-4 sm:px-6 lg:px-7 2xl:px-8 flex flex-col sm:flex-row items-center justify-between gap-2"><span>ECU Hardware Risk & Decision Copilot · 车载电子硬件技术决策系统</span><span>ISO 26262 · IATF 16949 · AEC-Q · CISPR 25 · C-T-S-Q-L Engine</span></div></footer>

      <GlobalTraceAuditOverlay />

      <AppModals onSelectScenario={handleSelectScenario} onSaveAsCustomScenario={handleSaveAsCustom} onApplyAiResult={(r) => { const stamped = withAnalysisInputFingerprint(r, buildAnalysisInputFingerprint(scenario.context, scenario.issue)); analysis.setResult(stamped); saveAnalysisResult(scenario.currentScenarioId, stamped); ui.setActiveTab('facts'); ui.showToast('已导入免费 AI 结果并完成审计渲染', 'success'); }} />
    </div>
  );
}

export default function App() {
  return <UIProvider><ScenarioProvider><ScenarioAnalysisBridge /></ScenarioProvider></UIProvider>;
}

function ScenarioAnalysisBridge() {
  const scenario = useScenario();
  const ui = useUI();
  return <AnalysisProvider context={scenario.context} issue={scenario.issue} currentScenarioId={scenario.currentScenarioId} modelConfig={ui.modelConfig} showToast={ui.showToast}><AppContent /></AnalysisProvider>;
}
