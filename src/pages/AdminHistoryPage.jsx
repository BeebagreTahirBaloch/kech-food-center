import {useCallback, useEffect, useState, useRef} from 'react';
import {adminSupabase as client} from '../lib/supabase.js';
import {activityActor, activityChanges, activityHeading, activityTime} from '../lib/adminActivity.js';

const money = n => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
const pageSize = 25;

function ActivityEntry({event}) {
  const heading = activityHeading(event), changes = activityChanges(event);
  return <details className="activity-entry">
    <summary>
      <span className="activity-summary">
        <span className="activity-title"><strong>{heading.entity}</strong><span className="activity-action">{heading.action}</span></span>
        {heading.subject && <span className="activity-subject">{heading.subject}</span>}
        <span className="activity-actor">{activityActor(event)}</span>
        <span className="activity-meta"><time dateTime={event.created_at}>{activityTime(event.created_at)}</time><span>{changes.length} {changes.length === 1 ? 'change' : 'changes'}</span></span>
      </span>
      <span className="activity-chevron" aria-hidden="true">⌄</span>
    </summary>
    {changes.length ? <dl className="activity-changes">{changes.map(change => <div className="activity-change" key={change.key}>
      <dt>{change.label}</dt>
      <dd className="activity-before"><span className="activity-value-label">Before</span>{change.before.map((line, i) => <span className="activity-value" key={i}>{line}</span>)}</dd>
      <dd className="activity-after"><span className="activity-value-label">After</span>{change.after.map((line, i) => <span className="activity-value" key={i}>{line}</span>)}</dd>
    </div>)}</dl> : <p className="activity-no-changes">No field changes to display.</p>}
  </details>;
}

export default function AdminHistoryPage() {
  const [months, setMonths] = useState([]), [activity, setActivity] = useState([]);
  const [page, setPage] = useState(0), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setReady(false); setError('');
    try {
      const [totals, events] = await Promise.all([
        client.rpc('admin_monthly_sales'),
        client.rpc('admin_activity_feed', {p_offset: page * pageSize, p_limit: pageSize}),
      ]);
      if (current !== generation.current) return;
      if (totals.error || events.error) {
        setError('Unable to load history. Apply the owner activity migration and check your connection.');
        return;
      }
      setMonths(totals.data || []); setActivity(events.data || []); setReady(true);
    } catch {
      if (current === generation.current) setError('Unable to load history. Check your connection and retry.');
    }
  }, [page]);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);
  return <main className="admin-page">
    <h1>History and activity</h1><button onClick={load}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    {!ready ? !error && <p role="status">Loading history…</p> : <>
      <section><h2>Monthly totals</h2><p>Live orders plus permanent totals from completed orders deleted after this update. Months use the order placement date in Asia/Karachi. Previously deleted orders cannot be reconstructed.</p>
        <div className="admin-table-wrap"><table><thead><tr>{['Month', 'Orders', 'Delivered', 'Cancelled', 'Food sales', 'Delivery charges', 'Total sales'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{months.map(m => <tr key={m.month}><td>{m.month.slice(0, 7)}</td><td>{m.orders}</td><td>{m.delivered}</td><td>{m.cancelled}</td><td>{money(m.food_sales)}</td><td>{money(m.delivery_charges)}</td><td>{money(m.total_sales)}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-labelledby="owner-activity-heading"><h2 id="owner-activity-heading">Owner activity</h2>
        <p>See who changed menu prices, availability, delivery rates, hours, settings and rider accounts. Open an entry to compare the changes. All times are Turbat time.</p>
        <div className="activity-list">{activity.map(event => <ActivityEntry key={event.id} event={event}/>)}</div>
        {!activity.length && <p>No activity on this page.</p>}
        <div className="activity-pagination"><button disabled={!page} onClick={() => setPage(n => n - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={activity.length < pageSize} onClick={() => setPage(n => n + 1)}>Next</button></div>
      </section>
      <section><h2>Database and menu-image backups</h2><p>Use the local backup command documented in docs/BACKUP_AND_RESTORE.md. Keep backups in private storage and test restores in a separate project. Database dumps and menu images are both required. The owner page never receives server credentials.</p></section>
    </>}
  </main>;
}
