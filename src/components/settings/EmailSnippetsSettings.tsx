import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Edit2, X, Check, Zap, Copy, Hash, ChevronDown } from 'lucide-react';
import { useEmailSnippets, SNIPPET_TOKENS, type EmailSnippetInsert } from '@/hooks/useEmailSnippets';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function EmailSnippetsSettings() {
  const { snippets, isLoading, createSnippet, updateSnippet, deleteSnippet } = useEmailSnippets();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormBody('');
    setEditingId(null);
    setShowCreate(false);
  };

  const handleSave = () => {
    if (!formName.trim() || !formBody.trim()) {
      toast.error('Name and body are required');
      return;
    }
    if (editingId) {
      updateSnippet.mutate({ id: editingId, name: formName.trim(), body: formBody.trim() });
    } else {
      createSnippet.mutate({ name: formName.trim(), body: formBody.trim() });
    }
    resetForm();
  };

  const startEdit = (snippet: typeof snippets[0]) => {
    setEditingId(snippet.id);
    setFormName(snippet.name);
    setFormBody(snippet.body);
    setShowCreate(true);
  };

  const insertToken = (token: string) => {
    setFormBody(prev => prev + token);
  };

  const isFormOpen = showCreate || editingId;

  return (
    
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          
            <button className="flex items-center gap-2 text-left flex-1">
              
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Email Snippets
                </CardTitle>
                <CardDescription>
                  Create reusable email templates with dynamic tokens like {'{First Name}'}
                </CardDescription>
              </div>
            </button>
          
          {!isFormOpen && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); setIsOpen(true); setShowCreate(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Snippet
            </Button>
          )}
        </CardHeader>
        
          <CardContent className="space-y-4">
        {/* Create/Edit Form */}
        {isFormOpen && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {editingId ? 'Edit Snippet' : 'New Snippet'}
              </Label>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetForm}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Intro – New Funding Source Outreach"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Body</Label>
              <Textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Hi {First Name}, I wanted to reach out about..."
                className="mt-1 min-h-[100px]"
              />
            </div>

            {/* Token insertion buttons */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Insert Token</Label>
              <div className="flex flex-wrap gap-1.5">
                {SNIPPET_TOKENS.map(({ token, label }) => (
                  <Button
                    key={token}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => insertToken(token)}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={createSnippet.isPending || updateSnippet.isPending}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                {editingId ? 'Update' : 'Save'} Snippet
              </Button>
            </div>
          </div>
        )}

        {/* Snippets List */}
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading snippets…</div>
        ) : snippets.length === 0 && !isFormOpen ? (
          <div className="text-center py-8">
            <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No snippets yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first snippet to speed up email composition</p>
          </div>
        ) : (
          <ScrollArea className={snippets.length > 5 ? 'max-h-[400px]' : undefined}>
            <div className="space-y-2">
              {snippets.map((snippet) => (
                <div
                  key={snippet.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    editingId === snippet.id ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{snippet.name}</span>
                        {snippet.usage_count > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                            <Hash className="h-2.5 w-2.5" />
                            {snippet.usage_count} uses
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                        {snippet.body}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(snippet)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete snippet?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{snippet.name}". Already composed emails won't be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteSnippet.mutate(snippet.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
          </CardContent>
        
      </Card>
    
  );
}
