import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader2, DollarSign } from 'lucide-react';
import { useDealOwnership, DealOwner } from '@/hooks/useDealOwnership';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WriteUpOwnershipTabProps {
  dealId: string;
}

// Format currency with commas
const formatCurrencyDisplay = (value: string): string => {
  if (!value) return '';
  const numericValue = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(numericValue);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export function WriteUpOwnershipTab({ dealId }: WriteUpOwnershipTabProps) {
  const {
    owners,
    isLoading,
    isSaving,
    addOwner,
    updateOwner,
    deleteOwner,
    canAddMore,
    maxOwners,
    totalEquityRaised,
    updateTotalEquityRaised,
  } = useDealOwnership(dealId);

  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPercentage, setNewOwnerPercentage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
  const [equityInput, setEquityInput] = useState('');
  const equityDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize equity input from loaded data
  useEffect(() => {
    setEquityInput(formatCurrencyDisplay(totalEquityRaised));
  }, [totalEquityRaised]);

  const handleEquityChange = (value: string) => {
    const formatted = formatCurrencyDisplay(value);
    setEquityInput(formatted);

    // Debounce the save
    if (equityDebounceRef.current) {
      clearTimeout(equityDebounceRef.current);
    }
    equityDebounceRef.current = setTimeout(() => {
      const numericValue = value.replace(/[^0-9.]/g, '');
      updateTotalEquityRaised(numericValue);
    }, 500);
  };

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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Track up to {maxOwners} owners and their ownership percentages on the cap table.
      </p>
      
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

      {/* Total Equity Raised */}
      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <Label htmlFor="total-equity" className="text-sm font-medium">
          Total Equity Raised to Date
        </Label>
        <div className="relative mt-2">
          <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="total-equity"
            type="text"
            placeholder="0"
            value={equityInput}
            onChange={(e) => handleEquityChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {!canAddMore && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum of {maxOwners} owners reached
        </p>
      )}
    </div>
  );
}
