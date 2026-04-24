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

-- ═══════════════════════════════════════════════════════════════════════
-- Face Recognition (requires pgvector extension)
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- Face profiles: one row per named person
CREATE TABLE IF NOT EXISTS face_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  label        TEXT NOT NULL UNIQUE,
  employee_id  TEXT UNIQUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Face embeddings: multiple training samples per profile
CREATE TABLE IF NOT EXISTS face_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES face_profiles(id) ON DELETE CASCADE,
  embedding       vector(128) NOT NULL,
  source_image_id UUID REFERENCES machine_images(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_profile
  ON face_embeddings(profile_id);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_hnsw
  ON face_embeddings USING hnsw (embedding vector_cosine_ops);

-- Recognition log: every recognition attempt
CREATE TABLE IF NOT EXISTS face_recognition_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id           UUID REFERENCES machine_images(id) ON DELETE SET NULL,
  matched_profile_id UUID REFERENCES face_profiles(id) ON DELETE SET NULL,
  confidence         REAL,
  threshold_used     REAL NOT NULL DEFAULT 0.6,
  recognized         BOOLEAN NOT NULL,
  recognized_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recognition_log_time
  ON face_recognition_log(recognized_at DESC);

-- SQL function: find best-matching embedding via cosine similarity
-- DROP first if return type changed (Postgres requires this)
DROP FUNCTION IF EXISTS match_face(vector, real, integer);

CREATE OR REPLACE FUNCTION match_face(
  query_embedding vector(128),
  match_threshold REAL DEFAULT 0.6,
  match_count     INT  DEFAULT 1
)
RETURNS TABLE (
  profile_id  UUID,
  label       TEXT,
  name        TEXT,
  employee_id TEXT,
  similarity  REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fp.id AS profile_id,
    fp.label,
    fp.name,
    fp.employee_id,
    (1 - (fe.embedding <=> query_embedding))::REAL AS similarity
  FROM face_embeddings fe
  JOIN face_profiles fp ON fp.id = fe.profile_id
  WHERE (1 - (fe.embedding <=> query_embedding)) >= match_threshold
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
