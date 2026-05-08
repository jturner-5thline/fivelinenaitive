import { useState } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { formatDealType } from '@/utils/dealTypeLabels';

interface Deal {
  id: string;
  company: string;
  stage?: string;
  status?: string;
  deal_type?: string;
  value?: number;
  updated_at?: string;
}

interface Props {
  deal: Deal;
  milestones?: Array<{ completed: boolean }>;
  onNavigate?: () => void;
}

const stageColors: Record<string, string> = {
  'active': 'rgb(34, 197, 94)',
  'due diligence': 'rgb(245, 158, 11)',
  'term sheet': 'rgb(59, 130, 246)', 
  'closed won': 'rgb(34, 197, 94)',
  'closed lost': 'rgb(239, 68, 68)',
  'funded': 'rgb(34, 197, 94)',
  'pipeline': 'rgb(156, 163, 175)',
};

export function CopilotDealCard({ deal, milestones = [], onNavigate }: Props) {
  const completionPercent = milestones.length > 0 
    ? Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100)
    : 0;

  const handleDealClick = () => {
    const newPath = `/deals/${deal.id}`;
    window.history.pushState({}, '', newPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onNavigate?.();
  };

  const stageColor = stageColors[deal.stage?.toLowerCase() || ''] || 'rgb(156, 163, 175)';
  const lastActivity = deal.updated_at ? formatDistanceToNow(new Date(deal.updated_at), { addSuffix: true }) : 'Unknown';

  return (
    <div
      style={{
        background: 'var(--glass-surface)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '12px 14px',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={handleDealClick}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--foreground)',
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationColor: 'transparent',
            transition: 'text-decoration-color 150ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = 'hsl(var(--primary))')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'transparent')}
        >
          {deal.company}
        </button>
        {deal.stage && (
          <div
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              color: 'white',
              background: stageColor,
            }}
          >
            {deal.stage}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {deal.deal_type && (
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            {formatDealType(deal.deal_type)}
          </span>
        )}
        {deal.value && (
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--foreground)' }}>
            ${deal.value.toLocaleString()}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Calendar size={10} />
          {lastActivity}
        </span>
        {milestones.length > 0 && (
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            {completionPercent}% complete
          </span>
        )}
      </div>

      {milestones.length > 0 && (
        <div
          style={{
            width: '100%',
            height: 3,
            background: 'rgba(156, 163, 175, 0.2)',
            borderRadius: 2,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${completionPercent}%`,
              height: '100%',
              background: 'hsl(var(--primary))',
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}
    </div>
  );
}