import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import MyOrders from '../components/MyOrders.jsx';
import { useCart } from '../context/CartContext.jsx';
import '../orders.css';

export default function OrdersPage() {
  const { count } = useCart();
  return <>
    <Header count={count} compactLogo />
    <main className="orders-page">
      <header className="orders-heading">
        <div>
          <p className="orders-eyebrow">KECH FOOD CENTER · TURBAT</p>
          <h1>Your orders</h1>
          <p>Track your delivery or enjoy your favourites again.</p>
        </div>
        <Link className="orders-button orders-button-secondary" to="/">Browse menu <span aria-hidden="true">→</span></Link>
      </header>
      <MyOrders />
    </main>
    <Footer />
  </>;
}
