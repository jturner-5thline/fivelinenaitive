import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContact } from '@/hooks/useContacts';
import { ContactDetailContent } from '@/components/crm/ContactDetailContent';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact } = useContact(id);

  return (
    <>
      <Helmet>
        <title>{contact?.full_name || 'Contact'} | naitive</title>
      </Helmet>

      <div className="min-h-screen">
        <div className="container mx-auto py-6 px-4 space-y-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Contacts
          </Button>

          {id && <ContactDetailContent contactId={id} onDeleted={() => navigate('/contacts')} />}
        </div>
      </div>
    </>
  );
}
