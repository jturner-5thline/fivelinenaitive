import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Building2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface CompanyComboBoxProps {
  value: string; // crm_company_id
  onChange: (companyId: string) => void;
  email?: string;
}

export function CompanyComboBox({ value, onChange, email }: CompanyComboBoxProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  // Server-side search so companies beyond the first page are still findable.
  const { data: companiesResult } = useCrmCompanies({ pageSize: 50, search: debouncedSearch || undefined });
  const companies = companiesResult?.data ?? [];
  const { data: domainPoolResult } = useCrmCompanies({ pageSize: 1000 });
  const domainPool = domainPoolResult?.data ?? [];
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [domainSuggested, setDomainSuggested] = useState(false);
  const [justCreated, setJustCreated] = useState<{ id: string; name: string; domain?: string | null } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);


  const selectedCompany =
    companies.find(c => c.id === value) ||
    domainPool.find(c => c.id === value) ||
    (justCreated && justCreated.id === value ? justCreated : undefined);


  // Domain auto-matching from email
  useEffect(() => {
    if (!email || domainSuggested || value) return;
    const atIdx = email.indexOf('@');
    if (atIdx < 0) return;
    const domain = email.slice(atIdx + 1).toLowerCase();
    // Only act on a fully-formed domain (avoids firing mid-typing on "gmai.")
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return;

    // Common free email providers to skip
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'];
    if (freeProviders.includes(domain)) return;

    const timer = setTimeout(() => {
    const match = domainPool.find(c => {
      const cDomain = c.domain?.toLowerCase()?.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
      const additionalDomains = (c.additional_domains || []).map((d: string) => d.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, ''));
      return cDomain === domain || additionalDomains.includes(domain);
    });

    if (match) {
      onChange(match.id);
      setDomainSuggested(true);
    } else {
      // Pre-fill with domain stem immediately so the field never looks empty,
      // then ask the backend to resolve the real company name from the website.
      const domainStem = domain.split('.')[0];
      setSearch(domainStem);
      setDomainSuggested(true);
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('scrape-company-info', {
            body: { url: domain },
          });
          if (error) return;
          const resolved = (data as any)?.data?.companyName;
          if (!resolved || typeof resolved !== 'string') return;
          const trimmed = resolved.trim();
          if (!trimmed) return;
          // Only overwrite if the user hasn't typed anything different yet.
          setSearch(prev => (prev === domainStem || prev === '' ? trimmed : prev));
        } catch {
          // Silent — domain stem stays as the fallback suggestion.
        }
      })();
    }
    }, 700);
    return () => clearTimeout(timer);
  }, [email, domainPool, value, domainSuggested, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Results come back already filtered by the server when searching.
  const filtered = search.trim() ? companies : companies.slice(0, 20);

  const exactMatch = search.trim() && companies.some(c => c.name.toLowerCase() === search.toLowerCase().trim());


  const handleCreateNew = () => {
    if (!search.trim()) return;
    setOpen(false);
    setCreateOpen(true);
  };

  const handleCreated = (company: any) => {
    setCreateOpen(false);
    if (!company?.id) return;
    onChange(company.id);
    setJustCreated({ id: company.id, name: company.name, domain: company.domain });
    setSearch('');
    toast.success(
      <span>
        {company.name} was created as a new company —{' '}
        <span
          className="underline cursor-pointer font-medium"
          onClick={() => navigate(`/crm-companies/${company.id}`)}
        >
          View details
        </span>
      </span>
    );
  };

  const createModal = (
    <CreateCrmCompanyModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      initialName={search.trim()}
      onCreated={handleCreated}
    />
  );

  if (selectedCompany) {
    return (
      <>
      <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-background">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm flex-1 truncate">{selectedCompany.name}</span>
        <button
          type="button"
          onClick={() => { onChange(''); setDomainSuggested(false); setJustCreated(null); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {createModal}
      </>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search or create company..."
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="pl-8"
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-[rgba(157,162,245,0.2)] bg-[#171B2C] text-white backdrop-blur-none shadow-lg max-h-[220px] overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
              onClick={() => {
                onChange(c.id);
                setSearch('');
                setOpen(false);
              }}
            >
              <p className="font-medium">{c.name}</p>
              {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
            </button>
          ))}
          {filtered.length === 0 && !search.trim() && (
            <p className="text-xs text-muted-foreground text-center py-3">No companies yet</p>
          )}
          {search.trim() && !exactMatch && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t flex items-center gap-2 text-primary font-medium"
              onClick={handleCreateNew}
            >
              <Plus className="h-3.5 w-3.5" />
              Create "{search.trim()}"
            </button>
          )}
        </div>
      )}
      {createModal}
    </div>
  );
}
