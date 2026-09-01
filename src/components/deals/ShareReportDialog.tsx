import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, List as ListIcon, Check, X as XIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { stripHtml } from '@/lib/stripHtml';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { cn } from '@/lib/utils';
import { useDealsContext } from '@/contexts/DealsContext';
import type { Deal, DealStatus } from '@/types/deal';
import { RecipientField } from '@/components/deal/email/RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

// Default "To" recipients for 5th Line pipeline reports. Prefilled but
// fully editable — users can remove them or add more as needed.
const FIFTH_LINE_DEFAULT_TO = [
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'swilliams@5thline.co',
  'mclark@5thline.co',
];

/** Stage label (case-insensitive) at and after which deals are eligible for the report. */
const MIN_INCLUDED_STAGE_LABEL = 'proposal issued';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
  activePipelineId: string | null;
  pipelineName?: string | null;
}

const STATUS_ORDER: { key: DealStatus; label: string; color: string }[] = [
  { key: 'on-track', label: 'On Track', color: '#16a34a' },
  { key: 'at-risk', label: 'At Risk', color: '#d97706' },
  { key: 'off-track', label: 'Off Track', color: '#dc2626' },
  { key: 'on-hold', label: 'On Hold', color: '#2563eb' },
];

function formatAmount(value: number): string {
  if (!value || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}MM`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function startsWithTestPrefix(name: string): boolean {
  return /^\s*test\s*-/i.test(name || '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function originalStatusText(deal: Deal, fallback: string): string {
  const raw = stripHtml(deal.notes || '').trim();
  return raw || fallback;
}

function defaultSubject(pipelineName?: string | null): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const scope = pipelineName ? `${pipelineName} ` : 'Active ';
  return `${scope}Pipeline Status Report – ${date}`;
}

function defaultIntroHtml(pipelineName?: string | null): string {
  return `<p>Team,</p><p>Here's the latest status for the ${escapeHtml(pipelineName || 'active')} pipeline:</p>`;
}

const DEFAULT_OUTRO_HTML = `<p>Reply with any questions.</p><p>Thanks</p>`;

/** Build final email HTML from intro + structured groups + outro. */
function assembleEmailHtml(opts: {
  introHtml: string;
  outroHtml: string;
  grouped: { status: typeof STATUS_ORDER[number]; deals: Deal[] }[];
  statusTexts: Record<string, string>;
  stageTitles: Record<string, string>;
}): string {
  const parts: string[] = [];
  parts.push(opts.introHtml || '');
  let total = 0;
  for (const g of opts.grouped) {
    if (g.deals.length === 0) continue;
    parts.push(
      `<p><strong><span style="color: ${g.status.color}">${escapeHtml(g.status.label)}</span></strong> (${g.deals.length})</p>`
    );
    const items = g.deals
      .map((d) => {
        const txt = (opts.statusTexts[d.id] ?? originalStatusText(d, g.status.label)).trim() || g.status.label;
        const stage = (opts.stageTitles[d.id] || '').trim() || 'No Stage';
        total += 1;
        return `<li><strong>${escapeHtml(d.name)}</strong> — <strong>${escapeHtml(formatAmount(d.value || 0))}</strong> — <strong>${escapeHtml(stage)}</strong> — ${escapeHtml(txt)}</li>`;
      })
      .join('');
    parts.push(`<ul>${items}</ul>`);
  }
  if (total === 0) parts.push(`<p>No active deals to report at this time.</p>`);
  parts.push(opts.outroHtml || '');
  return parts.join('');
}

function MiniToolbar({ editor }: { editor: Editor | null }) {
  const TbBtn = ({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  );
  return (
    <div className="flex items-center gap-1 p-1 border-b border-border/60 shrink-0 flex-wrap">
      <TbBtn label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
        <BoldIcon className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <ItalicIcon className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn label="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
        <ListIcon className="h-3.5 w-3.5" />
      </TbBtn>
    </div>
  );
}

export function ShareReportDialog({ open, onOpenChange, deals, activePipelineId, pipelineName }: ShareReportDialogProps) {
  const { updateDeal } = useDealsContext();
  const { search: searchContacts } = useEmailContacts();
  const { pipelines } = usePipelineContext();

  /**
   * Set of stage IDs eligible for inclusion: the "Proposal Issued" stage and every
   * later stage in the active pipeline's defined order. Uses the pipeline's stage
   * ordering (sortOrder or array index) rather than ad-hoc string matching across deals.
   * If the threshold stage isn't found, returns null and the stage filter is skipped
   * (defensive fallback so the report still renders).
   */
  const includedStageIds = useMemo<Set<string> | null>(() => {
    const pipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
    const stages = pipeline?.stages ?? [];
    if (stages.length === 0) return null;
    const ordered = stages
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const thresholdIdx = ordered.findIndex(
      (s) => (s.label || '').trim().toLowerCase() === MIN_INCLUDED_STAGE_LABEL,
    );
    if (thresholdIdx === -1) return null;
    return new Set(ordered.slice(thresholdIdx).map((s) => s.id));
  }, [pipelines, activePipelineId]);

  /**
   * Map of stage ID → human-readable stage label for the active pipeline.
   * Used to render the bolded stage title inline on each deal row.
   * Sourced from the pipeline definition (not the report status bucket)
   * so the displayed label reflects the deal's actual pipeline stage.
   */
  const stageLabelById = useMemo<Record<string, string>>(() => {
    const pipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
    const out: Record<string, string> = {};
    for (const s of pipeline?.stages ?? []) {
      if (s?.id) out[s.id] = (s.label || '').trim();
    }
    return out;
  }, [pipelines, activePipelineId]);

  const stageTitleForDeal = (d: Deal): string => {
    const raw = (d.stage && stageLabelById[d.stage]) || '';
    return raw.trim() || 'No Stage';
  };

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (!d?.name) return false;
      if (isExcludedDealName(d.name)) return false;
      if (startsWithTestPrefix(d.name)) return false;
      if (activePipelineId && d.pipelineId && d.pipelineId !== activePipelineId) return false;
      if (!STATUS_ORDER.some((s) => s.key === d.status)) return false;
      // Stage gate: only include deals at "Proposal Issued" or later in the active
      // pipeline's stage ordering. Null/unmapped stages are excluded by default.
      if (includedStageIds) {
        if (!d.stage || !includedStageIds.has(d.stage)) return false;
      }
      return true;
    });
  }, [deals, activePipelineId, includedStageIds]);

  const grouped = useMemo(() => {
    return STATUS_ORDER.map((s) => ({
      status: s,
      deals: filteredDeals
        .filter((d) => d.status === s.key)
        .slice()
        .sort((a, b) => (b.value || 0) - (a.value || 0)),
    }));
  }, [filteredDeals]);

  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  // Per-deal editable status text + originals for change detection
  const [statusTexts, setStatusTexts] = useState<Record<string, string>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});

  // Per-deal sync confirmation state: 'idle' | 'prompt' | 'syncing' | 'synced' | 'kept'
  const [syncState, setSyncState] = useState<Record<string, 'idle' | 'prompt' | 'syncing' | 'synced' | 'kept'>>({});

  const introEditor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none p-3 focus:outline-none min-h-[80px]' } },
  });
  const outroEditor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none p-3 focus:outline-none min-h-[60px]' } },
  });

  // Radix occasionally leaves the body scroll-locked when a dialog with
  // heavy content (editors) unmounts. Restore scrolling defensively on close.
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      const b = document.body;
      if (!document.querySelector('[data-state="open"][role="dialog"]')) {
        b.style.removeProperty('pointer-events');
        b.style.removeProperty('overflow');
        b.removeAttribute('data-scroll-locked');
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setSubject(defaultSubject(pipelineName));
    introEditor?.commands.setContent(defaultIntroHtml(pipelineName), { emitUpdate: false });
    outroEditor?.commands.setContent(DEFAULT_OUTRO_HTML, { emitUpdate: false });

    // Prefill 5th Line default recipients on open, but only if the user
    // hasn't already typed their own list (avoid clobbering edits when
    // filters/deals recompute and re-run this effect).
    setTo((prev) => (prev.length === 0 && isFifthLine ? [...FIFTH_LINE_DEFAULT_TO] : prev));

    const seed: Record<string, string> = {};
    const orig: Record<string, string> = {};
    for (const g of STATUS_ORDER) {
      filteredDeals
        .filter((d) => d.status === g.key)
        .forEach((d) => {
          const v = originalStatusText(d, g.label);
          seed[d.id] = v;
          orig[d.id] = v;
        });
    }
    setStatusTexts(seed);
    setOriginals(orig);
    setSyncState({});
  }, [open, filteredDeals, pipelineName, introEditor, outroEditor, isFifthLine]);

  const handleStatusTextChange = (dealId: string, next: string) => {
    setStatusTexts((prev) => ({ ...prev, [dealId]: next }));
    setSyncState((prev) => {
      const orig = (originals[dealId] || '').trim();
      const cur = next.trim();
      if (cur !== orig) {
        const existing = prev[dealId];
        // Only auto-open prompt if not already decided
        if (existing !== 'kept' && existing !== 'synced') {
          return { ...prev, [dealId]: 'prompt' };
        }
      }
      return prev;
    });
  };

  const syncToDeal = async (dealId: string) => {
    setSyncState((prev) => ({ ...prev, [dealId]: 'syncing' }));
    try {
      const newText = (statusTexts[dealId] || '').trim();
      // Persist as plain text wrapped in <p> to remain compatible with the rich-text status field.
      const payload = newText ? `<p>${escapeHtml(newText)}</p>` : null;
      await updateDeal(dealId, { notes: payload });
      setOriginals((prev) => ({ ...prev, [dealId]: newText }));
      setSyncState((prev) => ({ ...prev, [dealId]: 'synced' }));
      toast({ title: 'Deal status updated' });
    } catch (e) {
      setSyncState((prev) => ({ ...prev, [dealId]: 'prompt' }));
      toast({ title: 'Could not update deal', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const keepEmailOnly = (dealId: string) => {
    setSyncState((prev) => ({ ...prev, [dealId]: 'kept' }));
  };

  const handleSend = async () => {
    const toList = to;
    const ccList = cc;
    if (toList.length === 0) {
      toast({ title: 'Add at least one recipient', variant: 'destructive' });
      return;
    }
    if (!subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const introHtml = introEditor?.getHTML() || '';
      const outroHtml = outroEditor?.getHTML() || '';
      const stageTitles: Record<string, string> = {};
      for (const g of grouped) for (const d of g.deals) stageTitles[d.id] = stageTitleForDeal(d);
      const html = assembleEmailHtml({ introHtml, outroHtml, grouped, statusTexts, stageTitles });
      const text = stripHtml(html);
      const { data, error } = await supabase.functions.invoke('share-pipeline-report', {
        body: { to: toList, cc: ccList, subject: subject.trim(), body: text, bodyHtml: html, pipelineName: pipelineName ?? null },
      });
      if (error || (data as any)?.error) {
        throw new Error((error as any)?.message || (data as any)?.error || 'Failed to send');
      }
      toast({ title: 'Report sent', description: `Sent to ${toList.length} recipient${toList.length === 1 ? '' : 's'}.` });
      onOpenChange(false);
      setTo([]);
      setCc([]);
    } catch (e) {
      toast({ title: 'Could not send report', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent
        className="p-0 gap-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20 w-[min(1100px,calc(100vw-32px))] sm:max-w-[min(1100px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-hidden"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle>Share Pipeline Report</DialogTitle>
          <DialogDescription>
            Review and edit the active pipeline status summary before sending. Test deals and archived deals are excluded.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <RecipientField
              label="To"
              recipients={to}
              onChange={setTo}
              search={searchContacts}
              placeholder="Add recipient…"
            />
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <RecipientField
              label="Cc"
              recipients={cc}
              onChange={setCc}
              search={searchContacts}
              placeholder="Add cc recipient…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="share-subject">Subject</Label>
            <Input id="share-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Intro</Label>
            <div className="rounded-md border border-border bg-background flex flex-col overflow-hidden">
              <MiniToolbar editor={introEditor} />
              <EditorContent editor={introEditor} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Deals</Label>
            <div className="rounded-md border border-border bg-background divide-y divide-border/40">
              {grouped.every((g) => g.deals.length === 0) && (
                <div className="p-4 text-sm text-muted-foreground">No active deals to report at this time.</div>
              )}
              {grouped.map((g) =>
                g.deals.length === 0 ? null : (
                  <div key={g.status.key} className="p-3">
                    <div className="text-sm font-semibold mb-2" style={{ color: g.status.color }}>
                      {g.status.label} <span className="text-muted-foreground font-normal">({g.deals.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.deals.map((d) => {
                        const state = syncState[d.id] || 'idle';
                        const value = statusTexts[d.id] ?? '';
                        return (
                          <div key={d.id} className="flex items-start gap-2 text-sm">
                            <span className="text-foreground shrink-0">•</span>
                            <span className="text-foreground font-bold shrink-0">{d.name}</span>
                            <span className="text-muted-foreground shrink-0">—</span>
                            <span className="text-foreground font-bold tabular-nums shrink-0">{formatAmount(d.value || 0)}</span>
                            <span className="text-muted-foreground shrink-0">—</span>
                            <span className="text-foreground font-bold shrink-0">{stageTitleForDeal(d)}</span>
                            <span className="text-muted-foreground shrink-0">—</span>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <Input
                                value={value}
                                onChange={(e) => handleStatusTextChange(d.id, e.target.value)}
                                placeholder={g.status.label}
                                className="h-7 text-sm"
                              />
                              {state === 'prompt' && (
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 border border-border/60 rounded px-2 py-1">
                                  <span>Also update this deal's status text on the deal record?</span>
                                  <Button type="button" size="sm" variant="default" className="h-6 px-2 text-[11px] gap-1" onClick={() => syncToDeal(d.id)}>
                                    <Check className="h-3 w-3" /> Yes, update deal
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1" onClick={() => keepEmailOnly(d.id)}>
                                    <XIcon className="h-3 w-3" /> No, keep email only
                                  </Button>
                                </div>
                              )}
                              {state === 'syncing' && (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Updating deal…
                                </div>
                              )}
                              {state === 'synced' && (
                                <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                  <Check className="h-3 w-3" /> Deal status updated
                                </div>
                              )}
                              {state === 'kept' && (
                                <div className="text-[11px] text-muted-foreground">Change kept in email only.</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {filteredDeals.length} deal{filteredDeals.length === 1 ? '' : 's'} included. Edit a deal's status text and confirm whether to sync it back to the deal record.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Closing</Label>
            <div className="rounded-md border border-border bg-background flex flex-col overflow-hidden">
              <MiniToolbar editor={outroEditor} />
              <EditorContent editor={outroEditor} />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" variant="liquid-glass" size="sm" className="gap-2" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}