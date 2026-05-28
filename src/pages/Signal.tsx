/**
 * /signal — relocated SignalStack workspace (Phase 3 of /admin redesign).
 * Mounted as a top-level admin destination so it stops bloating
 * /admin → Observability. Admin-gated.
 */
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { SignalStackApp } from "@/components/admin/signalstack/SignalStackApp";
import { Skeleton } from "@/components/ui/skeleton";

export default function Signal() {
  const { isAdmin, isLoading } = useAdminRole();
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/deals" replace />;
  return <SignalStackApp />;
}