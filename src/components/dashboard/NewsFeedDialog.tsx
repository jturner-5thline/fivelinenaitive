import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NewsFeedPanel } from './NewsFeedPanel';
import { cn } from '@/lib/utils';

interface NewsFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Popup overlay for the dashboard News Feed. Replaces the previous
 * Overview/News Feed tab control — News Feed is now launched from a
 * quick-action tile and rendered inside this dialog so it can sit alongside
 * the rest of the dashboard without taking over the page.
 */
export function NewsFeedDialog({ open, onOpenChange }: NewsFeedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden',
          'w-[calc(100vw-1rem)] sm:w-full max-w-[1200px]',
          'h-[calc(100vh-2rem)] sm:h-[90vh]',
          'pb-[env(safe-area-inset-bottom)]',
        )}
        aria-label="News Feed"
      >
        <DialogTitle className="sr-only">News Feed</DialogTitle>
        <DialogDescription className="sr-only">
          Industry news, market intelligence, and lender updates.
        </DialogDescription>
        <div className="h-full overflow-y-auto px-5 sm:px-6 pt-5 pb-6">
          <NewsFeedPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}