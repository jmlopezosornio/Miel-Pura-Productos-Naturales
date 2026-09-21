-- Ejecutar completo en Supabase > SQL Editor > New query
create table if not exists public.products (
  id text primary key, name text not null, presentation text,
  stock numeric not null default 0, cost numeric not null default 0,
  price numeric not null default 0, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.entries (
  id text primary key, date date not null,
  product_id text references public.products(id), product_name text not null,
  qty numeric not null, unit_cost numeric not null, total numeric not null,
  note text, created_at timestamptz not null default now()
);
create table if not exists public.sales (
  id text primary key, date date not null, client text,
  product_id text references public.products(id), product_name text not null,
  qty numeric not null, unit_price numeric not null, total numeric not null,
  paid numeric not null default 0, method text,
  created_at timestamptz not null default now()
);
create table if not exists public.payments (
  id text primary key, date date not null, client text,
  amount numeric not null, method text, note text,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.entries enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;

-- Solo usuarios autenticados pueden leer o modificar datos.
create policy "auth products" on public.products for all to authenticated using (true) with check (true);
create policy "auth entries" on public.entries for all to authenticated using (true) with check (true);
create policy "auth sales" on public.sales for all to authenticated using (true) with check (true);
create policy "auth payments" on public.payments for all to authenticated using (true) with check (true);
