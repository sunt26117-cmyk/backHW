import React, { useEffect } from 'react';
import { HwLeadStyle } from '../types';
import { SeniorEngineeringWorkbenchView, MainWorkbenchTab } from './SeniorEngineeringWorkbenchView';
import { toMainTab } from './workbenchNavigation';
import { useScenario } from '../contexts/ScenarioContext';
import { useAnalysis } from '../contexts/AnalysisContext';
import { useUI } from '../contexts/UIContext';

interface AppTabRouterProps {
  onSaveCustomScenario: () => void;
  onDeleteCustomScenario: () => void;
  onLoadScenarioSection14: () => void;
}

export const AppTabRouter: React.FC<AppTabRouterProps> = ({
  onSaveCustomScenario,
  onDeleteCustomScenario,
  onLoadScenarioSection14,
}) => {
  const { context, setContext, issue, setIssue, currentScenarioId, currentScenario, lastSavedAt } = useScenario();
  const { result, isAnalyzing, resultIsStale, runAnalysis } = useAnalysis();
  const { activeTab, setActiveTab, setScenarioManageOpen, workflowHelpOpen, setWorkflowHelpOpen } = useUI();
  const currentScenarioTitle = currentScenario?.title;
  const isCustomScenario = currentScenario?.isCustom;
  const onOpenScenarioManage = () => setScenarioManageOpen(true);

  // 兼容历史 workflow 深链接：不再进入正式二级页，而是打开帮助抽屉。
  useEffect(() => {
    if (activeTab === 'workflow') {
      setWorkflowHelpOpen(true);
      setActiveTab('overview');
    }
  }, [activeTab, setActiveTab, setWorkflowHelpOpen]);

  // activeTab 可能是新工作台 id（Navbar 直接设置），也可能是旧一级 id（历史跳转/预设）。
  // 解析必须双向完全 —— 只做"旧→新"单向映射会让 physics/decision/delivery 静默弹回总览。
  const mainTab = toMainTab(activeTab);
  const runCurrentAnalysis = () => { void runAnalysis(context, issue, currentScenarioId); };

  return (
    <SeniorEngineeringWorkbenchView
      activeTab={mainTab}
      context={context}
      setContext={setContext}
      issue={issue}
      setIssue={setIssue}
      result={result}
      currentScenarioId={currentScenarioId}
      currentScenarioTitle={currentScenarioTitle}
      isCustomScenario={isCustomScenario}
      isAnalyzing={isAnalyzing}
      resultIsStale={resultIsStale}
      lastSavedAt={lastSavedAt}
      hwLeadStyle={context.hwLeadStyle || 'AGILE_DELIVERY'}
      onLeadStyleChange={(style: HwLeadStyle) => setContext((prev) => ({ ...prev, hwLeadStyle: style }))}
      recurrenceCount={context.recurrenceCount || 0}
      daysRemaining={context.daysRemaining}
      onRunAnalysis={runCurrentAnalysis}
      onOpenScenarioManage={onOpenScenarioManage}
      onSaveCustomScenario={onSaveCustomScenario}
      onDeleteCustomScenario={onDeleteCustomScenario}
      onLoadScenarioSection14={onLoadScenarioSection14}
      onNavigateMain={(tab) => setActiveTab(tab)}
      workflowHelpOpen={workflowHelpOpen}
      onWorkflowHelpChange={setWorkflowHelpOpen}
    />
  );
};

export default AppTabRouter;
