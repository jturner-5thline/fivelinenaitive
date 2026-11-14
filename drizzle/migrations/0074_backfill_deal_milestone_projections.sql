SET LOCAL search_path = public;
with p as (select id, (select array_agg(s->>'id' order by o) from jsonb_array_elements(stages) with ordinality t(s,o)) ids from deal_pipelines where is_default and stages @> '[{"id":"pre-credit-needs"}]'),
d as (select d.id, d.company_id, d.user_id, array_position(p.ids,d.stage) pos, p.ids,
  (select min(changed_at) from deal_stage_history h where h.deal_id=d.id and h.to_stage='pre-credit-needs') base
  from deals d join p on p.id=d.pipeline_id
  where d.stage not in ('closed-won','closed-lost','on-hold') and d.company not in ('Test-Niki''s Store','Example Deal') and lower(d.company) not like 'test %'
    and array_position(p.ids,d.stage) >= array_position(p.ids,'pre-credit-needs')),
m as (select * from (values ('Client Signed','final-credit-items'),('First Term Sheets','terms-issued'),('Term Sheet Signed','in-due-diligence')) t(title,stage)),
x as (select d.*, m.title, d.pos >= array_position(d.ids,m.stage) done,
  (d.base + make_interval(days => fn_milestone_projection_days(d.company_id, m.stage)::int))::date due,
  (select id from deal_milestones dm where dm.deal_id=d.id and lower(dm.title)=lower(m.title) order by created_at limit 1) mid
  from d cross join m where d.base is not null),
ins as (insert into deal_milestones(deal_id,title,due_date,user_id,position,completed,completed_at)
  select x.id, x.title, case when x.done then null else x.due end, x.user_id, row_number() over (partition by x.id) - 1 + coalesce((select max(position)+1 from deal_milestones z where z.deal_id=x.id),0), x.done, case when x.done then now() end
  from x where mid is null returning deal_id, title),
upd as (update deal_milestones dm set due_date = case when x.done then dm.due_date else coalesce(dm.due_date, x.due) end,
   completed = dm.completed or x.done, completed_at = case when not dm.completed and x.done then now() else dm.completed_at end
  from x where dm.id = x.mid and ((dm.due_date is null and not dm.completed) or (x.done and not dm.completed)) returning dm.deal_id, dm.title)
select 1 from ins union all select 1 from upd;