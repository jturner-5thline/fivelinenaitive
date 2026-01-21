import { useState } from 'react';
import { Bookmark, Share2, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TriggerType, WorkflowAction } from './WorkflowBuilder';

export interface SaveTemplateData {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  is_shared: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
}

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: SaveTemplateData) => Promise<void>;
  initialData: {
    name: string;
    description?: string;
    trigger_type: TriggerType;
    trigger_config: Record<string, any>;
    actions: WorkflowAction[];
  };
  isSaving: boolean;
}

const CATEGORY_OPTIONS = [
  { value: 'notifications', label: 'Notifications' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'deal-management', label: 'Deal Management' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
];

export function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
  isSaving,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description || '');
  const [category, setCategory] = useState('notifications');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([initialData.trigger_type.replace(/_/g, ' ')]);
  const [isShared, setIsShared] = useState(false);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    await onSave({
      name,
      description: description || undefined,
      category,
      tags,
      is_shared: isShared,
      trigger_type: initialData.trigger_type,
      trigger_config: initialData.trigger_config,
      actions: initialData.actions,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save this workflow as a reusable template
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workflow Template"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template does..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="template-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a tag..."
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Share with team</p>
                <p className="text-xs text-muted-foreground">
                  Make this template available to your company members
                </p>
              </div>
            </div>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
