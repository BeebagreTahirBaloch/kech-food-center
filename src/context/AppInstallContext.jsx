import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const AppInstallContext = createContext(null);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function AppInstallProvider({ children }) {
  const { pathname } = useLocation();
  const customerPage = !/^\/(admin|rider)(\/|$)/.test(pathname);
  const [installed, setInstalled] = useState(standalone), [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(null), lock = useRef(false);
  useEffect(() => {
    if (!customerPage) { pending.current = null; setAvailable(false); return; }
    const capture = event => { event.preventDefault(); pending.current = event; setAvailable(true); setMessage(''); };
    const complete = () => { pending.current = null; setAvailable(false); setInstalled(true); setMessage('Kech Food Center is installed. Open it from your home screen.'); };
    const mode = window.matchMedia('(display-mode: standalone)');
    const modeChanged = () => { if (standalone()) complete(); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    mode.addEventListener('change', modeChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
      mode.removeEventListener('change', modeChanged);
    };
  }, [customerPage]);
  async function install() {
    const event = pending.current;
    if (!event || installed || lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); pending.current = null; setAvailable(false);
    try {
      // Keep this directly inside the button gesture. Never prompt on page load.
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === 'accepted' ? 'Installation requested. Follow your browser’s instructions to finish.' : 'No problem. You can install later using the steps below.');
    } catch { setMessage('Your browser could not open the install prompt. Use the steps below instead.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AppInstallContext.Provider value={{ installed, available, busy, message, install }}>{children}</AppInstallContext.Provider>;
}
export const useAppInstall = () => useContext(AppInstallContext);
