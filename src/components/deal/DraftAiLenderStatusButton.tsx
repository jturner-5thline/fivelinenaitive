import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { draftLenderStatusFromEmails, classifyPassReasons } from '@/services/draftLenderStatusFromEmails';

const PASS_RE = /\b(pass(?:ed|ing)?|declin(?:e|ed|es|ing)|not (?:a )?(?:good )?fit|won['’]?t (?:be )?(?:mov|proceed)|not (?:moving|proceed)|too (?:tough|early))\b/i;

interface Props {
  lenderId: string;
  onApply: (text: string) => void;
  /** When provided and the draft reads as a pass, offers a combined note + Passed stage approval. */
  onApprovePass?: (text: string, passReasonLabels: string[]) => Promise<void> | void;
  passReasons?: { id: string; label: string }[];
  alreadyPassed?: boolean;
}

/** Drafts a one-sentence funding source update from emails with the lender that reference the deal. */
export function DraftAiLenderStatusButton({ lenderId, onApply, onApprovePass, alreadyPassed, passReasons = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [meta, setMeta] = useState({ count: 0, calls: 0, lender: '', deal: '' });
  const [isPass, setIsPass] = useState(false);
  const [movePassed, setMovePassed] = useState(true);
  const [applying, setApplying] = useState(false);
  const [context, setContext] = useState<string | undefined>();
  const [reasonIds, setReasonIds] = useState<string[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);

  const loadReasons = async (draft: string, ctx?: string) => {
    if (!passReasons.length) return;
    setReasonsLoading(true);
    try { setReasonIds(await classifyPassReasons(draft, ctx, passReasons)); }
    catch { setReasonIds([]); }
    finally { setReasonsLoading(false); }
  };

  const run = async () => {
    setLoading(true);
    setText('');
    setIsPass(false);
    setMovePassed(true);
    setReasonIds([]);
    try {
      const r = await draftLenderStatusFromEmails(lenderId);
      setMeta({ count: r.emailCount, calls: r.callCount || 0, lender: r.lenderName, deal: r.dealName });
      if (r.reason === 'no_contacts') { toast.error('No contact emails on this funding source to search by.'); setOpen(false); return; }
      if (r.reason === 'no_emails') { toast.info(`No recent emails or calls with ${r.lenderName} mentioning ${r.dealName || 'this deal'}.`); setOpen(false); return; }
      if (!r.text) { toast.error('Could not draft an update. Try again.'); return; }
      setText(r.text);
      setContext(r.context);
      const pass = PASS_RE.test(r.text);
      setIsPass(pass);
      if (pass && onApprovePass && !alreadyPassed) loadReasons(r.text, r.context);
    } catch (e: any) {
      toast.error(e?.message || 'Could not draft an update');
    } finally {
      setLoading(false);
    }
  };

  const showPass = isPass && !!onApprovePass && !alreadyPassed;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !text && !loading) run(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5" title="Draft AI update from funding source emails" aria-label="Draft AI funding source update">
          <Sparkles className="h-3 w-3 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-80 p-3 z-[1300] bg-popover space-y-2">
        <div className="text-xs font-medium">Draft AI update</div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning emails and calls with this funding source…
          </div>
        ) : (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[70px] text-sm" />
            {showPass && (
              <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={movePassed} onChange={(e) => setMovePassed(e.target.checked)} />
                <span>AI detected a pass. Also move this funding source's stage to <strong>Passed</strong>.</span>
              </label>
            )}
            {showPass && movePassed && passReasons.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Pass reasons {reasonsLoading ? '(AI analyzing…)' : `(${reasonIds.length}/3)`}</span>
                  {!reasonsLoading && <button type="button" className="underline" onClick={() => loadReasons(text, context)}>Re-analyze</button>}
                </div>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                  {passReasons.map((r) => {
                    const on = reasonIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!on && reasonIds.length >= 3}
                        onClick={() => setReasonIds((p) => (on ? p.filter((x) => x !== r.id) : [...p, r.id]))}
                        className={`rounded border px-1.5 py-0.5 text-[10px] leading-tight text-left disabled:opacity-40 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {(meta.count > 0 || meta.calls > 0) && (
              <p className="text-[11px] text-muted-foreground">
                Based on {[meta.count > 0 && `${meta.count} email${meta.count === 1 ? '' : 's'}`, meta.calls > 0 && `${meta.calls} recorded call${meta.calls === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} with {meta.lender}{meta.deal ? ` referencing ${meta.deal}` : ''}.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={applying} onClick={run}>Regenerate</Button>
              <Button
                size="sm"
                disabled={!text.trim() || applying || (showPass && movePassed && reasonsLoading)}
                onClick={async () => {
                  const t = text.trim();
                  setApplying(true);
                  try {
                    if (showPass && movePassed) await onApprovePass!(t, reasonIds.map((id) => passReasons.find((r) => r.id === id)?.label || id));
                    else onApply(t);
                    setOpen(false); setText(''); setIsPass(false);
                  } catch (e: any) {
                    toast.error(e?.message || 'Could not apply update');
                  } finally { setApplying(false); }
                }}
              >
                {applying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {showPass && movePassed ? 'Approve update & mark Passed' : 'Use update'}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
