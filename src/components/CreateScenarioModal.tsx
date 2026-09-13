import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  Copy,
  Sparkles,
  Layers,
  Trash2,
  CheckCircle2,
  FolderOpen,
  ArrowRight,
  ShieldAlert,
  FileCode,
  Sliders,
  Clock,
} from 'lucide-react';
import { PresetScenario, ProjectContext, IssueInput } from '../types';
import {
  createBlankScenario,
  createClonedScenario,
  BLUEPRINT_TEMPLATES,
  saveCustomScenario,
  deleteCustomScenario,
  getCustomScenarios,
} from '../utils/scenarioManager';

interface CreateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContext: ProjectContext;
  currentIssue: IssueInput;
  currentScenarioId: string;
  onApplyScenario: (scenario: PresetScenario) => void;
}

export const CreateScenarioModal: React.FC<CreateScenarioModalProps> = ({
  isOpen,
  onClose,
  currentContext,
  currentIssue,
  currentScenarioId,
  onApplyScenario,
}) => {
  const [activeMode, setActiveMode] = useState<'blank' | 'clone' | 'template'>('blank');
  
  // Blank Mode State
  const [blankTitle, setBlankTitle] = useState('我的新建 ECU 工程工况');
  const [blankProjectName, setBlankProjectName] = useState('My-Auto-ECU-Project');
  const [blankProductType, setBlankProductType] = useState('智能执行器控制器 / 域控');
  const [blankPhase, setBlankPhase] = useState<'B Sample' | 'A Sample' | 'C Sample' | 'DV'>('B Sample');
  const [blankAsil, setBlankAsil] = useState<'ASIL B' | 'ASIL A' | 'ASIL C' | 'ASIL D' | 'QM'>('ASIL B');
  const [blankSubtitle, setBlankSubtitle] = useState('用户自定义工程工况案卷');

  // Clone Mode State
  const [cloneTitle, setCloneTitle] = useState(
    `${currentContext.projectName || 'ECU项目'} - 衍生改制工况`
  );
  const [cloneSubtitle, setCloneSubtitle] = useState('基于当前参数与实测微调的自定义工况');

  // Template Mode State
  const [selectedTemplateId, setSelectedTemplateId] = useState(BLUEPRINT_TEMPLATES[0].id);
  const [templateCustomTitle, setTemplateCustomTitle] = useState('');

  // Custom Scenarios List for Management
  const [customList, setCustomList] = useState<PresetScenario[]>(() => getCustomScenarios());

  if (!isOpen) return null;

  const refreshList = () => {
    setCustomList(getCustomScenarios());
  };

  const handleCreateBlank = () => {
    const sc = createBlankScenario(blankTitle, blankSubtitle);
    sc.context.projectName = blankProjectName;
    sc.context.productType = blankProductType;
    sc.context.projectPhase = blankPhase;
    sc.context.asilLevel = blankAsil;

    saveCustomScenario(sc);
    refreshList();
    onApplyScenario(sc);
    onClose();
  };

  const handleCreateClone = () => {
    const sc = createClonedScenario(cloneTitle, cloneSubtitle, currentContext, currentIssue);
    saveCustomScenario(sc);
    refreshList();
    onApplyScenario(sc);
    onClose();
  };

  const handleCreateFromTemplate = () => {
    const tpl = BLUEPRINT_TEMPLATES.find((t) => t.id === selectedTemplateId) || BLUEPRINT_TEMPLATES[0];
    const sc = createBlankScenario(
      templateCustomTitle.trim() || tpl.name,
      tpl.description
    );

    sc.context = {
      ...sc.context,
      ...tpl.context,
      projectName: `${tpl.context.productType || 'ECU'}-Project`,
    };
    sc.issue = {
      ...sc.issue,
      ...tpl.issue,
    };

    saveCustomScenario(sc);
    refreshList();
    onApplyScenario(sc);
    onClose();
  };

  const handleDeleteScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除此自定义工况吗？此操作无法撤销。')) {
      const next = deleteCustomScenario(id);
      setCustomList(next);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">新建或另存工程工况</h2>
              <p className="text-xs text-slate-400">
                支持创建空白案卷、基于当前参数另存，或选择车规领域典型模板快速构建
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950 border-b border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveMode('blank')}
            className={`flex items-center justify-center py-2.5 px-3 rounded-lg transition cursor-pointer space-x-1.5 ${
              activeMode === 'blank'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>空白工况 (从零构建)</span>
          </button>
          <button
            onClick={() => setActiveMode('clone')}
            className={`flex items-center justify-center py-2.5 px-3 rounded-lg transition cursor-pointer space-x-1.5 ${
              activeMode === 'clone'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Copy className="w-4 h-4" />
            <span>另存当前配置</span>
          </button>
          <button
            onClick={() => setActiveMode('template')}
            className={`flex items-center justify-center py-2.5 px-3 rounded-lg transition cursor-pointer space-x-1.5 ${
              activeMode === 'template'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>车规领域快速模板</span>
          </button>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Mode 1: Blank Scenario */}
          {activeMode === 'blank' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl text-blue-200 text-[11px] leading-relaxed">
                💡 <strong>从空白案卷开始</strong>：为您生成一套干净标准符合 IATF 16949 / ISO 26262 架构的车载控制器输入模板。创建后，您可以直接在「项目背景与技术问题输入」中填写自己真实的实测超标参数（如 dB、温升、裕量 mV 等）。
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  工况显示标题 (Scenario Title) *
                </label>
                <input
                  type="text"
                  value={blankTitle}
                  onChange={(e) => setBlankTitle(e.target.value)}
                  placeholder="例如：车载网关 CAN FD 瞬态耦合故障"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">项目代号 (Project Name)</label>
                  <input
                    type="text"
                    value={blankProjectName}
                    onChange={(e) => setBlankProjectName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">产品类型 (Product Type)</label>
                  <input
                    type="text"
                    value={blankProductType}
                    onChange={(e) => setBlankProductType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">工程阶段 (Project Phase)</label>
                  <select
                    value={blankPhase}
                    onChange={(e) => setBlankPhase(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="A Sample">A Sample (初样原理图阶段)</option>
                    <option value="B Sample">B Sample (功能样件验证)</option>
                    <option value="C Sample">C Sample (工程模具样件)</option>
                    <option value="DV">DV (设计验证试验)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">安全等级 (ISO 26262 ASIL)</label>
                  <select
                    value={blankAsil}
                    onChange={(e) => setBlankAsil(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="QM">QM (无功能安全要求)</option>
                    <option value="ASIL A">ASIL A</option>
                    <option value="ASIL B">ASIL B (车载执行器常用)</option>
                    <option value="ASIL C">ASIL C</option>
                    <option value="ASIL D">ASIL D (底盘/转向/动力核心)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">工况简短摘要/备注</label>
                <input
                  type="text"
                  value={blankSubtitle}
                  onChange={(e) => setBlankSubtitle(e.target.value)}
                  placeholder="例如：B样实测超标 / 距离节点剩余 2 周"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Mode 2: Clone Current Scenario */}
          {activeMode === 'clone' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-200 text-[11px] leading-relaxed">
                📋 <strong>另存当前配置为独立工况</strong>：您刚才在当前界面调整修改的<strong>所有项目参数、实测超标数据、失效现象和客户约束</strong>都将完整保存为一个新的自定义工况，随时可以在工况下拉菜单中一键切换调用！
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>当前复制来源项目：<span className="text-white font-medium">{currentContext.projectName} ({currentContext.projectPhase})</span></div>
                <div>当前失效类别：<span className="text-blue-300 font-medium">{currentIssue.issueCategories.join(', ')}</span></div>
                <div>当前实测摘要：<span className="text-slate-300 truncate block">{currentIssue.actualMeasurement.slice(0, 75)}...</span></div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  新工况命名 (Scenario Title) *
                </label>
                <input
                  type="text"
                  value={cloneTitle}
                  onChange={(e) => setCloneTitle(e.target.value)}
                  placeholder="例如：座舱 BLDC-改版投板对比方案"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">新工况副标题/改版版本说明</label>
                <input
                  type="text"
                  value={cloneSubtitle}
                  onChange={(e) => setCloneSubtitle(e.target.value)}
                  placeholder="例如：带外部肖特基吸收管的二次实测方案"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Mode 3: Template */}
          {activeMode === 'template' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-xl text-purple-200 text-[11px] leading-relaxed">
                ⚡ <strong>车规典型领域模板</strong>：挑选预设的标准行业问题模板，快速生成带有完整物理参数与测试条件的起手式工况。
              </div>

              <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {BLUEPRINT_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id);
                        if (!templateCustomTitle) {
                          setTemplateCustomTitle(tpl.name);
                        }
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100 flex items-center gap-1.5">
                          <span>{tpl.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-purple-300 font-mono">
                            {tpl.category}
                          </span>
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                        {tpl.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">自定义新工况标题 (可选)</label>
                <input
                  type="text"
                  value={templateCustomTitle}
                  onChange={(e) => setTemplateCustomTitle(e.target.value)}
                  placeholder="留空则使用模板默认名称"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Section: Manage Existing Custom Scenarios */}
          {customList.length > 0 && (
            <div className="border-t border-slate-800 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  已保存的自定义工况 ({customList.length})
                </span>
                <span className="text-[10px] text-slate-500">保存在本机浏览器</span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {customList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onApplyScenario(item);
                      onClose();
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                      currentScenarioId === item.id
                        ? 'bg-blue-950/40 border-blue-500/60 text-blue-200'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="truncate mr-2">
                      <div className="font-semibold truncate text-white">{item.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={(e) => handleDeleteScenario(item.id, e)}
                        title="删除此自定义工况"
                        className="p-1 hover:text-red-400 hover:bg-red-950/40 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition text-[11px] font-medium flex items-center">
                        载入 <ArrowRight className="w-3 h-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer text-xs font-medium"
          >
            取消
          </button>

          <button
            onClick={() => {
              if (activeMode === 'blank') handleCreateBlank();
              else if (activeMode === 'clone') handleCreateClone();
              else if (activeMode === 'template') handleCreateFromTemplate();
            }}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg transition cursor-pointer text-xs font-bold shadow-md flex items-center space-x-1.5"
          >
            <span>确认创建并进入工况</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
