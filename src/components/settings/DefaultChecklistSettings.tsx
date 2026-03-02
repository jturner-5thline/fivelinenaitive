import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, Save, Loader2, FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useDefaultChecklistConfig, type DefaultChecklistEntry, type DefaultChecklistConfig } from '@/hooks/useDefaultChecklistConfig';
import { useCompany } from '@/hooks/useCompany';

interface DefaultChecklistSettingsProps {
  isAdmin?: boolean;
}

export function DefaultChecklistSettings({ isAdmin = true }: DefaultChecklistSettingsProps) {
  const { company } = useCompany();
  const { config, loading, saveConfig } = useDefaultChecklistConfig(company?.id);
  const [isOpen, setIsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<DefaultChecklistConfig>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDealType, setSelectedDealType] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);

  // Load deal types from localStorage
  const [dealTypes, setDealTypes] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem('dealTypes');
    if (saved) {
      try { setDealTypes(JSON.parse(saved)); } catch { /* ignore */ }
    } else {
      setDealTypes([
        { id: 'venture-debt', label: 'Venture Debt' },
        { id: 'asset-based-lending', label: 'Asset-Based Lending' },
        { id: 'term-loan', label: 'Term Loan' },
      ]);
    }
  }, []);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    if (!selectedDealType && dealTypes.length > 0) {
      setSelectedDealType(dealTypes[0].id);
    }
  }, [dealTypes, selectedDealType]);

  const currentItems = localConfig[selectedDealType]?.items || [];
  const dealTypeLabel = dealTypes.find(dt => dt.id === selectedDealType)?.label || selectedDealType;

  const addItem = () => {
    if (!newItemName.trim() || !selectedDealType) return;
    const updated = { ...localConfig };
    if (!updated[selectedDealType]) {
      updated[selectedDealType] = { label: dealTypeLabel, items: [] };
    }
    updated[selectedDealType].items.push({
      name: newItemName.trim(),
      category: newItemCategory.trim() || 'General',
      is_required: newItemRequired,
    });
    setLocalConfig(updated);
    setNewItemName('');
  };

  const removeItem = (index: number) => {
    const updated = { ...localConfig };
    updated[selectedDealType].items.splice(index, 1);
    setLocalConfig(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await saveConfig(localConfig);
    setIsSaving(false);
  };

  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config);

  // Group items by category for display
  const groupedItems: Record<string, DefaultChecklistEntry[]> = {};
  currentItems.forEach(item => {
    const cat = item.category || 'General';
    if (!groupedItems[cat]) groupedItems[cat] = [];
    groupedItems[cat].push(item);
  });

  if (!isAdmin) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1">
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Default Data Room Checklists
                </CardTitle>
                <CardDescription>Configure default checklist items that auto-populate when deals are created by type</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Deal type selector */}
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Deal Type:</Label>
              <Select value={selectedDealType} onValueChange={setSelectedDealType}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select deal type" />
                </SelectTrigger>
                <SelectContent>
                  {dealTypes.map(dt => (
                    <SelectItem key={dt.id} value={dt.id}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-xs">{currentItems.length} items</Badge>
            </div>

            <Separator />

            {/* Current items grouped by category */}
            {Object.keys(groupedItems).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(groupedItems).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{cat}</p>
                    <div className="space-y-1">
                      {items.map((item, idx) => {
                        const globalIdx = currentItems.indexOf(item);
                        return (
                          <div key={globalIdx} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{item.name}</span>
                              {item.is_required && <Badge variant="secondary" className="text-[10px] h-4">Required</Badge>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(globalIdx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No default checklist items configured for this deal type. Add items below.
              </p>
            )}

            {/* Add item form */}
            <div className="flex items-end gap-2 p-3 border rounded-lg bg-muted/10">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Item Name</Label>
                <Input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g., Balance Sheet"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                />
              </div>
              <div className="w-[150px] space-y-1">
                <Label className="text-xs">Category</Label>
                <Input
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  placeholder="Financials"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-1.5 pb-0.5">
                <Checkbox checked={newItemRequired} onCheckedChange={(c) => setNewItemRequired(!!c)} />
                <Label className="text-xs">Req</Label>
              </div>
              <Button size="sm" className="h-8 gap-1" onClick={addItem} disabled={!newItemName.trim()}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {/* Save bar */}
            {hasChanges && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">You have unsaved changes</p>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Changes
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
