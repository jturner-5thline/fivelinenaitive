import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  Building2, 
  Briefcase, 
  Globe, 
  CreditCard,
  GripVertical,
  Loader2
} from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
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

interface ConfigItem {
  id: string;
  value: string;
  isDefault?: boolean;
}

const STORAGE_KEY_PREFIX = 'lender-config-';

// Default values for each category
const defaultLenderTypes: ConfigItem[] = [
  { id: '1', value: 'Bank', isDefault: true },
  { id: '2', value: 'Non-Bank', isDefault: true },
  { id: '3', value: 'Family Office', isDefault: true },
  { id: '4', value: 'Private Credit', isDefault: true },
  { id: '5', value: 'Venture Debt', isDefault: true },
  { id: '6', value: 'Revenue-Based', isDefault: true },
  { id: '7', value: 'Asset-Based', isDefault: true },
  { id: '8', value: 'SBA', isDefault: true },
];

const defaultIndustries: ConfigItem[] = [
  { id: '1', value: 'Technology', isDefault: true },
  { id: '2', value: 'Healthcare', isDefault: true },
  { id: '3', value: 'Financial Services', isDefault: true },
  { id: '4', value: 'Consumer', isDefault: true },
  { id: '5', value: 'Industrial', isDefault: true },
  { id: '6', value: 'Real Estate', isDefault: true },
  { id: '7', value: 'Energy', isDefault: true },
  { id: '8', value: 'Media & Entertainment', isDefault: true },
  { id: '9', value: 'Education', isDefault: true },
  { id: '10', value: 'Hospitality', isDefault: true },
];

const defaultLoanTypes: ConfigItem[] = [
  { id: '1', value: 'Term Loan', isDefault: true },
  { id: '2', value: 'Revolving Credit', isDefault: true },
  { id: '3', value: 'ABL', isDefault: true },
  { id: '4', value: 'Mezzanine', isDefault: true },
  { id: '5', value: 'Unitranche', isDefault: true },
  { id: '6', value: 'Venture Debt', isDefault: true },
  { id: '7', value: 'Revenue-Based Financing', isDefault: true },
  { id: '8', value: 'Equipment Financing', isDefault: true },
  { id: '9', value: 'Factoring', isDefault: true },
  { id: '10', value: 'SBA Loan', isDefault: true },
];

const defaultGeographies: ConfigItem[] = [
  { id: '1', value: 'United States', isDefault: true },
  { id: '2', value: 'Canada', isDefault: true },
  { id: '3', value: 'United Kingdom', isDefault: true },
  { id: '4', value: 'Europe', isDefault: true },
  { id: '5', value: 'Asia Pacific', isDefault: true },
  { id: '6', value: 'Latin America', isDefault: true },
  { id: '7', value: 'Middle East', isDefault: true },
  { id: '8', value: 'Africa', isDefault: true },
  { id: '9', value: 'Global', isDefault: true },
];

function ConfigSection({ 
  title, 
  description, 
  icon: Icon, 
  items, 
  onAdd, 
  onRemove, 
  onUpdate,
  storageKey 
}: { 
  title: string;
  description: string;
  icon: React.ElementType;
  items: ConfigItem[];
  onAdd: (value: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
  storageKey: string;
}) {
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (!newValue.trim()) {
      toast({ title: 'Error', description: 'Please enter a value', variant: 'destructive' });
      return;
    }
    if (items.some(item => item.value.toLowerCase() === newValue.trim().toLowerCase())) {
      toast({ title: 'Error', description: 'This value already exists', variant: 'destructive' });
      return;
    }
    onAdd(newValue.trim());
    setNewValue('');
    toast({ title: 'Added', description: `"${newValue.trim()}" has been added.` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={`Add new ${title.toLowerCase().replace(/s$/, '')}...`}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              No items configured. Add one above.
            </p>
          ) : (
            items.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors group"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={item.value}
                  onChange={(e) => onUpdate(item.id, e.target.value)}
                  className="flex-1 h-8 border-0 bg-transparent focus-visible:ring-1"
                />
                {item.isDefault && (
                  <Badge variant="secondary" className="text-xs">Default</Badge>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{item.value}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove this option from the dropdown. Existing lenders using this value will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemove(item.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </div>
        
        <p className="text-xs text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''} configured
        </p>
      </CardContent>
    </Card>
  );
}

export default function LenderDatabaseConfig() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  
  // State for each configuration category
  const [lenderTypes, setLenderTypes] = useState<ConfigItem[]>([]);
  const [industries, setIndustries] = useState<ConfigItem[]>([]);
  const [loanTypes, setLoanTypes] = useState<ConfigItem[]>([]);
  const [geographies, setGeographies] = useState<ConfigItem[]>([]);

  // Load saved configurations from localStorage on mount
  useEffect(() => {
    const savedLenderTypes = localStorage.getItem(`${STORAGE_KEY_PREFIX}lender-types`);
    const savedIndustries = localStorage.getItem(`${STORAGE_KEY_PREFIX}industries`);
    const savedLoanTypes = localStorage.getItem(`${STORAGE_KEY_PREFIX}loan-types`);
    const savedGeographies = localStorage.getItem(`${STORAGE_KEY_PREFIX}geographies`);

    setLenderTypes(savedLenderTypes ? JSON.parse(savedLenderTypes) : defaultLenderTypes);
    setIndustries(savedIndustries ? JSON.parse(savedIndustries) : defaultIndustries);
    setLoanTypes(savedLoanTypes ? JSON.parse(savedLoanTypes) : defaultLoanTypes);
    setGeographies(savedGeographies ? JSON.parse(savedGeographies) : defaultGeographies);
  }, []);

  // Save all configurations
  const handleSaveAll = () => {
    setIsSaving(true);
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}lender-types`, JSON.stringify(lenderTypes));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}industries`, JSON.stringify(industries));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}loan-types`, JSON.stringify(loanTypes));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}geographies`, JSON.stringify(geographies));
      
      toast({ title: 'Configuration saved', description: 'All changes have been saved.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save configuration', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleResetToDefaults = () => {
    setLenderTypes(defaultLenderTypes);
    setIndustries(defaultIndustries);
    setLoanTypes(defaultLoanTypes);
    setGeographies(defaultGeographies);
    
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}lender-types`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}industries`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}loan-types`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}geographies`);
    
    toast({ title: 'Reset complete', description: 'All configurations have been reset to defaults.' });
  };

  // Helper functions for each category
  const createHelpers = (
    items: ConfigItem[], 
    setItems: React.Dispatch<React.SetStateAction<ConfigItem[]>>
  ) => ({
    add: (value: string) => {
      setItems(prev => [...prev, { id: crypto.randomUUID(), value, isDefault: false }]);
    },
    remove: (id: string) => {
      setItems(prev => prev.filter(item => item.id !== id));
      toast({ title: 'Removed', description: 'Item has been removed.' });
    },
    update: (id: string, value: string) => {
      setItems(prev => prev.map(item => item.id === id ? { ...item, value } : item));
    },
  });

  const lenderTypesHelpers = createHelpers(lenderTypes, setLenderTypes);
  const industriesHelpers = createHelpers(industries, setIndustries);
  const loanTypesHelpers = createHelpers(loanTypes, setLoanTypes);
  const geographiesHelpers = createHelpers(geographies, setGeographies);

  return (
    <>
      <Helmet>
        <title>Lender Database Configuration - nAItive</title>
        <meta name="description" content="Configure lender database dropdown options" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate('/lenders')}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold flex items-center gap-2 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                    <Building2 className="h-6 w-6 text-foreground" />
                    Lender Database Configuration
                  </h1>
                  <p className="text-muted-foreground">
                    Manage dropdown options for lender types, industries, and more
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Reset to Defaults
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset all configurations?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will reset all dropdown options to their default values. Any custom options you've added will be removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetToDefaults}>
                        Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button onClick={handleSaveAll} className="gap-1" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save All
                </Button>
              </div>
            </div>

            {/* Configuration Tabs */}
            <Tabs defaultValue="lender-types" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="lender-types" className="gap-1">
                  <Building2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Lender Types</span>
                  <span className="sm:hidden">Types</span>
                </TabsTrigger>
                <TabsTrigger value="industries" className="gap-1">
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden sm:inline">Industries</span>
                  <span className="sm:hidden">Industries</span>
                </TabsTrigger>
                <TabsTrigger value="loan-types" className="gap-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Loan Types</span>
                  <span className="sm:hidden">Loans</span>
                </TabsTrigger>
                <TabsTrigger value="geographies" className="gap-1">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">Geographies</span>
                  <span className="sm:hidden">Geo</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lender-types">
                <ConfigSection
                  title="Lender Types"
                  description="Configure the types of lenders available in your database (e.g., Bank, Non-Bank, Family Office)"
                  icon={Building2}
                  items={lenderTypes}
                  onAdd={lenderTypesHelpers.add}
                  onRemove={lenderTypesHelpers.remove}
                  onUpdate={lenderTypesHelpers.update}
                  storageKey="lender-types"
                />
              </TabsContent>

              <TabsContent value="industries">
                <ConfigSection
                  title="Industries"
                  description="Configure the industries that lenders can specialize in (e.g., Technology, Healthcare)"
                  icon={Briefcase}
                  items={industries}
                  onAdd={industriesHelpers.add}
                  onRemove={industriesHelpers.remove}
                  onUpdate={industriesHelpers.update}
                  storageKey="industries"
                />
              </TabsContent>

              <TabsContent value="loan-types">
                <ConfigSection
                  title="Loan Types"
                  description="Configure the types of loans that lenders can offer (e.g., Term Loan, Revolving Credit)"
                  icon={CreditCard}
                  items={loanTypes}
                  onAdd={loanTypesHelpers.add}
                  onRemove={loanTypesHelpers.remove}
                  onUpdate={loanTypesHelpers.update}
                  storageKey="loan-types"
                />
              </TabsContent>

              <TabsContent value="geographies">
                <ConfigSection
                  title="Geographies"
                  description="Configure the geographic regions that lenders can operate in"
                  icon={Globe}
                  items={geographies}
                  onAdd={geographiesHelpers.add}
                  onRemove={geographiesHelpers.remove}
                  onUpdate={geographiesHelpers.update}
                  storageKey="geographies"
                />
              </TabsContent>
            </Tabs>

            {/* Help Text */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Changes to these configurations will affect the dropdown options available when adding or editing lenders. 
                  Existing lender records will not be modified. Click "Save All" to persist your changes.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}
