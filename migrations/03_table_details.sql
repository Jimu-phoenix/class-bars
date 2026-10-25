-- =====================================================================
-- Class-BARS Migration 03: Schema table-details report (READ-ONLY)
--
-- Purpose: produces a full report of every table in the `public`
-- schema of the connected Supabase project -- straight from the live
-- catalogs, so it always reflects reality (including any drift from
-- class_bars_schema_no_geo.sql / 01 / 02).
--
-- It contains ONLY SELECT statements: safe to paste into Supabase
-- Dashboard -> SQL Editor and re-run at any time. It creates nothing
-- and must NOT be treated as part of the DDL chain.
--
-- Output sections (each its own result grid):
--   1. Table overview        -- RLS flags, estimated rows, disk size
--   2. Columns               -- type, nullability, default, identity
--   3. Constraints           -- PK / UNIQUE / FK / CHECK definitions
--   4. Indexes               -- full CREATE INDEX definitions
--   5. RLS policies          -- command, roles, USING / WITH CHECK
--   6. Triggers              -- timing, events, function called
--   7. Enum types            -- labels in declared order
--   8. Per-table JSON        -- one pretty JSON blob per table
--
-- To inspect other schemas (e.g. auth), replace the literal
-- `n.nspname = 'public'` filters below accordingly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table overview
--    est_rows comes from pg_class.reltuples (planner estimate, refreshed
--    by ANALYZE/vacuum) -- treat as approximate, never exact.
-- ---------------------------------------------------------------------
select
  n.nspname                                   as schema,
  c.relname                                   as table_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned table'
  end                                         as kind,
  c.relrowsecurity                            as rls_enabled,
  c.relforcerowsecurity                       as rls_forced,
  greatest(c.reltuples, 0)::bigint            as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  obj_description(c.oid, 'pg_class')          as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- ---------------------------------------------------------------------
-- 2. Columns (one row per column, in ordinal position)
-- ---------------------------------------------------------------------
select
  c.relname                                     as table_name,
  a.attnum                                      as "position",
  a.attname                                     as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  not a.attnotnull                              as nullable,
  pg_get_expr(d.adbin, d.adrelid)               as default_expression,
  case a.attidentity
    when 'a' then 'always'
    when 'd' then 'by default'
  end                                           as identity,
  case a.attgenerated when 's' then 'stored' end as generated,
  col_description(a.attrelid, a.attnum)         as comment
from pg_attribute a
join pg_class c     on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum;

-- ---------------------------------------------------------------------
-- 3. Constraints (PK / UNIQUE / FOREIGN KEY / CHECK)
-- ---------------------------------------------------------------------
select
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid) as definition,
  ref.relname                   as references_table,
  case con.contype when 'f' then
    case con.confupdtype
      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
    end
  end as on_update,
  case con.contype when 'f' then
    case con.confdeltype
      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
    end
  end as on_delete,
  not con.convalidated as not_validated
from pg_constraint con
join pg_class c     on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_class ref on ref.oid = con.confrelid
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname, constraint_type, con.conname;

-- ---------------------------------------------------------------------
-- 4. Indexes (includes unique/partial indexes backing constraints)
-- ---------------------------------------------------------------------
select
  schemaname as schema,
  tablename  as table_name,
  indexname  as index_name,
  indexdef   as definition
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- ---------------------------------------------------------------------
-- 5. Row Level Security policies
-- ---------------------------------------------------------------------
select
  schemaname as schema,
  tablename  as table_name,
  policyname as policy_name,
  permissive as permissive_or_restrictive,
  roles,
  cmd        as command,
  qual       as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- 6. Triggers (one row per trigger x event)
-- ---------------------------------------------------------------------
select distinct
  n.nspname                    as schema,
  c.relname                    as table_name,
  t.tgname                     as trigger_name,
  pg_get_triggerdef(t.oid)     as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not t.tgisinternal
order by table_name, trigger_name;

-- ---------------------------------------------------------------------
-- 7. Enum types (labels in declaration order)
-- ---------------------------------------------------------------------
select
  n.nspname  as schema,
  t.typname  as enum_type,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder) as labels_in_order
from pg_type t
join pg_enum e     on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by n.nspname, t.typname
order by t.typname;

-- ---------------------------------------------------------------------
-- 8. Consolidated per-table JSON
--    One row per table; `details` holds columns, constraints, indexes,
--    RLS flags and policies as pretty-printed JSON -- handy for docs,
--    diffs, or feeding to tooling.
-- ---------------------------------------------------------------------
select
  c.relname as table_name,
  jsonb_pretty(jsonb_build_object(
    'schema',        n.nspname,
    'rls',           jsonb_build_object(
                       'enabled', c.relrowsecurity,
                       'forced',  c.relforcerowsecurity),
    'estimated_rows', greatest(c.reltuples, 0)::bigint,
    'total_size',     pg_total_relation_size(c.oid),
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
                 'position',   a.attnum,
                 'name',       a.attname,
                 'type',       pg_catalog.format_type(a.atttypid, a.atttypmod),
                 'nullable',   not a.attnotnull,
                 'default',    pg_get_expr(d.adbin, d.adrelid),
                 'comment',    col_description(a.attrelid, a.attnum)
               ) order by a.attnum), '[]'::jsonb)
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid
        and a.attnum > 0
        and not a.attisdropped
    ),
    'constraints', (
      select coalesce(jsonb_agg(jsonb_build_object(
                 'name',       con.conname,
                 'type',       case con.contype
                                 when 'p' then 'PRIMARY KEY'
                                 when 'u' then 'UNIQUE'
                                 when 'f' then 'FOREIGN KEY'
                                 when 'c' then 'CHECK'
                                 else con.contype::text
                               end,
                 'definition', pg_get_constraintdef(con.oid)
               ) order by con.conname), '[]'::jsonb)
      from pg_constraint con
      where con.conrelid = c.oid
    ),
    'indexes', (
      select coalesce(jsonb_agg(jsonb_build_object(
                 'name',       i.indexname,
                 'definition', i.indexdef
               ) order by i.indexname), '[]'::jsonb)
      from pg_indexes i
      where i.schemaname = n.nspname
        and i.tablename  = c.relname
    ),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
                 'name',       p.policyname,
                 'command',    p.cmd,
                 'roles',      p.roles,
                 'using',      p.qual,
                 'with_check', p.with_check
               ) order by p.policyname), '[]'::jsonb)
      from pg_policies p
      where p.schemaname = n.nspname
        and p.tablename  = c.relname
    )
  )) as details
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;
