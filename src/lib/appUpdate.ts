import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the website and the Android admin app on the newest version.
 *
 * - Checks for a new version every 5 minutes and whenever the app comes back to the screen.
 * - Showroom visitors, and admin pages opened less than 20 seconds ago, update straight away.
 * - Otherwise the admin shows an "Update now" bar, so nothing you are typing is lost.
 */
const CHECK_EVERY_MS = 5 * 60 * 1000;
const FRESH_MS = 20 * 1000;
const loadedAt = Date.now();

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let ready = false;
const listeners = new Set<(ready: boolean) => void>();

const isAdminPage = () => window.location.hash.startsWith('#/admin');

export function startAppUpdates() {
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (!isAdminPage() || Date.now() - loadedAt < FRESH_MS) { void applyUpdate?.(true); return; }
      ready = true;
      listeners.forEach((l) => l(true));
    },
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) return;
      setInterval(() => { if (navigator.onLine) void r.update(); }, CHECK_EVERY_MS);
      const check = () => { if (document.visibilityState === 'visible' && navigator.onLine) void r.update(); };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
    },
  });
}

/** Subscribe to "a new version is ready". Returns an unsubscribe function. */
export function onUpdateReady(cb: (ready: boolean) => void) {
  listeners.add(cb); cb(ready);
  return () => { listeners.delete(cb); };
}

/** Switch to the new version now (reloads the page). */
export async function updateNow() {
  if (ready && applyUpdate) { await applyUpdate(true); return; }
  window.location.reload();
}

/** "Refresh" button: look for a new version, then reload with the latest code and data. */
export async function checkAndRefresh() {
  try { await registration?.update(); } catch { /* offline — just reload */ }
  await new Promise((r) => setTimeout(r, 800)); // give a found update a moment to install
  await updateNow();
}
