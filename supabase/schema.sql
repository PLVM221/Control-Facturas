create table if not exists public.saved_reports (
  id text primary key,
  location text not null check (location in ('rosario-centro', 'alto-rosario')),
  type text not null,
  label text not null,
  created_at timestamptz not null default now(),
  source_files jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb
);

create index if not exists saved_reports_location_created_at_idx
  on public.saved_reports (location, created_at desc);

alter table public.saved_reports enable row level security;

grant select, insert, delete on public.saved_reports to anon;

drop policy if exists "Reports are readable by stations" on public.saved_reports;
create policy "Reports are readable by stations"
  on public.saved_reports for select
  to anon
  using (true);

drop policy if exists "Reports are insertable by stations" on public.saved_reports;
create policy "Reports are insertable by stations"
  on public.saved_reports for insert
  to anon
  with check (location in ('rosario-centro', 'alto-rosario'));

drop policy if exists "Reports are deletable by stations" on public.saved_reports;
create policy "Reports are deletable by stations"
  on public.saved_reports for delete
  to anon
  using (location in ('rosario-centro', 'alto-rosario'));
