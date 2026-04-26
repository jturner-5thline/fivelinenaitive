import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  source: 'render' | 'window.error' | null;
}

/**
 * Top-level error boundary.
 *
 * Catches:
 *   • React render errors (componentDidCatch)
 *   • Synchronous runtime errors anywhere on the page (window.onerror)
 *   • Unhandled promise rejections (window.onunhandledrejection — logged
 *     loudly but does NOT trip the fallback, since rejected fetches/etc.
 *     should not blank the whole UI)
 *
 * When an error fires we surface:
 *   • the message
 *   • the JS stack
 *   • the React component stack (when available)
 *   • the current route
 *   • a snapshot of any AiAssist draft state hung off `window.__aiAssistDebug`
 *     (the sidebar updates this defensively so we can see selectedOption,
 *     variant, drafts.length etc. at crash time)
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, source: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null, source: 'render' };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
  }

  private snapshotContext() {
    try {
      const route =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '(unknown)';
      const aiAssist =
        (window as unknown as { __aiAssistDebug?: Record<string, unknown> })
          .__aiAssistDebug ?? null;
      return { route, aiAssist };
    } catch {
      return { route: '(unknown)', aiAssist: null };
    }
  }

  private handleWindowError = (e: ErrorEvent) => {
    const ctx = this.snapshotContext();
    console.error(
      '[RUNTIME ERROR] window.error:',
      e.message,
      '\n  at',
      `${e.filename}:${e.lineno}:${e.colno}`,
      '\n  context:',
      ctx,
      '\n  error:',
      e.error,
    );
    if (!this.state.hasError) {
      this.setState({
        hasError: true,
        error:
          e.error instanceof Error
            ? e.error
            : new Error(e.message || 'Unknown runtime error'),
        componentStack: e.error?.stack ?? null,
        source: 'window.error',
      });
    }
  };

  private handleRejection = (e: PromiseRejectionEvent) => {
    const ctx = this.snapshotContext();
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(
      '[RUNTIME ERROR] unhandledrejection:',
      message,
      '\n  context:',
      ctx,
      '\n  reason:',
      reason,
    );
    // Do not trip the fallback for promise rejections — they often come from
    // background network calls and would hide an otherwise-healthy app.
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const ctx = this.snapshotContext();
    console.error(
      '[RUNTIME ERROR] React render crash:',
      error.message,
      '\n  context:',
      ctx,
      '\n  componentStack:',
      errorInfo.componentStack,
      '\n  error:',
      error,
    );
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      const ctx = this.snapshotContext();
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#0a0a0f',
            color: '#e2e8f0',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            padding: '2rem',
            overflow: 'auto',
          }}
        >
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                marginBottom: '0.5rem',
                color: '#f87171',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Runtime error
              {this.state.source ? ` (${this.state.source})` : ''}
            </h1>
            <p
              style={{
                color: '#fca5a5',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                marginBottom: '1rem',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              <div>
                <strong>Route:</strong> {ctx.route}
              </div>
              {ctx.aiAssist && (
                <div style={{ marginTop: '0.25rem' }}>
                  <strong>AiAssist state:</strong>{' '}
                  <code style={{ fontFamily: 'inherit' }}>
                    {JSON.stringify(ctx.aiAssist)}
                  </code>
                </div>
              )}
            </div>
            {this.state.error?.stack && (
              <pre
                style={{
                  background: '#1a1a24',
                  border: '1px solid #2a2a36',
                  borderRadius: '0.375rem',
                  padding: '0.75rem',
                  fontSize: '0.7rem',
                  color: '#cbd5e1',
                  overflow: 'auto',
                  maxHeight: '240px',
                  marginBottom: '0.75rem',
                }}
              >
                {this.state.error.stack}
              </pre>
            )}
            {this.state.componentStack && (
              <details open style={{ marginBottom: '1rem' }}>
                <summary
                  style={{
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    marginBottom: '0.5rem',
                  }}
                >
                  Component stack
                </summary>
                <pre
                  style={{
                    background: '#1a1a24',
                    border: '1px solid #2a2a36',
                    borderRadius: '0.375rem',
                    padding: '0.75rem',
                    fontSize: '0.7rem',
                    color: '#cbd5e1',
                    overflow: 'auto',
                    maxHeight: '240px',
                  }}
                >
                  {this.state.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({
                  hasError: false,
                  error: null,
                  componentStack: null,
                  source: null,
                });
                window.location.reload();
              }}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() =>
                this.setState({
                  hasError: false,
                  error: null,
                  componentStack: null,
                  source: null,
                })
              }
              style={{
                marginLeft: '0.5rem',
                padding: '0.5rem 1.5rem',
                backgroundColor: 'transparent',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Dismiss & continue
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}