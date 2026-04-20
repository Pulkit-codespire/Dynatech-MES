-- Run this in Supabase SQL editor after creating the `oee-dev` project.

CREATE TABLE IF NOT EXISTS events (
  event_id     UUID PRIMARY KEY,
  machine_id   TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL,
  payload      JSONB DEFAULT '{}'::jsonb,
  received_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_machine_time
  ON events(machine_id, timestamp DESC);
