import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  Plus, Search, X, Copy, Eye, Edit3, Save, RotateCcw, Mail, FileText, ChevronRight, ChevronDown, Layers,
} from 'lucide-react';
import {
  useOutboundEmailTemplates,
  useSaveOutboundEmailTemplate,
  useToggleOutboundEmailTemplate,
  useNextTemplateNumber,
  OutboundEmailTemplate,
  SequenceGroup,
  groupTemplates,
} from '@/hooks/useOutboundEmailTemplates';
import { OutboundEmailBodyEditor } from './OutboundEmailBodyEditor';
import { OutboundEmailPreview } from './OutboundEmailPreview';

interface Props {
  isAdmin: boolean;
}

type EditorMode = 'list' | 'edit' | 'preview' | 'sequence';

const MERGE_TAG_LIST = [
  '[FIRST NAME]', '[COMPANY NAME]', '[LENDER NAME]', '[CAPITAL ASK]',
  '[LINK TO DATA ROOM]', '[LIST OF OUTSTANDING ITEMS]', '[TIME OF KICK OFF CALL from Manager\'s Calendar]',
  '[GREETING]', '[COMPANY OVERVIEW FROM DEAL WRITE UP]', '[USE OF FUNDS FROM DEAL WRITE UP]',
  '[KEY ITEMS FROM DEAL WRITE UP]', '[NUMBER OF ACTIVE LENDERS]',
  '[NUMBER OF LENDERS WITH INTROCUED STATUS OR MANAGEMENT CALL REQUESTED MILESTONE]',
  '[NUMBER OF LENDERS IN IN REVIEW STATUS]', '[NUMBER OF LENDERS MARKED AS PASSED]',
  '[LIST OF LENDERS WITH COMMENTS]', '[LIST OF LENDER NAMES THAT HAVE BEEN ADDED LATEST]',
  '[LENDER NOTES]', '[ITEMS IN DATA ROOM]', '[OUTSTANDING ITEMS]', '[CLOSED LOST REASONS]',
];

function extractMergeTags(text: string): string[] {
  const matches = text.match(/\[[A-Z][A-Z0-9 '.,/]*\]/g);
  return matches ? [...new Set(matches)] : [];
}

export function OutboundEmailTemplatesSettings({ isAdmin }: Props) {
  const { data: templates, isLoading } = useOutboundEmailTemplates();
  const saveTemplate = useSaveOutboundEmailTemplate();
  const toggleTemplate = useToggleOutboundEmailTemplate();
  const { data: nextNumber } = useNextTemplateNumber();

  const [mode, setMode] = useState<EditorMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [activeSequence, setActiveSequence] = useState<SequenceGroup | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    id: '' as string | undefined,
    template_number: 1,
    title: '',
    sequence_name: '',
    subject_line: '',
    body_rich_text: '',
    body_plain_text: '',
    is_active: true,
    template_type: 'standalone' as string,
    sequence_group_id: null as string | null,
    sequence_step_key: null as string | null,
    sequence_step_order: null as number | null,
    trigger_stage: '' as string,
    cadence: '' as string,
    recipient: '' as string,
    category: '' as string,
    approval_required: false,
  });

  const { standalone, sequences } = useMemo(() => {
    if (!templates) return { standalone: [], sequences: [] };
    return groupTemplates(templates);
  }, [templates]);

  const filteredStandalone = useMemo(() => {
    return standalone.filter(t => {
      const matchesSearch = !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.sequence_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject_line.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(t.template_number).includes(searchQuery);
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && t.is_active) ||
        (statusFilter === 'inactive' && !t.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [standalone, searchQuery, statusFilter]);

  const filteredSequences = useMemo(() => {
    return sequences.filter(seq => {
      const matchesSearch = !searchQuery ||
        seq.sequenceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        seq.groupId.includes(searchQuery) ||
        seq.steps.some(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && seq.steps.some(s => s.is_active)) ||
        (statusFilter === 'inactive' && seq.steps.every(s => !s.is_active));
      return matchesSearch && matchesStatus;
    });
  }, [sequences, searchQuery, statusFilter]);

  const detectedTags = useMemo(() => {
    const combined = formData.subject_line + ' ' + formData.body_rich_text;
    return extractMergeTags(combined);
  }, [formData.subject_line, formData.body_rich_text]);

  const guardedNavigate = useCallback((action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingNavAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  }, [hasUnsavedChanges]);

  const loadTemplate = useCallback((template: OutboundEmailTemplate) => {
    setFormData({
      id: template.id,
      template_number: template.template_number,
      title: template.title,
      sequence_name: template.sequence_name || '',
      subject_line: template.subject_line,
      body_rich_text: template.body_rich_text,
      body_plain_text: template.body_plain_text || '',
      is_active: template.is_active,
      template_type: template.template_type || 'standalone',
      sequence_group_id: template.sequence_group_id || null,
      sequence_step_key: template.sequence_step_key || null,
      sequence_step_order: template.sequence_step_order || null,
      trigger_stage: template.trigger_stage || '',
      cadence: template.cadence || '',
      recipient: template.recipient || '',
      category: template.category || '',
      approval_required: !!template.approval_required,
    });
    setSelectedId(template.id);
    setHasUnsavedChanges(false);
    setMode('edit');
  }, []);

  const handleSelectTemplate = useCallback((template: OutboundEmailTemplate) => {
    guardedNavigate(() => loadTemplate(template));
  }, [guardedNavigate, loadTemplate]);

  const handleNewTemplate = useCallback(() => {
    guardedNavigate(() => {
      setFormData({
        id: undefined,
        template_number: nextNumber || 1,
        title: '',
        sequence_name: '',
        subject_line: '',
        body_rich_text: '',
        body_plain_text: '',
        is_active: true,
        template_type: 'standalone',
        sequence_group_id: null,
        sequence_step_key: null,
        sequence_step_order: null,
        trigger_stage: '',
        cadence: '',
        recipient: '',
        category: '',
        approval_required: false,
      });
      setSelectedId(null);
      setHasUnsavedChanges(false);
      setMode('edit');
    });
  }, [guardedNavigate, nextNumber]);

  const handleDuplicate = useCallback((template: OutboundEmailTemplate) => {
    guardedNavigate(() => {
      setFormData({
        id: undefined,
        template_number: nextNumber || template.template_number + 100,
        title: `${template.title} (Copy)`,
        sequence_name: template.sequence_name || '',
        subject_line: template.subject_line,
        body_rich_text: template.body_rich_text,
        body_plain_text: template.body_plain_text || '',
        is_active: true,
        template_type: 'standalone',
        sequence_group_id: null,
        sequence_step_key: null,
        sequence_step_order: null,
        trigger_stage: template.trigger_stage || '',
        cadence: template.cadence || '',
        recipient: template.recipient || '',
        category: template.category || '',
        approval_required: !!template.approval_required,
      });
      setSelectedId(null);
      setHasUnsavedChanges(true);
      setMode('edit');
    });
  }, [guardedNavigate, nextNumber]);

  const handleOpenSequence = useCallback((seq: SequenceGroup) => {
    guardedNavigate(() => {
      setActiveSequence(seq);
      setMode('sequence');
    });
  }, [guardedNavigate]);

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    if (!formData.subject_line.trim()) return;
    const payload: any = {
      template_number: formData.template_number,
      title: formData.title.trim(),
      sequence_name: formData.sequence_name.trim() || null,
      subject_line: formData.subject_line.trim(),
      body_rich_text: formData.body_rich_text,
      body_plain_text: formData.body_plain_text.trim() || null,
      is_active: formData.is_active,
      template_type: formData.template_type,
      sequence_group_id: formData.sequence_group_id,
      sequence_step_key: formData.sequence_step_key,
      sequence_step_order: formData.sequence_step_order,
      trigger_stage: formData.trigger_stage.trim() || null,
      cadence: formData.cadence.trim() || null,
      recipient: formData.recipient.trim() || null,
      category: formData.category.trim() || null,
      approval_required: formData.approval_required,
    };
    if (formData.id) payload.id = formData.id;
    const result = await saveTemplate.mutateAsync(payload);
    if (result) {
      setFormData(prev => ({ ...prev, id: (result as any).id }));
      setSelectedId((result as any).id);
      setHasUnsavedChanges(false);
    }
  };

  const handleCancel = () => {
    guardedNavigate(() => {
      if (mode === 'edit' && activeSequence) {
        setMode('sequence');
      } else {
        setMode('list');
        setActiveSequence(null);
      }
      setSelectedId(null);
      setHasUnsavedChanges(false);
    });
  };

  const updateField = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Email Templates</CardTitle></CardHeader>
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
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Email Templates</CardTitle>
          </div>
          {mode === 'list' && isAdmin && (
            <Button size="sm" onClick={handleNewTemplate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          )}
          {mode === 'sequence' && (
            <Button variant="ghost" size="sm" onClick={() => { setMode('list'); setActiveSequence(null); }} className="gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Back to list
            </Button>
          )}
          {(mode === 'edit' || mode === 'preview') && (
            <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 rotate-180" /> {activeSequence ? 'Back to sequence' : 'Back to list'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Unsaved changes dialog */}
        <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
              <AlertDialogDescription>You have unsaved changes. Do you want to discard them?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                setHasUnsavedChanges(false);
                setShowUnsavedDialog(false);
                pendingNavAction?.();
              }}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deactivate confirmation */}
        <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change template status</AlertDialogTitle>
              <AlertDialogDescription>
                {formData.is_active
                  ? 'Deactivating this template will prevent it from being used in workflows.'
                  : 'Activating this template will make it available for use in workflows.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                updateField('is_active', !formData.is_active);
                setShowDeactivateDialog(false);
              }}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {mode === 'list' && (
          <TemplateList
            standalone={filteredStandalone}
            sequences={filteredSequences}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            isAdmin={isAdmin}
            onSelect={handleSelectTemplate}
            onDuplicate={handleDuplicate}
            onToggle={(t) => toggleTemplate.mutate({ id: t.id, is_active: !t.is_active })}
            onOpenSequence={handleOpenSequence}
          />
        )}

        {mode === 'sequence' && activeSequence && (
          <SequenceDetailView
            sequence={activeSequence}
            isAdmin={isAdmin}
            onSelectStep={handleSelectTemplate}
            onToggleStep={(t) => toggleTemplate.mutate({ id: t.id, is_active: !t.is_active })}
          />
        )}

        {mode === 'edit' && (
          <TemplateEditor
            formData={formData}
            updateField={updateField}
            isAdmin={isAdmin}
            isSaving={saveTemplate.isPending}
            hasUnsavedChanges={hasUnsavedChanges}
            detectedTags={detectedTags}
            onSave={handleSave}
            onPreview={() => setMode('preview')}
            onToggleActive={() => setShowDeactivateDialog(true)}
          />
        )}

        {mode === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode('edit')} className="gap-1.5">
                <Edit3 className="h-3.5 w-3.5" /> Back to editor
              </Button>
            </div>
            <OutboundEmailPreview
              subjectLine={formData.subject_line}
              bodyHtml={formData.body_rich_text}
              title={formData.title}
              templateNumber={formData.template_number}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Sub-components ---------- */

function TemplateList({
  standalone, sequences, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  isAdmin, onSelect, onDuplicate, onToggle, onOpenSequence,
}: {
  standalone: OutboundEmailTemplate[];
  sequences: SequenceGroup[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: 'all' | 'active' | 'inactive';
  setStatusFilter: (v: 'all' | 'active' | 'inactive') => void;
  isAdmin: boolean;
  onSelect: (t: OutboundEmailTemplate) => void;
  onDuplicate: (t: OutboundEmailTemplate) => void;
  onToggle: (t: OutboundEmailTemplate) => void;
  onOpenSequence: (seq: SequenceGroup) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setSearchQuery('')}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {standalone.length === 0 && sequences.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No email templates found</p>
          <p className="text-xs mt-1">
            {searchQuery ? 'Try adjusting your search' : 'Create your first template to get started'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {/* Standalone templates, grouped by trigger stage */}
          {(() => {
            const groups = new Map<string, OutboundEmailTemplate[]>();
            for (const t of standalone) {
              const key = t.trigger_stage || 'Unassigned Stage';
              const arr = groups.get(key) || [];
              arr.push(t);
              groups.set(key, arr);
            }
            const stageOrder = [
              'Submitted to Lenders',
              'Terms Issued',
              'Agreement Signed',
              'In Due Diligence',
              'Funded / Invoiced',
              'Closed / Funded',
            ];
            const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
              const ia = stageOrder.indexOf(a);
              const ib = stageOrder.indexOf(b);
              if (ia === -1 && ib === -1) return a.localeCompare(b);
              if (ia === -1) return 1;
              if (ib === -1) return -1;
              return ia - ib;
            });
            return sortedKeys.map(stage => (
              <div key={`stage-${stage}`}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stage}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {groups.get(stage)!.length}
                  </Badge>
                </div>
                {groups.get(stage)!.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors group border-b last:border-b-0"
                    onClick={() => onSelect(t)}
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {t.template_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.category && <span>{t.category} · </span>}
                        {t.recipient && <span>To: {t.recipient} · </span>}
                        {t.subject_line}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.trigger_stage && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                          {t.trigger_stage}
                        </Badge>
                      )}
                      {t.approval_required && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                          Approval Required
                        </Badge>
                      )}
                      <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                      {format(new Date(t.updated_at), 'MMM d')}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onDuplicate(t); }} title="Duplicate">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onToggle(t); }} title={t.is_active ? 'Deactivate' : 'Activate'}>
                          <Switch checked={t.is_active} className="scale-75" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ));
          })()}

          {/* Sequence groups */}
          {sequences.map(seq => {
            const activeCount = seq.steps.filter(s => s.is_active).length;
            return (
              <div
                key={`seq-${seq.groupId}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors group"
                onClick={() => onOpenSequence(seq)}
              >
                <div className="w-8 h-8 rounded-md bg-accent/20 flex items-center justify-center shrink-0">
                  <Layers className="h-4 w-4 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{seq.sequenceName}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {seq.steps.length} steps
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Emails {seq.groupId}A–{seq.groupId}{String.fromCharCode(64 + seq.steps.length)} · {activeCount}/{seq.steps.length} active
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SequenceDetailView({
  sequence, isAdmin, onSelectStep, onToggleStep,
}: {
  sequence: SequenceGroup;
  isAdmin: boolean;
  onSelectStep: (t: OutboundEmailTemplate) => void;
  onToggleStep: (t: OutboundEmailTemplate) => void;
}) {
  const activeCount = sequence.steps.filter(s => s.is_active).length;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-base">{sequence.sequenceName}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {sequence.steps.length} steps · {activeCount} active · Emails {sequence.groupId}A–{sequence.groupId}{String.fromCharCode(64 + sequence.steps.length)}
        </p>
      </div>

      <div className="border rounded-lg divide-y">
        {sequence.steps.map((step, idx) => (
          <div
            key={step.id}
            className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50 cursor-pointer transition-colors group"
            onClick={() => onSelectStep(step)}
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                {step.sequence_step_key}
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <span className="hidden sm:block text-[10px] text-muted-foreground font-mono">
                Step {idx + 1}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{step.title}</p>
              <p className="text-xs text-muted-foreground truncate">{step.subject_line}</p>
            </div>
            <Badge variant={step.is_active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
              {step.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => { e.stopPropagation(); onToggleStep(step); }}>
                <Switch checked={step.is_active} className="scale-75" />
              </Button>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({
  formData, updateField, isAdmin, isSaving, hasUnsavedChanges, detectedTags,
  onSave, onPreview, onToggleActive,
}: {
  formData: any;
  updateField: (key: string, value: any) => void;
  isAdmin: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  detectedTags: string[];
  onSave: () => void;
  onPreview: () => void;
  onToggleActive: () => void;
}) {
  const disabled = !isAdmin;
  const isSequenceStep = formData.template_type === 'sequence_step';

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">
            {isSequenceStep
              ? `Edit Step ${formData.sequence_group_id}${formData.sequence_step_key}`
              : formData.id ? `Edit Template #${formData.template_number}` : 'New Template'
            }
          </h3>
          {isSequenceStep && (
            <Badge variant="outline" className="text-[10px]">Sequence Step</Badge>
          )}
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Unsaved</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPreview} className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={onSave} disabled={isSaving || !formData.title.trim() || !formData.subject_line.trim()} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Metadata fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Email Number</Label>
          <Input
            type="number"
            min={1}
            value={formData.template_number}
            onChange={e => updateField('template_number', parseInt(e.target.value) || 1)}
            disabled={disabled || isSequenceStep}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            value={formData.title}
            onChange={e => updateField('title', e.target.value)}
            placeholder="e.g. Lender Submission Confirmation"
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Sequence Name</Label>
          <Input
            value={formData.sequence_name}
            onChange={e => updateField('sequence_name', e.target.value)}
            placeholder="Optional sequence name"
            disabled={disabled || isSequenceStep}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Status</Label>
            <div className="flex items-center gap-2 h-8">
              <Switch
                checked={formData.is_active}
                onCheckedChange={() => isAdmin && onToggleActive()}
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">{formData.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subject line */}
      <div className="space-y-1.5">
        <Label className="text-xs">Subject Line</Label>
        <Input
          value={formData.subject_line}
          onChange={e => updateField('subject_line', e.target.value)}
          placeholder="e.g. [COMPANY NAME] & 5TH LINE"
          disabled={disabled}
          className="h-8 text-sm"
        />
      </div>

      {/* Automation metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Trigger Deal Stage</Label>
          <Input
            value={formData.trigger_stage}
            onChange={e => updateField('trigger_stage', e.target.value)}
            placeholder="e.g. Submitted to Lenders"
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cadence</Label>
          <Input
            value={formData.cadence}
            onChange={e => updateField('cadence', e.target.value)}
            placeholder="e.g. One Off, Biweekly"
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Recipient</Label>
          <Select
            value={formData.recipient || 'unset'}
            onValueChange={v => updateField('recipient', v === 'unset' ? '' : v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select recipient" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">—</SelectItem>
              <SelectItem value="Client">Client</SelectItem>
              <SelectItem value="Lender">Lender</SelectItem>
              <SelectItem value="Internal">Internal</SelectItem>
              <SelectItem value="Referral Partner">Referral Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Input
            value={formData.category}
            onChange={e => updateField('category', e.target.value)}
            placeholder="e.g. Payment, From FLEx"
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Approval Required</Label>
          <div className="flex items-center gap-2 h-8">
            <Switch
              checked={formData.approval_required}
              onCheckedChange={v => updateField('approval_required', v)}
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">
              {formData.approval_required ? 'Manager approval required' : 'Auto-send allowed'}
            </span>
          </div>
        </div>
      </div>

      {/* Rich text editor */}
      <div className="space-y-1.5">
        <Label className="text-xs">Email Body</Label>
        <OutboundEmailBodyEditor
          content={formData.body_rich_text}
          onChange={val => updateField('body_rich_text', val)}
          disabled={disabled}
        />
      </div>

      {/* Detected merge tags */}
      {detectedTags.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Detected Merge Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {detectedTags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] font-mono">{tag}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
