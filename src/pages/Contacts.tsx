import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContacts } from '@/hooks/useContacts';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { Loader2 } from 'lucide-react';

export default function Contacts() {
  const { data: contacts = [], isLoading } = useContacts();
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');

  const filteredContacts = (() => {
    switch (quickFilter) {
      case 'new_leads':
        return contacts.filter(c => c.status === 'new');
      case 'meeting_scheduled':
        return contacts.filter(c => c.status === 'meeting_scheduled');
      case 'high_score':
        return contacts.filter(c => c.contact_score >= 70);
      case 'no_activity_7d':
        return contacts.filter(c => {
          if (!c.last_activity_date) return true;
          const diff = Date.now() - new Date(c.last_activity_date).getTime();
          return diff > 7 * 24 * 60 * 60 * 1000;
        });
      default:
        return contacts;
    }
  })();

  return (
    <>
      <Helmet>
        <title>Contacts | nAItive</title>
        <meta name="description" content="Manage your sales contacts, leads, and prospects." />
      </Helmet>

      <div className="bg-transparent">
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
          <Tabs value={quickFilter} onValueChange={setQuickFilter}>
            <TabsList>
              <TabsTrigger value="all">All ({contacts.length})</TabsTrigger>
              <TabsTrigger value="new_leads">New Leads</TabsTrigger>
              <TabsTrigger value="meeting_scheduled">Meeting Scheduled</TabsTrigger>
              <TabsTrigger value="high_score">High Score</TabsTrigger>
              <TabsTrigger value="no_activity_7d">No Activity 7d</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ContactsTable contacts={filteredContacts} />
          )}
      </div>

      <CreateContactModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
