import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListPlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';

interface Props {
  eventId: string;
  /** Default CTA: opens the task dialog with a generic follow-up title. */
  onOpenTask: (initialTitle?: string) => void;
}

export function MeetingTasksInlineAction({ eventId, onOpenTask }: Props) {
  const { data: ctx, isLoading } = useMeetingClaapContext(eventId);

  const suggestions = ctx?.nextSteps?.filter(Boolean) || [];
  if (suggestions.length === 0) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-8 justify-start gap-2 text-xs"
        onClick={() => onOpenTask()}
        disabled={isLoading && !ctx}
      >
        <ListPlus className="h-3.5 w-3.5" /> Create task
      </Button>
    );
  }

  return (
    <div className={cn(
      'rounded-md border px-2.5 py-1.5 flex items-center gap-2',
      'border-emerald-500/30 bg-emerald-500/[0.05]',
    )}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white" title={suggestions.join(' • ')}>
        <ListPlus className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">▶ {suggestions.length} task{suggestions.length === 1 ? '' : 's'} suggested</span>
      </div>
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI suggested
      </Badge>
      <Button
        size="sm" variant="ghost"
        className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10 shrink-0"
        onClick={() => onOpenTask(suggestions[0])}
      >
        Review
      </Button>
    </div>
  );
}