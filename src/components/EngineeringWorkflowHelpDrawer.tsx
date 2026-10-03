import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import { CopilotAnalysisResult, IssueInput, ProjectContext } from '../types';
import { EngineeringWorkflowView } from './EngineeringWorkflowView';

interface EngineeringWorkflowHelpDrawerProps {
  open: boolean;
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

/**
 * WP6: 工程工作流保留为可达的帮助内容，但不再占用总览正式二级页。
 * 关闭抽屉不持久化状态；深链接 workflow 仍由导航层直接打开这里。
 */
export const EngineeringWorkflowHelpDrawer: React.FC<EngineeringWorkflowHelpDrawerProps> = ({
  open,
  context,
  issue,
  result,
  onClose,
  onNavigateTab,
}) => {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="关闭工程工作流帮助"
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] cursor-default"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="工程工作流帮助"
        className="fixed right-0 top-0 z-50 h-dvh w-[min(980px,96vw)] overflow-hidden border-l border-slate-700 bg-slate-950 shadow-2xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <HelpCircle className="h-4 w-4 shrink-0 text-cyan-400" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">工程工作流帮助</div>
              <div className="truncate text-[10px] text-slate-500">说明“事实 → 机理 → 方案 → 验证 → 决策 → 回归 → 交付”的使用路径，不作为独立分析结果页。</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-950 p-2 text-slate-400 hover:text-white hover:border-slate-500 transition cursor-pointer" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto p-4 sm:p-5">
          <EngineeringWorkflowView
            context={context}
            issue={issue}
            result={result}
            onNavigateTab={onNavigateTab}
          />
        </div>
      </aside>
    </>
  );
};
