import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Zap, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmailSnippets, resolveTokens, type TokenContext } from '@/hooks/useEmailSnippets';
import { cn } from '@/lib/utils';

interface SnippetPickerProps {
  onInsert: (text: string) => void;
  tokenContext: TokenContext;
  triggerClassName?: string;
}

export function SnippetPicker({ onInsert, tokenContext, triggerClassName }: SnippetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { snippets, isLoading, incrementUsage } = useEmailSnippets();

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = snippets.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.body.toLowerCase().includes(q);
  });

  const handleSelect = (snippet: typeof snippets[0]) => {
    const resolved = resolveTokens(snippet.body, tokenContext);
    onInsert(resolved);
    incrementUsage.mutate(snippet.id);
    setOpen(false);
  };

  // Detect unresolved tokens in preview
  const getPreview = (body: string) => {
    const resolved = resolveTokens(body, tokenContext);
    return resolved.length > 80 ? resolved.slice(0, 80) + '…' : resolved;
  };

  const hasUnresolved = (body: string) => {
    const resolved = resolveTokens(body, tokenContext);
    return /\{[^}]+\}/.test(resolved);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn('gap-1 text-muted-foreground h-7 text-xs', triggerClassName)}
            >
              <Zap className="h-3 w-3" />
              Snippets
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Insert snippet (⌘/)</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="start"
        className="w-[320px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="h-8 text-xs pl-7 bg-transparent"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[240px]">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading snippets…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center">
              <FileText className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                {snippets.length === 0 ? 'No snippets yet. Create one in Settings.' : 'No matching snippets'}
              </p>
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((snippet) => (
                <button
                  key={snippet.id}
                  onClick={() => handleSelect(snippet)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/60 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {snippet.name}
                    </span>
                    {snippet.usage_count > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5">
                        <Hash className="h-2 w-2" />{snippet.usage_count}
                      </Badge>
                    )}
                    {hasUnresolved(snippet.body) && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/30 text-amber-500">
                        tokens
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                    {getPreview(snippet.body)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            {filtered.length} snippet{filtered.length !== 1 ? 's' : ''} · Tokens auto-resolve from recipient
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
