import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, AreaChart, GripVertical, CalendarIcon, RotateCcw, LayoutGrid, Grid2X2, Grid3X3, Save, FolderOpen, TrendingUp, TrendingDown, ArrowUpDown, AlertTriangle, Clock, Download, FileText, Filter, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCharts, ChartType, ChartConfig } from '@/contexts/ChartsContext';
import { useAnalyticsWidgets, WidgetConfig, WidgetDataSource, WIDGET_DATA_SOURCES, LayoutPreset } from '@/contexts/AnalyticsWidgetsContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDealsContext } from '@/contexts/DealsContext';
import { Deal } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
import { SortableStatWidget } from '@/components/analytics/SortableStatWidget';
import { FlagsHurdlesAnalytics } from '@/components/insights/FlagsHurdlesAnalytics';
import { SortableListWidget } from '@/components/analytics/SortableListWidget';
import { ChartInlineToolbar, ChartLocalConfig } from '@/components/analytics/ChartInlineToolbar';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  LineChart as RechartsLineChart, 
  Line, 
  PieChart as RechartsPieChart, 
  Pie, 
  AreaChart as RechartsAreaChart, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

// Consistent 6-color palette used across ALL charts
const CHART_COLORS = [
  '#9333ea', // purple
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
];

// Strip numeric IDs from stage names (e.g. "Introductions 1772027306597" → "Introductions")
const cleanStageName = (name: string): string => {
  return name.replace(/\s+\d{10,}$/g, '').trim();
};

// Calculate hours data from deals
const getHoursData = (deals: Deal[]) => {
  const totalPreSigning = deals.reduce((sum, deal) => sum + (deal.preSigningHours ?? 0), 0);
  const totalPostSigning = deals.reduce((sum, deal) => sum + (deal.postSigningHours ?? 0), 0);
  const totalHours = totalPreSigning + totalPostSigning;
  const totalFees = deals.reduce((sum, deal) => sum + (deal.totalFee || 0), 0);
  const totalRetainer = deals.reduce((sum, deal) => sum + (deal.retainerFee ?? 0), 0);
  const totalMilestone = deals.reduce((sum, deal) => sum + (deal.milestoneFee ?? 0), 0);
  const avgSuccessFee = deals.filter(d => d.successFeePercent != null).length > 0
    ? deals.reduce((sum, deal) => sum + (deal.successFeePercent ?? 0), 0) / deals.filter(d => d.successFeePercent != null).length
    : 0;
  const revenuePerHour = totalHours > 0 ? totalFees / totalHours : 0;
  
  const dealsWithHours = deals.filter(d => (d.preSigningHours ?? 0) + (d.postSigningHours ?? 0) > 0);
  const dealsWithHoursCount = dealsWithHours.length;
  const avgHoursPerDeal = dealsWithHoursCount > 0 ? totalHours / dealsWithHoursCount : 0;
  
  const hoursByManager: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  deals.forEach(deal => {
    if (!hoursByManager[deal.manager]) {
      hoursByManager[deal.manager] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByManager[deal.manager].preSigning += deal.preSigningHours ?? 0;
    hoursByManager[deal.manager].postSigning += deal.postSigningHours ?? 0;
    hoursByManager[deal.manager].fees += deal.totalFee || 0;
  });
  
  const hoursByStage: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  deals.forEach(deal => {
    if (!hoursByStage[deal.stage]) {
      hoursByStage[deal.stage] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByStage[deal.stage].preSigning += deal.preSigningHours ?? 0;
    hoursByStage[deal.stage].postSigning += deal.postSigningHours ?? 0;
    hoursByStage[deal.stage].fees += deal.totalFee || 0;
  });
  
  return {
    totalPreSigning, totalPostSigning, totalHours, totalFees, totalRetainer, totalMilestone, avgSuccessFee, revenuePerHour,
    dealsWithHoursCount, avgHoursPerDeal,
    byManager: Object.entries(hoursByManager).map(([name, data]) => ({
      name, preSigning: data.preSigning, postSigning: data.postSigning, total: data.preSigning + data.postSigning,
      fees: data.fees, revenuePerHour: (data.preSigning + data.postSigning) > 0 ? data.fees / (data.preSigning + data.postSigning) : 0,
    })),
    byStage: Object.entries(hoursByStage).map(([name, data]) => ({
      name, preSigning: data.preSigning, postSigning: data.postSigning, total: data.preSigning + data.postSigning,
      fees: data.fees, revenuePerHour: (data.preSigning + data.postSigning) > 0 ? data.fees / (data.preSigning + data.postSigning) : 0,
    })),
  };
};

const getChartData = (dataSource: string, allDeals: Deal[], dateRange?: DateRange, stageLabels?: Record<string, string>, globalFilters?: { manager?: string; status?: string }, localConfig?: ChartLocalConfig) => {
  let filteredDeals = dateRange?.from && dateRange?.to 
    ? allDeals.filter(deal => {
        const dealDate = new Date(deal.createdAt);
        return isWithinInterval(dealDate, { start: dateRange.from!, end: dateRange.to! });
      })
    : allDeals;

  // Apply global filters
  if (globalFilters?.manager) {
    filteredDeals = filteredDeals.filter(d => d.manager === globalFilters.manager);
  }
  if (globalFilters?.status) {
    filteredDeals = filteredDeals.filter(d => d.status === globalFilters.status);
  }

  // Apply per-widget filters
  if (localConfig?.filterManager) {
    filteredDeals = filteredDeals.filter(d => d.manager === localConfig.filterManager);
  }
  if (localConfig?.filterStatus) {
    filteredDeals = filteredDeals.filter(d => d.status === localConfig.filterStatus);
  }

  const resolveStage = (stageId: string) => cleanStageName(stageLabels?.[stageId] || stageId);

  switch (dataSource) {
    case 'deals-by-stage': {
      const stageCounts: Record<string, number> = {};
      // Initialize ALL configured stages so they all appear even if count is 0
      if (stageLabels) {
        Object.entries(stageLabels).forEach(([id, label]) => {
          const cleaned = cleanStageName(label);
          stageCounts[cleaned] = 0;
        });
      }
      filteredDeals.forEach(deal => {
        const label = resolveStage(deal.stage);
        stageCounts[label] = (stageCounts[label] || 0) + 1;
      });
      // Return in the order defined by stageLabels when available
      if (stageLabels) {
        const orderedLabels = Object.values(stageLabels).map(cleanStageName);
        const seen = new Set<string>();
        const result: { name: string; value: number }[] = [];
        orderedLabels.forEach(label => {
          if (!seen.has(label)) {
            seen.add(label);
            result.push({ name: label, value: stageCounts[label] || 0 });
          }
        });
        // Add any remaining that weren't in config
        Object.entries(stageCounts).forEach(([name, value]) => {
          if (!seen.has(name)) result.push({ name, value });
        });
        return result;
      }
      return Object.entries(stageCounts).map(([name, value]) => ({ name, value }));
    }
    
    case 'monthly-value':
      return [
        { name: 'Jan', value: 12500000 },
        { name: 'Feb', value: 15000000 },
        { name: 'Mar', value: 18000000 },
        { name: 'Apr', value: 22000000 },
        { name: 'May', value: 19500000 },
        { name: 'Jun', value: 25000000 },
      ];
    
    case 'deals-by-status': {
      const statusCounts: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        statusCounts[deal.status] = (statusCounts[deal.status] || 0) + 1;
      });
      return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    }
    
    case 'lender-activity': {
      const activityCounts: Record<string, number> = { Active: 0, 'On Deck': 0, Passed: 0, 'On Hold': 0 };
      filteredDeals.forEach(deal => {
        deal.lenders?.forEach(lender => {
          if (lender.trackingStatus === 'active') activityCounts['Active']++;
          else if (lender.trackingStatus === 'on-deck') activityCounts['On Deck']++;
          else if (lender.trackingStatus === 'passed') activityCounts['Passed']++;
          else if (lender.trackingStatus === 'on-hold') activityCounts['On Hold']++;
        });
      });
      return Object.entries(activityCounts).map(([name, value]) => ({ name, value }));
    }
    
    case 'deal-value-distribution': {
      const valueBuckets: Record<string, number> = { '$0-5MM': 0, '$5-10MM': 0, '$10-20MM': 0, '$20MM+': 0 };
      filteredDeals.forEach(deal => {
        if (deal.value < 5000000) valueBuckets['$0-5MM']++;
        else if (deal.value < 10000000) valueBuckets['$5-10MM']++;
        else if (deal.value < 20000000) valueBuckets['$10-20MM']++;
        else valueBuckets['$20MM+']++;
      });
      return Object.entries(valueBuckets).map(([name, value]) => ({ name, value }));
    }
    
    case 'lender-pass-reasons': {
      const passReasonCounts: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        deal.lenders?.forEach(lender => {
          if (lender.trackingStatus === 'passed' && lender.passReason) {
            lender.passReason.split(', ').forEach(reason => {
              const trimmed = reason.trim();
              if (trimmed) passReasonCounts[trimmed] = (passReasonCounts[trimmed] || 0) + 1;
            });
          }
        });
      });
      let passEntries = Object.keys(passReasonCounts).length === 0
        ? [
            { name: 'Deal size too small', value: 5 },
            { name: 'Industry mismatch', value: 8 },
            { name: 'Risk profile', value: 4 },
            { name: 'Timing issues', value: 3 },
            { name: 'Terms not competitive', value: 6 },
            { name: 'Geographic constraints', value: 2 },
            { name: 'Leverage too high', value: 3 },
            { name: 'Sponsor concerns', value: 1 },
            { name: 'Regulatory issues', value: 1 },
            { name: 'Collateral shortfall', value: 2 },
            { name: 'Credit quality', value: 4 },
            { name: 'Market conditions', value: 1 },
          ]
        : Object.entries(passReasonCounts).map(([name, value]) => ({ name, value }));
      passEntries.sort((a, b) => b.value - a.value);
      const totalPassCount = passEntries.reduce((s, e) => s + e.value, 0);
      const threshold = totalPassCount * 0.05;
      const topReasons: typeof passEntries = [];
      let otherCount = 0;
      passEntries.forEach((entry, i) => {
        if (i < 8 && entry.value >= threshold && entry.name !== 'Other') {
          topReasons.push(entry);
        } else {
          otherCount += entry.value;
        }
      });
      // Single merged "Other" bucket
      if (otherCount > 0) topReasons.push({ name: 'Other', value: otherCount });
      return topReasons;
    }
    
    case 'hours-by-manager': {
      const hoursData = getHoursData(allDeals);
      return hoursData.byManager.map(m => ({ name: m.name, value: m.total }));
    }
    
    case 'hours-by-stage': {
      const hoursDataByStage = getHoursData(allDeals);
      return hoursDataByStage.byStage.map(s => ({ name: cleanStageName(s.name), value: s.total }));
    }
    
    case 'fee-breakdown': {
      const totalRetainer = filteredDeals.reduce((sum, deal) => sum + (deal.retainerFee ?? 0), 0);
      const totalMilestone = filteredDeals.reduce((sum, deal) => sum + (deal.milestoneFee ?? 0), 0);
      const totalSuccessFee = filteredDeals.reduce((sum, deal) => {
        if (deal.successFeePercent && deal.value) {
          return sum + (deal.value * deal.successFeePercent / 100);
        }
        return sum;
      }, 0);
      return [
        { name: 'Retainer', value: totalRetainer },
        { name: 'Milestone', value: totalMilestone },
        { name: 'Success Fee', value: totalSuccessFee },
      ].filter(item => item.value > 0);
    }
    
    case 'revenue-per-hour':
      return [{ name: 'Revenue/Hour', value: Math.round(getHoursData(filteredDeals).revenuePerHour) }];
    
    case 'avg-hours-per-deal': {
      const dealsWithHours = filteredDeals.filter(d => (d.preSigningHours ?? 0) + (d.postSigningHours ?? 0) > 0);
      const avgPreSigning = dealsWithHours.length > 0
        ? dealsWithHours.reduce((sum, d) => sum + (d.preSigningHours ?? 0), 0) / dealsWithHours.length
        : 0;
      const avgPostSigning = dealsWithHours.length > 0
        ? dealsWithHours.reduce((sum, d) => sum + (d.postSigningHours ?? 0), 0) / dealsWithHours.length
        : 0;
      return [
        { name: 'Pre-Signing', value: Math.round(avgPreSigning * 10) / 10 },
        { name: 'Post-Signing', value: Math.round(avgPostSigning * 10) / 10 },
        { name: 'Total', value: Math.round((avgPreSigning + avgPostSigning) * 10) / 10 },
      ];
    }
    
    case 'revenue-per-hour-by-manager': {
      const managerRevenueData = getHoursData(filteredDeals);
      return managerRevenueData.byManager
        .filter(m => m.total > 0)
        .map(m => ({ name: m.name, value: Math.round(m.revenuePerHour) }));
    }
    
    case 'deals-by-referral-source': {
      const referralCounts: Record<string, { count: number; value: number }> = {};
      filteredDeals.forEach(deal => {
        const sourceName = deal.referredBy?.name || 'Direct / No Referral';
        if (!referralCounts[sourceName]) {
          referralCounts[sourceName] = { count: 0, value: 0 };
        }
        referralCounts[sourceName].count++;
        referralCounts[sourceName].value += deal.value || 0;
      });
      return Object.entries(referralCounts)
        .map(([name, data]) => ({ name, value: data.count, dealValue: data.value }))
        .sort((a, b) => b.value - a.value);
    }
    
    case 'deal-value-by-referral-source': {
      const referralValues: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        const sourceName = deal.referredBy?.name || 'Direct / No Referral';
        referralValues[sourceName] = (referralValues[sourceName] || 0) + (deal.value || 0);
      });
      return Object.entries(referralValues)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }

    case 'conversion-funnel': {
      const stageOrder = stageLabels ? Object.entries(stageLabels) : [];
      if (stageOrder.length === 0) {
        return [
          { name: 'Sourcing', value: filteredDeals.length, fill: CHART_COLORS[0] },
          { name: 'Screening', value: Math.round(filteredDeals.length * 0.7), fill: CHART_COLORS[1] },
          { name: 'Due Diligence', value: Math.round(filteredDeals.length * 0.45), fill: CHART_COLORS[2] },
          { name: 'Terms Issued', value: Math.round(filteredDeals.length * 0.25), fill: CHART_COLORS[3] },
          { name: 'Closing', value: Math.round(filteredDeals.length * 0.15), fill: CHART_COLORS[4] },
          { name: 'Funded', value: Math.round(filteredDeals.length * 0.08), fill: CHART_COLORS[5] },
        ];
      }
      const stageDealCounts: Record<string, number> = {};
      filteredDeals.forEach(d => {
        const label = resolveStage(d.stage);
        stageDealCounts[label] = (stageDealCounts[label] || 0) + 1;
      });
      let cumulative = filteredDeals.length;
      return stageOrder.map(([_id, label], i) => {
        const cleaned = cleanStageName(label);
        const count = stageDealCounts[cleaned] || 0;
        const result = { name: cleaned, value: cumulative, fill: CHART_COLORS[i % CHART_COLORS.length] };
        cumulative -= count;
        return result;
      });
    }

    case 'deal-velocity': {
      const stageDays: Record<string, number[]> = {};
      filteredDeals.forEach(d => {
        const label = resolveStage(d.stage);
        const days = differenceInDays(new Date(d.updatedAt), new Date(d.createdAt));
        if (!stageDays[label]) stageDays[label] = [];
        stageDays[label].push(Math.max(days, 1));
      });
      const result = Object.entries(stageDays).map(([name, days]) => ({
        name,
        value: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
      }));
      result.sort((a, b) => b.value - a.value);
      return result;
    }

    case 'lender-leaderboard': {
      const lenderStats: Record<string, { reviewed: number; funded: number; passed: number; totalResponseDays: number; responseCount: number }> = {};
      filteredDeals.forEach(deal => {
        deal.lenders?.forEach(lender => {
          if (!lenderStats[lender.name]) {
            lenderStats[lender.name] = { reviewed: 0, funded: 0, passed: 0, totalResponseDays: 0, responseCount: 0 };
          }
          lenderStats[lender.name].reviewed++;
          if (lender.trackingStatus === 'passed') lenderStats[lender.name].passed++;
          if (lender.stage && ['closed-funded', 'term-sheets'].includes(lender.stage)) lenderStats[lender.name].funded++;
          if (lender.updatedAt) {
            const respDays = differenceInDays(new Date(lender.updatedAt), new Date(deal.createdAt));
            if (respDays > 0) {
              lenderStats[lender.name].totalResponseDays += respDays;
              lenderStats[lender.name].responseCount++;
            }
          }
        });
      });
      return Object.entries(lenderStats)
        .map(([name, stats]) => ({
          name,
          reviewed: stats.reviewed,
          funded: stats.funded,
          passRate: stats.reviewed > 0 ? Math.round((stats.passed / stats.reviewed) * 100) : 0,
          avgResponseDays: stats.responseCount > 0 ? Math.round(stats.totalResponseDays / stats.responseCount) : 0,
          value: stats.reviewed,
        }))
        .sort((a, b) => b.reviewed - a.reviewed)
        .slice(0, 15);
    }

    case 'stale-deal-alerts': {
      const now = new Date();
      return filteredDeals
        .filter(d => d.status !== 'archived')
        .map(d => ({
          name: d.company || d.name,
          dealId: d.id,
          dealName: d.name,
          stage: resolveStage(d.stage),
          daysInStage: differenceInDays(now, new Date(d.updatedAt)),
          lastActivity: d.updatedAt,
          value: d.value,
        }))
        .filter(d => d.daysInStage >= 30)
        .sort((a, b) => b.daysInStage - a.daysInStage)
        .slice(0, 20);
    }
    
    default: {
      let result = [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
        { name: 'C', value: 15 },
        { name: 'D', value: 25 },
      ];
      return result;
    }
  }
};

// Post-process chart data with sort/limit from local config
const applyLocalConfig = (data: any[], localConfig?: ChartLocalConfig) => {
  if (!localConfig || !data || data.length === 0) return data;
  let result = [...data];
  if (localConfig.sortOrder === 'desc') {
    result.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  } else if (localConfig.sortOrder === 'asc') {
    result.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  }
  if (localConfig.limit && localConfig.limit > 0) {
    result = result.slice(0, localConfig.limit);
  }
  return result;
};

// Get deals matching a specific chart segment
const getDealsForSegment = (dataSource: string, segmentName: string, allDeals: Deal[], dateRange?: DateRange, stageLabels?: Record<string, string>): Deal[] => {
  const filteredDeals = dateRange?.from && dateRange?.to 
    ? allDeals.filter(deal => {
        const dealDate = new Date(deal.createdAt);
        return isWithinInterval(dealDate, { start: dateRange.from!, end: dateRange.to! });
      })
    : allDeals;

  const resolveStage = (stageId: string) => cleanStageName(stageLabels?.[stageId] || stageId);

  switch (dataSource) {
    case 'deals-by-stage':
      return filteredDeals.filter(d => resolveStage(d.stage) === segmentName);
    case 'deals-by-status':
      return filteredDeals.filter(d => d.status === segmentName);
    case 'lender-activity':
      return filteredDeals.filter(d => d.lenders?.some(l => {
        const statusMap: Record<string, string> = { active: 'Active', 'on-deck': 'On Deck', passed: 'Passed', 'on-hold': 'On Hold' };
        return statusMap[l.trackingStatus] === segmentName;
      }));
    case 'deal-value-distribution': {
      return filteredDeals.filter(deal => {
        if (segmentName === '$0-5MM') return deal.value < 5000000;
        if (segmentName === '$5-10MM') return deal.value >= 5000000 && deal.value < 10000000;
        if (segmentName === '$10-20MM') return deal.value >= 10000000 && deal.value < 20000000;
        if (segmentName === '$20MM+') return deal.value >= 20000000;
        return false;
      });
    }
    default:
      return [];
  }
};

const DATA_SOURCES = [
  { id: 'deals-by-stage', label: 'Deals by Stage' },
  { id: 'monthly-value', label: 'Monthly Deal Value' },
  { id: 'deals-by-status', label: 'Deals by Status' },
  { id: 'lender-activity', label: 'Funding Source Activity' },
  { id: 'deal-value-distribution', label: 'Deal Value Distribution' },
  { id: 'lender-pass-reasons', label: 'Lender Pass Reasons' },
  { id: 'conversion-funnel', label: 'Conversion Funnel' },
  { id: 'deal-velocity', label: 'Deal Velocity' },
  { id: 'lender-leaderboard', label: 'Lender Leaderboard' },
  { id: 'stale-deal-alerts', label: 'Stale Deal Alerts' },
  { id: 'hours-by-manager', label: 'Hours by Manager' },
  { id: 'hours-by-stage', label: 'Hours by Stage' },
  { id: 'fee-breakdown', label: 'Fee Breakdown' },
  { id: 'revenue-per-hour', label: 'Revenue per Hour ($/hr)' },
  { id: 'avg-hours-per-deal', label: 'Avg Hours per Deal' },
  { id: 'revenue-per-hour-by-manager', label: 'Revenue/Hour by Manager' },
  { id: 'deals-by-referral-source', label: 'Deals by Referral Source' },
  { id: 'deal-value-by-referral-source', label: 'Deal Value by Referral Source' },
];

const fmtCurrency = (v: number) => { const abs = Math.abs(v); const s = v < 0 ? '-' : ''; if (abs >= 1e9) return `${s}$${(abs/1e9).toFixed(1)}B`; if (abs >= 1e6) return `${s}$${(abs/1e6).toFixed(1)}MM`; if (abs >= 1e3) return `${s}$${(abs/1e3).toFixed(1)}K`; return `${s}$${abs.toFixed(0)}`; };

const ChartTypeIcon = ({ type }: { type: ChartType }) => {
  switch (type) {
    case 'bar': return <BarChart3 className="h-4 w-4" />;
    case 'line': return <LineChart className="h-4 w-4" />;
    case 'pie': return <PieChart className="h-4 w-4" />;
    case 'area': return <AreaChart className="h-4 w-4" />;
  }
};

// Clickable chart data sources
const CLICKABLE_SOURCES = new Set(['deals-by-stage', 'deals-by-status', 'lender-activity', 'deal-value-distribution']);

function ChartRenderer({ chart, deals, dateRange, compact = false, stageLabels, onSegmentClick, globalFilters, localConfig }: { chart: ChartConfig; deals: Deal[]; dateRange?: DateRange; compact?: boolean; stageLabels?: Record<string, string>; onSegmentClick?: (segmentName: string) => void; globalFilters?: { manager?: string; status?: string }; localConfig?: ChartLocalConfig }) {
  const rawData = getChartData(chart.dataSource, deals, dateRange, stageLabels, globalFilters, localConfig);
  const data = applyLocalConfig(rawData, localConfig);
  const effectiveType = localConfig?.chartType || chart.type;
  const effectiveColor = localConfig?.primaryColor || chart.color || CHART_COLORS[0];
  const fillOpacity = (localConfig?.opacity ?? 100) / 100;
  const chartHeight = compact ? 180 : 250;
  const isClickable = CLICKABLE_SOURCES.has(chart.dataSource);
  const navigate = useNavigate();

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground))',
  };

  const handleBarClick = (data: any) => {
    if (isClickable && onSegmentClick && data?.name) {
      onSegmentClick(data.name);
    }
  };

  // Force horizontal bar chart for pass reasons
  if (chart.dataSource === 'lender-pass-reasons') {
    const total = (data as any[]).reduce((s: number, d: any) => s + d.value, 0);
    const barHeight = Math.max(chartHeight, data.length * 32 + 40);
    return (
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
          <YAxis dataKey="name" type="category" width={compact ? 100 : 140} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: any) => [`${value} (${total > 0 ? ((Number(value) / total) * 100).toFixed(0) : 0}%)`, 'Count']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_: any, index: number) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Conversion Funnel
  if (chart.dataSource === 'conversion-funnel') {
    const funnelData = data as any[];
    return (
      <div className="space-y-2">
        {funnelData.map((stage: any, i: number) => {
          const maxVal = funnelData[0]?.value || 1;
          const pct = maxVal > 0 ? (stage.value / maxVal) * 100 : 0;
          const dropOff = i > 0 ? (((funnelData[i - 1].value - stage.value) / funnelData[i - 1].value) * 100) : 0;
          return (
            <div key={stage.name} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24 truncate text-right">{stage.name}</span>
              <div className="flex-1 h-7 rounded bg-muted/30 relative overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: stage.fill }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground">
                  {stage.value} deals
                </span>
              </div>
              {i > 0 && (
                <span className="text-[10px] text-destructive whitespace-nowrap w-12">
                  −{dropOff.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Deal Velocity — horizontal bar
  if (chart.dataSource === 'deal-velocity') {
    const barHeight = Math.max(chartHeight, data.length * 32 + 40);
    return (
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} label={{ value: 'Avg Days', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
          <YAxis dataKey="name" type="category" width={compact ? 100 : 140} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [`${value} days`, 'Avg Duration']} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_: any, index: number) => (
              <Cell key={index} fill={Number((data[index] as any).value) > 30 ? '#ef4444' : Number((data[index] as any).value) > 14 ? '#f59e0b' : '#10b981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Lender Leaderboard — table
  if (chart.dataSource === 'lender-leaderboard') {
    const rows = data as any[];
    return (
      <ScrollArea className={cn("border rounded-md", compact ? "h-[180px]" : "h-[300px]")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Lender</TableHead>
              <TableHead className="text-xs text-right">Reviewed</TableHead>
              <TableHead className="text-xs text-right">Funded</TableHead>
              <TableHead className="text-xs text-right">Avg Resp (d)</TableHead>
              <TableHead className="text-xs text-right">Pass %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No lender data</TableCell></TableRow>
            ) : rows.map((row: any) => (
              <TableRow key={row.name} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium text-xs truncate max-w-[120px]">{row.name}</TableCell>
                <TableCell className="text-right text-xs">{row.reviewed}</TableCell>
                <TableCell className="text-right text-xs">{row.funded}</TableCell>
                <TableCell className="text-right text-xs">{row.avgResponseDays || '—'}</TableCell>
                <TableCell className="text-right text-xs">
                  <Badge variant={row.passRate > 60 ? 'destructive' : 'secondary'} className="text-[10px]">{row.passRate}%</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    );
  }

  // Stale Deal Alerts — list
  if (chart.dataSource === 'stale-deal-alerts') {
    const staleDeals = data as any[];
    return (
      <ScrollArea className={cn("border rounded-md", compact ? "h-[180px]" : "h-[300px]")}>
        {staleDeals.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">No stale deals 🎉</div>
        ) : (
          <div className="divide-y divide-border">
            {staleDeals.map((deal: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/deals/${deal.dealId}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{deal.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{deal.stage}</Badge>
                    <span className="text-[10px] text-muted-foreground">{fmtCurrency(deal.value)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-xs font-semibold text-destructive">{deal.daysInStage}d</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    );
  }
  
  switch (effectiveType) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} className={isClickable ? 'cursor-pointer' : ''} onClick={handleBarClick}>
              {data.map((_: any, index: number) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="value" stroke={effectiveColor} strokeWidth={1} dot={{ fill: effectiveColor }} />
          </RechartsLineChart>
        </ResponsiveContainer>
      );
    
    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={compact ? 30 : 40}
              outerRadius={compact ? 60 : 80}
              paddingAngle={2}
              dataKey="value"
              label={compact ? undefined : ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
              className={isClickable ? 'cursor-pointer' : ''}
              onClick={(entry: any) => {
                if (isClickable && onSegmentClick && entry?.name) onSegmentClick(entry.name);
              }}
            >
              {data.map((_: any, index: number) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </RechartsPieChart>
        </ResponsiveContainer>
      );
    
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsAreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="value" stroke={effectiveColor} fill={effectiveColor} fillOpacity={0.3 * fillOpacity} />
          </RechartsAreaChart>
        </ResponsiveContainer>
      );
  }
}

// Sortable Chart Card Component
function SortableChartCard({ 
  chart,
  deals,
  dateRange, 
  onEdit, 
  onDelete,
  compact = false,
  stageLabels,
  onSegmentClick,
  globalFilters,
  managers,
  statuses,
}: { 
  chart: ChartConfig;
  deals: Deal[];
  dateRange?: DateRange;
  onEdit: (chart: ChartConfig) => void;
  onDelete: (chartId: string) => void;
  compact?: boolean;
  stageLabels?: Record<string, string>;
  onSegmentClick?: (chartDataSource: string, segmentName: string) => void;
  globalFilters?: { manager?: string; status?: string };
  managers?: string[];
  statuses?: string[];
}) {
  const [localConfig, setLocalConfig] = useState<ChartLocalConfig>({
    chartType: chart.type,
    primaryColor: chart.color,
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chart.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const activeFilterCount = [localConfig.filterManager, localConfig.filterStatus, localConfig.sortOrder && localConfig.sortOrder !== 'default' ? true : null, localConfig.limit].filter(Boolean).length;

  return (
    <Card ref={setNodeRef} style={style} className={cn("group transition-all duration-300", isDragging && "shadow-lg ring-2 ring-primary/20")}>
      <CardHeader className={cn(
        "flex flex-col space-y-0 pb-2",
        compact && "py-3"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none opacity-0 group-hover:opacity-100 transition-opacity"
              {...attributes}
              {...listeners}
            >
              <GripVertical className={cn("h-4 w-4", compact && "h-3 w-3")} />
            </button>
            <CardTitle className={cn("text-lg", compact && "text-base")}>{chart.title}</CardTitle>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-8 w-8", compact && "h-6 w-6")}
              onClick={() => onEdit(chart)}
            >
              <Pencil className={cn("h-4 w-4", compact && "h-3 w-3")} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-8 w-8 text-destructive hover:text-destructive", compact && "h-6 w-6")}
              onClick={() => onDelete(chart.id)}
            >
              <Trash2 className={cn("h-4 w-4", compact && "h-3 w-3")} />
            </Button>
          </div>
        </div>
        {/* Inline toolbar */}
        <div className="pt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <ChartInlineToolbar
            chartType={chart.type}
            dataSource={chart.dataSource}
            localConfig={localConfig}
            onChange={setLocalConfig}
            managers={managers}
            statuses={statuses}
            compact={compact}
          />
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0 pb-3" : undefined}>
        <ChartRenderer
          chart={chart}
          deals={deals}
          dateRange={dateRange}
          compact={compact}
          stageLabels={stageLabels}
          onSegmentClick={onSegmentClick ? (segmentName) => onSegmentClick(chart.dataSource, segmentName) : undefined}
          globalFilters={globalFilters}
          localConfig={localConfig}
        />
      </CardContent>
    </Card>
  );
}

// CSV export helper
function exportCSV(deals: Deal[], stageLabels: Record<string, string>) {
  const resolveStage = (stageId: string) => cleanStageName(stageLabels[stageId] || stageId);
  const header = ['Company', 'Deal Name', 'Stage', 'Status', 'Value', 'Manager', 'Created At'].join(',');
  const rows = deals.map(d =>
    [d.company || '', d.name, resolveStage(d.stage), d.status, d.value, d.manager, d.createdAt].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const { charts, addChart, updateChart, deleteChart, reorderCharts } = useCharts();
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets, resetToDefaults, presets, savePreset, loadPreset, deletePreset } = useAnalyticsWidgets();
  const { deals } = useDealsContext();
  const { stages } = useDealStages();
  const navigate = useNavigate();

  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    stages.forEach(s => { map[s.id] = s.label; });
    return map;
  }, [stages]);

  // Global filters
  const [globalManager, setGlobalManager] = useState<string | undefined>();
  const [globalStatus, setGlobalStatus] = useState<string | undefined>();
  const globalFilters = useMemo(() => ({ manager: globalManager, status: globalStatus }), [globalManager, globalStatus]);

  // Extract unique managers and statuses for filter dropdowns
  const uniqueManagers = useMemo(() => [...new Set(deals.map(d => d.manager).filter(Boolean))].sort(), [deals]);
  const uniqueStatuses = useMemo(() => [...new Set(deals.map(d => d.status).filter(Boolean))].sort(), [deals]);
  const hasGlobalFilters = !!globalManager || !!globalStatus;

  // Chart dialogs
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [deleteChartDialogOpen, setDeleteChartDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null);
  
  // Widget dialogs
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [deleteWidgetDialogOpen, setDeleteWidgetDialogOpen] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);

  // Preset dialogs
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [deletePresetDialogOpen, setDeletePresetDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [datePreset, setDatePreset] = useState<string>('all');
  const [layoutMode, setLayoutMode] = useState<'compact' | 'expanded'>(() => {
    const saved = localStorage.getItem('analytics-layout-mode');
    return (saved === 'compact' || saved === 'expanded') ? saved : 'expanded';
  });

  // Segment drill-down drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDeals, setDrawerDeals] = useState<Deal[]>([]);

  useEffect(() => {
    localStorage.setItem('analytics-layout-mode', layoutMode);
  }, [layoutMode]);
  
  const [chartFormData, setChartFormData] = useState({
    title: '',
    type: 'bar' as ChartType,
    dataSource: 'deals-by-stage',
    color: '#9333ea',
  });

  const [widgetFormData, setWidgetFormData] = useState({
    title: '',
    dataSource: 'total-fees' as WidgetDataSource,
    size: 'small' as 'small' | 'medium' | 'large',
  });

  // Memoize hours data to avoid recalculating on every render
  const hoursData = useMemo(() => getHoursData(deals), [deals]);

  // Separate widgets by type
  const statWidgets = widgets.filter(w => w.type === 'stat');
  const listWidgets = widgets.filter(w => w.type === 'list');

  const isAllTime = datePreset === 'all';

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    switch (preset) {
      case 'last7':
        setDateRange({ from: subDays(today, 7), to: today });
        break;
      case 'last30':
        setDateRange({ from: subDays(today, 30), to: today });
        break;
      case 'thisMonth':
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
      case 'last3Months':
        setDateRange({ from: subMonths(today, 3), to: today });
        break;
      case 'all':
      default:
        setDateRange({ from: undefined, to: undefined });
        break;
    }
  };

  const handleSegmentClick = (chartDataSource: string, segmentName: string) => {
    const matchingDeals = getDealsForSegment(chartDataSource, segmentName, deals, dateRange, stageLabels);
    if (matchingDeals.length > 0) {
      setDrawerTitle(`${segmentName} — ${matchingDeals.length} deal${matchingDeals.length !== 1 ? 's' : ''}`);
      setDrawerDeals(matchingDeals);
      setDrawerOpen(true);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Chart drag handling
  const handleChartDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = charts.findIndex(c => c.id === active.id);
      const newIndex = charts.findIndex(c => c.id === over.id);
      reorderCharts(arrayMove(charts, oldIndex, newIndex));
    }
  };

  // Widget drag handling
  const handleWidgetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  // Chart form handlers
  const resetChartForm = () => {
    setChartFormData({
      title: '',
      type: 'bar',
      dataSource: 'deals-by-stage',
      color: '#9333ea',
    });
    setEditingChart(null);
  };

  const handleOpenChartDialog = (chart?: ChartConfig) => {
    if (chart) {
      setEditingChart(chart);
      setChartFormData({
        title: chart.title,
        type: chart.type,
        dataSource: chart.dataSource,
        color: chart.color,
      });
    } else {
      resetChartForm();
    }
    setChartDialogOpen(true);
  };

  const handleSaveChart = () => {
    if (!chartFormData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a chart title', variant: 'destructive' });
      return;
    }

    if (editingChart) {
      updateChart(editingChart.id, chartFormData);
      toast({ title: 'Chart updated', description: `"${chartFormData.title}" has been updated.` });
    } else {
      addChart(chartFormData);
      toast({ title: 'Chart added', description: `"${chartFormData.title}" has been created.` });
    }
    
    setChartDialogOpen(false);
    resetChartForm();
  };

  const handleDeleteChart = () => {
    if (chartToDelete) {
      const chart = charts.find(c => c.id === chartToDelete);
      deleteChart(chartToDelete);
      toast({ title: 'Chart deleted', description: `"${chart?.title}" has been removed.` });
      setChartToDelete(null);
      setDeleteChartDialogOpen(false);
    }
  };

  const confirmDeleteChart = (chartId: string) => {
    setChartToDelete(chartId);
    setDeleteChartDialogOpen(true);
  };

  // Widget form handlers
  const resetWidgetForm = () => {
    setWidgetFormData({
      title: '',
      dataSource: 'total-fees',
      size: 'small',
    });
    setEditingWidget(null);
  };

  const handleOpenWidgetDialog = (widget?: WidgetConfig) => {
    if (widget) {
      setEditingWidget(widget);
      setWidgetFormData({
        title: widget.title,
        dataSource: widget.dataSource,
        size: widget.size,
      });
    } else {
      resetWidgetForm();
    }
    setWidgetDialogOpen(true);
  };

  const handleSaveWidget = () => {
    if (!widgetFormData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a widget title', variant: 'destructive' });
      return;
    }

    const widgetType = WIDGET_DATA_SOURCES.find(s => s.id === widgetFormData.dataSource)?.type || 'stat';

    if (editingWidget) {
      updateWidget(editingWidget.id, { ...widgetFormData, type: widgetType });
      toast({ title: 'Widget updated', description: `"${widgetFormData.title}" has been updated.` });
    } else {
      addWidget({ ...widgetFormData, type: widgetType });
      toast({ title: 'Widget added', description: `"${widgetFormData.title}" has been created.` });
    }
    
    setWidgetDialogOpen(false);
    resetWidgetForm();
  };

  const handleDeleteWidget = () => {
    if (widgetToDelete) {
      const widget = widgets.find(w => w.id === widgetToDelete);
      deleteWidget(widgetToDelete);
      toast({ title: 'Widget deleted', description: `"${widget?.title}" has been removed.` });
      setWidgetToDelete(null);
      setDeleteWidgetDialogOpen(false);
    }
  };

  const confirmDeleteWidget = (widgetId: string) => {
    setWidgetToDelete(widgetId);
    setDeleteWidgetDialogOpen(true);
  };

  const handleResetWidgets = () => {
    resetToDefaults();
    toast({ title: 'Widgets reset', description: 'All widgets have been reset to defaults.' });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast({ title: 'Error', description: 'Please enter a preset name', variant: 'destructive' });
      return;
    }
    savePreset(presetName.trim(), charts, layoutMode);
    toast({ title: 'Preset saved', description: `"${presetName}" has been saved.` });
    setPresetName('');
    setSavePresetDialogOpen(false);
  };

  const handleLoadPreset = (presetId: string) => {
    const result = loadPreset(presetId);
    if (result) {
      reorderCharts(result.charts);
      setLayoutMode(result.layoutMode);
      const preset = presets.find(p => p.id === presetId);
      toast({ title: 'Preset loaded', description: `"${preset?.name}" has been loaded.` });
    }
  };

  const handleDeletePreset = () => {
    if (presetToDelete) {
      const preset = presets.find(p => p.id === presetToDelete);
      deletePreset(presetToDelete);
      toast({ title: 'Preset deleted', description: `"${preset?.name}" has been removed.` });
      setPresetToDelete(null);
      setDeletePresetDialogOpen(false);
    }
  };

  const confirmDeletePreset = (presetId: string) => {
    setPresetToDelete(presetId);
    setDeletePresetDialogOpen(true);
  };

  const handleExportCSV = () => {
    exportCSV(deals, stageLabels);
    toast({ title: 'Export complete', description: 'CSV file has been downloaded.' });
  };

  return (
    <>
      <Helmet>
        <title>Analytics | nAltive</title>
        <meta name="description" content="View and manage analytics charts for your deals pipeline" />
      </Helmet>
      
      <div className="bg-transparent">
        
        <main className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">Analytics</h1>
              <p className="text-muted-foreground mt-1">
                View insights and manage your custom widgets and charts. Drag to reorder.
              </p>
            </div>
          </div>

          <Tabs defaultValue="custom" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="custom" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Custom Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="custom">
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <Select value={datePreset} onValueChange={handleDatePreset}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="last3Months">Last 3 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              
              {datePreset === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick dates</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}

              {/* Global Filters */}
              <Select value={globalManager || '__all__'} onValueChange={(v) => setGlobalManager(v === '__all__' ? undefined : v)}>
                <SelectTrigger className="w-[150px]">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Manager" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Managers</SelectItem>
                  {uniqueManagers.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={globalStatus || '__all__'} onValueChange={(v) => setGlobalStatus(v === '__all__' ? undefined : v)}>
                <SelectTrigger className="w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasGlobalFilters && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setGlobalManager(undefined); setGlobalStatus(undefined); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Clear all filters</p></TooltipContent>
                </UITooltip>
              )}

              <div className="ml-auto flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportCSV}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

          {/* Widgets Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Widgets</h2>
                <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
                  <Button
                    variant={layoutMode === 'compact' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => setLayoutMode('compact')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Compact</span>
                  </Button>
                  <Button
                    variant={layoutMode === 'expanded' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => setLayoutMode('expanded')}
                  >
                    <Grid2X2 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Expanded</span>
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Presets Dropdown */}
                <DropdownMenu>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label="Presets"
                          className="h-9 w-9 p-0"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Presets</TooltipContent>
                  </UITooltip>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setSavePresetDialogOpen(true)}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Current as Preset
                    </DropdownMenuItem>
                    {presets.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          Saved Presets
                        </div>
                        {presets.map((preset) => (
                          <DropdownMenuItem
                            key={preset.id}
                            className="flex items-center justify-between group"
                          >
                            <span
                              className="flex-1 cursor-pointer"
                              onClick={() => handleLoadPreset(preset.id)}
                            >
                              {preset.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeletePreset(preset.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={handleResetWidgets} className="gap-1">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button variant="gradient" size="sm" onClick={() => handleOpenWidgetDialog()} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Widget
                </Button>
              </div>
            </div>

            {widgets.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">No widgets yet</h3>
                    <p className="text-muted-foreground mt-1">
                      Add widgets to display key metrics
                    </p>
                  </div>
                  <Button variant="gradient" onClick={() => handleOpenWidgetDialog()} className="gap-2 mt-2">
                    <Plus className="h-4 w-4" />
                    Add Widget
                  </Button>
                </div>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWidgetDragEnd}
              >
                <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                  {/* Stat Widgets Grid */}
                  {statWidgets.length > 0 && (
                    <div className={cn(
                      "grid gap-4 mb-6 transition-all duration-300",
                      layoutMode === 'compact' 
                        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
                    )}>
                      {statWidgets.map(widget => (
                        <SortableStatWidget
                          key={widget.id}
                          widget={widget}
                          hoursData={hoursData}
                          onEdit={handleOpenWidgetDialog}
                          onDelete={confirmDeleteWidget}
                          compact={layoutMode === 'compact'}
                          hideDeltas={isAllTime}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* List Widgets Grid */}
                  {listWidgets.length > 0 && (
                    <div className={cn(
                      "grid gap-6 transition-all duration-300",
                      layoutMode === 'compact' 
                        ? "grid-cols-1 lg:grid-cols-3"
                        : "grid-cols-1 lg:grid-cols-2"
                    )}>
                      {listWidgets.map(widget => (
                        <SortableListWidget
                          key={widget.id}
                          widget={widget}
                          hoursData={hoursData}
                          onEdit={handleOpenWidgetDialog}
                          onDelete={confirmDeleteWidget}
                          compact={layoutMode === 'compact'}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Flags & Hurdles — placed right after KPI cards */}
          <div className="mb-8">
            <FlagsHurdlesAnalytics />
          </div>

          {/* Charts Section — renamed to Pipeline & Performance */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Pipeline & Performance</h2>
            <Button variant="gradient" size="sm" onClick={() => handleOpenChartDialog()} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Chart
            </Button>
          </div>

          {charts.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">No charts yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Add your first chart to start visualizing your data
                  </p>
                </div>
                <Button variant="gradient" onClick={() => handleOpenChartDialog()} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  Add Chart
                </Button>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleChartDragEnd}
            >
              <SortableContext items={charts.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className={cn(
                  "grid gap-6 transition-all duration-300",
                  layoutMode === 'compact' 
                    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2"
                )}>
                  {charts.map(chart => (
                     <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      deals={deals}
                      dateRange={dateRange}
                      onEdit={handleOpenChartDialog}
                      onDelete={confirmDeleteChart}
                      compact={layoutMode === 'compact'}
                      stageLabels={stageLabels}
                      onSegmentClick={handleSegmentClick}
                      globalFilters={globalFilters}
                      managers={uniqueManagers}
                      statuses={uniqueStatuses}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Segment Drill-Down Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{drawerTitle}</SheetTitle>
            <SheetDescription>Click a deal to view details</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="divide-y divide-border">
              {drawerDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between py-3 px-1 hover:bg-muted/50 rounded transition-colors cursor-pointer"
                  onClick={() => { setDrawerOpen(false); navigate(`/deals/${deal.id}`); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{deal.company || deal.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{cleanStageName(stageLabels[deal.stage] || deal.stage)}</Badge>
                      <span className="text-xs text-muted-foreground">{deal.manager}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold ml-3">{fmtCurrency(deal.value)}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Add/Edit Chart Dialog */}
      <Dialog open={chartDialogOpen} onOpenChange={(open) => { if (!open) resetChartForm(); setChartDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingChart ? 'Edit Chart' : 'Add New Chart'}</DialogTitle>
            <DialogDescription>
              {editingChart ? 'Update your chart configuration' : 'Configure your new chart'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="chartTitle">Chart Title</Label>
              <Input
                id="chartTitle"
                value={chartFormData.title}
                onChange={(e) => setChartFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter chart title"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Type</Label>
              <div className="flex gap-2">
                {(['bar', 'line', 'pie', 'area'] as ChartType[]).map(type => (
                  <Button
                    key={type}
                    type="button"
                    variant={chartFormData.type === type ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => setChartFormData(prev => ({ ...prev, type }))}
                  >
                    <ChartTypeIcon type={type} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="chartDataSource">Data Source</Label>
              <Select
                value={chartFormData.dataSource}
                onValueChange={(value) => {
                  const source = DATA_SOURCES.find(s => s.id === value);
                  setChartFormData(prev => ({ 
                    ...prev, 
                    dataSource: value,
                    title: !prev.title || DATA_SOURCES.some(s => s.label === prev.title) 
                      ? (source?.label || prev.title) 
                      : prev.title
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Color</Label>
              <div className="flex gap-2 flex-wrap">
                {CHART_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                      chartFormData.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setChartFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetChartForm(); setChartDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveChart}>
              {editingChart ? 'Save Changes' : 'Add Chart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Widget Dialog */}
      <Dialog open={widgetDialogOpen} onOpenChange={(open) => { if (!open) resetWidgetForm(); setWidgetDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWidget ? 'Edit Widget' : 'Add New Widget'}</DialogTitle>
            <DialogDescription>
              {editingWidget ? 'Update your widget configuration' : 'Configure your new widget'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="widgetTitle">Widget Title</Label>
              <Input
                id="widgetTitle"
                value={widgetFormData.title}
                onChange={(e) => setWidgetFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter widget title"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="widgetDataSource">Data Source</Label>
              <Select
                value={widgetFormData.dataSource}
                onValueChange={(value: WidgetDataSource) => setWidgetFormData(prev => ({ ...prev, dataSource: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {WIDGET_DATA_SOURCES.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Widget Size</Label>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map(size => (
                  <Button
                    key={size}
                    type="button"
                    variant={widgetFormData.size === size ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setWidgetFormData(prev => ({ ...prev, size }))}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetWidgetForm(); setWidgetDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveWidget}>
              {editingWidget ? 'Save Changes' : 'Add Widget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Chart Confirmation Dialog */}
      <AlertDialog open={deleteChartDialogOpen} onOpenChange={setDeleteChartDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chart</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chart? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChart} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Widget Confirmation Dialog */}
      <AlertDialog open={deleteWidgetDialogOpen} onOpenChange={setDeleteWidgetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Widget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this widget? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWidget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Preset Dialog */}
      <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Preset</DialogTitle>
            <DialogDescription>
              Save your current widget and chart configuration as a preset.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="My Custom Layout"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPresetName(''); setSavePresetDialogOpen(false); }}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSavePreset}>
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Preset Confirmation Dialog */}
      <AlertDialog open={deletePresetDialogOpen} onOpenChange={setDeletePresetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this preset? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePreset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
