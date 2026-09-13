import React, { useState, useRef } from 'react';
import { ProjectContext, IssueInput, IssueCategory, ProjectPhase, AsilLevel, HwLeadStyle, IssueAttachment } from '../types';
import { getDomainDataQuality, getDomainMeasurementFields, extractMeasurementsFromText, resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import {
  Layers,
  AlertCircle,
  FileText,
  Upload,
  Calendar,
  DollarSign,
  Clock,
  ShieldCheck,
  Tag,
  UserCheck,
  ShieldAlert,
  Zap,
  Scale,
  FolderPlus,
  Image as ImageIcon,
  FileSpreadsheet,
  Eye,
  X,
  CheckCircle2,
  Save,
  Trash2,
} from 'lucide-react';

interface ProjectContextViewProps {
  context: ProjectContext;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  issue: IssueInput;
  setIssue: React.Dispatch<React.SetStateAction<IssueInput>>;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  currentScenarioTitle?: string;
  isCustomScenario?: boolean;
  onOpenScenarioManage?: () => void;
  onSaveCustomScenario?: () => void;
  onDeleteCustomScenario?: () => void;
  lastSavedAt?: string | null;
}

const ALL_CATEGORIES: IssueCategory[] = [
  'Component Alternative',
  'WCCA',
  'EMC',
  'Thermal',
  'Power',
  'BLDC Motor Drive',
  'Signal Integrity',
  'Reliability',
  'Functional Safety',
  'Customer Requirement',
  'DFM',
  'Production',
  'Cost Reduction',
  'Schedule Conflict',
  'Test Failure',
  'Design Deviation',
  'Other',
];

const PHASES: ProjectPhase[] = [
  'Concept',
  'A Sample',
  'B Sample',
  'C Sample',
  'DV',
  'PV',
  'SOP',
  'Post-SOP',
];

const ASIL_LEVELS: AsilLevel[] = ['QM', 'ASIL A', 'ASIL B', 'ASIL C', 'ASIL D'];

export const ProjectContextView: React.FC<ProjectContextViewProps> = ({
  context,
  setContext,
  issue,
  setIssue,
  onAnalyze,
  isAnalyzing,
  currentScenarioTitle,
  isCustomScenario,
  onOpenScenarioManage,
  onSaveCustomScenario,
  onDeleteCustomScenario,
  lastSavedAt,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const toggleCategory = (cat: IssueCategory) => {
    if (issue.issueCategories.includes(cat)) {
      if (issue.issueCategories.length > 1) {
        setIssue({
          ...issue,
          issueCategories: issue.issueCategories.filter((c) => c !== cat),
        });
      }
    } else {
      setIssue({
        ...issue,
        issueCategories: [...issue.issueCategories, cat],
      });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<IssueAttachment | null>(null);

  // 真实本地文件读取 (纯浏览器端 FileReader 处理，安全隔离，不上传外网)
  const processRealFile = (file: File): Promise<IssueAttachment> => {
    return new Promise((resolve) => {
      const sizeFormatted =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
          : `${(file.size / 1024).toFixed(1)} KB`;

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const isImage = file.type.startsWith('image/');
      const isText =
        file.type.startsWith('text/') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.log') ||
        file.name.endsWith('.txt');

      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id,
            name: file.name,
            type: file.type || 'image/png',
            size: sizeFormatted,
            dataUrl: reader.result as string,
            uploadedAt: new Date().toLocaleTimeString(),
          });
        };
        reader.onerror = () => {
          resolve({
            id,
            name: file.name,
            type: file.type,
            size: sizeFormatted,
            uploadedAt: new Date().toLocaleTimeString(),
          });
        };
        reader.readAsDataURL(file);
      } else if (isText) {
        const reader = new FileReader();
        reader.onload = () => {
          const text = (reader.result as string) || '';
          const lines = text.split('\n');
          resolve({
            id,
            name: file.name,
            type: file.type || 'text/plain',
            size: sizeFormatted,
            textSample: text.slice(0, 800),
            rowCount: lines.length,
            uploadedAt: new Date().toLocaleTimeString(),
          });
        };
        reader.onerror = () => {
          resolve({
            id,
            name: file.name,
            type: file.type,
            size: sizeFormatted,
            uploadedAt: new Date().toLocaleTimeString(),
          });
        };
        reader.readAsText(file.slice(0, 100 * 1024)); // preview first 100KB
      } else {
        resolve({
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: sizeFormatted,
          uploadedAt: new Date().toLocaleTimeString(),
        });
      }
    });
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newAttachments = await Promise.all(fileArray.map(processRealFile));
    setIssue((prev) => {
      const merged = { ...(prev.measuredValues || {}) };
      const importedKeys = new Set<string>();
      for (const a of newAttachments) {
        if (a.textSample) {
          const extracted = extractMeasurementsFromText(prev, a.textSample);
          Object.assign(merged, extracted);
          Object.keys(extracted).forEach((k) => importedKeys.add(k));
        }
      }
      const measurementProvenance = { ...(prev.measurementProvenance || {}) };
      importedKeys.forEach((key) => { measurementProvenance[key] = { source: 'IMPORTED', sourceLabel: newAttachments.find(a => a.textSample)?.name || '导入文件', enteredAt: new Date().toISOString(), confidencePct: 90 }; });
      return {
        ...prev,
        attachments: [...(prev.attachments || []), ...newAttachments],
        measuredValues: merged,
        measurementProvenance,
        measuredValueSource: Object.keys(merged).length ? 'IMPORTED' : 'IMPORTED',
      };
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  const downloadMeasurementTemplate = () => {
    const fields = getDomainMeasurementFields(issue);
    const rows = [
      'key,label,unit,tag,value',
      ...fields.map((f) => `${f.key},${f.label},${f.unit || ''},${f.tag},${issue.measuredValues?.[f.key] ?? ''}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ECU-Copilot-${resolveEngineeringDomain(issue)}-measurement-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 典型实测基准样本快速载入 (带真实波形与测试明细数据)
  const handleLoadBenchmarkPreset = (presetType: 'emc' | 'soa' | 'wcca' | 'bldc') => {
    let preset: IssueAttachment;
    if (presetType === 'emc') {
      preset = {
        id: `bench_emc_${Date.now()}`,
        name: 'CISPR25_RE_150MHz_Spectrum_Test.csv',
        type: 'text/csv',
        size: '14.8 KB',
        rowCount: 401,
        uploadedAt: new Date().toLocaleTimeString(),
        textSample: `Freq(MHz),Amplitude(dBuV/m),Limit_Class5(dBuV/m),Delta(dB)\n140.0,22.4,28.0,-5.6\n145.0,24.1,28.0,-3.9\n148.0,27.8,28.0,-0.2\n150.0,31.0,28.0,+3.0 [FAIL]\n152.0,29.2,28.0,+1.2 [FAIL]\n155.0,23.5,28.0,-4.5\n160.0,21.0,28.0,-7.0`,
      };
    } else if (presetType === 'soa') {
      preset = {
        id: `bench_soa_${Date.now()}`,
        name: 'MOSFET_Trench_SOA_Pulse5b_Scope.csv',
        type: 'text/csv',
        size: '32.1 KB',
        rowCount: 1024,
        uploadedAt: new Date().toLocaleTimeString(),
        textSample: `Time(us),Vds(V),Id(A),P_inst(W),SOA_Limit_P(W)\n0.0,12.0,0.0,0.0,1800.0\n10.0,28.5,42.0,1197.0,1800.0\n15.0,38.2,56.0,2139.2,1800.0 [SOA EXCEEDED!]\n20.0,42.0,30.0,1260.0,1800.0\n30.0,14.0,2.0,28.0,1800.0`,
      };
    } else if (presetType === 'wcca') {
      preset = {
        id: `bench_wcca_${Date.now()}`,
        name: 'ADC_Dividers_WCCA_MonteCarlo_Summary.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: '64.5 KB',
        rowCount: 10000,
        uploadedAt: new Date().toLocaleTimeString(),
        textSample: `Monte Carlo N=10000 runs\nNominal Vout: 3.300V\nWorst Case Max: 3.485V (+5.6%)\nWorst Case Min: 3.118V (-5.5%)\nRSS 3-Sigma: +/- 2.85%\nADC Error Budget Exceeded: YES (Grade 1 Temp)`,
      };
    } else {
      preset = {
        id: `bench_bldc_${Date.now()}`,
        name: 'BLDC_DeadTime_PhaseRing_TekScope.csv',
        type: 'text/csv',
        size: '28.4 KB',
        rowCount: 850,
        uploadedAt: new Date().toLocaleTimeString(),
        textSample: `Tektronix MSO54 Scope Waveform Export\nChannel 1: Phase-U High-Side Gate (V)\nChannel 2: Phase-U Low-Side Gate (V)\nMeasured Dead-time: 210 ns (Nominal Spec: 350 ns)\nSpike Ringing: 46.2V @ 12V Bus (Margin: 1.8V to 48V Vds_max)`,
      };
    }

    setIssue((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), preset],
      measuredValueSource: 'BENCHMARK',
    }));
  };

  const removeAttachment = (id: string) => {
    setIssue((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((a) => a.id !== id),
    }));
  };

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white flex items-center">
                <Layers className="w-5 h-5 mr-2 text-blue-400" />
                ECU 硬件项目背景与技术问题输入
              </h2>
              {currentScenarioTitle && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                  isCustomScenario
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : 'bg-blue-950/60 border-blue-500/40 text-blue-300'
                }`}>
                  <span>工况:</span>
                  <span className="font-semibold">{currentScenarioTitle}</span>
                  {isCustomScenario && <span className="text-[10px] bg-emerald-500/20 px-1 rounded">自定义工程</span>}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              提供明确的技术事实与工程数据（如超标 dB、温升 ℃、裕量 mV、WCCA 公差），支持自由修改、新建空白工况或另存为自定义工况。
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            {onOpenScenarioManage && (
              <button
                type="button"
                id="context-scenario-manage-btn"
                onClick={onOpenScenarioManage}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="新建空白工况或将当前编辑内容另存为新工况"
              >
                <FolderPlus className="w-4 h-4 text-blue-400" />
                <span>新建 / 另存为工况</span>
              </button>
            )}
            <button
              id="start-evaluate-action-btn"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isAnalyzing ? '正在运行深度工程推理...' : '开始风险评估与决策推荐 →'}
            </button>
          </div>
        </div>

        {/* Persistence & Lifecycle Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-950/50 -mx-5 -mb-5 px-5 py-3 rounded-b-xl">
          {isCustomScenario ? (
            <>
              <div className="flex items-center gap-2 text-slate-300 flex-wrap">
                <span className="flex items-center text-emerald-400 font-medium bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  实时本地持久化已激活
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">
                  {lastSavedAt ? `上次已保存于 ${lastSavedAt}` : '所填内容已实时自动同步至本地缓存，重新打开或切换不丢失'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onSaveCustomScenario && (
                  <button
                    type="button"
                    id="save-current-custom-scenario-btn"
                    onClick={onSaveCustomScenario}
                    className="px-3 py-1.5 bg-emerald-800/50 hover:bg-emerald-700/70 text-emerald-100 border border-emerald-500/40 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="立即手动保存所有最新修改"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-300" />
                    <span>保存当前修改</span>
                  </button>
                )}
                {onDeleteCustomScenario && (
                  <button
                    type="button"
                    id="delete-current-custom-scenario-btn"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="彻底删除此自定义工程"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>删除此工程</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-slate-400 flex-wrap">
                <span className="flex items-center text-blue-400 font-medium bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/30">
                  <span className="w-2 h-2 rounded-full bg-blue-400 mr-1.5 inline-block"></span>
                  系统预置标准工况
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">
                  当前为系统只读基准工况。如需永久保存自己的真实项目数据，可随时点击右侧另存为专属工程。
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onOpenScenarioManage && (
                  <button
                    type="button"
                    onClick={onOpenScenarioManage}
                    className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 border border-blue-500/40 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
                    <span>另存为我的专属工程</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-950/60 border border-red-500/40 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">确认彻底删除此工程？</h3>
                <p className="text-xs text-slate-400 mt-0.5">删除后无法恢复，将从本地存储中彻底清除该工程数据。</p>
              </div>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs text-slate-300">
              <div className="font-semibold text-white text-sm">{context.projectName || currentScenarioTitle || '当前自建工程'}</div>
              <div className="text-slate-400 text-[11px] mt-1">包含所有填写的参数指标、测试波形记录及实测问题描述。</div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDeleteCustomScenario?.();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-sm"
              >
                确认彻底删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part 1: Project Background */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-blue-400" />
          Step 1: 项目上下文与工程约束
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Project Name */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">项目名称 (Project Name)</label>
            <input
              type="text"
              value={context.projectName}
              onChange={(e) => setContext({ ...context, projectName: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Product Type */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">产品类型 (Product Type)</label>
            <input
              type="text"
              value={context.productType}
              onChange={(e) => setContext({ ...context, productType: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* ECU Architecture */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">ECU 架构 (ECU Architecture)</label>
            <input
              type="text"
              value={context.ecuType}
              onChange={(e) => setContext({ ...context, ecuType: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Customer */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">主机厂/客户 (Customer)</label>
            <input
              type="text"
              value={context.customer}
              onChange={(e) => setContext({ ...context, customer: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Project Phase */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">当前阶段 (Project Phase)</label>
            <select
              value={context.projectPhase}
              onChange={(e) => setContext({ ...context, projectPhase: e.target.value as ProjectPhase })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* ASIL Level */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">安全等级 (ISO 26262 ASIL)</label>
            <select
              value={context.asilLevel}
              onChange={(e) => setContext({ ...context, asilLevel: e.target.value as AsilLevel })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              {ASIL_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          {/* Next Milestone & Days */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">下一关键节点 (Milestone)</label>
            <input
              type="text"
              value={context.nextMilestone}
              onChange={(e) => setContext({ ...context, nextMilestone: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Days remaining */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center justify-between">
              <span>距离关键节点 (天)</span>
              <span className="text-amber-400 font-mono font-bold">{context.daysRemaining} Days</span>
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={context.daysRemaining}
              onChange={(e) => setContext({ ...context, daysRemaining: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Cost Constraint */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">成本约束 (BOM Constraint)</label>
            <input
              type="text"
              value={context.costConstraint}
              onChange={(e) => setContext({ ...context, costConstraint: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* SOP Target */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">量产节点 (SOP Date)</label>
            <input
              type="text"
              value={context.sopDate}
              onChange={(e) => setContext({ ...context, sopDate: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Sample Status */}
          <div className="sm:col-span-2">
            <label className="block text-slate-400 mb-1 font-medium">当前样件与治具状态 (Sample Status)</label>
            <input
              type="text"
              value={context.sampleStatus}
              onChange={(e) => setContext({ ...context, sampleStatus: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              placeholder="例如：B样件，3D打印塑料临时夹具，未安装量产压铸铝外壳"
            />
          </div>
        </div>

        {/* 客户特殊技术/商务协议 (Customer Special Agreements - CSA / 硬约束否决线) */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <label className="text-slate-300 font-semibold flex items-center text-xs">
              <ShieldCheck className="w-4 h-4 mr-1.5 text-blue-400" />
              客户特殊协议与不可妥协约束 (Customer Special Agreements / Hard Veto Gates)
            </label>
            <span className="text-[11px] text-slate-400">
              触发条款时将在 CTSQL 评估中激活【一票否决 (Veto)】与违约警报
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-2">
            {(context.customerSpecialAgreements || []).map((csa) => (
              <div
                key={csa.id}
                className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-blue-400 font-bold">{csa.id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/60 font-semibold">
                      强制否决红线
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-200">{csa.parameter}</div>
                </div>
                <div className="mt-2 text-[11px] text-amber-400 font-mono font-medium bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                  指标门限: {csa.requiredValue}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 关键决策维度：直属领导处理风格与态度倾向 (Leadership Profile) */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <label className="text-slate-300 font-semibold flex items-center text-xs">
              <UserCheck className="w-4 h-4 mr-1.5 text-amber-400" />
              直属领导处理风格与态度倾向 (Leadership Profile - 方案接纳度加权注入)
            </label>
            <span className="text-[11px] text-slate-400">
              各角色心理透视引擎将依据领导风格自动计算【领导通关指数】
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. 技术求稳型 */}
            <div
              onClick={() => setContext({ ...context, hwLeadStyle: 'CONSERVATIVE' })}
              className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                (context.hwLeadStyle || 'CONSERVATIVE') === 'CONSERVATIVE'
                  ? 'bg-blue-950/40 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/50'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1.5">
                <ShieldAlert className={`w-4 h-4 ${
                  (context.hwLeadStyle || 'CONSERVATIVE') === 'CONSERVATIVE' ? 'text-blue-400' : 'text-slate-500'
                }`} />
                <span className="font-bold text-xs">🛡️ 技术求稳型 (Quality First)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                宁可项目稍微推迟 2 周，绝不接受降额不足或带病特采。看重物理机理彻底根治与部门威信，严防量产爆雷。
              </p>
              <div className="mt-2 pt-2 border-t border-slate-700/40 text-[10px] text-blue-300 flex justify-between">
                <span>偏好: 原位高规格/彻底根治</span>
                <span>排斥: 降额贴线/特采硬上</span>
              </div>
            </div>

            {/* 2. 敏捷交付型 */}
            <div
              onClick={() => setContext({ ...context, hwLeadStyle: 'AGILE_DELIVERY' })}
              className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                context.hwLeadStyle === 'AGILE_DELIVERY'
                  ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/50'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1.5">
                <Zap className={`w-4 h-4 ${
                  context.hwLeadStyle === 'AGILE_DELIVERY' ? 'text-emerald-400' : 'text-slate-500'
                }`} />
                <span className="font-bold text-xs">🚀 敏捷交付型 (Delivery First)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                以保住 DV/PV 节点为第一要务。只要台架测过、不起火烧管，优先在内部用软件或原位贴片消化，极度抗拒重新改版。
              </p>
              <div className="mt-2 pt-2 border-t border-slate-700/40 text-[10px] text-emerald-300 flex justify-between">
                <span>偏好: Tier 0 软件/原位吸收</span>
                <span>排斥: 重新投板/挤占人力</span>
              </div>
            </div>

            {/* 3. 流程免责型 */}
            <div
              onClick={() => setContext({ ...context, hwLeadStyle: 'PROCESS_DEFENSIVE' })}
              className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                context.hwLeadStyle === 'PROCESS_DEFENSIVE'
                  ? 'bg-amber-950/40 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/50'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1.5">
                <Scale className={`w-4 h-4 ${
                  context.hwLeadStyle === 'PROCESS_DEFENSIVE' ? 'text-amber-400' : 'text-slate-500'
                }`} />
                <span className="font-bold text-xs">⚖️ 流程免责型 (Boundary First)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                极度注重权责划分。外部线束或客户工况引起的超标坚决踢球发起外部 ECR，绝不让硬件单方面签字背连带责任。
              </p>
              <div className="mt-2 pt-2 border-t border-slate-700/40 text-[10px] text-amber-300 flex justify-between">
                <span>偏好: 跨部门会签/ECR留痕</span>
                <span>排斥: 硬件单方默默背锅</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Part 2: Issue Categorization & Technical Facts */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center">
          <Tag className="w-4 h-4 mr-2 text-blue-400" />
          Step 2: 问题分类 (多选)
        </h3>

        {/* Categories Chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_CATEGORIES.map((cat) => {
            const isSelected = issue.issueCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white border border-blue-400 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center">
          <FileText className="w-4 h-4 mr-2 text-blue-400" />
          Step 3: 提取真实技术事实与工程数据
        </h3>

        <div className="space-y-4 text-xs">
          {/* Requirement vs Actual measurement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                标准与设计要求 (Requirement / Spec)
              </label>
              <textarea
                rows={3}
                value={issue.requirement}
                onChange={(e) => setIssue({ ...issue, requirement: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-white focus:border-blue-500 focus:outline-none"
                placeholder="例如：CISPR 25 Class 5 RE 限值 <= 28 dBuV/m；或 WCCA 误差 <= ±1.0%"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                实际测量数据与偏差 (Actual Measurement & Deviation)
              </label>
              <textarea
                rows={3}
                value={issue.actualMeasurement}
                onChange={(e) => setIssue({ ...issue, actualMeasurement: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-white focus:border-blue-500 focus:outline-none"
                placeholder="例如：150MHz 实测 31 dBuV/m 超标 +3.0dB；或温升实测 +14℃ 裕量仅 3℃"
              />
            </div>
          </div>

          {/* 可量化实测参数回填：这些数值会进入本地专家引擎，覆盖默认示例参数 */}
          {(() => {
            const quality = getDomainDataQuality(issue);
            const pct = quality.requiredCount ? Math.round((quality.requiredDone / quality.requiredCount) * 100) : 100;
            return (
              <div className="mb-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white">当前工况数据就绪度 · {resolveEngineeringDomain(issue)}</div>
                    <div className="text-[10px] text-slate-500 mt-1">规则/公式可以先运行；但正式放行前，标记为“必填”的 MEASURED / SPEC 必须补齐。</div>
                  </div>
                  <div className="text-xs font-mono text-cyan-300">{quality.requiredDone}/{quality.requiredCount} 必填 · {pct}%</div>
                </div>
                <div className="mt-2 h-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-cyan-500" style={{width:`${pct}%`}} /></div>
                {quality.missingRequired.length > 0 && <div className="mt-2 text-[10px] text-amber-300">尚缺：{quality.missingRequired.join('、')}</div>}
              </div>
            );
          })()}
          <div className="bg-slate-950/60 border border-blue-900/40 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-300 font-semibold">实测参数回填（真实数据优先）</label>
              <span className="text-[10px] text-blue-300">{issue.measuredValueSource === 'USER_MEASURED' ? '来源：工程师手工实测回填' : issue.measuredValueSource === 'IMPORTED' ? '来源：导入原始数据文件' : issue.measuredValueSource === 'BENCHMARK' ? '来源：系统基准样例（仅演示，可覆盖）' : '来源：尚未标记'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {(() => {
                const fields = getDomainMeasurementFields(issue);
                return fields.map((field) => {
                  const key = field.key;
                  const label = field.label;
                  return (
                    <div key={key}>
                      <label className="block text-[10px] text-slate-500 mb-1">{label} {field.unit ? `(${field.unit})` : ''}{field.required ? ' *' : ''} <span className={((issue.measurementProvenance?.[key]?.source || (issue.measuredValueSource === 'BENCHMARK' && field.tag !== 'CALCULATED' ? 'BENCHMARK' : field.tag)) === 'BENCHMARK') ? 'text-violet-400' : field.tag === 'CALCULATED' ? 'text-cyan-500' : field.tag === 'SPEC' ? 'text-amber-500' : 'text-emerald-500'}>· {issue.measurementProvenance?.[key]?.source || (issue.measuredValueSource === 'BENCHMARK' && field.tag !== 'CALCULATED' ? 'BENCHMARK' : field.tag)}</span></label>
                      <input
                        type="number"
                        step="any"
                        value={issue.measuredValues?.[key] ?? ''}
                        disabled={field.tag === 'CALCULATED'}
                        onChange={(e) => setIssue({
                          ...issue,
                          measuredValues: { ...(issue.measuredValues || {}), [key]: e.target.value === '' ? '' : Number(e.target.value) },
                          measuredValueSource: 'USER_MEASURED',
                          measurementProvenance: { ...(issue.measurementProvenance || {}), [key]: { source: 'USER_MEASURED', sourceLabel: '工程师手工回填', enteredAt: new Date().toISOString(), confidencePct: 95 } },
                        })}
                        className={`w-full border rounded px-2 py-1.5 font-mono text-xs focus:outline-none ${field.tag === 'CALCULATED' ? 'bg-slate-900/50 border-cyan-900/40 text-cyan-300 cursor-not-allowed' : 'bg-slate-800 border-slate-700 text-white focus:border-blue-500'}`}
                      />
                    </div>
                  );
                });
              })()}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">不适用的参数留空。原始报告/示波器/温箱数据仍建议保留在“实际测量数据”文本框或附件中，系统不会把计算值冒充实测值。</p>
          </div>

          {/* Test condition & Environment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                测试条件与负载 (Test Condition / Load)
              </label>
              <input
                type="text"
                value={issue.testCondition}
                onChange={(e) => setIssue({ ...issue, testCondition: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="例如：13.5V 输入，5V/10A 满载，20kHz PWM 驱动"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                测试环境 (Environment)
              </label>
              <input
                type="text"
                value={issue.environment}
                onChange={(e) => setIssue({ ...issue, environment: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="例如：半电波暗室 25℃，或 85℃ 密闭温箱自然对流"
              />
            </div>
          </div>

          {/* Failure Phenomenon */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              底层失效现象与特征 (Failure Phenomenon)
            </label>
            <input
              type="text"
              value={issue.failurePhenomenon}
              onChange={(e) => setIssue({ ...issue, failurePhenomenon: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              placeholder="例如：150MHz 谐波与 Gate Driver DC/DC 频点一致；或高温下 MOSFET Rds(on) 翻倍"
            />
          </div>

          {/* Engineering Concern */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              工程决策困境与冲突 (Engineering Concern & Trade-off)
            </label>
            <textarea
              rows={3}
              value={issue.engineeringConcern}
              onChange={(e) => setIssue({ ...issue, engineeringConcern: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-white focus:border-blue-500 focus:outline-none"
              placeholder="例如：距离 DV 仅剩 2 周无法重新改版，但直接用正式金属外壳测试又有失败风险；或器件升级 +$1.50 超出预算"
            />
          </div>

          {/* 历史复发次数与质量惩罚机制 (Recurrence Count & Non-linear Q-penalty) */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-lg p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="text-slate-300 font-semibold flex items-center text-xs">
                <AlertCircle className="w-4 h-4 mr-1.5 text-amber-400" />
                该失效模式历史复发次数 (Historical Recurrence Count)
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-400">质量 Q 分非线性惩罚:</span>
                <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                  (issue.recurrenceCount || 0) === 0
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                    : (issue.recurrenceCount || 0) === 1
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                    : 'bg-red-950/80 text-red-400 border border-red-800/60'
                }`}>
                  {(issue.recurrenceCount || 0) === 0 ? '1.0x (首发无罚)' : (issue.recurrenceCount || 0) === 1 ? '0.85x (-15%)' : (issue.recurrenceCount || 0) === 2 ? '0.65x (-35%)' : '0.40x (-60% 严重降级)'}
                </span>
                {(issue.recurrenceCount || 0) >= 2 && (
                  <span className="text-[10px] bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800 font-semibold">
                    触发生态漂移: 流程免责型
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={issue.recurrenceCount || 0}
                onChange={(e) => setIssue({ ...issue, recurrenceCount: parseInt(e.target.value) || 0 })}
                className="flex-1 accent-amber-500 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-white bg-slate-900 px-2.5 py-1 rounded border border-slate-700 min-w-[50px] text-center">
                {issue.recurrenceCount || 0} 次
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              当该类质量缺陷在量产前多次重复发生 (&ge; 2 次)，质量惩罚呈非线性急剧加深，直属领导将启动“避险防御”自动向【流程免责型 (PROCESS_DEFENSIVE)】漂移，倒逼工程团队彻底根治。
            </p>
          </div>

          {/* Attachments / Data Files Upload */}
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
              <label className="block text-slate-300 font-semibold text-xs">
                测试波形、频谱、数据表格与规范附件 (Attachments / Spectrum / Scope / Excel)
              </label>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center">
                <ShieldCheck className="w-3 h-3 mr-1" />
                本地纯前端解析 (零数据外传，保障车规机密)
              </span>
            </div>

            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) {
                  handleFilesSelected(e.target.files);
                  e.target.value = ''; // reset so same file can be re-selected
                }
              }}
              multiple
              accept=".png,.jpg,.jpeg,.csv,.xlsx,.xls,.pdf,.txt,.json"
              className="hidden"
            />

            {/* Drag & Drop Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer ${
                isDragging
                  ? 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/20'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 transition ${isDragging ? 'text-blue-400 scale-110' : 'text-slate-400'}`} />
              <div className="text-slate-200 font-medium text-xs">
                点击选择本地文件，或将测试附件直接拖拽至此处
              </div>
              <p className="text-slate-400 text-[11px] mt-1">
                支持示波器/频谱/量产数据 (.csv/.txt)、图片/报告 (.png/.jpg/.pdf)、WCCA 表格附件 (.xlsx)；关键数值建议导出 CSV 自动提取
              </p>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <button
                type="button"
                onClick={() => setIssue((prev) => {
                  const merged = { ...(prev.measuredValues || {}) };
                  const measurementProvenance = { ...(prev.measurementProvenance || {}) };
                  for (const a of (prev.attachments || [])) {
                    if (!a.textSample) continue;
                    const extracted = extractMeasurementsFromText(prev, a.textSample);
                    Object.assign(merged, extracted);
                    Object.keys(extracted).forEach((key) => { measurementProvenance[key] = { source: 'IMPORTED', sourceLabel: a.name, enteredAt: new Date().toISOString(), confidencePct: 90 }; });
                  }
                  return { ...prev, measuredValues: merged, measurementProvenance, measuredValueSource: Object.keys(merged).length ? 'IMPORTED' : prev.measuredValueSource };
                })}
                className="px-3 py-1.5 rounded-lg border border-cyan-800 bg-cyan-950/30 text-cyan-300 text-[11px] hover:bg-cyan-950/60 transition cursor-pointer"
              >
                从已上传 CSV/TXT 自动提取数值
              </button>
              <button type="button" onClick={downloadMeasurementTemplate} className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-[11px] hover:bg-slate-700 transition cursor-pointer">下载当前工况 CSV 模板</button>
              <span className="text-[10px] text-slate-500">当前模块：{resolveEngineeringDomain(issue)} · CSV/TXT 可自动提取；XLSX/PDF先作为证据留档，建议将关键数值导出CSV后导入，不猜数据。</span>
            </div>

            {/* Benchmark Presets Quick Load */}
            <div className="mt-3 bg-slate-850/60 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center">
                  <Zap className="w-3 h-3 text-amber-400 mr-1" />
                  快速载入典型实测数据样本 (Preset Benchmarks):
                </span>
                <span className="text-[10px] text-slate-400">
                  点击直接导入标准测试集
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleLoadBenchmarkPreset('emc')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded text-[11px] transition cursor-pointer text-left truncate flex items-center space-x-1"
                >
                  <span className="text-blue-400 shrink-0 font-bold">+</span>
                  <span className="truncate">CISPR25 频谱 (.csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadBenchmarkPreset('soa')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded text-[11px] transition cursor-pointer text-left truncate flex items-center space-x-1"
                >
                  <span className="text-amber-400 shrink-0 font-bold">+</span>
                  <span className="truncate">MOSFET SOA (.csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadBenchmarkPreset('wcca')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded text-[11px] transition cursor-pointer text-left truncate flex items-center space-x-1"
                >
                  <span className="text-emerald-400 shrink-0 font-bold">+</span>
                  <span className="truncate">WCCA 容差表 (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadBenchmarkPreset('bldc')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded text-[11px] transition cursor-pointer text-left truncate flex items-center space-x-1"
                >
                  <span className="text-purple-400 shrink-0 font-bold">+</span>
                  <span className="truncate">BLDC 振铃波形 (.csv)</span>
                </button>
              </div>
            </div>

            {/* Uploaded files list */}
            {issue.attachments && issue.attachments.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] text-slate-400 font-medium">
                  已附加文件 ({issue.attachments.length}):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {issue.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between bg-slate-800/90 border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-300 hover:border-slate-600 transition"
                    >
                      <div className="flex items-center space-x-2 truncate min-w-0 mr-2">
                        {att.dataUrl ? (
                          <img
                            src={att.dataUrl}
                            alt="preview"
                            className="w-6 h-6 rounded object-cover border border-slate-600 shrink-0"
                          />
                        ) : att.name.endsWith('.csv') || att.name.endsWith('.xlsx') ? (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                        <div className="truncate min-w-0">
                          <span className="font-medium text-slate-200 block truncate">{att.name}</span>
                          <span className="text-slate-400 text-[10px] font-mono">
                            {att.size} {att.rowCount ? `· ${att.rowCount} 行数据` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {(att.dataUrl || att.textSample) && (
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(att)}
                            className="p-1 hover:bg-slate-700 text-slate-400 hover:text-blue-300 rounded cursor-pointer transition"
                            title="预览文件详情"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="p-1 hover:bg-red-950/60 text-slate-400 hover:text-red-400 rounded cursor-pointer transition"
                          title="移除附件"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="font-bold text-sm text-white truncate">{previewAttachment.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {previewAttachment.size}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto text-xs font-mono bg-slate-950 rounded-lg p-4 text-slate-300">
              {previewAttachment.dataUrl ? (
                <div className="flex flex-col items-center justify-center space-y-2">
                  <img
                    src={previewAttachment.dataUrl}
                    alt={previewAttachment.name}
                    className="max-h-[500px] object-contain rounded border border-slate-800"
                  />
                  <span className="text-[11px] text-slate-400">实测截图/波形已载入内存</span>
                </div>
              ) : previewAttachment.textSample ? (
                <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-emerald-300">
                  {previewAttachment.textSample}
                </pre>
              ) : (
                <p className="text-slate-400 italic">二进制附件已就绪，已关联至当前工程工况。</p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                关闭预览
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
