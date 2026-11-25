/** Set at build time (vite.config.ts) — the ID of the build this copy of the app came from. */
declare const __BUILD_ID__: string;

interface Window {
  /** Set by main.tsx once the app has started (checked by the self-repair script in index.html). */
  __vgxBooted?: boolean;
  /** Self-repair from index.html: clears the saved copy of the app and reloads a fresh one. */
  __vgxHeal?: (reason: string, force?: boolean) => void;
}
