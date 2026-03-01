import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle, Eye, X, UserPlus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VarianceFlag {
  id: string;
  account_name: string;
  variance_amount: string;
  variance_pct: string;
  comparison_mode: string;
  status: 'open' | 'in_review' | 'approved' | 'dismissed';
  flagged_by: string;
  assigned_to?: string;
  notes?: string;
  created_at: string;
}

// Demo data
const DEMO_FLAGS: VarianceFlag[] = [
  {
    id: '1', account_name: 'Hosting & Infrastructure', variance_amount: '+$200K',
    variance_pct: '+14.3%', comparison_mode: 'budget', status: 'open',
    flagged_by: 'JT', created_at: '2h ago',
  },
  {
    id: '2', account_name: 'Headcount (S&M)', variance_amount: '-$100K',
    variance_pct: '-9.1%', comparison_mode: 'budget', status: 'in_review',
    flagged_by: 'FF', assigned_to: 'PP', notes: 'Reviewing headcount plan for Q2',
    created_at: '1d ago',
  },
  {
    id: '3', account_name: 'Legal & Compliance', variance_amount: '-$50K',
    variance_pct: '-14.3%', comparison_mode: 'budget', status: 'approved',
    flagged_by: 'PP', assigned_to: 'JT', notes: 'Approved — one-time litigation cost',
    created_at: '3d ago',
  },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Open', color: 'text-warning border-warning/30', icon: AlertTriangle },
  in_review: { label: 'In Review', color: 'text-primary border-primary/30', icon: Eye },
  approved: { label: 'Approved', color: 'text-success border-success/30', icon: CheckCircle },
  dismissed: { label: 'Dismissed', color: 'text-muted-foreground border-border', icon: X },
};

export function VarianceReviewPanel() {
  const [flags, setFlags] = useState(DEMO_FLAGS);
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? flags : flags.filter(f => f.status === filter);

  const handleStatusChange = (id: string, newStatus: string) => {
    setFlags(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as VarianceFlag['status'] } : f));
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Variance Reviews
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] text-warning border-warning/30">
              {flags.filter(f => f.status === 'open').length} open
            </Badge>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No variance flags</p>
        )}
        {filtered.map(flag => {
          const cfg = statusConfig[flag.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={flag.id} className="p-3 rounded-md border border-border/30 space-y-2">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold">{flag.account_name}</span>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono text-destructive font-medium">{flag.variance_amount}</span>
                    <span className="font-mono">({flag.variance_pct})</span>
                    <span>vs {flag.comparison_mode}</span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-[8px] gap-1", cfg.color)}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {cfg.label}
                </Badge>
              </div>

              {flag.notes && (
                <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5">{flag.notes}</p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{flag.flagged_by}</AvatarFallback></Avatar>
                    Flagged {flag.created_at}
                  </div>
                  {flag.assigned_to && (
                    <div className="flex items-center gap-1">
                      <UserPlus className="h-2.5 w-2.5" />
                      <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{flag.assigned_to}</AvatarFallback></Avatar>
                    </div>
                  )}
                </div>

                {flag.status === 'open' && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2" onClick={() => handleStatusChange(flag.id, 'in_review')}>
                      <Eye className="h-2.5 w-2.5 mr-0.5" /> Review
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2" onClick={() => handleStatusChange(flag.id, 'dismissed')}>
                      <X className="h-2.5 w-2.5 mr-0.5" /> Dismiss
                    </Button>
                  </div>
                )}
                {flag.status === 'in_review' && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2 text-success" onClick={() => handleStatusChange(flag.id, 'approved')}>
                      <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Approve
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2" onClick={() => handleStatusChange(flag.id, 'dismissed')}>
                      <X className="h-2.5 w-2.5 mr-0.5" /> Dismiss
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
