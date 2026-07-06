import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  lenderId?: string | null;
  lenderName?: string | null;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/**
 * Per-row error boundary for a single funding source (deal_lender) render.
 *
 * One malformed record (missing name, unexpected shape, corrupted note field,
 * etc.) MUST NOT be allowed to blank the entire Funding Sources section.
 * This boundary isolates each row, logs the offending record id/name to the
 * console, and renders a compact inline fallback so the rest of the list
 * still renders. Used both by the inline lender list on the deal page and
 * by the LendersKanban tiles.
 */
export class LenderRowBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unknown render error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[FundingSources] failed to render funding-source row', {
      lenderId: this.props.lenderId ?? '(missing id)',
      lenderName: this.props.lenderName ?? '(missing name)',
      message: error?.message,
      componentStack: info?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <p className="font-semibold">
            {this.props.lenderName || 'Unknown funding source'}
          </p>
          <p className="mt-1 opacity-80">
            This funding source couldn’t be rendered
            {this.props.lenderId ? ` (id: ${this.props.lenderId})` : ''}.
            The rest of the section still loaded. See the browser console for details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default LenderRowBoundary;