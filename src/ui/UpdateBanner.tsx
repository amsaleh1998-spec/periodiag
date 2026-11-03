import { useEffect, useState } from 'react';

/** Registers the service worker and offers reloading when a new version is available. */
export function UpdateBanner({ beforeReload }: { beforeReload: () => Promise<void> }) {
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh: () => setUpdate(() => updateSW),
        onOfflineReady: () => setOfflineReady(true),
      });
    });
  }, []);

  if (update) {
    return (
      <div className="banner no-print" style={{ background: 'var(--primary-soft)', borderColor: '#aac4de', color: 'var(--primary)' }}>
        A new version of PerioDiag is available.{' '}
        <button
          className="btn sm primary"
          onClick={async () => {
            await beforeReload();
            await update(true);
          }}
        >
          Reload now
        </button>{' '}
        <button className="btn sm" onClick={() => setUpdate(null)}>
          Later
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="banner no-print" style={{ background: 'var(--ok-soft)', borderColor: '#a8d5aa', color: 'var(--ok)' }}>
        PerioDiag is installed for offline use.{' '}
        <button className="btn sm" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    );
  }
  return null;
}
