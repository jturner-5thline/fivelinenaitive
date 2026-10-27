import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function ApprovalCheckError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div role="alert" className="w-full max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Unable to check account access</h1>
        <p className="text-muted-foreground">Please try again. Your approval status has not changed.</p>
        <Button onClick={onRetry} disabled={isRetrying}>
          <RefreshCw className={isRetrying ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Try Again
        </Button>
      </div>
    </div>
  );
}