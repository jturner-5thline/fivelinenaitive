create or replace function public.mcp_describe_tables(p_tables text[])
returns table (
  table_name text,
  column_name text,
  ordinal_position int,
  data_type text,
  udt_name text,
  is_nullable text,
  column_default text,
  enum_values text[]
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    c.table_name::text,
    c.column_name::text,
    c.ordinal_position::int,
    c.data_type::text,
    c.udt_name::text,
    c.is_nullable::text,
    c.column_default::text,
    (
      select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = c.udt_name
    )
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = any(p_tables)
  order by c.table_name, c.ordinal_position
$$;

grant execute on function public.mcp_describe_tables(text[]) to authenticated;
grant execute on function public.mcp_describe_tables(text[]) to service_role;