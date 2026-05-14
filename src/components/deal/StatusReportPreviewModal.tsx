import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileText, Mail, Plus, X, Eye, EyeOff } from 'lucide-react';
import { Deal, LENDER_STAGE_CONFIG } from '@/types/deal';
import type { StatusReportEditableContent, LenderStageConfig, OutstandingItem } from '@/utils/dealExport';

export type { StatusReportEditableContent };

interface StatusReportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  configuredStages?: LenderStageConfig[];
  configuredSubstages?: LenderStageConfig[];
  outstandingItems?: OutstandingItem[];
  onExport: (content: StatusReportEditableContent) => void;
}

export function StatusReportPreviewModal({
  open,
  onOpenChange,
  deal,
  configuredStages,
  outstandingItems,
  onExport,
}: StatusReportPreviewModalProps) {
  // Initialize content from deal data
  const initialContent = useMemo(() => {
    // Parse notes into bullet points
    const rawNotes = deal.notes || '';
    const strippedNotes = rawNotes.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    const bullets = strippedNotes.split(/\n+/).map(s => s.trim()).filter(Boolean);

    // Build lender rows
    const activeLenders = (deal.lenders || []).filter(l => l.trackingStatus !== 'passed');
    const lenderRows = activeLenders.map(lender => {
      const stageName = configuredStages?.find(s => s.id === lender.stage)?.label ||
        LENDER_STAGE_CONFIG[lender.stage]?.label || lender.stage;
      return {
        name: lender.name,
        processStage: stageName,
        focusAreas: '',
        challenges: '',
        nextAction: lender.notes || '',
      };
    });

    // Milestones
    const completed = (deal.milestones || []).filter(m => m.completed).map(m => m.title);
    const upcoming = (deal.milestones || []).filter(m => !m.completed).map(m => m.title);

    // Outstanding items
    const pending = (outstandingItems || []).filter(i => !i.completed && !i.received);
    const actionText = pending.length > 0
      ? pending.map(i => i.text).join('\n')
      : 'No action items at this time.';

    return {
      keyUpdates: bullets.length > 0 ? bullets : [''],
      lenderRows,
      completedMilestones: completed.length > 0 ? completed : [],
      nextSteps: upcoming.length > 0 ? upcoming : [],
      actionItems: actionText,
      sectionsVisible: {
        keyUpdates: true,
        lenderTable: true,
        pipelineSnapshot: true,
        milestones: true,
        nextSteps: true,
        actionItems: true,
      },
    };
  }, [deal, configuredStages, outstandingItems]);

  const [content, setContent] = useState<StatusReportEditableContent>(initialContent);

  // Reset when modal opens
  const handleOpenChange = (v: boolean) => {
    if (v) setContent(initialContent);
    onOpenChange(v);
  };

  const updateBullet = (index: number, value: string) => {
    const updated = [...content.keyUpdates];
    updated[index] = value;
    setContent(prev => ({ ...prev, keyUpdates: updated }));
  };

  const addBullet = () => {
    setContent(prev => ({ ...prev, keyUpdates: [...prev.keyUpdates, ''] }));
  };

  const removeBullet = (index: number) => {
    setContent(prev => ({ ...prev, keyUpdates: prev.keyUpdates.filter((_, i) => i !== index) }));
  };

  const updateLenderRow = (index: number, field: string, value: string) => {
    const updated = [...content.lenderRows];
    updated[index] = { ...updated[index], [field]: value };
    setContent(prev => ({ ...prev, lenderRows: updated }));
  };

  const addMilestone = () => {
    setContent(prev => ({ ...prev, completedMilestones: [...prev.completedMilestones, ''] }));
  };

  const removeMilestone = (index: number) => {
    setContent(prev => ({ ...prev, completedMilestones: prev.completedMilestones.filter((_, i) => i !== index) }));
  };

  const updateMilestone = (index: number, value: string) => {
    const updated = [...content.completedMilestones];
    updated[index] = value;
    setContent(prev => ({ ...prev, completedMilestones: updated }));
  };

  const addNextStep = () => {
    setContent(prev => ({ ...prev, nextSteps: [...prev.nextSteps, ''] }));
  };

  const removeNextStep = (index: number) => {
    setContent(prev => ({ ...prev, nextSteps: prev.nextSteps.filter((_, i) => i !== index) }));
  };

  const updateNextStep = (index: number, value: string) => {
    const updated = [...content.nextSteps];
    updated[index] = value;
    setContent(prev => ({ ...prev, nextSteps: updated }));
  };

  const toggleSection = (key: keyof StatusReportEditableContent['sectionsVisible']) => {
    setContent(prev => ({
      ...prev,
      sectionsVisible: { ...prev.sectionsVisible, [key]: !prev.sectionsVisible[key] },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="popup-shell-surface max-w-4xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20 rounded-2xl z-[2147483600]"
        overlayClassName="z-[2147483500]"
      >
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Status Report Preview
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Edit content below before exporting. Toggle sections on/off with the eye icon.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-3 py-3">
            {/* Title Preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 w-full bg-primary rounded" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">5ᵀᴴ | LINE</p>
              <h2 className="text-lg font-bold mt-1">
                {deal.company} — Status Update:{' '}
                <span className="text-primary">
                  {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </h2>
            </div>

            {/* Key Updates */}
            <SectionBlock
              title="Key Updates"
              visible={content.sectionsVisible.keyUpdates}
              onToggle={() => toggleSection('keyUpdates')}
            >
              <div className="space-y-2">
                {content.keyUpdates.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                    <AutoGrowTextarea
                      value={bullet}
                      onChange={(v) => updateBullet(i, v)}
                      placeholder="Enter update... (Shift+Enter for a new line)"
                      className="min-h-[88px] text-sm leading-relaxed py-2 align-top whitespace-pre-wrap break-words"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() => removeBullet(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addBullet} className="gap-1">
                  <Plus className="h-3 w-3" /> Add bullet
                </Button>
              </div>
            </SectionBlock>

            {/* Pipeline Snapshot */}
            <SectionBlock
              title="Lender Pipeline Snapshot"
              visible={content.sectionsVisible.pipelineSnapshot}
              onToggle={() => toggleSection('pipelineSnapshot')}
            >
              <p className="text-xs text-muted-foreground">
                Auto-generated from lender tracking statuses. Lenders are grouped into On Deck, In Review, Terms Issued, and Passed.
              </p>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[
                  { label: 'On Deck', color: 'border-blue-400', lenders: (deal.lenders || []).filter(l => l.trackingStatus === 'on-deck') },
                  { label: 'In Review', color: 'border-blue-400', lenders: (deal.lenders || []).filter(l => l.trackingStatus === 'active') },
                  { label: 'Terms Issued', color: 'border-green-400', lenders: (deal.lenders || []).filter(l => l.stage === 'term-sheets' || l.stage === 'draft-terms') },
                  { label: 'Passed', color: 'border-red-400', lenders: (deal.lenders || []).filter(l => l.trackingStatus === 'passed') },
                ].map((group) => (
                  <div key={group.label} className={`rounded-md border-2 ${group.color} bg-muted/30 p-2`}>
                    <p className="text-xs font-semibold">{group.label} ({group.lenders.length})</p>
                    {group.lenders.map((l, i) => (
                      <p key={l.id} className="text-xs text-muted-foreground">{i + 1}. {l.name}</p>
                    ))}
                  </div>
                ))}
              </div>
            </SectionBlock>

            {/* Recent Milestones */}
            <SectionBlock
              title="Recent Milestones"
              visible={content.sectionsVisible.milestones}
              onToggle={() => toggleSection('milestones')}
            >
              <div className="space-y-2">
                {content.completedMilestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={m}
                      onChange={e => updateMilestone(i, e.target.value)}
                      className="text-sm"
                      placeholder="Milestone description..."
                    />
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeMilestone(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addMilestone} className="gap-1">
                  <Plus className="h-3 w-3" /> Add milestone
                </Button>
              </div>
            </SectionBlock>

            {/* Next Steps */}
            <SectionBlock
              title="Next Steps"
              visible={content.sectionsVisible.nextSteps}
              onToggle={() => toggleSection('nextSteps')}
            >
              <div className="space-y-2">
                {content.nextSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={s}
                      onChange={e => updateNextStep(i, e.target.value)}
                      className="text-sm"
                      placeholder="Next step..."
                    />
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeNextStep(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addNextStep} className="gap-1">
                  <Plus className="h-3 w-3" /> Add step
                </Button>
              </div>
            </SectionBlock>

            {/* What We Need From You */}
            <SectionBlock
              title="What We Need From You"
              visible={content.sectionsVisible.actionItems}
              onToggle={() => toggleSection('actionItems')}
            >
              <Textarea
                value={content.actionItems}
                onChange={e => setContent(prev => ({ ...prev, actionItems: e.target.value }))}
                className="text-sm min-h-[60px]"
                placeholder="Action items for the client..."
              />
            </SectionBlock>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="liquid-glass" size="sm" onClick={() => onExport(content)} className="gap-2">
            <Mail className="h-4 w-4" />
            Generate Status Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionBlock({
  title,
  visible,
  onToggle,
  children,
}: {
  title: string;
  visible: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-border p-3 ${!visible ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>
      {visible && children}
    </div>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 88)}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}
