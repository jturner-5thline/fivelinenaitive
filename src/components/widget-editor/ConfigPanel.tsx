import { WidgetConfig } from './widgetTypes';
import { AxisConfigSection } from './config-sections/AxisConfigSection';
import { SeriesConfigSection } from './config-sections/SeriesConfigSection';
import { ValuesConfigSection } from './config-sections/ValuesConfigSection';
import { FiltersConfigSection } from './config-sections/FiltersConfigSection';
import { FormulaSection } from './config-sections/FormulaSection';
import { ComparisonConfigSection } from './config-sections/ComparisonConfigSection';
import { TrendLineConfigSection } from './config-sections/TrendLineConfigSection';
import { DisplayConfigSection } from './config-sections/DisplayConfigSection';
import { NegativeStylingConfigSection } from './config-sections/NegativeStylingConfigSection';
import { KPIDetailConfigSection } from './config-sections/KPIDetailConfigSection';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Label } from '@/components/ui/label';

interface Props {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
  realtime: boolean;
  onRealtimeToggle: (v: boolean) => void;
}

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ConfigPanel({ config, onChange, realtime, onRealtimeToggle }: Props) {
  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Widget Configuration</h2>
        <button
          onClick={() => onRealtimeToggle(!realtime)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors',
            realtime ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'
          )}
        >
          <Zap className="h-3 w-3" />
          Live
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          <Section title="X-Axis">
            <AxisConfigSection config={config.xAxis} onChange={(xAxis) => onChange({ ...config, xAxis })} />
          </Section>

          <Section title="Data Series">
            <SeriesConfigSection config={config.series} onChange={(series) => onChange({ ...config, series })} />
          </Section>

          <Section title="Values">
            <ValuesConfigSection configs={config.values} onChange={(values) => onChange({ ...config, values })} realmId={config.entityId} entityId={config.entityId} />
          </Section>

          <Section title="Time Period">
            <FiltersConfigSection config={config} onChange={onChange} />
          </Section>

          <Section title="Comparison" defaultOpen={false}>
            <ComparisonConfigSection config={config.comparison} onChange={(comparison) => onChange({ ...config, comparison })} />
          </Section>

          <Section title="Trend Line" defaultOpen={false}>
            <TrendLineConfigSection config={config.trendLine} onChange={(trendLine) => onChange({ ...config, trendLine })} />
          </Section>

          <Section title="Display" defaultOpen={false}>
            <DisplayConfigSection config={config.dataLabels} onChange={(dataLabels) => onChange({ ...config, dataLabels })} />
          </Section>

          <Section title="Negative Styling" defaultOpen={false}>
            <NegativeStylingConfigSection config={config.negativeStyling} onChange={(negativeStyling) => onChange({ ...config, negativeStyling })} />
          </Section>

          <Section title="Formula" defaultOpen={false}>
            <FormulaSection config={config.formula} onChange={(formula) => onChange({ ...config, formula })} />
          </Section>

          <Section title="KPI Detail Card" defaultOpen={false}>
            <KPIDetailConfigSection config={config.kpiDetailConfig} onChange={(kpiDetailConfig) => onChange({ ...config, kpiDetailConfig })} />
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}
