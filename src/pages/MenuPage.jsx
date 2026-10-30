import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getCatalog, menuSections } from "../data/menu.js";
import Advertisement from "../components/Advertisement.jsx";
import Footer from "../components/Footer.jsx";
import Header from "../components/Header.jsx";
import ProductModal from "../components/ProductModal.jsx";
import { useCart } from "../context/CartContext.jsx";

const catalog = getCatalog();

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

function imageUrl(image = "") {
  return `/${image.replace(/^\.\//, "")}`;
}

export default function MenuPage({ area, onAreaChange }) {
  const { count, addItem } = useCart();
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAd, setShowAd] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const pageRef = useRef(null);
  const categoryBarRef = useRef(null);
  const specialRef = useRef(null);

  useEffect(() => {
    let frame;
    const updateCategory = () => {
      const offset = specialRef.current?.getBoundingClientRect().bottom || 150;
      pageRef.current?.style.setProperty("--menu-offset", `${offset + 12}px`);
      let current = "";
      for (const section of menuSections) {
        const heading = document.getElementById(section.id);
        if (heading && heading.getBoundingClientRect().top <= offset + 26) current = section.id;
      }
      setActiveCategory(current);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateCategory);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(pageRef.current);
    observer.observe(specialRef.current);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    updateCategory();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  useEffect(() => {
    const bar = categoryBarRef.current;
    const active = bar?.querySelector('[aria-current="location"]');
    if (!active) return;
    const bounds = active.getBoundingClientRect();
    const viewport = bar.getBoundingClientRect();
    if (bounds.left < viewport.left || bounds.right > viewport.right) {
      bar.scrollBy({ left: bounds.left - viewport.left - (viewport.width - bounds.width) / 2, behavior: "smooth" });
    }
  }, [activeCategory]);
  const groupedItems = useMemo(() => {
    const groups = new Map();
    for (const item of catalog) {
      if (!groups.has(item.sectionId)) groups.set(item.sectionId, []);
      groups.get(item.sectionId).push(item);
    }
    return groups;
  }, []);

  useEffect(() => {
    let timer;
    try {
      if (!sessionStorage.getItem("kech-ad-seen")) {
        timer = window.setTimeout(() => setShowAd(true), 900);
      }
    } catch { /* Storage may be disabled by the browser. */ }
    return () => window.clearTimeout(timer);
  }, []);

  function closeAd() {
    setShowAd(false);
    try { sessionStorage.setItem("kech-ad-seen", "true"); } catch { /* Ignore storage restrictions. */ }
  }

  return (
    <div className="menu-page" ref={pageRef}>
      <Header count={count} area={area} onAreaChange={onAreaChange} />
      <div className="nav2" ref={categoryBarRef} role="navigation" aria-label="Menu categories">
        {menuSections.map((section) => (
          <div className={`items${activeCategory === section.id ? " active" : ""}`} key={section.id}><a href={`#${section.id}`} aria-current={activeCategory === section.id ? "location" : undefined}>{section.title.startsWith("PIZZA") ? "Pizzas" : section.title.replace(" PREMIUM", "").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace("Bbq", "BBQ")}</a></div>
        ))}
      </div>
      <div className="nav3" ref={specialRef}><h3>Today's Special: Family Bucket for only RS.1599!</h3></div>
      <main>
        <div className="hero-wrap">
          <img className="hero-img" src="/images/kfc hero section image.png" alt="Kech Food Center meals" />
        </div>
        <section id="menu" className="menu-container" aria-label="Our menu">
          {menuSections.map((section) => (
            <section className="menu-category" key={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <div className="pizza-section">
                {(groupedItems.get(section.id) || []).map((item) => {
                  const fromPrice = item.options?.[0]?.price ?? item.price;
                  return (
                    <button className="pizza-section-boxes" type="button" key={item.id} onClick={() => setSelectedItem(item)}>
                      <img src={imageUrl(item.image)} alt={item.name} loading="lazy" />
                      <span className="manu-card-cointainer">
                        <span className="product-name">{item.name}<i className="ri-add-circle-line" aria-hidden="true" /></span>
                        <span className="product-description">{item.desc}</span>
                        <span className="product-price">From <strong>{formatPrice(fromPrice)}</strong></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      </main>
      <Footer />
      <div className="floating-cart"><Link to="/cart"><i className="ri-shopping-cart-line" /> Cart <span>{count}</span></Link></div>
      {selectedItem && <ProductModal key={selectedItem.id} item={selectedItem} onClose={() => setSelectedItem(null)} onAdd={(item, option, quantity) => { addItem(item, option, quantity); setSelectedItem(null); }} />}
      {showAd && <Advertisement onClose={closeAd} />}
    </div>
  );
}
