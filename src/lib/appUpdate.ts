import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the website and the Android admin app on the newest version — and repairs itself.
 *
 * Two independent checks, every 5 minutes, when the app comes back to the screen and when
 * the internet comes back:
 *  1. the service worker (the app's saved copy) looks for a newer version;
 *  2. the app asks the server for /version.json and compares it with its own build ID.
 *     This works even if the saved copy is stuck or broken.
 *
 * - Showroom visitors, and admin pages opened less than 20 seconds ago, switch straight away.
 * - Otherwise the admin shows an "Update now" bar, so nothing you are typing is lost.
 * - "Refresh" (and the self-repair in index.html) clears the saved copy and loads a fresh one.
 */
const CHECK_EVERY_MS = 5 * 60 * 1000;
const FRESH_MS = 20 * 1000;
const loadedAt = Date.now();

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let ready = false;
let swWaiting = false;
const listeners = new Set<(ready: boolean) => void>();

const isAdminPage = () => window.location.hash.startsWith('#/admin');
const canSwitchNow = () => !isAdminPage() || Date.now() - loadedAt < FRESH_MS;

function announce() {
  if (canSwitchNow()) { void updateNow(); return; }
  ready = true;
  listeners.forEach((l) => l(true));
}

/** Ask the server which build is live; if it isn't this one, this copy is out of date. */
async function checkServerVersion() {
  if (!navigator.onLine || ready) return;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __BUILD_ID__) announce();
  } catch { /* offline or blocked — try again later */ }
}

function checkAll() {
  if (document.visibilityState !== 'visible' || !navigator.onLine) return;
  void registration?.update().catch(() => {});
  void checkServerVersion();
}

export function startAppUpdates() {
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() { swWaiting = true; announce(); },
    onRegisteredSW(_url, r) { registration = r; },
  });
  setInterval(checkAll, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', checkAll);
  window.addEventListener('online', checkAll);
  setTimeout(() => void checkServerVersion(), 3000);
}

/** Subscribe to "a new version is ready". Returns an unsubscribe function. */
export function onUpdateReady(cb: (ready: boolean) => void) {
  listeners.add(cb); cb(ready);
  return () => { listeners.delete(cb); };
}

/** Clear this device's saved copy of the app and load the newest one from the server. */
export async function freshReload() {
  if (window.__vgxHeal) { window.__vgxHeal('refresh', true); return; }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* still reload */ }
  const u = new URL(window.location.href); u.searchParams.set('r', Date.now().toString(36));
  window.location.replace(u.toString());
}

/** Switch to the new version now. */
export async function updateNow() {
  if (swWaiting && applyUpdate) {
    // let the waiting copy take over; if that doesn't reload us within 4s, do a clean reload
    setTimeout(() => void freshReload(), 4000);
    await applyUpdate(true);
    return;
  }
  await freshReload();
}

/** "Refresh" button: always loads a clean, up-to-date copy (your data is online, nothing is lost). */
export async function checkAndRefresh() {
  await freshReload();
}
