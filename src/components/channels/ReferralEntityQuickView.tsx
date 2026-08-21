import { Suspense, lazy } from 'react';
import { Routes, Route, useResolvedPath } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { ContactDetailContent } from '@/components/crm/ContactDetailContent';
import { CompanyDetailContent } from '@/components/crm/CompanyDetailContent';
import { loadDealDetail } from '@/lib/lazyDealDetail';

const DealDetail = lazy(() => loadDealDetail());

export type QuickViewTarget =
  | { type: 'contact'; id: string }
  | { type: 'company'; id: string }
  | { type: 'deal'; id: string };

function DealQuickView({ dealId }: { dealId: string }) {
  // Render the deal detail page inside the dialog using a synthetic
  // location so `useParams().id` resolves to this deal (same approach as
  // the kanban deal overlay — React Router forbids nested <Router>).
  const parentBase = useResolvedPath('.').pathname.replace(/\/$/, '');
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Routes
        key={dealId}
        location={{
          pathname: `${parentBase}/__quickview/${dealId}`,
          search: '?embedded=1',
          hash: '',
          state: null,
          key: dealId,
        }}
      >
        <Route path="__quickview/:id" element={<DealDetail />} />
      </Routes>
    </Suspense>
  );
}

export function ReferralEntityQuickView({
  target,
  onClose,
}: {
  target: QuickViewTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[95vw] w-[1400px] max-h-[92vh] p-0 overflow-hidden"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        {target.type === 'deal' ? (
          <div className="max-h-[92vh] overflow-auto [&_header]:hidden">
            <DealQuickView dealId={target.id} />
          </div>
        ) : (
          <ScrollArea className="max-h-[92vh] p-6">
            {target.type === 'company' ? (
              <CompanyDetailContent companyId={target.id} hideBackButton onDeleted={onClose} />
            ) : (
              <ContactDetailContent contactId={target.id} hideBackButton onDeleted={onClose} />
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
