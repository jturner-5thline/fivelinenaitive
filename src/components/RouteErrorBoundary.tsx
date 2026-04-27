import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Human-readable name of the route, e.g. "Dashboard". Used in the fallback copy. */
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Route-scoped error boundary.
 *
 * Sits inside the app shell (below providers + AppLayout) and catches render
 * errors thrown by a single route's tree — e.g. a `ReferenceError: Tabs is
 * not defined` from a stale JSX reference — without tripping the top-level
 * ErrorBoundary or blanking the whole shell.
 *
 * Renders a friendly inline fallback with the error message, a retry button
 * (re-mounts the route subtree), and a link back to the homepage.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const route =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '(unknown)';
    console.error(
      `[ROUTE ERROR${this.props.routeName ? ` · ${this.props.routeName}` : ''}]`,
      error.message,
      '\n  route:',
      route,
      '\n  componentStack:',
      errorInfo.componentStack,
      '\n  error:',
      error,
    );
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;
      const { routeName } = this.props;
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card/60 p-8 shadow-sm backdrop-blur">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Something went wrong loading{' '}
                    {routeName ? `the ${routeName}` : 'this page'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We hit an unexpected error while rendering this view. Your
                    data is safe — try retrying, or head back home.
                  </p>
                </div>

                {error?.message && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                    <p className="font-mono text-xs text-destructive break-words">
                      {error.message}
                    </p>
                  </div>
                )}

                {import.meta.env.DEV && (error?.stack || componentStack) && (
                  <details className="rounded-md border border-border bg-muted/40 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Developer details
                    </summary>
                    {error?.stack && (
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {error.stack}
                      </pre>
                    )}
                    {componentStack && (
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {componentStack}
                      </pre>
                    )}
                  </details>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" onClick={this.handleRetry}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Try again
                  </Button>
                  <Button size="sm" variant="outline" onClick={this.handleReload}>
                    Reload page
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href="/">
                      <Home className="mr-1.5 h-3.5 w-3.5" />
                      Go home
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;