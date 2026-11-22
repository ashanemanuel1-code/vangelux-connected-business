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
