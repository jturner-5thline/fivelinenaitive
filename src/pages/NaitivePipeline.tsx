import { Helmet } from 'react-helmet-async';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { lazy, Suspense, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PartnerDetailPanel } from '@/components/partners/PartnerDetailPanel';
import { usePartners } from '@/hooks/usePartnersPipeline';

const PartnersPipeline = lazy(() => import('./PartnersPipeline'));

export default function NaitivePipeline() {
  const { hasAccess, isLoading } = useNaitivePipelineAccess();
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/deals" replace />;
  }

  return (
    <>
      <Helmet>
        <title>naitive Pipeline | nAItive</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-8 px-4">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <PartnersPipeline />
          </Suspense>
        </div>
      </div>
      <PartnerDetailPanel partner={viewPartner} onClose={() => setViewPartnerId(null)} />
    </>
  );
}
