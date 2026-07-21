import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, DollarSign, Clock, Users, ChevronDown, Search, X } from 'lucide-react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePreferences, CURRENCY_FORMAT_OPTIONS, CurrencyFormat } from '@/contexts/PreferencesContext';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { UserNotificationSettings } from '@/components/settings/UserNotificationSettings';
import { NotificationLinkSettings } from '@/components/settings/NotificationLinkSettings';
import { MorningDigestSettings } from '@/components/settings/MorningDigestSettings';
import { SuggestionSettings } from '@/components/settings/SuggestionSettings';
import { PerUserStaleThresholdSettings } from '@/components/settings/PerUserStaleThresholdSettings';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';

const PREF_SECTIONS = [
  { id: 'profile', keywords: ['profile', 'avatar', 'display name', 'email', 'photo', 'picture', 'name', 'account'] },
  { id: 'notifications', keywords: ['notifications', 'alerts', 'email', 'in-app', 'deal updates', 'lender updates', 'summary', 'weekly'] },
  { id: 'suggestions', keywords: ['suggestions', 'smart', 'ai', 'warnings', 'reminders', 'opportunities', 'actions', 'stale', 'overdue', 'milestones'] },
  { id: 'lenderAlerts', keywords: ['lender', 'update', 'alerts', 'stale', 'warning', 'threshold', 'yellow', 'red', 'urgent', 'days'] },
  { id: 'staleDeals', keywords: ['stale', 'deals', 'alert', 'threshold', 'days', 'inactive', 'old'] },
  { id: 'lenderDefaults', keywords: ['lender', 'defaults', 'stage', 'new lenders', 'default stage'] },
  { id: 'currency', keywords: ['currency', 'format', 'number', 'abbreviated', 'million', 'thousand', 'money'] },
];

const TABS = [
  { id: 'general', label: 'General', sectionIds: ['profile'] },
  { id: 'notifications', label: 'Notifications', sectionIds: ['notifications', 'suggestions'] },
  { id: 'alerts', label: 'Alerts & Thresholds', sectionIds: ['lenderAlerts', 'staleDeals', 'lenderDefaults'] },
  { id: 'formatting', label: 'Formatting', sectionIds: ['currency'] },
];

export default function Preferences() {
  
  const { preferences, updatePreference } = usePreferences();
  const { stages } = useLenderStages();
  const { isAdmin } = useCompany();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('general');

  const visibleSections = useMemo(() => {
    if (!searchQuery.trim()) return PREF_SECTIONS.map(s => s.id);
    const query = searchQuery.toLowerCase();
    return PREF_SECTIONS
      .filter(s => s.keywords.some(k => k.includes(query)) || s.id.toLowerCase().includes(query))
      .map(s => s.id);
  }, [searchQuery]);

  const isVisible = (id: string) => visibleSections.includes(id);

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return TABS;
    return TABS.filter(tab => tab.sectionIds.some(id => visibleSections.includes(id)));
  }, [searchQuery, visibleSections]);

  const effectiveTab = useMemo(() => {
    if (!searchQuery.trim()) return activeTab;
    if (filteredTabs.length > 0 && !filteredTabs.find(t => t.id === activeTab)) {
      return filteredTabs[0].id;
    }
    return activeTab;
  }, [searchQuery, filteredTabs, activeTab]);

  return (
    <>
      <Helmet>
        <title>Preferences - naitive</title>
        <meta name="description" content="Manage your personal preferences" />
      </Helmet>

      <div className="bg-transparent">

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div />
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search preferences..."
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

            {filteredTabs.length === 0 && searchQuery && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No preferences found matching "{searchQuery}"</p>
                <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2">
                  Clear search
                </Button>
              </div>
            )}

            {filteredTabs.length > 0 && (
              <Tabs value={effectiveTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {filteredTabs.map(tab => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-4 mt-4">
                  {isVisible('profile') && (
                    <ProfileSettings />
                  )}
                </TabsContent>

                {/* Notifications Tab */}
                <TabsContent value="notifications" className="space-y-4 mt-4">
                  {isVisible('notifications') && <MorningDigestSettings />}
                  {isVisible('notifications') && <PerUserStaleThresholdSettings />}
                  {isVisible('notifications') && <NotificationLinkSettings />}
                  {isVisible('notifications') && <UserNotificationSettings />}
                </TabsContent>

                {/* Alerts & Thresholds Tab */}
                <TabsContent value="alerts" className="space-y-4 mt-4">
                  {isVisible('lenderAlerts') && (
                    <Collapsible>
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
                              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                                disabled={!isAdmin}
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
                                disabled={!isAdmin}
                              />
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  )}

                  {isVisible('staleDeals') && (
                    <Collapsible>
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
                              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                                disabled={!isAdmin}
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
                  )}

                  {isVisible('lenderDefaults') && (
                    <Collapsible>
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
                              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                                disabled={!isAdmin}
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
                  )}
                </TabsContent>

                {/* Formatting Tab */}
                <TabsContent value="formatting" className="space-y-4 mt-4">
                  {isVisible('currency') && (
                    <Collapsible>
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
                              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                                disabled={!isAdmin}
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
                  )}

                  {isVisible('regional') && (
                    <Collapsible>
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
                              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
