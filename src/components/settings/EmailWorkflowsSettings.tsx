import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Zap, Mail, ChevronRight, Plus, Shield, Ban, Users, Clock, FileText,
} from 'lucide-react';
import {
  useEmailWorkflows,
  useSaveEmailWorkflow,
  useToggleEmailWorkflow,
  type EmailWorkflow,
} from '@/hooks/useEmailWorkflows';
import { useOutboundEmailTemplates } from '@/hooks/useOutboundEmailTemplates';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';

interface Props {
  isAdmin: boolean;
}

export function EmailWorkflowsSettings({ isAdmin }: Props) {
  const { data: workflows, isLoading } = useEmailWorkflows();
  const toggle = useToggleEmailWorkflow();
  const [editWorkflow, setEditWorkflow] = useState<EmailWorkflow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Email Workflows</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Email Workflows</CardTitle>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Workflow
            </Button>
          )}
        </div>
        <CardDescription className="text-xs mt-1">
          Trigger-based email prompts that fire when deal events occur. Mapped to Email Templates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(!workflows || workflows.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No email workflows configured</p>
            <p className="text-xs mt-1">Create workflows to trigger email drafts on deal events</p>
          </div>
        ) : (
          workflows.map(wf => (
            <WorkflowRow
              key={wf.id}
              workflow={wf}
              isAdmin={isAdmin}
              onToggle={(active) => toggle.mutate({ id: wf.id, is_active: active })}
              onEdit={() => setEditWorkflow(wf)}
            />
          ))
        )}
      </CardContent>

      {editWorkflow && (
        <WorkflowEditDialog
          workflow={editWorkflow}
          open={!!editWorkflow}
          onClose={() => setEditWorkflow(null)}
          isAdmin={isAdmin}
        />
      )}

      {isCreateOpen && (
        <WorkflowEditDialog
          workflow={null}
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          isAdmin={isAdmin}
        />
      )}
    </Card>
  );
}

function WorkflowRow({
  workflow: wf,
  isAdmin,
  onToggle,
  onEdit,
}: {
  workflow: EmailWorkflow;
  isAdmin: boolean;
  onToggle: (active: boolean) => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/30",
        wf.is_active ? "border-border/40 bg-card" : "border-border/20 bg-muted/10 opacity-70"
      )}
      onClick={onEdit}
    >
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Mail className="h-4 w-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{wf.name}</span>
          {wf.email_template_number && (
            <Badge variant="outline" className="text-[9px] px-1.5 h-4 flex-shrink-0">
              Email #{wf.email_template_number}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[11px] text-muted-foreground truncate">{wf.trigger_event}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {wf.trigger_type}
          </Badge>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
            <Users className="h-2.5 w-2.5" />
            {wf.audience || 'Client'}
          </Badge>
          {wf.comm_type && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {wf.comm_type}
            </Badge>
          )}
          {wf.requires_approval && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-amber-500 border-amber-500/30">
              <Shield className="h-2.5 w-2.5" />
              Approval Required
            </Badge>
          )}
          {wf.prevent_duplicate_send && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-red-400 border-red-400/30">
              <Ban className="h-2.5 w-2.5" />
              Dup Prevention
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {isAdmin && (
          <Switch
            checked={wf.is_active}
            onCheckedChange={onToggle}
          />
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function WorkflowEditDialog({
  workflow,
  open,
  onClose,
  isAdmin,
}: {
  workflow: EmailWorkflow | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { company } = useCompany();
  const { data: templates } = useOutboundEmailTemplates();
  const save = useSaveEmailWorkflow();
  const isNew = !workflow;

  const [form, setForm] = useState({
    name: workflow?.name || '',
    trigger_type: workflow?.trigger_type || 'stage_enter',
    trigger_event: workflow?.trigger_event || '',
    pipeline_name: workflow?.pipeline_name || 'Active Pipeline',
    stage_name: workflow?.stage_name || '',
    email_template_number: workflow?.email_template_number || null as number | null,
    email_template_id: workflow?.email_template_id || null as string | null,
    email_template_title: workflow?.email_template_title || '',
    send_timing: workflow?.send_timing || '',
    audience: workflow?.audience || 'Client',
    comm_type: workflow?.comm_type || '',
    default_subject: workflow?.default_subject || '',
    notes: workflow?.notes || '',
    show_in_deal_prompt: workflow?.show_in_deal_prompt ?? true,
    requires_approval: workflow?.requires_approval ?? true,
    auto_recommend_cc: workflow?.auto_recommend_cc ?? true,
    prevent_duplicate_send: workflow?.prevent_duplicate_send ?? false,
  });

  const handleTemplateChange = (templateId: string) => {
    const t = templates?.find(t => t.id === templateId);
    if (t) {
      setForm(f => ({
        ...f,
        email_template_id: t.id,
        email_template_number: t.template_number,
        email_template_title: t.title,
        default_subject: t.subject_line || f.default_subject,
      }));
    }
  };

  const handleSave = () => {
    if (!company?.id || !form.name || !form.trigger_event) return;
    save.mutate({
      ...(workflow?.id ? { id: workflow.id } : {}),
      company_id: company.id,
      ...form,
    } as any, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Create Email Workflow' : 'Edit Email Workflow'}</DialogTitle>
          <DialogDescription className="text-xs">
            {isNew ? 'Define a trigger-based email workflow mapped to an Email Template.' : 'Modify workflow trigger and mapping settings.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Workflow Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Retainer Payment Workflow" disabled={!isAdmin} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger Type</Label>
              <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stage_enter">Stage Enter</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="timer">Timer</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pipeline</Label>
              <Input value={form.pipeline_name || ''} onChange={e => setForm(f => ({ ...f, pipeline_name: e.target.value }))} disabled={!isAdmin} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Stage Name</Label>
              <Input value={form.stage_name || ''} onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))} placeholder="e.g. Terms Issued" disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger Event Description</Label>
              <Input value={form.trigger_event} onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value }))} disabled={!isAdmin} />
            </div>
          </div>

          {/* Template mapping */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Mapped Email Template
            </Label>
            <Select
              value={form.email_template_id || ''}
              onValueChange={handleTemplateChange}
              disabled={!isAdmin}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an email template..." />
              </SelectTrigger>
              <SelectContent>
                {(templates || []).filter(t => t.is_active).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    #{t.template_number} – {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.email_template_title && (
              <p className="text-[10px] text-muted-foreground">
                Template #{form.email_template_number}: {form.email_template_title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Audience</Label>
              <Select value={form.audience || 'Client'} onValueChange={v => setForm(f => ({ ...f, audience: v }))} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Client">Client</SelectItem>
                  <SelectItem value="Lender">Lender</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comm Type</Label>
              <Input value={form.comm_type || ''} onChange={e => setForm(f => ({ ...f, comm_type: e.target.value }))} placeholder="e.g. Payment" disabled={!isAdmin} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Default Subject</Label>
            <Input value={form.default_subject || ''} onChange={e => setForm(f => ({ ...f, default_subject: e.target.value }))} disabled={!isAdmin} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Send Timing</Label>
            <Input value={form.send_timing || ''} onChange={e => setForm(f => ({ ...f, send_timing: e.target.value }))} placeholder="e.g. On stage enter, Manager approves" disabled={!isAdmin} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[60px] text-xs" disabled={!isAdmin} />
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1 border-t border-border/30">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show in Deal Prompt</Label>
              <Checkbox checked={form.show_in_deal_prompt} onCheckedChange={v => setForm(f => ({ ...f, show_in_deal_prompt: !!v }))} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Requires Approval</Label>
              <Checkbox checked={form.requires_approval} onCheckedChange={v => setForm(f => ({ ...f, requires_approval: !!v }))} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Auto-recommend CC</Label>
              <Checkbox checked={form.auto_recommend_cc} onCheckedChange={v => setForm(f => ({ ...f, auto_recommend_cc: !!v }))} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                Prevent Duplicate Send
                <span className="text-muted-foreground">(blocks re-trigger if already sent for deal)</span>
              </Label>
              <Checkbox checked={form.prevent_duplicate_send} onCheckedChange={v => setForm(f => ({ ...f, prevent_duplicate_send: !!v }))} disabled={!isAdmin} />
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={save.isPending || !form.name}>
                {save.isPending ? 'Saving…' : isNew ? 'Create Workflow' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
