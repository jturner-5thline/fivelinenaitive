import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePilotKpiFlag } from './usePilotKpiFlag';

const VISIT_KEY = 'naitive.pilot_kpi.visits';
const LOGIN_KEY = 'naitive.pilot_kpi.login_marked';
const HEARTBEAT_MS = 30_000;

function sendEvent(event_type: string, body: Record<string, unknown> = {}): void {
  void supabase.functions
    .invoke('pilot-kpi-ingest', { body: { event_type, ...body } })
    .catch((err) => console.warn('[pilot-kpi] ingest failed', err));
}

/**
 * Mounts session-wide pilot KPI tracking: initial_login (once per session),
 * visit (once per route per session) and session_heartbeat (every 30s while
 * the tab is visible). Gated by ff_pilot_kpi_tracking + an authenticated user.
 */
export function usePilotKpiTracking(): void {
  const { user } = useAuth();
  const { enabled } = usePilotKpiFlag();
  const location = useLocation();
  const heartbeatTimer = useRef<number | null>(null);

  // initial_login (once per session)
  useEffect(() => {
    if (!enabled || !user) return;
    try {
      if (sessionStorage.getItem(LOGIN_KEY) === '1') return;
      sessionStorage.setItem(LOGIN_KEY, '1');
    } catch { /* ignore */ }
    sendEvent('initial_login');
  }, [enabled, user?.id]);

  // visit (per unique path per session)
  useEffect(() => {
    if (!enabled || !user) return;
    try {
      const raw = sessionStorage.getItem(VISIT_KEY);
      const seen = new Set<string>(raw ? JSON.parse(raw) : []);
      if (seen.has(location.pathname)) return;
      seen.add(location.pathname);
      sessionStorage.setItem(VISIT_KEY, JSON.stringify([...seen]));
    } catch { /* ignore */ }
    sendEvent('visit', { metadata: { path: location.pathname } });
  }, [enabled, user?.id, location.pathname]);

  // session_heartbeat
  useEffect(() => {
    if (!enabled || !user) return;
    function tick() {
      if (document.visibilityState === 'visible') sendEvent('session_heartbeat');
    }
    tick();
    heartbeatTimer.current = window.setInterval(tick, HEARTBEAT_MS);
    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };
  }, [enabled, user?.id]);
}

/** Imperative helper for one-off pilot events (e.g. demo_converted, feedback_given). */
export function logPilotKpiEvent(event_type: string, body: Record<string, unknown> = {}): void {
  sendEvent(event_type, body);
}