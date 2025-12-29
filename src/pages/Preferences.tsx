import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Palette, Bell, Globe, DollarSign, Clock, Users, ChevronDown, User, ChevronsUpDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePreferences, CURRENCY_FORMAT_OPTIONS, CurrencyFormat } from '@/contexts/PreferencesContext';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { cn } from '@/lib/utils';

const SECTION_COUNT = 8;

export default function Preferences() {
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();
  const { stages } = useLenderStages();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true,
    appearance: true,
    notifications: true,
    lenderAlerts: true,
    staleDeals: true,
    lenderDefaults: true,
    currency: true,
    regional: true,
  });

  const allOpen = Object.values(openSections).every(Boolean);
  const allClosed = Object.values(openSections).every(v => !v);

  const toggleAll = () => {
    const newState = allOpen ? false : true;
    setOpenSections({
      profile: newState,
      appearance: newState,
      notifications: newState,
      lenderAlerts: newState,
      staleDeals: newState,
      lenderDefaults: newState,
      currency: newState,
      regional: newState,
    });
  };

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <Helmet>
        <title>Preferences - nAItive</title>
        <meta name="description" content="Manage your personal preferences" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Preferences</h1>
                <p className="text-muted-foreground">Customize your experience</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAll}
                className="gap-2"
              >
                <ChevronsUpDown className="h-4 w-4" />
                {allOpen ? 'Collapse All' : 'Expand All'}
              </Button>
            </div>

            <ProfileSettings collapsible open={openSections.profile} onOpenChange={() => toggleSection('profile')} />

            <Collapsible open={openSections.appearance} onOpenChange={() => toggleSection('appearance')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Appearance</CardTitle>
                          <CardDescription>Customize how the app looks</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.appearance && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Theme</Label>
                        <p className="text-sm text-muted-foreground">Select your preferred theme</p>
                      </div>
                      <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Compact Mode</Label>
                        <p className="text-sm text-muted-foreground">Use smaller spacing and fonts</p>
                      </div>
                      <Switch
                        checked={preferences.compactMode}
                        onCheckedChange={(checked) => updatePreference('compactMode', checked)}
                      />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <NotificationSettings collapsible open={openSections.notifications} onOpenChange={() => toggleSection('notifications')} />

            <Collapsible open={openSections.lenderAlerts} onOpenChange={() => toggleSection('lenderAlerts')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Lender Update Alerts</CardTitle>
                          <CardDescription>Configure when to show stale lender notifications</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.lenderAlerts && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Warning Threshold (Yellow)</Label>
                        <p className="text-sm text-muted-foreground">Days before showing yellow warning</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={preferences.lenderUpdateRedDays - 1}
                        value={preferences.lenderUpdateYellowDays}
                        onChange={(e) => updatePreference('lenderUpdateYellowDays', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 text-center"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Urgent Threshold (Red)</Label>
                        <p className="text-sm text-muted-foreground">Days before showing red urgent alert</p>
                      </div>
                      <Input
                        type="number"
                        min={preferences.lenderUpdateYellowDays + 1}
                        value={preferences.lenderUpdateRedDays}
                        onChange={(e) => updatePreference('lenderUpdateRedDays', Math.max(preferences.lenderUpdateYellowDays + 1, parseInt(e.target.value) || 14))}
                        className="w-20 text-center"
                      />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={openSections.staleDeals} onOpenChange={() => toggleSection('staleDeals')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Stale Deals Alert</CardTitle>
                          <CardDescription>Configure when deals are considered stale</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.staleDeals && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Stale Threshold</Label>
                        <p className="text-sm text-muted-foreground">Days without updates before a deal is flagged as stale</p>
                      </div>
                      <Select
                        value={String(preferences.staleDealsDays)}
                        onValueChange={(value) => updatePreference('staleDealsDays', parseInt(value))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="21">21 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={openSections.lenderDefaults} onOpenChange={() => toggleSection('lenderDefaults')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Lender Defaults</CardTitle>
                          <CardDescription>Configure default settings for new lenders</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.lenderDefaults && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Default Stage</Label>
                        <p className="text-sm text-muted-foreground">Stage assigned to newly added lenders</p>
                      </div>
                      <Select
                        value={preferences.defaultLenderStage}
                        onValueChange={(value) => updatePreference('defaultLenderStage', value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={openSections.currency} onOpenChange={() => toggleSection('currency')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Currency Formatting</CardTitle>
                          <CardDescription>Choose how currency values are displayed</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.currency && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Number Format</Label>
                        <p className="text-sm text-muted-foreground">How large numbers are abbreviated</p>
                      </div>
                      <Select
                        value={preferences.currencyFormat}
                        onValueChange={(value: CurrencyFormat) => updatePreference('currencyFormat', value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_FORMAT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="flex items-center gap-2">
                                <span>{option.label}</span>
                                <span className="text-muted-foreground text-xs">({option.example})</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Preview with $15,000,000:</p>
                      <p className="text-lg font-semibold">
                        {CURRENCY_FORMAT_OPTIONS.find(o => o.value === preferences.currencyFormat)?.example}
                      </p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={openSections.regional} onOpenChange={() => toggleSection('regional')}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        <div className="text-left">
                          <CardTitle className="text-lg">Regional</CardTitle>
                          <CardDescription>Language and regional settings</CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", openSections.regional && "rotate-180")} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Currency</Label>
                        <p className="text-sm text-muted-foreground">Display currency format</p>
                      </div>
                      <Select
                        value={preferences.currency}
                        onValueChange={(value: 'usd' | 'eur' | 'gbp') => updatePreference('currency', value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usd">USD ($)</SelectItem>
                          <SelectItem value="eur">EUR (€)</SelectItem>
                          <SelectItem value="gbp">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Date Format</Label>
                        <p className="text-sm text-muted-foreground">How dates are displayed</p>
                      </div>
                      <Select
                        value={preferences.dateFormat}
                        onValueChange={(value: 'mdy' | 'dmy' | 'ymd') => updatePreference('dateFormat', value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                          <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                          <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </main>
      </div>
    </>
  );
}
