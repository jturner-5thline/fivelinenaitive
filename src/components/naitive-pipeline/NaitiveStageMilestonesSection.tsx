import { useMemo } from 'react';
import { useNaitiveStageMilestones } from '@/hooks/useNaitiveStageMilestones';
import { getStageMilestones } from '@/config/naitiveStageMilestones';
import { getStageDescription, resolveSystemStageType, SYSTEM_STAGE_LABELS } from '@/config/naitivePipelineConfig';
import { NaitiveMilestoneDiamonds } from './NaitiveMilestoneDiamonds';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Diamond } from 'lucide-react';

interface Props {
  dealId: string;
  stage: string;
}

export function NaitiveStageMilestonesSection({ dealId, stage }: Props) {
  const dealIds = useMemo(() => [dealId], [dealId]);
  const { getMilestonesForDeal, toggleMilestone } = useNaitiveStageMilestones(dealIds);
  // Stage id is sufficient for canonical resolution because seeded ids match
  // canonical types (e.g. 'qual-call'); we don't fetch full pipeline here.
  const stageLike = useMemo(() => ({ id: stage, label: stage, color: '' }), [stage]);
  const canonical = resolveSystemStageType(stageLike);
  const defs = getStageMilestones(stageLike);
  const milestones = getMilestonesForDeal(dealId, stage);
  const description = getStageDescription(stageLike);

  if (defs.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Diamond className="h-4 w-4 text-muted-foreground" />
            Stage Milestones
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          {description ? (
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No milestones for this stage.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Diamond className="h-4 w-4 text-primary" />
          Stage Milestones
          {canonical && (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {SYSTEM_STAGE_LABELS[canonical] || canonical}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{description}</p>
        )}
        <div className="space-y-2">
          {milestones.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMilestone(dealId, stage, m.key)}
              className="flex items-center gap-2.5 w-full text-left group rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <DiamondIcon filled={m.completed} />
              <span className="text-sm">
                {m.label}
                {m.description && (
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{m.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t">
          <NaitiveMilestoneDiamonds
            milestones={milestones}
            onToggle={(key) => toggleMilestone(dealId, stage, key)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DiamondIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill={filled ? 'hsl(var(--primary))' : 'none'}
      stroke={filled ? 'hsl(var(--primary))' : 'currentColor'}
      strokeWidth={1.5}
    >
      <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
    </svg>
  );
}
