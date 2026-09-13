import React, { useState } from 'react';
import {
  FolderPlus,
  Save,
  Trash2,
  CheckCircle2,
  X,
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  Download,
  Calendar,
  ShieldAlert,
} from 'lucide-react';
import { PresetScenario, ProjectContext, IssueInput } from '../types';
import { createBlankScenarioTemplate } from '../utils/scenarioStorage';

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
}

export const ScenarioManageModal: React.FC<ScenarioManageModalProps> = ({
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
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'create' | 'save_current' | 'list'>('save_current');

  // 新建工况输入
  const [newTitle, setNewTitle] = useState('');
  const [newArchetype, setNewArchetype] = useState<'CUSTOM' | 'BLDC' | 'MCU'>('CUSTOM');

  // 另存当前输入
  const [saveCurrentTitle, setSaveCurrentTitle] = useState(
    currentContext.projectName ? `${currentContext.projectName} (自建工况)` : '自定义新工况'
  );

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || '未命名自建工况';
    const newScenario = createBlankScenarioTemplate(title, newArchetype);
    onSaveAsCustomScenario(title, newScenario.context, newScenario.issue);
    onClose();
  };

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const title = saveCurrentTitle.trim() || '未命名自建工况';
    onSaveAsCustomScenario(title, currentContext, currentIssue);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>工况库与工况新建管理</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Scenario Manager
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                支持自由创建空白工况、将当前分析另存为新工况或跨项目复用
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900 text-xs">
          <button
            onClick={() => setActiveTab('save_current')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center space-x-1.5 cursor-pointer transition ${
              activeTab === 'save_current'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>另存当前为新工况</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center space-x-1.5 cursor-pointer transition ${
              activeTab === 'create'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>新建空白工况</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center space-x-1.5 cursor-pointer transition ${
              activeTab === 'list'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>全部工况列表 ({customScenarios.length + presetScenarios.length})</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* 1. 另存当前为新工况 */}
          {activeTab === 'save_current' && (
            <form onSubmit={handleSaveCurrent} className="space-y-4">
              <div className="bg-slate-850/70 border border-slate-700/60 rounded-xl p-4 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                  当前待保存参数摘要
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>
                    <span className="text-slate-500">项目名称:</span>{' '}
                    <span className="font-semibold text-white">{currentContext.projectName || '未命名'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">产品类型:</span>{' '}
                    <span>{currentContext.productType || '未指定'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">所处阶段:</span>{' '}
                    <span className="font-mono text-blue-300">{currentContext.projectPhase}</span> (剩余 {currentContext.daysRemaining} 天)
                  </div>
                  <div>
                    <span className="text-slate-500">安全等级:</span>{' '}
                    <span className="font-mono text-amber-300">{currentContext.asilLevel}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 text-slate-400 text-[11px]">
                  <span className="text-slate-500">失效现象:</span> {currentIssue.failurePhenomenon || '无'}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  新工况名称 / 标识
                </label>
                <input
                  type="text"
                  required
                  value={saveCurrentTitle}
                  onChange={(e) => setSaveCurrentTitle(e.target.value)}
                  placeholder="例如: 85℃ 发泡箱急停过压实测工况"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  将完整保存当前输入的项目背景、实测数据、客户特殊技术协议与失效顾虑到本地。
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  <span>保存为新工况并切换</span>
                </button>
              </div>
            </form>
          )}

          {/* 2. 新建空白工况 */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  新建工况名称
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如: 车身域控 MCU 复位引脚低温复位异常"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  初始化预置模板类型
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div
                    onClick={() => setNewArchetype('CUSTOM')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      newArchetype === 'CUSTOM'
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-slate-200">纯通用空白模板</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      适合任意车载 ECU、传感器或电源硬件问题，全字段从零填写。
                    </div>
                  </div>

                  <div
                    onClick={() => setNewArchetype('BLDC')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      newArchetype === 'BLDC'
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-slate-200">BLDC 电机驱动模板</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      预置急停母线泵升、米勒直通、Snubber 计算与防夹时限参数。
                    </div>
                  </div>

                  <div
                    onClick={() => setNewArchetype('MCU')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      newArchetype === 'MCU'
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-slate-200">MCU 数字容差模板</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      预置高低温阻抗衰减、上拉门限漂移与 WCCA 极端恶化参数。
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>立即创建并载入工况</span>
                </button>
              </div>
            </form>
          )}

          {/* 3. 工况列表管理 */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* 自定义工况分区 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                    <span>⭐️ 我的自定义工况 ({customScenarios.length})</span>
                  </span>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>新建工况</span>
                  </button>
                </div>

                {customScenarios.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500">
                    暂无自建工况。可在“另存当前为新工况”或“新建空白工况”中添加！
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customScenarios.map((sc) => {
                      const isCurrent = sc.id === currentScenarioId;
                      return (
                        <div
                          key={sc.id}
                          className={`p-3 rounded-xl border transition flex items-center justify-between ${
                            isCurrent
                              ? 'bg-blue-950/40 border-blue-500/80'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1 pr-3 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{sc.title}</span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40">
                                  当前运行中
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {sc.context.productType} · {sc.context.projectPhase} 阶段 ({sc.context.asilLevel})
                            </div>
                            {sc.createdAt && (
                              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(sc.createdAt).toLocaleString()}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            {!isCurrent && (
                              <button
                                onClick={() => {
                                  onSelectScenario(sc.id, sc);
                                  onClose();
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1"
                              >
                                <span>载入</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`确认删除自建工况【${sc.title}】吗？此操作无法撤销。`)) {
                                  onDeleteCustomScenario(sc.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition cursor-pointer"
                              title="删除此自建工况"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 系统预置典型工况 */}
              <div className="pt-2 border-t border-slate-800">
                <span className="font-bold text-xs text-slate-400 mb-2 block">
                  系统内置典型工况参考 ({presetScenarios.length})
                </span>
                <div className="space-y-2">
                  {presetScenarios.map((sc) => {
                    const isCurrent = sc.id === currentScenarioId;
                    return (
                      <div
                        key={sc.id}
                        className={`p-2.5 rounded-xl border transition flex items-center justify-between ${
                          isCurrent
                            ? 'bg-slate-800/80 border-slate-600'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-200 text-xs">{sc.title}</span>
                            {isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-medium">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{sc.subtitle}</div>
                        </div>
                        {!isCurrent && (
                          <button
                            onClick={() => {
                              onSelectScenario(sc.id);
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition cursor-pointer"
                          >
                            载入
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
