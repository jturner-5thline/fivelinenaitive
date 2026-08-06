import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Server-side CRM lookups keyed by lowercase query. The contacts table
  // has 100k+ rows so it can never be loaded client-side — we query it on
  // demand and cache each query's results.
  const [remoteByQuery, setRemoteByQuery] = useState<Record<string, EmailContact[]>>({});
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Pull distinct senders + recipients from the local mail caches.
      // `email_cache` covers Gmail/Nylas; `emails` covers Microsoft/Outlook
      // (which never writes to email_cache — that's why Outlook users saw
      // an empty recipient dropdown).
      const [cacheRes, outlookRes] = await Promise.all([
        supabase
          .from('email_cache')
          .select('from_email, from_name, to_emails, cc_emails, received_at')
          .eq('user_id', user.id)
          .order('received_at', { ascending: false })
          .limit(500),
        supabase
          .from('emails')
          .select('from_email, from_name, to_emails, received_at')
          .eq('user_id', user.id)
          .order('received_at', { ascending: false })
          .limit(500),
      ]);
      const rows: any[] = [...(cacheRes.data || []), ...(outlookRes.data || [])];

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

      for (const row of rows) {
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

  // Fetch matching CRM contacts for a query and memoize the result. Fires
  // at most once per distinct query per session.
  const fetchRemote = useCallback(async (q: string) => {
    if (inflightRef.current.has(q)) return;
    inflightRef.current.add(q);
    try {
      const escaped = q.replace(/[%,()]/g, ' ').trim();
      if (!escaped) return;
      const { data } = await supabase
        .from('contacts')
        .select('email, full_name, first_name, last_name, last_activity_date')
        .not('email', 'is', null)
        .or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
        .limit(12);
      const results: EmailContact[] = (data || [])
        .filter((c: any) => c.email && String(c.email).includes('@'))
        .map((c: any) => ({
          email: String(c.email).toLowerCase().trim(),
          name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
          frequency: 0,
          lastSeen: c.last_activity_date || '',
        }));
      setRemoteByQuery((prev) => (prev[q] ? prev : { ...prev, [q]: results }));
    } catch {
      setRemoteByQuery((prev) => (prev[q] ? prev : { ...prev, [q]: [] }));
    }
  }, []);

  const search = useCallback((query: string, exclude: string[] = []): EmailContact[] => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase().trim();
    const excludeSet = new Set(exclude.map(e => e.toLowerCase()));

    // Kick off (or reuse) the CRM lookup. Results arrive via state and
    // re-run this search through the new `search` identity.
    if (q.length >= 2 && remoteByQuery[q] === undefined) void fetchRemote(q);

    const local = contacts.filter(c => {
      if (excludeSet.has(c.email)) return false;
      return c.email.includes(q) || (c.name && c.name.toLowerCase().includes(q));
    });

    const seen = new Set(local.map(c => c.email));
    const remote = (remoteByQuery[q] || []).filter(
      c => !excludeSet.has(c.email) && !seen.has(c.email),
    );

    return [...local, ...remote].slice(0, 8);
  }, [contacts, remoteByQuery, fetchRemote]);

  return { contacts, search, loaded };
}
