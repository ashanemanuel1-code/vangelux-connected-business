import { Component, type ReactNode } from 'react';

type State = { error: Error | null; copied: boolean };

const isMissingFile = (e: Error) => /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(`${e?.name} ${e?.message}`);

/**
 * Catches anything that goes wrong inside a page.
 * - A missing file (usually an old copy after an update) → repairs itself automatically.
 * - Anything else → a clear screen with "Reload" and "Copy error details" (send these to Claude).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error) {
    console.error('[VANGELUX] page error:', error);
    if (isMissingFile(error)) window.__vgxHeal?.('missing file: ' + error.message);
  }

  private details() {
    const e = this.state.error;
    return [
      `VANGELUX error report`,
      `Time: ${new Date().toISOString()}`,
      `Page: ${location.href}`,
      `Build: ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '?'}`,
      `Device: ${navigator.userAgent}`,
      `Error: ${e?.name}: ${e?.message}`,
      `${(e?.stack ?? '').split('\n').slice(0, 8).join('\n')}`,
    ].join('\n');
  }

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0B0B', color: '#F5F0E6', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ color: '#C9A44C', letterSpacing: '.2em', fontWeight: 700, margin: '0 0 12px' }}>VANGELUX</p>
          <p style={{ margin: '0 0 6px', fontSize: 18 }}>Something went wrong on this page.</p>
          <p style={{ margin: '0 0 22px', color: '#aaa', fontSize: 14 }}>Your data is safe. Tap Reload. If it happens again, tap “Copy error details” and send it to Claude.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => window.__vgxHeal ? window.__vgxHeal('reload after error', true) : location.reload()}
              style={{ background: '#C9A44C', color: '#0B0B0B', border: 0, borderRadius: 999, padding: '12px 24px', fontWeight: 700 }}>Reload</button>
            <button onClick={() => { void navigator.clipboard?.writeText(this.details()).then(() => this.setState({ copied: true })); }}
              style={{ background: 'transparent', color: '#F5F0E6', border: '1px solid #555', borderRadius: 999, padding: '12px 20px' }}>{this.state.copied ? 'Copied ✓' : 'Copy error details'}</button>
          </div>
          <p style={{ marginTop: 18, fontSize: 11, color: '#666', wordBreak: 'break-word' }}>{e.message}</p>
        </div>
      </div>
    );
  }
}
