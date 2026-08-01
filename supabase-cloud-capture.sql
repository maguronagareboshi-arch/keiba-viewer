-- Kochi-only low-volume T10/T5 market checkpoint storage.
-- Apply once in the Supabase SQL editor before deploying cloudflare-worker.js.
begin;

create table if not exists public.keiba_market_checkpoints (
  id text primary key,
  baba_code text not null check (baba_code = '31'),
  race_date text not null,
  race_no smallint not null check (race_no between 1 and 12),
  phase text not null check (phase in ('t10','t5')),
  captured_at timestamptz not null default now(),
  scheduled_post_at timestamptz,
  source_transport text not null default 'first_party_worker',
  single_raw_sha256 text not null default '',
  pair_raw_sha256 text not null default '',
  runner_count smallint,
  pair_count smallint not null default 0,
  status text not null check (status in ('complete','partial')),
  payload jsonb not null default '{}'::jsonb,
  unique (baba_code, race_date, race_no, phase)
);

create index if not exists keiba_market_checkpoints_lookup_idx
  on public.keiba_market_checkpoints (race_date desc, race_no, phase);

alter table public.keiba_market_checkpoints enable row level security;
revoke all on public.keiba_market_checkpoints from anon, authenticated, public;
grant select on public.keiba_market_checkpoints to anon, authenticated;
drop policy if exists keiba_market_checkpoints_public_read on public.keiba_market_checkpoints;
create policy keiba_market_checkpoints_public_read
  on public.keiba_market_checkpoints for select to anon, authenticated using (true);

-- The shadow ledger has several deterministic rows per race (value T10,
-- quinella T10, and quinella T5). The old one-row-per-race constraint blocks
-- those independent observations; primary-key ids remain idempotent.
alter table public.keiba_value_t10_ledger
  drop constraint if exists keiba_value_t10_ledger_baba_code_race_date_race_no_key;
create index if not exists keiba_value_t10_ledger_race_idx
  on public.keiba_value_t10_ledger (baba_code, race_date desc, race_no, received_at);

commit;
