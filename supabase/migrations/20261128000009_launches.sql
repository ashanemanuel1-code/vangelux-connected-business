-- =====================================================================
-- VANGELUX — Countdowns (launches)
--
-- * Admin → Countdowns: a picture, a title and a launch date & time.
-- * The website shows a big live countdown (days · hours · minutes · seconds)
--   and, if you choose, a slim gold banner at the top.
-- * When the time is reached it either disappears or shows your "after" text
--   (e.g. "OUT NOW") for up to 14 days.
-- * Also fixes saving in Admin → Website & contact.
--
-- Safe to run more than once. Existing data is kept.
-- =====================================================================

-- Fix: Website & contact "Save" — the row always exists, the app now updates it.
insert into public.site_settings (id) values ('main') on conflict (id) do nothing;

create table if not exists public.launches (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  subtitle     text,
  image_path   text,
  launch_at    timestamptz not null,
  button_label text,
  link_url     text,
  ended_text   text,
  show_banner  boolean not null default true,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.launches enable row level security;
drop policy if exists staff_all on public.launches;
create policy staff_all on public.launches for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.launches to authenticated;
revoke all on public.launches from anon;

drop trigger if exists catalog_bump on public.launches;
create trigger catalog_bump after insert or update or delete on public.launches for each statement execute function public.bump_catalog_signal();

-- Public catalogue now also returns active countdowns.
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
    'launches', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'subtitle', l.subtitle, 'image_path', l.image_path,
                         'launch_at', l.launch_at, 'button_label', l.button_label, 'link_url', l.link_url,
                         'ended_text', l.ended_text, 'show_banner', l.show_banner)
                       order by l.launch_at)
      from public.launches l
      where l.is_active
        and (l.launch_at > now() or (coalesce(l.ended_text, '') <> '' and l.launch_at > now() - interval '14 days'))
    ), '[]'::jsonb),
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
          select jsonb_agg(jsonb_build_object('path', i.storage_path, 'kind', i.kind, 'is_main', i.is_main, 'color', i.color)
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
