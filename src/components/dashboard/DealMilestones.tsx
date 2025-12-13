import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Flag, ChevronDown, ChevronRight, Diamond } from 'lucide-react';
import { format } from 'date-fns';
import { DealMilestone } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DealMilestonesProps {
  milestones: DealMilestone[];
  onAdd: (milestone: Omit<DealMilestone, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<DealMilestone>) => void;
  onDelete: (id: string) => void;
}

export function DealMilestones({ milestones, onAdd, onUpdate, onDelete }: DealMilestonesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState<Date | undefined>();

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd({
      title: newTitle.trim(),
      dueDate: newDate?.toISOString(),
      completed: false,
    });
    setNewTitle('');
    setNewDate(undefined);
    setIsAdding(false);
  };

  const handleStartEdit = (milestone: DealMilestone) => {
    setEditingId(milestone.id);
    setEditTitle(milestone.title);
    setEditDate(milestone.dueDate ? new Date(milestone.dueDate) : undefined);
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    onUpdate(id, {
      title: editTitle.trim(),
      dueDate: editDate?.toISOString(),
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDate(undefined);
  };

  const completedCount = milestones.filter(m => m.completed).length;
  const totalCount = milestones.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="pt-4 border-t border-border">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between mb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-auto p-0 hover:bg-transparent gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Flag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Milestones</h3>
              {milestones.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({completedCount}/{totalCount})
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          {isExpanded && !isAdding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        {/* Collapsed View - Diamond Icons with Connecting Lines and Labels */}
        {!isExpanded && milestones.length > 0 && (
          <div className="relative py-4">
            {/* Connecting line that spans the full width */}
            <div className="absolute top-[30px] left-0 right-0 h-0.5 bg-muted-foreground/30" />
            
            {/* Progress line overlay */}
            {completedCount > 0 && (
              <div
                className="absolute top-[30px] left-0 h-0.5 bg-purple-600 transition-all"
                style={{
                  width: totalCount > 1 ? `${((completedCount - 0.5) / (totalCount - 1)) * 100}%` : '100%',
                }}
              />
            )}
            
            <div className="relative flex justify-between">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="flex flex-col items-center">
                  {/* Diamond Icon */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "transition-colors cursor-pointer bg-background p-1",
                          milestone.completed
                            ? "text-purple-600"
                            : "text-purple-600/30"
                        )}
                      >
                        {milestone.completed ? (
                          <svg 
                            className="h-8 w-8 fill-current" 
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          </svg>
                        ) : (
                          <svg 
                            className="h-8 w-8" 
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          </svg>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p className="font-medium">{milestone.title}</p>
                      {milestone.dueDate && (
                        <p className="text-muted-foreground">
                          {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                        </p>
                      )}
                      <p className={milestone.completed ? "text-success" : "text-muted-foreground"}>
                        {milestone.completed ? "Completed" : "Pending"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Label below diamond */}
                  <span
                    className={cn(
                      "text-[10px] mt-2 text-center max-w-20 leading-tight",
                      milestone.completed
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {milestone.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <CollapsibleContent>
          {milestones.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}

          <div className="space-y-2">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group"
              >
                {editingId === milestone.id ? (
                  <>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-7 text-sm flex-1"
                      placeholder="Milestone title"
                      autoFocus
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          {editDate ? format(editDate, 'MMM d') : 'Date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={editDate}
                          onSelect={setEditDate}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleSaveEdit(milestone.id)}
                    >
                      <Check className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Checkbox
                      checked={milestone.completed}
                      onCheckedChange={(checked) =>
                        onUpdate(milestone.id, { completed: checked === true })
                      }
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        milestone.completed && "line-through text-muted-foreground"
                      )}
                    >
                      {milestone.title}
                    </span>
                    {milestone.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(milestone.dueDate), 'MMM d')}
                      </span>
                    )}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleStartEdit(milestone)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(milestone.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {isAdding && (
              <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-7 text-sm flex-1"
                  placeholder="New milestone..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                    if (e.key === 'Escape') setIsAdding(false);
                  }}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      {newDate ? format(newDate, 'MMM d') : 'Date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={newDate}
                      onSelect={setNewDate}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAdd}
                >
                  <Check className="h-3.5 w-3.5 text-success" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setIsAdding(false);
                    setNewTitle('');
                    setNewDate(undefined);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {milestones.length === 0 && !isAdding && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No milestones yet
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
