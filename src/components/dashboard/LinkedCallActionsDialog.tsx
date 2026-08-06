/**
 * LinkedCallActionsDialog
 * -----------------------
 * Action menu shown for a meeting that already has a Claap recording linked.
 * Starts with a single option ("Draft Q&A"); more options get added here later.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageSquareText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string | null;
  recordingTitle?: string | null;
}

interface ActionOption {
  key: string;
  label: string;
  description: string;
  icon: typeof MessageSquareText;
}

const ACTIONS: ActionOption[] = [
  {
    key: 'draft-qa',
    label: 'Draft Q&A',
    description: 'Turn the call into a question & answer list you can review and send.',
    icon: MessageSquareText,
  },
];

export function LinkedCallActionsDialog({ open, onOpenChange, eventTitle, recordingTitle }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Call actions</DialogTitle>
          <DialogDescription className="truncate">
            {recordingTitle || eventTitle || 'Linked call'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => toast.info(`${a.label} — coming soon`)}
                className="w-full text-left rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2.5 flex items-start gap-2.5"
              >
                <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LinkedCallActionsDialog;
