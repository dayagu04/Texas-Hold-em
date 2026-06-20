import { Component, type ErrorInfo, type ReactNode } from "react";
import { zhCN } from "../i18n/zh-CN";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 顶层错误边界：捕获渲染错误，显示回退 UI。
 * 生产环境防止白屏，开发环境仍显示 React 错误覆盖层。
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-base flex items-center justify-center p-4">
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gold">
                {zhCN.common.errorBoundary}
              </h1>
              <p className="text-text-lo">
                应用遇到了意外错误，请重新加载页面
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="px-6 py-3 bg-gold text-base font-semibold rounded-lg hover:bg-gold/90 transition-colors"
            >
              {zhCN.common.reloadPage}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
