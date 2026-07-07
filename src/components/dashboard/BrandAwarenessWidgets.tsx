import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  Users,
  MousePointerClick,
  Eye,
  Linkedin,
  ThumbsUp,
  Sparkles,
  Radar,
} from 'lucide-react';

/**
 * Brand Awareness widget placeholders.
 *
 * These widgets are wired into the "Add Widgets" catalog under the new
 * "Brand Awareness" category. Data sources are intentionally left blank —
 * each widget renders a shell + "Data coming soon" state so the layout,
 * sizing, and drag/drop behavior are all real, and the metric plumbing
 * can be wired later without touching the registry or dashboard grid.
 */

interface PlaceholderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  className?: string;
}

function BrandAwarenessPlaceholder({ title, subtitle, icon: Icon, className }: PlaceholderProps) {
  return (
    <Card className={cn('h-full flex flex-col border-border/50', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center gap-1 text-center">
        <div className="text-2xl font-semibold text-muted-foreground/60">—</div>
        <p className="text-xs text-muted-foreground/80">{subtitle}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mt-2">
          Data source coming soon
        </p>
      </CardContent>
    </Card>
  );
}

export function WebsiteUsersWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="Website Users"
      subtitle="Unique visitors to your site"
      icon={Users}
    />
  );
}

export function SeoClicksWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="SEO Clicks"
      subtitle="Clicks from organic search"
      icon={MousePointerClick}
    />
  );
}

export function SeoImpressionsWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="SEO Impressions"
      subtitle="Times you appeared in search results"
      icon={Eye}
    />
  );
}

export function LinkedInImpressionsWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="LinkedIn Impressions"
      subtitle="Views of your LinkedIn content"
      icon={Linkedin}
    />
  );
}

export function LinkedInInteractionsWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="LinkedIn Interactions"
      subtitle="Reactions, comments, and shares"
      icon={ThumbsUp}
    />
  );
}

export function AiSearchReadinessScoreWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="AI Search Readiness Score"
      subtitle="Rankscale — visibility in AI search"
      icon={Sparkles}
    />
  );
}

export function MarketAwarenessScoreWidget() {
  return (
    <BrandAwarenessPlaceholder
      title="Market Awareness Score"
      subtitle="Composite brand awareness signal"
      icon={Radar}
    />
  );
}

// Default export used by lazy-loading registry consumers that grab
// individual named exports via `.then(m => ({ default: m.X }))`.
export default BrandAwarenessPlaceholder;
