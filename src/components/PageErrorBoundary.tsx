import React, { Component } from 'react';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('ECU Copilot page render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl border border-red-500/40 bg-red-950/30 p-6 text-sm text-red-200">
          <div className="font-semibold text-red-300 mb-2">页面渲染异常，已阻止白屏</div>
          <div className="text-red-200/80 break-words">
            {this.state.message || '未知运行时异常'}
          </div>
          <button
            className="mt-4 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            重试当前页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
