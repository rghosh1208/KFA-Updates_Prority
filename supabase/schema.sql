-- ============================================================================
-- COE KFA Dashboard — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL -> New query -> Run).
-- Safe to re-run: uses "if not exists" / "create or replace".
-- ============================================================================

create table if not exists public.programs (
  -- Smartsheet row id is the stable primary key so sync can upsert.
  id                       bigint primary key,
  program_name             text,
  group_name               text,
  priority_alignment       text,          -- raw, possibly multi-line ("P1 - People First\nP6 - ...")
  program_manager          text,
  program_director         text,
  smart_kfa                text,
  start_date               date,
  target_completion_date   date,
  true_north               text,
  kfa_coe10                text,          -- "KFA (COE 10.0)"
  focus                    text,
  status                   text,          -- "On Track" / "Off Track"
  latest_comment           text,
  -- Optional editorial fields. Populated only if matching columns exist in
  -- the Smartsheet ("What's Working" / "What's At Risk"); otherwise null.
  working                  text,
  risk                     text,
  -- Monthly progress, keyed by short month: { "mar": {"pct":0.1,"update":"..."}, ... }
  monthly                  jsonb not null default '{}'::jsonb,
  modified_by              text,
  synced_at                timestamptz not null default now()
);

create index if not exists programs_group_idx  on public.programs (group_name);
create index if not exists programs_status_idx on public.programs (status);

-- ----------------------------------------------------------------------------
-- Row Level Security: allow anonymous READ (dashboard uses the anon key),
-- but block anonymous writes. The sync route writes with the service_role key,
-- which bypasses RLS, so no write policy is needed for it.
-- ----------------------------------------------------------------------------
alter table public.programs enable row level security;

drop policy if exists "public read programs" on public.programs;
create policy "public read programs"
  on public.programs
  for select
  to anon, authenticated
  using (true);
