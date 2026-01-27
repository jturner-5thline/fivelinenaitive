import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LenderContact {
  id: string;
  lender_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LenderContactInsert {
  lender_id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

export function useLenderContacts(lenderId: string | null) {
  const [contacts, setContacts] = useState<LenderContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!lenderId) {
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

      setContacts((data as LenderContact[]) || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch contacts';
      setError(message);
      console.error('Error fetching lender contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [lenderId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const addContact = async (contact: Omit<LenderContactInsert, 'lender_id'>): Promise<LenderContact | null> => {
    if (!lenderId) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('lender_contacts')
        .insert({ ...contact, lender_id: lenderId })
        .select()
        .single();

      if (insertError) throw insertError;

      const newContact = data as LenderContact;
      setContacts(prev => [...prev, newContact]);
      return newContact;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add contact';
      toast.error(message);
      return null;
    }
  };

  const updateContact = async (id: string, updates: Partial<Omit<LenderContactInsert, 'lender_id'>>): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('lender_contacts')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update contact';
      toast.error(message);
      return false;
    }
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('lender_contacts')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setContacts(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete contact';
      toast.error(message);
      return false;
    }
  };

  const setPrimaryContact = async (id: string): Promise<boolean> => {
    if (!lenderId) return false;

    try {
      // First, unset all primary contacts for this lender
      const { error: unsetError } = await supabase
        .from('lender_contacts')
        .update({ is_primary: false })
        .eq('lender_id', lenderId);

      if (unsetError) throw unsetError;

      // Then set the selected contact as primary
      const { error: setError } = await supabase
        .from('lender_contacts')
        .update({ is_primary: true })
        .eq('id', id);

      if (setError) throw setError;

      setContacts(prev => prev.map(c => ({
        ...c,
        is_primary: c.id === id
      })));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set primary contact';
      toast.error(message);
      return false;
    }
  };

  return {
    contacts,
    loading,
    error,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact,
    setPrimaryContact,
  };
}
