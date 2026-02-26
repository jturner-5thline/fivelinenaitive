import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { GammaTemplate } from './GammaTemplateLibrary';

interface CustomTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  suggested_format: string;
  is_shared: boolean;
  usage_count: number;
  user_id: string;
}

interface GammaCustomTemplatesProps {
  selected: string | null;
  onSelect: (template: GammaTemplate) => void;
}

export function GammaCustomTemplates({ selected, onSelect }: GammaCustomTemplatesProps) {
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [form, setForm] = useState({ name: '', description: '', prompt: '', format: 'presentation', isShared: false });
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('gamma_custom_templates')
        .select('*')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      setTemplates((data as CustomTemplate[]) || []);
    } catch (err) {
      console.error('Failed to load custom templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      toast.error('Name and prompt are required');
      return;
    }
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get company_id for sharing
      let companyId: string | null = null;
      if (form.isShared) {
        const { data: member } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .single();
        companyId = member?.company_id || null;
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('gamma_custom_templates')
          .update({
            name: form.name,
            description: form.description || null,
            prompt: form.prompt,
            suggested_format: form.format,
            is_shared: form.isShared,
            company_id: companyId,
          })
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase
          .from('gamma_custom_templates')
          .insert({
            user_id: user.id,
            name: form.name,
            description: form.description || null,
            prompt: form.prompt,
            suggested_format: form.format,
            is_shared: form.isShared,
            company_id: companyId,
          });
        if (error) throw error;
        toast.success('Template created');
      }

      setDialogOpen(false);
      setEditingTemplate(null);
      setForm({ name: '', description: '', prompt: '', format: 'presentation', isShared: false });
      fetchTemplates();
    } catch (err) {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (tpl: CustomTemplate) => {
    setEditingTemplate(tpl);
    setForm({
      name: tpl.name,
      description: tpl.description || '',
      prompt: tpl.prompt,
      format: tpl.suggested_format,
      isShared: tpl.is_shared,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('gamma_custom_templates').delete().eq('id', id);
      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Template deleted');
    } catch { toast.error('Failed to delete template'); }
  };

  const handleSelect = (tpl: CustomTemplate) => {
    // Increment usage
    supabase.from('gamma_custom_templates').update({ usage_count: tpl.usage_count + 1 }).eq('id', tpl.id);
    onSelect({
      id: `custom-${tpl.id}`,
      label: tpl.name,
      description: tpl.description || '',
      icon: Plus,
      prompt: tpl.prompt,
      suggestedFormat: tpl.suggested_format as 'presentation' | 'document',
    });
  };

  if (isLoading) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">My Templates</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingTemplate(null); setForm({ name: '', description: '', prompt: '', format: 'presentation', isShared: false }); }
        }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="e.g., Monthly Board Report"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  placeholder="Brief description..."
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt Instructions</Label>
                <Textarea
                  placeholder="Detailed instructions for generating content..."
                  value={form.prompt}
                  onChange={(e) => setForm(f => ({ ...f, prompt: e.target.value }))}
                  className="min-h-[100px] text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Format</Label>
                <Select value={form.format} onValueChange={(v) => setForm(f => ({ ...f, format: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presentation">Presentation</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isShared}
                  onCheckedChange={(v) => setForm(f => ({ ...f, isShared: v }))}
                />
                <Label className="text-xs">Share with team</Label>
              </div>
              <Button onClick={handleSave} disabled={isSaving} className="w-full">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {templates.map((tpl) => {
            const isActive = selected === `custom-${tpl.id}`;
            const isOwner = tpl.user_id === currentUserId;
            return (
              <div key={tpl.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleSelect(tpl)}
                  className={cn(
                    'w-full flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all duration-150 text-center',
                    isActive
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  )}
                >
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors text-xs font-bold',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {tpl.name.charAt(0).toUpperCase()}
                  </div>
                  <p className={cn('text-xs font-semibold leading-tight truncate max-w-full', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                    {tpl.name}
                  </p>
                  {tpl.is_shared && (
                    <Users className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </button>
                {isOwner && (
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleEdit(tpl)}>
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(tpl.id)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
