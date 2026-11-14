import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMenu } from "../context/MenuContext.jsx";
import Advertisement from "../components/Advertisement.jsx";
import Footer from "../components/Footer.jsx";
import Header from "../components/Header.jsx";
import MenuLoadingScreen from "../components/MenuLoadingScreen.jsx";
import ProductModal from "../components/ProductModal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useWebsiteImages } from '../lib/useWebsiteImages.js';
import { fallbackWebsiteImage } from '../lib/websiteImages.js';


function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

function imageUrl(image = "") {
  return image;
}

export default function MenuPage({ area, onAreaChange }) {
  const { count, addItem } = useCart();
  const { images, ready: imagesReady } = useWebsiteImages();
  const { catalog, menuSections, loading, error, ready, refresh } = useMenu();
  const [search,setSearch]=useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAd, setShowAd] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const pageRef = useRef(null);
  const categoryBarRef = useRef(null);
  const specialRef = useRef(null);

  useEffect(() => {
    if (!pageRef.current || !specialRef.current) return;
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
  }, [menuSections, ready]);

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
      if(!`${item.name} ${item.desc || ''}`.toLowerCase().includes(search.trim().toLowerCase()))continue;
      if (!groups.has(item.sectionId)) groups.set(item.sectionId, []);
      groups.get(item.sectionId).push(item);
    }
    return groups;
  }, [catalog,search]);

  useEffect(() => {
    if (!ready || !imagesReady) return;
    let timer;
    try {
      if (!sessionStorage.getItem("kech-ad-seen")) {
        timer = window.setTimeout(() => setShowAd(true), 900);
      }
    } catch { /* Storage may be disabled by the browser. */ }
    return () => window.clearTimeout(timer);
  }, [ready, imagesReady]);

  function closeAd() {
    setShowAd(false);
    try { sessionStorage.setItem("kech-ad-seen", "true"); } catch { /* Ignore storage restrictions. */ }
  }

  return (
    <>
    <div className={`menu-page${!ready ? ' is-menu-loading' : ''}`} ref={pageRef} inert={!ready} aria-hidden={!ready ? true : undefined}>
      <Header count={count} compactLogo />
      <div className="nav2" ref={categoryBarRef} role="navigation" aria-label="Menu categories">
        {!ready && Array.from({ length: 4 }, (_, i) => <span className="menu-category-placeholder" key={i} />)}
        {menuSections.map((section) => (
          <div className={`items${activeCategory === section.id ? " active" : ""}`} key={section.id}><a href={`#${section.id}`} aria-current={activeCategory === section.id ? "location" : undefined}>{section.title.startsWith("PIZZA") ? "Pizzas" : section.title.replace(" PREMIUM", "").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace("Bbq", "BBQ")}</a></div>
        ))}
      </div>
      <div className="nav3" ref={specialRef}><h3>Today's Special: Family Bucket for only RS.1599!</h3></div>
      <main>
        <div className="hero-wrap">
          <img className="hero-img" src={images.hero} alt="Kech Food Center meals" onError={e => fallbackWebsiteImage(e, 'hero')} />
        </div>
        <div className="menu-search"><label htmlFor="menu-search">Find your food</label><input id="menu-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search pizza, burger, drinks…"/>{search&&<button onClick={()=>setSearch('')}>Clear search</button>}{search&&!groupedItems.size&&<p role="status">No food matches your search.</p>}</div>
        <section id="menu" className="menu-container" aria-label="Our menu">
          {!ready && <div aria-hidden="true">
            <div className="menu-preview-heading" />
            <div className="pizza-section">
              {Array.from({ length: 6 }, (_, i) => <div className="menu-preview-card" key={i}>
                <div className="menu-preview-photo" /><div className="menu-preview-line" /><div className="menu-preview-line" />
              </div>)}
            </div>
          </div>}
          {ready && error && <div className="menu-refresh-notice" role="status"><p>Couldn’t refresh the menu. Please try again for the latest prices and availability.</p><button type="button" onClick={refresh}>Retry</button></div>}
          {ready && !catalog.length && <p>The menu will be available soon.</p>}
          {menuSections.filter(section=>!search.trim() || groupedItems.has(section.id)).map((section) => (
            <section className="menu-category" key={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <div className="pizza-section">
                {(groupedItems.get(section.id) || []).map((item) => {
                  const fromPrice = item.options?.[0]?.price ?? item.price;
                  return (
                    <button className="pizza-section-boxes" type="button" key={item.id} disabled={!item.is_available} onClick={() => setSelectedItem(item)}>
                      <img src={imageUrl(item.image)} alt={item.name} loading="lazy" />
                      <span className="manu-card-cointainer">
                        <span className="product-name">{item.name}<i className="ri-add-circle-line" aria-hidden="true" /></span>
                        <span className="product-description">{item.desc}</span>
                        <span className="product-price">{item.is_available ? <>From <strong>{formatPrice(fromPrice)}</strong></> : <strong>Sold out</strong>}</span>
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
      {showAd && <Advertisement image={images.popup} onClose={closeAd} />}
    </div>
    {!ready && <MenuLoadingScreen loading={loading} onRetry={refresh} />}
    </>
  );
}
