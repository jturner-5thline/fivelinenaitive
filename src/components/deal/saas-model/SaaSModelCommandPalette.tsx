import { useState, useEffect, useCallback } from 'react';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { LayoutDashboard, FileSpreadsheet, Wallet, Upload, TrendingDown, Landmark, ShieldCheck, Download, Printer, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Tab {
  value: string;
  label: string;
  icon: React.ReactNode;
  keywords: string[];
}

const TABS: Tab[] = [
  { value: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, keywords: ['overview', 'kpi', 'summary', 'home'] },
  { value: 'income-statement', label: 'Income Statement', icon: <FileSpreadsheet className="h-4 w-4" />, keywords: ['p&l', 'profit', 'loss', 'revenue', 'expense', 'is'] },
  { value: 'balance-sheet', label: 'Balance Sheet', icon: <Wallet className="h-4 w-4" />, keywords: ['assets', 'liabilities', 'equity', 'bs'] },
  { value: 'data-mapping', label: 'Data Mapping', icon: <Upload className="h-4 w-4" />, keywords: ['upload', 'import', 'map', 'excel', 'csv'] },
  { value: 'sensitivity', label: 'Sensitivity Analysis', icon: <TrendingDown className="h-4 w-4" />, keywords: ['scenario', 'stress', 'downside', 'what-if'] },
  { value: 'debt-servicing', label: 'Debt Servicing', icon: <Landmark className="h-4 w-4" />, keywords: ['loan', 'amortization', 'lender', 'interest', 'payment'] },
  { value: 'charts', label: 'Charts & Visuals', icon: <BarChart3 className="h-4 w-4" />, keywords: ['graph', 'chart', 'visual', 'waterfall', 'trend'] },
  { value: 'credit-analysis', label: 'Credit Analysis', icon: <ShieldCheck className="h-4 w-4" />, keywords: ['credit', 'risk', 'score', 'rating', 'covenant'] },
];

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  keywords: string[];
}

const ACTIONS: Action[] = [
  { id: 'export-pdf', label: 'Export as PDF', icon: <Download className="h-4 w-4" />, keywords: ['download', 'pdf', 'save', 'export'] },
  { id: 'export-excel', label: 'Export as Excel', icon: <Download className="h-4 w-4" />, keywords: ['download', 'xlsx', 'spreadsheet'] },
  { id: 'print', label: 'Print Current View', icon: <Printer className="h-4 w-4" />, keywords: ['print', 'paper'] },
];

interface SaaSModelCommandPaletteProps {
  onNavigate: (tab: string) => void;
  onAction?: (actionId: string) => void;
}

export function SaaSModelCommandPalette({ onNavigate, onAction }: SaaSModelCommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((value: string) => {
    setOpen(false);
    const tab = TABS.find(t => t.value === value);
    if (tab) {
      onNavigate(tab.value);
      return;
    }
    const action = ACTIONS.find(a => a.id === value);
    if (action) {
      if (onAction) {
        onAction(action.id);
      } else {
        toast.info(`${action.label}`, { description: 'This feature is coming soon.' });
      }
    }
  }, [onNavigate, onAction]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to tab or run an action…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {TABS.map(tab => (
            <CommandItem
              key={tab.value}
              value={`${tab.value} ${tab.keywords.join(' ')}`}
              onSelect={() => handleSelect(tab.value)}
              className="gap-2"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {ACTIONS.map(action => (
            <CommandItem
              key={action.id}
              value={`${action.id} ${action.keywords.join(' ')}`}
              onSelect={() => handleSelect(action.id)}
              className="gap-2"
            >
              {action.icon}
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
