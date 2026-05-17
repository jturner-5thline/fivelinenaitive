import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Mail, Settings, GitBranch, AlertCircle,
} from 'lucide-react';
import {
  getAllEmailCadences,
  setAllEmailCadences,
  resetEmailCadences,
  validateCadenceConfig,
  EmailCadenceDef,
  CadenceEmail,
  StageAction,
  SenderType,
  OffsetUnit,
  CadenceTriggerType,
  EmailTriggerType,
} from '@/config/naitiveEmailCadences';
import { SYSTEM_STAGE_TYPES, SYSTEM_STAGE_LABELS } from '@/config/naitivePipelineConfig';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: DealStageOption[];
}

const SENDER_OPTIONS: { value: SenderType; label: string }[] = [
  { value: 'deal-owner', label: 'Deal Owner' },
  { value: 'company-owner', label: 'Company Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'custom', label: 'Custom' },
];

const OFFSET_UNITS: OffsetUnit[] = ['minutes', 'hours', 'days'];

const CADENCE_TRIGGERS: { value: CadenceTriggerType; label: string }[] = [
  { value: 'stage-entered', label: 'Stage entered' },
  { value: 'access-granted', label: 'Access granted' },
  { value: 'call-missed', label: 'Call missed' },
  { value: 'manual', label: 'Manual' },
];

const EMAIL_TRIGGERS: { value: EmailTriggerType; label: string }[] = [
  { value: 'cadence-start', label: 'After cadence start' },
  { value: 'after-previous', label: 'After previous email' },
  { value: 'before-scheduled-call', label: 'Before scheduled call' },
  { value: 'after-scheduled-call', label: 'After scheduled call' },
  { value: 'manual', label: 'Manual' },
];

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function newEmail(order: number): CadenceEmail {
  return {
    id: newId('email'),
    sequenceOrder: order,
    name: 'New email',
    subject: '',
    body: '',
    senderType: 'deal-owner',
    triggerType: 'after-previous',
    triggerOffset: 1,
    triggerOffsetUnit: 'days',
    businessDaysOnly: true,
    conditions: [],
  };
}

function newCadence(order: number): EmailCadenceDef {
  return {
    id: newId('cadence'),
    name: 'New cadence',
    description: '',
    isActive: true,
    applicableStageTypes: [],
    senderType: 'deal-owner',
    triggerType: 'stage-entered',
    triggerOffset: 0,
    triggerOffsetUnit: 'days',
    businessDaysOnly: true,
    branchRules: [],
    emails: [newEmail(1)],
    stageActions: [],
    sortOrder: order,
  };
}

export function EmailCadenceConfigModal({ open, onOpenChange, stages }: Props) {
  const [draft, setDraft] = useState<EmailCadenceDef[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const list = getAllEmailCadences();
      setDraft(list);
      if (!list.find((c) => c.id === activeId)) setActiveId(list[0]?.id || '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = draft.find((c) => c.id === activeId);
  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);
  const issues = useMemo(
    () => (active ? validateCadenceConfig(active, stageIds) : []),
    [active, stageIds],
  );

  const patchCadence = (patch: Partial<EmailCadenceDef>) => {
    setDraft((prev) => prev.map((c) => (c.id === activeId ? { ...c, ...patch } : c)));
  };

  const patchEmail = (emailId: string, patch: Partial<CadenceEmail>) => {
    if (!active) return;
    patchCadence({
      emails: active.emails.map((e) => (e.id === emailId ? { ...e, ...patch } : e)),
    });
  };

  const moveEmail = (idx: number, dir: -1 | 1) => {
    if (!active) return;
    const list = active.emails.slice();
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    patchCadence({ emails: list.map((e, i) => ({ ...e, sequenceOrder: i + 1 })) });
  };

  const addEmail = () => {
    if (!active) return;
    patchCadence({ emails: [...active.emails, newEmail(active.emails.length + 1)] });
  };

  const deleteEmail = (emailId: string) => {
    if (!active) return;
    patchCadence({
      emails: active.emails.filter((e) => e.id !== emailId).map((e, i) => ({ ...e, sequenceOrder: i + 1 })),
      branchRules: active.branchRules.map((b) => ({ ...b, emailIds: b.emailIds.filter((id) => id !== emailId) })),
      stageActions: active.stageActions.filter((a) => a.emailId !== emailId),
    });
  };

  const addCadence = () => {
    setDraft((prev) => {
      const c = newCadence(prev.length);
      setActiveId(c.id);
      return [...prev, c];
    });
  };

  const deleteCadence = (id: string) => {
    setDraft((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id || '');
      return next;
    });
  };

  const handleSave = () => {
    setSaving(true);
    try {
      // Validate all
      const errs = draft.flatMap((c) => validateCadenceConfig(c, stageIds).filter((i) => i.level === 'error').map((i) => ({ ...i, cadence: c.name })));
      if (errs.length) {
        toast.error(`${errs.length} issue(s) to fix — see active cadence.`);
        setSaving(false);
        return;
      }
      setAllEmailCadences(draft);
      toast.success('Email cadences saved');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    resetEmailCadences();
    setDraft(getAllEmailCadences());
    toast.success('Cadences reset to defaults');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Cadences
          </DialogTitle>
          <DialogDescription>
            Configure reusable outbound email sequences, branch logic, and stage automations for the naitive pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left rail */}
          <ScrollArea className="w-64 border-r shrink-0">
            <div className="p-2 space-y-0.5">
              {draft.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md text-sm flex items-start gap-2 transition-colors',
                    activeId === c.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                    !c.isActive && 'opacity-50',
                  )}
                >
                  <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.emails.length} email{c.emails.length === 1 ? '' : 's'}
                      {c.applicableStageTypes.length > 0 && ` • ${c.applicableStageTypes.join(', ')}`}
                    </div>
                  </div>
                </button>
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" onClick={addCadence}>
                <Plus className="h-3.5 w-3.5" /> New cadence
              </Button>
            </div>
          </ScrollArea>

          {/* Right pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!active ? (
              <div className="p-6 text-sm text-muted-foreground">Select or create a cadence.</div>
            ) : (
              <Tabs defaultValue="settings" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-5 mt-4 self-start">
                  <TabsTrigger value="settings" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Cadence Settings
                  </TabsTrigger>
                  <TabsTrigger value="emails" className="gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Emails ({active.emails.length})
                  </TabsTrigger>
                  <TabsTrigger value="automation" className="gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" /> Automation Logic
                  </TabsTrigger>
                </TabsList>

                {/* Cadence settings */}
                <TabsContent value="settings" className="flex-1 min-h-0 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={active.name} onChange={(e) => patchCadence({ name: e.target.value })}
                            className="h-8 text-sm mt-1" maxLength={120} />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <Switch checked={active.isActive} onCheckedChange={(v) => patchCadence({ isActive: v })} />
                            Active
                          </label>
                        </div>
                        <div>
                          <Label className="text-xs">Default sender</Label>
                          <Select value={active.senderType} onValueChange={(v) => patchCadence({ senderType: v as SenderType })}>
                            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Applies to canonical stages</Label>
                          <Select
                            value={active.applicableStageTypes[0] || '__none__'}
                            onValueChange={(v) => patchCadence({ applicableStageTypes: v === '__none__' ? [] : [v] })}
                          >
                            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Not stage-bound</SelectItem>
                              {SYSTEM_STAGE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{SYSTEM_STAGE_LABELS[t]} ({t})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Textarea value={active.description || ''}
                          onChange={(e) => patchCadence({ description: e.target.value })}
                          maxLength={600} className="text-sm min-h-[100px] mt-1" />
                      </div>
                      {active.branchRules.length > 0 && (
                        <div className="rounded-md border bg-muted/40 p-3">
                          <div className="text-xs font-medium mb-1">Branch summary</div>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {active.branchRules.map((b) => (
                              <li key={b.id}>• {b.label} — {b.emailIds.length} email(s)</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <Button variant="ghost" size="sm"
                          onClick={() => deleteCadence(active.id)}
                          className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete cadence
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Emails */}
                <TabsContent value="emails" className="flex-1 min-h-0 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-3">
                      {active.emails.map((e, idx) => {
                        const branch = active.branchRules.find((b) => b.emailIds.includes(e.id));
                        const emailIssues = issues.filter((i) => i.emailId === e.id);
                        return (
                          <div key={e.id} className="border rounded-lg p-3 space-y-2.5 bg-card/50">
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col">
                                <button onClick={() => moveEmail(idx, -1)} disabled={idx === 0}
                                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => moveEmail(idx, 1)} disabled={idx === active.emails.length - 1}
                                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px]">#{e.sequenceOrder}</Badge>
                                  {branch && <Badge variant="secondary" className="text-[10px]">{branch.label}</Badge>}
                                  <Input value={e.name} onChange={(ev) => patchEmail(e.id, { name: ev.target.value })}
                                    className="h-7 text-xs flex-1 min-w-[140px]" placeholder="Email name" />
                                  <Button variant="ghost" size="sm" onClick={() => deleteEmail(e.id)}
                                    className="text-destructive hover:text-destructive h-7 px-2">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                <div>
                                  <Label className="text-xs">Subject</Label>
                                  <Input value={e.subject} onChange={(ev) => patchEmail(e.id, { subject: ev.target.value })}
                                    className="h-8 text-sm mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Body — supports [First Name], [Name], [date], [time]</Label>
                                  <Textarea value={e.body} onChange={(ev) => patchEmail(e.id, { body: ev.target.value })}
                                    className="text-sm mt-1 min-h-[140px] font-mono" />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  <div>
                                    <Label className="text-xs">Sender</Label>
                                    <Select value={e.senderType} onValueChange={(v) => patchEmail(e.id, { senderType: v as SenderType })}>
                                      <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {SENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Trigger</Label>
                                    <Select value={e.triggerType} onValueChange={(v) => patchEmail(e.id, { triggerType: v as EmailTriggerType })}>
                                      <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {EMAIL_TRIGGERS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Offset</Label>
                                    <div className="flex gap-1 mt-1">
                                      <Input type="number" min={0} value={e.triggerOffset}
                                        onChange={(ev) => patchEmail(e.id, { triggerOffset: Number(ev.target.value) || 0 })}
                                        className="h-8 text-sm w-16" />
                                      <Select value={e.triggerOffsetUnit} onValueChange={(v) => patchEmail(e.id, { triggerOffsetUnit: v as OffsetUnit })}>
                                        <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {OFFSET_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-xs">
                                      <Switch checked={e.businessDaysOnly}
                                        onCheckedChange={(v) => patchEmail(e.id, { businessDaysOnly: v })} />
                                      Business days
                                    </label>
                                  </div>
                                </div>
                                {emailIssues.length > 0 && (
                                  <div className="text-xs text-destructive flex items-start gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <div>{emailIssues.map((i) => i.message).join(' • ')}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={addEmail} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Add email
                      </Button>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Automation logic */}
                <TabsContent value="automation" className="flex-1 min-h-0 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-5">
                      <section className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Launch trigger</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Select value={active.triggerType} onValueChange={(v) => patchCadence({ triggerType: v as CadenceTriggerType })}>
                              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CADENCE_TRIGGERS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Offset</Label>
                            <div className="flex gap-1 mt-1">
                              <Input type="number" min={0} value={active.triggerOffset}
                                onChange={(e) => patchCadence({ triggerOffset: Number(e.target.value) || 0 })}
                                className="h-8 text-sm w-16" />
                              <Select value={active.triggerOffsetUnit} onValueChange={(v) => patchCadence({ triggerOffsetUnit: v as OffsetUnit })}>
                                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {OFFSET_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 text-sm">
                              <Switch checked={active.businessDaysOnly}
                                onCheckedChange={(v) => patchCadence({ businessDaysOnly: v })} />
                              Business days
                            </label>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preconditions</Label>
                        <Textarea
                          value={(active.preconditions || []).join('\n')}
                          onChange={(e) => patchCadence({ preconditions: e.target.value.split('\n').filter(Boolean) })}
                          placeholder="One precondition per line, e.g. 5-minute 'we're on the call' message has been sent."
                          className="text-sm min-h-[80px]" />
                      </section>

                      <section className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Branch rules</Label>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5"
                            onClick={() => patchCadence({
                              branchRules: [...active.branchRules, {
                                id: newId('branch'), label: 'New branch', conditions: [], emailIds: [],
                              }],
                            })}>
                            <Plus className="h-3.5 w-3.5" /> Add branch
                          </Button>
                        </div>
                        {active.branchRules.length === 0 && (
                          <div className="text-xs text-muted-foreground">No branches — all emails sent to every recipient.</div>
                        )}
                        {active.branchRules.map((b, bi) => (
                          <div key={b.id} className="border rounded-md p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input value={b.label} className="h-7 text-sm flex-1"
                                onChange={(e) => patchCadence({
                                  branchRules: active.branchRules.map((x, i) => i === bi ? { ...x, label: e.target.value } : x),
                                })} />
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive"
                                onClick={() => patchCadence({ branchRules: active.branchRules.filter((_, i) => i !== bi) })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <Input placeholder="Field path (e.g. lead.hasLoggedIn)"
                                value={b.conditions[0]?.field || ''}
                                onChange={(e) => patchCadence({
                                  branchRules: active.branchRules.map((x, i) => i === bi ? {
                                    ...x, conditions: [{ ...(x.conditions[0] || { operator: 'is-true' }), field: e.target.value }],
                                  } : x),
                                })} className="h-8 text-sm" />
                              <Select
                                value={b.conditions[0]?.operator || 'is-true'}
                                onValueChange={(v) => patchCadence({
                                  branchRules: active.branchRules.map((x, i) => i === bi ? {
                                    ...x, conditions: [{ ...(x.conditions[0] || { field: '' }), operator: v as any }],
                                  } : x),
                                })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['is-true','is-false','equals','not-equals','exists','missing'].map((o) =>
                                    <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <div className="text-xs text-muted-foreground self-center">
                                {b.emailIds.length} email(s) assigned
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {active.emails.map((e) => {
                                const on = b.emailIds.includes(e.id);
                                return (
                                  <button key={e.id}
                                    onClick={() => patchCadence({
                                      branchRules: active.branchRules.map((x, i) => i === bi ? {
                                        ...x, emailIds: on ? x.emailIds.filter((id) => id !== e.id) : [...x.emailIds, e.id],
                                      } : x),
                                    })}
                                    className={cn(
                                      'text-[11px] px-2 py-0.5 rounded border transition-colors',
                                      on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted',
                                    )}>
                                    #{e.sequenceOrder} {e.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </section>

                      <section className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stage actions</Label>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5"
                            onClick={() => patchCadence({
                              stageActions: [...active.stageActions, {
                                id: newId('action'), trigger: 'on-cadence-start',
                                targetStage: stages[0]?.id || '',
                              } as StageAction],
                            })}>
                            <Plus className="h-3.5 w-3.5" /> Add action
                          </Button>
                        </div>
                        {active.stageActions.length === 0 && (
                          <div className="text-xs text-muted-foreground">No stage actions configured.</div>
                        )}
                        {active.stageActions.map((a, ai) => (
                          <div key={a.id} className="border rounded-md p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                            <div>
                              <Label className="text-xs">When</Label>
                              <Select value={a.trigger} onValueChange={(v) => patchCadence({
                                stageActions: active.stageActions.map((x, i) => i === ai ? { ...x, trigger: v as any } : x),
                              })}>
                                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="on-cadence-start">Cadence start</SelectItem>
                                  <SelectItem value="on-cadence-complete">Cadence complete</SelectItem>
                                  <SelectItem value="on-email-send">Email send</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {a.trigger === 'on-email-send' && (
                              <div>
                                <Label className="text-xs">Email</Label>
                                <Select value={a.emailId || ''} onValueChange={(v) => patchCadence({
                                  stageActions: active.stageActions.map((x, i) => i === ai ? { ...x, emailId: v } : x),
                                })}>
                                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {active.emails.map((e) => <SelectItem key={e.id} value={e.id}>#{e.sequenceOrder} {e.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs">Move to stage</Label>
                              <Select value={a.targetStage} onValueChange={(v) => patchCadence({
                                stageActions: active.stageActions.map((x, i) => i === ai ? { ...x, targetStage: v } : x),
                              })}>
                                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {a.targetStage === 'closed-lost' && (
                              <div>
                                <Label className="text-xs">Closed Lost reason</Label>
                                <Input value={a.closedLostReason || ''} className="h-8 text-sm mt-1"
                                  onChange={(e) => patchCadence({
                                    stageActions: active.stageActions.map((x, i) => i === ai ? { ...x, closedLostReason: e.target.value } : x),
                                  })} />
                              </div>
                            )}
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive justify-self-end"
                              onClick={() => patchCadence({ stageActions: active.stageActions.filter((_, i) => i !== ai) })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </section>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save cadences'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
