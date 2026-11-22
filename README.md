# VANGELUX Connected Business

One cloud database, two connected apps:

| | Address | Who |
|---|---|---|
| **Public showroom** | `https://<github-user>.github.io/vangelux-connected-business/#/` | Customers — no login |
| **VANGELUX Admin** | `https://<github-user>.github.io/vangelux-connected-business/#/admin` | You and authorised staff |

Both read and write the **same Supabase database**. Publish a product, change a price, swap an image or hide a collection in the admin app, and every open showroom updates within seconds — **no GitHub deployment needed**. GitHub is only used when the *software* changes.

```
 ┌─────────────── GitHub Pages (static app, deployed by GitHub Actions) ───────────────┐
 │   /#/  Showroom (public)                    /#/admin  Admin app (login required)     │
 └───────────────┬──────────────────────────────────────────────┬───────────────────────┘
                 │ get_showroom_catalog()  (published data only) │ full CRUD (staff only, RLS)
                 │ Realtime: catalog_signal                      │ Storage uploads (photos, receipts)
                 ▼                                               ▼
 ┌──────────────────────────────── Supabase (one project) ─────────────────────────────┐
 │  Auth · PostgreSQL + Row Level Security · Storage (product-media, receipts) · Realtime │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

## What's inside

**Admin app** (installable PWA, works on phone/tablet/desktop)
- **Dashboard** — published products, designs, collections, total sales, expenses, gross & net profit, pending quotations, outstanding payments, stock; charts for monthly sales vs expenses, profit trend, best sellers and collection performance. All figures are calculated in the database from real records.
- **Products** — add/edit with photos straight from the phone gallery, camera, tablet or computer: front, back and detail images, choose the main image, replace, delete. Photos are resized on the device and uploaded to Supabase Storage. SKU, collection, category, target customer, fit, sizes (adult/kids/custom), colours, tags, status (draft / published / archived), concept-design flag.
- **Pricing & costs (private)** — manufacturing, fabric, printing, packaging, transport and other costs → total unit cost, retail / wholesale price, discount, profit per unit and gross margin, in LKR.
- **Collections** — artwork upload, description, scripture, status (Concept → Discontinued), showroom visibility, add/remove products.
- **Settings & Tags** — create, rename, recolour, delete tags (public or internal-only); manage categories, fit types, target customers, sizes, expense categories and staff. Nothing is hard-coded.
- **Quotations** — pick catalogue products (name, image, SKU, sizes and price filled in automatically, all editable), auto-numbered `QT-2026-0001`, branded PDF with the VANGELUX logo, preview, download, print, share to WhatsApp or email. Draft → Sent → Accepted / Rejected / Expired. Accepted quotations convert into orders; quotations never count as sales.
- **Sales** — manual entry with multiple items, invoice numbers, payments, order status; Excel/CSV import & export.
- **Expenses** — categories, receipt photos/PDFs (private bucket), Excel/CSV import & export.
- **Inventory** — stock per product/size/colour, initial stock, additions, returns, damaged, adjustments, low-stock alerts. Sales deduct automatically and editing a sale never double-deducts. Concept designs are never counted.
- **Customers** — contact details, purchase history, total purchases, outstanding balance.

**Public showroom** — black / charcoal / gold / ivory design with logo, hero, brand story, published collections, product catalogue with filters, product pages with image gallery and size/colour selection, and a **WhatsApp enquiry** that includes the product name, SKU, size, colour and link. No checkout or online payment.

## Security in one paragraph
Every table has Row Level Security. Anonymous visitors cannot read any table directly — the showroom calls one function, `get_showroom_catalog()`, which returns a fixed list of public columns for **published** products and **published** collections only. Costs live in a separate `product_costs` table, so they can't leak through a product query. Customers, quotations, sales, expenses, stock and staff are staff-only. Receipts are in a private bucket. Only the public anon/publishable key is in the app; there is no service-role key and no password in the code. `npm run test:db` proves all of this against a real PostgreSQL engine (50 checks) and runs on every deploy.

> **Note on Excel import:** the `xlsx` package on npm (0.18.5) has a known advisory for maliciously crafted spreadsheets. It's only used by signed-in staff importing their own files, but you can switch to SheetJS's patched build any time with
> `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (no code changes needed).

## Set it up
Follow **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)** — about 30 minutes, no coding:
1. Create a Supabase project and run `supabase/setup_all_in_one.sql`.
2. Create your owner login in Supabase and add it to the staff list (one SQL line).
3. Push this repository to GitHub, add two secrets, turn on GitHub Pages.
4. Open `/#/admin` on your phone → **Install app**.

Then run the acceptance checklist in **[docs/ACCEPTANCE_TESTS.md](docs/ACCEPTANCE_TESTS.md)**.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173/#/  and  /#/admin
npm run test:db              # database security & business-logic tests
npm run build
```

## Project layout
```
supabase/migrations/      001 schema · 002 security & functions · 003 storage · 004 starting data
supabase/setup_all_in_one.sql   the four files combined for one paste
tests/db/                 PostgreSQL tests for RLS, publishing, stock, quotations, dashboard maths
src/showroom/             public site
src/admin/                admin app (one file per screen)
src/lib/                  Supabase client, storage uploads, PDF, Excel, realtime helpers
public/                   logo, icons, two PWA manifests (showroom + admin)
.github/workflows/        build → test → deploy to GitHub Pages
```
