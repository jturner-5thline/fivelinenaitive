import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { KPISummaryCard } from '@/components/metrics/KPISummaryCard';

export interface KPICardPreferences {
  defaultComparisonPeriod: 'Previous Period' | 'Same Period Last Year' | 'Plan';
  abbreviationThreshold: number;
  decimalPlaces: number;
  showBreakdownByDefault: boolean;
  positiveColor: string;
  negativeColor: string;
}

export const DEFAULT_KPI_CARD_PREFS: KPICardPreferences = {
  defaultComparisonPeriod: 'Previous Period',
  abbreviationThreshold: 1000,
  decimalPlaces: 1,
  showBreakdownByDefault: true,
  positiveColor: 'success',
  negativeColor: 'destructive',
};

interface KPICardSettingsProps {
  isAdmin?: boolean;
}

export function KPICardSettings({ isAdmin }: KPICardSettingsProps) {
  const { settings, updateSettings, isLoading: settingsLoading } = useCompanySettings();
  const [prefs, setPrefs] = useState<KPICardPreferences>(DEFAULT_KPI_CARD_PREFS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.fpa_dashboard_config) {
      const cfg = settings.fpa_dashboard_config as Record<string, unknown>;
      if (cfg.kpiCardPreferences) {
        setPrefs({ ...DEFAULT_KPI_CARD_PREFS, ...(cfg.kpiCardPreferences as Partial<KPICardPreferences>) });
      }
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existingConfig = (settings?.fpa_dashboard_config as Record<string, unknown>) || {};
      await updateSettings({
        fpa_dashboard_config: { ...existingConfig, kpiCardPreferences: prefs } as any,
      });
      toast.success('KPI card preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">KPI Summary Card Defaults</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure default appearance and behavior for KPI Summary Cards across dashboards.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preview */}
        <div className="max-w-xs">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Preview</p>
          <KPISummaryCard
            title="Total Revenue"
            value={1250000}
            trendPercent={12.3}
            trendDirection="up"
            trendLabel={`vs ${prefs.defaultComparisonPeriod}`}
            showBreakdown={prefs.showBreakdownByDefault}
            formatOptions={{
              decimalPlaces: prefs.decimalPlaces,
              abbreviationThreshold: prefs.abbreviationThreshold,
            }}
            subMetrics={[
              { label: 'Debt Revenue', value: 820000, trendPercent: 8.1, trendDirection: 'up' },
              { label: 'FinServ Revenue', value: 430000, trendPercent: -2.4, trendDirection: 'down' },
            ]}
          />
        </div>

        {/* Comparison Period */}
        <div className="space-y-1.5">
          <Label>Default Comparison Period</Label>
          <Select
            value={prefs.defaultComparisonPeriod}
            onValueChange={(v) => setPrefs((p) => ({ ...p, defaultComparisonPeriod: v as KPICardPreferences['defaultComparisonPeriod'] }))}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Previous Period">Previous Period</SelectItem>
              <SelectItem value="Same Period Last Year">Same Period Last Year</SelectItem>
              <SelectItem value="Plan">Plan / Budget</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Number Formatting */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Abbreviation Threshold</Label>
            <Select
              value={String(prefs.abbreviationThreshold)}
              onValueChange={(v) => setPrefs((p) => ({ ...p, abbreviationThreshold: Number(v) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000 (1k)</SelectItem>
                <SelectItem value="10000">10,000 (10k)</SelectItem>
                <SelectItem value="100000">100,000 (100k)</SelectItem>
                <SelectItem value="1000000">1,000,000 (1M)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Decimal Places</Label>
            <Input
              type="number"
              min={0}
              max={4}
              value={prefs.decimalPlaces}
              onChange={(e) => setPrefs((p) => ({ ...p, decimalPlaces: Number(e.target.value) }))}
              className="w-24"
            />
          </div>
        </div>

        {/* Breakdown toggle */}
        <div className="flex items-center gap-3">
          <Switch
            checked={prefs.showBreakdownByDefault}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, showBreakdownByDefault: v }))}
          />
          <Label>Show sub-metric breakdown by default</Label>
        </div>

        {/* Trend colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Positive Trend Color</Label>
            <Select
              value={prefs.positiveColor}
              onValueChange={(v) => setPrefs((p) => ({ ...p, positiveColor: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="success">Green (default)</SelectItem>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="chart-2">Chart Green</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Negative Trend Color</Label>
            <Select
              value={prefs.negativeColor}
              onValueChange={(v) => setPrefs((p) => ({ ...p, negativeColor: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="destructive">Red (default)</SelectItem>
                <SelectItem value="chart-5">Chart Red</SelectItem>
                <SelectItem value="warning">Amber</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving || settingsLoading}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
