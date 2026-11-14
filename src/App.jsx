import RiderPage from './pages/RiderPage.jsx';
import AdminRidersPage from './pages/AdminRidersPage.jsx';
import AdminSettingsPage from './pages/AdminSettingsPage.jsx';
import AdminHistoryPage from './pages/AdminHistoryPage.jsx';
import './operations.css';
import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import CartPage from "./pages/CartPage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import TrackPage from "./pages/TrackPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AdminOrdersPage from "./pages/AdminOrdersPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import InstallAppPage from './pages/InstallAppPage.jsx';
import { AppInstallProvider } from './context/AppInstallContext.jsx';

function readDeliveryArea() {
  try { return localStorage.getItem("deliveryArea") || ""; } catch { return ""; }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppManifest() {
  const { pathname } = useLocation();
  useEffect(() => {
    const role = /^\/rider(?:\/|$)/.test(pathname) ? 'rider'
      : /^\/admin(?:\/|$)/.test(pathname) ? 'owner' : 'customer';
    document.getElementById('app-manifest')?.setAttribute('href', `/${role}.webmanifest`);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="not-found-page">
      <p className="eyebrow">KECH FOOD CENTER · TURBAT</p>
      <h1>We couldn't find that page.</h1>
      <Link to="/">Return to the menu</Link>
    </main>
  );
}

export default function App() {
  const [area, setArea] = useState(readDeliveryArea);

  useEffect(() => {
    try {
      if (area) localStorage.setItem("deliveryArea", area);
      else localStorage.removeItem("deliveryArea");
    } catch { /* Storage is optional. */ }
  }, [area]);

  return (
    <AppInstallProvider>
      <ScrollToTop />
      <AppManifest />
      <Routes>
        <Route path="/get-app" element={<InstallAppPage />} />
        <Route path="/rider/*" element={<RiderPage />} />
        <Route path="/admin/riders" element={<AdminPage><AdminRidersPage /></AdminPage>} />
        <Route path="/admin/history" element={<AdminPage><AdminHistoryPage /></AdminPage>} />
        <Route path="/admin/settings" element={<AdminPage><AdminSettingsPage /></AdminPage>} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/orders" element={<AdminPage><AdminOrdersPage /></AdminPage>} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/" element={<MenuPage area={area} onAreaChange={setArea} />} />
        <Route path="/cart" element={<CartPage area={area} onAreaChange={setArea} />} />
        <Route path="/track/:id" element={<TrackPage area={area} onAreaChange={setArea} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppInstallProvider>
  );
}
