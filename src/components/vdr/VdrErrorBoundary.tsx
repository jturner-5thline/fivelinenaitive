import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

/**
 * Local error boundary for the Data Room tab. A crash inside the VDR
 * (e.g. unexpected data shape on a freshly provisioned demo workspace)
 * should NOT white-screen the whole deal view — we surface a safe empty
 * state and let the user keep using the other tabs.
 */
export class VdrErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[VdrErrorBoundary] Data Room crashed:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
        <AlertCircle className="h-6 w-6 text-amber-400" />
        <div className="text-sm font-medium">Data Room couldn't load</div>
        <div className="text-xs text-muted-foreground max-w-md">
          We hit an unexpected error rendering this deal's Data Room. Other
          tabs still work. Try refreshing — if this keeps happening, contact
          support.
        </div>
        {this.state.error?.message && (
          <div className="text-[11px] text-muted-foreground/70 font-mono mt-1 max-w-md break-words">
            {this.state.error.message}
          </div>
        )}
      </div>
    );
  }
}