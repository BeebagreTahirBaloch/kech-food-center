import { Link, NavLink } from "react-router-dom";

export default function Header({ count, compactLogo = false }) {
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
          <a href="tel:03352053652">CALL</a>
          <NavLink to="/orders">ORDERS</NavLink>
        </div>
        <div className="nav-icons">
          <div className="nav-icons-cart">
            <Link to="/cart" aria-label="Open cart"><i className="ri-shopping-cart-line" /></Link>
            <span className="cart-count1">{count}</span>
          </div>
          <a href="tel:03352053652"><i className="ri-phone-line" /><span> Call us</span></a>
        </div>
      </nav>
      <div className="bottom-nav">
        <a href="tel:03352053652" className="bottom-nav-items"><i className="fa-solid fa-phone" /><span>Call</span></a>
        <a href="/#menu" className="bottom-nav-items"><i className="fa-solid fa-utensils" /><span>Menu</span></a>
        <NavLink to="/orders" className="bottom-nav-items"><i className="fa-solid fa-receipt" /><span>Orders</span></NavLink>
        <Link to="/cart" className="bottom-nav-items">
          <span className="mobile-cart-icon"><i className="ri-shopping-cart-line" /><span className="cart-count2">{count}</span></span>
          <span>My Cart</span>
        </Link>
      </div>
    </>
  );
}
