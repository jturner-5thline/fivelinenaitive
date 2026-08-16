/**
 * DealContextRail
 * ---------------
 * Fixed left "context rail" used by the redesigned deal detail layout
 * (5th Line only, scoped in DealDetail via `useContextRailLayout`).
 *
 * Surfaces the identity + at-a-glance facts of a deal — company, deal
 * size, canonical status, pipeline stage, close date, last activity and
 * deal owner — so the main column can focus purely on content.
 *
 * Purely presentational: status/stage remain editable through the shared
 * Editable*Tag components so behaviour stays identical to every other
 * surface.
 */
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatUSD } from '@/lib/formatters/currency';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { NaitiveDatePicker } from '@/components/ui/naitive-date-picker';
import { formatAmountWithCommas, parseCurrencyInputValue } from '@/utils/currencyFormat';
import { EditableDealStatusTag } from './EditableDealStatusTag';
import { EditableDealStageTag } from './EditableDealStageTag';
import type { Deal } from '@/types/deal';

function initials(name?: string | null): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

export interface DealContextRailProps {
  deal: Deal;
  className?: string;
  /** Persist a single deal field (company, value, closingDate). */
  onUpdateField?: (field: string, value: unknown) => void;
  /** When true, show only name, size, status and stage. */
  compact?: boolean;
  /** When true, hide the deal name + amount (rendered as a page header instead). */
  hideIdentity?: boolean;
  hideStatusStage?: boolean;
  /** Ref applied to the core facts block (used to size the header widget). */
  measureRef?: (node: HTMLDivElement | null) => void;
  /** Extra content merged into the same module, below the core facts. */
  children?: React.ReactNode;
}

export function DealContextRail({ deal, className, onUpdateField, compact, hideIdentity, hideStatusStage, measureRef, children }: DealContextRailProps) {
  const lastActivity = deal.notesUpdatedAt || deal.updatedAt || null;
  const owner = deal.dealOwner || deal.manager || '';

  // Close date edits stay pending until explicitly saved or cancelled.
  const [pendingCloseDate, setPendingCloseDate] = useState<string | null>(null);
  const [isCloseDateDirty, setIsCloseDateDirty] = useState(false);

  useEffect(() => {
    if (!isCloseDateDirty) setPendingCloseDate(deal.closingDate || null);
  }, [deal.closingDate, isCloseDateDirty]);

  return (
    <aside
      className={cn(
        'shrink-0 w-full lg:w-[260px] lg:sticky lg:top-4 self-start',
        'rounded-lg border-0 bg-transparent',
        'shadow-none p-3',
        className,
      )}
      aria-label="Deal context"
    >
      <div ref={measureRef} className="space-y-2.5">
      {!hideIdentity && (
      <div className="space-y-1.5">
        <InlineEditField
          value={deal.company}
          manualCommit
          fieldName="Deal name"
          onSave={(value) => onUpdateField?.('company', value)}
          displayClassName="text-3xl font-bold leading-tight break-words text-foreground"
        />
        <InlineEditField
          value={formatUSD(deal.value)}
          editValue={formatAmountWithCommas(String(deal.value ?? 0))}
          sanitizeInput={(next) => next.replace(/[^0-9.,]/g, '')}
          manualCommit
          fieldName="Deal amount"
          onSave={(value) => onUpdateField?.('value', parseCurrencyInputValue(value) ?? 0)}
          displayClassName="text-2xl font-bold leading-none text-primary"
        />
      </div>
      )}

      {!hideStatusStage && (
      <div className="space-y-1.5">
        <EditableDealStatusTag dealId={deal.id} status={deal.status} className="deal-rail-control" />
        <EditableDealStageTag
          dealId={deal.id}
          stage={deal.stage}
          pipelineId={deal.pipelineId ?? null}
          className="deal-rail-control"
        />
      </div>
      )}

      {!compact && (
      <>
      <div className="flex flex-col gap-1 !mt-1">
        <RailLabel>Close date</RailLabel>
        <NaitiveDatePicker
          value={pendingCloseDate}
          onChange={(v) => {
            setPendingCloseDate(v);
            setIsCloseDateDirty(true);
          }}
          size="sm"
          placeholder="Not set"
          buttonClassName="deal-rail-control px-2 h-8 text-sm justify-start w-full"
        />
        {isCloseDateDirty && (
          <div className="flex items-center gap-1 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                onUpdateField?.('closingDate', pendingCloseDate);
                setIsCloseDateDirty(false);
              }}
            >
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setPendingCloseDate(deal.closingDate || null);
                setIsCloseDateDirty(false);
              }}
            >
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-0.5">
        <RailLabel>Last activity</RailLabel>
        <div className="text-sm text-foreground">
          {lastActivity
            ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
            : '—'}
        </div>
      </div>

      <div className="space-y-0.5">
        <RailLabel>Deal owner</RailLabel>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
            {initials(owner)}
          </span>
          <span className="text-sm text-foreground truncate">{owner || 'Unassigned'}</span>
        </div>
      </div>
      </>
      )}
      </div>
      {children ? (
        <div className="mt-3 border-t border-border/50 pt-3">{children}</div>
      ) : null}
    </aside>
  );
}
