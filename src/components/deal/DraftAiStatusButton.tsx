import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { draftStatusFromEmails } from '@/services/draftStatusFromEmails';

interface Props {
  dealId: string;
  onApply: (text: string) => void;
}

/** Drafts a one-sentence status update from recent client emails; user reviews before applying. */
export function DraftAiStatusButton({ dealId, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);

  const run = async () => {
    setLoading(true);
    setText('');
    try {
      const r = await draftStatusFromEmails(dealId);
      setCount(r.emailCount);
      if (r.reason === 'no_domains') { toast.error('No client contact emails on this deal to search by.'); setOpen(false); return; }
      if (r.reason === 'no_emails') { toast.info('No recent emails with this client found in your mailbox.'); setOpen(false); return; }
      if (!r.text) { toast.error('Could not draft an update. Try again.'); return; }
      setText(r.text);
    } catch (e: any) {
      toast.error(e?.message || 'Could not draft an update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !text && !loading) run(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Draft AI update from client emails" aria-label="Draft AI update">
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-80 p-3 z-[1300] bg-popover space-y-2">
        <div className="text-xs font-medium">Draft AI update</div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading client emails…
          </div>
        ) : (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[70px] text-sm" />
            {count > 0 && <p className="text-[11px] text-muted-foreground">Based on {count} recent email{count === 1 ? '' : 's'} with the client.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={run}>Regenerate</Button>
              <Button size="sm" disabled={!text.trim()} onClick={() => { onApply(text.trim()); setOpen(false); setText(''); }}>
                Use update
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
