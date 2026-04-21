import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Shared visual primitives for the Daily Briefing modal AND any other surface
 * that wants to render a briefing-style section (e.g., Weekly Rundown carousel
 * Page 3 "Pipeline & Clients").
 *
 * Keep these in lockstep with the styling used inside DailyBriefingModal so
 * both render identically.
 */

export const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-lg';
export const GLASS_ROW = 'bg-white/[0.02] border border-white/[0.05] rounded-lg backdrop-blur-sm';

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
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 px-0.5">{title}</h4>
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
        onClick && 'cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_2px_12px_hsl(var(--primary)/0.08)]',
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
          <Badge variant={badgeVariant || 'secondary'} className="text-[10px] border-white/[0.08]">
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
  emptyMessage = 'No pipeline activity since 5 PM ET yesterday',
}: {
  recentActivity: any[];
  onRowClick?: (activity: any) => void;
  emptyMessage?: string;
}) {
  return (
    <Section title="Recent Pipeline Activity">
      {recentActivity.length === 0 ? (
        <EmptySection message={emptyMessage} />
      ) : (
        recentActivity.map((a: any) => (
          <BriefingRow
            key={a.id}
            icon={Clock}
            title={a.description}
            subtitle={a.user_display_name || undefined}
            badge={a.activity_type ? a.activity_type.replace(/_/g, ' ') : undefined}
            badgeVariant="outline"
            time={a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : undefined}
            onClick={onRowClick ? () => onRowClick(a) : undefined}
          />
        ))
      )}
    </Section>
  );
}
