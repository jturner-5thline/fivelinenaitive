import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { EmailThread } from './mockEmailData';
import { useLenderPassDetection } from '@/hooks/useLenderPassDetection';
import { LenderPassSidebarCard } from './LenderPassSidebarCard';
import { DataRoomSuggestionCard } from './DataRoomSuggestionCard';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import { useFullEmailMessage } from './useFullEmailMessage';
import { useEmailToDataRoom, type DataRoomDestinationSuggestion } from '@/hooks/useEmailToDataRoom';

/**
 * AiAssistSidebar
 * ----------------
 * Right-side sidebar that lives inside the email popup border. Generates 3
 * draft reply options (Concise / Balanced / Detailed) using the
 * `smart-email-ai` edge function with full deal context (deal metadata,
 * writeup, lenders, milestones, recent activity, notes).
 *
 * The user picks an option and clicks "Insert into reply" — the chosen
 * draft body is passed up to the parent which loads it into the existing
 * inline reply composer for review and sending.
 */

interface DraftOption {
  index: 1 | 2 | 3;
  subject: string;
  body: string;
  toneLabel: string;
  rationale: string;
}

interface DraftResult {
  detected_intent?: string;
  confidence?: 'high' | 'medium' | 'low';
  used_deal_context?: boolean;
  recommended_option?: 1 | 2 | 3;
  cited_context_sources?: string[];
  options: DraftOption[];
}

interface Props {
  thread: EmailThread;
  dealId?: string;
  dealName?: string;
  onClose: () => void;
  onInsertDraft: (subject: string, body: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  deal_metadata: 'Deal info',
  deal_writeup: 'Writeup',
  deal_lenders: 'Lenders',
  milestones: 'Milestones',
  recent_activity: 'Activity',
  deal_notes: 'Notes',
  email_thread_only: 'Email only',
};

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
  low: 'text-red-400 border-red-500/30 bg-red-500/5',
};

export function AiAssistSidebar({ thread, dealId, dealName, onClose, onInsertDraft }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [selected, setSelected] = useState<1 | 2 | 3>(2);
  const [showSources, setShowSources] = useState(false);
  const [drDismissed, setDrDismissed] = useState(false);
  const [drDialogOpen, setDrDialogOpen] = useState(false);
  const [drSuggestion, setDrSuggestion] = useState<DataRoomDestinationSuggestion | null>(null);

  // Lender pass detection — shares state with the inline banner via the same row.
  const passThreadData = {
    subject: thread.subject,
    threadId: thread.threadId,
    emails: thread.emails,
    latestEmail: thread.latestEmail,
  };
  const {
    detection: passDetection,
    committing: passCommitting,
    autoCommit: passAutoCommit,
    setAutoCommitPref: setPassAutoCommit,
    confirmPass,
    dismissPass,
  } = useLenderPassDetection({ dealId, threadData: passThreadData, autoRun: !!dealId });
  const showPassCard = !!passDetection && (passDetection.status === 'pending' || passDetection.status === 'confirmed') && (passDetection.is_pass || passDetection.status === 'confirmed');

  // Data Room suggestion — load latest message attachments + auto-suggest destination
  const latestId = thread.latestEmail.id;
  const isMock = !latestId || latestId.startsWith('mock-');
  const { data: latestFull } = useFullEmailMessage(
    latestId,
    !isMock,
    !!(thread.latestEmail.body_html || thread.latestEmail.body_text),
  );
  const drAttachments = (latestFull?.attachments && latestFull.attachments.length > 0)
    ? latestFull.attachments
    : (thread.latestEmail.attachments || []);
  const drUploadable = drAttachments.filter(a => !a.is_inline && !!a.id);
  const { suggest: drSuggest, suggesting: drSuggesting } = useEmailToDataRoom();
  const showDrCard = !drDismissed && drUploadable.length > 0;

  useEffect(() => {
    if (!showDrCard || drSuggestion || drSuggesting) return;
    let cancelled = false;
    (async () => {
      const r = await drSuggest({
        dealId,
        sourceEmail: {
          messageId: latestId,
          threadId: thread.threadId,
          subject: thread.subject,
          senderName: thread.latestEmail.from_name,
          senderEmail: thread.latestEmail.from_email,
        },
        threadData: passThreadData,
        attachments: drAttachments,
      });
      if (!cancelled && r) setDrSuggestion(r);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDrCard, drUploadable.length, dealId, latestId]);


  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const threadData = {
        subject: thread.subject,
        emails: thread.emails.map((e) => ({
          from_name: e.from_name,
          from_email: e.from_email,
          to_name: e.to_name,
          to_email: e.to_email,
          subject: e.subject,
          body_preview: e.body_preview?.substring(0, 1500),
          received_at: e.received_at,
          snippet: e.snippet,
        })),
        latestEmail: thread.latestEmail,
      };

      const { data, error: fnError } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'generate_draft_options',
          dealId,
          threadData,
          draftType: 'reply',
          optionCount: 3,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const r = data?.result;
      if (!r || r.raw) throw new Error('Invalid response from AI');

      const options: DraftOption[] = [];
      ([1, 2, 3] as const).forEach((i) => {
        const subject = r[`option_${i}_subject`];
        const body = r[`option_${i}_body`];
        if (subject && body) {
          options.push({
            index: i,
            subject,
            body,
            toneLabel: r[`option_${i}_tone_label`] || ['Concise', 'Balanced', 'Detailed'][i - 1],
            rationale: r[`option_${i}_rationale`] || '',
          });
        }
      });

      if (options.length === 0) throw new Error('No drafts returned');

      const recommended = (r.recommended_option as 1 | 2 | 3) || 2;
      const safeRecommended = options.find((o) => o.index === recommended)?.index || options[0].index;

      setResult({
        detected_intent: r.detected_intent,
        confidence: r.confidence,
        used_deal_context: r.used_deal_context,
        recommended_option: safeRecommended,
        cited_context_sources: r.cited_context_sources || [],
        options,
      });
      setSelected(safeRecommended);
    } catch (err: any) {
      console.error('AI Assist sidebar error:', err);
      setError(err?.message || 'Failed to generate drafts.');
    } finally {
      setLoading(false);
    }
  }, [thread, dealId]);

  // Auto-generate on mount / when thread changes
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId]);

  const selectedOption = useMemo(
    () => result?.options.find((o) => o.index === selected) || result?.options[0],
    [result, selected]
  );

  const handleInsert = () => {
    if (!selectedOption) return;
    const subject = selectedOption.subject.startsWith('Re:')
      ? selectedOption.subject
      : `Re: ${thread.subject}`;
    onInsertDraft(subject, selectedOption.body);
  };

  return (
    <aside
      className="flex flex-col h-full w-[380px] shrink-0 border-l border-white/[0.06] bg-card/40 backdrop-blur-sm"
      aria-label="AI Assist"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground leading-tight">AI Assist</div>
          <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            {dealName || 'No linked deal found'}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Drafting reply options…</span>
              <span className="text-[10px] text-muted-foreground/60">
                {dealId ? 'Reading deal context, lenders, notes & activity' : 'Analyzing email thread'}
              </span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-center space-y-2">
              <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={generate}>
                <RefreshCw className="h-3 w-3" /> Try again
              </Button>
            </div>
          )}

          {/* Lender pass detection card */}
          {showPassCard && passDetection && (
            <LenderPassSidebarCard
              detection={passDetection}
              committing={passCommitting}
              autoCommit={passAutoCommit}
              onSetAutoCommit={setPassAutoCommit}
              onConfirm={(reason) => confirmPass(reason)}
              onDismiss={dismissPass}
            />
          )}

          {/* Data Room attachment suggestion card */}
          {showDrCard && (
            <DataRoomSuggestionCard
              attachmentCount={drUploadable.length}
              dealName={drSuggestion?.suggested_deal_name || dealName}
              suggestion={drSuggestion}
              loading={drSuggesting && !drSuggestion}
              onConfirm={() => setDrDialogOpen(true)}
              onDismiss={() => setDrDismissed(true)}
            />
          )}

          {/* Result */}
          {!loading && !error && result && (
            <>
              {/* Context snapshot */}
              <div className="rounded-md border border-white/[0.06] bg-background/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                  <span className="text-[11px] font-medium text-foreground/90 truncate">
                    {dealName || 'Email-only context'}
                  </span>
                  {result.confidence && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-auto text-[9px] h-4 px-1.5 border shrink-0',
                        CONFIDENCE_TONE[result.confidence]
                      )}
                    >
                      {result.confidence}
                    </Badge>
                  )}
                </div>
                {result.detected_intent && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {result.detected_intent}
                  </p>
                )}
                {result.cited_context_sources && result.cited_context_sources.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowSources((s) => !s)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground/80 hover:text-foreground transition-colors"
                    >
                      Using {result.cited_context_sources.length} source
                      {result.cited_context_sources.length === 1 ? '' : 's'}
                      {showSources ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    {showSources && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {result.cited_context_sources.map((src) => (
                          <Badge
                            key={src}
                            variant="outline"
                            className="text-[9px] h-4 px-1.5 font-normal"
                          >
                            {SOURCE_LABELS[src] || src}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Variant selector */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">
                  Draft options
                </p>
                <div className="flex gap-1 mb-3 p-0.5 rounded-md bg-muted/30 border border-white/[0.04]">
                  {result.options.map((opt) => {
                    const isSel = selected === opt.index;
                    return (
                      <button
                        key={opt.index}
                        onClick={() => setSelected(opt.index)}
                        className={cn(
                          'flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all',
                          isSel
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground/80'
                        )}
                      >
                        {opt.toneLabel}
                        {result.recommended_option === opt.index && (
                          <span className="ml-1 text-primary">★</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected draft preview */}
                {selectedOption && (
                  <div className="rounded-md border border-white/[0.06] bg-background/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/[0.04]">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        Subject
                      </div>
                      <div className="text-[12px] text-foreground/90 font-medium leading-snug mt-0.5">
                        {selectedOption.subject}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                        Body
                      </div>
                      <div
                        className="text-[12px] text-foreground/85 leading-relaxed"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {selectedOption.body}
                      </div>
                    </div>
                    {selectedOption.rationale && (
                      <div className="px-3 py-2 border-t border-white/[0.04] bg-muted/20">
                        <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                          {selectedOption.rationale}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      {!loading && result && selectedOption && (
        <div className="border-t border-white/[0.06] p-3 flex items-center gap-2 shrink-0 bg-card/60">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] gap-1 px-2"
            onClick={generate}
          >
            <RefreshCw className="h-3 w-3" /> Regenerate
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-8 text-[11px] gap-1.5 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
            onClick={handleInsert}
          >
            <Check className="h-3 w-3" /> Insert into reply
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Send-to-Data-Room dialog (mounted from the proactive card) */}
      {drDialogOpen && (
        <SendToDataRoomDialog
          open={drDialogOpen}
          onClose={() => setDrDialogOpen(false)}
          attachments={drAttachments}
          messageId={latestId}
          threadData={passThreadData}
          sourceEmail={{
            messageId: latestId,
            threadId: thread.threadId,
            subject: thread.subject,
            senderName: thread.latestEmail.from_name,
            senderEmail: thread.latestEmail.from_email,
          }}
          initialDealId={dealId}
          initialDealName={dealName}
          initialSuggestion={drSuggestion}
        />
      )}
    </aside>
  );
}
