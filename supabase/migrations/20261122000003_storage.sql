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
