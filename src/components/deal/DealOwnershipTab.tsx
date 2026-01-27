import { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useDealOwnership, DealOwner } from '@/hooks/useDealOwnership';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface DealOwnershipTabProps {
  dealId: string;
}

export function DealOwnershipTab({ dealId }: DealOwnershipTabProps) {
  const {
    owners,
    isLoading,
    isSaving,
    addOwner,
    updateOwner,
    deleteOwner,
    totalPercentage,
    canAddMore,
    maxOwners,
  } = useDealOwnership(dealId);

  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPercentage, setNewOwnerPercentage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPercentage, setEditPercentage] = useState('');

  const handleAddOwner = async () => {
    if (!newOwnerName.trim()) return;
    const percentage = parseFloat(newOwnerPercentage) || 0;
    if (percentage < 0 || percentage > 100) return;

    const result = await addOwner(newOwnerName.trim(), percentage);
    if (result) {
      setNewOwnerName('');
      setNewOwnerPercentage('');
    }
  };

  const startEditing = (owner: DealOwner) => {
    setEditingId(owner.id);
    setEditName(owner.owner_name);
    setEditPercentage(owner.ownership_percentage.toString());
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditPercentage('');
  };

  const saveEditing = async () => {
    if (!editingId || !editName.trim()) return;
    const percentage = parseFloat(editPercentage) || 0;
    if (percentage < 0 || percentage > 100) return;

    await updateOwner(editingId, {
      owner_name: editName.trim(),
      ownership_percentage: percentage,
    });
    cancelEditing();
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: 'add' | 'edit') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (action === 'add') {
        handleAddOwner();
      } else {
        saveEditing();
      }
    } else if (e.key === 'Escape' && action === 'edit') {
      cancelEditing();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cap Table Ownership</CardTitle>
        <CardDescription>
          Track up to {maxOwners} owners and their ownership percentages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Owner Name</TableHead>
                <TableHead className="w-[30%]">Ownership %</TableHead>
                <TableHead className="w-[20%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell>
                    {editingId === owner.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'edit')}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary"
                        onClick={() => startEditing(owner)}
                      >
                        {owner.owner_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === owner.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, 'edit')}
                          className="h-8 w-24"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary"
                        onClick={() => startEditing(owner)}
                      >
                        {owner.ownership_percentage.toFixed(2)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === owner.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditing}
                          className="h-7 px-2 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEditing}
                          disabled={isSaving}
                          className="h-7 px-2 text-xs"
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteOwner(owner.id)}
                        disabled={isSaving}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {/* Add new owner row */}
              {canAddMore && (
                <TableRow>
                  <TableCell>
                    <Input
                      placeholder="Enter owner name"
                      value={newOwnerName}
                      onChange={(e) => setNewOwnerName(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'add')}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={newOwnerPercentage}
                        onChange={(e) => setNewOwnerPercentage(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'add')}
                        className="h-8 w-24"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={handleAddOwner}
                      disabled={isSaving || !newOwnerName.trim()}
                      className="h-7 gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              )}

              {owners.length === 0 && !canAddMore && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No owners added yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Total percentage summary */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">Total Ownership</span>
          <span
            className={cn(
              'text-sm font-semibold',
              totalPercentage === 100
                ? 'text-green-600 dark:text-green-400'
                : totalPercentage > 100
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {totalPercentage.toFixed(2)}%
            {totalPercentage !== 100 && (
              <span className="ml-2 font-normal text-muted-foreground">
                ({totalPercentage < 100 ? `${(100 - totalPercentage).toFixed(2)}% remaining` : 'exceeds 100%'})
              </span>
            )}
          </span>
        </div>

        {!canAddMore && (
          <p className="text-xs text-muted-foreground text-center">
            Maximum of {maxOwners} owners reached
          </p>
        )}
      </CardContent>
    </Card>
  );
}
