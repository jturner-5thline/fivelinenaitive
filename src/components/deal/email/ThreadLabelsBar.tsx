import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tags, Plus, X, Shield, User, Zap, Search, Check } from 'lucide-react';
import { useEmailLabels, useThreadLabels, type EmailLabel } from '@/hooks/useEmailLabels';
import { cn } from '@/lib/utils';

interface ThreadLabelsBarProps {
  threadId: string;
}

function LabelChip({ label, appliedVia, onRemove }: {
  label: EmailLabel;
  appliedVia: 'manual' | 'rule';
  onRemove: () => void;
}) {
  const scopeText = label.scope === 'team' ? 'Team label' : 'Personal label';
  const viaText = appliedVia === 'rule' ? 'Auto-applied by rule' : 'Manually applied';
  const tooltipContent = `${label.name}${label.description ? ` — ${label.description}` : ''}\n${scopeText} · ${viaText}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="text-[10px] h-[20px] px-1.5 gap-1 group cursor-default select-none transition-colors"
          style={{
            borderColor: `${label.color}40`,
            backgroundColor: `${label.color}15`,
            color: label.color,
          }}
        >
          {label.scope === 'team' ? (
            <Shield className="h-2.5 w-2.5 opacity-60" />
          ) : (
            <User className="h-2.5 w-2.5 opacity-60" />
          )}
          {appliedVia === 'rule' && <Zap className="h-2 w-2 opacity-50" />}
          {label.name}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-background/30 p-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-[200px] whitespace-pre-line">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

function AddLabelPopover({ threadId, existingLabelIds }: { threadId: string; existingLabelIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { labels } = useEmailLabels();
  const { addLabel } = useThreadLabels(threadId);

  const available = labels.filter(l =>
    !existingLabelIds.includes(l.id) &&
    (search ? l.name.toLowerCase().includes(search.toLowerCase()) : true)
  );

  const handleAdd = (labelId: string) => {
    addLabel.mutate({ labelId, via: 'manual' });
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Add label</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className="w-[220px] p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search labels..."
              className="h-7 text-xs pl-6"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[200px]">
          {available.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {labels.length === 0 ? 'No labels defined yet' : 'All labels applied'}
            </div>
          ) : (
            <div className="p-1">
              {available.map(label => (
                <button
                  key={label.id}
                  onClick={() => handleAdd(label.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left"
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <span className="text-xs truncate flex-1">{label.name}</span>
                  {label.scope === 'team' ? (
                    <Shield className="h-2.5 w-2.5 text-muted-foreground" />
                  ) : (
                    <User className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function ThreadLabelsBar({ threadId }: ThreadLabelsBarProps) {
  const { threadLabels, removeLabel } = useThreadLabels(threadId);

  const existingLabelIds = threadLabels.map(tl => tl.label_id);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {threadLabels.length > 0 && (
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mr-0.5">
          Thread labels
        </span>
      )}
      {threadLabels.map(tl => (
        tl.label && (
          <LabelChip
            key={tl.id}
            label={tl.label}
            appliedVia={tl.applied_via}
            onRemove={() => removeLabel.mutate(tl.label_id)}
          />
        )
      ))}
      <AddLabelPopover threadId={threadId} existingLabelIds={existingLabelIds} />
    </div>
  );
}
