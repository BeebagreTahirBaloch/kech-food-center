import { Link, NavLink } from "react-router-dom";
import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';
import { useAppInstall } from '../context/AppInstallContext.jsx';

export default function Header({ count, compactLogo = false }) {
  const { restaurantPhone } = useRestaurantSettings();
  const { installed } = useAppInstall();
  return (
    <>
      <nav className={`site-nav${compactLogo ? " compact-logo" : ""}`}>
        <div className="logo">
          <Link className="brand-mark" to="/" aria-label="Kech Food Center home">
            <img src="/images/kfc_turbat_logo edited.png" alt="Kech Food Center" />
          </Link>
        </div>
        <div className="nav-items">
          <a href="/#menu">MENU</a>
          <a href={`tel:${restaurantPhone}`}>CALL</a>
          <NavLink to="/orders">ORDERS</NavLink>
          {!installed && <NavLink to="/get-app">GET THE APP</NavLink>}
        </div>
        <div className="nav-icons">
          <div className="nav-icons-cart">
            <Link to="/cart" aria-label="Open cart"><i className="ri-shopping-cart-line" /></Link>
            <span className="cart-count1">{count}</span>
          </div>
          <a href={`tel:${restaurantPhone}`}><i className="ri-phone-line" /><span> Call us</span></a>
        </div>
      </nav>
      <div className="bottom-nav">
        <a href={`tel:${restaurantPhone}`} className="bottom-nav-items"><i className="ri-phone-fill" aria-hidden="true" /><span>Call</span></a>
        <a href="/#menu" className="bottom-nav-items"><i className="ri-restaurant-line" aria-hidden="true" /><span>Menu</span></a>
        <NavLink to="/orders" className="bottom-nav-items"><i className="ri-receipt-line" aria-hidden="true" /><span>Orders</span></NavLink>
        <Link to="/cart" className="bottom-nav-items">
          <span className="mobile-cart-icon"><i className="ri-shopping-cart-line" /><span className="cart-count2">{count}</span></span>
          <span>My Cart</span>
        </Link>
        {!installed && <NavLink to="/get-app" className="bottom-nav-items"><i className="ri-download-2-line" aria-hidden="true" /><span>Get app</span></NavLink>}
      </div>
    </>
  );
}
