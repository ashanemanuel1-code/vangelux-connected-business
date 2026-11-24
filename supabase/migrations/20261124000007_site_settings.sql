-- =====================================================================
-- VANGELUX — Website & contact settings
--
-- * Admin → Website & contact: email, WhatsApp, social links and the website text.
-- * Saved as one row ('main'). Blank fields use the built-in defaults.
-- * The public showroom receives these through get_showroom_catalog().
--
-- Safe to run more than once. Existing data is kept.
-- =====================================================================

create table if not exists public.site_settings (
  id         text primary key default 'main' check (id = 'main'),
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values ('main') on conflict (id) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists staff_read on public.site_settings;
create policy staff_read on public.site_settings for select to authenticated using (public.is_staff());
drop policy if exists admin_write on public.site_settings;
create policy admin_write on public.site_settings for update to authenticated using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());
grant select, update on public.site_settings to authenticated;
revoke all on public.site_settings from anon;

drop trigger if exists catalog_bump on public.site_settings;
create trigger catalog_bump after insert or update on public.site_settings for each statement execute function public.bump_catalog_signal();

-- Public catalogue now also returns the website settings.
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
    'site', coalesce((select ss.content from public.site_settings ss where ss.id = 'main'), '{}'::jsonb),
    'size_charts', coalesce((
      select jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name, 'image_path', sc.image_path, 'notes', sc.notes)
                       order by sc.sort_order, sc.created_at)
      from public.size_charts sc where sc.is_published and sc.image_path is not null
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
        'size_chart_id', p.size_chart_id,
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

grant execute on function public.get_showroom_catalog() to anon, authenticated;
