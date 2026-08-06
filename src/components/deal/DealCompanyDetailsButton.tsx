import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, Loader2 } from 'lucide-react';

const CompanyDetailContent = lazy(() =>
  import('@/components/crm/CompanyDetailContent').then((m) => ({ default: m.CompanyDetailContent })),
);

interface Props {
  crmCompanyId?: string | null;
  companyName?: string | null;
}

export function DealCompanyDetailsButton({ crmCompanyId, companyName }: Props) {
  const [open, setOpen] = useState(false);

  const { data: resolvedId, isLoading } = useQuery({
    queryKey: ['deal-company-details-resolve', crmCompanyId, companyName],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (crmCompanyId) return crmCompanyId;
      if (!companyName?.trim()) return null;
      const { data } = await supabase
        .from('crm_companies')
        .select('id, name')
        .ilike('name', companyName.trim())
        .limit(1);
      return (data?.[0] as any)?.id ?? null;
    },
  });

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="View company details"
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setOpen(true)}
          >
            <Building2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Company details</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[95vw] w-[1400px] max-h-[92vh] p-0 overflow-hidden"
          overlayClassName="bg-black/60 backdrop-blur-sm"
        >
          <ScrollArea className="max-h-[92vh] p-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading company…
              </div>
            ) : resolvedId ? (
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading company…
                  </div>
                }
              >
                <CompanyDetailContent companyId={resolvedId} hideBackButton onDeleted={() => setOpen(false)} />
              </Suspense>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                No CRM company is linked to this deal{companyName ? ` ("${companyName}")` : ''}. Link one from the CRM tab to see
                its details here.
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
