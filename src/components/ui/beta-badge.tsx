import { Badge } from "@/components/ui/badge";
import { useIsBeta } from "@/hooks/useFeatureFlags";

interface BetaBadgeProps {
  featureKey: string;
  className?: string;
}

/**
 * Displays a small "Beta" badge next to a feature/page title
 * when the admin has toggled is_beta on for that feature flag.
 */
export function BetaBadge({ featureKey, className }: BetaBadgeProps) {
  const isBeta = useIsBeta(featureKey);

  if (!isBeta) return null;

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 h-4 border-warning text-warning font-semibold ${className ?? ''}`}
    >
      Beta
    </Badge>
  );
}
