import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ListTodo, Briefcase, Landmark, User, Tag, Target, Folder } from 'lucide-react';
import { TaskViewTab, TaskTabFilterConfig } from '@/hooks/useTaskViewTabs';

const ICON_OPTIONS = [
  { value: 'list-todo', label: 'List', icon: ListTodo },
  { value: 'briefcase', label: 'Briefcase', icon: Briefcase },
  { value: 'landmark', label: 'Landmark', icon: Landmark },
  { value: 'user', label: 'User', icon: User },
  { value: 'tag', label: 'Tag', icon: Tag },
  { value: 'target', label: 'Target', icon: Target },
  { value: 'folder', label: 'Folder', icon: Folder },
];

interface TaskTabEditDialogProps {
  open: boolean;
  onClose: () => void;
  tab?: TaskViewTab;
  onSave: (data: { name: string; filter_config: TaskTabFilterConfig; icon?: string }) => void;
}

export function TaskTabEditDialog({ open, onClose, tab, onSave }: TaskTabEditDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('list-todo');
  const [hasDeal, setHasDeal] = useState<'any' | 'yes' | 'no'>('any');
  const [hasLender, setHasLender] = useState<'any' | 'yes' | 'no'>('any');
  const [createdByMe, setCreatedByMe] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);

  useEffect(() => {
    if (open) {
      if (tab) {
        setName(tab.name);
        setIcon(tab.icon || 'list-todo');
        const fc = tab.filter_config;
        setHasDeal(fc.has_deal === true ? 'yes' : fc.has_deal === false ? 'no' : 'any');
        setHasLender(fc.has_lender === true ? 'yes' : fc.has_lender === false ? 'no' : 'any');
        setCreatedByMe(!!fc.created_by_me);
        setAssignedToMe(!!fc.assigned_to_me);
      } else {
        setName('');
        setIcon('list-todo');
        setHasDeal('any');
        setHasLender('any');
        setCreatedByMe(false);
        setAssignedToMe(false);
      }
    }
  }, [open, tab]);

  const handleSave = () => {
    if (!name.trim()) return;
    const filter_config: TaskTabFilterConfig = {};
    if (hasDeal === 'yes') filter_config.has_deal = true;
    if (hasDeal === 'no') filter_config.has_deal = false;
    if (hasLender === 'yes') filter_config.has_lender = true;
    if (hasLender === 'no') filter_config.has_lender = false;
    if (createdByMe) filter_config.created_by_me = true;
    if (assignedToMe) filter_config.assigned_to_me = true;
    onSave({ name: name.trim(), filter_config, icon });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{tab ? 'Edit Tab' : 'Create Tab'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Tab Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Lender Tasks"
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Icon</Label>
            <div className="flex gap-1.5 flex-wrap">
              {ICON_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setIcon(opt.value)}
                    className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                      icon === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                    title={opt.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-xs font-semibold">Filter Rules</Label>

            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">Deal Association</Label>
              <Select value={hasDeal} onValueChange={v => setHasDeal(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any" className="text-xs">Any (no filter)</SelectItem>
                  <SelectItem value="yes" className="text-xs">Has a deal</SelectItem>
                  <SelectItem value="no" className="text-xs">No deal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">Lender Association</Label>
              <Select value={hasLender} onValueChange={v => setHasLender(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any" className="text-xs">Any (no filter)</SelectItem>
                  <SelectItem value="yes" className="text-xs">Has a funding source</SelectItem>
                  <SelectItem value="no" className="text-xs">No lender</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Only tasks I created</Label>
              <Switch checked={createdByMe} onCheckedChange={setCreatedByMe} />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Only tasks assigned to me</Label>
              <Switch checked={assignedToMe} onCheckedChange={setAssignedToMe} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            {tab ? 'Save Changes' : 'Create Tab'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
