import { useState, useEffect } from 'react';
import { X, Archive, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Deal, DealStatus, DealStage, EngagementType, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG, ExclusivityType } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { cn } from '@/lib/utils';

interface DealEditDrawerProps {
  deal: Deal;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
}

export function DealEditDrawer({ deal, isOpen, onClose, onStatusChange }: DealEditDrawerProps) {
  const navigate = useNavigate();
  const { updateDeal } = useDealsContext();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { dealTypes } = useDealTypes();
  const { getStageConfig } = useDealStages();
  const { isAdmin } = useAdminRole();
  const dynamicStageConfig = getStageConfig();

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
  });

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
      };
      
      // Update deal without modifying referredBy (handled separately if needed)
      await updateDeal(deal.id, updates);
      onClose();
    } catch (error) {
      console.error('Failed to update deal:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = () => {
    onStatusChange(deal.id, 'archived');
    onClose();
  };

  const handleDelete = () => {
    navigate(`/deal/${deal.id}?action=delete`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        className={cn(
          "fixed right-2 top-2 bottom-2 w-[400px] max-w-[90vw] bg-background border border-border rounded-xl shadow-xl z-50",
          "transform transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Edit Deal</h2>
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
                  {Object.entries(dynamicStageConfig).map(([key, { label }]) => (
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
              <div className="flex gap-2">
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
}
