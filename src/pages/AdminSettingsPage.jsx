import AdminOrderCleanup from '../components/AdminOrderCleanup.jsx';
import AdminQueueSettings from '../components/AdminQueueSettings.jsx';
import AdminRiderCapacity from '../components/AdminRiderCapacity.jsx';
import OrderingHours from '../components/OrderingHours.jsx';
import AdminDeliveryRates from '../components/AdminDeliveryRates.jsx';
import PushAlerts from '../components/PushAlerts.jsx';

export default function AdminSettingsPage() {
  return <main className="admin-page">
    <header className="admin-heading">
      <div>
        <p>Kech Food Center</p>
        <h1>Ordering and delivery settings</h1>
      </div>
    </header>
    <OrderingHours />
    <AdminDeliveryRates />
    <AdminQueueSettings />
    <AdminRiderCapacity />
    <PushAlerts owner/>
    <AdminOrderCleanup />
  </main>;
}
