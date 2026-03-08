import { useState } from 'react';
import { X, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface WatchlistPanelProps {
  open: boolean;
  onClose: () => void;
}

interface WatchlistItem {
  id: string;
  name: string;
  articleCount: number;
  autoTracked?: boolean;
  enabled?: boolean;
}

const INITIAL_COMPANIES: WatchlistItem[] = [
  { id: '1', name: 'Ares Management', articleCount: 5 },
  { id: '2', name: 'Blue Owl Capital', articleCount: 3 },
  { id: '3', name: 'Equal Capital', articleCount: 2 },
];

const INITIAL_PEOPLE: WatchlistItem[] = [
  { id: '1', name: 'Marc Rowan (Apollo)', articleCount: 4 },
  { id: '2', name: 'Michael Arougheti (Ares)', articleCount: 2 },
];

const INITIAL_KEYWORDS: WatchlistItem[] = [
  { id: '1', name: 'private credit', articleCount: 12 },
  { id: '2', name: 'covenant-lite', articleCount: 3 },
  { id: '3', name: 'healthcare lending', articleCount: 5 },
  { id: '4', name: 'default rates', articleCount: 2 },
];

const AUTO_TRACKED: WatchlistItem[] = [
  { id: 'a1', name: 'Athyna (Borrower)', articleCount: 1, autoTracked: true, enabled: true },
  { id: 'a2', name: 'Summit Healthcare Partners (Borrower)', articleCount: 2, autoTracked: true, enabled: true },
  { id: 'a3', name: 'TechFlow Capital (Sponsor)', articleCount: 0, autoTracked: true, enabled: true },
  { id: 'a4', name: 'Golub Capital (Lender)', articleCount: 1, autoTracked: true, enabled: false },
];

export function WatchlistPanel({ open, onClose }: WatchlistPanelProps) {
  const [companies, setCompanies] = useState(INITIAL_COMPANIES);
  const [people, setPeople] = useState(INITIAL_PEOPLE);
  const [keywords, setKeywords] = useState(INITIAL_KEYWORDS);
  const [autoTracked, setAutoTracked] = useState(AUTO_TRACKED);

  const [newCompany, setNewCompany] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  const addItem = (
    list: WatchlistItem[],
    setList: React.Dispatch<React.SetStateAction<WatchlistItem[]>>,
    name: string,
    clearFn: () => void
  ) => {
    if (!name.trim()) return;
    setList([...list, { id: crypto.randomUUID(), name: name.trim(), articleCount: 0 }]);
    clearFn();
  };

  const removeItem = (
    list: WatchlistItem[],
    setList: React.Dispatch<React.SetStateAction<WatchlistItem[]>>,
    id: string
  ) => {
    setList(list.filter(i => i.id !== id));
  };

  const toggleAutoTracked = (id: string) => {
    setAutoTracked(prev =>
      prev.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item)
    );
  };

  const renderSection = (
    title: string,
    items: WatchlistItem[],
    setItems: React.Dispatch<React.SetStateAction<WatchlistItem[]>>,
    inputValue: string,
    setInputValue: React.Dispatch<React.SetStateAction<string>>,
    placeholder: string
  ) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span className="text-foreground">{item.name}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] h-5">
                {item.articleCount} articles
              </Badge>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeItem(items, setItems, item.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') addItem(items, setItems, inputValue, () => setInputValue(''));
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 flex-shrink-0"
          onClick={() => addItem(items, setItems, inputValue, () => setInputValue(''))}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Watchlist</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-5 pb-4">
            {renderSection('Companies', companies, setCompanies, newCompany, setNewCompany, '+ Add company name')}
            <Separator />
            {renderSection('People', people, setPeople, newPerson, setNewPerson, '+ Add person name')}
            <Separator />
            {renderSection('Keywords & Topics', keywords, setKeywords, newKeyword, setNewKeyword, '+ Add keyword or topic')}
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-tracked from Pipeline</p>
              <p className="text-xs text-muted-foreground">Entities imported from your active deals.</p>
              <div className="space-y-1">
                {autoTracked.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="text-foreground">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] h-5">
                        {item.articleCount} articles
                      </Badge>
                      <button onClick={() => toggleAutoTracked(item.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {item.enabled ? (
                          <ToggleRight className="h-5 w-5 text-primary" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
