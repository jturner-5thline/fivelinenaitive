import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Landmark } from 'lucide-react';

interface LenderLike {
  id: string;
  name: string;
  stage?: string;
  trackingStatus?: string;
  notes?: string;
}

interface StageOption {
  id: string;
  label: string;
  group?: string;
}

interface ActiveLendersBulletCardProps {
  lenders: LenderLike[];
  configuredStages: StageOption[];
  onLenderClick: (name: string) => void;
}

/**
 * Clean bullet-point list of ACTIVE funding sources for the current deal.
 * - Data is strictly the `lenders` array already scoped to this deal record;
 *   no cross-deal fetches happen here.
 * - Each name is a button that opens the same lender detail modal used by
 *   the Funding Sources tab (parent passes `setSelectedLenderName`).
 */
export function ActiveLendersBulletCard({
  lenders,
  configuredStages,
  onLenderClick,
}: ActiveLendersBulletCardProps) {
  const stageLabel = (stageId?: string) => {
    if (!stageId) return 'No stage';
    const match = configuredStages.find((s) => s.id === stageId);
    return match?.label || stageId;
  };

  const activeLenders = (lenders || []).filter((l) => {
    const stageCfg = configuredStages.find((s) => s.id === l.stage);
    const group = stageCfg?.group;
    // Treat as active when explicitly active, or when stage group isn't 'passed'.
    if (l.trackingStatus === 'passed' || group === 'passed') return false;
    return true;
  });

  if (activeLenders.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Active Funding Sources
          <span className="text-xs font-normal text-muted-foreground">
            ({activeLenders.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <ul className="space-y-2 list-disc pl-5 marker:text-muted-foreground/70">
          {activeLenders.map((lender) => {
            const notes = (lender.notes || '').trim();
            return (
              <li key={lender.id} className="text-sm leading-relaxed break-words">
                <button
                  type="button"
                  onClick={() => onLenderClick(lender.name)}
                  className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {lender.name}
                </button>
                <span className="text-muted-foreground"> — </span>
                <span className="text-foreground/90">{stageLabel(lender.stage)}</span>
                {notes ? (
                  <>
                    <span className="text-muted-foreground"> — Notes: </span>
                    <span className="text-muted-foreground">{notes}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/70"> — Notes: None</span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
