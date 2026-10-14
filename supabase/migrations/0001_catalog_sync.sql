-- RGB Impertintas AI catalog sync: additive changes only.
alter table public.product_catalog
  add column if not exists promotional_price numeric,
  add column if not exists category_source text not null default 'unknown',
  add column if not exists stock_source_field text,
  add column if not exists source_hash text,
  add column if not exists last_seen_at timestamptz;

comment on column public.product_catalog.category_source is 'altis = ERP category; inferred = estimated from product name; unknown = not classified.';
comment on column public.product_catalog.stock_source_field is 'The explicitly approved ERP field used for this stock; null means never announce stock.';
comment on column public.product_catalog.promotional_price is 'A simple, lower, valid promotion price; original retail price is kept separately.';

create table if not exists public.altis_product_raw (
  erp_code text primary key,
  product_id uuid not null unique references public.product_catalog(id) on delete cascade,
  source_payload jsonb not null,
  source_hash text not null,
  last_seen_at timestamptz not null default now()
);
alter table public.altis_product_raw enable row level security;
revoke all on table public.altis_product_raw from anon, authenticated;
grant all on table public.altis_product_raw to service_role;
comment on table public.altis_product_raw is 'Private full Altis payload; may contain confidential costs/internal flags. Do not send to customers or an LLM.';

create table if not exists public.altis_sync_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('running','success','failed')),
  source text not null default 'manual_json',
  products_received integer not null default 0,
  products_normalized integer not null default 0,
  raw_saved integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  details jsonb not null default '{}'::jsonb
);
alter table public.altis_sync_runs enable row level security;
revoke all on table public.altis_sync_runs from anon, authenticated;
grant all on table public.altis_sync_runs to service_role;

create table if not exists public.evolution_processed_events (
  event_id text primary key,
  sender_hash text not null,
  status text not null check (status in ('processing','sent')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.evolution_processed_events enable row level security;
revoke all on table public.evolution_processed_events from anon, authenticated;
grant all on table public.evolution_processed_events to service_role;

create index if not exists product_catalog_last_seen_idx on public.product_catalog(last_seen_at);
create index if not exists altis_sync_runs_started_idx on public.altis_sync_runs(started_at desc);
