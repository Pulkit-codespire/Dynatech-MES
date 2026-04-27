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
-- Operators
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operators (
  id          TEXT PRIMARY KEY,           -- e.g. 'OP-RK-042'
  name        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,              -- bcrypt or plain for dev
  role        TEXT NOT NULL CHECK (role IN ('operator','setter','supervisor')),
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Machines
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS machines (
  machine_id          TEXT PRIMARY KEY,           -- e.g. 'JYOTI-01'
  name                TEXT NOT NULL,
  shifts              JSONB NOT NULL DEFAULT '{}',
  lunch               TEXT,
  breakdown_reasons   JSONB NOT NULL DEFAULT '["Tool broke","Material issue","Awaiting setup","Power/utility","Coolant/fluid","Other"]',
  reject_reasons      JSONB NOT NULL DEFAULT '["Dimension out","Surface finish","Dent/scratch","Plating defect","Other"]',
  lu_overtime_ms      INTEGER NOT NULL DEFAULT 60000,   -- L/U overtime threshold (ms)
  beep_repeat_ms      INTEGER NOT NULL DEFAULT 10000,   -- overtime beep repeat interval (ms)
  capture_seconds     INTEGER NOT NULL DEFAULT 5,       -- reject photo capture countdown (s)
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Parts
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS parts (
  part_number   TEXT PRIMARY KEY,          -- e.g. 'DT-4521-A'
  description   TEXT NOT NULL,
  setup         TEXT,
  target_secs   INTEGER NOT NULL,          -- target cycle time in seconds
  machine_id    TEXT REFERENCES machines(machine_id),
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parts_machine
  ON parts(machine_id) WHERE active = TRUE;

-- ═══════════════════════════════════════════════════════════════════════
-- Auth sessions (login tracking)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  TEXT NOT NULL REFERENCES operators(id),
  machine_id   TEXT NOT NULL REFERENCES machines(machine_id),
  shift        TEXT NOT NULL,
  logged_in_at TIMESTAMPTZ DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_machine
  ON auth_sessions(machine_id, logged_in_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- Operator Assignments (supervisor assigns operator → machine + part)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operator_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   TEXT NOT NULL REFERENCES operators(id),
  machine_id    TEXT NOT NULL REFERENCES machines(machine_id),
  part_number   TEXT NOT NULL REFERENCES parts(part_number),
  assigned_by   TEXT REFERENCES operators(id),
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  active        BOOLEAN DEFAULT TRUE
);

-- Only one active assignment per operator at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_assignments_active
  ON operator_assignments(operator_id) WHERE active = TRUE;

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
-- profile_id is nullable: NULL = unmapped (unrecognized) face
CREATE TABLE IF NOT EXISTS face_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID REFERENCES face_profiles(id) ON DELETE CASCADE,
  embedding       vector(512) NOT NULL,
  source_image_id UUID REFERENCES machine_images(id) ON DELETE SET NULL,
  machine_id      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_profile
  ON face_embeddings(profile_id);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_hnsw
  ON face_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_unmapped
  ON face_embeddings(created_at DESC) WHERE profile_id IS NULL;

-- Migration for existing tables (run in SQL editor):
--   ALTER TABLE face_embeddings ALTER COLUMN profile_id DROP NOT NULL;
--   ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS machine_id TEXT;

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
  query_embedding vector(512),
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
