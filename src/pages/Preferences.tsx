import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Palette, Bell, Globe, DollarSign, Clock } from 'lucide-react';
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
import { usePreferences, CURRENCY_FORMAT_OPTIONS, CurrencyFormat } from '@/contexts/PreferencesContext';
import { ProfileSettings } from '@/components/settings/ProfileSettings';

export default function Preferences() {
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();

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
            <div>
              <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Preferences</h1>
              <p className="text-muted-foreground">Customize your experience</p>
            </div>

            <ProfileSettings />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Appearance
                </CardTitle>
                <CardDescription>Customize how the app looks</CardDescription>
              </CardHeader>
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription>Configure notification settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive updates via email</p>
                  </div>
                  <Switch
                    checked={preferences.emailNotifications}
                    onCheckedChange={(checked) => updatePreference('emailNotifications', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Deal Status Alerts</Label>
                    <p className="text-sm text-muted-foreground">Get notified when deal status changes</p>
                  </div>
                  <Switch
                    checked={preferences.dealStatusAlerts}
                    onCheckedChange={(checked) => updatePreference('dealStatusAlerts', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Lender Update Alerts
                </CardTitle>
                <CardDescription>Configure when to show stale lender notifications</CardDescription>
              </CardHeader>
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Currency Formatting
                </CardTitle>
                <CardDescription>Choose how currency values are displayed</CardDescription>
              </CardHeader>
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Regional
                </CardTitle>
                <CardDescription>Language and regional settings</CardDescription>
              </CardHeader>
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
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}
