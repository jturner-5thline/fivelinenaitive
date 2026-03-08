import { useState } from 'react';
import { BarChart3, LineChart, PieChart, AreaChart, SlidersHorizontal, Palette, ArrowUpDown, Hash, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChartType } from '@/contexts/ChartsContext';

const CHART_COLORS = [
  '#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

export interface ChartLocalConfig {
  chartType?: ChartType;
  primaryColor?: string;
  sortOrder?: 'asc' | 'desc' | 'default';
  limit?: number; // top N items
  filterManager?: string;
  filterStatus?: string;
  opacity?: number;
  showLabels?: boolean;
  showLegend?: boolean;
}

interface ChartInlineToolbarProps {
  chartType: ChartType;
  dataSource: string;
  localConfig: ChartLocalConfig;
  onChange: (config: ChartLocalConfig) => void;
  managers?: string[];
  statuses?: string[];
  compact?: boolean;
}

const chartTypes: { type: ChartType; icon: typeof BarChart3; label: string }[] = [
  { type: 'bar', icon: BarChart3, label: 'Bar' },
  { type: 'line', icon: LineChart, label: 'Line' },
  { type: 'pie', icon: PieChart, label: 'Donut' },
  { type: 'area', icon: AreaChart, label: 'Area' },
];

// Data sources that support chart type switching
const SWITCHABLE_SOURCES = new Set([
  'deals-by-stage', 'deals-by-status', 'deal-value-distribution',
  'lender-activity', 'monthly-value', 'fee-breakdown',
  'hours-by-manager', 'hours-by-stage', 'revenue-per-hour-by-manager',
  'deals-by-referral-source', 'deal-value-by-referral-source',
]);

// Data sources that support sorting
const SORTABLE_SOURCES = new Set([
  'deals-by-stage', 'deals-by-status', 'deal-value-distribution',
  'lender-activity', 'lender-pass-reasons', 'hours-by-manager',
  'hours-by-stage', 'revenue-per-hour-by-manager',
  'deals-by-referral-source', 'deal-value-by-referral-source',
  'deal-velocity',
]);

// Data sources that support top-N limiting
const LIMITABLE_SOURCES = new Set([
  'lender-pass-reasons', 'lender-leaderboard', 'stale-deal-alerts',
  'deals-by-referral-source', 'deal-value-by-referral-source',
  'hours-by-manager', 'hours-by-stage', 'revenue-per-hour-by-manager',
  'deal-velocity',
]);

export function ChartInlineToolbar({
  chartType,
  dataSource,
  localConfig,
  onChange,
  managers = [],
  statuses = [],
  compact = false,
}: ChartInlineToolbarProps) {
  const canSwitch = SWITCHABLE_SOURCES.has(dataSource);
  const canSort = SORTABLE_SOURCES.has(dataSource);
  const canLimit = LIMITABLE_SOURCES.has(dataSource);
  const currentType = localConfig.chartType || chartType;

  const btnSize = compact ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Chart Type Switcher */}
      {canSwitch && (
        <div className="flex items-center border rounded-md p-0.5 bg-muted/40">
          {chartTypes.map(({ type, icon: Icon, label }) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "rounded-sm p-1 transition-colors",
                    btnSize,
                    "flex items-center justify-center",
                    currentType === type
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  onClick={() => onChange({ ...localConfig, chartType: type })}
                >
                  <Icon className={iconSize} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">{label}</p></TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Sort toggle */}
      {canSort && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "rounded-md p-1.5 transition-colors border",
                btnSize,
                "flex items-center justify-center",
                localConfig.sortOrder && localConfig.sortOrder !== 'default'
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
              )}
              onClick={() => {
                const next = localConfig.sortOrder === 'desc' ? 'asc' : localConfig.sortOrder === 'asc' ? 'default' : 'desc';
                onChange({ ...localConfig, sortOrder: next });
              }}
            >
              <ArrowUpDown className={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">
              Sort: {localConfig.sortOrder === 'desc' ? 'High → Low' : localConfig.sortOrder === 'asc' ? 'Low → High' : 'Default'}
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Limit (Top N) */}
      {canLimit && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "rounded-md p-1.5 transition-colors border",
                    btnSize,
                    "flex items-center justify-center",
                    localConfig.limit
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                  )}
                >
                  <Hash className={iconSize} />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p className="text-xs">Limit results</p></TooltipContent>
          </Tooltip>
          <PopoverContent className="w-52 p-3" align="start">
            <Label className="text-xs mb-2 block">
              Show top {localConfig.limit || 'All'} items
            </Label>
            <Slider
              value={[localConfig.limit || 0]}
              min={0}
              max={25}
              step={1}
              onValueChange={([val]) => onChange({ ...localConfig, limit: val === 0 ? undefined : val })}
              className="mb-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>All</span>
              <span>25</span>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Color picker */}
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "rounded-md p-1.5 transition-colors border",
                  btnSize,
                  "flex items-center justify-center text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                )}
              >
                <Palette className={iconSize} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p className="text-xs">Color</p></TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-3" align="start">
          <Label className="text-xs mb-2 block">Primary Color</Label>
          <div className="flex gap-1.5 flex-wrap max-w-[180px]">
            {CHART_COLORS.map(color => (
              <button
                key={color}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                  (localConfig.primaryColor || '#9333ea') === color
                    ? "border-foreground scale-110"
                    : "border-transparent"
                )}
                style={{ backgroundColor: color }}
                onClick={() => onChange({ ...localConfig, primaryColor: color })}
              />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Label className="text-xs">Opacity</Label>
            <Slider
              value={[localConfig.opacity ?? 100]}
              min={30}
              max={100}
              step={5}
              onValueChange={([val]) => onChange({ ...localConfig, opacity: val })}
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Per-widget filter */}
      {(managers.length > 0 || statuses.length > 0) && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "rounded-md p-1.5 transition-colors border",
                    btnSize,
                    "flex items-center justify-center",
                    (localConfig.filterManager || localConfig.filterStatus)
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                  )}
                >
                  <Filter className={iconSize} />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p className="text-xs">Filter this chart</p></TooltipContent>
          </Tooltip>
          <PopoverContent className="w-56 p-3 space-y-3" align="start">
            {managers.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Manager</Label>
                <Select
                  value={localConfig.filterManager || '__all__'}
                  onValueChange={(v) => onChange({ ...localConfig, filterManager: v === '__all__' ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Managers</SelectItem>
                    {managers.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {statuses.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={localConfig.filterStatus || '__all__'}
                  onValueChange={(v) => onChange({ ...localConfig, filterStatus: v === '__all__' ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Statuses</SelectItem>
                    {statuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(localConfig.filterManager || localConfig.filterStatus) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => onChange({ ...localConfig, filterManager: undefined, filterStatus: undefined })}
              >
                Clear Filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
