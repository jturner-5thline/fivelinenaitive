import { useState } from 'react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Newspaper, Mail, DollarSign, GitBranch, ListChecks,
  AlertCircle, ArrowRight, ExternalLink, Clock, TrendingUp,
  FileText, Users, X, ChevronRight,
} from 'lucide-react';
import { useDailyBriefingData, type BriefingData } from '@/hooks/useDailyBriefingData';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DailyBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Detail pop-up (nested inside the modal) ────────────────────
function DetailPopup({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm flex flex-col rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-5">{children}</ScrollArea>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────
function EmptySection({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
      <AlertCircle className="h-4 w-4 opacity-50" />
      <span>{message}</span>
    </div>
  );
}

// ── Row component for clickable list items ─────────────────────
function BriefingRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeVariant,
  time,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  time?: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-background/50',
        'transition-colors duration-150',
        onClick && 'cursor-pointer hover:bg-muted/40 hover:border-border/80',
      )}
    >
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge variant={badgeVariant || 'secondary'} className="text-[10px]">
            {badge}
          </Badge>
        )}
        {time && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ── Tab: Catch Up & News ───────────────────────────────────────
function CatchUpTab({ data, onNavigate }: { data: BriefingData; onNavigate: (path: string) => void }) {
  const [detail, setDetail] = useState<any>(null);
  const { recentActivity, alerts } = data.catchUp;

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.description || 'Activity Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>Type:</strong> {detail.activity_type}</div>
            <div className="text-sm"><strong>Description:</strong> {detail.description}</div>
            <div className="text-sm"><strong>By:</strong> {detail.user_display_name || 'System'}</div>
            <div className="text-sm"><strong>Time:</strong> {format(new Date(detail.created_at), 'PPp')}</div>
            {detail.deal_id && (
              <Button size="sm" variant="outline" onClick={() => onNavigate(`/deal/${detail.deal_id}`)}>
                Open Deal <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </DetailPopup>
      )}

      <Section title="Priority Alerts">
        {alerts.length === 0 ? (
          <EmptySection message="No priority alerts in this window" />
        ) : (
          alerts.map(a => (
            <BriefingRow
              key={a.id}
              icon={AlertCircle}
              title={a.description}
              subtitle={a.user_display_name || undefined}
              badge={a.activity_type}
              time={formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              onClick={() => setDetail(a)}
            />
          ))
        )}
      </Section>

      <Section title="Recent Activity">
        {recentActivity.length === 0 ? (
          <EmptySection message="No activity since 5 PM ET yesterday" />
        ) : (
          recentActivity.map(a => (
            <BriefingRow
              key={a.id}
              icon={Clock}
              title={a.description}
              subtitle={a.user_display_name || undefined}
              badge={a.activity_type.replace(/_/g, ' ')}
              badgeVariant="outline"
              time={formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              onClick={() => setDetail(a)}
            />
          ))
        )}
      </Section>
    </div>
  );
}

// ── Tab: Email ─────────────────────────────────────────────────
function EmailTab({ data, onNavigate }: { data: BriefingData; onNavigate: (path: string) => void }) {
  const [detail, setDetail] = useState<any>(null);
  const { emails } = data.email;

  const clientEmails = emails.filter(e => {
    const cat = e.analysis?.category;
    return cat === 'deal_update' || cat === 'terms_discussion' || cat === 'due_diligence';
  });
  const dealEmails = emails.filter(e => {
    const cat = e.analysis?.category;
    return cat === 'lender_communication' || cat === 'follow_up_needed';
  });
  const otherEmails = emails.filter(e => {
    const cat = e.analysis?.category;
    return !['deal_update', 'terms_discussion', 'due_diligence', 'lender_communication', 'follow_up_needed'].includes(cat || '');
  });

  const renderEmails = (list: any[], label: string) => {
    if (list.length === 0) return <EmptySection message={`No ${label.toLowerCase()} in this window`} />;
    return list.map((e: any) => (
      <BriefingRow
        key={e.id}
        icon={Mail}
        title={e.subject || '(no subject)'}
        subtitle={`${e.from_name || e.from_email || 'Unknown'} — ${e.analysis?.summary || e.snippet || ''}`}
        badge={e.analysis?.category?.replace(/_/g, ' ') || 'email'}
        badgeVariant={e.analysis?.priority === 'high' ? 'destructive' : 'secondary'}
        time={e.received_at ? formatDistanceToNow(new Date(e.received_at), { addSuffix: true }) : ''}
        onClick={() => setDetail(e)}
      />
    ));
  };

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.subject || 'Email Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>From:</strong> {detail.from_name} ({detail.from_email})</div>
            <div className="text-sm"><strong>Subject:</strong> {detail.subject}</div>
            {detail.analysis?.summary && <div className="text-sm"><strong>AI Summary:</strong> {detail.analysis.summary}</div>}
            {detail.analysis?.deal_name && <div className="text-sm"><strong>Related Deal:</strong> {detail.analysis.deal_name}</div>}
            <div className="text-sm text-muted-foreground">{detail.snippet}</div>
            <Button size="sm" variant="outline" onClick={() => onNavigate('/email-intelligence')}>
              Open Email Intelligence <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      {emails.length === 0 ? (
        <EmptySection message="No emails found in this window. Live data not yet connected or no emails received." />
      ) : (
        <>
          <Section title="Client Emails">{renderEmails(clientEmails, 'client emails')}</Section>
          <Section title="Deal & Lender Emails">{renderEmails(dealEmails, 'deal emails')}</Section>
          <Section title="Other / Project Emails">{renderEmails(otherEmails, 'other emails')}</Section>
        </>
      )}
    </div>
  );
}

// ── Tab: Financial ─────────────────────────────────────────────
function FinancialTab({ data, onNavigate }: { data: BriefingData; onNavigate: (path: string) => void }) {
  const { recentInvoices, recentExpenses } = data.financial;
  const [detail, setDetail] = useState<any>(null);

  const totalRev = recentInvoices.reduce((s, i) => s + (i.total_amt || 0), 0);
  const totalExp = recentExpenses.reduce((s, e) => s + (e.total_amt || 0), 0);

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.customer_name || detail.vendor_name || 'Financial Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>Amount:</strong> ${(detail.total_amt || 0).toLocaleString()}</div>
            <div className="text-sm"><strong>Date:</strong> {detail.txn_date}</div>
            {detail.doc_number && <div className="text-sm"><strong>Invoice #:</strong> {detail.doc_number}</div>}
            <Button size="sm" variant="outline" onClick={() => onNavigate('/metrics')}>
              Open Financial Dashboard <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Revenue (window)</p>
            <p className="text-xl font-bold text-emerald-400">${totalRev.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{recentInvoices.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Expenses (window)</p>
            <p className="text-xl font-bold text-red-400">${totalExp.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{recentExpenses.length} items</p>
          </CardContent>
        </Card>
      </div>

      <Section title="Weekly Cashflow">
        {recentInvoices.length === 0 && recentExpenses.length === 0 ? (
          <EmptySection message="No financial transactions in this window" />
        ) : (
          <>
            {recentInvoices.map(inv => (
              <BriefingRow
                key={inv.id}
                icon={TrendingUp}
                title={`${inv.customer_name || 'Client'} — $${(inv.total_amt || 0).toLocaleString()}`}
                subtitle={inv.doc_number ? `Invoice #${inv.doc_number}` : undefined}
                badge="Revenue"
                badgeVariant="default"
                time={inv.txn_date}
                onClick={() => setDetail(inv)}
              />
            ))}
            {recentExpenses.map(exp => (
              <BriefingRow
                key={exp.id}
                icon={DollarSign}
                title={`${(exp as any).vendor_name || 'Expense'} — $${(exp.total_amt || 0).toLocaleString()}`}
                badge="Expense"
                badgeVariant="destructive"
                time={exp.txn_date}
                onClick={() => setDetail(exp)}
              />
            ))}
          </>
        )}
      </Section>

      <Section title="Tracking to Plan">
        <EmptySection message="Live plan-tracking data not yet connected — view full financial dashboard for details" />
      </Section>
    </div>
  );
}

// ── Tab: Pipeline & Clients ────────────────────────────────────
function PipelineTab({ data, onNavigate }: { data: BriefingData; onNavigate: (path: string) => void }) {
  const { newDeals, riskDeals, stageChanges } = data.pipeline;
  const [detail, setDetail] = useState<any>(null);

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.company || detail.description || 'Deal Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            {detail.company && <div className="text-sm"><strong>Company:</strong> {detail.company}</div>}
            {detail.stage && <div className="text-sm"><strong>Stage:</strong> {detail.stage}</div>}
            {detail.manager && <div className="text-sm"><strong>Manager:</strong> {detail.manager}</div>}
            {detail.description && <div className="text-sm">{detail.description}</div>}
            <Button size="sm" variant="outline" onClick={() => onNavigate(`/deal/${detail.id || detail.deal_id}`)}>
              Open Deal <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      <Section title="New Opportunities">
        {newDeals.length === 0 ? (
          <EmptySection message="No new deals added in this window" />
        ) : (
          newDeals.map(d => (
            <BriefingRow
              key={d.id}
              icon={GitBranch}
              title={d.company}
              subtitle={`Stage: ${d.stage} • Manager: ${d.manager || 'Unassigned'}`}
              badge="New"
              badgeVariant="default"
              onClick={() => setDetail(d)}
            />
          ))
        )}
      </Section>

      <Section title="Stage Changes">
        {stageChanges.length === 0 ? (
          <EmptySection message="No stage changes in this window" />
        ) : (
          stageChanges.filter(sc => sc.activity_type !== 'deal_created').map(sc => (
            <BriefingRow
              key={sc.id}
              icon={ArrowRight}
              title={sc.description}
              time={formatDistanceToNow(new Date(sc.created_at), { addSuffix: true })}
              onClick={() => setDetail(sc)}
            />
          ))
        )}
      </Section>

      <Section title="Potential Pipeline & Client Risks">
        {riskDeals.length === 0 ? (
          <EmptySection message="No risk signals detected" />
        ) : (
          riskDeals.map(d => (
            <BriefingRow
              key={d.id}
              icon={AlertCircle}
              title={d.company}
              subtitle={`Flag: ${d.flagStatus || 'none'} • Stage: ${d.stage}`}
              badge={d.flagStatus === 'red' ? 'High Risk' : 'At Risk'}
              badgeVariant={d.flagStatus === 'red' ? 'destructive' : 'secondary'}
              onClick={() => setDetail(d)}
            />
          ))
        )}
      </Section>
    </div>
  );
}

// ── Tab: Operational & Projects ────────────────────────────────
function OperationalTab({ data, onNavigate }: { data: BriefingData; onNavigate: (path: string) => void }) {
  const { milestones } = data.operational;
  const [detail, setDetail] = useState<any>(null);

  const overdue = milestones.filter(m => m.due_date && isPast(new Date(m.due_date)) && !isToday(new Date(m.due_date)));
  const todayItems = milestones.filter(m => m.due_date && isToday(new Date(m.due_date)));
  const upcoming = milestones.filter(m => m.due_date && !isPast(new Date(m.due_date)) && !isToday(new Date(m.due_date))).slice(0, 10);

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.title || 'Task Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>Task:</strong> {detail.title}</div>
            <div className="text-sm"><strong>Status:</strong> {detail.status || 'Open'}</div>
            {detail.assignee && <div className="text-sm"><strong>Assignee:</strong> {detail.assignee}</div>}
            {detail.due_date && <div className="text-sm"><strong>Due:</strong> {format(new Date(detail.due_date), 'PPP')}</div>}
            {detail.deal_id && (
              <Button size="sm" variant="outline" onClick={() => onNavigate(`/deal/${detail.deal_id}`)}>
                Open Deal <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </DetailPopup>
      )}

      <Section title="Overdue Tasks">
        {overdue.length === 0 ? (
          <EmptySection message="No overdue tasks" />
        ) : (
          overdue.map(m => (
            <BriefingRow
              key={m.id}
              icon={AlertCircle}
              title={m.title}
              subtitle={m.assignee ? `Assigned to: ${m.assignee}` : undefined}
              badge="Overdue"
              badgeVariant="destructive"
              time={m.due_date ? format(new Date(m.due_date), 'MMM d') : ''}
              onClick={() => setDetail(m)}
            />
          ))
        )}
      </Section>

      <Section title="Due Today">
        {todayItems.length === 0 ? (
          <EmptySection message="Nothing due today" />
        ) : (
          todayItems.map(m => (
            <BriefingRow
              key={m.id}
              icon={ListChecks}
              title={m.title}
              subtitle={m.assignee ? `Assigned to: ${m.assignee}` : undefined}
              badge="Today"
              time={m.due_date ? format(new Date(m.due_date), 'MMM d') : ''}
              onClick={() => setDetail(m)}
            />
          ))
        )}
      </Section>

      <Section title="Upcoming Milestones">
        {upcoming.length === 0 ? (
          <EmptySection message="No upcoming milestones" />
        ) : (
          upcoming.map(m => (
            <BriefingRow
              key={m.id}
              icon={FileText}
              title={m.title}
              subtitle={m.assignee ? `Assigned to: ${m.assignee}` : undefined}
              badge={m.status || 'open'}
              badgeVariant="outline"
              time={m.due_date ? format(new Date(m.due_date), 'MMM d') : ''}
              onClick={() => setDetail(m)}
            />
          ))
        )}
      </Section>
    </div>
  );
}

// ── Tab icons & labels ─────────────────────────────────────────
const TABS = [
  { value: 'catchup', label: 'Catch Up & News', icon: Newspaper },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'financial', label: 'Financial', icon: DollarSign },
  { value: 'pipeline', label: 'Pipeline & Clients', icon: GitBranch },
  { value: 'operational', label: 'Operational & Projects', icon: ListChecks },
] as const;

// ── Main modal component ───────────────────────────────────────
export function DailyBriefingModal({ open, onOpenChange }: DailyBriefingModalProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useDailyBriefingData(open);

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 border border-border/50 bg-background overflow-hidden"
        overlayClassName="bg-black/80"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
            <div>
              <h2 className="text-lg font-bold text-foreground">Daily Briefing</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data?.window.label || 'Since 5 PM ET yesterday'} • {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>

          {/* Tabs */}
          {isLoading || !data ? (
            <div className="flex-1 p-6 space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <Tabs defaultValue="catchup" className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-3">
                <TabsList className="w-full">
                  {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="catchup" className="h-full mt-0 pt-0">
                  <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                    <CatchUpTab data={data} onNavigate={handleNavigate} />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="email" className="h-full mt-0 pt-0">
                  <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                    <EmailTab data={data} onNavigate={handleNavigate} />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="financial" className="h-full mt-0 pt-0">
                  <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                    <FinancialTab data={data} onNavigate={handleNavigate} />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="pipeline" className="h-full mt-0 pt-0">
                  <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                    <PipelineTab data={data} onNavigate={handleNavigate} />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="operational" className="h-full mt-0 pt-0">
                  <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                    <OperationalTab data={data} onNavigate={handleNavigate} />
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
