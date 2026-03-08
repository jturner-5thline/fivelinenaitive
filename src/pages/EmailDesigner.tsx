import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Mail, Plus, Trash2, Copy, Edit, Eye, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useEmailTemplatesV2, useSaveEmailTemplate, useDeleteEmailTemplate, MERGE_TAGS, blocksToHtml, type EmailBlock, type EmailTemplateV2 } from '@/hooks/useEmailDesigner';
import { EmailBlockEditor } from '@/components/email-designer/EmailBlockEditor';

export default function EmailDesigner() {
  const { data: templates = [], isLoading } = useEmailTemplatesV2();
  const saveTemplate = useSaveEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateV2 | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateV2 | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState('both');
  const [newType, setNewType] = useState('personal');

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject_template?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    saveTemplate.mutate({
      name: newName,
      scope: newScope,
      type: newType,
      template_json: [
        { id: crypto.randomUUID(), type: 'text', props: { content: '<p>Hello {{contact.first_name}},</p>', align: 'left', fontSize: 14 } },
      ] as any,
      subject_template: '',
    }, {
      onSuccess: () => {
        setShowCreate(false);
        setNewName('');
      }
    });
  };

  return (
    <>
      <Helmet><title>Email Designer | Naitive</title></Helmet>
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <DealsHeader title="Email Designer" subtitle="Create and manage reusable email templates with merge tags" />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No templates yet. Create your first one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(template => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium truncate">{template.name}</CardTitle>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-[10px] capitalize">{template.scope}</Badge>
                      {template.is_locked && <Badge variant="secondary" className="text-[10px]">Locked</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {template.subject_template && (
                    <p className="text-xs text-muted-foreground truncate">Subj: {template.subject_template}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {(template.template_json as any[])?.length || 0} blocks · {template.type}
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingTemplate(template)}>
                      <Edit className="h-3 w-3" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="h-3 w-3" /> Preview
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete template?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete "{template.name}".</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTemplate.mutate(template.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Email Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Deal Update Notification" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="global">Global</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={newScope} onValueChange={setNewScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="distribution">Distribution</SelectItem>
                    <SelectItem value="sequence_step">Sequence Step</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || saveTemplate.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingTemplate && (
        <EmailBlockEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={(updated) => {
            saveTemplate.mutate(updated as any, { onSuccess: () => setEditingTemplate(null) });
          }}
        />
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={open => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="text-sm text-muted-foreground mb-4">
                Subject: <span className="font-medium text-foreground">{previewTemplate.subject_template || '(no subject)'}</span>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: blocksToHtml((previewTemplate.template_json as any[]) || []) }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
