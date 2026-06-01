import type { Deal } from '@/types/deal';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import { formatSlug } from '@/utils/dealTypeLabels';
import { Mail } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';

interface RawEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  from_name: string | null;
  from_email: string | null;
  received_at?: string | null;
}

interface ActivityPanelProps {
  deal: Deal;
  rawDigest: PipelineDigestRaw | undefined;
  isLoading: boolean;
  emails?: RawEmail[];
}

type Tone = 'reviewing' | 'onhold' | 'passed' | 'neutral';

const TONE_BAR: Record<Tone, string> = {
  reviewing: 'bg-emerald-500',
  onhold: 'bg-amber-500',
  passed: 'bg-muted-foreground/60',
  neutral: 'bg-primary/60',
};

function toneFromStage(stage?: string): Tone {
  const s = (stage || '').toLowerCase();
  if (/pass|declin|reject/.test(s)) return 'passed';
  if (/hold/.test(s)) return 'onhold';
  if (/review|diligence|terms|ioi|interest/.test(s)) return 'reviewing';
  return 'neutral';
}

/**
 * "Activity · Last 24h" column — renders compact stage-transition lines
 * (e.g. "PFG → in review (from on-deck)") sourced from the per-deal
 * activity_logs already loaded by usePipelineDigests().
 */
function senderOrg(e: RawEmail): string | null {
  const dom = (e.from_email || '').split('@')[1];
  if (!dom) return null;
  const root = dom.split('.').slice(-2, -1)[0];
  if (!root) return null;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function relTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    return formatDistanceToNowStrict(d, { addSuffix: false })
      .replace(' seconds', 's').replace(' second', 's')
      .replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h')
      .replace(' days', 'd').replace(' day', 'd');
  } catch {
    return null;
  }
}

export function ActivityPanel({ deal, rawDigest, isLoading, emails = [] }: ActivityPanelProps) {
  if (isLoading) {
    return (
      <div className="px-5 pt-2 pb-4 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const activities = rawDigest?.activities || [];
  const stageEvents = activities.filter((a) =>
    ['lender_stage_change', 'stage_change'].includes(a.activity_type),
  );
  const recentEmails = emails.slice(0, 4);
  const hasAny = stageEvents.length > 0 || recentEmails.length > 0;

  return (
    <div className="px-5 pt-2 pb-4 min-w-0 self-start">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90 mb-2">
        Activity · Last 24h
      </div>

      {!hasAny ? (
        <p className="text-xs text-muted-foreground">No recent activity or emails.</p>
      ) : (
        <div className="space-y-1.5 max-h-[14rem] overflow-y-auto pr-1">
          {stageEvents.slice(0, 6).map((a) => {
            const meta = (a.metadata as any) || {};
            const lender: string | undefined = meta.lender_name;
            const from: string | undefined = meta.from;
            const to: string | undefined = meta.to;
            const tone = toneFromStage(to);
            const ts = relTime((a as any).created_at);
            return (
              <div key={a.id} className="flex gap-2 items-start">
                <span className={`mt-1 h-3 w-0.5 rounded-sm ${TONE_BAR[tone]} shrink-0`} />
                <div className="min-w-0 flex-1 text-xs leading-snug text-foreground">
                  {lender && <span className="font-semibold">{lender} </span>}
                  <span className="text-muted-foreground">→ </span>
                  <span>{formatSlug(to) || 'updated'}</span>
                  {from && (
                    <span className="text-muted-foreground"> (from {formatSlug(from)})</span>
                  )}
                  {ts && (
                    <span className="text-muted-foreground/70"> · {ts}</span>
                  )}
                </div>
              </div>
            );
          })}
          {recentEmails.map((e) => {
            const sender = e.from_name || e.from_email || 'Unknown';
            const org = senderOrg(e);
            const subject = (e.subject || '').trim();
            const snippet = (e.snippet || '').trim();
            const ts = relTime(e.received_at);
            return (
              <div key={`email-${e.id}`} className="flex gap-2 items-start">
                <Mail className="mt-0.5 h-3 w-3 text-primary/70 shrink-0" />
                <div className="min-w-0 text-xs leading-snug">
                  <div className="truncate text-foreground">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">Email</span>
                    <span className="font-semibold">{sender}</span>
                    {org && <span className="text-muted-foreground"> · {org}</span>}
                    {ts && <span className="text-muted-foreground/70"> · {ts}</span>}
                  </div>
                  {(subject || snippet) && (
                    <div className="text-muted-foreground line-clamp-1">
                      {subject && <span className="text-foreground/80">{subject}</span>}
                      {subject && snippet && <span className="text-muted-foreground"> — </span>}
                      {snippet && <span>{snippet}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}