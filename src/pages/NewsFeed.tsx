import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Newspaper, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewsGrid } from '@/components/news/NewsGrid';
import { DiscoverOnboardingWizard } from '@/components/news/DiscoverOnboardingWizard';
import { useNewsPreferences } from '@/hooks/useNewsPreferences';
import { useNewsPinnedSources } from '@/hooks/useNewsPinnedSources';
import { useNewsAlerts } from '@/hooks/useNewsAlerts';
import { useNewsDigestSettings } from '@/hooks/useNewsDigestSettings';

export default function NewsFeed() {
  const { preferences, isLoading, needsOnboarding, savePreferences } = useNewsPreferences();
  const { togglePin } = useNewsPinnedSources();
  const { createAlert } = useNewsAlerts();
  const { updateSettings: updateDigestSettings } = useNewsDigestSettings();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Show wizard auto on first visit (once loading completes)
  const showWizard = !isLoading && needsOnboarding && !wizardOpen;

  const handleCompleteOnboarding = useCallback(async (prefs: {
    industries: string[];
    keywords: string[];
    preferred_sources: string[];
    default_layout: string;
    default_tab: string;
    digest_frequency: string;
  }) => {
    // Save preferences to DB
    await savePreferences({
      ...prefs,
      onboarding_completed: true,
    });

    // Pin selected sources
    for (const source of prefs.preferred_sources) {
      await togglePin(source);
    }

    // Create keyword alerts
    for (const keyword of prefs.keywords) {
      await createAlert(keyword);
    }

    // Update digest settings
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
      <Helmet>
        <title>News Feed - naitive</title>
        <meta name="description" content="Stay updated with the latest news from the lending and finance industry." />
      </Helmet>

      <div className="bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Newspaper className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Discover</h1>
                <p className="text-sm text-muted-foreground">
                  Latest news from the lending and finance industry
                </p>
              </div>
            </div>
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

          {/* News Grid */}
          <NewsGrid
            defaultLayout={preferences?.default_layout as any}
            defaultTab={preferences?.default_tab}
          />
        </div>
      </div>

      {/* Onboarding Wizard - auto-open on first visit or via button */}
      <DiscoverOnboardingWizard
        open={showWizard || wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          // Mark as completed even on skip
          if (needsOnboarding) {
            savePreferences({ onboarding_completed: true });
          }
        }}
        onComplete={handleCompleteOnboarding}
      />
    </>
  );
}
