# VANGELUX — Setup, admin account & deployment guide

You only do this once. Afterwards everything is managed inside the admin app.

---

## Part 1 — Supabase (your cloud database)

1. Go to <https://supabase.com> → sign in → **New project**.
   - Name: `vangelux` · choose a strong database password (save it in a password manager) · Region: the one closest to Sri Lanka (e.g. *Singapore* or *Mumbai*).
2. When the project is ready, open **SQL Editor → New query**.
3. Open `supabase/setup_all_in_one.sql` from this repository, copy **everything**, paste it into the editor and press **Run**.
   You should see *Success. No rows returned.* This creates all tables, security rules, storage buckets, realtime and the starting categories, sizes, tags and the two collections (VOL. 01 – The Great Commission, VOL. 02 – Unashamed).
4. Copy your keys: **Project Settings → API** (or **API Keys**)
   - **Project URL** → e.g. `https://abcdefgh.supabase.co`
   - **anon public** key (or **Publishable key**, starts with `sb_publishable_`)
   - ⚠️ Never copy the `service_role` / **Secret** key anywhere. The app doesn't need it.

### Authentication settings
In **Authentication → Sign In / Providers** (called *Providers* on some projects):
- **Email** provider: enabled.
- **Allow new users to sign up**: **OFF** (only you create logins). Nobody can register themselves.

In **Authentication → URL Configuration**:
- **Site URL**: `https://<your-github-username>.github.io/vangelux-connected-business/`
- **Redirect URLs** → add both:
  - `https://<your-github-username>.github.io/vangelux-connected-business/**`
  - `http://localhost:5173/**` (only for local testing)

In **Authentication → Emails → Reset password** (email template), add this line anywhere in the message so a 6-digit code is included (works even if the link opens in a different browser on your phone):
```
Or enter this code in the VANGELUX Admin app: {{ .Token }}
```

---

## Part 2 — Create your owner (administrator) account

Your password is never stored in the code — Supabase holds it securely.

1. **Authentication → Users → Add user → Create new user**
   - Email: the email you will log in with
   - Password: a strong password
   - Tick **Auto Confirm User** → **Create user**
2. **SQL Editor → New query**, paste this (change the email), **Run**:
   ```sql
   insert into public.staff (user_id, email, full_name, role)
   select id, email, 'Owner', 'owner'
   from auth.users
   where email = 'YOUR-LOGIN-EMAIL@example.com';
   ```
   You should see *1 row affected*. That account is now the owner.

**Adding staff later:** Authentication → Users → **Invite user** (they receive an email to set their password). Then in the admin app go to **Settings & Tags → Staff**, type their email, choose *Staff* or *Admin*, **Add**. You can disable a staff member there at any time.

---

## Part 3 — GitHub (hosting the app)

1. Create a new repository on GitHub named **`vangelux-connected-business`** (Public — required for free GitHub Pages).
2. Upload this project:
   - **Easiest (no command line):** on the new repo page click **uploading an existing file**, drag in *all* files and folders from this project (including the hidden `.github` folder — on Mac press `Cmd+Shift+.` in Finder to see it; on Windows enable *Hidden items*), then **Commit changes**.
   - **Or with Git:**
     ```bash
     git init && git add . && git commit -m "VANGELUX connected business"
     git branch -M main
     git remote add origin https://github.com/<your-github-username>/vangelux-connected-business.git
     git push -u origin main
     ```
3. **Settings → Secrets and variables → Actions → New repository secret** — add two:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon / publishable key |
4. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. **Actions** tab → open *Deploy to GitHub Pages* → **Run workflow** (or push any change). It installs, runs the database security tests, builds and publishes. When the green tick appears, your site is live:
   - Showroom: `https://<your-github-username>.github.io/vangelux-connected-business/`
   - Admin: `https://<your-github-username>.github.io/vangelux-connected-business/#/admin`

You will **not** need to come back to GitHub to add products, change prices, upload images, create quotations or record sales. Only when the software itself is changed.

---

## Part 4 — Install the admin app on your phone

**Android (Chrome):** open the admin address → sign in → menu **⋮** → **Install app** (or *Add to Home screen*). A gold VANGELUX icon appears and opens full-screen.

**iPhone (Safari):** open the admin address → **Share** → **Add to Home Screen** → Add.

**Desktop (Chrome/Edge):** the install icon appears at the right of the address bar.

The installed app, the browser and any other phone you log in from all use the same cloud data. Nothing important is stored only on the device.

---

## Updating the app later
Change code → commit to `main` → GitHub Actions redeploys automatically (≈2 minutes). Installed apps pick up the new version the next time they're opened.

If you ever change the database structure, add a new file in `supabase/migrations/` and run it in the SQL Editor.

## Troubleshooting
| Problem | Fix |
|---|---|
| “Access not authorised” after login | Run the Part 2 SQL with the exact login email. |
| Showroom says “being set up” | The two GitHub secrets are missing or wrong — fix them and re-run the workflow. |
| Image upload fails | Make sure you ran the whole setup SQL (it creates the `product-media` bucket). Max 10 MB per file (photos are shrunk automatically first). |
| Password reset link opens the login page | Add the Redirect URL from Part 1, or use the 6-digit code from the email at *Forgot password → I have a code*. |
| Workflow fails at “Test database security rules” | Someone changed a migration in a way that breaks a security rule — read the failing line in the log. |
