import React from "react";

type ErrorBoundaryState = { error: Error | null };

/**
 * 根级错误边界：单个页面渲染异常时保留可用外壳，避免整站白屏。
 * 不吞掉错误：仍会输出到控制台，方便开发定位。
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ui] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="yl-errorPage" role="alert">
        <p className="ys-kicker">页面出了点小问题</p>
        <h1>这一页暂时没打开</h1>
        <p>您刚才的操作没有丢。可以回到首页，或者刷新再试一次。</p>
        <div className="yl-errorPageActions">
          <a className="btn btnPrimary" href="/">
            回到首页
          </a>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      </main>
    );
  }
}
