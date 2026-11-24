// Runs the real migration files in Postgres (PGlite) with Supabase-like auth/storage stubs,
// then checks security and business logic.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? "supabase/migrations";
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
async function expectError(sql, m, params) {
  try { await db.query(sql, params); ok(false, m + ' (no error raised)'); }
  catch (e) { ok(true, m + ' -> ' + e.message.split('\n')[0]); }
}

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create schema auth; grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage; grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant all on storage.objects to anon, authenticated;
`);

const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const f of files) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); console.log('applied', f); }
  catch (e) { console.log('MIGRATION FAILED', f, e.message); process.exit(1); }
}
// Supabase grants table privileges to anon/authenticated by default; emulate for tables created before our revoke ran
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`);
// re-run revoke part as in real Supabase ordering (default grants happen at create time)
await db.exec(fs.readFileSync(path.join(dir, files.find(f => f.includes('security'))), 'utf8').split('-- Belt and braces')[1].split('-- PUBLIC SHOWROOM API')[0].replace(/^[^\n]*\n/, ''));

const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${OWNER}','owner@x.com'),('${STRANGER}','random@x.com');
  insert into public.staff (user_id,email,role) values ('${OWNER}','owner@x.com','owner');`);

const asAnon = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); set role anon;`); };
const asUser = async (id) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`); };
const asSuper = async () => { await db.exec(`reset role;`); };

console.log('\n== Staff (owner) creates catalogue data ==');
await asUser(OWNER);
const col = (await db.query(`select id from collections where name='THE GREAT COMMISSION'`)).rows[0].id;
const cat = (await db.query(`select id from categories where name='Oversized T-shirts'`)).rows[0].id;
const p1 = (await db.query(`insert into products (name, sku, collection_id, category_id, sizes, colors, selling_price, status)
  values ('Great Commission Tee','VGX-GC-001',$1,$2,'{S,M,L}','{Black}',4500,'published') returning id`, [col, cat])).rows[0].id;
await db.query(`insert into product_costs (product_id, manufacturing_cost, fabric_cost, printing_cost, wholesale_price, supplier)
  values ($1, 1000, 800, 400, 3200, 'Secret Supplier Ltd')`, [p1]);
const p2 = (await db.query(`insert into products (name, sku, selling_price, status) values ('Draft Hoodie','VGX-DR-002',8000,'draft') returning id`)).rows[0].id;
await db.query(`insert into product_images (product_id, storage_path, kind, is_main) values ($1,'products/x/front.jpg','front',true)`, [p1]);
const tagPub = (await db.query(`select id from tags where name='New Arrival'`)).rows[0].id;
const tagPriv = (await db.query(`insert into tags (name, is_public) values ('Internal Only', false) returning id`)).rows[0].id;
await db.query(`insert into product_tags values ($1,$2),($1,$3)`, [p1, tagPub, tagPriv]);
const tc = (await db.query(`select total_unit_cost from product_costs where product_id=$1`, [p1])).rows[0].total_unit_cost;
ok(Number(tc) === 2200, 'total unit cost generated = 2200');
await expectError(`insert into product_images (product_id, storage_path, is_main) values ('${p1}','b.jpg',true)`, 'only one main image per product');

console.log('\n== Public (anon) access ==');
await asAnon();
const cat1 = (await db.query(`select get_showroom_catalog() as c`)).rows[0].c;
ok(cat1.products.length === 1 && cat1.products[0].name === 'Great Commission Tee', 'showroom shows only the published product');
const s = JSON.stringify(cat1);
ok(!s.includes('Secret Supplier') && !s.includes('wholesale') && !s.includes('2200') && !s.includes('3200'), 'no costs / supplier / wholesale in public payload');
ok(cat1.products[0].tags.length === 1 && cat1.products[0].tags[0].name === 'New Arrival', 'internal tag hidden from public');
ok(cat1.collections.length === 2, 'published collections visible');
for (const t of ['products','product_costs','customers','sales','sale_items','expenses','quotations','inventory_movements','staff','tags','collections']) {
  await expectError(`select * from public.${t} limit 1`, `anon cannot read ${t}`);
}
await expectError(`update public.products set selling_price = 1`, 'anon cannot write products');
await expectError(`select admin_dashboard(12)`, 'anon cannot call admin_dashboard');
await expectError(`select next_doc_number('QT')`, 'anon cannot call next_doc_number');
const sig = (await db.query(`select version from catalog_signal`)).rows[0];
ok(sig && Number(sig.version) > 0, 'anon can read catalogue signal version');
await expectError(`insert into storage.objects (bucket_id, name) values ('product-media','hack.jpg')`, 'anon cannot upload to product-media');

console.log('\n== Logged-in non-staff user ==');
await asUser(STRANGER);
const r = await db.query(`select * from products`);
ok(r.rows.length === 0, 'non-staff authenticated user sees no products (RLS)');
await expectError(`select admin_dashboard(12)`, 'non-staff cannot call admin_dashboard');
await expectError(`insert into storage.objects (bucket_id, name) values ('receipts','r.jpg')`, 'non-staff cannot upload receipts');
await expectError(`insert into staff (user_id,email,role) values ('${STRANGER}','random@x.com','owner')`, 'non-staff cannot make themselves staff');

console.log('\n== Live sync signal ==');
await asUser(OWNER);
const v0 = Number((await db.query(`select version from catalog_signal`)).rows[0].version);
await db.query(`update products set selling_price = 4900 where id=$1`, [p1]);
const v1 = Number((await db.query(`select version from catalog_signal`)).rows[0].version);
ok(v1 > v0, 'price change bumps catalogue signal');
await db.query(`update products set status='draft' where id=$1`, [p1]);
await asAnon();
ok((await db.query(`select get_showroom_catalog() as c`)).rows[0].c.products.length === 0, 'unpublished product disappears from showroom');
await asUser(OWNER);
await db.query(`update products set status='published' where id=$1`, [p1]);
await db.query(`update products set status='archived' where id=$1`, [p2]);
await asAnon();
const c2 = (await db.query(`select get_showroom_catalog() as c`)).rows[0].c;
ok(c2.products.length === 1 && Number(c2.products[0].selling_price) === 4900, 'republished product shows updated price 4900');

console.log('\n== Inventory, sales, no duplicate deductions ==');
await asUser(OWNER);
await db.query(`insert into storage.objects (bucket_id, name) values ('product-media','products/ok.jpg')`);
ok(true, 'staff can upload to product-media');
await db.query(`insert into inventory_movements (product_id,size,color,movement_type,quantity) values ($1,'M','Black','initial',20)`, [p1]);
const sale = (await db.query(`insert into sales (customer_name, amount_paid, payment_status) values ('Kasun',4000,'partial') returning id, invoice_number`)).rows[0];
ok(/^INV-\d{4}-0001$/.test(sale.invoice_number), 'invoice number generated ' + sale.invoice_number);
const it = (await db.query(`insert into sale_items (sale_id, product_id, description, size, color, quantity, unit_price) values ($1,$2,'GC Tee','M','Black',3,4900) returning id, unit_cost`, [sale.id, p1])).rows[0];
ok(Number(it.unit_cost) === 2200, 'sale line snapshots unit cost for COGS');
const stock = async () => Number((await db.query(`select quantity from stock_levels where product_id=$1 and size='M'`, [p1])).rows[0]?.quantity ?? 0);
ok(await stock() === 17, 'stock 20 - 3 = 17');
await db.query(`update sale_items set quantity = 5 where id=$1`, [it.id]);
await db.query(`update sale_items set quantity = 4 where id=$1`, [it.id]);
ok(await stock() === 16, 'after editing qty 3→5→4, stock = 16 (no duplicate deduction)');
const mv = (await db.query(`select count(*)::int n from inventory_movements where sale_item_id=$1`, [it.id])).rows[0].n;
ok(mv === 1, 'exactly one movement row for the sale line');
await db.query(`update sales set order_status='cancelled' where id=$1`, [sale.id]);
ok(await stock() === 20, 'cancelling the sale restores stock');
await db.query(`update sales set order_status='confirmed' where id=$1`, [sale.id]);
ok(await stock() === 16, 're-confirming deducts again once');
// inventory is separate from the catalogue: any product (even a concept design) can hold stock
await db.query(`update products set is_concept = true where id=$1`, [p2]);
await db.query(`insert into inventory_movements (product_id,movement_type,quantity) values ($1,'initial',5)`, [p2]);
const conceptStock = (await db.query(`select quantity from stock_levels where product_id=$1`, [p2])).rows[0]?.quantity;
ok(conceptStock === 5, 'concept design can hold stock recorded in Inventory');

console.log('\n== Size charts ==');
const chart = (await db.query(`insert into size_charts (name, image_path) values ('Oversized Tee – Adult','size-charts/a.png') returning id`)).rows[0];
await db.query(`insert into size_charts (name, image_path, is_published) values ('Hidden draft chart','size-charts/b.png', false)`);
await db.query(`update products set size_chart_id=$1 where id=$2`, [chart.id, p1]);
await asAnon();
await expectError(`select * from public.size_charts`, 'anon cannot read the size_charts table directly');
const cat2 = (await db.query(`select public.get_showroom_catalog() c`)).rows[0].c;
ok(cat2.size_charts.length === 1 && cat2.size_charts[0].name === 'Oversized Tee – Adult', 'showroom gets only published size charts');
ok(cat2.products.some((p) => p.size_chart_id === chart.id), 'showroom product carries its size chart');
await asUser(OWNER);

console.log('\n== Website & contact settings ==');
await db.query(`update site_settings set content = '{"email":"hello@vangelux.lk","tiktok":""}'::jsonb where id='main'`);
await asAnon();
await expectError(`select * from public.site_settings`, 'anon cannot read site_settings directly');
await expectError(`update public.site_settings set content='{}'::jsonb`, 'anon cannot change website settings');
const cat3 = (await db.query(`select public.get_showroom_catalog() c`)).rows[0].c;
ok(cat3.site?.email === 'hello@vangelux.lk', 'showroom receives the saved website settings');
await asUser(OWNER);

console.log('\n== From stock or to order (pre-orders) ==');
await db.query(`insert into inventory_movements (product_id,size,color,movement_type,quantity) values ($1,'S','Black','addition',2)`, [p1]);
const stockS = async () => Number((await db.query(`select quantity from stock_levels where product_id=$1 and size='S'`, [p1])).rows[0]?.quantity ?? 0);
const pre = (await db.query(`insert into sales (customer_name) values ('Pre-order customer') returning id`)).rows[0];
const pl = (await db.query(`insert into sale_items (sale_id, product_id, description, size, color, quantity, unit_price) values ($1,$2,'GC Tee','S','Black',5,4900) returning id, from_stock, supply_status`, [pre.id, p1])).rows[0];
ok(pl.from_stock === 2 && pl.supply_status === 'to_order', 'order of 5 with 2 in hand → 2 from stock, 3 to order');
ok(await stockS() === 0, 'only the 2 in hand are deducted (stock never goes negative)');
let row = (await db.query(`update sale_items set quantity = 1 where id=$1 returning from_stock, supply_status`, [pl.id])).rows[0];
ok(row.from_stock === 1 && row.supply_status === 'none', 'qty changed to 1 → fully from stock, nothing to order');
ok(await stockS() === 1, 'stock corrected to 1 after editing the line');
row = (await db.query(`update sale_items set from_stock = 0 where id=$1 returning from_stock, supply_status`, [pl.id])).rows[0];
ok(row.from_stock === 0 && row.supply_status === 'to_order' && await stockS() === 2, 'manual choice "make it to order" keeps stock at 2');
await db.query(`update sale_items set supply_status = 'ordered' where id=$1`, [pl.id]);
row = (await db.query(`update sale_items set unit_price = 5000 where id=$1 returning from_stock, supply_status`, [pl.id])).rows[0];
ok(row.from_stock === 0 && row.supply_status === 'ordered', 'editing the price keeps the stock choice and "ordered" status');
const custom = (await db.query(`insert into sale_items (sale_id, description, quantity, unit_price) values ($1,'Custom church tee',10,3000) returning from_stock, supply_status`, [pre.id])).rows[0];
ok(custom.from_stock === 0 && custom.supply_status === 'to_order', 'custom item (no product) is always to order');
const conceptLine = (await db.query(`insert into sale_items (sale_id, product_id, description, quantity, unit_price) values ($1,$2,'Concept',2,8000) returning from_stock`, [pre.id, p2])).rows[0];
ok(conceptLine.from_stock === 2, 'concept design with stock in hand is taken from stock');
await asAnon();
await expectError(`select from_stock from public.sale_items limit 1`, 'anon cannot see stock allocation');
await asUser(OWNER);
await db.query(`delete from sales where id=$1`, [pre.id]);
ok(await stockS() === 2, 'deleting the order puts stock back');

console.log('\n== Quotation → order ==');
const q = (await db.query(`insert into quotations (customer_name, customer_phone, delivery_fee) values ('Nimal','0771234567',500) returning id, quote_number`)).rows[0];
ok(/^QT-\d{4}-0001$/.test(q.quote_number), 'quotation number generated ' + q.quote_number);
await db.query(`insert into quotation_items (quotation_id, product_id, description, size, quantity, unit_price) values ($1,$2,'GC Tee','L',2,4500)`, [q.id, p1]);
let dash = (await db.query(`select admin_dashboard(12) d`)).rows[0].d;
const salesBefore = Number(dash.total_sales);
ok(dash.pending_quotations === 1, 'dashboard counts 1 pending quotation');
await expectError(`select convert_quotation_to_sale('${q.id}')`, 'draft quotation cannot be converted');
await db.query(`update quotations set status='accepted' where id=$1`, [q.id]);
dash = (await db.query(`select admin_dashboard(12) d`)).rows[0].d;
ok(Number(dash.total_sales) === salesBefore, 'accepted quotation does NOT count as a sale');
const newSale = (await db.query(`select convert_quotation_to_sale($1) id`, [q.id])).rows[0].id;
const again = (await db.query(`select convert_quotation_to_sale($1) id`, [q.id])).rows[0].id;
ok(newSale === again, 'converting twice returns the same order (no duplicates)');
dash = (await db.query(`select admin_dashboard(12) d`)).rows[0].d;
ok(Number(dash.total_sales) === salesBefore + 9500, 'converted order adds 9,500 to sales');

console.log('\n== Dashboard maths ==');
const fabric = (await db.query(`select id from expense_categories where name='Fabric'`)).rows[0].id;
const mkt = (await db.query(`select id from expense_categories where name='Marketing'`)).rows[0].id;
await db.query(`insert into expenses (category_id, description, amount) values ($1,'Fabric roll',10000),($2,'Boosted post',3000)`, [fabric, mkt]);
dash = (await db.query(`select admin_dashboard(12) d`)).rows[0].d;
console.log('   ', JSON.stringify({ sales: dash.total_sales, cogs: dash.total_cogs, exp: dash.total_expenses, op: dash.operating_expenses, out: dash.outstanding_payments, inv: dash.inventory_quantity }));
// sales: 4*4900=19600 + quote 9000+500 = 29100 ; cogs: (4+2)*2200=13200
ok(Number(dash.total_sales) === 29100, 'total sales 29,100');
ok(Number(dash.total_cogs) === 13200, 'COGS 13,200');
ok(Number(dash.total_expenses) === 13000 && Number(dash.operating_expenses) === 3000, 'expenses 13,000 (3,000 operating)');
const m = dash.monthly[dash.monthly.length - 1];
ok(Number(m.gross_profit) === 15900 && Number(m.net_profit) === 12900, 'gross 15,900 / net 12,900 this month');
ok(Number(dash.outstanding_payments) === 29100 - 4000, 'outstanding payments 25,100');
ok(dash.best_sellers[0].name === 'Great Commission Tee', 'best seller computed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
