-- VANGELUX — complete database setup (all migrations in order).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it ONCE on a new project.


-- >>>>>>>>>> 20261122000001_schema.sql
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

-- >>>>>>>>>> 20261122000002_security.sql
-- =====================================================================
-- VANGELUX CONNECTED BUSINESS — 002 SECURITY, PUBLIC API, ADMIN RPCs
-- Row Level Security on every table. The public (anon) role can read
-- ONLY: the public catalogue function and the catalogue version signal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who is staff?
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and is_active);
$$;

create or replace function public.is_owner_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and is_active and role in ('owner','admin'));
$$;

create or replace function public.my_staff_profile()
returns public.staff language sql stable security definer set search_path = public as $$
  select * from public.staff where user_id = auth.uid() and is_active;
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.staff               enable row level security;
alter table public.categories          enable row level security;
alter table public.target_customers    enable row level security;
alter table public.fit_types           enable row level security;
alter table public.size_options        enable row level security;
alter table public.tags                enable row level security;
alter table public.expense_categories  enable row level security;
alter table public.collections         enable row level security;
alter table public.products            enable row level security;
alter table public.product_costs       enable row level security;
alter table public.product_images      enable row level security;
alter table public.product_tags        enable row level security;
alter table public.customers           enable row level security;
alter table public.doc_counters        enable row level security;
alter table public.quotations          enable row level security;
alter table public.quotation_items     enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.expenses            enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.catalog_signal      enable row level security;

-- Staff: everyone on staff can read the staff list; only owner/admin manage it.
create policy staff_read   on public.staff for select to authenticated using (public.is_staff());
create policy staff_manage on public.staff for all    to authenticated
  using (public.is_owner_or_admin() and role <> 'owner')
  with check (public.is_owner_or_admin() and role <> 'owner');

-- Every business table: full access for active staff only. No anon policies at all.
do $$
declare t text;
begin
  foreach t in array array[
    'categories','target_customers','fit_types','size_options','tags','expense_categories',
    'collections','products','product_costs','product_images','product_tags',
    'customers','doc_counters','quotations','quotation_items','sales','sale_items','expenses','inventory_movements'
  ] loop
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- Catalogue signal: anyone may read the version number (contains no business data).
create policy signal_read on public.catalog_signal for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Explicit grants for signed-in users (RLS above decides what they can
-- actually touch). Newer Supabase projects may not grant these by default.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- ---------------------------------------------------------------------
-- Belt and braces: strip table privileges from the anonymous role.
-- (RLS already blocks it; this makes accidental exposure impossible.)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.catalog_signal to anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- PUBLIC SHOWROOM API
-- Returns ONLY published products and published collections, with an
-- explicit whitelist of public columns. No costs, wholesale prices,
-- supplier data, stock, customers, quotations or sales ever leave here.
-- ---------------------------------------------------------------------
create or replace function public.get_showroom_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', (select version from public.catalog_signal where id = 1),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'volume_label', c.volume_label, 'name', c.name, 'tagline', c.tagline,
        'scripture', c.scripture, 'description', c.description, 'artwork_path', c.artwork_path,
        'status', c.status, 'sort_order', c.sort_order
      ) order by c.sort_order, c.created_at)
      from public.collections c where c.is_published
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'sku', p.sku, 'description', p.description,
        'collection_id', case when c.is_published then p.collection_id end,
        'collection_name', case when c.is_published then concat_ws(' — ', c.volume_label, c.name) end,
        'category', cat.name, 'fit_type', ft.name, 'target_customer', tc.name,
        'sizes', to_jsonb(p.sizes), 'colors', to_jsonb(p.colors),
        'selling_price', p.selling_price, 'discount_percent', p.discount_percent,
        'published_at', p.published_at, 'sort_order', p.sort_order,
        'images', coalesce((
          select jsonb_agg(jsonb_build_object('path', i.storage_path, 'kind', i.kind, 'is_main', i.is_main)
                           order by i.is_main desc, i.sort_order, i.created_at)
          from public.product_images i where i.product_id = p.id), '[]'::jsonb),
        'tags', coalesce((
          select jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color) order by t.sort_order, t.name)
          from public.product_tags pt join public.tags t on t.id = pt.tag_id
          where pt.product_id = p.id and t.is_public), '[]'::jsonb)
      ) order by p.sort_order, p.published_at desc nulls last)
      from public.products p
      left join public.collections c       on c.id = p.collection_id
      left join public.categories cat      on cat.id = p.category_id
      left join public.fit_types ft        on ft.id = p.fit_type_id
      left join public.target_customers tc on tc.id = p.target_customer_id
      where p.status = 'published'
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- ADMIN: dashboard figures (calculated from real records)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard(p_months int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  start_month date := (date_trunc('month', current_date) - make_interval(months => greatest(p_months,1) - 1))::date;
begin
  if not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with valid_sales as (
    select s.*,
      (select coalesce(sum(line_total),0) from public.sale_items where sale_id = s.id) - s.discount_amount + s.delivery_fee as total,
      (select coalesce(sum(quantity * unit_cost),0) from public.sale_items where sale_id = s.id) as cogs
    from public.sales s
    where s.order_status not in ('cancelled','returned')
  ),
  months as (
    select generate_series(start_month, date_trunc('month', current_date)::date, interval '1 month')::date as m
  ),
  monthly as (
    select to_char(mo.m, 'YYYY-MM') as month,
      coalesce((select sum(total) from valid_sales where date_trunc('month', sale_date)::date = mo.m),0) as sales,
      coalesce((select sum(cogs)  from valid_sales where date_trunc('month', sale_date)::date = mo.m),0) as cogs,
      coalesce((select sum(e.amount) from public.expenses e where date_trunc('month', e.expense_date)::date = mo.m),0) as expenses,
      coalesce((select sum(e.amount) from public.expenses e left join public.expense_categories ec on ec.id = e.category_id
                where date_trunc('month', e.expense_date)::date = mo.m and coalesce(ec.is_operating, true)),0) as operating_expenses
    from months mo
  )
  select jsonb_build_object(
    'published_products', (select count(*) from public.products where status = 'published'),
    'total_designs',      (select count(*) from public.products where status <> 'archived'),
    'total_collections',  (select count(*) from public.collections),
    'total_sales',        (select coalesce(sum(total),0) from valid_sales),
    'sales_count',        (select count(*) from valid_sales),
    'total_cogs',         (select coalesce(sum(cogs),0) from valid_sales),
    'total_expenses',     (select coalesce(sum(amount),0) from public.expenses),
    'operating_expenses', (select coalesce(sum(e.amount),0) from public.expenses e
                             left join public.expense_categories ec on ec.id = e.category_id
                             where coalesce(ec.is_operating, true)),
    'pending_quotations', (select count(*) from public.quotations where status in ('draft','sent')),
    'outstanding_payments', (select coalesce(sum(greatest(total - amount_paid, 0)),0) from valid_sales where payment_status <> 'refunded'),
    'inventory_quantity', (select coalesce(sum(quantity),0) from public.stock_levels),
    'low_stock', coalesce((
        select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'sku', p.sku, 'size', sl.size, 'color', sl.color, 'quantity', sl.quantity) order by sl.quantity)
        from public.stock_levels sl join public.products p on p.id = sl.product_id
        where p.status <> 'archived' and sl.quantity <= p.low_stock_threshold), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object(
        'month', month, 'sales', sales, 'expenses', expenses, 'cogs', cogs,
        'gross_profit', sales - cogs, 'net_profit', sales - cogs - operating_expenses) order by month) from monthly), '[]'::jsonb),
    'best_sellers', coalesce((
        select jsonb_agg(x order by (x->>'quantity')::int desc) from (
          select jsonb_build_object('name', coalesce(p.name, si.description), 'quantity', sum(si.quantity), 'revenue', sum(si.line_total)) as x
          from public.sale_items si join valid_sales vs on vs.id = si.sale_id
          left join public.products p on p.id = si.product_id
          group by coalesce(p.name, si.description)
          order by sum(si.quantity) desc limit 8) q), '[]'::jsonb),
    'collection_performance', coalesce((
        select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
          select jsonb_build_object('name', coalesce(concat_ws(' — ', c.volume_label, c.name), 'No collection'),
                                    'quantity', sum(si.quantity), 'revenue', sum(si.line_total)) as x
          from public.sale_items si join valid_sales vs on vs.id = si.sale_id
          left join public.products p on p.id = si.product_id
          left join public.collections c on c.id = p.collection_id
          group by concat_ws(' — ', c.volume_label, c.name), c.id) q), '[]'::jsonb)
  ) into result;

  return result;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: convert an accepted quotation into an order (sale)
-- ---------------------------------------------------------------------
create or replace function public.convert_quotation_to_sale(p_quotation_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q  public.quotations;
  new_sale uuid;
begin
  if not public.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into q from public.quotations where id = p_quotation_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can be converted to orders'; end if;
  if q.converted_sale_id is not null then return q.converted_sale_id; end if;

  -- create or link customer record
  if q.customer_id is null then
    insert into public.customers (name, phone, email, address)
    values (q.customer_name, q.customer_phone, q.customer_email, q.customer_address)
    returning id into q.customer_id;
    update public.quotations set customer_id = q.customer_id where id = q.id;
  end if;

  insert into public.sales (customer_id, customer_name, discount_amount, delivery_fee, quotation_id, order_status, payment_status, notes)
  values (q.customer_id, q.customer_name, q.discount_amount, q.delivery_fee, q.id, 'confirmed', 'unpaid',
          'Created from quotation ' || q.quote_number)
  returning id into new_sale;

  insert into public.sale_items (sale_id, product_id, description, size, color, quantity, unit_price, discount_amount)
  select new_sale, product_id, description, size, color, quantity, unit_price, discount_amount
  from public.quotation_items where quotation_id = q.id order by sort_order;

  update public.quotations set converted_sale_id = new_sale where id = q.id;
  return new_sale;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: add a staff member (the person must already exist in
-- Supabase → Authentication → Users, e.g. via "Invite user").
-- ---------------------------------------------------------------------
create or replace function public.add_staff_by_email(p_email text, p_role text default 'staff', p_name text default null)
returns public.staff language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  row public.staff;
begin
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin can add staff' using errcode = '42501';
  end if;
  if p_role not in ('admin','staff') then
    raise exception 'Role must be admin or staff';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No login exists for %. Invite them first in Supabase → Authentication → Users.', p_email;
  end if;
  insert into public.staff (user_id, email, full_name, role, is_active)
  values (uid, lower(trim(p_email)), p_name, p_role, true)
  on conflict (user_id) do update set role = excluded.role, is_active = true, full_name = coalesce(excluded.full_name, staff.full_name)
  returning * into row;
  return row;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_showroom_catalog()                to anon, authenticated;
grant execute on function public.is_staff()                            to authenticated;
grant execute on function public.is_owner_or_admin()                   to authenticated;
grant execute on function public.my_staff_profile()                    to authenticated;
grant execute on function public.admin_dashboard(int)                  to authenticated;
grant execute on function public.convert_quotation_to_sale(uuid)       to authenticated;
grant execute on function public.next_doc_number(text)                 to authenticated;
grant execute on function public.add_staff_by_email(text, text, text)  to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: public showroom listens to catalog_signal; admin devices
-- listen to business tables (RLS still applies to every event).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.catalog_signal, public.products, public.product_images, public.product_tags,
      public.collections, public.tags, public.quotations, public.sales, public.expenses,
      public.customers, public.inventory_movements;
  end if;
end $$;

-- >>>>>>>>>> 20261122000003_storage.sql
-- =====================================================================
-- VANGELUX CONNECTED BUSINESS — 003 STORAGE
--   product-media : product photos + collection artwork.
--                   Public READ by direct URL (needed for the showroom),
--                   random UUID paths, NO public listing, staff-only writes.
--   receipts      : expense receipts & internal documents. Fully private.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-media', 'product-media', true,  10485760, array['image/jpeg','image/png','image/webp','image/gif','image/avif']),
  ('receipts',      'receipts',      false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- product-media: staff can list/upload/replace/delete. Anonymous visitors get
-- images only through the bucket's public URL (no list, no write).
create policy "product-media staff read"   on storage.objects for select to authenticated
  using (bucket_id = 'product-media' and public.is_staff());
create policy "product-media staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and public.is_staff());
create policy "product-media staff update" on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and public.is_staff()) with check (bucket_id = 'product-media' and public.is_staff());
create policy "product-media staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and public.is_staff());

-- receipts: staff only, for everything.
create policy "receipts staff read"   on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_staff());
create policy "receipts staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_staff());
create policy "receipts staff update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_staff()) with check (bucket_id = 'receipts' and public.is_staff());
create policy "receipts staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_staff());

-- >>>>>>>>>> 20261122000004_seed.sql
-- =====================================================================
-- VANGELUX CONNECTED BUSINESS — 004 STARTING DATA
-- All of these can be renamed, recoloured, reordered or deleted later
-- from the admin app (Settings & Collections screens).
-- =====================================================================

insert into public.categories (name, sort_order) values
  ('T-shirts',1),('Oversized T-shirts',2),('Regular-fit T-shirts',3),('Hoodies',4),
  ('Sweatshirts',5),('Long sleeves',6),('Caps',7),('Accessories',8),('Other',9)
on conflict (name) do nothing;

insert into public.target_customers (name, sort_order) values
  ('Adults',1),('Kids',2),('Unisex',3),('Custom',4)
on conflict (name) do nothing;

insert into public.fit_types (name, sort_order) values
  ('Oversized',1),('Regular fit',2),('Relaxed fit',3),('Slim fit',4),('Custom',5)
on conflict (name) do nothing;

insert into public.size_options (size_group, label, sort_order) values
  ('adult','XS',1),('adult','S',2),('adult','M',3),('adult','L',4),('adult','XL',5),
  ('adult','XXL',6),('adult','XXXL',7),('adult','Custom',8),
  ('kids','2–3 years',1),('kids','4–5 years',2),('kids','6–7 years',3),('kids','8–9 years',4),
  ('kids','10–11 years',5),('kids','12–13 years',6),('kids','Custom',7)
on conflict (size_group, label) do nothing;

insert into public.tags (name, color, is_public, sort_order) values
  ('New Arrival','#C9A24A',true,1),('Premium','#1F1F1F',true,2),('Limited Edition','#9B1C1C',true,3),
  ('Oversized','#4B5563',true,4),('Kids','#2563EB',true,5),('Adults','#374151',true,6),
  ('Unisex','#6B7280',true,7),('Pre-launch','#B45309',true,8),('Available','#15803D',true,9),
  ('Out of Stock','#7F1D1D',true,10)
on conflict (name) do nothing;

insert into public.expense_categories (name, is_operating, sort_order) values
  ('Fabric',false,1),('Manufacturing',false,2),('Printing',false,3),('Packaging',false,4),
  ('Transport',true,5),('Marketing',true,6),('Advertising',true,7),('Photography',true,8),
  ('Software',true,9),('Other',true,10)
on conflict (name) do nothing;

insert into public.collections (volume_label, name, tagline, scripture, description, artwork_path, status, is_published, sort_order)
select 'VOL. 01', 'THE GREAT COMMISSION', 'CONQUER THE WORLD FOR JESUS.', 'Matthew 28:19–20',
  'A bold visual declaration of the call to share Christ''s message across nations through love, truth, humility and service — not force or domination.',
  'brand/great-commission-artwork.jpg', 'pre-launch', true, 1
where not exists (select 1 from public.collections where name = 'THE GREAT COMMISSION');

insert into public.collections (volume_label, name, tagline, scripture, description, status, is_published, sort_order)
select 'VOL. 02', 'UNASHAMED', 'NOT ASHAMED OF THE GOSPEL.', 'Romans 1:16',
  'Black and white oversized editions with a restrained front logo and a prominent crown-of-thorns, cross and Gospel statement on the back.',
  'development', true, 2
where not exists (select 1 from public.collections where name = 'UNASHAMED');


-- =====================================================================
-- (added 2026-11-23) From stock or to order
-- =====================================================================
-- VANGELUX — "From stock or to order" (pre-orders)
--
-- * Products are the catalogue. Inventory is what you physically have.
--   Any product (concept or not) can hold stock.
-- * Every sale line is split automatically:
--     from_stock = how many come out of what you have in hand
--     the rest   = to order / produce (pre-order)
-- * supply_status tracks the "to order" part: to_order → ordered → received.
-- * Customers never see stock: nothing here is exposed to the showroom.
--
-- Safe to run more than once. Existing data is kept.
-- =====================================================================

alter table public.sale_items add column if not exists from_stock int check (from_stock >= 0);
alter table public.sale_items add column if not exists supply_status text not null default 'none';
do $$ begin
  alter table public.sale_items add constraint sale_items_supply_status_check
    check (supply_status in ('none','to_order','ordered','received'));
exception when duplicate_object then null; end $$;

-- Stock = everything recorded in Inventory, for every product.
create or replace view public.stock_levels with (security_invoker = true) as
select m.product_id, m.size, m.color, sum(m.quantity)::int as quantity
from public.inventory_movements m
join public.products p on p.id = m.product_id
group by m.product_id, m.size, m.color;

-- Decide how much of each line comes from stock (unless the app sends a number).
create or replace function public.trg_sale_item_allocate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  avail int := 0;
  mine  int := 0;
  auto  boolean;
begin
  auto := new.from_stock is null
       or (tg_op = 'UPDATE'
           and new.from_stock is not distinct from old.from_stock
           and (new.product_id is distinct from old.product_id
             or new.size is distinct from old.size
             or new.color is distinct from old.color
             or new.quantity is distinct from old.quantity));

  if new.product_id is null then
    new.from_stock := 0;                         -- custom item: always made to order
  elsif auto then
    select coalesce(sum(quantity), 0) into avail
      from public.inventory_movements
     where product_id = new.product_id and size = coalesce(new.size, '') and color = coalesce(new.color, '');
    if tg_op = 'UPDATE' then                     -- this line's own deduction is still "available" to it
      select coalesce(-sum(quantity), 0) into mine
        from public.inventory_movements
       where sale_item_id = new.id and product_id = new.product_id
         and size = coalesce(new.size, '') and color = coalesce(new.color, '');
    end if;
    new.from_stock := greatest(0, least(new.quantity, avail + mine));
  end if;

  new.from_stock := least(new.from_stock, new.quantity);

  if new.quantity - new.from_stock <= 0 then
    new.supply_status := 'none';
  elsif new.supply_status = 'none' then
    new.supply_status := 'to_order';
  end if;
  return new;
end $$;

drop trigger if exists sale_items_allocate on public.sale_items;
create trigger sale_items_allocate
before insert or update on public.sale_items
for each row execute function public.trg_sale_item_allocate();

-- Only the "from stock" part is deducted from inventory.
create or replace function public.sync_sale_item_stock(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it record;
begin
  select si.*, s.order_status into it
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.id = p_item_id;

  if not found
     or it.product_id is null
     or it.order_status in ('cancelled','returned')
     or coalesce(it.from_stock, 0) = 0 then
    delete from public.inventory_movements where sale_item_id = p_item_id;
    return;
  end if;

  insert into public.inventory_movements (product_id, size, color, movement_type, quantity, sale_item_id, note)
  values (it.product_id, coalesce(it.size,''), coalesce(it.color,''), 'sale', -it.from_stock, it.id, 'Auto: sale line (from stock)')
  on conflict (sale_item_id) where sale_item_id is not null do update
    set product_id = excluded.product_id,
        size       = excluded.size,
        color      = excluded.color,
        quantity   = excluded.quantity;
end $$;

revoke execute on function public.trg_sale_item_allocate() from public, anon;
revoke execute on function public.sync_sale_item_stock(uuid) from public, anon;

-- Existing sale lines: keep exactly what was deducted before.
update public.sale_items si
   set from_stock = coalesce((select -m.quantity from public.inventory_movements m where m.sale_item_id = si.id), 0)
 where si.from_stock is null;
