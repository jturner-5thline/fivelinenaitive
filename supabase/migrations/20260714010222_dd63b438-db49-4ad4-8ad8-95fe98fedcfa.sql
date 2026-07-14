UPDATE public.ai_action_queue
SET title = regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(title, '\bDraft\s+Nudge\s+Email\s+to\b', 'Follow up with', 'gi'),
                    '\bDraft\s+Nudge\s+to\b', 'Follow up with', 'gi'),
                  '\bGentle\s+Nudge\b', 'Follow up', 'gi'),
                '\bNudge\s+Email\s+to\b', 'Follow up with', 'gi'),
              '\bRe-?ping\b', 'Follow up', 'gi'),
            '\bNudge\b', 'Follow up', 'gi'),
    updated_at = now()
WHERE status = 'pending'
  AND action_type = 'draft_email'
  AND title ~* '\b(nudge|re-?ping)\b';