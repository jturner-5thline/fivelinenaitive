import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Settings2, BarChart3, TrendingUp, PieChart, AreaChart as AreaChartIcon,
  Palette, Check, RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type ChartType = 'area' | 'bar' | 'line' | 'composed';

export interface ChartColorTheme {
  id: string;
  name: string;
  colors: string[];
}

export interface ChartConfig {
  revenueChartType: ChartType;
  marginChartType: ChartType;
  opexChartType: ChartType;
  colorTheme: string;
  showGridLines: boolean;
  showLegend: boolean;
  showDataLabels: boolean;
  animationEnabled: boolean;
  curveType: 'monotone' | 'linear' | 'step';
}

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  revenueChartType: 'area',
  marginChartType: 'line',
  opexChartType: 'bar',
  colorTheme: 'default',
  showGridLines: true,
  showLegend: true,
  showDataLabels: false,
  animationEnabled: true,
  curveType: 'monotone',
};

export const COLOR_THEMES: ChartColorTheme[] = [
  {
    id: 'default',
    name: 'Default',
    colors: ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['hsl(210, 80%, 50%)', 'hsl(190, 70%, 50%)', 'hsl(170, 60%, 45%)', 'hsl(200, 75%, 60%)', 'hsl(220, 65%, 55%)'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: ['hsl(15, 80%, 55%)', 'hsl(35, 85%, 55%)', 'hsl(50, 80%, 50%)', 'hsl(5, 75%, 50%)', 'hsl(25, 70%, 60%)'],
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['hsl(140, 60%, 40%)', 'hsl(160, 55%, 45%)', 'hsl(100, 50%, 45%)', 'hsl(120, 45%, 50%)', 'hsl(80, 55%, 40%)'],
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    colors: ['hsl(var(--foreground))', 'hsl(var(--muted-foreground))', 'hsl(var(--muted-foreground) / 0.6)', 'hsl(var(--muted-foreground) / 0.4)', 'hsl(var(--muted-foreground) / 0.25)'],
  },
  {
    id: 'vivid',
    name: 'Vivid',
    colors: ['hsl(260, 75%, 55%)', 'hsl(330, 80%, 55%)', 'hsl(45, 90%, 50%)', 'hsl(180, 70%, 45%)', 'hsl(290, 65%, 50%)'],
  },
];

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'area', label: 'Area', icon: AreaChartIcon },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'composed', label: 'Composed', icon: PieChart },
];

interface ChartConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ChartConfig;
  onConfigChange: (config: ChartConfig) => void;
}

export function ChartConfigPanel({ open, onOpenChange, config, onConfigChange }: ChartConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<ChartConfig>(config);

  const updateLocal = (partial: Partial<ChartConfig>) => {
    setLocalConfig(prev => ({ ...prev, ...partial }));
  };

  const handleApply = () => {
    onConfigChange(localConfig);
    onOpenChange(false);
    toast.success('Chart configuration updated');
  };

  const handleReset = () => {
    setLocalConfig(DEFAULT_CHART_CONFIG);
  };

  const selectedTheme = COLOR_THEMES.find(t => t.id === localConfig.colorTheme) || COLOR_THEMES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Chart Configuration
          </DialogTitle>
          <DialogDescription>
            Customize chart types, colors, and display options.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-5 pr-2">
            {/* Chart Types */}
            <div className="space-y-3">
              <Label className="text-xs font-medium">Chart Types</Label>

              {[
                { key: 'revenueChartType' as const, label: 'Revenue Chart' },
                { key: 'marginChartType' as const, label: 'Margin Trends' },
                { key: 'opexChartType' as const, label: 'OPEX Comparison' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="flex gap-1">
                    {CHART_TYPE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => updateLocal({ [key]: opt.value })}
                          className={cn(
                            "h-7 px-2.5 rounded-md border text-[10px] flex items-center gap-1 transition-all",
                            localConfig[key] === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Color Themes */}
            <div className="space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Color Theme
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {COLOR_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => updateLocal({ colorTheme: theme.id })}
                    className={cn(
                      "p-2.5 rounded-lg border text-left transition-all",
                      localConfig.colorTheme === theme.id
                        ? "border-primary ring-1 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      {localConfig.colorTheme === theme.id && (
                        <Check className="h-3 w-3 text-primary" />
                      )}
                      <span className="text-[10px] font-medium">{theme.name}</span>
                    </div>
                    <div className="flex gap-0.5">
                      {theme.colors.map((color, i) => (
                        <div
                          key={i}
                          className="h-4 flex-1 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Curve Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Line Style</Label>
              <div className="flex gap-1">
                {(['monotone', 'linear', 'step'] as const).map(curve => (
                  <button
                    key={curve}
                    onClick={() => updateLocal({ curveType: curve })}
                    className={cn(
                      "h-7 px-3 rounded-md border text-[10px] transition-all capitalize",
                      localConfig.curveType === curve
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {curve}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Display Options */}
            <div className="space-y-3">
              <Label className="text-xs font-medium">Display Options</Label>
              {[
                { key: 'showGridLines' as const, label: 'Grid lines' },
                { key: 'showLegend' as const, label: 'Legend' },
                { key: 'showDataLabels' as const, label: 'Data labels' },
                { key: 'animationEnabled' as const, label: 'Animations' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Switch
                    checked={localConfig[key]}
                    onCheckedChange={(v) => updateLocal({ [key]: v })}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleApply}>Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
