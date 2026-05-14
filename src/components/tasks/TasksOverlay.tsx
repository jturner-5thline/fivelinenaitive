import { Suspense, lazy, Component, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const TasksPage = lazy(() => import('@/pages/Tasks'));

class TasksErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onFallback();
  }
  render() {
    if (this.state.hasError) return <Navigate to="/tasks" replace />;
    return this.props.children;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TasksOverlay({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="popup-shell-surface p-0 gap-0 max-w-none w-[calc(100vw-32px)] h-[calc(100vh-32px)] sm:w-[calc(100vw-48px)] sm:h-[calc(100vh-48px)] rounded-2xl overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20"
      >
        <VisuallyHidden>
          <DialogTitle>Tasks</DialogTitle>
        </VisuallyHidden>
        <div className="h-full w-full overflow-auto">
          <TasksErrorBoundary onFallback={() => onOpenChange(false)}>
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <TasksPage />
            </Suspense>
          </TasksErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}