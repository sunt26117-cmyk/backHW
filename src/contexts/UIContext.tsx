import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppTheme, ModelApiConfig } from '../types';

const DEFAULT_MODEL_CONFIG: ModelApiConfig = { provider: 'builtin', baseUrl: '', apiKey: '', model: '车规确定性专家引擎 (纯离线)', temperature: 0.2, enabled: false };
type Toast = { text: string; type: 'success' | 'info' | 'error' } | null;
type UIValue = {
  activeTab: string; setActiveTab: (tab: string) => void;
  modelModalOpen: boolean; setModelModalOpen: (v: boolean) => void;
  scenarioManageOpen: boolean; setScenarioManageOpen: (v: boolean) => void;
  sourceDownloadOpen: boolean; setSourceDownloadOpen: (v: boolean) => void;
  deviceLibraryOpen: boolean; setDeviceLibraryOpen: (v: boolean) => void;
  aiOfflineOpen: boolean; setAiOfflineOpen: (v: boolean) => void;
  oscilloscopeOpen: boolean; setOscilloscopeOpen: (v: boolean) => void;
  toast: Toast; showToast: (text: string, type?: 'success' | 'info' | 'error') => void; clearToast: () => void;
  theme: AppTheme; setTheme: (theme: AppTheme) => void;
  modelConfig: ModelApiConfig; setModelConfig: (config: ModelApiConfig) => void;
};
const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [scenarioManageOpen, setScenarioManageOpen] = useState(false);
  const [sourceDownloadOpen, setSourceDownloadOpen] = useState(false);
  const [deviceLibraryOpen, setDeviceLibraryOpen] = useState(false);
  const [aiOfflineOpen, setAiOfflineOpen] = useState(false);
  const [oscilloscopeOpen, setOscilloscopeOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [themeState, setThemeState] = useState<AppTheme>(() => {
    try { const s = localStorage.getItem('ecu_copilot_theme'); if (s === 'light' || s === 'eyecare' || s === 'warm' || s === 'dark') return s; } catch {}
    return 'dark';
  });
  const [modelConfig, setModelConfigState] = useState<ModelApiConfig>(() => {
    try { const s = localStorage.getItem('ecu_copilot_model_config'); if (s) return JSON.parse(s); } catch {}
    return DEFAULT_MODEL_CONFIG;
  });

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 4000);
  };
  const setTheme = (theme: AppTheme) => { setThemeState(theme); try { localStorage.setItem('ecu_copilot_theme', theme); } catch {} };
  const setModelConfig = (config: ModelApiConfig) => { setModelConfigState(config); try { localStorage.setItem('ecu_copilot_model_config', JSON.stringify(config)); } catch {} };
  useEffect(() => { document.documentElement.setAttribute('data-theme', themeState); }, [themeState]);

  return <UIContext.Provider value={{ activeTab, setActiveTab, modelModalOpen, setModelModalOpen, scenarioManageOpen, setScenarioManageOpen, sourceDownloadOpen, setSourceDownloadOpen, deviceLibraryOpen, setDeviceLibraryOpen, aiOfflineOpen, setAiOfflineOpen, oscilloscopeOpen, setOscilloscopeOpen, toast, showToast, clearToast: () => setToast(null), theme: themeState, setTheme, modelConfig, setModelConfig }}>{children}</UIContext.Provider>;
}
export function useUI() { const value = useContext(UIContext); if (!value) throw new Error('useUI must be used inside UIProvider'); return value; }
