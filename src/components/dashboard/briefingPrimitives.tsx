import { AlertCircle, ArrowUpRight, ChevronRight, ChevronDown, Clock, GitBranch } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';

/**
 * Shared visual primitives for the Daily Briefing modal AND any other surface
 * that wants to render a briefing-style section (e.g., Weekly Rundown carousel
 * Page 3 "Pipeline & Clients").
 *
 * Keep these in lockstep with the styling used inside DailyBriefingModal so
 * both render identically.
 */

export const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl glass-border-soft rounded-lg';
export const GLASS_ROW = 'bg-white/[0.02] border glass-border-softer rounded-lg backdrop-blur-sm';

export function EmptySection({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground/70 text-sm py-6 justify-center">
      <AlertCircle className="h-4 w-4 opacity-40" />
      <span>{message}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-base font-bold uppercase tracking-widest text-foreground mb-2 px-0.5">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function BriefingRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeVariant,
  time,
  onClick,
  extras,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  time?: string;
  onClick?: () => void;
  extras?: React.ReactNode;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        GLASS_ROW,
        'flex items-start gap-3 p-3',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_2px_12px_hsl(var(--primary)/0.08)]',
      )}
    >
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>}
        {extras && <div className="flex items-center gap-1 mt-1 flex-wrap">{extras}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge variant={badgeVariant || 'secondary'} className="text-[10px] glass-border-soft">
            {badge}
          </Badge>
        )}
        {time && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </div>
    </div>
  );
}

/**
 * Clickable deal chip — resolves a deal by id (preferred) or by company/name
 * fallback against the user's DealsContext, then navigates to its deal page.
 * Renders nothing if no match can be resolved.
 */
export function DealChip({
  dealId,
  dealName,
  onNavigate,
}: {
  dealId?: string | null;
  dealName?: string | null;
  onNavigate: (path: string) => void;
}) {
  const { deals } = useDealsContext();
  const deal = useMemo<Deal | null>(() => {
    if (!deals?.length) return null;
    if (dealId) {
      const byId = deals.find(d => d.id === dealId);
      if (byId) return byId;
    }
    if (dealName) {
      const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(dealName);
      const exact = deals.find(d => norm(d.company) === target || norm(d.name) === target);
      if (exact) return exact;
      const partial = deals.find(d => {
        const c = norm(d.company);
        const n = norm(d.name);
        return (c && (c.includes(target) || target.includes(c)))
          || (n && (n.includes(target) || target.includes(n)));
      });
      if (partial) return partial;
    }
    return null;
  }, [deals, dealId, dealName]);

  if (!deal) return null;
  const label = deal.company || deal.name;
  return (
    <Badge
      variant="outline"
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onNavigate(`/deal/${deal.id}`); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onNavigate(`/deal/${deal.id}`);
        }
      }}
      title={`Open deal: ${label}`}
      className="text-[9px] h-[16px] px-1 gap-0.5 shrink-0 font-medium cursor-pointer bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-colors inline-flex items-center"
    >
      <GitBranch className="h-2.5 w-2.5" />
      <span className="truncate max-w-[140px]">{label}</span>
      <ArrowUpRight className="h-2.5 w-2.5" />
    </Badge>
  );
}

/**
 * "Recent Pipeline Activity" section, extracted from DailyBriefingModal so
 * both that modal and the Weekly Rundown carousel render identical markup.
 *
 * `recentActivity` should be the same shape returned by usePipelineData()
 * (an array of activity rows with id, description, user_display_name,
 * activity_type, created_at, plus deal fields used by the row click handler).
 */
export function RecentPipelineActivitySection({
  recentActivity,
  onRowClick,
  onNavigate,
  emptyMessage = 'No pipeline activity since 5 PM ET yesterday',
}: {
  recentActivity: any[];
  onRowClick?: (activity: any) => void;
  /** Required to render the clickable per-row deal chip. */
  onNavigate?: (path: string) => void;
  emptyMessage?: string;
}) {
  const groups = useMemo(() => groupRelatedActivity(recentActivity), [recentActivity]);
  const noteLenders = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (g.kind === 'lender_notes') {
        for (const it of g.items) {
          const n = (it.metadata as any)?.lender_name;
          if (n) set.add(n);
        }
      }
    }
    return Array.from(set);
  }, [groups]);
  const noteByLender = useLatestLenderNotes(noteLenders);

  return (
    <Section title="Recent Pipeline Activity">
      {groups.length === 0 ? (
        <EmptySection message={emptyMessage} />
      ) : (
        groups.map(g => (
          <GroupedActivityRow
            key={g.key}
            group={g}
            onRowClick={onRowClick}
            onNavigate={onNavigate}
            noteByLender={noteByLender}
          />
        ))
      )}
    </Section>
  );
}

// ── Activity grouping ──────────────────────────────────────────
// We group repeated same-type events for the same deal into one tile.
// Categories that group:
//   requested_item_added / requested_item_updated   → "requested_items"
//   lender_added / lender_removed / lender_stage_change /
//     lender_substage_change / lender_update         → "lender_updates"
//   lender_notes_updated                             → "lender_notes"
// All other activity types render one tile per event (unchanged).
export type ActivityGroupKind = 'requested_items' | 'lender_updates' | 'lender_notes' | 'single';

export interface ActivityGroup {
  key: string;
  kind: ActivityGroupKind;
  dealId: string | null;
  dealName: string | null;
  latestAt: string | null;
  items: any[]; // original activity rows
}

const GROUPABLE: Record<string, ActivityGroupKind> = {
  requested_item_added: 'requested_items',
  requested_item_updated: 'requested_items',
  lender_added: 'lender_updates',
  lender_removed: 'lender_updates',
  lender_stage_change: 'lender_updates',
  lender_substage_change: 'lender_updates',
  lender_update: 'lender_updates',
  lender_notes_updated: 'lender_notes',
};

function groupRelatedActivity(rows: any[]): ActivityGroup[] {
  const out: ActivityGroup[] = [];
  const groupIndex = new Map<string, ActivityGroup>();
  // Preserve incoming order (rows are already created_at desc).
  for (const r of rows) {
    const kind = GROUPABLE[r.activity_type] ?? 'single';
    const dealId = r.deal_id ?? null;
    if (kind === 'single' || !dealId) {
      out.push({
        key: `single-${r.id}`,
        kind: 'single',
        dealId,
        dealName: r.deal_name || r.metadata?.deal_name || r.metadata?.company || null,
        latestAt: r.created_at,
        items: [r],
      });
      continue;
    }
    const k = `${kind}:${dealId}`;
    let g = groupIndex.get(k);
    if (!g) {
      g = {
        key: k,
        kind,
        dealId,
        dealName: r.deal_name || r.metadata?.deal_name || r.metadata?.company || null,
        latestAt: r.created_at,
        items: [],
      };
      groupIndex.set(k, g);
      out.push(g);
    }
    g.items.push(r);
    // Keep most recent timestamp (rows are desc, so first wins).
    if (!g.latestAt || (r.created_at && r.created_at > g.latestAt)) g.latestAt = r.created_at;
    if (!g.dealName) g.dealName = r.deal_name || r.metadata?.deal_name || r.metadata?.company || null;
  }
  return out;
}

// Resolve the latest lender_notes body per lender_name so grouped lender-note
// tiles can show what the note actually said, not just "lender updated".
function useLatestLenderNotes(lenderNames: string[]): Map<string, { body: string; updated_at: string }> {
  const [map, setMap] = useState<Map<string, { body: string; updated_at: string }>>(new Map());
  const key = lenderNames.slice().sort().join('|');
  useEffect(() => {
    let cancelled = false;
    if (!lenderNames.length) { setMap(new Map()); return; }
    (async () => {
      const { data } = await supabase
        .from('lender_notes')
        .select('lender_name, body, updated_at')
        .in('lender_name', lenderNames)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      const next = new Map<string, { body: string; updated_at: string }>();
      for (const row of data ?? []) {
        if (!next.has(row.lender_name)) {
          next.set(row.lender_name, { body: row.body ?? '', updated_at: row.updated_at });
        }
      }
      setMap(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function GroupedActivityRow({
  group,
  onRowClick,
  onNavigate,
  noteByLender,
}: {
  group: ActivityGroup;
  onRowClick?: (activity: any) => void;
  onNavigate?: (path: string) => void;
  noteByLender: Map<string, { body: string; updated_at: string }>;
}) {
  const { deals } = useDealsContext();
  const [expanded, setExpanded] = useState(false);

  const resolvedDealName = useMemo(() => {
    if (group.dealName) return group.dealName;
    if (!group.dealId) return null;
    return deals?.find(d => d.id === group.dealId)?.company ?? null;
  }, [deals, group.dealId, group.dealName]);

  // Single (ungrouped) row → render legacy BriefingRow as before.
  if (group.kind === 'single') {
    const a = group.items[0];
    return (
      <BriefingRow
        icon={Clock}
        title={a.description}
        subtitle={a.user_display_name || undefined}
        badge={a.activity_type ? a.activity_type.replace(/_/g, ' ') : undefined}
        badgeVariant="outline"
        time={a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : undefined}
        onClick={onRowClick ? () => onRowClick(a) : undefined}
        extras={
          onNavigate ? (
            <DealChip
              dealId={a.deal_id}
              dealName={a.deal_name || a.metadata?.deal_name || a.metadata?.company}
              onNavigate={onNavigate}
            />
          ) : undefined
        }
      />
    );
  }

  const count = group.items.length;
  const dealLabel = resolvedDealName || 'this deal';

  // Build a one-line summary title per kind.
  let title = '';
  let badge = '';
  if (group.kind === 'requested_items') {
    title = `${count} requested ${plural(count, 'item', 'items')} updated for ${dealLabel}`;
    badge = 'requested items';
  } else if (group.kind === 'lender_updates') {
    const lenderCount = new Set(
      group.items.map(i => (i.metadata as any)?.lender_name).filter(Boolean),
    ).size || count;
    title = `${lenderCount} ${plural(lenderCount, 'lender', 'lenders')} updated for ${dealLabel}`;
    badge = 'lender updates';
  } else {
    const lenderCount = new Set(
      group.items.map(i => (i.metadata as any)?.lender_name).filter(Boolean),
    ).size || count;
    title = `${lenderCount} lender ${plural(lenderCount, 'note', 'notes')} updated for ${dealLabel}`;
    badge = 'lender notes';
  }

  // If only one underlying event, fall back to its native description for
  // higher fidelity (still rendered through this branch so we keep the
  // expand affordance off).
  if (count === 1) {
    title = group.items[0].description || title;
  }

  const time = group.latestAt
    ? formatDistanceToNow(new Date(group.latestAt), { addSuffix: true })
    : undefined;

  return (
    <div
      className={cn(
        GLASS_ROW,
        'p-3 transition-all duration-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {onNavigate && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <DealChip
                dealId={group.dealId ?? undefined}
                dealName={resolvedDealName ?? undefined}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px] glass-border-soft">{badge}</Badge>
          {time && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>}
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              className="p-0.5 rounded hover:bg-white/[0.06] text-muted-foreground/70 hover:text-foreground transition-colors"
              aria-label={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            onRowClick && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRowClick(group.items[0]); }}
                className="p-0.5 rounded hover:bg-white/[0.06] text-muted-foreground/70 hover:text-foreground transition-colors"
                aria-label="Open"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {expanded && count > 1 && (
        <ul className="mt-2 ml-8 space-y-1 border-l glass-border-softer pl-3">
          {group.items.map((it: any) => {
            const lender = (it.metadata as any)?.lender_name;
            const noteSnippet =
              group.kind === 'lender_notes' && lender
                ? noteByLender.get(lender)?.body
                : null;
            const detail =
              group.kind === 'lender_notes' && noteSnippet
                ? `${lender || 'Lender'}: ${noteSnippet}`
                : it.description;
            return (
              <li key={it.id} className="text-[11px] text-muted-foreground leading-snug">
                <span className="text-foreground/80 line-clamp-2">{detail}</span>
                {it.user_display_name && (
                  <span className="opacity-60"> — {it.user_display_name}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
