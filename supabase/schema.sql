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

-- Machine images: metadata table. Binary goes to the `machine-images`
-- Storage bucket; this row stores the path + derived public URL.
CREATE TABLE IF NOT EXISTS machine_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  public_url    TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  caption       TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_images_time
  ON machine_images(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_machine_images_machine
  ON machine_images(machine_id, uploaded_at DESC);

-- Create the Storage bucket manually in Supabase Dashboard → Storage:
--   Name: machine-images
--   Public: yes (so <img src> works without signed URLs)
