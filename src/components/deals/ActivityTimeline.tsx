import { useState } from 'react';
import { 
  Clock, 
  UserPlus, 
  FileText, 
  TrendingUp, 
  MessageSquare, 
  CheckCircle,
  ArrowRight,
  Trash2,
  Undo2,
  Edit,
  DollarSign,
  Building2,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivityLog } from '@/hooks/useActivityLog';
import { Json } from '@/integrations/supabase/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ActivityItem {
  id: string;
  type: 'status_change' | 'stage_change' | 'note_added' | 'contact_added' | 'value_updated' | 'comment' | 'created' | 'lender_removed' | 'lender_added' | 'lender_stage_change' | 'deal_updated';
  description: string;
  user: string;
  timestamp: string;
  metadata?: {
    from?: string;
    to?: string;
    value?: string;
    oldValue?: string;
    newValue?: string;
    lenderName?: string;
    lenderData?: any;
    field?: string;
  };
  onUndo?: () => void;
}

interface ActivityTimelineProps {
  activities: ActivityItem[];
}

const activityIcons: Record<string, typeof Clock> = {
  status_change: ArrowRight,
  stage_change: TrendingUp,
  note_added: FileText,
  contact_added: UserPlus,
  value_updated: DollarSign,
  comment: MessageSquare,
  created: CheckCircle,
  lender_removed: Trash2,
  lender_added: Users,
  lender_stage_change: TrendingUp,
  deal_updated: Edit,
  deal_created: CheckCircle,
};

const activityColors: Record<string, string> = {
  status_change: 'bg-muted-foreground/20',
  stage_change: 'bg-muted-foreground/20',
  note_added: 'bg-muted-foreground/20',
  contact_added: 'bg-muted-foreground/20',
  value_updated: 'bg-muted-foreground/20',
  comment: 'bg-muted-foreground/20',
  created: 'bg-brand/20',
  lender_removed: 'bg-destructive/20',
  lender_added: 'bg-brand/20',
  lender_stage_change: 'bg-muted-foreground/20',
  deal_updated: 'bg-muted-foreground/20',
  deal_created: 'bg-brand/20',
};

// Field name display mapping
const fieldLabels: Record<string, string> = {
  notes: 'Status Notes',
  flagNotes: 'Flag Notes',
  isFlagged: 'Flagged Status',
  status: 'Deal Status',
  stage: 'Deal Stage',
  value: 'Deal Value',
  company: 'Company Name',
  manager: 'Manager',
  dealOwner: 'Deal Owner',
  engagementType: 'Engagement Type',
  exclusivity: 'Exclusivity',
  referredBy: 'Referred By',
  retainerFee: 'Retainer Fee',
  milestoneFee: 'Milestone Fee',
  successFeePercent: 'Success Fee %',
  totalFee: 'Total Fee',
  preSigningHours: 'Pre-Signing Hours',
  postSigningHours: 'Post-Signing Hours',
};

// Convert ActivityLog from database to ActivityItem for display
export function activityLogToItem(log: ActivityLog): ActivityItem {
  const metadata = (log.metadata || {}) as Record<string, any>;
  return {
    id: log.id,
    type: log.activity_type as ActivityItem['type'],
    description: log.description,
    user: metadata.user_name || 'You',
    timestamp: log.created_at,
    metadata: {
      from: metadata.from,
      to: metadata.to,
      value: metadata.value,
      oldValue: metadata.oldValue,
      newValue: metadata.newValue,
      lenderName: metadata.lender_name,
      field: metadata.field,
    },
  };
}

// Strip HTML tags for display
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// Format value for display
function formatValue(value: any): string {
  if (value === null || value === undefined) return '(empty)';
  if (value === '') return '(empty)';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof value === 'string' && value.startsWith('<')) {
    const stripped = stripHtml(value);
    return stripped || '(empty)';
  }
  return String(value);
}

function ActivityDetailPopover({ activity }: { activity: ActivityItem }) {
  const hasDetails = activity.metadata && (
    activity.metadata.oldValue !== undefined || 
    activity.metadata.newValue !== undefined ||
    (activity.metadata.from && activity.metadata.to)
  );

  const fieldLabel = activity.metadata?.field 
    ? fieldLabels[activity.metadata.field] || activity.metadata.field
    : 'Field';

  if (!hasDetails) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>No additional details available for this activity.</p>
        {activity.metadata?.field && (
          <p className="mt-1">Field: <span className="font-medium text-foreground">{fieldLabel}</span></p>
        )}
      </div>
    );
  }

  // For status/stage changes with from/to
  if (activity.metadata?.from && activity.metadata?.to) {
    return (
      <div className="text-sm space-y-2">
        <p className="font-medium text-foreground">{activity.description}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">From</p>
            <p className="text-foreground bg-muted/50 px-2 py-1 rounded text-xs">
              {formatValue(activity.metadata.from)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">To</p>
            <p className="text-foreground bg-muted/50 px-2 py-1 rounded text-xs">
              {formatValue(activity.metadata.to)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // For field updates with old/new values
  return (
    <div className="text-sm space-y-2">
      <p className="font-medium text-foreground">{fieldLabel} updated</p>
      {activity.metadata?.oldValue !== undefined && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Previous value</p>
          <p className="text-foreground bg-muted/50 px-2 py-1 rounded text-xs max-w-[250px] break-words">
            {formatValue(activity.metadata.oldValue)}
          </p>
        </div>
      )}
      {activity.metadata?.newValue !== undefined && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">New value</p>
          <p className="text-foreground bg-muted/50 px-2 py-1 rounded text-xs max-w-[250px] break-words">
            {formatValue(activity.metadata.newValue)}
          </p>
        </div>
      )}
    </div>
  );
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No activity yet</p>
        <p className="text-xs mt-1">Activity will appear here as you work on this deal</p>
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {activities.map((activity, index) => {
          const Icon = activityIcons[activity.type] || Clock;
          const isLast = index === activities.length - 1;
          const colorClass = activityColors[activity.type] || 'bg-muted-foreground/20';

          return (
            <li key={activity.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-border"
                    aria-hidden="true"
                  />
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="relative flex items-start space-x-3 cursor-pointer hover:bg-muted/30 rounded-lg p-1 -m-1 transition-colors">
                      <div className={`relative flex h-6 w-6 items-center justify-center rounded-full ${colorClass}`}>
                        <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-foreground">
                            {activity.description}
                            {activity.metadata?.from && activity.metadata?.to && (
                              <span className="text-muted-foreground">
                                {' '}from <span className="font-medium text-foreground">{activity.metadata.from}</span> to{' '}
                                <span className="font-medium text-foreground">{activity.metadata.to}</span>
                              </span>
                            )}
                          </p>
                          {activity.onUndo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs gap-1 px-2 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                activity.onUndo?.();
                              }}
                            >
                              <Undo2 className="h-3 w-3" />
                              Undo
                            </Button>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{activity.user}</span>
                          <span>•</span>
                          <time dateTime={activity.timestamp}>{formatDate(activity.timestamp)}</time>
                        </div>
                      </div>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" side="left" align="start">
                    <ActivityDetailPopover activity={activity} />
                  </PopoverContent>
                </Popover>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
