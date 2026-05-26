import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Archive, Trash2, ExternalLink, ArrowRightLeft, Plus, Loader2 } from 'lucide-react';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { Deal, DealStatus, DealStage, EngagementType, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG, ExclusivityType } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { MoveToPipelineDialog } from './MoveToPipelineDialog';
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

interface DealEditDrawerProps {
  deal: Deal;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
}

export function DealEditDrawer({ deal, isOpen, onClose, onStatusChange }: DealEditDrawerProps) {
  const navigate = useNavigate();
  const { updateDeal, deleteDeal } = useDealsContext();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { dealTypes } = useDealTypes();
  const { getStageConfig } = useDealStages();
  const { isAdmin } = useAdminRole();
  const { toast } = useToast();
  const { pipelines } = usePipelineContext();
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const globalStageConfig = getStageConfig();

  // Use pipeline-specific stages if deal belongs to a pipeline
  const dealPipeline = deal.pipelineId ? pipelines.find(p => p.id === deal.pipelineId) : null;
  const stageEntries = dealPipeline?.stages?.length
    ? dealPipeline.stages.map(s => [s.id, { label: s.label, color: s.color }] as const)
    : Object.entries(globalStageConfig);
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Animation states - keep mounted during exit animation
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Small delay to ensure the element is mounted before animating
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for exit animation to complete before unmounting
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const { statusNotes, addStatusNote, deleteStatusNote, isLoading: isLoadingNotes } = useStatusNotes(isOpen ? deal.id : undefined);
  const [newStatusNote, setNewStatusNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  // Reset state when deal changes or drawer opens
  useEffect(() => {
    setHasUserEdited(false);
    setNewStatusNote('');
  }, [deal.id, isOpen]);

  // Pre-fill with the latest status note text
  useEffect(() => {
    if (!hasUserEdited && statusNotes.length > 0) {
      setNewStatusNote(htmlToPlainText(statusNotes[0].note));
    }
  }, [statusNotes, hasUserEdited]);

  const [formData, setFormData] = useState({
    company: deal.company,
    value: deal.value,
    status: deal.status,
    stage: deal.stage,
    engagementType: deal.engagementType,
    exclusivity: deal.exclusivity || '',
    manager: deal.manager || '',
    dealOwner: deal.dealOwner || '',
    referredBy: typeof deal.referredBy === 'string' ? deal.referredBy : deal.referredBy?.name || '',
    preSigningHours: deal.preSigningHours || 0,
    postSigningHours: deal.postSigningHours || 0,
  });

  const handleAddStatusNote = async () => {
    if (!newStatusNote.trim()) return;
    setIsAddingNote(true);
    try {
      await addStatusNote(newStatusNote.trim());
      setNewStatusNote('');
      setHasUserEdited(false);
    } finally {
      setIsAddingNote(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        company: deal.company,
        value: deal.value,
        status: deal.status,
        stage: deal.stage,
        engagementType: deal.engagementType,
        exclusivity: deal.exclusivity || '',
        manager: deal.manager || '',
        dealOwner: deal.dealOwner || '',
        referredBy: typeof deal.referredBy === 'string' ? deal.referredBy : deal.referredBy?.name || '',
        preSigningHours: deal.preSigningHours || 0,
        postSigningHours: deal.postSigningHours || 0,
      });
    }
  }, [deal, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build update object, handling referredBy as string for DB
      const updates: Partial<Deal> = {
        company: formData.company,
        value: formData.value,
        status: formData.status as DealStatus,
        stage: formData.stage as DealStage,
        engagementType: formData.engagementType as EngagementType,
        exclusivity: formData.exclusivity as ExclusivityType || undefined,
        manager: formData.manager || undefined,
        dealOwner: formData.dealOwner || undefined,
        preSigningHours: formData.preSigningHours,
        postSigningHours: formData.postSigningHours,
      };
      
      // Update deal without modifying referredBy (handled separately if needed)
      await updateDeal(deal.id, updates);
      toast({
        title: "Deal updated",
        description: "Your changes have been saved successfully.",
      });
      onClose();
    } catch (error) {
      console.error('Failed to update deal:', error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = () => {
    onStatusChange(deal.id, 'archived');
    onClose();
  };

  const handleDelete = () => {
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDeal(deal.id);
      toast({
        title: 'Deal deleted',
        description: `“${deal.company}” has been removed.`,
      });
      setIsDeleteOpen(false);
      onClose();
      // If we're on this deal's detail page, navigate back to deals list
      if (window.location.pathname.startsWith(`/deal/${deal.id}`)) {
        navigate('/deals');
      }
    } catch (err: any) {
      console.error('Failed to delete deal:', err);
      toast({
        title: 'Error deleting deal',
        description: err?.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isVisible) return null;

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-[9998] transition-opacity duration-200 ease-out",
          isAnimating ? "opacity-100" : "opacity-0"
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      
      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-2 right-2 w-[400px] max-w-[90vw] rounded-xl bg-card dark:bg-[hsl(240,20%,8%)] dark:bg-[image:radial-gradient(circle_at_bottom_right,_hsl(280,60%,45%,0.25)_0%,_transparent_50%)] shadow-xl z-[9999] border border-border/50 dark:border-[hsl(263,45%,40%,0.5)] dark:shadow-[-4px_0_16px_hsl(263,60%,50%,0.08)]",
          "transition-transform duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isAnimating ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Edit Deal</h2>
              <button
                onClick={() => {
                  onClose();
                  navigate(`/deal/${deal.id}`);
                }}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                Go to Deal
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="company">Company Name</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>

            {/* Value */}
            <div className="space-y-2">
              <Label htmlFor="value">Deal Value ({preferences.currency})</Label>
              <Input
                id="value"
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as DealStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Notes */}
            <div className="space-y-2">
              <Label>Status Notes</Label>
              <div className="flex items-start gap-2">
                <Textarea
                  id="statusNote"
                  value={newStatusNote}
                  onChange={(e) => { setNewStatusNote(e.target.value); setHasUserEdited(true); }}
                  placeholder="Add a status note..."
                  rows={2}
                  className="resize-none flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0 self-end h-9 w-9"
                  onClick={handleAddStatusNote}
                  disabled={!newStatusNote.trim() || isAddingNote}
                >
                  {isAddingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              {statusNotes.length > 0 && (
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                  {statusNotes.map((sn) => (
                    <div key={sn.id} className="group flex items-start gap-2 text-xs p-2 rounded bg-muted/40 border border-border/50">
                      <span className="flex-1 text-muted-foreground break-words">
                        {htmlToPlainText(sn.note)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {format(new Date(sn.created_at), 'MMM d')}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-destructive hover:text-destructive"
                        onClick={() => deleteStatusNote(sn.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stage */}
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select
                value={formData.stage}
                onValueChange={(value) => setFormData({ ...formData, stage: value as DealStage })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageEntries.map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Engagement Type */}
            <div className="space-y-2">
              <Label>Engagement Type</Label>
              <Select
                value={formData.engagementType}
                onValueChange={(value) => setFormData({ ...formData, engagementType: value as EngagementType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exclusivity */}
            <div className="space-y-2">
              <Label>Exclusivity</Label>
              <Select
                value={formData.exclusivity || 'none'}
                onValueChange={(value) => setFormData({ ...formData, exclusivity: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select exclusivity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {Object.entries(EXCLUSIVITY_CONFIG).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manager */}
            <div className="space-y-2">
              <Label htmlFor="manager">Manager</Label>
              <Input
                id="manager"
                value={formData.manager}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                placeholder="Assign a manager"
              />
            </div>

            {/* Deal Owner */}
            <div className="space-y-2">
              <Label htmlFor="dealOwner">Deal Owner</Label>
              <Input
                id="dealOwner"
                value={formData.dealOwner}
                onChange={(e) => setFormData({ ...formData, dealOwner: e.target.value })}
                placeholder="Assign a deal owner"
              />
            </div>

            {/* Hours Section */}
            <div className="space-y-2">
              <Label>Hours</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="preSigningHours" className="text-xs text-muted-foreground">Pre-Signing</Label>
                  <Input
                    id="preSigningHours"
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.preSigningHours}
                    onChange={(e) => setFormData({ ...formData, preSigningHours: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="postSigningHours" className="text-xs text-muted-foreground">Post-Signing</Label>
                  <Input
                    id="postSigningHours"
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.postSigningHours}
                    onChange={(e) => setFormData({ ...formData, postSigningHours: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {/* Referred By - Display only since it's a complex object */}
            {deal.referredBy && (
              <div className="space-y-2">
                <Label>Referred By</Label>
                <div className="text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted/50">
                  {typeof deal.referredBy === 'string' ? deal.referredBy : deal.referredBy.name}
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="pt-4 border-t border-border space-y-2">
              <Label className="text-muted-foreground">Actions</Label>
              <div className="flex gap-2 flex-wrap">
                {pipelines.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPipelineDialogOpen(true)}
                    className="flex-1"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Move to Pipeline
                  </Button>
                )}
                {deal.status !== 'archived' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleArchive}
                    className="flex-1"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    className="flex-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
            <MoveToPipelineDialog
              dealId={deal.id}
              dealName={deal.company}
              currentPipelineId={deal.pipelineId}
              isOpen={isPipelineDialogOpen}
              onClose={() => setIsPipelineDialogOpen(false)}
            />
            <AlertDialog open={isDeleteOpen} onOpenChange={(o) => !isDeleting && setIsDeleteOpen(o)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{deal.company}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this deal and its related records. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Deleting…' : 'Delete deal'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 p-4 border-t border-border">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(drawerContent, document.body);
}
