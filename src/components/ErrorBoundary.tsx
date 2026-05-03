import { Component, ErrorInfo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

const reportedHashes = new Set<string>();
function reportFrontendError(payload: {
  error_type: string;
  message: string;
  stack?: string | null;
  feature_area?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const hash = `${payload.error_type}|${payload.message}`.slice(0, 200);
    if (reportedHashes.has(hash)) return;
    reportedHashes.add(hash);
    if (reportedHashes.size > 50) reportedHashes.clear();
    void supabase.functions.invoke('report-frontend-error', {
      body: {
        feature_area: payload.feature_area || 'frontend',
        error_type: payload.error_type,
        message: payload.message,
        stack: payload.stack ?? null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        metadata: payload.metadata ?? null,
      },
    });
  } catch {
    /* ignore reporting failures */
  }
}

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

  /**
   * Detect the family of errors that fire when the browser tries to load a
   * dynamic chunk URL that no longer exists (typical after a deploy or HMR
   * update while the tab is still open). When we see one, we attempt a
   * single hard reload guarded by sessionStorage so we never reload-loop.
   * Returns true when a reload was scheduled (caller should suppress
   * fallback rendering).
   */
  private maybeReloadOnChunkError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const isChunk =
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message) ||
      /Loading chunk \d+ failed/i.test(message) ||
      /Loading CSS chunk/i.test(message);
    if (!isChunk) return false;
    try {
      const KEY = 'chunk_reload_eb';
      if (sessionStorage.getItem(KEY)) return false;
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore — sessionStorage may be unavailable */
    }
    // Defer slightly so the current error log/handler can flush.
    setTimeout(() => window.location.reload(), 50);
    return true;
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
    // Benign browser noise — Chrome fires this when a ResizeObserver callback
    // schedules a layout change that itself triggers another resize on the
    // next frame. It does not indicate a real bug and must NOT trip the
    // fallback overlay. Silently swallow so it doesn't bubble to other
    // listeners (e.g. Vite's HMR overlay).
    const msg = e.message || (e.error instanceof Error ? e.error.message : '');
    if (
      /ResizeObserver loop completed with undelivered notifications/i.test(msg) ||
      /ResizeObserver loop limit exceeded/i.test(msg)
    ) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      return;
    }
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
    if (this.maybeReloadOnChunkError(e.error ?? e.message)) return;
    reportFrontendError({
      error_type: 'window.error',
      message: e.message || 'Unknown runtime error',
      stack: e.error instanceof Error ? e.error.stack : null,
      metadata: { filename: e.filename, lineno: e.lineno, colno: e.colno, route: ctx.route },
    });
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
    const reasonMsgEarly =
      e.reason instanceof Error ? e.reason.message : String(e.reason ?? '');
    if (
      /ResizeObserver loop completed with undelivered notifications/i.test(reasonMsgEarly) ||
      /ResizeObserver loop limit exceeded/i.test(reasonMsgEarly)
    ) {
      e.preventDefault?.();
      return;
    }
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
    // Stale dynamic-import chunks often surface as unhandled rejections
    // from React.lazy. Reload once to recover the user transparently.
    this.maybeReloadOnChunkError(reason);
    reportFrontendError({
      error_type: 'unhandledrejection',
      message,
      stack: reason instanceof Error ? reason.stack : null,
      metadata: { route: ctx.route },
    });
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
    reportFrontendError({
      error_type: 'react-render',
      message: error.message,
      stack: error.stack ?? null,
      metadata: { route: ctx.route, componentStack: errorInfo.componentStack },
    });
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