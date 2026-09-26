import React from 'react';
import { HwLeadStyle } from '../types';
import { EngineeringWorkflowView } from './EngineeringWorkflowView';
import { FirstScreen10sView } from './FirstScreen10sView';
import { ProjectContextView } from './ProjectContextView';
import { AnalysisFactView } from './AnalysisFactView';
import { BldcPatternEngineView } from './BldcPatternEngineView';
import { OptionsComparisonView } from './OptionsComparisonView';
import { DecisionCockpitView } from './DecisionCockpitView';
import { VerificationLoopView } from './VerificationLoopView';
import { FunctionalSafetyReliabilityView } from './FunctionalSafetyReliabilityView';
import { DesignReviewRegressionView } from './DesignReviewRegressionView';
import { RecommendationRaciView } from './RecommendationRaciView';
import { EngineeringDocsView } from './EngineeringDocsView';
import { EngineeringCalculatorView } from './EngineeringCalculatorView';
import TraceAuditView from './TraceAuditView';
import { useScenario } from '../contexts/ScenarioContext';
import { useAnalysis } from '../contexts/AnalysisContext';
import { useUI } from '../contexts/UIContext';

// 只保留“需要 App 层编排”的三个动作（保存/删除要联动 Toast 与重新分析，Section14 要切工况+跳转）。
// 工况、分析状态、Tab、弹窗开关全部直接读 Context，不再逐层透传。
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
  return (
    <>
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
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === 'input' && (
        <ProjectContextView
          context={context}
          setContext={setContext}
          issue={issue}
          setIssue={setIssue}
          onAnalyze={() => {
            void runAnalysis(context, issue, currentScenarioId);
            setActiveTab('facts');
          }}
          isAnalyzing={isAnalyzing}
          currentScenarioTitle={currentScenarioTitle}
          isCustomScenario={isCustomScenario}
          onOpenScenarioManage={onOpenScenarioManage}
          onSaveCustomScenario={onSaveCustomScenario}
          onDeleteCustomScenario={onDeleteCustomScenario}
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
          onLeadStyleChange={(style: HwLeadStyle) =>
            setContext((prev) => ({ ...prev, hwLeadStyle: style }))
          }
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
          onApplyMeasuredValues={(values, sourceLabel) => {
            // 一键填入的每一项都以 DATASHEET 记录来源：它是规格书值，不是工程师实测值。
            const measuredValues = { ...(issue.measuredValues || {}) };
            const measurementProvenance = { ...(issue.measurementProvenance || {}) };
            for (const [key, value] of Object.entries(values)) {
              measuredValues[key] = value;
              measurementProvenance[key] = {
                ...(measurementProvenance[key] || {}),
                source: 'DATASHEET',
                sourceLabel,
                enteredAt: new Date().toISOString(),
              };
            }
            setIssue({ ...issue, measuredValues, measurementProvenance });
          }}
        />
      )}

      {activeTab === 'review' && (
        <DesignReviewRegressionView
          key={`review-${currentScenarioId}`}
          context={context}
          issue={issue}
          result={result}
          onLoadScenarioSection14={onLoadScenarioSection14}
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
        <EngineeringDocsView
          result={result}
          context={context}
          issue={issue}
        />
      )}

      {activeTab === 'calc' && (
        <EngineeringCalculatorView
          context={context}
          issue={issue}
          setIssue={setIssue}
        />
      )}

      {activeTab === 'trace-audit' && (
        <TraceAuditView
          context={context}
          issue={issue}
          result={result}
        />
      )}
    </>
  );
};
