# Acceptance tests

Two layers of testing:

## A. Automated (already run during development, and on every GitHub deploy)

`npm run test:db` loads the four real migration files into a PostgreSQL engine with Supabase-style `anon` / `authenticated` roles and checks 50 rules, including:

- anonymous visitors can call the showroom function but **cannot read** products, product costs, customers, sales, sale items, expenses, quotations, inventory, staff, tags or collections tables, and cannot write anything or upload files
- the public catalogue contains **no** cost, supplier or wholesale data and hides internal-only tags
- a logged-in user who is **not** on the staff list sees nothing and cannot make themselves staff
- unpublishing removes a product from the showroom; republishing shows the updated price
- every catalogue change bumps the realtime signal the showroom listens to
- stock: 20 − 3 sold = 17; editing the same sale line 3→5→4 leaves 16 (one deduction row, never duplicated); cancelling restores stock; concept designs are never counted
- quotation numbers `QT-YYYY-0001`, invoice numbers `INV-YYYY-0001`
- an accepted quotation does **not** count as a sale until converted; converting twice creates one order
- dashboard maths: sales, cost of goods, expenses (production vs operating), gross & net profit, outstanding payments

A headless-browser pass also checked the built app: showroom renders published products with no cost data, WhatsApp enquiry carries product + selected size, `/#/admin` redirects to login, login reaches the dashboard, each admin screen renders, a photo upload shows its preview, and a quotation PDF is generated with logo and product image.

## B. Live checklist — do this once on your real Supabase + GitHub Pages site

| # | Test | Pass? |
|---|---|---|
| 1 | On phone A, open `/#/admin`, sign in. | ☐ |
| 2 | Products → Add product → Front design → **Upload image** → choose a photo from the gallery (try **Camera** too). Preview appears, spinner finishes. | ☐ |
| 3 | Fill name, selling price, tick sizes, choose category, pick tags. | ☐ |
| 4 | **Save & publish**. | ☐ |
| 5 | On phone B / a laptop (not logged in, private window), open the showroom `/#/`. | ☐ |
| 6 | The product appears in *Shop the message* with image, price, sizes, tags. | ☐ |
| 7 | In admin, change the selling price → Save. | ☐ |
| 8 | Without refreshing, the showroom price changes within a few seconds. (Also lock/unlock the phone — it refreshes on return.) No GitHub deploy happened. | ☐ |
| 9 | Replace the front image (↻ on the image) → Save → new image shows on the showroom. | ☐ |
| 10 | Products → **Unpublish** → product disappears from the showroom; its product page says “no longer available”. | ☐ |
| 11 | Quotations → New → pick the product, customer, qty → **PDF** opens/downloads a branded quotation; **WhatsApp** opens the share sheet with the PDF on the phone. | ☐ |
| 12 | Privacy: on the showroom open the browser console and run the snippet below — every line must say *denied* / *permission denied*. | ☐ |

Test 12 snippet (paste in the showroom tab's developer console — replace the two values):
```js
const URL='https://YOUR-PROJECT.supabase.co', KEY='YOUR-ANON-KEY';
for (const t of ['product_costs','customers','sales','expenses','quotations','inventory_movements','staff','products'])
  fetch(`${URL}/rest/v1/${t}?select=*`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})
    .then(r=>r.json()).then(j=>console.log(t, j.message ?? j));
```
