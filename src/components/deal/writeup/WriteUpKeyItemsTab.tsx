import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DealWriteUpData, KeyItem } from '../DealWriteUp';

interface WriteUpKeyItemsTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
}

export function WriteUpKeyItemsTab({ data, updateField }: WriteUpKeyItemsTabProps) {
  const addKeyItem = () => {
    const newItem: KeyItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('keyItems', [...data.keyItems, newItem]);
  };

  const updateKeyItem = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'keyItems',
      data.keyItems.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteKeyItem = (id: string) => {
    updateField('keyItems', data.keyItems.filter(item => item.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Key Items</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Additional notes and considerations</p>
        </div>
        <Button variant="outline" size="sm" onClick={addKeyItem}>
          <Plus className="h-4 w-4 mr-1" />
          Add Key Item
        </Button>
      </div>
      
      {data.keyItems.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-sm">No key items added yet.</p>
          <p className="text-xs mt-1">Click "Add Key Item" to add important notes.</p>
        </div>
      ) : (
        data.keyItems.map((item) => (
          <div key={item.id} className="border rounded-lg p-4 space-y-3 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => deleteKeyItem(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="space-y-2 pr-10">
              <Label>Title</Label>
              <Input
                value={item.title}
                onChange={(e) => updateKeyItem(item.id, 'title', e.target.value)}
                placeholder="Strong Market Position"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={item.description}
                onChange={(e) => updateKeyItem(item.id, 'description', e.target.value)}
                placeholder="Detailed description of this key item..."
                className="min-h-[60px]"
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
