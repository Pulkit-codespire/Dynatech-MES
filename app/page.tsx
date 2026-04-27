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
        <p className="pt-4 flex gap-3 flex-wrap">
          <a
            href="/dashboard"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
          >
            Open live dashboard →
          </a>
          <a
            href="/operator-dashboard"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
          >
            Operator Dashboard →
          </a>
          <a
            href="/api-explorer"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
          >
            API Explorer →
          </a>
          <a
            href="/face-management"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
          >
            Face Management →
          </a>
        </p>
      </section>
    </main>
  );
}
