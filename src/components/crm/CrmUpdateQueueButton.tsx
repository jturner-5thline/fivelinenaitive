import { useState } from 'react';
import { Sparkles, Check, X, Clock, ArrowRight, Loader2, Inbox, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  useCrmUpdateQueue,
  usePendingSuggestionsCount,
  useFieldSuggestionAction,
  getFieldLabel,
  type QueueSuggestion,
} from '@/hooks/useFieldSuggestions';
import { Link } from 'react-router-dom';


function confidenceBadge(c: number) {
  if (c >= 0.85) return 'bg-green-500/10 text-green-600 border-green-500/30';
  if (c >= 0.7) return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
  return 'bg-muted text-muted-foreground';
}

function QueueCard({
  s,
  onAction,
  isActing,
}: {
  s: QueueSuggestion;
  onAction: (a: 'accept' | 'reject' | 'snooze', id: string) => void;
  isActing: boolean;
}) {
  return (
    <div className="border border-border/60 rounded-lg p-3 space-y-2 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Link
              to={`/contacts/${s.contact_id}`}
              className="truncate hover:underline"
            >
              {s.contact_name || s.contact_email || 'Unknown contact'}
            </Link>
            {s.contact_company && (
              <span className="text-xs text-muted-foreground truncate">— {s.contact_company}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Suggested change: <span className="font-medium text-foreground">{getFieldLabel(s.field_name)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
            <span className="text-muted-foreground line-through truncate max-w-[40%]">
              {s.current_value || '(empty)'}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{s.suggested_value}</span>
            <Badge className={cn('text-[9px] shrink-0 border', confidenceBadge(Number(s.confidence)))}>
              {Math.round(Number(s.confidence) * 100)}%
            </Badge>
          </div>
          {s.source_snippet && (
            <p className="text-[11px] text-muted-foreground italic mt-1.5 line-clamp-2">
              Source: {s.source_type} ({s.created_at ? format(new Date(s.created_at), 'MMM d, yyyy') : ''}) — "{s.source_snippet}"
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
          onClick={() => onAction('accept', s.id)}
          disabled={isActing}
        >
          <Check className="h-3 w-3" /> Confirm
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={() => onAction('reject', s.id)}
          disabled={isActing}
        >
          <X className="h-3 w-3" /> Dismiss
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={() => onAction('snooze', s.id)}
          disabled={isActing}
        >
          <Clock className="h-3 w-3" /> Snooze 30d
        </Button>
      </div>
    </div>
  );
}

export function CrmUpdateQueueButton({ variant = 'outline' as const }) {
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = usePendingSuggestionsCount();
  const { data: queue = [], isLoading } = useCrmUpdateQueue();
  const action = useFieldSuggestionAction();

  const handleAction = (type: 'accept' | 'reject' | 'snooze', id: string) => {
    action.mutate({
      action: type,
      suggestion_id: id,
      ...(type === 'snooze'
        ? { snooze_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
        : {}),
    });
  };

  // Group by contact
  const grouped = queue.reduce<Record<string, QueueSuggestion[]>>((acc, s) => {
    (acc[s.contact_id] ||= []).push(s);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} size="sm" className="relative gap-1.5">
          <Sparkles className="h-4 w-4" />
          Updates
          {count > 0 && (
            <Badge className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground hover:bg-destructive">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            CRM Update Queue
            {count > 0 && (
              <Badge variant="secondary" className="text-[10px]">{count} pending</Badge>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            AI-suggested updates from email signatures, meetings, and deal activity. Review and confirm before applying — nothing is auto-applied.
          </p>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No pending updates</p>
                <p className="text-xs mt-1">AI suggestions will appear here as new evidence is detected.</p>
              </div>
            ) : (
              Object.entries(grouped).map(([contactId, items]) => (
                <div key={contactId} className="space-y-2">
                  {items.map((s) => (
                    <QueueCard key={s.id} s={s} onAction={handleAction} isActing={action.isPending} />
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}