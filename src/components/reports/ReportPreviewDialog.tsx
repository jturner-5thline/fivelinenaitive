import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  Clock,
  Play,
  Loader2,
  BarChart3,
  Hash,
  FileText,
  Table as TableIcon,
} from 'lucide-react';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import {
  type ReportDefinition,
  type ReportWidget,
  METRIC_OPTIONS,
  DIMENSION_OPTIONS,
  CHART_TYPES,
} from '@/hooks/useReportDefinitions';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ScheduleReportDialog } from './ScheduleReportDialog';
import { DealStatus, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ReportAISummaryBlock } from './ReportAISummaryBlock';

interface ReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ReportDefinition;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(262, 83%, 58%)',
  'hsl(199, 89%, 48%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(326, 78%, 55%)',
  'hsl(271, 91%, 65%)',
];

export function ReportPreviewDialog({ open, onOpenChange, report }: ReportPreviewDialogProps) {
  const { deals } = useDealsContext();
  const { formatCurrencyValue } = usePreferences();
  const [showSchedule, setShowSchedule] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const widgets = useMemo(() => {
    return (report.report_widgets || []).sort((a, b) => a.position - b.position);
  }, [report]);

  const computeMetric = (metricId: string): number => {
    switch (metricId) {
      case 'deal_count':
        return deals.length;
      case 'deal_value':
        return deals.reduce((sum, d) => sum + (d.value || 0), 0);
      case 'avg_deal_value':
        return deals.length ? deals.reduce((sum, d) => sum + (d.value || 0), 0) / deals.length : 0;
      case 'lender_count':
        return deals.reduce((sum, d) => sum + (d.lenders?.length || 0), 0);
      case 'active_lenders':
        return deals.reduce((sum, d) => sum + (d.lenders?.filter(l => l.trackingStatus === 'active').length || 0), 0);
      case 'passed_lenders':
        return deals.reduce((sum, d) => sum + (d.lenders?.filter(l => l.trackingStatus === 'passed').length || 0), 0);
      case 'total_fees':
        return deals.reduce((sum, d) => sum + (d.totalFee || 0), 0);
      case 'retainer_fees':
        return deals.reduce((sum, d) => sum + (d.retainerFee || 0), 0);
      case 'success_fees':
        return deals.reduce((sum, d) => sum + ((d.successFeePercent || 0) * (d.value || 0) / 100), 0);
      case 'activity_count':
        return deals.length; // approximate
      default:
        return 0;
    }
  };

  const computeChartData = (widget: ReportWidget) => {
    const dimension = widget.query_config.dimension || 'stage';
    const metric = widget.query_config.metric || 'deal_count';

    const groups: Record<string, number> = {};
    for (const deal of deals) {
      let key: string;
      switch (dimension) {
        case 'stage':
          key = STAGE_CONFIG[deal.stage]?.label || deal.stage;
          break;
        case 'status':
          key = STATUS_CONFIG[deal.status as DealStatus]?.label || deal.status;
          break;
        case 'manager':
          key = deal.manager || 'Unassigned';
          break;
        case 'engagement_type':
          key = ENGAGEMENT_TYPE_CONFIG[deal.engagementType]?.label || deal.engagementType;
          break;
        case 'month':
          key = format(new Date(deal.createdAt), 'MMM yyyy');
          break;
        default:
          key = 'Other';
      }

      if (!groups[key]) groups[key] = 0;
      switch (metric) {
        case 'deal_count':
          groups[key]++;
          break;
        case 'deal_value':
        case 'avg_deal_value':
          groups[key] += deal.value || 0;
          break;
        case 'total_fees':
          groups[key] += deal.totalFee || 0;
          break;
        default:
          groups[key]++;
      }
    }

    return Object.entries(groups).map(([name, value]) => ({ name, value }));
  };

  const formatMetricValue = (metricId: string, value: number): string => {
    const meta = METRIC_OPTIONS.find((m) => m.id === metricId);
    if (!meta) return String(value);
    switch (meta.type) {
      case 'currency':
        return formatCurrencyValue(value);
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'days':
        return `${value.toFixed(0)} days`;
      default:
        return value.toLocaleString();
    }
  };

  const renderWidget = (widget: ReportWidget) => {
    switch (widget.type) {
      case 'kpi': {
        const metric = widget.query_config.metric || 'deal_count';
        const value = computeMetric(metric);
        const meta = METRIC_OPTIONS.find((m) => m.id === metric);
        return (
          <Card className="h-full">
            <CardContent className="pt-6 flex flex-col items-center justify-center h-full">
              <p className="text-3xl font-bold">{formatMetricValue(metric, value)}</p>
              <p className="text-sm text-muted-foreground mt-1">{widget.title || meta?.label}</p>
            </CardContent>
          </Card>
        );
      }

      case 'chart': {
        const data = computeChartData(widget);
        const chartType = widget.visualization_config.chart_type || 'bar';
        const showLegend = widget.visualization_config.show_legend ?? true;

        return (
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{widget.title || 'Chart'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                {chartType === 'pie' ? (
                  <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    {showLegend && <Legend />}
                  </PieChart>
                ) : chartType === 'line' ? (
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {showLegend && <Legend />}
                    <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={1} />
                  </LineChart>
                ) : chartType === 'area' ? (
                  <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {showLegend && <Legend />}
                    <Area type="monotone" dataKey="value" fill={COLORS[0]} fillOpacity={0.2} stroke={COLORS[0]} strokeWidth={1} />
                  </AreaChart>
                ) : (
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {showLegend && <Legend />}
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }

      case 'table': {
        const fields = widget.query_config.fields || ['company', 'stage', 'value'];
        const limit = widget.query_config.limit || 25;
        const sortBy = widget.query_config.sort_by || 'value';
        const sorted = [...deals].sort((a, b) => {
          const av = (a as any)[sortBy] || 0;
          const bv = (b as any)[sortBy] || 0;
          return typeof av === 'number' ? bv - av : String(av).localeCompare(String(bv));
        }).slice(0, limit);

        const getFieldValue = (deal: any, field: string) => {
          switch (field) {
            case 'stage': return STAGE_CONFIG[deal.stage]?.label || deal.stage;
            case 'status': return STATUS_CONFIG[deal.status as DealStatus]?.label || deal.status;
            case 'value': return formatCurrencyValue(deal.value || 0);
            case 'total_fee': return formatCurrencyValue(deal.totalFee || 0);
            case 'lender_count': return deal.lenders?.length || 0;
            case 'created_at': return format(new Date(deal.createdAt), 'MMM d, yyyy');
            default: return deal[field] || '-';
          }
        };

        return (
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{widget.title || 'Data Table'}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields.map((f: string) => (
                        <TableHead key={f} className="text-xs capitalize whitespace-nowrap">
                          {f.replace(/_/g, ' ')}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((deal) => (
                      <TableRow key={deal.id}>
                        {fields.map((f: string) => (
                          <TableCell key={f} className="text-xs whitespace-nowrap">
                            {getFieldValue(deal, f)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      }

      case 'text':
        return (
          <Card className="h-full">
            <CardContent className="pt-6">
              <p className="text-sm whitespace-pre-wrap">{widget.query_config.content || 'No content'}</p>
            </CardContent>
          </Card>
        );

      case 'ai_narrative':
        return (
          <Card className="h-full border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <NaitiveIcon className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-2">{widget.title || 'AI Summary'}</p>
                  <p className="text-xs text-muted-foreground italic">
                    AI narrative will be generated when the report is run. 
                    It will analyze the data and provide insights on key trends and changes.
                  </p>
                  <Badge variant="secondary" className="mt-2 text-[10px] gap-1">
                    <NaitiveIcon className="h-2.5 w-2.5" /> AI Generated
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{report.name}</DialogTitle>
                {report.description && (
                  <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSchedule(true)}>
                  <Clock className="h-3.5 w-3.5" />
                  Schedule
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 p-6">
            <ReportAISummaryBlock report={report} />
            <div className="grid grid-cols-2 gap-4">
              {widgets.map((widget) => (
                <div
                  key={widget.id}
                  className={cn(widget.width >= 2 ? 'col-span-2' : 'col-span-1')}
                >
                  {renderWidget(widget)}
                </div>
              ))}
            </div>

            {widgets.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto opacity-30 mb-2" />
                <p className="text-sm">No widgets configured</p>
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-border px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Preview based on current data • {deals.length} deals</span>
            <span>Generated {format(new Date(), 'MMM d, yyyy h:mm a')}</span>
          </div>
        </DialogContent>
      </Dialog>

      {showSchedule && (
        <ScheduleReportDialog
          open={showSchedule}
          onOpenChange={setShowSchedule}
          report={report}
        />
      )}
    </>
  );
}
