import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContacts } from '@/hooks/useContacts';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { TablePagination } from '@/components/shared/TablePagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

export default function Contacts() {
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const { data: result, isLoading, isFetching } = useContacts({
    page,
    pageSize,
    quickFilter,
  });

  const contacts = result?.data ?? [];
  const totalCount = result?.totalCount ?? 0;
  const totalPages = result?.totalPages ?? 0;

  const handleQuickFilterChange = (value: string) => {
    setQuickFilter(value);
    setPage(0);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <>
      <Helmet>
        <title>Contacts | nAItive</title>
        <meta name="description" content="Manage your sales contacts, leads, and prospects." />
      </Helmet>

      <div className="bg-transparent">
        <DealsHeader />
        <main className="w-full px-4 pt-4 pb-3 sm:px-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" /> Import
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Contact
              </Button>
            </div>
          </div>

          {/* Quick filters */}
          <Tabs value={quickFilter} onValueChange={handleQuickFilterChange}>
            <TabsList>
              <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
              <TabsTrigger value="new_leads">New Leads</TabsTrigger>
              <TabsTrigger value="meeting_scheduled">Meeting Scheduled</TabsTrigger>
              <TabsTrigger value="high_score">High Score</TabsTrigger>
              <TabsTrigger value="no_activity_7d">No Activity 7d</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 max-w-sm" />
                <Skeleton className="h-9 w-[150px]" />
                <Skeleton className="h-9 w-[150px]" />
              </div>
              <div className="border rounded-lg overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 border-b last:border-b-0">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className={isFetching ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
                <ContactsTable contacts={contacts} />
              </div>
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isFetching}
              />
            </>
          )}
        </main>
      </div>

      <CreateContactModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
