import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LenderStagesSettings } from '@/components/settings/LenderStagesSettings';
import { LenderSubstagesSettings } from '@/components/settings/LenderSubstagesSettings';
import { PassReasonsSettings } from '@/components/settings/PassReasonsSettings';
import { DealTypesSettings } from '@/components/settings/DealTypesSettings';
import { DealStagesSettings } from '@/components/settings/DealStagesSettings';
import { DefaultMilestonesSettings } from '@/components/settings/DefaultMilestonesSettings';
import { ReferralSourcesSettings } from '@/components/settings/ReferralSourcesSettings';
import { SuggestionSettings } from '@/components/settings/SuggestionSettings';
import { useCompany } from '@/hooks/useCompany';

const SETTINGS_SECTIONS = [
  {
    id: 'account',
    keywords: ['account', 'profile', 'personal', 'info', 'details', 'email', 'name', 'avatar'],
  },
  {
    id: 'company',
    keywords: ['company', 'team', 'organization', 'members', 'admin', 'logo', 'industry', 'employees'],
  },
  {
    id: 'waitlist',
    keywords: ['waitlist', 'signups', 'subscribers', 'leads', 'admin'],
  },
  {
    id: 'database',
    keywords: ['database', 'lenders', 'directory', 'data', 'directories'],
  },
  {
    id: 'workflows',
    keywords: ['workflows', 'workflow', 'automation', 'automate', 'triggers', 'actions'],
  },
  {
    id: 'lender-stages',
    keywords: ['lender', 'stages', 'stage', 'pipeline', 'workflow', 'status', 'group', 'active', 'closed'],
  },
  {
    id: 'lender-milestones',
    keywords: ['lender', 'milestones', 'milestone', 'substage', 'tracking', 'progress'],
  },
  {
    id: 'pass-reasons',
    keywords: ['pass', 'reasons', 'reason', 'decline', 'reject', 'lender'],
  },
  {
    id: 'deal-types',
    keywords: ['deal', 'types', 'type', 'category', 'classification'],
  },
  {
    id: 'deal-stages',
    keywords: ['deal', 'stages', 'stage', 'pipeline', 'progression', 'workflow'],
  },
  {
    id: 'default-milestones',
    keywords: ['default', 'milestones', 'milestone', 'templates', 'automatic', 'deal'],
  },
  {
    id: 'referral-sources',
    keywords: ['referral', 'sources', 'source', 'referred', 'by', 'referrer'],
  },
  {
    id: 'suggestions',
    keywords: ['suggestions', 'smart', 'alerts', 'warnings', 'reminders', 'opportunities', 'ai'],
  },
  {
    id: 'preferences',
    keywords: ['preferences', 'theme', 'notifications', 'regional', 'settings', 'dark', 'light', 'mode'],
  },
];

export default function Settings() {
  const [searchQuery, setSearchQuery] = useState('');
  const { isAdmin } = useCompany();

  const visibleSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return SETTINGS_SECTIONS.map(s => s.id);
    }
    
    const query = searchQuery.toLowerCase();
    return SETTINGS_SECTIONS
      .filter(section => 
        section.keywords.some(keyword => keyword.includes(query)) ||
        section.id.includes(query)
      )
      .map(s => s.id);
  }, [searchQuery]);

  const isVisible = (id: string) => visibleSections.includes(id);

  return (
    <>
      <Helmet>
        <title>Settings - nAItive</title>
        <meta name="description" content="Manage application settings" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Settings</h1>
                <p className="text-muted-foreground">Manage your application settings</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {visibleSections.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No settings found matching "{searchQuery}"</p>
                <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2">
                  Clear search
                </Button>
              </div>
            )}

            {isVisible('account') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Account
                  </CardTitle>
                  <CardDescription>Manage your personal profile</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/account"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">Profile Settings</p>
                      <p className="text-sm text-muted-foreground">
                        Your personal info and account details
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {isVisible('company') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Company
                  </CardTitle>
                  <CardDescription>Manage your company and team</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/company"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">Company Settings</p>
                      <p className="text-sm text-muted-foreground">
                        Company profile, team members, and roles
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {isVisible('waitlist') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Waitlist
                  </CardTitle>
                  <CardDescription>View and manage waitlist signups</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/waitlist-admin"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">Waitlist Admin</p>
                      <p className="text-sm text-muted-foreground">
                        View signups and export to CSV
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {isVisible('database') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Database
                  </CardTitle>
                  <CardDescription>Manage your directories and data</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/database"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">Referral Sources</p>
                      <p className="text-sm text-muted-foreground">
                        View and manage your referral sources
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
            </Card>
            )}

            {isVisible('workflows') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Workflows
                  </CardTitle>
                  <CardDescription>Automate your deal and lender processes</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/workflows"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">Manage Workflows</p>
                      <p className="text-sm text-muted-foreground">
                        Create and manage automated workflows
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {isVisible('lender-stages') && <LenderStagesSettings isAdmin={isAdmin} />}

            {isVisible('lender-milestones') && <LenderSubstagesSettings isAdmin={isAdmin} />}

            {isVisible('pass-reasons') && <PassReasonsSettings isAdmin={isAdmin} />}

            {isVisible('deal-types') && <DealTypesSettings isAdmin={isAdmin} />}

            {isVisible('deal-stages') && <DealStagesSettings isAdmin={isAdmin} />}

            {isVisible('default-milestones') && <DefaultMilestonesSettings isAdmin={isAdmin} />}

            {isVisible('referral-sources') && <ReferralSourcesSettings isAdmin={isAdmin} />}

            {isVisible('suggestions') && <SuggestionSettings />}

            {isVisible('preferences') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Preferences
                  </CardTitle>
                  <CardDescription>Customize your personal preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/preferences"
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">User Preferences</p>
                      <p className="text-sm text-muted-foreground">
                        Theme, notifications, and regional settings
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
