import React from 'react';
import {
  ProjectContext,
  IssueInput,
  CopilotAnalysisResult,
  PresetScenario,
} from '../types';
import { ModelSettingsModal } from './ModelSettingsModal';
import { ScenarioManageModal } from './ScenarioManageModal';
import { SourceDownloadModal } from './SourceDownloadModal';
import { DeviceLibraryModal } from './DeviceLibraryModal';
import { AiOfflineModal } from './AiOfflineModal';
import { OscilloscopeImportModal } from './OscilloscopeImportModal';
import { useScenario } from '../contexts/ScenarioContext';
import { useUI } from '../contexts/UIContext';

// 弹窗开关、模型配置、工况列表全部直接读 Context；
// 只保留需要 App 层编排（联动分析/Toast）的三个动作作为 props。
interface AppModalsProps {
  onSelectScenario: (id: string, customScenario?: PresetScenario) => void;
  onSaveAsCustomScenario: (title: string, context: ProjectContext, issue: IssueInput) => void;
  onApplyAiResult: (result: CopilotAnalysisResult) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  onSelectScenario,
  onSaveAsCustomScenario,
  onApplyAiResult,
}) => {
  const {
    context, issue, setContext, setIssue,
    customScenarios, presetScenarios, currentScenarioId,
    reorder, resetOrder, deleteCustom,
  } = useScenario();
  const {
    modelModalOpen, setModelModalOpen, modelConfig, setModelConfig,
    scenarioManageOpen, setScenarioManageOpen,
    sourceDownloadOpen, setSourceDownloadOpen,
    deviceLibraryOpen, setDeviceLibraryOpen,
    aiOfflineOpen, setAiOfflineOpen,
    oscilloscopeOpen, setOscilloscopeOpen,
    showToast,
  } = useUI();

  return (
    <>
      <ModelSettingsModal
        isOpen={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        config={modelConfig}
        onSaveConfig={setModelConfig}
      />

      <ScenarioManageModal
        isOpen={scenarioManageOpen}
        onClose={() => setScenarioManageOpen(false)}
        currentContext={context}
        currentIssue={issue}
        customScenarios={customScenarios}
        presetScenarios={presetScenarios}
        onReorderScenarios={reorder}
        onResetScenarioOrder={resetOrder}
        currentScenarioId={currentScenarioId}
        onSelectScenario={onSelectScenario}
        onSaveAsCustomScenario={onSaveAsCustomScenario}
        onDeleteCustomScenario={deleteCustom}
      />

      <SourceDownloadModal
        isOpen={sourceDownloadOpen}
        onClose={() => setSourceDownloadOpen(false)}
        showToast={showToast}
      />

      <DeviceLibraryModal
        isOpen={deviceLibraryOpen}
        onClose={() => setDeviceLibraryOpen(false)}
        showToast={showToast}
        onSelectDevice={(id) => setContext((prev) => ({ ...prev, selectedDeviceId: id }))}
      />

      <OscilloscopeImportModal
        isOpen={oscilloscopeOpen}
        onClose={() => setOscilloscopeOpen(false)}
        onApplyMeasured={(values, provenance) => {
          setIssue((prev) => ({
            ...prev,
            measuredValues: { ...(prev.measuredValues || {}), ...values },
            measurementProvenance: { ...(prev.measurementProvenance || {}), ...provenance },
            measuredValueSource: 'IMPORTED',
          }));
        }}
        showToast={showToast}
      />

      <AiOfflineModal
        isOpen={aiOfflineOpen}
        onClose={() => setAiOfflineOpen(false)}
        context={context}
        issue={issue}
        onApplyResult={onApplyAiResult}
        showToast={showToast}
      />
    </>
  );
};
