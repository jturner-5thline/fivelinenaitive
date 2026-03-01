import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, Maximize2, AlertTriangle, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLCommentThread, type FPAComment } from '../collaboration/PLCommentThread';
import { InlineAnnotation, type Annotation } from '../collaboration/InlineAnnotation';
import { PLRowQuickActions } from '../PLRowQuickActions';
import { VarianceLegend } from '../VarianceLegend';

interface PLRow {
  account: string;
  level: number;
  actuals: number;
  budget: number;
  forecast: number;
  priorYear: number;
  isHeader: boolean;
  children?: PLRow[];
}

const PL_TREE: PLRow[] = [
  {
    account: 'Revenue', level: 0, actuals: 9500, budget: 9200, forecast: 9600, priorYear: 8100, isHeader: true,
    children: [
      { account: 'Product Revenue', level: 1, actuals: 6800, budget: 6500, forecast: 6900, priorYear: 5600, isHeader: false,
        children: [
          { account: 'SaaS Subscriptions', level: 2, actuals: 4200, budget: 4000, forecast: 4300, priorYear: 3400, isHeader: false },
          { account: 'License Revenue', level: 2, actuals: 1800, budget: 1700, forecast: 1800, priorYear: 1500, isHeader: false },
          { account: 'Usage-Based', level: 2, actuals: 800, budget: 800, forecast: 800, priorYear: 700, isHeader: false },
        ]
      },
      { account: 'Service Revenue', level: 1, actuals: 2700, budget: 2700, forecast: 2700, priorYear: 2500, isHeader: false,
        children: [
          { account: 'Professional Services', level: 2, actuals: 1800, budget: 1800, forecast: 1800, priorYear: 1600, isHeader: false },
          { account: 'Support & Maintenance', level: 2, actuals: 900, budget: 900, forecast: 900, priorYear: 900, isHeader: false },
        ]
      },
    ]
  },
  {
    account: 'Cost of Revenue (COGS)', level: 0, actuals: -2850, budget: -3100, forecast: -2900, priorYear: -2700, isHeader: true,
    children: [
      { account: 'Hosting & Infrastructure', level: 1, actuals: -1200, budget: -1400, forecast: -1250, priorYear: -1100, isHeader: false },
      { account: 'Customer Success', level: 1, actuals: -950, budget: -1000, forecast: -950, priorYear: -900, isHeader: false },
      { account: 'Payment Processing', level: 1, actuals: -700, budget: -700, forecast: -700, priorYear: -700, isHeader: false },
    ]
  },
  { account: 'Gross Profit', level: 0, actuals: 6650, budget: 6100, forecast: 6700, priorYear: 5400, isHeader: true },
  {
    account: 'Operating Expenses', level: 0, actuals: -5450, budget: -5200, forecast: -5500, priorYear: -4800, isHeader: true,
    children: [
      { account: 'Sales & Marketing', level: 1, actuals: -2100, budget: -2000, forecast: -2150, priorYear: -1800, isHeader: false,
        children: [
          { account: 'Headcount', level: 2, actuals: -1200, budget: -1100, forecast: -1200, priorYear: -1000, isHeader: false },
          { account: 'Paid Acquisition', level: 2, actuals: -550, budget: -550, forecast: -600, priorYear: -500, isHeader: false },
          { account: 'Events & Sponsorships', level: 2, actuals: -350, budget: -350, forecast: -350, priorYear: -300, isHeader: false },
        ]
      },
      { account: 'Research & Development', level: 1, actuals: -1800, budget: -1750, forecast: -1800, priorYear: -1600, isHeader: false,
        children: [
          { account: 'Engineering Headcount', level: 2, actuals: -1400, budget: -1350, forecast: -1400, priorYear: -1200, isHeader: false },
          { account: 'Tools & Licenses', level: 2, actuals: -250, budget: -250, forecast: -250, priorYear: -250, isHeader: false },
          { account: 'Contractors', level: 2, actuals: -150, budget: -150, forecast: -150, priorYear: -150, isHeader: false },
        ]
      },
      { account: 'General & Admin', level: 1, actuals: -1550, budget: -1450, forecast: -1550, priorYear: -1400, isHeader: false,
        children: [
          { account: 'Rent & Facilities', level: 2, actuals: -600, budget: -600, forecast: -600, priorYear: -550, isHeader: false },
          { account: 'Legal & Compliance', level: 2, actuals: -400, budget: -350, forecast: -400, priorYear: -350, isHeader: false },
          { account: 'Insurance', level: 2, actuals: -250, budget: -250, forecast: -250, priorYear: -250, isHeader: false },
          { account: 'Other G&A', level: 2, actuals: -300, budget: -250, forecast: -300, priorYear: -250, isHeader: false },
        ]
      },
    ]
  },
  { account: 'EBITDA', level: 0, actuals: 1200, budget: 900, forecast: 1200, priorYear: 600, isHeader: true },
  { account: 'Net Income', level: 0, actuals: 1200, budget: 850, forecast: 1200, priorYear: 500, isHeader: true },
];

const fmt = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}M`;
  return `${v < 0 ? '-' : ''}$${abs}K`;
};

const variancePct = (actual: number, target: number) => {
  if (target === 0) return 0;
  return ((actual - target) / Math.abs(target)) * 100;
};

interface InteractivePLTableProps {
  comparisonMode: 'budget' | 'forecast' | 'prior_year';
}

export function InteractivePLTable({ comparisonMode }: InteractivePLTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set(['Revenue', 'Operating Expenses']));
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Collaboration state (demo data — will be replaced with DB queries)
  const [comments, setComments] = useState<Record<string, FPAComment[]>>({
    'Hosting & Infrastructure': [
      { id: '1', user_name: 'Jill Turner', user_initials: 'JT', content: 'This is running 14% over budget — @Paolo can you check the AWS bill?', mentions: ['Paolo'], is_resolved: false, created_at: '2h ago' },
    ],
    'Legal & Compliance': [
      { id: '2', user_name: 'Franco F.', user_initials: 'FF', content: 'One-time litigation cost. Should normalize next quarter.', mentions: [], is_resolved: true, created_at: '3d ago' },
    ],
  });

  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({
    'Revenue': [
      { id: '1', content: 'Q1 includes $200K one-time license deal', color: 'warning', is_pinned: true, user_initials: 'PP', created_at: '1d ago' },
    ],
  });

  const handleAddComment = useCallback((targetKey: string, content: string, mentions: string[]) => {
    setComments(prev => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), {
        id: Date.now().toString(), user_name: 'You', user_initials: 'ME',
        content, mentions, is_resolved: false, created_at: 'Just now',
      }],
    }));
  }, []);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(c => c.id === commentId ? { ...c, is_resolved: true } : c);
      }
      return updated;
    });
  }, []);

  const handleAddAnnotation = useCallback((targetKey: string, content: string, color: string) => {
    setAnnotations(prev => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), {
        id: Date.now().toString(), content, color: color as Annotation['color'],
        is_pinned: false, user_initials: 'ME', created_at: 'Just now',
      }],
    }));
  }, []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].filter(a => a.id !== id);
      }
      return updated;
    });
  }, []);

  const handleTogglePinAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(a => a.id === id ? { ...a, is_pinned: !a.is_pinned } : a);
      }
      return updated;
    });
  }, []);

  const toggleRow = (account: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(account) ? next.delete(account) : next.add(account);
      return next;
    });
  };

  const getComparisonValue = (row: PLRow) => {
    switch (comparisonMode) {
      case 'budget': return row.budget;
      case 'forecast': return row.forecast;
      case 'prior_year': return row.priorYear;
    }
  };

  const getComparisonLabel = () => {
    switch (comparisonMode) {
      case 'budget': return 'Budget';
      case 'forecast': return 'Forecast';
      case 'prior_year': return 'Prior Year';
    }
  };

  const renderRow = (row: PLRow, depth: number = 0): JSX.Element[] => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = expandedRows.has(row.account);
    const comparison = getComparisonValue(row);
    const variance = row.actuals - comparison;
    const varPct = variancePct(row.actuals, comparison);
    
    // Determine if variance is favorable (positive for revenue, negative for costs)
    const isCostLine = row.actuals < 0;
    const isFavorable = isCostLine ? variance > 0 : variance > 0; // For costs, spending less (more positive) is favorable
    const isSignificant = Math.abs(varPct) > 5;

    const rows: JSX.Element[] = [];

    rows.push(
      <TableRow
        key={row.account}
        className={cn(
          "cursor-pointer hover:bg-muted/50 transition-colors group",
          row.isHeader && "bg-muted/30 font-semibold",
          isSignificant && !row.isHeader && "bg-amber-500/5"
        )}
        onClick={() => hasChildren && toggleRow(row.account)}
        onMouseEnter={() => setHoveredRow(row.account)}
        onMouseLeave={() => setHoveredRow(null)}
      >
        <TableCell className="py-1.5">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className={cn("text-xs", row.isHeader ? "font-semibold" : depth > 1 ? "text-muted-foreground" : "")}>
              {row.account}
            </span>
            {isSignificant && !row.isHeader && (
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            <div className="flex items-center gap-0.5 ml-auto shrink-0" onClick={e => e.stopPropagation()}>
              {!row.isHeader && (
                <PLRowQuickActions
                  rowAccount={row.account}
                  visible={hoveredRow === row.account}
                  onComment={() => {}}
                  onFlag={() => {}}
                  onDrillDown={() => {}}
                  onBookmark={() => {}}
                />
              )}
              <PLCommentThread
                targetKey={row.account}
                targetLabel={row.account}
                comments={comments[row.account] || []}
                onAddComment={handleAddComment}
                onResolve={handleResolveComment}
              />
              <InlineAnnotation
                targetKey={row.account}
                targetLabel={row.account}
                annotations={annotations[row.account] || []}
                onAdd={handleAddAnnotation}
                onDelete={handleDeleteAnnotation}
                onTogglePin={handleTogglePinAnnotation}
              />
            </div>
          </div>
        </TableCell>
        <TableCell className={cn("text-xs text-right font-mono py-1.5", row.isHeader && "font-semibold")}>
          {fmt(row.actuals)}
        </TableCell>
        <TableCell className="text-xs text-right font-mono text-muted-foreground py-1.5">
          {fmt(comparison)}
        </TableCell>
        <TableCell className={cn(
          "text-xs text-right font-mono py-1.5",
          variance === 0 ? '' : isFavorable ? 'text-emerald-600' : 'text-destructive'
        )}>
          {variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${fmt(variance)}`}
        </TableCell>
        <TableCell className={cn(
          "text-xs text-right font-mono py-1.5",
          varPct === 0 ? '' : isFavorable ? 'text-emerald-600' : 'text-destructive'
        )}>
          {varPct === 0 ? '—' : `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%`}
        </TableCell>
        <TableCell className="text-xs text-right font-mono text-muted-foreground py-1.5">
          {fmt(row.priorYear)}
        </TableCell>
      </TableRow>
    );

    if (hasChildren && isExpanded) {
      row.children!.forEach(child => {
        rows.push(...renderRow(child, depth + 1));
      });
    }

    return rows;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Income Statement</CardTitle>
            <Badge variant="outline" className="text-[9px]">Feb 2026 · $K</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[9px] gap-1">
              <Sparkles className="h-2.5 w-2.5" /> 3 variances flagged
            </Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">Account</TableHead>
              <TableHead className="text-[10px] text-right">Actuals</TableHead>
              <TableHead className="text-[10px] text-right">{getComparisonLabel()}</TableHead>
              <TableHead className="text-[10px] text-right">Δ ($K)</TableHead>
              <TableHead className="text-[10px] text-right">Δ (%)</TableHead>
              <TableHead className="text-[10px] text-right">Prior Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PL_TREE.map(row => renderRow(row)).flat()}
          </TableBody>
        </Table>
        <VarianceLegend compact className="mt-3" />
      </CardContent>
    </Card>
  );
}
