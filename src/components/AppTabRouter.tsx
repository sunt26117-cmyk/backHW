import React from 'react';
import { HwLeadStyle } from '../types';
import { SeniorEngineeringWorkbenchView, MainWorkbenchTab } from './SeniorEngineeringWorkbenchView';
import { useScenario } from '../contexts/ScenarioContext';
import { useAnalysis } from '../contexts/AnalysisContext';
import { useUI } from '../contexts/UIContext';

interface AppTabRouterProps {
  onSaveCustomScenario: () => void;
  onDeleteCustomScenario: () => void;
  onLoadScenarioSection14: () => void;
}

const LEGACY_TO_MAIN: Record<string, MainWorkbenchTab> = {
  workflow: 'overview', overview: 'overview', input: 'facts', facts: 'facts',
  patterns: 'physics', calc: 'physics', options: 'decision', cockpit: 'decision',
  verification: 'verification', review: 'verification', safety: 'safety',
  recommendation: 'delivery', docs: 'delivery', 'trace-audit': 'overview',
};

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

  const mainTab = LEGACY_TO_MAIN[activeTab] || 'overview';
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
