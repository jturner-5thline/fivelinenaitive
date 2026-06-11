import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGmail } from '@/hooks/useGmail';
import { toast } from 'sonner';
import { DEMO_EMAIL_ANALYSIS } from '@/lib/demoSeed';
import { startVisibilityAwareInterval } from '@/lib/visibilityAwareInterval';

const isDemoUserEmail = (email?: string | null) =>
  email === 'demo@5thline.co' || email === 'demo@example.com';

export interface EmailIntelligenceSettings {
  auto_tagging: boolean;
  sentiment_analysis: boolean;
  signal_detection: boolean;
  follow_up_reminders: boolean;
  thread_summaries: boolean;
  auto_extract: boolean;
  tag_rules: any[];
}

export interface CachedEmail {
  id: string;
  gmail_message_id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  body_text?: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails?: string[] | null;
  labels: string[] | null;
  is_read: boolean;
  is_starred: boolean;
  received_at: string | null;
  fetched_at: string;
}

export interface EmailAnalysis {
  id: string;
  email_cache_id: string;
  deal_id: string | null;
  deal_name: string | null;
  category: string;
  sentiment: string;
  priority: string;
  summary: string | null;
  suggested_action: string | null;
  follow_up_needed: boolean;
  follow_up_by: string | null;
  extracted_data: Record<string, any>;
  signals: string[];
  analyzed_at: string;
}

export interface EnrichedEmail extends CachedEmail {
  analysis?: EmailAnalysis;
}

export interface EmailIntelligenceStats {
  total: number;
  unreadDealRelated: number;
  needFollowUp: number;
  urgent: number;
}

const DEFAULT_SETTINGS: EmailIntelligenceSettings = {
  auto_tagging: true,
  sentiment_analysis: true,
  signal_detection: true,
  follow_up_reminders: true,
  thread_summaries: false,
  auto_extract: false,
  tag_rules: [],
};

const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Initial page size and pagination step. Keep tight so the inbox paints
// fast; older messages load on demand via `loadMore`.
const INITIAL_PAGE_SIZE = 25;
const PAGE_STEP = 25;
// Hard cap on rows pulled from email_cache in a single window — covers
// thread-handled filtering without blowing up payload size.
const MAX_PAGE_LIMIT = 200;

// Skinny column set used for list rendering. Excludes body_text /
// body_html / attachments / cc_emails — those are loaded on demand when
// an email is opened or analyzed.
const LIST_COLUMNS =
  'id, gmail_message_id, thread_id, subject, snippet, from_email, from_name, to_emails, labels, is_read, is_starred, received_at, fetched_at';

/**
 * Owner mailbox used to determine whether a thread has already been
 * "handled" (i.e. James has sent a reply more recently than the inbound
 * email). Emails whose most recent thread message was sent by this address
 * are filtered out of the dashboard hover panel.
 */
const OWNER_EMAIL = 'jturner@5thline.co';

/**
 * Returns true if `email` should appear in the dashboard "Email
 * Intelligence" hover panel. Rules:
 *   • Always exclude messages sent BY the owner — those are outbound.
 *   • Include if the email is unread.
 *   • Include if read AND no later message in the same thread was sent by
 *     the owner (i.e. James hasn't replied since this came in).
 *   • Exclude if the most recent message in the thread is from the owner.
 */
function isUnhandled(email: CachedEmail, allByThread: Map<string, CachedEmail[]>): boolean {
  const fromSelf = (email.from_email || '').toLowerCase() === OWNER_EMAIL;
  if (fromSelf) return false;

  const tid = email.thread_id;
  const thread = (tid && allByThread.get(tid)) || [email];
  // Sort newest-first by received_at
  const sorted = [...thread].sort(
    (a, b) => new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime(),
  );
  const latest = sorted[0];
  const latestFromOwner = (latest?.from_email || '').toLowerCase() === OWNER_EMAIL;
  if (latestFromOwner) return false;

  if (!email.is_read) return true;

  // Read inbound: only show if there is no owner reply AFTER this email.
  const thisTime = new Date(email.received_at || 0).getTime();
  const ownerReplyAfter = thread.some((m) => {
    if ((m.from_email || '').toLowerCase() !== OWNER_EMAIL) return false;
    return new Date(m.received_at || 0).getTime() > thisTime;
  });
  return !ownerReplyAfter;
}

export function useEmailIntelligence() {
  const { user } = useAuth();
  const { status: gmailStatus, listMessages } = useGmail();
  const [emails, setEmails] = useState<EnrichedEmail[]>([]);
  const [settings, setSettings] = useState<EmailIntelligenceSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pageLimit, setPageLimit] = useState(INITIAL_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<number>(0);

  // Load settings from DB
  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('email_intelligence_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSettings({
          auto_tagging: data.auto_tagging ?? true,
          sentiment_analysis: data.sentiment_analysis ?? true,
          signal_detection: data.signal_detection ?? true,
          follow_up_reminders: data.follow_up_reminders ?? true,
          thread_summaries: data.thread_summaries ?? false,
          auto_extract: data.auto_extract ?? false,
          tag_rules: (data.tag_rules as any[]) || [],
        });
      }
      setSettingsLoaded(true);
    } catch (err) {
      console.error('Failed to load email intelligence settings:', err);
      setSettingsLoaded(true);
    }
  }, [user]);

  // Save settings to DB
  const saveSettings = useCallback(async (newSettings: EmailIntelligenceSettings) => {
    if (!user) return;
    setSettings(newSettings);
    try {
      const { error } = await supabase
        .from('email_intelligence_settings')
        .upsert({
          user_id: user.id,
          auto_tagging: newSettings.auto_tagging,
          sentiment_analysis: newSettings.sentiment_analysis,
          signal_detection: newSettings.signal_detection,
          follow_up_reminders: newSettings.follow_up_reminders,
          thread_summaries: newSettings.thread_summaries,
          auto_extract: newSettings.auto_extract,
          tag_rules: newSettings.tag_rules as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Intelligence settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    }
  }, [user]);

  // Fetch and cache emails from Gmail, then load from cache
  const syncEmails = useCallback(async (force = false) => {
    if (!user || !gmailStatus.connected) return;

    // Demo: bypass DB cache + AI analysis. Render the seeded mock inbox
    // with pre-baked analysis directly so storyline is deterministic.
    if (isDemoUserEmail(user.email)) {
      const result = await listMessages({ maxResults: 100 });
      const msgs = (result?.messages || []) as any[];
      const enriched: EnrichedEmail[] = msgs.map((m) => {
        const baked = DEMO_EMAIL_ANALYSIS[m.id];
        return {
          id: m.id,
          gmail_message_id: m.id,
          thread_id: m.thread_id || null,
          subject: m.subject || null,
          snippet: m.snippet || null,
          body_text: m.body_text || null,
          from_email: m.from_email || null,
          from_name: m.from_name || null,
          to_emails: m.to_emails || null,
          labels: m.labels || null,
          is_read: !!m.is_read,
          is_starred: !!m.is_starred,
          received_at: m.received_at || null,
          fetched_at: new Date().toISOString(),
          analysis: baked
            ? ({
                id: `demo-analysis-${m.id}`,
                email_cache_id: m.id,
                analyzed_at: new Date().toISOString(),
                ...baked,
              } as EmailAnalysis)
            : undefined,
        };
      });
      setEmails(enriched);
      return;
    }

    const now = Date.now();
    if (!force && now - lastSyncRef.current < 60_000) return; // debounce 1 min
    lastSyncRef.current = now;

    setIsLoading(true);
    try {
      // Fetch from Gmail API
      // Initial inbox load: fetch up to 100 messages so the All / Clients & Deals /
      // Asana & Projects / Calendar tabs each render a deep working set on
      // first open. Subsequent pagination still loads older messages.
      const result = await listMessages({ maxResults: 100 });
      const gmailMessages = result?.messages || [];

      if (gmailMessages.length === 0) {
        setIsLoading(false);
        return;
      }

      // Upsert into email_cache
      const cacheRows = gmailMessages.map((msg: any) => ({
        user_id: user.id,
        gmail_message_id: msg.id,
        thread_id: msg.thread_id || null,
        subject: msg.subject || null,
        snippet: msg.snippet || null,
        body_text: msg.body_text || null,
        from_email: msg.from_email || null,
        from_name: msg.from_name || null,
        to_emails: msg.to_emails || null,
        cc_emails: msg.cc_emails || null,
        labels: msg.labels || null,
        is_read: msg.is_read ?? true,
        is_starred: msg.is_starred ?? false,
        received_at: msg.received_at || null,
        fetched_at: new Date().toISOString(),
      }));

      // Batch upsert
      const { error: upsertErr } = await supabase
        .from('email_cache')
        .upsert(cacheRows, { onConflict: 'user_id,gmail_message_id' });

      if (upsertErr) {
        console.error('Cache upsert error:', upsertErr);
      }

      // Update last_sync_at
      await supabase
        .from('email_intelligence_settings')
        .upsert({
          user_id: user.id,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      // Load enriched data from cache + analysis
      await loadEnrichedEmails();
    } catch (err) {
      console.error('Email sync error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, gmailStatus.connected, listMessages]);

  // Load emails with analysis data from DB
  const loadEnrichedEmails = useCallback(async (limitOverride?: number) => {
    if (!user) return;
    try {
      const limit = Math.min(limitOverride ?? pageLimit, MAX_PAGE_LIMIT);
      // Get cached emails
      const { data: cached, error: cacheErr } = await supabase
        .from('email_cache')
        .select(LIST_COLUMNS)
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(limit + 1); // fetch one extra to detect "more available"

      if (cacheErr) throw cacheErr;
      if (!cached || cached.length === 0) {
        setEmails([]);
        setHasMore(false);
        return;
      }

      const more = cached.length > limit;
      const window = more ? cached.slice(0, limit) : cached;
      setHasMore(more);

      // Get analysis for these emails
      const cacheIds = window.map(c => c.id);
      const { data: analyses, error: analysisErr } = await supabase
        .from('email_analysis')
        .select('*')
        .in('email_cache_id', cacheIds);

      if (analysisErr) throw analysisErr;

      const analysisMap = new Map(
        (analyses || []).map(a => [a.email_cache_id, a])
      );

      // Build a thread map across the entire fetched window so we can tell
      // whether the owner (James) has already replied in any thread —
      // including replies he sent that are still inside the working set.
      const byThread = new Map<string, CachedEmail[]>();
      for (const c of window) {
        const tid = c.thread_id;
        if (!tid) continue;
        const arr = byThread.get(tid) || [];
        arr.push(c as CachedEmail);
        byThread.set(tid, arr);
      }

      // Keep one row per thread (the most recent inbound). Filter out
      // anything the owner already handled (latest message from owner) or
      // that is read AND has an owner reply after it.
      const seenThreads = new Set<string>();
      const enriched: EnrichedEmail[] = [];
      for (const c of window) {
        if (!isUnhandled(c as CachedEmail, byThread)) continue;
        const tid = c.thread_id || c.id;
        if (seenThreads.has(tid)) continue;
        seenThreads.add(tid);
        enriched.push({
          ...(c as CachedEmail),
          analysis: analysisMap.get(c.id) as EmailAnalysis | undefined,
        });
      }

      setEmails(enriched);
    } catch (err) {
      console.error('Failed to load enriched emails:', err);
    }
  }, [user, pageLimit]);

  const loadMore = useCallback(() => {
    setPageLimit((prev) => Math.min(prev + PAGE_STEP, MAX_PAGE_LIMIT));
  }, []);

  // Trigger AI analysis for unanalyzed emails
  const analyzeUnanalyzed = useCallback(async () => {
    if (!user) return;

    const unanalyzed = emails.filter(e => !e.analysis);
    if (unanalyzed.length === 0) return;

    setIsAnalyzing(true);
    try {
      const slice = unanalyzed.slice(0, 15);
      // Bodies are not in the list payload (skinny select). Pull just the
      // body_text for this analyze batch on demand.
      const { data: bodies } = await supabase
        .from('email_cache')
        .select('id, body_text')
        .in('id', slice.map(e => e.id));
      const bodyMap = new Map((bodies || []).map(b => [b.id, b.body_text || '']));
      const emailBatch = slice.map(e => ({
        cache_id: e.id,
        subject: e.subject || '',
        snippet: e.snippet || '',
        body_text: bodyMap.get(e.id) || '',
        from_email: e.from_email || '',
        from_name: e.from_name || '',
      }));

      const { data, error } = await supabase.functions.invoke('analyze-emails', {
        body: {
          emails: emailBatch,
          settings: {
            auto_tagging: settings.auto_tagging,
            sentiment_analysis: settings.sentiment_analysis,
            signal_detection: settings.signal_detection,
            follow_up_reminders: settings.follow_up_reminders,
            auto_extract: settings.auto_extract,
          },
        },
      });

      if (error) {
        console.error('Analysis invoke error:', error);
        return;
      }

      if (data?.error) {
        console.error('Analysis error:', data.error);
        if (data.error.includes('Rate limited')) {
          toast.info('Email analysis rate limited — will retry shortly');
        }
        return;
      }

      // Reload enriched data
      await loadEnrichedEmails();
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, emails, settings, loadEnrichedEmails]);

  // Re-analyze a single email
  const reanalyzeEmail = useCallback(async (emailCacheId: string) => {
    if (!user) return;

    const email = emails.find(e => e.id === emailCacheId);
    if (!email) return;

    setIsAnalyzing(true);
    try {
      // Delete existing analysis
      await supabase
        .from('email_analysis')
        .delete()
        .eq('email_cache_id', emailCacheId);

      const { data: bodyRow } = await supabase
        .from('email_cache')
        .select('body_text')
        .eq('id', emailCacheId)
        .maybeSingle();

      const { data, error } = await supabase.functions.invoke('analyze-emails', {
        body: {
          emails: [{
            cache_id: email.id,
            subject: email.subject || '',
            snippet: email.snippet || '',
            body_text: bodyRow?.body_text || '',
            from_email: email.from_email || '',
            from_name: email.from_name || '',
          }],
          settings,
        },
      });

      if (error) throw error;
      await loadEnrichedEmails();
      toast.success('Email re-analyzed');
    } catch (err) {
      console.error('Re-analyze error:', err);
      toast.error('Failed to re-analyze email');
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, emails, settings, loadEnrichedEmails]);

  // Compute stats
  const stats: EmailIntelligenceStats = {
    total: emails.length,
    unreadDealRelated: emails.filter(e => !e.is_read && e.analysis?.deal_id).length,
    needFollowUp: emails.filter(e => e.analysis?.follow_up_needed).length,
    urgent: emails.filter(e => e.analysis?.sentiment === 'urgent' || e.analysis?.priority === 'high').length,
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Initial sync when Gmail connected
  useEffect(() => {
    if (gmailStatus.connected && settingsLoaded && user) {
      syncEmails(true);
    }
  }, [gmailStatus.connected, settingsLoaded, user]);

  // Auto-analyze after sync
  useEffect(() => {
    if (emails.length > 0 && !isAnalyzing) {
      const unanalyzed = emails.filter(e => !e.analysis);
      if (unanalyzed.length > 0) {
        analyzeUnanalyzed();
      }
    }
  }, [emails.length]); // intentionally only trigger on count change

  // Background sync timer
  useEffect(() => {
    if (!gmailStatus.connected || !user) return;

    // Visibility-gated: skip ticks when the tab is hidden, re-fire on
    // focus. Prevents a backgrounded tab from continuously hammering the
    // sync endpoint across long sessions.
    return startVisibilityAwareInterval(syncEmails, SYNC_INTERVAL_MS);
  }, [gmailStatus.connected, user, syncEmails]);

  // Realtime: when the owner sends a reply (any new email_cache row from
  // jturner) or marks something as read, refresh the panel so handled
  // threads disappear immediately without waiting for the 3-minute sync.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`email-intel-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'email_cache', filter: `user_id=eq.${user.id}` },
        () => {
          loadEnrichedEmails();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadEnrichedEmails]);

  return {
    emails,
    stats,
    settings,
    isLoading,
    isAnalyzing,
    settingsLoaded,
    syncEmails,
    saveSettings,
    reanalyzeEmail,
    loadEnrichedEmails,
  };
}
