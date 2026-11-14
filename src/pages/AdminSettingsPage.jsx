import AdminOrderCleanup from '../components/AdminOrderCleanup.jsx';
import AdminQueueSettings from '../components/AdminQueueSettings.jsx';
import AdminRiderCapacity from '../components/AdminRiderCapacity.jsx';
import OrderingHours from '../components/OrderingHours.jsx';
import AdminDeliveryRates from '../components/AdminDeliveryRates.jsx';
import PushAlerts from '../components/PushAlerts.jsx';
import AdminRestaurantSettings from '../components/AdminRestaurantSettings.jsx';
import AdminDeliveryArea from '../components/AdminDeliveryArea.jsx';
import AdminWebsiteImages from '../components/AdminWebsiteImages.jsx';

export default function AdminSettingsPage() {
  return <main className="admin-page">
    <header className="admin-heading">
      <div>
        <p>Kech Food Center</p>
        <h1>Ordering and delivery settings</h1>
      </div>
    </header>
    <AdminRestaurantSettings />
    <AdminWebsiteImages />
    <OrderingHours />
    <AdminDeliveryArea />
    <AdminDeliveryRates />
    <AdminQueueSettings />
    <AdminRiderCapacity />
    <PushAlerts owner/>
    <AdminOrderCleanup />
  </main>;
}
