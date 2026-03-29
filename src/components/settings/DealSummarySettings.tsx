import { useState, useEffect } from 'react';
import { Mail, Clock, Calendar, Building2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useDealSummaryPreferences } from '@/hooks/useDealSummaryPreferences';
import { useCompany } from '@/hooks/useCompany';

const DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const TIMES = Array.from({ length: 24 }, (_, h) => {
  const hour = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return {
    value: `${String(h).padStart(2, '0')}:00`,
    label: `${hour}:00 ${ampm} ET`,
  };
});

export function DealSummarySettings() {
  const { isAdmin, isOwner } = useCompany();
  const {
    effective,
    orgDefaults,
    isLoading,
    updateUserPrefs,
    updateOrgDefaults,
  } = useDealSummaryPreferences();

  const canEditOrg = isAdmin || isOwner;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Deal Summary Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Deal Summary Emails
          <Badge variant="outline" className="text-xs ml-2">Eastern Time</Badge>
        </CardTitle>
        <CardDescription>
          Configure daily and weekly deal activity summaries delivered to your inbox
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── User Preferences ── */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Your Preferences</h3>

          {/* Daily Summary */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <Label htmlFor="daily_summary" className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Daily deal summary
                </span>
                <span className="text-sm text-muted-foreground font-normal">
                  Receive a daily summary of your deal activity
                  {effective.dailyWeekdaysOnly && ' (weekdays only)'}
                </span>
              </Label>
              <Switch
                id="daily_summary"
                checked={effective.dailyEnabled}
                onCheckedChange={(checked) =>
                  updateUserPrefs.mutate({ daily_deal_summary_enabled: checked })
                }
                disabled={updateUserPrefs.isPending}
              />
            </div>

            {effective.dailyEnabled && (
              <div className="flex items-center gap-3 pl-6">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">Send at:</Label>
                <Select
                  value={effective.dailyTimeET}
                  onValueChange={(val) =>
                    updateUserPrefs.mutate({ daily_deal_summary_time_et: val })
                  }
                  disabled={updateUserPrefs.isPending}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Weekly Summary */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <Label htmlFor="weekly_summary" className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Weekly deal summary
                </span>
                <span className="text-sm text-muted-foreground font-normal">
                  Receive a weekly summary of your deal activity
                </span>
              </Label>
              <Switch
                id="weekly_summary"
                checked={effective.weeklyEnabled}
                onCheckedChange={(checked) =>
                  updateUserPrefs.mutate({ weekly_deal_summary_enabled: checked })
                }
                disabled={updateUserPrefs.isPending}
              />
            </div>

            {effective.weeklyEnabled && (
              <div className="flex items-center gap-3 pl-6 flex-wrap">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">Send on:</Label>
                <Select
                  value={effective.weeklyDayET}
                  onValueChange={(val) =>
                    updateUserPrefs.mutate({ weekly_deal_summary_day_et: val })
                  }
                  disabled={updateUserPrefs.isPending}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-sm text-muted-foreground whitespace-nowrap">at:</Label>
                <Select
                  value={effective.weeklyTimeET}
                  onValueChange={(val) =>
                    updateUserPrefs.mutate({ weekly_deal_summary_time_et: val })
                  }
                  disabled={updateUserPrefs.isPending}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* ── Admin: Org Defaults ── */}
        {canEditOrg && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organization Defaults (ET)
              </h3>
              <p className="text-xs text-muted-foreground">
                These defaults apply to all team members who haven't set their own preferences. Changing these won't override individual user settings.
              </p>

              {/* Daily org default */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col gap-1">
                    <span>Default daily deal summary</span>
                    <span className="text-sm text-muted-foreground font-normal">
                      Enable daily summaries for all team members by default
                    </span>
                  </Label>
                  <Switch
                    checked={orgDefaults?.daily_deal_summary_enabled ?? false}
                    onCheckedChange={(checked) =>
                      updateOrgDefaults.mutate({ daily_deal_summary_enabled: checked })
                    }
                    disabled={updateOrgDefaults.isPending}
                  />
                </div>

                {(orgDefaults?.daily_deal_summary_enabled ?? false) && (
                  <div className="flex items-center gap-4 pl-4 flex-wrap">
                    <Select
                      value={orgDefaults?.daily_deal_summary_time_et?.substring(0, 5) ?? '18:00'}
                      onValueChange={(val) =>
                        updateOrgDefaults.mutate({ daily_deal_summary_time_et: val })
                      }
                      disabled={updateOrgDefaults.isPending}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="weekdays_only"
                        checked={orgDefaults?.daily_deal_summary_weekdays_only ?? true}
                        onCheckedChange={(checked) =>
                          updateOrgDefaults.mutate({ daily_deal_summary_weekdays_only: !!checked })
                        }
                        disabled={updateOrgDefaults.isPending}
                      />
                      <Label htmlFor="weekdays_only" className="text-sm">
                        Weekdays only
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {/* Weekly org default */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col gap-1">
                    <span>Default weekly deal summary</span>
                    <span className="text-sm text-muted-foreground font-normal">
                      Enable weekly summaries for all team members by default
                    </span>
                  </Label>
                  <Switch
                    checked={orgDefaults?.weekly_deal_summary_enabled ?? false}
                    onCheckedChange={(checked) =>
                      updateOrgDefaults.mutate({ weekly_deal_summary_enabled: checked })
                    }
                    disabled={updateOrgDefaults.isPending}
                  />
                </div>

                {(orgDefaults?.weekly_deal_summary_enabled ?? false) && (
                  <div className="flex items-center gap-3 pl-4 flex-wrap">
                    <Select
                      value={orgDefaults?.weekly_deal_summary_day_et ?? 'saturday'}
                      onValueChange={(val) =>
                        updateOrgDefaults.mutate({ weekly_deal_summary_day_et: val })
                      }
                      disabled={updateOrgDefaults.isPending}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label className="text-sm text-muted-foreground">at</Label>
                    <Select
                      value={orgDefaults?.weekly_deal_summary_time_et?.substring(0, 5) ?? '08:00'}
                      onValueChange={(val) =>
                        updateOrgDefaults.mutate({ weekly_deal_summary_time_et: val })
                      }
                      disabled={updateOrgDefaults.isPending}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
