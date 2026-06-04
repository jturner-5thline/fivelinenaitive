import { useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { LucideIcon } from 'lucide-react';
import {
  Inbox, FileText, BarChart3, Target, Compass, ShieldAlert,
  AlignLeft, Highlighter, ArrowRight, Footprints,
  ExternalLink, Archive, Trash2,
} from 'lucide-react';
import {
  useReportAgendaQueue,
  type ReportQueueItem,
  type ReportQueueSourceType,
} from '@/hooks/useReportAgendaQueue';
import { useInsertAgendaFootnote } from '@/components/insights/footnotes/useInsertAgendaFootnote';
import { MentionText } from './MentionText';
import { toast } from 'sonner';

const SOURCE_ICON: Record<ReportQueueSourceType, LucideIcon> = {
  selected_text: Highlighter,
  narrative: AlignLeft,
  kpi: BarChart3,
  chart: BarChart3,
  goal: Target,
  initiative: Compass,
  risk: ShieldAlert,
  section: FileText,
};

const SOURCE_LABEL: Record<ReportQueueSourceType, string> = {
  selected_text: 'Selected text',
  narrative: 'Narrative',
  kpi: 'KPI',
  chart: 'Chart',
  goal: 'Goal',
  initiative: 'Initiative',
  risk: 'Risk',
  section: 'Section',
};

function jumpToSource(item: ReportQueueItem) {
  let el: HTMLElement | null = null;
  if (item.source_type === 'section' && item.source_id) {
    el = document.getElementById(`qir-section-${item.source_id}`);
  } else if (item.source_id) {
    el = document.querySelector<HTMLElement>(
      `[data-comment-source="${item.source_type}"][data-comment-source-id="${CSS.escape(item.source_id)}"]`,
    );
  }
  if (!el) {
    toast.info('Original element not visible', {
      description: item.source_snapshot_text?.slice(0, 200) || undefined,
    });
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prev = el.style.boxShadow;
  el.style.transition = 'box-shadow .35s';
  el.style.boxShadow = '0 0 0 2px rgba(124,200,240,0.7), 0 0 24px rgba(124,200,240,0.45)';
  setTimeout(() => { el!.style.boxShadow = prev; }, 1600);
}

type FilterKey = 'queued' | 'added' | 'dismissed' | 'all';

export function AgendaQueuePanel({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { items, updateItem, removeItem, counts } = useReportAgendaQueue();
  const insertFootnote = useInsertAgendaFootnote();
  const [filter, setFilter] = useState<FilterKey>('queued');
  const [freeTextFor, setFreeTextFor] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'queued') return items.filter(i => i.queue_status === 'queued');
    if (filter === 'added') return items.filter(i => i.queue_status === 'added_to_agenda');
    return items.filter(i => i.queue_status === 'dismissed' || i.queue_status === 'archived');
  }, [items, filter]);

  async function addToAgenda(
    item: ReportQueueItem,
    mode: 'body_reference' | 'free_text' | 'footnote_only',
    extra?: { freeText?: string },
  ) {
    const snapshot =
      mode === 'free_text' && extra?.freeText
        ? extra.freeText
        : (item.source_snapshot_text || item.comment_text_snapshot).slice(0, 4000);
    const insertMode =
      mode === 'body_reference' ? 'marker'
      : mode === 'free_text' ? 'freetext'
      : 'footnote_only';
    const ok = await insertFootnote(
      {
        footnoteType: 'note',
        sourceType: `report_comment_${item.source_type}`,
        sourceId: item.source_id || `queue:${item.id}`,
        sourceAnchor: item.source_anchor,
        snapshotText: snapshot,
      },
      insertMode as any,
    );
    if (!ok) return;
    await updateItem(item.id, {
      queue_status: 'added_to_agenda',
      agenda_insertion_mode: mode,
    });
    setFreeTextFor(null);
    setFreeText('');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <SheetTitle className="text-sm font-semibold tracking-tight">
              Queue
            </SheetTitle>
            <Badge variant="secondary" className="ml-1">{counts.queued}</Badge>
          </div>
          <SheetDescription className="text-xs mt-1">
            Comments staged for inclusion in the Agenda. Review and add to the Agenda using your preferred insertion mode.
          </SheetDescription>
          <div className="flex gap-1 mt-2">
            {([
              ['queued', `Queued · ${counts.queued}`],
              ['added', `Added · ${counts.added}`],
              ['dismissed', `Dismissed · ${counts.dismissed + counts.archived}`],
              ['all', 'All'],
            ] as Array<[FilterKey, string]>).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={
                  'text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border transition-colors ' +
                  (filter === k
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/40')
                }
              >{label}</button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-10">
              <Inbox className="h-5 w-5 mx-auto mb-2 opacity-40" />
              Nothing here yet.
              <div className="text-[11px] mt-1 opacity-70">
                Comment on any report element and click "Queue" to stage it for the Agenda.
              </div>
            </div>
          )}

          {filtered.map(item => {
            const Icon = SOURCE_ICON[item.source_type] || FileText;
            const isResolved = item.queue_status !== 'queued';
            return (
              <div
                key={item.id}
                className="rounded-md border border-border/50 bg-card/60 p-3 flex flex-col gap-2"
                style={{ opacity: isResolved ? 0.65 : 1 }}
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Icon size={11} />
                  <span className="text-foreground/80 font-semibold">
                    {SOURCE_LABEL[item.source_type]}
                  </span>
                  {item.source_label && (
                    <>
                      <span>·</span>
                      <span className="truncate normal-case tracking-normal font-normal text-foreground/70">
                        {item.source_label}
                      </span>
                    </>
                  )}
                  {item.report_tab && (
                    <Badge variant="outline" className="ml-auto h-4 text-[9px]">
                      {item.report_tab}
                    </Badge>
                  )}
                </div>

                {item.source_snapshot_text && (
                  <div className="text-[11px] italic text-muted-foreground/90 border-l-2 border-primary/30 pl-2 leading-snug line-clamp-2">
                    {item.source_snapshot_text}
                  </div>
                )}

                <div className="text-[13px] text-foreground whitespace-pre-wrap leading-snug">
                  <MentionText text={item.comment_text_snapshot} />
                </div>

                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span>{item.created_by_name || 'Someone'}</span>
                  <span>·</span>
                  <span>{relativeTime(item.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => jumpToSource(item)}
                    className="ml-auto inline-flex items-center gap-1 text-primary/80 hover:text-primary"
                  >
                    <ExternalLink size={10} /> Jump to source
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirmDeleteId !== item.id) { setConfirmDeleteId(item.id); return; }
                      await removeItem(item.id);
                      setConfirmDeleteId(null);
                      toast.success('Removed from queue');
                    }}
                    onBlur={() => { if (confirmDeleteId === item.id) setConfirmDeleteId(null); }}
                    title={confirmDeleteId === item.id ? 'Click again to confirm' : 'Delete'}
                    className={
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border transition-colors ' +
                      (confirmDeleteId === item.id
                        ? 'border-destructive/60 bg-destructive/10 text-destructive'
                        : 'border-transparent text-muted-foreground hover:text-destructive hover:border-destructive/40')
                    }
                  >
                    <Trash2 size={10} />{confirmDeleteId === item.id ? 'Confirm' : ''}
                  </button>
                </div>

                {isResolved ? (
                  <div className="text-[10px] text-muted-foreground italic">
                    {item.queue_status === 'added_to_agenda'
                      ? `Added to Agenda · ${insertionLabel(item.agenda_insertion_mode)}`
                      : 'Dismissed'}
                  </div>
                ) : freeTextFor === item.id ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <Textarea
                      value={freeText}
                      autoFocus
                      placeholder="Free text to insert in Agenda…"
                      onChange={(e) => setFreeText(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { setFreeTextFor(null); setFreeText(''); }}
                      >Cancel</Button>
                      <Button
                        size="sm"
                        disabled={!freeText.trim()}
                        onClick={() => addToAgenda(item, 'free_text', { freeText })}
                      >Insert</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                    <ActionBtn
                      icon={ArrowRight}
                      label="Add to Agenda"
                      onClick={() => addToAgenda(item, 'body_reference')}
                    />
                    <ActionBtn
                      icon={AlignLeft}
                      label="Free text"
                      onClick={() => { setFreeTextFor(item.id); setFreeText(item.comment_text_snapshot.slice(0, 280)); }}
                    />
                    <ActionBtn
                      icon={Footprints}
                      label="Footnote only"
                      onClick={() => addToAgenda(item, 'footnote_only')}
                    />
                    <ActionBtn
                      icon={Archive}
                      label="Dismiss"
                      onClick={() => updateItem(item.id, { queue_status: 'dismissed' })}
                      muted
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, muted,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ' +
        (muted
          ? 'border-border/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground ml-auto'
          : 'border-primary/30 text-primary hover:bg-primary/10')
      }
    >
      <Icon size={10} /> {label}
    </button>
  );
}

function insertionLabel(mode: string | null): string {
  if (mode === 'body_reference') return 'body reference';
  if (mode === 'free_text') return 'free text';
  if (mode === 'footnote_only') return 'footnote only';
  return 'agenda';
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}