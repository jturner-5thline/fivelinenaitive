import { useState, useCallback } from 'react';
import { Newspaper, Settings2, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewsGrid } from '@/components/news/NewsGrid';
import { WatchlistPanel } from '@/components/news/WatchlistPanel';
import { DiscoverOnboardingWizard } from '@/components/news/DiscoverOnboardingWizard';
import { useNewsPreferences } from '@/hooks/useNewsPreferences';
import { useNewsPinnedSources } from '@/hooks/useNewsPinnedSources';
import { useNewsAlerts } from '@/hooks/useNewsAlerts';
import { useNewsDigestSettings } from '@/hooks/useNewsDigestSettings';

export function NewsFeedPanel() {
  const { preferences, isLoading, needsOnboarding, savePreferences } = useNewsPreferences();
  const { togglePin } = useNewsPinnedSources();
  const { createAlert } = useNewsAlerts();
  const { updateSettings: updateDigestSettings } = useNewsDigestSettings();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  const showWizard = !isLoading && needsOnboarding && !wizardOpen;

  const handleCompleteOnboarding = useCallback(async (prefs: {
    industries: string[];
    keywords: string[];
    preferred_sources: string[];
    default_layout: string;
    default_tab: string;
    digest_frequency: string;
  }) => {
    await savePreferences({ ...prefs, onboarding_completed: true });
    for (const source of prefs.preferred_sources) await togglePin(source);
    for (const keyword of prefs.keywords) await createAlert(keyword);
    if (prefs.digest_frequency !== 'none') {
      await updateDigestSettings({
        is_enabled: true,
        frequency: prefs.digest_frequency as 'daily' | 'weekly',
        max_articles: 10,
      });
    }
    setWizardOpen(false);
  }, [savePreferences, togglePin, createAlert, updateDigestSettings]);

  return (
    <>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Newspaper className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Discover</h2>
              <p className="text-sm text-muted-foreground">
                Deal Intelligence &amp; Market News
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWatchlistOpen(true)}
              className="gap-1.5"
            >
              <ListFilter className="h-3.5 w-3.5" />
              Manage Watchlist
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWizardOpen(true)}
              className="gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Customize Feed
            </Button>
          </div>
        </div>

        {/* News Grid */}
        <NewsGrid
          defaultLayout={preferences?.default_layout as any}
          defaultTab={preferences?.default_tab}
        />
      </div>

      {/* Watchlist Panel */}
      <WatchlistPanel open={watchlistOpen} onClose={() => setWatchlistOpen(false)} />

      {/* Onboarding Wizard */}
      <DiscoverOnboardingWizard
        open={showWizard || wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          if (needsOnboarding) savePreferences({ onboarding_completed: true });
        }}
        onComplete={handleCompleteOnboarding}
      />
    </>
  );
}
