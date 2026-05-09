import { useEffect, useMemo, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCrmCompanies, useCreateCrmCompany } from '@/hooks/useCrmCompanies';
import { useLinkContactToCompany } from '@/hooks/useCrmLinks';
import { useUpdateContact } from '@/hooks/useContacts';
import { extractEmailDomain, normalizeDomain, companyNameFromDomain } from '@/lib/extractEmailDomain';
import { toast } from 'sonner';

interface Props {
  contactId: string;
  contactName: string;
  email: string | null | undefined;
  currentCrmCompanyId: string | null | undefined;
  /** Persistence key — once dismissed for this contact, don't re-prompt this session. */
  storageKey?: string;
  onLinkRequested?: () => void;
}

export function CompanyDomainMatchPrompt({ contactId, contactName, email, currentCrmCompanyId, onLinkRequested }: Props) {
  const domain = useMemo(() => extractEmailDomain(email || ''), [email]);
  const dismissKey = `domain-prompt-dismissed:${contactId}`;
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: companiesResult } = useCrmCompanies({ pageSize: 1000 });
  const companies = companiesResult?.data ?? [];
  const createCompany = useCreateCrmCompany();
  const linkToCompany = useLinkContactToCompany();
  const updateContact = useUpdateContact();

  const matchedCompany = useMemo(() => {
    if (!domain) return null;
    return companies.find(c => {
      const cDomain = normalizeDomain(c.domain);
      const additional = (c.additional_domains || []).map((d: string) => normalizeDomain(d));
      return cDomain === domain || additional.includes(domain);
    }) || null;
  }, [domain, companies]);

  // Persist website_url from email domain if missing
  useEffect(() => {
    if (!domain) return;
    // best-effort, fire-and-forget; only triggers when contact has email but no website_url
    // Note: we don't have website_url here directly — handled in detail view separately.
  }, [domain]);

  useEffect(() => {
    if (currentCrmCompanyId) return;
    if (!domain) return;
    if (dismissed) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey)) {
      setDismissed(true);
      return;
    }
    setOpen(true);
  }, [currentCrmCompanyId, domain, dismissed, dismissKey]);

  const handleClose = () => {
    setOpen(false);
    setDismissed(true);
    try { sessionStorage.setItem(dismissKey, '1'); } catch {}
  };

  const handleConfirmLink = async () => {
    if (!matchedCompany) return;
    await linkToCompany.mutateAsync({ contactId, companyId: matchedCompany.id });
    handleClose();
  };

  const handleCreate = async () => {
    if (!domain) return;
    const name = companyNameFromDomain(domain);
    try {
      const created = await createCompany.mutateAsync({ name, domain } as any);
      await linkToCompany.mutateAsync({ contactId, companyId: created.id });
      // Also stamp website_url on the contact
      updateContact.mutate({ id: contactId, website_url: `https://${domain}` } as any);
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create company');
    }
  };

  if (!domain || currentCrmCompanyId) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <AlertDialogContent>
        {matchedCompany ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Link to {matchedCompany.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Link <strong>{contactName}</strong> to <strong>{matchedCompany.name}</strong>? (matched by email domain <code>{domain}</code>)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleClose}>Not now</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLink} disabled={linkToCompany.isPending}>
                {linkToCompany.isPending ? 'Linking…' : 'Link company'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>No company found for {domain}</AlertDialogTitle>
              <AlertDialogDescription>
                Create <strong>{companyNameFromDomain(domain)}</strong> as a new company, or link this contact to an existing company manually.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={handleClose}>Dismiss</Button>
              <Button variant="outline" onClick={() => { handleClose(); onLinkRequested?.(); }}>
                Link manually
              </Button>
              <Button onClick={handleCreate} disabled={createCompany.isPending || linkToCompany.isPending}>
                {createCompany.isPending ? 'Creating…' : `Create ${companyNameFromDomain(domain)}`}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}