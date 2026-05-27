import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { GripVertical, Eye, EyeOff, RotateCcw, ChevronDown, LayoutList, Lock, Plus, X, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useDealInfoFieldOrder, DEAL_INFO_FIELD_DEFINITIONS, DEFAULT_FIELD_ORDER, DealInfoFieldId } from '@/hooks/useDealInfoFieldOrder';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DealInfoFieldsSettingsProps {
  isAdmin?: boolean;
}

function SortableFieldItem({
  fieldId,
  label,
  visible,
  canHide,
  lockedVisible,
  canRemove,
  readOnly,
  onToggle,
  onRemove,
}: {
  fieldId: string;
  label: string;
  visible: boolean;
  canHide: boolean;
  lockedVisible?: boolean;
  canRemove?: boolean;
  readOnly?: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldId, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        !visible ? 'opacity-60' : ''
      }`}
    >
      <button
        className={`text-muted-foreground hover:text-foreground ${
          readOnly ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'
        }`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {!canHide ? (
          <span className="text-xs text-muted-foreground italic">Required</span>
        ) : lockedVisible ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                  <Lock className="h-3 w-3" />
                  Always shown
                </span>
              </TooltipTrigger>
              <TooltipContent>This field is always shown and cannot be hidden.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Switch
            checked={visible}
            onCheckedChange={onToggle}
            disabled={readOnly}
            aria-label={`Toggle ${label} visibility`}
          />
        )}
        {canRemove && !readOnly && onRemove && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onRemove}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Remove from list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export function DealInfoFieldsSettings({ isAdmin = true }: DealInfoFieldsSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();
  const readOnly = !isAdmin;

  const { data: aiSettings } = useQuery({
    queryKey: ['company_settings', companyId, 'ai_settings'],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('ai_settings')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.ai_settings ?? {}) as Record<string, any>;
    },
  });

  const fees = (aiSettings?.deal_info?.fees ?? {}) as Record<string, any>;
  const retainerEnabled = typeof fees.retainer_enabled === 'boolean' ? fees.retainer_enabled : true;
  const milestoneEnabled = typeof fees.milestone_enabled === 'boolean' ? fees.milestone_enabled : true;
  const totalFeeComputedOnly = typeof fees.total_fee_computed_only === 'boolean' ? fees.total_fee_computed_only : false;

  const updateFeeFlag = async (key: 'retainer_enabled' | 'milestone_enabled' | 'total_fee_computed_only', value: boolean) => {
    if (!companyId || readOnly) return;
    const base = (aiSettings ?? {}) as Record<string, any>;
    const cloned = JSON.parse(JSON.stringify(base));
    cloned.deal_info = cloned.deal_info ?? {};
    cloned.deal_info.fees = cloned.deal_info.fees ?? {};
    cloned.deal_info.fees[key] = value;
    const { error } = await supabase
      .from('company_settings')
      .upsert({ company_id: companyId, ai_settings: cloned }, { onConflict: 'company_id' });
    if (error) {
      toast({ title: 'Failed to update setting', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['company_settings', companyId, 'ai_settings'] });
    toast({ title: 'Setting updated' });
  };

  const {
    fieldOrder,
    fieldVisibility,
    reorderFields,
    toggleFieldVisibility,
    isFieldVisible,
    removeField,
    addField,
    resetToDefault,
  } = useDealInfoFieldOrder();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fieldOrder.indexOf(active.id as DealInfoFieldId);
    const newIndex = fieldOrder.indexOf(over.id as DealInfoFieldId);
    const newOrder = arrayMove(fieldOrder, oldIndex, newIndex);
    reorderFields(newOrder);
    toast({ title: 'Field order updated' });
  };

  const handleReset = () => {
    if (readOnly) return;
    resetToDefault();
    toast({ title: 'Reset to defaults', description: 'Deal information fields have been reset to their default order and visibility.' });
  };

  const availableToAdd = DEAL_INFO_FIELD_DEFINITIONS.filter(f => !fieldOrder.includes(f.id));

  return (
    
      <Card>
        
          <CardHeader className="">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutList className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">Deal Information Fields</CardTitle>
                  <CardDescription>
                    {readOnly
                      ? 'View the fields shown on the Deal Information card. Only company admins can change this.'
                      : 'Configure which fields appear on the Deal Information card and their order'}
                  </CardDescription>
                </div>
              </div>
              
            </div>
          </CardHeader>
        
        
          <CardContent className="space-y-4">
            {readOnly && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                Admins only — you can view the current configuration but cannot make changes.
              </div>
            )}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hours &amp; Fees section</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Show Retainer Fee</p>
                  <p className="text-xs text-muted-foreground">When off, the Retainer Fee row is hidden from all users on this account.</p>
                </div>
                <Switch checked={retainerEnabled} disabled={readOnly} onCheckedChange={(v) => updateFeeFlag('retainer_enabled', v)} aria-label="Show Retainer Fee" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Show Milestone Fee</p>
                  <p className="text-xs text-muted-foreground">When off, the Milestone Fee row is hidden from all users on this account.</p>
                </div>
                <Switch checked={milestoneEnabled} disabled={readOnly} onCheckedChange={(v) => updateFeeFlag('milestone_enabled', v)} aria-label="Show Milestone Fee" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Total Fee uses computed value (success fee % × deal size)</p>
                  <p className="text-xs text-muted-foreground">When on, Total Fee is computed live as deal size × success fee % and ignores Retainer/Milestone.</p>
                </div>
                <Switch checked={totalFeeComputedOnly} disabled={readOnly} onCheckedChange={(v) => updateFeeFlag('total_fee_computed_only', v)} aria-label="Total Fee computed only" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {readOnly
                  ? 'Drag, toggle, add, and remove are disabled for non-admins.'
                  : 'Drag to reorder. Toggle visibility. Narrative and Deal Owner are always shown. Changes apply to all deals in your company.'}
              </p>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={readOnly} className="gap-1.5 shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={fieldOrder} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {fieldOrder.map(fieldId => {
                    const config = DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId);
                    if (!config) return null;
                    const canRemove = config.canHide && !config.lockedVisible;
                    return (
                      <SortableFieldItem
                        key={fieldId}
                        fieldId={fieldId}
                        label={config.label}
                        visible={isFieldVisible(fieldId)}
                        canHide={config.canHide}
                        lockedVisible={config.lockedVisible}
                        canRemove={canRemove}
                        readOnly={readOnly}
                        onToggle={() => toggleFieldVisibility(fieldId)}
                        onRemove={canRemove ? () => {
                          removeField(fieldId);
                          toast({ title: 'Field removed', description: `${config.label} is no longer in the Deal Information list.` });
                        } : undefined}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {!readOnly && (
              <div className="pt-1">
                {availableToAdd.length === 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button variant="outline" size="sm" disabled className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" />
                            Add field
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>All available fields added.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Add field
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {availableToAdd.map(f => (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => {
                            addField(f.id);
                            toast({ title: 'Field added', description: `${f.label} added to Deal Information.` });
                          }}
                        >
                          {f.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </CardContent>
        
      </Card>
    
  );
}
