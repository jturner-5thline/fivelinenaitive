import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface EmailContact {
  email: string;
  name: string | null;
  frequency: number;
  lastSeen: string;
}

export function useEmailContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Pull distinct senders + recipients from email_cache
      const { data, error } = await supabase
        .from('email_cache')
        .select('from_email, from_name, to_emails, cc_emails, received_at')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        setLoaded(true);
        return;
      }

      const map = new Map<string, { name: string | null; count: number; lastSeen: string }>();

      const addContact = (email: string | null, name: string | null, date: string | null) => {
        if (!email) return;
        const normalized = email.toLowerCase().trim();
        if (!normalized || !normalized.includes('@')) return;
        // Skip own email
        if (normalized === user.email?.toLowerCase()) return;

        const existing = map.get(normalized);
        if (existing) {
          existing.count++;
          if (!existing.name && name) existing.name = name;
          if (date && date > existing.lastSeen) existing.lastSeen = date;
        } else {
          map.set(normalized, { name: name || null, count: 1, lastSeen: date || '' });
        }
      };

      for (const row of data) {
        addContact(row.from_email, row.from_name, row.received_at);
        if (row.to_emails) {
          for (const email of row.to_emails) addContact(email, null, row.received_at);
        }
        if (row.cc_emails) {
          for (const email of row.cc_emails) addContact(email, null, row.received_at);
        }
      }

      const results: EmailContact[] = Array.from(map.entries())
        .map(([email, info]) => ({
          email,
          name: info.name,
          frequency: info.count,
          lastSeen: info.lastSeen,
        }))
        .sort((a, b) => b.frequency - a.frequency);

      setContacts(results);
      setLoaded(true);
    };

    load();
  }, [user]);

  const search = useCallback((query: string, exclude: string[] = []): EmailContact[] => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase().trim();
    const excludeSet = new Set(exclude.map(e => e.toLowerCase()));

    return contacts
      .filter(c => {
        if (excludeSet.has(c.email)) return false;
        return c.email.includes(q) || (c.name && c.name.toLowerCase().includes(q));
      })
      .slice(0, 8);
  }, [contacts]);

  return { contacts, search, loaded };
}
