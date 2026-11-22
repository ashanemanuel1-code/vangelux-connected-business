-- =====================================================================
-- VANGELUX CONNECTED BUSINESS — 001 SCHEMA
-- Tables, generated columns, numbering, inventory & catalogue triggers.
-- Run this file first, then 002_security.sql, then 003_storage.sql,
-- then 004_seed.sql (all in the Supabase SQL Editor, or `supabase db push`).
-- =====================================================================

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase runs 15+)

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- STAFF (who may use the admin app). Linked to Supabase Auth users.
-- ---------------------------------------------------------------------
create table public.staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'staff' check (role in ('owner','admin','staff')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- LOOKUP TABLES (all editable from the admin app — nothing hardcoded)
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.target_customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

create table public.fit_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

create table public.size_options (
  id          uuid primary key default gen_random_uuid(),
  size_group  text not null check (size_group in ('adult','kids','other')),
  label       text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (size_group, label)
);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#C9A24A',
  is_public   boolean not null default true,   -- false = internal-only tag, never shown on showroom
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.expense_categories (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  -- Production costs (fabric, printing…) are already inside each product's unit cost,
  -- which is charged as Cost of Goods Sold when an item sells. To avoid counting
  -- them twice, only "operating" categories are subtracted again for Net Profit.
  is_operating       boolean not null default true,
  sort_order         int not null default 0,
  is_active          boolean not null default true
);

-- ---------------------------------------------------------------------
-- COLLECTIONS
-- ---------------------------------------------------------------------
create table public.collections (
  id             uuid primary key default gen_random_uuid(),
  volume_label   text,                         -- e.g. 'VOL. 01'
  name           text not null,                -- e.g. 'THE GREAT COMMISSION'
  tagline        text,                         -- e.g. 'CONQUER THE WORLD FOR JESUS.'
  scripture      text,
  description    text,
  artwork_path   text,                         -- storage path in product-media, or bundled 'brand/...' file
  status         text not null default 'concept'
                 check (status in ('concept','development','sampling','pre-launch','available','discontinued')),
  is_published   boolean not null default false,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PRODUCTS
-- Public-safe fields live here. Internal costs are in product_costs
-- (a separate admin-only table) so they can never leak through a
-- public query, even by mistake.
-- ---------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  sku                 text not null unique,
  description         text,
  collection_id       uuid references public.collections(id) on delete set null,
  category_id         uuid references public.categories(id) on delete set null,
  target_customer_id  uuid references public.target_customers(id) on delete set null,
  fit_type_id         uuid references public.fit_types(id) on delete set null,
  sizes               text[] not null default '{}',
  colors              text[] not null default '{}',
  selling_price       numeric(12,2) not null default 0 check (selling_price >= 0),
  discount_percent    numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  is_concept          boolean not null default false,  -- concept/mockup: never counted as physical stock
  status              text not null default 'draft' check (status in ('draft','published','archived')),
  low_stock_threshold int not null default 5,
  sort_order          int not null default 0,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.products (status);
create index on public.products (collection_id);

create table public.product_costs (
  product_id          uuid primary key references public.products(id) on delete cascade,
  manufacturing_cost  numeric(12,2) not null default 0,
  fabric_cost         numeric(12,2) not null default 0,
  printing_cost       numeric(12,2) not null default 0,
  packaging_cost      numeric(12,2) not null default 0,
  transport_cost      numeric(12,2) not null default 0,
  other_cost          numeric(12,2) not null default 0,
  total_unit_cost     numeric(12,2) generated always as
                      (manufacturing_cost + fabric_cost + printing_cost + packaging_cost + transport_cost + other_cost) stored,
  wholesale_price     numeric(12,2) not null default 0,
  supplier            text,
  internal_notes      text,
  updated_at          timestamptz not null default now()
);

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  kind         text not null default 'detail' check (kind in ('front','back','detail')),
  is_main      boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.product_images (product_id);
-- only one main image per product
create unique index product_images_one_main on public.product_images (product_id) where is_main;

create table public.product_tags (
  product_id  uuid not null references public.products(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

-- ---------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DOCUMENT NUMBERING  (QT-2026-0001, INV-2026-0001)
-- ---------------------------------------------------------------------
create table public.doc_counters (
  prefix  text not null,
  year    int  not null,
  last_no int  not null default 0,
  primary key (prefix, year)
);

-- SECURITY INVOKER: only callers allowed by RLS on doc_counters (active staff) can draw numbers.
create or replace function public.next_doc_number(p_prefix text)
returns text language plpgsql security invoker set search_path = public as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.doc_counters(prefix, year, last_no) values (p_prefix, y, 1)
  on conflict (prefix, year) do update set last_no = doc_counters.last_no + 1
  returning last_no into n;
  return p_prefix || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- QUOTATIONS (never counted as sales)
-- ---------------------------------------------------------------------
create table public.quotations (
  id                uuid primary key default gen_random_uuid(),
  quote_number      text not null unique default public.next_doc_number('QT'),
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text not null,
  customer_phone    text,
  customer_email    text,
  customer_address  text,
  issue_date        date not null default current_date,
  validity_days     int  not null default 14,
  discount_amount   numeric(12,2) not null default 0,
  delivery_fee      numeric(12,2) not null default 0,
  terms             text,
  notes             text,
  status            text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  converted_sale_id uuid,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.quotation_items (
  id             uuid primary key default gen_random_uuid(),
  quotation_id   uuid not null references public.quotations(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  description    text not null,
  sku            text,
  size           text,
  color          text,
  quantity       int not null default 1 check (quantity > 0),
  unit_price     numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  line_total     numeric(12,2) generated always as (quantity * unit_price - discount_amount) stored,
  sort_order     int not null default 0
);
create index on public.quotation_items (quotation_id);

-- ---------------------------------------------------------------------
-- SALES / ORDERS
-- ---------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  invoice_number   text not null unique default public.next_doc_number('INV'),
  sale_date        date not null default current_date,
  customer_id      uuid references public.customers(id) on delete set null,
  customer_name    text,
  discount_amount  numeric(12,2) not null default 0,
  delivery_fee     numeric(12,2) not null default 0,
  amount_paid      numeric(12,2) not null default 0,
  payment_method   text not null default 'cash'
                   check (payment_method in ('cash','bank_transfer','card','online','cod','other')),
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','refunded')),
  order_status     text not null default 'confirmed'
                   check (order_status in ('pending','confirmed','processing','shipped','delivered','completed','cancelled','returned')),
  quotation_id     uuid references public.quotations(id) on delete set null,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.sales (sale_date);

alter table public.quotations
  add constraint quotations_converted_sale_fk foreign key (converted_sale_id) references public.sales(id) on delete set null;

create table public.sale_items (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid not null references public.sales(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  description      text not null,
  size             text,
  color            text,
  quantity         int not null default 1 check (quantity > 0),
  unit_price       numeric(12,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0,
  unit_cost        numeric(12,2) not null default 0,  -- snapshot of total unit cost at time of sale (for COGS)
  line_total       numeric(12,2) generated always as (quantity * unit_price - discount_amount) stored
);
create index on public.sale_items (sale_id);
create index on public.sale_items (product_id);

-- ---------------------------------------------------------------------
-- EXPENSES
-- ---------------------------------------------------------------------
create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  expense_date    date not null default current_date,
  category_id     uuid references public.expense_categories(id) on delete set null,
  description     text not null,
  vendor          text,
  amount          numeric(12,2) not null check (amount >= 0),
  payment_method  text,
  receipt_path    text,           -- private 'receipts' bucket
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.expenses (expense_date);

-- ---------------------------------------------------------------------
-- INVENTORY (ledger — stock = sum of movements per product/size/colour)
-- ---------------------------------------------------------------------
create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  size           text not null default '',
  color          text not null default '',
  movement_type  text not null check (movement_type in ('initial','addition','sale','return','damaged','adjustment')),
  quantity       int  not null,              -- signed: + adds stock, - removes stock
  sale_item_id   uuid references public.sale_items(id) on delete cascade,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on public.inventory_movements (product_id, size, color);
-- A sale line can only ever have ONE deduction row => no duplicate deductions.
create unique index inventory_one_movement_per_sale_item on public.inventory_movements (sale_item_id) where sale_item_id is not null;

create or replace view public.stock_levels with (security_invoker = true) as
select m.product_id, m.size, m.color, sum(m.quantity)::int as quantity
from public.inventory_movements m
join public.products p on p.id = m.product_id
where not p.is_concept
group by m.product_id, m.size, m.color;

-- Keep one deduction row per sale line in sync with the sale (insert / edit / cancel / delete).
create or replace function public.sync_sale_item_stock(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it   record;
  st   text;
begin
  select si.*, s.order_status into it
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.id = p_item_id;

  if not found then
    delete from public.inventory_movements where sale_item_id = p_item_id;
    return;
  end if;

  st := it.order_status;
  if it.product_id is null
     or st in ('cancelled','returned')
     or exists (select 1 from public.products where id = it.product_id and is_concept) then
    delete from public.inventory_movements where sale_item_id = p_item_id;
    return;
  end if;

  insert into public.inventory_movements (product_id, size, color, movement_type, quantity, sale_item_id, note)
  values (it.product_id, coalesce(it.size,''), coalesce(it.color,''), 'sale', -it.quantity, it.id, 'Auto: sale line')
  on conflict (sale_item_id) where sale_item_id is not null do update
    set product_id = excluded.product_id,
        size       = excluded.size,
        color      = excluded.color,
        quantity   = excluded.quantity;
end $$;

create or replace function public.trg_sale_items_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.inventory_movements where sale_item_id = old.id;
    return old;
  end if;
  perform public.sync_sale_item_stock(new.id);
  return new;
end $$;

create trigger sale_items_stock
after insert or update on public.sale_items
for each row execute function public.trg_sale_items_stock();

create trigger sale_items_stock_del
before delete on public.sale_items
for each row execute function public.trg_sale_items_stock();

create or replace function public.trg_sales_status_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.order_status is distinct from old.order_status then
    for r in select id from public.sale_items where sale_id = new.id loop
      perform public.sync_sale_item_stock(r.id);
    end loop;
  end if;
  return new;
end $$;

create trigger sales_status_stock
after update on public.sales
for each row execute function public.trg_sales_status_stock();

-- snapshot unit cost on sale lines
create or replace function public.trg_sale_item_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id or new.unit_cost = 0) then
    select coalesce(total_unit_cost,0) into new.unit_cost from public.product_costs where product_id = new.product_id;
    new.unit_cost := coalesce(new.unit_cost, 0);
  end if;
  return new;
end $$;

create trigger sale_items_cost
before insert or update on public.sale_items
for each row execute function public.trg_sale_item_cost();

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create trigger t_upd before update on public.collections   for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.products      for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.product_costs for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.tags          for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.customers     for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.quotations    for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.sales         for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.expenses      for each row execute function public.touch_updated_at();

-- published_at bookkeeping
create or replace function public.trg_products_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger products_published_at before insert or update on public.products
for each row execute function public.trg_products_published_at();

-- ---------------------------------------------------------------------
-- CATALOGUE SIGNAL  (drives live showroom updates)
-- Any change to catalogue data bumps this single row. The public showroom
-- subscribes to it via Supabase Realtime and re-fetches the public catalogue.
-- This never sends private data over the wire — only a version number.
-- ---------------------------------------------------------------------
create table public.catalog_signal (
  id          int primary key default 1 check (id = 1),
  version     bigint not null default 0,
  changed_at  timestamptz not null default now()
);
insert into public.catalog_signal (id, version) values (1, 0);

create or replace function public.bump_catalog_signal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.catalog_signal set version = version + 1, changed_at = now() where id = 1;
  return null;
end $$;

create trigger catalog_bump after insert or update or delete on public.products         for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.product_images   for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.product_tags     for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.tags             for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.collections      for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.categories       for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.fit_types        for each statement execute function public.bump_catalog_signal();
create trigger catalog_bump after insert or update or delete on public.target_customers for each statement execute function public.bump_catalog_signal();
