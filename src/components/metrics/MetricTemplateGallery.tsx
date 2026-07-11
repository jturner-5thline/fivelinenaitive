import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, DollarSign, TrendingUp, BarChart3, Percent, Building2, Zap, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricWidgetConfig, MetricWidgetSize } from '@/contexts/MetricsWidgetsContext';

export interface MetricTemplate {
  id: string;
  name: string;
  description: string;
  category: 'platform' | 'quickbooks' | 'hubspot' | 'cross-source';
  type: 'stat' | 'chart';
  chartType?: string;
  dataSource: string;
  defaultSize: MetricWidgetSize;
  defaultColor: string;
  icon: 'dollar' | 'trending-up' | 'percent' | 'pipeline' | 'chart' | 'users';
}

const METRIC_TEMPLATES: MetricTemplate[] = [
  // Platform
  { id: 'tpl-active-pipeline', name: 'Active Pipeline', description: 'Total value of active deals', category: 'platform', type: 'stat', dataSource: 'active-pipeline', defaultSize: 'small', defaultColor: 'hsl(var(--primary))', icon: 'dollar' },
  { id: 'tpl-compact-kpi', name: 'Compact KPI Tile', description: 'Minimal KPI tile with optional footer label', category: 'platform', type: 'stat', dataSource: 'compact-kpi-tile', defaultSize: 'small', defaultColor: 'hsl(var(--primary))', icon: 'dollar' },
  { id: 'tpl-closed-won', name: 'Closed Won', description: 'All-time closed deal value', category: 'platform', type: 'stat', dataSource: 'closed-won', defaultSize: 'small', defaultColor: 'hsl(var(--success))', icon: 'trending-up' },
  { id: 'tpl-total-fees', name: 'Total Fees', description: 'Fees earned across all deals', category: 'platform', type: 'stat', dataSource: 'total-fees', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'dollar' },
  { id: 'tpl-avg-deal', name: 'Average Deal Size', description: 'Mean deal value', category: 'platform', type: 'stat', dataSource: 'avg-deal-size', defaultSize: 'small', defaultColor: 'hsl(var(--chart-4))', icon: 'dollar' },
  { id: 'tpl-closed-12m', name: 'Closed Value (12M)', description: 'Rolling 12-month closed value chart', category: 'platform', type: 'chart', chartType: 'composed', dataSource: 'closed-value-12m', defaultSize: 'large', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-pipeline-stage', name: 'Pipeline by Stage', description: 'Deal distribution by stage', category: 'platform', type: 'chart', chartType: 'bar', dataSource: 'pipeline-by-stage', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-deal-activity', name: 'Deal Activity (12M)', description: 'Monthly deal count activity', category: 'platform', type: 'chart', chartType: 'bar', dataSource: 'deal-activity-12m', defaultSize: 'full', defaultColor: 'hsl(var(--chart-3))', icon: 'chart' },
  { id: 'tpl-conversion', name: 'Conversion Funnel', description: 'Stage-by-stage conversion rates', category: 'platform', type: 'chart', chartType: 'funnel', dataSource: 'conversion-funnel', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-manager-perf', name: 'Manager Performance', description: 'Closed value by manager', category: 'platform', type: 'chart', chartType: 'bar', dataSource: 'manager-performance', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },

  // QuickBooks
  { id: 'tpl-qb-revenue', name: 'Total Revenue', description: 'Sum of all invoice totals', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-revenue', defaultSize: 'small', defaultColor: 'hsl(var(--chart-3))', icon: 'dollar' },
  { id: 'tpl-qb-ar', name: 'Accounts Receivable', description: 'Outstanding invoice balances', category: 'quickbooks', type: 'stat', dataSource: 'qb-accounts-receivable', defaultSize: 'small', defaultColor: 'hsl(var(--chart-4))', icon: 'dollar' },
  { id: 'tpl-qb-payments', name: 'Total Payments', description: 'All payments received', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-payments', defaultSize: 'small', defaultColor: 'hsl(var(--primary))', icon: 'dollar' },
  { id: 'tpl-qb-expenses', name: 'Total Expenses', description: 'All expenses and purchases', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-expenses', defaultSize: 'small', defaultColor: 'hsl(var(--destructive))', icon: 'dollar' },
  { id: 'tpl-qb-net', name: 'Net Income', description: 'Revenue minus expenses', category: 'quickbooks', type: 'stat', dataSource: 'qb-net-income', defaultSize: 'small', defaultColor: 'hsl(var(--success))', icon: 'trending-up' },
  { id: 'tpl-qb-ap', name: 'Accounts Payable', description: 'Outstanding bills', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-ap', defaultSize: 'small', defaultColor: 'hsl(var(--chart-4))', icon: 'dollar' },
  { id: 'tpl-qb-collection', name: 'Collection Rate', description: 'Percentage of invoiced amount collected', category: 'quickbooks', type: 'stat', dataSource: 'qb-collection-rate', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'percent' },
  { id: 'tpl-qb-overdue', name: 'Overdue Amount', description: 'Past-due invoice balances', category: 'quickbooks', type: 'stat', dataSource: 'qb-overdue-amount', defaultSize: 'small', defaultColor: 'hsl(var(--destructive))', icon: 'trending-up' },
  { id: 'tpl-qb-rev-trend', name: 'Revenue Trend (12M)', description: 'Monthly revenue over 12 months', category: 'quickbooks', type: 'chart', chartType: 'bar', dataSource: 'qb-revenue-trend', defaultSize: 'large', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-qb-ar-aging', name: 'AR Aging', description: 'Receivables by aging bucket', category: 'quickbooks', type: 'chart', chartType: 'bar', dataSource: 'qb-ar-aging', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-qb-ap-aging', name: 'AP Aging', description: 'Payables by aging bucket', category: 'quickbooks', type: 'chart', chartType: 'bar', dataSource: 'qb-ap-aging', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-qb-rev-vs-exp', name: 'Revenue vs Expenses', description: 'Monthly revenue, expenses and payments', category: 'quickbooks', type: 'chart', chartType: 'composed', dataSource: 'qb-revenue-vs-expenses', defaultSize: 'large', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-qb-exp-cat', name: 'Expenses by Category', description: 'Top expense categories', category: 'quickbooks', type: 'chart', chartType: 'bar', dataSource: 'qb-expense-by-category', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-qb-revenue-detail', name: 'Total Revenue Detail', description: 'KPI detail card with Debt & FinServ breakdown', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-revenue-detail', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'dollar' },
  { id: 'tpl-qb-revenue-compact', name: 'Total Revenue – Compact', description: 'Compact KPI with "Debt + FinServ Revenue" footer', category: 'quickbooks', type: 'stat', dataSource: 'qb-total-revenue-compact', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'dollar' },

  // HubSpot
  { id: 'tpl-hs-deals', name: 'Total Deals', description: 'All HubSpot-synced deals', category: 'hubspot', type: 'stat', dataSource: 'hs-total-deals', defaultSize: 'small', defaultColor: 'hsl(var(--chart-4))', icon: 'pipeline' },
  { id: 'tpl-hs-value', name: 'Total Deal Value', description: 'Sum of all HubSpot deal values', category: 'hubspot', type: 'stat', dataSource: 'hs-total-deal-value', defaultSize: 'small', defaultColor: 'hsl(var(--primary))', icon: 'dollar' },
  { id: 'tpl-hs-won', name: 'Deals Won', description: 'Closed-won count and value', category: 'hubspot', type: 'stat', dataSource: 'hs-deals-won', defaultSize: 'small', defaultColor: 'hsl(var(--success))', icon: 'trending-up' },
  { id: 'tpl-hs-winrate', name: 'Win Rate', description: 'Won / (Won + Lost)', category: 'hubspot', type: 'stat', dataSource: 'hs-win-rate', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'percent' },
  { id: 'tpl-hs-avg', name: 'Avg Deal Size', description: 'Average HubSpot deal value', category: 'hubspot', type: 'stat', dataSource: 'hs-avg-deal-size', defaultSize: 'small', defaultColor: 'hsl(var(--chart-3))', icon: 'dollar' },
  { id: 'tpl-hs-pipeline', name: 'Pipeline by Stage', description: 'HubSpot deals by stage', category: 'hubspot', type: 'chart', chartType: 'bar', dataSource: 'hs-pipeline-by-stage', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-hs-trend', name: 'Deal Value Trend', description: 'Rolling 12-month deal creation', category: 'hubspot', type: 'chart', chartType: 'composed', dataSource: 'hs-deal-value-trend', defaultSize: 'large', defaultColor: 'hsl(var(--primary))', icon: 'chart' },
  { id: 'tpl-hs-owners', name: 'Deals by Owner', description: 'Deal value by manager', category: 'hubspot', type: 'chart', chartType: 'bar', dataSource: 'hs-deals-by-owner', defaultSize: 'medium', defaultColor: 'hsl(var(--primary))', icon: 'chart' },

  // Cross-source
  { id: 'tpl-xs-rev-deal', name: 'Revenue per Deal', description: 'QB Revenue ÷ HubSpot Deals Won', category: 'cross-source', type: 'stat', dataSource: 'xs-revenue-per-deal', defaultSize: 'small', defaultColor: 'hsl(var(--chart-5))', icon: 'dollar' },
  { id: 'tpl-xs-ar-deal', name: 'AR per Active Deal', description: 'QB AR ÷ Active Deals', category: 'cross-source', type: 'stat', dataSource: 'xs-ar-per-active-deal', defaultSize: 'small', defaultColor: 'hsl(var(--chart-4))', icon: 'dollar' },
  { id: 'tpl-xs-collect', name: 'Collection Rate', description: 'Collected vs invoiced across sources', category: 'cross-source', type: 'stat', dataSource: 'xs-collection-rate-by-entity', defaultSize: 'small', defaultColor: 'hsl(var(--chart-2))', icon: 'percent' },
  { id: 'tpl-finserv-utilization', name: 'Utilization', description: 'Blended utilization plus Scott, Siddhi, and Kris', category: 'quickbooks', type: 'stat', dataSource: 'finserv-utilization', defaultSize: 'medium', defaultColor: 'hsl(var(--chart-4))', icon: 'users' },
];

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  platform: { label: 'Platform', icon: <Building2 className="h-4 w-4" />, color: 'text-primary' },
  quickbooks: { label: 'QuickBooks', icon: <DollarSign className="h-4 w-4" />, color: 'text-chart-3' },
  hubspot: { label: 'HubSpot', icon: <TrendingUp className="h-4 w-4" />, color: 'text-chart-4' },
  'cross-source': { label: 'Cross-Source', icon: <Zap className="h-4 w-4" />, color: 'text-chart-5' },
};

interface MetricTemplateGalleryProps {
  onSelect: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => void;
  existingDataSources?: string[];
}

export function MetricTemplateGallery({ onSelect, existingDataSources = [] }: MetricTemplateGalleryProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = METRIC_TEMPLATES.filter(t => {
    if (selectedCategory && t.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }
    return true;
  });

  const categories = ['platform', 'quickbooks', 'hubspot', 'cross-source'];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Badge
          variant={selectedCategory === null ? 'default' : 'outline'}
          className="cursor-pointer text-xs"
          onClick={() => setSelectedCategory(null)}
        >
          All
        </Badge>
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer text-xs gap-1"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              {meta.icon}
              {meta.label}
            </Badge>
          );
        })}
      </div>

      <ScrollArea className="h-[320px]">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((template) => {
            const isAdded = existingDataSources.includes(template.dataSource);
            const meta = CATEGORY_META[template.category];
            return (
              <button
                key={template.id}
                className={cn(
                  'text-left p-3 rounded-lg border transition-colors',
                  'hover:bg-accent hover:border-primary/50',
                  isAdded && 'opacity-50 bg-muted'
                )}
                onClick={() => {
                  onSelect({
                    title: template.name,
                    type: template.type,
                    chartType: template.chartType as any,
                    dataSource: template.dataSource,
                    size: template.defaultSize,
                    color: template.defaultColor,
                  });
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-medium leading-tight">{template.name}</span>
                  <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 shrink-0', meta.color)}>
                    {template.type === 'stat' ? 'KPI' : 'Chart'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  {meta.icon}
                  <span className="text-[10px] text-muted-foreground">{meta.label}</span>
                  {isAdded && <span className="text-[10px] text-muted-foreground ml-auto">Added</span>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
              No templates match your search
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
