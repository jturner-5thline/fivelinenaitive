import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight, AlertCircle, RotateCw } from 'lucide-react';
import { EmailRichTextEditor } from './EmailRichTextEditor';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface BaseSubmissionDraft {
  subject: string;
  bodyHtml: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName?: string | null;
  /** Generate the initial lender-agnostic draft. Called once when the
   *  dialog opens (and on explicit retry). */
  generate: () => Promise<BaseSubmissionDraft>;
  /** Called after the edited base draft has been saved to the deal's
   *  Notes / deal space. The parent then opens Review & Exclude Lenders. */
  onContinue: (base: BaseSubmissionDraft) => void;
}

/**
 * Step 1 of the lender submission flow: a single, lender-agnostic AI draft
 * the user can edit. On Continue we persist the edited base into
 * `deal_space_notes` (tagged so it shows up in the deal's Notes view) and
 * then hand control back to the parent to open the Review & Exclude modal.
 */
export function BaseSubmissionEmailDialog({
  open, onOpenChange, dealId, dealName, generate, onContinue,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');

  const runGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const draft = await generate();
      setSubject(draft.subject || '');
      setBodyHtml(draft.bodyHtml || '');
    } catch (e: any) {
      setError(e?.message || 'Could not generate base email');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      // Reset between sessions so the next open starts fresh.
      setSubject('');
      setBodyHtml('');
      setError(null);
      return;
    }
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleContinue = async () => {
    if (!subject.trim() || !htmlToPlainText(bodyHtml).trim()) {
      toast({
        title: 'Add a subject and body',
        description: 'Fill out the base email before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const title = `Base Submission Email${dealName ? ` — ${dealName}` : ''}`;
      const content =
        `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>` +
        `<hr/>` +
        bodyHtml;

      // Persist the approved base into the deal's Notes so the user has a
      // canonical reference for what was approved before lender-specific
      // drafts were produced. Non-blocking on failure — we still proceed.
      const { error: noteErr } = await supabase
        .from('deal_space_notes')
        .insert({
          deal_id: dealId,
          user_id: user?.id as string,
          title,
          content,
          tags: ['draft_submission_base_email'],
        });
      if (noteErr) {
        console.warn('[BaseSubmissionEmailDialog] note save failed:', noteErr);
        toast({
          title: 'Saved locally',
          description: 'Could not save to Notes, but continuing with this base draft.',
        });
      } else {
        toast({ title: 'Base email saved to Notes' });
      }

      onContinue({ subject, bodyHtml });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Base Submission Email
          </DialogTitle>
          <DialogDescription>
            Edit the deal's lender-agnostic submission email. On Continue this
            base draft is saved to the deal's Notes, then you'll pick which
            lenders receive a personalized version.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[260px] text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating base submission email…
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] gap-3 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
            <Button size="sm" variant="outline" onClick={() => void runGenerate()}>
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2 overflow-auto rounded-md border bg-card p-3 min-h-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">Subject:</span>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-8 text-xs flex-1"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-h-0">
              <span className="text-xs text-muted-foreground">Body:</span>
              <EmailRichTextEditor
                content={bodyHtml}
                onChange={setBodyHtml}
                className="flex-1 min-h-[260px]"
                minHeight={240}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Tip: keep the salutation generic (e.g. <code>Hi [Name],</code>) —
                lender-specific greetings are added in the next step.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="liquid-glass"
            className="gap-2"
            onClick={handleContinue}
            disabled={loading || saving || !subject.trim() || !htmlToPlainText(bodyHtml).trim()}
          >
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            ) : (
              <>Continue <ArrowRight className="h-3.5 w-3.5" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}