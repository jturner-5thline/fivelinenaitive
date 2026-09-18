import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
}

const toUrl = (c: CompanyRow) => {
  const raw = (c.website_url || c.domain || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
};

interface CompanyUrlPickerProps {
  currentUrl?: string;
  onSelect: (url: string) => void;
}

/** Lets the user pick an existing company from the companies database to fill the Company URL. */
export function CompanyUrlPicker({ currentUrl, onSelect }: CompanyUrlPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['company-url-picker', search],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from('crm_companies')
        .select('id, name, domain, website_url')
        .order('name', { ascending: true })
        .limit(50);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(`name.ilike.${term},domain.ilike.${term},website_url.ilike.${term}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CompanyRow[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Pick a company from the companies database"
        >
          <Building2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-[280px] p-2"
      >
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="h-8 text-sm"
        />
        <div className="mt-2 max-h-[min(50vh,var(--radix-popover-content-available-height))] overflow-y-auto">
          {isLoading && <div className="px-2 py-3 text-xs text-muted-foreground">Loading...</div>}
          {!isLoading && companies.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No companies found</div>
          )}
          {companies.map((company) => {
            const url = toUrl(company);
            const selected = !!url && !!currentUrl && url.replace(/\/+$/, '') === currentUrl.replace(/\/+$/, '');
            return (
              <button
                key={company.id}
                type="button"
                disabled={!url}
                onClick={() => {
                  onSelect(url);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate">{company.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {url || 'No website on file'}
                  </span>
                </span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
