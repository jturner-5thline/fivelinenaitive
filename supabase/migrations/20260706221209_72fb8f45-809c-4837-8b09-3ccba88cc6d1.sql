with pending_lender_items as (
  select
    q.id,
    q.deal_id,
    q.created_at,
    q.target_object_type,
    coalesce(
      case
        when lower(coalesce(q.target_object_type, '')) in ('deal_lender', 'funding_source', 'lender', 'deal_funding_source')
          then q.target_object_id::text
        else null
      end,
      case
        when lower(coalesce(q.payload #>> '{on_approve_execution_payload,target_object_type}', '')) in ('deal_lender', 'funding_source', 'lender', 'deal_funding_source')
          then nullif(q.payload #>> '{on_approve_execution_payload,target_object_id}', '')
        else null
      end,
      nullif(q.payload ->> 'deal_lender_id', ''),
      nullif(q.payload ->> 'admin_agent_lender_id', ''),
      (
        select nullif(ev ->> 'id', '')
        from jsonb_array_elements(coalesce(q.evidence, '[]'::jsonb)) ev
        where lower(coalesce(ev ->> 'kind', '')) in ('funding_source', 'deal_lender', 'lender')
        limit 1
      ),
      (
        select nullif(ev ->> 'ref_id', '')
        from jsonb_array_elements(coalesce(q.evidence, '[]'::jsonb)) ev
        where lower(coalesce(ev ->> 'kind', '')) in ('funding_source', 'deal_lender', 'lender')
        limit 1
      )
    ) as lender_target_id
  from public.ai_action_queue q
  where q.status = 'pending'
    and q.source ->> 'origin' = 'deal_admin_agent'
    and q.action_type in ('draft_email', 'update_funding_source')
), keyed as (
  select
    *,
    deal_id::text || '::funding_source_attention::deal_lender::' || lender_target_id as semantic_key
  from pending_lender_items
  where lender_target_id is not null
), ranked as (
  select
    *,
    row_number() over (
      partition by semantic_key
      order by
        case when lower(coalesce(target_object_type, '')) = 'deal_lender' then 0 else 1 end,
        created_at asc,
        id asc
    ) as rn
  from keyed
), duplicate_ids as (
  select id
  from ranked
  where rn > 1
)
update public.ai_action_queue q
set
  status = 'dismissed',
  dismissed_at = now(),
  rejection_reason = 'auto_resolved_duplicate_pending_item',
  updated_at = now()
from duplicate_ids d
where q.id = d.id
  and q.status = 'pending';