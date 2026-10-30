import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import CartPage from "./pages/CartPage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import TrackPage from "./pages/TrackPage.jsx";

function readDeliveryArea() {
  try { return localStorage.getItem("deliveryArea") || ""; } catch { return ""; }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
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
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<MenuPage area={area} onAreaChange={setArea} />} />
        <Route path="/cart" element={<CartPage area={area} onAreaChange={setArea} />} />
        <Route path="/track/:id" element={<TrackPage area={area} onAreaChange={setArea} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
