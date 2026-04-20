# OEE MES

Week 1 MES for the Dynatech × Codespire OEE project. Next.js 15 (App Router) on Vercel, Postgres on Supabase. Accepts heartbeat events from M5Stack CoreS3 devices.

## Endpoints

All routes require `Authorization: Bearer <DEVICE_API_KEY>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/events` | Insert one event. Idempotent on `event_id`. |
| GET  | `/api/events?machine_id=X&limit=100` | Recent events for a machine (newest first). |
| POST | `/api/events/batch` | Up to 500 events. Returns per-event `ok` / `duplicate`. |

### Event shape

```json
{
  "event_id": "uuid-v4",
  "machine_id": "TEST-01",
  "event_type": "heartbeat",
  "timestamp": "2026-04-21T10:00:00+05:30",
  "payload": { "wifi_rssi": -65, "uptime_sec": 320, "firmware_version": "0.1.0" }
}
```

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Then in Supabase, run [`supabase/schema.sql`](supabase/schema.sql) once in the SQL editor.

### Required env vars

- `SUPABASE_URL` — from Supabase Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — server-side key, **never** expose to the browser
- `DEVICE_API_KEY` — 32+ char random string; share with Dev F over WhatsApp

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Smoke test

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer $DEVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id":"11111111-1111-1111-1111-111111111111",
    "machine_id":"TEST-01",
    "event_type":"heartbeat",
    "timestamp":"2026-04-21T10:00:00+05:30",
    "payload":{"test":true}
  }'
```

Send it twice — second call returns 200 with no duplicate row (idempotency check).

```bash
curl "http://localhost:3000/api/events?machine_id=TEST-01&limit=10" \
  -H "Authorization: Bearer $DEVICE_API_KEY"
```

## Deploy

1. Push to `[org]/oee-mes` on GitHub.
2. Import the repo in Vercel.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEVICE_API_KEY` in Vercel → Project → Settings → Environment Variables.
4. Redeploy. Hit the production URL with the curl above.

## Logs

Every request emits a single JSON line via `console.log` — visible in `vercel logs` or the Vercel dashboard. Fields: `route`, `method`, `machine_id`, `event_id`, `count`, `status`, `latency_ms`.

## Week 1 scope (intentional non-goals)

No dashboard, no OEE math, no multiple event types beyond `heartbeat`, no admin panel. Supabase table view is the UI this week. See Document 3 §9.
