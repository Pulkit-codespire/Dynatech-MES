export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10 font-sans">
      <h1 className="text-3xl font-bold tracking-tight">OEE MES</h1>
      <p className="mt-2 text-neutral-600">
        Device ingest endpoint. Supabase-backed. Dynatech × Codespire, Week 1.
      </p>
      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-base font-semibold">Endpoints</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <code>POST /api/events</code> &mdash; single event (idempotent on <code>event_id</code>)
          </li>
          <li>
            <code>GET /api/events?machine_id=X&amp;limit=100</code> &mdash; recent events
          </li>
          <li>
            <code>POST /api/events/batch</code> &mdash; up to 500 events
          </li>
        </ul>
        <p className="text-neutral-500">All routes require <code>Authorization: Bearer &lt;DEVICE_API_KEY&gt;</code>.</p>
      </section>
    </main>
  );
}
