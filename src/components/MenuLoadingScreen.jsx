import { useEffect } from 'react';
import './MenuLoadingScreen.css';

export default function MenuLoadingScreen({ loading, onRetry }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = previousOverflow; };
  }, []);

  return (
    <main className="menu-loading-screen" aria-label="Kech Food Center menu">
      <div className="menu-loading-content">
        <img
          className={`menu-loading-logo${loading ? ' is-loading' : ''}`}
          src="/images/kfc_turbat_logo edited.png"
          alt="KFC Turbat"
          width="184"
          height="88"
          fetchPriority="high"
        />
        <div className="menu-loading-message" role="status" aria-live="polite" aria-atomic="true">
          {loading ? <p>Loading your menu…</p> : (
            <>
              <h1>Couldn’t load the menu</h1>
              <p>Please check your connection and try again.</p>
            </>
          )}
        </div>
        {!loading && <button className="menu-loading-retry" type="button" onClick={onRetry}>Retry</button>}
      </div>
    </main>
  );
}
