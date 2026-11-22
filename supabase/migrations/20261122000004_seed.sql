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
