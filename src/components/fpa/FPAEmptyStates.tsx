import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Database, FileSpreadsheet, BarChart3, Sparkles, Zap,
  Upload, Plus, Settings, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  module: 'data' | 'sheets' | 'dashboards' | 'ai' | 'automations' | 'scenarios' | 'collaborate';
  onAction?: () => void;
}

const EMPTY_STATES: Record<string, {
  icon: React.ElementType;
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: React.ElementType;
}> = {
  data: {
    icon: Database,
    emoji: '🔌',
    title: 'Connect your first data source',
    description: 'Link QuickBooks, Stripe, or upload a spreadsheet to pull financial data into your workspace.',
    actionLabel: 'Add Source',
    actionIcon: Plus,
  },
  sheets: {
    icon: FileSpreadsheet,
    emoji: '📊',
    title: 'Create your first workbook',
    description: 'Build P&L models, forecasts, and budgets with our Excel-compatible spreadsheet engine.',
    actionLabel: 'New Workbook',
    actionIcon: Plus,
  },
  dashboards: {
    icon: BarChart3,
    emoji: '📈',
    title: 'Build your first dashboard',
    description: 'Drag and drop KPIs, charts, and tables to create real-time financial dashboards.',
    actionLabel: 'Create Dashboard',
    actionIcon: Plus,
  },
  ai: {
    icon: Sparkles,
    emoji: '🤖',
    title: 'AI is ready to analyze',
    description: 'Connect a data source first, then ask AI to summarize trends, flag anomalies, or generate forecasts.',
    actionLabel: 'Connect Data',
    actionIcon: ArrowRight,
  },
  automations: {
    icon: Zap,
    emoji: '⚡',
    title: 'Set up your first automation',
    description: 'Schedule reports, set variance alerts, or auto-sync data on a recurring cadence.',
    actionLabel: 'New Automation',
    actionIcon: Plus,
  },
  scenarios: {
    icon: Settings,
    emoji: '🎯',
    title: 'No scenarios created yet',
    description: 'Model base, bull, and bear cases to stress-test your financial plan.',
    actionLabel: 'Create Scenario',
    actionIcon: Plus,
  },
  collaborate: {
    icon: Database,
    emoji: '💬',
    title: 'No comments or reviews yet',
    description: 'Start a conversation by clicking the comment icon on any P&L row or variance.',
    actionLabel: 'Go to P&L',
    actionIcon: ArrowRight,
  },
};

export function FPAEmptyState({ module, onAction }: EmptyStateProps) {
  const state = EMPTY_STATES[module];
  if (!state) return null;
  const ActionIcon = state.actionIcon;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center">
        <span className="text-4xl mb-4">{state.emoji}</span>
        <h3 className="text-sm font-semibold mb-1">{state.title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-6">{state.description}</p>
        <Button size="sm" className="gap-1.5" onClick={onAction}>
          <ActionIcon className="h-3.5 w-3.5" />
          {state.actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
