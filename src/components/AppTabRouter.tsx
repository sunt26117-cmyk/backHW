import React from 'react';
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
  const { result, isAnalyzing, runAnalysis } = useAnalysis();
  const { activeTab, setActiveTab, setScenarioManageOpen } = useUI();
  const currentScenarioTitle = currentScenario?.title;
  const isCustomScenario = currentScenario?.isCustom;
  const onOpenScenarioManage = () => setScenarioManageOpen(true);

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
    />
  );
};

export default AppTabRouter;
