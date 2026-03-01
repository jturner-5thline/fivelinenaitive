import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  ClipboardCheck, Plus, ChevronRight, CheckCircle, XCircle, Clock, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetApproval {
  id: string;
  title: string;
  description: string;
  type: string;
  affected_accounts: string[];
  amount_impact: string;
  submitted_by: string;
  submitted_initials: string;
  current_level: 'analyst' | 'manager' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  analyst_approved: boolean;
  manager_approved: boolean;
  admin_approved: boolean;
  created_at: string;
}

const DEMO_APPROVALS: BudgetApproval[] = [
  {
    id: '1', title: 'Q2 Marketing Budget Increase', description: 'Increase paid acquisition budget to capture seasonal demand',
    type: 'budget_change', affected_accounts: ['Paid Acquisition', 'Events'], amount_impact: '+$150K',
    submitted_by: 'Jill Turner', submitted_initials: 'JT', current_level: 'manager',
    status: 'pending', analyst_approved: true, manager_approved: false, admin_approved: false,
    created_at: '2h ago',
  },
  {
    id: '2', title: 'Engineering Tools Reclass', description: 'Reclassify Datadog costs from G&A to R&D',
    type: 'reclass', affected_accounts: ['Tools & Licenses', 'Other G&A'], amount_impact: '$0 (reclass)',
    submitted_by: 'Franco F.', submitted_initials: 'FF', current_level: 'admin',
    status: 'pending', analyst_approved: true, manager_approved: true, admin_approved: false,
    created_at: '1d ago',
  },
  {
    id: '3', title: 'Forecast Update — SaaS Revenue', description: 'Revise SaaS subscription forecast up based on pipeline conversion',
    type: 'forecast_update', affected_accounts: ['SaaS Subscriptions'], amount_impact: '+$200K',
    submitted_by: 'Paolo P.', submitted_initials: 'PP', current_level: 'analyst',
    status: 'approved', analyst_approved: true, manager_approved: true, admin_approved: true,
    created_at: '5d ago',
  },
];

const levelLabels = ['analyst', 'manager', 'admin'] as const;

export function BudgetApprovalWorkflow() {
  const [approvals, setApprovals] = useState(DEMO_APPROVALS);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? approvals : approvals.filter(a => a.status === filter);

  const handleApprove = (id: string) => {
    setApprovals(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a };
      if (a.current_level === 'analyst') {
        updated.analyst_approved = true;
        updated.current_level = 'manager';
      } else if (a.current_level === 'manager') {
        updated.manager_approved = true;
        updated.current_level = 'admin';
      } else {
        updated.admin_approved = true;
        updated.status = 'approved';
      }
      return updated;
    }));
  };

  const handleReject = (id: string) => {
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
  };

  const progressValue = (a: BudgetApproval) => {
    let done = 0;
    if (a.analyst_approved) done++;
    if (a.manager_approved) done++;
    if (a.admin_approved) done++;
    return (done / 3) * 100;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Budget Approvals
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] text-warning border-warning/30">
              {approvals.filter(a => a.status === 'pending').length} pending
            </Badge>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-sm">Submit Budget Approval</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input placeholder="e.g. Q2 Marketing Budget Increase" className="text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select defaultValue="budget_change">
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="budget_change">Budget Change</SelectItem>
                        <SelectItem value="forecast_update">Forecast Update</SelectItem>
                        <SelectItem value="reclass">Reclassification</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Textarea placeholder="Describe the change and rationale…" className="text-xs min-h-[80px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Affected Accounts</Label>
                      <Input placeholder="e.g. Paid Acquisition" className="text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Amount Impact</Label>
                      <Input placeholder="e.g. +$150K" className="text-xs" />
                    </div>
                  </div>
                  <Button className="w-full text-xs" onClick={() => setShowCreate(false)}>
                    Submit for Approval
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No approval requests</p>
        )}
        {filtered.map(approval => (
          <div key={approval.id} className="p-3 rounded-md border border-border/30 space-y-2">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{approval.title}</span>
                  <Badge variant="outline" className="text-[8px]">{approval.type.replace('_', ' ')}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{approval.description}</p>
              </div>
              <span className="text-xs font-mono font-medium">{approval.amount_impact}</span>
            </div>

            {/* Approval Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                {levelLabels.map((level, i) => {
                  const approved = level === 'analyst' ? approval.analyst_approved
                    : level === 'manager' ? approval.manager_approved
                    : approval.admin_approved;
                  const isCurrent = approval.current_level === level && approval.status === 'pending';
                  return (
                    <div key={level} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] border",
                        approved && "bg-success/10 text-success border-success/30",
                        isCurrent && !approved && "bg-primary/10 text-primary border-primary/30 font-medium",
                        !approved && !isCurrent && "text-muted-foreground border-border/30"
                      )}>
                        {approved ? <CheckCircle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Progress value={progressValue(approval)} className="h-1" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{approval.submitted_initials}</AvatarFallback></Avatar>
                {approval.submitted_by} · {approval.created_at}
              </div>
              {approval.status === 'pending' && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2 text-success" onClick={() => handleApprove(approval.id)}>
                    <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Approve
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2 text-destructive" onClick={() => handleReject(approval.id)}>
                    <XCircle className="h-2.5 w-2.5 mr-0.5" /> Reject
                  </Button>
                </div>
              )}
              {approval.status === 'approved' && (
                <Badge variant="outline" className="text-[8px] text-success border-success/30 gap-1">
                  <CheckCircle className="h-2.5 w-2.5" /> Approved
                </Badge>
              )}
              {approval.status === 'rejected' && (
                <Badge variant="outline" className="text-[8px] text-destructive border-destructive/30 gap-1">
                  <XCircle className="h-2.5 w-2.5" /> Rejected
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
