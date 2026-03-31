/**
 * Thin wrapper around FlexEngagementTrendsChart that normalises its card shell
 * to match the shared Management-tab card system (same header height, padding,
 * border treatment).  All logic stays in the original component.
 */
import { FlexEngagementTrendsChart } from './FlexEngagementTrendsChart';

interface EngagementTrendsCardProps {
  dealId: string;
}

export function EngagementTrendsCard({ dealId }: EngagementTrendsCardProps) {
  // The FlexEngagementTrendsChart already renders its own <Card>.
  // We just re-export it here so the Management tab can import a consistent name
  // and we can override styles in one place if needed later.
  return <FlexEngagementTrendsChart dealId={dealId} />;
}
