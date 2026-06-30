UPDATE public.ai_action_queue
SET status='dismissed',
    dismissed_at=now(),
    rejection_reason='Auto-remediation: violates Deal Admin Agent custom rule (no nudges on terminal lender states — Passed/Not a Fit/Closed)'
WHERE id IN ('6572cab8-9605-4422-a26d-6d0ff585aac4','1b267f22-575c-46bc-8419-e30fe3915591')
  AND status='pending';

UPDATE public.ai_action_queue
SET status='dismissed',
    dismissed_at=now(),
    rejection_reason='Auto-remediation: violates Deal Admin Agent custom rule (enforce Unresponsive over On Hold)'
WHERE id='92c34706-d053-4d2d-9947-a2cae1f2bcca'
  AND status='pending';

UPDATE public.ai_action_queue
SET status='dismissed',
    dismissed_at=now(),
    rejection_reason='Auto-remediation: duplicate of update_funding_source for Flow Capital (kept canonical funding-source update row)'
WHERE id IN ('2cc60878-55bc-4b5b-9dce-b5adab85e045','d225b17f-9617-435b-9f8a-6cd02f63669c')
  AND status='pending';