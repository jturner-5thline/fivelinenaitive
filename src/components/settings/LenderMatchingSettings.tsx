import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  TouchSensor,
  useSensor, 
  useSensors,
  DragEndEvent 
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw, Save, Loader2, Target, Scale, AlertTriangle, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLenderMatchingConfig, MatchingCriterion, LenderMatchingConfig } from '@/hooks/useLenderMatchingConfig';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface SortableCriterionProps {
  criterion: MatchingCriterion;
  onToggle: (id: string) => void;
  onWeightChange: (id: string, weight: number) => void;
}

function SortableCriterion({ criterion, onToggle, onWeightChange }: SortableCriterionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: criterion.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 p-3 bg-muted/50 rounded-lg border",
        isDragging && "opacity-50 shadow-lg",
        !criterion.enabled && "opacity-60"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium text-sm", !criterion.enabled && "text-muted-foreground")}>
            {criterion.label}
          </span>
          <Badge variant="outline" className="text-xs">
            Priority {criterion.position}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-[140px]">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Weight:</Label>
          <Slider
            value={[criterion.weight]}
            onValueChange={([value]) => onWeightChange(criterion.id, value)}
            max={100}
            min={0}
            step={5}
            className="w-20"
            disabled={!criterion.enabled}
          />
          <span className="text-xs font-mono w-8 text-right">{criterion.weight}</span>
        </div>

        <Switch
          checked={criterion.enabled}
          onCheckedChange={() => onToggle(criterion.id)}
        />
      </div>
    </div>
  );
}

export function LenderMatchingSettings() {
  const { config, isLoading, isSaving, saveConfig, resetToDefaults } = useLenderMatchingConfig();
  const [localConfig, setLocalConfig] = useState<LenderMatchingConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (config && !localConfig) {
      setLocalConfig(config);
    }
  }, [config, localConfig]);

  useEffect(() => {
    if (localConfig && config) {
      const configChanged = JSON.stringify(localConfig) !== JSON.stringify(config);
      setHasChanges(configChanged);
    }
  }, [localConfig, config]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && localConfig) {
      const oldIndex = localConfig.criteria.findIndex((c) => c.id === active.id);
      const newIndex = localConfig.criteria.findIndex((c) => c.id === over.id);

      const newCriteria = arrayMove(localConfig.criteria, oldIndex, newIndex).map(
        (c, index) => ({ ...c, position: index + 1 })
      );

      setLocalConfig({ ...localConfig, criteria: newCriteria });
    }
  };

  const handleToggle = (id: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      criteria: localConfig.criteria.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled } : c
      ),
    });
  };

  const handleWeightChange = (id: string, weight: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      criteria: localConfig.criteria.map((c) =>
        c.id === id ? { ...c, weight } : c
      ),
    });
  };

  const handlePenaltyChange = (key: keyof LenderMatchingConfig['penalties'], value: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      penalties: { ...localConfig.penalties, [key]: value },
    });
  };

  const handleSave = async () => {
    if (!localConfig) return;
    const success = await saveConfig(localConfig);
    if (success) {
      setHasChanges(false);
    }
  };

  const handleReset = async () => {
    const success = await resetToDefaults();
    if (success) {
      setLocalConfig(null);
      setHasChanges(false);
    }
  };

  if (isLoading || !localConfig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Funding Source Matching Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedCriteria = [...localConfig.criteria].sort((a, b) => a.position - b.position);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1">
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Funding Source Matching Algorithm
                </CardTitle>
                <CardDescription>
                  Configure how lenders are scored and suggested for deals
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleSave(); }}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
        {/* Matching Criteria Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">Matching Criteria</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag to reorder priority. Higher weight = more influence on matching score.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedCriteria.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedCriteria.map((criterion) => (
                  <SortableCriterion
                    key={criterion.id}
                    criterion={criterion}
                    onToggle={handleToggle}
                    onWeightChange={handleWeightChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <Separator />

        {/* Penalties Section */}
        <Accordion type="single" collapsible>
          <AccordionItem value="penalties" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="font-medium text-sm">Penalty Settings</span>
                <span className="text-xs text-muted-foreground">(Advanced)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground mb-4">
                Negative scores applied when lenders don't match criteria. More negative = stronger exclusion.
              </p>
              <div className="grid gap-4">
                {Object.entries(localConfig.penalties).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <Label className="text-sm capitalize">
                      {key.replace(/_/g, ' ')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={value}
                        onChange={(e) =>
                          handlePenaltyChange(
                            key as keyof LenderMatchingConfig['penalties'],
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="w-20 text-right"
                        max={0}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button
              variant="gradient"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Changes
            </Button>
          </div>
        )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
