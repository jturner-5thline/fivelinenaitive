import React, { useMemo, useState } from 'react';
import { MessageSquare, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useQirComments } from '@/hooks/useQirComments';

/** Floating "All comments" side panel for the Quarterly Insights Report. */
export function QirAllCommentsPanel({ reportKey, reportLabel }: { reportKey: string; reportLabel: string }) {
  const { comments } = useQirComments(reportKey);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);

  // Group comments into threads keyed by target_type + target_id, ordered within each thread chronologically (oldest -> newest).
  // Threads themselves are ordered by most recent activity first.
  const threads = useMemo(() => {
    const map = new Map<string, { key: string; target_type: string; target_id: string; items: typeof comments }>();
    for (const c of comments) {
      const key = `${c.target_type}::${c.target_id}`;
      let t = map.get(key);
      if (!t) {
        t = { key, target_type: c.target_type, target_id: c.target_id, items: [] as any };
        map.set(key, t);
      }
      t.items.push(c);
    }
    const arr = Array.from(map.values());
    arr.forEach(t => t.items.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    arr.sort((a, b) => {
      const la = a.items[a.items.length - 1].created_at;
      const lb = b.items[b.items.length - 1].created_at;
      return lb.localeCompare(la);
    });
    return arr;
  }, [comments]);

  const count = comments.length;

  const toggle = (k: string) => setCollapsed(prev => ({ ...prev, [k]: !(prev[k] ?? allCollapsed) }));
  const isCollapsed = (k: string) => collapsed[k] ?? allCollapsed;
  const expandAll = () => { setAllCollapsed(false); setCollapsed({}); };
  const collapseAll = () => { setAllCollapsed(true); setCollapsed({}); };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="All comments"
        className="qir-no-print"
        style={{
          position: 'fixed', right: 12, bottom: 12, zIndex: 45,
          width: 48, height: 48, borderRadius: 24,
          background: 'rgba(16,28,52,0.85)',
          border: '1px solid rgba(120,170,255,0.3)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          color: 'rgba(200,225,245,0.9)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={count ? `${count} comment${count === 1 ? '' : 's'}` : 'View comments'}
      >
        <MessageSquare size={18} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px',
            background: 'rgb(80,140,255)', color: 'white', borderRadius: 9, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{count}</span>
        )}
      </button>
      {open && (
        <div
          className="qir-no-print"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, maxWidth: '100vw',
              background: 'rgba(10,18,36,0.96)', borderLeft: '1px solid rgba(120,170,255,0.2)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(120,170,255,0.15)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(160,200,255,0.55)' }}>All comments</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#dde8f8' }}>{reportLabel}</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'rgba(200,225,245,0.7)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {threads.length > 0 && (
              <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid rgba(120,170,255,0.1)', fontSize: 11 }}>
                <button onClick={expandAll} style={{ background: 'transparent', border: '1px solid rgba(120,170,255,0.25)', color: 'rgba(200,225,245,0.85)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Expand all</button>
                <button onClick={collapseAll} style={{ background: 'transparent', border: '1px solid rgba(120,170,255,0.25)', color: 'rgba(200,225,245,0.85)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Collapse all</button>
                <span style={{ marginLeft: 'auto', color: 'rgba(180,200,230,0.55)', alignSelf: 'center' }}>{threads.length} thread{threads.length === 1 ? '' : 's'} · {count} comment{count === 1 ? '' : 's'}</span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {threads.length === 0 && (
                <div style={{ color: 'rgba(180,200,230,0.55)', fontSize: 13, textAlign: 'center', padding: '32px 8px' }}>
                  No comments yet. Hover over a KPI or section header to add one.
                </div>
              )}
              {threads.map(t => {
                const collapsedNow = isCollapsed(t.key);
                const last = t.items[t.items.length - 1];
                let lastWhen = '';
                try { lastWhen = new Date(last.created_at).toLocaleString(); } catch {}
                return (
                  <div key={t.key} style={{ background: 'rgba(16,28,52,0.6)', border: '1px solid rgba(120,170,255,0.15)', borderRadius: 8 }}>
                    <button
                      onClick={() => toggle(t.key)}
                      aria-expanded={!collapsedNow}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '8px 10px', textAlign: 'left',
                      }}
                    >
                      {collapsedNow ? <ChevronRight size={14} color="rgba(200,225,245,0.7)" /> : <ChevronDown size={14} color="rgba(200,225,245,0.7)" />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                          {t.target_type} · {t.target_id}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(180,200,230,0.65)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.items.length} message{t.items.length === 1 ? '' : 's'} · last by {last.author_name || 'Unknown'}
                          </span>
                          <span style={{ flexShrink: 0 }}>{lastWhen}</span>
                        </div>
                      </div>
                    </button>
                    {!collapsedNow && (
                      <div style={{ padding: '0 10px 10px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {t.items.map(c => {
                          let when = '';
                          try { when = new Date(c.created_at).toLocaleString(); } catch {}
                          return (
                            <div key={c.id} style={{ borderLeft: '2px solid rgba(120,170,255,0.2)', paddingLeft: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(180,200,230,0.7)', marginBottom: 2 }}>
                                <strong style={{ color: '#dde8f8' }}>{c.author_name || 'Unknown'}</strong>
                                <span>{when}</span>
                              </div>
                              <div style={{ fontSize: 13, color: '#dde8f8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.body}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}