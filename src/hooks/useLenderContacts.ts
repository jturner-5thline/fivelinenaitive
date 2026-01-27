import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface LenderContact {
  id: string;
  lender_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LenderContactInsert {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

export function useLenderContacts(lenderId: string | null) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<LenderContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!lenderId || !user) {
      setContacts([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('lender_contacts')
        .select('*')
        .eq('lender_id', lenderId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      setContacts((data as LenderContact[]) ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch contacts';
      setError(message);
      console.error('Error fetching lender contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [lenderId, user]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const addContact = async (contact: LenderContactInsert): Promise<LenderContact | null> => {
    if (!lenderId || !user) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('lender_contacts')
        .insert({
          lender_id: lenderId,
          ...contact,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newContact = data as LenderContact;
      setContacts((prev) => [...prev, newContact]);
      toast.success('Contact added successfully');
      return newContact;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add contact';
      toast.error(message);
      return null;
    }
  };

  const updateContact = async (contactId: string, updates: Partial<LenderContactInsert>): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('lender_contacts')
        .update(updates)
        .eq('id', contactId);

      if (updateError) throw updateError;

      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, ...updates, updated_at: new Date().toISOString() } : c))
      );
      toast.success('Contact updated');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update contact';
      toast.error(message);
      return false;
    }
  };

  const deleteContact = async (contactId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('lender_contacts')
        .delete()
        .eq('id', contactId);

      if (deleteError) throw deleteError;

      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success('Contact deleted');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete contact';
      toast.error(message);
      return false;
    }
  };

  return {
    contacts,
    loading,
    error,
    addContact,
    updateContact,
    deleteContact,
    refetch: fetchContacts,
  };
}
