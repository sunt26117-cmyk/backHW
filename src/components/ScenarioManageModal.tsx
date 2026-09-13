import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  FolderPlus,
  GripVertical,
  Layers,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PresetScenario, ProjectContext, IssueInput } from '../types';
import { createBlankScenarioTemplate } from '../utils/scenarioStorage';
import { getScenarioCategory, SCENARIO_CATEGORIES } from '../utils/scenarioLibrary';

interface ScenarioManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContext: ProjectContext;
  currentIssue: IssueInput;
  customScenarios: PresetScenario[];
  presetScenarios: PresetScenario[];
  currentScenarioId: string;
  onSelectScenario: (scenarioId: string, customScenario?: PresetScenario) => void;
  onSaveAsCustomScenario: (title: string, context: ProjectContext, issue: IssueInput) => void;
  onDeleteCustomScenario: (scenarioId: string) => void;
  onReorderScenarios: (kind: 'presets' | 'custom', ids: string[]) => void;
  onResetScenarioOrder: () => void;
}

type ManageTab = 'library' | 'save_current' | 'create';
type LibraryKind = 'presets' | 'custom';

export const ScenarioManageModal: React.FC<ScenarioManageModalProps> = (props) => {
  const {
    isOpen,
    onClose,
    currentContext,
    currentIssue,
    customScenarios,
    presetScenarios,
    currentScenarioId,
    onSelectScenario,
    onSaveAsCustomScenario,
    onDeleteCustomScenario,
    onReorderScenarios,
    onResetScenarioOrder,
  } = props;

  const [activeTab, setActiveTab] = useState<ManageTab>('library');
  const [libraryKind, setLibraryKind] = useState<LibraryKind>('presets');
  const [categoryFilter, setCategoryFilter] = useState<string>('全部');
  const [newTitle, setNewTitle] = useState('');
  const [newArchetype, setNewArchetype] = useState<'CUSTOM' | 'BLDC' | 'MCU'>('CUSTOM');
  const [saveCurrentTitle, setSaveCurrentTitle] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSaveCurrentTitle(currentContext.projectName ? `${currentContext.projectName} (自建工况)` : '自定义新工况');
  }, [currentContext.projectName, isOpen]);

  const libraryItems = libraryKind === 'presets' ? presetScenarios : customScenarios;
  const visibleItems = useMemo(
    () => categoryFilter === '全部' ? libraryItems : libraryItems.filter((item) => getScenarioCategory(item) === categoryFilter),
    [categoryFilter, libraryItems],
  );

  if (!isOpen) return null;

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || '未命名自建工况';
    const newScenario = createBlankScenarioTemplate(title, newArchetype);
    onSaveAsCustomScenario(title, newScenario.context, newScenario.issue);
    setNewTitle('');
    onClose();
  };

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAsCustomScenario(saveCurrentTitle.trim() || '未命名自建工况', currentContext, currentIssue);
    onClose();
  };

  const moveScenario = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = libraryItems.map((item) => item.id);
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...ids];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorderScenarios(libraryKind, next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ecu-modal-backdrop">
      <div className="ecu-modal-panel w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 border-b ecu-divider flex items-center justify-between ecu-panel-header">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg ecu-accent-soft border flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base ecu-text-primary flex items-center gap-2">
                工况库管理
                <span className="ecu-badge">SCENARIO LIBRARY</span>
              </h3>
              <p className="text-xs ecu-text-secondary mt-0.5">按工程领域分类；拖拽即可调整顺序，顺序会永久保存在当前浏览器。</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 ecu-icon-muted hover:opacity-80 rounded-lg transition cursor-pointer" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b ecu-divider px-6 ecu-panel-header text-xs">
          {([
            ['library', Layers, '工况库'],
            ['save_current', Save, '另存当前'],
            ['create', Sparkles, '新建工况'],
          ] as const).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === tab ? 'border-blue-500 text-blue-500' : 'border-transparent ecu-text-secondary hover:opacity-80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {activeTab === 'library' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-3 items-center">
                <div className="ecu-segment-group">
                  <button className={libraryKind === 'presets' ? 'ecu-segment-active' : 'ecu-segment'} onClick={() => setLibraryKind('presets')}>典型工况 ({presetScenarios.length})</button>
                  <button className={libraryKind === 'custom' ? 'ecu-segment-active' : 'ecu-segment'} onClick={() => setLibraryKind('custom')}>我的工况 ({customScenarios.length})</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={categoryFilter === '全部' ? 'ecu-chip-active' : 'ecu-chip'} onClick={() => setCategoryFilter('全部')}>全部</button>
                  {SCENARIO_CATEGORIES.map((category) => {
                    const count = libraryItems.filter((item) => getScenarioCategory(item) === category).length;
                    return count > 0 ? (
                      <button key={category} className={categoryFilter === category ? 'ecu-chip-active' : 'ecu-chip'} onClick={() => setCategoryFilter(category)}>
                        {category} · {count}
                      </button>
                    ) : null;
                  })}
                </div>
                <button onClick={onResetScenarioOrder} className="ecu-secondary-button flex items-center gap-1.5 justify-center">
                  <RotateCcw className="w-3.5 h-3.5" />恢复默认顺序
                </button>
              </div>

              <div className="ecu-info-banner">
                <ArrowDownUp className="w-4 h-4 shrink-0" />
                <span><strong>排序规则：</strong>当前库按你的拖拽顺序显示；分类只负责筛选，不会改变已保存的全局顺序。拖动整行即可重新排列。</span>
              </div>

              <div className="space-y-2">
                {visibleItems.map((sc, index) => {
                  const isCurrent = sc.id === currentScenarioId;
                  return (
                    <div
                      key={sc.id}
                      draggable
                      onDragStart={() => setDraggedId(sc.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedId) moveScenario(draggedId, sc.id);
                        setDraggedId(null);
                      }}
                      onDragEnd={() => setDraggedId(null)}
                      className={`ecu-scenario-row ${isCurrent ? 'ecu-scenario-row-current' : ''} ${draggedId === sc.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="ecu-drag-handle" title="拖动排序"><GripVertical className="w-4 h-4" /></div>
                        <div className="w-7 h-7 rounded-lg ecu-index-badge flex items-center justify-center font-mono font-bold shrink-0">{String(index + 1).padStart(2, '0')}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold ecu-text-primary truncate">{sc.title}</span>
                            <span className="ecu-category-badge">{getScenarioCategory(sc)}</span>
                            {isCurrent && <span className="ecu-current-badge"><CheckCircle2 className="w-3 h-3" />当前</span>}
                            {sc.isCustom && <span className="ecu-custom-badge">我的</span>}
                          </div>
                          <div className="text-[11px] ecu-text-secondary mt-1 truncate">{sc.subtitle}</div>
                          {sc.createdAt && (
                            <div className="text-[10px] ecu-text-muted mt-1 flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(sc.createdAt).toLocaleString()}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isCurrent && <button onClick={() => { onSelectScenario(sc.id, sc.isCustom ? sc : undefined); onClose(); }} className="ecu-primary-button">载入</button>}
                        {sc.isCustom && <button onClick={() => { if (confirm(`确认删除自建工况【${sc.title}】吗？此操作无法撤销。`)) onDeleteCustomScenario(sc.id); }} className="ecu-danger-icon-button" title="删除自建工况"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  );
                })}
                {visibleItems.length === 0 && <div className="ecu-empty-state">当前筛选条件下没有工况。</div>}
              </div>
            </>
          )}

          {activeTab === 'save_current' && (
            <form onSubmit={handleSaveCurrent} className="space-y-4">
              <div className="ecu-summary-card">
                <div className="font-bold ecu-text-muted uppercase tracking-wider mb-3">当前待保存工程摘要</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ecu-text-secondary">
                  <div>项目：<strong className="ecu-text-primary">{currentContext.projectName || '未命名'}</strong></div>
                  <div>产品：{currentContext.productType || '未指定'}</div>
                  <div>阶段：{currentContext.projectPhase} · 剩余 {currentContext.daysRemaining} 天</div>
                  <div>ASIL：{currentContext.asilLevel}</div>
                </div>
                <div className="pt-3 mt-3 border-t ecu-divider ecu-text-secondary">失效现象：{currentIssue.failurePhenomenon || '无'}</div>
              </div>
              <label className="block ecu-label">新工况名称 / 标识</label>
              <input value={saveCurrentTitle} onChange={(e) => setSaveCurrentTitle(e.target.value)} className="ecu-input" placeholder="例如：85℃ 急停过压实测工况" required />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="ecu-secondary-button">取消</button>
                <button type="submit" className="ecu-primary-button flex items-center gap-1.5"><Save className="w-4 h-4" />保存为新工况</button>
              </div>
            </form>
          )}

          {activeTab === 'create' && (
            <form onSubmit={handleCreateNew} className="space-y-5">
              <div>
                <label className="block ecu-label mb-1.5">新建工况名称</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="ecu-input" placeholder="例如：BCM 低温复位异常" required />
              </div>
              <div>
                <div className="ecu-label mb-2">初始化模板</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    ['CUSTOM', '通用空白', '任意 ECU / 传感器 / 电源问题'],
                    ['BLDC', 'BLDC 电机驱动', '急停泵升、米勒直通、Snubber'],
                    ['MCU', 'MCU 数字容差', '复位、WCCA、温漂与门限'],
                  ] as const).map(([value, title, desc]) => (
                    <button type="button" key={value} onClick={() => setNewArchetype(value)} className={`ecu-template-card ${newArchetype === value ? 'ecu-template-card-active' : ''}`}>
                      <div className="font-bold ecu-text-primary">{title}</div>
                      <div className="text-[11px] ecu-text-secondary mt-1">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="ecu-secondary-button">取消</button>
                <button type="submit" className="ecu-primary-button flex items-center gap-1.5"><Sparkles className="w-4 h-4" />立即创建</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
