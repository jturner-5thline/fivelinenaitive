import { useState } from 'react';
import { Users, Trash2, Pencil, Plus, X, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReferralSources, ReferralSource } from '@/hooks/useReferralSources';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function ReferralSourcesSettings() {
  const { referralSources, isLoading, addReferralSource, deleteReferralSource, refreshReferralSources } = useReferralSources();
  const [newSourceName, setNewSourceName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!newSourceName.trim()) return;
    
    setIsAdding(true);
    const result = await addReferralSource(newSourceName.trim());
    setIsAdding(false);
    
    if (result) {
      setNewSourceName('');
      setShowAddForm(false);
    }
  };

  const handleStartEdit = (source: ReferralSource) => {
    setEditingId(source.id);
    setEditValue(source.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editValue.trim()) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('referral_sources')
        .update({ name: editValue.trim() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Referral source updated",
        description: "The referral source has been renamed.",
      });

      refreshReferralSources();
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error updating referral source:', error);
      toast({
        title: "Error",
        description: "Failed to update referral source.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    } else if (e.key === 'Escape') {
      if (editingId) {
        handleCancelEdit();
      } else {
        setShowAddForm(false);
        setNewSourceName('');
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Referral Sources
        </CardTitle>
        <CardDescription>
          Manage your list of referral sources for deals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {referralSources.length === 0 && !showAddForm ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No referral sources yet</p>
                <Button onClick={() => setShowAddForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add your first referral source
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {referralSources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group"
                  >
                    {editingId === source.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, () => handleSaveEdit(source.id))}
                          className="h-8"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleSaveEdit(source.id)}
                          disabled={isSaving || !editValue.trim()}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-success" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium">{source.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleStartEdit(source)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete referral source?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{source.name}"? This will not affect existing deals that reference this source.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteReferralSource(source.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAddForm ? (
              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Enter referral source name..."
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleAdd)}
                  autoFocus
                />
                <Button
                  onClick={handleAdd}
                  disabled={isAdding || !newSourceName.trim()}
                  className="shrink-0"
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewSourceName('');
                  }}
                  className="shrink-0"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              referralSources.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Referral Source
                </Button>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}