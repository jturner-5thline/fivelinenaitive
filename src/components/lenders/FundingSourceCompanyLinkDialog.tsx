import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import { findCompanyMatches, extractDomain, CompanyCandidate } from '@/lib/funding-sources/companyMatch';

export interface FundingSourceCompanyTarget {
  lenderId: string;
  name: string;
  website?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
}

interface Props {
  target: FundingSourceCompanyTarget | null;
  onClose: () => void;
}

export function FundingSourceCompanyLinkDialog({ target, onClose }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<CompanyCandidate[]>([]);
  const [choice, setChoice] = useState<string>('new');

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setMatches([]);
    setChoice('new');
    findCompanyMatches(target.name, target.website, target.email)
      .then(res => {
        if (cancelled) return;
        setMatches(res);
        setChoice(res.length > 0 ? res[0].id : 'new');
      })
      .catch(err => console.warn('[FundingSourceCompanyLink] match failed', err))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [target?.lenderId]);

  if (!target) return null;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      let companyId = choice;
      if (choice === 'new') {
        const domain = extractDomain(target.website) || extractDomain(target.email);
        const { data, error } = await supabase
          .from('crm_companies')
          .insert({
            name: target.name,
            domain,
            website_url: target.website?.trim() || null,
            linkedin_url: target.linkedinUrl?.trim() || null,
            phone: target.phone?.trim() || null,
            address: target.address?.trim() || null,
            description: target.description?.trim() || null,
            company_type: 'Funding Source',
            source_system: 'funding_source',
            created_by: user?.id ?? null,
            org_company_id: company?.id ?? null,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        companyId = data!.id;
      }

      const { error: linkErr } = await supabase
        .from('master_lenders')
        .update({ crm_company_id: companyId } as any)
        .eq('id', target.lenderId);
      if (linkErr) throw linkErr;

      toast({
        title: choice === 'new' ? 'Company created' : 'Linked to existing company',
        description:
          choice === 'new'
            ? `${target.name} was added to Companies and linked to this funding source.`
            : `Linked to ${matches.find(m => m.id === choice)?.name ?? 'company'}.`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: 'Could not link company', description: err?.message ?? 'Unexpected error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add “{target.name}” as a company?</DialogTitle>
          <DialogDescription>
            Every funding source should also exist as a company. Confirm whether this matches an
            existing company or should create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking for existing companies…
            </div>
          ) : (
            <>
              {matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => setChoice(m.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-md text-left border transition-colors',
                    choice === m.id ? 'border-primary/40 bg-primary/10' : 'border-border/60 hover:bg-muted/40'
                  )}
                >
                  <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.domain || m.website_url || 'No domain on file'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap">{m.reason}</Badge>
                  {choice === m.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </button>
              ))}

              <button
                onClick={() => setChoice('new')}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-md text-left border transition-colors',
                  choice === 'new' ? 'border-primary/40 bg-primary/10' : 'border-border/60 hover:bg-muted/40'
                )}
              >
                <Plus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Create new company “{target.name}”</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {extractDomain(target.website) || extractDomain(target.email) || 'No domain detected'}
                  </p>
                </div>
                {choice === 'new' && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>

              {matches.length === 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  No similar companies found by name or domain.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Skip for now</Button>
          <Button onClick={handleConfirm} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {choice === 'new' ? 'Create company' : 'Link company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
