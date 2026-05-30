import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';

interface Props {
  eventId: string;
  eventTitle: string;
  primaryAttendeeName?: string | null;
  primaryAttendeeEmail?: string | null;
  /** Opens the existing follow-up composer. Receives optional pre-filled body. */
  onOpenComposer: (prefilledBody?: string) => void;
}

function buildFollowupBody(summary: string | null, nextSteps: string[], name: string | null): string {
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  const intro = 'Thanks for the time today — quick recap and next steps:';
  const recap = summary
    ? summary.split('\n').slice(0, 3).map((l) => l.trim()).filter(Boolean).join(' ')
    : '';
  const steps = nextSteps.slice(0, 5).map((s) => `• ${s}`).join('\n');
  return [
    greeting,
    '',
    intro,
    recap ? `\n${recap}` : '',
    steps ? `\nNext steps:\n${steps}` : '',
    '',
    'Let me know if I missed anything.',
    '',
  ].filter(Boolean).join('\n');
}

export function MeetingFollowupInlineAction({
  eventId, eventTitle, primaryAttendeeName, primaryAttendeeEmail, onOpenComposer,
}: Props) {
  const { data: ctx, isLoading } = useMeetingClaapContext(eventId);
  const [opening, setOpening] = useState(false);

  const draftBody = useMemo(() => {
    if (!ctx || (!ctx.summary && ctx.nextSteps.length === 0)) return null;
    return buildFollowupBody(ctx.summary, ctx.nextSteps, primaryAttendeeName || null);
  }, [ctx, primaryAttendeeName]);

  // No recording or no AI content → legacy CTA
  if (!draftBody) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-8 justify-start gap-2 text-xs"
        onClick={() => onOpenComposer()}
        disabled={isLoading && !ctx}
      >
        <Mail className="h-3.5 w-3.5" /> Send follow-up
      </Button>
    );
  }

  const recipient = primaryAttendeeName || primaryAttendeeEmail || 'attendees';

  return (
    <div className={cn(
      'rounded-md border px-2.5 py-1.5 flex items-center gap-2',
      'border-emerald-500/30 bg-emerald-500/[0.05]',
    )}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white" title={`Draft follow-up to ${recipient}`}>
        <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">▶ Draft ready: Follow-up to {recipient}</span>
      </div>
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI suggested
      </Badge>
      <Button
        size="sm" variant="ghost"
        className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10 shrink-0"
        disabled={opening}
        onClick={() => { setOpening(true); onOpenComposer(draftBody); setTimeout(() => setOpening(false), 400); }}
      >
        Review & send
      </Button>
    </div>
  );
}