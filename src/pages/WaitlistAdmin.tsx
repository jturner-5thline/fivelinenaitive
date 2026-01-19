import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Download, Loader2, Users, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  created_at: string;
}

export default function WaitlistAdmin() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchWaitlist = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
      setFilteredEntries(data || []);
    } catch (error: any) {
      console.error('Error fetching waitlist:', error);
      toast({
        title: 'Error loading waitlist',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWaitlist();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEntries(entries);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredEntries(
        entries.filter(
          (entry) =>
            entry.email.toLowerCase().includes(query) ||
            entry.name?.toLowerCase().includes(query) ||
            entry.company?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, entries]);

  const exportToCSV = () => {
    const headers = ['Email', 'Name', 'Company', 'Signed Up'];
    const rows = filteredEntries.map((entry) => [
      entry.email,
      entry.name || '',
      entry.company || '',
      format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm:ss'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `waitlist-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();

    toast({
      title: 'Export complete',
      description: `Exported ${filteredEntries.length} entries to CSV`,
    });
  };

  return (
    <>
      <Helmet>
        <title>Waitlist Admin - nAItive</title>
      </Helmet>

      <div className="bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Waitlist Signups
                </h1>
                <p className="text-muted-foreground">
                  {entries.length} total signup{entries.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchWaitlist} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={exportToCSV} disabled={filteredEntries.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">All Signups</CardTitle>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email, name, or company..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                {searchQuery && (
                  <CardDescription>
                    Showing {filteredEntries.length} of {entries.length} entries
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQuery ? 'No matching entries found' : 'No waitlist signups yet'}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Signed Up</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.email}</TableCell>
                            <TableCell>{entry.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{entry.company || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}