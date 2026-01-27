import { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Plus, Pencil, Trash2, GitBranch, Star, Save, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
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
import { STAGE_CONFIG } from '@/types/deal';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface DealStageOption {
  id: string;
  label: string;
  color: string;
}

const STAGE_COLORS = [
  { value: 'bg-slate-500', label: 'Slate' },
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-indigo-500', label: 'Indigo' },
  { value: 'bg-violet-500', label: 'Violet' },
  { value: 'bg-purple-500', label: 'Purple' },
  { value: 'bg-fuchsia-500', label: 'Fuchsia' },
  { value: 'bg-amber-500', label: 'Amber' },
  { value: 'bg-cyan-500', label: 'Cyan' },
  { value: 'bg-green-500', label: 'Green' },
  { value: 'bg-red-500', label: 'Red' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-yellow-500', label: 'Yellow' },
];

// Convert STAGE_CONFIG to array format for default stages
const defaultStages: DealStageOption[] = Object.entries(STAGE_CONFIG).map(([id, config]) => ({
  id,
  label: config.label,
  color: config.color,
}));

interface SortableStageItemProps {
  stage: DealStageOption;
  onEdit: (stage: DealStageOption) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  isDefault: boolean;
  isAdmin: boolean;
}

function SortableStageItem({ stage, onEdit, onDelete, onSetDefault, isDefault, isAdmin }: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 bg-muted/50 rounded-lg ${isDragging ? 'opacity-50' : ''}`}
    >
      {isAdmin && (
        <button
          className="cursor-grab hover:bg-muted p-1 rounded"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <div className={`w-3 h-3 rounded-full ${stage.color}`} />
      <span className="flex-1 text-sm">{stage.label}</span>
      {isDefault && (
        <Badge variant="secondary" className="text-xs">
          Default
        </Badge>
      )}
      {isAdmin && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${isDefault ? 'text-primary' : ''}`}
            onClick={() => onSetDefault(stage.id)}
            title={isDefault ? 'Clear default' : 'Set as default'}
          >
            <Star className={`h-3 w-3 ${isDefault ? 'fill-current' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(stage)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(stage.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
}

interface DealStagesSettingsProps {
  isAdmin?: boolean;
}

// Helper to validate and parse stages from JSON
const parseStagesFromJson = (json: Json | null): DealStageOption[] | null => {
  if (!json || !Array.isArray(json)) return null;
  
  const validStages = json.filter((item): item is { id: string; label: string; color: string } => {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).id === 'string' &&
      typeof (item as Record<string, unknown>).label === 'string' &&
      typeof (item as Record<string, unknown>).color === 'string'
    );
  });
  
  return validStages.length > 0 ? validStages : null;
};

export function DealStagesSettings({ isAdmin = true }: DealStagesSettingsProps) {
  // Local state for editing
  const [stages, setStages] = useState<DealStageOption[]>(defaultStages);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track saved state for comparison
  const [savedStages, setSavedStages] = useState<DealStageOption[]>(defaultStages);
  const [savedDefaultStageId, setSavedDefaultStageId] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<DealStageOption | null>(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('bg-slate-500');
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('dealStagesSettingsOpen');
    return saved ? JSON.parse(saved) : true;
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load from database on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data: membership } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership?.company_id) {
          setCompanyId(membership.company_id);

          const { data: settings } = await supabase
            .from('company_settings')
            .select('default_deal_stage_id, deal_stages')
            .eq('company_id', membership.company_id)
            .maybeSingle();

          const dbStages = parseStagesFromJson(settings?.deal_stages ?? null);
          if (dbStages) {
            setStages(dbStages);
            setSavedStages(dbStages);
          }
          
          if (settings?.default_deal_stage_id) {
            setDefaultStageId(settings.default_deal_stage_id);
            setSavedDefaultStageId(settings.default_deal_stage_id);
          }
        }
      } catch (error) {
        console.error('Error fetching deal stages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Check if there are unsaved changes
  const hasUnsavedChanges = 
    JSON.stringify(stages) !== JSON.stringify(savedStages) ||
    defaultStageId !== savedDefaultStageId;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    localStorage.setItem('dealStagesSettingsOpen', JSON.stringify(isOpen));
  }, [isOpen]);

  const openAddDialog = () => {
    setEditingStage(null);
    setLabel('');
    setColor('bg-slate-500');
    setIsDialogOpen(true);
  };

  const openEditDialog = (stage: DealStageOption) => {
    setEditingStage(stage);
    setLabel(stage.label);
    setColor(stage.color);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast.error('Stage name is required');
      return;
    }

    if (editingStage) {
      setStages(stages.map(s => s.id === editingStage.id ? { ...s, label: label.trim(), color } : s));
    } else {
      const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      setStages([...stages, { id, label: label.trim(), color }]);
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (stages.length <= 1) {
      toast.error('You must have at least one stage');
      return;
    }
    if (defaultStageId === id) {
      setDefaultStageId(null);
    }
    setStages(stages.filter(s => s.id !== id));
  };

  const handleSetDefault = (stageId: string) => {
    setDefaultStageId(defaultStageId === stageId ? null : stageId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((s) => s.id === active.id);
      const newIndex = stages.findIndex((s) => s.id === over.id);
      setStages(arrayMove(stages, oldIndex, newIndex));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem('dealStages', JSON.stringify(stages));
      if (defaultStageId) {
        localStorage.setItem('defaultDealStageId', defaultStageId);
      } else {
        localStorage.removeItem('defaultDealStageId');
      }

      // Save to database if user has a company
      if (companyId) {
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('company_settings')
            .update({ 
              deal_stages: stages as unknown as Json,
              default_deal_stage_id: defaultStageId 
            })
            .eq('company_id', companyId);
        } else {
          await supabase
            .from('company_settings')
            .insert({ 
              company_id: companyId, 
              deal_stages: stages as unknown as Json,
              default_deal_stage_id: defaultStageId 
            });
        }
      }

      setSavedStages(stages);
      setSavedDefaultStageId(defaultStageId);
      toast.success('Deal stages saved successfully');
    } catch (error) {
      console.error('Error saving deal stages:', error);
      toast.error('Failed to save deal stages');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setStages(savedStages);
    setDefaultStageId(savedDefaultStageId);
  };

  const SaveBar = () => {
    if (!hasUnsavedChanges && !isSaving) return null;
    
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground">
          {isSaving ? 'Saving changes...' : 'You have unsaved changes'}
        </p>
        <div className="flex items-center gap-2">
          {!isSaving && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            variant="gradient"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Deal Stages</CardTitle>
              <CardDescription>Loading...</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Deal Stages</CardTitle>
                    <CardDescription>Configure the stages in your deal pipeline</CardDescription>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Top Save Bar */}
              <SaveBar />
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stages.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {stages.map((stage) => (
                      <SortableStageItem
                        key={stage.id}
                        stage={stage}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                        onSetDefault={handleSetDefault}
                        isDefault={defaultStageId === stage.id}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openAddDialog}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stage
                </Button>
              )}
              
              {/* Bottom Save Bar */}
              <SaveBar />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStage ? 'Edit Stage' : 'Add Stage'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-label">Stage Name</Label>
              <Input
                id="stage-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., In Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-8 h-8 rounded-full ${c.value} ${
                      color === c.value
                        ? 'ring-2 ring-offset-2 ring-primary'
                        : ''
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingStage ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
