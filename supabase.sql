-- Miel & Productos Naturales - esquema compatible con la app
-- Ejecutar una sola vez en Supabase > SQL Editor > New query > Run

create table if not exists public.products (
  id text primary key,
  name text not null,
  presentation text,
  stock numeric not null default 0,
  cost numeric not null default 0,
  price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id text primary key,
  date date not null,
  product_id text references public.products(id),
  product_name text not null,
  qty numeric not null,
  unit_cost numeric not null,
  total numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  date date not null,
  client text,
  product_id text references public.products(id),
  product_name text not null,
  qty numeric not null,
  unit_price numeric not null,
  total numeric not null,
  paid numeric not null default 0,
  method text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  date date not null,
  client text,
  amount numeric not null,
  method text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key,
  opening_debt numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.entries enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.app_settings enable row level security;

-- Reejecutable: elimina las políticas de esta app si ya existían.
drop policy if exists "auth products" on public.products;
drop policy if exists "auth entries" on public.entries;
drop policy if exists "auth sales" on public.sales;
drop policy if exists "auth payments" on public.payments;
drop policy if exists "auth app_settings" on public.app_settings;

create policy "auth products" on public.products
for all to authenticated using (true) with check (true);
create policy "auth entries" on public.entries
for all to authenticated using (true) with check (true);
create policy "auth sales" on public.sales
for all to authenticated using (true) with check (true);
create policy "auth payments" on public.payments
for all to authenticated using (true) with check (true);
create policy "auth app_settings" on public.app_settings
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

-- V7: agrupa varios productos dentro de una misma entrada o venta.
-- Es seguro ejecutar estas líneas aunque las tablas ya existan.
alter table public.entries add column if not exists operation_id text;
alter table public.sales add column if not exists operation_id text;
create index if not exists entries_operation_id_idx on public.entries(operation_id);
create index if not exists sales_operation_id_idx on public.sales(operation_id);

-- V10: proveedores, pagos a proveedores y comprobantes
alter table public.entries add column if not exists supplier text;

create table if not exists public.supplier_payments (
  id text primary key,
  date date not null,
  supplier text not null,
  amount numeric not null,
  method text,
  note text,
  receipt_path text,
  created_at timestamptz not null default now()
);

alter table public.supplier_payments enable row level security;
drop policy if exists "auth supplier_payments" on public.supplier_payments;
create policy "auth supplier_payments" on public.supplier_payments
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.supplier_payments to authenticated;

create index if not exists entries_supplier_idx on public.entries(supplier);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments(supplier);

-- Bucket privado para comprobantes de pagos a proveedores
insert into storage.buckets (id,name,public)
values ('supplier-payment-receipts','supplier-payment-receipts',false)
on conflict (id) do update set public=false;

drop policy if exists "auth supplier receipts select" on storage.objects;
drop policy if exists "auth supplier receipts insert" on storage.objects;
drop policy if exists "auth supplier receipts update" on storage.objects;
drop policy if exists "auth supplier receipts delete" on storage.objects;

create policy "auth supplier receipts select" on storage.objects
for select to authenticated
using (bucket_id = 'supplier-payment-receipts');
create policy "auth supplier receipts insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'supplier-payment-receipts');
create policy "auth supplier receipts update" on storage.objects
for update to authenticated
using (bucket_id = 'supplier-payment-receipts')
with check (bucket_id = 'supplier-payment-receipts');
create policy "auth supplier receipts delete" on storage.objects
for delete to authenticated
using (bucket_id = 'supplier-payment-receipts');
