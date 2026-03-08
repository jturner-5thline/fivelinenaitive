# Naitive Platform — Backend Feature Spec

> **Priority:** AI Field Suggestions (Feature 1) — implement first.
> **Approach:** Full spec → then incremental implementation.
> **Last updated:** 2026-03-08

---

## Table of Contents

1. [AI Field Suggestions](#feature-1-ai-field-suggestions)
2. [Email Designer + Templates](#feature-2-email-designer--templates)
3. [Enhanced Sequences](#feature-3-enhanced-sequences)
4. [Help Center + Support](#feature-4-help-center--support)
5. [Video Library](#feature-5-video-library)
6. [Multi-Factor Authentication](#feature-6-mfa)
7. [Clean Distribution Stats](#feature-7-clean-distribution-stats)
8. [Enablement Sessions](#feature-8-enablement-sessions)
9. [Resource Articles / Blog](#feature-9-resource-articles)
10. [Cross-Feature Analytics](#feature-10-cross-feature-analytics)

---

## Feature 1: AI Field Suggestions

### Overview
Scans logged emails, calendar events, and activities to detect CRM contact field changes (e.g., title promotion, company move, new email) and proposes updates for user review.

### Data Model

```sql
-- Suggestion entity
CREATE TABLE contact_field_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
    -- enum: 'job_title', 'email', 'phone_work', 'phone_mobile',
    --       'company_name', 'department', 'seniority', 'linkedin_url'
  current_value TEXT,
  suggested_value TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_type TEXT NOT NULL,
    -- enum: 'email', 'calendar_event', 'activity_log', 'linkedin_scrape'
  source_id TEXT,              -- FK to the originating record
  source_snippet TEXT,         -- excerpt proving the suggestion
  status TEXT NOT NULL DEFAULT 'pending',
    -- enum: 'pending', 'accepted', 'rejected', 'snoozed', 'superseded'
  dedupe_key TEXT NOT NULL,    -- contact_id || field_name || suggested_value hash
  snoozed_until TIMESTAMPTZ,
  acted_by_user_id UUID,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (dedupe_key)
);

-- Indexes
CREATE INDEX idx_cfs_contact_status ON contact_field_suggestions (contact_id, status);
CREATE INDEX idx_cfs_status_created ON contact_field_suggestions (status, created_at DESC);
CREATE INDEX idx_cfs_company_status ON contact_field_suggestions (company_id, status);
CREATE INDEX idx_cfs_field_status ON contact_field_suggestions (field_name, status);

-- Audit log for accepted/rejected changes
CREATE TABLE contact_field_suggestion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES contact_field_suggestions(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL,  -- 'accepted', 'rejected', 'snoozed'
  actor_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-field confidence thresholds (org-configurable)
CREATE TABLE field_suggestion_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  min_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, field_name)
);

-- Updated timestamp trigger
CREATE TRIGGER update_cfs_updated_at
  BEFORE UPDATE ON contact_field_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### RLS Policies

```sql
-- Users can view suggestions for contacts in their company
ALTER TABLE contact_field_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view suggestions"
  ON contact_field_suggestions FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Company members can update suggestions"
  ON contact_field_suggestions FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));

-- Insert is service-role only (edge function)

ALTER TABLE contact_field_suggestion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view audit"
  ON contact_field_suggestion_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM contact_field_suggestions cfs
    WHERE cfs.id = suggestion_id
      AND (public.is_company_member(auth.uid(), cfs.company_id)
           OR public.is_5thline_user(auth.uid()))
  ));

ALTER TABLE field_suggestion_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage thresholds"
  ON field_suggestion_thresholds FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));
```

### Edge Function: `field-suggestion-engine`

**Trigger:** Called after email ingestion, or on-demand per contact.

**Input:**
```json
{
  "contact_id": "uuid",
  "source_type": "email",
  "source_id": "email-message-uuid",
  "email_data": {
    "from": "jane.doe@acme.com",
    "to": ["user@company.com"],
    "subject": "Re: Follow up",
    "body_text": "...",
    "signature_block": "Jane Doe\nVice President, Business Development\nAcme Corp\n(555) 123-4567",
    "headers": {}
  }
}
```

**Processing Pipeline:**
1. Fetch current contact record from DB.
2. Call Lovable AI (Gemini 2.5 Flash) with structured prompt:
   - System: "You are a CRM data extraction agent. Given an email and the current contact record, identify any field changes (job title, company, email, phone, department, seniority). Return JSON array of suggestions with confidence scores."
   - Include current contact fields + email data.
3. For each suggestion returned:
   - Check confidence >= org threshold (from `field_suggestion_thresholds` or default).
   - Check if current_value already matches suggested_value → mark `superseded`.
   - Compute `dedupe_key` = md5(contact_id + field_name + normalized_suggested_value).
   - Upsert into `contact_field_suggestions` (ON CONFLICT update confidence if higher).
4. Return summary of suggestions created.

**Output:**
```json
{
  "suggestions_created": 2,
  "suggestions_superseded": 0,
  "suggestions": [
    {
      "id": "uuid",
      "field_name": "job_title",
      "current_value": "Associate",
      "suggested_value": "Vice President",
      "confidence": 0.92,
      "source_snippet": "Jane Doe\nVice President, Business Development"
    }
  ]
}
```

### Edge Function: `field-suggestion-action`

**Endpoints (via body `action` field):**

**Accept:**
```json
{ "action": "accept", "suggestion_id": "uuid" }
```
- Start transaction:
  1. Read suggestion → get contact_id, field_name, suggested_value.
  2. Update the contact record's field.
  3. Mark suggestion status = 'accepted', acted_by = user, acted_at = now().
  4. Insert audit log entry.
  5. Mark any other pending suggestions for same contact+field as 'superseded'.

**Reject:**
```json
{ "action": "reject", "suggestion_id": "uuid" }
```
- Mark status = 'rejected', insert audit.

**Snooze:**
```json
{ "action": "snooze", "suggestion_id": "uuid", "snooze_until": "2026-04-01T00:00:00Z" }
```
- Mark status = 'snoozed', set snoozed_until.

**Bulk actions:**
```json
{ "action": "bulk_accept", "suggestion_ids": ["uuid1", "uuid2"] }
{ "action": "bulk_reject", "suggestion_ids": ["uuid1", "uuid2"] }
```

### Frontend Integration Points

- **Contact Detail Page:** "Suggestions" badge/tab showing pending count. List of suggestions with Accept/Reject/Snooze actions.
- **Global Queue:** Admin view at `/field-suggestions` showing all pending suggestions across contacts, filterable by field_name, confidence, date.
- **Notification:** When new high-confidence suggestions arrive, show in notification center.

### Performance & Scaling

- Process emails asynchronously; don't block email ingestion.
- Rate-limit AI calls: max 10 suggestions per email, max 50 per contact per day.
- Batch processing: nightly job to scan recent emails for contacts with no suggestions yet.
- Dead-letter: if AI call fails, retry 3x with exponential backoff, then log to `edge_function_errors`.

---

## Feature 2: Email Designer + Templates

### Overview
Block-based email template system reusable across distributions and sequences.

### Data Model

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',   -- 'global', 'personal'
  scope TEXT NOT NULL DEFAULT 'both',       -- 'distribution', 'sequence_step', 'both'
  template_json JSONB NOT NULL DEFAULT '[]', -- array of block objects
  subject_template TEXT,                    -- with {{merge_tags}}
  preview_text_template TEXT,
  is_locked BOOLEAN DEFAULT false,          -- for compliance templates
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_block_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  block_json JSONB NOT NULL,
  category TEXT,  -- 'header', 'footer', 'tombstone', 'signature', 'cta'
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Block Schema (template_json)

```json
[
  {
    "id": "block-uuid",
    "type": "text",
    "props": {
      "content": "<p>Hello {{contact.first_name}},</p>",
      "align": "left",
      "fontSize": 14
    },
    "children": []
  },
  {
    "id": "block-uuid-2",
    "type": "button",
    "props": {
      "text": "View Deal",
      "url": "{{deal.url}}",
      "color": "#20808d",
      "align": "center"
    }
  }
]
```

### Merge Tags

- `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.email}}`, `{{contact.job_title}}`, `{{contact.company_name}}`
- `{{deal.name}}`, `{{deal.stage}}`, `{{deal.value}}`
- `{{user.first_name}}`, `{{user.last_name}}`, `{{user.email}}`, `{{user.signature}}`
- `{{organization.name}}`
- `{{unsubscribe_link}}`

### Rendering Service (Edge Function: `render-email-template`)

**Input:**
```json
{
  "template_id": "uuid",
  "merge_context": {
    "contact": { "first_name": "Jane" },
    "deal": { "name": "Acme Series B" },
    "user": { "first_name": "John" }
  }
}
```

**Output:**
```json
{
  "html": "<html>...</html>",
  "plain_text": "...",
  "subject": "Resolved subject line",
  "preview_text": "Resolved preview"
}
```

### RLS

Company-scoped. Global templates visible to all company members. Personal templates visible to creator + admins. Locked templates editable only by admins.

---

## Feature 3: Enhanced Sequences

### Data Model

```sql
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'private',
  target_definition JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'email',
  delay_type TEXT NOT NULL DEFAULT 'relative_time',
  delay_amount INTEGER DEFAULT 0,
  delay_unit TEXT DEFAULT 'days',
  trigger_condition JSONB,
  email_template_id UUID REFERENCES email_templates(id),
  subject_template TEXT,
  email_body_json_override JSONB,
  from_identity_id UUID,
  send_window JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_step_index INTEGER DEFAULT -1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);

CREATE TABLE sequence_step_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Sequence Engine (Edge Function: `sequence-engine`)

Cron-triggered every 5 minutes:
1. Query pending executions where scheduled_at <= now().
2. Check enrollment active, evaluate trigger_condition.
3. Render template, send email or create task.
4. Schedule next step execution.

### Safeguards

- Per-user daily send limit (default 200), org-wide (default 2000).
- Auto-pause if bounce rate > 5% or unsubscribe > 2%.
- UNIQUE constraint prevents duplicate enrollments.

---

## Feature 4: Help Center + Support

### Data Model

```sql
CREATE TABLE help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  search_vector TSVECTOR,
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_help_articles_search ON help_articles USING GIN (search_vector);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  requester_user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  assigned_to_user_id UUID,
  source TEXT DEFAULT 'in_app',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE support_ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Feature 5: Video Library

### Data Model

```sql
CREATE TABLE video_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  level TEXT DEFAULT 'intro',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_resource_id UUID NOT NULL REFERENCES video_resources(id) ON DELETE CASCADE,
  user_id UUID,
  company_id UUID,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

---

## Feature 6: MFA

### Data Model

```sql
CREATE TABLE organization_security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  mfa_requirement TEXT NOT NULL DEFAULT 'optional',
  grace_period_days INTEGER DEFAULT 14,
  password_min_length INTEGER DEFAULT 8,
  session_timeout_hours INTEGER DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Uses Supabase Auth native MFA APIs. Frontend enforces policy from this table.

---

## Feature 7: Clean Distribution Stats

### Data Model

```sql
CREATE TABLE organization_tracking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  internal_domains TEXT[] DEFAULT '{}',
  internal_ip_ranges TEXT[] DEFAULT '{}',
  exclude_bot_traffic BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_distribution_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  raw_sends INTEGER DEFAULT 0,
  raw_opens INTEGER DEFAULT 0,
  raw_unique_opens INTEGER DEFAULT 0,
  raw_clicks INTEGER DEFAULT 0,
  raw_bounces INTEGER DEFAULT 0,
  clean_sends INTEGER DEFAULT 0,
  clean_opens INTEGER DEFAULT 0,
  clean_unique_opens INTEGER DEFAULT 0,
  clean_clicks INTEGER DEFAULT 0,
  clean_bounces INTEGER DEFAULT 0,
  clean_open_rate NUMERIC(5,2),
  clean_click_rate NUMERIC(5,2),
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (distribution_id, company_id)
);
```

---

## Feature 8: Enablement Sessions

### Data Model

```sql
CREATE TABLE enablement_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  session_type TEXT DEFAULT 'recurring',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE enablement_session_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES enablement_sessions(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  meeting_url TEXT,
  recording_video_resource_id UUID REFERENCES video_resources(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE enablement_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES enablement_session_occurrences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  company_id UUID,
  registered_at TIMESTAMPTZ DEFAULT now(),
  attended BOOLEAN DEFAULT false,
  attended_at TIMESTAMPTZ,
  UNIQUE (occurrence_id, user_id)
);
```

---

## Feature 9: Resource Articles / Blog

### Data Model

```sql
CREATE TABLE resource_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT DEFAULT 'blog',
  external_url TEXT,
  title TEXT NOT NULL,
  excerpt TEXT,
  body_html TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  author_name TEXT,
  published_at TIMESTAMPTZ,
  is_featured BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE resource_article_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES resource_articles(id) ON DELETE CASCADE,
  user_id UUID,
  company_id UUID,
  viewed_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Feature 10: Cross-Feature Analytics

### Event Taxonomy

| Feature | Event Name | Key Properties |
|---------|-----------|----------------|
| Field Suggestions | `field_suggestion.generated` | contact_id, field_name, confidence |
| Field Suggestions | `field_suggestion.accepted` | suggestion_id, field_name, old_value, new_value |
| Field Suggestions | `field_suggestion.rejected` | suggestion_id, field_name |
| Sequences | `sequence.created` | sequence_id, step_count |
| Sequences | `sequence.step.executed` | step_id, type, status |
| Help Center | `help_article.viewed` | article_id, category |
| Videos | `video.view.started` | video_id, category |
| Videos | `video.view.completed` | video_id, duration_watched |
| MFA | `mfa.enrolled` | user_id, method |
| Enablement | `enablement.registered` | occurrence_id |
| Enablement | `enablement.attended` | occurrence_id |

### Storage

```sql
CREATE TABLE platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID,
  company_id UUID,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_platform_events_name ON platform_events (event_name, created_at DESC);
CREATE INDEX idx_platform_events_company ON platform_events (company_id, event_name);

CREATE TABLE platform_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  metric_date DATE NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (company_id, metric_date, metric_name)
);
```

---

## Implementation Order

| Phase | Features | Priority |
|-------|----------|----------|
| 1 | AI Field Suggestions | **NOW** |
| 2 | Email Templates + Sequences | Next |
| 3 | Help/Video/Enablement/Resources | Later |
| 4 | MFA + Clean Stats | Later |
| 5 | Cross-Feature Analytics | Last |

## Dependencies Map

```
Email Templates ──> Sequences (steps reference templates)
Field Suggestions ──> Contacts (reads/writes fields)
                  ──> Email Integration (triggered by ingestion)
                  ──> Lovable AI (extraction)
Enablement ──> Video Library (recordings)
Clean Stats ──> Email Events (classification)
All Features ──> Platform Events (analytics)
```
