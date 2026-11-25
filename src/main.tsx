import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppUpdates } from './lib/appUpdate';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import App from './App';

startAppUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Tell the self-repair script in index.html that the app started fine,
// and tidy the address bar after a self-repair reload (?r=…).
requestAnimationFrame(() => {
  window.__vgxBooted = true;
  const u = new URL(window.location.href);
  if (u.searchParams.has('r')) { u.searchParams.delete('r'); history.replaceState(history.state, '', u.toString()); }
  setTimeout(() => { try { sessionStorage.removeItem('vgx-heal-at'); } catch { /* ignore */ } }, 15000);
});
