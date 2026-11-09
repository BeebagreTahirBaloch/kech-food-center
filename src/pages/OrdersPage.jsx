import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import MyOrders from '../components/MyOrders.jsx';
import { useCart } from '../context/CartContext.jsx';

export default function OrdersPage() {
  const { count } = useCart();
  return <>
    <Header count={count} compactLogo />
    <main className="orders-page">
      <h1>Your orders</h1>
      <p>View your latest 20 orders placed on this browser and track their delivery.</p>
      <MyOrders />
    </main>
    <Footer />
  </>;
}
