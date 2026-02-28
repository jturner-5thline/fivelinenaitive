import { useState } from 'react';
import { FileSpreadsheet, AlertTriangle, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DetectedStatement, DetectedLineItem, DataIssue, StatementType, FinancialMetric } from './types';
import { CitationBadge } from './audit/CitationBadge';
import { buildTraceForValue } from './audit/auditUtils';
import { SourceTraceData } from './audit/SourceTracePanel';

interface ExtractionViewProps {
  statements: DetectedStatement[];
  metrics: FinancialMetric[];
  issues: DataIssue[];
  auditMode: boolean;
  files?: { id: string; name: string }[];
  onTraceClick?: (trace: SourceTraceData) => void;
  className?: string;
}

const STATEMENT_LABELS: Record<StatementType, string> = {
  income_statement: 'Income Statement (P&L)',
  balance_sheet: 'Balance Sheet',
  cash_flow: 'Cash Flow Statement',
  debt_schedule: 'Debt Schedule',
  working_capital: 'Working Capital',
  revenue_detail: 'Revenue Detail',
  unknown: 'Other',
};

const STATEMENT_COLORS: Record<StatementType, string> = {
  income_statement: 'text-emerald-400',
  balance_sheet: 'text-blue-400',
  cash_flow: 'text-purple-400',
  debt_schedule: 'text-amber-400',
  working_capital: 'text-cyan-400',
  revenue_detail: 'text-pink-400',
  unknown: 'text-muted-foreground',
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 0.9 ? 'bg-emerald-500/20 text-emerald-400' :
    confidence >= 0.7 ? 'bg-amber-500/20 text-amber-400' :
    'bg-red-500/20 text-red-400';
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-mono", color)}>
      {Math.round(confidence * 100)}%
    </span>
  );
}

function StatementTable({ statement, auditMode, files, onTraceClick }: {
  statement: DetectedStatement;
  auditMode: boolean;
  files?: { id: string; name: string }[];
  onTraceClick?: (trace: SourceTraceData) => void;
}) {
  const periods = statement.lineItems[0]?.values.map(v => v.period) || [];

  const handleValueClick = (lineItemIdx: number, valueIdx: number) => {
    if (!auditMode || !onTraceClick) return;
    const trace = buildTraceForValue(statement, lineItemIdx, valueIdx, files || []);
    if (trace) onTraceClick(trace);
  };

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", STATEMENT_COLORS[statement.type])}>
            {STATEMENT_LABELS[statement.type]}
          </span>
          <ConfidenceBadge confidence={statement.confidence} />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileSpreadsheet className="h-3 w-3" />
          <span>{statement.sheetName}</span>
          <span>• Rows {statement.rowRange[0]}–{statement.rowRange[1]}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/20">
              <th className="text-left px-4 py-2 text-muted-foreground font-medium sticky left-0 bg-background min-w-[200px]">
                Line Item
              </th>
              <th className="text-left px-2 py-2 text-muted-foreground font-medium w-[120px]">
                Mapped To
              </th>
              {periods.map(p => (
                <th key={p} className="text-right px-3 py-2 text-muted-foreground font-medium min-w-[100px]">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statement.lineItems.map((item, idx) => (
              <tr
                key={idx}
                className={cn(
                  "border-b border-border/10 hover:bg-muted/20 transition-colors",
                  item.standardKey === 'revenue' || item.standardKey === 'ebitda' || item.standardKey === 'net_income'
                    ? "font-semibold"
                    : ""
                )}
              >
                <td className="px-4 py-1.5 sticky left-0 bg-background">
                  <div className="flex items-center gap-1.5">
                    <span>{item.label}</span>
                    {auditMode && item.confidence < 0.8 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Low confidence mapping ({Math.round(item.confidence * 100)}%)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] h-5 font-mono">
                      {item.standardKey}
                    </Badge>
                    {item.isCustomMapping && (
                      <Edit2 className="h-2.5 w-2.5 text-primary cursor-pointer" />
                    )}
                  </div>
                </td>
                {item.values.map((val, vi) => (
                  <td key={vi} className="text-right px-3 py-1.5 font-mono tabular-nums">
                    <div className="flex items-center justify-end gap-1">
                      {auditMode && val.sourceCell && (
                        <CitationBadge
                          source={{
                            fileId: '',
                            fileName: statement.sheetName,
                            sheetName: statement.sheetName,
                            cellAddress: val.sourceCell,
                          }}
                          confidence={item.confidence}
                          onClick={() => handleValueClick(idx, vi)}
                        />
                      )}
                      <button
                        onClick={() => handleValueClick(idx, vi)}
                        className={cn(
                          auditMode && "cursor-pointer hover:text-primary hover:underline decoration-dotted decoration-primary/40 transition-colors",
                          val.value !== null && val.value < 0 && "text-red-400"
                        )}
                      >
                        {val.formatted || '—'}
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataIssuesPanel({ issues }: { issues: DataIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-400">Data Issues ({issues.length})</span>
      </div>
      <div className="space-y-2">
        {issues.map(issue => (
          <div key={issue.id} className="flex items-start gap-2 text-xs">
            <span className={cn(
              "mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0",
              issue.severity === 'error' ? "bg-red-400" :
              issue.severity === 'warning' ? "bg-amber-400" : "bg-blue-400"
            )} />
            <div>
              <p className="font-medium">{issue.title}</p>
              <p className="text-muted-foreground">{issue.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsOverview({ metrics }: { metrics: FinancialMetric[] }) {
  if (metrics.length === 0) return null;

  const grouped = {
    leverage: metrics.filter(m => m.key.includes('leverage') || m.key.includes('debt')),
    coverage: metrics.filter(m => m.key.includes('coverage') || m.key.includes('dscr')),
    growth: metrics.filter(m => m.key.includes('growth') || m.key.includes('cagr')),
    margins: metrics.filter(m => m.key.includes('margin')),
    other: metrics.filter(m =>
      !m.key.includes('leverage') && !m.key.includes('debt') &&
      !m.key.includes('coverage') && !m.key.includes('dscr') &&
      !m.key.includes('growth') && !m.key.includes('cagr') &&
      !m.key.includes('margin')
    ),
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped)
        .filter(([, items]) => items.length > 0)
        .map(([group, items]) => (
          <div key={group}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {group.replace('_', ' ')}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map(metric => (
                <div key={metric.key} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground truncate">{metric.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-semibold font-mono">{metric.formatted}</span>
                    {metric.trend && (
                      <span className={cn(
                        "text-[10px]",
                        metric.trend === 'up' ? "text-emerald-400" :
                        metric.trend === 'down' ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                        {metric.trendPct != null && ` ${metric.trendPct > 0 ? '+' : ''}${metric.trendPct}%`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export function ExtractionView({ statements, metrics, issues, auditMode, files, onTraceClick, className }: ExtractionViewProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          {statements.map(s => (
            <TabsTrigger key={s.type + s.sheetName} value={s.type + s.sheetName} className="text-xs">
              <span className={STATEMENT_COLORS[s.type]}>
                {s.type === 'income_statement' ? 'P&L' :
                 s.type === 'balance_sheet' ? 'BS' :
                 s.type === 'cash_flow' ? 'CF' :
                 s.type === 'debt_schedule' ? 'Debt' :
                 STATEMENT_LABELS[s.type]}
              </span>
            </TabsTrigger>
          ))}
          {issues.length > 0 && (
            <TabsTrigger value="issues" className="text-xs">
              <span className="flex items-center gap-1">
                Issues
                <Badge variant="destructive" className="text-[10px] h-4 px-1">{issues.length}</Badge>
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <MetricsOverview metrics={metrics} />
          {statements.length > 0 && (
            <div className="mt-6 space-y-4">
              {statements.map((s, i) => (
                <StatementTable key={i} statement={s} auditMode={auditMode} files={files} onTraceClick={onTraceClick} />
              ))}
            </div>
          )}
          {statements.length === 0 && metrics.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No financial data extracted yet</p>
              <p className="text-xs mt-1">Upload VDR files to begin automated extraction</p>
            </div>
          )}
        </TabsContent>

        {statements.map(s => (
          <TabsContent key={s.type + s.sheetName} value={s.type + s.sheetName} className="mt-4">
            <StatementTable statement={s} auditMode={auditMode} files={files} onTraceClick={onTraceClick} />
          </TabsContent>
        ))}

        <TabsContent value="issues" className="mt-4">
          <DataIssuesPanel issues={issues} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
