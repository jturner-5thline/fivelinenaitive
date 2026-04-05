import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGmail } from '@/hooks/useGmail';
import { toast } from 'sonner';

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
  body_text: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
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

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useEmailIntelligence() {
  const { user } = useAuth();
  const { status: gmailStatus, listMessages } = useGmail();
  const [emails, setEmails] = useState<EnrichedEmail[]>([]);
  const [settings, setSettings] = useState<EmailIntelligenceSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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

    const now = Date.now();
    if (!force && now - lastSyncRef.current < 60_000) return; // debounce 1 min
    lastSyncRef.current = now;

    setIsLoading(true);
    try {
      // Fetch from Gmail API
      const result = await listMessages({ maxResults: 25 });
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
  const loadEnrichedEmails = useCallback(async () => {
    if (!user) return;
    try {
      // Get cached emails
      const { data: cached, error: cacheErr } = await supabase
        .from('email_cache')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(50);

      if (cacheErr) throw cacheErr;
      if (!cached || cached.length === 0) {
        setEmails([]);
        return;
      }

      // Get analysis for these emails
      const cacheIds = cached.map(c => c.id);
      const { data: analyses, error: analysisErr } = await supabase
        .from('email_analysis')
        .select('*')
        .in('email_cache_id', cacheIds);

      if (analysisErr) throw analysisErr;

      const analysisMap = new Map(
        (analyses || []).map(a => [a.email_cache_id, a])
      );

      const enriched: EnrichedEmail[] = cached.map(c => ({
        ...c,
        analysis: analysisMap.get(c.id) as EmailAnalysis | undefined,
      }));

      setEmails(enriched);
    } catch (err) {
      console.error('Failed to load enriched emails:', err);
    }
  }, [user]);

  // Trigger AI analysis for unanalyzed emails
  const analyzeUnanalyzed = useCallback(async () => {
    if (!user) return;

    const unanalyzed = emails.filter(e => !e.analysis);
    if (unanalyzed.length === 0) return;

    setIsAnalyzing(true);
    try {
      const emailBatch = unanalyzed.slice(0, 15).map(e => ({
        cache_id: e.id,
        subject: e.subject || '',
        snippet: e.snippet || '',
        body_text: e.body_text || '',
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

      const { data, error } = await supabase.functions.invoke('analyze-emails', {
        body: {
          emails: [{
            cache_id: email.id,
            subject: email.subject || '',
            snippet: email.snippet || '',
            body_text: email.body_text || '',
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

    syncTimerRef.current = setInterval(() => {
      syncEmails();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [gmailStatus.connected, user, syncEmails]);

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
